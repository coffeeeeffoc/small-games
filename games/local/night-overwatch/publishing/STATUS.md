# 夜航守望 · 交付状态

更新时间：2026-10-28。Game ID：`night-overwatch`，名称：夜航守望。Creator 3.8.8 Web/mobile 源码身份 `7a7f1c0dd198c6a42c357321bc28de2746e9de201010817bcc80992d0c91d834`，8,796,580字节。本轮隐藏对战记录设置、修复昵称及公共表单的居中／失焦问题，将战况入口调整为小地图下方的半透明按钮。[本轮验证](../docs/verification-2026-10-28-ui-input.md)包含三尺寸真实输入和截图。既有玩法闭环成立，证据见[战术界面与自然获胜验证](../docs/verification-2026-10-28-tactical-ui.md)。目标为Web/mobile交付，当前资料已提供，未上传或提审；下一步核对对应提交的CI/Pages，并进行目标手机软键盘及渠道验收。此前大厅、战绩、重连等功能及服务端证据保留在[功能验证记录](../docs/verification-2026-10-28-lobby.md)。Runtime 与 HTTPS 入口既有实现提交 `55f3df97c35bf5d5a2fff8a43d13f409d48654aa`，本次未部署或修改后端。

## 八类资料

| 类别 | 状态 | 当前文件与核验 |
| --- | --- | --- |
| 游戏简介 | 已提供 | [introduction.md](copy/introduction.md)，本轮复读，既有大厅、榜单、战绩与重连描述仍适用 |
| 推荐语 | 已提供 | [tagline.md](copy/tagline.md)，本轮复读，沿用适用主题 |
| 开发者的话 | 已提供 | [developer-note.md](copy/developer-note.md)，本轮复读，既有玩法说明仍适用 |
| 图标 | 已提供 | [1024×1024 PNG](icon/icon-1024.png)，打开核对完整背景原创图，沿用原文件 |
| 宣传图 | 已提供 | [1920×1080](promo/images/title-1920x1080.png)、[1440×1440](promo/images/title-1440x1440.png)，打开核对仅标题插画，非实机 |
| 宣传视频 | 已提供 | [16秒 H.264 MP4](promo/videos/ui-input-2026-10-28-1280x720-silent.mp4)，首页、战斗、战况与昵称表单，1280×720，无音轨 |
| 游戏截图 | 已提供 | [本轮六张](gameplay/screenshots/2026-10-28-ui-input/01-fire-0.png)，前三张为单人开火／人机对战，后续为昵称、记录和战况；均1280×720、16:9、单张小于4MB |
| 实机录屏 | 已提供 | [19.96秒 H.264 MP4](gameplay/videos/ui-input-2026-10-28-1280x720-silent.mp4)，桌面浏览器连续真实瞄准与开火，首5秒为核心玩法，无额外配音字幕 |

[manifest.json](manifest.json)登记实际尺寸、字节数、SHA-256及源版本；[剪辑记录](promo/videos/ui-input-2026-10-28-edit.json)保留真实录制来源。两条视频完整解码并逐2秒抽帧检查，宣传与实录内容不同。图标、文案和宣传插画继续适用，未改动；旧录屏没有重新标注版本。[上一版清单](manifest-2026-10-28-tactical-ui.json)保留原始身份。本轮测试关闭外部比赛接口，记录页为离线状态，未修改真实账号或公开成绩。

按仓库2026-10-26/27素材规格核对。实体手机、原生宿主、真实广告与渠道上传未验收。无广告S2S receipt，辅助回放验证不等于真实观看证明。

历史资料：[大厅版状态](STATUS-2026-10-28-lobby.md)、[大厅版清单](manifest-2026-10-28-lobby.json)，更早资料见其历史链接。

## 生产部署

[Runtime 回执](../reports/2026-10-28-lobby/backend-receipt.json)、[HTTPS 接口证据](../reports/2026-10-28-lobby/production-evidence.json)。匿名身份、大厅/战绩能力、四类榜、私密六位房号、观战退出、房号加入、连接轮换、旧租约拒绝、两个API前缀和入场前退出无战绩通过；没有制造公开比赛成绩。健康检查200。部署按既有依赖重建了 Kart 容器，沿用原 Kart 镜像；数据库备份已创建，未替换数据库、未迁移表结构，本次未做隔离恢复演练。
