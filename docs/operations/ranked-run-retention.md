# 单人对局的 24 小时截止与小时清理

单人 ranked-run 的恢复期限为 min(expiresAt, createdAt + 24 小时)。历史续期数据同样封顶；新动作和恢复不再延期。已结算结果保留，重复 finish 返回原结算，已有动作回执只重放原响应，不推进对局。Night 客户端收到服务端过期或结束确认后保存持久终止确认并释放大段待传输入；已确认成功的结算优先，网络、身份和存储故障不会被当作过期依据。

小时任务仅处理已知四款 ranked 游戏：cage-rescue、tower-brake、night-overwatch、tetracube。同版本对局到期后退休；已知游戏与关卡的旧规则版本已不可续玩，可立即退休。未知游戏或 Runtime 已不认识的关卡保留，不猜测删除。脚本固定维护协议、24 小时上限和四个游戏 ID；每轮在现役 Runtime 容器实际导入维护模块，从真实规则目录取得并严格校验当前版本映射。在同一部署锁内固定本轮映射，前后核验 Runtime 和 PostgreSQL 容器及 image 身份一致；业务版本升级不依赖手工同步定时器中的版本常量。

infra/backend-update/ranked-retention.py 是首次手动和每小时运行的同一个入口。它以当前部署账号取得 /opt/small-games/deploy.lock 非阻塞锁，维护进行中则跳过。每次最多十批，每批一百条；不创建 HTTP 服务，不读取或打印密码、环境变量、Bearer、玩家或对局 ID，也不逐次计算全库摘要。日志只有清理数量、跳过数量或固定失败标记。

每批先调用现役 Runtime 编译产物 competition/ranked-maintenance.js，复用 createRankedStore 的事务、控制策略与 root 行锁。锁内重新检查截止、版本、状态和结算；普通到期只释放未使用的装备，已消费装备不因到期退回。已有规则失效、disabled 或 killEpoch 失效仍先走现有补偿，验证 root 已终结后才继续。退款和释放均保留原资产记录和事件；不在 owner 脚本复制钱包状态机。

随后 owner 事务重新锁定精确 root，复查身份、状态与失效条件，只删除同 board、完整匹配 ranked-action:<UUID>:<正整数> 的回执，并将 root 的 state 设为 null、截止时间封顶及记录 retainedAt。删除和精简在同一事务提交。root 的身份、版本、请求幂等 ID、seq、settlement 继续保留，不能通过旧 requestId 重建对局或再领取资产。比赛结果、榜单、钱包历史、奖励防重记录、房间、控制发布历史和迁移标记均不清理；不授予 runtime_app 整表 DELETE 权限。中断或重复执行可以继续处理尚未精简的 root。数据库通过常规 vacuum 复用删除后的空间，不执行阻塞的 VACUUM FULL。

安装由主会话在准确候选验证和 Runtime 部署后完成。本服务器已核实部署账号为 ubuntu、具备原 Docker 权限和 sudo -n；服务文件使用该账号，不把应用改为数据库 owner。将已审脚本安装到 /opt/small-games/ranked-retention/ranked-retention.py，将同目录的 .service 和 .timer 安装到 /etc/systemd/system/，执行 systemctl daemon-reload。首次手动运行 sudo -u ubuntu python3 -B /opt/small-games/ranked-retention/ranked-retention.py 并核对数量及保护记录后，启用 small-games-ranked-retention.timer；OnCalendar=hourly、Persistent=true，最多随机延迟两分钟。停止任务时保留部署锁直至当前有界容器调用结束；容器内维护调用有一分钟 watchdog，宿主调用上限两分钟。

验证使用带 io.small-games.ranked-retention-test=isolated-competition-test 标签、名称前缀 codex-ranked-retention- 的独立 PostgreSQL 和 competition_test 数据库。有限 owner 合同默认不连接 Docker；真实数据库合同显式运行 ranked-retention.test.py --postgres，并指定 RANKED_RETENTION_TEST_CONTAINER。Runtime 集成测试只接受 COMPETITION_TEST_DATABASE_URL 的 /competition_test 数据库。生产安装、实际首次清理数量与 timer 健康由部署回执记录，不能用隔离测试冒充。
