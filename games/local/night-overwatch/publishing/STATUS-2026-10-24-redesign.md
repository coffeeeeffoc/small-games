# 夜航守望 · 交付状态

- Game ID：`night-overwatch`；更新时间：2026-10-24。
- 当前源码身份：`e80ac6419ce7d006a9ecdd2bdbc7b28d066cb10656f1bd0d5f77649e11d140b0`（Creator 构建 sourceHash，工作区未提交）。
- 目标形态：Cocos Creator 3.8.8 Web/mobile 本地预览及基础上架资料。
- 基本闭环：已成立。实际浏览器输入以4发清除热身3靶，25.4秒、零友伤，结算并重开；120关另有有限弹药、友军存活的模拟通关验证。[浏览器结果](../reports/2026-10-24-redesign/onboarding.json)。
- 当前阶段：本地改造及素材整理完成；本轮未上传、提审或发布。
- 下一步：在微信/目标小游戏开发者工具与手机真机复验触控、语音、启动和包体；正式提交前按所选渠道核对规格。

## 八类资料

所有下列文件于2026-10-24核验；文件大小、SHA-256、图片尺寸、视频编码和时长见 [manifest.json](manifest.json)。

| 类别 | 状态 | 文件与规格 | 版本与核验 |
| --- | --- | --- | --- |
| 游戏简介 | 已提供 | [introduction.md](copy/introduction.md) | 按本轮实际玩法核对 |
| 一句话推荐语 | 已提供 | [tagline.md](copy/tagline.md) | 对应昼夜护送 |
| 开发者的话 | 已提供 | [developer-note.md](copy/developer-note.md) | 未暗示上线或原生验收 |
| 图标 | 已提供 | [1024×1024 PNG](icon/icon-1024.png) | 复用既有夜航守望正式图标；已查看并核对尺寸 |
| 宣传图 | 已提供 | [1920×1080](promo/images/title-1920x1080.png)、[1440×1440](promo/images/title-1440x1440.png) | 既有标题插画，非游戏截图 |
| 宣传视频 | 已提供 | [1280×720 MP4，21.56秒](promo/videos/night-overwatch-1280x720-silent.mp4) | 本轮实际录像与标题图剪辑；无音轨；[剪辑记录](promo/videos/edit.json) |
| 游戏内截图 | 已提供 | [首页](gameplay/screenshots/home-844.png)、[选关](gameplay/screenshots/missions-844.png)、[暂停](gameplay/screenshots/pause-844.png)、[补给](gameplay/screenshots/supply-choice-844.png)、[白天](gameplay/screenshots/day-844.png)、[优先目标](gameplay/screenshots/priority-844.png)、[夜间](gameplay/screenshots/night-844.png)、[热成像](gameplay/screenshots/thermal-844.png)、[结算](gameplay/screenshots/training-success-1280.png) | 前8张844×390，结算1280×720；同源码构建，真实浏览器渲染 |
| 游戏内视频 | 已提供 | [手机昼夜演示，844×390，36.88秒](gameplay/videos/mobile-day-night-844x390-silent.mp4)；[热身通关，1280×720，27.08秒](gameplay/videos/training-complete-1280x720-silent.mp4) | 独立实际录屏，未经玩法画面拼接；无录音轨；后一段包含4发命中、结算和重开 |

## 验证边界与来源

- [完整验证说明](../docs/verification-2026-10-24.md)记录构建、测试、视口、回归和复核。浏览器使用 Playwright 鼠标/键盘/CDP 触控，仅读取遥测，没有改血、跳时间或写模拟器状态。
- 手机演示预置了关卡解锁存档以展示第6关；补给界面使用完成态广告提供器测试回调。不是实际广告填充、设备广告验收或真实玩家进度证明。正常玩法不依赖该回调。
- 游戏内十段中英文电台音频为本地系统语音合成 WAV，由 Cocos AudioSource 播放。浏览器验证播放、静音与暂停，文件检查确认非静音。录屏工具未捕获声音，因此所有视频明确标注 silent；无后配音冒充同期声。
- 宣传片与实际录屏分别交付。宣传片完成解码检查，并抽帧查看白天目标提示及夜间热成像；截图已查看。概念图位于 [设计目录](../docs/design/2026-10-24-tactical-ui.md)，不作为实机证据。
- 图标和标题插画来自仓库既有 `outputs/six-taptap-submission-20261020/night-overwatch` 批次，本轮按原文件复制；原始生成提示和旧交付保留在该批次。当前3D车辆、飞机与地形素材沿用项目来源记录。
- 原始浏览器视频保留在 `reports/2026-10-24-redesign/` 的本地忽略文件中，正式 MP4 位于本目录。旧交付和回滚资料没有删除。
- 八类基础资料无阻塞；目标平台真机与真实广告验收尚未执行。本轮没有声称符合所有渠道最新提审规格。
