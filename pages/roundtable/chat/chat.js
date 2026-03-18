// 圆桌讨论 · 交锋页：主持引导 + 多角色发言 + 综述与框架（支持解析后的动态数据）
const { parseChat } = require('../../../utils/parse-roundtable.js')
const { callLLM, callDeepSeekStream } = require('../../../services/llm.js')

/**
 * 圆桌每一轮发送给 LLM 的 user 消息（command 为「可」或「深」）
 * @param {string} command - 可 / 深
 * @param {string} topic - 议题
 * @param {number} roundIndex - 当前轮次
 * @param {{ guests: Array<{name,role,stance}>, moderatorParagraphs: string[], previousRounds: Array<{roundTitle,moderatorAsk,speeches,synthesis}> }} context - 邀请嘉宾与历史轮次，保证同一批人与脉络
 */
function buildRoundPrompt(command, topic, roundIndex, context = {}) {
  const roundLabel = roundIndex ? `第 ${roundIndex} 轮` : '首轮'
  const { guests = [], moderatorParagraphs = [], previousRounds = [] } = context

  let prefix = ''
  if (guests && guests.length) {
    prefix += `【本场嘉宾名单（必须沿用，不得更换）】\n${guests.map(g => `- ${(g.name || '').trim()}（${(g.role || '').trim()}）：${(g.stance || '').trim()}`).join('\n')}\n\n`
  }
  if (moderatorParagraphs && moderatorParagraphs.length) {
    prefix += `【主持人开场摘要】\n${moderatorParagraphs.join('\n\n')}\n\n`
  }
  if (previousRounds && previousRounds.length) {
    prefix += `【此前讨论脉络】\n${previousRounds.map((r, i) => {
      const n = i + 1
      let block = `第${n}轮 ${r.roundTitle || ''}\n主持引导：${(r.moderatorAsk || '').trim()}\n`
      if (r.speeches && r.speeches.length) {
        block += r.speeches.map(s => `- ${(s.speaker || '').trim()}「${(s.action || '').trim()}」：${(s.content || '').trim().slice(0, 120)}${(s.content || '').length > 120 ? '…' : ''}`).join('\n') + '\n'
      }
      if (r.synthesis && (r.synthesis.coreConflict || r.synthesis.deepQuestion)) {
        block += `综述：${(r.synthesis.coreConflict || '').trim().slice(0, 80)}${(r.synthesis.deepQuestion || '').trim().slice(0, 60)}\n`
      }
      return block
    }).join('\n')}\n`
  }

  return `${prefix}你将收到一条指令与上下文，请为“圆桌讨论”的单轮输出结构化结果。\n\n要求：只输出一个 JSON 对象（严格 JSON），不允许任何前后缀文本、解释、Markdown、代码块围栏（\`\`\`）。\n\n输入：\n- command: ${command}\n- roundLabel: ${roundLabel}\n- topic: ${topic}\n\n输出 JSON schema（字段必须齐全、类型正确，不得为 null）：\n{\n  \"type\": \"chat\",\n  \"version\": 1,\n  \"roundNum\": number,\n  \"roundTitle\": string,\n  \"moderatorAsk\": string,\n  \"speeches\": Array<{ \"speaker\": string, \"action\": string, \"content\": string, \"tldr\": string }>,\n  \"synthesis\": { \"coreConflict\": string, \"framework\": string, \"deepQuestion\": string },\n  \"actions\": Array<{ \"id\": \"continue\"|\"deep_dive\"|\"stop\", \"label\": \"可\"|\"深\"|\"止\" }>\n}\n\n约束：\n- speeches 必须来自“本场嘉宾名单”中的人名，且至少 3 条发言。\n- framework 必须是 ASCII 图，用 \\n 表示换行。\n- actions 固定为 continue/deep_dive/stop 三个选项。\n- 在内容上延续此前讨论脉络，不得更换嘉宾。`
}

/** 单轮圆桌讨论预估字数（用于进度条分母，完成前最多显示 99%） */
const ESTIMATED_CHAT_ROUND_CHARS = 2200

