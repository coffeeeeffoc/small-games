# 六游戏共享后端轮 · 卡丁车最终集成记录（2026-09-23）

总负责人完成真实PostgreSQL/runtime接入，修复默认公网入口未读取网关注入WSS的问题，结算主面板新增服务端个人最佳、当前全站名次、前后变化及目标差距。源码与最终H5制品hash为 `068623b5b193f3a0a0fc77acee079036b29ca64ec8e21a33f608570685ee0b79`；开赛前没有取得纪录时明确无法比较，不编造旧名次。

- 独立评审以两个隔离Cocos浏览器经真实HTTPS/WSS完成房1F3C4541的创建、邀请、准备、合法三圈、刷新重连、持久结算、结果HUD和全站榜查询。服务端用时210.358/268.796秒，个人排名3/7名，共7人；首次纪录及距上一名25.979/29.488秒均与API精确一致。两端全榜一致，页面错误为空，K1/K2关闭，详见 `INDEPENDENT-REVIEW.md`。
- 先前81项规则测试、类型检查和kart-server7项通过；新结算摘要测试另1项覆盖7种已知/未知开赛前纪录及差距分支，通过。最终H5、微信、B站三目标已实际重建，两个原生game.js语法检查通过；B站官方输出的AppID隔离检查通过，没有把微信AppID混入B站项目。
- 数据库与业务进程已实际重启，重启前完成的卡丁记录/排名一致；真实pg_dump/新库pg_restore验证通过。实时内存房间随进程重启中断，已完成结果不丢，outbox持久补交仍保留。
- 微信工具后续已成功登录和打开本轮较早制品，实测竞速、暂停、好友面板及服务不可用反馈；不再沿用下文早期CLI超时判断。新增结算UI未做原生实测，完整平台登录/PK/榜单仍未通过。B站工具启动但窗口捕获失败，未导入；真机未验。具体资源和12目标记录见根仓库 `docs/deployment/native-target-validation.md`。

没有提高缺乏新证据的质量评分；独立专家分仍8.685，未达9.5/每维9.0。后续待补平台AppID、服务端登录密钥、开发/体验权限、真机与用户体验证据；当前代码提交到 `codex/six-games-online`，不触发main的正式Pages部署。

## 实现阶段交接记录（以下状态已由上文集成结果更新）

负责人：`kart` 实现 agent；总集成、公共客户端注入与独立验收由 root 接续。基线 `646a830`。以下状态来自本轮当前代码，不沿用历史分数。

| 项目 | 当前状态与证据 |
| --- | --- |
| 目录与引擎 | `games/local/carding-car`，Cocos Creator 3.8.8 原生 3D；复用既有真实赛车、物理、检查点与权威房间，没有重写模拟。 |
| H5 / Desktop | `dist/index.html`、Shell iframe、`kart-server /play/`；本轮源码构建通过，两个真实 Cocos 浏览器已跑通房间与输入。公共全屏/competition客户端最终注入后的构建待总集成复核。 |
| 专注游玩 | 准备/排行面板开赛隐藏；联机默认不显示单机教学；原无效暂停改为房间入口，H/触摸竞赛规则可展开/收起。结算按本人合法用时，DNF不再显示完成奖牌，房间覆盖不再露出后方结算。 |
| 好友 PK | 保留真实 WS 创建/邀请/准备/加载/输入/30秒重连/超时/退出/重赛。新增排位房间，服务端验证共享会话且拒绝同身份重复加入，两真人无机器人。 |
| 排位与榜单 | 固定 `carding-car-seaside-v1` 标准海湾三圈、标准车手/赛车、seed 20260923。服务端合法完赛上报；Cocos中提供Top100十人分页、个人最佳/全体真实名次/人数/差距/空榜与不可用状态。等待真实公共API/数据库联调，当前不能宣称已通过。 |
| 持久化边界 | kart实时房间内存；终局UUID经原子文件outbox持久化并5秒补交共享PostgreSQL，外部服务失败/重启补交测试通过。异常掉电之前未落盘的进行中比赛不恢复。 |
| 微信目标 | `pnpm --filter @coffeeeeffoc/carding-car build:wechat` → `build/wechatgame`，既有原生入口和分享接参；本轮最终公共登录客户端注入后的构建、开发工具PK/榜单未验收。 |
| B站目标 | `pnpm --filter @coffeeeeffoc/carding-car build:bilibili` → `build/biligame`，既有官方builder 1.0.3和原生入口；本轮最终构建与工具PK/榜单未验收。 |
| 本机工具 | 微信工具2.02.2608070位于 `D:/微信web开发者工具`；B站工具2.0.11位于 `C:/Users/15211/AppData/Local/Programs/small-app-ide`。`adb devices -l` 无设备；本轮执行微信 `cli.bat islogin` 返回 `initialize error: wait IDE port timeout`，尚未取得实际工具会话，不能做实体机或开发工具通过断言。 |

