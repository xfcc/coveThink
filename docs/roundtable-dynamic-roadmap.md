# 圆桌讨论：从静态到动态 — 实现路线图

本文档用于 step-by-step 开发时对照。每一步实现前，需你提供该步骤对应的 **LLM 返回的 Markdown 结构说明**，再基于该结构实现解析与页面绑定。

---

## 阶段 0：基础设施（优先完成）

| 序号 | 待办 | 说明 | 依赖 |
|------|------|------|------|
| 0.1 | **API 层** | 封装 Gemini / DeepSeek 请求（可配置 model、apiKey），支持流式或非流式、错误与重试 | - |
| 0.2 | **会话状态** | 设计并存储「当前会话」所需状态（如 sessionId、topic、已产生的 introduction/rounds 等），便于多轮请求与页面回显 | 0.1 |
| 0.3 | **Markdown 解析工具** | 通用解析函数：输入 LLM 返回的 markdown 文本，按约定结构输出 JS 对象（为 introduction / chat / summary 各步骤复用） | - |

**0.3 已完成**：`utils/parse-roundtable.js` 提供 `parseIntroduction`、`parseChat`、`parseSummary`、`parseByType`。结构约定以 `examples/[TYPE] 邀请嘉宾.md`、`[TYPE] 圆桌讨论.md`、`[TYPE] 话题总结.md` 为准。introduction / chat / summary 三页已接入：支持通过 `app.globalData.roundtableIntroduction` / `roundtableChat` / `roundtableSummary` 注入解析结果，或在本页调用 `applyMarkdown(markdownText)` 注入。

---

## 阶段 1：输入与进入「邀请嘉宾」（已完成）

| 序号 | 待办 | 说明 | 需要你提供 |
|------|------|------|------------|
| 1.1 | **话题可编辑** | 将 input 页「你想探讨的话题」从固定文案改为可输入（input/textarea），提交时校验非空 | - |
| 1.2 | **深入探讨 → 请求 + 跳转** | 点击「深入探讨」后：① 立即跳转 introduction 并传入 topic；② introduction 页 onLoad 内发起 LLM 请求（user 消息见 `buildInvitationPrompt`） | - |
| 1.3 | **邀请嘉宾 Loading** | introduction 页支持「加载态」：显示「正在邀请嘉宾中…」，无嘉宾列表、无主持文案 | - |
| 1.4 | **解析邀请嘉宾返回** | 根据 LLM 返回的 markdown 结构，解析出：topic、moderatorParagraphs、guests（name/role/mbti/mbtiClass/stance） | 已按 examples 约定实现 |
| 1.5 | **渲染 introduction 页** | 解析完成后关闭 loading，用解析结果渲染主持开场 + 嘉宾卡片，按钮为「进入第一轮圆桌讨论」 | - |

---

## 阶段 2：进入「圆桌讨论」与首轮（已完成）

| 序号 | 待办 | 说明 | 需要你提供 |
|------|------|------|------------|
| 2.1 | **进入第一轮圆桌** | 点击「进入第一轮圆桌讨论」后直接跳转 chat 页，并传入 topic；chat 页 onLoad 中以指令「可」+ 议题构造 user 消息（`buildRoundPrompt('可', topic)`），调用 `callLLM` 请求首轮圆桌 markdown | - |
| 2.2 | **圆桌讨论 Loading** | chat 页已支持「讨论中」加载态：`loading=true` 时显示「嘉宾正在讨论中…」与简易旋转动画，隐藏发言与框架 | - |
| 2.3 | **解析圆桌讨论返回** | 使用 `utils/parse-roundtable.js` 中的 `parseChat` 解析 LLM 返回的 `[TYPE] 圆桌讨论` markdown，得到 `roundTitle`、`moderatorAsk`、`speeches`、`synthesis` 等字段 | 已按 examples 约定实现 |
| 2.4 | **渲染 chat 页（单轮）** | 解析完成后关闭 loading，用解析结果渲染主持引导、发言列表、综述与 ASCII 框架（支持点击放大）、底部「可 / 深 / 止」三按钮（当前仅「止」生效） | - |

