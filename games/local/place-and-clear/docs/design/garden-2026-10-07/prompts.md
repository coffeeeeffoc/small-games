# 图像生成记录

工具：内置 image_gen，先生成效果图，再实施。无 CLI 或外部付费 API。

## concept.png

Four screen mobile game concept, each 390:844 portrait: HOME, ENDLESS, PLAY, LEVELS. 三块选两块, soft tactile toy-block garden, sage/mint sky, buttercream clouds, distant scalloped hills, deep forest-green rounded Chinese title, chunky coral buttons, coral/mint/gold beveled blocks. Home features a floating L and square block on a garden pedestal, chapter progress, start, levels and endless buttons. Endless shows 三选二 and 立即补位 with separate playable starts and local records; classic online is secondary. Play keeps a large readable flat 8×8 board, three candidates, score and pause; no UI obstruction. Levels show normal chapter/unlock/stars. Phone safe areas and 44px targets, concise Chinese, no dashboard. Illustrated garden art direction, tactile shadows, cohesive game surfaces.

具体图中文字／示例成绩只为视觉示意，实现使用实时数据，不展示虚构纪录。

## 第一版 garden.png（已由第二版替换）

以四联效果图作为风格参考，生成单张竖屏游戏背景：浅薄荷天空，顶部大面积低对比留白，小朵奶油云，边角树叶；远处绿色山丘、草地、底部沙色小路、少量雏菊。中央80%保持简洁以容纳真实UI。不要文字、标题、按钮、卡片、棋盘、悬浮积木或底座。保持手绘3D休闲花园风格。不透明背景。

## native/assets/art/hero.png

以首页效果图作为风格参考，生成透明背景4:3积木插画：珊瑚色三格L块向左倾、薄荷色2×2块向右倾，悬浮在浅奶油色圆形石台上，三颗金星，少量绿叶和底部白色雏菊。柔和立体玩具材质与接触阴影。完整物体、窄透明边距；无场景背景，无文字／标识／数字／UI，石台不刻字。保留真实alpha。

第一版两张PNG由Web与原生Canvas共用，总计3,277,218字节；未额外加入运行时美术依赖。原图均由内置image_gen生成并复制进仓库。


## 第二版生成记录 · 2026-10-08

仍使用内置 image_gen，以原 concept.png 作为风格参考，生成后复制原始 PNG 至 native/assets/art/。没有以新概念图替代用户认可的参照。

### logo.png

Create one production-ready transparent PNG game logo asset for the Chinese mobile block puzzle in the reference. Reference image is a four-panel game concept: focus ONLY on the thick rounded dark forest-green Chinese title at top of the FIRST panel. Make a faithful standalone version of that title. Exact Chinese text, two centered lines: first line 三块 ; second line 选两块 . Broad chubby handcrafted Chinese glyphs, matte softly lit 3D toy lettering, deep forest green faces, a chunky contiguous cream biscuit outline with softly bevelled edges and very short warm beige extrusion, delicate contact shadow. One tiny green leaf at right of first line. Match the reference's friendly rounded sculptural lettering, not a standard outlined font. Composition width to height 1.45:1, title fills 94 percent of canvas, minimal transparent padding. No backdrop, no pedestal, no extra words, no English, no UI. Real alpha transparency outside the title. Output roughly 768 by 512.

生成原件：exec-291f8601-9dfc-4295-963c-d9bbc5b4a37a.png。请求透明背景，保留生成的 alpha；实际输出为1536×1024、2,104,384字节。

### garden.png（当前版本）

Create a single portrait 9:19.5 background art asset for this mobile garden block puzzle, faithful to the supplied four-panel concept. Use the environment of the FIRST and FOURTH panels as reference. REMOVE ALL UI, ALL LETTERING, logo, pedestal, toy blocks, cards, numbers, buttons and signs. Only the magical miniature garden scene remains. Composition must be designed for a full-phone game backdrop: leafy canopy intruding from BOTH upper corners and leafy daisies in both lower corners; pale muted turquoise sky limited to top 22 percent; distant soft forest-green mountains and treetops at 18-32 percent height, wooden garden fence at 35-48 percent height, and a meandering warm tan garden path beginning near center at 35 percent height and widening down to the bottom. Garden greenery, small white daisies, rounded stones on either side of the path, low rolling lush hills, intimate handcrafted miniature world. Bright warm daylight, tactile soft 3D storybook diorama matching reference, softly rounded plants, detailed yet uncluttered, calm diffuse shadows. The central path has low detail to allow readable overlays, while decorative flowers frame the left and right edges. Essential: do NOT leave a big empty blue sky in the center; garden scenery fills 75 percent of screen. No text or letters anywhere, no UI, no squares, no platforms. High quality but modest output dimensions around 800x1696.

生成原件：exec-fcd392bd-f43e-4113-9e9d-97d83177b5d2.png。不透明背景。
