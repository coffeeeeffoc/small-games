# 小贼哪里跑 · 上架资料

## 2026-10-27 当前交付

首页、配色和人物更新；Game ID 与版本仍为 `chase-thief` / 0.2.0。当前 Cocos 3.8.8 source-Web 制品 SHA-256：`f5d7029d46d42b3eff8127baff26de57af2db31df2eaaa18b29f946c302f76c8`。玩法、存档及奖励契约保留。

用户要求本轮宣传和录制素材仅保存在本地，不提交 Git。统一交付目录为仓库根目录 `outputs/chase-thief/delivery-2026-10-27/`；下表路径均相对该目录。新克隆不会包含这些文件，旧日期素材保留作历史记录。

| 类别 | 当前状态与位置 |
| --- | --- |
| 游戏简介 | 复用 `publishing/copy/introduction.md`，标题与三街区追逐玩法仍适用 |
| 一句话推荐语 | 复用 `publishing/copy/tagline.md` |
| 开发者的话 | 复用 `publishing/copy/developer-note.md` |
| 游戏图标 | 复用 `publishing/icon/city-chase-icon.png`，不放进宣传图 |
| 宣传图 | `images/chase-thief-landscape-1920x1080.png`，1920×1080 PNG，2,553,523 bytes；`images/chase-thief-square-1440x1440.png`，1440×1440 PNG，2,545,609 bytes，用于竖版实录封面。两图仅含游戏标题，无图标或界面拼贴，蓝衣追逐者、橙衣小贼、骑楼街景、跨栏动作和标题风格一致；最终尺寸由生成原图规范化导出 |
| 宣传视频 | `video/chase-thief-trailer-1280x720.mp4`，1280×720、16:9、30 fps、22 秒，H.264/yuv420p + AAC，16,507,575 bytes；游戏资产重新编排分镜，与实录不同 |
| 实际游戏截图 | `gameplay/home-600x1300.png`、`gameplay/chase-600x1300.png`，普通模式当前制品截图 |
| 实际游戏录屏 | `gameplay/chase-thief-gameplay-600x1300.mp4`，600×1300、6:13、30 fps、37.97 秒，H.264/yuv420p，无声，21,078,206 bytes；Windows Chromium 真实运行和输入，无开发跳段、无敌或计时修改 |

四份成品的尺寸、大小、SHA-256 和 Edge 连续播放结果记录于本地 `media-manifest.json`；两段视频完整解码及抽帧检查通过。`gameplay/recording.json` 和 `browser-report.json` 记录相同游戏制品身份。制作来源见 [ASSETS.md](../assets/ASSETS.md)，代码与消费者验证见[当前验收](../docs/design/endless-city-2026-10-22/verification/README.md)。本次尚未代用户上传新封面或提交审核；未验证物理手机/原生渠道及真实广告库存。

