# GitHub 后台登录超时排查

2026-10-16 UTC，线上后台版本为 `7959e4de721312119b81caa16624462568851738`，发布标识 `7959e4de7213-1792167908214-2a4f2c`。容器 16:27:12 启动；16:35:56 的只读检查显示运行和健康检查均正常。未读取 OAuth 配置、授权参数、Cookie、数据库记录或原始敏感日志；未重放用户授权。

用户回调请求于 16:29:21.788 开始，16:29:31.795 返回 302，服务端耗时 **10,006 ms**，随后访问会话返回 401。代码中每个 GitHub 请求的超时为 10,000 ms；现有 callback catch 未保留失败阶段，历史记录不足以确定令牌交换、资料读取或邮箱读取中的具体请求。

从同一管理容器访问公开站点的无认证 HEAD 探测：

| 检查时间 UTC | github.com     | api.github.com |
| ------------ | -------------- | -------------- |
| 16:33:45     | 10,001 ms 超时 | 200，1,291 ms  |
| 16:35:56     | 200，344 ms    | 200，810 ms    |

已证实服务器到 GitHub 的连接存在间歇性超时，与用户回调耗时一致；这是最有依据的原因，但不能据此声称已确定当次失败的具体上游请求。数据库 schema 版本为 1，management_app 有 schema USAGE 及两个认证表的 SELECT/INSERT/DELETE 权限，表未启用 RLS。容器使用现有非 internal 网络。

白名单不匹配会跳转 `/forbidden`，state/code 失效会跳转 `error=expired`，不是本次的 `error=unavailable`。当前证据不支持修改白名单、OAuth 权限或数据库授权。

诊断补丁仅新增 `ADMIN_GITHUB_CALLBACK_FAILED` 固定事件：callback 的 identify/session_revoke/session_write/session_cookie 阶段，以及 provider 的 exchange/profile/emails 阶段、固定原因和 HTTP 数字状态。不记录原始异常、上游正文、URL、授权码、令牌、Cookie 或身份；保持原有 PKCE、一次性 state、最小 scope、白名单及 10 秒超时，不自动重试令牌交换。

本地 Windows / Node 24.21.0 验证：管理认证相关 5 个测试文件共 13 条通过，管理服务 typecheck、lint 通过。新增测试覆盖三个 provider 阶段的网络、HTTP、JSON、payload 失败，超时不重放，以及回调和数据库失败日志中的敏感信息 canary。只读复核未发现阻断。

补丁不代表网络已修复或真实 GitHub 登录验收通过。生产更新仍由用户运行原有 `pnpm deploy:admin`；再次失败后只提取固定诊断字段，按明确阶段继续排查。当前容器后续探测已恢复连通，可由用户自行开始一次新的正常登录；不重用旧回调地址。
