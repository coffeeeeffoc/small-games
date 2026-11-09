# 夜航守望错峰发布：本地实施与验证

日期：2026-11-08。分支：`codex/night-overwatch-versioned-release`，起点 `b2a9dc3e581dc79fd60bede8c1606b7d583ad71a`。本次未提交、推送、部署、上传或提审；没有修改已有测试服、生产库和平台状态。方案及后续发布配置见[架构文档](architecture/versioned-release.md#7-本次最小实现与发布配置)。

## 已实现

1. H5 最终制品生成内容标识，请求携带 `X-Game-Build`，按渠道配置 latest 和允许新局的规则集合。HTTP/CORS、Compose、部署环境及显式控制部署覆盖一起接通。
2. 客户端启动、前台恢复和安全页面刷新版本信息。主页及设置可打开版本说明，先提交本机日志与存储，再提示退出游戏、从原入口重进；存储失败或战斗/广告/交易尚在进行时不提示可以退出。没有自动换包或自动刷新。
3. 服务端按 `run.version` / `room.version` 调用已保留的规则；旧房继续推进与离线接管，补传沿用原 requestId/seq/规则。停止旧版新局不阻止成功请求的重试。终态/回执不依赖仍可开局，也不要求旧执行器永远保留。
4. 不兼容版本不能匹配、加入或抢占旧连接。同一玩家跨版本仍受活动房约束。旧规则缺失时保留记录，拒绝拿新规则结算或退款；紧急停用和 killEpoch 保留。
5. 旧战斗奖励与配装快照写入同一份当前账号账本，旧技能目录不再替当前账号解锁。保留固定奖励的历史语义。冻结模块包含完整依赖、源/输出摘要和身份校验，已进入 Runtime 测试与部署包验证。

## 本地制品

- Creator：3.8.8，`web-mobile`，59,572,226 字节。
- 源码摘要：`ea9618f2ecae78b0b0bb7ceea126b2af4e9c07d5e197d9c840c6ccc21f1b3ced`。
- 网页 buildId：`night-47573cb8ef65134e395bcb2a840983aaf410304bb857587478db1c4163cba6ad`。
- 规则：`night-input-replay-v16` / `night-duel-v9`，当前冻结目录 9 个模块。
- 此网页 buildId 不代表未来 TapTap 包身份。API/渠道配置确定后，TapTap 构建会生成自己的 buildId。

## 验证证据

| 验证 | 结果与范围 |
| --- | --- |
| Runtime 完整无数据库测试 | 239 通过；100 项需要外部条件的测试跳过。最终串行运行，未提高超时。数据库相关 Night 验证另行执行，不能把 skipped 算通过 |
| 隔离 PostgreSQL 17.6 | 6 个测试文件、72 项全部通过：release、assets、online、chat、presence、retention。真实 HTTP 注入、SQL 事务和 A/B 不同执行逻辑；未使用线上数据 |
| 共享客户端、持久化及 H5 打包 | 135 项全部通过，包括真实浏览器 IndexedDB 事务失败/回执恢复、Night 专属版本参数、其他游戏约束、渠道和环境重打包、冻结完整性 |
| 客户端版本与构建定向回归 | 124 项通过，覆盖检查不跳页、弱网保留策略、flush 失败、保存时身份/活动变化、冷启动旧日志、创建响应丢失、不同版本重连保护等；与上行共享测试存在重叠，不累加成独立总数 |
| 部署包与游戏制品 | 11 项通过，干净 Runtime 部署包可导入冻结规则；准确 prebuilt 恢复和源码变化拒绝通过 |
| 消费者与依赖检查 | 31 项通过，新增冻结工具只选择 Runtime；浏览器夹具只允许准确的跨包边；未知路径、附加代码与缺失消费者不能通过。工作区依赖边界/循环检查通过 |
| 控制部署契约 | Linux 非 root、只读挂载下 44 项通过；全部服务操作为 mock。Windows 运行缺少 symlink 权限，改用本地临时 Linux 容器验证 |
| 类型和改动文件 lint | Night 类型检查、Runtime 类型检查与构建、全部改动 Runtime 文件 ESLint 通过；完整 lint 的既有问题见下节 |
| 真实 Creator 浏览器 | 568×320、844×390、1280×720 首页/版本页/保存说明共 9 张 QA 图。真实 Runtime/PG 的正式单人局保持 recording；恢复前台检查不刷新、不弹出战斗面板，玩家主动退局后才出现保存完成提示 |
| 上架材料复用 | 八类资料的 11 个当前代表文件与上一份核验摘要一致。保留原采集身份；新版本提示截图只作 QA，不冒充新拍的正式宣传素材 |

机器证据在 [reports/versioned-release/evidence.json](../reports/versioned-release/evidence.json)，材料检查在 [publishing-check.json](../reports/versioned-release/publishing-check.json)。代表画面：[小屏主页](../reports/versioned-release/home-568.png)、[小屏版本页](../reports/versioned-release/version-568.png)、[保存完成](../reports/versioned-release/saved-844.png)。浏览器使用临时 release 策略推荐一个测试 build，API 通过测试路由指向隔离服务，未伪造游戏对局或修改模拟状态。

本机 Docker 普通卷的 WAL fsync 曾导致既有 5/15 秒测试超时；最终改用独立 tmpfs PostgreSQL 测试卷，保持数据库 fsync 和测试超时不变，72 项通过。它验证事务与幂等性，不声称验证服务器断电耐久性。所有本次测试创建的容器、卷、网络和子进程均由测试归属检查后清理。

## 已确认的基线问题

全量游戏测试首次 463 项中 458 通过、5 失败，其中本次构建 fixture 少复制规则声明源文件的问题已修复并复测。最终除耗时的 missions 文件外重跑 342 项：338 通过，以下 4 项失败均在起点提交的干净源码副本独立复现（该基线子集 20 项中 16 通过、4 失败）：

- `extraction.test.ts`：in-flight rounds finish and friendly loss still wins over extraction success。
- `mission-progress.test.ts`：旧敌人数断言仍期望 `[4,6,8,12,16]`，当前关卡为 `[28,42,56,60,64]`。
- `priority.test.ts`：priority uses the same warmup, cooldown, range and damage as real attacks without mutating state。
- `training.test.ts`：旧前三关数量断言期望 `[4,6,8]`，当前为 `[28,42,56]`。

`missions.test.ts` 的 120 关实际模拟及另外 2 项关卡校验已在全量运行通过，完整游戏测试约 827 秒。此次没有放宽或删除这四项断言，也没有把项目全量测试记录为全绿。

Runtime 完整 ESLint 被未改动的 `tests/ranked-runs.test.ts` 的 `max-lines` 既有警告阻断；本次所有改动文件单独 ESLint 无警告。

## 复现入口与未验收范围

- `pnpm --filter @coffeeeeffoc/runtime-api test`；低资源机器可在构建后使用 `pnpm --filter @coffeeeeffoc/runtime-api exec vitest run --fileParallelism=false`，冻结契约另用 `node --test scripts/night-release-rules.test.mjs`。
- 隔离 `competition_test` 库完成本地 ownership 与 010/011/012/013/014/016/017 迁移后，设置 `COMPETITION_TEST_DATABASE_URL`，运行上述 6 个 `*.integration.test.ts`，带 `--fileParallelism=false`。不得指向线上库。
- `pnpm --filter @coffeeeeffoc/night-overwatch build` 后，令 `NIGHT_EXPECTED_SOURCE_HASH` 等于 `dist/build-info.json` 的摘要，运行 `node games/local/night-overwatch/tests/release-browser.mjs`。需 Docker Desktop、Playwright Chromium 和已构建 Runtime/Management 本地依赖；脚本创建并清理自己的服务夹具。

未验收 TapTap 真机换包、真实广告、线上实际旧 ZIP、新旧正式客户端对线上后端、远端 CI 或生产部署。当前冻结 v16/v9 是本地源码基线；首次部署前仍须核实真实线上包及有效旧局，登记对应完整规则。不能据此次本地回归承诺所有未知历史版本都能恢复交互战斗。
