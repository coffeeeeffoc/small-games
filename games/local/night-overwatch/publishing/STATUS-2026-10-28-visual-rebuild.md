# 夜航守望 · 交付状态

更新：2026-10-28。Game ID：`night-overwatch`。本轮按认可效果图大改视觉；Creator 3.8.8 Web/mobile源码指纹 `9c90c5006cefe2ed2027b8182712410606532cad22b6f73fabf57f14361548bd`，产物 21,451,723 字节。真实Creator构建、306项测试及浏览器逐页检查通过，详见[本轮验证](../docs/verification-2026-10-28-visual-rebuild.md)。资料已提供，未上传渠道或提审；未将浏览器触屏模拟作为真机或原生包验收。

## 八类资料

| 类别 | 状态 | 当前文件 |
| --- | --- | --- |
| 游戏简介 | 已提供、复核沿用 | [introduction.md](copy/introduction.md) |
| 推荐语 | 已提供、复核沿用 | [tagline.md](copy/tagline.md) |
| 开发者的话 | 已提供、复核沿用 | [developer-note.md](copy/developer-note.md) |
| 图标 | 已提供、复核沿用 | [1024×1024 PNG](icon/icon-1024.png)，完整背景原创插画 |
| 宣传图 | 已提供、复核沿用 | [1920×1080](promo/images/title-1920x1080.png)、[1440×1440](promo/images/title-1440x1440.png)，标题插画 |
| 宣传视频 | 已更新 | [16秒 H.264 MP4](promo/videos/visual-rebuild-2026-10-28-1280x720-silent.mp4)：实际首页、任务、战斗与结算录像剪辑，1280×720，无音轨 |
| 游戏截图 | 已更新 | [本轮八张](gameplay/screenshots/2026-10-28-visual-rebuild/01-fire.png)：开火、夜战、首页、任务、有房间大厅、单人胜利和人机胜利；均1280×720，单张小于4MB |
| 实机录屏 | 已更新 | [20秒 H.264 MP4](gameplay/videos/visual-rebuild-2026-10-28-1280x720-silent.mp4)，1280×720，战况查看与正常鼠标瞄准射击，无音轨 |

文件尺寸、时长与SHA256见[manifest.json](manifest.json)，素材来源与许可见[素材清单](../docs/ASSET_MANIFEST.json)。视频完整解码检查通过，剪辑时间点及源录像摘要见[剪辑记录](promo/videos/visual-rebuild-2026-10-28-edit.json)。原始WebM只作为本地复核输入，交付MP4已版本化。

大厅截图来自隔离本地HTTP服务及内存存储，不代表生产数据库或线上多人对战验收；此轮未部署后端。历史 `6c7dad` 交付与原始摘要保存在[历史状态](STATUS-2026-10-28-interface.md)和[历史清单](manifest-2026-10-28-interface.json)。最终dev的独立CI/Pages结果需以推送SHA核对，不以此处局部验收替代。