本轮验证：

- `pnpm --filter @coffeeeeffoc/carding-car test`：81/81；当前类型检查通过。
- `pnpm --filter @coffeeeeffoc/kart-server test`：7/7；新增真实双WebSocket从准备到三圈合法完赛、固定排位条件、不同身份要求、伪造成绩/重复开始拒绝、终局两端一致、仅一次结算。约40.6秒加速服务端时钟，仅属于协议/权威规则检查；验证身份/持久结算接口使用测试边界，不能代替实际PostgreSQL。
- outbox独立检查：真实HTTP 503时结果文件保留，关闭并重新创建集成后同UUID补交一次，响应成功后删除文件；不是数据库恢复演练。
- `pnpm --filter @coffeeeeffoc/carding-car build`：`Built web-mobile`；随后 `node games/local/carding-car/tests/multiplayer.mjs` 在两个独立真实Cocos浏览器通过创建/触摸邀请/准备/独立输入/共享状态/刷新重连/离房，以及专注菜单隐藏、PK规则开关、P进入房间与继续。`reports/multiplayer/validation.json`、`host-race.png`、`friend-race.png`。
- 上述浏览器验证之后仅增加排行榜只读诊断字段；总集成注入公共客户端后仍需重新构建并重跑。`git diff --check`通过。

接续步骤与阻塞：

1. 总负责人启动隔离测试PostgreSQL/runtime-api并注入真实 `__competition`；kart-server配 `COMPETITION_API_URL`、安全环境中的 `COMPETITION_INTERNAL_KEY`，切勿向普通日志/聊天输出密钥。
2. 重建H5后运行 `tests/ranked.mjs`（约3–5分钟）。脚本已实际实现：两独立身份、创建标准排位、邀请加入、真实触摸三圈、刷新重连、服务保存确认、一致榜单及实际点击Cocos排行；成功证据写入 `reports/ranked/`。目前脚本尚未执行，数据库尚未就绪，不能预先标记通过。
3. 根负责人提供公共登录/客户端最终注入后，再构建微信/B站，各工具实际完整玩局、好友加入与排行榜；工具通过、真机通过分别记录。既有SDK分享测试不是平台实机验收。
4. 临时公网用同一脚本将 `KART_URL` 指向当前网关目录，核对所有页面/资源/API/WSS，关闭隧道后复核反馈。当前新排位公网链路未运行。

风险：当前基本防护拒绝客户端分数/位置/计时、身份越权和陈旧输入，使用服务端模拟校验合法圈数；不承诺检测自动驾驶/外挂。辅助浏览器数据必须隔离。双方同规则不代表跨不同AppID身份自动合并；平台登录取决于共享后端官方验证配置。实现 agent 不给自己打分；9.5/每维9.0门槛未放宽，独立评审和平台实测完成之前不宣布达标。

---
# 浪湾卡丁车 · 9.5 冻结量表第一轮（2026-09-22）

本节取代旧报告作为本轮实现记录。实现者自评不替代新的独立评审；内部专家分不是真实玩家均分。量表见 `docs/plans/2026-09-22-six-games-95.md`，标准未放宽。

## 版本、入口与发布边界

