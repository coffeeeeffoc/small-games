# 夜航守望 · 交付状态

更新：2026-10-29。Game ID：`night-overwatch`。本轮修复联机结算、房间成员/准备/退出同步、排行语义与分页，以及广告返回焦点和红标；接入可保留原游客ID的TapTap官方身份链路。三角色只读复核后，由主会话统一实现及验证。Creator构建、三尺寸双端交互、12种广告恢复路径及相关规则/接口验证通过，详见[本轮验证及部署记录](../docs/verification-2026-10-29-online-sync.md)。未上传渠道或提审。

## 八类资料

| 类别 | 状态 | 当前文件 |
| --- | --- | --- |
| 游戏简介 | 已提供、复核沿用 | [introduction.md](copy/introduction.md) |
| 推荐语 | 已提供、复核沿用 | [tagline.md](copy/tagline.md) |
| 开发者的话 | 已提供、复核沿用 | [developer-note.md](copy/developer-note.md) |
| 图标 | 已提供、复核沿用 | [1024×1024 PNG](icon/icon-1024.png)，完整背景原创插画 |
| 宣传图 | 已提供、复核沿用 | [1920×1080](promo/images/title-1920x1080.png)、[1440×1440](promo/images/title-1440x1440.png)，标题插画 |
| 宣传视频 | 沿用上轮实景剪辑 | [16秒 H.264 MP4](promo/videos/modal-fixes-2026-10-28-1280x720-silent.mp4)：实际首页、设置、昵称截图停留与6秒战斗录像，1280×720，无音轨；非本轮重新录制 |
| 游戏截图 | 更新5张菜单，沿用3张战斗 | [本轮菜单](gameplay/screenshots/2026-10-29-online-sync/04-home.png)、[沿用战斗](gameplay/screenshots/2026-10-28-modal-fixes/01-fire.png)：共8张，逐项见清单；均1280×720，单张小于4MB |
| 实机录屏 | 沿用上轮浏览器战斗 | [15秒 H.264 MP4](gameplay/videos/modal-fixes-2026-10-28-1280x720-silent.mp4)：连续鼠标瞄准射击，1280×720，无音轨；非实体手机采集、非本轮重新录制 |

文件尺寸、时长与SHA256见[manifest.json](manifest.json)，素材来源与许可见[素材清单](../docs/ASSET_MANIFEST.json)。两条视频完整解码及抽帧复核通过，剪辑时间点与源录像摘要见[剪辑记录](promo/videos/modal-fixes-2026-10-28-edit.json)。原始WebM及其余截图保留于本机 `.scratch/night-modal-captures/`，交付MP4已版本化。

排行榜截图来自隔离本地HTTP服务与PostgreSQL，非生产成绩。联机结算截图单独作为QA证据，不混作自然通关录像。应用987511及MiniApp ID `tapmcjgwi2thafs87k`已核实，但服务端Secret尚缺，真实TapTap身份绑定未启用；普通Web继续游客身份。未进行实体手机、原生Creator/官方打包或真实广告验证，未运行全仓候选校验；独立CI/Pages不由本地通过推断。

上一轮交付保存在[历史状态](STATUS-2026-10-28-modal-fixes.md)和[历史清单](manifest-2026-10-28-modal-fixes.json)。
