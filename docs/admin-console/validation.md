# 当前验证记录

2026-10-16，Windows、Node24.21.0、原生pnpm12.6.0。只验证本地实现，不访问生产SSH/凭据/数据库。主会话恢复锁定依赖后，命令统一配置 `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false`、`COREPACK_ENABLE_NETWORK=0`；Vitest TEMP/TMP 指向 management-api/node_modules/.admin-test-temp，避免沙箱临时目录的 ENOENT。

## 已通过

- service-kit：typecheck、lint、build，Vitest 3文件14测试（集中CORS正负预检、独立策略及既有服务契约）。
- management-api：typecheck、lint、build，Vitest 13文件35测试，含原Studio认证与业务回归、新后管state/PKCE/回调/白名单撤权/过期/CSRF/Origin/并发刷新/固定到期/旧token拒绝/Host及入口伪造/OPTIONS Host保护、无S3/旧业务、404查询日志过滤与原telemetry字段保留。新增刷新/注销两种排程，晚到 Cookie 无法恢复登录且不影响其他设备会话。GitHub provider使用HTTP fixture验证verified邮件分页、权限及失败关闭。
- Runtime：typecheck、改动四文件lint、build；新config和competition-cors两个文件5测试。启动校验与路由共用readCompetitionCors：新变量优先，旧变量fallback，生产要求有效Origin非空；方法/头/credentials/age在分配资源前失败关闭，不混入管理白名单。完整Runtime相关套件由主会话最终候选门禁继续执行。
- admin-web：typecheck、lint、生产build（ReactRouter的use-client指令有既有SPA打包提示）；Chrome155.0.8059.82的HTTP-fixture页面验收通过320/390/1360宽度，登录/欢迎/403、匿名/撤权/失败/重试、触屏退出及CSRF请求、reduced-motion、键盘焦点、无溢出/页面异常。实际查看390欢迎截图，布局、按钮与文字正常。

## 真实隔离PostgreSQL17.6

显式命令 `node services/management-api/tests/admin-postgres.mjs` 通过。脚本不属于默认pnpm test，CI不要求存在此本地源容器。

先核实原任务容器 small-games-h5-matrix-20261015 的准确标签、挂载及127.0.0.1:15439。隔离fixture使用相同缓存PG17.6镜像、唯一标签/名字、独立bridge、不接源网络、严格回环随机端口和专属临时卷；创建前断言资源不存在，清理前核对精确容器ID/标签/挂载和无卷引用。最终该fixture容器、网络和卷均已清理，原容器没有重启或修改。

- 首次、重复及负例恢复后共3次迁移应用；重复同版schema/owner/ACL指纹一致。
- 13种未知或不安全状态失败关闭，且失败前后指纹不变：partial schema、额外列、未知表、不同owner、应用UPDATE、账本INSERT、PUBLIC读取、列default、identity、RLS、跨schema表继承、BRIN代替B-tree、角色成员关系。
- 应用只有两认证表SELECT/INSERT/DELETE和账本SELECT；UPDATE、DDL、账本写入、游戏表访问均拒绝。runtime角色无后管schema/table权限，owner具PG17 MAINTAIN，应用无MAINTAIN。
- 真实Drizzle连接池验证flow并发仅消费一次、过期flow拒绝，并通过实际advisory锁屏障覆盖刷新先持锁及注销先完成。真实HTTP验证匿名401、缺OAuth配置失败关闭、有效会话读取、缺CSRF拒绝、两次并发refresh只成功一次、旧token不可读取/刷新、固定八小时到期和Host-only Path=/api/。旧token可通过带原CSRF的注销撤销本族新token；独立会话仍有效。
- 同一专属volume和准确容器ID的PG容器实际restart，加management连接池/HTTP进程重启后，新token/昵称/到期时间仍保持；退出后会话失效。隔离库游戏sentinel行/owner/ACL保持。
- 原任务库所有Runtime行摘要和schema/列/owner/ACL/角色/成员关系指纹前后一致，原容器metadata一致。

PG receipt：[qa/postgres-current.json](qa/postgres-current.json)，包含准确源码、迁移、测试脚本及对应编译产物SHA256和规范LF源码hash。最终通过前出现的随机Docker端口读取、internal桥端口分配、Fastify只读属性与测试Origin错误均为fixture问题，已修正后完整重跑；未将失败轮次当作通过。

页面receipt：[qa/fixtures-current/receipt.json](qa/fixtures-current/receipt.json)，包含脚本/源码/产物/六张新截图SHA256、实际浏览器版本及fixture边界。原候选1c63a1af的preview.html与原qa六图保留来历，未用新图覆盖。

## 尚未验收

真实GitHub OAuth App/client secret尚缺，真实GitHub用户登录、生产TLS/代理/DNS入口、生产management_app/凭据/迁移、准确候选CI和真机均未由本子任务执行。fixture provider/页面返回不能称真实OAuth、真实后端页面端到端或真机验收。生产与最终提交推送继续由主会话唯一写入者处理。
