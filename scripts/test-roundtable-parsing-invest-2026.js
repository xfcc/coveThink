/* eslint-disable no-console */
/**
 * Offline unit test (Node) for roundtable JSON parsing pipeline.
 *
 * Covers:
 * - 邀请嘉宾（invitation）
 * - 开始讨论（round1: 可）
 * - 深入讨论（round2: 深）
 * - 继续讨论（round3: 可）
 * - 输出结论（summary: 止）
 *
 * Run:
 *   node scripts/test-roundtable-parsing-invest-2026.js
 */

const assert = require('assert')
const {
  parseIntroduction,
  parseChat,
  parseSummary,
  parseByType
} = require('../utils/parse-roundtable.js')

const TOPIC = '2026年在中国今天投资合理的年化收益应该是多少'

function strictJson(obj) {
  return JSON.stringify(obj)
}

function assertStringNonEmpty(v, label) {
  assert.strictEqual(typeof v, 'string', `${label} must be string`)
  assert.ok(v.trim().length > 0, `${label} must be non-empty`)
}

function assertArrayMin(arr, n, label) {
  assert.ok(Array.isArray(arr), `${label} must be array`)
  assert.ok(arr.length >= n, `${label} length must be >= ${n}`)
}

function assertAsciiFramework(framework) {
  assertStringNonEmpty(framework, 'synthesis.framework')
  assert.ok(framework.includes('\n'), 'synthesis.framework should contain \\n')
  assert.ok(/^[\x09\x0A\x0D\x20-\x7E]+$/.test(framework), 'synthesis.framework should be ASCII-printable')
}

function unique(arr) {
  return Array.from(new Set(arr))
}

// --- Fixtures (simulate LLM strict JSON output) ---

const invitationRaw = strictJson({
  type: 'invitation',
  version: 1,
  topic: TOPIC,
  moderatorParagraphs: [
    '我们讨论的不是“追涨杀跌”能不能赚到钱，而是站在2026年中国的宏观与资产定价环境中，长期、理性投资者应当对“合理的年化收益”抱有什么样的预期。',
    '请三位嘉宾分别从宏观与周期、资产配置与风险预算、行为与长期主义三个角度，给出可执行、可复核的框架：收益目标从哪里来、靠什么实现、要承担怎样的波动与尾部风险。'
  ],
  guests: [
    {
      name: '周循',
      role: '宏观与周期研究者',
      mbti: 'INTJ',
      stance:
        '先谈“合理”：以无风险/政策利率与通胀为锚，再叠加风险溢价；在中国信用周期与政策波动下，名义收益预期应更保守，并强调分层目标与情景分析。'
    },
    {
      name: '林配',
      role: '多资产配置经理',
      mbti: 'ENTP',
      stance:
        '收益必须和风险预算绑定：年化目标不是口号，应该对应最大回撤、波动率、期限与流动性；以“现金流资产+权益风险溢价+纪律再平衡”组合实现中枢收益。'
    },
    {
      name: '顾心',
      role: '行为金融与长期主义倡导者',
      mbti: 'INFP',
      stance:
        '大多数人追求的其实是“相对安全的财富增长”，因此要先剥离幸存者偏差；合理年化往往低于想象，关键在于可坚持的策略、降低犯错频率与避免灾难性亏损。'
    }
  ],
  actionLabel: '进入第一轮圆桌讨论'
})

