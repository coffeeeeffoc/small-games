# 准确候选版本的增量发布验证

日常 `deploy:admin` / `deploy:company` 只执行目标构建、制品对应、发布保护、健康与回滚，不从固定历史基线重复调用 validatePush 或测试浏览器。本地长时候选校验按需显式触发，CI 继续独立校验。SSH/脱敏进度工具是官网与管理 API/UI 的真实共享消费者，按精确文件分类；后台构建规划仅编译实际运行导出，管理 UI 的稳定只读挂载通过原有 ingress 事务一次准备，普通后台发布只切管理版本。

可选服务配置仅改变围捕小队、街区追捕和象五子棋的联网策略。六个共享 producer/resolver 文件的已审阅 base/head 摘要及运行时 proof 一起证明卡丁车、夜航的 Creator 源码未变；仅对这一精确增量免除两款的引擎重建，其他 Canvas 制品仍保留真实依赖图。额外字节、不同基线、缺失或复制 proof、同次修改 Creator 输入均恢复完整门禁。TapTap 登录工具摘要会使旧的 native provenance 失效，因此仍运行 importer、官方转换输入及登录契约；正式打包必须按当前工具重新转换和记录，不能把旧 provenance 当成当前验收。

官网部署的精确脚本路径与三条根命令由 `companyDeploymentScopePaths` 分类，仅选择 `apps/company-web` 和部署契约测试。`deploy:company` 发布/回滚静态版本，`deploy:caddy` 独立维护入口；范围包含共享 SSH/摘要工具、`infra/caddy` 的 Compose 事务、卷备份 Python、恢复/权限/轮换测试及 systemd service/timer，并保留旧路径的删除分类。普通官网发布不操作容器，运维不改变游戏后端或公开范围。包体隔离、Linux/WSL 故障回退与官网现有浏览器检查保留；未知同级脚本仍阻断。

Optional, separately approved competition HTTPS ingress uses the exact `competitionIngressScopePaths` list. It checks company/Runtime and finite proxy contracts without adding unrelated game browsers. Two Runtime proxy-default producer changes have separate byte-bound proofs; unknown sibling tools or extra executable changes still block. Real cached-image syntax, backup restore, TLS, source headers and 429 acceptance remain mandatory; mock tests do not establish those outcomes. See [the ingress runbook](competition-ingress.md).

使用 Node 24.21.0 / pnpm 12.6.0。先读取远端 dev 的准确 SHA，获取最新提交，正常合并并保留并行改动。候选必须已经提交；禁止把合并前的验证记录当作合并后结果。

统一包体入口 `scripts/build-games.mjs`、对应 `build-games.test.mjs`、版本化配置 `game-build.local.mjs` 和 `infra/builds/games.example.mjs`（兼容旧 JSON 模板）按精确路径选择三款 H5 消费者，未知同级文件仍拒绝。契约测试覆盖完整批次预检、H5 应用配置隔离、原生目标拒绝和 H5 ZIP 保留；入口不自动上传或运行全量验收。`h5-taptap-build.mjs` 的安全输出目录及显式批次 ID 继续受原 H5 保留/恢复测试约束。

## 按需运行本地候选校验

普通 `git push` 的 `pre-push` 仅提示手动命令，不自动执行长时校验。`core.hooksPath` 与 `pre-commit` 格式检查保留；Git 的非快进保护和远端接收检查仍生效。需要完整增量校验时，先提交并同步远端，再运行 `pnpm validate:candidate --base <远端准确SHA> --head <候选准确SHA>`。原始 `pnpm validate:push` stdin 协议及 `pnpm push:no-verify` 兼容入口继续保留。

2026-10-24 全屏移除由 `fullscreen-removal-scope.mjs` 绑定已审阅的共享文件前后摘要，以及控制器／副本／旧工具的原始摘要和候选树不存在证明；游戏删除保留真实游戏消费者，公共控制器与命令调整保留游戏和 Shell 消费者。Pages 范围规划与候选执行共用这套分类及候选树查询，避免规划通过后执行阶段遗漏证明。未知字节、复活文件和重命名仍阻断；`test:no-fullscreen` 检查普通 Web 入口不再提供全屏调用。

