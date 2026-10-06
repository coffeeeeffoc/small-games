# Shell 前九款：移动端与五平台构建

本批名单固定于 dev `e07dc06483bd7fe0b9fdfe219e06362fce3c0caf`，依据 `apps/shell-web/src/GameCatalog.tsx` 的 `featuredGameOrder` 与空搜索排序。顺序为浪湾卡丁车、围捕小队、别跑！街区围捕、词屿、此时·此地、象五子棋、外滩漫游、夜航守望、乌龙城。后续新增游戏不改变本批。Cannon 不在范围内。乌龙城保留现有 owner 在 dev `1e99fc74e055f78638322f2b9df1602736561af9` 交付的页面/100关/原生 Canvas，本批仅接入其已有 NativeGameShell 构建边界。

## 实现边界

批次入口 `apps/shell-minigame/scripts/nine-games-build.mjs` 使用固定的九款描述和五个独立平台 SDK：微信 `wx`、B站 `bl`、抖音 `tt`、快手 `ks`、支付宝 `my`。构建本地原生 Canvas/Creator 入口，不打包 H5、iframe 或 WebView。游戏规则与平台 SDK 转换分开。

围捕小队新增原生标准巡逻、接力与快练；此时·此地新增完整本地场景旅途与解说；象五采用主仓适配入口，直接复用已锁定子模块规则、电脑与战术题，未修改子模块指针。词屿复用已有原生拾词、教材、词单与存档。街区围捕修复手势取消、多指、滑出和安全区坐标映射。新页面的方案/效果图及实际 Canvas 手机截图保存在各游戏设计目录；象五适配器与证据在 `platforms/competition/xiangqi-five/`，不注册第二个游戏。

夜航的原生全屏差异在平台构建边界处理：公共构建器复制真实项目输入到独立 staging，严格核对两文件摘要后加入 HUD 浏览器按钮条件及 Platform 浏览器 API guard；实际 Creator 编译 staging，不修改编译产物。canonical H5 源码保持浏览器行为，H5 仅复用严格匹配的实际归档。manifest 分列 canonicalSourceHash、真实原生 sourceHash 与 adaptationRecipeSha256，并记录输入/输出摘要；快手源制品 inventory 同时绑定这三者及真实源目录。每次新建 staging，排除旧产物、缓存、私密配置；十项 Cocos 原生制品仍须真实 Creator 和官方适配，不能用 H5 替代。卡丁车引擎源码未改，不能用不匹配的缓存冒充已验证产物。

外滩已迁移至原生 WebGL2 Canvas + R3F createRoot，复用原 Scene、398 个原 GLB、真实 Rapier WASM 和官方 Draco JS 解码器；不依赖 React DOM、WebView 或假物理。原生 Canvas HUD 提供主页、路线、寻景、设置、帮助、暂停返回与照片手记。宿主没有 TextDecoder 时使用经过契约比对的 UTF-8 解码实现。完整远程原场景 38,142,217 字节逐文件固定 SHA256；复用现有 H5 Pages 资源，未向 Pages 复制原生包或新增重复模型。主包含 WASM、参考图、音频和许可，构建器将 wrapper/config/完整性 manifest 全计入 4,000,000 字节预算。

外滩 H5 的软件 GPU 降级限定于浏览器渲染入口：先读取真实 WebGL 渲染器，再挂载场景；明确识别 SwiftShader/llvmpipe/lavapipe 时使用现有流畅画质，并将绘制像素限制到 250,000。连续绘制提交返回后留出至少 50ms 间隔，物理仍按原 RAF 更新；首次及静止页面绘制不跳过，摄影在读取真实画布前同步绘制当前场景。玩家的画质存档不改，硬件或未能识别的 GPU 使用原策略。此入口在原生生成截断标记之后，五个原生包 payload 保持不变。软件 GPU 能力检测通过不等于完整玩法、真机或平台验收通过。

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

B站的 `game.json` 使用其必填 `appId`、`version`，并核对侧边栏/桌面入口能力；支付宝使用现行 `deviceOrientation`、自己的工程配置和代码包文件白名单，显式保留词屿教材 JSON、本批 WAV 音效及乌龙真实音效。支付宝教材读取按其官方要求使用根路径和 UTF-8，不采用微信存储/文件签名假定。Cocos 支付宝目标为官方 `alipay-mini-game`，快手要求 Creator 微信源工程经官方快手开发者工具转换并产生 kwaiadapter.js；本环境没有可验证转换产物，因此明确拒绝，不改名微信包。

45 个构建目标不是 45 次平台验收。本轮的 Node/Chromium/无 DOM VM 契约均为本地证据：真实 SDK 图片解码、音频、官方包体/基础库限制、登录绑定、广告、真实手机性能与审核仍须平台工具/设备逐款验证。产物中的 `officialToolsVerified`、`deviceVerified`、`platformLoginVerified` 不会因填写 AppID 自动变为 true。

## 证据与剩余事项

