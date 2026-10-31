# 夜航守望 · 交付状态

更新：2026-11-01。Game ID：`night-overwatch`。已按 `358b1fe0` 的方案和九张效果图实现成长、金币军需、商店礼包、任务签到、邮件仓库、个人配装及结算。对照和验证见[本轮记录](../docs/verification-2026-11-01-progression.md)。

Creator 3.8.8 web-mobile 源码摘要：`0739a52422ac870b0423307cfc0608966ce6ff0747d715a7103b8829d09fb659`。正式截图和视频来自该构建与真实本地 Runtime，经 Sakura FRP 联调；未使用 QA 余额/奖励 fixture。

## 八类资料

| 类别 | 状态 | 当前文件 |
| --- | --- | --- |
| 游戏简介 | 已更新 | [introduction.md](copy/introduction.md) |
| 推荐语 | 复核沿用 | [tagline.md](copy/tagline.md) |
| 开发者的话 | 已更新 | [developer-note.md](copy/developer-note.md) |
| 图标 | 复核沿用 | [1024×1024 PNG](icon/icon-1024.png) |
| 宣传图 | 复核沿用 | [1920×1080](promo/images/title-1920x1080.png)、[1440×1440](promo/images/title-1440x1440.png) |
| 宣传视频 | 本轮真实录制 | [20 秒 MP4](promo/videos/progression-2026-11-01-1280x720-silent.mp4)，首页 3 秒、军需 3 秒、连续战斗 14 秒 |
| 游戏截图 | 本轮真实采集 | [首页](gameplay/screenshots/2026-11-01-progression/01-home.png)、[军需](gameplay/screenshots/2026-11-01-progression/02-loadout.png)、[开火](gameplay/screenshots/2026-11-01-progression/03-fire.png)、[命中](gameplay/screenshots/2026-11-01-progression/04-impact.png)、[结算](gameplay/screenshots/2026-11-01-progression/05-settlement.png) |
| 实机录屏 | 本轮浏览器实录 | [22 秒连续战斗 MP4](gameplay/videos/progression-2026-11-01-1280x720-silent.mp4)，非实体手机采集 |

截图为 1280×720、每张小于 4 MB；视频均为 1280×720 H.264、无音轨，完整解码及首尾抽帧核对通过。[manifest.json](manifest.json)记录尺寸、时长、摘要和沿用来源；[剪辑记录](promo/videos/progression-2026-11-01-edit.json)记录源视频摘要及区间。界面测试资产图单独保存在 docs，不混入正式媒体。

素材来源和许可见[素材清单](../docs/ASSET_MANIFEST.json)。上一轮资料保留于[历史状态](STATUS-2026-10-30-taptap-login.md)和[历史清单](manifest-2026-10-30-taptap-login.json)。

## 本地联调

Runtime、PostgreSQL、回环网关已启动，FRP API 为 `https://nas.hc2a5c9f0.nyat.app:29549/api/competition/v1`。恢复演练 32 表一致，旧资产迁移与真实签到/购买/开包/开局/结算/重载通过。启动、备份和用户后续自行打包的公开配置位置见[本地说明](../../../../docs/operations/night-overwatch-local-selftest.md)。本次未生成 TapTap ZIP、未上传或提交审核。

## 生产部署

本次只更新本地后端，没有部署生产。历史生产版本不代表本轮成长军需已经上线；旧版本回执保存在历史状态中。

未验证实体手机、TapTap 真宿主、真实广告库存和原生包。视频奖励目前没有 S2S 验签，仅有受限客户端回调校验。未运行全仓候选门禁，CI/Pages 按最终推送 SHA 独立核对。
