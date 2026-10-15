# 公司官网一键发布

在仓库根目录执行：

```powershell
pnpm deploy:company --check   # 只读检查 SSH 和 DNS
pnpm deploy:company --prepare # 构建、浏览器检查并打包，不连接服务器
pnpm deploy:company           # 一键检查、构建、测试、上传、部署与公网验证
pnpm deploy:company --rollback
```

只发布 `apps/company-web` 的静态产物，使用独立的 `company-web` Compose 项目和 Caddy，监听 TCP 80/443。主域 `nenggongzhiren.cn` 提供官网，`www.nenggongzhiren.cn` 保留路径跳转至主域。Caddy 自动申请、续期和加载免费证书，并处理 HTTP 到 HTTPS 的跳转。

现有 `small-games` 游戏、数据库及 `127.0.0.1:8080` 保持原状，不需要 COS。官网容器不加入游戏网络，不代理游戏内部入口；`api`、`admin` 尚未配置路由和证书。其他服务占用 80/443 时部署停止，不能使用游戏的 `deploy:tencent --public` 来发布官网。

## 首次准备

1. 本机使用仓库锁定的 Node/pnpm，安装 workspace 依赖和 Playwright Chromium。官网及部署代码需提交后才能生成带准确 source SHA 的发布包。
2. 将 `infra/company/.env.example` 复制为根目录 `.env.company.local`。SSH 默认复用 `.env.tencent.local` 的 `ECS_HOST`、`ECS_USER`、`ECS_SSH_PORT`、`ECS_SSH_KEY`；进程环境优先。两个本地 env 文件都被 Git 忽略，不进入压缩包。
3. 把 `nenggongzhiren.cn` 和 `www.nenggongzhiren.cn` 的 A 记录指向服务器公网 IPv4。不要留下指向其他服务器的 A/AAAA 记录。放行云防火墙的 TCP 80/443；SSH 沿用现有配置。脚本不改 DNS 或防火墙。
4. 无需预先准备证书或 DNSPod 密钥，不再使用 `COMPANY_TLS_DIR`。服务器需要能够连接外部证书机构；Caddy 首次启动后自动验证域名并签发证书。
5. SSH 主机指纹必须已核验并保存在 `known_hosts`。服务器需要 Docker/Compose、bash、curl、OpenSSL、getent、ss、flock、tar 和 sha256sum。部署账号须能访问 Docker 和写入 `/opt/small-games`。

备案页脚使用完整网站号 `沪ICP备2026053115号-1`，链接至工信部查询网站，打包时校验与 `COMPANY_ICP` 一致。

## HTTPS 和自动续期

Caddy 通过 ACME 自动验证两个官网域名、申请免费证书并在到期前续期；新证书自动投入使用，无需 acme.sh、Certbot、续期 cron、手动上传证书或 DNSPod API 密钥。域名解析及验证端口须持续可用。参见 [Caddy 自动 HTTPS](https://caddyserver.com/docs/automatic-https)。

证书、私钥及签发账户保存在持久命名卷 `company-web_caddy_data`，自动保存的配置保存在 `company-web_caddy_config`。两个卷独立于官网发布目录，更新容器、切换版本和回退不会删除。不要执行 `docker compose down -v` 或清理这两个卷；备份时按私钥材料保护数据卷。参见 [官方 Docker 部署说明](https://caddyserver.com/docs/running#docker-compose)。

首次启动可能先通过容器内部健康检查，再完成证书签发，因此发布事务还会重试并验证两个域名的可信 HTTPS 和准确版本。仅内部健康通过不算发布成功。日常检查：

```bash
cd /opt/small-games/company/current
docker compose logs --tail=100 web
docker compose ps
curl --fail --location https://nenggongzhiren.cn/release.json
curl --fail --location https://www.nenggongzhiren.cn/release.json
```

保留数据卷和运行服务，并监控公开证书的剩余有效期。不要为了验证续期反复删除证书或强制重新签发，避免触发证书机构限额。

## 产物、校验与回退

包输出到 `outputs/company-deploy/<时间-SHA-随机串>.tar.gz`，相邻 `.sha256` 校验整包。内容只有 `site/`、`caddy/Caddyfile`、Compose 配置、部署脚本与文件摘要；不含服务密码、SSH/TLS 私钥或游戏代码。`site/release.json` 记录公开的源码 SHA、版本、域名、备案号和网站资源摘要。

官网现有浏览器测试覆盖 1440/1024/768/390/320 宽度、键盘/触屏导航、业务卡片、动效及无 JavaScript 降级。生产产物使用相对资源地址，可部署在域名根目录；脚本仍运行已有子路径回归。

上传后校验压缩包和文件摘要，使用不发布端口的临时容器运行 `caddy validate`，再更新官网容器。容器健康与本机可信 HTTPS 的两个域名检查成功后切换 `current`/`previous` 标记；容器切换可能有短暂中断。激活失败自动恢复旧官网容器，首次发布失败关闭官网容器并保留证书卷。其他 Compose 项目不会被停止。

最后从本机通过公开域名核对本次版本。此步失败会明确报错；服务器本机健康通过不等于公网发布成功。`--rollback` 只恢复服务器上的上一版并检查本机 HTTPS，之后仍应在外网打开两个域名检查。

旧包和旧版本不自动删除，方便回退。DNS/防火墙控制台操作、续期监控与真实外网访问仍需要单独完成和核验。

脚本契约测试运行 `pnpm test:deploy-company`：除配置、静态隔离、自动 HTTPS 与证书持久化契约和包摘要外，在临时目录用假 Docker/curl 验证成功切换、显式回退、启动/TLS 失败、首次失败、端口冲突和损坏文件。Linux 使用 bash，Windows 使用已安装 WSL 默认 Linux 发行版，不操作真实 Docker 服务。该故障测试不替代最终服务器 Caddy/HTTPS 验证。
