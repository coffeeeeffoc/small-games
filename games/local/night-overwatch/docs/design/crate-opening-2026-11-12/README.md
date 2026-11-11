# 补给箱先播放动画，再显示结算

后续用户反馈已在[完整特效默认值与游戏更新提示](../game-updates-2026-11-12/README.md)继续处理：默认完整，精简也有连续箱体动作和粒子。下文及本目录媒体为第一轮历史证据，不代表最终精简效果。

2026-11-12 修复。用户要求单箱和批量开箱都先播放开箱动画，再显示奖励。沿用现有箱体、美术及完整特效演出，不新增玩法或修改资产结算。

## 原因与范围

`BattleStatusView.update` 每帧先调用 `Quartermaster.tickPresentation(reducedEffects)`，再重建界面。旧代码将 `reducedEffects` 与动画超时并列：精简特效开启时，第一帧就清除 `gift.started`，因此 `ProgressionView` 只能绘制奖励列表，连开箱第一帧也看不到。该设置来自已保存的“特效·精简”，或首次进入时系统的 `prefers-reduced-motion: reduce`。没有读取用户设备的实际设置，因此这里记录的是已确定复现的代码路径。

旧 `polish-browser.mjs` 只覆盖默认完整特效和信箱一键打开；虽然当时截图有动画，未覆盖这个跳过条件。本次先在旧产物中真实点击仓库“打开”，得到 `reduced-844/single: opening must appear before rewards` 失败；单元测试的单箱、批量数量、混合礼包三个精简模式场景也都在第一帧失败。

修复从状态推进接口移除动效偏好，所有成功开箱共用 2.2 秒时间线：闭箱 → 1.1 秒开盖 → 2.2 秒奖励。精简模式保留箱体淡入及渐亮光晕，取消晃动、旋转、爆闪和飞散粒子；玩家主动“跳过”入口保持。仓库单箱、仓库批量数量、礼包一键打开及开发演示沿用同一状态和渲染流程。交易编号、扣箱、失败重试及账号切换保护保持原逻辑。

实际消费者同步：更新原生暂存的 `BattleStatusView.ts` 源码摘要；相关验证暴露暂存及测试夹具漏拷贝已参与源码指纹的 `legacy-polyfills.js`，补齐这两处输入清单，未放宽源码校验。

## 验证

- Creator 3.8.8 `web-mobile` 构建成功，59,601,924 字节；本地构建版本 1.0.17，源码摘要 `d0d5f527f51e68612e884613c943ef0870e71b00ddb40b4fcc768c624a54c944`。
- Quartermaster、成长规则、HUD 交互、开发工具及原生暂存共 126 项通过；类型检查、`pnpm test:no-fullscreen` 通过。
- 新增 `tests/crate-opening-browser.mjs`：844×390、568×320、1280×720，完整／精简模式各点击单箱、批量三个、一键三个，共 18 条路径通过。每次同时检查实际闭箱／开箱节点、期间无奖励列表／完成按钮、完整模式晃动、精简模式光晕变化且无爆闪，以及请求次数和数量。实测 2202–2211 ms 后显示奖励；无浏览器错误。
- 三张阶段截图逐帧查看；完整模式对照 11-11 演出保持原箱体与背景，差异为动画取帧时刻。精简模式的闭箱、开盖、奖励布局均可见，无结算提前覆盖。两段录屏为桌面 Chromium 触屏模拟、隔离服务夹具，非真实玩家资产或手机实机。

重跑浏览器验证（先构建并启动 `node scripts/serve.mjs`，以下在游戏目录执行）：

```powershell
$env:NIGHT_URL='http://localhost:4318'
$env:NIGHT_EXPECTED_SOURCE_HASH=(Get-Content dist/build-info.json -Raw | ConvertFrom-Json).sourceHash
node tests/crate-opening-browser.mjs
```

| 证据 | 文件 |
| --- | --- |
| 精简特效：单箱、批量、一键打开连续点击 | [reduced-844.mp4](reduced-844.mp4) |
| 完整特效：单箱、批量、一键打开连续点击 | [full-844.mp4](full-844.mp4) |
| 精简：闭箱／开盖／结算 | [闭箱](reduced-844-single-closed.png)、[开盖](reduced-844-single-open.png)、[结算](reduced-844-single-rewards.png) |
| 完整：闭箱／开盖／结算 | [闭箱](full-844-single-closed.png)、[开盖](full-844-single-open.png)、[结算](full-844-single-rewards.png) |
| 全部路径与实际时间 | [results.json](results.json) |

未做实体手机、TapTap 宿主或真实服务开箱验证；未上传平台包、部署生产、提交或推送 Git。修复只在当前源码及本地 H5 构建生效，已有渠道包需要替换为包含本次修复的新包。

八类上架资料均存在且非空，37 项清单文件中 36 项摘要一致；`copy/introduction.md` 的既有摘要不一致保留为独立资料问题。本次只修正开箱流程，正式战斗截图、宣传片与录屏保持原采集身份；这里的开箱证据仅用于 QA，不冒充上架实机媒体。
