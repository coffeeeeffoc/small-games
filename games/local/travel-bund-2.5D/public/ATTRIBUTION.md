# 地图数据与参考

地图数据 © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)，采用 [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/)。本目录保存原始数据摘录和 Overpass 查询；地图几何的派生数据继续依照 ODbL 提供。

- `osm-extract.json`：建筑轮廓、街道中心线、河流、公园，包含要素 ID、坐标和来源标签。
- `osm-pois.json`：用于建筑身份和公共设施定位的补充要素。
- `query.overpass`、`pois.overpass`：实际使用的查询。
- 查询范围：南 31.222°、西 121.480°、北 31.254°、东 121.518°。交付时进一步裁切到 `manifest.json` 中的米制矩形范围。
- 数据时间以摘录中的 `osm3s.timestamp_osm_base` 为准。重新建模默认读取本地摘录，不联网刷新。

`landmarks.json` 将原创建筑外观模型关联到地图要素。模型中保存 `osm_url` 和 `height_source`；没有高度标签时按楼层估算，连楼层也没有时采用明确标注的背景高度。楼面外观、屋顶、窗格、材质与公共设施由脚本建模，不是地图提供的真实立面。

## 建筑与尺寸参考

- [上海市政府：外滩历史文化风貌区](https://english.shanghai.gov.cn/en-HeritageZones/20231208/f2ac293f546a4d32aba936f2e733a47c.html)
- [外滩建筑地址清单](https://en.wikipedia.org/wiki/The_Bund#Architecture_and_buildings)，地址同时与 OSM 要素交叉核对。
- [Gensler：上海中心](https://www.gensler.com/projects/shanghai-tower)，632 米。
- [SOM：金茂大厦](https://www.som.com/projects/jin-mao-tower/)，建筑师介绍约 420 米；模型采用 OSM 标注 420.5 米。
- [环球金融中心项目资料](https://www.swfc-shanghai.com/up_pdf/1321340644_23490.pdf)，492 米。
- [上海市政府：东方明珠](https://english.shanghai.gov.cn/en-ScenicSpots/20231205/19a5f5184eca45728fd57a4d4c8efc61.html)，468 米。
- [上海半岛酒店资料](https://www.peninsula.com/-/media/files/shanghai/newsroom/2025/the-peninsula-shanghai-fact-sheet.pdf)，用于身份与地址核对。

河面游船为场景布置，位置不是实时船位；信号台、渡口与部分环境设施采用手工近似定位。地标立面为建筑特征重建；背景建筑只表达外轮廓和估算体量，未复刻内院、内部空间、施工细节及真实夜间灯光。

## 分发

渲染图和覆盖范围图已包含地图署名。GLB/Blender 再分发或接入产品时保留本文件，并在展示地图场景的页面显示 OpenStreetMap 署名及版权链接。原始摘录与派生地理数据可在本素材目录找到。原创建模代码与外观部分遵循项目适用的授权约定；参考网页及照片未作为贴图打包。
