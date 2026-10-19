# TapTap 激励广告接入避坑指南

归档日期：2026-10-19。主要依据象五子棋 TapTap **H5** 的实际代码、失败回归和整包验证；其他入口需逐一核对自己的调用链。本文描述接入和排障方法，不代表当前包已经通过真实广告或真机验收。

## 先确认入口和调用链

后台开通广告、配置广告位、页面出现按钮、SDK 成功打开广告、用户完成观看、游戏实际发奖，是六件不同的事，必须分别确认。

H5 的 `taptap-h5` 使用宿主注入的 `tap`。普通浏览器没有 SDK 时应返回 unavailable；不能回退 `wx`、`tt`、`bl` 或模拟广告来冒充接入成功。原生 Tap 小游戏和 APK 使用独立的渠道流程，H5 ZIP、SDK 测试和广告位不能直接代替原生接入。[官方适用范围](https://developer.taptap.cn/minigameapidoc/quick-start/mcp-guide/ad-integration-guide/)

本次象五子棋调用链：

```text
获取提示／悔棋
→ computer-hints.js／computer-undo.js
→ rewarded-hints.js（游戏层请求、取消及恢复）
→ SmallGamesRewardAds（rewarded-host.js 组装）
→ platform-ads.js（渠道 SDK、监听及实例清理）
→ tap.createRewardedVideoAd
```

## 最容易丢奖励的两个问题

### 1. 超时计时覆盖了视频和广告结束页

旧 H5 实现的广告层和游戏层各有一个 45 秒总截止时间，从点击开始计算加载、播放及停留。第一次加载十多秒，后续视频可能播放 15–60 秒，结束页又可以继续停留；完成回调到达前，请求已被判失败、监听已移除，之后即便 `isEnded=true` 也无效。

中间版本把播放限时改为 180 秒、外层改为 226 秒，只让常见短广告通过，仍未消除这个问题。不要不断增大总超时来代替正确的阶段管理。

最终规则：

| 阶段                               | 截止时间                                              | 是否发奖 |
| ---------------------------------- | ----------------------------------------------------- | -------- |
| 加载／尝试打开                     | 保留有限等待，本次广告层 45 秒，游戏层 46 秒兜底      | 否       |
| SDK 的 `show()` Promise 成功       | 清除广告层计时，并通过本请求 `onShown` 清除游戏层计时 | 否       |
| 视频播放／结束页停留               | 不再使用加载／打开截止时间                            | 否       |
| `onClose({ isEnded: true })`       | 结算一次、清理本请求                                  | 是       |
| 未看完、SDK 错误、明确离开游戏流程 | 结束本请求；迟到回调无效                              | 否       |

`show()` 的 Promise 表示**显示操作结果**；发奖依据来自关闭回调的布尔字段 `isEnded`，两者不可互换。[show](https://developer.taptap.cn/minigameapidoc/dev/api/ad/RewardedVideoAd.show/)、[onClose](https://developer.taptap.cn/minigameapidoc/dev/api/ad/RewardedVideoAd.onClose/)

只接受 `isEnded === true`，不能用 `Boolean(isEnded)`、停留时长、页面恢复或 Promise 成功推断完成。缺失或非布尔值应保留类型诊断，不能为了“兼容”一律奖励。

要逐层查找计时器。只修 SDK 适配器，外层 `offer/request` 的总超时仍会提前 `cancel/dispose`。象五子棋与 cops-robbers 已经透传 `onShown`；`publishing.js`、其他游戏包装器及原生适配器需分别审查，不能因复用了 `platform-ads.js` 就宣称所有入口都已修复。

cops-robbers 曾仍有游戏端 `ads.js` 的 45 秒总超时，以及 `main.js` 隐藏时取消、返回时丢弃结果的逻辑；只升级公共广告层无法消除这三处问题。2026-10-19 已修复，调用链为 `main.js → ads.js → ad-host.js → platform-ads.js → tap`，见[围捕小队整包回归](../../games/local/cops-robbers/docs/qa/taptap-reward-fix-2026-10-19/README.md)。

### 2. 广告导致页面隐藏，却被当成退出

全屏广告可能触发页面隐藏。旧逻辑在 `visibilitychange` 中销毁广告，导致 SDK 完成回调没有接收者。只修游戏层也不够：此前独立 H5 host 还在 Window 上监听隐藏事件并取消请求。

- 广告正在进行时，隐藏页面保留广告实例、监听和请求归属；暂停棋盘输入、电脑落子及后台分析。
- 隐藏期间收到结果先保存，前台恢复后交付结果、显示提示或悔棋反馈；不能因为 `document.hidden` 直接丢弃已完成奖励。
- 玩家明确离开当前奖励流程、重开、页面实际退出或实例销毁时取消；取消后的旧关闭回调和 `onShown` 都不能影响新请求。
- 浏览器回归要覆盖 Document 和 Window。仅 `document.dispatchEvent(new Event('visibilitychange'))` 默认不冒泡，会漏掉 Window 监听。测试应使用 `{ bubbles: true }` 并断言 Window 确实收到事件。
- 区分“关闭回调先到、前台后到”和“前台先到、关闭回调后到”，两种顺序都要验证。

## 首次慢、奖励无感和重复请求

| 现象／错误做法                              | 避坑方法                                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 首次点按钮才加载广告，十多秒没有反应        | 首页预加载，点击复用同一实例；显示“准备广告…”。预加载不自动播放，也不保证弱网或无库存下一定秒开 |
| 导航调用无条件 cancel，把刚预加载的广告销毁 | 空闲取消不影响预加载；实际退出仍释放实例                                                        |
| 预加载失败后一直不可用                      | 清理失败实例并允许后续请求重试；SDK 晚注入时下次请求重新查询                                    |
| 先分析再看广告，回来却没有提示              | 先取得完成结果，再分析并渲染明确的起点／落点和一句理由；分析失败保留本回合已取得的授权供重试    |
| 连点、迟到回调、上一局分析覆盖当前局        | 单请求并发控制；绑定当前局面／回合及请求身份；结束幂等，过期结果不落地                          |
| 第一次悔棋后重启又获得免费次数              | 免费次数使用状态进入存档，兼容旧存档；广告中断不改局面或次数                                    |
| 悔棋后重新随机抽子                          | 恢复原来的已抽棋子，避免悔棋变成免费重抽                                                        |
| 销毁或解绑失败后立刻复用 SDK 单例           | 保留旧操作占用，确认清理后再接新请求；各渠道单例／销毁语义分别处理                              |
| SDK 方法被解构调用                          | 保留接收者：`sdk.createRewardedVideoAd(...)`、`ad.load()`、`ad.show()`                          |

失败也要结束忙碌 UI。象五子棋使用“提示未成功生成”；悔棋中断为“未成功获得悔棋次数，悔棋失败”。`unavailable / failed / dismissed / completed` 不能在平台层被压成同一个结果。

## 诊断与验证方法

象五子棋 H5 记录最近 40 条事件到 `localStorage['xiangqi-five-ad-diagnostics']`，开发面板状态快照的 `game.ads` 使用同一记录。当前诊断版本 `h5-ad-open-timeout-20261019`。普通玩家界面不展示开发信息；存储异常不能阻断发奖。

重点看：`preload → loaded → show → shown → close(isEnded=true) → result(completed)`，以及中间的 `visibility`、`error`、`timeout`、`cancel`。记录时间、阶段、数值错误码和完成字段类型即可，不采集凭证、账号、完整 SDK 对象或广告素材。

| 证据                                     | 能确认什么                             | 不能替代什么         |
| ---------------------------------------- | -------------------------------------- | -------------------- |
| 单元／组合回归                           | 定时器、回调顺序、取消、幂等、状态迁移 | 真 SDK 注入及库存    |
| 实际 H5 包＋模拟 SDK                     | 配置、宿主、游戏、UI 的完整调用链      | TapTap 实机广告      |
| 虚拟时钟推进 10 分钟                     | 长结束页停留不会误超时                 | 实际播放十分钟       |
| ZIP 与文件逐项哈希一致                   | 测试文件和交付制品对应                 | 已上传或已上线       |
| 目标设备、目标包的真实完成日志与奖励操作 | 本次环境的实际发奖                     | 其他版本、游戏和渠道 |

最低回归覆盖：长加载＋长视频＋结束页停留、打开永不返回、show 拒绝或缺少 Promise、取消观看、SDK 错误、重复／迟到完成、迟到显示成功、隐藏与恢复的两种顺序、退出旧局后开始新局、首免悔棋及存档恢复。验证显示成功本身不会发奖，完成后提示落点确实可执行，未完成悔棋后存档完全不变。

从仓库根运行相关逻辑检查：

```powershell

```

整包浏览器检查需把 `HINT_AD_HOST_CHECK` 设为 `1`，`HINT_DIST_DIR` 指向该批 H5 包的绝对 `dist` 路径，再运行 `node games/submodules/xiangqi-five/computer-hints-check.mjs`。生成新交付批次时使用新目录，保留旧包用于回溯；核对 manifest、ZIP 和测试文件哈希，不能只测源码后上传另一个包。

## 本次归档与边界

- [最终修复与失败／通过证据](../../games/submodules/xiangqi-five/docs/design/h5-ad-open-timeout-2026-10-19/README.md)：47 项相关回归、三种手机尺寸的整包触屏流程、虚拟时钟十分钟结束页案例通过。
- [此前 180 秒方案的记录](../../games/submodules/xiangqi-five/docs/design/h5-ad-timing-fix-2026-10-18/README.md)：仅是中间版本，已被最终方案替代。
- [可见性问题记录](../../games/submodules/xiangqi-five/docs/design/h5-ad-host-fix-2026-10-18/validation.md)：记录 Window 监听遗漏，不能单独证明超时已修好。
- 最终本地包：`outputs/xiangqi-five-h5-ad-open-timeout-2026-10-19/xiangqi-five-taptap-h5-ads-on-service-off.zip`，SHA-256 `cb521b295ccef16c100f347067b402f98d8cd70bb5213478482246385b07e228`。
- 未完成本包的 TapTap 上传、真机真实广告和平台验收。不能把其他会话截图中的“实机成功”移用为本包证据；发布时另按[增量发布验证](incremental-publication.md)执行。

## 原生 Canvas 适配回归（2026-10-19）
