# 夜航守望 · 交付状态

更新时间：2026-10-28。Creator 3.8.8 Web/mobile 源码身份 `0fb79e080bcfaa230d935525a2e31ce046990cfc155d02ecc21fa6eaab1dfaf2`，8,794,703 字节。本轮实现房间大厅、昵称修改、四类排行榜、真人战绩、30 秒重连与离开结算、连续火带、联机呈现平滑、取消限时、分享全屏和入场/结算动画。详见[验证记录](../docs/verification-2026-10-28-lobby.md)。提交、推送和生产部署结果将在完成后补充，旧版本上线记录不代替本轮验收。

## 八类资料

| 类别 | 当前文件与核验 |
| --- | --- |
| 游戏简介 | [introduction.md](copy/introduction.md)，已更新大厅、榜单、战绩与重连规则 |
| 推荐语 | [tagline.md](copy/tagline.md)，沿用适用主题 |
| 开发者的话 | [developer-note.md](copy/developer-note.md)，已更新本轮体验 |
| 图标 | [1024×1024 PNG](icon/icon-1024.png)，沿用原版完整背景原创图 |
| 宣传图 | [1920×1080](promo/images/title-1920x1080.png)、[1440×1440](promo/images/title-1440x1440.png)，沿用标题插画，非实机 |
| 宣传视频 | [16 秒 H.264 MP4](promo/videos/lobby-2026-10-28-1280x720-silent.mp4)，首页、房号与真人战斗，1280×720，无音轨 |
| 游戏截图 | [本轮六张](gameplay/screenshots/2026-10-28-lobby/01-single-fire.png)，包含开火、连续火带、房间、战绩、离线提示与首页；均1280×720、16:9、单张小于4MB |
| 实机录屏 | [19.28 秒 H.264 MP4](gameplay/videos/lobby-2026-10-28-1280x720-silent.mp4)，连续真实单人瞄准与开火，首5秒为核心玩法，无额外配音字幕 |

[manifest.json](manifest.json)登记实际尺寸、字节数、SHA-256及源版本；[剪辑记录](promo/videos/lobby-2026-10-28-edit.json)保留真实录制来源。两条视频完整解码并抽帧检查，宣传与实录内容不同。图标和宣传插画未改动，旧录屏没有重新标注版本。

按仓库2026-10-26/27素材规格核对。实体手机、原生宿主、真实广告与渠道上传未验收。无广告S2S receipt，辅助回放验证不等于真实观看证明。

历史资料：[旧状态](STATUS-2026-10-27-combat-online.md)、[旧清单](manifest-2026-10-27-combat-online.json)。
