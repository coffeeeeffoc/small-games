# TapTap 普通小游戏运行时

本适配层供首九款游戏的原生 Canvas/WebGL 接入使用。运行入口直接使用宿主全局 `tap`，不创建 `wx`、浏览器 `window/document`，不输出 APK 或 H5 页面包。普通小游戏是没有 DOM/BOM 的 JavaScript 运行环境，提供 `GameGlobal` 和 Tap API；首个 `tap.createCanvas()` 创建唯一的上屏 Canvas。参见[官方运行环境及必要工程文件](https://developer.taptap.cn/minigameapidoc/dev/tutorial/overview/)。

## 工程与身份

`build.mjs` 生成普通小游戏源码工程描述：`game.js`、`game.json`、`project.config.json`。小游戏方向由独立游戏配置覆盖，默认竖屏；横屏使用 `deviceOrientation: "landscape"`。参见[官方 game.json 配置](https://developer.taptap.cn/minigameapidoc/dev/dev-support/config/)。

环境变量中填写小游戏开放能力页面提供的 MiniApp ID。不要使用开发者中心的数字游戏 ID、Android 包名或原生 TapSDK Client ID。生成工程使用 `game.json.appId` 和 `project.config.json.appid`，对应[官方 Unity 工程模板 game.json](https://github.com/taptap/minigame-sdk-unity/blob/main/Runtime/minigame-default/game.json)及[project.config.json](https://github.com/taptap/minigame-sdk-unity/blob/main/Runtime/minigame-default/project.config.json)。公开文档未规定 MiniApp ID 的固定长度，代码仅检查安全的不透明标识符。未配置 AppID 的预览工程保留空值，没有伪造测试身份；发布构建必须提供真实 ID。

九款工程在官方打包前统一安装 `tap-login.js`。配置 `MINIGAME_<GAME>_TAPTAP_APP_ID` 和 `MINIGAME_COMPETITION_API_URL` 后，启动时通过 `tap.login` 获取一次性 code，经 `tap.request` 请求本服务 `/sessions/platform`；已有有效服务端凭据时复用存储。未配置的预览不请求登录、不生成身份。客户端只保存服务端的 `playerId/token/expiresAt`，失败保持明确状态，不降级为游客。

服务端 Secret Store 的 `COMPETITION_PLATFORM_CONFIG` 使用 `{platform: "taptap", appId: "MiniApp ID", secret: "小游戏密钥"}`，每款单独登记。国内官方换码接口为 `GET https://cloud-miniapp.tapapis.cn/auth/v1/jscode2session`，参数 `appid/secret/js_code/grant_type=authorization_code`；不使用原生 Client ID 或 OAuth ServerSecret。code 有效五分钟且只能使用一次；官方 `session_key` 只在服务端处理。参见[官方 code2Session](https://developer.taptap.cn/minigameapidoc/dev/server/login/code2Session/)。服务端未配置、官方请求失败或缺少 openid 时拒绝登录，客户端不会拿到密钥。

## 平台能力

`startTapTapGame` 将 native-game-shell 接至 Tap 原生 Canvas、触屏、前后台、存储和音频。`normalizeTapTapSdk` 保留每个方法的宿主 receiver、事件监听函数及存储返回值，优先读取 `tap.getWindowInfo()`，旧宿主回退 `tap.getSystemInfoSync()`。参见[窗口及安全区](https://developer.taptap.cn/minigameapidoc/dev/api/base/system/tap.getWindowInfo/)、[同步存储](https://developer.taptap.cn/minigameapidoc/dev/api/storage/tap.getStorageSync/)及[前台事件](https://developer.taptap.cn/minigameapidoc/dev/api/base/app/life-cycle/tap.onShow/)。缺失可选退出能力时返回失败；没有配置并验证的广告位不启用激励广告。

`native-resources.mjs` 使用 [tap.getFileSystemManager](https://developer.taptap.cn/minigameapidoc/dev/api/file/tap.getFileSystemManager/)及[原生 readFile 回调](https://developer.taptap.cn/minigameapidoc/dev/api/file/FileSystemManager.readFile/)加载包内资源。仅文本传 `encoding: "utf8"`，二进制保留 ArrayBuffer；远程资源经宿主 `tap.request` 和构建时明确配置的 HTTPS 域名白名单，分包经宿主 `tap.loadSubpackage`。

TapTap 的全局 `WebAssembly.instantiate(path, imports)` 与浏览器 API 的参数不同：第一参数必须是包内 `.wasm` 或 `.wasm.br` 路径。因此 WASM 桥接直接传路径，不调用 `WXWebAssembly`，不把字节传入此接口，也不在编译失败后换用其他引擎。参见[官方 WebAssembly 接口](https://developer.taptap.cn/minigameapidoc/quick-start/guide/performance/)。本地测试使用显式的包路径宿主契约替身和真实 Node WASM 执行；它不等同于 TapTap 真机验证。

## 官方打包边界

源码工程不是可上传包。正式产物必须由 TapTap 官方打包工具生成指定 ZIP，且正确接入登录。`tap.login()` 的 code 交由服务端换取身份和自定义登录态，session_key 不下发至客户端。参见[官方包体上传要求](https://developer.taptap.cn/minigameapidoc/quick-start/guide/creation-improvement/)和[小游戏登录态管理](https://developer.taptap.cn/minigameapidoc/dev/tutorial/open-capabilities/login-management/)。AppID、服务端登录配置和广告环境变量后补时，本地结果保持源码预览状态。

Cocos Creator 3.8.x 以上应使用官方 `tap-minigame-ts.zip` 转换插件：先构建微信小游戏，再由插件完成 Tap 转换，输出 `build/TapBuild/game/` 和 `build/TapBuild/game.zip`。不能改名微信包或仅替换 SDK 全局。参见[官方 Cocos 构建和转换说明](https://developer.taptap.cn/minigameapidoc/dev/engine/Cocos-Laya-Egret/)。公开文档没有提供通用打包 CLI 参数，仓库不编造 CLI，也不把普通 ZIP 当官方包。

转换后使用独立的 `--prepare-login` 副本接入本服务登录及公开 MiniApp ID，再对副本运行官方打包工具。导入时要求当前 Creator 源指纹、逐文件资源清单、官方插件目录、转换后的真实入口、登录配置及 ZIP 内容全部匹配；任何 APK、未转换微信入口、漏资源、CRC 错误或旧来源均阻断。工具文件清单只能证明输入完整性，不能证明工具发布者，记录中的 `officialToolVerified` 和 `realDeviceVerified` 保持 `false`。操作及本次验证记录见[前九款 TapTap 接入](../../docs/deployment/nine-games-taptap-20261007.md)。

公开文档中的体积限制尚不一致：[运行环境](https://developer.taptap.cn/minigameapidoc/dev/tutorial/overview/)和[创建指南](https://developer.taptap.cn/minigameapidoc/quick-start/guide/creation-improvement/)写 60M，[审核规范](https://developer.taptap.cn/minigameapidoc/tap-operation/operation-standards/review-standards/)写 20MB 以下。提交前按审核规范的较小限制控制，并核对后台当前限制。宿主扫码、Android/iOS 性能和登录均需后续真机验证；本地构建和 CI 不代表平台审核通过。