2026-10-27 方版封面更正：用户补充“已上传竖版实录，需额外 1:1 封面”，最低尺寸改为 1440×1440；原 1024×1024 仅保留本地历史文件，不再列为当前合格成品。用内置 imagegen 参考两张原宣传图重绘方图，输出 1254×1254，再经 Lanczos 规范化为 1440×1440；不是原生 1440 像素生成。已打开最终文件检查标题、清晰度、无图标及两种画幅核心视觉一致，并核验 PNG/RGB、1:1 和低于 4 MB。横图及宣传视频继续复用。完整用途、技术规格、内容限制和逐项验收统一维护在[上架资料规范](../../../../docs/game-publishing.md#宣传图)与[宣传片要求](../../../../docs/game-publishing.md#宣传片)，不以本表摘要代替。

## 2026-10-25 历史交付

- Game ID：`chase-thief`；更新：2026-10-25；版本：0.2.0，名称与街区视觉维护版。
- 源码与运行制品身份：[构建清单](../docs/design/endless-city-2026-10-22/verification/build-info.json)，artifact SHA-256：`d2bcba76ff670bddfcc38b81c0fdd553dd1dd6621c882fe2d795a4a030cd8ccc`；浏览器报告和实际录像记录相同制品身份。
- 当前交付：Cocos Engine 3.8.8 source-Web，竖屏浏览器版。开始、三街区选择预览、正常操作、失败结算、保存纪录与重试闭环已验证。
- 当前阶段：基础素材已提供，未上传、未提交审核、未上线。下一步为物理手机和目标渠道验收；基础概念宣传图不等于符合渠道最终物料规格。

| 类别 | 状态 | 当前文件、规格与核验 |
| --- | --- | --- |
| 游戏简介 | 已提供 | [introduction.md](copy/introduction.md)，UTF-8；新名称、三街区特色与无尽追逐玩法，2026-10-25 对照运行核验 |
| 一句话推荐语 | 已提供 | [tagline.md](copy/tagline.md)，UTF-8；“穿街过巷，一路追下去。”，核验后复用 |
| 开发者的话 | 已提供 | [developer-note.md](copy/developer-note.md)，UTF-8；补充街区差异及操作规则稳定的设计选择 |
| 游戏图标 | 已提供 | [city-chase-icon.png](icon/city-chase-icon.png)，1254×1254 PNG；无旧名称，打开核验后复用原 AI 图标 |
| 宣传图 | 已提供 | [三街区概念画板](promo/images/city-chase-concept-board.png)，1199×1312 PNG；内置 imagegen 根据实机参考生成，明确为概念素材，细节不作为实机证据 |
| 宣传视频 | 已提供 | [三街区宣传片](promo/videos/city-chase-promo-390x844.mp4)，390×844 H.264 MP4，24 秒，无声；新实录中三个街区各选 8 秒原速剪辑，加新名称标题；完整解码与抽帧核验 |
| 实际游戏截图 | 已提供 | [首页](gameplay/screenshots/home-390x844.png)、[追逐](gameplay/screenshots/chase-390x844.png)、[选择](gameplay/screenshots/districts-390x844.png)、[结算](gameplay/screenshots/result-390x844.png)、[骑楼街](gameplay/screenshots/district-old-town.png)、[居民巷](gameplay/screenshots/district-alley.png)、[集市](gameplay/screenshots/district-market.png)；均为390×844 PNG，来自当前普通模式 Chromium 生产制品 |
| 实际游戏录屏 | 已提供 | [连续追逐](gameplay/videos/city-chase-390x844.webm)，390×844 VP8 WebM，41.76 秒，无声；普通模式真实输入，无开发跳段，游玩约42秒到650米，耐力3；[环境与终态](gameplay/videos/recording.json) |

八类资料于2026-10-25逐项核验；视频经 ffprobe、完整解码及抽帧检查，图片打开检查，尺寸、字节数与 SHA-256 见 [media-manifest.json](media-manifest.json)。实录环境为 Windows Chromium 156.0.8078.47，不代表物理手机或原生小游戏。素材来源见 [ASSETS.md](../assets/ASSETS.md)，概念生成提示词见[当前方案](../docs/design/endless-city-2026-10-22/plan.md)。

暂停页可完整观看后获得五秒普通碰撞保护，每局一次；只在游玩时递减，沟壑仍须跳跃，辅助局不保存纪录。奖励逻辑未改变，完成、取消、失败、迟到回调与纪录隔离测试通过；本轮没有验证真实广告库存。[奖励设计与验证边界](../docs/design/rewards-2026-10-24.md)。

2026-10-27 广告核对：用户确认 App 1003107（Developer 492506），MCP 已确认广告生效；方向读取失败，未返回可用广告位，当时尚未填写广告位。本次未生成广告开启包；[应用映射与阻塞记录](../../../../docs/operations/taptap-rewarded-ads.md#五款应用核对与-mcp-阻塞2026-10-27)。八类基础资料的本地链接及图像/视频规格已核对，原素材保留；现有截图分辨率、宣传视频或实录规格仍须按目标渠道调整，不表示可直接提审。

2026-10-27重试：MCP仍缺方向，未返回广告位。用户随后在根配置手工填写 1054324，本会话保留该编辑；上次五款批次的结构预检显示广告开启，但该ID尚无本应用本次MCP查询证据，未生成新的广告包或验证真实宿主。
