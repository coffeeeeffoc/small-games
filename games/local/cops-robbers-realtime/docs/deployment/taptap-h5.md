# 街区追捕 · TapTap H5 接入准备

本文说明旧 H5 应用的专用打包与上传链路，保留各日期的配置、截图和验收证据。它不描述原生小游戏包；文中旧好友 PK／全站榜关闭状态不代表当前 TapTap 小站能力。当前登录、云档、排行榜与 SDK 好友房见[Tap 服务说明](../../../../../platforms/taptap/docs/game-services.md)，H5／原生统一构建见[构建说明](../../../../../docs/operations/game-builds.md)。H5 ZIP 只能用于 H5 上传入口。

## 构建包体

在游戏目录执行 `pnpm package:taptap`。输出 `outputs/taptap/cops-robbers-realtime-h5.zip`，校验报告为 [taptap-h5-package.json](../qa/taptap-h5-package.json)。脚本重新构建、打开 ZIP、逐文件比较字节数和 SHA-256，只包含生产页面与资源。

向官方 H5 MCP 的 `prepare_h5_upload` / `upload_h5_game` 提供本游戏的绝对 `dist` 路径，由官方工具负责压缩。附带 ZIP 遵循官方实现的 `dist/index.html` 目录形态；不要作为原生小游戏包上传。页面按手机实际方向投影道路，角色与触点保持直立；上传方向参数应按 TapTap 应用采用的实际方向设置，并在客户端验证。

## 本游戏保安版交付（2026-10-18）

应用 **980554《别跑！街区围捕》** 已通过官方 MCP 选中并强制刷新。2026-10-18 查询确认广告状态为**已生效**、方向为**竖屏**，自动匹配的真实广告位 ID 为 **1054324**，已保存到仓库专用配置 `infra/builds/cops-robbers-realtime-taptap.json`。App ID 980554 不能填入广告位字段。在仓库根目录执行：

```powershell
pnpm build:games --config infra/builds/cops-robbers-realtime-taptap.json
```

仅生成本款游戏的广告开启、无需后端 TapTap H5 包，包体及 SHA-256 清单保存在 `outputs/game-builds/<批次>/`。广告依赖真实 TapTap H5 宿主；服务端配置核验不代表商业广告已在手机播放成功。普通浏览器不模拟广告成功。

## 广告配置

先在官方开发者服务确认当前应用和已开通的激励视频广告位。使用官方 MCP 的 `check_ads_status` 取得**该应用自己的**广告单元 ID，不使用文档示例 ID 或其他应用 ID。

在 `index.html` 主模块加载前注入实际配置：

```js
window.SmallGamesPublishingConfig = {
  adMode: 'host',
  rewardedAdUnitId: '替换为该应用的实际广告单元 ID',
};
```

宿主需提供 `window.tap.createRewardedVideoAd`。适配器使用单例 `multiton:false`，仅 `onClose` 的 `isEnded === true` 发奖；`show()` 成功只代表打开。44 秒超时只约束打开广告及加载重试；首次或重试 `show()` 成功后立即停止该计时，保留监听直到 SDK 关闭或报错，不以播放时长判断失败或成功。监听在关闭、错误、打开超时或退出时移除，同一请求只结算一次。无 SDK / 配置时显示广告不可用，正常游戏可继续。`adMode:'mock'` 只用于显式本地模拟，不用于发布。

次数按局管理：前 5 局各赠一次回溯和冲刺，每局每种再补领一次；第 6 局起每种可广告领取一次。点击补领直接打开广告，不显示中间领取页。广告阶段冻结游戏与音频；原生广告触发页面隐藏时保留请求，仅实际退出时作废。严格收到完整观看回调后增加一次对应次数，不自动使用；取消、失败均保留本局补领资格。回到前台后恢复游玩，冲刺和回溯由玩家再点对应按钮使用，失败结算页保持原位。刷新保留已开始局数，但不保存未结束对局或已领能力。

控制台使用 `[TapTapReward]` 记录请求、显示、重试、关闭标记类型、结算原因及游戏是否实际加次数，便于与 TapTap 真机调试反馈对照；只记录阶段、耗时、状态与布尔值，不记录账户、令牌或广告素材。广告页面的“已获得奖励”仍需通过 SDK 关闭事件传回游戏；若手机继续失败，检查 `open-timeout`、`dispose`、`sdk-error`、`sdk-close` 和 `grant`，不要仅据广告页面文案猜测或放宽完成校验。

## 渠道验收

旧包曾将 App ID 980554 误用为广告位 ID，现已改为官方 MCP 自动匹配的竖屏广告位 1054324。修正版尚未上传、提交审核或测试真实广告。上传后需要在 TapTap 手机客户端验收启动、方向与安全区、选人下令、冲刺/回溯、广告完成/取消/失败、前后台恢复与重启存档。浏览器中的显式 SDK 回调夹具不能证明真实广告可播放。

官方依据（2026-10-14）：[H5 上传实现](https://github.com/taptap/instant-games-open-mcp/blob/eca4de71d9869514eea64037b405f46cf7dd87df/src/features/h5Game/handlers.ts)、[广告接入指南](https://developer.taptap.cn/minigameapidoc/quick-start/mcp-guide/ad-integration-guide/)、[激励视频广告](https://developer.taptap.cn/minigameapidoc/dev/tutorial/open-capabilities/ad/rewarded-video-ad/)。
