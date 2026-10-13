# TapTap H5 广告公共层接入验证

日期：2026-10-14。环境：Windows、Node 24.21.0、pnpm 12.6.0、Playwright Chromium 153.0.8010.12。浏览器开启触屏模拟；广告 SDK 与上传 CLI 使用可控替身。**不代表 TapTap 真机或商业广告已通过。**

## 已完成

- 游戏核心端口与平台 SDK 分离；公共提供方显式区分 TapTap H5、微信、抖音、B 站。
- TapTap 包固定 `host / taptap-h5`；未配置广告位或宿主不支持时不可用，不回退模拟。完整观看后才计算原局面的提示，取消、超时、错误、离开及晚到回调不给提示。
- 一键入口执行单元检查、构建、ZIP 校验和准确解压包触屏检查，再交给官方 CLI 上传。支持 `-PackageOnly` 和 `-DryRun`。
- ZIP 条目固定时间戳，两次完整一键构建的 SHA 相同。幂等键包含开发者、应用、方向和 ZIP SHA，切换方向不复用旧回执。
- 未改变存档格式、求解规则、关卡目录或现有未提交的 ashfall-front 工作。

## 检查记录

| 检查 | 结果 | 依据 |
| --- | --- | --- |
| 公共 SDK、游戏端口、配置与上传脚本 | 13 项通过 | `node --test platforms/h5/tests/platform-ads.test.mjs platforms/h5/tests/deploy-taptap.test.mjs games/local/cops-robbers/scripts/check-ad-core.mjs` |
| 公共 H5 发布契约、发布范围及候选工具 | 与上述测试合计 97 项通过；幂等修复后的脚本定点复测通过 | `platforms/h5/tests/publishing.test.mjs`、`scripts/publication-scopes.test.mjs`、`scripts/validate-tree.test.mjs` |
| 准确解压 ZIP 的 TapTap SDK 流程 | 12 项通过，320×568 / 390×844 / 844×390 | [SDK 浏览器报告](taptap-ad-integration/sdk-browser.json) |
| 普通 Web 模拟与已有宿主接口 | 12 项通过，包含广告后通关解锁、超时锁、后台和晚到回调 | [Web 回归](taptap-ad-integration/web-regression.json) |
| 游戏主页、触控取消、返回、接力选择及移动 | 9 项通过 | [游戏流程](taptap-ad-integration/game-shell.json) |
| dev 模式独立、Shell 和 iframe | 10 项通过，0 错误；包括 URL、存储、显式关闭及公共触控固定用例 | [开发模式](taptap-ad-integration/dev-mode.json) |
| 注册、依赖边界、dev 副本与语义、相关格式和 diff 检查 | 通过；68 款登记检查无问题 | `check:games`、`check:dependencies`、`check:dev-mode`、`test:dev-mode`、Prettier、`git diff --check` |

Shell 检查使用既有生产 Shell 和本次 Web 游戏产物，更新对应游戏的生成目录；未重新构建无改动的其他游戏。发布范围按本次公共层实际消费者选取 cops-robbers；H5 上传不会触发原生 Tap/Cocos 门禁。

实际截图：[320 提示](taptap-ad-integration/tap-hint-320.png)、[390 提示](taptap-ad-integration/tap-hint-390.png)、[844 提示](taptap-ad-integration/tap-hint-844.png)。提示来自 SDK fixture 的显式完整观看回调，截图不是广告真机回执。

## 最终本地包

- [ZIP](../../../../../outputs/cops-robbers/cops-robbers-taptap-h5.zip)：39 个资源、933232 字节；入口 `dist/index.html`，竖屏。
- SHA-256：`c13f564920323c46db5c317ec40e0411edba000b91ac49467c11b02b1bf9de31`。
- 每个 ZIP 条目及解压资源检查大小与 SHA，时间戳也在打包脚本中校验；[包体记录](taptap-h5-package.json)与 SDK 浏览器报告记录同一 ZIP SHA。
- 广告位空值，`adUnitConfigured=false`；本包可在审批期间正常游玩。

## 尚待平台验收

用户确认广告申请正在审核。本机官方 CLI 2026.9.24 可用，读取认证状态为未配置；未执行真实上传、主包绑定、提审或上线，也没有真实广告收益记录。

工作树基线为 `dev` 的 `ec385ec216b1fe3574ba5641d1984e5e334a8994`；本次修改尚未提交或推送，未执行最终合并候选 SHA 的发布校验。上述记录对应本地代码及明确 ZIP，不代表 GitHub CI 或 Pages 已发布。

待补 `TAPTAP_DEVELOPER_ID`、`TAPTAP_COPS_ROBBERS_APP_ID` 与审批后竖屏广告位 `TAPTAP_COPS_ROBBERS_AD_UNIT_ID`，使用官方 CLI 本地登录。Android/iOS TapTap H5 WebView 的真实播放、无填充、前后台、恢复、安全区和存档仍需单独验收。未重复执行无变化的全关求解或其他平台原生包发布。

