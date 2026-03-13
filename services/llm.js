/**
 * LLM 调用层：默认 DeepSeek-V3.2，失败时回退 Gemini 3.1 Pro
 * 密钥从 config/llm-keys.js 读取（该文件不提交，新环境请复制 config/llm-keys.example.js 为 llm-keys.js 并填写）
 * system_instruction 来自 config/roundtable-system-instruction.js（与 examples/system_instruction.md 一致）
 * temperature 固定为 0.6，偏严谨。
 *
 * 微信小程序需在 微信公众平台 → 开发 → 开发管理 → 开发设置 → 服务器域名 中
 * 将 request 合法域名加入：https://generativelanguage.googleapis.com 与 https://api.deepseek.com
 */

let keys
try {
  keys = require('../config/llm-keys.js')
} catch (e) {
  keys = require('../config/llm-keys.example.js')
}

const systemInstruction = require('../config/roundtable-system-instruction.js')

const GEMINI_MODEL = 'gemini-3.1-pro-preview'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions'
const DEEPSEEK_MODEL = 'deepseek-chat'
const TEMPERATURE = 0.6

/**
 * 调用 Gemini API（Gemini 3.1 Pro）
 * @param {Array<{ role: 'user'|'assistant', content: string }>} messages
 * @returns {Promise<string>} 助手回复的完整文本
 */
function callGemini(messages) {
  return new Promise((resolve, reject) => {
    const apiKey = keys && keys.geminiApiKey
    if (!apiKey) {
      reject(new Error('未配置 Gemini API Key，请填写 config/llm-keys.js'))
      return
    }
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))
    const body = {
      contents,
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: { temperature: TEMPERATURE }
    }
    wx.request({
      url: `${GEMINI_URL}?key=${apiKey}`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: body,
      success(res) {
        if (res.statusCode !== 200) {
          reject(new Error(res.data?.error?.message || `Gemini HTTP ${res.statusCode}`))
          return
        }
        const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text
        if (text != null) resolve(text)
        else reject(new Error('Gemini 返回格式异常'))
      },
      fail(err) {
        reject(err)
      }
    })
  })
}

/**
 * 调用 DeepSeek API（DeepSeek-V3.2，OpenAI 兼容）
 * @param {Array<{ role: 'user'|'assistant', content: string }>} messages
 * @returns {Promise<string>} 助手回复的完整文本
 */
function callDeepSeek(messages) {
  return new Promise((resolve, reject) => {
    const apiKey = keys && keys.deepseekApiKey
    if (!apiKey) {
      reject(new Error('未配置 DeepSeek API Key，请填写 config/llm-keys.js'))
      return
    }
    const withSystem = [
      { role: 'system', content: systemInstruction },
      ...messages.map(m => ({ role: m.role, content: m.content }))
    ]
    wx.request({
      url: DEEPSEEK_URL,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      data: {
        model: DEEPSEEK_MODEL,
        messages: withSystem,
        temperature: TEMPERATURE
      },
      success(res) {
        if (res.statusCode !== 200) {
          reject(new Error(res.data?.error?.message || `DeepSeek HTTP ${res.statusCode}`))
          return
        }
        const text = res.data?.choices?.[0]?.message?.content
        if (text != null) resolve(text)
        else reject(new Error('DeepSeek 返回格式异常'))
      },
      fail(err) {
        reject(err)
      }
    })
  })
}

/**
 * DeepSeek 流式调用：请求时传 stream: true，通过 onChunk 回调逐步推送已接收文本与字数
 * 需配合 wx.request 的 enableChunked + RequestTask.onChunkReceived 使用（小程序端）
 * @param {Array<{ role: 'user'|'assistant', content: string }>} messages
 * @param {function(fullText: string, receivedLength: number)} onChunk 每收到一段内容时调用
 * @returns {Promise<string>} 完整回复文本
 */
function callDeepSeekStream(messages, onChunk) {
  return new Promise((resolve, reject) => {
    const apiKey = keys && keys.deepseekApiKey
    if (!apiKey) {
      reject(new Error('未配置 DeepSeek API Key，请填写 config/llm-keys.js'))
      return
    }
    const withSystem = [
      { role: 'system', content: systemInstruction },
      ...messages.map(m => ({ role: m.role, content: m.content }))
    ]
    let fullText = ''
    let buffer = ''
    const estimatedTotal = 1200

    /** 将 ArrayBuffer 按 UTF-8 解码为字符串；小程序真机可能无 TextDecoder，需手写解码避免中文乱码 */
    function decodeChunk(ab) {
      if (typeof TextDecoder !== 'undefined') {
        try {
          return new TextDecoder('utf-8').decode(ab)
        } catch (_) {}
      }
      const arr = new Uint8Array(ab)
      const len = arr.length
      let s = ''
      let i = 0
      while (i < len) {
        const b = arr[i]
        if (b < 0x80) {
          s += String.fromCharCode(b)
          i += 1
        } else if (b >= 0xc0 && b < 0xe0 && i + 1 < len) {
          s += String.fromCharCode(((b & 0x1f) << 6) | (arr[i + 1] & 0x3f))
          i += 2
        } else if (b >= 0xe0 && b < 0xf0 && i + 2 < len) {
          s += String.fromCharCode(((b & 0x0f) << 12) | ((arr[i + 1] & 0x3f) << 6) | (arr[i + 2] & 0x3f))
          i += 3
        } else if (b >= 0xf0 && i + 3 < len) {
          s += String.fromCharCode(((b & 0x07) << 18) | ((arr[i + 1] & 0x3f) << 12) | ((arr[i + 2] & 0x3f) << 6) | (arr[i + 3] & 0x3f))
          i += 4
        } else {
          s += String.fromCharCode(b)
          i += 1
        }
      }
      return s
    }

    function processChunk(str) {
      buffer += str
      const lines = buffer.split(/\n/)
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') continue
          try {
            const obj = JSON.parse(payload)
            const content = obj.choices && obj.choices[0] && obj.choices[0].delta && obj.choices[0].delta.content
            if (typeof content === 'string') {
              fullText += content
              if (onChunk) onChunk(fullText, fullText.length)
            }
          } catch (_) {}
        }
      }
    }

    const requestTask = wx.request({
      url: DEEPSEEK_URL,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      data: {
        model: DEEPSEEK_MODEL,
        messages: withSystem,
        temperature: TEMPERATURE,
        stream: true
      },
      enableChunked: true,
      responseType: 'arraybuffer',
      success(res) {
        if (res.statusCode !== 200) {
          const msg = (res.data && res.data.error && res.data.error.message) || `DeepSeek HTTP ${res.statusCode}`
          reject(new Error(msg))
          return
        }
        resolve(fullText)
      },
      fail(err) {
        reject(err)
      }
    })

    requestTask.onChunkReceived((res) => {
      if (res && res.data) processChunk(decodeChunk(res.data))
    })
  })
}

/**
 * 统一入口：先调 DeepSeek，失败则回退 Gemini
 * @param {Array<{ role: 'user'|'assistant', content: string }>} messages 对话消息列表
 * @returns {Promise<{ text: string, provider: 'gemini'|'deepseek' }>} 回复文本与使用的引擎
 */
function callLLM(messages) {
  return callDeepSeek(messages)
    .then(text => ({ text, provider: 'deepseek' }))
    .catch(() => callGemini(messages).then(text => ({ text, provider: 'gemini' })))
}

module.exports = {
  callLLM,
  callGemini,
  callDeepSeek,
  callDeepSeekStream
}
