# 穿扣与 50 关扩展验收

2026-10-13，Windows、Node 24.21.0、pnpm 12.6.0，Chromium 154.0.8037.99 的生产 Vite 构建。浏览器记录的时间为 UTC，本文日期采用 Asia/Shanghai。

## 已通过

- `pnpm --filter @coffeeeeffoc/orbit-atelier test`：24 项规则和存档测试。74 关全部 schema、边界与真实旋转/释放解法通过；新增 50 关均连通且至少 20 逻辑单位交叠。反向优先拆解也能完成。每个连接的单邻环解扣方向至少允许 ±3°；仅让开一处或圆头净空不足不能脱扣。
- `pnpm --filter @coffeeeeffoc/orbit-atelier test:browser`：10 组实际生产浏览器验收。CDP 原生触屏及真实鼠标，390×844、320×640、844×390、1280×900。首关两处交点的上下穿扣交替可见；按住对齐时圆环仍存在、两处显示勾号，松手后沿缺口反方向滑离。取消恢复、撤回、暂停、失焦和前后台、最后释放立即失焦后的结算、重新加载存档、下一关与顺序解锁均通过。横屏留白 SVG 中，距离孤立环带 18 CSS px 的拇指点按仍能命中，保持约 44 px 热区；滚到第八章时返回按钮仍可见且可触屏返回主页。
- 新章节 25/34、35/44、45/54、55/64、65/74 关通过实际触屏通关；74 关同时验证锁栓倒计时、密集大小环、最终圆头点按及开发试玩隔离。独立页及带 sandbox 的 iframe 实际触屏解扣、暂停恢复通过。全屏真实进入/退出以及拒绝后的正常玩法通过。
- `pnpm --filter @coffeeeeffoc/orbit-atelier test:publishing:browser`：第 74 关同盘邀请实际触屏解完，保留原主线存档；提示后撤回不抹除提示数；分享清理私有参数、系统分享取消不误报成功、关闭广告配置及 320 px 返回流程通过。
- `pnpm --filter @coffeeeeffoc/shell-web exec vitest run tests/game-sharing.test.tsx`：86 项通过，包含原 24、新 25 和最终 74 关的 Shell 路由、独立入口及公开分享；拒绝 00、75 与非标准 074。
- `pnpm check:dev-mode`：64 款游戏、0 问题。`pnpm test:dev-mode`：5 项公共开关契约通过。生产入口开关与最终候选的其他增量检查由正常发布门禁执行，准确 SHA 及最终结果记录在交付日志中。
- Shell 的真实鼠标/触屏契约保留旋转、撤回、暂停、返回行为断言；遮罩圆环的 DOM/CDP 边界不同，iframe 偏移改用棋盘边界。修复前能稳定重现未转动，修复后同一原生输入通过；增量范围只接受这三处准确替换及唯一游戏登记，任何其他执行或断言变化仍阻断。

## 画面对照