## 浏览器缺失报错修复

用户运行 `deploy:taptap -PackageOnly` 时，打包完成，但游戏 Playwright 1.63.0 默认启动所需的 `chromium_headless_shell-1243` 不可用。检查脚本现调用 `scripts/browser-preparation.mjs` 的 CLI 入口，从游戏目录解析对应版本，缺失时安装 Chromium 并先检查启动；实际校验使用准备流程选定的同一可执行文件，支持已有的 `PLAYWRIGHT_EXECUTABLE_PATH` / `CHROMIUM_PATH` 和游戏的 `BROWSER_EXECUTABLE`。

- 浏览器准备的缓存、显式路径、缺失安装、游戏依赖解析、失败阻断和 CLI 回执测试：6 项通过；完整 `validate-tree` 与 `ci-validation` 合计 43 项通过。下载分支使用可控执行器验证，未额外下载一套浏览器。依赖边界检查通过，未跨包直接导入根工具。
- 本机移除显式路径后，缓存的完整 Chromium 出现 `spawn UNKNOWN`，启动检查正确阻断，未跳过浏览器校验。
- 使用明确配置的 `C:\Program Files\Google\Chrome\Application\chrome.exe` 复跑原命令成功：12 项广告单元检查、39 项 ZIP 资源核对、12 项解压包触屏检查。更新的 SDK 报告记录实际浏览器路径。
- 本次只调整校验入口和文档，未改变 ZIP 资源或 SHA，未执行真实上传或真机验收。

## 一键自动复用与本地配置

按用户要求，一键校验启用公共浏览器工具的 `--reuse-installed` 模式：依次检查匹配缓存、标准安装位置的 Chrome / Edge，存在但无法启动的候选跳过；找到能启动的浏览器后复用，全部不可用时才安装或重装匹配 Chromium。候选校验与 CI 保留原默认选择规则。部署入口自动加载游戏目录 `.env` 的应用 ID、广告位和浏览器配置，使用 Node 内置环境文件解析，现有环境变量优先；仅导入部署所需键，不执行环境文件内容。

- 清空 `BROWSER_EXECUTABLE` / `PLAYWRIGHT_EXECUTABLE_PATH` / `CHROMIUM_PATH`，游戏目录无 `.env`，直接运行 `pnpm --filter cops-robbers deploy:taptap -PackageOnly` 成功。
- 日志显示缓存 Chromium 启动失败后自动复用 `C:\Program Files\Google\Chrome\Application\chrome.exe`，版本 `154.0.8037.99`；本次未下载或安装浏览器。
- 一键入口 13 项单元检查、39 个 ZIP 资源核对、12 项准确解压包触屏检查通过；ZIP SHA 未变化，SDK 浏览器报告已更新。
- `validate-tree`、`ci-validation` 与 `.env` 配置测试合计 48 项通过；覆盖缓存及 Chrome / Edge 选择、重复复用、全部不可用后的安装/重装、无效明确配置阻断、环境文件优先级与不存在时降级。
- `.env` 的非标准浏览器路径可选，空值自动选择；环境文件被 Git 忽略，包体清单不包含它。未实际上传或新增其他平台发布验收。

## 包体入口与发布方式纠正

2026-10-14 用户确认，H5 ZIP 被传入普通「小游戏包体」入口；后续提供的实际创建页显示，快速上架仅支持 H5、仅在个人主页曝光、暂不支持各项生态能力，常规发布列出的包体则是 APK、小游戏包和 PC 包。此前将“常规发布下直接选择 H5”当作现成路径的说明已更正。当前广告与运营目标推荐常规发布的普通小游戏，但需要移植当前 DOM 实现；本轮未生成原生 Tap 小游戏包。

- 上传前新增官方应用包体能力只读查询，未确认 `h5` 时停止；不切换应用类型、不修改在审资料。打包和一键日志明确说明 H5 包体与普通小游戏入口的区别，包体记录与上传回执标注类型。
- 公共适配、游戏端口、环境文件和上传脚本合计 15 项单元检查通过。包体类型检查覆盖仅 `mini_app`、空列表、错误结构、查询失败与相同成功回执复用，CLI 全部使用本地替身，没有真实上传。
- 重新生成包并校验：39 个资源、933232 字节，ZIP CRC 通过；SHA 仍为 `c13f564920323c46db5c317ec40e0411edba000b91ac49467c11b02b1bf9de31`。资源没有变化，沿用同一 SHA 的既有 SDK 浏览器检查，未重复全游戏回归。
- 尚未读取实际应用的包体能力、发布或广告权限。H5 SDK 能力与快速上架模式不能混为一谈，不能据此承诺常规商店上线或广告变现已经可用。
