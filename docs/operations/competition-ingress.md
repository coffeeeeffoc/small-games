# Competition HTTPS ingress

本入口仅用于获批的 `api.nenggongzhiren.cn` 和已盘点的历史 Nginx 布局。默认 `deploy:caddy` 仍为官网；首次启用显式提供非敏感拓扑：

```sh
pnpm deploy:caddy --prepare --ingress infra/caddy/ingress.example.json
pnpm deploy:caddy --ingress infra/caddy/ingress.example.json
```

示例网段与固定 IP 仍须在激活时重新盘点。部署拒绝与 Docker/宿主路由重叠的网段，以及未知布局、外来网络或成员。专用 `internal` bridge 只有 Caddy/Nginx 两个成员，不增加宿主端口。Caddy 保留 ACME 所需默认网络；Nginx 保留 `small-games_default` 和经盘点的固定后端 IP。公司 TCP 80/443、游戏 loopback 8080、PG 卷与端口均不扩展。

启用后普通 `deploy:caddy`（包括 prepare）只读恢复现役 `current/ingress.json`；读取失败直接停止，不能退回官网配置。没有远端配置的离线官网打包仍可用，但服务器拒绝用官网包覆盖受管入口。已启用拓扑不接受隐式关闭或自动变更。包中同时保存 Nginx-only Compose 和首次接管回滚 Compose：旧 `nginx` 目录只读挂到 `/etc/nginx/legacy`，新 `conf.d` include 旧配置及 edge IP:8082 listener。历史 release 必须保留；镜像与旧 game.conf 摘要不符时停止。

Caddy 自动申请/续期 API 证书并使用已有证书卷。公共路径有限枚举 competition 身份、游戏、榜单、房间、TCT 和 Carrom 端点；内部结算/审核、Catalog、Projection、Kart、静态文件及详细 health 为 404。公网 `/health` 代理 `/health/live`，仅 service/status，属于存活检查，不证明数据库 readiness。路径编码和歧义被拒绝，query 保留。

游戏正式地址为 `https://api.nenggongzhiren.cn/small-games/v1`；历史 `/api/competition/v1` 原地代理同一 Runtime，不使用重定向。两前缀共用同一真实 IP 额度，并保留方法、query 和正文。新 H5 客户端仅对这两个已审查的生产地址复用身份存储，其他 origin/path 继续隔离。

管理页面在 `https://admin.nenggongzhiren.cn`，管理 API 仅允许该站 `/api/` 的有限认证端点，经私有 Nginx listener 转发原 management-api。唯一 OAuth callback 为 `https://admin.nenggongzhiren.cn/api/auth/github/callback`。主域 `/admin/xxx` 页面 302 到管理站 `/xxx` 并保留 query；主域及 www 的 `/api`、`/admin/api`，以及 API 子域的后管别名均为 404。API 不进入 SPA fallback。管理页面、资源、403 与 API 都设置 no-store；代理日志不记录 OAuth query。管理 CORS、Cookie、CSRF 与公共 Bearer 独立。

后管生产角色、凭据和真实 GitHub OAuth 需另外确认。尚未接通 management-api 时，页面仍可发布，认证 API 固定返回 JSON 503；缺失资源/API 为 404。页面可访问或 fixture 测试通过均不代表真实用户登录可用。管理运行账号和现有库追加迁移的权限边界见 [后管架构](../admin-console/architecture.md)，不得为暂时显示页面而创建新数据库、使用 owner 运行应用或关闭认证。

Caddy 覆盖 Host/XFF/X-Real-IP/proto 并清除 Forwarded/internal-key。Nginx 仅信任固定 Caddy IP，用 `$realip_remote_addr` 检查原始对端，再按真实 IP 限流 60 请求/秒、burst 120，拒绝为 429。额度由同公网 IP 共享，为双人轮询/动作留有余量；会话创建仍受 Runtime 额外限制。既有 Origin、Authorization、CORS 不扩大。

Runtime 需要 `TRUST_PROXY=1` 与严格 `RUNTIME_TRUSTED_PROXY_IP` 成对配置，只信任精确的一跳。生产 rollout 必须先在当前 `backend-current` 覆盖中配置 `1` 与已复核的 Nginx 后端 IP，再启用 ingress；入口事务不重建 Runtime/Kart/PG。通用 Tencent/bundle 默认 `TRUST_PROXY=0`，不输出空 IP，按直连 gateway 计 Runtime 的 IP 额度，不能声称按真实玩家 IP。通用生产者需要开启信任时，须在受控入口显式合并 `-f compose.yaml -f <override>`；现有脚本只指定 `-f compose.yaml`，旁放 override 不会自动加载。

事务按 Caddy lock → small-games lock 固定顺序串行。先验证布局、Runtime IP、候选 Compose 和 cached-image 配置语法。校验容器 network none、无端口、不挂真实证书卷；runtime/kart 的 loopback add-host 仅供离线语法解析。Nginx `-t` 会绑定 listen 地址，因此仅在该隔离容器的网络命名空间设置 `net.ipv4.ip_nonlocal_bind=1`，验证原始配置字节；不改宿主 sysctl，不增加 capability 或 privileged。回滚的旧 Caddy tag 必须仍解析为现役缓存摘要，所有启动使用 pull never。

网络/服务激活前，用已校验候选备份程序在 root 私有目录保存现役证书/配置，验证摘要、证书配对和隔离恢复。使用已有 Docker 与 `sudo -n python3 <候选>/backup.py --preflight <Caddy目录>` 权限，不自动修改 sudo、防火墙或系统权限。备份包含可选 ingress、新 Nginx 配置、Compose 与 legacy 配置；不包含数据库。

私有 `transactions/` 记录备份摘要、容器非敏感投影和旧配置指纹，不读取 `.Config.Env` 或保存 bearer。先激活 Nginx，再激活 Caddy；官网原 release、API TLS、三款 metadata/versus 榜、health、拒绝路径、CORS 和保护对象通过后提交指针。失败恢复两层代理及原指针，仅清理本次新建且确认空闲的 bridge；回滚失败保留 guard 并明确报错。不恢复数据库或静态版本。

`/opt/small-games/ingress-managed` 阻止旧 Tencent 部署接管 Nginx。预先存在 marker 时，本地 preflight 在构建/上传前拒绝；服务器在服务/build/迁移前再次检查，并在获得游戏锁后复查。跨阶段不一直持锁，并发出现 marker 时可能已生成 staging，但不能激活旧栈。不要手动删除失败事务 marker 或执行历史整栈 Compose。

实际缓存镜像 `nginx -t`/`caddy validate`、真 TLS、真实来源头防伪造及受控无认证 `/me` 突发 429 仍需主会话验收。Windows mock 单元不替代这些检查。前后须核对官网 release、Runtime/Kart/PG、卷与 backend/static 指针。当前 Origin 仅 `http://localhost:8080`；不扩大 CORS，因此 TLS 成功不等于公开跨域 H5 可用。真实平台登录、广告与真机验收仍独立。

首次管理站证书请求有有限重试；持续 ACME/TLS 失败仍触发原事务回滚，不能通过跳过证书验证提交指针。实际管理站验收同时核对构建后的 HTML、JS/CSS 原始字节与缺失资源响应，并将匿名 401 与服务未接通 503 区分记录，始终单独记录真实 GitHub 登录是否完成。
