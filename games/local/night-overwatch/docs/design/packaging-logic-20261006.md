# Cocos 五平台构建逻辑审计（2026-10-06）

本次为逻辑审计，不是平台验收。审计基线 HEAD `42e1578c33f4733afe0daa9ce05afd8ce9ba506e`。两款游戏的 `platforms/build.mjs` 以标准 Node 子进程调用公共 `apps/shell-minigame/scripts/cocos-platform.mjs`，无跨游戏源码 import。本记录不修改游戏源码、CI、权限或工具安装。

## 10 项逻辑矩阵

两游戏均可执行 `node games/local/<slug>/platforms/build.mjs <channel> --config-only`；真实构建去掉该参数，release 增加 `--release`。公开 AppID 通过以下环境变量提供；未预留或打包服务端 secret。

| 渠道 | 公开变量 | 卡丁车 | 夜航守望 | 环境与外部验证限制 |
|---|---|---|---|---|
| wechat | WECHAT_APP_ID | 已调用现有 `wechatgame` Creator 导出并校验 | 同左 | 缺 Creator；无原生包，宿主/真机未验 |
| bilibili | BILIBILI_APP_ID | 已调用微信格式源导出及官方 B站 builder，检查真实 adapter | 同左；复制并校验官方插件版本 1.0.3 | 缺 Creator/插件安装；不是微信包改名 |
| douyin | DOUYIN_APP_ID | 已调用 `bytedance-mini-game` 导出；无 AppID 时仅 config-only | 已调用同目标 | 缺 Creator；实际平台配置/真机未验 |
| kuaishou | KUAISHOU_APP_ID | release 缺 ID fail-fast；preview 明确阻塞 | 同左 | **实现缺口**：现代码直接 throw，未实现源导出及官方转换产物接收/验证 |
| alipay | ALIPAY_APP_ID | 独立 `alipay-mini-game` config/导出/入口/方向/完整性检查；**审计发现素材准备缺口** | 同目标与检查，无卡丁车素材复制需求 | 缺 Creator；超过 4 MiB 会失败，目前无 remoteUrl 资源发布配置 |

共 8 个 config-only 成功，2 个快手 config-only 明确阻塞；10 个 release 无 AppID 均在工具/插件检查前 fail-fast。合同测试 3/3 通过：五渠道身份验证、支付宝独立配置、manifest 防篡改。配置成功不能视为 Creator 编译成功。

公共构建后验证 `game.js`、`game.json`、横屏配置和 SHA256 文件 inventory，拒绝软链接。微信/B站/抖音另验证 `project.config.json` 的 AppID 和 Creator 3.8.8/current sourceHash 的 build-info。支付宝 AppID 不写入未经官方说明的微信格式字段，而由 manifest 记录并供开发工具关联。manifest 标明 devtools、realDevice、approval 均 false。登录/广告未配置，不发假奖励。

卡丁车原 `scripts/build.mjs:18` 调用 `prepareArt()`；其把 assets 子模块素材复制到 gitignore 的 `assets/art`。公共支付宝分支直接调用 Creator，审计时尚未执行此步骤，干净 checkout 会缺模型/纹理。已交公共 builder owner 处理；应在实际构建（非 config-only）前调用 game 专属准备步骤，不修改卡丁车 sourceHash 范围。

## 快手可信路径与未实现部分