CI 将同一冻结计划分为三个隔离 runner：`core` 保留构建、静态／规则、Shell 全部选中游戏嵌入、其他游戏专项、Tap 恢复、原生及后台／管理台检查；`castle` 仅承担原 Castle 四尺寸专项；`standalone` 承担末尾所有选中游戏桌面／触屏独立入口及 builtin smoke。各阶段仍走候选真实依赖构建及 Creator 制品校验，不共享会被 fixture 改写的输出，每个阶段上限 90 分钟。最终 `quality` 无条件汇总必要 jobs 和三份当前 run 的成功凭据，核对同一 SHA、base、冻结计划及实际 `incrementalScope` 摘要；失败、取消、缺失、重复、未知阶段及意外跳过均不能通过。无增量 base 时，core 继续执行原五项 aggregate：`test`、`test:contract`、`test:integration`、`test:dialogs`、`smoke`，其他阶段明确委托给 core。本地未指定阶段的 `validate:candidate`／`validateTree` 路径保持原完整串行顺序。

CI 的 dev push 基线由 `ci-baseline.mjs` 查询本仓库 `ci.yml` 最新成功 dev push（固定 workflow、branch=dev、event=push、status=success），核对仓库、40 位 SHA、Git 对象存在及祖先关系后，通过既有 `PAGES_VALIDATED_BASE` 注入共享 selector。首次无记录、API 失败或身份／SHA 不符直接阻断，不退回 Pages 或空 diff；其他分支和 PR 保留原比较方式，Pages 本身仍使用成功 Pages 基线。2026-10-27 的串行超时修复需从最后成功主 CI `64aa76f4baa0949a1e3eddf40a6c28bcc45a5b8a` 累计验证；已有成功 Pages 不会推进主 CI 基线。推送最终候选后，核对 plan 的 base/head、三个阶段及 `quality` 全部成功，并将运行 URL 与最终 SHA 一起留证。

未显式执行时没有本地候选校验通过记录，远端 CI/Pages 仍可能失败。正式发布的候选验证及部署验收继续按本文执行；不能把普通推送当作验证通过。

## 当前 Web 测试阶段与原生发布开关

`MINIGAME_RELEASE_GATES` 默认未设置或为 `0`：保留准确候选、格式、注册、依赖边界、构建、类型、lint、规则及 Web/手机 Web 的真实入口和触屏检查；暂缓各原生小游戏平台的构建、转换、资源包和宿主冒烟门禁。日志明确记录 deferred，不表示原生平台通过。Cocos 的 Web 产物和引擎声明仍须来自 Creator 3.8.8 或源码匹配的真实制品。

正式开始平台接入验收时，本地设置 `$env:MINIGAME_RELEASE_GATES='1'`，再显式执行候选校验；GitHub 仓库 Actions Variable `MINIGAME_RELEASE_GATES=1` 控制 CI 的同一门禁，并启用 TapTap Cocos 专项 workflow。仅接受 `0`/`1`，无效值报错。未配置变量时 dev 的 Web/手机 Web 部署不受未验收原生包阻塞。显式运行原生 build、转换、导入或 ZIP 验证工具仍执行它们自己的完整校验，不受此开关豁免。下面原生验收要求在开启后执行，Web 发布要求始终执行。

```sh
git ls-remote origin refs/heads/dev
git fetch origin dev
# 必要时正常合并 FETCH_HEAD，解决冲突后重新提交
pnpm validate:candidate --base <远端准确SHA> --head <合并后的候选准确SHA>
git push origin <已验证候选SHA>:refs/heads/dev
```

手动候选命令与原始 stdin 校验入口复用 `validatePush`：每对 base/head 使用独立、准确 SHA 的 worktree，递归固定 gitlinks，安装冻结依赖并检查生成输入；不使用脏工作区文件，不以当前 HEAD 或旧 tracking ref 替代实际推送 SHA。原始入口的多 ref 分别检查，相同 SHA 对去重。候选命令完成后输出含 base/head 的验证记录；失败不会输出通过记录。保存完整命令、日志、环境和该记录。

