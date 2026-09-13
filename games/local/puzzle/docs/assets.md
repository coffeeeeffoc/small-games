# 原创视觉素材

由内置 `image_gen` 工具生成，未使用 CLI/API 回退。两张均已目视检查；原始生成文件保留在 Codex generated_images 中，项目仅引用以下本地副本。

| 素材 | 项目文件 / 绝对路径 | 尺寸 | 用途 |
| --- | --- | --- | --- |
| 阅档室案发现场 | `public/assets/scene.png` / `F:/playground/playground-ai/puzzle/public/assets/scene.png` | 1536 × 1024 PNG | 3:2 场景背景，编号与可交互热点由 HTML 叠加 |
| 四人肖像联排 | `public/assets/portraits.png` / `F:/playground/playground-ai/puzzle/public/assets/portraits.png` | 1536 × 1024 PNG | 林岑、周屿、许曼、沈砚，等宽四列 |

## 场景使用说明

原始画面坐标，左上为 (0%, 0%)：

- 窗 (21, 24)，窗帘 (6, 30)，手机 (43, 48)，原账 (50, 46)。
- 相框 (62, 46)，铜镇纸 (94, 48)，门 (83, 29)，钟 (56, 8)，覆盖遗体 (48, 80)。
- 放大查看必须用明确编写的证据界面显示真实线索。背景钟面、账本文字、相框只是氛围插图，不作为 20:42 / 09.17 等信息来源。
- 保持 3:2 图像比，或在裁切 / 横向拖动时同步计算热点位置。

肖像四列按左到右使用 `background-size: 400% auto` 与 `background-position-x: 0%, 33.333%, 66.667%, 100%`；纵向裁切保留原始比例，避免压扁人物。现场钟面叠加原生 SVG 指针，使背景与检视内容的20:42一致。

## 字体

`public/assets/case-serif.woff` 为 Noto Serif SC 的本地字体子集（208,560 字节），覆盖案件中文与标题。由 Google Fonts 官方字体文件用 fontTools 做字形子集，采用 SIL Open Font License 1.1，全文见 `public/assets/OFL.txt`。原始来源：`https://fonts.googleapis.com/css2?family=Noto+Serif+SC`；许可证来源：`https://raw.githubusercontent.com/notofonts/noto-cjk/main/Serif/LICENSE`。运行时不请求外部字体服务。

## 生成提示词

### scene.png

Use case: stylized-concept.
Asset type: original background for a mobile-browser Chinese noir detective game, with clickable numbered hotspots to be overlaid later.
Primary request: cinematic museum archive office crime investigation scene, landscape aspect ratio 3:2, detailed stylized photorealism, no UI, no readable text, no watermark.
Composition: a single coherent wide room seen from slightly raised eye level, no fisheye. Tall rain-streaked window at left upper (x20%, y28%); heavy dark curtain at far left; old wooden desk central (x48%, y60%) with mobile phone, one small white standing photo frame, and an open paper ledger as distinctly separate visible objects. Wooden cabinet with a brass paperweight at right middle (x82%, y58%). Closed dark automatic door at upper right (x85%, y25%). A completely shrouded human-sized body under an opaque dark grey sheet in lower center foreground (x42%, y80%), dignified, non-graphic, no blood or visible injuries. A wall clock upper center (x54%, y20%), plain face without readable words.
Lighting and mood: moody deep blue slate shadows, amber desk lamp providing warm tactile pools of light, rainlight reflected on polished wooden floor, restrained suspenseful film still, realistic textures, subtle 35mm grain. Objects and clues must remain bright and legible at phone size; avoid crushed blacks. Show the whole desk surface and window base.
Constraints: no characters standing in room, no detective, no hands, no weapon closeup, no gore. Keep each requested object physically distinct and at specified rough composition, no labels or infographic markers.

### portraits.png

Use case: stylized-concept.
Asset type: one original cinematic character portrait contact sheet for a Chinese noir mobile detective game.
Create exactly FOUR equal-width vertical portrait panels, side by side in a SINGLE landscape 3:2 image. Each panel has one fictional Chinese adult, chest-up portrait, looking toward camera with subtle reserved tension, face and shoulders centered within its own quarter of the image. Keep all four heads the same size and height, fully inside panel; exact even panels edge-to-edge, no gutters, no border.
Left to right: 1) a 32-year-old woman with short straight black bob hair, dark tailored blazer and ivory shirt, intelligent and composed; 2) a 28-year-old man with slightly messy black hair, dark casual overshirt and a visible camera strap, worried; 3) a 36-year-old woman with tied-back black hair, light beige conservation coat, thoughtful guarded expression; 4) a 43-year-old man with short black hair, plain dark museum security uniform without badges or writing, stern tired face.
Style: cinematic stylized photorealism, elegant noir editorial portraits, subtle 35mm film grain, realistic Chinese faces with individual distinct features, deep blue-grey museum background with soft amber rim lighting consistent across all panels, bright legible faces at mobile thumbnail size.
No text, no names, no numerals, no UI, no watermarks, no logos, no recognizable real people.
