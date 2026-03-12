// 输入页 - 按工具展示不同入口（圆桌会议等）
Page({
  data: {
    toolId: '',
    topic: 'AI 教育：从千人千面到一人一面',
    // 圆桌会议配置
    roundtable: {
      icon: '👥',
      title: '圆桌会议',
      desc: '一个以"求真"为目标的对话。对话由一位极具洞察力的主持人进行引导，邀请代表不同思想的"典型代表人物"进行一场高强度的、即时响应式的深度对话。'
    }
  },

  onLoad(options) {
    const toolId = options.toolId || ''
    this.setData({ toolId })
  },

  onDiscussTap() {
    // 后续：触发加载过渡并跳转 chat
    wx.showToast({ title: '敬请期待', icon: 'none' })
  }
})
