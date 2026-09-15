# 合成守夜人实施计划

目标：在 `games/local/night-merge` 交付可独立运行、可由 Shell 加载的中文触屏 H5 游戏。Canvas 2D 绘制战场，原生 DOM 负责可键盘操作的 12 格棋盘和 4 个驻防位，TypeScript 纯规则模块负责战斗。

1. `src/game.ts`、`tests/game.test.ts`：召唤、合成、交换、驻防、出售、十波自动战斗、两名 Boss、Boss 前祝福、一次免费复活和规则回归。
2. `src/art.ts`：四类守卫的三级矢量形象、六类敌人、Boss、夜林城墙和攻击特效。
3. `src/main.ts`、`src/style.css`：拖放和点击两套输入、金币/血量/波次、夜钟技能、暂停、战报、持久天赋、本地遥测；页面失焦和指针取消必须终止拖拽并停止时钟。
4. 接入 Shell 现有静态游戏目录、构建依赖和冒烟检查。保留工作区原有修改。
5. 执行 `pnpm --filter @small-games/night-merge test`、`build`、`test:browser` 和仓库依赖边界检查；真实浏览器覆盖桌面、窄屏、横屏、触摸、失败重开和十波通关。

采用已有 Vite/TypeScript，不引入引擎或运行时依赖。初版使用本地战报和一次免费复活；广告、支付和跨用户留存分析待真实渠道接入后实现，不伪装广告成功。
