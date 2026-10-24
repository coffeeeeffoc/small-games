# 2026-10-24 界面、触控与昼夜验收

最终 Creator Web/mobile sourceHash：`e80ac6419ce7d006a9ecdd2bdbc7b28d066cb10656f1bd0d5f77649e11d140b0`。

## 已完成

- 先生成四屏概念图，再实现首页任务简报、任务地图、紧凑暂停/补给/设置/帮助/结算；海军蓝面板、琥珀主按钮、青色友军与红色威胁。
- 游戏内全屏控件、状态和动作删除；Shell 外层只对本游戏隐藏全屏按钮。原生 staging 不再改写全屏逻辑，保留审核哈希、来源收据、独立暂存和失败关闭校验。
- 触控基于准星的稳定投影计算相对位移，松手不再绝对定位；累计拖动区分追踪弹点选，取消、多指、扳机释放路径继续覆盖。
- 前五关4/6/8/12/16敌；前三关固定炮位、白天、默认爆破；4/5黄昏，6起昼夜交替。保留120任务ID和解锁存档，规则回放版本升至v2。
- 同地图昼夜切换会重建对应环境；热成像关闭恢复该时段光学配色。真实攻击意图驱动最多一个优先目标、倒计时、小地图圈和定位按钮；本地中英文电台提示，暂停/静音停止。

## 验证证据

| 层次 | 结果 | 证据 |
| --- | --- | --- |
| 游戏规则、输入、原生源码边界 | 238项通过，包括120关有限弹药、零友伤/友军存活模拟通关 | [unit-tests.txt](../reports/2026-10-24-redesign/unit-tests.txt) |
| 最后UI微调 | 后续仅调整面板尺寸、状态文案、标记位置，13项HUD测试重新通过 | [final-hud-tests.txt](../reports/2026-10-24-redesign/final-hud-tests.txt) |
| 原生配置与HUD | 微信/B站/抖音/支付宝/快手配置暂存及HUD共14项定向检查通过；不代表实际原生编译或运行 | [native-and-hud-tests.txt](../reports/2026-10-24-redesign/native-and-hud-tests.txt) |
| Shell 导航 | 24项通过，夜航守望无外层全屏按钮，分享/独立打开保留 | [shell-tests.txt](../reports/2026-10-24-redesign/shell-tests.txt) |
| Creator | 3.8.8 Web/mobile实际构建通过；包体6,482,923字节；引擎类型检查通过 | `dist/build-info.json`、`reports/web-mobile-size.json` |
| 同源浏览器 | 1366×768、844×390、568×320全部控件边界和不重叠检查；390×844旋屏暂停且保留手动暂停；无页面/请求错误 | [results.json](../reports/2026-10-24-redesign/results.json) |
| 浏览器操作 | 慢速微拖松手准星不跳位；实际命中；优先按钮定位不误开火；白天→黄昏→同地图夜间→热成像；语音暂停；补给测试回调与倒计时 | 同上，均为真实输入 |
| 实际闭环 | 热身25.4秒、4发命中、3靶全清、零友伤、S评价、可重开 | [onboarding.json](../reports/2026-10-24-redesign/onboarding.json) |

238项全量后仅UI微调，最后13项HUD及两套浏览器脚本均针对最终构建重新执行；未把中间构建截图当作最终证据。浏览器脚本开始和结束均核对当前源码、构建元数据与指定sourceHash。

独立只读复核曾发现优先按钮与车队按钮重叠、标记压住缩放面板；已移动按钮并在面板展开时隐藏标记，补充真实威胁布局断言，复核确认闭合。查看视频抽帧后又将标记文字放到红框下方，避开自身提示条。

## 重跑

在仓库根目录，串行执行：

```powershell
node --test --test-concurrency=1 games/local/night-overwatch/tests/*.test.ts games/local/night-overwatch/tests/startup.test.mjs
pnpm --filter @coffeeeeffoc/night-overwatch typecheck
node games/local/night-overwatch/scripts/build.mjs web-mobile
$env:PORT='4328'
node games/local/night-overwatch/scripts/serve.mjs
# 另一个终端
$env:NIGHT_URL='http://localhost:4328/'
$env:NIGHT_EXPECTED_SOURCE_HASH=(Get-Content games/local/night-overwatch/dist/build-info.json | ConvertFrom-Json).sourceHash
node games/local/night-overwatch/tests/redesign-browser.mjs
node games/local/night-overwatch/tests/onboarding-browser.mjs
```

浏览器使用保存进度和广告回调测试夹具，边界见 [资料状态](../publishing/STATUS.md)。没有执行微信真机、iOS/Android实体浏览器、真实广告填充、线上发布或提交推送。旧的历史浏览器脚本已移除全屏调用并通过语法检查，本轮没有重跑所有历史长时测试；本轮验收入口以上述两套为准。
