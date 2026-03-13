// 圆桌讨论 · 话题总结：主持收束 + 知识网络（跃迁/支柱/风险）+ 终极结论（支持解析后的动态数据）
const { parseSummary } = require('../../../utils/parse-roundtable.js')
const { callLLM, callDeepSeekStream } = require('../../../services/llm.js')

/**
 * 总结阶段发给 LLM 的 user 消息（指令为「止」）
 * @param {string} command - 止
 * @param {string} topic - 议题
 * @param {{ guests: Array, moderatorParagraphs: string[], rounds: Array }} context - 本场嘉宾与历史轮次，保证总结基于同一批人与讨论
 */
function buildSummaryPrompt(command, topic, context = {}) {
  const { guests = [], moderatorParagraphs = [], rounds = [] } = context
  let prefix = ''
  if (guests && guests.length) {
    prefix += `【本场嘉宾】\n${guests.map(g => `- ${(g.name || '').trim()}（${(g.role || '').trim()}）：${(g.stance || '').trim()}`).join('\n')}\n\n`
  }
  if (rounds && rounds.length) {
    prefix += `【讨论脉络摘要】\n${rounds.map((r, i) => {
      let block = `第${i + 1}轮 ${(r.roundTitle || '').trim()}\n主持：${(r.moderatorAsk || '').trim().slice(0, 100)}…\n`
      if (r.speeches && r.speeches.length) {
        block += r.speeches.map(s => `${(s.speaker || '').trim()}「${(s.action || '').trim()}」`).join('；') + '\n'
      }
      if (r.synthesis && r.synthesis.coreConflict) {
        block += `综述：${(r.synthesis.coreConflict || '').trim().slice(0, 80)}…\n`
      }
      return block
    }).join('\n')}\n\n`
  }
  return `${prefix}指令：${command}
议题：${topic}
请严格按照 [TYPE] 话题总结 的 Markdown 结构输出总结内容（包含 [CONCLUSION]、[MODERATOR_CLOSING]、[KNOWLEDGE_NETWORK]、[ULTIMATE_CONCLUSION] 与 [ACTIONS]），针对上述本场嘉宾与讨论脉络进行结构化收束。`
}

/** 话题总结预估字数（用于进度条分母，完成前最多显示 99%） */
const ESTIMATED_SUMMARY_CHARS = 2000

Page({
  data: {
    topic: '',
    moderatorClosing: '',
    knowledgeNetwork: { leap: [], pillars: [], risks: [] },
    ultimateConclusion: '',
    actions: [
      { id: 'export', label: '导出知识图谱', type: 'primary', span: 2 },
      { id: 'restart', label: '新议题', type: 'secondary', span: 1 }
    ],
    stepIndex: 3,
    loading: false,
    loadingMessage: '主持人正在总结中…',
    streamedLength: 0,
    progressPercent: 0,
    estimatedTotal: ESTIMATED_SUMMARY_CHARS
  },

  onLoad(options) {
    const app = getApp()
    const topic = (options.topic && decodeURIComponent(options.topic)) || app.globalData.roundtableTopic || ''
    const payload = app.globalData.roundtableSummary
    if (payload) {
      app.globalData.roundtableSummary = null
      this.setData({
        topic: payload.topic !== undefined ? payload.topic : topic,
        moderatorClosing: payload.moderatorClosing || '',
        knowledgeNetwork: payload.knowledgeNetwork || this.data.knowledgeNetwork,
        ultimateConclusion: payload.ultimateConclusion || '',
        loading: false
      })
      return
    }
    const t = topic || ''
    this.setData({
      topic: t || '请稍候…',
      loading: true,
      loadingMessage: '主持人正在总结中…',
      streamedLength: 0,
      progressPercent: 0,
      estimatedTotal: ESTIMATED_SUMMARY_CHARS
    })
    this.fetchSummary('止')
  },

  /** 请求 LLM 生成话题总结，解析后渲染 */
  fetchSummary(command) {
    const app = getApp()
    const topic = app.globalData.roundtableTopic || this.data.topic
    const t = (topic || '').trim()
    if (!t) {
      this.setData({ loading: false })
      return
    }
    const context = {
      guests: app.globalData.roundtableGuests || [],
      moderatorParagraphs: app.globalData.roundtableModeratorParagraphs || [],
      rounds: app.globalData.roundtableRounds || []
    }
    const userMessage = buildSummaryPrompt(command, t, context)
    const estimatedTotal = ESTIMATED_SUMMARY_CHARS

    this.setData({
      loading: true,
      loadingMessage: '主持人正在总结中…',
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
        const parsed = parseSummary(text)
        this.setData({
          topic: t,
          moderatorClosing: parsed.moderatorClosing || '',
          knowledgeNetwork: parsed.knowledgeNetwork || this.data.knowledgeNetwork,
          ultimateConclusion: parsed.ultimateConclusion || '',
          loading: false,
          streamedLength: 0,
          progressPercent: 0
        })
      })
      .catch((err) => {
        // 流式失败时回退到统一的 callLLM（仍优先 DeepSeek）
        callLLM([{ role: 'user', content: userMessage }])
          .then(({ text }) => {
            const parsed = parseSummary(text)
            this.setData({
              topic: t,
              moderatorClosing: parsed.moderatorClosing || '',
              knowledgeNetwork: parsed.knowledgeNetwork || this.data.knowledgeNetwork,
              ultimateConclusion: parsed.ultimateConclusion || '',
              loading: false,
              streamedLength: 0,
              progressPercent: 0
            })
          })
          .catch((e) => {
            this.setData({ loading: false, streamedLength: 0, progressPercent: 0 })
            wx.showToast({ title: (e && e.message) || '总结请求失败，请重试', icon: 'none' })
          })
      })
  },

  /** 供外部注入解析结果：传入 LLM 返回的 markdown 文本 */
  applyMarkdown(markdownText) {
    const parsed = parseSummary(markdownText)
    const app = getApp()
    const topic = app.globalData.roundtableTopic || this.data.topic
    this.setData({
      topic,
      moderatorClosing: parsed.moderatorClosing || '',
      knowledgeNetwork: parsed.knowledgeNetwork || this.data.knowledgeNetwork,
      ultimateConclusion: parsed.ultimateConclusion || '',
      loading: false
    })
  },

  onActionTap(e) {
    const id = e.currentTarget.dataset.id
    if (id === 'restart') {
      wx.reLaunch({ url: '/pages/index/index' })
      return
    }
    if (id === 'export') {
      wx.showToast({ title: '敬请期待', icon: 'none' })
      return
    }
  }
})
