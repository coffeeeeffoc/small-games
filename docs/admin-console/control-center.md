# 配置中心接入与发布边界

管理服务通过 `ADMIN_CONTROL_ENABLED=true` 显式启用配置中心，默认关闭。继续使用现有 GitHub OAuth、Host、Origin、CSRF 和 Cookie 会话；启用后每次请求重新读取数据库成员和权限。环境邮箱白名单只允许空库首次绑定管理员，不能绕过后续禁用。

API 为 `/api/control` 下的 catalog、state、revisions、members、roles、audit。角色分别授予读取、编辑、发布、成员和角色管理、审计权限；最后一个已绑定的有效管理员不能删除或停用。已有角色修改同时检查旧、新权限，低权限操作者不能覆盖更高权限角色。

公共配置只接受精确的 HTTP(S) origin（协议、域名、端口），不接受路径、通配符、凭据、查询参数或管理端 origin。快照包含已核实的 11 个 Runtime/Kart 游戏。天下岔路另有独立 HTTP 服务，Shell ID 已核实为 `tianxia-chalu`，需要单独接入，不能把列出目录视为已生效。

草稿及发布记录只追加。发布采用版本 CAS，回退创建新版本，不修改历史。首次发布前版本为 0、`unpublished`，保留既有环境策略，不自动开放任何 Tap 共享域名。管理端显示 desired、partial、observed；只有已知消费者实例的新鲜报告均匹配版本和摘要时才显示 observed。过期实例仍列为 `expiredUnknown`，不会因新实例出现而自动宣称旧进程已停；没有预期实例注册表时 `observationCoverage.complete` 始终为 false。observed 表示已知报告的应用版本匹配，不是完整健康或部署覆盖证明。生产使用稳定逻辑实例 ID 之前须核实旧实例已停止且每个槽位仅有一个进程。

逐游戏状态为 enabled、draining、disabled。进入 disabled 才递增服务端 `killEpoch`；恢复或回退不会降低代次，旧局不能因此恢复结算。Management 按游戏 ID 排序持有 `game-control:<gameId>` 独占事务 advisory 锁；Runtime 先持同 key 共享锁、读取策略，再锁局数据。Runtime 不需要 UPDATE 配置表权限。

`infra/admin-console/migrations/002-control-center.sql` 仅新建 `game_control`，不修改既有游戏表或 `admin_console`。迁移拒绝未知对象、所有者、外键目标、ACL 和 owner 的全局默认表／函数授权，不自动修复权限。Runtime 只能读取发布投影和游戏策略、追加应用报告，不能读取管理成员或修改开关。

本地验证：管理服务 typecheck、lint、17 个测试文件共 53 项通过。`services/management-api/tests/control-postgres.mjs` 使用全新 UUID 标签的 PostgreSQL 17.6 容器、卷和专用网络，端口仅绑定回环，执行后精确清理；12 项检查覆盖迁移幂等、异常 ACL／外键拒绝、旧数据保护、真实应用角色、管理员并发、发布与 Runtime 锁竞争、重启持久化。证据见 `qa/control-postgres-current.json`。这些结果不代表生产已迁移或实际 GitHub 已验收。

Runtime 控制定向测试 45 项、service-kit 控制及 CORS 测试 7 项通过；Kart 在本机回环允许的环境串行执行 12 项，通过真实双连接、重连、结算及控制租约测试。Runtime/service-kit build、Kart/management typecheck 通过。发布工具套件首次 147 项中 146 项通过，唯一失败为新增迁移消费者的旧期待；修正后相关三项通过，未知相邻迁移仍阻断。控制读取和心跳的跨 SQL 总超时预算仍需修正及验收，不能据此启用生产。

生产启用前必须给出准确候选、备份、SQL／GRANT、CSP／路由差异及回退方案。当前未执行生产迁移、授权或跨域白名单变更。
