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

### 私密平台登录配置

`deploy:backend --services=runtime --platform-config-file=<本机私密 JSON 文件绝对路径>` 可同时补入一个平台应用的登录配置。文件是单个对象，字段为 `platform`、`appId`、`secret`、`games`，与 Runtime 的 `COMPETITION_PLATFORM_CONFIG` 条目一致；夜航使用 `platform=taptap`、`appId=tapmcjgwi2thafs87k`、`games=["night-overwatch"]`。必须先确认小游戏服务端 Secret 被 TapTap 官方接口接受。配置文件不提交 Git；此参数不能与 prepare、check、rollback 或不含 Runtime 的服务选择组合。

文件内容只随最终 SSH stdin 传入，不能放进参数、构建环境、镜像、上传包、manifest 或回执。服务器在现有发布锁中读取 Runtime 的该单个配置项，按 `(platform, appId)` 合并密钥及游戏范围，保留其他应用与已授权游戏。新配置写入 `backend-private/<release>/platform-login.json`，目录 0700、文件 0600；仅覆盖 Runtime 的 `COMPETITION_PLATFORM_CONFIG`，对 `$` 做 Compose 转义。上线后比较实际容器内配置，失败则恢复原配置和镜像。

事务日志只记录私密配置文件的 SHA-256。手动回滚校验当前配置路径、摘要和限定结构，只移除本次平台配置文件；保留当前 Compose 的其他配置层，不执行历史 Compose 内容。回滚失败时恢复回滚前的配置。后续普通镜像更新继承当前平台配置；历史镜像 override 的环境变量白名单不放宽。数据库备份、活动对局检查、健康、边界与能力下限照常执行。

同一 MiniApp ID 下，玩家身份按官方换码得到的 `openid` 在数据库中关联。版本号不参与玩家主键。首次携带有效游客凭证绑定可保留原 UUID、昵称和成绩；之后重新取得真实 `tap.login` code 即可恢复原 ID。首次绑定前丢失游客凭证、使用不同应用或不同数据库，均不能据此声称原游客身份可恢复。测试桩和隔离 PostgreSQL 验证不能替代真实 TapTap 账号的首次绑定、升级冷启动与清缓存恢复验收。

## 探针资源与失败诊断

每次探针用 UUID label 和精确名称执行 `docker create`，捕获完整实际 container ID。容器使用 network none、只读根文件系统、256 MiB 内存及 swap 上限、32 PID、0.5 CPU、node 用户、drop ALL、no-new-privileges，并禁用 healthcheck；不传环境、挂载或端口。镜像声明的 volume 在 create 前拒绝。

启动前核对身份与约束，`start --attach` 有截止时间。finally 再核对 ID、实际 image ID、UUID label 和精确名称，仅删除该 ID。create 返回丢失时，仅按本次 UUID、精确名称和 image 发现候选，再 inspect 核实；无法证明归属时不删除候选。Docker CLI 异常/信号清理也有独立截止时间，不使用隐式无界 wait。

清理或恢复失败返回固定错误；已核实的 `ownedContainerId`、probe UUID 和有界自有 CLI PID 通过有限诊断传回。原始失败原因只保留固定枚举，未知异常归 `UNEXPECTED_FAILURE`。不得按随机名称删除、吞掉清理错误，或打印原始 stdout/stderr、环境、数据库 URL、OAuth 和内部 key。

成功回执复用本轮候选或回退目标的已验证能力结果，并绑定健康检查确认的实际 image ID；激活成功后不再另起一次临时探针。

## 验证与实际发布边界

有限合同测试入口为 `node --test --test-concurrency=1 scripts/deploy-backend.test.mjs`，包括 backend 和共享 helper 的 Python mock 单元。共享 helper 变更精确选择 Runtime、Kart、Management 消费者，不选择无关游戏或 Tianxia；原有服务和后台检查继续由增量计划执行。

mock 通过不证明真实镜像导入、生产 ACL、TLS、数据库恢复或远端发布成功。发布器保留 schema/角色摘要、备份、namespace、健康、未选容器/指针保护；回执继续明确 `isolatedRestoreVerified=false`，不把备份目录列表检查说成隔离恢复验收。
