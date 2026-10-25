# 星轨弹珠上架基础资料

- 游戏：ball-roguelite / 星轨弹珠
- 更新时间：2026-10-25（Asia/Shanghai）
- 当前版本：orbit-v4 重力落珠，触底即回收；准确源码 SHA-256 与素材摘要见 [gravity-media-manifest.json](gravity-media-manifest.json)。
- 目标形态：竖屏 Web/H5；截图为 390×844 CSS 视口、DPR 2 的 780×1688 PNG；视频为 390×844。不是原生小游戏真机资料。
- 基本闭环：成立。浏览器触屏模拟自然完成第一星域并解锁下一关，另覆盖无尽发射、碰撞、暂停、回收、下一轮、失败和重试；见 [浏览器记录](../docs/design/gravity-drop/actual/browser-report.json)。
- 上架阶段：基础素材已提供，未上传、提审或发布。下一步为用户试玩反馈和目标渠道真机验收。

## 八类资料

以下均在 2026-10-25 核对。录像来自实际生产构建的 Chromium 手机触屏模拟，无音轨。普通发布录像没有改造棋盘或使用测试存档，操作轨迹见 [gravity-capture-report.json](gravity-capture-report.json)。

| 类别 | 状态 | 实际内容、规格和验证 |
| --- | --- | --- |
| 游戏简介 | 已提供 | [introduction.md](copy/introduction.md)：顶部发射、力度、重力、八关/无尽与回收，逐项对照实现 |
| 一句话推荐语 | 已提供 | [tagline.md](copy/tagline.md)：对应重力夹缝连弹 |
| 开发者的话 | 已提供 | [developer-note.md](copy/developer-note.md)：本次交互改造和真实验证边界 |
| 图标 | 已提供 | [orbit.svg](icon/orbit.svg)，64×64 viewBox；沿用现有品牌，与 favicon.svg 字节一致 |
| 宣传图 | 已提供 | [gravity-home-780x1688.png](promo/images/gravity-home-780x1688.png)，实际新版首页；已核画面与 PNG 尺寸 |
| 宣传视频 | 已提供 | [gravity-drop-390x844.mp4](promo/videos/gravity-drop-390x844.mp4)，390×844、H.264；实际无尽录像转码，ffprobe 与完整解码通过 |
| 游戏内截图 | 已提供 | [首页](gameplay/screenshots/gravity-home-780x1688.png)、[选关](gameplay/screenshots/gravity-levels-780x1688.png)、[瞄准力度](gameplay/screenshots/gravity-aim-780x1688.png)、[无尽](gameplay/screenshots/gravity-endless-780x1688.png)、[飞行](gameplay/screenshots/gravity-flight-780x1688.png)、[暂停](gameplay/screenshots/gravity-paused-780x1688.png)、[回收](gameplay/screenshots/gravity-recall-780x1688.png)、[下一轮](gameplay/screenshots/gravity-next-turn-780x1688.png)；均为 780×1688、真实 Cocos 场景绘制 |
| 游戏内录像 | 已提供 | [gravity-drop-390x844.webm](gameplay/videos/gravity-drop-390x844.webm)，390×844、VP8；真实触屏与正常新开的无尽对局，完整解码通过 |

## 版本与验收说明

- 2026-10-23 的 orbit/endless 命名素材及旧 media-manifest.json 保留为历史批次；当前交付以本表的 gravity 文件及新指纹清单为准。
- 概念图不充当正常关卡宣传证据；中间诊断截图保留在忽略的 outputs 目录。
- 八类基础资料无阻塞。真实手机、原生小游戏、真实广告 SDK、账号与库存未验收；浏览器 fixture 的 completed 回调仅验证游戏奖励接线。
- 存档与新规则兼容，旧规则中途存档不产生新规则可比较的同种子成绩；dev 提交/推送与 CI 状态以交付记录为准；未上传渠道或提审。
