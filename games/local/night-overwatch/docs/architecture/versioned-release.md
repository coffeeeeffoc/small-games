# 夜航守望：H5 更新与前后端错峰发布方案

日期：2026-11-08。状态：最小方案已在 `codex/night-overwatch-versioned-release` 实施并做本地验证，未部署、上传或提审。范围：TapTap 托管 ZIP 的 H5、夜航 Runtime 与当前共享通信/存储代码；不包含 APK、TapPlay、原生小游戏或 TapTap 制造。TapTap 自动换包未接入。实施与验证见第 7 节及[验证记录](../verification-versioned-release.md)。

最初方案研究只新增文档。代码初查基线为本地 `ae2c8be08298e631ec64e225696a3206cc8ab80c`；研究期间其他工作把 HEAD 推进至 `45e818b1e81b630eeda252a0d6812d0edf4902d3`。后续获准实施时，从 `b2a9dc3e581dc79fd60bede8c1606b7d583ad71a` 新建分支，重新核对最新控制语义。线上实际版本未由此次本地验证证明。

## 1. TapTap H5 能力核查

结论：已确认 H5 ZIP 的上传、提审和审核后分发流程；**未确认托管 H5 具有可依赖的自动检测、下载、应用新包接口，也未取得“下次打开一定是最新版”的明确承诺。** 未确认不等于接口不存在。后续实现不能把这项能力当作已验收前提。

