# 子弹花园 11 关验收报告

验收日期：2026-10-03 UTC（上海时间 10 月 4 日）。Node 24.19.0，Chromium 151.0.7922.173，Playwright；源码服务为 4411，构建产物服务为 4412。浏览器脚本只使用原生键鼠、触屏和只读快照；虚拟时钟加速游戏时间，未修改战斗血量、敌人、奖励或胜负状态。

## 自动测试与正常资源战役

`npm test` 使用默认文件隔离，6 个测试文件全部通过；逐文件直接执行得到 **126 / 126** 个实际案例：模拟 66、战斗 29、成长存档 11、地图天气 8、技能搭配 7、内容注册 5。包括复合盾甲的伤害顺序、穿透重复命中、破盾眩晕、分裂召唤上限、远程预警、升空/钻地、宠物阈值、暂停天气、首领必须击败、出生点失败后重试，以及 300 张新地图的原子注册与原有运行接口。计数与结果见 [unit-tests.json](unit-tests.json)。

`node tests/campaign-balance.mjs` 从空白永久存档开始，以实际关卡金币购买成长，使用实际击杀经验选择祝福和枪械强化；三个种子 7、42、81 全部通过 11 关，**33 / 33 胜利**。第 4、8 关首领和第 11 关 BOSS 均实际击败，最终剩余生命分别为 170、167、190。重放记录每次购买、扣款、关卡奖励、起始属性和实体峰值，见 [balance-report.json](balance-report.json)。

未购买永久成长的对照保持相同操作策略与合法局内升级：种子 7 在第 8 关堡垒的 125 秒失败；42、81 完成 11 关，最终生命 27、69。对照共 30 次战斗、29 次胜利。此结果说明该观察地图并及时施放技能的脚本策略可通关，不能代替不同水平玩家的难度评测。所有 63 次战斗中，敌人、植物、子弹的观测峰值为 19、18、32，全部通过各自容量断言。

原有 `node tests/balance.mjs` 保留四组祝福/技能搭配、三个种子的首关正常生命 300 秒重放，12 / 12 胜利，覆盖全部五种主动技能。最新详细记录见 [baseline-balance-report.json](baseline-balance-report.json)。

## 浏览器操作与奖励保存

源码完整控制回归通过：1/2/3/5 倍速比例、暂停与经验选择冻结、帮助返回、自动射击、两个独立能量槽、选中/确认/取消、冲刺、重开和双触点。构建产物复测手机竖屏 390×844、横屏 844×390：同时移动与瞄准释放、技能取消、暂停、两个技能槽和冲刺均通过，最大同时触点为 2。报告见 [browser-source-controls.json](browser-source-controls.json) 与 [browser-dist-touch.json](browser-dist-touch.json)。

源码无存档首关以原生键鼠真实游玩 300 秒并胜利：初始生命 100，最终生命 75，击杀 282，主动施放 76 次；植物均在实际选择祝福后自动生长。结果结算获得金币和永久经验，再从奖励页实际支付 35 金币购买攻击，余额 1058；进入草甸准备页，刷新后余额和购买仍保留，再开始下一关。见 [browser-natural-campaign.json](browser-natural-campaign.json) 和 `source-natural-result.png`、`source-earned-upgrade.png`、`source-next-level.png`。这条源码长程记录完成于最后盾甲、出生候选重试和雨天计时修复前；最终版本已通过上述 126 案例、正常资源战役，以及构建产物代表流程。

独立 UI 验收同时验证自然失败：正常初始生命 100，通过按钮关闭自动射击后在 21.233 秒失败，获得 0 金币 / 1 经验，不解锁下一关；结算营地往返不重复发奖，重试使用最新购买与新 UUID。自然胜利、失败和存储拒绝情况见 [ui-report.json](ui-report.json)、[ui-natural-failure.json](ui-natural-failure.json)。

构建产物的营地购买、刷新保留、关卡锁、全部 11 关选择、存储拒绝提示与继续游玩通过。该内容覆盖使用明确的合法存档 fixture：完成首关、180 金币的已解锁资料，仅为直接覆盖营地和后续菜单；没有将此资料作为首次通关证据。见 [browser-dist-campaign.json](browser-dist-campaign.json)。横竖屏营地与四张经验升级卡均完整可达，截图 `dist-shop-390x844.png`、`dist-upgrade-4-390x844.png`、`dist-upgrade-4-844x390.png`；暂停图标检查为两根分离实心竖条。

构建产物桌面技能确认在最终脚本连续两次通过：键盘选择后确认 armed 状态、右键实际施放第一槽并消耗能量、第二槽保留满能量，暂停取消和重开仍正确。见 [browser-dist-desktop-first.json](browser-dist-desktop-first.json) 与 [browser-dist-desktop.json](browser-dist-desktop.json)。首次构建产物整套控制尝试的右键释放断言失败记录保留于 [browser-dist-controls-initial.json](browser-dist-controls-initial.json)；随后脚本增加可点击战场目标和 armed 前置检查，未证实运行时故障，未因此修改游戏实现。所有成功报告均无 JavaScript 或 console error。

## 后期实战与绘制

构建产物以合法后期存档 fixture（永久经验 2290，已完成关卡和指定购买等级）启动第 4、8、11 关。之后所有战斗输入均为原生键鼠，正常敌人/生命/能量/经验选择，实际生成并击败岩根首领、苔堡统领、花园之心；截图保存于 `dist-encounter-quarry.png`、`dist-encounter-bastion.png`、`dist-encounter-heartgarden.png`。报告明确标记 fixture 和其完整资料，见 [browser-dist-encounters.json](browser-dist-encounters.json)。这三场代表实战没有声称从空白存档完成浏览器 11 关连续通关。

独立 Canvas 场景覆盖 11 张地图、全部 5 种主动技能：渲染不修改模拟状态、屏幕与世界坐标往返误差为 0，无浏览器错误；合成的 Canvas 上下文丢失/恢复通过。见 [rendering-catalog-report.json](rendering-catalog-report.json)、[rendering-catalog.png](rendering-catalog.png)。此绘图 fixture 与上面的正常游戏证据分开。

## 执行入口与范围

```sh
npm test
npm run test:balance
npm run test:campaign-balance
npm run build
GAME_URL=http://127.0.0.1:4411 QA_ONLY=controls npm run test:browser
GAME_URL=http://127.0.0.1:4411 QA_ONLY=natural npm run test:campaign-browser
GAME_URL=http://127.0.0.1:4412 QA_ONLY=ui npm run test:campaign-browser
GAME_URL=http://127.0.0.1:4412 QA_ONLY=touch npm run test:browser
GAME_URL=http://127.0.0.1:4412 QA_ONLY=desktop npm run test:browser
GAME_URL=http://127.0.0.1:4412 QA_ONLY=encounters npm run test:campaign-browser
```

浏览器命令还需可用的 `PLAYWRIGHT_MODULE` 和 `CHROMIUM_PATH`；本次使用本地 Playwright 与 `/usr/bin/chromium`。报告使用 `QA_OUTPUT` 分别保存，精选材料归档于本目录。构建与仓库依赖边界、游戏配置检查由根代理另行执行。

手机尺寸和多触点验证采用桌面 Chromium 模拟，尚未做 Android/iOS 真机验证。上下文恢复为合成事件测试，未声称复现真实 GPU 故障；无头浏览器的后台可见性未发生变化，报告不将其记为真机后台恢复通过。自动战役策略和三种种子不能覆盖所有玩家操作与随机局面。
