# 夜航守望 · 交付状态

更新：2026-10-31，Game ID：`night-overwatch`。封面点按后进入基地；单人与双人分别先选最多三项配置，再选择关卡或进入大厅。金币用于购买军需，对战积分独立统计。完整数值见[军需与关卡](../docs/design/armory.md)。

| 类别 | 当前文件 |
| --- | --- |
| 游戏简介 | [introduction.md](copy/introduction.md) |
| 推荐语 | [tagline.md](copy/tagline.md) |
| 开发者的话 | [developer-note.md](copy/developer-note.md) |
| 图标 | [1024×1024](icon/icon-1024.png) |
| 宣传图 | [横版](promo/images/title-1920x1080.png)、[方版](promo/images/title-1440x1440.png) |
| 宣传视频 | [16 秒，封面、基地、配置及战斗](promo/videos/armory-2026-10-31.mp4) |
| 游戏截图 | [瞄准](gameplay/screenshots/2026-10-31-armory/combat-01-aim.jpg)、[榴弹](gameplay/screenshots/2026-10-31-armory/combat-02-he-shot.jpg)、[交战](gameplay/screenshots/2026-10-31-armory/combat-03-engage.jpg) |
| 实录 | [16 秒连续战斗](gameplay/videos/armory-2026-10-31.mp4)，桌面浏览器真实鼠标输入 |

两条视频为 1280×720 H.264、无音轨，完整解码通过。三张战斗截图为 1280×720 JPEG，每张小于 4 MB。图标、宣传图、推荐语沿用；素材尺寸、字节数、摘要及采集源码指纹见[交付清单](manifest.json)，运行资源来源见[素材清单](../docs/ASSET_MANIFEST.json)。

Creator 3.8.8 Web-mobile 已导出；568×320、844×390、1280×720 浏览器覆盖了封面、基地、商店、每日补给、独立配装、大厅、选关和实际开火。120 关规则回放通过；钱包、签到、广告挑战、装备及结算在隔离 PostgreSQL 17.6 与 HTTP 上验证。三尺寸截图使用浏览器、网络隔离；未冒充手机实测、真实广告或真人对局。

[本机 Docker / Sakura Frp 与 H5 打包方法](../../../../docs/operations/night-overwatch-local-selftest.md)。本次未向正式服务部署或上传渠道。上版验证与交付见[历史状态](STATUS-2026-10-30-rankings.md)。
