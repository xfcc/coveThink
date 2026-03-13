// 圆桌讨论 · 邀请嘉宾：议题 + 主持人开场 + 嘉宾名单（支持解析后的动态数据）
const { parseIntroduction } = require('../../../utils/parse-roundtable.js')
const { callLLM } = require('../../../services/llm.js')

/** 邀请嘉宾环节发给 LLM 的 user 消息（system 已在 llm 层注入） */
function buildInvitationPrompt(topic) {
  return `议题：${topic}\n请严格按照 [TYPE] 邀请嘉宾 的 Markdown 结构，输出完整内容（包含 [TOPIC]、[MODERATOR]、[GUEST_ROSTER] 与每位 [GUEST] 的 name/role/mbti/stance、[ACTION]）。`
}

Page({
  data: {
    topic: '',
    moderatorParagraphs: [],
    guests: [],
    actionLabel: '进入第一轮圆桌讨论',
    stepIndex: 1,
    loading: false
  },

  onLoad(options) {
    const app = getApp()
    const payload = app.globalData.roundtableIntroduction
    if (payload) {
      app.globalData.roundtableIntroduction = null
      this.setData({
        topic: payload.topic || (options.topic && decodeURIComponent(options.topic)) || '',
        moderatorParagraphs: payload.moderatorParagraphs || [],
        guests: payload.guests || [],
        actionLabel: payload.actionLabel || this.data.actionLabel,
        loading: false
      })
      if (payload.topic) app.globalData.roundtableTopic = payload.topic
      return
    }
    const topic = (options.topic && decodeURIComponent(options.topic)) || app.globalData.roundtableTopic || ''
    this.setData({ topic: topic || '请稍候…', loading: true })
    this.fetchInvitation(topic)
  },

  /** 请求 LLM 生成邀请嘉宾内容，解析后渲染 */
  fetchInvitation(topic) {
    if (!(topic && topic.trim())) {
      this.setData({ loading: false })
      return
    }
    const userMessage = buildInvitationPrompt(topic.trim())
    callLLM([{ role: 'user', content: userMessage }])
      .then(({ text }) => {
        const parsed = parseIntroduction(text)
        const app = getApp()
        this.setData({
          topic: parsed.topic || topic,
          moderatorParagraphs: parsed.moderatorParagraphs || [],
          guests: parsed.guests || [],
          actionLabel: parsed.actionLabel || this.data.actionLabel,
          loading: false
        })
        if (parsed.topic) app.globalData.roundtableTopic = parsed.topic
      })
      .catch((err) => {
        this.setData({ loading: false })
        wx.showToast({ title: err.message || '请求失败，请重试', icon: 'none' })
      })
  },

  /** 供外部注入解析结果：传入 LLM 返回的 markdown 文本 */
  applyMarkdown(markdownText) {
    const parsed = parseIntroduction(markdownText)
    const app = getApp()
    this.setData({
      topic: parsed.topic || this.data.topic,
      moderatorParagraphs: parsed.moderatorParagraphs || [],
      guests: parsed.guests || [],
      actionLabel: parsed.actionLabel || this.data.actionLabel
    })
    if (parsed.topic) app.globalData.roundtableTopic = parsed.topic
  },

  onEnterRoundTap() {
    const topic = this.data.topic || app.globalData.roundtableTopic
    wx.navigateTo({
      url: '/pages/roundtable/chat/chat?topic=' + encodeURIComponent(topic || '')
    })
  }
})
