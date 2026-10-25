# 《夺城令》上架资料状态

- 游戏：`tianxia-chalu` / 夺城令
- 更新日期：2026-10-25
- 对应版本：Cocos Creator 3.8.8 `web-mobile`，源码指纹 `47b6bdb1657b842d42cc0606dba8d72b092720fa4aadd036400fa808070c43f9`；[构建身份](verification/direct-orders-build-info.json)。
- 目标形态：手机 Web / H5 基础素材，桌面 Chromium 的手机视口及触屏模拟。
- 基本闭环：已成立。历史[游戏浏览器报告](verification/browser-report.json)保留自然胜负、奖励、重试和解锁证据；本轮[实际采集](verification/direct-orders-capture.json)验证新军令操作，[服务入口报告](verification/direct-orders-server-browser.json)验证权威 HTTP 对局入口。
- 当前上架阶段：仅整理素材，未上传平台后台或提交审核。
- 下一步：正式选择渠道后适配其素材规格，并进行对应真机、广告 SDK 和提审验收。

## 必需资料

本轮交互素材于 2026-10-25 重新采集，来自上述匹配源码的真实 Creator 构建；文案和图标复核后复用。旧版本媒体及其原始验证记录保留。

| 类别         | 状态   | 文件与规格                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 验证方法                                                                               |
| ------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 游戏简介     | 已提供 | [introduction.md](copy/introduction.md)，中文 Markdown                                                                                                                                                                                                                                                                                                                                                                                                                                     | 对照当前关卡、军令和卡牌功能阅读复核                                                   |
| 一句话推荐语 | 已提供 | [tagline.md](copy/tagline.md)，中文 Markdown                                                                                                                                                                                                                                                                                                                                                                                                                                               | 名称和核心操作复核                                                                     |
| 开发者的话   | 已提供 | [developer-note.md](copy/developer-note.md)，中文 Markdown                                                                                                                                                                                                                                                                                                                                                                                                                                 | 核对已实现范围和交付平台                                                               |
| 图标         | 已提供 | [duochengling.svg](icon/duochengling.svg)，48×48 viewBox，透明圆角外缘                                                                                                                                                                                                                                                                                                                                                                                                                     | 复用当前运行时 favicon，SVG 源码与原文件一致，无旧产品名                               |
| 宣传图       | 已提供 | [首页基础宣传图](promo/images/direct-orders-2026-10-25/duochengling-home-390x844.png)，390×844 PNG                                                                                                                                                                                                                                                                                                                                                                                         | 新构建首页实际截图，目视核验新标题；未添加概念场景                                     |
| 宣传视频     | 已提供 | [24.00 秒预览](promo/videos/direct-orders-2026-10-25/duochengling-preview-390x844.mp4)，390×844、H.264、无音轨                                                                                                                                                                                                                                                                                                                                                                             | 下方真实录屏的 H.264 基础版，完整解码核验                                              |
| 游戏内截图   | 已提供 | [首页](gameplay/screenshots/direct-orders-2026-10-25/home-390x844.png)、[山河图](gameplay/screenshots/direct-orders-2026-10-25/levels-390x844.png)、[选城](gameplay/screenshots/direct-orders-2026-10-25/selected-city-390x844.png)、[接力补给](gameplay/screenshots/direct-orders-2026-10-25/battle-390x844.png)、[拖拽](gameplay/screenshots/direct-orders-2026-10-25/drag-orders-390x844.png)、[屯兵](gameplay/screenshots/direct-orders-2026-10-25/hold-city-390x844.png)，390×844 PNG | 实际触屏画面，无派兵按钮；目视核验选中反馈、兵线与布局                                 |
| 游戏内视频   | 已提供 | [实际操作录屏](gameplay/videos/direct-orders-2026-10-25/duochengling-gameplay-390x844.webm)，24.32 秒，390×844、VP8、无音轨；[本轮媒体清单](verification/direct-orders-media.json)                                                                                                                                                                                                                                                                                                         | 正常时钟与随机数，实际点击、占城接力、拖拽、双击和点兵线，8 次军令、1 次夺城；完整解码 |

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