本地候选校验与 CI 共用浏览器准备流程：仅在需要浏览器时，从候选自身的 `node_modules` 使用锁定版本的 Playwright 解析 Chromium，复用默认共享缓存或 `PLAYWRIGHT_BROWSERS_PATH` 指定的位置。已有匹配浏览器时直接检查启动；默认浏览器缺失时才安装完整 Chromium，CI 此时同时安装 Linux 系统依赖。`PLAYWRIGHT_EXECUTABLE_PATH` / `CHROMIUM_PATH` 可显式指定可用浏览器，校验会保留并检查所用路径，不下载替代浏览器，也不自动猜测本机 Chrome 安装位置。H5 浏览器范围确定后先检查浏览器能否启动，再运行构建和测试；下载或启动失败会阻断校验，不跳过断言。Linux 缺系统依赖时在环境初始化阶段运行 `pnpm exec playwright install --with-deps chromium`；云环境需放行下载域名或预装匹配浏览器，安装与校验使用同一共享缓存。纯文档、元数据和无需浏览器的纯规则改动不下载或启动浏览器。

本地 TapTap H5 一键部署显式使用 `browser-preparation.mjs --reuse-installed`：缓存浏览器无法启动时继续尝试本机 Chrome / Edge 的标准安装位置，找到能启动的浏览器即复用，全部不可用时才安装或重装匹配 Chromium；明确配置的无效路径仍阻断。这个可选模式不改变候选校验和 CI 的默认选择规则。

围捕小队的 H5 竞赛构建声明 `online: false`，关闭离线包中旧共享后端的好友 PK 入口。TapTap SDK 好友房由独立 `tapServices` 配置启用，保留原生联机能力。只添加该声明且其余构建器字节不变时，验证范围选择围捕小队；其他构建器变化仍使用原共享范围。两款追捕游戏的离线声明均只接受布尔 `false`，其他游戏不接受此声明。

增量层运行格式、注册、依赖边界检查及直接变更项目的构建/规则测试和实际依赖闭包的类型与 lint。Shell 的有限 jsdom 接入契约覆盖目录、模式参数、重载、独立入口及沉浸消息/返回流程。游戏接入使用已有注册结构化 diff；同一 Shell 目录中的单款注册及 workspace wiring 不算通用共享组件。规则模块可证明纯净时不启动浏览器；游戏界面或无法判为纯规则的本游戏代码检查该游戏。共享包按依赖闭包选择真实消费者。通用 Shell 导航检查词屿与象五子棋两个入口家族，使用真实鼠标和手机触屏走通 iframe/独立入口。选择后的构建不调用会准备全部游戏的 Shell `build:pages`。未知仓库级共享路径或无法识别的注册/工具链变化必须定义范围后重试；不能静默改跑全量，也不能伪报通过。新增分支需明确已有比较基线，hook 不猜基线。

入口测试使用语义选择器与实际页面状态，不依赖皮肤、坐标或自动接受截图。主页必须可见，开始后棋盘可操作，暂停/主页/返回目录路径及未完成拼写恢复须保持。入口和导航行为变更必须同步更新测试契约，行为回归仍应失败。增量门禁不能保证大改零失败，线上 CI/Pages 是独立验收；保留其全量兜底和部署检查。

原生冒烟工具的明确消费者为 `shell-minigame`，改动时执行该宿主的构建、类型、lint、规则测试和实际 smoke。开发模式浏览器工具仅对可证明的游戏 ID 条件与已有乌龙城手机入口断言变化进行定向分类，检查相关注册游戏并保留公共导航样本；共通执行代码变化仍需定义范围。已有注册游戏新增原生 Canvas 接线时，锁文件必须逐块证明新增 workspace 链接及对应 manifest，并要求其余字节与基线一致；外部依赖、resolution、重复块或不能证明的变化继续阻断。

GitHub API 修改分支不会触发本地 hook。正式发布的云端、worktree、API 路径仍须在更新 ref **之前**用上述命令验证最终候选 SHA；如果 ref 已变化，重新合并、生成候选并重新验证。当前未启用远端分支保护，因此 API/忽略 hook 的发布只能由流程要求约束，不能声称本地 hook 强制保护所有写入方式。最终交付必须核对 CI/Pages 对应 head SHA、状态和部署 URL；本地通过不等于线上发布完成。

