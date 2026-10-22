# 配置中心接入与发布边界

管理服务通过 `ADMIN_CONTROL_ENABLED=true` 显式启用配置中心，默认关闭。继续使用现有 GitHub OAuth、Host、Origin、CSRF 和 Cookie 会话；启用后每次请求重新读取数据库成员和权限。环境邮箱白名单只允许空库首次绑定管理员，不能绕过后续禁用。

API 为 `/api/control` 下的 catalog、state、revisions、members、roles、audit。角色分别授予读取、编辑、发布、成员和角色管理、审计权限；最后一个已绑定的有效管理员不能删除或停用。已有角色修改同时检查旧、新权限，低权限操作者不能覆盖更高权限角色。

历史列表通过 `publishedVersion: number | null` 明确区分已发布记录和草稿；读取配置的人无需审计权限即可识别可回退版本。修订详情仍不可变，回退仍创建新的发布版本。

管理前端固定使用 AntD 6.6.6，继续保留原有登录、403 和欢迎页。生产构建只在可信 HTML 中注入 Caddy 模板，`randBytes 32` 为每个文档产生 canonical Base64 nonce，同时写入严格 CSP 和 `sg-csp-nonce` meta；脚本继续仅允许同源，样式通过本次 nonce 授权，不添加 unsafe-inline。只对八个明确页面执行模板，API 和静态资源原样转发；在 file_server 前移除六种条件／Range 请求，避免 304、206 或 412 返回不匹配的文档。缺失或非法 nonce 时控制界面关闭。实现依据 [AntD ConfigProvider CSP](https://ant.design/components/config-provider/) 与 [固定 Caddy 2.11.7 templates 实现](https://github.com/caddyserver/caddy/blob/v2.11.7/modules/caddyhttp/templates/templates.go)。

实际 Caddy 2.11.7 回环检查验证八页面、403、独立 nonce、条件／Range、HEAD／写方法、API／资源不执行模板及缺失 index 的失败关闭；官方归档和执行文件摘要见 `qa/csp-caddy-current.json`。测试使用已校验官方归档，在独占临时目录提取并清理进程，只监听本机回环，不是生产 TLS 或真实 GitHub 登录验收。前端生产 build、管理权限／历史／访问三文件 16 项、管理 typecheck/lint 通过；发布工具 122 项先通过 121 项，旧服务 Turbo 回归固定到其原历史版本后该唯一项通过，其他断言保留。

公共配置只接受精确的 HTTP(S) origin（协议、域名、端口），不接受路径、通配符、凭据、查询参数或管理端 origin。快照包含已核实的 11 个 Runtime/Kart 游戏。夺城令另有独立 HTTP 服务，Shell ID 已核实为 `tianxia-chalu`，需要单独接入，不能把列出目录视为已生效。

草稿及发布记录只追加。发布采用版本 CAS，回退创建新版本，不修改历史。首次发布前版本为 0、`unpublished`，保留既有环境策略，不自动开放任何 Tap 共享域名。管理端显示 desired、partial、observed；只有已知消费者实例的新鲜报告均匹配版本和摘要时才显示 observed。过期实例仍列为 `expiredUnknown`，不会因新实例出现而自动宣称旧进程已停；没有预期实例注册表时 `observationCoverage.complete` 始终为 false。observed 表示已知报告的应用版本匹配，不是完整健康或部署覆盖证明。生产使用稳定逻辑实例 ID 之前须核实旧实例已停止且每个槽位仅有一个进程。

逐游戏状态为 enabled、draining、disabled。进入 disabled 才递增服务端 `killEpoch`；恢复或回退不会降低代次，旧局不能因此恢复结算。Management 按游戏 ID 排序持有 `game-control:<gameId>` 独占事务 advisory 锁；Runtime 先持同 key 共享锁、读取策略，再锁局数据。Runtime 不需要 UPDATE 配置表权限。

`infra/admin-console/migrations/002-control-center.sql` 仅新建 `game_control`，不修改既有游戏表或 `admin_console`。迁移拒绝未知对象、所有者、外键目标、ACL 和 owner 的全局默认表／函数授权，不自动修复权限。Runtime 只能读取发布投影和游戏策略、追加应用报告，不能读取管理成员或修改开关。

本地验证：管理服务 typecheck、lint、17 个测试文件共 53 项通过。`scripts/admin-control-postgres.mjs` 使用全新 UUID 标签的 PostgreSQL 17.6 容器、卷和专用网络，端口仅绑定回环，执行后精确清理；19 项检查覆盖迁移幂等、异常 ACL／外键拒绝、旧数据保护、真实应用角色、管理员并发、发布与 Runtime 锁竞争、重启持久化、控制事务超时及身份锁并发。证据见 `qa/control-postgres-current.json`，其中记录实际执行模块和源码 SHA-256。这些结果不代表生产已迁移或实际 GitHub 已验收。

跨服务 PostgreSQL 验收入口及其 Runtime 辅助位于仓库根 `scripts/`，由根已有依赖组合两项服务的真实构建产物；Management 运行包不依赖 Runtime 私有实现。执行前先构建 service-kit、Management 和 Runtime，再运行 `node scripts/admin-control-postgres.mjs`。

控制数据库使用独立的单连接池，最多排队五项，总预算从入队开始计算；postgres-js 事务客户端固定物理连接。超时主动拒绝并清理当前连接，迟到回调不能再执行 SQL 或更新策略缓存；下一项可重新建立池。真实 PostgreSQL 已验证观察表锁、语句间断线、非 SQL 等待、排队和关闭。COMMIT 已发出后的结果仍可能未知，不能承诺全部超时事务已回滚；结果不确定时不授予控制权、不更新策略缓存。Runtime 额外使用一个控制连接，生产前须核实既有角色连接上限与资源预算。

三款游戏当前默认使用持久匿名身份，首次联网自动创建随机昵称及内置头像，不展示注册或登录入口。凭据按 API、平台、AppID 和游戏隔离保存，刷新页面复用当前入口身份；不同平台、浏览器与游戏不自动互通，不提供跨平台找回。access 最长十五分钟，刷新凭据滚动有效期 180 天，轮换单次使用，注销撤销整个会话族。存储不可用时降级为当前页面内存，退出后身份不能保留。现有 legacy／平台登录继续兼容，因此这不是共享 origin 上的强应用隔离，也不证明真人身份。请求固定首次身份上下文，在资源事务内再次核对真实游戏、玩家和撤权；玩家行使用 NO KEY UPDATE，允许结果外键读取，并继续与升级、刷新互斥。真实原始表定义的并发回归先复现旧锁 40P01，再验证两个结算提交及升级锁等待；它不是完整 HTTP 自然对局的替代证据。

街区单局在开始时取得票据，main.js 和 native.js 通过共用 records.js 绑定玩家与关卡配置；取消、换配置或换身份不能借票据提交。Kart 排位身份以十秒重验、最多十五秒租约限制存活，失败时停止授权；旧客户端需要退出后重新入房恢复已过期凭据，不宣称 WebSocket 即时撤权。凭据仅在私有 WeakMap 中，不能进入房间快照或 outbox。

本轮客户端／producer 定向五文件 65 项、Runtime 19 文件 171 项及 Kart 两文件 14 项最终均覆盖通过；早先失败的旧锁期待已修正，原自然双人三圈模拟在 120 秒有界运行中用时约 37 秒。Runtime build/typecheck/lint、service-kit lint、Kart typecheck、改动文件格式检查通过。发布工具套件此前 147 项中 146 项通过，唯一旧期待修正后相关三项通过；准确合并候选仍须正常 hook 验证，不能将这些工作区结果当作已推送或部署。

2026-10-18 已完成生产迁移、入口与三服务部署，并真实演练应用回退。当前成员首次绑定、配置首个发布版本及真实 GitHub 登录仍待用户完成。准确候选、云端回执、验证范围及日常命令见 [恢复与更新记录](../operations/backend-recovery-2026-10-17.md)。上面的本地历史测试结果不替代该记录中的线上验收。
