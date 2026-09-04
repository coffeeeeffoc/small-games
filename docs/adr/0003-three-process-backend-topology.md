# 两个线上服务与一个本地 Workspace Agent

线上部署 Management Service 和 Game Runtime Service 两个 Node.js/TypeScript 服务，共用 PostgreSQL 实例但使用不同数据库角色与 schema；开发者电脑另行运行只监听本机的 Workspace Agent。独立工具进程避免线上服务获得本地文件系统权限，也使未来远程后管仍能通过明确配对的本地工具完成源码操作。
