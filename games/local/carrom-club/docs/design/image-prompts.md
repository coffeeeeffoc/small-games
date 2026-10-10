# 设计图与素材生成

2026-10-10，使用内置 `image_gen`，未使用 CLI。用户上传图作为风格参考，不作为运行截图或可交互界面。

## 主设计图

产物：`concept.png`。三张390×844比例手机屏并排展示：主页、瞄准对局、练习选关。作为实现前设计依据，实际代码中的棋子数量/位置以规则为准，生成图不作为规则真值。

提示词：

> Use case: ui-mockup. Generate a high fidelity mobile Carrom game design sheet with THREE separate complete portrait phone screen designs side by side, each 390x844 proportion, on a deep dark peacock green backdrop. Reference aesthetic: physical polished walnut carrom board, maple playing surface, four real dark circular corner pockets, fine burgundy carrom court markings, center geometric lotus medallion, realistic ivory white and charcoal black round coins with concentric engraved rings, one red queen, antique brass accents. Screen 1 HOME: elegant CARROM CLUB small serif uppercase brand, large Chinese title 克朗棋, a beautifully lit top-down game board with coins occupying central screen, large gold beveled button 开始对局 near bottom, smaller outlined button 练习选关, tiny help and settings icons. Screen 2 GAMEPLAY: compact opponent seat 阿洛 · 电脑 with black piece 0/9, a LARGE square board nearly full phone width with intact centered 19 coin cluster and striker on bottom baseline, aim dots and gold pullback handle on a lightly translucent area beneath board, below compact player seat 你 · 白子 0/9, gold thumb positioning slider and concise Chinese instruction 回拉瞄准 · 松手击发, proper pause icon two separate parallel solid bars. Screen 3 LEVEL SELECTION: header 练习选关, subtitle 手感，从第一杆开始, six beautiful dark walnut tactile plaques in 2 columns each with a miniature real carrom board diagram and numbered title: 01 轻轻一击, 02 斜线入袋, 03 左右开弓, 04 借库一弹, 05 红后之约, 06 清台时刻. First unlocked others brass padlocks. Bottom back-to-home. Keep every screen polished Chinese mobile videogame interface, no website navigation no dashboards no marketing sections no device mockup chrome. Warm directional lighting and physically tangible layered materials, subtle grain and edge inlay, large touch targets, generous empty felt space, extremely coherent polished game art. Deliver one landscape design sheet showing all 3 portrait screens fully without cropping.

## 运行木纹

产物：`../../assets/wood.webp`。内置生成图片编码成 WebP（质量86，278674字节），左半枫木、右半胡桃木，由Canvas裁切绘制。几何、袋口、棋子、碰撞与反馈全为实际代码；图片只提供木纹。图集失效有程序纹理降级。

提示词：

> Use case: game-material-texture. Create a perfectly flat top-down PBR-style diffuse texture atlas in a square 1024x1024 image split into TWO EXACT EQUAL VERTICAL RECTANGLES with a perfectly straight dividing line at x=512. LEFT HALF: warm honey blonde fine-grain polished maple carrom board plywood, smooth matte waxed wood in natural cream and pale ochre, subtle fine horizontal organic grain, a few delicate wavy wood fibers, high-quality wood toy material. RIGHT HALF: rich dark reddish brown polished walnut hardwood, detailed close natural organic grain and curved fibers, dark chocolate and chestnut color variation, subtle satin polish but NO reflections or directional shadows. Both materials need natural photographic microtexture, elegant old tabletop game wood. NO objects, no board, no pockets, no text, no borders, no vignette, no perspective, no planks, no knots, no illumination gradients. This is an actual usable game texture atlas, not a UI mockup.
