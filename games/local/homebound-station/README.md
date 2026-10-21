# 归途站 · Cocos 移动版

点击前方畅通的出租车解开车阵，接走所有旅客并让全部车辆离场。**有效点击当下即按点击顺序预订乘客，锁定其位置；多辆车并行出发，只在实际路口冲突和停靠位处自动让行。**

本轮从 Three.js 迁移到 Creator 3.8.8：真实 Cocos 的场景、界面、输入、声音和生命周期在 `assets/scripts/`，引擎无关规则在 `assets/scripts/core/`。`src/simulation.ts`、`src/levels.ts` 只作为旧规则消费者的兼容导出。旧 Vite 源码只留作历史迁移参考，默认 build/dev 不会发布或运行它。

产品方案、先行效果图和验证记录见 [移动版设计](docs/design/cocos-mobile-2026-10-22/design.md)。效果图不是运行截图。当前阶段与实际验证范围见 [验收记录](docs/design/cocos-mobile-2026-10-22/verification.md)。

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

100 个稳定 ID（1–100），10章，从6辆到20辆车。每关车阵不同；车辆密度、复合难度分逐步上升。固定种子生成的方向依赖图经过可解性验证，增加同类关卡只调整关卡层。乘客每组1–4人，防止任意合法出车顺序下用完大车后无解；旧的5/6人分乘API保留并有测试，但当前100关不强制分乘。

点击时预订乘客ID、任务序号及固定等候位置。前一辆尚未接客不会阻止其他车辆接单或出发；同车道跟车、交汇路线和同一停靠位自动让行。重复点击不会重复预订。所有乘客已分配后会提示；全部送达后可继续派空车收班。

首页 → 继续/关卡 → 游戏 → 暂停/重开/设置 → 结算/下一关。存档沿用 `homebound-station.progress.v2` 并扩展到100项；旧三星记录和声音设置保留，存储不可用时仍可在本次会话游玩。分享 `?station=N` 为独立挑战，不写正常进度。

## 开发模式和倍速

公共 `SmallGamesDev` 支持 `?dev=1`、`?dev=true` 和 `localStorage.dev`；显式 `?dev=0` 优先关闭。开发模式下自由选100关，`?dev=1&level=100` 可直接测试末关。开发试玩不写正常星级或解锁进度。普通模式即使加 `level=100` 也不能绕过解锁。

**只有1×免费；2×、3×、5×分别完成一次激励广告解锁当前局，不连带解锁其他档。** 取消、失败、无库存和迟到回调不发奖励；重开或换关重置。广告播放暂停模拟，退出取消本次请求；后台恢复不会覆盖玩家的暂停。

复用 `SmallGamesRewardAds.offer` / 通用 H5 广告运行时。生产 TapTap H5 通过 `H5_ADS_ENABLED=1`、`TAPTAP_HOMEBOUND_STATION_AD_UNIT_ID` 配置真实广告位，未配置默认不可用且1×仍正常游玩。开发/测试注入的广告结果仅验证回调契约，不代表真实广告投放验收。禁止借用其他游戏的 AppID/广告位。

## 验证

规则测试包含100关正向/反向/固定随机顺序共300次完整清场，逐tick独立SAT碰撞检测、乘客ID守恒、固定接客位置、8车同tick出发、暂停和1/2/3/5×一致性；另验证存档迁移、奖励完成/失败/取消/重开及加载品牌。

`test:browser` 必须使用真实 Creator `dist`，以触屏经过首页、选关、派车、暂停、重试、结算、解锁、存档、开发模式和广告回调，记录390×844、320×568及844×390截图。`CAPTURE_GAME_EVIDENCE=1` 把证据存入本轮设计目录。浏览器触屏模拟不等于手机实机验收。