H5 发布适配 `platforms/h5/publishing.js` 的消费者在 `publication-scopes.mjs` 显式登记；公共适配变化检查全部消费者及其浏览器入口，并运行分享清理、广告取消、频控、全屏与超时契约。各游戏只启用适合自身玩法的能力，并非所有游戏均展示广告。直接修改游戏时，执行对应分享浏览器专项；词屿和夺城令使用独立的交互专项。目录分类变化纳入 Shell 的评估完整性及筛选语义用例，并执行320、390及1280宽度的目录触屏/鼠标检查。新增部署打包和渠道配置脚本按精确路径选择契约测试，根命令只接受两条已审阅部署命令的结构化增量；未知兄弟脚本仍阻断。Game Runtime Service、Management Service、广告运行层和抖音适配的直接修改还运行对应包的完整规则测试。部署包验证不改变 dev/main 仅发布前端的工作流，未触及的 Cocos 画面不因后端打包而重建。

Cocos 输入仍严格要求 Creator 3.8.8，或 source hash 匹配且包含 `dist/index.html`、`dist/build-info.json` 和 `cc.d.ts` 的产物，通过既有验证后才查 Turbo 缓存。`KART_PREBUILT_DIR` / `NIGHT_OVERWATCH_PREBUILT_DIR` 可指向匹配制品。源码/运行素材变化需要 Creator 环境重建；源码未改可复用 Windows 缓存并由 Linux 验证。缺递归 gitlinks/素材、缺匹配制品及编辑器、工具链不符均属于明确环境/输入阻塞，区别于规则/导航断言失败；禁止伪造编辑器、声明或制品来通过。

Pages 全量回归保持每个游戏的全部阶段在同一片内，以 300000 ms 的估算预算自动增加排队分片；工作流仍最多四片并发。目录增长超过四片容量时不能压低耗时、丢游戏或删除预算断言。未测量游戏暂用 30000 ms，并在计划日志列出；这只是调度估算，不是实际运行时限或实测通过证明。`scripts/pages-regression-timings.json` 的耗时只能根据相同生产浏览器流程的完整成功诊断更新，同时保留来源 run/SHA；失败或跳过阶段不能作为更短的替代记录。单款估算超过预算时阻塞并核查实测与运行成本，不拆散或跳过该款断言。分片/耗时文件变化在本地增量门禁只运行有限的规划测试，线上仍执行所选全部游戏。

本次前九款新增工具使用 `scripts/nine-native-scope.mjs` 的七个精确路径：共享 competition guard 仅接受原四渠道后增加支付宝且其他字节完全不变；六个新入口或测试文件必须符合人工审阅源码摘要、固定 import 和游戏名单，未知兄弟文件与其他执行代码继续阻塞。范围含真实游戏包与原生宿主，按 workspace 依赖图计算类型和 lint 消费者。原生工具变更运行对应五渠道 preview 构建与实际 CJS 流程，不因原生专属接线自动选择无变化的 H5 浏览器页面；B站入口触屏流程显式启用 `BILIBILI_BROWSER=1`。

`nine-lock-scope.mjs` 单独证明支付宝新 importer、宿主 workspace link 与外滩两项固定直接工具依赖。支付宝工具完全复用基线 importer tuple；外滩 draco3d 1.5.7、esbuild 0.28.2 已在基线唯一 package/snapshot 中锁定，新增直接 tuple 必须匹配 manifest，不得产生新 resolution。移除这些已证明增量后，整个锁文件必须与基线逐字一致；错误 link、重复 importer、额外依赖、外部版本/integrity 更新、manifest 不符或缺基线均不分类。该证明不能覆盖注册结构破坏或同次推送混入的其他未知路径。

三款 TapTap 服务的默认门禁不依赖 `MINIGAME_RELEASE_GATES=1`。`tap-services.test.mjs`、`tap-services.browser.mjs` 和统一 `check-tap-multiplayer.mjs` 串行执行；后者固定运行联机规则、三款启用配置的原生源码 bundle 注入和六个 H5/Canvas 双端浏览器入口。平台包 `platforms/taptap` 的完整规则测试也在默认门禁执行。服务入口、构建注入输入及其实际静态 import 依赖变化会触发这些检查，包括引擎、关卡和渲染器单独变更。原生专属入口即使没有 H5 浏览器范围，也先准备并检查浏览器；准备或任一步失败均阻断。Tap 浏览器 fixture 结束后始终使用候选真实环境串行重建三款 H5，避免后续检查或发布使用 fixture AppID；失败时保留原始测试错误，重建失败同样阻断。追捕实时版的开始/重开、广告及前后台回归 `start-lifecycle.browser.mjs` 已纳入发布浏览器专项。

