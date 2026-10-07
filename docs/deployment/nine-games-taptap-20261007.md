# 前九款 TapTap 普通小游戏接入

实现起点为 dev `f96e90907910fb94d4f9a9bbaaace06b6a1668db`，收尾时已合并远端 `4a779da21146ce275be8e0bbd7e9f5e06eee21d0`，保留其独立 Tetracube 更新。使用此前五平台批次的固定九款名单（`e07dc064`），不随 Shell 目录新增游戏扩张。保留原五平台默认入口，新增独立 `build:taptap` / `test:taptap`。

## 产物与运行环境

普通小游戏直接使用 `tap`、`GameGlobal`、原生 Canvas/WebGL；无 DOM/BOM，不套 H5 页面。源工程包含 `game.js`、`game.json`、`project.config.json`，方向沿用各游戏配置。窗口信息优先 `tap.getWindowInfo`，存储、触屏、前后台和资源加载走 Tap API。外滩保留原始场景与 Rapier，WASM 传包内路径给宿主 `WebAssembly.instantiate`。

| 游戏                         | 源工程路径                                          | 本地宿主验证         |
| ---------------------------- | --------------------------------------------------- | -------------------- |
| carding-car                  | Creator 官方插件转换后导入                          | 缺真实转换输入，阻塞 |
| cops-robbers                 | 原生 Canvas                                         | 通过                 |
| cops-robbers-realtime        | 原生 Canvas                                         | 通过                 |
| letters-words2               | 原生 Canvas                                         | 通过                 |
| vibeJam-myself-history-guess | 原生 Canvas、图片分包                               | 通过                 |
| xiangqi-five                 | 原生 Canvas                                         | 通过                 |
| travel-bund                  | 原始 WebGL 场景、Rapier WASM                        | 通过                 |
| night-overwatch              | 当前 native 适配工程，经 Creator 官方插件转换后导入 | 缺真实转换输入，阻塞 |
| wulong-city                  | 原生 Game Host / Canvas                             | 通过                 |

这些结果是本地宿主契约模拟，不是 TapTap 官方工具或真机验收。没有生成正式上传包。源码预览、官方转换输入、正式 ZIP 分别记录；不会将 APK 或微信包改名为 TapTap 包。

## 待补配置与登录

见 `apps/shell-minigame/.env.example`。客户端公开变量为每款 `MINIGAME_<GAME>_TAPTAP_APP_ID`、`MINIGAME_COMPETITION_API_URL`，外滩另需 `MINIGAME_TRAVEL_BUND_ASSET_BASE`。使用开放能力页面的 MiniApp ID；不使用 Android 包名、开发者中心数字游戏 ID 或原生 Client ID。后端/API 和资源域名须加入平台白名单。

九款的源工程在打包前安装同一 `tap-login.js`：配置齐全时 `tap.login` 获取 code，经 `tap.request` 请求本服务 `/sessions/platform`；服务端换码后返回自定义登录态。未配置的预览不发登录请求、不生成身份。发布构建要求 MiniApp ID 和 HTTPS 登录服务地址，外滩同时要求明确资源地址。

服务端 Secret Store 的 `COMPETITION_PLATFORM_CONFIG` 为每款登记：

```json
[{ "platform": "taptap", "appId": "实际MiniAppID", "secret": "该小游戏密钥" }]
```

服务器请求官方国内 `GET https://cloud-miniapp.tapapis.cn/auth/v1/jscode2session`，参数为 `appid`、`secret`、`js_code`、`grant_type=authorization_code`。code 有效五分钟、一次性；`secret/session_key` 不进入客户端。身份按平台/AppID/openid 隔离，未配置或上游失败时拒绝，不降级为游客。生产后端须可访问此域名；本次仅验证协议契约，未请求真实 Tap 身份接口。

## 七款非 Cocos 源工程

使用 Node 24.21.0 / pnpm 12.6.0，递归固定子模块并安装冻结依赖。

```sh
pnpm --filter @coffeeeeffoc/shell-minigame build:taptap --all --preview
pnpm --filter @coffeeeeffoc/shell-minigame test:taptap --game letters-words2
```

默认输出为 `apps/shell-minigame/dist/nine-games/taptap/<game>/`。`--all --preview` 保留七款成功结果并将两款 Cocos 明确标为 `blocked`，整体退出码为 1。只选择一款时用 `--game <id>`；可用 `--output` 指定独立目录。默认九款 smoke 对缺真实 Cocos 输入同样失败，不用旧包顶替。

正式配置齐全后，去掉 `--preview`。先生成源工程并保存 `MINIGAME_<GAME>_TAPTAP_PACKAGE_RECEIPT`，用官方工具对同一工程打包；再指定 `TAPTAP_PACK_TOOL` 和 `MINIGAME_<GAME>_TAPTAP_PACKAGE_FILE` 导入实际 ZIP。源清单和 ZIP 每个文件的路径、大小、SHA256、CRC 都须一致。公开文档未给出通用打包 CLI，脚本不编造调用参数、不自行生成 ZIP。

## 两款 Cocos 官方转换

