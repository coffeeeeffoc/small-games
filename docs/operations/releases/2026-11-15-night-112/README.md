# 夜航补给额度与后管登录修复上线

2026-11-15（北京时间）已部署 Runtime 1.1.2、Management 和受管 HTTPS 代理。准确候选为 `1216eb49442fd6f0b59669ff19fec2395ef6185e`，由远端基线 `8d88f1e54965d8f9b9bbc79c2ea6ca36380c5cfc` 正常提交并推送，保留 hooks。完整脱敏回执见 [deployment.json](deployment.json)。

- 补给箱广告每天最多 12 次，转盘独立保留 10 次，资产接口总额度为 22。
- GitHub OAuth 授权码兑换等待 60 秒，资料和邮箱查询各保留 10 秒；精确 callback 代理等待 90 秒，其他管理 API 仍为 25 秒。
- 部署前通过真实后管页面确认 1.1.4 已登记且开放单人／双人新局。本次未修改版本登记、旧包映射、开关分组或渠道推荐。

执行顺序为 `pnpm deploy:backend --services=runtime --version=1.1.2`、`pnpm deploy:admin --reuse-remote-config`、`pnpm deploy:caddy --proxy-only`。Runtime 更新沿用原 Kart 镜像重建其网络同伴；后管保留既有私有配置。原 PostgreSQL 容器、镜像和数据卷未变，无数据库迁移；官网、旧静态和 backend-current 指针未变，两项既有定时器继续 active。

Runtime 更新生成数据库备份并检查 TOC；这份数据库备份未重新进行隔离全量恢复，回执 `isolatedRestoreVerified=false`。入口部署完成配置／证书备份、隔离恢复、真实缓存镜像配置语法和 HTTPS 验收。各部署沿用现有失败恢复守卫；未主动演练生产回滚。

正式 API 在最终代理上线后验证了 12／10／22 额度；1.1.4、1.1.1 和无 buildId 旧客户端均实际创建、恢复、取消首关单人局，分别使用 v18／v18／v16。测试仅使用新建 QA 游客，会话均退出。匿名管理 API 为 401、内部查询公共路径为 404；240 次受控匿名请求携带不同伪造来源头，214 次返回 401、26 次被 Nginx 限流为 429，无鉴权绕过。Runtime、Kart、Management、PostgreSQL、Nginx 均 healthy。

本轮复用同一修改此前通过的 OAuth 13 项、ingress 10 项、真实 PostgreSQL 资产 49 项、HUD 78 项及开箱浏览器 18 项证据；部署入口重新完成实际目标构建、制品摘要、服务器能力和健康检查。未重复全仓候选测试；回执采集时 [候选 CI](https://github.com/coffeeeeffoc/small-games/actions/runs/43646828209) 与 [Pages](https://github.com/coffeeeeffoc/small-games/actions/runs/43646828142) 尚在运行，云服务器上线不表示它们已经通过。

真实 GitHub 登录未重新执行，超时配置上线不等于间歇网络故障根因消除。本次未上传 TapTap 包，开箱及标记修复仍以实际渠道客户端包含对应代码为准；实体设备、真实广告和完整双人对局未验收。
