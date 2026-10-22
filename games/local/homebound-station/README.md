# 归途站 · Cocos 移动版

点击前方畅通的出租车解开车阵，接走所有旅客并让全部车辆离场。**有效点击当下即按点击顺序绑定旅客和固定站门；多辆车并行出发，沿入站道和待车线排队，抵达上客位时才占用泊位。**

本轮从 Three.js 迁移到 Creator 3.8.8：真实 Cocos 的场景、界面、输入、声音和生命周期在 `assets/scripts/`，引擎无关规则在 `assets/scripts/core/`。`src/simulation.ts`、`src/levels.ts` 只作为旧规则消费者的兼容导出。旧 Vite 源码只留作历史迁移参考，默认 build/dev 不会发布或运行它。

当前改版使用真实透明图集构成 Cocos 2.5D 场景：八方向出租车、旅客、站房、花草与页面插画均随工程打包；方向牌和座位票签与车身分开。首页使用真实场景的独立发车演示。最新方案见 [画面比例与站前动线](docs/design/screen-flow-2026-10-23/plan.md)，上架基础资料见 [publishing/STATUS.md](publishing/STATUS.md)。

前版产品方案、先行效果图和验证记录见 [移动版设计](docs/design/cocos-mobile-2026-10-22/design.md)。效果图不是运行截图。本轮实现与验证范围见 [本轮验收记录](docs/design/screen-flow-2026-10-23/verification.md)；[前版并行与美术验收](docs/design/dispatch-polish-2026-10-22/verification.md)保留历史语境，不能代替当前包体的画面与输入验收。

## Creator 构建

仓库环境为 Node 24.21.0 / pnpm 12.6.0。Windows（例如 bolanggu）安装真实 Creator 3.8.8 后：

```powershell
$env:COCOS_CREATOR = 'D:\tools\cocos\CocosCreator.exe' # 按本机实际路径设置
pnpm install --frozen-lockfile
pnpm --filter @coffeeeeffoc/homebound-station test
pnpm --filter @coffeeeeffoc/homebound-station typecheck
pnpm --filter @coffeeeeffoc/homebound-station build
pnpm --filter @coffeeeeffoc/homebound-station test:browser
pnpm --filter @coffeeeeffoc/homebound-station dev
```

打开 `http://localhost:4326/`。`build -- --config-only` 只生成配置，不代表引擎构建成功。`HOMEBOUND_STATION_PREBUILT_DIR` 可指向含 `dist/` 和真实 `cc.d.ts` 的源码匹配制品；指纹不匹配直接拒绝。默认 `build` 使用真实 Creator，缺引擎不会降级成旧 Web 版本。

`build:wechat` / `build:douyin` 提供原生目标构建入口，方向为竖屏；原生宿主广告、正式 AppID、包体门禁与真机尚需单独验收，不能把 H5 构建当作原生平台发布。

## 玩法与100关

100 个稳定 ID（1–100），分为10章。停车阵列从3×3逐步扩大到6×9，车辆从6辆增加到最高50辆；每关车阵不同，车辆数量和复合难度分非降，方向依赖随车阵变化。固定种子生成的方向依赖图无环；道路几何随关卡尺寸生成，渲染、点击和行驶使用同一份布局。乘客每组1–4人，所有车辆都能容纳，避免合法出车顺序造成容量死局；旧的5/6人分乘API保留并有测试，当前100关不强制分乘。

点击时即绑定乘客ID、任务序号及固定站门位置，后续排队不会改派旅客。前一辆尚未接客时，其他畅通车辆即可接单、并行出库；车辆沿单向收集道进入共享待车线，在入站段、路口和泊位前自动让行，实际进入上客位时才取得泊位。候车不绕圈，北向车辆直接接入北侧入站路线；旅客从已绑定的站门走到对应上客位，离站车辆使用独立出口道并为过街旅客让行。重复点击不会重复预订。所有乘客已分配后会提示；全部送达后可继续派空车收班。

首页实时演示车辆按箭头出库和接客，演示进度与正式关卡、广告奖励分开。流程为：首页 → 继续/关卡 → 游戏 → 暂停/重开/设置 → 结算/下一关。存档沿用 `homebound-station.progress.v2` 并扩展到100项；旧三星记录和声音设置保留，存储不可用时仍可在本次会话游玩。分享 `?station=N` 为独立挑战，不写正常进度。

浏览器版在普通页面和嵌入视口中游玩，设置与暂停页不提供全屏按钮。高关卡车阵超过小屏可视高度时，可上下拖动车场；拖动后松手不会同时派车，桌面端可用滚轮查看。顶部进度、倍速和暂停按钮保留在视口内。方向适配、安全区、暂停恢复和开发模式保留；原生平台由宿主承载画面。

