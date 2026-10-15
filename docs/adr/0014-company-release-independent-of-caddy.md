# 官网静态版本发布独立于 Caddy 运维

官网更新频繁，证书续期和 HTTPS 入口需要持续运行。原发布包同时携带 Caddy 配置和 Compose 文件，每次更新官网都会重建 Caddy，官网回滚也会回退入口配置。

将入口配置、Compose、证书卷备份放在独立的 `infra/caddy` 和服务器 `/opt/small-games/caddy`。官网包只携带公开静态产物、版本摘要与链接切换脚本。Caddy 挂载官网父目录，而不是绑定某个版本或启动时解析的 `current` 目标；官网发布及回滚通过原子替换 `current` 生效，无需容器操作或配置重载。

保留 `company-web` Compose 项目和已有 `company-web_caddy_data` / `company-web_caddy_config` 卷名，避免迁移时丢失签发账户和证书。首次拆分需要替换挂载，可能短暂中断官网；失败恢复旧配置。后续只有主动执行 Caddy 运维命令才更新入口容器。备份继续每日本地保存并保留 30 天，配置来源改为 Caddy 当前版本，不随官网回滚。

本次只服务现有官网，不增加多站点框架，不开启 api/admin，不改变游戏的内部访问和网络。
