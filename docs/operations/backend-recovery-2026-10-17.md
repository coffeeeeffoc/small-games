# 后端部署恢复与日常更新

## 故障原因

2026-10-17 的候选 `0d7bfdfe4087-1792248271760-eb122d` 在停止 Runtime、Kart、Management 后调用数据库 helper。SSH 部署账号有效 UID 为 1000，helper 第一条检查却要求 root，迁移尚未执行就返回 `CONTROL_OWNER_REQUIRED`。协调器缺少完整的未提交证明，将 journal 保留为 `database-unknown`，三服务和游戏代理未恢复。

现场只读检查确认：数据库仍有旧 `admin_console`，没有 `game_control`；失败候选私有目录只有 journal，没有备份、precommit 或新镜像激活记录。官网和 PostgreSQL 仍在运行。管理静态首页返回 200，但管理会话和游戏健康接口返回 502，因此首页可打开不代表部署成功。

## 本次修复

- SSH、协调器、数据库 helper 使用同一部署账号，私有目录 0700、文件 0600；维护前检查身份、迁移文件和环境，停止写入者后再次核对。
- 对这个已证明在 SQL 前失败的历史候选提供专用恢复入口；验证候选、helper 摘要、原 journal、受保护指针、数据库状态后恢复原服务。恢复中断可以重试，不凭 schema 缺失单独推断安全。
- 002 控制中心迁移和 014 玩家会话迁移各自保存备份、隔离恢复结果及持久化证明。014 在同一事务内检查迁移前后状态、锁定写入、迁移并提交；提交响应丢失可根据实际数据库状态继续恢复。
- 完成标记必须同时匹配实际数据库结构与权限；正常新增玩家和修改昵称不会被误判为数据库漂移。应用回退必须满足当前鉴权能力要求。
- 三款游戏首次联网自动创建独立匿名身份，自动续期；随机昵称、内置头像可修改。没有注册、密码或登录页面。当前入口清除存储或换浏览器后会产生新身份，不提供跨平台找回。
- 访问凭证有效期 15 分钟，刷新凭证滚动有效期 180 天。后端校验服务端绑定的游戏、玩家、房间和操作权限；跨域来源不是身份凭证。

## 首次恢复

在已经提交、正常推送并通过对应检查的干净 dev 候选执行。所有命令复用服务器已有私有配置，不在命令中输入 OAuth 或数据库密钥。

```powershell
pnpm deploy:admin --recover-control=0d7bfdfe4087-1792248271760-eb122d --root-precondition
pnpm deploy:admin --prepare-control
# 使用上一条输出的实际 bundle 名称
pnpm deploy:admin --adopt-control=<bundle>
pnpm deploy:caddy --proxy-only
pnpm deploy:backend --services runtime,kart --check
```

`--root-precondition` 仅用于上述已绑定的历史故障，不是通用跳过检查。新迁移未知结果必须使用对应候选的 `--recover-control=<bundle>`，不要手动删 journal、改指针或重新执行旧安装器。014 清除旧的无游戏范围会话；玩家资料和成绩保留，客户端自动建立新凭证。

## 以后怎么更新

在仓库根目录执行，先提交并正常推送 dev，再部署本次改动的服务。部署入口检查干净 HEAD 与实时远端 dev 一致。

```powershell
git fetch origin dev
# 如果远端已有新提交，正常合并并重新验证候选
git push origin HEAD:dev

# 游戏后端和对战服务
pnpm deploy:backend --services runtime,kart
# 只改 Runtime 时也可使用 --services runtime

# 后管页面和管理 API
pnpm deploy:admin --reuse-remote-config

# 部署后检查
pnpm deploy:backend --services runtime,kart --check
```

日常应用更新不重复数据库迁移。只有域名、路由、代理规则变化时运行 `pnpm deploy:caddy --proxy-only`。游戏来源白名单、游戏开关、角色与菜单权限从后管发布并留历史记录，正常配置更新无需重启。

应用回退：

```powershell
# release 是要撤销的那次更新回执编号，不是旧版本编号；services 与该次更新一致
pnpm deploy:backend --services runtime,kart --rollback=<release>
pnpm deploy:admin --rollback
```

回退只切换兼容应用，不撤销 SQL。首次采用前的旧镜像若不满足当前鉴权能力，不能作为日常回退目标；先保留一个已验证的新基线。部署失败时保存命令输出及回执，按其阶段恢复，不删除保护记录来强行重试。

## 验证记录

截至实施中的本地验证：真实 PostgreSQL 恢复演练 28 项通过（含 14 类结构/权限变异、提交响应丢失和重试），Linux 协调器测试 25 项通过；三游戏手机浏览器自动身份、昵称头像、刷新复用通过；五个共享游戏页面的桌面与触屏对话流程通过。

提交 `92c271851ae95089bfabacacfd6f37df689ae841` 的独立 PostgreSQL/H5 验收已通过：12 种组合、6 场双人对局、2 场自然单人流程、真实 runtime_app/management_app 角色、跨游戏与房间越权负例、Runtime/PG 重启及重复提交幂等性。记录位于 `outputs/h5-taptap/anonymous-92c27185/`，fixture `654f7e37-be6c-43d5-afeb-ff2dd5c1407f` 已清理。这是本地浏览器与真实数据库验收，尚不等于公网或真机验收。最终发布 SHA、云端恢复、CI/Pages 和公网验证结果在执行后补充。真实广告完成和原生手机宿主验收单独记录，不能用 Web 模拟替代。

参考：[管理部署详细说明](../admin-console/deployment.md)、[准确候选发布规则](incremental-publication.md)。