三款 H5 服务的七个共享模块在原生图中显式登记为空消费者；活动原生入口若实际导入这些模块，仍追加并追踪其真实消费者。未知同级平台模块继续选择剩余六款原生消费者并保留 Creator 门禁。

象五子棋原生入口及两个测试、九款 Canvas 冒烟保留早期精确证明，并新增 `ba88e46a0f7f7fb5c37c28a20c8eae7a0319eece`（最后成功 Pages）和 `457bc63c47b631a1f932b35f48e6b166f408ab2d`（最新 dev，相关文件与 `96315a0` 相同）的完整 base/head 摘要、固定 import 与目录身份核查。TapTap 冒烟仅接受象棋准备页新增点击的完整字节差异，以不可复制的证明限定为象棋 TapTap 消费者；其他分支、未知基线、陈旧/复制证明、额外 Creator 输入仍恢复真实范围。固定历史 fixture `c010423731cc22fb0657a4a86ac9811e1997bbc1` 不随工作树更新。

历史评审工具按三个准确路径选择各自游戏对与 runtime-api；子模块弹层脚本核对固定四款名单，选取四款生产构建和实际弹层浏览器。实时追捕 TapTap 预设只接受单游戏、布尔广告/后端开关及公开广告位的已知结构，额外字段或游戏拒绝分类。`check-staged-format` 的实现或测试变化实际触发 `test:hooks`。这些映射不豁免未知同级脚本，也不把开发用后台评审工具视为已完成真实平台验收。

清理历史文件仍经过真实 Git `--name-status -z` 删除/重命名门禁。两款追捕游戏本次移除的 15 个旧诊断/关卡生成脚本及重复 npm 锁文件，仅在准确路径、基线完整字节 SHA-256、唯一游戏身份和准确 HEAD 树中不存在全部成立时允许增量验证；最后成功 Pages 与 dev 的原文件字节已分别核对。删除路径继续保留在各游戏的规则、构建与发布浏览器范围中，不归为空范围。未知删除、不同基线内容、任何重命名（含已审阅源文件）或树读取失败，继续触发原有全量回归/严格候选阻断。

五款本地游戏的删除范围由 `local-game-retirement-scope.mjs` 和精确审阅表证明：固定 Git tree 绑定被移除的源码、文档及二进制素材，候选树必须证明目录消失；其余编辑绑定准确 base/head 字节。仍被其他游戏使用的确认音效迁至公共资源位置，额外绑定原始 Git blob，输出字节不变。只接受删除和这一条已绑定原始 blob 的 R100 音效迁移。未知路径、额外字节、读取失败或复制 scope 数组均不能借用该证明；Web 目录及真实依赖消费者仍执行增量检查。

保存的 Pages 基线 `4e97662f` 同时早于橘风速递下线和摆消乐改名。`deliveryRenameRetirementReviews` 保留原下线表，另绑定同一被删目录 tree 及 24 个共享文件的完整前后摘要；锁文件只删除橘风速递 importer 与 Shell 链接，再替换摆消乐标识，其余 resolution 与 snapshot 字节不变。目录、manifest 和 metadata 保留 Shell 与摆消乐消费者，锁文件另保留 Minigame、Runtime；累计入口、浏览器操作和分享协议保留 Waterline Station、天下岔路、Flick Arena、Ball Roguelite 与 Ember Bounce 对应消费者。216 条改名路径独立证明，目标文件继续正常游戏验证；未知字节、复制审阅表或 scope、读取失败不能借用累计证明。

