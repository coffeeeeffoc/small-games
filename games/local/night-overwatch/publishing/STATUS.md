# 夜航守望 · 交付状态

更新：2026-10-30。Game ID：`night-overwatch`。本轮完成排行榜单人/对战分类、一次加载前100名及滚动、前三名奖牌、战斗关卡号、昵称回填、退出房间短期过滤与单人进度持久补传。金币、经验等级、个人资料和商店仅写入[后续计划](../docs/design/2026-10-29-personal-assets-plan.md)。

Creator 3.8.8 Web-mobile 源码指纹：`2ad66cda26b38cdef81152f4fd872c561658338a981c5061e8e579bddbab1200`。三尺寸浏览器、定向规则/输入、真实HTTP/PostgreSQL17续传通过；详细边界、身份调查及部署记录见[本轮验证](../docs/verification-2026-10-30-rankings-sync.md)。

## 八类资料

| 类别 | 状态 | 当前文件 |
| --- | --- | --- |
| 游戏简介 | 已提供 | [introduction.md](copy/introduction.md)，复核沿用 |
| 推荐语 | 已提供 | [tagline.md](copy/tagline.md)，复核沿用 |
| 开发者的话 | 已提供 | [developer-note.md](copy/developer-note.md)，复核沿用 |
| 图标 | 已提供 | [1024×1024 PNG](icon/icon-1024.png)，复核沿用 |
| 宣传图 | 已提供 | [1920×1080](promo/images/title-1920x1080.png)、[1440×1440](promo/images/title-1440x1440.png)，复核沿用 |
| 宣传视频 | 已提供 | [16秒 H.264 MP4](promo/videos/rankings-sync-2026-10-30-1280x720-silent.mp4)，本轮首页停留4秒与12秒实际战斗，1280×720，无音轨 |
| 游戏截图 | 已提供 | [首页](gameplay/screenshots/2026-10-30-rankings/01-home.png)、[开火](gameplay/screenshots/2026-10-30-rankings/02-fire.png)、[交火](gameplay/screenshots/2026-10-30-rankings/03-engage.png)、[命中](gameplay/screenshots/2026-10-30-rankings/04-hit.png)，本轮4张1280×720，每张小于4MB |
| 实机录屏 | 已提供 | [约16秒 H.264 MP4](gameplay/videos/rankings-sync-2026-10-30-1280x720-silent.mp4)，连续鼠标瞄准射击，1280×720，无音轨；实际15.966667秒，非实体手机采集 |

尺寸、时长与 SHA256 见[manifest.json](manifest.json)，剪辑起点及原录像摘要见[剪辑记录](promo/videos/rankings-sync-2026-10-30-edit.json)。两条视频完整解码通过，实录首尾抽帧核对；4张截图均来自当前实际运行。排行100条合成数据仅用于[QA截图](../docs/rankings-sync-2026-10-30/solo-clears-568.png)，未纳入正式上架截图或视频，未向生产榜写测试成绩。

沿用素材来源及许可见[素材清单](../docs/ASSET_MANIFEST.json)。上轮资料保留于[历史状态](STATUS-2026-10-29-online-sync.md)和[历史清单](manifest-2026-10-29-online-sync.json)。未上传平台或提交审核；当前H5仍为游客身份，真实TapTap账号绑定需完成服务端配置。未进行实体手机、原生包、真实TapTap宿主或真实广告验证，未运行全仓候选校验；CI/Pages状态单独核对。
