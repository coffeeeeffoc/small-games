# 2026-11-09 正式行动启动恢复

本轮针对“选关后一直准备、热身可玩”的阻塞风险。模拟 IndexedDB 事务完成通知丢失可以复现旧包的无限等待，但尚无该玩家的设备日志，不能据此认定其实际故障就是 IndexedDB 或 localStorage。

## 实现

- IndexedDB 读、写及 CAS 事务最长等待 8 秒；超时中止事务并关闭连接，下次操作重新连接。保留已有数据和未确认写入，不清库。
- 正式行动从服务连接到保存、确认对局共设 25 秒上限；保持阶段提示，失败后可再次点击出发。军需页面刷新不再阻塞开局，正式配装仍由创建对局的响应确认。
- 每次启动独立标记；取消、返回菜单、切换热身、超时重试后，旧返回不能启动游戏、覆盖当前错误或清掉新尝试。已废弃且未发出创建请求的记录停止同步，不会事后创建服务器对局。
- 初次读取整个存储失败仍保留原保护，需要退出重进；不以空镜像覆盖未知存档，也不绕过正式行动的首次持久化确认。持续无法存储时热身仍可用。

## 候选与验收

- Git 基线：`8fa06f19cd086ce7b4d6b3a75c240cf28251aa23`，推送前 fetch 核对远端 dev 未推进。
- Creator 3.8.8 web-mobile 源码摘要：`48978684eea30cf5ab9a28b684be8a523b4156ceb7c92640d94471a12112f343`，59,565,611 字节。类型检查及真实 Creator 构建通过。
- `node --test games/local/night-overwatch/tests/input-mode.test.ts games/local/night-overwatch/tests/online.test.ts`：90 项通过。新增用例先验证失败，再验证修复，包括同一任务重试、服务未返回、军需刷新未返回、迟到响应、返回菜单及热身切换。
- `node --test platforms/competition/tests/game-services.test.mjs platforms/competition/tests/night-storage.test.mjs platforms/competition/tests/night-storage.browser.test.mjs`：103 项通过。覆盖真实浏览器事务完成通知丢失后重连、旧数据保留、取消时序、结算恢复和身份隔离。
- `node --test scripts/h5-game-services.test.mjs`：4 项通过，包含 H5 服务复制、存储加载顺序、重新打包及 TapTap 身份接线契约。
- [浏览器记录](browser.json)：普通触屏输入验证正常开局、禁用 localStorage 写入、568×320 和 844×390 存储超时后重试、25 秒启动超时重试及迟到响应、准备中切换热身。身份、资产和对局 HTTP 使用隔离 fixture；IndexedDB 为真实 Chromium 存储。没有请求生产服务器，没有模拟用户点击后的成功状态。
- [小屏存储错误](storage-568-failure.png)、[小屏重试成功](storage-568-recovered.png)、[844 存储错误](storage-844-failure.png)、[总超时重试提示](deadline-retry.png)为 QA 截图，不作为正式宣传素材。

## 其他检查与边界

额外执行完整游戏测试，结果为 400 通过、6 失败（最后补充的菜单取消用例另见上方定向结果）。这 6 项失败涉及的断言和底层实现与基线相同：

| 文件 | 失败原因 |
| --- | --- |
| extraction.test.ts | 既有弹道时长不满足测试的 `flightTime() > 3` |
| mission-progress.test.ts | 仍断言旧的 4/6/8/12/16 数量，当前含步兵为 28/42/56/60/64 |
| training.test.ts | 仍断言前三关为 4/6/8 |
| priority.test.ts | 既有威胁伤害不满足硬编码 2.8 |
| hud-interactions.test.ts、native-host-boundary.test.ts | 既有 CombatControlsView 源码摘要与原生 recipe 不符 |

本轮未修改上述玩法、旧断言或原生摘要门禁，完整测试不能记为通过。未执行本地 `validate:candidate`，远端 CI/Pages 状态独立记录。

八类上架资料均存在。manifest 的 37 个文件中 36 个大小/摘要一致；`copy/introduction.md` 已在此前在线人数更新中改动，旧清单摘要未同步。本轮只补恢复验证，媒体保留原采集身份。

未部署生产、未重新打包提审、未进行实体手机或 TapTap 宿主验收；H5 渠道须采用包含本修复的新包才会生效。服务器已经接受但响应迟到的旧请求仍按原 requestId 执行既有取消恢复，取消未确认前可能暂时占用装备预留，本轮未改变该协议。
