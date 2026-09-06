# 本地平台运行手册

## 启动与验证

环境要求为 Node 24.12.0、pnpm 8.14.1 和已启动的 Docker Desktop Linux containers。

```powershell
pnpm install --frozen-lockfile
pnpm dev:platform
```

该根命令启动 PostgreSQL、MinIO、Management API（53001）、Runtime API（53002）、Web Shell（5173）、B 站 Shell（5175）、Creator Studio（5174）和仅监听回环地址的 Workspace Agent（4319）。Ctrl+C 停止应用进程但保留容器与数据；`pnpm infra:stop` 停止容器但不删除卷。

完整验收执行 `pnpm test:e2e`。它先运行所有公开接口、Contract 与 UI 测试，再以真实 PostgreSQL、MinIO、服务和浏览器验证登录、草稿编辑/预览、Artifact 构建、发布/回滚、Catalog 装载、Managed Ad、奖励完成规则和云存档。真实 Catalog 流程最后通过 Runtime HTTP 与 PostgreSQL 对 Catalog 读取及存档写入各发出 100 个请求，并检查 100 RPS、读取 p95 < 200ms、写入 p95 < 500ms；目标部署环境仍应另行压测。

## 初始化账号、发布与回滚

另开终端设置一次性密码并初始化全角色本地账号；密码不会传给服务子进程。

```powershell
$env:STUDIO_ADMIN_PASSWORD = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText
$env:STUDIO_ADMIN_USERNAME = 'admin'
pnpm init:operator
Remove-Item Env:STUDIO_ADMIN_PASSWORD
Remove-Item Env:STUDIO_ADMIN_USERNAME
```

访问 `http://127.0.0.1:5174` 登录。发布流程为：创建或编辑 Dynamic Content 草稿，校验并预览，构建 Artifact，在 Releases 中选择 development/canary/stable 并确认影响范围。回滚时在 Releases 选择目标不可变版本并确认；操作只移动 Channel 指针，不修改或重建历史 Artifact。stable 发布、回滚、AI diff 应用和 Artifact 清理都必须保留确认步骤。

## 备份与恢复

停止写操作后，将备份写到仓库外的受控目录；不要提交备份或密钥。

```powershell
docker compose -f infra/docker/compose.yaml exec -T postgres pg_dump -U platform_owner -d small_games -Fc > C:\backup\small-games.dump
docker compose -f infra/docker/compose.yaml cp minio:/data C:\backup\small-games-minio
```

恢复前保留当前备份，在空数据库/空对象存储实例中演练并核对 Artifact 哈希。PostgreSQL 使用 `pg_restore --clean --if-exists` 恢复；对象存储停写后用 `docker compose cp C:\backup\small-games-minio/. minio:/data` 恢复。不要通过删除生产卷处理迁移或恢复问题。

## 故障与恢复检查

- `docker info` 无 Server：启动 Docker Desktop；不得用删除卷作为修复。
- 15432、59000、59001、5173、5174、5175、4319、53001 或 53002 被占用：定位占用者，不结束其他项目进程。
- `/health` 返回 503：查看 `docker compose -f infra/docker/compose.yaml logs postgres minio` 和服务 Pino JSON 日志；request ID 与 `gameSessionId` 用于串联请求。
- Runtime 不可用：Shell 使用本地配置与本地存档；恢复后同步测试会重试且不覆盖并发云存档。
- Artifact/Catalog 失败：校验签名、哈希、CSP 与 Release Channel；远程加载按目标、last-known-good、内置版本回退。
- 发布投影中断或确认丢失：重试 outbox；幂等投影不会重复移动指针。执行 `pnpm test:platform` 验证失败投影、重试和回滚。
- 遥测后端不可用：请求继续完成，Pino 记录 `Telemetry export failed`；恢复 exporter 后继续采集。

回归故障行为使用 `pnpm test`；真实数据库角色隔离、对象存储、发布投影、浏览器加载和容量使用 `pnpm test:platform`。恢复后必须再次检查两个 `/health`、Studio 登录、一次 stable Catalog 读取和一次云存档写入。
