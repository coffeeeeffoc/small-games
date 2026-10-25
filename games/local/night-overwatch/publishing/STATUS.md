# 夜航守望 · 交付状态

- 更新时间：2026-10-25；当前 Creator 3.8.8 Web/mobile 源码身份：`defe9fc62248366465c553f13da9e0f8836bb2f099faccc651a3d512b68772ef`，8,307,744 字节。
- 已完成玩法闭环及既有首页／设置；本次补齐自动追踪按钮高亮、按钮内倒计时和更大倍率（默认10×、按次1.5倍、右键临时3倍）。旧5×存档自动提升，更高倍率与奖励资格保留。
- 当前为本地实现与浏览器验证；未上传渠道或提审。实体手机、原生目标运行及真实广告仍待验证。

## 八类资料

文件大小、SHA-256、图片尺寸和视频探测见 [manifest.json](manifest.json)。

| 类别 | 状态 | 文件与规格 | 版本与核验 |
| --- | --- | --- | --- |
| 游戏简介 | 已提供 | [introduction.md](copy/introduction.md) | 任务预览、即时设置与手册 |
| 一句话推荐语 | 已提供 | [tagline.md](copy/tagline.md) | 主题保持适用 |
| 开发者的话 | 已提供 | [developer-note.md](copy/developer-note.md) | 独立封面与暂停调整说明 |
| 图标 | 已提供 | [1024×1024 PNG](icon/icon-1024.png) | 沿用原图，摘要一致 |
| 宣传图 | 已提供 | [1920×1080](promo/images/title-1920x1080.png)、[1440×1440](promo/images/title-1440x1440.png) | 既有标题插画，摘要一致，非实机画面 |
| 宣传视频 | 已提供 | [1280×720 MP4，10.44秒](promo/videos/night-overwatch-tracking-zoom-1280x720-silent.mp4) | 3秒既有标题图与本次连续实录；无音轨；[剪辑记录](promo/videos/tracking-zoom-edit.json) |
| 游戏内截图 | 已提供 | [独立首页](gameplay/screenshots/2026-10-25-tracking-zoom/home-844.png)、[追踪高亮](gameplay/screenshots/2026-10-25-tracking-zoom/tracking-844.png)、[最后5秒](gameplay/screenshots/2026-10-25-tracking-zoom/tracking-ending-568.png)、[到期恢复](gameplay/screenshots/2026-10-25-tracking-zoom/tracking-expired-568.png)、[10倍画面](gameplay/screenshots/2026-10-25-tracking-zoom/zoom-after-844.png)、[倍率设置](gameplay/screenshots/2026-10-25-tracking-zoom/zoom-844.png) | 当前构建的实际浏览器画面，另含568小屏、1366桌面、390竖屏容器及临时3倍画面 |
| 游戏内视频 | 已提供 | [844×390 MP4，7.44秒](gameplay/videos/mobile-tracking-zoom-844x390-silent.mp4) | 开局、选择追踪支援、准备恢复、高亮计时、放大及真实开火；连续实际输入录屏，仅转码，无音轨 |

## 证据与边界

[本轮验证](../docs/verification-2026-10-25-compact-hud.md)：256项自动测试、类型检查、Creator构建，四尺寸追踪／倍率／设置、三尺寸输入与广告四种结果及后台／离线资格回归。当前新增截图和两条视频均来自上述源码身份，视频完整解码通过并查看抽帧。原始WebM保留于本地 `reports/2026-10-25-tracking-zoom/`。简介、推荐语、开发者的话、图标与宣传图逐项核对，原摘要一致且内容仍适用。

封面复用项目已有无文字夜航插画 `startup/background.png`；标题与按钮在Cocos内独立绘制。图标和宣传插画沿用原始资产；[概念图](../docs/design/2026-10-25-settings-home-guide.md)不充当实录。浏览器录制未捕获音轨，没有后配音。

历史实录保留原sourceHash并标为historical；[首页／设置版本记录](../docs/verification-2026-10-25-settings.md)、[更早状态](STATUS-2026-10-25-compact-hud.md)和[更早manifest](manifest-2026-10-25-compact-hud.json)仅作为当时证据。广告检查使用公开提供器和生命周期测试边界，不能代表真实库存或手机体验。未声称满足全部渠道最新提审规格。按用户要求提交并推送dev，结果以Git远端为准；未上传渠道或提审，CI／Pages另行确认。
