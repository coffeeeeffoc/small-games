# 夜航守望 · 交付状态

2026-11-01 军需交互修复：插槽选中、类型筛选、纵向列表、卸载/拖拽替换、显式保存、礼包详情/一键开包、战斗实时装配对照及金币显示已接通。完整功能和视觉证据见[本轮记录](../docs/verification-2026-11-01-progression.md#军需交互与战斗装配修复)。

同日三档打包已接入金币/经验及自由选关工具，测试/正式包锁定关闭开发入口；历史验证见[构建验证](../docs/verification-2026-11-01-build-profiles.md)。开发工具不进入本次正式媒体。

更新：2026-11-01。Game ID：`night-overwatch`。已按 `358b1fe0` 的方案和九张效果图实现成长、金币军需、商店礼包、任务签到、邮件仓库、个人配装及结算。对照和验证见[本轮记录](../docs/verification-2026-11-01-progression.md)。

当前 Creator 3.8.8 web-mobile 源码摘要：`226005dbf780c9f237ec098758493f9ef67c6799326bd084da3f2017ff1c000a`。5张截图与两段视频全部从当前构建、真实本地 Runtime 新游客重新采集；正式媒体未使用余额/奖励 fixture。欢迎邮件、签到、开包、购买、确定保存、正式单人通关、单场资格仅扣一次、180金币/120经验到账和重载保留已通过。

当前阶段：本地修复及资料更新完成，修复与资料一并提交至 `dev`；准确提交及远端 CI/Pages 状态以交付回执为准。未部署生产或上传平台，后续渠道提交前按实际入口核对规格。

## 八类资料

| 类别 | 状态 | 当前文件 |
| --- | --- | --- |
| 游戏简介 | 已提供 | [introduction.md](copy/introduction.md)，复核沿用 |
| 推荐语 | 已提供 | [tagline.md](copy/tagline.md)，复核沿用 |
| 开发者的话 | 已提供 | [developer-note.md](copy/developer-note.md)，复核沿用 |
| 图标 | 已提供 | [1024×1024 PNG](icon/icon-1024.png)，复核沿用 |
| 宣传图 | 已提供 | [1920×1080](promo/images/title-1920x1080.png)、[1440×1440](promo/images/title-1440x1440.png)，复核沿用 |
| 宣传视频 | 已提供 | [20 秒 MP4](promo/videos/progression-2026-11-01-1280x720-silent.mp4)，首页/军需/开包记录静帧各3秒、真实战斗7秒、结算静帧4秒 |
| 游戏截图 | 已更新 | [首页](gameplay/screenshots/2026-11-01-progression/01-home.png)、[军需配置](gameplay/screenshots/2026-11-01-progression/02-loadout.png)、[开火](gameplay/screenshots/2026-11-01-progression/03-fire.png)、[战斗](gameplay/screenshots/2026-11-01-progression/04-impact.png)、[结算](gameplay/screenshots/2026-11-01-progression/05-settlement.png) |
| 实机录屏 | 已更新 | [22 秒连续战斗 MP4](gameplay/videos/progression-2026-11-01-1280x720-silent.mp4)，当前浏览器实录，非实体手机采集 |

2026-11-01复核：全部14项清单文件可读取、图片可解码且摘要一致。截图为1280×720、每张小于4 MB；两段视频均为1280×720 H.264、无音轨，完整解码通过，20张宣传片和22张实录逐秒帧已查看。[manifest.json](manifest.json)分别记录采集与复核版本、尺寸、时长和摘要；[剪辑记录](promo/videos/progression-2026-11-01-edit.json)记录当前静帧与战斗段的确切来源。界面测试资产图单独保存在docs，不混入正式媒体。

素材来源和许可见[素材清单](../docs/ASSET_MANIFEST.json)。上一轮资料保留于[历史状态](STATUS-2026-10-30-taptap-login.md)和[历史清单](manifest-2026-10-30-taptap-login.json)。

## 本地联调

Runtime、PostgreSQL、回环网关已启动，FRP API 为 `https://nas.hc2a5c9f0.nyat.app:29549/api/competition/v1`。本次真实游客流程通过 `http://127.0.0.1:43003/api/competition/v1`；本地/FRP健康均为200。游戏测试359/359、Runtime Night规则2/2、原生输入/暂存工具契约35/35、推送fixture回归2/2及类型检查通过。568×320、800×366、844×390触控和1280×720鼠标检查均通过，页面异常0。

运行镜像为 `small-games-bundle:night-1793504767340-85dd`，源码身份 `1efcb7991e55ff3e622c53ec29abc17cfa685a4b`。本次更新本地Runtime的 `start` 操作被自动审批拒绝（`blocked by policy`），没有修改现有服务。真人对手装配摘要需部署包含本次Duel视图的Runtime；旧Runtime缺字段时客户端明确提示不可用，本地机器人双方显示已验证。启动、备份和公开配置位置见[本地说明](../../../../docs/operations/night-overwatch-local-selftest.md)。本次未生成 TapTap ZIP、未上传或提交审核。

## 生产部署

本次没有更新运行中的后端或部署生产。历史生产版本不代表本轮成长军需已经上线；旧版本回执保存在历史状态中。

未验证实体手机、TapTap 真宿主、真实广告库存和原生包。视频奖励目前没有 S2S 验签，仅有受限客户端回调校验。未运行全仓候选门禁，CI/Pages 按最终推送 SHA 独立核对。
