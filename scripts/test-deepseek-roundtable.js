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
  return `议题：${topic}\n请严格按照 [TYPE] 邀请嘉宾 的 Markdown 结构，输出完整内容（包含 [TOPIC]、[MODERATOR]、[GUEST_ROSTER] 与每位 [GUEST] 的 name/role/mbti/stance、[ACTION]）。`
}

function buildRoundPrompt(command, topic, roundIndex) {
  const roundLabel = roundIndex ? `第 ${roundIndex} 轮` : '首轮'
  return `指令：${command}\n轮次：${roundLabel}\n议题：${topic}\n请严格按照 [TYPE] 圆桌讨论 的 Markdown 结构，输出一轮完整的圆桌内容（包括 [ROUND_NUM]、[ROUND]、[MODERATOR_ASK]、若干 [SPEECH] 与 [SYNTHESIS]、[ACTIONS]），在内容上延续前文讨论的脉络。`
}

function buildSummaryPrompt(command, topic) {
  return `指令：${command}\n议题：${topic}\n请严格按照 [TYPE] 话题总结 的 Markdown 结构输出总结内容（包含 [CONCLUSION]、[MODERATOR_CLOSING]、[KNOWLEDGE_NETWORK]、[ULTIMATE_CONCLUSION] 与 [ACTIONS]），对此前圆桌讨论进行结构化收束。`
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
          parsedOk = !!(parsed && parsed.topic && parsed.guests && parsed.guests.length)
        } else if (step.name === 'round1' || step.name === 'round2') {
          const parsed = parseChat(text)
          parsedOk = !!(parsed && parsed.roundTitle && parsed.speeches && parsed.speeches.length)
        } else if (step.name === 'summary') {
          const parsed = parseSummary(text)
          parsedOk = !!(
            parsed &&
            parsed.moderatorClosing &&
            parsed.knowledgeNetwork &&
            parsed.knowledgeNetwork.leap &&
            parsed.knowledgeNetwork.leap.length
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
