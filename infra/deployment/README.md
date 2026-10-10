# 可选择服务的部署包

仓库根目录运行 `pnpm deployment:bundle`：默认真实构建 Pages 前端、Runtime API、卡丁车和天下岔路服务，输出到 `.scratch/deployment/<版本>/`。此命令只构建本地文件，不上传、不启动服务器；dev/main 的 GitHub Actions 保持前端发布。腾讯云上传与 SSH 部署继续使用原有 `pnpm deploy:tencent`。

构建环境为 Node 24.21.0、pnpm 12.6.0，先初始化递归子模块并安装冻结依赖。全站前端中的 Cocos 游戏仍需要真实 Creator 3.8.8 或匹配源码的预构建制品，不能拿旧 dist 代替。

```sh
# 可选：将 infra/deployment/.env.example 复制为 .env.deployment.local
pnpm deployment:bundle --check
# 按环境选择要打包的已有服务。kart 必须同时带 runtime。
DEPLOY_SERVICES=runtime,kart,tianxia DEPLOY_FRONTEND=1 pnpm deployment:bundle
# 只构建独立天下岔路后端，供现有前端连接；同样生成部署文件。
DEPLOY_SERVICES=tianxia DEPLOY_FRONTEND=0 pnpm deployment:bundle
# 后管是明确选择项，默认不打包。
DEPLOY_SERVICES=runtime,management,kart,tianxia pnpm deployment:bundle
# 只构建前端
DEPLOY_SERVICES= DEPLOY_FRONTEND=1 pnpm deployment:bundle
```

环境变量优先于 `.env.deployment.local`；PowerShell 用 `$env:DEPLOY_SERVICES='runtime,kart'` 形式设置。`DEPLOY_OUTPUT_DIR` 可指定一个尚不存在的输出目录，`DEPLOY_RELEASE` 可指定仅含小写字母、数字、连字符的版本。目录存在就失败，避免覆盖旧包。失败包没有 `manifest.json`；修正构建输入后选择新目录重试。

`DEPLOY_H5_AD_MODE=mock|off` 控制已接入公共发布能力的 H5 游戏：默认 `mock` 显示明确标注的模拟广告，正式部署可选 `off`。配置注入每个 HTML 副本的 `SmallGamesPublishingConfig.adMode`，不注入任意脚本或广告 provider，也不会把模拟完成当真实广告平台收益。

包内含编译后的服务、服务需要的游戏权威规则、workspace manifest/冻结锁、Dockerfile、Compose、Nginx、迁移、部署脚本、环境模板与 SHA-256 文件清单。不包含 node_modules、真实 `.env`、私钥或平台 secret。选中的服务及运行依赖真实构建，Docker 安装生产依赖。前端副本只注入所选 Runtime/Kart 的同源地址；源码与原始 dist 不修改。

## 在部署主机启动

把整个包复制到 Linux 主机上的稳定版本目录，例如 `/opt/small-games-bundle/releases/<版本>/`。主机需要 Node 24.21+、Docker Engine 28+、Compose 2.20+、bash、flock。Docker 构建需要可访问 npm 和镜像源；可通过 Compose build 的 `NPM_REGISTRY` build arg 切换依赖源。

```sh
cp .env.example .env
# 编辑 .env：数据库三种密码及内部密钥分别生成独立 64 位十六进制随机数。
# 若只有 tianxia 或前端，不需要数据库密码；management 另需真实 S3 配置。
node validate-env.mjs
bash deploy.sh
docker compose --project-name small-games-bundle ps
```

`deploy.sh` 不 source 环境文件；先验证字段，构建镜像，备份现有数据库，执行幂等迁移，等待全部应用健康，再切换网关。密钥不进入 Docker build context。数据库凭证只用于自己的 schema，应用没有建库、建角色权限。角色只在首次创建时设置密码；改 `.env` 不会轮换既有数据库角色密码。失败命令非零退出、保留旧卷和备份，不宣称已部署；多服务更新不是原子切换，运行中的房间可能中断，需在维护窗口执行。

