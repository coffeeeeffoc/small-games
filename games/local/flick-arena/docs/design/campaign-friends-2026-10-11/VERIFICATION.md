# 手机 Web 与真实好友服务验证

验证日期：2026-10-11（北京时间）。环境为 Linux、Node 24.21.0、pnpm 12.6.0、Chromium 151.0.7922.173，手机视口 390 × 844、触屏输入、DPR 1；另检查 320 × 568 小屏。截图来自实际构建产物，属于桌面浏览器手机模拟，不是真机截图。

## 执行入口

```sh
node games/local/flick-arena/build.mjs
FLICK_COMPETITION_API=http://127.0.0.1:4430/api/competition/v1 \
  node games/local/flick-arena/tests/campaign-browser.mjs
```

在线部分连接本地启动的实际 `services/runtime-api`，使用独立 PostgreSQL 17.6 `competition_test` 数据库和正式 competition 路由、身份、存储、规则；没有替换房间服务或修改服务器时钟。数据库执行了 competition/profiles/three-choose-two 迁移。每个玩家使用独立浏览器上下文和服务端签发的访客身份。所有出手使用 CDP 触摸按下、移动和抬起；测试只读取公开盘面，没有直接替换状态或强行结算。

未配置 `FLICK_COMPETITION_API` 时，脚本明确跳过联机部分，继续执行闯关、同机与地形触屏检查；不会用伪造服务器声称联机通过。机器可读结果为 [browser-validation.json](browser-validation.json)。

## 实际结果

| 检查       | 结果                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| 普通闯关   | 第 1 关首次尝试，7 次真实触摸出手获 3 星；第 2 关解锁，重载后保留，第 3 关仍锁定                                   |
| 结算与恢复 | 回放不重复奖励，下一关进入正常；暂停期间整个盘面冻结，恢复后继续                                                   |
| 同机双人   | 2 小局、3 次真实出手产生 0:2 冠军；先手依次为玩家一、玩家二；再战清空系列比分，不改变闯关存档                      |
| 地形       | 通过公开开发菜单进入第 11、13、16、20 关，各使用真实触摸出手；石柱、冰面、缺口及组合画面与配置一致，正常存档不变   |
| 在线 2 人  | 2 个独立身份完成 2 小局，0:2；刷新恢复原身份与房间，再战创建新房间并清空比分；实际等待 10 秒确认服务端跳过超时玩家 |
| 在线 3 人  | 3 个独立身份完成 3 小局，积分为 1、2、9；全部客户端显示同一冠军与积分                                              |
| 在线 4 人  | 4 个独立身份完成 4 小局，积分为 1、5、6、16；全部客户端显示同一冠军与积分                                          |
| 浏览器异常 | `pageerror` 为 0                                                                                                   |

好友系列采用受控的合法自出界动作缩短流程，末位玩家向场内轻弹以产生可重复冠军。这些动作验证真实联机链路、轮换、淘汰、计分、下一局和最终结算，不用于证明真人竞技平衡。数据库动作账本复核：2 人共 4 条（2 次出手 + 2 次下一局准备），3 人共 14 条（8 + 6），4 人共 26 条（14 + 12）；与浏览器动作数一致。

最终在线同步实现另做定向双人复核：

```sh
FLICK_COMPETITION_API=http://127.0.0.1:4430/api/competition/v1 \
FLICK_FOCUS_ONLINE=2 node games/local/flick-arena/tests/campaign-browser.mjs
```

[browser-online-focused.json](browser-online-focused.json) 记录 3 次真实触摸出手完成 2 小局、0:2 冠军，以及刷新恢复、再战和真实 10 秒超时。测试逐次要求出手玩家自己的操作序号增加，并检查服务器最后一弹的序号和席位，避免把单纯超时导致的盘面版本变化当成出手成功。此项在按服务端时间追赶在线动画和低帧率轮询调整后的最新构建上通过，浏览器异常为 0。

## 画面对照

已打开并逐项查看实际首页、锁定选关、游玩、暂停、结算、小屏选关、地形、多人游玩与最终积分截图，与 [concept.png](concept.png) 的武馆木色、金色主按钮、圆形擂台和页面层级对照。实际使用已有 Canvas 矢量画风。主要操作和返回路径完整，未发现文字盖住按钮或擂台；暂停为两根等高、分离的实心竖条。

- [首页](actual-home.png)、[章节选关](actual-levels.png)、[小屏进度](actual-small-screen-levels.png)
- [关卡准备](actual-briefing.png)、[实际游玩](actual-play.png)、[暂停](actual-pause.png)、[闯关结算](actual-campaign-result.png)
- [石柱](actual-terrain-11.png)、[冰面](actual-terrain-13.png)、[缺口](actual-terrain-16.png)、[最终组合](actual-terrain-20.png)
- [好友入口](actual-friends.png)、[同机冠军](actual-local-champion.png)、[四人游玩](actual-online-4-play.png)、[四人冠军](actual-online-4-champion.png)

旧练习模式的独立回归结果保存在 [regression/browser-validation.json](regression/browser-validation.json)，覆盖拖拽取消、多指隔离、失焦暂停、真实缩圈、暂停收圈、回放幂等、横屏与小屏坐标、显式关闭开发模式及存储不可用降级。其结果同样是 Chromium 模拟验证。

本记录不代表微信/抖音宿主、实际手机或公网跨设备网络已验收；生产 CI、准确候选 SHA 与部署结果由发布验证单独记录。
