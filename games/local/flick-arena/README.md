# 弹指擂台

竖屏单指物理擂台：按住自己的圆盘向后拉，松手弹出。先接近、找角度、逼边，再把对手击落；整个圆盘越过边缘才淘汰，所有运动停止后交接，最后存活者获胜。同次出手或同次收圈淘汰的玩家并列。

## 玩法

- **120 关江湖**：24 章各五关，从双人控力、三人博弈到石柱反弹、局部冰面、缺口与提前收圈。保留原二十关，增加青锋、逐浪、苍岚、星河、天绝五条进阶路线；出生间距、地形、对手和收圈节奏形成不同攻防。敌我力量与碰撞规则一致。通关解锁下一关，胜利星及两个可选挑战独立累计，最高 360 星；12/30/50 星解锁纯外观与称号。
- **同机双人**：一台设备轮流拖拽，三局两胜，每小局交换先手，平局重赛。每手10秒，暂停冻结本机对局。
- **在线好友**：真实房间码或邀请链接，2/3/4名玩家各用一台设备。双人三局两胜；三人三小局、四人四小局积分赛，人人轮流先手与出生位置。每比一人活得久得1分，唯一幸存者额外1分；总分并列者加赛直到唯一冠军。
- **练习场**：保留全部开放的五组旧摆位和两位明确标注的系统对手。

好友局每手10秒或宽松15秒，超时跳过；第三个完整行动轮结束开始收圈，并提前预告。小局结算最多停留20秒，全员准备可提前继续。淘汰者保留下一局席位；在线暂停或切到后台不会暂停其他玩家，恢复后同步服务端。房间最多持续20分钟，超时结束不虚构冠军。

拖拽越远，力度越大，瞄准虚线随预计滑行距离伸长；拉回时力度和虚线同步缩短，回到取消区即清除预览，松手不出招。力度、预览与实际出手使用同一计算，满力后不再增加。瞄准虚线按同一物理积分计算，包含冰面和石柱，忽略其他圆盘碰撞。触点取消、失焦和尺寸变化不会误发射；第二根手指不能接管。横屏缩放后圆盘仍保留至少 44 CSS px 的有效热区。人机局玩家出局后缩短 AI 思考等待，物理速度与在线计时保持原规则。结算可回放最后一弹，回放不重复结算。

## Cocos 渲染与广告

Web 已使用真实 Cocos Engine 3.8.8 官方源码运行库；`src/cocos-runtime.mjs` 管理场景与引擎帧，`src/cocos-render.mjs` 用 Sprite/Graphics/Mask 呈现既有布局。按钮保留原绘制纹理和透明无障碍热区，全屏入口已移除。引擎源码和二进制摘要由 `scripts/build-cocos-engine.mjs` 离线校验；`--rebuild` 可按固定来源重建。此版本不是 Creator 编辑器导出，原生 Canvas 兼容入口保留。

公共激励广告端口为 `globalThis.SmallGamesRewardAds`，由公共 H5 模块提供。单人练习的可选瞄准提示见下方说明；未配置或不可用时正常游玩和拖拽预览不受影响。

迁移说明、截图和实际验证见 [Cocos 迁移记录](docs/design/cocos-2026-10-23/verification.md)。

当前文案、图标、宣传素材及实际录屏见 [上架资料](publishing/STATUS.md)。

## 运行

```sh
pnpm --filter @coffeeeeffoc/flick-arena dev
pnpm --filter @coffeeeeffoc/flick-arena build
pnpm --filter @coffeeeeffoc/flick-arena test
pnpm --filter @coffeeeeffoc/flick-arena test:browser
```

开发地址为 `http://localhost:4426`。Shell 入口 `#/games/flick-arena`，独立制品 `/games/flick-arena/index.html`。开发模式复用统一的 `dev` 开关，提供 120 关试玩，跳关与战绩不写入普通存档。

在线复用现有 Runtime Service 的 `/api/competition/v1`，及公共 competition 客户端认证。腾讯部署沿用同源 API 注入；独立托管可设置构建环境变量 `COMPETITION_PUBLIC_API_URL`，或由宿主注入 `globalThis.__COMPETITION_CONFIG__.apiUrl`。仅静态托管而没有该 API 时，闯关、练习和同机双人仍可玩，在线入口会明确报告服务不可用。

实际联机浏览器验收需要运行已有 Runtime Service 和 PostgreSQL，然后执行：

```sh
FLICK_COMPETITION_API=http://127.0.0.1:4430/api/competition/v1 node games/local/flick-arena/tests/campaign-browser.mjs
```

不设置此变量时该脚本只验证本地流程，不使用模拟房间替代真人服务。

## 边界与存档

`src/core.mjs` 负责固定120Hz物理、2–4人轮序、收圈、地形及淘汰批次。`src/levels.mjs` 保留二十个原始稳定 ID，组合 `src/routes.mjs` 的独立配置生成 120 关并校验地形、对手、挑战与解锁链；`src/layouts.mjs` 保留旧练习摆位。`src/tournament.mjs` 是同机和服务端共用的纯赛制规则。

`src/progress.mjs` 兼容原 `flick-arena-v1` 存档，保留局数、胜场和声音，增加关卡记录、挑战目标和外观；损坏或不可用存储降级为临时游玩。`src/game.mjs` 组织流程、输入和回放；`src/render.mjs` 绘制；`src/web.mjs` 提供浏览器触控、可访问按钮和输入框。`src/online.mjs` 复用公共认证并序列化房间请求。服务端拒绝越权、过期或非法出手，重复请求不重复计分。

原生 Canvas 入口继续复用 Game Host 的输入、存储和生命周期，提供闯关、练习和同机双人；本次未配置原生在线登录和房间输入，不宣称原生好友联机已接入。未新增2v2入口。

## 验证记录

本次复查与扩展方案、效果图、实际手机截图和报告见 [120 关复查](https://github.com/coffeeeeffoc/small-games/blob/57f0f85a9c69231108b1a2e172cb38993206985b/games/local/flick-arena/docs/design/review-2026-10-11/README.md)。原有记录保留在 [闯关与好友擂台](docs/design/campaign-friends-2026-10-11/README.md)、[首版](docs/design/README.md) 与 [多回合改造](https://github.com/coffeeeeffoc/small-games/blob/57f0f85a9c69231108b1a2e172cb38993206985b/games/local/flick-arena/docs/design/multi-round-2026-10-09/README.md)。

浏览器使用 Chromium 手机模拟和真实触屏事件；在线使用独立身份、实际 HTTP 服务和 PostgreSQL。尚未执行微信开发者工具、iOS/Android 真机或原生渠道联机验收。

## 可选奖励（2026-10-24）

只在单人练习、本人瞄准回合的暂停页，完整观看后给出一次方向/力度建议，继续后用现有物理预览画虚线；不自动出手，首次出手即清除。本局一次；普通拖拽预览免费。主线、好友邀请、同机、在线、目标成绩挑战不提供奖励，不改变权威规则或计分。

通过现有全局 `SmallGamesRewardAds.offer` 领取，仅 `completed` 生效；不可用、取消、失败不消耗次数。请求绑定当前局面和令牌，重开、导航、pagehide、销毁取消，普通隐藏/失焦不取消观看；没有播放总超时，完成后仍暂停，需主动继续。H5 公共模块由构建注入，不复制 SDK，不修改源指纹规则。

设计与验证边界见 [奖励说明](docs/design/rewards-2026-10-24.md)。
