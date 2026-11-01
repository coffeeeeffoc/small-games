# 夜航守望 · 交付状态

2026-11-01 三档打包补充：开发测试包已接入金币/经验及自由选关工具，测试/正式包锁定关闭开发入口。后端及客户端使用可按游戏注册的通用开发资产接口，夜航是首个真实钱包接入者。真实 Creator、三档 ZIP、隔离数据库与浏览器验证见[构建验证](../docs/verification-2026-11-01-build-profiles.md)。本次工具不进入正式玩家宣传画面，八类素材保留以下原采集证据。用户明确授权开启 FRP 后，自动审批仍拒绝本机 Runtime 升级，现有 FRP 未加载开发资产命令；没有生产部署或渠道上传。

更新：2026-11-01。Game ID：`night-overwatch`。已按 `358b1fe0` 的方案和九张效果图实现成长、金币军需、商店礼包、任务签到、邮件仓库、个人配装及结算。对照和验证见[本轮记录](../docs/verification-2026-11-01-progression.md)。

当前 Creator 3.8.8 web-mobile 源码摘要：`ba624680adf6b79d140eedbd081f09e86d956b28d1e192ee52c005f4623b7e0a`。同日修正“军需配置”名称及签到当天高亮，闭环沿用下方真实战斗证据。首页/配置截图来自当前构建与真实本地 Runtime 新游客；宣传片前6秒同步替换。其余战斗素材保留 `0739a52422ac870b0423307cfc0608966ce6ff0747d715a7103b8829d09fb659` 构建经 Sakura FRP 录制的身份，内容复核沿用；正式媒体未使用 QA 余额/奖励 fixture。

当前阶段：本地修复及资料更新完成，按用户确认保留个人累计签到，修复与资料一并提交；未推送、生产部署或平台上传，后续渠道提交前按实际入口核对规格。

## 八类资料

| 类别 | 状态 | 当前文件 |
| --- | --- | --- |
| 游戏简介 | 已提供 | [introduction.md](copy/introduction.md)，复核沿用 |
| 推荐语 | 已提供 | [tagline.md](copy/tagline.md)，复核沿用 |
| 开发者的话 | 已提供 | [developer-note.md](copy/developer-note.md)，复核沿用 |
| 图标 | 已提供 | [1024×1024 PNG](icon/icon-1024.png)，复核沿用 |
| 宣传图 | 已提供 | [1920×1080](promo/images/title-1920x1080.png)、[1440×1440](promo/images/title-1440x1440.png)，复核沿用 |
| 宣传视频 | 已提供 | [20 秒 MP4](promo/videos/progression-2026-11-01-1280x720-silent.mp4)，当前首页/军需配置实机静帧各3秒，原连续战斗14秒 |
| 游戏截图 | 已提供 | [开火](gameplay/screenshots/2026-11-01-progression/03-fire.png)、[命中](gameplay/screenshots/2026-11-01-progression/04-impact.png)、[结算](gameplay/screenshots/2026-11-01-progression/05-settlement.png)沿用；[首页](gameplay/screenshots/2026-11-01-progression/01-home.png)、[军需配置](gameplay/screenshots/2026-11-01-progression/02-loadout.png)更新 |
| 实机录屏 | 已提供 | [22 秒连续战斗 MP4](gameplay/videos/progression-2026-11-01-1280x720-silent.mp4)，浏览器实录复核沿用，非实体手机采集 |

2026-11-01复核：全部清单文件可读取、图片可解码且摘要一致。截图为1280×720、每张小于4 MB；两段视频均为1280×720 H.264、无音轨，完整解码通过，更新宣传片的全部20张逐秒帧已查看。[manifest.json](manifest.json)分别记录采集与复核版本、尺寸、时长和摘要；[剪辑记录](promo/videos/progression-2026-11-01-edit.json)记录当前静帧与历史战斗段的确切来源。界面测试资产图单独保存在docs，不混入正式媒体。

素材来源和许可见[素材清单](../docs/ASSET_MANIFEST.json)。上一轮资料保留于[历史状态](STATUS-2026-10-30-taptap-login.md)和[历史清单](manifest-2026-10-30-taptap-login.json)。

## 本地联调

Runtime、PostgreSQL、回环网关已启动，FRP API 为 `https://nas.hc2a5c9f0.nyat.app:29549/api/competition/v1`。恢复演练 32 表一致，旧资产迁移与真实签到/购买/开包/开局/结算/重载通过。启动、备份和用户后续自行打包的公开配置位置见[本地说明](../../../../docs/operations/night-overwatch-local-selftest.md)。本次未生成 TapTap ZIP、未上传或提交审核。

## 生产部署

本次只更新本地后端，没有部署生产。历史生产版本不代表本轮成长军需已经上线；旧版本回执保存在历史状态中。

未验证实体手机、TapTap 真宿主、真实广告库存和原生包。视频奖励目前没有 S2S 验签，仅有受限客户端回调校验。未运行全仓候选门禁，CI/Pages 按最终推送 SHA 独立核对。
