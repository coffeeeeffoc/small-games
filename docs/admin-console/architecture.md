# 后管入口与认证

完整后管候选 `1c63a1af8bfc0fec650f3ae2996ca822d3145ff4` 的页面和 GitHub provider 已迁入现有 `services/management-api`，复用 `openDatabase`/Drizzle 连接池。没有独立 admin-api、Compose 服务、数据库或数据库卷。`MANAGEMENT_CAPABILITIES=admin` 仅注册后管认证和健康检查，不读取 S3/Studio 配置，不注册内容业务、发布或 AI 工作器。未设置时保留原 Studio 功能；需要并用后管认证时配置 `ADMIN_ORIGIN`。

运行凭据为 `MANAGEMENT_DATABASE_URL` 中的 `management_app`，不可用 owner/runtime 角色。现有数据库 owner 在现有库追加 `admin_console` 两个认证表与只读 `schema_version` 账本。应用仅获 schema USAGE、认证表 SELECT/INSERT/DELETE、账本 SELECT；不新增成员关系，不改游戏 schema/ACL。健康检查只读账本，不执行 bootstrap 或迁移。

## 单一同源入口

管理页面和管理 API 仅位于 `https://admin.nenggongzhiren.cn` 和其 `/api/` 下。唯一 OAuth callback：

`https://admin.nenggongzhiren.cn/api/auth/github/callback`

OAuth App Homepage 为管理子域，最小权限 `user:email`，关闭 wildcard callback。需要用户提供 client ID/secret 至受保护服务器配置；不要发到聊天或提交仓库。缺凭据时页面可访问，登录明确显示暂不可用；真实 GitHub 登录仍须用户凭据验收。

不提供 api 子域 `/admin`、主域 `/api`、主域 `/admin/api` 的任何新后管别名；服务拒绝其他 Host 和入口标记。主域 `/admin/xxx` 页面 302 到管理子域的页面由入口代理负责，API 不跟随页面规则。代理如设置 `x-management-entry`，必须覆盖为 `admin`、保持准确 Host；服务只接受精确 `MANAGEMENT_TRUSTED_PROXY_IP` 的 TCP peer 设置该头，不信任 XFF。没有此头的直连同样必须命中配置的准确 primary Host。

生产 Cookie 为 `__Secure-sg_admin_session` 与 `__Secure-sg_admin_flow`，HttpOnly/Secure/SameSite=Lax，Host-only、Path=/api/，不设置 Domain。本地 HTTP 使用 `sg_admin_*`。新会话独立于原 Studio operator 和游戏 Bearer。opaque 256-bit token 仅保存 SHA-256；flow 绑定浏览器 state、固定 callback、十分钟一次性记录及 PKCE S256。GitHub `/user/emails` 仅接受 verified 邮箱，使用有上限分页、超时和失败关闭。

默认白名单仅 `1521152077@qq.com`；每次请求检查当前白名单，撤权即删除会话。`GET /api/session` 只返回显示名、CSRF token 和到期时间。`POST /api/refresh` 在会话族事务锁内原子轮换，保留登录时固定八小时到期；旧 token 不可读取或刷新，仅在到期前可用于 `POST /api/logout` 撤销自身整个会话族。注销和刷新使用同一把锁，并在取得锁后重新读取或删除，晚到的刷新 Cookie 不能恢复登录；其他设备的会话族不受影响。注销按同一个 /api/ Path 清 Cookie。写操作同时要求 primary Origin 与真正的 `X-CSRF-Token`，前端退出带 session 返回的 token。不提供 mock 配置或运行环境测试登录接口。

## 迁移失败关闭

`infra/admin-console/migrations/001-admin-auth.sql` 由 owner 执行。不存在 schema 时追加三表；重复同版迁移不变。任何部分或未知已存在状态均拒绝：检查 schema/table owner、有限对象、列类型/非空/default/identity/generated/列 ACL、约束、索引、RLS、表 ACL、schema ACL、账本版本及运行账号成员关系。临时参考表用于比较当前 PostgreSQL 版本的默认 owner ACL，包含 PG17 的 MAINTAIN。事务失败不修复或覆盖未知状态，也不修改现有游戏表、账号属性或成员关系。

## 独立 CORS 与日志

集中 helper 位于 `packages/service-kit/src/cors.ts`。管理配置 `ADMIN_CORS_*`，公共比赛配置 `COMPETITION_CORS_*`；新 `COMPETITION_CORS_ORIGINS` 优先，旧 `COMPETITION_ORIGINS` 仅作 fallback。管理白名单默认仅 `ADMIN_ORIGIN`，公共默认 credentials=false，保留现有 `http://localhost:8080`。方法/请求头/credentials/OPTIONS max-age 可配，拒绝通配符和非法字段；OPTIONS 仅验证策略，不执行业务或鉴权。CORS 不替代 Cookie、白名单或 CSRF。原 Studio 保持原 `STUDIO_ORIGIN` 保护。

.env.example 用中文预留微信/抖音/B站/TapTap 真实 Origin，未确认前留空，不编造域名。管理请求 serializer/telemetry 过滤查询串，保留原 telemetry 字段；404 仅返回有限错误，错误日志不记录 OAuth code/state、Cookie/token/client secret。

## 视觉来历

候选原基线为 `26756c80cfa4ddf9bda16269265e353fddeaeeaf`。`preview.html` 与 `qa/` 六张原截图保留历史来历，不作为当前真实后端验收。UI 保持原视觉，只调整 `/api/auth/github`、CSRF 与 API 返回契约。新 HTTP-fixture 页面截图写 `qa/fixtures-current/`，独立记录真实 PG 证明；fixture provider/页面响应不能称为真实 GitHub 验证或真机验收。