const round1Raw = strictJson({
  type: 'chat',
  version: 1,
  roundNum: 1,
  roundTitle: '把“合理年化”锚定到可解释的利率与风险溢价',
  moderatorAsk:
    '在2026年的中国语境下，如果一个普通投资者说“我想要一个合理的年化收益目标”，你们会先让他用哪些锚来界定“合理”？能不能给出一个可沟通的区间与前提条件？',
  speeches: [
    {
      speaker: '周循',
      action: '拆锚',
      content:
        '先把名义收益拆成三层：通胀补偿、无风险利率、风险溢价。中国环境里政策利率与信用扩张的波动更大，所以“合理”要配情景：低通胀+低利率时，稳健组合的名义中枢不会很高；若遇到风险事件，短期甚至可能负收益。对多数家庭来说，追求长期年化 4%–8%（名义）更现实：下限接近高质量债/现金流资产的可得回报，上限通常要靠权益风险溢价与择时纪律来争取。',
      tldr: '用“通胀+无风险+风险溢价”拆解；多数人合理名义年化 4%–8%。'
    },
    {
      speaker: '林配',
      action: '绑风险',
      content:
        '我会把“合理年化”绑定到风险预算：你能接受多大波动与回撤？如果最大回撤只能忍 10%，那年化中枢不可能要求 12%。在不加杠杆的前提下，一个以固收打底、权益适度暴露、定期再平衡的组合，长期中枢可能在 5%–7% 名义，坏年份允许 -10% 到 -20% 的区间波动；要更高就必须承担更深回撤或更长锁定期。',
      tldr: '收益目标必须对应回撤/波动；不加杠杆的多资产组合中枢约 5%–7%。'
    },
    {
      speaker: '顾心',
      action: '去幻觉',
      content:
        '我会先让他回看自己的“真实体验”：过去一两次大回撤时是否真的扛得住？很多人把“合理”当作“稳定上涨”，这是错觉。合理年化往往意味着：你可能连续两三年跑不赢身边人的热点，但长期复利更稳。我的建议是：把目标写成“年化 5% 左右、回撤可控、能坚持十年”，并把成功定义为“少犯致命错误”，而不是每年都赚钱。',
      tldr: '合理=可坚持的复利，而非稳定上涨；把目标写成可承受的长期策略。'
    }
  ],
  synthesis: {
    coreConflict: '更高收益需要更高风险与更强纪律，而普通投资者往往高估自己承受回撤的能力。',
    framework:
      'NominalReturn\n' +
      '  = InflationCompensation\n' +
      '  + RiskFreeRate\n' +
      '  + RiskPremium (equity / credit / liquidity)\n' +
      '\n' +
      'TargetReturn <-> RiskBudget (volatility, maxDrawdown, horizon)\n',
    deepQuestion: '如果我们把“回撤承受力”当作第一约束，年化目标应如何随期限与资产结构动态调整？'
  },
  actions: [
    { id: 'continue', label: '可' },
    { id: 'deep_dive', label: '深' },
    { id: 'stop', label: '止' }
  ]
})

const round2Raw = strictJson({
  type: 'chat',
  version: 1,
  roundNum: 2,
  roundTitle: '把区间落到可执行的资产配置与再平衡',
  moderatorAsk:
    '如果我们接受“4%–8% 名义年化”作为多数人的合理区间，那具体用什么样的资产组合与纪律，才能把这个目标变成“可执行、可复核”的计划？同时要如何解释坏年份的负收益？',
  speeches: [
    {
      speaker: '林配',
      action: '给配方',
      content:
        '先做三步：1) 期限分桶：1年内用现金管理，3-5年用高流动固收，5年以上才配置权益；2) 设定风险预算：比如组合波动 8%-12%、最大回撤 15%-25%；3) 用再平衡把风险溢价“收割”：定投+季度/阈值再平衡。一个示例：60%高质量固收/现金流资产 + 30%宽基权益 + 10%黄金/商品或对冲。长期争取 5%-7% 中枢，坏年份承受 -10%~ -20%，用再平衡与现金流覆盖生活支出，避免被迫卖出。',
      tldr: '期限分桶+风险预算+再平衡；示例 60/30/10，长期 5%-7%，坏年允许 -10%~-20%。'
    },
    {
      speaker: '周循',
      action: '讲情景',
      content:
        '要把“坏年份”纳入计划：宏观冲击时权益风险溢价扩张，短期收益可能为负，但长期预期回报反而上升。建议用“基准/乐观/悲观”三情景披露：基准年化 5%-7%，悲观阶段可能连续两年 -10% 左右，乐观阶段可能 8%+。同时强调：区间不是承诺，是在特定风险暴露与纪律下的统计结果。',
      tldr: '用三情景解释波动：基准 5%-7%，悲观可能连跌两年，乐观可 8%+。'
    },
    {
      speaker: '顾心',
      action: '护心理',
      content:
        '可执行的关键不是配方，而是“在痛苦时还能照做”。建议把策略写成两条不可动摇的原则：不借钱加杠杆、不在恐慌中清仓；并提前为坏年份设计“心理止损机制”：比如回撤达到阈值就暂停主动交易、只执行定投与再平衡。这样你才能真正把 5% 左右的复利吃到。',
      tldr: '把纪律写成不可动摇的规则；用机制保护自己在坏年份仍能执行。'
    }
  ],
  synthesis: {
    coreConflict: '组合收益来自长期风险溢价，但短期波动会逼迫人放弃；因此必须用资产分桶与规则化再平衡对抗情绪。',
    framework:
      'Plan\n' +
      '  1) Bucket by horizon (<=1y, 3-5y, 5y+)\n' +
      '  2) Set risk budget (vol, MDD)\n' +
      '  3) Allocate (bonds/cashflow + equity + diversifier)\n' +
      '  4) Rebalance (time-based or threshold)\n' +
      '  5) Review annually (not daily)\n',
    deepQuestion: '在中国资产定价与政策切换更快的环境里，哪些“再平衡触发规则”最能减少追涨杀跌？'
  },
  actions: [
    { id: 'continue', label: '可' },
    { id: 'deep_dive', label: '深' },
    { id: 'stop', label: '止' }
  ]
})

