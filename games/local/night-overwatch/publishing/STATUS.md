# 夜航守望 · 交付状态

2026-11-04 最终试玩修订：所有武器/技能默认底部同线，可逐个拖到安全区四边；布局只在本局临时生效，新局/重开恢复默认。每次打开默认夜景，无人机3架/12秒后坠毁，电磁干扰固定名称/12秒。当前Creator源码摘要`91760bb8b77735e857ea1193dc2f943dbf66b37d5e289735bf5494fb855cce5e`；93项输入/HUD、类型检查、原生源码适配及正式ZIP七场景检查通过。服务器Runtime已部署v14/v7并核对健康/认证边界。[验证与部署回执](../docs/verification-2026-11-04-refinement.md#最终按钮布局与交付)。TapTap应用987511，广告1054323已生效、方向横屏；用户已授权上传提审，当前平台旧版V-20261103-1审核中，最终新包尚未上传。

2026-11-04 原生1080p多武器宣传片：已去掉“浏览器实录”等来源角标，五组战斗镜头重新以1920×1080 Canvas/WebGL缓冲直接采集，未放大720p录像。战斗内容增加到22秒，含速射、榴弹、重炮、燃烧弹和热像；30秒H.264 MP4约25.93 MB。上一版燃向AAC音轨逐字节保留。完整900帧正常速度播放、全片解码、分镜和源尺寸通过。[成片](promo/videos/night-overwatch-ignite-native1080-2026-11-04.mp4)、[源码与来源](promo/videos/native1080-2026-11-04-source/README.md)、[验证证据](promo/videos/night-overwatch-ignite-native1080-2026-11-04-evidence.json)。采用固定稳定制品c3f32a92…，未混入当前在途游戏修改；原生1080p指渲染采集分辨率，非实体手机录制。未上传平台。

2026-11-04 燃向配乐版：沿用当日战术宣传片画面，重做120 BPM原创立体声电子配乐，包含重鼓、失真低音、旋律和转场冲击；23秒后保留高潮，结尾渐出。H.264视频轨道无损复用。成片30秒、1920×1080、约18.83 MB，音轨测量−15.03 LUFS / −1.92 dBTP。[成片与来源](promo/videos/ignite-2026-11-04-source/README.md)、[技术证据](promo/videos/night-overwatch-ignite-2026-11-04-evidence.json)。实录源为720p浏览器画面；未进行人工目标设备听感或平台上传审核。

2026-11-04 宣传片独立更新：新增30秒1080p战术宣传片，用于首页与详情页。含原创合成配乐；10秒战斗取自当天已采集的浏览器实录，其余为品牌动画与三种成像介绍。技术参数、全片解码、分镜画面及完整播放结果见[成片证据](promo/videos/night-overwatch-tactical-2026-11-04-evidence.json)。素材工作未修改游戏逻辑、提交或上传平台。

2026-11-04 操作细化已完成：战况与装配共用弹窗、单行昵称与安全区、横向选关、EXP、武器/技能/开火冷却环及3秒持续激光。最终 Creator 3.8.8 web-mobile 源码摘要为 `c3f32a92a83b06f6421f1f95a4f747e8b8cec02f0270f116dc4aadc7e16fd74a`，规则为 v13/v6。定向规则、输入、原生契约与Runtime消费者通过；三尺寸42张QA图、37张普通首关图和隔离真实服务普通游客菜单通过，页面异常0。见[本轮验证](../docs/verification-2026-11-04-refinement.md)。本轮未提交、推送、部署或打渠道包；新前端与Runtime需配套发布，实体手机/真宿主未验收。以下旧日期内容保留历史身份。

2026-11-03 沉浸 HUD 与成像更新：语音提示、优先标注独立保存，左上“战术 / 友军 / 撤离 / 威胁”同一行，武器和开火使用紧凑透明皮肤。默认夜景，可切换增强、热像，只改变显示。最终 Creator 3.8.8 web-mobile 源码摘要为 `02b287e3ecc7b37c08e123b2e28e7c04906db67295087ceb433ec3d6e2be02f5`。新战斗媒体来自该构建的普通离线首关，Chromium 1280×720，无开发余额/资产fixture；技能QA另存。见[本轮验证](../docs/verification-2026-11-03-immersion.md)。未提交/推送、打渠道包或对外发布；下方旧日期记录保留当时身份。

2026-11-03 生产后端已更新：Runtime 使用 `2fadb94ff0e8159149d02e93b4179b97534024ee`，规则为 v12/v5，聊天迁移及公网入口已上线。单人恢复从创建起最多 24 小时，每小时清理失效回放，保留结算与资产历史；首轮累计精简 1197 局、删除 47271 条动作回执，17 项公网回归通过。[生产验收与版本边界](../../../../docs/operations/backend-server-2026-11-03.md)。本轮未上传渠道包，旧 TapTap H5 包仍须配套更新；下文 2026-11-02 的“未部署生产”为当时记录。

2026-11-03 前端加载更新：首页图片及字体就绪后才显示内容，整个启动过程保留整屏图片；其他页面图片分批预加载，过快进入时显示完整背景加载页，失败可重试。[验证与截图](../docs/verification-2026-11-03-artwork-loading.md)记录当前 Creator 源码摘要、定向测试及四尺寸延迟/失败检查。既有八类资料的19个文件大小与摘要复核一致，保留原采集身份；本轮未更新玩法宣传素材、未打渠道包或上传平台。

更新：2026-11-02。Game ID：`night-overwatch`。17项改版与页面、标签、弹窗动效已按[当前方案和效果图](../docs/design/progression-2026-11-02/README.md)实现。本轮包含统一奖池与等级限制、礼包转盘、仓库和记录滚动、真实来源返回、等级成长、120关梯度、公共文字与房间邀请、双方观战身份。

仓库反馈修订后的 Creator 3.8.8 web-mobile 源码摘要：`98ddd04666a1b788911f9fb517486fa35a6ac3db0cdbec80d3587007cab4e24e`。出售按钮内合并金额，军需同步中/成功改为小图标；仓库正式截图已用真实本地Runtime的普通新游客重采，其余七类资料及未受影响截图沿用清单所记原采集摘要。历史17项改版验证摘要仍为 `bb709842aec7fabeb8508eb399869301a533d9e3657e4cfd99b4966b4468e209`，不能当作本轮重新执行的结果。规则版本为 `night-input-replay-v12` / `night-duel-v5`，新最快榜使用 `night-campaign-v2`，历史榜保留。本地 Docker 后端已更新；旧 TapTap H5 包须重新构建以匹配新回放协议。本轮未生成渠道 ZIP、未上传平台或部署生产。

2026-11-02 局部界面更新：区分威力增益、两连发与双弹道素材，统一军需提示弹窗，并调整幸运转盘的奖品文字、指针和次数布局。既有上架截图和视频仍为本次调整前的素材，尚未重新采集；本次未制作渠道包或上传平台。

## 八类资料

| 类别 | 状态 | 当前文件 |
| --- | --- | --- |
| 游戏简介 | 已提供 | [introduction.md](copy/introduction.md)，同步战况、横向选关、EXP、冷却与激光 |
| 推荐语 | 已提供 | [tagline.md](copy/tagline.md)，复核沿用 |
| 开发者的话 | 已提供 | [developer-note.md](copy/developer-note.md)，同步战况与持续反馈 |
| 图标 | 已提供 | [1024×1024 PNG](icon/icon-1024.png)，复核沿用 |
| 宣传图 | 已提供 | [1920×1080](promo/images/title-1920x1080.png)、[1440×1440](promo/images/title-1440x1440.png)，仅标题，复核沿用 |
| 宣传视频 | 已提供 | [新版UI 20秒静音预览](promo/videos/support-2026-11-04-1280x720-silent.mp4)，1280×720 / H.264 / 约2.18 MB，独立分镜与7秒实录；原有配乐版保留： [原生1080p多武器宣传片](promo/videos/night-overwatch-ignite-native1080-2026-11-04.mp4)，30秒 / 1920×1080 / 16:9 / H.264 MP4 / AAC立体声 / 约25.93 MB；22秒真实多武器战斗，来源角标已移除，上一版燃向配乐完整保留。[源码与验证](promo/videos/native1080-2026-11-04-source/README.md)；旧燃向版、战术版及静音版保留归档 |
| 游戏截图 | 已提供 | 10张1280×720 PNG：[夜景](gameplay/screenshots/2026-11-04-support/night-1280.png)、[增强](gameplay/screenshots/2026-11-04-support/enhanced-1280.png)、[热像](gameplay/screenshots/2026-11-04-support/thermal-1280.png)、[设置](gameplay/screenshots/2026-11-04-support/settings-1280.png)、[战况](gameplay/screenshots/2026-11-04-support/tactics-1280.png)、[装配](gameplay/screenshots/2026-11-04-support/equipment-1280.png)、[首页](gameplay/screenshots/2026-11-04-refinement/home-1280.png)、[等级成长](gameplay/screenshots/2026-11-04-refinement/growth-1280.png)、[开始行动](gameplay/screenshots/2026-11-04-refinement/modes-1280.png)、[横向选关](gameplay/screenshots/2026-11-04-refinement/missions-1280.png) |
| 实机录屏 | 已提供 | [约18秒连续战斗MP4](gameplay/videos/support-2026-11-04-1280x720-silent.mp4)，H.264无音轨，浏览器实录，非实体手机 |

[媒体清单](manifest.json)记录大小、尺寸、摘要及采集身份。6张战斗图和约18秒录屏来自本次构建的普通离线首关；4张菜单图来自隔离真实PostgreSQL/HTTP的普通新游客，无测试资产和开发余额，专属服务已清理。QA激光/技能与长昵称图片单独放在验证文档，不作正式媒体。视频完整解码并检查逐秒画面，实录取连续18秒，排除后续菜单；[最新剪辑记录](promo/videos/support-2026-11-04-edit.json)保留来源与区间。

静态图标、宣传图和推荐语保留原采集身份；历史截图与视频继续归档保留。素材许可见[素材清单](../docs/ASSET_MANIFEST.json)，本轮内置imagegen提示词、效果图和实际对照见[设计目录](../docs/design/refinement-2026-11-04/README.md)。

## 本地联调与验证

本地Runtime已更新为 `small-games-bundle:night-20261102-chat-0227fe76`，对应干净源码提交 `0227fe76b72ff6d11b0b30e3ef3db5085b0f91d6`。升级前备份恢复32张表一致；只追加016聊天迁移，32张既有表指纹保持一致，仅重建Runtime，原PostgreSQL与网关保留。后续最终提交只调整前端单项奖励布局、测试和资料，不改变后端运行源码。

本地API为 `http://127.0.0.1:43003/api/competition/v1`，FRP API为 `https://nas.hc2a5c9f0.nyat.app:29549/api/competition/v1`。本地与FRP健康检查200、未认证游戏请求401、TapTap CORS预检204、认证聊天只读200；[部署证据](../docs/verification-2026-11-02/docker-evidence.json)与[启动说明](../../../../docs/operations/night-overwatch-local-selftest.md)。

最终三尺寸42张界面图与单奖励无多余滚动断言通过；逻辑定稿三尺寸74项交互、隔离真实服务8项聊天/邀请/观战及末关后段渲染通过。规则、资产、聊天、原生工具、迁移消费者和增量发布工具的具体范围、摘要及复用边界见[完整验证记录](../docs/verification-2026-11-02-revision.md)。过程reports已忽略；准确base/head、推送和CI/Pages结果以最终交付回执为准，不声明本地全仓候选门禁通过。

实体手机、TapTap真宿主、真实广告和平台上传尚未验收。奖励广告仍为受限客户端完成回调，没有S2S观看验签；120关纯规则及后段渲染验证不能替代真人后期平衡体验。
