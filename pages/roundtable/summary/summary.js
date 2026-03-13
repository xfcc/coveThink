// 圆桌讨论 · 话题总结：主持收束 + 知识网络（跃迁/支柱/风险）+ 终极结论（支持解析后的动态数据）
const { parseSummary } = require('../../../utils/parse-roundtable.js')
const { callLLM } = require('../../../services/llm.js')

/** 总结阶段发给 LLM 的 user 消息（指令为「止」） */
function buildSummaryPrompt(command, topic) {
  return `指令：${command}
议题：${topic}
请严格按照 [TYPE] 话题总结 的 Markdown 结构输出总结内容（包含 [CONCLUSION]、[MODERATOR_CLOSING]、[KNOWLEDGE_NETWORK]、[ULTIMATE_CONCLUSION] 与 [ACTIONS]），对此前圆桌讨论进行结构化收束。`
}

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
    loading: false
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
    this.setData({ topic: t || '请稍候…', loading: true })
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
    const userMessage = buildSummaryPrompt(command, t)
    this.setData({ loading: true })
    callLLM([{ role: 'user', content: userMessage }])
      .then(({ text }) => {
        const parsed = parseSummary(text)
        this.setData({
          topic: t,
          moderatorClosing: parsed.moderatorClosing || '',
          knowledgeNetwork: parsed.knowledgeNetwork || this.data.knowledgeNetwork,
          ultimateConclusion: parsed.ultimateConclusion || '',
          loading: false
        })
      })
      .catch((err) => {
        this.setData({ loading: false })
        wx.showToast({ title: err.message || '总结请求失败，请重试', icon: 'none' })
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