- 代码目录：`games/local/carding-car`，主仓库普通目录；模型源来自 `assets/carding-car` 嵌套素材子模块，本轮未修改素材子模块。
- 玩法/玩家：横屏、三圈、四车竞速，转向选线、漂移蓄力松手和氮气是主要技巧；目标为愿意学习短局驾驶技巧的休闲竞速玩家。
- 已有主要发布目标是微信和 B 站独立小游戏；H5/桌面 Web 使用同一 Cocos 工程，未扩展其他平台。
- 独立 H5：`dist/index.html`，本地 `http://127.0.0.1:4198/`；聚合/iframe：Shell 的 `#/games/carding-car`、`games/carding-car/index.html`；本地好友赛：`http://127.0.0.1:43003/play/`。
- 原生输出：`build/wechatgame`、`build/biligame`。需要目标平台 AppID、开发者工具和实体设备。联机依赖 `services/kart-server` 权威服务及可达的 WSS `/kart`；本地双客户端验证不能替代公网与平台邀请验证。
- 原 dist 与源码 hash 不一致，先重新构建基线；基线驾驶/加载缺陷 hash 为 `e4796e33cbb17c6ee39e2dab7fdf65cadf6f957f7297400262d63aa4fd8addaa`。首个完整基线比赛在该页面加载的模块上完成；其结束后的重新加载/存档检查发生在新版已生成后，不能标为纯基线存档证据。
- 最终集成 H5 `sourceHash`：`152697f2f79371be0c3cf3652736cdbcac4d36cdfde9e9e2b9a2dbbcdb842897`。构建后所有专项都重新校验源码 hash；完整比赛报告也保存构建对象，避免后续混用旧结果。

## 新基线与实现后自评

| 维度 | 权重 | 本轮基线 | 实现后 | 依据与加分边界 |
| --- | ---: | ---: | ---: | --- |
| 核心玩法与操作乐趣 | 30% | 8.2 | 8.2 | 当前构建真实键盘/多指输入，三圈、双档漂移、近道和碰撞约束形成可完成的技巧循环；没有新玩家乐趣观察，不因修按钮加玩法分。 |
| 首局理解与教学 | 20% | 8.0 | 8.0 | 默认可开跑，五步按真实动作推进，暂停打断后可重新蓄力；仍是一边比赛一边学，没有陌生玩家自主教学完成证据。 |
| 移动操作、视听与反馈 | 20% | 7.4 | 8.0 | 基线无显式浏览器全屏入口；新增完整文档全屏与诚实失败反馈，实际桌面 Chrome 验证全屏及旋转后触控。小屏 HUD 仍密，Android/iOS 真机与工具栏/安全区未验收。 |
| 重玩或学习价值 | 15% | 7.7 | 7.7 | 多路线/主题、个人五场纪录及奖牌目标已有当前游戏证据；本轮未新增内容，不为代码数量或持续投入加分。跨日复玩未验证。 |
| 功能完整性与稳定性 | 15% | 7.8 | 8.3 | 实际复现并修复加载中触摸开跑绕过等待的路径，保留可复现网络延迟回归；实际全屏切换不重建比赛。原生和公网联机仍未验收。 |

基线原值 `7.865`；实现后原值 `8.060`。**未达到 9.5，亦不满足全部维度至少 9；不能宣称整款已通过上线验收。** 玩家上线评价没有目标用户样本，无法可靠估计区间。

基线最影响体验的三个问题：① 慢网装配期间按钮看似等待但触摸会提前重建/启动比赛；② H5 无清晰全屏入口；③ 横屏 HUD 内容密集，教学和比赛同时争夺注意力，窄屏、实际工具栏及真实新手认知负担尚无证据。

## 实际修改与玩家收益

