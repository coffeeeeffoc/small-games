# 夜航守望 · 交付状态

- Game ID：`night-overwatch`；更新时间：2026-10-24。
- 当前源码身份：`681d33ad97da627270bd07dd0f92fe401cda00ed9da0d94e853284ea2565cdcc`（Creator构建sourceHash，工作区未提交）。
- 目标形态：Cocos Creator 3.8.8 Web/mobile本地预览及基础上架资料。
- 基本闭环：已成立。正常首关实际输入5发清除4敌，零友伤，清敌后3.02秒模拟时间完成撤离与结算，可重开；[结果](../reports/2026-10-24-flow/extraction.json)。
- 当前阶段：本地改造、验证及素材整理完成；本轮未上传、提审或发布。
- 下一步：在目标小游戏开发者工具和手机真机复验触控、音频、后台恢复与广告SDK，正式提交前核对渠道规格。

## 八类资料

下列文件于2026-10-24核验；大小、SHA-256、图片尺寸与视频探测结果见[manifest.json](manifest.json)。

| 类别 | 状态 | 文件与规格 | 版本与核验 |
| --- | --- | --- | --- |
| 游戏简介 | 已提供 | [introduction.md](copy/introduction.md) | 已同步地形预览、快速撤离和可选支援 |
| 一句话推荐语 | 已提供 | [tagline.md](copy/tagline.md) | 对应昼夜护送 |
| 开发者的话 | 已提供 | [developer-note.md](copy/developer-note.md) | 对应新手与玩家流程，不暗示已上线 |
| 图标 | 已提供 | [1024×1024 PNG](icon/icon-1024.png) | 复用既有正式图标，已查看并核对尺寸 |
| 宣传图 | 已提供 | [1920×1080](promo/images/title-1920x1080.png)、[1440×1440](promo/images/title-1440x1440.png) | 既有标题插画，非游戏截图 |
| 宣传视频 | 已提供 | [1280×720 MP4，26.12秒](promo/videos/night-overwatch-flow-1280x720-silent.mp4) | 当前实际录屏/截图与标题图剪辑；无音轨；[剪辑记录](promo/videos/flow-edit.json) |
| 游戏内截图 | 已提供 | [首页](gameplay/screenshots/2026-10-24-flow/home-844.png)、[地形选关](gameplay/screenshots/2026-10-24-flow/missions-844.png)、[暂停](gameplay/screenshots/2026-10-24-flow/pause-844.png)、[支援选择](gameplay/screenshots/2026-10-24-flow/supply-choice-844.png)、[白天](gameplay/screenshots/2026-10-24-flow/day-844.png)、[优先目标](gameplay/screenshots/2026-10-24-flow/priority-844.png)、[夜间](gameplay/screenshots/2026-10-24-flow/night-844.png)、[热成像](gameplay/screenshots/2026-10-24-flow/thermal-844.png)、[快速撤离](gameplay/screenshots/2026-10-24-flow/extracting-1280.png)、[护送结算](gameplay/screenshots/2026-10-24-flow/escort-success-1280.png) | 前8张844×390，后2张1280×720；最终同源构建，真实浏览器渲染 |
| 游戏内视频 | 已提供 | [手机地图/支援/昼夜，844×390，36.8秒](gameplay/videos/mobile-support-map-844x390-silent.mp4)、[正常护送完整闭环，1280×720，52.12秒](gameplay/videos/escort-extraction-1280x720-silent.mp4) | 两段独立完整录屏，仅转码，未拼接玩法画面；无音轨 |

## 证据与边界

- [本轮验证记录](../docs/verification-2026-10-24-flow.md)包含构建、规则测试、支援失败/恢复路径、快速撤离和原生暂存审核。浏览器三套报告均核对最终源码哈希，没有直接写入模拟状态。
- 昼夜演示预置关卡解锁进度；支援使用公开广告提供器测试回调与可见性夹具，不能代替真实广告填充、SDK或实体手机验收。正常护送录像无奖励夹具。
- 图标及标题插画来自既有`outputs/six-taptap-submission-20261020/night-overwatch`批次，未改动；旧批次保留原始生成来源。当前3D场景与音频沿用项目来源记录。新[概念图](../docs/design/2026-10-24-support-map.md)与实际截图分开。
- 游戏内中英文电台WAV由本地系统语音合成，Cocos AudioSource播放。录屏没有声音捕获，视频均标注silent，没有后配音冒充同期声。
- 视频均完成完整解码检查，并抽帧查看地图、支援和撤离；截图已查看。原始WebM保留在本地忽略目录`reports/2026-10-24-flow/`。
- [前一轮交付记录](STATUS-2026-10-24-redesign.md)与[前一轮清单](manifest-2026-10-24-redesign.json)记录旧候选`e80ac641…`；其旧媒体仍保留，不作为当前候选截图。本轮当前材料见上表及manifest.json。
- 八类基础资料均已提供。实体手机、目标原生平台和真实广告验收尚未执行；本轮未声称满足所有渠道最新提审规格。
