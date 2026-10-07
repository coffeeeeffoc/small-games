# 星轨弹珠 · Orbit Breaker

基于用户提供的 `ball-roguelite.zip` 原型实现的弹珠肉鸽游戏。保留七列砖阵、底部向上弹射、加球、爆裂砖，以及分裂、重击、穿透、爆裂、闪电和暴击六种可叠加强化。原始脚本留在 `docs/reference/original-game.js` 供核对，不进入运行制品。

新增六个逐关解锁星域、无尽挑战、完整主页/选关/帮助/暂停/强化/结算流程、触屏瞄准、回收、局内检查点及进度存档。强化每三轮三选一；回收会放弃本轮剩余伤害并推进砖阵。通关必须清空所有波次。砖块进入最底一行仍有一次清理机会，再下降越过警戒区即失败。球数最多99，概率强化有明确上限，避免无限叠加溢出。

主页明确提供**关卡模式**与**无尽模式**。关卡模式逐关解锁六片星域，无尽模式持续生成砖阵并记录最高成绩；两种模式各自保留回合检查点，切换模式不会覆盖另一边的对局。旧版单检查点自动迁移至对应模式，通关进度、纪录和设置保留。

弹珠采用带高光的圆形球体，碰撞按圆球表面计算，擦过砖角会产生斜向折返。120 BPM 双连发、重拍出球、碰撞后最多 28% 的短促提速与回落，以及记录真实拐点的渐隐拖尾，让弹射有清楚的轻重和停顿。音效跟随出球与碰撞事件，不使用后台节拍定时器；暂停、静音和离开会清理声音。系统开启减少动态效果时关闭拖尾、震屏和跳动装饰，保留玩法与圆球辨识。

```sh
pnpm --filter @coffeeeeffoc/ball-roguelite dev
pnpm --filter @coffeeeeffoc/ball-roguelite test
pnpm --filter @coffeeeeffoc/ball-roguelite build
PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium pnpm --filter @coffeeeeffoc/ball-roguelite test:browser
```

开发地址 `http://localhost:4420/`；`node server.mjs --dist` 预览正式输出。Shell ID `ball-roguelite`，独立入口 `/games/ball-roguelite/index.html`，大厅路由 `#/games/ball-roguelite`。运行零外部依赖，仅复制明确列出的文件，效果图、原型、测试均不发布。

`levels.mjs` 持有稳定关卡ID与内容 schema，`core.mjs` 是不依赖 DOM/平台的规则与连续碰撞计算，`render.mjs` 负责绘制和有界反馈，`storage.mjs` 负责存档校验与版本迁移，`main.mjs` 连接 Web 输入、页面和生命周期。

沿用仓库独立 H5 的本地存档边界，不接入 Game Host 云存档。回合开始与强化页保存检查点，离开飞行中对局后回到该轮发射前；存储异常时会话内正常继续。存档格式为 v2，沿用旧存储 key，自动迁移 v0/v1；核心检查点仍为 v1。试玩不写成绩、正常进度或检查点。Web 复用公共 `SmallGamesDev`（`?dev=1/0` 或 `localStorage.dev`）和全屏机制；无广告 SDK 时不提供看广告复活奖励。原型的微信脚手架不直接打包为原生工程，微信、抖音和 B 站 Canvas 运行需另行适配。

初版设计与截图见 `docs/design/`；本次圆球、节拍与双模式改版的设计和实际运行证据见 [`docs/design/rhythm/`](docs/design/rhythm/README.md)，规则和存档验证见 `tests/`。浏览器验证使用 Linux Chromium 手机触屏模拟，未执行手机真机或原生小游戏验收。
