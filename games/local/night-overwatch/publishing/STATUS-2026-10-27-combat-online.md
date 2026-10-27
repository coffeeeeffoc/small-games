# 夜航守望 · 交付状态

更新时间：2026-10-27。现役 Creator 3.8.8 Web/mobile 源码身份 `42e8d6ca394a60cdc9a267aa4c7a7bca111339011e6e8d1dfcf0514be9842ba3`。已实现四武器、火区封路、轻车巡逻比例、战况表、个人用时、逐关排行榜和好友／匹配对战。代码已推送dev，CI／Pages通过，云后端和代理已部署并验证健康与读取接口；夜航已开放，生产HTTPS好友／匹配流程及机器人完整结算已通过；生产浏览器双端交互、真机及渠道上传尚未验收。

本次截图和视频的录制源码身份保持 `81fcef6ad4597f0226928251154cf319d4d142b113dbf1d11b65f3547502bad3`（8,383,584 字节），不改标为现役制品。

同日广告恢复修复：看完广告领取支援或解锁倍率后立即恢复战斗，去掉恢复倒计时导致的敌方红标短暂隐藏。此次源码身份为 `7db4730f8b3a0a53903b9d1df66cee1d768dc5964aa0d61515c2d6b88f3eb7cb`；云环境291项游戏测试通过，覆盖首帧标记绘制、四类支援与前后台回调顺序。此环境缺少 Creator 3.8.8、引擎声明及匹配预构建，构建、引擎类型检查、实际浏览器与真实广告验收未完成，不能将上述既有CI／Pages结果视为本修复的验证。八类现有资料继续沿用原录制身份；14个清单文件已核对，三份文案按录制时的CRLF字节核对，未重录或重新标注旧素材。

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

云端003／014迁移、Runtime/Kart/Management及HTTPS代理已交付，详见[生产证据](../reports/2026-10-27-production/evidence.json)。两个API前缀的匿名身份、120个关卡榜读取、匹配鉴权与CORS已实测。管理员已完成两次发布，当前 publication=2、夜航 enabled。两个前缀的三个既有来源预检204、未知来源403；生产好友准备、双方各8单位、实际燃烧弹、幂等扣弹、越权／非法补给拒绝、真人配对、8秒机器人回退及完整机器人胜负结算通过。测试仅用有效API和服务器真实时间，未写入生产排行榜成绩。生产浏览器双端交互、排行榜成绩提交、实体手机、原生渠道运行及真实奖励广告尚未验收，空对空射击未实现。

历史版本保存在 [旧状态](STATUS-2026-10-25-tracking-zoom.md) 与 [旧清单](manifest-2026-10-25-tracking-zoom.json)，旧录屏和旧摘要不作为本轮证据。
