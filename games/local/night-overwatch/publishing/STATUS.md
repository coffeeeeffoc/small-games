# 夜航守望 · 交付状态

更新时间：2026-10-28。Creator 3.8.8 Web/mobile 源码身份 `9d64ae94452964d985d93bf055032dc96d0ccbf9c17e984d0667209802fcfe61`，8,796,065 字节。本轮统一首页、设置、任务、大厅、榜单、战绩、结算与战斗按钮的战术仪表风格；炭灰切角面板、青绿状态色与黄铜主操作替代大面积蓝黄底色。详见[视觉验证记录](../docs/verification-2026-10-28-tactical-ui.md)。此前大厅、战绩、重连等功能及服务端证据保留在[功能验证记录](../docs/verification-2026-10-28-lobby.md)。Runtime 与 HTTPS 入口已部署实现提交 `55f3df97c35bf5d5a2fff8a43d13f409d48654aa`；本次纯 HUD 改动不改变后端。前端是否上线须以对应提交的 CI/Pages 成功记录为准。

## 八类资料

| 类别 | 当前文件与核验 |
| --- | --- |
| 游戏简介 | [introduction.md](copy/introduction.md)，已更新大厅、榜单、战绩与重连规则 |
| 推荐语 | [tagline.md](copy/tagline.md)，沿用适用主题 |
| 开发者的话 | [developer-note.md](copy/developer-note.md)，已更新本轮体验 |
| 图标 | [1024×1024 PNG](icon/icon-1024.png)，沿用原版完整背景原创图 |
| 宣传图 | [1920×1080](promo/images/title-1920x1080.png)、[1440×1440](promo/images/title-1440x1440.png)，沿用标题插画，非实机 |
| 宣传视频 | [16 秒 H.264 MP4](promo/videos/tactical-ui-2026-10-28-1280x720-silent.mp4)，新版首页、战斗、设置与结算，1280×720，无音轨 |
| 游戏截图 | [本轮六张](gameplay/screenshots/2026-10-28-tactical-ui/01-single-fire.png)，包含开火、连续火带、结算、设置、大厅与首页；均1280×720、16:9、单张小于4MB |
| 实机录屏 | [20 秒 H.264 MP4](gameplay/videos/tactical-ui-2026-10-28-1280x720-silent.mp4)，连续真实单人瞄准与开火，首5秒为核心玩法，无额外配音字幕 |

[manifest.json](manifest.json)登记实际尺寸、字节数、SHA-256及源版本；[剪辑记录](promo/videos/tactical-ui-2026-10-28-edit.json)保留真实录制来源。两条视频完整解码并抽帧检查，宣传与实录内容不同。图标、文案和宣传插画继续适用，未改动；旧录屏没有重新标注版本。

按仓库2026-10-26/27素材规格核对。实体手机、原生宿主、真实广告与渠道上传未验收。无广告S2S receipt，辅助回放验证不等于真实观看证明。

历史资料：[大厅版状态](STATUS-2026-10-28-lobby.md)、[大厅版清单](manifest-2026-10-28-lobby.json)，更早资料见其历史链接。

## 生产部署

[Runtime 回执](../reports/2026-10-28-lobby/backend-receipt.json)、[HTTPS 接口证据](../reports/2026-10-28-lobby/production-evidence.json)。匿名身份、大厅/战绩能力、四类榜、私密六位房号、观战退出、房号加入、连接轮换、旧租约拒绝、两个API前缀和入场前退出无战绩通过；没有制造公开比赛成绩。健康检查200。部署按既有依赖重建了 Kart 容器，沿用原 Kart 镜像；数据库备份已创建，未替换数据库、未迁移表结构，本次未做隔离恢复演练。