只有网关 `127.0.0.1:8080` 和显式选择的后管 `127.0.0.1:43001` 发布主机端口，数据库不发布。Compose 项目固定 `small-games-bundle`，与旧腾讯云项目隔离，不会自动接管旧数据。数据库、卡丁车 outbox、天下战报分别用持久卷。旧环境迁移必须先备份恢复到新卷，不要误把空新库当数据丢失。

成功切换网关时会停止并移除同一项目中本次未选择的旧服务容器，保留它们的数据卷；例如不再选择 management 后不会残留旧管理监听端口。这会结束被移除服务的活跃会话。

公网用受控的 HTTPS 反向代理转发到 `127.0.0.1:8080`，把 `.env` 的 `APP_ORIGIN` 改为真实 HTTPS origin；不要直接公开后端端口。网关有 API 速率限制、请求体上限并拒绝内部结算/投影路径，清除调用方注入的内部密钥头。只有这一受控网关可给 Runtime/Kart 提供代理来源；接多层代理时需在外层另配真实客户端 IP 与限流。本地 SSH 隧道可转发到 8080 后从 `http://localhost:8080` 测试。

路由：`/` 为可选前端，`/api/competition/v1/` 为已启用的比赛接口，`/kart` 为权威 WebSocket，`/tianxia/` 为天下岔路服务（客户端设置的服务地址填 `https://域名/tianxia`）。`/health/gateway` 只说明网关存活，Runtime 的依赖就绪见 `/health/runtime`；请结合 `docker compose ps` 检查每个服务，而非只探测静态入口。

`COMPETITION_PLATFORM_CONFIG` 留在服务器，用于现有平台登录换取本服务凭证。平台 AppID/secret 不得进入前端变量。并非所有渠道的真实登录均已核验，配置存在不等于渠道已可发布；具体能力以平台矩阵及服务错误为准。网页访客、平台身份、房间/排行仍复用现有服务。

## 后管与已知边界

选择 management 时预先创建 S3 兼容 bucket，并提供其专用最小权限凭证；健康检查实际访问 bucket。后管不经过游戏网关，使用 SSH 隧道或单独受控 HTTPS 管理入口，保持 `STUDIO_ORIGIN` 精确匹配。初始管理员复用已有初始化逻辑（密码用临时环境注入，不写入命令历史）：

```sh
docker compose exec -e STUDIO_ADMIN_PASSWORD -e STUDIO_ADMIN_USERNAME management node initialize-operator.mjs
```

此包默认发布静态游戏及现有比赛接口。后管动态制品发布、签名投影和云存档链路默认关闭，若使用，需在 Compose override 中按现有运行手册成组配置 `RELEASE_PROJECTION_TOKEN`、`ARTIFACT_TRUSTED_PUBLIC_KEY`、`RUNTIME_PROJECTION_URL`、`SHELL_ORIGIN`、`ARTIFACT_DELIVERY_URL`，并单独配置受保护的管理/制品路由；AI 生成同样需显式提供完整 provider 配置。没有捆绑对象存储或绕过签名校验。

卡丁车和天下岔路活跃对局仍在单进程内存，重启不能恢复活跃快照；已结算成绩/重试 outbox/战报持久保存。天下服务不信任代理头，反向代理后共享其 IP 速率配额，当前适合小规模验证；大规模运营前应加入可信代理身份并压测。包不提供跨进程房间扩容。生产运营需要真实平台验证、TLS、监控告警、异地备份和恢复演练，不能把本地打包或 HTTP 冒烟当作公网发布验收。

备份位于当前包的 `../backups/`，另备份未发送 outbox 与战报卷。应用回退应在维护窗口进入旧包运行 `bash deploy.sh`；数据库迁移不会自动逆转，需先检查版本兼容。不要执行 `docker compose down -v`，也不要自动删除旧包与备份。