---

## 阶段 3：圆桌多轮（可 / 深）（已完成首轮实现）

| 序号 | 待办 | 说明 | 需要你提供 |
|------|------|------|------------|
| 3.1 | **可 / 深 点击逻辑** | 点击「可」或「深」：在 chat 页通过 `fetchRound(command)` 调用 `callLLM`，其中 command 为「可」或「深」，并附带当前议题与轮次（`buildRoundPrompt(command, topic, roundIndex)`），同一 chat 页进入 loading（「嘉宾正在讨论中…」） | - |
| 3.2 | **追加轮次** | LLM 返回后使用 `parseChat` 解析为「新的一轮」结构，并以 `rounds` 数组形式在现有 chat 页内追加：每轮包含 roundTitle、moderatorAsk、speeches、synthesis；最新一轮同步到顶部的 `synthesis` 以驱动 ASCII 框架放大视图 | - |
| 3.3 | **轮次展示** | 多轮时 UI 依次展示各轮内容：每轮都有自己的 round-badge、主持引导、发言列表与综述模块，底部仍为 可/深/止（当前点击只追加新轮，不做折叠） | - |

---

## 阶段 4：「止」→ 话题总结（已完成）

| 序号 | 待办 | 说明 | 需要你提供 |
|------|------|------|------------|
| 4.1 | **止 → 请求 + 跳转** | 点击「止」时仍立即跳转 summary 页；summary 页 `onLoad` 内以指令「止」+ 议题构造 user 消息（`buildSummaryPrompt('止', topic)`），调用 `callLLM` 请求 `[TYPE] 话题总结` 的 markdown，并显示「主持人正在总结中…」 loading | - |
| 4.2 | **解析总结返回** | 使用 `parseSummary` 解析 LLM 返回的 markdown，得到 `moderatorClosing`、`knowledgeNetwork`（leap/pillars/risks）、`ultimateConclusion` 等字段，并写回页面 data | 已按 examples 约定实现 |
| 4.3 | **渲染 summary 页** | 解析完成后关闭 loading，用解析结果渲染知识网络、三大支柱、风险、终极结论与底部按钮；当前会话结束，「导出知识图谱」仍预留为后续能力 | - |

---

## 阶段 5：收尾与体验（5.1 / 5.2 已落实，5.3 待后续迭代）

| 序号 | 待办 | 说明 |
|------|------|------|
| 5.1 | **错误与重试** | 所有 LLM 调用（邀请嘉宾 / 圆桌讨论 / 话题总结）均已在失败时关闭 loading 并通过 toast 显示具体错误信息；chat 页在 loading 中再次点击「可 / 深」会提示「当前轮讨论尚未完成」，避免重复请求 | - |
| 5.2 | **API Key 与环境** | apiKey（Gemini/DeepSeek）依然通过 gitignored 的 `config/llm-keys.js` 配置，新环境需从 `config/llm-keys.example.js` 拷贝并填写；文档中已强调微信合法域名与密钥不入仓库 | - |
| 5.3 | **可选：流式输出** | 若后续接入流式能力，可在现有 loading 基础上，增加「主持/嘉宾正在输入…」的逐步渲染体验（当前暂不实现） | - |

---

## 与你协作的节奏

- **每一步**：你先提供该步的 **「LLM 返回的 Markdown 结构说明」**（示例 + 字段含义）。
- **我**：基于该结构实现 **解析函数** + **页面 data 绑定**，保持现有静态 UI 样式不变，仅数据源改为解析结果。

建议从 **阶段 0 + 阶段 1** 开始（话题可编辑 → 深入探讨 → 邀请嘉宾 loading → 你提供 introduction 的 markdown 结构 → 解析与渲染）。你准备好 0、1 的 API 约定和 introduction 的 Markdown 结构后，我们就可以从 1.1 开始 step by step 实现。
