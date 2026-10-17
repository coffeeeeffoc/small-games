# 独立 002 数据库保护验收

2026-10-17 00:29:54 UTC，最终源码的隔离 PostgreSQL 验收通过。基线为 `1ae20d1f538d6bd7ab0c5a62f4d3e6e7d7a12062` 加本轮未提交改动；这是本地实现证据，不是已提交准确候选、CI 或生产发布证明。机器结果见 [control-deployment-current.json](control-deployment-current.json)。

## 实际环境与资源

- Windows Docker，WSL `/usr/bin/python3` 3.8.10，以 root 运行本次私有文件权限验收；仅本次临时 PATH shim 调用既有 Docker.exe，没有安装或修改全局环境。
- PostgreSQL 17.6 缓存不可变镜像 `sha256:d741b376874687de90374fd34f55c6b2760e8f7bd7e4ae5cd47f50757fc08cf8`；`--pull=never`、256 MiB、1 CPU、network none、无公开端口、仅自有 tmpfs 数据目录。
- 最终 fixture UUID `29da7880fe334a3fa205e979475a1aff`，执行 session `20854`，退出码 0。源容器及独立恢复容器的完整 ID/UUID 记在机器结果内，均已按身份和边界验证后清理，剩余自有资源 0。
- 真实执行了数据库备份、同版本完整恢复、SQL 事务和权限检查；服务生命周期 inventory 检查由夹具注入，没有真实 Nginx、Runtime、Kart 或 Management 服务停启。

## 已通过的数据库检查

完整 custom dump 与不含角色密码的角色 dump 在本次私有目录中恢复到独立同版本 PG；先证明所有旧数据、结构、owner、角色、ACL 的逻辑状态相同，再将原始 002 执行两次并验证幂等。恢复刻意改变角色创建/OID 顺序，逻辑指纹仍相同。角色 dump 只去除 PostgreSQL 标准随机 restrict/unrestrict 行；显式空 ACL 保持无权语义。

21 项检查覆盖实际正权限与 SQLSTATE 42501 负权限、旧 admin_console 数据和结构、旧 ACL/角色属性/触发器/策略、序列值及 OWNED BY NONE/改绑检测、未知全局 GUC/按数据库角色设置/default ACL 拒绝。14 种 control contract 变更均拒绝：列、默认值、owner、表/列/函数 ACL、索引、视图、函数体、trigger enabled、策略、未知类型、版本缺失和错误版本。缺 expected contract 和 projection hash 改变也拒绝。

成员、成员角色、revision/publication、active head、policy revision、观察与审计等正常业务行变化不改变 metadata contract；这些业务写入后真实只读 verify 仍通过。verify 使用同一纯 SELECT 段，实际事务 read-only 为 on，不创建 temp helper、不迁移、不操作生命周期。

真实 provision 路径验证生产形状的 10 字段 precommit JSON/hash pair、root 0600 单链接文件和私有目录，完整备份与 clone expected full/protected/contract 均在源事务 COMMIT 前写入并 fsync。源事务在同一个 COMMIT 前断言旧 protected 状态不变、full/contract 等于独立恢复预期。固定未知结果保持 unknown，不能从 schema 缺失推断未提交。

支持范围明确拒绝未知对象、default ACL、安全标签和未知角色设置；不会为接受任意数据库形状放宽 profile。001 仅用于创建本次全新夹具的旧结构，不重放既有生产 001/provision，不读取 env、密码或 OAuthSecret。

## 有限契约与源码绑定

串行运行 Node 24.21.0 的以下有限批次，全部通过：

- `node --test --test-concurrency=1 scripts/deploy-admin.test.mjs`：18 项，含 11 项 DB 单元契约、16 项 coordinator mock，以及实际 helper/SQL/002 文件复制打包检查；默认不启动 PostgreSQL。
- `node --test --test-concurrency=1 --test-name-pattern=admin scripts/publication-scopes.test.mjs`：5 项；新文件和精确 `.gitattributes` 路径选择真实消费者，未知同级属性文件仍拒绝。
- `node --test --test-concurrency=1 --test-name-pattern=admin scripts/validate-tree.test.mjs`：2 项，包含有意失败的 browser 夹具传播检查，整体通过。

最后的真实 PG 运行在以上有限批次之后，源码冻结未再修改。实际验收 SHA256：

| 文件                                     | SHA256                                                             |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `control-database.py`                    | `55168636acfa30e302489acd96eb99335cf513550e9c62fb64d13f7f7773c536` |
| `control-database.test.py`               | `88d76583c5fb93033efaddb50370f8f2c7be6277ad7609688d1cd8fb1f51f57b` |
| `control-fingerprint.sql`                | `d35f9662f8654925103ac46f53e06c43f9de00448479706aa3496d2d762dd881` |
| 原始 `migrations/002-control-center.sql` | `d16a0a06e9da6531b8140fa196dc0fe2a3d91a74cc2fcf877685fe7346f74451` |

002 内容未改；`infra/admin-console/.gitattributes` 只固定该迁移 `text eol=lf`。迁移 hash 证明受信制品字节，不表示数据库保存了迁移字节 hash。control metadata/projection hash 见机器结果，后续必须与受保护旧 proof 深比较，不能使用 live 重建基线。

## 尚未验收与生产阻塞

本轮没有 SSH、生产写入、端口/权限变化、生产数据恢复覆盖、commit/push 或依赖安装。没有验收生产维护入口、daemon 重启后的屏障、真实三服务切换、统一镜像激活、GitHub 登录或三款 H5 TapTap 包；这些由主会话继续协调。

生产 002/GRANT、维护窗口与恢复边界须按具体差异另行批准。首次 COMMIT 后只能使用兼容 schema2/control 协议的镜像；失败或未知结果保持既定 Nginx 入口关闭，禁止恢复 guardless 镜像或降低 floor。本地数据库通过不替代完整生产备份/隔离恢复、准确候选检查、实际入口验收与用户批准。
