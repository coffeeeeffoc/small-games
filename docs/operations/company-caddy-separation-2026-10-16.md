# 官网发布与 Caddy 拆分验收记录

日期：2026-10-16，Asia/Shanghai。实施候选：`c447139bf513c799d207d85686dedca58ce39425`，基线：`9ed953910a6d56187bb22fbc1941a38309e64d10`。仅维护现有官网，不增加网站或开放游戏接口。

## 已完成

- `pnpm deploy:caddy` 独立部署到 `/opt/small-games/caddy/releases/20261015180358-c447139bf513-8153f8`，复用现有 `company-web` Compose 项目及两个 `company-web_caddy_*` 卷。首次迁移替换一次 Caddy 容器，之后官网发布不再更新入口容器。
- `pnpm deploy:company` 构建、测试并发布 `/opt/small-games/company/releases/20261015180440-c447139bf513-b5c574`。发布包无 Caddyfile 或 Compose。
- 实际执行 `pnpm deploy:company --rollback` 回到拆分前 `20261015164432-1900b5f85fa9-ed4ac8`，成功备份并隔离恢复，再次回滚恢复新官网版本。最终在线为上述 `c447139b` 官网版本。

## 验证证据

迁移后、官网发布后、回滚后及恢复新版本后，Caddy 容器 ID 均为 `739c40408fe745e5b76ba29d50118c3990320f9c2ae25b17aa5a973bd35f09cb`，启动时间均为 `2026-10-15T18:04:03.220319393Z`（上海时间 10 月 16 日 02:04:03）。官网切换期间无容器重建或重启。

四个原游戏容器的 ID、启动时间和端口绑定与迁移前完全一致；游戏 Nginx 仍只发布 `127.0.0.1:8080`，内部 `/health` 的 runtime、database、competition 均为 ok。

主域及 www 的可信 HTTPS 正常，证书 SHA-256 指纹与迁移前一致，仍有效至 2027-01-13。公网逐一下载官网全部 9 个资源并核对发布清单中的 SHA-256；HTTP 跳转状态为 308，www 永久跳转为 301，路径和查询参数保留。`.env`、`compose.yaml`、内部 API 路径为 404；api/admin 的 HTTP 为 404，HTTPS 未启用。

本地契约测试 9 项通过，其中 Bash 故障事务验证不执行真实容器操作，Python 5 项覆盖备份完整性、权限、轮换、变动文件及独立配置来源。发布范围测试 53 项通过。官网候选的现有生产构建与浏览器检查覆盖 1440/1024/768/390/320 宽度、键盘、触屏、无 JavaScript 等场景，全部通过；修改文件格式检查通过。另一次只读复核未发现有依据的缺陷。

## 备份

迁移前旧布局备份 `caddy-20261015T180206Z-f83425.tar.gz` 成功，并验证全部 14 个文件及证书/私钥配对。

迁移后、官网处于旧版本期间，独立备份 `caddy-20261015T180518Z-726724.tar.gz` 成功，SHA-256 为 `7007488de79c59c5bab0798972dc82d6ebc7def232e079f53f761a807432515a`。验证全部 15 个文件、证书/私钥配对，并解压到服务器新建临时目录逐文件核验；备份配置与独立 Caddy 当前配置一致。完成后删除临时恢复目录，未覆盖在线卷。

定时器 enabled/active，每天 03:30 Asia/Shanghai 开始，随机延后不超过 5 分钟，保留 30 天。最后检查 `Result=success`、`ExecMainStatus=0`，下一次计划为 2026-10-16 03:33 左右；验收时该时刻尚未到达，成功记录来自手动触发，未声称已观察到定时触发。

## 记录位置与边界

本机忽略目录 `outputs/company-deploy/` 下的 `separation-before.txt`、`separation-after-caddy.txt`、`separation-after-publish.txt`、`separation-after-rollback.txt`、`separation-final.txt`、`separation-restore.txt` 和 `separation-public-proof.json` 保存详细证据。私钥及备份包始终保留在服务器 root 私有目录，未下载至项目。

未强制续期、删除证书或重启主机；证书自动维护及开机策略沿用现有配置。本地备份仍无法抵御整盘损坏。未推送远端，未修改 GitHub Pages，未进行手机真机验收。

日常操作见 [官网发布与回滚](../../infra/company/README.md)；证书、持久卷和备份见 [Caddy 运维](../../infra/caddy/README.md)。
