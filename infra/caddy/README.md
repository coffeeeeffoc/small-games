# 官网 Caddy 运维

Caddy 负责当前官网的 TCP 80/443、域名跳转、HTTPS 和自动续期。普通官网内容更新使用 `pnpm deploy:company`，不需要执行本运维命令；本次不增加多站点管理。

## 独立部署

```sh
pnpm deploy:caddy --check
pnpm deploy:caddy --prepare
pnpm deploy:caddy
```

`--check` 只读检查 Docker、现有证书卷和官网版本。`--prepare` 只打包到 `outputs/caddy-deploy/`。正常命令在源码提交后生成可追溯包，上传并验证摘要，检查端口归属、卷和 Caddy 配置，通过后更新 Caddy、验证两个 HTTPS 域名并安装/验证本地备份任务。需要现有 SSH、Docker 权限及免交互 sudo；DNS、防火墙不会自动修改。

只允许现有 `company-web` Compose 项目占用 80/443。保留此项目名、服务名和镜像 `caddy:2.11.7-alpine`；不操作游戏项目。Caddy 只读挂载官网稳定父目录到容器内的同一绝对路径，访问 `current/site`，不把某一发布版本或已解析的 `current` 直接绑定进容器。[Docker bind mount](https://docs.docker.com/engine/storage/bind-mounts/) 随容器建立；变更挂载需要替换容器。

服务器目录默认为 `/opt/small-games/caddy`，可由根目录 `.env.company.local` 的 `CADDY_DEPLOY_DIR` 指定。与官网目录必须分开，不能相互包含。其 `releases/<release>/` 存放 Caddyfile、Compose、备份程序和版本记录，`current` / `previous` 记录独立运维版本。首次迁移的 `previous` 可以指向旧官网 Compose 目录，只作为人工恢复依据。

首次迁移会替换 Caddy 挂载，可能短暂中断官网；以后仅主动升级 Caddy 或修改入口配置时才运行本命令。配置校验失败不改在线服务，激活/HTTPS 失败尝试恢复原 Compose。官网版本链接始终不由 Caddy 运维修改。内部健康检查 `/health` 不依赖官网发布文件，只绑定容器内 127.0.0.1，不发布 8081 或管理 API。

运行状态与日志：

```bash
cd /opt/small-games/caddy/current
docker compose --project-name company-web --env-file /dev/null ps
docker compose --project-name company-web --env-file /dev/null logs --tail=100 web
curl --fail --location https://nenggongzhiren.cn/release.json
curl --fail --location https://www.nenggongzhiren.cn/release.json
```

## HTTPS 与持久卷

Caddy 自动申请、续期并加载免费证书，无需手动上传、Certbot、acme.sh 或续期 cron。两个官网的 DNS 和 TCP 80/443 需要持续可用，服务器需能连接证书机构。见 [自动 HTTPS](https://caddyserver.com/docs/automatic-https) 与 [官方 Docker 运行说明](https://caddyserver.com/docs/running#docker-compose)。

显式复用两个外部命名卷，缺失即停止部署，避免悄悄创建空卷重新签发：

- `company-web_caddy_data`：证书、私钥及 ACME 签发账户。
- `company-web_caddy_config`：自动保存的配置。

`restart: unless-stopped` 配合已启用的 Docker 服务负责常驻和主机重启后的恢复。不要删除卷、执行旧 Compose 的 `down -v`、清理证书或反复强制签发。新 Compose 将卷标为 external，但手动卷删除仍会丢数据。升级或恢复前先验证备份。

`api` / `admin` 仍无路由和证书，不代理游戏内部入口。

## 每日本地备份

`pnpm deploy:caddy` 安装独立 Python 程序和 systemd service/timer，替换模板内的部署目录。不要把带 `@CADDY_DEPLOY_DIR@` 的源码模板直接复制为系统 unit。

每天 **03:30 Asia/Shanghai** 开始，随机延后最多 5 分钟，保留 30 天；关机错过时开机补跑。CPU 上限 10%，CPU/磁盘调度低优先级，不停止、暂停或重启任何容器。任务安装和备份失败都会使运维命令报错，修复后可重新执行；官网发布不依赖此安装步骤。

备份路径 `/var/backups/company-caddy` 为 root 700，归档与摘要为 root 600。安装程序是 `/usr/local/lib/company-caddy-backup/backup.py`。归档包含两个卷及独立 Caddy 当前版本的 Caddyfile、Compose、版本记录和官网目录标记；不再读取官网当前版本的运维文件，也不备份游戏、数据库或完整官网。

复制前后比较 SHA-256，验证归档摘要和全部证书/私钥配对，文件变动最多重试三次。进程锁不归档；新备份成功验证后才清理过期的同类副本。在线复制不是磁盘原子快照，持续变动会报错并保留旧副本。备份含私钥，不得放入 Git、网站目录或公开存储。

```bash
systemctl list-timers company-caddy-backup.timer --all
sudo systemctl show company-caddy-backup.service -p Result -p ExecMainStatus
sudo journalctl -u company-caddy-backup.service -n 30 --no-pager
sudo ls -lh /var/backups/company-caddy
sudo systemctl start company-caddy-backup.service
```

一次性任务成功后 `inactive (dead)` 正常，应同时看到 `Result=success` 和 `ExecMainStatus=0`。定时器应 `active (waiting)` 且有下次时间；仅启用不证明备份成功。失败只记入 journal，目前无邮件或短信通知。

## 恢复演练

在服务器 root shell 执行，替换实际归档名。先校验，再恢复到新建临时目录；不覆盖在线卷、不启动第二个 Caddy、不触发签发：

```bash
sudo -i
cd /var/backups/company-caddy
backup_file=caddy-YYYYMMDDTHHMMSSZ-xxxxxx.tar.gz
sha256sum --check "$backup_file.sha256"
python3 /usr/local/lib/company-caddy-backup/backup.py --verify "$backup_file"
restore_dir=$(mktemp -d /var/backups/company-caddy-restore.XXXXXX)
tar -xzf "$backup_file" -C "$restore_dir" --no-same-owner
```

`data/`、`config/` 对应两个卷，`deployment/` 对应当时运维配置。仅清理本次临时目录。旧备份继续可校验，但拆分前的 `deployment/release.json` 代表官网版本，拆分后代表 Caddy 运维版本。

真正恢复在维护窗口中进行：保留当前卷，将备份恢复到两个新卷，按备份配置准备官网静态文件并核对权限，再切换挂载和验证两个 HTTPS 域名；不要向运行中的卷解压。不需要停止游戏。

按当前选择仅保存在服务器本地，与在线数据同盘，无法抵御整盘损坏、重装或服务器销毁；重装前应另行导出并核验。首次拆分和每次重要运维后应手动成功备份并做隔离恢复演练。
