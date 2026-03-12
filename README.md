# coveThink（澄思）

澄澈思绪，让认知有序、让思考顺滑。

针对 LLM 结构化输出（圆桌会议、深度分析等）的阅读态 UI 优化与轻量交互工具 — 微信小程序。

## 本地运行

1. 用 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) 打开本项目。
2. **配置 AppID**（仅本地，不提交）：
   - 若尚无 `project.private.config.json`：复制 `project.private.config.example.json` 为 `project.private.config.json`，并把其中的 `YOUR_WECHAT_APPID` 换成你的小程序 App ID（在 [微信公众平台](https://mp.weixin.qq.com/) 申请）
   - 若开发者工具已自动生成该文件：在 `project.private.config.json` 中增加或修改 `"appid": "你的AppID"`
   - 该文件已加入 `.gitignore`，不会提交到仓库
3. 编译并预览。

> 说明：微信开发者工具会优先使用 `project.private.config.json` 里的配置（如 appid），覆盖 `project.config.json` 中的同名字段，因此公共配置与本地密钥可以分离。

## 项目说明

详见 [AGENTS.md](./AGENTS.md) 了解产品定位与开发约束。