## 开发模式和倍速

公共 `SmallGamesDev` 支持 `?dev=1`、`?dev=true` 和 `localStorage.dev`；显式 `?dev=0` 优先关闭。开发模式下自由选100关，`?dev=1&level=100` 可直接测试末关。开发试玩不写正常星级或解锁进度。普通模式即使加 `level=100` 也不能绕过解锁。

倍速入口收在顶部单个按钮中，点击后展开1×、2×、3×、5×选项，选择或点击外部收起。**只有1×免费；2×、3×、5×分别完成一次激励广告解锁当前局，不连带解锁其他档。** 取消、失败、无库存和迟到回调不发奖励；重开或换关重置。广告播放暂停模拟，退出取消本次请求；后台恢复不会覆盖玩家的暂停。

游戏只调用通用 `SmallGamesRewardAds.offer` 广告端口，不读取平台 SDK 或广告位。小游戏宿主构建复用 `@coffeeeeffoc/native-game-shell/creator-ads`，由配置选择 TapTap / 微信 / 抖音 / B站适配器，并复用仓库的 `createAdRuntime`。这里只安装广告端口，不另建 Canvas 或游戏生命周期。未来渠道只需扩展适配器与构建配置，关卡和倍速逻辑不变。

TapTap 小游戏 `game.zip` 已加入独立目标，竖屏，不扩充旧批量游戏名单。它与 Android APK 的 SDK 和打包目标不同：

```powershell
# 以下均为本游戏的公开配置，不是 App Secret；不要借用其他游戏的标识。
$env:MINIGAME_HOMEBOUND_STATION_TAPTAP_APP_ID = '<本游戏 AppID>'
$env:MINIGAME_HOMEBOUND_STATION_TAPTAP_AD_UNIT_ID = '<本游戏激励广告位>'
node apps/shell-minigame/scripts/taptap-cocos.mjs --game homebound-station --prepare-source
```

该命令校验已有真实 Creator 3.8.8 的 WeChat 转换源，不会执行引擎构建；先运行 `build:wechat`。需继续使用官方 TapTap 1.2.2 转换和打包流程，见根目录 `docs/plans/2026-10-07-taptap-cocos.md`。转换后、官方最终打包前，由 `--prepare-login` 阶段注入通用广告端口和公开配置。配置改变后必须重新打包，转换器最初生成的 ZIP 不能代替最终包。主包不超过4 MiB，总资源和最终 ZIP 均小于20 MiB。归途站离线玩法无需登录后端，正式包仍要求本游戏有效 AppID。

