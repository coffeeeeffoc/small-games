# 子弹花园 · Cocos Creator 3.8.8

竖屏、触屏优先的花园射击游戏。正式入口是 `assets/scenes/main.scene`；页面与战场由原生 Sprite、Graphics、Label 绘制。原 `src` 纯规则模块经 esbuild 生成 Creator 模块，始终只有一套战斗模拟。历史 `index.html`、`src/main.mjs`、旧网页 renderer/server 仅作参考，不是开发、构建或正式验收入口。游戏无全屏按钮。

## 构建与预览

仓库根安装锁定依赖后，在本目录执行：

```powershell
node scripts/typecheck.mjs
pnpm test
node scripts/build.mjs web-mobile
pnpm dev
# http://localhost:4356，仅预览生产 dist
node scripts/build.mjs web-desktop
node scripts/serve.mjs --desktop
node scripts/build.mjs wechatgame
```

要求真实 Creator 3.8.8（使用 carding-car 的 toolchain 查找）；根 `build.mjs` 保留薄转发。typecheck/build 都先 prepare，clean checkout 可按 typecheck → test → build 执行。`assets/scripts/generated/`、构建和导入缓存不提交。每目标输出 `build-info.json`，包含 Creator版本、渠道配置、源码 SHA-256、逐文件 inventory；移动目标另复制到 `dist`。

`BULLET_GARDEN_PREBUILT_DIR` 指向含 `dist/` 和真实 `cc.d.ts` 的游戏制品目录。恢复必须通过当前源码、渠道和完整 inventory 校验；错配直接失败，不降级为旧包。物理路径相同直接复用，目标内的源目录和目标 junction/symlink 被拒绝。`sourceHash` 只用 Node 内建模块，CI 安装依赖前可以运行；生成 core/channel 及其自动 meta 不参与源哈希。

## 渠道配置与广告

没有配置时固定 `{platform:"preview",appId:"",adUnitId:"",adsEnabled:false}`，默认隐藏广告并正常免费游玩。复制 `platform-build.example.json` 到自己的配置文件，只接受 `platform/appId/adUnitId/adsEnabled` 四字段；platform 为 `preview`、`taptap` 或 `taptap-h5`。真实 ID 必须属于本游戏。

```powershell
$env:BULLET_GARDEN_PLATFORM_CONFIG='F:/configs/bullet-garden-h5.json'
node scripts/build.mjs web-mobile
# 该文件必须声明 taptap-h5（或 preview）；原生使用 taptap（或 preview）。
```

配置编译进运行模块，typecheck/build/预制品验证使用相同配置；不通过 URL 或调试 API 注入。修改配置必须重建。公共 provider 为 `platforms/h5/platform-ads.js`。只在 completed 授予：每局一次50%生命复活并保护3秒，暂停页一次30%生命补给，满血不出现。SDK onShown 后的遮挡冻结游戏，隐藏中完成延后到可见时授予且保持暂停；离开、重开、销毁使迟到回调失效。原生允许 hide 先于 onShown。

本轮没有配置真实广告 ID、登录或访问平台后台。`tests/cocos-ads.browser.mjs` 明确标记 mockSDK，验证真实生产 JS bundle 与公共 provider 回调契约，不代表 TapTap SDK/真机/审核通过。

## TapTap 原生转换

```powershell
$env:TAPTAP_PLUGIN_DIR='F:/path/taptap-minigame-tools'
$env:TAPTAP_PLUGIN_ARCHIVE='F:/path/tap-minigame-ts-1.2.2.zip'
# 可选：BULLET_GARDEN_PLATFORM_CONFIG 指向本游戏 native 配置；无配置为空ID预览。
node scripts/build-taptap.mjs
```

wrapper 校验官方1.2.2归档及完整安装目录（包括归档自带依赖），先真实构建 wechatgame，再复用共享 `replayOfficialConversion`，在隔离环境中执行官方转换并确认 Babel 零失败，输出到本游戏 `build/taptap-*/converted/` 的新目录。随后注入 `startup/taptap.cjs`，将真实 TapTap SDK 提供给广告模块，并在宿主没有 wx 兼容入口时提供 Creator 所需入口；已有宿主兼容实现保留。不会执行登录或后台操作。插件目录必须来自原始归档，不执行额外依赖安装。

实际 `game.json.appId`、`project.config.json.appid` 与配置绑定，`deviceOrientation` 固定 portrait；manifest 修改后重新生成 `game.zip`，核对 ZIP 与目录逐文件一致，压缩和解压内容均受20MiB门禁约束。`receipt.json` 和 `build/taptap-latest.json` 记录源码、Creator输入、官方插件与包体哈希以及真实验收边界。无真实ID的结果仅用于预览，不声称可直接提交平台审核。

## 操作与存档

左摇杆移动，自动瞄准射击；右侧冲刺。永久等级2起解锁技能，拖到战场瞄准并松手施放，回到操作带或取消区、触点取消均不耗能，最多三蓄力。倒计时后清空余敌才胜利。局内经验选择植物祝福或武器强化；营地永久成长、植物及武器技能图鉴可达。

十四关稳定 ID、旧 `bullet-garden.profile.v1` 存档保留。地图身份绑定关卡；敌人从数据定义的竖屏范围出生。失败先进入可复活阶段，点击“结束本次冒险”才提交失败奖励；胜利结算一次。旧 `bullet-garden.sound` 设置先迁移，再读取新设置。

Web 开机加载公共 `scripts/dev-mode.js`；`?dev=1` / `localStorage.dev` 统一判断，全关试玩不结算正式奖励。原生使用 `sys.localStorage`，无 DOM/fullscreen 调用。Shell 同源 iframe 启动及映射状态变化发送精确 origin 的 `small-games:display-state`：菜单 home；游戏、暂停、强化、失败、结算 playing。

## 验证与证据

```powershell
pnpm test
pnpm test:balance
$env:QA_OUTPUT='docs/design/cocos-mobile-2026-10-22/actual/campaign'
pnpm test:campaign-balance
Remove-Item Env:QA_OUTPUT
node tests/movement-comparison.mjs
pnpm test:browser
```

所有正式 browser/rendering/screens/display package scripts 都进入生产 Creator 验收，浏览器串行1个worker。默认自建短期 dist 静态服务器；`GAME_URL` 可指定同一生产产物，`QA_OUTPUT` 可改证据目录。覆盖320/390/430及横屏、菜单/选关、真实多指摇杆与冲刺、技能拖动取消、暂停/失焦/resize、60秒自然首关胜利与存档重载。后期技能/自然失败使用明确的历史进度存档 fixture，战斗仍由真实输入驱动，没有可写游戏调试注入。

只读快照契约见 [03-runtime-contract.md](docs/design/cocos-mobile-2026-10-22/03-runtime-contract.md)。效果图、实际截图和执行记录位于 `docs/design/cocos-mobile-2026-10-22/`。桌面 Chromium 手机视口不等于手机真机，官方转换成功不等于平台审核通过。
