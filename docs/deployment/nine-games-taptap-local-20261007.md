# 前九款 TapTap 本地续接与 CI 制品方案

## 本地结论

用户随后明确当前处于 Web/手机 Web 测试阶段：原生发布门禁改为 `MINIGAME_RELEASE_GATES=1` 时执行，默认暂缓；Web 部署及验证保留。GitHub 使用同名 Actions Variable，Tap 专项 producer 也需显式开启。以下转换阻塞是待平台验收的记录，不再默认阻塞 dev 的 Web 发布，详见 `docs/operations/incremental-publication.md`。

2026-10-07，Windows / Node 24.21.0 / pnpm 12.6.0。开始和收尾均 fetch 并核对远端 dev `695b8043cd2d8b5c35e161719830d5ce7d30d871`，无须合并。没有 reset、stash、覆盖用户文件或改动子模块；开始时象五子棋已有 gitlink 差异，之后观察到它由另一个操作切回 dev 并 pull 至 `bcaddf6`，本任务未回滚该并行操作。

已运行 `D:/tools/cocos/CocosCreator.exe`（3.8.8），两款均真实构建微信源工程。Night 使用已有 native staging 配方，原项目不被改写。下载[官方文档提供的 v1.2.2 ZIP](https://developer.taptap.cn/minigameapidoc/dev/engine/Cocos-Laya-Egret/)，归档 SHA256 固定为 `6b8a9a3cc62b6c54cefab397097babb771d9d99f90442cddff06310a4c9ed73f`；核对包名、版本及全部发行文件，依赖用归档里的 lockfile 安装且禁止生命周期脚本。转换调用归档实际导出的 `dist/converter-ts.js#convertWechatToTap`，参数与官方 Creator hook 相同，未改插件、未虚构 CLI，也未把微信目录重命名当转换。

| 游戏            | 真实微信源文件 | 官方转换文件 |                     原始转换 ZIP |
| --------------- | -------------: | -----------: | -------------------------------: |
| carding-car     |            838 |          839 | 14,305,871 bytes（约 13.64 MiB） |
| night-overwatch |             47 |           48 |     818,866 bytes（约 0.78 MiB） |

两份 ZIP 的完整路径、大小、SHA256 和 CRC 均与实际转换目录一致，但不是已验收的发布包：

- 卡丁 ZIP SHA256：`c8c62723e32c0f30b1f9ff408b4b7f15332d2df545359903553338003345af7f`。
- Night ZIP SHA256：`3976c64566fba98c5ab66637d1c6f17d93a5f4e7a0f7a583dd9a0fce13e8bfa3`。
- 卡丁 canonical/native source hash：`96fe60f515e92a9f3685d73b4e312da359359181a91fe9ed079c7e0a0f306603`。
- Night canonical hash：`0a526904ba89cf3376ba7bf46a1a7fce4a98bc0d2fb94bdcc6abad0a963cfbb0`；native hash：`4ae1b43f50f05f29b968109e136d40b8e4c42dad766204389f4588a5cd6685e2`；配方 SHA256：`9f2b7fe7cec702c029417119e64977e398b9e1970d4f5e87877f3ebd7a2b057e`。

## 自动来源清单与路径

新工具 `apps/shell-minigame/scripts/taptap-cocos-inputs.mjs` 支持实际构建/转换和现有产物采集两种方式。`--build` 调用已有真实 Creator builder；Night 仍使用受指纹约束的 native staging。所有目标目录独占创建，拒绝与输入重叠，不覆盖已有目录。

```powershell
node apps/shell-minigame/scripts/taptap-cocos-inputs.mjs --build `
  --game carding-car `
  --plugin-dir .scratch/taptap-local/tools/plugin/taptap-minigame-tools `
  --plugin-archive .scratch/taptap-local/tools/tap-minigame-ts-1.2.2.zip `
  --output .scratch/taptap-local/carding-car/fresh-inputs
```

Night 替换游戏 ID 和输出路径。已有微信构建与转换目录可用 `--source-dir`、`--converted-dir` 代替 `--build`，工具同样复验当前 canonical/native hash、Creator 3.8.8、target、settings、插件发行文件和原始 ZIP。

本次实际输入副本位于 `.scratch/taptap-local/<game>/inputs/`，包含：

- `source/`、`converted/`：完整输入副本，保留原构建/转换目录。
- `source-inventory.json`：自动生成的源路径、canonical/native hash、Night 配方及全部文件清单。
- `raw-game.zip`：原样复制的官方转换 ZIP。
- `inputs-manifest.json`：文件清单、Git SHA、运行批次、插件/ZIP 指纹及验证边界；本地脏工作区明确为 `candidateClean=false`，不得充当已提交候选证据。
- `inputs.json`、`use-inputs.ps1`：自动生成的五项 scoped 路径。AppID/API 未配置；`PACKAGE_FILE` 留空，因为原始 ZIP 早于登录副本，不能拿它顶替重新打包后的 ZIP。

```powershell
. .scratch/taptap-local/carding-car/inputs/use-inputs.ps1
. .scratch/taptap-local/night-overwatch/inputs/use-inputs.ps1
node apps/shell-minigame/scripts/taptap-build.mjs --all --preview --output .scratch/taptap-local/imported
```

该命令实际保留七款成功源工程、报告两款阻塞，退出码为 1。卡丁存在独立 `inputs/login/` 空身份预览副本；Night 的预览校验失败，未生成假登录成功副本。工具和包都保留 `officialToolVerified=false`、`realDeviceVerified=false`。

## 仍未通过的门禁

1. 卡丁官方转换对 `application.f211f.js` 等 JS 做了 Babel 改写，原导入器的逐文件资源保真检查拒绝该变动。未把 JS 全部列为可变资源；后续工程修复需要对固定插件的确定性转换逐文件重放比对，保留二进制资源及未授权脚本变动的拒绝。
2. Night 官方转换入口及可达模块仍无 Tap API 边界，预览登录 staging 被拒绝。两款原始产物均没有显式完成 Cocos `wx` 引擎到 Tap 宿主的适配；不能通过加假全局或登录 helper 让它看似通过。
3. 用实际原始转换入口和实际 CommonJS companion 在 Tap-only VM 中启动：卡丁先因保留的微信好友挑战身份而拒绝，Night 报 `wx is not defined`。这是本地早期启动诊断，尚未启动引擎，也不等于官方工具或真机结论。证据 `.scratch/taptap-local/runtime-probe.json`。
4. Windows 完整宿主规则集的既有支付宝/Kuaishou文件符号链接测试需要当前账户没有的创建权限；未跳过测试、未打开系统开发者模式。候选检查若停在此环境错误，不能记为通过。

补齐 MiniApp ID 不会自动解决前两项工程问题。应先用官方 Creator 扩展和 Tap 工具核实真实宿主契约，必要时向 Tap 提交这些源工程、插件指纹和日志；确认适配方式后再修复工程、重建并重新执行门禁。

## 本次检查与修复

73 项定向检查通过，Tap 平台 20 项规则检查通过；Shell-minigame lint/typecheck 与外滩 typecheck 通过。六款 Canvas/CJS 源工程完成 Tap-only 宿主的实际触屏、存档、前后台和清理检查；外滩用安装的 Chrome 完成 DedicatedWorker 内真实 WebGL、Rapier WASM、触控和摄影流程，截图/JSON 位于 `.scratch/taptap-local/smoke/`。Playwright 缓存 Chromium 在本机报 `spawn UNKNOWN`，改用已安装的 Chrome 后相同检查通过。

修复两处实际 Windows 路径错误：Vite 模块用 `/` 导致 source inventory 漏掉全部游戏模块；外滩资源 manifest 使用 `\` 导致世界数据错误进入主包。现在用同一 workspace 边界筛选模块，并统一资源 manifest 为 `/`，主包门禁不变。目录链接检查在 Windows 使用 junction，保留拒绝链接输入的断言；历史精确摘要测试使用 Git 的 LF 表示，未知新增执行内容仍拒绝。

完整宿主规则集为 111 项，108 通过、3 项文件 symlink 测试因 Windows `EPERM` 失败，0 跳过。准确候选初轮又发现发布分类夹具读取 CRLF、而 Git 基线与固定摘要为 LF，五项旧夹具失败；仅将这些夹具读取统一为 Git 的 LF 表示，生产逐字节证明保持不变。

日志在 `.scratch/taptap-local/`：`*-build.log`、`*-convert.log`、`build-nine.log`、`final-focused-tests.log`、`host-tests-final.log`、`publication-tests.log`、`smoke-seven.log`、`smoke-travel-wulong.log`。准确 base/head 存于 `candidate-base.txt`、`candidate-head.txt`，最终门禁日志为 `candidate-validation-final.log`；使用独立临时索引创建提交对象，再由原 `validate-candidate.mjs` 检查干净快照，没有改变当前 dev、真实暂存区或推送。共享源码清单修复的真实消费者覆盖九款六平台，计划据实扩展至 54 个原生目标，不把它假装成 Tap 两款专属改动。首次日志为 `candidate-validation.log`，不把工作区预览、定向测试或失败候选称为发布验收。

## GitHub CI 安全传递

新增 `.github/workflows/taptap-cocos.yml`，仅 `workflow_dispatch`，没有任意源码 SHA、外部 run ID 或下载 URL 输入。专项流程尚未在云端执行；默认 Web 阶段暂缓原生门禁，普通 CI 的 Web 检查及正常 hooks 保留。

- Windows producer checkout 明确为 `${{ github.sha }}`，递归固定子模块、冻结依赖，复用已有带校验的 Creator 3.8.8 安装器。官方插件下载后先验固定 SHA256再解压/执行；归档变化直接失败。
- 每款真实构建、转换、来源捕获后，上传 `taptap-inputs-<game>-<sha>-<run_id>-<run_attempt>`。先保存诊断输入，再执行原有导入门禁；诊断文件存在不表示 producer 门禁成功。
- Linux consumer 必须依赖整个 producer 成功，只下载**同一次运行**该准确名称的 artifact；没有 cross-run、latest、branch 或 cache 兜底。先验插件 ZIP SHA，再解压，不能执行制品内的 shell 脚本或依赖制品提供的绝对路径。
- `--verify` 将 SHA、仓库、run ID、run attempt 与调用端可信 GitHub 环境比较，要求 producer 工作树干净、consumer checkout SHA 一致；完整传输文件清单和当前 canonical/native/配方指纹都复验。source inventory 的旧绝对路径不被消费，明确从下载目录重定位。
- 消费端再次执行同一 TapTap Cocos 导入器，保持 JS/资源、登录、AppID 和配方门禁。当前两款输入将使工作流失败，不设置 `continue-on-error`；成功的普通 H5 制品不能替代这些原生输入。
- 权限只有 `contents: read`，不注入平台账户/密钥，不用 `pull_request_target` 或有特权的 `workflow_run` 消费外部产物。归档和文件清单证明字节/来源约束，不能冒充平台签名、官方工具运行或真机验收。

将其接入常规 CI 之前，先解决上述真实输入门禁并在准确候选 SHA 上手动运行。然后从共同增量计划选择 Cocos Tap 消费者，把安全重定位后的输入供给 `ci-validation.mjs`；保留目前缺输入时报错的行为，不能以此手动 workflow 替换已有 quality job。

## 需要用户操作

1. 在 Tap 开发者后台登录，为九款登记真实 MiniApp ID，配置 HTTPS 登录/API和资源域名白名单。账户登录、验证和密钥输入由用户完成。
2. 将每款 Tap secret 放入服务端 Secret Store 的 `COMPETITION_PLATFORM_CONFIG`，确认服务端可访问 code2Session；不得放入仓库、客户端、GitHub artifact或上述路径文件。AppID是客户端公开标识，secret/session_key是服务端敏感值。
3. 在 Creator 3.8.8 的扩展管理器导入固定 v1.2.2 归档、启用并确认控制台加载日志；对相同真实源工程执行官方“转换为Tap小游戏”，确认源目录与转换 ZIP。当前命令调用了真实插件函数，但未验证编辑器扩展 UI。
4. 用官方 Tap 工具打开实际转换工程/ZIP，核查是否提供 Cocos所需的 `wx`/fetch兼容契约，保存启动日志；现有本地阻塞尚未解除时不要上传作正式版本。确认适配修复并配置公开身份后，对独立登录副本重新用官方工具打包，再设置对应 `PACKAGE_FILE` / `TAPTAP_PACK_TOOL`。
5. 安卓真机使用实际 Tap 宿主检查横屏/胶囊安全区、触控与多点取消、暂停前后台、两款核心玩法及结算存档、远程资源/弱网、真实登录和身份隔离；其他七款也须完成宿主验收。本地 VM、桌面Chrome和概念图不替代这些步骤。
6. 工程门禁全部通过后，重新同步 dev，在准确提交的 base/head 上执行 `validate-candidate.mjs`，保留 hooks 正常推送，再核对该 SHA 的 GitHub CI；当前没有宣称九款已发布通过。