效果参考为 [concept.png](https://github.com/coffeeeeffoc/small-games/blob/57f0f85a9c69231108b1a2e172cb38993206985b/games/local/orbit-atelier/docs/design/real-interlock-2026-10-13/concept.png)，实际证据独立保存在 [actual/browser-report.json](https://github.com/coffeeeeffoc/small-games/blob/57f0f85a9c69231108b1a2e172cb38993206985b/games/local/orbit-atelier/docs/design/real-interlock-2026-10-13/actual/browser-report.json)。图稿的金属材质与纹理采用轻量 SVG 环带、刻度、高光及阴影表达；不把生成图当作游戏截图。生成图中的章节编号是参考文字，真实关卡范围和数目以目录配置为准。

| 实际画面 | 验收重点 |
| --- | --- |
| [主页](https://github.com/coffeeeeffoc/small-games/blob/57f0f85a9c69231108b1a2e172cb38993206985b/games/local/orbit-atelier/docs/design/real-interlock-2026-10-13/actual/mobile-home.png) | 工坊风格、真实上下穿扣绘制、开始/选关/设置 |
| [第八章选关](https://github.com/coffeeeeffoc/small-games/blob/57f0f85a9c69231108b1a2e172cb38993206985b/games/local/orbit-atelier/docs/design/real-interlock-2026-10-13/actual/mobile-levels-late.png) | 完整74关目录、真实解锁锁定、滚动后仍可返回 |
| [首关](https://github.com/coffeeeeffoc/small-games/blob/57f0f85a9c69231108b1a2e172cb38993206985b/games/local/orbit-atelier/docs/design/real-interlock-2026-10-13/actual/mobile-playing.png) | 28 单位交叠、两个接触位置交替上穿/下穿、真实暂停双条 |
| [对齐](https://github.com/coffeeeeffoc/small-games/blob/57f0f85a9c69231108b1a2e172cb38993206985b/games/local/orbit-atelier/docs/design/real-interlock-2026-10-13/actual/mobile-aligned.png) / [滑离](https://github.com/coffeeeeffoc/small-games/blob/57f0f85a9c69231108b1a2e172cb38993206985b/games/local/orbit-atelier/docs/design/real-interlock-2026-10-13/actual/mobile-extracting.png) | 反馈与规则同源；按住等待松手；出口方向正确 |
| [圆头临界接触](https://github.com/coffeeeeffoc/small-games/blob/57f0f85a9c69231108b1a2e172cb38993206985b/games/local/orbit-atelier/docs/design/real-interlock-2026-10-13/actual/mobile-cap-contact.png) | 交点刚进入名义缺口时，圆头仍有上下穿扣且规则仍阻挡 |
| [宽口回窗](https://github.com/coffeeeeffoc/small-games/blob/57f0f85a9c69231108b1a2e172cb38993206985b/games/local/orbit-atelier/docs/design/real-interlock-2026-10-13/actual/mobile-wide-mouth.png) | 宽口解转角，两方向连接的观察难度 |
| [织星](https://github.com/coffeeeeffoc/small-games/blob/57f0f85a9c69231108b1a2e172cb38993206985b/games/local/orbit-atelier/docs/design/real-interlock-2026-10-13/actual/mobile-woven.png) / [最终关](https://github.com/coffeeeeffoc/small-games/blob/57f0f85a9c69231108b1a2e172cb38993206985b/games/local/orbit-atelier/docs/design/real-interlock-2026-10-13/actual/mobile-final-playing.png) | 大小环、回窗、接力星栓的组合 |
| [小屏](https://github.com/coffeeeeffoc/small-games/blob/57f0f85a9c69231108b1a2e172cb38993206985b/games/local/orbit-atelier/docs/design/real-interlock-2026-10-13/actual/mobile-small.png) / [横屏](https://github.com/coffeeeeffoc/small-games/blob/57f0f85a9c69231108b1a2e172cb38993206985b/games/local/orbit-atelier/docs/design/real-interlock-2026-10-13/actual/mobile-landscape.png) | 控件可达、尺寸变化保留对局、触控坐标正确 |
| [暂停](https://github.com/coffeeeeffoc/small-games/blob/57f0f85a9c69231108b1a2e172cb38993206985b/games/local/orbit-atelier/docs/design/real-interlock-2026-10-13/actual/mobile-paused.png) / [结算](https://github.com/coffeeeeffoc/small-games/blob/57f0f85a9c69231108b1a2e172cb38993206985b/games/local/orbit-atelier/docs/design/real-interlock-2026-10-13/actual/mobile-result.png) | 页面返回路径、星级与解锁、暂停图标形状 |
| [74关同盘](https://github.com/coffeeeeffoc/small-games/blob/57f0f85a9c69231108b1a2e172cb38993206985b/games/local/orbit-atelier/docs/design/real-interlock-2026-10-13/actual/challenge-playing.png) / [同盘结算](https://github.com/coffeeeeffoc/small-games/blob/57f0f85a9c69231108b1a2e172cb38993206985b/games/local/orbit-atelier/docs/design/real-interlock-2026-10-13/actual/challenge-result.png) | 不改主线的实际最终关解扣和分享 |

## 发布及边界

开始基线为 `99904a43aee15199a9db387412bb7baff41e4e28`，已正常合并并保留并行 dev 提交 `036bb4d3e98cdb1c373ff3445155bcdc783ca671`，以该远端 SHA 比较最终候选。修改范围包括本游戏、74 关分享白名单及该款目录/评估文字；没有改动公共运行时、引擎、其他游戏业务或依赖锁文件。最终候选先提交，保留正常 hooks，按远端准确 base/head 执行增量发布校验和普通 dev 推送；若远端推进，则重新合并并验证新候选。最终推送 SHA 与 CI/Pages 状态以交付时的实时核对为准。

未完成 Android/iOS 物理手机和原生小游戏平台验收，浏览器振动及实际音效听感也未由实体设备确认。上下穿扣是明确的几何谜题呈现，未实现完整 3D 刚体碰撞。CI/Pages 完成与本地浏览器通过分别记录。