1. **加载中点击不会误开赛。** 沿 `KartController.touchStart → restart → KartGame.loadSelection(true)` 追踪，发现触摸处理最后的无条件 `else` 把未加载的 ready 当成 finished。改成仅 finished 才 restart；键盘原有等待行为保持一致。通过条件：拦住所选赛车真实资源响应后按 Enter、连续触摸开跑区，仍 ready、seed 不变；资源放行后仍等待用户明确点击，随后正常驾驶。`tests/loading-start.mjs` 在旧版失败（countdown ≠ ready），新版通过。
2. **H5 显式全屏入口。** 复用协调者 `scripts/fullscreen.js`，构建把按钮与脚本注入完整 HTML 并复制到 dist，独立页/该产物 iframe/好友赛共用。44px 起的按钮放在右上 HUD 保留区域，竖屏引导下移避免重叠；整个游戏文档包含 HUD/菜单一起进入全屏。系统退出同步，失败/不支持明确说明仍在普通页面；未把 CSS 铺满称为真实全屏。
3. **证据保留。** 现有完整跑圈脚本的 JSON 增加实际 build 信息，新留存两个可运行浏览器回归。没有新增依赖、框架、经济系统或未验证的原生输入法补丁。

## 本轮实际验证

| 检查 | 结果/证据 |
| --- | --- |
| `pnpm --filter @coffeeeeffoc/carding-car test` | 81/81；`reports/round95-tests.log`。 |
| `pnpm --filter @coffeeeeffoc/carding-car typecheck` | 通过。 |
| `pnpm --filter @coffeeeeffoc/carding-car build` | 最终 Cocos Creator 3.8.8 H5 构建通过；`reports/round95-build-final.log`。 |
| `build:wechat` | 当前玩法源码构建通过；主包 2,002,858 B，总包 20,014,622 B；`reports/round95-wechat.log`。 |
| `build:bilibili` | 当前玩法源码构建通过；主包 2,003,506 B，总包 20,015,270 B；`reports/round95-bilibili.log`。 |
| `node games/local/carding-car/tests/loading-start.mjs` | 最终 hash 通过；网络仅延迟真实资源响应，未注入游戏状态；`reports/loading-start.json`。 |
| `node games/local/carding-car/tests/display-modes.mjs` | 实际 Desktop Chrome Fullscreen API；比赛→全屏→暂停/恢复→退出→继续→305/360/390 竖屏→横屏→全屏重试→外部 `document.exitFullscreen()` 退出→真实触摸转向通过；这是退出事件同步检查，不是实体手机系统退出手势。`reports/display-modes.json/png`。 |
| 全屏拒绝/不支持 | 同一当前游戏页面中覆盖 API 分支；均显示准确反馈、aria-pressed=false、按钮仍可用、seed 保持。**这是能力模拟，非 iOS/Android 真机结果。** |
| `node games/local/carding-car/tests/driving-coach.mjs` | 实际五步驾驶、蓄力后暂停→回到蓄力步骤→继续完成、重载完成记忆、H 重学、横竖屏提示、未配置公网联机降级通过；`reports/driving-coach.json`。 |
| 首轮基线 `tests/browser.mjs` | 实际输入完整三圈 168.0096545 秒、第四名、29 次加速、2 次碰撞、0 次复位；双档漂移/跳跃/触控取消/暂停/重赛均可复现。`reports/baseline-95-browser.json/log`；诊断路线辅助驾驶，不是新手成绩。 |
| `node games/local/carding-car/tests/multiplayer.mjs` | 当前 hash、两个真实 Cocos 浏览器客户端通过：桌面/触控房间创建加入、零机器人、独立输入、共享状态、重载重连、离房返回单机；`reports/multiplayer/validation.json`。仅本机服务。 |
| 最终 hash `node games/local/carding-car/tests/browser.mjs` | 通过：167.5867586 秒完整三圈、第四名、37 次加速、1 次碰撞、0 次复位；键盘别名/暂停按住不反复切换/双指/取消/倒计时暂停/重赛/360–390 旋转/完赛榜单/重载及损坏数据降级通过，无页面错误。`reports/browser.json` 内含上述最终 hash，完整日志 `reports/round95-browser.log`。观察到第四名完赛/铜牌和重试，未宣称人类夺冠或首局难度已验证。 |

没有修改圈数、传送车辆或强制结算。实体设备性能、触觉体验及人类难度不能由自动驾驶、桌面 FPS 或截图推出。原生构建中的非致命 Creator 警告不计为真机通过。

## 仍未验收与下一步

