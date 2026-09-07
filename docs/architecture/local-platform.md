# 本地基础设施与双服务

## 启动与停止

需要 Node.js 24、pnpm 8 和已启动的 Docker Desktop（Linux containers）。在仓库根目录执行：

```powershell
pnpm install --frozen-lockfile
pnpm dev:platform
```

该命令启动并等待 PostgreSQL / MinIO 健康，构建双服务与依赖，幂等初始化对象桶，再运行双服务、两个 Shell、Creator Studio 与 Workspace Agent。任一子进程退出会停止同组进程。前端由 Vite 提供热更新；服务修改后需 Ctrl+C 并重新运行。

Ctrl+C 停止本次服务进程，数据库和对象存储留在后台。`pnpm infra:stop` 停止本项目的两个容器，保留持久卷；`pnpm infra:up` 再次启动。不会停止其他 Compose 项目，也不会删除任何卷。

| 组件                 | 本机地址                                            |
| -------------------- | --------------------------------------------------- |
| Management Service   | `http://127.0.0.1:43001/health`                     |
| Game Runtime Service | `http://127.0.0.1:43002/health`                     |
| PostgreSQL           | `127.0.0.1:15432`，数据库 `small_games`             |
| MinIO S3 / Console   | `http://127.0.0.1:59000` / `http://127.0.0.1:59001` |
| Web / B站 Shell      | `http://127.0.0.1:5173` / `http://127.0.0.1:5175`   |
| Creator Studio       | `http://127.0.0.1:5174`                             |
| Workspace Agent      | `http://127.0.0.1:4319`                             |

`/health/live` 只表示进程存活；`/health` 检查自己 schema 的版本标记和（Management）对象桶，失败返回 HTTP 503，不返回原始错误或凭据。请求日志采用 Fastify 的 Pino JSON 日志及 request ID；Game 请求同时记录 `gameSessionId`。`service-kit` 的可选 `RequestSpanExporter` 是 OpenTelemetry adapter 接缝，导出失败不影响业务请求。

## 数据所有权和初始化

`infra/migrations/001-local-ownership.sql` 仅在本项目 PostgreSQL 持久卷第一次初始化时执行。`platform_owner` 仅用于本地引导和迁移；服务使用 `management_app` / `runtime_app`，无 superuser、角色切换、schema 创建或跨 schema 权限。每个服务连接池最多 5 个连接；SQL 超时 5 秒，空闲事务超时 30 秒。后续迁移必须显式授予自己服务所需表权限；不使用跨 schema 默认 grants。

初始 schema 版本标记由首次启动创建；后续 Management 账号迁移由根命令事务化执行，业务草稿由 #13 增加。真实隔离测试临时创建 Management 草稿表并授予 Management 读取，证明 Runtime 读取被 PostgreSQL 拒绝，随后删除测试表。账号初始化见 [Studio 本地认证](studio-authentication.md)。

本地 Compose 的固定密码是公开开发占位值，不能部署到公网。所有端口只发布到回环地址。开发环境配置位于 `scripts/platform-config.mjs`；Management 独有 S3 配置，Runtime 不需要对象存储凭据。MinIO 本地使用专属实例的管理员凭据；部署时需改用仅限 Artifact 桶的 IAM 身份、独立密钥、TLS 和安全维护的镜像。

服务生产构建不会提供默认凭据，缺少配置即启动失败。独立执行前设置对应环境变量，再运行：

```powershell
pnpm exec turbo run build --filter=@coffeeeeffoc/management-api...
pnpm --filter @coffeeeeffoc/management-api start
pnpm exec turbo run build --filter=@coffeeeeffoc/runtime-api...
pnpm --filter @coffeeeeffoc/runtime-api start
```

Management 必填 `MANAGEMENT_DATABASE_URL`、`STUDIO_ORIGIN`、`S3_ENDPOINT`、`S3_BUCKET`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`，可选 `S3_REGION`（默认 `us-east-1`）；Runtime 必填 `RUNTIME_DATABASE_URL`。两者可设置 `PORT`。不要把引导 owner 账号传给服务。

## 验证与故障排查

`pnpm test:platform` 启动基础设施、构建并验证真实数据库隔离、S3 二进制往返与错误、双服务 HTTP readiness。测试结束停止临时服务、清除自建草稿表，保留容器、卷和一个固定 `diagnostics/round-trip-v1.txt` 对象以便排障。

日常根质量门禁不要求 Docker；双服务单元测试覆盖配置缺失、依赖故障和结构化健康响应，独立 smoke 检查实际构建输出和 HTTP 端口。实时基础设施检查不参与 Turbo 缓存。

- Docker pipe 不存在：先启动 Docker Desktop 并等待 `docker info` 能显示 Server。
- 拉取失败：检查 Docker 的代理及镜像仓库连通性，不替换为来源不明镜像。
- 端口占用：检查 15432、59000、59001、43001、43002 的占用者，不结束其他项目进程。Windows 还需用 `netsh interface ipv4 show excludedportrange protocol=tcp` 检查系统保留区间（不自动修改系统规则）。
- 数据库健康但服务 503：检查 schema 初始化和应用角色；旧卷不会重新运行引导 SQL。保留卷，先备份再根据已记录版本执行迁移，禁止以删卷作为自动修复。
- MinIO 503：检查桶是否已初始化、S3 endpoint 和凭据。重新执行根启动命令会幂等创建桶。
- 查看日志：`docker compose -f infra/docker/compose.yaml logs postgres minio`，服务日志直接显示在启动终端。

底层采用 [Fastify](https://fastify.dev/docs/latest/Reference/Server/)、[Drizzle PostgreSQL adapter](https://orm.drizzle.team/docs/get-started-postgresql) 和 [MinIO 官方镜像](https://hub.docker.com/r/minio/minio/tags)。此配置用于本地开发，不是生产部署模板。

完整启动、发布、回滚、备份恢复和故障处置见[本地平台运行手册](../operations/runbook.md)。
