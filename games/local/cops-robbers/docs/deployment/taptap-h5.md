# 围捕小队 · TapTap H5 发布准备

本次选择 H5，沿用竖屏道路棋盘、手机触屏和本地进度。好友 PK 与全站榜暂时禁用；人机对抗、挑战、接力、快练及同题分享仍可用。

创建游戏时选「常规发布 → 手机 → 小游戏」，包体管理选择 H5。快速上架的创意工坊通道暂不支持各项生态能力，不用于本次广告接入。游戏类型选「益智」。[官方小游戏说明](https://developer.taptap.cn/minigameapidoc/quick-start/guide/minigames-intro/)明确支持普通小游戏与 H5 小游戏；创建表单按 2026-10-13 的实际界面核对。

## 本地包

在仓库根目录运行：

```powershell
pnpm --filter cops-robbers package:taptap
pnpm --filter cops-robbers test:ads
```

产物：`outputs/cops-robbers/cops-robbers-taptap-h5.zip`，顶层只有 `dist/`，入口为 `dist/index.html`。打包读取当前源码资源清单，排除普通构建保留的旧 `competition.js`、服务器配置和额外文件，并重新读取 ZIP 全部条目核对大小与 SHA-256。记录见 [包体记录](../qa/taptap-h5-package.json)。

手工上传该 ZIP。官方 MCP 使用构建目录而非 ZIP：先核对已选应用，再准备 H5 上传，目录为打包脚本从本 ZIP 全新解压的 `outputs/cops-robbers/taptap-h5/dist`。常规 `games/local/cops-robbers/dist` 保留旧文件，不直接作为 MCP 上传目录。方向参数 `screenOrientation: 1` 为竖屏。官方依据：[H5 上传工具](https://github.com/taptap/instant-games-open-mcp/blob/main/src/features/h5Game/tools.ts)、[ZIP 实现](https://github.com/taptap/instant-games-open-mcp/blob/main/src/features/h5Game/handlers.ts)、[手工包体要求](https://www.taptap.cn/moment/598609424361196724)，2026-10-13 核查。

静态资源、模块、提示 Worker 均使用相对路径，无外部素材依赖。通过 HTTP(S) 启动，保证 `.js` 使用 JavaScript MIME。Web 全屏由用户手势发起；普通竖屏视口可直接游玩。存档沿用 `cops-robbers-v3`，H5 域名变化可能无法继承旧域名的本地存储。

## 激励广告接口

每点一次“看广告”都需要完成一次广告，完成后才求解当前位置。取消、不可用、失败、超时与离开当前局面不提供提示。教学指引保留，手动行棋、撤销与重试免费。

普通网页默认使用明确标注的四秒模拟广告。**模拟广告不是商业广告，也没有收益。** 真实宿主需在请求前注入已有奖励契约：

```js
globalThis.SmallGamesRewardAds = {
  async offer(opportunity) {
    // opportunity = { id: 'cops-robbers:hint', reward: { hint: 1 } }
    // 调用该 H5 渠道的真实激励广告 SDK；仅完整观看回调可返回 completed。
    return { status: 'unavailable' };
  },
  dispose() { /* 取消广告、清理监听，并让 offer 的 Promise 返回 dismissed。 */ },
};
```

也支持 `SmallGamesPublishingConfig = { adMode: 'host', provider: { show(request), dispose() } }`，`request` 为 `{ opportunityId: 'cops-robbers:hint', kind: 'rewarded' }`。两种接口均返回 `completed / dismissed / unavailable / failed`，未知值不给提示。设置 `adMode: 'host'` 后缺少提供方会报告不可用，不回退到模拟；`adMode: 'off'` 关闭广告获取提示。超时或取消会恢复正常行棋，但尚未结束的宿主广告仍占用提示请求锁，避免重复展示；提供方须让取消后的 Promise 结束。

## TapTap H5 广告开通

用户确认尚未开通广告。按[官方 H5 广告接入指南](https://developer.taptap.cn/minigameapidoc/quick-start/mcp-guide/ad-integration-guide/)先完善开发者认证和财务主体，再进入「游戏 → 商店 → 小游戏广告 → 申请开通」。前端调用广告不能替代后台开通，不需要用户另找第三方 SDK。

开通后使用官方 MCP 的 `check_ads_status` 查询已选应用，由平台自动返回与竖屏设置对应的广告位，再获取 `get_ad_integration_guide` 接入实际提供方。[官方实现](https://github.com/taptap/instant-games-open-mcp/blob/main/src/features/ads/handlers.ts)区分未开通与已生效，并自动匹配方向；[官方 SDK 示例](https://github.com/taptap/instant-games-open-mcp/blob/main/src/features/ads/docs.ts)使用宿主的 `tap.createRewardedVideoAd` 和 `onClose` 的 `isEnded`。H5 必须在宿主确实注入 `window.tap` 的环境中验证，普通浏览器不能假设拥有该接口。2026-10-14 核查。

当前未连接该应用的官方 MCP，尚无后台已生效配置或实际广告回执。本包完成游戏端广告提示流程和提供方接口，**尚未完成 TapTap 真实广告适配、播放或变现验收**。取得后台配置后再接入，并验证完整观看、关闭、无填充、错误、前后台与晚到回调。平台若要求登录、启动校验或防沉迷 SDK，须按该 H5 通道要求补齐并另行验收。

## 后台与设备待办

- 核对开发者主体、游戏应用与 H5 发布通道，上传包并留存版本/包 ID、启动 URL 和竖屏设置回执。
- Android / iOS 的真实 TapTap H5 WebView 检查冷启动、触控、音效、全屏拒绝、安全区、Worker 与资源 MIME、前后台和存档恢复。
- 真实广告完成/取消/无填充、广告后提示、重复请求与超时；不能用模拟广告或 Chromium 触屏模拟代替。
- 使用实际截图、简介、图标、年龄分级及通道要求的资料提交审核，另记录审核与上线结果。公开链接不带 `dev=1`。

本次仅准备和验证本地包，不包含上传、平台审核或真机验收。
