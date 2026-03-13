// coveThink（澄思）微信小程序 - 阅读态 UI 优化与轻量交互
App({
  globalData: {
    roundtableTopic: '',
    roundtableIntroduction: null,
    roundtableChat: null,
    roundtableSummary: null,
    /** 邀请嘉宾结果，供圆桌讨论 / 话题总结沿用同一批嘉宾与脉络 */
    roundtableGuests: [],
    roundtableModeratorParagraphs: [],
    /** 圆桌讨论已完成的轮次，供话题总结（止）时作为上下文 */
    roundtableRounds: []
  },
  onLaunch() {
    // 预留：当前不做业务耦合
  }
})
