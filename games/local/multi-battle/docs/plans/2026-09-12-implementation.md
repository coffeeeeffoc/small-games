# Multi-battle Implementation Plan

**Goal:** 实现单人本地八人自走棋，完整六流派48卡、经营/战斗/存档/结算及手机操作。

**Architecture:** 原生ES模块。共享卡牌与精确整数工具；经营模块只处理合法原子操作，战斗模块输出逐步状态与事件；大厅负责机器人、配对和结算；界面播放同一战斗事件。无需服务端或通用技能脚本系统。

**Tech Stack:** JavaScript、DOM/CSS、SVG、Web Audio、Node原生测试、Playwright浏览器回归。

用户已明确授权本轮实施，直接在现有目录完成，不另行请求执行许可。当前目录没有Git仓库，不擅自初始化远程或发布。

## 任务与验证

1. `src/content.js`、`src/shared.js`：将48张卡文转成稳定定义；统一实例、BigInt属性、随机种子和序列化。检查48个唯一ID、全类型品阶覆盖。
2. `src/economy.js`：购买/出售/刷新/冻结/升级/调位/合并/装备/全部法术及备战监听。`tests/economy.test.js` 检查原子性、成长守恒、事件次数、手牌容量。
3. `src/battle.js`：完整自动普攻、同时反击、护盾/治疗/免死/召唤/开场效果与60行动判定。`tests/battle.test.js` 检查真实连锁及确定性。
4. `src/game.js`、`src/storage.js`：7个合法经营机器人、配对/镜像/全大厅同时结算、恢复存档。`tests/game.test.js` 检查整局、幂等和损坏档拒绝。
5. `index.html`、`src/app.js`、`src/style.css`、`src/art.js`：手机可用的点选经营、牌面详情、双目标转移、动态战斗、音效与图鉴。
6. `scripts/serve.mjs`、`scripts/build.mjs`、`scripts/playtest.mjs`：本地启动与静态产物；浏览器验证购买→部署→施法→战斗→恢复及多尺寸布局。
7. 执行 `npm test`、`npm run build`、`npm run test:browser`。更新README和实际实现状态；列明未实测的物理设备与平衡边界。
