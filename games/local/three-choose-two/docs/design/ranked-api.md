# 三块选两块在线接口

排位接口复用 Runtime Service 的竞赛身份：H5 通过 `POST /api/competition/v1/sessions/guest` 获得稳定匿名 token，微信/B站通过既有 `/sessions/platform` 官方登录换取身份。请求使用 `Authorization: Bearer <token>`，客户端复用 `platforms/competition/client.js`，不自报用户 ID。

游戏接口前缀为 `/api/competition/v1/three-choose-two`：

| 方法 | 路径 | 请求 |
| --- | --- | --- |
| POST | `/session` | `{}`，创建或恢复唯一活动会话 |
| GET | `/session/:id` | 恢复最后确认状态 |
| POST | `/session/:id/actions` | `{seq,group,slot,x,y}`，序号从 1 开始，槽位 0–2 |
| POST | `/session/:id/finish` | `{}`，结束且重新验证全部已确认操作 |
| GET | `/board?version=three-choose-two-v1` | 当前规则榜；可查询旧规则归档 |

会话响应含 `id`、规则、形状、难度、积分与随机算法版本、`status`（active/finished）、`seq`、时间戳、`eligible`、`rankingReason`、`personalBest`、`state` 与 `settlement`。`state` 仅包含当前棋盘、星格、三候选、已用槽、组进度、积分、连击、统计、游戏状态与最近事件；256 位随机种子、SHA-256 计数器状态与未来候选仅保存在服务端。正式排位使用 `sha256-counter-v1`；公开候选不能用于从一个小型 PRNG 状态推算后续序列。每步由纯规则层生成和校验，终结从种子及有序操作重新重放。

`settlement.status` 为 `verified`、`pending-review`、`ineligible` 或撤销后的 `rejected`，并提供原因、积分、统计、结算时间、是否刷新纪录、个人最高分与实际名次。H5 guest 会明确提示使用微信或 B站登录参与全站榜；匿名会话的成绩不进入正式榜。

同序号同操作重复请求幂等返回当前确认状态；同序号不同操作返回 `ACTION_CONFLICT`，跳号返回 `SEQUENCE_CONFLICT`，错误组号返回 `GROUP_CONFLICT`，非法位置或已用槽位返回 `ILLEGAL_ACTION`。终局返回封闭状态，后续请求不能增加积分。24 小时到期在恢复、新建及榜单读取时按最后确认状态结算；归属实际服务端结算时间。

榜单返回 `version,updatedAt,top,me,around,total,reason`。每人只取最高有效单局；同分并列竞赛排名，按首次达到该分数的结算时间展示。公开列表仅包含允许公开的昵称、默认头像所需标识、平台和成绩，不返回平台账号。

异常高分阈值由服务端 `THREE_CHOOSE_TWO_REVIEW_SCORE` 配置，默认 100000；达到阈值进入待复核，不立即上榜。内部审计 `GET /api/competition/v1/internal/three-choose-two/sessions/:id` 可取得种子和有序重放记录；内部复核 `POST /internal/three-choose-two/sessions/:id/review` 接受 `{decision:"approve"|"reject",reason}`，用于批准或撤销并重算最高纪录。两者均复用现有本机来源和 `x-competition-internal-key` 双重校验。

发布 Runtime Service 时应用 012 迁移并携带游戏规则包。公平性相关形状、分布或积分变更必须新增规则版本；进行中的旧版本会话应先结束，不能静默切换规则。
