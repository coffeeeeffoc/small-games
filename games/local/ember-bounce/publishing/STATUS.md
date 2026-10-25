# 熔光弹珠 · 上架资料

- Game ID：`ember-bounce`；更新：2026-10-25。
- 当前版本：`gravity-volley-2026-10-25`，关卡内容 schema v1，重力玩法/好友挑战规则 v2；源文件与素材 SHA-256 见 [source-manifest.json](source-manifest.json)。本次提交包含源代码、验证记录及更新后的实际素材；准确候选验证和 dev 推送以 Git 记录为准。
- 交付形态：现有独立 H5 / Shell iframe。素材是通用竖屏基础规格，尚未按具体平台提审规格提交。
- 基本闭环成立：正式构建触屏完成首关 5 轮、强化、成功、下一关；失败与重试也通过。[报告](../docs/design/gravity-volley-2026-10-25/browser-report.json)、[实际结算截图](gameplay/screenshots/result-780x1688.png)。
- 当前阶段：本地改版和八类基础素材已提供；未上传、未提审、未上线。下一步为手机真机手感验收及渠道规格核对。

| 类别 | 状态 | 实际内容与验证 |
| --- | --- | --- |
| 游戏简介 | 已提供 | [introduction.md](copy/introduction.md)，说明已实现重力、力度、8 关、落底回收与同题；2026-10-25 对照运行代码核对。 |
| 一句话推荐语 | 已提供 | [tagline.md](copy/tagline.md)，UTF-8，可直接使用；2026-10-25 核对。 |
| 开发者的话 | 已提供 | [developer-note.md](copy/developer-note.md)，明确素材来源和当前平台边界；2026-10-25 核对。 |
| 游戏图标 | 已提供 | [512×512 PNG](icon/ember-bounce-512.png)、[SVG 源文件](icon/ember-bounce.svg)，从本作现有图标渲染；2026-10-25 浏览器打开、尺寸及哈希核验。 |
| 宣传图 | 已提供 | [1080×1920 竖版海报](promo/images/portrait-1080x1920.png)、[排版源文件](promo/images/portrait-poster.html)，使用本作背景、文案和本次实机截图合成；2026-10-25 目视检查，无参考游戏素材。 |
| 宣传视频 | 已提供 | [540×1168 MP4](promo/videos/gravity-volley-540x1168.mp4)，25 fps、H.264、无音轨；由下列实际录屏缩放并淡入。2026-10-25 ffprobe、完整解码和逐段抽帧检查通过。 |
| 游戏内截图 | 已提供 | [主页](gameplay/screenshots/home-390x844.png)、[瞄准](gameplay/screenshots/aim-390x844.png)、[连弹](gameplay/screenshots/volley-390x844.png)、[落底回收](gameplay/screenshots/recall-390x844.png)：390×844；[减弱动态](gameplay/screenshots/reduced-motion-320x568.png)：320×568；[选关](gameplay/screenshots/levels-780x1688.png)、[成功](gameplay/screenshots/result-780x1688.png)：780×1688。2026-10-25 来自真实页面，已打开核对。 |
| 游戏内录屏 | 已提供 | [390×844 WebM](gameplay/videos/gravity-volley-390x844.webm)，25 fps、无音轨；[录制信息](gameplay/videos/recording.json)。Windows Chromium 140.0.7339.186 手机触屏模拟，正常玩家模式，通过 CDP 触控操作，未注入胜负或位置。完整触屏通关录像另保留于 [设计验证目录](../docs/design/gravity-volley-2026-10-25/mobile-touch-390x844.webm)。 |

录制可复现：先构建并在 `http://127.0.0.1:4418/` 预览，再执行 `node tests/record-gameplay.mjs`；可用 `EMBER_URL` 指定另一正式预览地址。声音由实际游戏运行时合成，本次浏览器录像工具未采集音轨。

旧普通存档保留原布局、分数、球数、强化和解锁；旧挑战链接/挑战续玩需重新开始新版同题。模拟浏览器证据不代表手机真机、原生小游戏、真实广告或渠道审核通过。未迁移 Creator，仍使用本作既有 H5/Canvas 实现。
