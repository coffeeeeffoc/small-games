# 夜航守望 · 交付状态

更新时间：2026-10-28。Game ID：`night-overwatch`，名称：夜航守望。Creator 3.8.8 Web/mobile 源码身份 `6c7dadbd1f7e1f6978b97827aa090a47ab17b2bed7e11b5982b1aef539993c3d`，13,486,752字节。目标为Web/mobile交付，本轮实现实际面板/按钮/徽章素材，重排主次控件，修复拖出取消、分页续取与结算缩屏重叠；[当前设计](../docs/design/interface.md)统一维护，旧灰盒提示已更新。闭环经正常瞄准与射击击败本地机器人验证，结算与返回通过，详见[本轮验证](../docs/verification-interface.md)。资料已提供，未上传或提审；下一步检查对应提交的CI/Pages与目标手机。此轮未部署后端，既有联网证据保留在[功能验证](../docs/verification-2026-10-28-lobby.md)。

## 八类资料

| 类别 | 状态 | 当前文件与核验 |
| --- | --- | --- |
| 游戏简介 | 已提供 | [introduction.md](copy/introduction.md)，复读后继续适用，玩法契约未变 |
| 推荐语 | 已提供 | [tagline.md](copy/tagline.md)，复读后沿用 |
| 开发者的话 | 已提供 | [developer-note.md](copy/developer-note.md)，复读后沿用，既有结算及大厅描述适用 |
| 图标 | 已提供 | [1024×1024 PNG](icon/icon-1024.png)，已打开核对完整背景原创插画，沿用原文件 |
| 宣传图 | 已提供 | [1920×1080](promo/images/title-1920x1080.png)、[1440×1440](promo/images/title-1440x1440.png)，已打开核对仅标题插画；不是实机截图 |
| 宣传视频 | 已提供 | [16秒 H.264 MP4](promo/videos/interface-2026-10-28-1280x720-silent.mp4)，首页、战斗、设置与结算剪辑（真实截图停留与6秒战斗录像），1280×720，无音轨 |
| 游戏截图 | 已提供 | [本轮八张](gameplay/screenshots/interface-2026-10-28/01-fire.png)，前三张单人开火/人机对战，随后首页、设置、大厅、任务与自然结算；均1280×720、16:9、单张小于4MB |
| 实机录屏 | 已提供 | [19.96秒 H.264 MP4](gameplay/videos/interface-2026-10-28-1280x720-silent.mp4)，桌面浏览器连续真实瞄准与射击，首5秒为核心玩法，无额外配音字幕 |

[manifest.json](manifest.json)登记文件尺寸、字节数、SHA-256及源版本；[剪辑记录](promo/videos/interface-2026-10-28-edit.json)记录源录制和分镜。两条视频完整解码并每2秒抽帧检查，宣传片与连续实录内容不同。图标、文案与宣传插画继续适用，原文件未变。上一轮[状态](STATUS-2026-10-28-ui-input.md)及[清单](manifest-2026-10-28-ui-input.json)保留旧身份，未重标旧截图或录屏。

所有本轮浏览器测试隔离外部比赛接口；大厅/记录展示真实离线状态，人机练习不计公开积分。依仓库2026-10-26/27资料规格核对。实体手机、原生宿主、真实广告与渠道上传未验收；新增UI纹理约4.68MB，目标渠道仍需核对包体和真机加载。不以浏览器模拟代替这些验收。

## 生产部署

[Runtime 回执](../reports/2026-10-28-lobby/backend-receipt.json)、[HTTPS 接口证据](../reports/2026-10-28-lobby/production-evidence.json)。匿名身份、大厅/战绩能力、四类榜、私密六位房号、观战退出、房号加入、连接轮换、旧租约拒绝、两个API前缀和入场前退出无战绩通过；没有制造公开比赛成绩。健康检查200。部署按既有依赖重建了 Kart 容器，沿用原 Kart 镜像；数据库备份已创建，未替换数据库、未迁移表结构，本次未做隔离恢复演练。
