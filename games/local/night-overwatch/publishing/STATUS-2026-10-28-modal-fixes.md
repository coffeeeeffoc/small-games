# 夜航守望 · 交付状态

更新：2026-10-28。Game ID：`night-overwatch`。本轮修复弹层设置入口、排行榜名次与对齐、按钮辨识、设置居中及昵称确认。Creator 3.8.8 Web/mobile 源码指纹 `c0c5e04eed985671980192c132dfb307a811039bc5a79fc436ed794fd1b5bd70`，产物21,461,782字节。真实Creator构建、三尺寸浏览器及隔离PostgreSQL接口验证通过，详见[本轮验证](../docs/verification-2026-10-28-modal-fixes.md)。资料已提供，未上传渠道、提审或部署Runtime。

## 八类资料

| 类别 | 状态 | 当前文件 |
| --- | --- | --- |
| 游戏简介 | 已提供、复核沿用 | [introduction.md](copy/introduction.md) |
| 推荐语 | 已提供、复核沿用 | [tagline.md](copy/tagline.md) |
| 开发者的话 | 已提供、复核沿用 | [developer-note.md](copy/developer-note.md) |
| 图标 | 已提供、复核沿用 | [1024×1024 PNG](icon/icon-1024.png)，完整背景原创插画 |
| 宣传图 | 已提供、复核沿用 | [1920×1080](promo/images/title-1920x1080.png)、[1440×1440](promo/images/title-1440x1440.png)，标题插画 |
| 宣传视频 | 已提供、本轮更新 | [16秒 H.264 MP4](promo/videos/modal-fixes-2026-10-28-1280x720-silent.mp4)：实际首页、设置、昵称截图停留与6秒战斗录像，1280×720，无音轨 |
| 游戏截图 | 已提供、本轮更新 | [本轮八张](gameplay/screenshots/2026-10-28-modal-fixes/01-fire.png)：三张战斗及首页、设置、昵称、排行榜、任务；均1280×720，单张小于4MB |
| 实机录屏 | 已提供、本轮更新 | [15秒 H.264 MP4](gameplay/videos/modal-fixes-2026-10-28-1280x720-silent.mp4)：浏览器实际运行的连续鼠标瞄准射击，1280×720，无音轨；非实体手机采集 |

文件尺寸、时长与SHA256见[manifest.json](manifest.json)，素材来源与许可见[素材清单](../docs/ASSET_MANIFEST.json)。两条视频完整解码及抽帧复核通过，剪辑时间点与源录像摘要见[剪辑记录](promo/videos/modal-fixes-2026-10-28-edit.json)。原始WebM及其余截图保留于本机 `.scratch/night-modal-captures/`，交付MP4已版本化。

排行榜截图来自本任务隔离本地HTTP服务与PostgreSQL，非生产成绩。昵称沿用按用户ID更新唯一服务端资料的机制，排行榜、房间和战绩查当前昵称；本次排序改动需Runtime部署后线上生效。未进行实体手机、原生宿主或真实广告验证，未运行全仓候选校验；最终dev的独立CI/Pages状态以推送SHA核对。

上一轮视觉交付保存在[历史状态](STATUS-2026-10-28-visual-rebuild.md)和[历史清单](manifest-2026-10-28-visual-rebuild.json)。
