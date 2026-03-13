/**
 * 圆桌讨论 · 解析 LLM 返回的 Markdown
 * 结构以 examples/[TYPE] 邀请嘉宾.md、圆桌讨论.md、话题总结.md 为准
 */

const THEMES = ['purple', 'green', 'blue']

function mbtiToClass(mbti) {
  if (!mbti) return 'blue'
  const u = (mbti || '').toUpperCase()
  if (/INTJ|INTP|ENTJ|ENTP/.test(u)) return 'purple'
  if (/INFJ|INFP|ENFJ|ENFP/.test(u)) return 'green'
  return 'blue'
}

/**
 * 解析 [TYPE] 邀请嘉宾
 * @param {string} raw
 * @returns {{ topic: string, moderatorParagraphs: string[], guests: Array<{name,role,mbti,mbtiClass,stance}>, actionLabel: string }}
 */
function parseIntroduction(raw) {
  const text = (raw || '').trim()
  const topicMatch = text.match(/#\s*\[TOPIC\]\s*(.+?)(?=\n|$)/)
  const topic = (topicMatch && topicMatch[1].trim()) || ''

  const moderatorBlock = text.match(/##\s*\[MODERATOR\]\s*([\s\S]*?)(?=\n##\s*\[GUEST_ROSTER\]|$)/)
  const moderatorText = (moderatorBlock && moderatorBlock[1].trim()) || ''
  const moderatorParagraphs = moderatorText ? moderatorText.split(/\n\n+/).map(p => p.trim()).filter(Boolean) : []

  const guestRoster = text.match(/##\s*\[GUEST_ROSTER\]\s*([\s\S]*?)(?=\n##\s*\[ACTION\]|$)/)
  const rosterText = (guestRoster && guestRoster[1]) || ''
  const guests = []
  const guestBlocks = rosterText.split(/(?=###\s*\[GUEST\])/).filter(Boolean)
  for (const block of guestBlocks) {
    const nameMatch = block.match(/-?\s*name:\s*(.+?)(?=\n|$)/m)
    const roleMatch = block.match(/-?\s*role:\s*(.+?)(?=\n|$)/m)
    const mbtiMatch = block.match(/-?\s*mbti:\s*(.+?)(?=\n|$)/m)
    const stanceMatch = block.match(/-?\s*stance:\s*([\s\S]+?)(?=\n###|\n##|$)/m)
    if (nameMatch) {
      guests.push({
        name: (nameMatch[1] || '').trim(),
        role: (roleMatch && roleMatch[1].trim()) || '',
        mbti: (mbtiMatch && mbtiMatch[1].trim()) || '',
        mbtiClass: mbtiToClass(mbtiMatch && mbtiMatch[1].trim()),
        stance: (stanceMatch && stanceMatch[1].trim()) || ''
      })
    }
  }

  const actionMatch = text.match(/##\s*\[ACTION\]\s*(.+?)(?=\n|$)/)
  const actionLabel = (actionMatch && actionMatch[1].trim()) || '进入第一轮圆桌讨论'

  return { topic, moderatorParagraphs, guests, actionLabel }
}

/**
 * 解析 [TYPE] 圆桌讨论
 * @param {string} raw
 * @returns {{ roundNum: number, roundTitle: string, moderatorAsk: string, speeches: Array<{speaker,action,content,tldr,theme}>, synthesis: { coreConflict, framework, deepQuestion } }}
 */
function parseChat(raw) {
  const text = (raw || '').trim()
  const roundNumMatch = text.match(/##\s*\[ROUND_NUM\]\s*(\d+)/)
  const roundNum = roundNumMatch ? parseInt(roundNumMatch[1], 10) : 1
  const roundMatch = text.match(/##\s*\[ROUND\]\s*(.+?)(?=\n|$)/)
  const roundTitle = (roundMatch && roundMatch[1].trim()) || ''

  const moderatorAskBlock = text.match(/###\s*\[MODERATOR_ASK\]\s*([\s\S]*?)(?=\n###\s*\[SPEECH\]|$)/)
  const moderatorAsk = (moderatorAskBlock && moderatorAskBlock[1].trim()) || ''

  const speechSection = text.match(/###\s*\[SPEECH\]([\s\S]*?)(?=\n###\s*\[SYNTHESIS\]|$)/)
  const speechText = (speechSection && speechSection[1]) || ''
  const speeches = []
  const speechBlocks = speechText.split(/(?=###\s*\[SPEECH\])/).filter(b => /speaker:/.test(b))
  speechBlocks.forEach((block, i) => {
    const speakerMatch = block.match(/-?\s*speaker:\s*(.+?)(?=\n|$)/m)
    const actionMatch = block.match(/-?\s*action:\s*(.+?)(?=\n|$)/m)
    const contentMatch = block.match(/-?\s*content:\s*([\s\S]+?)(?=\n-\s*tldr:|\n###|$)/m)
    const tldrMatch = block.match(/-?\s*tldr:\s*([\s\S]+?)(?=\n###|\n$|$)/m)
    if (speakerMatch) {
      speeches.push({
        speaker: (speakerMatch[1] || '').trim(),
        action: (actionMatch && actionMatch[1].trim()) || '',
        content: (contentMatch && contentMatch[1].trim()) || '',
        tldr: (tldrMatch && tldrMatch[1].trim()) || '',
        theme: THEMES[i % THEMES.length]
      })
    }
  })

  const synthesisBlock = text.match(/###\s*\[SYNTHESIS\]([\s\S]*?)(?=\n###\s*\[ACTIONS\]|$)/)
  const synText = (synthesisBlock && synthesisBlock[1]) || ''
  const coreConflictMatch = synText.match(/-?\s*core_conflict:\s*([\s\S]+?)(?=\n-\s*framework:|\n-?\s*deep_question:|\n###|$)/m)
  const deepQuestionMatch = synText.match(/-?\s*deep_question:\s*([\s\S]+?)(?=\n###|$)/m)
  let framework = ''
  const frameworkStart = synText.indexOf('- framework:')
  const frameworkEnd = synText.indexOf('- deep_question:')
  if (frameworkStart !== -1) {
    let f = frameworkEnd !== -1 ? synText.slice(frameworkStart, frameworkEnd) : synText.slice(frameworkStart)
    f = f.replace(/^-\s*framework:\s*\n?/, '').trim()
    f = f.replace(/^[`\s]*text[`\s]*\n?/, '').replace(/\n?[`\s]*$/, '').trim()
    framework = f
  }
  const synthesis = {
    coreConflict: (coreConflictMatch && coreConflictMatch[1].trim()) || '',
    framework,
    deepQuestion: (deepQuestionMatch && deepQuestionMatch[1].trim()) || ''
  }

  return { roundNum, roundTitle, moderatorAsk, speeches, synthesis }
}

/**
 * 解析 [TYPE] 话题总结
 * @param {string} raw
 * @returns {{ moderatorClosing: string, knowledgeNetwork: { leap, pillars, risks }, ultimateConclusion: string }}
 */
function parseSummary(raw) {
  const text = (raw || '').trim()
  const closingBlock = text.match(/###\s*\[MODERATOR_CLOSING\]\s*([\s\S]*?)(?=\n###\s*\[KNOWLEDGE_NETWORK\]|$)/)
  const moderatorClosing = (closingBlock && closingBlock[1].trim()) || ''

  const knBlock = text.match(/###\s*\[KNOWLEDGE_NETWORK\]\s*([\s\S]*?)(?=\n###\s*\[ULTIMATE_CONCLUSION\]|$)/)
  const knText = (knBlock && knBlock[1]) || ''
  const leap = []
  const pillars = []
  const risks = []
  const sections = knText.split(/(?=####\s+)/).filter(Boolean)
  for (const section of sections) {
    const listText = section.replace(/####\s+.+?\n?/, '')
    const items = []
    const lines = listText.split(/\n/).filter(l => /^\s*-\s*\[.+\]/.test(l))
    for (const line of lines) {
      const m = line.match(/^\s*-\s*\[([^\]]+)\]\s*(.*)$/)
      if (m) items.push({ label: m[1].trim(), desc: (m[2] || '').trim() })
    }
    if (items.length === 0) continue
    if (leap.length === 0 && items.length === 2) {
      leap.push({ title: items[0].label, desc: items[0].desc }, { title: items[1].label, desc: items[1].desc })
    } else if (pillars.length === 0 && items.length >= 3) {
      items.forEach(it => pillars.push({ label: it.label, value: it.label, desc: it.desc }))
    } else if (risks.length === 0 && items.length >= 1) {
      items.forEach(it => risks.push({ title: it.label, desc: it.desc }))
    }
  }

  const conclusionBlock = text.match(/###\s*\[ULTIMATE_CONCLUSION\]\s*([\s\S]*?)(?=\n###\s*\[ACTIONS\]|$)/)
  let ultimateConclusion = (conclusionBlock && conclusionBlock[1].trim()) || ''
  ultimateConclusion = ultimateConclusion.replace(/\*\*([^*]+)\*\*/g, '$1')

  return {
    moderatorClosing,
    knowledgeNetwork: { leap, pillars, risks },
    ultimateConclusion
  }
}

/**
 * 根据首行 [TYPE] 自动选择解析器
 * @param {string} raw
 * @returns {{ type: 'invitation'|'chat'|'summary', data: object }}
 */
function parseByType(raw) {
  const t = (raw || '').trim().slice(0, 80)
  if (/\[TYPE\]\s*邀请嘉宾/.test(t)) {
    return { type: 'invitation', data: parseIntroduction(raw) }
  }
  if (/\[TYPE\]\s*圆桌讨论/.test(t)) {
    return { type: 'chat', data: parseChat(raw) }
  }
  if (/\[TYPE\]\s*话题总结/.test(t)) {
    return { type: 'summary', data: parseSummary(raw) }
  }
  return { type: null, data: null }
}

module.exports = {
  parseIntroduction,
  parseChat,
  parseSummary,
  parseByType
}
