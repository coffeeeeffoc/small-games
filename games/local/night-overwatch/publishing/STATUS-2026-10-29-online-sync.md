# 夜航守望 · 交付状态

更新：2026-10-29。Game ID：`night-overwatch`。最新修改统一大厅四按钮、移除大厅及记录页右上角关闭图标，并修复 H5 打包自动启用未配置完成的 TapTap 身份造成的联机回归。当前 H5 包沿用游客身份；源码指纹 `16f41c2b2b59e6891161b9a77d17cb24bbfc2ab86bb3f51046ecdedf3b18a5b9`。玩法闭环沿用，Creator 构建、61 项定向测试和三尺寸 ZIP 界面验证通过，详见[当前验证及历史部署记录](../docs/verification-2026-10-29-online-sync.md)。当前阶段为代码与本地修复包交付，未上传提审；下一步为 TapTap H5 宿主及手机验证。

## 八类资料

| 类别 | 状态 | 当前文件 |
| --- | --- | --- |
| 游戏简介 | 已提供 | [introduction.md](copy/introduction.md)，复核沿用 |
| 推荐语 | 已提供 | [tagline.md](copy/tagline.md)，复核沿用 |
| 开发者的话 | 已提供 | [developer-note.md](copy/developer-note.md)，复核沿用 |
| 图标 | 已提供 | [1024×1024 PNG](icon/icon-1024.png)，完整背景原创插画，复核沿用 |
| 宣传图 | 已提供 | [1920×1080](promo/images/title-1920x1080.png)、[1440×1440](promo/images/title-1440x1440.png)，标题插画，复核沿用 |
| 宣传视频 | 已提供 | [16秒 H.264 MP4](promo/videos/modal-fixes-2026-10-28-1280x720-silent.mp4)：沿用上轮实际首页、设置、昵称截图停留与6秒战斗录像，1280×720，无音轨；本轮完整解码通过，未重新录制 |
| 游戏截图 | 已提供 | [上轮菜单](gameplay/screenshots/2026-10-29-online-sync/04-home.png)、[沿用战斗](gameplay/screenshots/2026-10-28-modal-fixes/01-fire.png)：共8张，不含本次变更的大厅／记录页；均1280×720，单张小于4MB，哈希及尺寸复核通过 |
| 实机录屏 | 已提供 | [15秒 H.264 MP4](gameplay/videos/modal-fixes-2026-10-28-1280x720-silent.mp4)：沿用上轮连续鼠标瞄准射击，1280×720，无音轨；本轮完整解码通过，非实体手机采集、未重新录制 |

文件尺寸、时长与SHA256见[manifest.json](manifest.json)，素材来源与许可见[素材清单](../docs/ASSET_MANIFEST.json)。两条视频完整解码及抽帧复核通过，剪辑时间点与源录像摘要见[剪辑记录](promo/videos/modal-fixes-2026-10-28-edit.json)。原始WebM及其余截图保留于本机 `.scratch/night-modal-captures/`，交付MP4已版本化。

排行榜截图来自隔离本地HTTP服务与PostgreSQL，非生产成绩。联机结算截图单独作为QA证据，不混作自然通关录像。应用987511及MiniApp ID `tapmcjgwi2thafs87k`已核实，但服务端Secret尚缺，真实TapTap身份绑定未启用；普通Web继续游客身份。未进行实体手机、原生Creator/官方打包或真实广告验证，未运行全仓候选校验；独立CI/Pages不由本地通过推断。

上一轮交付保存在[历史状态](STATUS-2026-10-28-modal-fixes.md)和[历史清单](manifest-2026-10-28-modal-fixes.json)。