配送游戏从 `4e97662f` 起的累计删除证明独立绑定原始目录 tree、候选目录消失和目录注册移除，避免其他游戏后续更新使已审阅删除失效。保留文件分别校验原有前后摘要；锁文件还绑定 Shell manifest 的精确摘要，漂移文件交回普通消费者分类。版本登记仅在移除已证明退休项后复用原有结构校验，拒绝未知字段、来源、历史格式和其他游戏删除；真实 Shell 与本次游戏消费者继续执行，未知删除、重命名和复制证明仍阻断。

目录清理的后续精确审阅同时支持本地目录和 Git submodule 根删除：gitlink 必须绑定原始 `160000` 模式、提交和路径，候选树必须确认消失。保留的词库导出器迁移绑定原始 blob；词库模块的一行来源注释清理绑定完整前后字节且测试确认可执行内容不变，因此不触发其间接 TapTap 消费者的引擎重建。复制 proof、额外代码或查询失败仍恢复真实依赖门禁；目录、部署替换和保留游戏入口继续验证。

merge-front 改为第六款 Creator 工程。CI Producer 保留已有五款的校验并增加本款；通用矩阵用目录执行脚本以兼容不同包名。针对 `39388e3a89df1b1a0d573bb800016fdbfbc4ac86` 的准确字节证明只覆盖本次广告、制品与入口接线；额外改动恢复既有消费者检查。旧Canvas入口等10个文件的删除绑定原始摘要和HEAD不存在证明。`MERGE_FRONT_PREBUILT_DIR` 与其余Creator产物一样，须同时通过源码和输出摘要校验。

最后成功 Pages 的 `39388e3a89df1b1a0d573bb800016fdbfbc4ac86` 到 `b652c346dfdee952194c2ab267c167894b7718e4` 同时包含 Merge 与 Bullet 接线。四个已有工作流、`pnpm-lock.yaml`、`turbo.json` 的累计证明分别绑定完整前后字节，核对两款唯一 registry/package 身份、Creator 版本及构建命令，并选择两款实际消费者及 Creator/浏览器验证。原单步证明保留；额外字节、未知路径或身份冲突仍阻断。历史树缺少 Bullet manifest 时只放弃 Bullet 锁文件证明，继续尝试原有 Admin 等独立证明，不改变未知范围的最终拒绝。

Merge 宿主冒烟检查使用沉浸式 Creator 契约：准确 iframe 地址与标题、可见画布、已就绪首页及可用开始控件、可用返回目录按钮。分享、前进后退、刷新、手机独立入口、资源完整性和 Runtime 隔离检查保留。修复范围分别绑定最后成功 Pages 与 `5af700e8` 的原脚本及修复后完整字节，核对唯一 Merge 身份并选择 Shell 和 Merge 消费者；额外编辑不能沿用该证明。

当前 main 集成以 `0459b0cb3c89a748f3a6bd252858951ba1ca073d` 为精确基线，历史正例固定在 `bf68adb31aaf27be4f809c5e875aa8babee8c147`。删除证明复用 27 项既有 Git tree/gitlink 条目并确认 HEAD 中不存在；16 个非文档重命名分别绑定原路径、新路径、Git 状态和前后 blob。证明仅授权源路径删除，保留目标继续进入真实工作区、Creator 或原生消费者验证。额外删除、目标漂移、复活目录、读取失败和复制的 scope 数组均不能取得删除证明，旧 main 区间不变。

23 个累计共享文件分别绑定前后完整字节和唯一 package/game 身份。工作流和 Turbo 接线选择对应 Creator 消费者；锁文件还绑定 8 个相关 manifest。该锁文件只删除已退役 importer、移除其 workspace link，并复用基线已有的 5 个开发依赖 tuple；其余 resolution、integrity 和 snapshot 未变。Shell 的三个目录文件仍触发目录上线和导航检查。迁移后的音效按实际复制关系选择三个游戏的六个平台；平台进程、游戏配置、词库导出和部署迁移文件复制均执行对应工具测试。未知文件或额外共享字节仍拒绝分类，不降为全量。

数据库迁移映射到 Management 与 Studio 的规则、构建和类型检查。日常 Pages 质量门禁不要求 Docker，也不执行后台部署或数据库迁移；真实 PostgreSQL 升级与对象库存取属于独立的 `test:platform` 验收，不能用内存接口测试声称已经验证。

