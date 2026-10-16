# 后管集成交接

已从完整候选 `1c63a1af8bfc0fec650f3ae2996ca822d3145ff4` 迁入现有 management-api 与 admin-web，不新增独立服务/数据库。管理站和 API 只使用管理子域同源 /api/，唯一 callback 为 `https://admin.nenggongzhiren.cn/api/auth/github/callback`。最终规则见 [architecture.md](architecture.md)。

根 package/lock、代理、publication scopes、准确候选检查、提交推送和服务器部署由主会话串行整合。实现未触及生产 SSH、角色、秘密、服务或数据库。生产 management_app 与受保护凭据必须有单独授权；真实 GitHub client ID/secret 仍缺，不可声称用户登录验收完成。

UI 保留 React/React DOM19.3.1、React Router8.4.0、Vite8.3.4、TypeScript7.0.2 原候选依赖；management-api 无新增依赖/池。原六截图未覆盖，当前 fixture 输出 qa/fixtures-current。新增 PG 验证脚本为 `services/management-api/tests/admin-postgres.mjs`：只读核实原任务PG标签/挂载/行及schema/角色/ACL指纹，使用本次专属独立bridge网络、回环随机端口、唯一标签与专用临时卷执行隔离测试，最后以精确ID/标签/引用护栏清理，不修改原库。

主会话接回后需运行 Runtime 全套相关回归、入口代理与普通静态部署契约、准确候选增量检查和同 SHA CI。仅管理子域提供新 API；主域 /admin/ 页面跳转由入口代理处理，旧 Studio 逻辑保留。隔离 PG/HTTP/页面 fixture 均不替代生产网络、真实 OAuth 或真机验收。
