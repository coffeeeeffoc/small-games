# 子弹花园 · 上架基础资料

- Game ID：`bullet-garden`；更新日期：2026-10-24。
- 对应版本：本地未提交的鼠标/触摸输入、有目标射击与战斗首页优化版；真实 Creator 3.8.8 web-mobile 源码指纹 `f8d7e3d9611d6e646c8246d714abe3bfa703b676b35e820a7e9cb99872235e46`。
- 目标形态：竖屏手机 Web/H5 基础素材。素材中桌面 Chromium 的触屏模拟不冒充手机或原生平台实机。
- 基本闭环：已成立。首页 → 选关 → 鼠标/触屏移动、遇敌射击 → 击杀取得强化 → 暂停恢复 → 清场胜利 → 返回/保存重载，另覆盖多指冲刺、失败/技能/重试；[本次验证](../docs/design/garden-input-home-2026-10-24/02-validation.md)。
- 当前阶段：本地资料归档；本轮未对外上传、提交审核、部署或发布，不判断历史平台状态。
- 下一步：手机触屏真机验收；确定正式渠道后按其当前规格核验并另行提审。

| 类别 | 状态 | 实际内容与规格 | 版本/核验 |
| --- | --- | --- | --- |
| 游戏简介 | 已提供 | [introduction.md](copy/introduction.md)，中文 UTF-8 | 本次版本，2026-10-24，逐项对照实际功能 |
| 一句话推荐语 | 已提供 | [tagline.md](copy/tagline.md)，中文 UTF-8 | 同上 |
| 开发者的话 | 已提供 | [developer-note.md](copy/developer-note.md)，中文 UTF-8 | 同上 |
| 图标 | 已提供 | [icon-20261024.png](icon/icon-20261024.png)，256×256 PNG，不透明；复用游戏自有角色图标 | 已核验图片尺寸、内容及文件散列 |
| 宣传图 | 已提供 | [花园战斗首页](promo/images/garden-battle-home-390x844.png)、[遇敌战斗](promo/images/garden-target-battle-390x844.png)，390×844 PNG | 新首页与战斗均来自当前 Creator 构建 |
| 宣传视频 | 已提供 | [garden-input-home-390x844.mp4](promo/videos/garden-input-home-390x844.mp4)，390×844，19秒，H.264，无音轨；新首页、移动交战、后段战斗及通关剪辑 | FFmpeg 串行剪辑，ffprobe及解码画面核验 |
| 游戏内截图 | 已提供 | [首页](gameplay/screenshots/input-home-20261024/home-390.png)、[选关](gameplay/screenshots/input-home-20261024/levels-390.png)、[移动](gameplay/screenshots/input-home-20261024/battle-moving-390.png)、[强化](gameplay/screenshots/input-home-20261024/upgrade-1-390.png)、[胜利](gameplay/screenshots/input-home-20261024/victory-390.png)，390×844；另含窄屏与横屏 | 当前生产构建、Chromium触屏模拟；布局截图含已成长存档夹具，通关录像从新存档开始 |
| 游戏内视频 | 已提供 | [完整首关](gameplay/videos/first-clear-input-home-390x844.webm)，390×844，117.08秒，VP8，无音轨 | 实际浏览器输入录制，含菜单/暂停/选择和宿主等待；战斗计时60秒，不改战斗状态；独立于宣传剪辑 |

## 本次核验

- 当前输入/首页批次见 [素材 SHA-256](media-input-home-sha256.json)。此前界面和固定镜头批次的文件、清单保留，仅作为历史证据。
- 录屏为浏览器生成的无音轨视频；游戏音效已另经真实 WebAudio 生命周期测试，不把静音录像作为音效验收依据。
- 图标、场景及角色设定沿用原素材；八方向四步态图集仍为2.5D表现。首页由内置 imagegen 参考原首页与角色图集生成花园交战插画，提示词与来历见 `docs/design/garden-input-home-2026-10-24/`。概念材料未充当实际截图。
- 历史设计、QA和录制保留原位置，本目录是本次可用基础交付。当前没有无法制作的必需资料项。
- 未声明这些基础尺寸已满足某一渠道的提审要求，也未以本地通过宣称原生 SDK、真机、广告库存或审核通过。
