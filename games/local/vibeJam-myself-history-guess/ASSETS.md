# 素材与资料来源

整理时间：2026-09-12。

## 项目关系

玩法参考此前对 [WenWare](https://wen-ware.com/play/) 的调研：观察历史全景，猜地点和时间，然后揭晓。本项目独立编写界面、交互、状态与评分，不复制原站大型业务模块、认证配置或私有 API。球面全景采用 Three.js 内向球体这一通用实现方式，地图使用 Leaflet。

## 图片

`public/assets/*.webp` 共 8 张，均为本次使用 OpenAI imagegen 生成的新图；原始输出为 1774 × 887、2:1 图片，再使用 FFmpeg 仅转换为 WebP。游戏随附图片合计约 2.9 MB。未使用原站全景、商业图库或未经标注的网络照片。

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
