# 空间俄罗斯方块上架资料

- Game ID：tetracube；更新时间：2026-10-31；版本：2.0.0 / Cocos Creator 3.8.8。
- 本轮交付：独立首页、18 个递进挑战、经典积分、密合小倒角方块、逐层检查、跟手观察、缩放和平移、可选激励入口及排行榜客户端/回放规则。Game ID、URL 和旧经典存档保持兼容。
- 阶段：本地素材准备完成，未上传或提交渠道审核。规格采用仓库[上架资料规范](../../../../docs/game-publishing.md)收录的 2026-10-26/27 用户上传页要求，未重新核验当前账号入口。
- 源码摘要：`f41b255b80ef9c342a0e29d18241f4d5c7aab9507714dd52c17624be5d2181a6`。精确尺寸、大小、时长与 SHA-256 见[媒体清单](media-manifest.json)，玩法验证见[本轮记录](../docs/design/clarity-2026-10-31/verification.md)。

| 类别 | 状态 | 正式交付 |
| --- | --- | --- |
| 游戏简介 | 已提供 | [introduction.md](copy/introduction.md) |
| 一句话推荐语 | 已提供 | [tagline.md](copy/tagline.md) |
| 开发者的话 | 已提供 | [developer-note.md](copy/developer-note.md) |
| 游戏图标 | 已提供 | [icon-1024.png](icon/taptap/icon-1024.png)，1024×1024、RGB 不透明 PNG，满幅深蓝背景、无外框圆角 |
| 宣传图 | 已提供 | [横图](promo/images/taptap/cover-landscape-1920x1080.png) 1920×1080；[方图](promo/images/taptap/cover-square-1440x1440.png) 1440×1440；均为 PNG、小于 4 MB、仅游戏标题，核心视觉一致 |
| 宣传视频 | 已提供 | [trailer-1280x720.mp4](promo/videos/taptap/trailer-1280x720.mp4)，1280×720、16:9、22.2 秒、H.264 / yuv420p；封面片头片尾与独立横屏选关、通关、缩放及层面检查剪辑 |
| 游戏内截图 | 已提供 | [堆叠](gameplay/screenshots/taptap/01-play-720x1280.png)、[自由观察](gameplay/screenshots/taptap/02-observe-720x1280.png)、[层面检查](gameplay/screenshots/taptap/03-layer-720x1280.png)，3 张同规格 720×1280 PNG，均小于 4 MB，全部为新版实际游戏 |
| 实际游戏录屏 | 已提供 | [gameplay-720x1280.mp4](gameplay/videos/taptap/gameplay-720x1280.mp4)，720×1280、9:16、19.96 秒、H.264 / yuv420p；连续真实操作，开头即进入核心玩法，无后加字幕、配音或设备 UI |

六张正式图片核验文件头、像素、透明性、大小与完整解码；两段视频核验编码、时长、像素、完整解码及浏览器播放。录制环境为 Windows Chromium 156.0.8078.79、真实时钟、鼠标/CDP 触控，不代表物理手机或原生宿主验收。两段视频无音轨，玩法录像和宣传片使用独立竖/横屏录制。

图标与宣传图通过内置 imagegen 生成，主题为紧密相连的轻倒角四连方块、空间格网、薄荷绿落点和暖金层面。最终提示词约束为：深蓝低噪空间、准确四连块、真实空间堆叠与落点、只含完整游戏名；横/方图核心元素一致，不嵌 App 图标。图标原图 1254×1254、横图 1672×941、方图 1254×1254，经 Lanczos 导出精确像素；横/方图含技术放大。宣传插画没有标作实录。生成原图见 [图标](icon/tetracube.png)、[横图](promo/images/space-tetracube-cover.png)、[方图](promo/images/space-tetracube-square.png)。

以本表 `taptap/` 文件为当前交付，旧设计记录及旧 WebM/宣传片仅作历史证据。正式提审前需要在对应 TapTap 账号和 H5/原生入口重新核对要求并实际上传。

激励接入复用[公共端口](../../../../docs/operations/taptap-rewarded-ads.md)：未配置广告位时可继续基础玩法，只有 completed 发奖励，辅助局不入公平排行。控制目录、远端服务启用和线上榜单验收状态以本轮验证记录为准；不得将本地回放与模拟广告通过等同于线上服务或真实库存通过。

历史兼容保留：`gameplay/screenshots/taptap/03-flipped-720x1280.png` 是上轮旧画面，未列入本轮 media-manifest，不能随本表三张新版截图上传。
