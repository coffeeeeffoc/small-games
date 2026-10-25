# 通用激励广告接入与避坑指南（当前优先 TapTap）

本文件是公共广告接口、接线边界与故障处理的唯一维护入口。奖励在玩法中的位置、免费基础体验及改造要求见[通用开发规范](../game-development.md#可选激励与公共能力)；配置与交付类型见[构建指南](game-builds.md)。新增问题更新这里，单款游戏只记录其奖励内容、配置来源及实际验收。

## 新游戏先选实际运行路径

游戏只声明奖励机会、资格、局面归属和结算，不读取渠道 SDK 或硬编码广告位。构建按 game × platform × 交付形态选择公共适配器并注入公开配置，Host 的广告控制权遵循 [ADR-0005](../adr/0005-ad-authority-is-host-owned.md)。未配置／关闭／不支持时正常玩法仍可继续，不跨渠道回退或伪造完成。

| 入口             | 复用实现与请求                                                                                                                        | 构建接线与当前边界                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| TapTap H5        | `platforms/h5/platform-ads.js` 的 `show({ opportunityId, kind, onShown })`；已有游戏通过 `game-rewards.js` 或 `rewarded-host.js` 组装 | `scripts/h5-ad-config.mjs` 生成 `platform-config.js`，运行时读取 `SmallGamesPublishingConfig`；字段、支持游戏与批量入口见[构建指南](game-builds.md) |
| 已有 Game Host   | `host.ads.offer({ id, reward })`                                                                                                      | 复用当前 Host，游戏不另建一套广告运行时                                                                                                             |
| Cocos 原生小游戏 | `@coffeeeeffoc/native-game-shell/creator-ads` 安装同一 `AdvertisingPort.offer({ id, reward })`                                        | 配置为 `platform / adsEnabled / adUnitId`；具体接入见[Creator 广告桥](../../packages/native-game-shell/README.md)                                   |

这些端口均以 `completed / dismissed / unavailable / failed` 表示结果，只有严格 `completed` 才结算一次。`kind: 'rewarded'` 表示广告种类，不是成功状态。游戏层必须处理取消、失败、实例退出和过期局面，避免迟到结果落入下一局；接口名字相似不代表可交换请求参数。

### 平台扩展与实际支持（2026-10-22 核对）

Creator 广告桥已有 `taptap → tap`、`wechat → wx`、`douyin → tt`、`bilibili → bl` 的显式选择，使用共享 `createAdRuntime` 与 native provider，不创建第二个 Canvas、输入或生命周期。**当前自动构建注入仅核实归途站 TapTap Creator 目标**：`apps/shell-minigame/scripts/taptap-targets.mjs` 的 `nativeRewards` 声明，经 `taptap-login.mjs` 的 `--prepare-login` 阶段生成 bundle 并安装。归途站 `build:wechat`／`build:douyin` 生成工程，不等于这些工程已接入该广告桥；其他游戏／平台同样需要各自接线和制品验证。

后续接微信、抖音、B站时扩展已有目标配置和 Adapter 接线，注册真实消费者、纳入源指纹及产物清单，并验证生成的目标包中 SDK、公开配置、完成和失败路径；不复制游戏规则、不预建无需求的空框架。构建注入、平台官方工具、真实 SDK、广告开通／库存和真机验收分别记录。

TapTap H5 广告位、原生小游戏广告位、Android APK 的 Java／JSB 接入是不同路径。原生当前使用 `MINIGAME_<GAME>_TAPTAP_AD_UNIT_ID`；AppID 不是广告位，H5 ID 不能复用为 native ID，AppSecret 不能注入客户端。归途站转换与最终打包步骤见[该游戏说明](../../games/local/homebound-station/README.md)。批量 `pnpm build:games` 当前仍只接受 TapTap H5，不能靠更改 `type` 生成原生包。

### 共享语义与现有实现差距

以下长视频／结束页的打开超时修复是 **H5 链路**证据。Creator 当前复用的 native provider 仍有默认约 120 秒的总等待边界，不能宣称已有同等长广告支持；接入或改动该路径时应复核长播放、结束页、取消后 SDK 占用及迟到回调，必要时在共享实现修复，并运行对应测试。本次规范整理未改变运行代码。

完成判定必须同时审查 provider、Host 与游戏外层包装；游戏暂停和广告请求保活分开管理，广告引发隐藏不等于玩家退出。统一最低回归见下文[诊断与验证方法](#诊断与验证方法)。

## 五款 H5 当前配置（2026-10-21）

通过已授权的 TapTap MCP 逐款 `select_app → get_current_app_info → check_ads_status` 核实，以下五款均已开通。此时此地开通后已重新查询。相同数值是平台分别返回的结果，不能据此推断其他游戏也可共用。

| 游戏 / 仓库 ID                          | AppID  | miniapp ID         | 平台返回的 H5 广告位 | 可选奖励入口                                         |
| --------------------------------------- | ------ | ------------------ | -------------------- | ---------------------------------------------------- |
| 此时此地 / vibeJam-myself-history-guess | 984485 | tapmcyeuvshseosntg | 1054324              | 历史线索；仅本地练习，完成后解锁本幕线索             |
| 乌龙城 / wulong-city                    | 987537 | tapmcx0bnwhn1cmq1j | 1054323              | 机关指引；30 秒高亮，三级普通提示保留免费            |
| 夜航守望 / night-overwatch              | 987511 | tapmcjgwi2thafs87k | 1054323              | 战斗补给、镜头升级                                   |
| 浪湾卡丁车 / carding-car                | 984547 | tapmcgymnoqi9kdbls | 1054323              | 金币补给 +100；每场完成后的机会只结算一次            |
| 词屿 / letters-words2                   | 987557 | tapmca1ytzeqiyk93j | 1054324              | 自由拾词的逐字提示；普通提示免费，挑战模式不开放辅助 |

五款配置源是 [`infra/builds/five-taptap-h5.mjs`](../../infra/builds/five-taptap-h5.mjs)，用 `pnpm build:games --config infra/builds/five-taptap-h5.mjs --dry-run` 检查，再去掉 `--dry-run` 构建。根默认 `game-build.local.mjs` 的当前选择见文末十三款接入说明；该历史五款预设保持不变。原六款离线预设继续保留；travel-bund 没有本次核实的 AppID，仍默认关闭广告。

本轮包体、截图、通过记录及未验收范围见 [五款最终包验证](../verification/2026-10-21-five-taptap-h5/README.md)。

这次修正了旧本地配置把 AppID 984485、984547 绑定到围捕、象棋的映射。不得把 H5 广告位填入原生 TapADN 配置；本文不代表原生小游戏已开通广告。乌龙城当前后台方向为横屏，H5 上传元数据已与之对齐。

### 统一接线与交互

旧三款 H5 的 SDK 层现在均复用 `platforms/h5/platform-ads.js`；实时版只保留兼容适配器。新五款通过 `game-rewards.js` 接入，同一层负责预加载、点击优先 `show`、失败后至多一次 `load/show` 恢复、并发保护及可见性处理。构建从公共源复制，不维护手工分叉副本。

按钮写具体功能；领取页面说明完整观看后获得什么，并保留取消入口。只有 `completed` 才进入游戏奖励逻辑。`show()` 成功、预加载成功、恢复前台都不表示完成。中断明确提示未获奖励，失败恢复按钮；未开启或无 SDK 时普通游戏仍可玩。夜航开发模拟奖励使用独立 `night-overwatch-rewards-dev-v1`，不写正式奖励存档。

### 插屏、Banner 与启动画面

本次选择**结算插屏**：五款本地玩法结算时调用 `SmallGamesRewardAds.atBreak(id, isCurrent)`。首个结算不展示，启动、上次插屏打开或最近激励请求结束后至少间隔 120 秒，每次页面会话最多三次；开发模式、隐藏页面和激励进行中不展示。不等待结算时才加载，库存未就绪直接跳过；打开最多等 2 秒，离开该流程的输入会取消尚未显示的请求；播放后等关闭回调释放，不给任何游戏奖励。

Banner 暂不启用：现有主页和游玩页面没有不会遮挡控件的固定留白。后续如设计出独立留白区，再增加 Banner 的尺寸、旋转、安全区及进入游戏隐藏测试。

官方 MCP 当前提供激励视频、插屏、Banner，没有独立开屏 API。本次不把激励广告强制当开屏：卡丁车和夜航显示各自游戏启动图。`cocos-branding.mjs` 在构建时删除 settings 内嵌的 Cocos logo 数据，按 settings → application → index 更新 MD5 引用，删除旧文件；原生 Creator 首屏替换为自有 PNG，并关闭默认 slogan 分支。升级 Creator 模板时必须重新验证，未知模板构建失败。

### 统一后端的范围

五款 H5 包注入 `__COMPETITION_CONFIG__`，通过现有 `game-services.js/client.js` 建立各游戏独立匿名身份，公开 `SmallGamesServices`（`ready/status/metadata/services`）。无需手工登录；本地存储被清除后匿名身份可能丢失。网络失败只令基础服务状态变为 `offline`，不阻塞游玩。

本次接入身份、个人资料 API 与服务能力查询，为以后个人战绩、全站榜接线提供同一端口。**不新增云存档，也不把客户端结算分数直接写入正式榜**。词屿、历史保留已有权威对战规则；卡丁车已有独立权威竞速服务继续使用。夜航和乌龙城基础 metadata 返回空榜单及关闭的对战能力，等实现验分规则后再开放。历史自己的 `/api/history` 战书、每日榜尚未迁移，因此 H5 包继续隐藏那些独立服务入口。

Runtime 的身份允许列表与控制快照分开；新增身份不修改旧 11 款签名快照、控制策略或比赛规则。此改动需要另行发布 Runtime API 才能在线支持新基础 metadata；本次本地构建不部署服务。客户端必须尊重真实能力与错误，不能把“包内配置了 HTTPS 地址”当线上服务已验证。

### 后续接入检查

1. 通过 MCP 查询当前游戏身份、开通状态与广告位，记录查询日期。不要从本文复制其他游戏的 ID。
2. 为奖励定义具体功能、免费基础玩法、资格条件、局面归属、存档与幂等策略；先等待完成结果，再计算或发放奖励。
3. 复用公共端口，按钮立即反馈、可取消；覆盖 `unavailable/failed/dismissed/completed`，中断和失败不得改变奖励存档。
4. 增加该游戏实际包的触屏检查：完成、失败、主动取消、重复/迟到回调、前后台两个顺序、重新进入，以及关闭广告后奖励可实际使用。
5. 新公共调用者须登记增量验证与跨包依赖；改构建链时检查源指纹、MD5 引用、ZIP inventory，禁止复用与源码不匹配的 prebuilt。
6. 新问题和解决方法统一补充本文；单次日志与截图放验证记录，并区分模拟 SDK、真实 SDK、真机、上传、上线。

归档日期：2026-10-19。主要依据象五子棋 TapTap **H5** 的实际代码、失败回归和整包验证；其他入口需逐一核对自己的调用链。本文描述接入和排障方法，不代表当前包已经通过真实广告或真机验收。

## 先确认入口和调用链

后台开通广告、配置广告位、页面出现按钮、SDK 成功打开广告、用户完成观看、游戏实际发奖，是六件不同的事，必须分别确认。

H5 的 `taptap-h5` 使用宿主注入的 `tap`。普通浏览器没有 SDK 时应返回 unavailable；不能回退 `wx`、`tt`、`bl` 或模拟广告来冒充接入成功。原生 Tap 小游戏和 APK 使用独立的渠道流程，H5 ZIP、SDK 测试和广告位不能直接代替原生接入。[官方适用范围](https://developer.taptap.cn/minigameapidoc/quick-start/mcp-guide/ad-integration-guide/)

本次象五子棋调用链：

```text
获取提示／悔棋
→ computer-hints.js／computer-undo.js
→ rewarded-hints.js（游戏层请求、取消及恢复）
→ SmallGamesRewardAds（rewarded-host.js 组装）
→ platform-ads.js（渠道 SDK、监听及实例清理）
→ tap.createRewardedVideoAd
```

## 最容易丢奖励的两个问题

### 1. 超时计时覆盖了视频和广告结束页

旧 H5 实现的广告层和游戏层各有一个 45 秒总截止时间，从点击开始计算加载、播放及停留。第一次加载十多秒，后续视频可能播放 15–60 秒，结束页又可以继续停留；完成回调到达前，请求已被判失败、监听已移除，之后即便 `isEnded=true` 也无效。

中间版本把播放限时改为 180 秒、外层改为 226 秒，只让常见短广告通过，仍未消除这个问题。不要不断增大总超时来代替正确的阶段管理。

最终规则：

| 阶段                               | 截止时间                                              | 是否发奖 |
| ---------------------------------- | ----------------------------------------------------- | -------- |
| 加载／尝试打开                     | 保留有限等待，本次广告层 45 秒，游戏层 46 秒兜底      | 否       |
| SDK 的 `show()` Promise 成功       | 清除广告层计时，并通过本请求 `onShown` 清除游戏层计时 | 否       |
| 视频播放／结束页停留               | 不再使用加载／打开截止时间                            | 否       |
| `onClose({ isEnded: true })`       | 结算一次、清理本请求                                  | 是       |
| 未看完、SDK 错误、明确离开游戏流程 | 结束本请求；迟到回调无效                              | 否       |

`show()` 的 Promise 表示**显示操作结果**；发奖依据来自关闭回调的布尔字段 `isEnded`，两者不可互换。[show](https://developer.taptap.cn/minigameapidoc/dev/api/ad/RewardedVideoAd.show/)、[onClose](https://developer.taptap.cn/minigameapidoc/dev/api/ad/RewardedVideoAd.onClose/)

只接受 `isEnded === true`，不能用 `Boolean(isEnded)`、停留时长、页面恢复或 Promise 成功推断完成。缺失或非布尔值应保留类型诊断，不能为了“兼容”一律奖励。

要逐层查找计时器。只修 SDK 适配器，外层 `offer/request` 的总超时仍会提前 `cancel/dispose`。象五子棋与 cops-robbers 已经透传 `onShown`；`publishing.js`、其他游戏包装器及原生适配器需分别审查，不能因复用了 `platform-ads.js` 就宣称所有入口都已修复。

cops-robbers 曾仍有游戏端 `ads.js` 的 45 秒总超时，以及 `main.js` 隐藏时取消、返回时丢弃结果的逻辑；只升级公共广告层无法消除这三处问题。2026-10-19 已修复，调用链为 `main.js → ads.js → ad-host.js → platform-ads.js → tap`，见[围捕小队整包回归](../../games/local/cops-robbers/docs/qa/taptap-reward-fix-2026-10-19/README.md)。

### 2. 广告导致页面隐藏，却被当成退出

全屏广告可能触发页面隐藏。旧逻辑在 `visibilitychange` 中销毁广告，导致 SDK 完成回调没有接收者。只修游戏层也不够：此前独立 H5 host 还在 Window 上监听隐藏事件并取消请求。

- 广告正在进行时，隐藏页面保留广告实例、监听和请求归属；暂停棋盘输入、电脑落子及后台分析。
- 隐藏期间收到结果先保存，前台恢复后交付结果、显示提示或悔棋反馈；不能因为 `document.hidden` 直接丢弃已完成奖励。
- 玩家明确离开当前奖励流程、重开、页面实际退出或实例销毁时取消；取消后的旧关闭回调和 `onShown` 都不能影响新请求。
- 浏览器回归要覆盖 Document 和 Window。仅 `document.dispatchEvent(new Event('visibilitychange'))` 默认不冒泡，会漏掉 Window 监听。测试应使用 `{ bubbles: true }` 并断言 Window 确实收到事件。
- 区分“关闭回调先到、前台后到”和“前台先到、关闭回调后到”，两种顺序都要验证。

## 首次慢、奖励无感和重复请求

| 现象／错误做法                              | 避坑方法                                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 首次点按钮才加载广告，十多秒没有反应        | 首页预加载，点击复用同一实例；显示“准备广告…”。预加载不自动播放，也不保证弱网或无库存下一定秒开 |
| 导航调用无条件 cancel，把刚预加载的广告销毁 | 空闲取消不影响预加载；实际退出仍释放实例                                                        |
| 预加载失败后一直不可用                      | 清理失败实例并允许后续请求重试；SDK 晚注入时下次请求重新查询                                    |
| 先分析再看广告，回来却没有提示              | 先取得完成结果，再分析并渲染明确的起点／落点和一句理由；分析失败保留本回合已取得的授权供重试    |
| 连点、迟到回调、上一局分析覆盖当前局        | 单请求并发控制；绑定当前局面／回合及请求身份；结束幂等，过期结果不落地                          |
| 第一次悔棋后重启又获得免费次数              | 免费次数使用状态进入存档，兼容旧存档；广告中断不改局面或次数                                    |
| 悔棋后重新随机抽子                          | 恢复原来的已抽棋子，避免悔棋变成免费重抽                                                        |
| 销毁或解绑失败后立刻复用 SDK 单例           | 保留旧操作占用，确认清理后再接新请求；各渠道单例／销毁语义分别处理                              |
| SDK 方法被解构调用                          | 保留接收者：`sdk.createRewardedVideoAd(...)`、`ad.load()`、`ad.show()`                          |

失败也要结束忙碌 UI。象五子棋使用“提示未成功生成”；悔棋中断为“未成功获得悔棋次数，悔棋失败”。`unavailable / failed / dismissed / completed` 不能在平台层被压成同一个结果。

## 诊断与验证方法

象五子棋 H5 记录最近 40 条事件到 `localStorage['xiangqi-five-ad-diagnostics']`，开发面板状态快照的 `game.ads` 使用同一记录。当前诊断版本 `h5-ad-open-timeout-20261019`。普通玩家界面不展示开发信息；存储异常不能阻断发奖。

重点看：`preload → loaded → show → shown → close(isEnded=true) → result(completed)`，以及中间的 `visibility`、`error`、`timeout`、`cancel`。记录时间、阶段、数值错误码和完成字段类型即可，不采集凭证、账号、完整 SDK 对象或广告素材。

| 证据                                     | 能确认什么                             | 不能替代什么         |
| ---------------------------------------- | -------------------------------------- | -------------------- |
| 单元／组合回归                           | 定时器、回调顺序、取消、幂等、状态迁移 | 真 SDK 注入及库存    |
| 实际 H5 包＋模拟 SDK                     | 配置、宿主、游戏、UI 的完整调用链      | TapTap 实机广告      |
| 虚拟时钟推进 10 分钟                     | 长结束页停留不会误超时                 | 实际播放十分钟       |
| ZIP 与文件逐项哈希一致                   | 测试文件和交付制品对应                 | 已上传或已上线       |
| 目标设备、目标包的真实完成日志与奖励操作 | 本次环境的实际发奖                     | 其他版本、游戏和渠道 |

最低回归覆盖：长加载＋长视频＋结束页停留、打开永不返回、show 拒绝或缺少 Promise、取消观看、SDK 错误、重复／迟到完成、迟到显示成功、隐藏与恢复的两种顺序、退出旧局后开始新局、首免悔棋及存档恢复。验证显示成功本身不会发奖，完成后提示落点确实可执行，未完成悔棋后存档完全不变。

从仓库根按变更路径运行现有回归，例如 H5 使用 `node --test platforms/h5/tests/platform-ads.test.mjs platforms/h5/tests/game-rewards.test.mjs`；Creator 桥使用 `pnpm --filter @coffeeeeffoc/native-game-shell test`。实际消费者与发布检查按[增量验证](incremental-publication.md)选择，不能以这些单元检查代替整包验收。

整包浏览器检查需把 `HINT_AD_HOST_CHECK` 设为 `1`，`HINT_DIST_DIR` 指向该批 H5 包的绝对 `dist` 路径，再运行 `node games/submodules/xiangqi-five/computer-hints-check.mjs`。生成新交付批次时使用新目录，保留旧包用于回溯；核对 manifest、ZIP 和测试文件哈希，不能只测源码后上传另一个包。

## 本次归档与边界

- [最终修复与失败／通过证据](../../games/submodules/xiangqi-five/docs/design/h5-ad-open-timeout-2026-10-19/README.md)：47 项相关回归、三种手机尺寸的整包触屏流程、虚拟时钟十分钟结束页案例通过。
- [此前 180 秒方案的历史记录](https://github.com/coffeeeeffoc/xiangqi-five/blob/fe1c870f3713bb0b19e2ea503a137f86c5c51fa4/docs/design/h5-ad-timing-fix-2026-10-18/README.md)：仅是中间版本，已被最终方案替代。
- [可见性问题与最终修复](../../games/submodules/xiangqi-five/docs/design/h5-ad-open-timeout-2026-10-19/README.md)：保留 Window 监听遗漏和旧测试未冒泡造成误通过的原因，分别说明历史证据与最终超时验证。
- 最终本地包：`outputs/xiangqi-five-h5-ad-open-timeout-2026-10-19/xiangqi-five-taptap-h5-ads-on-service-off.zip`，SHA-256 `cb521b295ccef16c100f347067b402f98d8cd70bb5213478482246385b07e228`。
- 未完成本包的 TapTap 上传、真机真实广告和平台验收。不能把其他会话截图中的“实机成功”移用为本包证据；发布时另按[增量发布验证](incremental-publication.md)执行。

## 十三款可选激励接入（2026-10-24）

根配置保留原有四款并新增以下十三款；本轮是 TapTap H5 接线，一炮拆城未改动。新十三款的广告位为空，打包会关闭广告，不会借用旧游戏 ID。后续逐款通过 MCP 核实后填入目标的 adUnits 并重新构建；这一步之后无需再改玩法代码。没有 SDK、取消或失败不发奖，基础游玩仍可继续。

| 游戏 / ID                     | 触发位置与奖励                                               |
| ----------------------------- | ------------------------------------------------------------ |
| 归途站 / homebound-station    | 主动请求额外调度、2/3 倍速；1 倍速免费                       |
| 子弹花园 / bullet-garden      | 暂停补给恢复 30% 生命；失败续战恢复 50% 生命，各一次         |
| 神机合阵 / merge-front        | 每局一次额外 2 枚补给币                                      |
| 穿云落星 / tower-brake        | 暂停且刹车耗尽后补满一次，辅助局不记纪录，免费续关保留       |
| 重力方舱 / tetracube          | 倒转和失败续局；无广告配置时保留既有免费基础操作             |
| 三块选两块 / three-choose-two | 重抽候选、失败后追加 2 组继续                                |
| 夺城令 / tianxia-chalu        | 结算后升级本局免费获得的排名卡一次                           |
| 星轨弹珠 / ball-roguelite     | 晶体共鸣、应急清除底部两排，各一次                           |
| 弹指擂台 / flick-arena        | 仅单人练习暂停时领取一次瞄准建议，不自动出手；对战和挑战禁用 |
| 小贼哪里跑 / chase-thief      | 暂停时领取一次 5 秒普通碰撞保护，沟壑仍失败，辅助局不记纪录  |
| 苔光花园 / moss-garden        | 每关首次提示免费，之后主动选择额外提示                       |
| 打破笼子接住人 / cage-rescue  | 普通局球机会耗尽时补 1 球，每局一次，免费重试保留            |

复用 SmallGamesRewardAds.offer/show 和公共 platform-ads.js，不经过有总时限的旧 publishing.rewarded 包装。子弹花园仍保留独立原生 provider；H5 优先共享端口。穿云落星、打破笼子接住人、弹指擂台的统一 H5 包仅支持 backend:false，覆盖编译制品中的旧 API 默认值，不初始化联网服务或显示不可用联网入口。

验证记录见各游戏 tests/rewards.test.mjs、子弹花园 tests/cocos-ads.browser.mjs、打破笼子接住人 tests/reward-browser.mjs、夺城令 tests/browser.mjs 及苔光花园 tests/expansion.browser.mjs。SDK 回调夹具不等于真实广告库存或 TapTap 真机验收。

## 灰烬防线 / 2026-10-24

新增`ashfall-front`的Creator Web/H5构建与公共奖励端口，手机方向为landscape。暂停补给恢复40%生命、失败续战恢复50%，各每关一次，普通开始和重试免费，辅助行动不计最佳。用户确认App998795（Developer492506）；本次MCP查询状态为未开通，默认广告关闭，无正式广告位，不使用其他应用的ID。开通后重新查询，再经`TAPTAP_ASHFALL_FRONT_AD_UNIT_ID`注入。当前只通过SDK夹具与Creator浏览器验证，不表示真机库存或上传通过。
