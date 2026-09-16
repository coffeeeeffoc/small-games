# 微信与B站单款小游戏 Implementation Plan

**Goal:** 复用现有Game Host与Canvas入口，先验证秋声斗蟋，再生成四款游戏的微信/B站独立制品。

**Architecture:** 将B站已有输入、媒体、存档和广告实现抽取为平台无关的native-game-shell；平台适配器负责SDK、审核能力和启动配置。单款构建只打包选择的游戏及素材，保留已有Web与B站大厅入口。

**Tech Stack:** TypeScript、现有Vite、pnpm workspace、Vitest、Node assert/VM。

---

### Task 1: 共享原生运行层

- Create: `packages/native-game-shell/{package.json,tsconfig.json,tsconfig.build.json,eslint.config.js,src/*}`。
- Modify: `apps/shell-bilibili/src/{shell,host,media,ads,sdk}.ts`，保留公开函数及B站分包装载检查，用共享实现运行。
- Check: `pnpm --filter @coffeeeeffoc/shell-bilibili test`，原有输入/存档/广告/生命周期回归应继续通过。

### Task 2: 两个平台的独立发行

- Create: `apps/shell-minigame`，包含平台适配器、四款游戏清单、单款构建脚本与发行配置示例。
- Build: 默认微信/B站秋声斗蟋，允许选择另外三款；配置验证拒绝未知游戏、平台、无效AppID及越界输出。
- B站: 实现启动上报、侧边栏/桌面入口和每日幂等奖励，同步监听启动参数。
- Check: 输出实际CommonJS、game.json、project.config.json与单款资源，不包含其他游戏或DOM。

### Task 3: 秋声斗蟋玩法与原生能力

- Modify: `games/local/game-cricket/src/canvas/{definition,surface}.ts`，原生声音使用Canvas目标createSound，保留浏览器音频入口；保存关卡/成绩，增加明确的可选激励奖励并校验完成结果。
- Create: `games/local/game-cricket/public/cricket-audio`，生成小型本地音效。
- Check: 原生斗蟋开始/攻击/失败/重试/存档恢复、广告完整/提前关/失败、暂停/取消与音频停止。

### Task 4: 八个制品验证与文档

- Create: 独立制品VM回归，在没有DOM/浏览器传输的环境运行微信/B站×四款实际构建文件。
- Check: 首先斗蟋两平台，再另外六个制品；包边界、类型、lint、配置检查和相关Web/既有B站回归。
- Update: 平台架构、构建命令、配置与官方工具导入步骤；说明账号AppID/广告位、官方真机与审核尚需实际账号验证。

用户已授权直接实施，沿当前工作区完成；已有调研文档保留。无需新增依赖框架、未知平台空实现、内购或账号后台；不自动提交或上传。
