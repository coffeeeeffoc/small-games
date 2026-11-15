# 本地后管换码超时与微信测试包准入

2026-11-15 仅更新本地 Docker Management：在原 `night-20261113-duel12` 镜像上替换已提交修复的 `github.js`，GitHub 授权码兑换超时从10秒改为60秒，资料／邮箱请求保留10秒。其余环境、端口、命令保持一致；Runtime、Postgres、Gateway 容器身份和挂载均保持，未做数据库迁移。

- 修复源码：`1216eb49442fd6f0b59669ff19fec2395ef6185e`。
- 新镜像：`small-games-bundle:night-20261115-admin-oauth60`，镜像摘要 `sha256:3cbb66890eb94abb3cf2f19e2caa64eee0ebf3f5209bce3116e5daeca644f755`。
- 编译文件 SHA-256：`926e34f29c751bfba1b7eeba5042f56d00a3cb129fc9282aa4888dc3281aaa84`；与旧文件逐字节比较，只有超时表达式变化。
- Management 构建及2个文件5项定向测试通过；隔离镜像和实际运行容器均验证超时 `[60000,10000,10000]`。本地及 Sakura Runtime 健康200；匿名后管接口401、外网后管路径404符合预期。
- 用户已登录的浏览器刷新后保留会话，游戏配置和实际 Runtime 规则读取成功。未重新执行真实 GitHub 换码，60秒预算不保证网络永远成功。

后管中登记并发布已存在的微信1.1.10准确构建，开关分组1.1.0、单人v18、双人v12。先复核主包清单25个文件的大小和SHA-256；仅增加微信包和对应分组，TapTap推荐与旧包映射保留。浏览器显示单人、双人均可开新局，见[截图](wechat-admission.jpg)。

使用新建QA游客和该包准确构建标识，分别经回环与真实Sakura HTTPS验证版本信息、房间列表、创建单人局、恢复、取消，均200；测试局已取消，游客会话已退出。准入由false变为true，详见[接口回执](../../../../games/local/night-overwatch/reports/wechat-admission.json)及[部署回执](deployment.json)。

现有1.1.10包仍使用回环API和资源地址；HTTPS新包与资源部署因电脑负载暂停，未重启Creator或微信开发者工具。未验证手机、双人完整对战、真实广告、生产API；未提交、推送或上传渠道包。