普通小游戏与 APK 的广告均来自 Dirichlet，但 SDK 不同：[普通小游戏官方教程](https://developer.taptap.cn/minigameapidoc/dev/tutorial/open-capabilities/ad/rewarded-video-ad/)使用宿主 `tap.createRewardedVideoAd`，当前通用适配器按 `onClose.isEnded === true` 发奖，广告位必须来自 Dirichlet 的“小游戏”媒体；Android APK 则需要 Java SDK 与 Cocos JSB 适配，当前 `game.zip` 接线不代表 APK 接入完成。缺少匹配 SDK 时返回不可用，不跨平台回退或模拟成功。

原生广告位与 H5 广告位独立。H5 继续通过 `H5_ADS_ENABLED=1`、`TAPTAP_HOMEBOUND_STATION_AD_UNIT_ID` 配置其端口。未配置或宿主无广告能力时默认不可用，1×仍正常游玩。开发/测试中的 SDK 回调仅验证奖励契约，不代表真实广告投放或宿主验收。

## 验证

当前道路与关卡改版的验证范围、源码指纹和实际画面，以 [2026-10-23验收记录](docs/design/screen-flow-2026-10-23/verification.md) 为准。独立冻结规则草稿已完成400局验证；该结果不等于最终Creator整包、触屏或原生平台验收。下列2026-10-22记录属于前版车阵与路线，保留供历史诊断，不能用于证明本轮画面或通关时间。

### 固定节奏诊断与异常回放

2026-10-22 的真实 Creator 1 倍速触屏复核已通过：`90/random` 用时 203.5 秒、三星余量 6.6 秒；`90/reverse` 用时 203.6 秒、余量 6.5 秒。两例正式进度保持不变、浏览器零错误，最大观测输入迟到均为 0.6 秒。见[完整交互证据与截图](docs/diagnostics/touch-2026-10-22/evidence.json)。这与确定性模拟报告分开记录，不声称其时间或 RAF 采样队列峰值等同精确 tick 回放。

`diagnose` 复用规则测试中的同一个 solver，按正序、倒序和固定种子随机顺序运行全部 100 关。默认每 0.5 秒最多派出一辆当前可派车辆，第一拍为模拟时间 0；无可派车辆时空过这一拍，不补发。节奏必须是模拟步长 0.05 秒的正整数倍。随机种子为关卡 ID × 7919，每拍按既有 LCG 对车辆排序。旧规则测试仍保留每 tick 批量派车和逐步 SAT、乘客守恒等断言。

```powershell
pnpm --filter @coffeeeeffoc/homebound-station diagnose
pnpm --filter @coffeeeeffoc/homebound-station diagnose --interval 0.75 --out reports/dispatch-0.75s.json
pnpm --filter @coffeeeeffoc/homebound-station diagnose --replay reports/dispatch-diagnostics.json
pnpm --filter @coffeeeeffoc/homebound-station diagnose --replay reports/dispatch-diagnostics.json --case 100/random
```

报告包含 300 条结果、每次派车的模拟 tick 和车辆 ID、配置与最终状态摘要、异常排行及 10 个优先复核案例。报告不写入墙钟时间，因此相同源码与参数生成的 JSON 可逐字节比较。生成时会把全部动作日志重新输入真实规则模拟，逐 tick 推进并核对最终状态、计时、星级与峰值；单独回放也会拒绝源码/配置漂移、同一拍多次输入、非法派车或被改写的结果。

前版 [0.5 秒基线报告](docs/diagnostics/dispatch-0.5s.json) 为 300/300 通关、300/300 三星，通关时间 22.8–203.35 秒。最小三星余量为 6.75 秒（`90/random`、`90/reverse`），未触发上述异常标记；真实交互优先复核这两个最接近阈值的案例。全表最大排队峰值为 14 辆，道路受阻峰值为 17 辆。该报告是规则模拟结果，浏览器复核结果单独保存。

- **通关时间**是最后完成时的模拟秒数；超出默认 700 秒限额则标记未完成，不能算作通关。
- **星级余量**按生产规则的 `maxWait` 计算：最大登车等待时间距离三星、二星阈值各还剩多少秒。它不是“星级阈值减通关时间”；负值表示已超出该档阈值，未完成时为 `null`。
- **最大排队**是已经分配泊位、尚未清场、但还未成为对应泊位当前占用者的车辆数峰值；含等待入位的在途车辆。另列因道路冲突受阻的车辆峰值，避免混为乘客人数或仅统计车辆堵塞。每次派车及每个 0.05 秒步长后取样。
- **异常排行**先列未完成，再按三星余量从小到大、两种峰值从大到小、耗时从长到短排序。标记未完成、低于三星和三星余量不超过 5 秒；这是人工复核顺序，不直接证明关卡有缺陷，也不会修改难度或奖励。

真实产物复核使用同一报告，默认选排行最前的两个案例；可指定异常案例。先完成当前源码的 Creator 构建，再执行：

```powershell
pnpm --filter @coffeeeeffoc/homebound-station build
pnpm --filter @coffeeeeffoc/homebound-station diagnose:browser
pnpm --filter @coffeeeeffoc/homebound-station diagnose:browser --report reports/dispatch-diagnostics.json --cases 100/random,99/reverse
```

浏览器脚本只读 `homeboundSnapshot` / `homeboundView`，通过真实投影坐标触摸车辆，不调用派车/推进接口或修改游戏状态。在隔离试玩模式以 1 倍速等待模拟时间，迟到的输入不批量追赶；输出每次输入的计划时间、接收观测时间、延迟、RAF 采样峰值、结果截图和正式进度未改变的断言，保存到 `test-results/dispatch/`。加载结束时模拟可能已经前进，输入与渲染也有调度延迟，因此这是实际交互复核，不冒充 Node 中精确到 tick 的回放。星级不一致会明确失败，须结合记录的延迟分析。默认环境为桌面 Chromium 的 390×844 触屏模拟，不能替代手机宿主实测或人类试玩。缺失、过期的 Creator 产物直接报错，不跳过验证。

规则验证覆盖100关多种合法点击顺序、碰撞间距、乘客ID守恒、固定接客位置、首人登车前多车真实位移、暂停和1/2/3/5×一致性；另检查存档迁移、奖励完成/失败/取消/重开及加载品牌。具体执行结果与对应源码以本轮验收记录为准。

`test:browser` 必须使用真实 Creator `dist`，以触屏经过首页、选关、派车、暂停、重试、结算、解锁、存档、开发模式和广告回调，记录390×844、320×568及844×390截图。触屏证据和1×真实并行位移记录归档于本轮设计目录。浏览器触屏模拟不等于手机实机验收。
