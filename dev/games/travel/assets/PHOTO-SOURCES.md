# 大理实拍素材与署名

2026-09-12 从 Wikimedia Commons 文件页面与 MediaWiki `imageinfo` API 核对作者、地点、许可证后下载。`reference/*.metadata.json` 保留对应 API 元数据。全部为真实摄影；不是 AI 生成图，也不是摄影测量扫描或有深度数据的全景。

原图文件保持摄影内容，只使用 Commons 提供的缩小版本。游戏若通过 UV 取局部、投影或调色，属于对照片的裁切/映射/色彩处理；这些照片及其改编图像继续遵循下列各自许可证，并保留作者、来源、许可证链接与修改说明。

| 本地照片 | 拍摄对象与日期 | 作者 / 许可证 | 来源与实际下载 |
| --- | --- | --- | --- |
| [reference/dali-old-town.jpg](reference/dali-old-town.jpg), 1920 × 1281, 832357 bytes | 云南大理古城洋人街、苍山；文件描述写 2012，EXIF 为 2013-01-01，拍摄年份存在不一致 | chensiyuan · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [文件页面](https://commons.wikimedia.org/wiki/File:1_dali_old_town_yunnan_2012.jpg) · [下载的缩图](https://thumb.wikimedia.org/wikipedia/commons/thumb/c/ce/1_dali_old_town_yunnan_2012.jpg/1920px-1_dali_old_town_yunnan_2012.jpg) |
| [reference/dali-shop-door.jpg](reference/dali-shop-door.jpg), 1280 × 1900, 740693 bytes | 大理古城内有雕花门的店铺；2012-03-30 | Photo by CEphoto, Uwe Aranas · [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | [文件页面](https://commons.wikimedia.org/wiki/File:Dali_Yunnan_China_Shop-in-old-town-01.jpg) · [下载的缩图](https://thumb.wikimedia.org/wikipedia/commons/thumb/9/94/Dali_Yunnan_China_Shop-in-old-town-01.jpg/1280px-Dali_Yunnan_China_Shop-in-old-town-01.jpg) |
| [reference/erhai-panorama.jpg](reference/erhai-panorama.jpg), 3840 × 594, 427977 bytes | 从洱海北部眺望湖面与山体；2012-09-30 | Fong Chen · [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | [文件页面](https://commons.wikimedia.org/wiki/File:Erhai_north_Panorama.jpg) · [下载的缩图](https://thumb.wikimedia.org/wikipedia/commons/thumb/8/80/Erhai_north_Panorama.jpg/3840px-Erhai_north_Panorama.jpg) |
| [reference/three-pagodas.jpg](reference/three-pagodas.jpg), 1920 × 1107, 484715 bytes | 崇圣寺三塔，从入口正面拍摄；2018-08-10 | Jason Zhang · [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | [文件页面](https://commons.wikimedia.org/wiki/File:Three_Pagodas_of_Chongsheng_Temple_front_view_from_entrance.jpg) · [下载的缩图](https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c3/Three_Pagodas_of_Chongsheng_Temple_front_view_from_entrance.jpg/1920px-Three_Pagodas_of_Chongsheng_Temple_front_view_from_entrance.jpg) |
| [reference/xizhou-gate.jpg](reference/xizhou-gate.jpg), 1920 × 1272, 415022 bytes | 大理喜洲四方街翰林坊；文件页面日期 2016-02-11 | Chris DeLacy · [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [文件页面](https://commons.wikimedia.org/wiki/File:Xizhou_town_square_gate.JPG) · [下载的缩图](https://thumb.wikimedia.org/wikipedia/commons/thumb/1/15/Xizhou_town_square_gate.JPG/1920px-Xizhou_town_square_gate.JPG) |

## 用于场景重建的观察

以下是看图得出的建模建议，不是测绘数据。近景需要真实几何、可走动空间、遮挡与光照，照片只能提供外观依据和表面/远景纹理。

- 古城：低层连续街屋；墙面偏灰白，灰瓦密排且层叠，檐口薄而翘，深棕木门与细格窗。洋人街宽度约为两侧两层建筑高度的 1–1.5 倍；道路为灰色不规则石板。苍山为连续多层山脊，不是独立圆锥峰。
- 近景门面优先使用 `dali-shop-door.jpg` 的真实木雕、格窗和灰砖。坐标按左上角 `(x,y,width,height)`：大门 `(310,1220,670,500)`；二楼格窗 `(300,686,680,217)`；灰砖横带 `(320,913,598,65)`；山花图案 `(486,300,315,175)`。照片略有透视，不应用整张直接替代可绕行建筑。
- `dali-old-town.jpg` 可补充木窗 `(90,385,350,75)`、瓦面 `(1670,495,240,105)`；保留瓦筒方向与细密程度。局部带有透视与拍摄光照，适合特定方向的装饰面，不是无缝 PBR 材质。
- 当前运行时还将此图的苍山区域 `(790,110,1130,330)` 映射到古城、三塔、花甸及喜洲的远景弧面，边缘渐隐以衔接摄影天空；保留 chensiyuan 的 CC BY-SA 4.0 署名。
- 洱海全景约为 6.46:1，远处水岸线约在高度的 70%；适合远景弧面，保持纵横比例。它不是 360° 等距柱状全景；不要铺满球体，也不能声称可从照片自由走到背后。近处湖面与岸石仍需 3D 几何及水面动态。
- 当前湖面着色器另外采样洱海照片的 `(1100,465,600,110)` 局部，配合动态表面法线和摄影天空反射，生成近处可实时变化的水面。
- 三塔照片能确认中塔瘦长、方形、层层收分，两座小塔偏八角形，色彩为风化奶黄色，非鲜亮白色。中央塔 16 层、两边塔 10 层，形制与尺寸另有[同地点说明](https://commons.wikimedia.org/wiki/File:Dali,_Three_Pagodas_(6170293882).jpg)。
- 当前塔层四面使用三塔照片的窗饰带 `(883,525,159,27)` 做局部 UV 映射，保留 Jason Zhang 的 CC BY-SA 3.0 署名；中央塔底层约占模型塔身 19%，其上各层使用独立几何。
- 喜洲翰林坊：石质立柱、木构横梁、密集斗拱、中央双层屋顶与两侧小翼；屋脊、檐口与柱脚都有细节，不宜简化成粗大彩色方块。

## 游戏内精简署名

实拍：chensiyuan / CC BY-SA 4.0；CEphoto, Uwe Aranas、Fong Chen、Jason Zhang / CC BY-SA 3.0；Chris DeLacy / CC0。照片经缩放、局部映射用于场景；各来源及授权见本文件。链接应能在游戏的素材来源入口访问。
