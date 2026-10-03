# 运行边界

```text
React HUD / Pointer Events / Keyboard
                ↓ Input intent
client/runtime.ts — fixed-step accumulator (offline owner)
                ↓ step(state, input), 30 Hz
core/simulation.ts
   combat.ts — attack, enemy movement, projectile impacts
   rewards.ts — focus, thresholds, grants
   geometry.ts — positions, event-derived seeded values
                ↓ serializable state + attack/effect events
client/scene.ts — Three.js, independent rAF and interpolation
client/platform.ts — Web Audio + local practice storage
```

`core` 和 `content` 可直接在 Node 的 TypeScript 类型剥离模式运行。没有 DOM、React、Three、Date.now 或 Math.random。种子与稳定事件 ID 派生坐标，消费奖励随机事件不会移动波次随机流。测试证明当前 Node / Chromium 代码路径可重现，没有宣称所有引擎天然位级一致。

React 约 12 次/秒刷新 HUD，不驱动每颗子弹。场景使用四类几何的 InstancedMesh（盒、低多边形球、柱、锥），每类最多 2200 个视觉部件，重复模型不创建刚体。预警与目标由核心状态定位，普通射击显示攻击事件，榴弹由逻辑投射物给出实际位置。快照只有只读诊断，不提供浏览器快进或改分接口。

单个 Runtime 拥有一个 requestAnimationFrame 链和一个 AbortController。重开替换状态，不重新注册监听；dispose 取消帧、监听、ResizeObserver，关闭 AudioContext，销毁几何 / 材质 / 纹理和 WebGLRenderer。页面隐藏清空输入并暂停离线模拟。

## P2 的下一条实现任务

先阅读父仓库 `docs/adr/0006-node-fastify-data-stack.md` 与 `0013-kart-multiplayer-service.md` 及实际服务，实现此游戏自己的权威会话；默认 Colyseus 与已有服务方案比较后记录决定，不直接复用其他游戏结算规则。

让 Node 服务唯一拥有 `GameState` 与 30Hz 时钟；客户端只发送经过 schema 验证的 `{sequence, moveX, focusIntent, skill}`。目标、伤害、HP、DPS、结算都不接受客户端数值。浏览器 Runtime 需要新增在线状态接收路径，不能在线继续拥有可暂停的本地权威时钟。

随后把当前单支 squad 抽为同一世界中的两支 squad，再实现游客 UID、房间准备/开始、20 秒断线基础防御、一次待救援，以及 `recipient + grantId` 归属。通过两个独立账号 / 浏览器验证后，才进入 PostgreSQL 事务结算、好友关系与榜单。当前仅保留真实可复用的模拟边界，没有虚构网络接口。

P3 数据键：`runId` 唯一；无序 UID 对产生合作队伍键；榜单维度固定地图、难度、规则版本、Asia/Shanghai 挑战周期；每项分数来自服务端事件预算。好友竞速独立赛道使用同配置 / 种子 / 事件脚本，完成 tick 决定竞速顺序。以上均为后续契约，不是本轮已实现结果。

小游戏适配不能复用 React DOM 作为通用 HUD；需要 Canvas 或平台 UI、登录、音频、存储、触摸和分享的独立适配与真机证据。
