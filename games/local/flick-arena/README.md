# 弹指擂台

竖屏单指物理对决：蓝方玩家与红、橙两位系统对手依次行动。按住蓝色圆盘向后拉动，松手沿箭头方向弹出；先接近、找角度，再多次把对手逼向边缘。整个圆盘越过当前擂台边缘才淘汰，所有运动停止后交接。最后一人获胜，最后两人同时出界为平局。

满力无碰撞滑行约 119 逻辑像素，约为初始擂台直径的 38%；开局目标位于射程之外，需要先走位。前五个完整回合保留完整擂台，之后提前预告下一条边界，并在回合交接时连续收圈，避免一直退回中央拖成死局。每局时长取决于思考和打法，不强制最少命中次数或无敌回合。

## 运行与接入

```sh
pnpm --filter @coffeeeeffoc/flick-arena dev     # http://localhost:4426
pnpm --filter @coffeeeeffoc/flick-arena build
pnpm --filter @coffeeeeffoc/flick-arena preview
pnpm --filter @coffeeeeffoc/flick-arena test
pnpm --filter @coffeeeeffoc/flick-arena test:browser
node games/local/flick-arena/scripts/pacing-check.mjs
```

Shell 访问 `#/games/flick-arena`；独立制品为 `/games/flick-arena/index.html`。已经登记到 `apps/shell-web/src/standalone-games.json`、Shell workspace 依赖及公共浏览器入口/玩法检查。复用统一的开发模式和 H5 全屏能力；开发模式中的对局不写入普通战绩。

微信开发者工具预览：先构建共享依赖，再生成原生小游戏包。

```sh
pnpm exec turbo run build --filter=@coffeeeeffoc/game-host --filter=@coffeeeeffoc/ad-runtime
pnpm --filter @coffeeeeffoc/shell-minigame build:game --platform wechat --game flick-arena --preview
node scripts/native-game-smoke.mjs --standalone --game flick-arena --platform wechat
```

在微信开发者工具中导入 `apps/shell-minigame/dist/wechat/flick-arena/`，工程类型是小游戏。预览配置使用 `touristappid`；发布时移除 `--preview` 并传入自己的 `--app-id wx...`。本次没有真实 AppID，也没有执行上传或发布。

通过现有 `CanvasGameTarget` / `GameDefinition` / Game Host 契约及 `startWechatGame` 接入，无 DOM 或 WebView 依赖。平台注册复用 shell-minigame 的微信、抖音、B 站、快手构建适配器；其他渠道需要各自 AppID 和真机验收。平台 SDK 只在宿主层使用，不进入物理规则。

## 内容和交互

- 主菜单 → 随机匹配或练习摆位 → 对局 → 结算 → 再战、回放或回主页。匹配明确标注两位系统对手，不冒充真人在线匹配。
- 五组摆位独立配置，全部开放：初入江湖、三足鼎立、借力打力、临渊一弹、左右逢源。稳定 ID 保留，起始圆盘错开并留出接近空间；没有关卡解锁或数值养成。
- 瞄准虚线与停点显示真实的无碰撞射程，不承诺碰撞后的落点。圆盘缩小以提高角度要求，拖拽起手仍保留 32 逻辑像素半径热区。拉回圆盘、触点取消、失焦均不会误发射；多点触摸只接受最先按下的触点。
- 当前擂台边界与下一次收圈预告可见；收圈时停止输入，暂停及前后台切换冻结收圈。局内和结算分别显示玩家实际出手次数与全场动作数。
- 淘汰后自动观战；暂停、前后台切换冻结对局，返回后需主动继续。音效可在暂停页开关；不能播放时不阻断游戏。
- 结算保存切磋局数和胜场，最后一弹保存实际轨迹供回放；回放不重复结算。Web 使用本地存储，原生使用已有 Game Host StoragePort；损坏/禁用存储降级为临时游玩。
- 原创 Canvas 小侠、木纹和程序合成短音效，不依赖线上图像、字体、服务端或第三方人物素材。概念图仅用作设计参考，不作为运行资源。

## 实现边界

`src/core.mjs` 是无平台依赖的固定 120 Hz 物理、回合与收圈规则：统一质量、半径、摩擦力、最大速度和恢复系数；对手比较接近、推位、退回和终结落点，选招后再施加种子化的瞄准误差。采用小步长防止高速穿透，所有人共用同一物理参数。无碰撞射程使用相同离散步长计算。`src/layouts.mjs` 管理稳定 ID 和起始坐标，校验重复 ID、坐标有效性、安全区域和接近距离。内容 envelope schemaVersion=1，战绩 version=1；未知版本降级到初始战绩。

`src/game.mjs` 管理输入、回合、人机等待、生命周期、结算和回放。`src/render.mjs` 只绘制。`src/web.mjs` 提供 Pointer Events、可访问 DOM 按钮、存储、音频、ResizeObserver；`src/native.mjs` 挂载现有原生 Host。增加摆位只修改配置，增加渠道只接宿主能力。

首版未实现真人联机、好友房间、广告、皮肤商城或障碍。广告/外观材料是后续范围，不改变撞击力量。

## 验证

首版记录见 [设计与验收记录](docs/design/README.md)，本次改造见 [多回合设计与验证](docs/design/multi-round-2026-10-09/README.md)。规则验证覆盖短射程、安全开局、中央推位/边缘终结、三方碰撞、动态出界临界值、平局、提前预告与连续收圈、行动者跳过、暂停、存档降级及回放幂等；节奏脚本记录玩家出手、全场动作和回合分布，另检查持续退回中央的策略。浏览器验证使用真实触屏拖拽，并区分独立入口和 Shell iframe。

本次环境未进行微信开发者工具及 iOS/Android 微信真机验证，不能将 Chromium 手机模拟视为真机。整合 dev 时已初始化锁定素材子模块，使用仓库规定的 Node 24.21.0 / pnpm 12.6.0 通过准确候选版本的增量构建、Shell 浏览器入口和原生 SDK 模拟校验；没有执行无关游戏的全量浏览器回归。
