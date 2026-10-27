# 夜航守望 · 交付状态

更新时间：2026-10-27。现役 Creator 3.8.8 Web/mobile 源码身份 `42e8d6ca394a60cdc9a267aa4c7a7bca111339011e6e8d1dfcf0514be9842ba3`。已实现四武器、火区封路、轻车巡逻比例、战况表、个人用时、逐关排行榜和好友／匹配对战。代码已推送dev，CI／Pages通过，云后端和代理已部署并验证健康与读取接口；夜航仍待管理员开放发布，生产完整对局及渠道上传尚未验收。

本次截图和视频的录制源码身份保持 `81fcef6ad4597f0226928251154cf319d4d142b113dbf1d11b65f3547502bad3`（8,383,584 字节），不改标为现役制品。

## 八类资料

| 类别 | 状态 | 实际文件与核验 |
| --- | --- | --- |
| 游戏简介 | 已提供 | [introduction.md](copy/introduction.md)，已更新武器、战况、120关及联机条件 |
| 一句话推荐语 | 已提供 | [tagline.md](copy/tagline.md)，沿用适用主题 |
| 开发者的话 | 已提供 | [developer-note.md](copy/developer-note.md)，已更新封路、用时与公平对战 |
| 图标 | 已提供 | [1024×1024 PNG](icon/icon-1024.png)，复核既有原创图，非透明背景、无预制圆角 |
| 宣传图 | 已提供 | [1920×1080](promo/images/title-1920x1080.png)、[1440×1440](promo/images/title-1440x1440.png)，既有标题插画，非实机截图 |
| 宣传视频 | 已提供 | [1280×720 H.264 MP4，15.97秒](promo/videos/combat-online-1280x720-silent.mp4)，标题、好友准备室、燃烧封路与战况；[剪辑记录](promo/videos/combat-online-edit.json) |
| 游戏内截图 | 已提供 | [护送开火](gameplay/screenshots/2026-10-27-combat-online/01-escort-fire.png)、[燃烧区域](gameplay/screenshots/2026-10-27-combat-online/02-duel-incendiary.png)、[战况表](gameplay/screenshots/2026-10-27-combat-online/03-duel-report.png)、[好友房](gameplay/screenshots/2026-10-27-combat-online/04-friend-room.png)、[个人最佳](gameplay/screenshots/2026-10-27-combat-online/05-personal-best.png)、[关卡榜](gameplay/screenshots/2026-10-27-combat-online/06-level-ranking.png)；6张均1280×720、16:9、单张小于4MB，玩法排在首位 |
| 游戏内视频 | 已提供 | [1280×720 H.264 MP4，34.97秒](gameplay/videos/combat-online-1280x720-silent.mp4)，连续真实瞄准与开火；前5秒已进入核心玩法，全段保持战斗，无追加字幕或配音 |

## 核验与环境

[本轮验证记录](../docs/verification-2026-10-27-combat-online.md)。本次6张截图与两条视频全部来自上述录制源码身份；两条视频已完整解码并检查首段、战斗中段与后段抽帧。宣传片展示双人对战与封路，实机录像展示单人护送，内容不同。录屏源位于本地 `reports/2026-10-27-live-online/source-1280x720.webm`，没有录入音轨，没有后加配音。浏览器以真实输入操作，未改写模拟状态、比分、弹药或时间。

[manifest.json](manifest.json)登记尺寸、字节数、SHA-256、编码、时长、复用来源和截图顺序。规格按仓库2026-10-26用户提供的TapTap上传页要求核对，正式提审仍需在实际账号和入口复核。概念图仅在设计目录，未作为实录。

云端003／014迁移、Runtime/Kart/Management及HTTPS代理已交付，详见[生产证据](../reports/2026-10-27-production/evidence.json)。两个API前缀的匿名身份、120个关卡榜读取、匹配鉴权与CORS已实测。当前 publication=0、夜航 disabled；管理员需先发布包含三个既有来源的公共配置，再将夜航发布为“开放”。生产好友／匹配完整对局仍待开放后验证；实体手机、原生渠道运行及真实奖励广告尚未验收，空对空射击未实现。

历史版本保存在 [旧状态](STATUS-2026-10-25-tracking-zoom.md) 与 [旧清单](manifest-2026-10-25-tracking-zoom.json)，旧录屏和旧摘要不作为本轮证据。
