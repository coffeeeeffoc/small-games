# 夜航守望 · 交付状态

- Game ID：`night-overwatch`；更新时间：2026-10-24。
- 当前素材对应源码身份：`b5b66e9d3f678aa1ec2032b75d8490257c72e85df3444a1a34d5a09d7e45deba`（采集时的Creator构建sourceHash）；Web/mobile包体6,491,320字节。
- 目标形态：Cocos Creator 3.8.8 Web/mobile本地预览及基础上架资料。
- 基本闭环：已成立。正常首关实际输入10发清除4敌，零友伤；清敌后禁止继续开火，在途弹4倍加速，等待车队抵达、弹药处理完毕及电台播完三项全部完成才结算，可重开。正常与暂停恢复流程均通过；[正常结果](../reports/2026-10-24-sync/normal.json)、[暂停结果](../reports/2026-10-24-sync/pause.json)。
- 当前阶段：本地改造、验证及素材整理完成；本轮未上传、提审或发布。
- 下一步：在目标小游戏开发者工具和手机真机复验触控、音频、后台恢复与广告SDK，正式提交前核对渠道规格。

## 八类资料

下列文件于2026-10-24核验；大小、SHA-256、图片尺寸与视频探测结果见[manifest.json](manifest.json)。

| 类别 | 状态 | 文件与规格 | 版本与核验 |
| --- | --- | --- | --- |
| 游戏简介 | 已提供 | [introduction.md](copy/introduction.md) | 已同步地形预览、三项同步收尾和可选支援 |
| 一句话推荐语 | 已提供 | [tagline.md](copy/tagline.md) | 对应昼夜护送 |
| 开发者的话 | 已提供 | [developer-note.md](copy/developer-note.md) | 对应新手与玩家流程，不暗示已上线 |
| 图标 | 已提供 | [1024×1024 PNG](icon/icon-1024.png) | 复用既有正式图标，已查看并核对尺寸 |
| 宣传图 | 已提供 | [1920×1080](promo/images/title-1920x1080.png)、[1440×1440](promo/images/title-1440x1440.png) | 既有标题插画，非游戏截图 |
| 宣传视频 | 已提供 | [1280×720 MP4，16秒](promo/videos/night-overwatch-synchronized-1280x720-silent.mp4) | 当前实际护送录屏与既有标题图剪辑；无音轨；[剪辑记录](promo/videos/synchronized-edit.json) |
| 游戏内截图 | 已提供 | [首页](gameplay/screenshots/2026-10-24-flow/home-844.png)、[地形选关](gameplay/screenshots/2026-10-24-flow/missions-844.png)、[暂停](gameplay/screenshots/2026-10-24-flow/pause-844.png)、[支援选择](gameplay/screenshots/2026-10-24-flow/supply-choice-844.png)、[白天](gameplay/screenshots/2026-10-24-flow/day-844.png)、[优先目标](gameplay/screenshots/2026-10-24-flow/priority-844.png)、[夜间](gameplay/screenshots/2026-10-24-flow/night-844.png)、[热成像](gameplay/screenshots/2026-10-24-flow/thermal-844.png)、[同步收尾后结算](gameplay/screenshots/2026-10-24-sync/normal-escort-success-844.png) | 全部844×390。前8张复用外观未变化的前轮681d33ad构建；最后一张来自当前b5b66e9d构建，均为实际浏览器渲染 |
| 游戏内视频 | 已提供 | [手机地图/支援/昼夜，844×390，36.8秒](gameplay/videos/mobile-support-map-844x390-silent.mp4)、[正常护送完整闭环，844×390，395.88秒WebM](gameplay/videos/escort-synchronized-844x390-silent.webm) | 前者复用前轮681d33ad构建的未变化流程；后者为当前b5b66e9d构建完整原始录屏。均未拼接玩法画面、无音轨 |

## 证据与边界

- CI修复（2026-10-24）：源码指纹对PowerShell语音生成脚本的CRLF/LF换行归一化；回归测试同时确认内容变化仍使旧制品失效。本地246项测试通过，后续Creator制品须重新构建，远端结果按最终提交核对；此项不改变玩法与现有媒体内容。
- [本轮验证记录](../docs/verification-2026-10-24-extraction-sync.md)包含253项游戏/原生暂存测试、最后31项定向测试、类型检查、引擎构建及正常/暂停恢复两套浏览器报告。浏览器均核对当前源码哈希，没有直接写入模拟状态；三项收尾条件的不同完成顺序另有规则测试覆盖。
- 浏览器录制时主机负载较高，正常流程的收尾模拟时间为3.02秒、实测墙钟为43.94秒；这份录像验证同步逻辑，不能作为手机帧率或墙钟耗时验收。语音通常长于车队动画，最终结算时间由最后完成的一项决定。
- 昼夜演示预置关卡解锁进度；支援使用公开广告提供器测试回调与可见性夹具，不能代替真实广告填充、SDK或实体手机验收。正常护送录像无奖励夹具。
- 图标及标题插画来自既有`outputs/six-taptap-submission-20261020/night-overwatch`批次，未改动；旧批次保留原始生成来源。当前3D场景与音频沿用项目来源记录。新[概念图](../docs/design/2026-10-24-support-map.md)与实际截图分开。
- 游戏内中英文电台WAV由本地系统语音合成，Cocos AudioSource播放。录屏没有声音捕获，视频均标注silent，没有后配音冒充同期声。
- 新视频均完成完整解码检查，宣传视频已抽帧查看，结算截图已查看。两条测试原始WebM保留在本地忽略目录`reports/2026-10-24-sync/`；当前正常护送录像另随上架基础资料保留。
- [前一轮交付记录](STATUS-2026-10-24-flow.md)与[前一轮清单](manifest-2026-10-24-flow.json)记录旧候选`681d33ad…`及支援/地图验证；[早期改造记录](STATUS-2026-10-24-redesign.md)继续保留。复用媒体在上表与manifest分别标注原始源码身份，未冒充当前构建重新录制。
- 八类基础资料均已提供。实体手机、目标原生平台和真实广告验收尚未执行；本轮未声称满足所有渠道最新提审规格。
