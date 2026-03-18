// 圆桌讨论 · 邀请嘉宾：议题 + 主持人开场 + 嘉宾名单（支持解析后的动态数据）
const { parseIntroduction } = require('../../../utils/parse-roundtable.js')
const { callLLM, callDeepSeekStream } = require('../../../services/llm.js')

/** 邀请嘉宾环节发给 LLM 的 user 消息（system 已在 llm 层注入） */
function buildInvitationPrompt(topic) {
  return `你将收到一个议题，请为“圆桌讨论”的第一阶段生成邀请嘉宾信息。\n\n要求：只输出一个 JSON 对象（严格 JSON），不允许任何前后缀文本、解释、Markdown、代码块围栏（\`\`\`）。\n\n输入：\n- topic: ${topic}\n\n输出 JSON schema（字段必须齐全、类型正确，不得为 null）：\n{\n  \"type\": \"invitation\",\n  \"version\": 1,\n  \"topic\": string,\n  \"moderatorParagraphs\": string[],\n  \"guests\": Array<{ \"name\": string, \"role\": string, \"mbti\": string, \"stance\": string }>,\n  \"actionLabel\": string\n}\n\n约束：\n- guests 必须恰好 3 位。\n- moderatorParagraphs 至少 2 段。\n- actionLabel 固定为“进入第一轮圆桌讨论”。`
}

/** 邀请嘉宾回复的大致字数（用于进度条分母，完成前最多显示 99%） */
const ESTIMATED_INVITATION_CHARS = 1200

Page({
  data: {
    topic: '',
    moderatorParagraphs: [],
    guests: [],
    actionLabel: '进入第一轮圆桌讨论',
    stepIndex: 1,
    loading: false,
    loadingMessage: '正在寻找可靠的嘉宾',
    streamedLength: 0,
    progressPercent: 0,
    estimatedTotal: ESTIMATED_INVITATION_CHARS
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
      app.globalData.roundtableGuests = payload.guests || []
      app.globalData.roundtableModeratorParagraphs = payload.moderatorParagraphs || []
      return
    }
    const topic = (options.topic && decodeURIComponent(options.topic)) || app.globalData.roundtableTopic || ''
    this.setData({ topic: topic || '请稍候…', loading: true })
    this.fetchInvitation(topic)
  },

  /** 请求 LLM 生成邀请嘉宾内容；优先流式，失败则回退非流式 */
  fetchInvitation(topic) {
    if (!(topic && topic.trim())) {
      this.setData({ loading: false })
      return
    }
    const t = topic.trim()
    const userMessage = buildInvitationPrompt(t)
    const estimatedTotal = ESTIMATED_INVITATION_CHARS

    this.setData({
      loading: true,
      loadingMessage: '正在寻找可靠的嘉宾',
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
        const parsed = parseIntroduction(text)
        const app = getApp()
        this.setData({
          topic: parsed.topic || t,
          moderatorParagraphs: parsed.moderatorParagraphs || [],
          guests: parsed.guests || [],
          actionLabel: parsed.actionLabel || this.data.actionLabel,
          loading: false,
          streamedLength: 0,
          progressPercent: 0
        })
        if (parsed.topic) app.globalData.roundtableTopic = parsed.topic
        app.globalData.roundtableGuests = parsed.guests || []
        app.globalData.roundtableModeratorParagraphs = parsed.moderatorParagraphs || []
      })
      .catch((err) => {
        callLLM([{ role: 'user', content: userMessage }])
          .then(({ text }) => {
            const parsed = parseIntroduction(text)
            const app = getApp()
            this.setData({
              topic: parsed.topic || t,
              moderatorParagraphs: parsed.moderatorParagraphs || [],
              guests: parsed.guests || [],
              actionLabel: parsed.actionLabel || this.data.actionLabel,
              loading: false,
              streamedLength: 0,
              progressPercent: 0
            })
            if (parsed.topic) app.globalData.roundtableTopic = parsed.topic
            app.globalData.roundtableGuests = parsed.guests || []
            app.globalData.roundtableModeratorParagraphs = parsed.moderatorParagraphs || []
          })
          .catch((e) => {
            this.setData({ loading: false, streamedLength: 0, progressPercent: 0 })
            wx.showToast({ title: (e && e.message) || '请求失败，请重试', icon: 'none' })
          })
      })
  },

  /** 供外部注入解析结果：传入 LLM 返回的 JSON 文本 */
  applyJson(jsonText) {
    const parsed = parseIntroduction(jsonText)
    const app = getApp()
    this.setData({
      topic: parsed.topic || this.data.topic,
      moderatorParagraphs: parsed.moderatorParagraphs || [],
      guests: parsed.guests || [],
      actionLabel: parsed.actionLabel || this.data.actionLabel
    })
    if (parsed.topic) app.globalData.roundtableTopic = parsed.topic
    app.globalData.roundtableGuests = parsed.guests || []
    app.globalData.roundtableModeratorParagraphs = parsed.moderatorParagraphs || []
  },

  onEnterRoundTap() {
    const topic = this.data.topic || app.globalData.roundtableTopic
    wx.navigateTo({
      url: '/pages/roundtable/chat/chat?topic=' + encodeURIComponent(topic || '')
    })
  }
})