当前逐目标状态和能力矩阵见同目录 `nine-games-build-status-20261006.json` 与 `nine-games-capabilities-20261006.json`。各游戏实际浏览器/触屏截图与测试报告在游戏设计目录。外滩后续验收已运行真实 WebGL2、原 GLB 和 Rapier WASM，覆盖横竖屏菜单、移动、取消、照片、后台恢复与清理；无 DOM/无 TextDecoder 的 Worker 专项通过。浏览器宿主桥接仍是本地验证，不能当作实体手机或官方 SDK 验收。

35 个 Canvas/WebGL 原生 preview 目标完成构建和资源完整性复核；卡丁车及夜航的 10 个 Cocos 目标仍因 Creator 3.8.8/官方快手转换工具缺失而阻塞。卡丁车仅复用了严格匹配的已有 H5 引擎产物，不把它当小游戏包；夜航已恢复并严格匹配真实 canonical H5 归档（source hash `0a526904ba89cf3376ba7bf46a1a7fce4a98bc0d2fb94bdcc6abad0a963cfbb0`），原生浏览器按钮差异在独立 Creator 输入 staging 中处理；该 H5 归档不能替代五平台原生包。乌龙城共享宿主已完成安全区/胶囊映射、横竖屏与 resize 重绘，实际 CJS 包触屏验证保留关卡与存档。本轮未注册账户、购买服务、改平台权限、上传、提审或发布。

