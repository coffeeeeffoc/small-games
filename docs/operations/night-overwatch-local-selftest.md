# 夜航守望：本机 Docker 与 Sakura Frp 手机自测

在仓库根目录运行，要求 Node 24、当前依赖、Creator 3.8.8、运行中的 Docker Desktop（Linux Engine 28+）。先确认 Sakura Frp 的 HTTPS 隧道指向本机空闲的 `127.0.0.1:43003`；使用其他端口时在命令末尾追加该端口。隧道地址只放在本机，不改正式 H5 或线上配置。

```powershell
$env:NIGHT_H5_PUBLIC_ORIGIN = 'https://你的隧道域名:公网端口'
node scripts/night-overwatch-selftest.mjs plan
node scripts/night-overwatch-selftest.mjs start
node scripts/night-overwatch-selftest.mjs pack
```

`plan` 只显示公开的 API、端口与游戏配置。 `start` 独立构建当前源码的 Runtime，启动 PostgreSQL、Runtime 和只监听 loopback 的 Nginx；网关只转发夜航游戏 API、身份与健康接口。Sakura Frp 负责公开 TLS，不转发管理 API 或数据库。私有 TapTap 登录凭证从被 Git 忽略的根目录 `.env.night-taptap-platform.local` 读取，格式为一个包含 platform、appId、secret 的 JSON 对象。不能将该文件放入 H5；后端使用独立本机数据卷和随机数据库密码，密码文件保存在 Git 忽略的 `.scratch/night-overwatch-selftest/database.env`，保留数据卷期间勿删除该文件。

`start` 会核对本地和公网的健康、公开 API、钱包鉴权、TapTap 来源预检和应拒绝的路径。`pack` 只打本款游戏、启用后端及其已配置的激励广告，终端打印本次 H5 包输出目录。手机 TapTap 上传/真机换码、广告库存与实际领奖仍由真实宿主验证。停止容器可用最新生成目录中的 `compose.yaml` 配合 `docker compose -p night-overwatch-taptap-test --env-file <database.env> -f <compose.yaml> stop`；保留数据卷，不用 `down -v`。
