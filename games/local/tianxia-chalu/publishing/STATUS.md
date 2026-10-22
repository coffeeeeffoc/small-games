# 《夺城令》上架资料状态

- 游戏：`tianxia-chalu` / 夺城令
- 更新日期：2026-10-22
- 对应版本：Cocos Creator 3.8.8 `web-mobile`，源码指纹 `86de06a489c21eb1751241bd0336996bfc4e6e924ba33107790cf641cd6ed675`；[构建身份](verification/build-info.json)。
- 目标形态：手机 Web / H5 基础素材，桌面 Chromium 的手机视口及触屏模拟。
- 基本闭环：已成立。进入关卡、触屏军令、自然胜负、奖励、重试和解锁由[游戏浏览器报告](verification/browser-report.json)验证；[服务入口报告](verification/server-browser-report.json)验证权威 HTTP 对局入口。
- 当前上架阶段：仅整理素材，未上传平台后台或提交审核。
- 下一步：正式选择渠道后适配其素材规格，并进行对应真机、广告 SDK 和提审验收。

## 必需资料

下列资料均对应上述源码指纹，2026-10-22 完成核验。

| 类别 | 状态 | 文件与规格 | 验证方法 |
| --- | --- | --- | --- |
| 游戏简介 | 已提供 | [introduction.md](copy/introduction.md)，中文 Markdown | 对照当前关卡、军令和卡牌功能阅读复核 |
| 一句话推荐语 | 已提供 | [tagline.md](copy/tagline.md)，中文 Markdown | 名称和核心操作复核 |
| 开发者的话 | 已提供 | [developer-note.md](copy/developer-note.md)，中文 Markdown | 核对已实现范围和交付平台 |
| 图标 | 已提供 | [duochengling.svg](icon/duochengling.svg)，48×48 viewBox，透明圆角外缘 | 复用当前运行时 favicon，SVG 源码与原文件一致，无旧产品名 |
| 宣传图 | 已提供 | [首页基础宣传图](promo/images/duochengling-home-390x844.png)，390×844 PNG | 新构建首页实际截图，目视核验新标题；未添加概念场景 |
| 宣传视频 | 已提供 | [24 秒预览](promo/videos/duochengling-preview-390x844.mp4)，390×844、H.264、无音轨 | 从下方真实录屏截取前 24 秒，解码及画面抽帧核验 |
| 游戏内截图 | 已提供 | [320 首页](gameplay/screenshots/home-320x844.png)、[390 首页](gameplay/screenshots/home-390x844.png)、[山河图](gameplay/screenshots/levels-390x844.png)、[对局](gameplay/screenshots/battle-390x844.png)，PNG | 实际浏览器截图；320/390 宽度标题不溢出，对局显示真实军队与攻城 |
| 游戏内视频 | 已提供 | [实际操作录屏](gameplay/videos/duochengling-gameplay-390x844.webm)，390×844、VP8、无音轨；时长及散列见[媒体清单](media-manifest.json) | 正常时钟与随机数，真实触屏操作，31 次军令及两次夺城；完整解码与抽帧核验 |

## 本次检查记录

- [素材采集报告](capture-report.json)：Chromium 140.0.7339.186，正常时钟和随机数，无战局、库存或广告夹具。读取只读战局快照选择军令，再通过真实触屏坐标操作；没有注入胜负或兵力。
- 游戏浏览器 11 组检查通过，服务浏览器 8 项检查通过，无页面错误。自动测试使用可控时钟、固定种子及部分广告／库存夹具，报告明确标注；这些测试不冒充真实 SDK 广告。素材录屏不使用这些夹具。
- 逐项核对文案、截图和视频画面；视频经 ffmpeg 解码、ffprobe 检查编码、尺寸及时长，文件 SHA-256 见媒体清单。宣传图复用真实首页截图，宣传视频为实际视频的基础截取版。
- 历史 `docs/design/` 中的旧名资料和截图保持原样；旧称解释见[更名说明](../docs/name-change-2026-10-22.md)。本次未把旧图片改造成新版本证明。
- 本轮基础素材无阻塞。未宣称满足任何渠道的专用规格；未验证实体手机、微信／抖音等原生小游戏包或真实渠道广告；未操作平台后台、软著、凭据或权限。
