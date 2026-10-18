# 围捕小队 · TapTap H5 发布准备

当前产物是 H5，沿用竖屏道路棋盘、手机触屏和本地进度。好友 PK 与全站榜暂时禁用；人机对抗、挑战、接力、快练及同题分享仍可用。此文档和脚本只处理 H5，尚未生成普通 Tap 小游戏包。

本工程使用 **H5 包体链路**。普通小游戏与 H5 小游戏在 TapTap 上是两种形态，使用不同的运行环境、包体格式和上传接口；不能仅凭创建页的“小游戏”选项判断 H5 能力。[官方小游戏说明](https://developer.taptap.cn/minigameapidoc/quick-start/guide/minigames-intro/)、[按形态划分的接入指南](https://developer.taptap.cn/agents/)。

## 常规发布还是快速上架

2026-10-14 用户提供的实际创建页明确列出下列限制，上架方式选定后无法更改：

| 创建页选项 | 页面明确的支持范围 | 对本项目的影响 |
| --- | --- | --- |
| 常规发布 | 认证开发者、完整资料和合规认证；包体支持 APK、小游戏包、PC 包 | 适合本项目接广告和正式运营的目标；选择「手机 → 小游戏」时，需要真正的 Tap 小游戏工程和对应包体 |
| 快速上架（创意工坊 / 关卡） | 仅支持 H5 包体、仅在个人主页曝光、暂不支持各项生态能力 | 可用于现有 H5 试玩；不能当作当前广告变现目标的已确认发布路径 |

因此，按当前广告与运营目标，推荐「常规发布 → 手机 → 小游戏」，并将当前 DOM 游戏移植到 Tap 小游戏运行环境。**当前一键脚本不能完成这项移植，它输出的 H5 ZIP 无法上传到普通小游戏入口。** 如果只想先发布 H5 试玩，则使用快速上架，并接受当前页面列出的能力限制。

官方[广告指南](https://developer.taptap.cn/minigameapidoc/quick-start/mcp-guide/ad-integration-guide/)提供 H5 广告能力，但不能据此认定所有 H5 创建模式均已开放广告；必须同时核对实际应用权限与发布通道。Tap 小游戏与 H5 的商业广告方案也不同，原生目标需按该指南接入 Dirichlet / TapADN，不能复用 `taptap-h5` 宿主实现冒充已接通。

此前“常规发布下直接选择 H5 包体”的表述缺乏当前创建页支持，已更正。没有读取具体应用的权限和备案状态前，不承诺现有 H5 包能进入常规商店发布；也不自动新建应用、改变已有在审资料或取消审核。

## 上传入口与包体解析错误

2026-10-14 用户确认：将 `cops-robbers-taptap-h5.zip` 上传到了「小游戏包体」入口，后台报“无法解析资源”。本地 ZIP CRC 校验通过，只有一个 `dist/` 顶层目录、入口 `dist/index.html`；它是 H5 静态包，不是该入口要求的 Tap 小游戏包。

| 目标 | 包体与入口 | 上传方式 |
| --- | --- | --- |
| H5 小游戏（当前工程） | HTML / JS / CSS；`dist/index.html` | H5 包体入口或 `upload-h5-package` |
| 普通 Tap 小游戏 | 适配 Tap 小游戏运行环境的工程，由官方 TapTap 打包工具输出 | 普通「小游戏包体」入口；不能使用本工程的 H5 ZIP |

截图中“TapTap 打包工具”和“接入 TapTap 登录”的提示，与[普通小游戏包体格式要求](https://developer.taptap.cn/minigameapidoc/quick-start/guide/creation-improvement/#_5-1-包体格式要求)一致。调整 H5 ZIP 的目录层级、改文件名或补一个配置文件，无法把 DOM 游戏转换为普通小游戏。

使用实际开发者和应用 ID 登录后，先执行只读查询，确认应用支持哪些包体：

```powershell
taptap-cli package-management get-available-package-types --dev-id <实际开发者数字ID> --app-id <实际游戏数字ID> --json
```

返回 `data.result.available_package_types` 必须包含 `h5`，才能使用本脚本。包含 `h5` 时通过 H5 包体入口或下文的一键脚本上传，这只代表包体能力，不代表支持广告或常规商店发布；只有 `mini_app` 时不能继续往普通小游戏入口传此 ZIP。若后台没有 H5 入口，按查询结果核对应用配置或咨询平台，不能假设上传框可切换。若发布目标是普通小游戏，需要另行移植 DOM 界面、运行入口和平台能力，并用官方打包工具生成对应包体。

## 本地包

在仓库根目录运行：

```powershell
pnpm --filter cops-robbers package:taptap
pnpm --filter cops-robbers test:ads
```

产物：`outputs/cops-robbers/cops-robbers-taptap-h5.zip`，顶层只有 `dist/`，入口为 `dist/index.html`。打包读取当前源码资源清单，排除普通构建保留的旧 `competition.js`、服务器配置和额外文件，并重新读取 ZIP 全部条目核对大小与 SHA-256。记录见 [包体记录](../qa/taptap-h5-package.json)。

该 ZIP 仅供 H5 包体链路使用。官方 MCP 使用构建目录而非 ZIP：先核对已选应用，再准备 H5 上传，目录为打包脚本从本 ZIP 全新解压的 `outputs/cops-robbers/taptap-h5/dist`。常规 `games/local/cops-robbers/dist` 保留旧文件，不直接作为 MCP 上传目录。方向参数 `screenOrientation: 1` 为竖屏。官方依据：[H5 上传工具](https://github.com/taptap/instant-games-open-mcp/blob/main/src/features/h5Game/tools.ts)、[H5 ZIP 实现](https://github.com/taptap/instant-games-open-mcp/blob/main/src/features/h5Game/handlers.ts)，2026-10-14 核查。此前引用的 PC / WebGL 包体说明不作为普通小游戏格式依据。

静态资源、模块、提示 Worker 均使用相对路径，无外部素材依赖。通过 HTTP(S) 启动，保证 `.js` 使用 JavaScript MIME。Web 全屏由用户手势发起；普通竖屏视口可直接游玩。存档沿用 `cops-robbers-v3`，H5 域名变化可能无法继承旧域名的本地存储。

## 激励广告接口

每点一次“提示”都需要完成一次广告，完成后才求解当前位置。取消、不可用、失败、打开超时与离开当前局面不提供提示。教学指引保留，手动行棋、撤销与重试免费。

2026-10-19 已贯通游戏层和宿主层的 `onShown`：TapTap SDK 的 `show()` Promise 成功后停止打开超时，等待 `onClose({ isEnded: true })` 才发放提示。广告造成页面隐藏时保留请求，隐藏期间收到的结果等恢复前台再处理；主动退出仍取消。详见[本次修复与新包](../qa/taptap-reward-fix-2026-10-19/README.md)和[公共避坑指南](../../../../../docs/operations/taptap-rewarded-ads.md)。

普通 Web build 默认使用明确标注的四秒模拟广告。**模拟广告不是商业广告，也没有收益。** `package:taptap` 固定生成 `adMode: 'host', platform: 'taptap-h5'`，通过公共提供方调用宿主 `tap.createRewardedVideoAd`。TapTap 包中配置或 SDK 缺失时报告不可用，不回退模拟。其他 Game Host 仍可注入已有奖励契约：

```js
globalThis.SmallGamesRewardAds = {
  async offer(opportunity) {
    // opportunity = { id: 'cops-robbers:hint', reward: { hint: 1 }, onShown }
    // SDK 确认打开成功后调用 opportunity.onShown?.()；这一步不发奖。
    // 调用该 H5 渠道的真实激励广告 SDK；仅完整观看回调可返回 completed。
    return { status: 'unavailable' };
  },
  dispose() { /* 取消广告、清理监听，并让 offer 的 Promise 返回 dismissed。 */ },
};
```

也支持 `SmallGamesPublishingConfig = { adMode: 'host', provider: { show(request), dispose() } }`，`request` 为 `{ opportunityId: 'cops-robbers:hint', kind: 'rewarded', onShown }`。两种接口均返回 `completed / dismissed / unavailable / failed`，未知值不给提示。提供方应在确认打开成功后调用 `onShown`，未报告打开成功的请求仍受 45 秒保护。设置 `adMode: 'host'` 后缺少提供方会报告不可用，不回退到模拟；`adMode: 'off'` 关闭广告获取提示。打开超时或取消会恢复正常行棋，但尚未结束的宿主广告仍占用提示请求锁，避免重复展示；提供方须让取消后的 Promise 结束。

## TapTap H5 广告开通

2026-10-18 已通过官方 MCP 确认应用 `982507` 的广告状态为已生效。本次服务端响应提供的竖屏广告位为 `1054324`，已写入本地 `.env` 并完成 H5 打包。MCP 更新方向后仍读到 `screen_orientation=0`，本次按现有竖屏设计从实时响应选择 `type=2` 广告位，未修改工具缓存；后台方向元数据仍待确认。详见[本次配置与打包记录](../qa/taptap-ads-2026-10-18.md)。

开通后使用官方 MCP 的 `check_ads_status` 查询已选应用，由平台自动返回与竖屏设置对应的广告位，再获取 `get_ad_integration_guide` 接入实际提供方。[官方实现](https://github.com/taptap/instant-games-open-mcp/blob/main/src/features/ads/handlers.ts)区分未开通与已生效，并自动匹配方向；[官方 SDK 示例](https://github.com/taptap/instant-games-open-mcp/blob/main/src/features/ads/docs.ts)使用宿主的 `tap.createRewardedVideoAd` 和 `onClose` 的 `isEnded`。H5 必须在宿主确实注入 `window.tap` 的环境中验证，普通浏览器不能假设拥有该接口。2026-10-14 核查。

已实现游戏核心广告端口 `src/ads.js`、宿主组合 `src/ad-host.js` 和公共 `platforms/h5/platform-ads.js` 的 TapTap H5 适配；公共层还显式区分微信、抖音与 B 站。当前已配置平台返回的生效广告位并验证准确解压包的 SDK 流程，**尚未完成真实广告播放或变现验收**。后续在真实 TapTap H5 宿主验证；平台要求的登录、启动校验或防沉迷能力按该 H5 通道另行验收。

## 一键构建、校验及上传

一键脚本自动读取游戏目录 `games/local/cops-robbers/.env`；可复制同目录的 `.env.example` 后填写。已有终端环境变量优先，未配置时也能准备本地包。`.env` 被 Git 忽略且不进入 ZIP。账号认证运行 `taptap-cli auth login`，凭证只由官方 CLI 保存，不放入环境模板、源码或 ZIP。

```powershell
# 申请中可先留空，只准备包；包含单元检查、ZIP 校验及解压包触屏检查。
pnpm --filter cops-robbers deploy:taptap -PackageOnly

# 广告生效后填入本应用的竖屏广告位；仅该公开 ID 进入前端。
$env:TAPTAP_COPS_ROBBERS_AD_UNIT_ID = '<实际广告位ID>'
$env:TAPTAP_DEVELOPER_ID = '<实际开发者数字ID>'
$env:TAPTAP_COPS_ROBBERS_APP_ID = '<实际游戏数字ID>'
taptap-cli auth login

# 预演不上传；CLI 可读取平台元数据，仍需有效账号及应用。
pnpm --filter cops-robbers deploy:taptap -DryRun
# 正式执行：构建、验证、上传并创建 H5 版本。
pnpm --filter cops-robbers deploy:taptap
```

占位文本只能留在文档，脚本遇到非实际 ID 会失败；广告位申请中使用空值，正常玩法仍可继续。普通 `build` 生成 Web 模拟模式；上传前必须用 `package:taptap` 或 `deploy:taptap` 的包。

浏览器校验先尝试本游戏 Playwright 的缓存 Chromium，再尝试本机标准安装位置的 Chrome / Edge，每个候选都实际检查启动。找到可用浏览器后立即复用，不下载；存在但无法启动的候选会跳过。全部不可用时才安装本游戏版本对应的 Chromium 并检查启动；已有失效缓存时强制重装。日志和 SDK 报告记录选定路径，实际校验使用同一可执行文件。

默认无需设置浏览器环境变量。非标准安装位置可在游戏 `.env` 中固定路径，空值仍自动选择；也兼容已有 `BROWSER_EXECUTABLE` / `CHROMIUM_PATH`。明确指定的路径无效时直接报错，便于修正配置：

```dotenv
PLAYWRIGHT_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
```

上传使用官方 CLI 的 `upload-h5-package <ZIP> --dev-id ... --app-id ... --screen-orientation 1 --idempotency-key ... --yes`。**CLI 为 1=竖屏、0=横屏；小游戏 MCP 为 1=竖屏、2=横屏，不能混用。** 调用时进入 ZIP 所在目录，符合 CLI 的 cwd 限制。

公共上传脚本先调用 `package-management get-available-package-types`，确认本次开发者和应用支持 `h5`；不包含 H5、查询失败或返回结构无效时，停止且不上传。`-DryRun` 同样执行该只读检查。`-PackageOnly` 只做本地准备，不查询账号能力，并在日志明确标注 H5 包体。包体记录与上传回执增加 `packageType: 'h5'`，不自动切换应用形态、开通普通小游戏或绑定主包。

回执为 `outputs/cops-robbers/taptap-upload.json`，预演为 `taptap-upload-preview.json`，均被 Git 忽略。幂等键关联应用和该 ZIP SHA；同一包已有成功回执时直接复用。网络超时或结果不明时保留原 ZIP，用公共脚本重试，不重新构建替换它：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File platforms/h5/deploy-taptap.ps1 `
  -ZipPath outputs/cops-robbers/cops-robbers-taptap-h5.zip `
  -DeveloperId $env:TAPTAP_DEVELOPER_ID -AppId $env:TAPTAP_COPS_ROBBERS_APP_ID
```

脚本不改当前在审版本和资料。上传成功代表新 H5 版本已创建，主包绑定、提审、审核结果和上线在后台单独处理，不自动撤回或替换当前审核。真实上传需 CLI 登录及两个应用标识。

## 后台与设备待办

- 核对开发者主体、游戏应用与 H5 发布通道，上传包并留存版本/包 ID、启动 URL 和竖屏设置回执。
- Android / iOS 的真实 TapTap H5 WebView 检查冷启动、触控、音效、全屏拒绝、安全区、Worker 与资源 MIME、前后台和存档恢复。
- 真实广告完成/取消/无填充、广告后提示、重复请求与超时；不能用模拟广告或 Chromium 触屏模拟代替。
- 使用实际截图、简介、图标、年龄分级及通道要求的资料提交审核，另记录审核与上线结果。公开链接不带 `dev=1`。

本次已实现适配和部署脚本，执行了本地包及 SDK fixture 验证；未实际上传、审核或真机验收。最新记录见 [接入验证](../qa/taptap-ad-integration-2026-10-14.md)。
