# 三块选两块上架资料

- 游戏：three-choose-two / 三块选两块
- 更新日期：2026-10-23
- 版本：本目录 Cocos Creator 3.8.8 迁移版本；媒体 SHA-256 与录制产物指纹见 [media-manifest.json](media-manifest.json)。
- 目标形态：竖屏手机 Web / H5 基础素材。
- 基本闭环：已成立。实际 Creator 画布中拖动、消除、通关、下一关；[验证记录](../docs/design/cocos-2026-10-23/VALIDATION.md)。
- 当前上架阶段：仅整理素材，未向平台提交审核。
- 下一步：按目标渠道规格适配；配置真实广告位后另验官方 SDK、填充与手机真机。

| 类别 | 状态 | 文件与规格 | 验证日期与方法 |
| --- | --- | --- | --- |
| 游戏简介 | 已提供 | [introduction.md](copy/introduction.md) | 2026-10-23，按实际规则逐项核对 |
| 一句话推荐语 | 已提供 | [tagline.md](copy/tagline.md) | 2026-10-23，独立可粘贴文案 |
| 开发者的话 | 已提供 | [developer-note.md](copy/developer-note.md) | 2026-10-23，明确无广告位现状 |
| 图标 | 已提供 | [icon.png](icon/icon.png)，1024×1024 PNG | 2026-10-23，imagegen 生成并打开核验 |
| 宣传图 | 已提供 | [花园标题图](promo/images/garden-title-portrait-1024x1536.png)，1024×1536 PNG | 2026-10-23，imagegen 生成，与原花园及积木视觉对应 |
| 宣传视频 | 已提供 | [宣传片](promo/videos/garden-creator-promo-720x1280.mp4)，720×1280，31.36 秒，H.264，无音轨 | 2026-10-23，标题图加真实玩法，ffprobe 与抽帧核对 |
| 游戏内截图 | 已提供 | [首页](gameplay/screenshots/home-390x844.png)、[棋盘](gameplay/screenshots/game-390x844.png)、[通关](gameplay/screenshots/win-390x844.png)、[重置确认](gameplay/screenshots/reset-390x844.png)，390×844 PNG | 2026-10-23，真实 Creator Web 产物，Chromium 手机触屏模拟 |
| 游戏内视频 | 已提供 | [实际操作录像](gameplay/videos/creator-touch-levels1-3-390x844.mp4)，390×844，28.36 秒，H.264，无音轨 | 2026-10-23，普通模式真实触屏输入，第 1–3 关；ffprobe、抽帧核对 |

素材均保存在本目录，不以效果图代替实际截图。录像来自桌面 Chromium 的手机视口与触屏模拟，不代表手机真机或原生平台验收。录屏脚本为 tests/record-gameplay.mjs；宣传片与实际录像分别交付。

原花园、logo、hero 与音频来自本游戏既有资产；新图标和宣传图由本轮 imagegen 生成。历史花园设计与本轮概念图保留在 docs/design/，不作为实机证据。八类资料无未解决阻塞；尚未核定特定渠道审核尺寸，不宣称已获平台审核通过。

## 2026-10-23 发布指纹修复

本次仅修正跨系统指纹和构建配置传递，沿用以上八类素材与其原始实机身份。原因、修复范围和发布验收见[统一记录](../../../../docs/operations/cocos-artifact-repair-20261023.md)；原生平台与手机真机仍按以上边界记录。

## 2026-10-24 H5 激励接线

已接入统一 H5 构建的可选奖励端口；广告位为空时保持关闭，免费玩法可用。本轮奖励位置、配置与验证边界见[通用接入表](../../../../docs/operations/taptap-rewarded-ads.md#十三款可选激励接入2026-10-24)。现有八类素材保留；本次不代表平台广告开通、库存或真机验收完成。
