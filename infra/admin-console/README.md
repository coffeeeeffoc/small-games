# 现有 management-api 的后管能力

按 [架构说明](../../docs/admin-console/architecture.md) 配置现有管理服务，使用现有数据库的 management_app 凭据。不要创建独立 admin-api 服务、数据库或 PostgreSQL 卷。

`migrations/001-admin-auth.sql` 由现有数据库 owner 在已授权目标执行，运行服务不执行迁移。先备份与隔离恢复验证，再串行应用，核对原游戏 schema/ACL/数据不变。迁移不创建角色、不设置密码，不授管理角色游戏权限。

一键入口为 `pnpm deploy:admin`，跨 Windows/macOS 使用已有 Node/pnpm/git/ssh/scp；详见[中文部署步骤](../../docs/admin-console/deployment.md)。默认缺 OAuth 字段非零退出；仅用户本人填写根目录被 ignore 的 `.env.admin.local` 并执行。示例是 raw `KEY=value`，不要给值额外包引号，`$`、`#`、引号、反斜杠按字面保留。

`pnpm deploy:admin --provision-only` 在读 OAuth 文件之前分流，仅执行已获授权的现库最小角色、备份恢复证明及 001 原子迁移。数据库密码由服务器生成于 `/opt/small-games/admin-private/database.json`（目录 0700、文件 0600）并复用，不通过本机或发布包。用户不需要再次输入数据库密码。

新增角色仍须事先得到明确授权。未知角色/迁移/ACL、PUBLIC 越权、活跃游戏或未知数据库写入者均失败关闭，不替用户修改旧权限。脚本不调用通用 bootstrap、不新建数据库或公开端口。