[快手官方入口](https://open.kuaishou.com/miniGameDocs/gameDev/start/start) 链接的[引擎导出说明](https://docs.qingque.cn/d/home/eZQCnNVAKcY5kmYvimRU0L7Pt?identityId=CWQPeDTxmf) 要求引擎先导出微信格式，再在官方 DevTools 本地设置打开自动适配。工具生成 `kwaiadapter.js` 并导入 `game.js`；不能把完整微信渠道上架包直接当快手包，平台判断不能只看 wx 全局对象。

因此现有阻塞并非证明 Cocos 不支持快手，也不该要求不存在的 Creator 快手插件。具体缺少：专用源导出 staging；接收由官方工具产生的转换包；检查 adapter 引用及真实来源、sourceHash/游戏一致性、快手 AppID/包预算；再生成清楚标注 host-unverified 的 manifest。必须保留未转换源与成品区别。当前未发现官方可据以实现无人值守转换的 CLI 文档，不编造 CLI/SDK，不手写假 adapter。

[官方 DevTools 2.0.6 文档](https://open.kuaishou.com/miniGameDocs/gameDev/start/devtool.html) 提供 Windows/macOS 安装；导入在登录后进行，真机和上传依赖已绑定账号。官方测试 ID `kwai_game_test_appid` 仅用于预览，不能上传，现 release 校验拒绝。当前未登录/注册/修改账号权限。

[支付宝 Creator 3.8 文档](https://docs.cocos.com/creator/3.8/manual/en/editor/publish/publish-alipay-mini-game.html) 支持独立导出和 deviceOrientation；资源超包应配置官方远程资源路径，不可忽略限制伪造成功。

## 现有 Windows CI 的实际能力

`.github/workflows/carding-car.yml` 仅 `workflow_call`，唯一输入 `reuse_ci`。Windows matrix 两款游戏固定执行 package `build`，而两份 package 的 build 都是 `web-mobile`。产物上传仅 dist、cc.d.ts、provenance；无 channel、mode、AppID 或 native artifact 输入/输出。故现有 CI **不能直接构建这 10 个原生目标**。

顶层 `ci.yml` 由 PR 或 push main/dev/test 触发，scope 选择 Cocos 后调用上述 H5 workflow，无 workflow_dispatch。`pages.yml` 有 workflow_dispatch，但调用页面验证和 H5 发布，且 main/dev/test 的手动触发可能发布 Pages；不能作为原生打包入口。本次未 dispatch。

Windows 工作流已有可信工具安装能力：cache miss 时执行卡丁车 setup，下载官方 Creator 3.8.8 Windows ZIP 并验证固定 SHA256。setup 无账号、license secret、付款或权限修改步骤；此前成功 H5 作业不能证明每个原生目标/插件都已验收。cache hit 时 Creator 下载/缓存恢复和 setup 全部跳过，因此不能假设任一现有 job 中始终有 Creator。

官方 B站插件安装代码存在：`setup --bilibili` 从 dl.hdslb.com 下载 biligame-builder 1.0.3 并核固定摘要；现 CI 的 setup 未加该参数，干净 runner 不自动具备 B站插件。支付宝/微信/抖音使用 Creator 内置目标；快手需要官方 DevTools 转换，现 CI 未安装或运行工具、未提供转换包。若未来增加原生任务，须改清楚入口与产物/配置，并对准确候选 SHA 验证；本次没有修改工作流或扩大权限。

## 严格缓存边界

卡丁车 current hash `9ec15686064d037f70f00b59a0c42ed96dba540c5b0386e668ecb5c703c9cede` 与已证 H5 归档匹配，可复用 `/tmp/cocos-verified-20261006/carding-car`，已逐文件一致恢复至游戏 dist；不等于五份原生包。

夜航 current hash `4ae1b43f50f05f29b968109e136d40b8e4c42dad766204389f4588a5cd6685e2` 与原归档 hash 不同，必要 native fullscreen 修复后不可复用该旧 H5；须 Creator 构建或取得精确匹配产物。两归档均无 native game.js/game.json。原归档 ZIP/provenance/engine/assets 指针见同目录 `artifact-audit-20261006.json`。

## 后续独立 helper 实现

已新增 `apps/shell-minigame/scripts/kuaishou-cocos-import.mjs`，导出 `inventory(directory)`、`verifyConvertedPackage(options)` 与 `importConvertedPackage` alias，供公共构建负责人接线。本 helper 不启动 DevTools、不制作 SDK、也不将包改名当转换。

参数显式提供 sourceDirectory、convertedDirectory、gameRoot、currentSourceHash、verifiedSourceInventory、appId、mode、projectConfigurationFile、appIdField。源 inventory 必须由可信 Creator staging 阶段在转换前捕获，校验阶段不自行信任当前资源。公开文档说明 DevTools 导入填写 AppID，但未证明落盘文件 schema，因此使用实际文件与字段的显式参数，并始终返回 projectConfigurationSchemaVerified=false。

源包必须匹配 Creator 3.8.8、当前 fingerprint 与可信 inventory，并有 native game.js/settings；转换包保留全部非控制源文件的路径/字节/SHA（含场景、模型、声音、WASM 与 engine），只能向原 game.js 加 adapter require，adapter 必须存在且有 ks API 边界。此检查不能认证官方工具出处，返回 conversionReceipt=unverified、officialToolVerified=false、realDeviceVerified=false。不兼容的转换入口需明确审阅，不能默默放行。

校验横屏、实际配置 AppID、资源分包入口，拒绝链接/越界/重叠分包；按[官方代码包限制](https://open.kuaishou.com/miniGameDocs/gameDev/framework/code-package) 使用主包 6 MiB、总包 30 MiB，单分包无独立更低上限。未配置 preview 对应官方 test AppID，release 拒绝此 ID。9/9 helper 测试通过；测试数据均显式标注 synthetic verification fixtures，不是官方 SDK 或真实平台产物。本记录前文直接 throw 的描述是审计基线，公共 builder 接线状态由负责人另行记录。

## 公共负责人后续接线

公共builder已补卡丁车支付宝prepareArt，并实现快手 `--config-only`（真实微信源配置）、`--prepare-source`（Creator源及转换前可信inventory）、接收实际官方转换目录与验证。两款wrapper均透传prepare-source；批量构建本地路径按游戏隔离且不进release.json。基线8/10配置结果已被后续10条配置路径替代，真实编译/工具转换仍因外部环境未运行。详见 docs/deployment/nine-games-build-20261006.md。
