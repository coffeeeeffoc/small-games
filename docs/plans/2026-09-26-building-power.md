> 更新：当前实现已按用户反馈改为《忙碌的电工》邻里救急版；使用真实量级W/kW、四户并发生活用电、2.7kWp屋顶与随机天气。以下保留最初方案供追溯，当前规则以 games/local/game-building-power/README.md 为准。

# 《全楼只有100度电》Implementation Plan

**Goal:** 实现可独立游玩、接入 Shell 的楼宇供电调度游戏，复用原生 Canvas 构建链。

**Architecture:** 规则使用 50ms 固定步长，Canvas 绘制与输入预览不修改模拟。Web 和原生共用规则、画面、存档与 Game Host，渠道负责 SDK。

**Tech Stack:** TypeScript、Canvas 2D、Vite、Vitest、现有 Game Host。

## 实施与检查

1. `games/local/game-building-power/src/model.ts`、`levels.ts`、`simulation.ts`：设备、20 个确定性关卡、负载与热量、启动、错峰、太阳能、电池、胜负和援助；`simulation.test.ts` 覆盖需求边界及每关可通关策略。
2. `view.ts`：六户楼宇、负载预览、电线/设备动画、关卡选择、暂停与结算；`index.ts`：事务式拖线、点击替代、生命周期、音效、本地最佳与装饰成长。
3. `definition.ts`、`main.ts`：浏览器 Canvas 适配、键盘和读屏入口、全屏；包配置、音效资源和独立页面。
4. Shell 注册、微信/B站构建；新增抖音渠道适配及契约检查，遵守渠道边界 ADR。
5. 执行游戏测试、类型检查、构建、`pnpm check:games`、`pnpm test:game-config`、Shell 回归。浏览器覆盖 320/390/430 宽、拖线取消、后台暂停、结果与重开、存档和全屏。
6. 在游戏 README 记录实际证据。构建/SDK 模拟检查不代表官方开发工具、真机或广告库存验收；未取得的证据明确保留。

## 范围

实现正式关卡内容与正常免费资源，奖励仅接受宿主 completed 结果且单次结算。每日挑战、无尽、全服榜和支付按原方案留待试玩数据验证后开展。未配置广告的渠道不展示可领取奖励承诺。无自动提交/推送。
