# 追贼别撞墙 · 上架资料

- Game ID：`chase-thief`
- 更新：2026-10-22；版本：0.2.0，基线 dev `cbee0202b8cd6ea3f5dd626851a10e6dd602dd75` 后的当前工作区。
- 源码与运行制品身份：[构建清单](../docs/design/endless-city-2026-10-22/verification/build-info.json)，实际录像另记录同一 artifact SHA。
- 当前交付：Cocos Engine 3.8.8 source-Web，竖屏浏览器版。基本闭环成立：开始、正常操作、失败结算、保存纪录与重试已验证。
- 当前阶段：基础素材已提供，未上传、未提交审核、未上线。下一步为物理手机和具体渠道构建验收，再按目标平台规格适配素材。

| 类别         | 状态   | 当前文件、规格与核验                                                                                                                                                                                                                          |
| ------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 游戏简介     | 已提供 | [introduction.md](copy/introduction.md)，UTF-8；描述当前无尽规则，2026-10-22 对照运行核验                                                                                                                                                     |
| 一句话推荐语 | 已提供 | [tagline.md](copy/tagline.md)，UTF-8；“穿街过巷，一路追下去。”                                                                                                                                                                                |
| 开发者的话   | 已提供 | [developer-note.md](copy/developer-note.md)，UTF-8；玩法动机及 AI/Blender 素材说明                                                                                                                                                            |
| 游戏图标     | 已提供 | [city-chase-icon.png](icon/city-chase-icon.png)，1254×1254 PNG，AI 生成；已打开核验，运行加载页使用同源图标                                                                                                                                   |
| 宣传图       | 已提供 | [概念宣传画板](promo/images/city-chase-concept-board.png)，1702×924 PNG；明确为四屏概念宣传素材，细节不代表实机，已打开核验                                                                                                                   |
| 宣传视频     | 已提供 | [城市追逐宣传片](promo/videos/city-chase-promo-390x844.mp4)，390×844 H.264 MP4，24 秒、无声；由实际录像剪辑加标题，已解码并检查抽帧                                                                                                           |
| 实际游戏截图 | 已提供 | [首页](gameplay/screenshots/home-390x844.png)、[追逐](gameplay/screenshots/chase-390x844.png)、[出发点](gameplay/screenshots/districts-390x844.png)、[结算](gameplay/screenshots/result-390x844.png)，390×844 PNG；来自实际 Chromium 生产制品 |
| 实际游戏录屏 | 已提供 | [实际追逐](gameplay/videos/city-chase-390x844.webm)，390×844 VP8 WebM，约 42 秒、无声；普通模式真实输入，无开发跳段。[录制环境与终态](gameplay/videos/recording.json)；2026-10-22 ffprobe/完整解码/抽帧核验                                   |

素材来源见 [ASSETS.md](../assets/ASSETS.md)。实际录屏及截图是 Linux Chromium 浏览器采集，不是原生小游戏、Creator 编辑器或物理手机录制。宣传片与原始实机录像分别保存，概念图单独标识。文件尺寸、字节数及 SHA-256 见 [media-manifest.json](media-manifest.json)。
