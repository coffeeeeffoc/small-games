# H5 在线游玩验收

2026-10-07，使用 Node 24.21.0、pnpm 12.6.0、Chromium 桌面模拟的 390 × 844 竖屏手机，以及 CDP 原生触屏输入。游戏来自实际构建的 `/dist/`，独立静态服务器端口 4422；测试启动真实 Runtime Service 端口 4424，以真实 TCP HTTP 写入本机隔离 PostgreSQL 17.11 `competition_test`。这不是手机真机或线上部署验收。

执行：

```sh
pnpm --filter @coffeeeeffoc/runtime-api build
node games/local/three-choose-two/build.mjs
# 既有独立静态预览服务器运行在 http://localhost:4422/
PSQL_PATH="$LOCAL_PSQL_PATH" THREE_CHOOSE_TWO_TEST_DATABASE_URL="$LOCAL_COMPETITION_TEST_URL" node games/local/three-choose-two/tests/online.browser.mjs
```

最终重验于 10:21 UTC 完成，测试使用显式 `PSQL_PATH` 指向本地提取的 PostgreSQL 17 客户端；默认入口仍可使用 PATH 中的 `psql`。结果：8 项检查全部通过，无页面运行异常；完整记录见 [online-browser-report.json](actual/online-browser-report.json)。最终重验采用 256 位服务端种子和 `sha256-counter-v1` 正式发块算法。

所有游戏落子都通过候选拖动和实际触屏松手完成。只读快照用于寻找合法落点和对比确认状态，测试未直接写入棋盘、积分、候选或会话规则。平台身份边界如下：H5 guest 使用实际 guest 身份接口；微信/B站路径使用本机 SQL 预置的隔离测试身份与令牌，测试结束后删除。此处证明登录身份后的 H5 排位交互及真实持久化，不证明微信/B站官方登录或 SDK 真机调用。

- 普通在线开始、两步触屏落子获得服务端确认；候选切到下一组。[在线开始](actual/online-ranked-start.png)
- 断网后继续摆完已获取组内的两块，序号保持最后确认值，未发出的下一组锁住；继续拖动不会增加落子。[断网等待](actual/online-offline-issued-group.png)
- 重新连接后有序补发两步，确认序号恰为 4；棋盘与真实服务器状态完全一致，没有重复计分。[重连](actual/online-reconnected.png)
- 刷新后从首页恢复同一个活动会话，棋盘与序号一致。[刷新恢复](actual/online-reload-restored.png)
- 普通暂停页主动结束后实际服务端重放通过，显示真实验证状态和名次；分享只使用真实得分、最大清线与实际名次，不出现虚构超过比例、种子或开发参数。[真实结算](actual/online-verified-result.png)
- 微信/B站测试身份在同一个真实数据库中各保留一条最高成绩；同分显示同名次，先达到者展示靠前。[同分榜](actual/online-real-tied-board.png)
- 无预置身份的 H5 guest 获得实际匿名会话，界面明确“不入榜”；结束后不产生公开榜记录，分享没有名次或虚构百分比。[匿名状态](actual/online-guest-ineligible.png)、[匿名结算](actual/online-guest-result.png)

- 通过正常触屏完成第 1 关、进入第 2 关并保存未完成棋盘；随后在线对局断网主动结束，结束意图持久化。重新连接后延迟实际服务端终结响应，在普通首页恢复第 2 关，触屏继续落子成功；释放旧响应后本地棋盘、模式、页面及落子数保持一致，未被旧在线回包覆盖。[待确认终结](actual/online-pending-finish.png)、[本地局继续可操作](actual/online-local-resume-after-pending-finish.png)
