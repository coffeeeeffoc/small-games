# 夜航守望 · 交付状态

- Game ID：`night-overwatch`；更新时间：2026-10-25。
- 当前 Creator 3.8.8 Web/mobile 源码身份：`36ce939bea942b477c4808f586eb863f1cae59a3ff1bc10b3f9b4a6b0eb35d47`；包体 6,487,033 字节。
- 本轮完成：无底板数值 HUD、统一设置和静音图标、广告提示避让、跳过支援立即恢复、退出确认、点按/拖动瞄准与优先目标定位；山坡增加裸土、贴地草簇和砂石。
- 当前阶段：本地构建、浏览器验证和素材整理；未上传渠道、提审或发布。
- 下一步：在目标手机和小游戏开发者工具复验触控、音频、后台恢复、真实广告及地表绘制性能；原生渠道按新源码重新构建。

## 八类资料

实际文件大小、SHA-256、图片尺寸及视频探测见 [manifest.json](manifest.json)。

| 类别 | 状态 | 文件与规格 | 版本与核验 |
| --- | --- | --- | --- |
| 游戏简介 | 已提供 | [introduction.md](copy/introduction.md) | 同步单点瞄准和统一设置 |
| 一句话推荐语 | 已提供 | [tagline.md](copy/tagline.md) | 昼夜护送主题保持适用 |
| 开发者的话 | 已提供 | [developer-note.md](copy/developer-note.md) | 同步精简界面与地表细节 |
| 图标 | 已提供 | [1024×1024 PNG](icon/icon-1024.png) | 复用既有正式图标，已查看并核对摘要 |
| 宣传图 | 已提供 | [1920×1080](promo/images/title-1920x1080.png)、[1440×1440](promo/images/title-1440x1440.png) | 复用标题插画，非游戏截图；摘要未变 |
| 宣传视频 | 已提供 | [1280×720 MP4，16秒](promo/videos/night-overwatch-compact-hud-1280x720-silent.mp4) | 当前实际操作录屏与既有标题图剪辑；无音轨；[剪辑记录](promo/videos/compact-hud-edit.json) |
| 游戏内截图 | 已提供 | [白天地表](gameplay/screenshots/2026-10-25-compact-hud/day-844.png)、[统一设置](gameplay/screenshots/2026-10-25-compact-hud/settings-844.png)、[静音](gameplay/screenshots/2026-10-25-compact-hud/sound-off-844.png)、[广告中断](gameplay/screenshots/2026-10-25-compact-hud/support-dismissed-844.png)、[退出确认](gameplay/screenshots/2026-10-25-compact-hud/exit-confirm-844.png)、[优先目标](gameplay/screenshots/2026-10-25-compact-hud/priority-844.png)、[夜间](gameplay/screenshots/2026-10-25-compact-hud/night-844.png)、[热像](gameplay/screenshots/2026-10-25-compact-hud/thermal-844.png)、[暂停恢复后结算](gameplay/screenshots/2026-10-25-compact-hud/escort-success-844.png) | 当前构建，844×390 实际浏览器画面；目录另有首页、地图、支援选择及失败/无库存反馈 |
| 游戏内视频 | 已提供 | [844×390 MP4，45.76秒](gameplay/videos/mobile-compact-hud-844x390-silent.mp4) | 当前构建连续实际操作录屏，仅转码，无拼接或加速；无音轨 |

## 证据与边界

- [本轮验证](../docs/verification-2026-10-25-compact-hud.md)：游戏规则、输入、HUD、回放与原生暂存测试；类型检查、Creator 构建；四尺寸界面、触控与旋屏；广告中断/失败/无库存/后台完成/离线资格；桌面缩放与手机双指操作。
- 新截图与视频来自上述 sourceHash，概念图另存 [设计记录](../docs/design/2026-10-24-tactical-ui.md)，不冒充实机画面。广告使用公开提供器测试回调，关卡演示预置本地解锁进度，没有直接写模拟状态。测试不代表真实 SDK 填充或手机体验。
- 图标和标题插画沿用 `outputs/six-taptap-submission-20261020/night-overwatch` 来源；3D 场景沿用项目模型，本轮草石由确定性静态几何生成。语音仍为本地系统合成的中英文 WAV；录屏未捕获音轨，标注 silent，无后配音。
- 两条新视频均完整解码通过，宣传视频已抽帧查看；当前设置、小屏、地表、广告中断和退出截图已查看。原始浏览器 WebM 保留在本地 `reports/2026-10-24-compact-hud/`。
- 历史素材保留原 sourceHash 并在 manifest 标为 historical。[同步撤离验证](../docs/verification-2026-10-24-extraction-sync.md)、[支援/地图资料](STATUS-2026-10-24-flow.md)、[早期资料](STATUS-2026-10-24-redesign.md)继续作为当时版本的证据，不冒充本轮录像。
- 八类基础资料齐备；实体手机、原生目标运行和真实广告仍待验证，未声称满足全部渠道最新提审规格。
