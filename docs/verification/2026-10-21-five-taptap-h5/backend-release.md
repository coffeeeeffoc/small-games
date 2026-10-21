# 五款统一后端基础服务上线记录

2026-10-21 实际完成以下发布，后续战绩版本另行记录。

- 准确候选：base `4f481b46546acddfdd01419823d71bfe9ef2120c`，head `b39ae73f357804c9ad4c694acce7e419a265a297`。
- `validate:candidate` 输出 `CANDIDATE_VALIDATED`，级别 `incremental-static-and-entry`；正常推送远端 dev。
- `pnpm deploy:backend --services runtime` 成功，release `b39ae73f3578-1792548458284-15a92d`，Runtime 健康及 HTTPS 探针通过；Kart 网络命名空间伴随重建。
- 数据库未替换、schema 未变；本次建立备份，未进行独立恢复演练（普通应用更新）。
- 真实公网 `https://api.nenggongzhiren.cn/small-games/v1`，使用实际 TapTap H5 Origin `https://ma-h5-al.tapimg.com`。
- 五款均通过匿名身份创建、游戏信息、个人资料读写、刷新后身份和昵称保持、跨游戏请求拒绝、无凭证请求拒绝及注销；CORS 预检通过。脱敏证据见 [online-base-services.json](online-base-services.json)。
- 测试仅创建五个测试身份，均已注销，没有写入排行榜成绩。

这批服务只证明统一身份和资料接入已生效。此时乌龙城、夜航和卡丁车仍返回空榜目录；历史与词屿仅有旧好友榜。五款新的单机服务端校验、个人战绩和公开榜尚未随该版本发布。CI/Pages 的最终状态须单独核验，不能由后端成功推断。

完整本地日志：`outputs/candidate-five-backend-20261021-browser-fixed.log`、`outputs/deploy-five-backend-20261021.log`。
