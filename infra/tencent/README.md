# 腾讯云 COS + Docker CE 一键部署

在仓库根目录的 PowerShell 执行：

```powershell
Copy-Item infra/tencent/.env.example .env.tencent.local
# 填好 .env.tencent.local，再执行：
pnpm deploy:tencent --check
pnpm deploy:tencent
```

`--check` 只检查变量格式，不连接云端；`--prepare` 完成实际构建并生成本地发布包，不上传/部署。默认命令完成：构建整个游戏站 → 注入同源 API/WSS 地址 → 上传 COS 独立版本目录 → SSH 传送后端 → 构建镜像 → 数据库备份/迁移 → 健康检查 → 切换站点。

## 首次需要准备

- 本机：Node 24.12+、pnpm 8.14.1、Python 3.10+、SSH/SCP、tar。先运行 `pnpm install --frozen-lockfile`、`pnpm games:init`；Python 安装 `python -m pip install cos-python-sdk-v5`。使用其他 Python 时填写 `COS_PYTHON`。
- 游戏构建沿用仓库现有流程：卡丁车需要 Cocos Creator 3.8.8 或匹配当前源码的 `KART_PREBUILT_DIR`；其它 Cocos 游戏沿用各自构建要求。脚本不会把旧 dist 当成最新版本。
- 腾讯云服务器（CVM；这里沿用变量名 ECS）：Linux、Docker CE、Compose 2.20+、bash、curl、flock；SSH 用户能无 sudo 执行 docker，并能写入 `ECS_DEPLOY_DIR`。服务器需能拉取 Docker Hub 镜像和 npm 依赖。
- `GAME_DOMAIN` 指向服务器，80/443 端口可用；安全组放行 SSH 和 80/443。已有 Nginx/容器占用 80/443 时需先规划共用入口，脚本不会停掉它们。
- 在 `ECS_TLS_DIR` 放置域名对应的 `fullchain.pem`、`privkey.pem`。脚本使用已有证书，不申请或续期证书；更新后执行 `docker compose exec nginx nginx -s reload`。
- 已创建的 COS 桶和地域。静态对象前缀 `COS_PREFIX/releases/*` 需允许匿名 `GetObject`，写权限仅给部署身份；无需开启 COS 静态网站功能。脚本不会修改桶 ACL，也不支持直接代理一个完全私有且未授权匿名读取的桶。只在这个前缀放公开网页资源。
- COS 部署密钥只在本机上传进程使用，可填临时凭证 `COS_SESSION_TOKEN`；权限限制到对应前缀的上传操作，需支持 SDK 分块上传。三个后端密钥各自生成 64 位十六进制随机串。

环境变量优先于 `.env.tencent.local`。文件已被仓库 `.gitignore` 排除；不要提交它。SSH 首次使用 `accept-new` 记录主机指纹，已记录指纹变化会拒绝连接。更严格的环境可提前人工核验并配置 `known_hosts`。

## 访问和持久化

```text
https://游戏域名/
  ├─ /releases/<版本>/…     Nginx → COS 静态对象（同源，保留旧版本）
  ├─ /api/competition/v1/…  Nginx → Runtime API → PostgreSQL
  └─ /kart                 Nginx → Kart Server（WebSocket）
```

首页 302 到该次发布的目录，游戏 hash 路由、相对资源地址和分享链接保留版本。HTML 和 JS 一起发布完成才切换；失败不会删除旧 COS 对象。HTML 在发布副本中注入同源 API/WSS 配置，不修改游戏源码或原始构建产物。COS 上传明确设置 JS/JSON/WASM MIME 和版本缓存。

当前静态请求经过服务器，因此仍占用服务器出口带宽；以后需要让大资源直接走 COS/CDN 时，再增加独立的资源域名。

Compose 项目名固定为 `small-games`，仅 Nginx 发布宿主机端口；PostgreSQL 和比赛成绩重试队列使用命名卷。Kart 与 Runtime 共用网络命名空间，通过回环地址访问鉴权/结算接口，保留现有“仅本机 + 内部密钥”的限制；Nginx 通过 Runtime 的 43003 端口访问卡丁车。Runtime 的数据库身份无建库/建角色权限。每次更新前备份至 `ECS_DEPLOY_DIR/backups/<版本>.dump`，使用现有 010/011 迁移。数据库密码首次创建后保持不变，修改环境变量不会轮换已有角色密码。

这是游戏玩家端部署，包含当前好友对战、排行榜和卡丁车服务；不发布 Creator Studio、Workspace Agent、Management API 或其云存档/动态制品发布链路。单机游戏继续直接运行。当前卡丁车房间在内存中，重启会中断正在进行的比赛；已完成比赛的待上报成绩保存在卷中。本方案是一台服务器、一个卡丁车进程。

## 日常操作与回退

服务器上：

```bash
cd /opt/small-games/current     # 若自定义部署目录，相应替换
docker compose ps
docker compose logs --tail=100 runtime kart nginx
docker compose exec -T postgres pg_dump -U platform_owner -d small_games -Fc > /安全目录/manual.dump
```

部署失败会尝试恢复 `current` 指向的上一版应用容器，命令仍以失败退出；首次失败保留容器便于查看日志。数据库迁移不会自动逆转；若将来新增不兼容迁移，应先安排停服和恢复演练。手动回退应用可进入旧版本目录运行 `bash deploy.sh`（会再次备份/执行该版幂等迁移）。不要执行 `docker compose down -v`，它会删除数据卷。

旧发布包、镜像、COS 对象和备份不会自动清理；发布包含服务密钥，应只允许部署账号读取。备份位于同一服务器，正式运营前另行配置异地备份。首次部署应在公网验证网页、两浏览器联机、排行榜，以及服务重启后数据仍可读取。

## 以后增加官网

为官网使用另一个域名，例如 `www.example.com`。把静态文件放在 `ECS_DEPLOY_DIR/www/company/`，把独立的 `server { … }` 配置放到 `ECS_DEPLOY_DIR/nginx-extra/company.conf`；容器内对应 `/var/www/company`，证书可放在现有证书目录的子目录。官网配置按自己的域名监听 80/443，HTTPS 配置使用自身证书。然后在 `current` 目录运行：

```bash
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
```

这些共享目录不会随游戏发布覆盖。官网若有后端，可在之后加入同一 Compose 网络并仅由这个 Nginx 转发。

实现参考：[腾讯云 COS Python 上传接口](https://cloud.tencent.com/document/product/436/65820)、[Nginx WebSocket 代理](https://nginx.org/en/docs/http/websocket.html)、[Compose 健康依赖与启动顺序](https://docs.docker.com/compose/how-tos/startup-order/)。
