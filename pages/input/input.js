// 输入页 - 按工具展示不同入口（圆桌讨论 / 商业结构 / 单词解剖）
Page({
  data: {
    toolId: '',
    topic: '',
    roundtable: {
      icon: '👥',
      title: '圆桌讨论',
      desc: '一个以"求真"为目标的对话。对话由一位极具洞察力的主持人进行引导，邀请代表不同思想的"典型代表人物"进行一场高强度的、即时响应式的深度对话。'
    }
  },

  onLoad(options) {
    const toolId = options.toolId || ''
    this.setData({ toolId })
  },

  onTopicInput(e) {
    this.setData({ topic: (e.detail && e.detail.value) || '' })
  },

  onDiscussTap() {
    const toolId = this.data.toolId
    const topic = (this.data.topic || '').trim()
    if (!topic) {
      wx.showToast({ title: '请先输入要探讨的话题', icon: 'none' })
      return
    }
    if (toolId === 'roundtable') {
      const app = getApp()
      app.globalData.roundtableTopic = topic
      wx.navigateTo({
        url: '/pages/roundtable/introduction/introduction?topic=' + encodeURIComponent(topic)
      })
      return
    }
    wx.showToast({ title: '敬请期待', icon: 'none' })
  }
})
