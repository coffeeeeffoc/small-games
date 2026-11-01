# 夜航守望 · 交付状态

2026-11-01 多连发/多弹道平衡更新：每轮只耗1发弹药和一份热量，主弹100%沿原准星发射；单增益增加1枚60%副弹（160%），双增益增加3枚60%副弹（280%）。副弹分散覆盖，燃烧副火区持续15秒，主火区25秒。当前 Creator 3.8.8 web-mobile 源码摘要为 `a09671387758fd45f3ad3483486a09ab161391d913ff13d836fa0be71f7f0804`；[规则与实际运行证据](../docs/verification-2026-11-01-progression.md#单次消耗与主副弹预算)。当前规则版本为 `night-input-replay-v11` / `night-duel-v5`；本次不部署本地或生产Runtime，在线服务须同步后端，旧后端会拒绝新版本单人验分开局。

本次复核沿用八类资料：14项文件大小和摘要一致，8张PNG及两段视频完整解码通过，图标/宣传图/截图已查看。保留原采集摘要；现有媒体展示一般玩法和单发，不用于证明本次散布效果。散布测试使用的资产fixture仅属于独立QA证据。

2026-11-01 三轮交互审查完成：翻页选择、改装拖动交换/目标高亮、跨方案草稿、确认返回/长按、交易确认与断网保存退出均已优化。[审查与最终候选证据](../docs/interaction-audit-2026-11-01.md)记录三尺寸65项、四尺寸战斗回归、真实双端和88项定向测试；交互验收构建及后续摘要工具修复分别记录。

2026-11-01 军需交互修复：插槽选中、类型筛选、纵向列表、卸载/拖拽替换、显式保存、礼包详情/一键开包、战斗实时装配对照及金币显示已接通。完整功能和视觉证据见[本轮记录](../docs/verification-2026-11-01-progression.md#军需交互与战斗装配修复)。

同日三档打包已接入金币/经验及自由选关工具，测试/正式包锁定关闭开发入口；历史验证见[构建验证](../docs/verification-2026-11-01-build-profiles.md)。开发工具不进入本次正式媒体。

更新：2026-11-01。Game ID：`night-overwatch`。已按 `358b1fe0` 的方案和九张效果图实现成长、金币军需、商店礼包、任务签到、邮件仓库、个人配装及结算。对照和验证见[本轮记录](../docs/verification-2026-11-01-progression.md)。

上一轮 Creator 3.8.8 web-mobile 源码摘要：`7ad4ecae1d9c3b14cc6826291e10ed3d6c718ed4aa850bafe70717fe6f771e3d`。相较交互验收构建 `1995f8a2640fc6242a1baff303dd8f352d4e3aa065d000aca20c5660e60be088`，仅修复字体许可证的跨平台摘要换行归一化，游戏运行源码与资源未变；重新构建、制品匹配、9项契约及800×366触屏冒烟通过。5张截图与两段视频从交互验收构建、真实本地 Runtime 普通新游客采集，本次复核沿用并保留原采集摘要；正式媒体未使用开发金币或余额/奖励 fixture。欢迎邮件、签到、开包、购买、确定保存、正式单人通关、单场资格仅扣一次、180金币/120经验到账和重载保留已通过。[普通游客回执](../docs/interaction-audit-2026-11-01/live-evidence.json)。

当前阶段：本地修复与资料更新已完成；准确提交、推送及远端 CI/Pages 状态以最终交付回执为准。未部署生产或上传平台，后续渠道提交前按实际入口核对规格。

## 八类资料

| 类别 | 状态 | 当前文件 |
| --- | --- | --- |
| 游戏简介 | 已提供 | [introduction.md](copy/introduction.md)，复核沿用 |
| 推荐语 | 已提供 | [tagline.md](copy/tagline.md)，复核沿用 |
| 开发者的话 | 已提供 | [developer-note.md](copy/developer-note.md)，复核沿用 |
| 图标 | 已提供 | [1024×1024 PNG](icon/icon-1024.png)，复核沿用 |
| 宣传图 | 已提供 | [1920×1080](promo/images/title-1920x1080.png)、[1440×1440](promo/images/title-1440x1440.png)，复核沿用 |
| 宣传视频 | 已提供 | [20 秒 MP4](promo/videos/progression-2026-11-01-1280x720-silent.mp4)，首页/军需/开包记录静帧各3秒、真实战斗7秒、结算静帧4秒 |
| 游戏截图 | 已提供 | [首页](gameplay/screenshots/2026-11-01-progression/01-home.png)、[军需配置](gameplay/screenshots/2026-11-01-progression/02-loadout.png)、[开火](gameplay/screenshots/2026-11-01-progression/03-fire.png)、[战斗](gameplay/screenshots/2026-11-01-progression/04-impact.png)、[结算](gameplay/screenshots/2026-11-01-progression/05-settlement.png) |
| 实机录屏 | 已提供 | [22 秒连续战斗 MP4](gameplay/videos/progression-2026-11-01-1280x720-silent.mp4)，当前浏览器实录，非实体手机采集 |

2026-11-01复核：全部14项清单文件可读取、图片可解码且摘要一致。截图为1280×720、每张小于4 MB；两段视频均为1280×720 H.264、无音轨，完整解码通过，20张宣传片和22张实录逐秒帧已查看。[manifest.json](manifest.json)分别记录采集与复核版本、尺寸、时长和摘要；[剪辑记录](promo/videos/progression-2026-11-01-edit.json)记录当前静帧与战斗段的确切来源。界面测试资产图单独保存在docs，不混入正式媒体。

素材来源和许可见[素材清单](../docs/ASSET_MANIFEST.json)。上一轮资料保留于[历史状态](STATUS-2026-10-30-taptap-login.md)和[历史清单](manifest-2026-10-30-taptap-login.json)。

## 本地联调

Runtime、PostgreSQL、回环网关已启动，FRP API 为 `https://nas.hc2a5c9f0.nyat.app:29549/api/competition/v1`。本次真实游客流程通过 `http://127.0.0.1:43003/api/competition/v1`。前轮已验证本地/FRP健康200、游戏测试359/359、Runtime Night规则2/2和推送fixture回归2/2；本轮按实际影响增量复跑游戏88/88、原生输入/暂存工具契约35/35、类型检查和真实Creator构建。568×320、800×366、844×390触控和1280×720鼠标检查均通过，页面异常0。

用户继续授权后，本地Runtime已升级为 `small-games-bundle:night-1793508637129-5b62`，源码基点 `312e39a39b9871cfa4ec0723c258ca13612c20f0`；430个制品摘要和7个Night核心源码匹配已核对，升级前备份恢复32张表一致。两个真实服务游客在1280×720鼠标及800×366触控端验证双方装配、四发扣弹、EMP生效/冷却和激光切换实时显示，页面异常0。该测试仅给新QA游客通过开发API增加金币，未修改已有用户，无机器人或资产fixture；[验收与制品证据](../docs/verification-2026-11-01-progression.md#本地runtime更新与真实双端装配验收)。启动、备份和公开配置位置见[本地说明](../../../../docs/operations/night-overwatch-local-selftest.md)。本次未生成 TapTap ZIP、未上传或提交审核。

## 生产部署

本次只升级本地联调后端，没有部署生产。历史生产版本不代表本轮成长军需已经上线；旧版本回执保存在历史状态中。

未验证实体手机、TapTap 真宿主、真实广告库存和原生包。视频奖励目前没有 S2S 验签，仅有受限客户端回调校验。未运行全仓候选门禁，CI/Pages 按最终推送 SHA 独立核对。
