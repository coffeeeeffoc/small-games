# Creator Studio 本地认证

## 首次运行

```powershell
pnpm install --frozen-lockfile
$env:STUDIO_ADMIN_USERNAME = 'creator'
$env:STUDIO_ADMIN_PASSWORD = Read-Host '设置至少 12 位的初始密码' -MaskInput
pnpm init:operator
Remove-Item Env:STUDIO_ADMIN_PASSWORD
pnpm dev:platform
```

另一个终端运行 `pnpm --filter @coffeeeeffoc/studio-web dev`，打开 `http://127.0.0.1:5174`。前端通过 Vite 的同源 `/api` 代理访问 Management Service；Runtime 不参与管理账号认证。根命令执行事务化、可重复的 `002-management-auth.sql` 迁移，不需要删除旧 PostgreSQL 卷。

初始化命令只在没有账号时创建首个账号，拥有 creator、reviewer、publisher、admin 四个独立权限。重复或并发执行不会重置密码、改变权限或创建第二个初始管理员；PostgreSQL advisory transaction lock 串行化初始化。初期不提供账号注册、密码恢复或角色管理界面。忘记密码需由数据库管理员执行单独的受控运维流程，不提供绕过认证的 HTTP 入口。

初始化器先将密码保存在自身内存并移出子进程环境，再执行基础设施与构建步骤。密码不传给 Docker、构建进程或后续双服务进程。

## 会话边界

- Argon2id 使用随机 salt、19 MiB 内存、2 次迭代、1 路并行。密码至少 12 位、最多 128 位，数据库只存编码后的 hash；不存在账号仍执行密码比较，错误响应不区分账号和密码。
- 登录接口按实际连接 IP 限制为每分钟 5 次，刷新每分钟 20 次。当前限流在单个服务进程内，重启会清空，扩容前应使用共享限流存储；不信任客户端提供的转发 IP。
- 访问会话有效期 15 分钟；刷新会话绝对有效期 8 小时。两种 token 使用独立的 32 字节随机值，数据库只存 SHA-256 摘要。
- 刷新使用单条原子 SQL 替换访问和刷新摘要，旧 token 立即失效；并发刷新只有一次成功，不延长服务端绝对到期时间。退出会撤销两种 token 并清除 cookie。
- cookie 为 HttpOnly、SameSite=Strict，访问 cookie 限于 `/api`，刷新 cookie 限于 `/api/auth`。HTTPS Studio Origin 启用 Secure；本机 HTTP 预览是开发例外。生产需通过同源 TLS 反向代理部署，不使用 Vite 开发服务器。
- 所有认证写请求检查配置中的精确 `STUDIO_ORIGIN`，防止跨站登录和退出。该配置必须是完整 Origin，不含路径。Studio 不把 token 或密码放入 localStorage，也不读取 cookie。
- TanStack Router 在进入工作区前验证服务端身份，TanStack Query 管理身份缓存并定期复核。退出清空缓存，失效会话返回登录。前端页面保护不是服务端授权；后续业务接口必须验证会话并调用角色检查。

当前接口是 `/api/auth/login`、`/session`、`/refresh`、`/logout`。身份响应只有 id、username、roles；认证响应不缓存，依赖故障返回经过净化的 503。`hasRole` 表达独立权限，不把 admin 自动当作其他权限。

## 验证

`pnpm test:platform` 在真实 PostgreSQL 上验证密码 hash、初始账号不被重复修改、登录、过期、并发刷新重放拒绝和退出；它创建随机命名的测试账号并在结束后删除自己的记录，不修改已有账号。Management 单元测试覆盖 CSRF、限流和 cookie 属性；Studio 测试通过实际 Router 和 React 表单覆盖登录、错误反馈、未授权重定向、退出和会话失效。

密码设置参考 [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)。路由保护遵循 [TanStack Router authenticated routes](https://tanstack.com/router/latest/docs/guide/authenticated-routes)。
