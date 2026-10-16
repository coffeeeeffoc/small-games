# 用户自行配置 GitHub 并一键启用后管

仅在准确候选正常推送到 dev、相关 CI 与现有 HTTPS 入口通过验收后执行。真实 Client ID/secret 由用户自己填写、保存并执行；不要粘贴到聊天、Issue 或提交中。

## GitHub 配置

在 Settings → Developer settings → OAuth apps → New OAuth App 创建应用。Homepage URL 填 `https://admin.nenggongzhiren.cn`；唯一 Authorization callback URL 填 `https://admin.nenggongzhiren.cn/api/auth/github/callback`，callback 不使用通配符，不启用 device flow。

GitHub 当前允许多个 callback，本项目只配置一个是入口安全约束。步骤见 [Creating an OAuth app](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)。只申请读取邮箱的 `user:email`，不需要仓库权限或 GitHub 密码；见 [Scopes for OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)。只有已验证邮箱 `1521152077@qq.com` 可以建立管理会话；旧 Studio operator、游戏 Bearer、未验证邮箱不能替代。

## 本机填写并执行

部署命令不再重复执行旧基线候选校验、游戏构建或浏览器测试。正常提交推送和 CI 的相关检查保留；开发验证中的 Linux 权限契约在 Windows 使用 WSL。Docker/Compose 是服务器运行前置，本地 Docker 仅用于显式隔离数据库演练。

使用仓库规定的 Node 24.21.0、pnpm 12.6.0，已有 git、ssh、scp、tar。沿用 `.env.tencent.local` / `.env.company.local` 的 SSH 目标与私钥路径，用户须先核实主机指纹并配置 known_hosts；始终启用 `StrictHostKeyChecking=yes`、`BatchMode=yes`。缺 SSH 前置会在耗时构建前失败，不自动信任主机密钥。

Windows PowerShell：

```powershell
Copy-Item infra/admin-console/.env.example .env.admin.local
# 在本机编辑器自行填写两个 GitHub 字段，然后在仓库根执行：
pnpm deploy:admin
```

macOS：

```sh
cp infra/admin-console/.env.example .env.admin.local
chmod 600 .env.admin.local
# 在本机编辑器自行填写两个 GitHub 字段，然后在仓库根执行：
pnpm deploy:admin
```

该文件已被现有 Git ignore 规则覆盖。格式为 **raw KEY=value**：`=` 后原样使用，不加外围引号，不做 `$VAR` 或反斜杠展开，`#` 不开启行尾注释；只有独立注释行以 `#` 开头。接受 CRLF/LF 行尾，拒绝字段内换行、NUL、重复键、未知键、固定策略漂移。不要填写数据库密码或 S3 凭据。默认和 `--execute` 缺 OAuth 必定非零，助手不得运行该真实入口。

```sh
# 已获角色创建授权的维护者可先运行；不读取 OAuth 文件：
pnpm deploy:admin --provision-only
# 用户完成激活后，需要时只回滚管理服务：
pnpm deploy:admin --rollback
```

## 候选与秘密边界

要求整个工作树干净、HEAD 等于实时 origin/dev，构建和上传前后重新确认源码及目标未变。只编译 management 的实际运行依赖、cultivation 内容导出和 admin-web，不运行 cultivation UI、其他游戏或 Cocos 构建，不在部署命令里调用 validatePush。公开清单记录本轮 sourceSHA、明确 scope、文件 SHA256 与 `qualityChecks: not-run`，不生成或复用虚构的候选验收 proof。正常 push/CI 仍检查准确增量；远端推进应正常合并并重新推送。

所有 git/pnpm/build 及嵌套子进程剔除 ADMIN*\*、MANAGEMENT*\* 等凭据变量。发布包只含选定 management 后端、公开 admin-web 产物和带 SHA256 的部署源，不含本地 OAuth 文件、私钥、受保护环境。真实配置只经 SSH stdin JSON，不进 argv、日志、前端或制品。镜像以 node 用户运行，COPY 明确归属 node，兼容私有上传目录的 0700/0600 源权限。

