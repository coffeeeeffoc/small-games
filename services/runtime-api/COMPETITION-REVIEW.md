# 共享比赛后端独立评审（2026-09-23）

评审者 `/root/review_kart_chess_backend`，没有实现本后端。先实际浏览器/HTTP操作，后读 `src/competition/routes.ts`、`store.ts`、规则及迁移。数据库为独立开发库 `competition_test`。

## 已独立复验

- `node scripts/review-competition-kart-chess.mjs`：三个真实签发身份，伪造 token 401、非成员403、满房/错误游戏409、错轮/非法落子422、任意 score422、seq冲突409、重复ready不重置开始时间、同动作重传不二次落子、退出后中断且不再接受动作。未配置平台登录503；未冒充正式平台登录已完成。
- 公共网关对 `/api/competition/v1/internal/verify` 与 `/internal/kart-results` 返回404。读实现进一步确认后端内部接口同时校验 loopback IP 与常量时间比较密钥；管理后台与数据库未由网关公开。
- 2026-09-23 查阅 [B站官方登录文档](https://miniapp.bilibili.com/small-game-doc/open/login)，当前后端使用的 code2Session URL、字段 `openid` 与平台/AppID/用户标识隔离符合文档；这项是接口规则核查，未替代真实平台登录。
- 象五子棋两个独立浏览器 context、两轮真实 Canvas 操作，服务端胜负结算一致；同对当日第二局不再加分，累计3/0。
- 卡丁车最终真实公网三圈复验通过（2026-09-23 02:20北京时间）：两个隔离Cocos客户端经HTTPS/WSS创建、加入、准备、开始、刷新重连、合法三圈；服务端210358/268796ms，保存已确认，两端Top100一致、个人名次3/7、合格7人。结果主面板的个人最佳、名次、首次上榜及25.979/29.488秒差距与真实API逐项精确核对。证据 `games/local/carding-car/reports/ranked/validation.json` 和 `finish-0/1.png`；这项不依赖SDKmock或内部伪造分数提交。
- 独立重跑 `scripts/competition.integration.mjs`，2026-09-23 01:27（北京时间）：真实HTTP完整解谜结算、并发重复提交只留两条参赛结果；关闭并重新启动 runtime 服务后同会话/个人最佳仍保留；102名独立测试数据覆盖 Top100、rank101、并列1/1/3、参赛数、空榜/无成绩及版本隔离；邀请过期拒绝。测试进程自行使用临时HTTP端口，没有重启正在进行比赛的共享服务。
- 该次真实 PostgreSQL 查询测量：102名、20次排名查询，p50≈1.18ms、p95≈2.51ms。仅是本机查询样本，不是公网端到端延迟或服务器容量承诺。

证据：`outputs/independent-kart-chess/review.json`、`.scratch/competition/integration.json`、`games/submodules/xiangqi-five/.turbo/competition/online-result.json`。本地连接从被忽略的 bootstrap 配置读取，不输出或提交口令。

## 发现 F1：榜首错误得到负的目标差距（P2，已修复并独立复验）

1. 在 `competition_test` 创建独立临时榜，102名玩家，成绩1000至899。
2. 分别调用 `createCompetitionStore(...).ranking(board, playerId)` 查询第1、100、101名。
3. 第1名返回 `previous=null`、`threshold.rank=100`、`gap={score:-99,secondary:0}`；第100与101名差距均正确为1。临时复现数据已清理。

影响：居首玩家被返回一个落后99分的“追赶目标”，违反可比较目标差距语义。根因是 `ranking()` 以 `previous ?? threshold` 无条件为榜首回退到第100名。

通过条件：榜首（包括并列榜首）没有更高目标时 `gap=null`；第100/101名仍返回正确可比较差距；补进现有102人可运行检查并用真实PG通过。源码由总负责人负责，评审不修改产品。

2026-09-23 01:31（北京时间）总负责人修复后独立重跑真实PG集成检查通过：单独第一名和并列第一名新增 `gap=null` 断言，第100/101名、版本隔离、幂等结算和服务重启检查仍绿灯。该轮 p50≈1.06ms、p95≈1.25ms，报告更新于 `.scratch/competition/integration.json`。

## 证据边界

真实开发者工具平台登录、跨平台配对、真机、正式平台域名及生产恢复演练未在本评审运行。平台接口代码与离线构建不等于微信/B站登录成功。原始脚本会签发开发游客并建立测试对局，只能对隔离测试库运行。当前检查证明基础权限、事务幂等和持久化，不承诺绝对防作弊。