- Android Chrome 与 iOS Safari 实体机：独立、聚合、iframe 入口的全屏/不支持降级；横竖屏、刘海/手势安全区、工具栏变化；低端设备持续三圈与发热。最少需要各一台实际目标设备及可打开当前构建的局域网地址。
- 微信/B 站：开发者工具编译、冷启动、实体机双指/切后台、B 站 Android EditBox/取消邀请，以及微信两机邀请。已有本地构建不能覆盖这些门槛。
- 线上联机：配置现有服务的可达 WSS、平台合法域名与至少两台设备；验证分享入房、弱网重连、全部选定车辆加载、完赛重赛。未部署或引入服务。
- 体验假设：首局教学是否打断驾驶、竖屏提示能否被理解、小屏 HUD 是否遮挡注意。先观察目标玩家，不为达到 9.5 随意加练习关或装饰。

## 爆款潜力与最小实验

辨识度来自低门槛自动加速与漂移松手奖励、近道选线、可更换路线主题；目标玩家明确，但与成熟竞速产品相比还缺可验证的首分钟乐趣和好友传播优势。再玩理由是打破本路线个人纪录、少碰撞和学会更快出弯；现有分享理由主要是好友共同竞速，尚无分享转化数据。

- 本轮代码已处理：慢网误开赛、H5 全屏入口与显示异常反馈。
- 真实体验实验：招募 5–8 位无经验目标玩家，在各自手机上从冷启动完成五步与第一场；记录是否无需解释完成转向/漂移、首个困惑点、重试原因以及是否主动再开一局，次日再观察一次。此样本用于发现问题，不估计总体评分或留存率。
- 增长实验：原生邀请链路验收后，让 4 组熟人两两挑战同一路线，观察发送邀请→成功入房→完成→主动再赛。复用现有诊断/人工观察，后续按真实数据决定是否值得投放短视频“出弯松手冲刺/近道反超”片段；不要先扩分析平台或假设能爆。

---

# 历史：浪湾卡丁车发布体验改进 · 2026-09-21

## 好友联机弹窗紧凑化

- 创建/加入和邀请确认改为 620×390 居中卡片，较原 960×540 面积减少约 53%；房间列表使用 880×470，保留八人名单与房主操作空间。
- 深色实心卡片、全屏柔和遮罩、紧凑标题与表单间距；打开时隐藏后方车库面板，遮罩拦截底层入口点击。输入框仍为 46 高、按钮为 42 高，未修改原生 EditBox 生命周期。
- 当前源码通过类型检查、80 项规则测试、H5/微信/B站构建。双客户端联机回归覆盖 844×390、1280×585 的遮罩/关闭/重开、创建、触摸邀请加入、准备开赛、重连及退出；邀请回归覆盖输入、改配置、复制邀请、过期邀请与取消，均无页面错误。
- 截图与运行记录：`reports/multiplayer/entry-844.png`、`entry-1280.png`、`room.png`、`validation.json`，以及 `reports/loading-invitation/validation.json`。这是浏览器输入与构建验证，不替代微信/B站实体手机验收。

## 本轮判断与实现

原版本有完整三圈竞速与漂移，但首局只堆操作说明、路线纪录未成为明确目标，未接入好友服务时仍邀请玩家创建房间。

- 新增五步驾驶指导，观察真实起步、持续转向、蓄出火花、释放漂移与触发氮气；暂停清空蓄力不会误领教学完成。教学完成存储在本机，H/触控按钮可重学或收起。联机比赛不显示这套本地教学。
- 复用现有每路线最快五场记录，开赛前显示个人纪录目标，完赛显示金/银/铜牌及比开赛前纪录快/慢多少秒。
- H5 竖屏提示横过手机；统一准备页的游戏名。默认配置可直接开跑。
- 未配置 endpoint 时明确显示“好友赛待开放”，隐藏创建/加入操作，解释可关闭面板进行单机竞速。保留此前已有的 Bilibili EditBox blur 修改和 keyboard 测试文件。

没有新增服务、依赖或经济系统。未部署公网联机；微信/B站两台真机邀请与性能不计为已验证。

## 验证

