// 现代极简大厅 - 工具列表
Page({
  data: {
    tools: [
      { id: 'roundtable', icon: '👥', title: '圆桌讨论', desc: '协同探索，共同求真', path: '/pages/input/input' },
      { id: 'business', icon: '📐', title: '商业结构', desc: '看懂公司的形状', path: '/pages/input/input' },
      { id: 'word', icon: '✂️', title: '单词解剖', desc: '结构英文单词，直击词的灵魂', path: '/pages/input/input' }
    ]
  },

  onLoad() {},

  onToolTap(e) {
    const toolId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/input/input?toolId=' + toolId
    })
  }
})
