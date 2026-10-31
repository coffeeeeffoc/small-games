# 空间俄罗斯方块控制目录验收（2026-10-31）

本地工作区的 schema4 控制目录、迁移与发布保护验证。没有访问或修改生产数据库，没有启用生产游戏开关；不是准确提交候选或线上发布通过的证据。

- service-kit 全部 25 项通过，覆盖严格 13 项目录、历史 11／12 项摘要和缺项拒绝。命令：`pnpm --filter @coffeeeeffoc/service-kit test`。
- Runtime 控制读取、私有租约和 ranked 控制 8 项；Management 控制 7 项通过。两服务构建通过。
- `node --test --test-concurrency=1 scripts/deploy-admin.test.mjs scripts/deploy-backend.test.mjs`：32 项通过，包括 Python 有限契约、真实 Node 执行的包解析探针、精确 catalog4 回执和受限 schema3 迁移前恢复。
- 精确 admin infrastructure 增量分类用例通过；004 选择 Management、Admin Web、Runtime、Kart，未知相邻迁移继续拒绝。
- `node scripts/admin-control-postgres.mjs`：真实 PostgreSQL 17.6 的 24 项通过，包括 002→003→004、重复执行、原修订／发布／摘要／策略／ACL 保留、健康检查、策略锁及重启持久化。机器记录见上级 `control-postgres-current.json`。
- `control-database.test.py --postgres <fixture UUID> --receipt <file>`：实际完整备份与隔离恢复 28 项、14 种合同篡改拒绝，完整 helper 事务和 schema4 幂等通过，资源清理完成。见 [backup-restore.json](backup-restore.json)。WSL 使用 Docker Desktop 的本地 UNIX socket；只创建有标签的隔离 PostgreSQL 实例。
- 补充实际 schema3 入口调用 `migration_file()`，执行两次后为 schema4，原 12 条策略不变，新增为 `disabled:0:0`。见 [schema3-helper.json](schema3-helper.json)。正式 PostgreSQL 脚本也改为调用真实 helper 的版本选择链。
- Admin Web 构建及浏览器功能验证通过：320／390／1360 px，9 个已有页面和 15 组控制流程，包括 tetracube 初始禁用、保存草稿后未生效、发布后生效。实际 Caddy、触屏、权限、CAS、撤销、CSP／nonce 检查通过；见上级 `control-ui-current/receipt.json`。这是浏览器夹具验证，不是真实管理员登录或生产开关发布。
- 旧 Runtime 不可变镜像 `sha256:2c39366441e5d703ede32c0c025e49ccc1d4274925ab0fde242842400348d96d` 实际通过 catalog3，实际拒绝 catalog4。另一个旧 Management 镜像同时拒绝 3／4，未将其声称为 schema3 兼容。见 [old-images.json](old-images.json)。

002／003 原始 Git 字节及摘要未修改；003 工作区旧 CRLF 已恢复为其原始 LF。004 摘要为 `b114f40c7a0e7255dc2d0c97b166a5c23545297111065479eb002feaa8760f66`。

仍需由最终候选准备流程构建并验证真实 catalog4 三服务镜像。生产维护、真实 GitHub 管理会话、游戏开关发布及公网排行榜验收尚未执行。
