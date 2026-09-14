# 素材与资料来源

整理时间：2026-09-15。

## 项目关系

玩法参考此前对 [WenWare](https://wen-ware.com/play/) 的调研：观察历史全景，猜地点和时间，然后揭晓。本项目独立编写界面、交互、状态与评分，不复制原站大型业务模块、认证配置或私有 API。球面全景采用 Three.js 内向球体这一通用实现方式，地图使用 Leaflet。

## 图片

原有 `public/assets/*.webp` 8 张保持原样；本次另外使用 OpenAI 内置 image_gen 生成 20 张独立场景图，共 28 张。新图按 2:1 全景构图生成，使用 FFmpeg 仅转换为 WebP；完整提示词记录在 `scripts/scene-art-prompts.json`。未使用原站全景、商业图库或未经标注的网络照片。

| 文件            | 创作设定                                                 | 年代容限 |
| --------------- | -------------------------------------------------------- | -------- |
| `kaifeng.webp`  | 约 1100 年北宋汴京的河道、木桥与街市，参考清明上河图意象 | ±50 年   |
| `changan.webp`  | 约 742 年唐代长安商旅街市                                | ±50 年   |
| `beijing.webp`  | 1420 年明代北京宫城竣工意象                              | ±15 年   |
| `dunhuang.webp` | 约 850 年敦煌绿洲与莫高窟外部的想象                      | ±80 年   |
| `shanghai.webp` | 约 1930 年上海外滩、钟楼与黄浦江                         | ±10 年   |
| `giza.webp`     | 约公元前 1250 年吉萨高地旅行者；并非金字塔建造时期       | ±250 年  |
| `rome.webp`     | 约 125 年古罗马公共广场的想象                            | ±75 年   |
| `paris.webp`    | 1889 年巴黎世博会与新落成铁塔                            | ±5 年    |

生成图不保证首尾严格无缝、建筑分布准确或服装与铭文准确；可环顾观察，但不是可自由行走的三维关卡。图片按历史语境创作，场景精确年份属于出题设定。页面持续标注 AI 复原，解说附下述资料，不能用生成图替代史料。

## 历史解说资料

本项目自行撰写中文概述，以下资料支持场景的背景事实，不支持生成画面中的每一处细节。

- [故宫博物院：张择端清明上河图卷](https://www.dpm.org.cn/collection/paint/228226.html)，汴京、汴河与北宋街市图像背景。
- [UNESCO：长安—天山廊道丝绸之路](https://whc.unesco.org/en/list/1442/)，汉唐长安及商路文化交流背景。
- [故宫博物院：紫禁城建成](https://www.dpm.org.cn/subject_600/buildingdetails/253789.html)，1420 年宫殿竣工。
- [UNESCO：莫高窟](https://whc.unesco.org/en/list/440/)，始建年代及长期形成的佛教艺术遗产。
- [上海市政府：外滩海关大楼相关答复](https://www.shanghai.gov.cn/gwk/search/content/42925f1923764d98bfa7198785e56512)，海关大楼 1927 年建成。
- [UNESCO：孟菲斯及其墓地](https://whc.unesco.org/en/list/86/)，吉萨金字塔及古埃及墓葬遗产。
- [罗马斗兽场考古公园：古罗马广场](https://colosseo.it/en/area/the-roman-forum/)，广场发展与公共活动空间。
- [埃菲尔铁塔官网：建造历史](https://www.toureiffel.paris/en/the-monument/history)，1889 年铁塔与世界博览会。

## 地图

底图来自 [Natural Earth 1:110m Admin 0 Countries](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson)，包含 177 个要素。`scripts/prepare-map.mjs` 保留几何和中文标注字段，将坐标保留三位小数，另将几个冗长国名简写，生成 `public/data/world.json`。城市点是用于游戏定位的近似坐标，并非实时地名服务。

[Natural Earth 使用条款](https://www.naturalearthdata.com/about/terms-of-use/) 声明其地图数据为公有领域。游戏显示出处；边界按该数据源呈现，仅作地理示意，不提供历史或现实边界的权威判定。

## 第三方代码

- [Three.js](https://github.com/mrdoob/three.js/blob/r164/LICENSE)：MIT。
- [Leaflet](https://github.com/Leaflet/Leaflet/blob/v1.9.4/LICENSE)：BSD-2-Clause。
- Vite、Playwright 仅用于开发构建与验证，包版本固定在 `package.json` 与 `pnpm-lock.yaml`。

中文字体使用设备自带字体回退，不下载或分发商业字体。

## 本次新增 20 幕

历史背景资料于 2026-09-15 查阅。下表链接支持背景事实，精确场景年份、人物与空间组合是出题设定。每张图均独立生成，原有素材未替换。

| 场景 / 文件 | 地点与游戏设定 | 容限 | 背景资料 |
| --- | --- | --- | --- |
| 莲花塔影落进护城河 / `angkor.webp` | 柬埔寨 · 暹粒（吴哥），1150 年 | ±75 年 | [联合国教科文组织 · 吴哥](https://whc.unesco.org/en/list/668/) |
| 石柱撑起城邦的天空 / `athens.webp` | 希腊 · 雅典，公元前 400 年 | ±40 年 | [联合国教科文组织 · 雅典卫城](https://whc.unesco.org/en/list/404/) |
| 蓝色城门后的泥砖王国 / `babylon.webp` | 伊拉克 · 巴比伦，公元前 575 年 | ±60 年 | [联合国教科文组织 · 巴比伦](https://whc.unesco.org/en/list/278/) |
| 把江水分给田野 / `dujiangyan.webp` | 中国 · 都江堰，公元前 250 年 | ±50 年 | [联合国教科文组织 · 青城山与都江堰](https://whc.unesco.org/en/list/1001/) |
| 红色穹顶，越过工匠的肩头 / `florence.webp` | 意大利 · 佛罗伦萨，1475 年 | ±50 年 | [圣母百花大教堂官网 · 穹顶](https://duomo.firenze.it/en/40/dome) |
| 湖山之外，还有半城灯火 / `hangzhou-song.webp` | 中国 · 杭州（临安），1200 年 | ±75 年 | [联合国教科文组织 · 杭州西湖文化景观](https://whc.unesco.org/en/list/1334/) |
| 没有尖塔的巨大穹顶 / `istanbul.webp` | 土耳其 · 伊斯坦布尔（君士坦丁堡），550 年 | ±75 年 | [联合国教科文组织 · 伊斯坦布尔历史区](https://whc.unesco.org/en/list/356/) |
| 池水映着层层衣袖 / `kyoto-heian.webp` | 日本 · 京都（平安京），1050 年 | ±100 年 | [联合国教科文组织 · 古京都的历史遗迹](https://whc.unesco.org/en/list/688/) |
| 红山之上，白墙接住晨光 / `lhasa-potala.webp` | 中国 · 拉萨，1700 年 | ±75 年 | [联合国教科文组织 · 拉萨布达拉宫历史建筑群](https://whc.unesco.org/en/list/707/) |
| 一凿一刻，山崖有了目光 / `longmen.webp` | 中国 · 洛阳（龙门），675 年 | ±50 年 | [联合国教科文组织 · 龙门石窟](https://whc.unesco.org/en/list/1003/) |
| 海风越过两种屋檐 / `macau.webp` | 中国 · 澳门，1650 年 | ±40 年 | [澳门世界遗产 · 大三巴牌坊](https://www.wh.gov.mo/en/site/detail/18) |
| 云端梯田仍有人耕作 / `machu-picchu.webp` | 秘鲁 · 马丘比丘，1450 年 | ±75 年 | [联合国教科文组织 · 马丘比丘历史保护区](https://whc.unesco.org/en/list/274/) |
| 铜色火炬，迎来海上的人 / `new-york.webp` | 美国 · 纽约，1886 年 | ±10 年 | [美国国家公园管理局 · 自由女神像](https://www.nps.gov/stli/planyourvisit/frequently-asked-questions-statue-of-liberty.htm) |
| 峡谷尽头，商路开了一扇门 / `petra.webp` | 约旦 · 佩特拉，100 年 | ±100 年 | [联合国教科文组织 · 佩特拉](https://whc.unesco.org/en/list/326/) |
| 算盘响过一条晋商街 / `pingyao.webp` | 中国 · 平遥，1850 年 | ±40 年 | [联合国教科文组织 · 平遥古城](https://whc.unesco.org/en/list/812/) |
| 泥土塑成沉默的军阵 / `qin-mausoleum.webp` | 中国 · 西安（临潼），公元前 210 年 | ±25 年 | [联合国教科文组织 · 秦始皇陵及兵马俑坑](https://whc.unesco.org/en/list/441/) |
| 风帆把世界送到岸边 / `quanzhou.webp` | 中国 · 泉州，1300 年 | ±75 年 | [联合国教科文组织 · 泉州：宋元中国的世界海洋商贸中心](https://whc.unesco.org/en/list/1561/) |
| 把山水收进一方庭院 / `suzhou-garden.webp` | 中国 · 苏州，1550 年 | ±100 年 | [联合国教科文组织 · 苏州古典园林](https://whc.unesco.org/en/list/813/) |
| 水巷把货物送进宫邸 / `venice.webp` | 意大利 · 威尼斯，1500 年 | ±100 年 | [联合国教科文组织 · 威尼斯及其泻湖](https://whc.unesco.org/en/list/394/) |
| 火光里，文字刚刚醒来 / `yinxu.webp` | 中国 · 安阳（殷墟），公元前 1200 年 | ±100 年 | [联合国教科文组织 · 殷墟](https://whc.unesco.org/en/list/1114/) |

补充核对：[佛罗伦萨大教堂正立面](https://duomo.firenze.it/en/opera-magazine/post/6558/the-facade-of-florence-cathedral)于 1887 年完成，避免把今日外观搬回 15 世纪；[澳门文化局](https://www.icm.gov.mo/cn/StPaul)说明教堂在 1835 年火灾前仍为完整建筑；[美国国家公园管理局](https://home.nps.gov/stli/learn/statue-of-liberty-facts.htm)记录自由女神像 1886 年揭幕。
