# 既有 Management 的管理发布

配置中心使用现有 `small_games`、Management、Runtime 与 Kart。新发布入口和维护/恢复限制见 [中文部署说明](../../docs/admin-console/deployment.md)。没有新 DB、Studio、服务、端口、网络或 CORS 扩展。

当前发布候选为 schema3：通过统一 `--adopt-control` 事务从 schema2 升级，保留 002 原始文件并追加 003 夜航策略；普通更新要求可信 schema3 proof。下文 schema2/002 验收是历史记录，不能作为当前候选或生产升级通过的证明。

`control-deploy.py` 是当前审阅 coordinator；历史 release 只作严格数据读取。公开 v2 包精确绑定 002、独立 domain helper、三段 fingerprint、共享实际镜像能力协议及 nonce-v1 HTML。缺真实 helper 失败关闭，不能放置可执行 noop。

`deploy.py`、`fingerprint.sql`、001 保留历史实现与工具；新 CLI 不再开放旧 `--execute`/`--provision-only`。独立 `control-database.py` 与三段 `control-fingerprint.sql` 已通过本地缓存 PG17.6 的真实完整恢复、002 幂等、权限及元数据拒绝验收，详见 [记录与边界](../../docs/admin-console/qa/control-deployment-current.md)。本地 fixture 注入生命周期清单，没有操作真实 Nginx 或应用服务；生产 002/GRANT 仍待具体差异审批。任何 COMMIT/unknown 后的失败保留 Nginx closed 与私有 proof，禁止降级 guardless 镜像。

私有 `management.env` 仅通过 metadata 验证并交给 Compose raw env_file，coordinator 不读秘密内容。用户原 `.env.admin.local` 不进入新模式。真实 GitHub 登录仍需用户验收。
