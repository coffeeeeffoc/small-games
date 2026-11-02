# 夜航守望 · 交付状态

2026-11-03 前端加载更新：首页图片及字体就绪后才显示内容，整个启动过程保留整屏图片；其他页面图片分批预加载，过快进入时显示完整背景加载页，失败可重试。[验证与截图](../docs/verification-2026-11-03-artwork-loading.md)记录当前 Creator 源码摘要、定向测试及四尺寸延迟/失败检查。既有八类资料的19个文件大小与摘要复核一致，保留原采集身份；本轮未更新玩法宣传素材、未打渠道包或上传平台。

更新：2026-11-02。Game ID：`night-overwatch`。17项改版与页面、标签、弹窗动效已按[当前方案和效果图](../docs/design/progression-2026-11-02/README.md)实现。本轮包含统一奖池与等级限制、礼包转盘、仓库和记录滚动、真实来源返回、等级成长、120关梯度、公共文字与房间邀请、双方观战身份。

仓库反馈修订后的 Creator 3.8.8 web-mobile 源码摘要：`98ddd04666a1b788911f9fb517486fa35a6ac3db0cdbec80d3587007cab4e24e`。出售按钮内合并金额，军需同步中/成功改为小图标；仓库正式截图已用真实本地Runtime的普通新游客重采，其余七类资料及未受影响截图沿用清单所记原采集摘要。历史17项改版验证摘要仍为 `bb709842aec7fabeb8508eb399869301a533d9e3657e4cfd99b4966b4468e209`，不能当作本轮重新执行的结果。规则版本为 `night-input-replay-v12` / `night-duel-v5`，新最快榜使用 `night-campaign-v2`，历史榜保留。本地 Docker 后端已更新；旧 TapTap H5 包须重新构建以匹配新回放协议。本轮未生成渠道 ZIP、未上传平台或部署生产。

2026-11-02 局部界面更新：区分威力增益、两连发与双弹道素材，统一军需提示弹窗，并调整幸运转盘的奖品文字、指针和次数布局。既有上架截图和视频仍为本次调整前的素材，尚未重新采集；本次未制作渠道包或上传平台。

## 八类资料

| 类别 | 状态 | 当前文件 |
| --- | --- | --- |
| 游戏简介 | 已更新 | [introduction.md](copy/introduction.md) |
| 推荐语 | 复核沿用 | [tagline.md](copy/tagline.md) |
| 开发者的话 | 已更新 | [developer-note.md](copy/developer-note.md) |
| 图标 | 复核沿用 | [1024×1024 PNG](icon/icon-1024.png) |
| 宣传图 | 复核沿用 | [1920×1080](promo/images/title-1920x1080.png)、[1440×1440](promo/images/title-1440x1440.png) |
| 宣传视频 | 已更新 | [21.13 秒 MP4](promo/videos/revision-2026-11-02-1280x720-silent.mp4)，首页、礼包静帧，实际开箱动画、战斗和结算 |
| 游戏截图 | 已更新 | [首页](gameplay/screenshots/2026-11-02-revision/01-home.png)、[礼包·抽奖](gameplay/screenshots/2026-11-02-revision/02-supply.png)、[奖励](gameplay/screenshots/2026-11-02-revision/03-rewards.png)、[仓库](gameplay/screenshots/2026-11-02-revision/04-warehouse.png)、[记录](gameplay/screenshots/2026-11-02-revision/05-history.png)、[成长](gameplay/screenshots/2026-11-02-revision/06-growth.png)、[技能](gameplay/screenshots/2026-11-02-revision/07-skills.png)、[作战配置](gameplay/screenshots/2026-11-02-revision/08-loadout.png)、[战斗](gameplay/screenshots/2026-11-02-revision/09-combat.png)、[结算](gameplay/screenshots/2026-11-02-revision/10-settlement.png) |
| 实机录屏 | 已更新 | [22 秒连续战斗 MP4](gameplay/videos/revision-2026-11-02-1280x720-silent.mp4)，浏览器实录，非实体手机 |

[19项清单](manifest.json)记录尺寸、大小、SHA-256、采集与复核源码摘要；静态品牌图保留原采集来源。10张新截图及两段完整视频解码通过，逐秒视频画面已查看。新截图均为1280×720，两段视频为H.264、无音轨；[剪辑记录](promo/videos/revision-2026-11-02-edit.json)保留来源和时间区间。素材许可见[素材清单](../docs/ASSET_MANIFEST.json)。

当前截图、开箱和战斗视频来自真实本地Runtime下的普通新游客，没有使用开发余额或资产fixture。欢迎邮件、签到、开包、购买、保存配装、正式单人通关、单场资格只扣一次、180金币/120经验到账和刷新保留均通过，页面异常0；[普通游客证据](../docs/verification-2026-11-02/ordinary-guest-evidence.json)。独立QA的高等级、批量物资和特殊状态图单列在docs，不混入正式媒体。

## 本地联调与验证

本地Runtime已更新为 `small-games-bundle:night-20261102-chat-0227fe76`，对应干净源码提交 `0227fe76b72ff6d11b0b30e3ef3db5085b0f91d6`。升级前备份恢复32张表一致；只追加016聊天迁移，32张既有表指纹保持一致，仅重建Runtime，原PostgreSQL与网关保留。后续最终提交只调整前端单项奖励布局、测试和资料，不改变后端运行源码。

本地API为 `http://127.0.0.1:43003/api/competition/v1`，FRP API为 `https://nas.hc2a5c9f0.nyat.app:29549/api/competition/v1`。本地与FRP健康检查200、未认证游戏请求401、TapTap CORS预检204、认证聊天只读200；[部署证据](../docs/verification-2026-11-02/docker-evidence.json)与[启动说明](../../../../docs/operations/night-overwatch-local-selftest.md)。

最终三尺寸42张界面图与单奖励无多余滚动断言通过；逻辑定稿三尺寸74项交互、隔离真实服务8项聊天/邀请/观战及末关后段渲染通过。规则、资产、聊天、原生工具、迁移消费者和增量发布工具的具体范围、摘要及复用边界见[完整验证记录](../docs/verification-2026-11-02-revision.md)。过程reports已忽略；准确base/head、推送和CI/Pages结果以最终交付回执为准，不声明本地全仓候选门禁通过。

实体手机、TapTap真宿主、真实广告和平台上传尚未验收。奖励广告仍为受限客户端完成回调，没有S2S观看验签；120关纯规则及后段渲染验证不能替代真人后期平衡体验。