命令输出脱敏阶段、每 15 秒等待进度和阶段耗时。远端阶段区分数据库保护/备份/恢复/迁移、游戏恢复、镜像构建、服务启动、HTTPS 和指针切换；失败显示停止阶段、固定原因与退出码，不打印 SQL、URI、原始 stderr、Location、Cookie 或 token。构建、SSH 和远端子步骤都有超时。SSH 断线或超时后不能直接假定零变更或回滚完成，应只读复核容器、指针和备份回执，保留现场后再处理。

服务端用非秘密 canary 实测 Compose `env_file.format: raw` 对 `$`、引号、`#`、反斜杠的保真能力，失败停止；实际 Compose 仅 `config --quiet`。配置在发布目录外 `/opt/small-games/admin-private/<release>/management.env`，目录 0700、文件 0600。数据库密码由服务器生成于同目录下 database.json 并复用，不要求用户再次输入。

## 备份、权限与停启

复用 `small_games` / platform_owner，仅追加现有 001 的 admin_console。禁止调用 `infra/deployment/bootstrap.sql`，它含额外旧业务授权。按 Caddy → game 顺序持锁，确认 Runtime 无活动房间、Kart 内部 health.rooms=0，停同一 Kart/Runtime ID（已有受本工具管理的 management 也暂时停），确认没有其他 client backend。发现玩家或未知写入者失败关闭。

完整 pg_dump、无密码的角色/成员关系备份和指纹仅保存在私有备份目录。使用原 PG 精确缓存镜像，在 network none、无端口、独占 tmpfs 容器完整恢复；比对所有旧行、序列 last_value/is_called/配置、schema、owner、ACL、角色及成员关系。clone 迁移幂等与实际权限负例通过后，owner 在一个事务中先关闭敏感 SQL 日志，再创建最小 management_app LOGIN、仅授不可转授 CONNECT、应用 001；旧对象和有效权限检查均在 COMMIT 前。未知状态直接拒绝，不修改旧 PUBLIC ACL。

管理角色无其他成员关系，仅 admin schema USAGE、两个认证表 SELECT/INSERT/DELETE、账本 SELECT。生产只查询权限，写负例仅 clone。受控异常及 HUP/TERM/INT 尝试恢复所有已停原容器并按精确 ID+标签清理 clone。硬断电/SIGKILL 需维护者按私有记录恢复同一容器，不能用数据库回档替代。

## 激活、探针与回滚

只启用原 management service 的 admin-only 能力，加入现有 backend network，无 host ports、无新 PG/DB/网络、无旧内容业务/S3/workers。可信代理由实际 Nginx backend IP 与 ingress.json 一致性确认。全程保护 Runtime、Kart、PG、Nginx、Caddy 及静态/backend/HTTPS 指针。

管理 UI 与 API 使用同一个 admin-console/current 版本指针。已有 Caddy 入口需由维护者一次运行 `pnpm deploy:caddy` 准备公开目录的只读挂载；保留既有 ingress、证书卷、拓扑及双代理事务回滚，不新增端口或网络。尚未激活管理版本时继续使用 Caddy 内原登录页；之后普通 `deploy:admin` 同步切换 UI 与管理服务，HTTPS 不匹配则同时恢复。普通后台更新不重发官网或游戏。

健康通过后有界等待 Nginx 负 DNS 缓存失效，校验 HTTPS 页面 200、匿名 session 401、登录 302 到 GitHub，以及固定 callback/scope、state/PKCE 和 Host-only Cookie 属性。输出仅布尔事实和 source/backup/old-state 哈希，不跟随 GitHub、不记录重定向参数值。**这不是真实 GitHub 登录验收**；用户最后自己在浏览器完成授权、刷新、退出和撤权验证。

激活失败恢复先前 management 镜像/私有环境指针；显式 rollback 也只操作管理服务。追加数据库身份/schema 和私有备份保留，不恢复覆盖现有数据库。不要删除备份或手工重置密码；固定枚举失败应复核，不扩大权限继续。