仓库现有 Creator 发布输入要求 3.8.8；Tap 文档要求 3.8.x 以上及官方 v1.2.2 转换插件。两款均走真实 Creator WeChat 构建，再选插件的“转换为Tap小游戏”；不是修改微信入口全局或重命名目录。Night 先生成已有 native 适配工程，保留 canonical/native source hash 和适配配方指纹。

```sh
node apps/shell-minigame/scripts/taptap-cocos.mjs --game carding-car --prepare-source
node apps/shell-minigame/scripts/taptap-cocos.mjs --game night-overwatch --prepare-source
```

`tap-source-plan.json` 只记录真实源工程、指纹及手工步骤，不声称 Creator 已运行。实际 Creator 源产物须保留 `build-info.json` 的 `creator/sourceHash/target=wechatgame`、原始入口、settings 和完整资源。`SOURCE_INVENTORY` 收据包含 `game/canonicalSourceHash/sourceHash/adaptationRecipeSha256/sourceDirectory/files`；`files` 用 `taptap-package.mjs` 的 `inventory` 导出采集，与实际用于转换的源目录绑定。任何资源路径变化须提供明确 `resourceMappings`，内容变动仍阻断。

官方转换得到 `build/TapBuild/game/` 后，在独立副本接入登录，再用官方工具对副本打包：

```sh
node apps/shell-minigame/scripts/taptap-cocos.mjs --prepare-login \
  --game carding-car --converted-dir /actual/build/TapBuild/game \
  --output /independent/tap-login-stage --appid ACTUAL_MINIAPP_ID \
  --api-url https://api.example.com/competition/v1 --release
```

Night 使用相同命令替换 `--game`。`--output` 必须是新目录或现有空目录，拒绝覆盖其他内容。副本更新公开身份并安装 Tap 登录前缀，卡丁私有 competition 配置会覆盖为 Tap；原转换输入不被修改。官方工具重新打包这个副本后，为对应游戏配置 `TAPTAP_SOURCE_DIR/SOURCE_INVENTORY/CONVERTED_DIR/PLUGIN_DIR/PACKAGE_FILE` 完整前缀变量，再调用独立 `build:taptap --game <id>` 导入。

导入只原样复制已提供的正式 ZIP。输入和管理输出必须独立；符号链接、来源/配方过期、未转换微信入口、资源丢失、登录前缀或 helper 不匹配、APK、ZIP CRC/内容不匹配都阻断。插件名称/本地元数据不作为真实性证明，记录 `officialToolVerified=false`、`realDeviceVerified=false`。

## 验证与发布门禁

新增范围分类只选择实际 Tap 消费者。三处共享 builder 添加、competition Tap 字典/guard 及卡丁 SDK 字典增量均逐字节证明旧行为保留；未知额外改动恢复真实共享范围或明确阻断。锁文件仅新增平台 importer 和宿主 workspace link，要求其余字节与基线一致。两款 Cocos 的真实构建门禁保留。

本次已运行平台和宿主规则测试、登录服务契约测试、类型检查与 lint、增量范围/runner 回归。七款源工程在无 DOM/BOM 的 Tap fixture 下验证实际生产 bundle、触控、存档、前后台和清理；外滩使用 Chromium DedicatedWorker 的真实 WebGL 和包路径 Rapier WASM。已有网页入口（词屿、象五子棋、乌龙城）生产构建/手机浏览器冒烟和 26 项开发模式浏览器检查通过。

云环境缺 Creator 3.8.8、官方插件及两款真实 Tap 转换输入，插件下载域名受网络策略限制。仓库 `AGENTS.md` 和 `docs/operations/incremental-publication.md` 要求准确已提交候选 SHA 的增量验证，缺匹配制品属于输入阻塞，禁止伪造。因此不能把七款本地成功标为九款发布通过；待工具/制品可用后重新校验最终 base/head，正常 push dev，并核对该 head 的 CI/Pages。

本地完整日志放在 `.scratch/taptap-validation/`；外滩运行证据为 `.scratch/taptap-smoke/travel-bund-runtime.json` 和 PNG。最终候选命令、准确 SHA 及门禁结果单独保存在验证目录，不使用先前工作区测试替代候选检查。

## 官方依据

- [普通小游戏运行环境](https://developer.taptap.cn/minigameapidoc/dev/tutorial/overview/)
- [工程配置](https://developer.taptap.cn/minigameapidoc/dev/dev-support/config/)
- [窗口信息](https://developer.taptap.cn/minigameapidoc/dev/api/base/system/tap.getWindowInfo/)
- [WebAssembly 包路径接口](https://developer.taptap.cn/minigameapidoc/quick-start/guide/performance/)
- [登录态管理](https://developer.taptap.cn/minigameapidoc/dev/tutorial/open-capabilities/login-management/)
- [官方 code2Session](https://developer.taptap.cn/minigameapidoc/dev/server/login/code2Session/)
- [Cocos 官方转换插件](https://developer.taptap.cn/minigameapidoc/dev/engine/Cocos-Laya-Egret/)
- [上传要求](https://developer.taptap.cn/minigameapidoc/quick-start/guide/creation-improvement/)及[审核规范](https://developer.taptap.cn/minigameapidoc/tap-operation/operation-standards/review-standards/)

公开资料的 60M 与审核“20MB 以下”不同，校验采用小于 20 MiB 的保守限制，实际提交仍须核对后台和真机验收。