官方核对依据（2026-10-06）：[B站配置](https://miniapp.bilibili.com/small-game-doc/framework/config)、[快手流程](https://open.kuaishou.com/miniGameDocs/gameDev/start/start.html)、[快手 API](https://open.kuaishou.com/miniGameDocs/gameDev/api/api.html)、[抖音配置](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/framework/mini-game-configuration)、[支付宝配置](https://opendocs.alipay.com/mini-game/0fx941)、[支付宝文件读取](https://opendocs.alipay.com/mini-game/08urvh)。微信官网当前抓取失败，沿用仓库已核对适配层并明确保留外部验证缺口；不使用第三方资料替代官方 SDK 协议。

## 照片分包与外滩资源配置

此时·此地的 33 张原照片（包括服务端好友挑战使用的 5 张）均保留原字节，打成 5 个资源分包，每包小于 2,500,000 字节。主包使用真实 loadSubpackage 成功后才设置 SDK Image.src；失败可重试，并防止迟到回调覆盖新场景。抖音 game.json 使用 subPackages，其余平台使用各自核对的 subpackages；支付宝请求使用 dataType/status，文件/存储签名分别转换，不借用微信协议。完整性检查同时验证照片映射、实际分包入口和 SHA256。

外滩 release 另须明确提供 `MINIGAME_TRAVEL_BUND_ASSET_BASE`，为无凭据、无查询参数的公开 HTTPS 目录，并在对应平台登记合法资源域名；preview 才默认使用现有 Pages 地址。B站域名备案等要求不能因 URL 可访问而算已满足。没有登记域名、真实 SDK WASM/WebGL2/离屏图像能力验收时不能标记正式接入完成。许可文本随包保留。

受影响 H5 构建只验证此时·此地的可选照片 loader 和外滩原项目；原生包、原生源文件、设计证据均不进入 Pages 输出。部署容量仍以实际 Pages 全输出为准；本任务没有清理历史或更改托管策略。

## Cocos 打包逻辑与官方工具边界（后续整合）

两款各五渠道的 config-only 路径已实现。微信、B站、抖音调用原有真实 Creator 构建；B站须安装官方 biligame-builder（夜航核验版本1.0.3），不改名微信包。抖音无 AppID 可生成配置，但原 Creator脚本实际编译要求公开AppID，此限制不以假ID绕过。支付宝独立目标现已补上卡丁车真实素材准备，准备前后引擎 fingerprint 不变。

快手已实现微信格式源导出 staging、可信源 inventory 捕获和官方转换包接收/校验：

```sh
node games/local/carding-car/platforms/build.mjs kuaishou --config-only
# 有真实 Creator 3.8.8 后，导出中间源与可信 inventory，尚不是快手成品：
node games/local/carding-car/platforms/build.mjs kuaishou --prepare-source
# 用户在官方快手 DevTools 打开自动适配，生成真实 kwaiadapter.js 后：
# KUAISHOU_CONVERTED_DIR=/absolute/path/to/actual-converted-package
# KUAISHOU_PROJECT_CONFIG_FILE=<实际工具配置文件相对路径>
# KUAISHOU_PROJECT_APP_ID_FIELD=<实际appid或appId字段>
node games/local/carding-car/platforms/build.mjs kuaishou
```

夜航使用相同命令替换slug。中间微信源的游客模式标记仅用于Creator源导出，不是快手AppID或正式包。缺少转换产物时返回明确阻塞。校验要求源 Creator3.8.8/当前fingerprint/转换前可信inventory、场景/模型/声音/WASM/engine字节保留、真实adapter文件与入口引用、横屏、实际项目配置AppID、主6MiB/总30MiB预算及所有资源分包入口。转换入口若发生超出插入adapter的变化则拒绝并要求针对实际工具产物审阅。公开文档未证明配置落盘schema，不编造微信schema；文件/字段由实际工具产物显式指定，工具出处与schema验收仍为false。

批量构建使用 `.env.example` 的 `MINIGAME_<GAME>_KUAISHOU_{CONVERTED_DIR,SOURCE_DIR,SOURCE_INVENTORY,PROJECT_CONFIG_FILE,PROJECT_APP_ID_FIELD}`；这些仅为本地构建输入，不进客户端。单款CLI对应不带MINIGAME前缀的KUAISHOU变量；公开AppID仍用各渠道APP_ID。源 inventory 默认在游戏 reports/kuaishou-source-inventory.json。release先拒绝缺ID/官方测试ID。没有真实转换包、Creator或需配置的资源托管时，不能将逻辑检查说成产物生成。

现有 `.github/workflows/carding-car.yml` 只有 workflow_call/reuse_ci，Windows任务固定构建web-mobile，未设置原生渠道或B站插件；因此当前不能直接生成十份原生包。此轮仅调查，未修改工作流、权限、付费或触发Pages发布。

外滩其余四平台后续已补实际最终CJS无DOM场景执行：使用各自FS/request/storage签名、真实OffscreenCanvas/WebGL2/原模型/物理/参考图，包含保存设置、后台暂停恢复和清理。具体测试artifact SHA在交付报告中；不冒充官方SDK接受结果。

支付宝完整包体校验按[官方分包指南](https://opendocs.alipay.com/mini-game/08uo7z)分别计算主包与总包：保守使用主包 4,000,000 字节、主包加所有普通分包 20,000,000 字节；普通单分包没有另加假上限。现场遍历实际全部文件，包含来源与完整性 manifests，按 game.json 的 subpackages.root 分组；照片维持本地原字节分包。配置重复、重叠、非法路径、缺分包 game.js 或符号链接均拒绝。SDK 门槛与宿主限制仍须官方工具/真机验收，不能把分包配置通过当作真实加载通过。

## 夜航检查协议查询优化

正常推送的 Chromium 151 流程中，前八款完整嵌入、返回及触屏流程通过；夜航第二次返回后的暂停状态查询未在原五秒期限内完成，推送被正常 hook 阻止。补充诊断记录了真实按钮仍存在及协议查询未返回的证据，不能据此认定游戏丢按钮。

本轮仅将夜航 snapshot 查询从每次解析/销毁元素句柄的 Locator.evaluate 改为实际 iframe 的 Frame.evaluate；直开页面继续使用真实 Page。真实 Canvas 点击/触屏、两帧提交等待、原状态断言、原超时、画质及视口均保留。临时草案完整桌面与844×390触屏流程通过，耗时分别58,682ms及51,673ms；这不是整合后候选正常 hook 的通过记录。正常推送结果另以准确 SHA 和终态日志为准。

范围证明锁定原/新 Night 分支摘要，且要求所有其他分支及公共代码逐字一致、Night 目录唯一。缺基线、未知 Night 改动、词屿/公共限时变化均不获得定向范围。通用 validate-tree/validate-push 与词屿检查没有因本优化改动；Pages 对准确提交的实际选择和运行状态独立记录。

## 可审计构建与后续门禁记录

[dcf7787 完整验证记录](nine-games-verification-dcf7787.json)绑定实际35份preview产物的manifest、来源及载荷哈希、生成时间和真实生产提交；10份Cocos原生包仍明确阻塞。旧capabilities/build-status文件保留为历史记录，不能作为当前提交验证结论。报告生成时后续Windows路径测试修复仅改变测试，未重建原生载荷，也没有把报告自身提交伪造为生产提交。准确后续提交及运行终态保存在交付证据与Library源代码备份。

原生增量门禁从受审阅源码与实际平台依赖选出game/platform目标。原生专属源文件变化执行对应最终CJS包；H5专属变化不触发原生构建。外滩执行实际五渠道game.js，使用真实WebGL2、WASM、模型、触控与存储流程；浏览器SDK夹具只用于契约验证，不进入产物，不代表官方工具验收。平台专属变动只测试受影响平台。Cocos目标调用真实Creator构建，缺工具直接阻止验证，不以配置、H5或旧包替代。CI保留准确diff基线，使用与本地相同的增量计划；无基线的全量流程仍单独处理。

共享 `competition-renderer.js` 同时进入 H5 与原生，故每款选择对应 H5 和五渠道原生；公共 client 还进入卡丁车，format 不进入卡丁车。开发者辅助脚本按真实同步列表与入口引用判定。缺失或未知依赖证据会阻止发布，不能默默省略消费者。

快照位于父目录 `.scratch` 时，旧构建器的绝对路径排除会漏记真实模块输入；现在仅排除仓库内部生成目录。这个修正只改变 Vite 来源清单，不改变游戏载荷、Cocos 分支或编译参数。只有锁定旧/新完整文件及全部其他字节的证明才允许定向验证 35 个 Vite 目标；其他构建器变化仍要求真实 Cocos 验证。词屿最终 CJS 流程会先验证必需原生模块及当前源码 SHA，已保存不完整旧清单被拒绝的真实负例。
