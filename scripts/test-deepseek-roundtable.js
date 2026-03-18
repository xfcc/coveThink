const https = require('https')

const { deepseekApiKey } = require('../config/llm-keys.js')
const systemInstruction = require('../config/roundtable-system-instruction.js')
const {
  parseIntroduction,
  parseChat,
  parseSummary
} = require('../utils/parse-roundtable.js')

const DEEPSEEK_URL = 'api.deepseek.com'
const DEEPSEEK_PATH = '/v1/chat/completions'
const DEEPSEEK_MODEL = 'deepseek-chat'
const TEMPERATURE = 0.6

function callDeepSeek(messages) {
  return new Promise((resolve, reject) => {
    if (!deepseekApiKey) {
      reject(new Error('未配置 DeepSeek API Key'))
      return
    }
    const body = JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: systemInstruction },
        ...messages
      ],
      temperature: TEMPERATURE
    })

    const req = https.request(
      {
        hostname: DEEPSEEK_URL,
        path: DEEPSEEK_PATH,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Bearer ${deepseekApiKey}`
        }
      },
      res => {
        let data = ''
        res.on('data', chunk => (data += chunk))
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(
              new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`)
            )
          }
          try {
            const parsed = JSON.parse(data)
            const text = parsed.choices?.[0]?.message?.content || ''
            resolve(text)
          } catch (e) {
            reject(e)
          }
        })
      }
    )

    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

const TOPIC = 'AI 时代学习理论的首选：建构主义是否当之无愧'

function buildInvitationPrompt(topic) {
  return `你将收到一个议题，请为“圆桌讨论”的第一阶段生成邀请嘉宾信息。\n\n要求：只输出一个 JSON 对象（严格 JSON），不允许任何前后缀文本、解释、Markdown、代码块围栏（\`\`\`）。\n\n输入：\n- topic: ${topic}\n\n输出 JSON schema（字段必须齐全、类型正确，不得为 null）：\n{\n  \"type\": \"invitation\",\n  \"version\": 1,\n  \"topic\": string,\n  \"moderatorParagraphs\": string[],\n  \"guests\": Array<{ \"name\": string, \"role\": string, \"mbti\": string, \"stance\": string }>,\n  \"actionLabel\": string\n}\n\n约束：\n- guests 必须恰好 3 位。\n- moderatorParagraphs 至少 2 段。\n- actionLabel 固定为“进入第一轮圆桌讨论”。`
}

function buildRoundPrompt(command, topic, roundIndex) {
  const roundLabel = roundIndex ? `第 ${roundIndex} 轮` : '首轮'
  return `你将收到一条指令与上下文，请为“圆桌讨论”的单轮输出结构化结果。\n\n要求：只输出一个 JSON 对象（严格 JSON），不允许任何前后缀文本、解释、Markdown、代码块围栏（\`\`\`）。\n\n输入：\n- command: ${command}\n- roundLabel: ${roundLabel}\n- topic: ${topic}\n\n输出 JSON schema（字段必须齐全、类型正确，不得为 null）：\n{\n  \"type\": \"chat\",\n  \"version\": 1,\n  \"roundNum\": number,\n  \"roundTitle\": string,\n  \"moderatorAsk\": string,\n  \"speeches\": Array<{ \"speaker\": string, \"action\": string, \"content\": string, \"tldr\": string }>,\n  \"synthesis\": { \"coreConflict\": string, \"framework\": string, \"deepQuestion\": string },\n  \"actions\": Array<{ \"id\": \"continue\"|\"deep_dive\"|\"stop\", \"label\": \"可\"|\"深\"|\"止\" }>\n}\n\n约束：\n- speeches 至少 3 条发言。\n- framework 必须是 ASCII 图，用 \\n 表示换行。\n- actions 固定为 continue/deep_dive/stop 三个选项。`
}

function buildSummaryPrompt(command, topic) {
  return `你将收到“止”指令与上下文，请输出圆桌讨论的结构化收束总结。\n\n要求：只输出一个 JSON 对象（严格 JSON），不允许任何前后缀文本、解释、Markdown、代码块围栏（\`\`\`）。\n\n输入：\n- command: ${command}\n- topic: ${topic}\n\n输出 JSON schema（字段必须齐全、类型正确，不得为 null）：\n{\n  \"type\": \"summary\",\n  \"version\": 1,\n  \"moderatorClosing\": string,\n  \"knowledgeNetwork\": {\n    \"leap\": [ { \"title\": string, \"desc\": string }, { \"title\": string, \"desc\": string } ],\n    \"pillars\": Array<{ \"label\": string, \"desc\": string }>,\n    \"risks\": Array<{ \"title\": string, \"desc\": string }>\n  },\n  \"ultimateConclusion\": string,\n  \"actions\": Array<{ \"id\": \"restart\", \"label\": \"重新推演\" }>\n}\n\n约束：\n- leap 必须恰好 2 项。\n- pillars 至少 3 项。\n- risks 至少 2 项。\n- actions 固定为 restart 一项。`
}

async function run() {
  const steps = []

  steps.push({
    name: 'invitation',
    desc: '邀请嘉宾',
    message: { role: 'user', content: buildInvitationPrompt(TOPIC) }
  })

  steps.push({
    name: 'round1',
    desc: '第一轮 - 可',
    message: { role: 'user', content: buildRoundPrompt('可', TOPIC, 1) }
  })

  steps.push({
    name: 'round2',
    desc: '第二轮 - 深',
    message: { role: 'user', content: buildRoundPrompt('深', TOPIC, 2) }
  })

  steps.push({
    name: 'summary',
    desc: '话题总结 - 止',
    message: { role: 'user', content: buildSummaryPrompt('止', TOPIC) }
  })

  for (const step of steps) {
    const start = Date.now()
    process.stdout.write(`\n=== ${step.desc} (${step.name}) ===\n`)
    try {
      const text = await callDeepSeek([step.message])
      const dur = Date.now() - start
      console.log(`耗时: ${dur} ms`)

      // 解析校验
      let parsedOk = false
      try {
        if (step.name === 'invitation') {
          const parsed = parseIntroduction(text)
          parsedOk = !!(parsed && parsed.topic && parsed.guests && parsed.guests.length === 3 && parsed.moderatorParagraphs && parsed.moderatorParagraphs.length >= 2)
        } else if (step.name === 'round1' || step.name === 'round2') {
          const parsed = parseChat(text)
          parsedOk = !!(parsed && parsed.roundTitle && parsed.moderatorAsk && parsed.speeches && parsed.speeches.length >= 3 && parsed.synthesis && parsed.synthesis.framework)
        } else if (step.name === 'summary') {
          const parsed = parseSummary(text)
          parsedOk = !!(
            parsed &&
            parsed.moderatorClosing &&
            parsed.knowledgeNetwork &&
            parsed.knowledgeNetwork.leap &&
            parsed.knowledgeNetwork.leap.length === 2 &&
            parsed.knowledgeNetwork.pillars &&
            parsed.knowledgeNetwork.pillars.length >= 3 &&
            parsed.knowledgeNetwork.risks &&
            parsed.knowledgeNetwork.risks.length >= 2 &&
            parsed.ultimateConclusion
          )
        }
      } catch (e) {
        console.log('解析出错:', e.message)
        parsedOk = false
      }

      console.log('解析是否成功:', parsedOk)
      console.log('返回片段:\n', text.slice(0, 600), '\n---\n')
    } catch (e) {
      const dur = Date.now() - start
      console.log(`失败, 耗时: ${dur} ms, error:`, e.message)
      break
    }
  }
}

run().catch(err => {
  console.error('测试过程出错:', err)
})
