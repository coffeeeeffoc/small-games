# 外滩叙事美术资源

本项目图片使用 Codex 内置 image_gen 工具生成；未使用 CLI 或外部图库。参考了用户提供截图的精细手绘、纸质微缩景观与分层空间感，场景改为上海外滩。属于艺术化旅游插画，建筑相对位置经过构图处理，不是地理测绘图。

## 文件

| 文件                          | 尺寸        | 大小           | 用途                   |
| ----------------------------- | ----------- | -------------- | ---------------------- |
| public/art/bund-panorama.webp | 1536 × 1024 | 394,712 字节   | 网页晨景               |
| public/art/bund-night.webp    | 1536 × 1024 | 419,772 字节   | 网页夜景               |
| art-source/bund-panorama.png  | 1536 × 1024 | 2,971,703 字节 | 生成原图，不随站点分发 |
| art-source/bund-night.png     | 1536 × 1024 | 2,933,458 字节 | 生成原图，不随站点分发 |

WebP 使用仓库已有 sharp 0.34.5 转码，质量 88，effort 6，无尺寸或构图修改。运行时优先使用 WebP。

晨、夜保持同一构图，适合透明度交叉渐变。推荐地标锚点以归一化坐标表达：海关钟楼约 (0.22, 0.30)，和平饭店绿顶约 (0.34, 0.40)，东方明珠约 (0.77, 0.36)。手机竖屏裁切需要随章节平移视点；固定居中会漏掉左右地标。

## 晨景提示词

```text
Use case: illustration-story.
Asset type: production background for an immersive Shanghai Bund scrollytelling browser game, landscape 3:2 composition, as large and detailed as possible.
Primary request: A richly detailed Chinese illustrated diorama of Shanghai's Bund at a misty golden morning, an exquisite hand-painted paper sculpture / layered miniature world with depth, soft organic edges and delicately carved architectural detail. Cream ivory sky in the upper 25 percent; the scene concentrates in the middle and lower image.
Scene: We are standing on the Bund promenade looking along the Huangpu River. On the left, the historic Bund waterfront buildings recede into the distance: recognizable Shanghai Customs House with its large square clock tower and white clock faces, the Peace Hotel's distinctive green pyramidal roof, finely detailed warm limestone neoclassical facades. The waterfront runs diagonally from near bottom-left towards the center. On the right, flowing jade teal Huangpu River, tiny elegant ferry on the water, across the river the distant Pudong skyline with the recognizable Oriental Pearl Tower, Shanghai Tower and the Shanghai World Financial Center in pale blue-green atmospheric haze. Foreground: carved stone riverside balustrade along the lower edge, delicate plane-tree foliage framing the lower-left and upper-left edges, small warm red-orange accents and a few miniature walkers on the promenade.
Style: premium Chinese travel storybook illustration, dimensional paper-cut diorama, intricate gouache and watercolor painting, tactile paper texture, sophisticated architectural painting, elegant cinematic illustration. Layered foreground, midground and misty background that invites exploration. Similar richness to a high-end illustrated travel app scene. Not vector art, not cartoon flat shapes, not photorealism, no plastic 3D.
Light/color: gentle golden sunrise through cream mist, desaturated jade and celadon greens, ink teal shadows, warm cream stone, burnt vermilion small details. Inviting, poetic and peaceful.
Composition: wide 3:2 full-bleed landscape, detail visible at high resolution, generous sky above, clear river negative space at right, medium high viewpoint with a deep diagonal promenade, all key landmarks fit safely within the image edges. This is the artwork itself, not a screen.
Constraints: Absolutely NO text, lettering, titles, captions, logos, watermark, UI, phone frame, play button, border, or layout panels. Only the illustrated Shanghai landscape.
```

## 夜景提示词

以 bund-panorama.png 为编辑目标，通过内置工具 referenced_image_paths 引用。仅变更时间、灯光与气氛。

```text
Use case: lighting-weather.
Asset type: second time-of-day frame of the same immersive Shanghai Bund illustration, for perfectly aligned crossfade.
Edit target: the provided Shanghai Bund illustration. Change ONLY lighting, sky colors and window illumination to blue hour / early night. Preserve the EXACT same dimensions, camera viewpoint, composition, all building shapes and positions, all boats and pedestrians and their positions, clock tower, green Peace Hotel roof, Oriental Pearl Tower, promenade, stone balustrade, trees and every structural detail. No added or removed objects, no layout or camera changes.
Atmosphere: richly illustrated poetic Shanghai blue hour just after sunset. Deep peacock blue / muted indigo sky, gentle warm amber horizon haze, historic Bund facades and windows gently glowing golden, Oriental Pearl Tower glowing soft rose-violet light, subtle golden and coral reflections across the teal Huangpu River. Foreground remains legible with muted bronze and olive foliage and softly lit stone. Keep the exquisite hand-painted paper-diorama texture and fine architectural details of the original. Remove the visible sun by transforming it into ambient sky glow; no moon needed. No excessive neon saturation; warm welcoming premium illustrated travel feeling. Upper sky is uncluttered.
Constraints: exact same 1536 by 1024 composition and crop; only time-of-day transformation. Absolutely no text, logos, UI, watermarks or frame.
```