Tower Brake 改为第八款 Creator 工程。四个既有工作流、Turbo 与锁文件绑定完整前后摘要，最后保存的 Pages `cbee0202b8cd6ea3f5dd626851a10e6dd602dd75` 和迁移基线 `a0b4e324c26655fabcb049d40ba0c4508b051621` 的对应输入相同。核对唯一 registry/package、输出目录、Creator 3.8.8 与实际构建命令；锁文件只复用已锁定的 Playwright/TypeScript tuple，并核对 manifest。旧 Canvas 入口/渲染/样式、排行包装及两份被整合的浏览器脚本删除绑定原始完整摘要及候选树不存在，仍选择 Tower 真实消费者。未知字节、身份冲突或重命名继续拒绝分类。
街区追捕城市重构的10个旧运行／测试文件删除，以最近成功 Pages `cbee0202` 的逐文件SHA-256登记。仅允许准确的单路径删除，并核对候选树确实不存在、保留游戏的唯一目录与注册身份；相同路径的改写字节、复活文件、重命名及未知相邻删除仍阻断。删除路径继续进入街区追捕的规则、构建与浏览器范围，不授予空消费者证明。dev 累计比较仍使用最近成功上线基线，不能用中间未发布提交避开回归；契约覆盖街区追捕重构后追加归途站更新时，两款游戏都保留在实际验收中。

重力方舱的 Creator 迁移按 90aae860 基线逐文件绑定构建工作流、广告配置及入口路由的完整字节；锁文件只增加既有的 Playwright/TypeScript tuple，保留其余 resolution。三项旧 DOM 入口删除和三项公共脚本原样搬迁分别校验原文件、目标文件、Git 状态与游戏唯一身份。游戏仍执行真实 Creator 构建和画布触控；公共广告配置的摘要变化同时保留归途站消费者，未知改动不能沿用本次证明。

Tower 与并行合入的 Tetracube 构成九款 Creator Producer。组合证明绑定工作流、Turbo、锁文件与全屏副本路由共七个文件的最终完整摘要：从保存的 Pages 基线比较选择两款，从 `731dfd1188fc6a5a0f444bd0f1bb2d9a4c966d74` 比较选择 Tower；两种情况都校验两款完整身份与锁文件 manifest。原单款证明和 Tetracube 精确迁移证明保留，额外字节与未知基线继续阻断。

一炮拆城改为第十一款 Creator Web 工程。本次精确证明以 0fadabdfc6d3144f36ef9ff004e0fc14e54e3e4d 为基线，历史正例固定为 211625eada6b6835ca21a3f14168061ab36ae53d；20 个共享接线文件及测试预期绑定完整前后摘要，并核对 castle-cannon 的唯一目录、包名、dist、Creator 3.8.8 和构建命令。Shell 相关改动保留宿主消费者，开发模式保留乌龙城 fixture；额外字节、重复身份、未知路径和错误引擎均不能借用证明。实际门禁保留源码匹配的 Creator 制品、四尺寸触控、战役胜利／下一关／存档及失败重试验证。Web 不再加载全屏脚本，原生 Canvas 兼容入口另行验收。同步修复最新 dev 的横竖屏测试预期遗漏：仅补齐实际已有九个配置值，以完整前后摘要限定为空运行消费者，H5 构建矩阵契约仍执行。

一炮拆城的蓄力等待单独采用 90000 ms 预算，适应 CI 软件渲染下较慢的模拟推进；仍要求实际蓄力超过 30%、真实松手发射及原有后续交互断言。立即修复基线与迁移累计基线分别绑定完整前后字节，继续选择 Castle 和 Shell 消费者，额外改动拒绝复用此证明。场景数据按共享几何无损拆分为独立 Creator 资源，构建阶段限制每份资源低于 Git 单文件上限；生成数据不进入源码指纹，生成器与运行加载器仍参与指纹和真实引擎构建。

青花拾光新增 H5 广告、构建数组、竖屏及公开广告环境变量登记，按 `3aafcaea` 基线的四个共享文件完整前后摘要及唯一 game/source/package、真实 Cocos 源码构建身份绑定，选择本游戏；公开环境变量同时补齐灰烬防线遗漏，因此该文件也保留灰烬防线消费者。额外字节、其他基线或身份不符不获得该证明；真正共享实现修改仍覆盖全部实际 H5 消费者，包含青花拾光，通用广告契约检查不豁免。