- `pnpm --filter @coffeeeeffoc/carding-car test`：79/79 通过；新增规则回归覆盖教学真实达成、暂停不误判、无氮气冷却变化不计入完成、纪录时间差。
- `pnpm --filter @coffeeeeffoc/carding-car typecheck`：通过。
- `pnpm --filter @coffeeeeffoc/carding-car build`：Cocos Creator 3.8.8 当前源码 H5 构建通过。
- `node games/local/carding-car/tests/driving-coach.mjs`：核对当前构建源码 hash 后，用真实键盘完成五步，检查本机完成记忆、H 重学、390×844 竖屏与 844×390 横屏提示、模拟生产域名的未配置联机页面。
- `pnpm --filter @coffeeeeffoc/carding-car test:browser`：真实键盘/多指触控、取消、暂停、重赛、360/390 竖屏、成绩持久化与损坏数据恢复通过。三圈 164.84 秒，30 次加速、0 次护栏碰撞、0 次复位，浏览器采样 FPS 中位数和 P10 均为 60。此完整跑圈基于本轮首个构建，之后仅调整未配置联机显示、联机不显示本地教学与格式；最终构建再跑上述教学/入口 smoke。
- `git diff --check -- games/local/carding-car`：通过。

证据（Git 忽略）：`reports/browser.json`、`reports/driving-coach.json`、`reports/coach-menu.png`、`reports/coach-drift.png`、`reports/coach-complete.png`、`reports/coach-portrait.png`、`reports/coach-offline.png`、`reports/finish.png`。

浏览器驾驶沿只读快照给出的建议路线施加真实输入，并非陌生玩家成绩；浏览器模拟与 FPS 不代替真机验收。最终产品分数交由独立复评 agent，不用实现者自评分代替验收。

## 第二轮 · 教学中断后恢复（2026-09-21）

沿 `KartController.clear → RaceManager/driveKart → DrivingCoach.observe → HUD` 检查后，发现首局教学会在失去蓄力后继续要求“松手加速”：暂停、触控取消、刹车、撞墙都可能清空火花，此时按提示松手不会有漂移加速，也无法推进教学。

本轮仅修改 `DrivingCoach`：等待释放时一旦蓄力消失，只有真实有效释放才前进一步；其余情况返回“蓄出蓝色火花”，保留已经完成的起步与转向步骤。复用现有物理和教学，不新增练习关或系统。

- 针对性回归先在旧逻辑上失败，修复后通过：暂停不会误领完成；真实 `driveKart` 蓄力经过刹车、碰撞或输入取消后，提示返回蓄力，重新过弯、释放与氮气可以完成五步。
- 当前全量规则测试 **80/80**、类型检查、Prettier 和 `git diff --check` 通过。
- 当前 Cocos Creator 3.8.8 H5、微信和 B 站构建通过。微信主包 2,001,998 字节、总包 20,013,762 字节；B 站主包 2,002,646 字节、总包 20,014,410 字节，均通过脚本的包体限制检查。
- 当前 H5 构建 hash：`8ddd764efa332a72f63295458469cf9d3bdf993a9ddd8a7be65e1364c167547b`。`tests/driving-coach.mjs` 先核对当前源码 hash，再用真实键盘完成起步与蓄力、P 暂停、确认提示返回 3/5、恢复后以真实鼠标转向/键盘输入重新蓄力并完成五步。重载保留完成记录，H 可重学，390×844/844×390 旋转提示和无联机配置入口检查通过，未出现页面异常。
- 本轮浏览器证据为 `reports/driving-coach.json` 与 `reports/coach-*.png`；原生构建日志为 `reports/round2-wechat-console.log`、`reports/round2-bilibili-console.log`（均为 Git 忽略产物）。预览：`http://127.0.0.1:4198/`。

本轮没有重复完整三圈测试，也没有将历史独立评分当作本轮验收。`adb devices -l` 本轮未发现设备；微信/B 站真机输入、低端机性能和两机好友赛仍未验收。下一轮由新的评审 agent 按核心玩法 30%、首局 20%、移动体验 20%、重玩 15%、稳定性 15% 独立评分。
