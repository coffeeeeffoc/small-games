# 《夺城令》上架资料状态

- 游戏：`tianxia-chalu` / 夺城令（原名天下岔路）。
- 更新日期：2026-10-28。
- 对应版本：Creator 3.8.8 `web-mobile`，源码指纹 `bcae28758ed2c77051020fef14e788d99251cf46ca968efffa59dbad9908468b`；[构建身份](verification/continuous-orders/build-info.json)。
- 目标形态：手机 Web / H5 基础素材。实际采集为桌面 Chromium 的手机视口及触屏模拟。
- 基本闭环：已成立。自然胜负、重试与解锁及本轮改动的证据见[分轮验收记录](../docs/design/continuous-orders/verification.md)。
- 当前上架阶段：素材已整理；未上传平台后台、提交审核或更新线上对局服务。
- 下一步：选择渠道后适配专用宣传图/视频规格，并完成对应实体手机、广告 SDK 和平台验收。

## 必需资料

本轮截图和视频均采集自上述真实 Creator 构建，无时钟、随机数、战局、经验或广告夹具；[采集报告](verification/continuous-orders/capture-report.json)与[规格/哈希清单](verification/continuous-orders/media.json)。图片逐张打开核验，视频经 ffprobe 及完整解码检查。

| 类别         | 状态   | 文件与规格                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 验证方法                                                                       |
| ------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 游戏简介     | 已提供 | [introduction.md](copy/introduction.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 对照持续军令、地图缩放和匹配功能复核                                           |
| 一句话推荐语 | 已提供 | [tagline.md](copy/tagline.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 保留与当前玩法一致的文案                                                       |
| 开发者的话   | 已提供 | [developer-note.md](copy/developer-note.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 说明离线练兵与独立匹配服务                                                     |
| 图标         | 已提供 | [完整背景方图](icon/duochengling-opaque.png)，1254×1254 RGB PNG                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 图像生成后目视核验；无透明通道，无预切圆角；运行时 favicon 保留                |
| 宣传图       | 已提供 | [H5 首页基础预览](promo/images/continuous-orders/home-810x1752.png)，810×1752 PNG                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 实际首页截图；作为基础预览，不作为 TapTap 专用插画封面                         |
| 宣传视频     | 已提供 | [H5 实玩预览](promo/videos/continuous-orders/duochengling-preview-540x1168.mp4)，540×1168、24 秒、H.264、无音轨                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 实际录屏第 6 秒起截取，未生成或伪造玩法；完整解码通过；不是 TapTap 16:9 宣传片 |
| 游戏内截图   | 已提供 | [多目标军令](gameplay/screenshots/continuous-orders/multi-route-810x1752.png)、[地图总览](gameplay/screenshots/continuous-orders/map-810x1752.png)、[城池细节](gameplay/screenshots/continuous-orders/city-810x1752.png)、[单线撤销](gameplay/screenshots/continuous-orders/cancel-route-810x1752.png)、[投降确认](gameplay/screenshots/continuous-orders/return-confirm-810x1752.png)、[战绩](gameplay/screenshots/continuous-orders/records-810x1752.png)、[首页](gameplay/screenshots/continuous-orders/home-810x1752.png)、[山河图](gameplay/screenshots/continuous-orders/levels-810x1752.png)，均 810×1752 PNG | 实际触屏画面，DPR 1.5；无暂停按钮，逐名小兵与军令可见；每张小于 4 MB           |
| 游戏内视频   | 已提供 | [完整实际操作](gameplay/videos/continuous-orders/duochengling-540x1168.mp4)，540×1168、50.76 秒、H.264、无音轨                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 正常时钟与随机布阵，真实拖拽、缩放切换、撤线和退出；完整解码通过               |

本轮是 H5 基础素材交付，未宣称上述基础宣传图/竖版预览满足 TapTap 专用封面或横版宣传片规范。原历史媒体与报告保留，当前交互以 `continuous-orders/` 为准。真人匹配的两浏览器对局与经验结算另有[服务验证](verification/continuous-orders/server-browser-report.json)，实际素材录制没有伪造匹配人数。

## 2026-10-22 历史检查记录

- [素材采集报告](capture-report.json)：Chromium 140.0.7339.186，正常时钟和随机数，无战局、库存或广告夹具。读取只读战局快照选择军令，再通过真实触屏坐标操作；没有注入胜负或兵力。
- 游戏浏览器 11 组检查通过，服务浏览器 8 项检查通过，无页面错误。自动测试使用可控时钟、固定种子及部分广告／库存夹具，报告明确标注；这些测试不冒充真实 SDK 广告。素材录屏不使用这些夹具。
- 逐项核对文案、截图和视频画面；视频经 ffmpeg 解码、ffprobe 检查编码、尺寸及时长，文件 SHA-256 见媒体清单。宣传图复用真实首页截图，宣传视频为实际视频的基础截取版。
- 历史 `docs/design/` 中的旧名资料和截图保持原样；旧称解释见[更名说明](../docs/name-change-2026-10-22.md)。本次未把旧图片改造成新版本证明。
- 本轮基础素材无阻塞。未宣称满足任何渠道的专用规格；未验证实体手机、微信／抖音等原生小游戏包或真实渠道广告；未操作平台后台、软著、凭据或权限。

## 2026-10-24 H5 激励接线

已接入统一 H5 构建的可选奖励端口；广告位为空时保持关闭，免费玩法可用。本轮奖励位置、配置与验证边界见[通用接入表](../../../../docs/operations/taptap-rewarded-ads.md#十三款可选激励接入2026-10-24)。现有八类素材保留；本次不代表平台广告开通、库存或真机验收完成。

## 2026-10-25 直接军令交互验证

- [真实构建](https://github.com/coffeeeeffoc/small-games/actions/runs/40205255520/job/121205199375)已通过 Creator 3.8.8 匹配制品、类型和规则检查；下载后校验 ZIP SHA-256 及当前源码指纹。未改写旧制品身份。
- [本轮采集报告](verification/direct-orders-capture.json)无时钟、随机数、战局或广告夹具，记录实际派兵、占城和接力；[权威服务浏览器报告](verification/direct-orders-server-browser.json)9 项通过、无页面异常，含延迟军令回执时继续操作另一城。
- 本地开发回归覆盖 13 组游戏流程，使用真实 Creator 渲染器和当前宿主脚本；该开发覆盖验证与生产匹配制品验证分别记录，不混称。最终合并候选仍运行仓库 `validate:candidate`，准确 base/head 以交付日志为准。
- 八类资料均有实际内容，原有图标、简介以外的两份文案与本轮功能兼容。历史录像保留；新的军令操作以本轮目录为准。
- 本轮为桌面 Chromium 手机触屏模拟，未做实体手机／原生渠道验证，未提交平台审核。方案及回归说明见[交互修复记录](../docs/design/direct-orders-2026-10-25.md)。
