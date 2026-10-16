# 后端镜像安全能力下限

普通 `deploy:backend` 更新、失败后的自动恢复、手动 rollback 和 rollback 失败后的 failback，均使用当前审阅过的发布器和同一镜像能力下限。历史 release 只提供经过校验的 manifest、journal、镜像 ID 和有限标签数据，不执行历史 `deploy.py` 或历史 Compose override。

## 固定能力契约

共享标准库模块为 `infra/deployment/image-authority.py`，导入本身不执行命令。`image_capability(service, image)` 和 `require_images(images, failure)` 只返回实际不可变镜像 ID 和白名单整数版本；缺字段、布尔值、低版本、额外输出和错误函数形状均拒绝。

| 服务       | 固定模块与导出                                                                          | 最低版本                             | 必须导出的函数                                                                    |
| ---------- | --------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| Runtime    | `/app/services/runtime-api/dist/competition/auth.js` · `COMPETITION_AUTHORITY_PROTOCOL` | `control=1`, `ephemeralGuestScope=1` | `authenticate`, `assertGameScope`, `assertResourceAuth`, `assertStoredPlayerGame` |
| Kart       | `/app/services/kart-server/src/competition.ts` · `KART_AUTHORITY_PROTOCOL`              | `control=1`, `identityRecheck=1`     | `createCompetition`                                                               |
| Management | `/app/services/management-api/dist/admin/rbac-protocol.js` · `ADMIN_RBAC_PROTOCOL`      | `control=1`, `dbMemberRecheck=1`     | `readAdminControlFlag`, `readAdminRbacPrincipal`                                  |

探针在现有镜像的 Node 中导入真实模块，不运行服务入口。Management 的实际协议模块和业务绑定由单独变更交付；本发布器不部署管理服务。Tianxia 的既有选择行为不扩展，也不引入 Runtime 控制依赖。

## 普通更新的前提

停止服务前必须验证现役恢复镜像和候选镜像。Runtime/Kart 现役容器还必须已使用 `COMPETITION_CONTROL_ENABLED=true`，以及稳定的逻辑实例 ID `small-games-runtime`、`small-games-kart`；只比较这两个公开键，不输出环境。数据库 `game_control.schema_version` 必须恰为 `[2]`，通过既有 PostgreSQL 容器执行只读查询，缺失或不可读时拒绝。

因此，当前 guardless 生产镜像会被 `AUTHORITY_FALLBACK_REQUIRED` 阻断；没有“忽略检查”“降低下限”或自动禁用回退开关。首次采用需要以后独立审阅的维护/兼容恢复方案，不能用普通更新强开 control 或顺便执行迁移。后续协调器须在另行授权后构建并验证三服务兼容镜像，再执行控制迁移；迁移提交后的故障保持入口关闭并向前修复，不恢复 guardless 服务。本变更没有实现该协调器，也没有激活生产 CORS/RBAC。

Runtime 更新仍保留既有 Kart namespace 伴随重建规则；Kart-only 更新会验证受保护 Runtime 的能力和前提，但不把 Runtime 加入 selected。镜像 override 只能添加上述两个固定公开变量，继续使用当前已验证的 Compose context 和不透明 private env 文件引用。回退不恢复旧数据库、角色、控制发布或 killEpoch。

## 探针资源与失败诊断

每次探针用 UUID label 和精确名称执行 `docker create`，捕获完整实际 container ID。容器使用 network none、只读根文件系统、256 MiB 内存及 swap 上限、32 PID、0.5 CPU、node 用户、drop ALL、no-new-privileges，并禁用 healthcheck；不传环境、挂载或端口。镜像声明的 volume 在 create 前拒绝。

启动前核对身份与约束，`start --attach` 有截止时间。finally 再核对 ID、实际 image ID、UUID label 和精确名称，仅删除该 ID。create 返回丢失时，仅按本次 UUID、精确名称和 image 发现候选，再 inspect 核实；无法证明归属时不删除候选。Docker CLI 异常/信号清理也有独立截止时间，不使用隐式无界 wait。

清理或恢复失败返回固定错误；已核实的 `ownedContainerId`、probe UUID 和有界自有 CLI PID 通过有限诊断传回。原始失败原因只保留固定枚举，未知异常归 `UNEXPECTED_FAILURE`。不得按随机名称删除、吞掉清理错误，或打印原始 stdout/stderr、环境、数据库 URL、OAuth 和内部 key。

成功回执复用本轮候选或回退目标的已验证能力结果，并绑定健康检查确认的实际 image ID；激活成功后不再另起一次临时探针。

## 验证与实际发布边界

有限合同测试入口为 `node --test --test-concurrency=1 scripts/deploy-backend.test.mjs`，包括 backend 和共享 helper 的 Python mock 单元。共享 helper 变更精确选择 Runtime、Kart、Management 消费者，不选择无关游戏或 Tianxia；原有服务和后台检查继续由增量计划执行。

mock 通过不证明真实镜像导入、生产 ACL、TLS、数据库恢复或远端发布成功。发布器保留 schema/角色摘要、备份、namespace、健康、未选容器/指针保护；回执继续明确 `isolatedRestoreVerified=false`，不把备份目录列表检查说成隔离恢复验收。
