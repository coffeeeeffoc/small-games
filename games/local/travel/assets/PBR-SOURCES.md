# PBR 材质与天空来源

Powered by Poly Haven — [Poly Haven](https://polyhaven.com/)。下载于 2026-09-12。

这些是下载自官方资产库的真实表面 PBR 素材与摄影 HDRI，没有使用 AI 生图或程序噪声生成材质。它们用于重建场景的表面和光照；通用材质与 Kloppenheim 天空不应标注为大理现场扫描。大理实地照片的出处另见 PHOTO-SOURCES.md。

资产采用 [CC0 1.0](https://polyhaven.com/license)。官方 [API 规则](https://polyhaven.com/our-api) 已于 2026-07-18 开放使用，要求独立 User-Agent，并在使用在线 API 的产品中明确来源。本次构建请求使用 QuyeTravelAssetBuild/1.0；游戏从本地文件加载，不在运行时请求 API。建议游戏素材说明保留 Powered by Poly Haven。

共 14463831 字节（14.46 MB），包含 18 张表面贴图、1 张 HDR 与 1 张官方天空预览。所有下载原图已核对官方 MD5 和字节数；天空预览单独记录本地 MD5。

| 本地文件 | 原资产 / 作者 | 尺寸 | 字节 | 用途 |
| --- | --- | --- | ---: | --- |
| [ground-color.jpg](pbr/ground-color.jpg) | [Cobblestone Floor 02](https://polyhaven.com/a/cobblestone_floor_02) / Rob Tuytel | 2048 × 2048 | 915386 | Diffuse |
| [ground-normal.jpg](pbr/ground-normal.jpg) | [Cobblestone Floor 02](https://polyhaven.com/a/cobblestone_floor_02) / Rob Tuytel | 1024 × 1024 | 208641 | nor_gl |
| [ground-rough.jpg](pbr/ground-rough.jpg) | [Cobblestone Floor 02](https://polyhaven.com/a/cobblestone_floor_02) / Rob Tuytel | 1024 × 1024 | 163268 | Rough |
| [wall-color.jpg](pbr/wall-color.jpg) | [White Plaster 02](https://polyhaven.com/a/white_plaster_02) / Rob Tuytel | 1024 × 1024 | 527219 | Diffuse |
| [wall-normal.jpg](pbr/wall-normal.jpg) | [White Plaster 02](https://polyhaven.com/a/white_plaster_02) / Rob Tuytel | 1024 × 1024 | 652310 | nor_gl |
| [wall-rough.jpg](pbr/wall-rough.jpg) | [White Plaster 02](https://polyhaven.com/a/white_plaster_02) / Rob Tuytel | 1024 × 1024 | 295900 | Rough |
| [wood-color.jpg](pbr/wood-color.jpg) | [Rough Wood](https://polyhaven.com/a/rough_wood) / Rob Tuytel | 1024 × 1024 | 567074 | Diffuse |
| [wood-normal.jpg](pbr/wood-normal.jpg) | [Rough Wood](https://polyhaven.com/a/rough_wood) / Rob Tuytel | 1024 × 1024 | 790334 | nor_gl |
| [wood-rough.jpg](pbr/wood-rough.jpg) | [Rough Wood](https://polyhaven.com/a/rough_wood) / Rob Tuytel | 1024 × 1024 | 195056 | Rough |
| [roof-color.jpg](pbr/roof-color.jpg) | [Grey Roof Tiles](https://polyhaven.com/a/grey_roof_tiles) / Rob Tuytel | 2048 × 2048 | 2039152 | Diffuse |
| [roof-normal.jpg](pbr/roof-normal.jpg) | [Grey Roof Tiles](https://polyhaven.com/a/grey_roof_tiles) / Rob Tuytel | 2048 × 2048 | 1504796 | nor_gl |
| [roof-rough.jpg](pbr/roof-rough.jpg) | [Grey Roof Tiles](https://polyhaven.com/a/grey_roof_tiles) / Rob Tuytel | 2048 × 2048 | 1009346 | Rough |
| [grass-color.jpg](pbr/grass-color.jpg) | [Aerial Grass Rock](https://polyhaven.com/a/aerial_grass_rock) / Rob Tuytel | 1024 × 1024 | 666655 | Diffuse |
| [grass-normal.jpg](pbr/grass-normal.jpg) | [Aerial Grass Rock](https://polyhaven.com/a/aerial_grass_rock) / Rob Tuytel | 1024 × 1024 | 904956 | nor_gl |
| [grass-rough.jpg](pbr/grass-rough.jpg) | [Aerial Grass Rock](https://polyhaven.com/a/aerial_grass_rock) / Rob Tuytel | 1024 × 1024 | 362214 | Rough |
| [bark-color.jpg](pbr/bark-color.jpg) | [Bark Brown 01](https://polyhaven.com/a/bark_brown_01) / Rob Tuytel | 1024 × 1024 | 729893 | Diffuse |
| [bark-normal.jpg](pbr/bark-normal.jpg) | [Bark Brown 01](https://polyhaven.com/a/bark_brown_01) / Rob Tuytel | 1024 × 1024 | 1226534 | nor_gl |
| [bark-rough.jpg](pbr/bark-rough.jpg) | [Bark Brown 01](https://polyhaven.com/a/bark_brown_01) / Rob Tuytel | 1024 × 1024 | 201307 | Rough |
| [sky.hdr](pbr/sky.hdr) | [Kloppenheim 03 (Pure Sky)](https://polyhaven.com/a/kloppenheim_03_puresky) / Greg Zaal, Jarod Guest | 1024 × 512 | 1428760 | hdri |
| [sky-preview.webp](pbr/sky-preview.webp) | [Kloppenheim 03 (Pure Sky)](https://polyhaven.com/a/kloppenheim_03_puresky) / Greg Zaal, Jarod Guest | 1520 × 760 | 75030 | official tonemapped preview |

## 加载清单

机器可读清单为 [pbr/manifest.json](pbr/manifest.json)：assets.ground / wall / wood / roof / grass / bark 的 files.color / normal / rough 给出 path、原始 url、MD5、实际像素尺寸和字节数；assets.sky.files.hdr 为天空照明，files.preview 仅是官方缩略预览。

color 使用 sRGB；normal 与 rough 使用线性数据，不套 sRGB。所有法线都是 OpenGL 方向 nor_gl。HDR 是线性 1024 × 512 等距柱状投影，可用于 Three.js EquirectangularReflectionMapping。

石板原图覆盖约 2 × 2 m，白灰墙 1 × 1 m，风化木 0.5 × 0.5 m，灰瓦 3 × 3 m，草岩 15 × 15 m，树皮 1 × 1 m；真实覆盖尺寸保存在 physicalMillimeters 中，可据实际模型大小设置 UV 重复。

## 目视核验

已检查 ground-color.jpg 的真实石纹、砂浆缝及磨损；wall-color.jpg 的灰墙颗粒和不均匀表面；sky-preview.webp 的真实云层与连续全天球。天空下半球为官方纯天空编辑版本的地面填充，不是大理湖面；场景实际湖岸和苍山应使用实地照片/几何体。官方天空预览 URL 后缀虽为 .png，响应实际是 WebP，已按真实编码使用 .webp 文件名。
