# Shell 前九款：移动端与五平台构建

本批名单固定于 dev `e07dc06483bd7fe0b9fdfe219e06362fce3c0caf`，依据 `apps/shell-web/src/GameCatalog.tsx` 的 `featuredGameOrder` 与空搜索排序。顺序为浪湾卡丁车、围捕小队、别跑！街区围捕、词屿、此时·此地、象五子棋、外滩漫游、夜航守望、乌龙城。后续新增游戏不改变本批。Cannon 不在范围内。乌龙城保留现有 owner 在 dev `1e99fc74e055f78638322f2b9df1602736561af9` 交付的页面/100关/原生 Canvas，本批仅接入其已有 NativeGameShell 构建边界。

## 实现边界

批次入口 `apps/shell-minigame/scripts/nine-games-build.mjs` 使用固定的九款描述和五个独立平台 SDK：微信 `wx`、B站 `bl`、抖音 `tt`、快手 `ks`、支付宝 `my`。构建本地原生 Canvas/Creator 入口，不打包 H5、iframe 或 WebView。游戏规则与平台 SDK 转换分开。

围捕小队新增原生标准巡逻、接力与快练；此时·此地新增完整本地场景旅途与解说；象五采用主仓适配入口，直接复用已锁定子模块规则、电脑与战术题，未修改子模块指针。词屿复用已有原生拾词、教材、词单与存档。街区围捕修复手势取消、多指、滑出和安全区坐标映射。新页面的方案/效果图及实际 Canvas 手机截图保存在各游戏设计目录；象五适配器与证据在 `platforms/competition/xiangqi-five/`，不注册第二个游戏。

夜航仅修复原生宿主误显示/调用浏览器全屏。它的源指纹已经变化，必须由 Creator 重新构建。卡丁车引擎源码未改，不能用不匹配的缓存冒充已验证产物。

外滩仍依赖 React DOM/R3F、GLTF/Draco、Rapier、Web Audio 与浏览器拍照导出。五平台均明确阻塞真实原生迁移；生成 H5 或改包名不算接入。

## 命令与环境变量

要求 Node `24.21.0` / pnpm `12.6.0`。本云环境工具链位于 `/tmp/small-games-toolchain/node_modules/.bin`；依赖使用冻结锁安装。

```sh
# 本批单款/单平台原生预览（AppID 可留空，但仍需真实入口/引擎）。
node apps/shell-minigame/scripts/nine-games-build.mjs --game letters-words2 --platform alipay --preview

# 逐项尝试 45 目标，保存所有成功与阻塞；任何目标阻塞则返回非零。
node apps/shell-minigame/scripts/nine-games-build.mjs --all --preview

# release 首先检查全部所选目标的真实公开 AppID，缺失时不写包。
node apps/shell-minigame/scripts/nine-games-build.mjs --game letters-words2 --platform alipay

# 复核包文件哈希、完整性、缺失/额外文件和符号链接。
node apps/shell-minigame/scripts/nine-games-build.mjs --verify apps/shell-minigame/dist/nine-games/alipay/letters-words2

# 本地配置与真实 CJS 包契约；SDK fixture 不是官方工具或真机。
node --test apps/shell-minigame/scripts/nine-games-build.test.mjs apps/shell-minigame/scripts/cocos-platform.test.mjs platforms/alipay/tests/adapter.test.mjs
node --test platforms/bilibili/tests/native-entry.test.mjs
node scripts/nine-channel-entry-smoke.mjs
node scripts/nine-canvas-games-smoke.mjs
node scripts/nine-wulong-smoke.mjs
NATIVE_OUTPUT_ROOT="$PWD/apps/shell-minigame/dist/nine-games" node games/local/letters-words2/tests/native-bundle.test.mjs
```

复制 `apps/shell-minigame/.env.example`，在本机 shell 或 CI 导入环境变量；构建器不自动读取或提交机密文件。每目标变量为 `MINIGAME_<SLUG>_<PLATFORM>_APP_ID`，slug 和 platform 转大写，连字符改下划线。例如 `MINIGAME_LETTERS_WORDS2_ALIPAY_APP_ID`。示例的 45 项均留空，不使用假 AppID。

AppID 是公开客户端配置；AppSecret、支付宝私钥、换码服务凭据等只放服务端 secret store，不是客户端构建参数，不写包或 manifest。客户端构建器仅选择允许的公开字段，不展开 `process.env`。可选 `MINIGAME_COMPETITION_API_URL` 必须为无凭据的公开 HTTPS URL；无服务/AppID 时本地单机可玩，好友登录/请求明确不可用，旧 token 也不能绕过此限制。支付宝登录交换尚未实现，不借用微信登录。广告未配置或未验证时不可用，不发奖励；支付宝分享保持不可用。

## 产物与验证语义

输出为 `apps/shell-minigame/dist/nine-games/<platform>/<slug>/`，包括真实 `game.js`、本平台配置、本地资源、`release.json` 与 `artifact-manifest.json`。manifest 记录固定范围提交、实际构建源码文件 SHA-256、`sourceTreeDirty`（有未提交改动时明确标记，不能把基准 HEAD 当作准确候选）、包文件字节数/SHA-256、preview/release 及外部验证状态。`build-status.json` 记录每个目标成功或具体失败原因；失败目标先清理旧输出，不能遗留旧包伪装成功。

B站的 `game.json` 使用其必填 `appId`、`version`，并核对侧边栏/桌面入口能力；支付宝使用现行 `deviceOrientation`、自己的工程配置和代码包文件白名单，显式保留词屿教材 JSON、本批 WAV 音效及乌龙真实音效。支付宝教材读取按其官方要求使用根路径和 UTF-8，不采用微信存储/文件签名假定。Cocos 支付宝目标为官方 `alipay-mini-game`，快手 Creator 适配插件缺失时明确拒绝构建。

45 个构建目标不是 45 次平台验收。本轮的 Node/Chromium/无 DOM VM 契约均为本地证据：真实 SDK 图片解码、音频、官方包体/基础库限制、登录绑定、广告、真实手机性能与审核仍须平台工具/设备逐款验证。产物中的 `officialToolsVerified`、`deviceVerified`、`platformLoginVerified` 不会因填写 AppID 自动变为 true。

## 证据与剩余事项

当前逐目标状态和能力矩阵见同目录 `nine-games-build-status-20261006.json` 与 `nine-games-capabilities-20261006.json`。各游戏实际浏览器/触屏截图与测试报告在游戏设计目录。外滩的本轮移动 UI 复测隔离了 3D Renderer，不能当作真实手机性能验收。

仍需 Creator 3.8.8 和严格匹配的 Cocos 产物、可信快手引擎适配、外滩真实原生移植，乌龙城共享宿主安全区/胶囊与窗口变化处理仍有源码缺口，不能仅凭正常尺寸截图判为已验。本轮未注册账户、购买服务、改平台权限、上传、提审或发布。

官方核对依据（2026-10-06）：[B站配置](https://miniapp.bilibili.com/small-game-doc/framework/config)、[快手流程](https://open.kuaishou.com/miniGameDocs/gameDev/start/start.html)、[快手 API](https://open.kuaishou.com/miniGameDocs/gameDev/api/api.html)、[抖音配置](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/framework/mini-game-configuration)、[支付宝配置](https://opendocs.alipay.com/mini-game/0fx941)、[支付宝文件读取](https://opendocs.alipay.com/mini-game/08urvh)。微信官网当前抓取失败，沿用仓库已核对适配层并明确保留外部验证缺口；不使用第三方资料替代官方 SDK 协议。
