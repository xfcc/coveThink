/**
 * 圆桌讨论 · 解析 LLM 返回的 JSON（严格 JSON，纯对象）
 * system_instruction 已强制要求仅输出一个 JSON 对象
 */

const THEMES = ['purple', 'green', 'blue']

function mbtiToClass(mbti) {
  if (!mbti) return 'blue'
  const u = (mbti || '').toUpperCase()
  if (/INTJ|INTP|ENTJ|ENTP/.test(u)) return 'purple'
  if (/INFJ|INFP|ENFJ|ENFP/.test(u)) return 'green'
  return 'blue'
}

function asString(v) {
  if (v == null) return ''
  return typeof v === 'string' ? v : String(v)
}

function asArray(v) {
  return Array.isArray(v) ? v : []
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function parseJsonObject(raw) {
  const text = (raw || '').trim()
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error('JSON 解析失败：请确保 LLM 仅返回纯 JSON（无代码块/无前后缀）')
  }
}

/**
 * 解析 [TYPE] 邀请嘉宾
 * @param {string} raw
 * @returns {{ topic: string, moderatorParagraphs: string[], guests: Array<{name,role,mbti,mbtiClass,stance}>, actionLabel: string }}
 */
function parseIntroduction(raw) {
  const obj = parseJsonObject(raw)
  assert(obj && typeof obj === 'object', '邀请嘉宾：返回必须为 JSON 对象')
  assert(obj.type === 'invitation', '邀请嘉宾：type 必须为 "invitation"')

  const topic = asString(obj.topic).trim()
  const moderatorParagraphs = asArray(obj.moderatorParagraphs).map(p => asString(p).trim()).filter(Boolean)
  const guestsRaw = asArray(obj.guests)
  const guests = guestsRaw.map(g => {
    const mbti = asString(g && g.mbti).trim()
    return {
      name: asString(g && g.name).trim(),
      role: asString(g && g.role).trim(),
      mbti,
      mbtiClass: mbtiToClass(mbti),
      stance: asString(g && g.stance).trim()
    }
  }).filter(g => g.name)
  const actionLabel = asString(obj.actionLabel).trim() || '进入第一轮圆桌讨论'

  assert(topic, '邀请嘉宾：缺少 topic')
  assert(moderatorParagraphs.length >= 1, '邀请嘉宾：moderatorParagraphs 至少 1 段')
  assert(guests.length >= 1, '邀请嘉宾：guests 至少 1 位')

  return { topic, moderatorParagraphs, guests, actionLabel }
}

/**
 * 解析 [TYPE] 圆桌讨论
 * @param {string} raw
 * @returns {{ roundNum: number, roundTitle: string, moderatorAsk: string, speeches: Array<{speaker,action,content,tldr,theme}>, synthesis: { coreConflict, framework, deepQuestion } }}
 */
function parseChat(raw) {
  const obj = parseJsonObject(raw)
  assert(obj && typeof obj === 'object', '圆桌讨论：返回必须为 JSON 对象')
  assert(obj.type === 'chat', '圆桌讨论：type 必须为 "chat"')

  const roundNum = typeof obj.roundNum === 'number' ? obj.roundNum : parseInt(obj.roundNum, 10) || 1
  const roundTitle = asString(obj.roundTitle).trim()
  const moderatorAsk = asString(obj.moderatorAsk).trim()

  const speechesRaw = asArray(obj.speeches)
  const speeches = speechesRaw.map((s, i) => ({
    speaker: asString(s && s.speaker).trim(),
    action: asString(s && s.action).trim(),
    content: asString(s && s.content).trim(),
    tldr: asString(s && s.tldr).trim(),
    theme: THEMES[i % THEMES.length]
  })).filter(s => s.speaker)

  const syn = obj.synthesis || {}
  const synthesis = {
    coreConflict: asString(syn.coreConflict).trim(),
    framework: asString(syn.framework).trim(),
    deepQuestion: asString(syn.deepQuestion).trim()
  }

  assert(roundTitle, '圆桌讨论：缺少 roundTitle')
  assert(moderatorAsk, '圆桌讨论：缺少 moderatorAsk')
  assert(speeches.length >= 1, '圆桌讨论：speeches 至少 1 条')

  return { roundNum, roundTitle, moderatorAsk, speeches, synthesis }
}

/**
 * 解析 [TYPE] 话题总结
 * @param {string} raw
 * @returns {{ moderatorClosing: string, knowledgeNetwork: { leap, pillars, risks }, ultimateConclusion: string }}
 */
function parseSummary(raw) {
  const obj = parseJsonObject(raw)
  assert(obj && typeof obj === 'object', '话题总结：返回必须为 JSON 对象')
  assert(obj.type === 'summary', '话题总结：type 必须为 "summary"')

  const moderatorClosing = asString(obj.moderatorClosing).trim()
  const kn = obj.knowledgeNetwork || {}
  const leapRaw = asArray(kn.leap)
  const pillarsRaw = asArray(kn.pillars)
  const risksRaw = asArray(kn.risks)
  const leap = leapRaw.map(it => ({ title: asString(it && it.title).trim(), desc: asString(it && it.desc).trim() })).filter(it => it.title)
  const pillars = pillarsRaw.map(it => ({ label: asString(it && it.label).trim(), value: asString((it && it.value) || (it && it.label)).trim(), desc: asString(it && it.desc).trim() })).filter(it => it.label)
  const risks = risksRaw.map(it => ({ title: asString(it && it.title).trim(), desc: asString(it && it.desc).trim() })).filter(it => it.title)
  const ultimateConclusion = asString(obj.ultimateConclusion).trim()

  assert(moderatorClosing, '话题总结：缺少 moderatorClosing')
  assert(leap.length >= 1, '话题总结：knowledgeNetwork.leap 至少 1 项')
  assert(ultimateConclusion, '话题总结：缺少 ultimateConclusion')

  return { moderatorClosing, knowledgeNetwork: { leap, pillars, risks }, ultimateConclusion }
}

/**
 * 根据首行 [TYPE] 自动选择解析器
 * @param {string} raw
 * @returns {{ type: 'invitation'|'chat'|'summary', data: object }}
 */
function parseByType(raw) {
  const obj = parseJsonObject(raw)
  const type = obj && obj.type
  if (type === 'invitation') return { type: 'invitation', data: parseIntroduction(raw) }
  if (type === 'chat') return { type: 'chat', data: parseChat(raw) }
  if (type === 'summary') return { type: 'summary', data: parseSummary(raw) }
  return { type: null, data: null }
}

module.exports = {
  parseIntroduction,
  parseChat,
  parseSummary,
  parseByType
}