const round3Raw = strictJson({
  type: 'chat',
  version: 1,
  roundNum: 3,
  roundTitle: '把“合理”写成个人可坚持的投资契约',
  moderatorAsk:
    '请把结论进一步“生活化”：一个有稳定收入、没有专业训练的普通人，如何把“合理年化”写成自己的投资契约（目标、期限、风险、执行规则、复盘频率）？给一份模板。',
  speeches: [
    {
      speaker: '顾心',
      action: '写模板',
      content:
        '模板可以很短：目标：长期名义年化 5% 左右；期限：10 年；风险：最大回撤 20% 可接受；规则：每月定投、每季度再平衡一次、任何时候不加杠杆；复盘：每年一次看是否偏离资产比例与现金流计划。把“达成”定义为：十年内不发生灾难性亏损，并按规则完成 90% 以上的执行次数。',
      tldr: '把目标写成可坚持的契约：年化5%、10年、回撤20%、定投+再平衡、年复盘。'
    },
    {
      speaker: '林配',
      action: '补约束',
      content:
        '我会把“收入与支出”写进契约：先预留 6-12 个月应急金；再确定可投资现金流；最后才谈年化目标。并明确：如果未来两年有大额支出（买房/教育），那部分资金就不应该追求 8% 年化。契约里最重要的是“钱的期限与用途”，它决定你能承担的波动。',
      tldr: '先写应急金与现金流，再谈年化；大额支出资金不该追高收益。'
    },
    {
      speaker: '周循',
      action: '给口径',
      content:
        '对外沟通时我会用一句话：在2026年的中国，普通人不加杠杆、以多资产分散并严格执行再平衡，合理的长期名义年化大致在 4%–8%，其中 5%–7% 更常见；任何承诺“稳定 10%+”都需要你额外承担杠杆、集中或流动性风险。',
      tldr: '口径：不加杠杆的长期名义年化 4%–8%，5%–7%更常见；稳定10%+意味着额外风险。'
    }
  ],
  synthesis: {
    coreConflict: '“合理收益”是与人生现金流与风险承受力匹配的契约，而不是市场给的保证。',
    framework:
      'InvestmentContract\n' +
      '  Goal: 5% nominal (range 4-8)\n' +
      '  Horizon: 10y\n' +
      '  Risk: MDD <= 20%\n' +
      '  Rules: monthly invest + quarterly rebalance + no leverage\n' +
      '  Review: yearly\n',
    deepQuestion: '当宏观环境改变（利率/通胀/政策）时，你应当调整的是“目标收益”还是“风险暴露”？'
  },
  actions: [
    { id: 'continue', label: '可' },
    { id: 'deep_dive', label: '深' },
    { id: 'stop', label: '止' }
  ]
})

const summaryRaw = strictJson({
  type: 'summary',
  version: 1,
  moderatorClosing:
    '今天我们把“合理年化收益”从一句愿望，拆成了可解释的锚（通胀/无风险/风险溢价）、可执行的计划（期限分桶/风险预算/再平衡）与可坚持的契约（现金流优先/不加杠杆/低频复盘）。合理不是“每年都赢”，而是在坏年份也能活下来，并持续把风险溢价变成复利。',
  knowledgeNetwork: {
    leap: [
      {
        title: '从收益口号到风险预算',
        desc: '收益目标必须对应波动与最大回撤；否则会在压力时刻被迫放弃策略。'
      },
      {
        title: '从择时幻想到纪律复利',
        desc: '靠定投与再平衡获取长期风险溢价，接受短期亏损以换取长期统计优势。'
      }
    ],
    pillars: [
      { label: '锚定', desc: '用通胀、无风险利率与风险溢价解释收益来源，形成可沟通区间。' },
      { label: '分桶', desc: '按资金用途与期限分层配置，短期资金不追高收益。' },
      { label: '纪律', desc: '定投、再平衡、低频复盘三件事比“预测市场”更重要。' }
    ],
    risks: [
      { title: '杠杆与集中', desc: '为了追求 10%+ 的“稳定”，往往引入杠杆/集中/流动性风险，尾部损失会摧毁复利。' },
      { title: '行为失控', desc: '在回撤阶段恐慌清仓或追热点加仓，使策略失效并锁定亏损。' }
    ]
  },
  ultimateConclusion:
    '在2026年的中国语境下，对多数不加杠杆的普通投资者而言，“合理”的长期名义年化预期大致在 4%–8%（其中 5%–7%更常见），前提是把收益目标与风险预算绑定，并用分桶与再平衡在坏年份也能持续执行；任何“稳定 10%+”都需要你承担额外且常被低估的风险。',
  actions: [{ id: 'restart', label: '重新推演' }]
})