Page({
  data: {
    topic: '',
    rounds: [],
    roundTitle: '',
    moderatorAsk: '',
    speeches: [],
    synthesis: { coreConflict: '', framework: '', deepQuestion: '' },
    actions: [
      { id: 'continue', label: '可', sublabel: '新问题', type: 'secondary' },
      { id: 'deep_dive', label: '深', sublabel: '深挖当前', type: 'primary' },
      { id: 'stop', label: '止', sublabel: '进结语', type: 'danger' }
    ],
    stepIndex: 2,
    showFrameworkFullscreen: false,
    loading: false,
    loadingMessage: '嘉宾正在讨论中…',
    streamedLength: 0,
    progressPercent: 0,
    estimatedTotal: ESTIMATED_CHAT_ROUND_CHARS
  },

  onLoad(options) {
    const app = getApp()
    const topic = (options.topic && decodeURIComponent(options.topic)) || app.globalData.roundtableTopic || ''
    const payload = app.globalData.roundtableChat
    if (payload) {
      const firstRound = {
        roundNum: payload.roundNum || 1,
        roundTitle: payload.roundTitle || '',
        moderatorAsk: payload.moderatorAsk || '',
        speeches: payload.speeches || [],
        synthesis: payload.synthesis || { coreConflict: '', framework: '', deepQuestion: '' }
      }
      app.globalData.roundtableChat = null
      this.setData({
        topic: payload.topic !== undefined ? payload.topic : topic,
        rounds: [firstRound],
        roundTitle: firstRound.roundTitle,
        moderatorAsk: firstRound.moderatorAsk,
        speeches: firstRound.speeches,
        synthesis: firstRound.synthesis,
        loading: false
      })
      return
    }
    const safeTopic = topic || '请稍候…'
    this.setData({
      topic: safeTopic,
      loading: true,
      loadingMessage: '嘉宾正在讨论中…',
      streamedLength: 0,
      progressPercent: 0,
      estimatedTotal: ESTIMATED_CHAT_ROUND_CHARS
    })
    this.fetchRound('可')
  },

  /** 请求一轮圆桌讨论（指令「可」或「深」），解析后渲染并追加为最新一轮 */
  fetchRound(command) {
    if (this.data.loading && (this.data.rounds && this.data.rounds.length)) {
      wx.showToast({ title: '当前轮讨论尚未完成', icon: 'none' })
      return
    }
    const app = getApp()
    const topic = app.globalData.roundtableTopic || this.data.topic
    const t = (topic || '').trim()
    if (!t) {
      this.setData({ loading: false })
      return
    }
    const nextIndex = (this.data.rounds && this.data.rounds.length ? this.data.rounds.length + 1 : 1)
    const context = {
      guests: app.globalData.roundtableGuests || [],
      moderatorParagraphs: app.globalData.roundtableModeratorParagraphs || [],
      previousRounds: this.data.rounds || []
    }
    const userMessage = buildRoundPrompt(command, t, nextIndex, context)
    const estimatedTotal = ESTIMATED_CHAT_ROUND_CHARS

    this.setData({
      loading: true,
      loadingMessage: '嘉宾正在讨论中…',
      streamedLength: 0,
      progressPercent: 0,
      estimatedTotal
    })

    const onChunk = (fullText, receivedLength) => {
      const percent = Math.min(99, Math.floor((receivedLength / estimatedTotal) * 100))
      this.setData({ streamedLength: receivedLength, progressPercent: percent })
    }

    callDeepSeekStream([{ role: 'user', content: userMessage }], onChunk)
      .then((text) => {
        this.setData({ progressPercent: 100 })
        const parsed = parseChat(text)
        const round = {
          roundNum: parsed.roundNum || nextIndex,
          roundTitle: parsed.roundTitle || '',
          moderatorAsk: parsed.moderatorAsk || '',
          speeches: parsed.speeches || [],
          synthesis: {
            coreConflict: parsed.synthesis.coreConflict || '',
            framework: parsed.synthesis.framework || '',
            deepQuestion: parsed.synthesis.deepQuestion || ''
          }
        }
        const rounds = (this.data.rounds || []).concat(round)
        this.setData({
          topic: t,
          rounds,
          roundTitle: round.roundTitle,
          moderatorAsk: round.moderatorAsk,
          speeches: round.speeches,
          synthesis: round.synthesis,
          loading: false,
          streamedLength: 0,
          progressPercent: 0
        })
      })
      .catch((err) => {
        // 流式失败时回退到统一的 callLLM（仍优先 DeepSeek）
        callLLM([{ role: 'user', content: userMessage }])
          .then(({ text }) => {
            const parsed = parseChat(text)
            const round = {
              roundNum: parsed.roundNum || nextIndex,
              roundTitle: parsed.roundTitle || '',
              moderatorAsk: parsed.moderatorAsk || '',
              speeches: parsed.speeches || [],
              synthesis: {
                coreConflict: parsed.synthesis.coreConflict || '',
                framework: parsed.synthesis.framework || '',
                deepQuestion: parsed.synthesis.deepQuestion || ''
              }
            }
            const rounds = (this.data.rounds || []).concat(round)
            this.setData({
              topic: t,
              rounds,
              roundTitle: round.roundTitle,
              moderatorAsk: round.moderatorAsk,
              speeches: round.speeches,
              synthesis: round.synthesis,
              loading: false,
              streamedLength: 0,
              progressPercent: 0
            })
          })
          .catch((e) => {
            this.setData({ loading: false, streamedLength: 0, progressPercent: 0 })
            wx.showToast({ title: (e && e.message) || '讨论请求失败，请重试', icon: 'none' })
          })
      })
  },

  /** 供外部注入解析结果：传入 LLM 返回的 JSON 文本 */
  applyJson(jsonText) {
    const parsed = parseChat(jsonText)
    const app = getApp()
    const topic = app.globalData.roundtableTopic || this.data.topic
    const round = {
      roundNum: parsed.roundNum || 1,
      roundTitle: parsed.roundTitle || '',
      moderatorAsk: parsed.moderatorAsk || '',
      speeches: parsed.speeches || [],
      synthesis: {
        coreConflict: parsed.synthesis.coreConflict || '',
        framework: parsed.synthesis.framework || '',
        deepQuestion: parsed.synthesis.deepQuestion || ''
      }
    }
    this.setData({
      topic,
      rounds: [round],
      roundTitle: round.roundTitle,
      moderatorAsk: round.moderatorAsk,
      speeches: round.speeches,
      synthesis: round.synthesis
    })
  },

  onActionTap(e) {
    const id = e.currentTarget.dataset.id
    if (id === 'continue') {
      this.fetchRound('可')
      return
    }
    if (id === 'deep_dive') {
      this.fetchRound('深')
      return
    }
    if (id === 'stop') {
      const app = getApp()
      app.globalData.roundtableRounds = this.data.rounds || []
      wx.navigateTo({
        url: '/pages/roundtable/summary/summary?topic=' + encodeURIComponent(this.data.topic)
      })
      return
    }
    wx.showToast({ title: '敬请期待', icon: 'none' })
  },

  onFrameworkTap() {
    this.setData({ showFrameworkFullscreen: true })
  },

  onCloseFramework() {
    this.setData({ showFrameworkFullscreen: false })
  },

  onFrameworkInnerTap() {
    // 阻止点击内容区域时关闭
  }
})
