# 来电之间首章 Implementation Plan

**Goal:** 实现可在手机浏览器完整游玩的“搬家第一天”，包括三项真实事务、两条诈骗分支和行为复盘。

**Architecture:** 原生 HTML/CSS/JavaScript 模块，单一共享状态驱动手机页面与剧情。状态变更统一校验并生成日志及消息；音频独立管理，存档保存在浏览器。无需后端或运行时依赖。

**Tech Stack:** 浏览器 DOM、Web Audio / 配音文件、localStorage、Node.js 静态服务器与构建脚本、Playwright 浏览器回归。

1. 建立 `index.html`、`package.json`、`scripts/serve.mjs`、`scripts/build.mjs`，确认静态资源可运行和构建。
2. 编写 `src/game.js`：角色数据、消息、来电队列、任务、支付、核验、暂停与存档。以 `tests/game.test.mjs` 检查安全通关、两种受骗路径、支付幂等和条件校验。
3. 编写 `src/app.js` 与 `src/style.css`：开场、桌面、通知、电话、聊天、订单、预约、缴费、浏览器、钱包、备忘录和复盘。保持跨应用输入与滚动，支持窄屏及键盘。
4. 编写 `src/audio.js` 与 `public/audio/`：铃声、消息反馈、可中断的语音及静音，字幕始终可用。真实设备不支持的能力使用明确降级。
5. 运行 `npm test`、`npm run build` 和浏览器脚本，从界面完成安全路径与两种受骗路径；检查截图、窄屏溢出、刷新存档、后台暂停、通知恢复及控制台错误。
6. 修复验证发现的问题，更新 README 和设计状态，交付本地可访问地址。Safari、微信和实机触感未实际验证时明确记录。

用户已授权直接实施，以上步骤在当前任务内完成，不另设审批或创建新任务。