| 核查对象 | 一手依据与结论 |
| --- | --- |
| H5 运行形态 | [TapTap 官方说明](https://developer.taptap.cn/agents.md)区分 H5 与 Tap 小游戏，说明 H5 在平台域名运行。[官方 H5 接口说明源码](https://github.com/taptap/instant-games-open-mcp/blob/015f2bd391cdf697583e61d67f7320e351ff9ab2/src/features/leaderboard/docs.ts#L13-L22)明确 H5 由宿主提供 `tap`，但这不代表所有小游戏 API 都支持 |
| 管理端上传与提审 | [H5 上传处理源码](https://github.com/taptap/instant-games-open-mcp/blob/015f2bd391cdf697583e61d67f7320e351ff9ab2/src/features/h5Game/handlers.ts#L455-L502)取得 packageId 后提交包；[结果文案](https://github.com/taptap/instant-games-open-mcp/blob/015f2bd391cdf697583e61d67f7320e351ff9ab2/src/features/h5Game/messages.ts#L177-L178)说明成功返回时仍可能在审核中，不能当作玩家已换包 |
| `tap.getUpdateManager()` | [官方 UpdateManager 文档](https://developer.taptap.cn/minigameapidoc/dev/api/base/update/UpdateManager/)描述启动/热启动检查、宿主下载、ready/failed 回调及 ready 后应用更新，但只标注 TapTap 小游戏，没有 H5 适用范围或最低宿主版本证据 |
| `tap.restartMiniProgram()` | [官方文档](https://developer.taptap.cn/minigameapidoc/dev/api/navigate/tap.restartMiniProgram/)只承诺重启当前小游戏；未承诺获取最新包，H5 适用性也未明确 |
| `location.reload()` | [WHATWG 标准](https://html.spec.whatwg.org/multipage/nav-history-apis.html#dom-location-reload-dev)定义重载当前页面。由此只能确认页面重载，不能推导 TapTap 重新解析最新发布包 |
| 冷启动、返回前台、菜单重启、重启 TapTap | 未取得这些操作对托管 H5 换包时机、缓存和失败行为的明确契约，不能视为互相等价，也不能保证立即更新 |

官方 MCP 源码依据固定在 `015f2bd391cdf697583e61d67f7320e351ff9ab2`。没有找到完整 H5 注入 SDK 实现或完整能力声明；管理工具代码里缺少更新方法不能证明宿主不支持。账号连接器当前没有有效认证，因此未取得应用 987511 的最新包状态；未上传、更新或请求用户扫码。

### 1.1 由此确定的客户端策略

第一版自行完成版本检查与安全提示，把宿主换包视为独立能力。未确认 H5 的 `UpdateManager` 前，不调用假定存在的 API，不自动 reload，不宣传“下次必定已更新”。安全退出时可以提示“有新版本，完成本局后退出游戏并重新进入”，重进后再检查实际 buildId；提示是尝试更新的路径，不是成功保证。

若真机证明 H5 支持 UpdateManager，再启用对应动作：注册回调，等待下载完成，在安全点落盘后应用更新，下一次启动核对实际 buildId。仅 `typeof tap.getUpdateManager === 'function'` 或一次 success 回调不足以验收换包。未下载好、更新失败、重进仍是旧包时，不循环重启；旧包仍受支持就继续可玩，不受支持则明确阻止相关新开局并提示重试/维护。

### 1.2 真机最小验证矩阵（尚未执行）

使用两个有可见 buildId 的准确正式 H5 包 A/B，以及兼容两者的后端。A 保持打开时发布 B；B 必须已经在实际渠道上线。小游戏更新文档提示开发版/体验版不能检验正式版本更新，不能只用测试入口替代；是否同样适用于 H5 也须由宿主确认。

1. 记录手机系统、TapTap 版本、H5 包 ID/URL、buildId、API 环境、玩家 ID 与资产。只读探测 `getUpdateManager` / `restartMiniProgram` 的可见性及调用结果，不记录访问凭证。
2. 分别观察 A 持续游玩、切后台恢复、关闭游戏重进、平台菜单重启、重启 TapTap、页面 reload；每种路径核对实际 buildId 与请求日志，不以页面重新显示作为换包证据。
3. 如果更新管理器在 H5 中可用，记录 check/ready/failed 的时序、下载失败后恢复，以及落盘后 applyUpdate 是否真正加载 B。
4. 验证弱网、离线、分发尚未到达、旧资源延迟加载、同账号存档与未确认结算；不清缓存来掩盖正常更新失败。
5. 覆盖实际支持的系统与宿主版本后，登记已验证范围。未覆盖宿主保留手动重进提示，不将一次设备结果外推到所有用户。

若需要平台确认，待明确授权后再提交工单，问题应限定为：托管 ZIP 的 H5 是否支持上述接口、最低 TapTap 版本、冷/热启动检查与缓存时机、菜单重启是否解析最新发布包、正式 A/B 验证方法及回滚能力。本轮未向平台发送消息。

## 2. 采用的最小方案

采用一个 Runtime、一套账号与资产账本、一份服务端发行策略，以及有限的旧规则实现。默认流程：兼容后端先部署，H5 包提审并发布，确认真实渠道能取得新包后通知更新，停止旧规则新开局，待旧局收尾后退役旧规则。

不为每个 buildId 部署独立服务器，不新增自动下载 JS 替换审核包的机制，不引入 Service Worker / Cache Storage 或第二套账号与存档。沿用[存储架构](storage-and-view-modules.md)的 IndexedDB 事务、待同步日志和回执，不因更新清空业务数据。

### 2.1 版本信息

| 信息 | 方案 |
| --- | --- |
| `buildId` | 每个发行制品的唯一标识，打包时写入客户端与外部清单；用于定位包、更新提示及查找兼容声明，不作为权限或防作弊凭证 |
| API 版本 | 继续使用当前 `/v1` 协议；此次只加兼容字段，不另起 `/v2`。以后真正破坏协议时才新增版本 |
| 单人/联机规则 | 复用 `RANKED_RULE_VERSION` / `DUEL_VERSION`，分别管理；纯 UI、美术、文案改动不递增规则版本 |
| 榜单/经济/存档版本 | 保留现有独立语义，不用 buildId 替代 `CAMPAIGN_BOARD_VERSION`、经济版本、资产结构版本或日志结构版本 |
| 渠道发布状态 | 区分候选包、提审包、已发布包、实测可获取包；TapTap H5 与自托管网页不共用一个 latest 指针 |

构建标识应覆盖最终有效输入，包括游戏源、共享桥、构建类型、API 环境及公开渠道配置。可以使用发行序号加内容摘要；不能只使用 Git HEAD 而忽略脏工作树和构建配置。ZIP 的 SHA-256 继续作为包外完整性证据，不能要求 ZIP 在自身内容里嵌入自己的最终摘要。源码中不嵌入平台密钥。

### 2.2 元信息与服务端判定

扩展现有 `GET /games/night-overwatch`，不新建更新微服务。客户端在共享请求层携带一个有界的 `X-Game-Build` 标识；服务端用发行清单确定该包的渠道、协议及规则能力。同步调整实际 CORS 允许头，否则浏览器预检会先失败。

元信息增加独立的发布信息：目标 buildId、更新状态（无需/建议/必须）、是否允许新开局、适用的更新动作。保留现有 `version`、`versions`、`capabilities`、`boards`、`identity`，不改变旧客户端所见字段的意义。版本检查随启动和安全返回大厅刷新，恢复前台可检查但不能自动重载战斗。

新建对局按客户端声明与服务端允许集合校验；已有对局按数据库里的 game、规则版本、身份、租约和控制策略处理。buildId 不能让玩家绕过鉴权、篡改规则或领取奖励，也不能作为服务端动态 import 的路径。

不传 buildId 的历史包进入明确的 legacy 兼容分支。单人沿用其已有 version；联机未声明版本时只能映射到已经核验的历史基线，不能猜测为最新规则。初次实施前必须拿到真实线上包及其规则身份；无法识别的包不能承诺兼容。已发行老包没有新更新器，不能指望它自动执行新提示逻辑。

新包没有更新策略响应时，不因字段缺失进入无限刷新；已知仍兼容的行为可继续，新能力不可用时不开放。无法证明兼容的正式开局应明确阻止，不能静默改为无奖励练习。平台尚未提供替代包时，不以“强制升级”掩盖不可用状态；必要时按维护/安全关闭处理。

### 2.3 对局与规则保留

保留当前规则和仍有必要的上一代规则；“两代”是通常目标，不是自动删除第三代的条件。如果审核积压或旧局尚存，延后下一次破坏性规则升级或暂时保留所需版本。

新局由服务端确认规则并写入原有 `run.version` / `room.version`。动作、模拟、配装快照、回放、恢复、结果计算和榜单定位均使用该局规则，不再把所有局与单个“当前版本”比较。继续验证玩家身份、序列、回执和原有防重边界。

旧规则必须保留完整依赖闭包。现有 `night-ranked.mjs` / `night.mjs` 直接引用工作树的 Replay、Duel、Simulation、MissionCatalog、Progression 等；仅复制适配器或常量仍会读到新逻辑。建议在发行时保存可校验的服务端规则模块及其必要依赖，并随部署制品交付；版本到模块的映射仅由服务端可信配置登记。

不同不兼容规则不匹配、不互相抢房间；邀请、观战、房间列表和聊天中的加入按钮采用同样判定。相同规则的不同 H5 构建可以继续一起玩。当前活动房占用约束仍跨版本成立，不能通过换版本重复占位或重复预留资产。

单人有效行动期限沿用创建起最多 24 小时，停止旧版新开局后仍覆盖最后有效行动及必要补传缓冲。联机当前 `noTimeLimit: true`，实际 playing deadline 使用 `Number.MAX_SAFE_INTEGER`，不能套用单人 24 小时。先停止旧版新房、匹配和候场转开战，让旧房按已有离线接管和自然结束逻辑排空；确认没有有效旧房再退役。仍有有效玩家时延后退役。若以后需要硬截止，须作为单独的产品行为设计提示、结算与补偿，本方案不暗中增加踢人时限。

### 2.4 资产、补传与更新安全点

账号 UUID、官方登录映射、金币、装备及交易记录维持同一套数据。保留 requestId、runId、订单号的跨版本幂等语义，不把 buildId 拼入幂等键造成重复发奖。

旧对局结算采用其固定规则和已确认的配装/奖励依据，写入仍经过当前统一账本的事务与校验。旧目录不能覆盖整份新资产；退款、奖励和订单要按原交易版本及快照处理。已被替换的商品/奖励目录不能仅因为版本不同就导致合法旧交易重复退款或丢失。

客户端补传按日志自己的规则版本与服务端对局身份处理；先读取已存在的对局/终态，再重试原批次，不能把旧日志的版本改写成新版。尤其覆盖“开局请求已成功但响应丢失”：旧版停止新开局后，仍允许同一 requestId 找回已经创建的对局，不能因此创建一局新的旧版游戏。

更新安全点要求：无正在进行的战斗、广告或关键交易；进度和未确认意图已通过 `await storage.flush()` 提交；已经完成但未确认的结算可由下次启动继续幂等恢复。不能等待无限网络重试才允许退出，也不能把内存写入当作已保存。

当前 recorder 的冷启动恢复主要处理 finishing/cancelPending 日志，不等于跨任意规则版本恢复整个可交互战斗。此次保证旧页面正在运行的对局、原有恢复语义及旧结算补传；不额外承诺新版客户端能直接操控所有历史模拟状态。平台自动换包后，必须先处理遗留记录，再允许不冲突的新操作。

## 3. 具体改动位置

以下保留设计时的范围清单；实际实现采用第 7 节所述入口，未机械修改所有列出的文件。

| 范围 | 当前入口 | 必要改动 |
| --- | --- | --- |
| H5 发行标识 | `scripts/h5-taptap-build.mjs`、`scripts/h5-game-services.mjs`、`scripts/competition-h5-service.mjs`；游戏 `scripts/build.mjs` / `scripts/artifact.mjs` | 在最终渠道配置确定后注入 buildId/规则声明，外部清单绑定源码、配置、ZIP SHA、渠道包 ID；确保所有入口标识一致 |
| 共享通信与启动 | `platforms/competition/game-services.js`、`game-bootstrap.js`；必要时 `client.js` | 公共请求头、元信息解析、刷新与状态；每条日志按自身版本恢复；不得全局修改其他游戏的缺字段语义 |
| 后端元信息和请求校验 | `services/runtime-api/src/competition/game-routes.ts`、`routes.ts`、`src/config.ts`；CORS 控制来源 | buildId 格式和长度校验、按渠道的发行配置、版本能力返回、新开局门禁、房间版本声明；保留旧严格 schema 的兼容性 |
| 规则登记与类型 | `services/runtime-api/src/app.ts`、`competition/ranked-types.ts`、`competition/types.ts`、`rules/night-ranked.mjs`、`rules/night.mjs`、`rules/ranked-games.mjs` | 从每游戏单一当前规则扩展为当前默认加受支持规则查找；只为夜航登记历史实现，其他游戏保持原行为 |
| 单人全链路 | `competition/ranked-runs.ts`、`ranked-store.ts` | create、actions、resume、finish、receipt、boardKey 与配装/奖励均按该局规则；终态查询和重试不能被新版门禁挡住 |
| 联机全链路 | `competition/store.ts`、`game-routes.ts`、`night-chat.ts` | 匹配/列表按兼容集合过滤；房间动作、接管、观战、邀请、聊天及后台 tick 处理所有有效旧规则；跨版本占位/锁/租约保持一致 |
| 资产和退役清理 | `competition/night-assets.ts`、`ranked-maintenance.ts`，以及上述 store 中的失效处理 | 将“不是当前版本就退款/结束/清理”改为明确的受支持/退役/过期判断；原有紧急停用与 killEpoch 仍生效 |
| 玩家提示与生命周期 | 游戏 `assets/scripts/Online.ts`、`Overwatch.ts`、`OverwatchSnapshot.ts`、`HomeView.ts`、`OnlineLobbyView.ts`、`SettingsGuideView.ts` | 复用首页/大厅/设置显示构建与更新状态；先保存再执行确认过的渠道更新动作；战斗中不刷新，弱网不循环弹窗 |
| 部署和消费者 | `scripts/deployment-bundle.mjs`、`deploy-tencent.mjs`、`check-workspace-dependencies.mjs`、`publication-scopes.mjs` 及现有测试 | 两套部署源清单均包括历史规则完整依赖；准确登记新文件、构建输入与实际消费者，检查干净部署包可加载全部承诺版本 |

发行策略第一版采用现有部署方式可交付的一份小型服务端配置，不新增管理后台页面或通用灰度系统。全局维护状态复用已有 control 的 draining/disabled 语义；正常版本退役另外按规则控制新开局，不用全局停服替代。

研究开始时 `control.ts` 等文件有其他工作中的改动，期间已由其他工作提交；后续实施必须读取当时最新源码，避免覆盖。本轮不修改这些文件。

## 4. 上线步骤

### 首次接入

1. 读取平台实际线上包及审核包，固定包 ID、入口、SHA 和规则标识；列出 legacy 请求特征、有效旧单人局、房间和未完成交易。不能拿当前 dev 版本推定线上版本。
2. 对实际线上规则生成并验证冻结实现。以原线上 H5 对新后端跑回归，确认旧局继续、历史奖励和退款语义一致。
3. 部署兼容后端和兼容的数据库增量；只扩展结构，暂不删除/重命名旧字段。所有 Runtime 实例与清理任务均需加载保留规则。没有接通旧规则前不升级线上战斗规则。
4. 构建包含版本声明与更新提示的 H5，归档精确 ZIP/清单，再自测和提审。审核期间后端保持可用；审核人员必须能验证实际提交的功能。
5. 包发布后从真实 TapTap 入口验证获取到目标包、API 环境正确、身份/资产连续、广告与结算正常，再把该渠道的目标版本标记为可更新。
6. 首轮继续容忍没有 buildId 的旧包。它们没有新提示逻辑，依赖平台换包；不得因为采用新字段就集中拒绝现有玩家。

### 后续常规发布

1. 分类：纯显示改动保持规则不变；协议/模拟/奖励变更明确影响哪些兼容版本。必要的规则快照在修改旧依赖前固化。
2. 先部署可服务线上包与候选包的后端；候选功能仅在满足能力和发布策略的客户端开放。发布验证覆盖旧客户端，不只测新包。
3. 构建并提审准确的 H5 制品；包 ID 与本地 buildId、SHA、后端兼容集一一登记。提审通过不等于客户端已取得新包。
4. 确认真实渠道分发后，更新该渠道的目标版本。旧玩家当前局继续；安全退出/重开后的行为按已核验的宿主机制执行。
5. 观察构建分布、握手失败、动作/结算失败、补传队列和旧规则活动局；比例下降只是参考，不能替代对仍有效旧局的检查。
6. 宣布旧版新开局截止，停止旧规则创建、匹配及等待房开战，保持既有局、合法补传和回执查询。旧联机局继续后台推进和离线接管。
7. 单人有效期限和缓冲结束、联机旧局排空、未完成交易得到处理后，移除执行旧规则的能力。身份、资产、历史战绩和已确认回执保留；随后才考虑清理兼容字段。

正常停止新开局不应阻止已成功请求的幂等重试。紧急漏洞/异常发奖时可以通过既有控制能力暂停受影响行为，并明确补偿与恢复策略；不能承诺任何版本在紧急情况下永远可继续。

### 回滚

先关闭问题功能/停止问题版本新开局，并撤回错误的推荐目标。已打开页面不会因此立即换包，必须继续被兼容后端服务。

后端仅回滚到仍支持已发布客户端和当前数据结构的候选；不能退回只有旧规则的历史服务器。优先部署兼容修复。数据库不做破坏性反向迁移，已发生的交易不重放发奖。

TapTap 能否立即恢复指定历史 H5 包、恢复需要多久，必须在渠道后台另行核实；不假定平台提供即时回滚。新包暂时不可获得时延长兼容期或明确维护，不强制玩家反复刷新。

## 5. 验收清单

| 场景 | 必须达到的结果 |
| --- | --- |
| 真实旧 H5 + 新 Runtime | 登录、资产、开局、房间、排行榜仍可用；不是只有新包通过 |
| 新 H5 + 未开放的新能力 | 不出现可点击但必失败的入口；明确维护与练习边界 |
| A 规则开局后部署 B | A 的动作、回放、结果、配装消耗和奖励仍按 A，重复请求不重复到账 |
| 新 H5 补传 A 的 finishing 日志 | 使用 A 的原始批次和 requestId，既有服务端终态优先，不改写版本，不重复奖励 |
| 旧版新开局已截止但创建响应曾丢失 | 相同请求找到原对局；真正的新请求被拒绝 |
| A/B 房间并存 | 匹配、列表、邀请、观战和聊天跳转均正确；同一玩家不能跨版本重复占位 |
| 后台清理运行 | 支持中的 A 局不因非最新而被结束或退款；真正过期/退役的局按原规则收尾 |
| 同账号跨版本和多页面 | 身份稳定、资产不分叉、CAS/回执不丢失、旧页不覆盖新字段 |
| CORS 与严格输入校验 | 新包标识通过实际预检；旧请求仍通过；未知/伪造/超长标识不能绕过权限 |
| 更新失败、离线、资源过渡 | 不刷新风暴、不清存档、不把旧运行页混入新资源；恢复后能继续原有合法操作 |
| 干净部署包和后端回滚 | 声明支持的所有规则实际可加载；新版数据能被回滚候选正确处理 |
| TapTap 真机发布过渡 | 见第 1 节平台能力和待验证矩阵；浏览器 fixture 不能代替宿主证据 |

优先扩展现有 `scripts/h5-taptap-build.test.mjs`、`h5-game-services.test.mjs`、`deployment-bundle.test.mjs`，`platforms/competition/tests/game-services.test.mjs` / `game-bootstrap.test.mjs` / 存储测试，以及 Runtime 的 ranked、night-online、night-assets、night-chat、retention、control 和 CORS 测试。浏览器覆盖旧日志重载及更新提示；正式渠道验收用冻结的旧 ZIP 与准确候选 ZIP。

代码实施按[准确候选版本的增量发布验证](../../../../../docs/operations/incremental-publication.md)登记真实消费者；源码、CI、桌面浏览器、实体手机、提审和正式上线分别记录，不相互替代。此次本地验证结果另见验证记录，平台条目仍待后续授权与实际环境验收。

## 6. 方案研究时的源码证据索引

- `scripts/h5-taptap-build.mjs:515`、`:530`：最终文件清单、源码身份、ZIP SHA-256；游戏 `scripts/build.mjs:108`：build-info。
- `services/runtime-api/src/app.ts:97`、`:142`：当前每游戏单规则 Map。
- `services/runtime-api/src/competition/game-routes.ts:101`、`:175`：已有元信息及严格开局请求。
- `services/runtime-api/src/competition/ranked-runs.ts:70`、`:209`、`:235`：当前版本检查与模拟/结算选择。
- `services/runtime-api/src/competition/ranked-store.ts:87`、`night-assets.ts:1076`：规则变化导致失效、退款或结束。
- `services/runtime-api/src/competition/ranked-maintenance.ts:40`：清理脚本独立加载规则，必须一同升级。
- `services/runtime-api/rules/night.mjs:27`、`services/runtime-api/src/competition/store.ts:425`：联机无时间上限，不可套用单人期限。
- `services/runtime-api/src/competition/store.ts:1125`：房间后台维护当前按单一版本查询。
- `services/runtime-api/src/competition/night-chat.ts:77`、`:147`：聊天房间邀请依赖当前版本。
- `platforms/competition/game-services.js:760`、`:799`、`:1039`：客户端补传版本限制与冷启动恢复边界。
- `scripts/deployment-bundle.mjs:20`、`scripts/deploy-tencent.mjs:254`：两套部署清单。

行号记录本次检查位置，后续以文件及符号当前内容为准。本方案没有证明线上已具备上述兼容能力。

## 7. 本次最小实现与发布配置

- 最终 H5 文件（包括 API 地址、公开渠道配置）生成 `night-<SHA-256>` 标识。普通网页与 TapTap H5 分别标为 `web-h5`、`taptap-h5`。`game-service-config.js` 的 `release` 和 TapTap 构建清单记录同一标识；重新打包更换环境会重算，ZIP 自身摘要仍独立记录。
- `night-release.ts` 集中处理有界且严格的发行配置、元信息及新开局许可。`X-Game-Build` 仅标识包；旧请求仍走 legacy。默认配置为空时不制造更新提示，不收紧当前开局；配置开启后，未知 build 不允许新正式局，但不影响已经鉴权的旧局动作和回执。
- `ranked-runs.ts` / `ranked-store.ts` / `store.ts` / `night-chat.ts` 按已存规则运行，匹配和邀请隔离不兼容版本，跨版本仍维持一个活动房占用。新客户端不抢占无法解释的旧房租约。`ranked-maintenance.ts` 同样加载保留规则；找不到执行器时保留原记录，不拿新规则退款或清理。
- 战斗配装和奖励使用该局规则；账号解锁和公共账本使用当前账号规则。`Progression.ts` 显式登记原有固定奖励数值，未改变金额。旧 v16/v9 冻结模块沿用历史固定数值。receipt、requestId、seq 的幂等键不包含 buildId。
- `Online.ts` 启动、前台恢复、返回安全页面时检查。当前主页 `ProgressionView.ts`、备用主页 `HomeView.ts` 和设置页提供版本入口；`OnlineLobbyView.ts` 展示保存及重进说明。`Overwatch.ts` 拦截战斗、广告和交易中的重进操作；等待日志提交和 `storage.flush()`，失败不宣称已保存。没有自动 reload、清存档、Service Worker 或 TapTap 更新 API 调用。
- 冻结实现位于 `services/runtime-api/rules/frozen/night-v16-v9/`，共 9 个模块，配有源/输出摘要清单。`node scripts/night-release-rules.mjs` 检查摘要、依赖闭包及实际规则身份；Runtime 包测试自动运行其契约测试。当前冻结来源是本地基线，**尚未认证为平台实际线上包**。

发行策略优先使用后管已发布快照中的 `nightOperations.release`；未配置时兼容现有环境变量 `NIGHT_RELEASE_CONFIG`。后管公告、补偿、部署历史和版本开关见[配置中心说明](../../../../../docs/admin-console/control-center.md#夜航公告补偿与游戏版本)，自增编号见[统一打包说明](../../../../../docs/operations/game-builds.md#夜航的前后端发布版本号)。下面保留最小格式示例（`build-a` / `build-b` 必须换成真实制品标识；规则来自受信任登记）：

```json
{
  "schemaVersion": 1,
  "builds": [
    {"buildId":"build-a","channel":"taptap-h5","ranked":"night-input-replay-v16","multiplayer":"night-duel-v9"},
    {"buildId":"build-b","channel":"taptap-h5","ranked":"night-input-replay-v16","multiplayer":"night-duel-v9"}
  ],
  "channels": [{"channel":"taptap-h5","latestBuildId":null}],
  "allowNew": {"ranked":["night-input-replay-v16"],"multiplayer":["night-duel-v9"]},
  "legacy": {"channel":"taptap-h5","ranked":"night-input-replay-v16","multiplayer":"night-duel-v9"}
}
```

环境配置由服务启动时读取；运营配置在业务控制锁内从当前发布快照解析，不修改进程全局规则注册表。含未来未加载规则的登记只拒绝对应新局，不阻断已保留规则的旧局重连。外部必须允许 `X-Game-Build` CORS 请求头。自托管网页另登记 `web-h5` 渠道和包，不能共用 TapTap 的 latest。

正常上线顺序：

1. 核对真实线上/审核包及有效旧局，先冻结其完整规则并在 `loadNightRelease` 中登记。当前目录不是自动认证结果。后续破坏性规则修改之前先冻结旧依赖，递增相应规则版本；同版本不能登记不同语义。
2. 先按控制数据库 v5 升级门禁准备兼容服务，再部署保留新旧规则的后端并把候选包加入 `builds`；新旧规则都在 `allowNew`，候选渠道 `latestBuildId` 保持旧可获取包或 null。保持原有账号、资产和交易数据。
3. 构建、归档、测试准确 H5 后再提审。若 API/渠道配置发生改变，重新获取 buildId 并同步登记；候选提审期间也必须能访问兼容后端。
4. 审核通过且实际入口已能取得新包后，才把该渠道 latest 指向新 buildId。游戏只提示玩家安全保存后退出并重新进入；不承诺平台立即换包。
5. 可单独关闭构建或绑定的后端兼容版本，也可从 `allowNew` 移除整组旧规则。等待房匹配和开始操作检查参与者构建；继续保留执行器、已开旧局和补传窗口。
6. 单人 24 小时有效期及补传缓冲结束、无有效旧联机房、旧交易处理完毕后才能移除执行器。配置可用 `retiredRules: {"ranked":["旧规则ID"],"multiplayer":["旧规则ID"]}` 保留旧 build 的更新提示映射；退役规则不能同时允许新开局或作为 latest 目标。已确认结果/回执可继续读取。
7. 出现问题先撤回 latest/停开问题版本的新局，部署仍支持所有存量局的修复；不可回滚到只理解旧规则的后端。紧急停用继续走既有 control/killEpoch 机制。

真实发布与真机换包检查仍属于后续步骤；本次只完成分支代码、构建及本地验证。

## 2026-11-13：双人随机战场与终局一致性

- 当前单人规则仍为 `night-input-replay-v18`，双人规则升级为 `night-duel-v12`：每局种子选择山谷/高地、昼/暮/夜，以及每侧 6/8/10 台装甲和 32/40/48/56 名步兵；双方数量、兵种和部署原点对称，同种子可重放。实际玩家仍为两人。
- 修改前冻结 `night-v18-v11` 完整闭包，服务端保留双人 v12/v11/v10/v9；匹配继续按规则隔离，不支持用 v12 客户端强行接管 v11 对局。发布新包前先部署支持 v12 的 Runtime，再按该包真实 buildId 登记并开放对应规则。
- 真人主动退出立即按退赛结束双方：退出方失败，沿用失败档 60 金币/70 经验，保留最短 10 秒要求；留下方不发金币/经验。退赛不发碎片、不推进完成/胜利任务；积分与胜负记录仍按既有统计。等待房、倒计时退出和已结算后离房不重复产生收益。
- 真正网络失联仍允许 30 秒重连；超时结算后停止模拟。结果页与接口的 winner、本人 phase、双方 result、opponent 及作战时间统一使用结算回执，避免后续机器人结果覆盖既有判定。历史异常房间只修正终局展示，不重写已发账本。
- 应用销毁不视为主动退赛，迟到建房/轮询响应不得继续开局或调用已销毁页面。主动离房回执刷新资产；列表轮询不再擦除判负与奖励说明。
