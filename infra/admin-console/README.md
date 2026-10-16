# 现有 management-api 的后管能力

按 [架构说明](../../docs/admin-console/architecture.md) 配置现有管理服务，使用现有数据库的 management_app 凭据。不要创建独立 admin-api 服务、数据库或 PostgreSQL 卷。

`migrations/001-admin-auth.sql` 由现有数据库 owner 在已授权目标执行，运行服务不执行迁移。先备份与隔离恢复验证，再串行应用，核对原游戏 schema/ACL/数据不变。迁移不创建角色、不设置密码，不授管理角色游戏权限。

生产新增 management_app 和受保护凭据须获明确授权；GitHub client ID/secret 由用户配置受保护环境。缺少 GitHub 配置时允许页面和有限 API 响应，真实登录失败关闭。
