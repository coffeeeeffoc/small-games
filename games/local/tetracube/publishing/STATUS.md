# 空间俄罗斯方块上架资料

- Game ID：tetracube；更新时间：2026-10-31；版本：2.0.0 / Cocos Creator 3.8.8。
- 本轮更名、刚体旋转衔接、观察缓停及圆角方块已同步到实际 Web 构建。Game ID、URL、包名和存档 key 保持不变。
- 当前阶段：TapTap 本地素材准备完成，尚未上传或提交渠道审核。规格依据为仓库[上架资料规范](../../../../docs/game-publishing.md)收录的 2026-10-26/27 用户上传页要求，未重新核验当前账号页面。
- 构建源码摘要：`0e0a4a7b1b409a3ce5b859045d1a17820947a9906a53d2071021c9f95bfb60c7`。尺寸、时长、字节数与 SHA-256 见[媒体清单](media-manifest.json)；实现和验证见[本轮记录](../docs/design/rounded-2026-10-31/README.md)。

| 类别         | 状态   | 本次正式交付                                                                                                                                                                                                                                            |
| ------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 游戏简介     | 已提供 | [introduction.md](copy/introduction.md)，UTF-8，已更名                                                                                                                                                                                                  |
| 一句话推荐语 | 已提供 | [tagline.md](copy/tagline.md)，UTF-8                                                                                                                                                                                                                    |
| 开发者的话   | 已提供 | [developer-note.md](copy/developer-note.md)，UTF-8，已更名                                                                                                                                                                                              |
| 游戏图标     | 已提供 | [icon-1024.png](icon/taptap/icon-1024.png)，1024×1024，RGB 不透明 PNG，约 1.49 MiB；满幅彩色背景，无外框圆角                                                                                                                                            |
| 宣传图       | 已提供 | [横版](promo/images/taptap/cover-landscape-1920x1080.png) 1920×1080、[方图](promo/images/taptap/cover-square-1440x1440.png) 1440×1440，PNG，分别约 2.34 / 2.65 MiB，均小于 4 MB；同一核心构图，只含游戏标题，不嵌图标或实际游戏截图                     |
| 宣传视频     | 已提供 | [trailer-1280x720.mp4](promo/videos/taptap/trailer-1280x720.mp4)，1280×720，16:9，19 秒，H.264 / yuv420p，约 1.82 MiB；封面片头片尾与独立横屏操作录像剪辑                                                                                               |
| 游戏内截图   | 已提供 | [堆叠](gameplay/screenshots/taptap/01-play-720x1280.png)、[自由观察](gameplay/screenshots/taptap/02-observe-720x1280.png)、[翻舱重排](gameplay/screenshots/taptap/03-flipped-720x1280.png)，3 张同规格 720×1280 PNG，9:16；来自实际游戏，完整保留操作区 |
| 实际游戏录屏 | 已提供 | [gameplay-720x1280.mp4](gameplay/videos/taptap/gameplay-720x1280.mp4)，720×1280，9:16，15.28 秒，H.264 / yuv420p，约 1.31 MiB；连续真实操作，开头即为核心玩法，无后加字幕、配音或设备 UI                                                                |

六张正式图片均核验文件头、精确像素、大小并完整解码；两段视频核验容器、编码、像素、时长并完整解码及浏览器播放。截图与录像使用 Windows Chromium 156.0.8078.79 的鼠标／CDP 触控和真实时钟，是实际 Creator Web 游戏画面；并非手机硬件或原生宿主验收。两段视频无音轨，玩法录像与宣传片使用独立的竖／横屏录制。

宣传图与图标由内置 imagegen 生成，四颗相连圆角方块、太空舱及薄荷绿／琥珀色为统一主题。图标原图 1254×1254、横图原图 1672×941、方图原图 1254×1254，以 Lanczos 导出为上述精确交付尺寸；横图与方图含技术放大，未把 AI 宣传插画标成实际游戏截图。原始生成文件保留于 [icon/tetracube.png](icon/tetracube.png) 和 [promo/images/space-tetracube-cover.png](promo/images/space-tetracube-cover.png)。

2026-10-25 的 390×844 图像、WebM 和 11 秒旧宣传片仅留作历史证据，不属于本次 TapTap 交付。请使用本表的 `taptap/` 路径和媒体清单。

H5 可选激励继续复用[公共接入规范](../../../../docs/operations/taptap-rewarded-ads.md)：广告位为空时关闭，免费玩法可用。奖励测试使用显式模拟端口，尚未验收手机真机、原生宿主、真实广告库存或 TapTap 上传结果。
