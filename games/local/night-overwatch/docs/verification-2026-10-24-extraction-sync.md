# 2026-10-24 撤离、弹药与语音同步收尾

当前 Creator 3.8.8 Web/mobile sourceHash：`b5b66e9d3f678aa1ec2032b75d8490257c72e85df3444a1a34d5a09d7e45deba`。包体6,491,320字节。本轮未提交、推送或发布。

## 修正

- 清敌后进入停火撤离：车队约3秒抵达；在途普通弹与失锁后的普通追踪弹，以4倍速度走完原有剩余弧线，保留撞坡、落点、伤害和友伤。失去目标的消耗型追踪弹沿用原有失锁终止规则。
- 结算同时检查车队抵达、弹药全部处理完毕、清敌语音播放结束。先完成的任务等待其他任务；语音通常长于车队动画，不会再被结算截断。友军被击毁的失败规则仍优先。
- 电台等待由实际AudioSource的ENDED事件解除，未用固定语音时长猜测。车队已在终点的情况也会先建立语音等待，避免同一帧提前结束。
- 暂停、后台和旋屏保留未播完的撤离语音并冻结模拟，恢复后从原位置续播。静音、缺失音频不等待；音频播放进度连续2秒不再推进时停止失效播放并解除等待，防止播放器报错但仍声称playing造成死锁。
- 所有鼠标、键盘、触控发射以及直接追踪弹发射入口都拒绝撤离期间新增弹药；持续按住的输入也会清空。HUD显示“停火”，抵达后说明正在等待炮弹或电台。
- 弹道重基准后不重播炮口闪光。回放版本更新至v4，语音等待的设立/解除作为验证过类型的输入记录， checkpoint恢复与回放保持一致；原生HUD/Platform审核哈希同步更新，没有绕过暂存保护。

## 证据

| 验证 | 结果 | 文件 |
| --- | --- | --- |
| 游戏全套与原生暂存 | 253项通过；包含120关模拟通关、三项结束条件先后顺序、4倍弧线落点、友伤失败、暂停、回放和原生审核 | [unit-tests.txt](../reports/2026-10-24-sync/unit-tests.txt) |
| 最后音频停滞与闪光修正 | 31项输入/效果/原生定向测试通过；模拟playing=true但时间不推进的音频故障，以及暂停后原位置续播 | [final-tests.txt](../reports/2026-10-24-sync/final-tests.txt) |
| 引擎 | 类型检查与Creator实际Web/mobile构建成功 | [creator-build.txt](../reports/2026-10-24-sync/creator-build.txt) |
| 正常护送 | 实际清敌前持续发射爆破弹，验证在途弹药4倍加速；撤离期间鼠标/键盘/触控尝试发射均无新增弹药；各项完成顺序不固定，全部完成后才结算，可重开 | [normal.json](../reports/2026-10-24-sync/normal.json) |
| 暂停恢复 | 播报中用实际P键暂停、触控继续按钮恢复，声音与模拟均冻结；恢复后接着播完，再结算 | [pause.json](../reports/2026-10-24-sync/pause.json) |

253项全量测试之后仅补音频停滞兜底与重基准炮口闪光条件，最后31项定向测试和两次浏览器护送针对最终构建执行。独立只读复核提出的上述两个问题均已修正。没有重复全仓测试。

浏览器使用844×390手机横屏视口、游戏自带减弱特效及真实鼠标、键盘和触控输入，只读遥测，未写入模拟状态、跳时间、改血或注入广告。两次执行均在开始与结束核对源码/制品哈希。报告含实际音频长度、最后观测到的播放进度、三项收尾条件的连续状态，以及加速前后弹药数据。中文清敌WAV长度4.752608秒，英文4.868707秒；等待依据播放事件，文件时长仅用于验收对照。

当前截图、完整录像和独立宣传剪辑见[publishing/STATUS.md](../publishing/STATUS.md)。视频无音轨；语音完成证据来自实际Cocos播放进度与结束事件，不能把静音录屏当成同期音频录制。录制时主机负载较高，正常收尾模拟时间3.02秒、墙钟43.94秒，本次未验收实体手机性能或目标小游戏SDK。

## 定向重跑

```powershell
node --test --test-concurrency=1 games/local/night-overwatch/tests/extraction.test.ts games/local/night-overwatch/tests/input-mode.test.ts games/local/night-overwatch/tests/flight.test.ts games/local/night-overwatch/tests/replay.test.ts
$env:NIGHT_URL='http://localhost:4328/'
$env:NIGHT_EXPECTED_SOURCE_HASH=(Get-Content games/local/night-overwatch/dist/build-info.json | ConvertFrom-Json).sourceHash
Remove-Item Env:NIGHT_EXTRACTION_PAUSE -ErrorAction SilentlyContinue
node games/local/night-overwatch/tests/extraction-browser.mjs
$env:NIGHT_EXTRACTION_PAUSE='1'
node games/local/night-overwatch/tests/extraction-browser.mjs
```
