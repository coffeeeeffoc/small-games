# 夜航服务端待上线准备

本次用户明确要求现在不上线。以下入口只有本地准备能力，不接受执行、SSH、检查远端、回滚等参数。

```powershell
node scripts/prepare-night-server.mjs --version=1.0.0
```

版本号必须显式给出，用作本地候选Runtime标识；它不证明现网版本，也不会更新版本运营配置。运行前先提交，工作区须干净。脚本复用 `prepareControl()` 构建 Runtime、Kart、Management 和管理台静态资源，再复用 `writeBackendBundle()` 输出独立Runtime应用包；前后核对同一HEAD。输出保存在忽略目录 `outputs/night-server-preparation/<release>/`，控制台配套包位于 `outputs/admin-deploy/<release>/`，交接时两个目录一起保留。

准备目录包含 `preparation.json`、`runtime/`、016/017/018原文与摘要，以及 `上线顺序.md`。不会读取生产密钥、连接服务器、上传、迁移数据库、重启或激活应用。失败产物不能作为成功准备包，只有打印 `NIGHT_SERVER_PREPARED` 才说明本地准备完成；`deployed`、`remoteInspected`、`databaseBackupVerified`、`migrationRehearsed` 均如实为false。

待上线范围包含此前尚未推送的运营配置、版本管理、广告额度/胜率榜等Runtime改动，本次在线名单、忙碌状态、好友、永久私信、离线留言及战后留房，以及管理台改动；准备包按最终候选源码构建。控制库005将运营投影升级至v5，现网是否缺少该迁移须在正式上线时只读确认。018依赖016聊天序列和017在线表，必须在新Runtime激活前完成，新Runtime健康检查要求私信、好友、已读、申请限频表和在线activity列存在。

正式上线时先核对现网镜像、数据库和版本准入，完成二进制备份及隔离恢复比对；在恢复副本对018重复执行两次，确认旧数据、聊天序列、权限未变。控制库升级继续使用现有控制部署流程的备份/恢复/重复迁移证明。正式应用缺失迁移后再切换配套应用，同步网关精确 /social 路径，验证好友双向接受、离线留言、历史分页/已读、第三方不可见、旧客户端公开聊天、忙碌拒邀及战后留房/再战。部署数据库与回滚备份的真实验收不能由本地构建或单元测试代替。

018不修改公共聊天表，因此旧Runtime不会泄露私信；控制库v5则不能退回不支持该版本的应用。schema摘要变化可能触发旧部署journal的 `SCHEMA_CHANGED` 保护。不要绕过守卫；应用回退和数据库整体恢复分别决策，后者需处理上线后的新增玩家数据。

本任务没有执行生产或Sakura服务升级、平台上传或审核。推送dev会触发现有前端CI/Pages流程，服务端部署仍是独立操作。
