# 弹指擂台

竖屏单指弹射原型：蓝方玩家与红、橙两位系统对手依次行动。按住蓝色圆盘向后拉动，松手沿箭头方向弹出；整个圆盘越过圆形擂台边缘才淘汰，所有运动停止后结算胜负。最后一人获胜，最后两人同时出界为平局。

## 运行与接入

```sh
pnpm --filter @coffeeeeffoc/flick-arena dev     # http://localhost:4426
pnpm --filter @coffeeeeffoc/flick-arena build
pnpm --filter @coffeeeeffoc/flick-arena preview
pnpm --filter @coffeeeeffoc/flick-arena test
pnpm --filter @coffeeeeffoc/flick-arena test:browser
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
- 五组摆位独立配置，全部开放：初入江湖、三足鼎立、一箭双雕、临渊一弹、左右逢源。此原型没有关卡解锁或数值养成。
- 预测线只指示方向，不承诺碰撞落点。拉回圆盘、触点取消、失焦均不会误发射；多点触摸只接受最先按下的触点。
- 淘汰后自动观战；暂停、前后台切换冻结对局，返回后需主动继续。音效可在暂停页开关；不能播放时不阻断游戏。
- 结算保存切磋局数和胜场，最后一弹保存实际轨迹供回放；回放不重复结算。Web 使用本地存储，原生使用已有 Game Host StoragePort；损坏/禁用存储降级为临时游玩。
- 原创 Canvas 小侠、木纹和程序合成短音效，不依赖线上图像、字体、服务端或第三方人物素材。概念图仅用作设计参考，不作为运行资源。

## 实现边界

`src/core.mjs` 是无平台依赖的固定 120 Hz 物理和回合规则：统一质量、半径、摩擦力、最大速度和恢复系数；对手有瞄准误差，也可能选择较轻的推击。采用小步长防止高速穿透，所有人共用同一物理参数。`src/layouts.mjs` 管理稳定 ID 和起始坐标，校验重复 ID、坐标有效性、安全区域和重叠。内容 envelope schemaVersion=1，战绩 version=1；未知版本降级到初始战绩。

`src/game.mjs` 管理输入、回合、人机等待、生命周期、结算和回放。`src/render.mjs` 只绘制。`src/web.mjs` 提供 Pointer Events、可访问 DOM 按钮、存储、音频、ResizeObserver；`src/native.mjs` 挂载现有原生 Host。增加摆位只修改配置，增加渠道只接宿主能力。

首版未实现真人联机、好友房间、广告、皮肤商城或障碍。广告/外观材料是后续范围，不改变撞击力量。

## 验证

详见 [设计与验收记录](docs/design/README.md)。测试包括 300 场确定性人机模拟、真正的触屏拖拽、三方碰撞/一弹双飞、出界临界值、平局、暂停、存档降级、回放幂等、Shell iframe 和微信 SDK 模拟。

本次环境未进行微信开发者工具及 iOS/Android 微信真机验证，不能将 Chromium 手机模拟视为真机。整合 dev 时已初始化锁定素材子模块，使用仓库规定的 Node 24.21.0 / pnpm 12.6.0 通过准确候选版本的增量构建、Shell 浏览器入口和原生 SDK 模拟校验；没有执行无关游戏的全量浏览器回归。