function run() {
  // 1) Invitation
  const intro = parseIntroduction(invitationRaw)
  assert.strictEqual(intro.topic, TOPIC)
  assertArrayMin(intro.moderatorParagraphs, 2, 'moderatorParagraphs')
  assert.strictEqual(intro.guests.length, 3, 'guests length must be 3')
  const guestNames = intro.guests.map(g => g.name)
  assert.strictEqual(unique(guestNames).length, 3, 'guest names must be unique')
  assert.strictEqual(intro.actionLabel, '进入第一轮圆桌讨论')

  const introAuto = parseByType(invitationRaw)
  assert.strictEqual(introAuto.type, 'invitation')
  assert.strictEqual(introAuto.data.topic, TOPIC)

  // Negative: reject fenced/prefixed JSON
  assert.throws(
    () => parseIntroduction('```json\n' + invitationRaw + '\n```'),
    /JSON 解析失败/,
    'parser should reject code-fenced JSON'
  )
  assert.throws(
    () => parseChat('好的，下面是结果：\n' + round1Raw),
    /JSON 解析失败/,
    'parser should reject prefixed JSON'
  )

  // 2) Round 1
  const r1 = parseChat(round1Raw)
  assert.strictEqual(r1.roundNum, 1)
  assertStringNonEmpty(r1.roundTitle, 'roundTitle')
  assertStringNonEmpty(r1.moderatorAsk, 'moderatorAsk')
  assertArrayMin(r1.speeches, 3, 'speeches')
  assertAsciiFramework(r1.synthesis.framework)
  r1.speeches.forEach(s => assert.ok(guestNames.includes(s.speaker), `round1 speaker must be guest: ${s.speaker}`))

  // 3) Round 2
  const r2 = parseChat(round2Raw)
  assert.strictEqual(r2.roundNum, 2)
  assertArrayMin(r2.speeches, 3, 'speeches')
  assertAsciiFramework(r2.synthesis.framework)
  r2.speeches.forEach(s => assert.ok(guestNames.includes(s.speaker), `round2 speaker must be guest: ${s.speaker}`))

  // 4) Round 3
  const r3 = parseChat(round3Raw)
  assert.strictEqual(r3.roundNum, 3)
  assertArrayMin(r3.speeches, 3, 'speeches')
  assertAsciiFramework(r3.synthesis.framework)
  r3.speeches.forEach(s => assert.ok(guestNames.includes(s.speaker), `round3 speaker must be guest: ${s.speaker}`))

  // 5) Summary
  const sum = parseSummary(summaryRaw)
  assertStringNonEmpty(sum.moderatorClosing, 'moderatorClosing')
  assert.ok(sum.knowledgeNetwork, 'knowledgeNetwork must exist')
  assert.ok(sum.knowledgeNetwork.leap.length === 2, 'knowledgeNetwork.leap must be exactly 2 items')
  assertArrayMin(sum.knowledgeNetwork.pillars, 3, 'knowledgeNetwork.pillars')
  assertArrayMin(sum.knowledgeNetwork.risks, 2, 'knowledgeNetwork.risks')
  assertStringNonEmpty(sum.ultimateConclusion, 'ultimateConclusion')
  const uc = sum.ultimateConclusion
  const hasRange =
    uc.includes('4%–8%') ||
    uc.includes('4%-8%') ||
    uc.includes('4%~8%') ||
    uc.includes('4%～8%') ||
    uc.includes('4%—8%')
  assert.ok(hasRange, 'ultimateConclusion should include 4%–8% range')

  const sumAuto = parseByType(summaryRaw)
  assert.strictEqual(sumAuto.type, 'summary')

  console.log('[PASS] test-roundtable-parsing-invest-2026: fixtures parse & validate successfully')
}

try {
  run()
} catch (e) {
  console.error('[FAIL] test-roundtable-parsing-invest-2026:', e && e.message ? e.message : e)
  process.exitCode = 1
}

