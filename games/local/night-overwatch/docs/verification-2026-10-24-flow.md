# 2026-10-24 任务地图、战斗支援与快速撤离验收

最终 Creator 3.8.8 Web/mobile sourceHash：`681d33ad97da627270bd07dd0f92fe401cda00ed9da0d94e853284ea2565cdcc`。包体 6,488,893 字节；未提交、推送或发布。

## 玩家流程与实现

- 先生成[概念图与流程设计](design/2026-10-24-support-map.md)，再修改实际 Cocos HUD。三张支援卡可整卡点击，选中项有琥珀背景、勾选和文字；效果直接写明自动追踪、追踪弹数量或射速增益。
- 支援流程为「选择 → 看广告并启用 → 3 秒准备 → 返回战斗」。跳过同样返回战斗；取消、不可用、失败均不发奖励，保留选择并明确提示。只有 completed 回调保存资格并启用所选支援。
- 广告在后台完成时先保存资格，等后台、失焦和旋屏暂停全部解除再启用一次。跳过或切换战斗取消自动启用，资格仍保留；已有资格不依赖广告提供器，可在离线环境领取。
- 任务地图按真实关卡地形、路线、光照和敌人位置绘制山谷、高地、河流、树林、据点、出发与撤离点；568×320小屏将编号与名称合并为一行，扩大地图预览。
- 所有威胁清除后，车队即使在等待也自动恢复移动，并在约3秒内跑完余下路线；镜头转向车队，HUD显示撤离倒计时。待生成敌人仍计入威胁，不会提前结束。
- 撤离只加速车队进度，不加速弹道、伤害与权威计时。暂停冻结撤离；已发射的炮弹继续结算，存在在途炮弹时需等落点，友军全灭仍优先判负。因此长弹道可能在3秒之后再增加少量等待，不能借快速结算绕过友伤。
- 排名回放规则版本升至v3。原生HUD审核哈希同步更新；原生暂存仍保留来源收据、隔离暂存与不匹配即失败的保护。

## 验证结果

| 层次 | 结果与范围 | 证据 |
| --- | --- | --- |
| 引擎类型检查与构建 | 类型检查通过，Creator Web/mobile构建成功 | [构建日志](../reports/2026-10-24-flow/creator-build.txt)、`dist/build-info.json` |
| 游戏规则、输入与启动 | 241项全部通过，包含120关有限弹药、友军存活模拟通关；5项新撤离测试覆盖未来波次、暂停、回放与在途友伤 | [unit-tests.txt](../reports/2026-10-24-flow/unit-tests.txt) |
| 最后UI微调 | 15项HUD测试通过，含小屏布局、实际地形预览、无广告提供器时领取已得资格 | [final-hud-tests.txt](../reports/2026-10-24-flow/final-hud-tests.txt) |
| 最后输入与原生边界复测 | 29项通过，包含后台/失焦/旋屏交错、跳过/重开后不误用资格，以及实际原生项目暂存审核 | [final-input-native-tests.txt](../reports/2026-10-24-flow/final-input-native-tests.txt) |
| 同构建实际浏览器 | 1366×768鼠标、844×390与568×320触控、390×844旋屏暂停；菜单布局、相对瞄准松手、昼夜/热成像、电台生命周期、实际命中均通过 | [results.json](../reports/2026-10-24-flow/results.json) |
| 支援完整流程 | 844×390真实触控下取消、不可用、失败、后台完成与离线已得资格5条路径全部回到战斗，无页面错误 | [support-flow.json](../reports/2026-10-24-flow/support-flow.json) |
| 正常护送闭环 | 实际输入5发、4杀、零友伤；清敌后3.0167秒模拟时间结算，观测墙钟2.699秒；自动解除车队等待，进度到1并可重开 | [extraction.json](../reports/2026-10-24-flow/extraction.json) |

241项测试后只调整了HUD小屏排版，并增加1项输入边界用例；最终15项HUD和29项输入/原生检查均重新通过。三套浏览器验收开始和结束都核对当前源码、构建元数据与指定sourceHash，均为最终构建，未混用中间截图。

只读复核发现的「已得资格在无广告提供器时不可领取」和「后台完成后不自动启用」已修复；复核确认闭合，并补充交错暂停与切换战斗的回归测试。

## 素材与验收边界

当前实际截图、两段完整录屏和独立宣传剪辑已更新至[publishing/STATUS.md](../publishing/STATUS.md)。原有同日改造素材与旧版清单保留；概念图不作为实机证据。

浏览器仅通过鼠标、键盘和CDP触控操作，遥测只读；没有改血、跳模拟时间或直接写入模拟器状态。昼夜展示预置解锁存档；广告用公开提供器完成/取消/失败回调夹具，后台恢复使用可见性边界夹具。不是实际广告填充或手机真机验收。录像未捕获声音，所有MP4明确标注silent；游戏内电台仍由真实AudioSource播放。

本轮未执行微信等原生平台编译、开发者工具运行、实体iOS/Android触控和真实广告SDK验收，也未重跑全部历史浏览器长时脚本。相关旧脚本已同步选择先于广告的新调用顺序并通过语法检查。

## 重跑

从仓库根目录串行执行；构建完成后在另一终端启动预览：

```powershell
node --test --test-concurrency=1 games/local/night-overwatch/tests/*.test.ts games/local/night-overwatch/tests/startup.test.mjs
node --test --test-concurrency=1 apps/shell-minigame/scripts/night-native-project.test.mjs
pnpm --filter @coffeeeeffoc/night-overwatch typecheck
node games/local/night-overwatch/scripts/build.mjs web-mobile
$env:PORT='4328'
node games/local/night-overwatch/scripts/serve.mjs
# 另一个终端；确认当前构建是预期候选
$env:NIGHT_URL='http://localhost:4328/'
$env:NIGHT_EXPECTED_SOURCE_HASH=(Get-Content games/local/night-overwatch/dist/build-info.json | ConvertFrom-Json).sourceHash
node games/local/night-overwatch/tests/redesign-browser.mjs
node games/local/night-overwatch/tests/support-flow-browser.mjs
node games/local/night-overwatch/tests/extraction-browser.mjs
```