灰烬防线构建依赖与青花拾光登记累计到同一锁文件时，以最近成功 Pages `17142333` 到 `b5105c58` 的完整前后摘要绑定；该差异只复用已有 Playwright/TypeScript tuple 并增加 Shell workspace 链接，选择两款游戏及 Shell 三个实际消费者。额外锁文件字节、依赖版本改变或消费者身份缺失仍拒绝分类。

同一累计区间内，Shell manifest 同时移除旧全屏测试命令并新增青花拾光依赖，另以完整前后摘要绑定并保留 Shell 和青花拾光消费者；既有单独全屏移除证明继续保留。

追逐游戏的独立浏览器操作模块 `apps/shell-web/scripts/game-checks/chase-thief.mjs` 按精确路径选择追逐游戏与 Shell 消费者；即使仅修复测试流程，也执行该游戏的真实嵌入／触屏回归，不能只留下通用导航样例。

青花拾光离线美术工具仅允许现有 importer 新增 three 0.180.0 的固定 devDependencies tuple，并要求该 tuple 已存在于基线其他 importer。完整 manifest 只能增加 art:render 命令和这项开发依赖，保留 Cocos 身份及普通构建；归一化后其余锁文件必须逐字等于基线。证明选择青花及实际 Shell 消费者，版本漂移、额外依赖、运行依赖、生命周期脚本或其他锁文件字节仍阻断。游戏运行与正常构建只读取已烘焙素材，不加载离线三维制作工具。

苔光花园的上架 SVG 已在 `38607c9e` 替换为 1024×1024 RGB PNG。删除门禁只接受该旧 SVG 的准确字节、单路径删除、候选树不存在，以及替代 PNG、媒体清单与资料状态的准确 Git blob；显式绑定 `moss-garden` 与 `games/local/game-moss-garden` 的唯一身份。证明只放行该删除记录，保留游戏构建、规则、浏览器和上架入口消费者；完整 `4e97662f..95b1ca81` 累计区间回归覆盖 1035 个路径。未知删除、改名、旧图复活、替代图片或记录漂移、重复身份及树读取失败仍阻断。

救援游戏的独立操作区更新保留既有专用浏览器模块的完整摘要证明，并增加使用下方操作区的准确模块摘要；仍核对真实共享委托、唯一游戏目录与原有移动／暂停／返回断言。额外字节、触屏退回场地或弱化断言不能沿用该证明，继续检查本游戏及有限 Shell 接入契约。

累计区间同时包含配送退休、摆消乐改名和青花渲染工具时，锁文件只在原退休树及注册门禁成立后组合两项既有证明：去掉唯一固定的 three 开发依赖 tuple，剩余完整字节必须等于已审阅的退休／改名结果；Shell 前后摘要和 Minigame、Runtime 的纯改名 manifest 也必须吻合。证明保留五个真实消费者，WeakMap 绑定原始最终锁文件摘要。开发模式脚本独立使用既有完整摘要，并核对 Waterline Station、摆消乐、乌龙城三项唯一身份，避免其他共享文件后续合法更新使它失去原有范围。额外字节、依赖变化、重复身份、目录复活及复制证明仍阻断。

同一区间的 Shell manifest、独立目录和游戏历史三项登记，复用 deliveryRenameRetirementReviews 已有的完整前后摘要形成独立组合证明；三项必须同时吻合，且保留原退休树与候选消失门禁、Minigame／Runtime 纯改名 manifest 和唯一游戏身份检查。各项继续选择 Shell 与摆消乐消费者，复制 scope、额外字段或字节、错误身份及查询失败不能取得证明。普通未知文件和注册专项是两道顺序断言，须同时通过，不能以只消除第一道错误作为累计范围验收。

CI 分阶段验证的游戏注册检查修复，以最近成功 CI 与当前 dev 两个基线的完整前后摘要限定。只区分计划／汇总与实际构建任务，保留递归子模块、注册检查及其负例测试；额外字节、未知路径或读取失败仍阻断。
