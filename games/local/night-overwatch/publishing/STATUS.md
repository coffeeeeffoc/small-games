# 夜航守望 · 交付状态

- 更新时间：2026-10-25；当前 Creator 3.8.8 Web/mobile 源码身份：`61333bb1e524ec16e40cc9d7ab2643de9d447246f5953b5227a0421d10579b0c`，8,307,249 字节。
- 已完成独立首页、单独选关与场景预览、分组设置、即时画面反馈、分层飞行手册及统一弹窗。
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
| 宣传视频 | 已提供 | [1280×720 MP4，16秒](promo/videos/night-overwatch-settings-1280x720-silent.mp4) | 既有标题图与本次实际操作片段；无音轨；[剪辑记录](promo/videos/settings-edit.json) |
| 游戏内截图 | 已提供 | [独立首页](gameplay/screenshots/2026-10-25-settings/home-844.png)、[高地选择预览](gameplay/screenshots/2026-10-25-settings/selected-highland-844.png)、[飞行手册](gameplay/screenshots/2026-10-25-settings/guide-basic-844.png)、[设置](gameplay/screenshots/2026-10-25-settings/settings-844.png)、[即时高度](gameplay/screenshots/2026-10-25-settings/altitudeUp-844.png)、[热像](gameplay/screenshots/2026-10-25-settings/thermal-844.png)、[退出确认](gameplay/screenshots/2026-10-25-settings/exit-844.png) | 当前构建的实际浏览器画面，另含568小屏、1366桌面、390竖屏容器及英文手册 |
| 游戏内视频 | 已提供 | [844×390 MP4，30.04秒](gameplay/videos/mobile-settings-844x390-silent.mp4) | 选关、真实开火、即时设置、手册和恢复；连续实际操作录屏，仅转码，无音轨 |

## 证据与边界

[本轮验证](../docs/verification-2026-10-25-settings.md)：256项自动测试、类型检查、Creator构建、四尺寸设置与手册、选择预览、输入及支援回归。截图和两条视频均来自上述源码身份，视频完整解码通过并查看抽帧。原始WebM保留于本地 `reports/2026-10-25-settings/menu/`。

封面复用项目已有无文字夜航插画 `startup/background.png`；标题与按钮在Cocos内独立绘制。图标和宣传插画沿用原始资产；[概念图](../docs/design/2026-10-25-settings-home-guide.md)不充当实录。浏览器录制未捕获音轨，没有后配音。

历史实录保留原sourceHash并标为historical；[上一轮状态](STATUS-2026-10-25-compact-hud.md)和[上一轮manifest](manifest-2026-10-25-compact-hud.json)仅作为当时证据。广告检查使用公开提供器和生命周期测试边界，不能代表真实库存或手机体验。未声称满足全部渠道最新提审规格。
