# 街区追捕 · TapTap H5 接入准备

当前沿用 HTML/Canvas 的 H5 发布形态。好友 PK、全站榜、成绩上传和邀请自动进入已关闭，单机不依赖域名服务。原生 Tap 小游戏没有 DOM/BOM，当前 ZIP 不属于原生 Tap 转换包。

## 构建包体

在游戏目录执行 `pnpm package:taptap`。输出 `outputs/taptap/cops-robbers-realtime-h5.zip`，校验报告为 [taptap-h5-package.json](../qa/taptap-h5-package.json)。脚本重新构建、打开 ZIP、逐文件比较字节数和 SHA-256，只包含生产页面与资源。

向官方 H5 MCP 的 `prepare_h5_upload` / `upload_h5_game` 提供本游戏的绝对 `dist` 路径，由官方工具负责压缩。附带 ZIP 遵循官方实现的 `dist/index.html` 目录形态；不要作为原生小游戏包上传。页面按手机实际方向投影道路，角色与触点保持直立；上传方向参数应按 TapTap 应用采用的实际方向设置，并在客户端验证。

## 广告配置

先在官方开发者服务确认当前应用和已开通的激励视频广告位。使用官方 MCP 的 `check_ads_status` 取得**该应用自己的**广告单元 ID，不使用文档示例 ID 或其他应用 ID。

在 `index.html` 主模块加载前注入实际配置：

```js
window.SmallGamesPublishingConfig = {
  adMode: 'host',
  rewardedAdUnitId: '替换为该应用的实际广告单元 ID',
};
```

宿主需提供 `window.tap.createRewardedVideoAd`。适配器使用单例 `multiton:false`，仅 `onClose` 的 `isEnded === true` 发奖；`show()` 成功只代表打开。监听在关闭、错误、超时或退出时移除，同一请求只结算一次。无 SDK / 配置时显示广告不可用，正常游戏可继续。`adMode:'mock'` 只用于显式本地模拟，不用于发布。

次数按局管理：前 5 局各赠一次回溯和冲刺，每局每种再补领一次；第 6 局起每种可广告领取一次。能力用完后不强制播放广告。广告阶段冻结游戏与音频；成功、取消和失败均等待玩家明确继续。刷新保留已开始局数，但不保存未结束对局或已领能力。

## 渠道验收

当前未取得真实应用广告位，未上传、提交审核或测试真实广告。上传后需要在 TapTap 手机客户端验收启动、方向与安全区、选人下令、冲刺/回溯、广告完成/取消/失败、前后台恢复与重启存档。浏览器中的显式 SDK 回调夹具不能证明真实广告可播放。

官方依据（2026-10-14）：[H5 上传实现](https://github.com/taptap/instant-games-open-mcp/blob/eca4de71d9869514eea64037b405f46cf7dd87df/src/features/h5Game/handlers.ts)、[广告接入指南](https://developer.taptap.cn/minigameapidoc/quick-start/mcp-guide/ad-integration-guide/)、[激励视频广告](https://developer.taptap.cn/minigameapidoc/dev/tutorial/open-capabilities/ad/rewarded-video-ad/)。
