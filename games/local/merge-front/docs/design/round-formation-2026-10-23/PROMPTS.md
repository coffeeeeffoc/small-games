# 图像生成提示词

工具：内置 image_gen；未使用 CLI/API fallback。生成日期：2026-10-23。

最终图像以同目录三张 PNG 为准。以下保留完整提示词链；初稿仅作为生成参考，没有复制到正式效果图目录。

## 整备：初稿

```text
Use case: ui-mockup. Create ONE polished, implementation-plausible landscape mobile game screenshot concept for the PREPARATION screen of the Chinese mythological auto-battler 神机合阵. Canvas wide landscape, approximately 1920 x 896, suitable for a phone held horizontally. Full-bleed game screen only, no phone frame, no presentation page, no multiple panels.

Art direction: beautiful readable 2.5D painted game art, restrained Chinese mythological fantasy, cel-shaded chibi gods and mobile bronze machines on an expansive pale sandstone floating-island arena, jade stone perimeter, small moss accents, distant light cloud sea. Deep jade UI with slim warm gold trim, ivory Chinese text, warm amber primary action. Reuse the overall Chinese jade-island theme of this game's previous design, but make the field broad and the controls sparse. Characters must be attractive and readable at mobile scale, clear silhouettes and ground contact shadows, not tiny indistinct figurines. This is an actual game screen mockup with sensible controls, not marketing artwork.

LAYOUT, STRICT: slim top HUD 0-9% of image, main walkable battlefield x5%-95%, y12%-79%, lower compact floating hand area y81%-98%. Wide open rectangular two-dimensional arena with absolutely NO grid, NO hex cells, NO permanent deployment slots, NO three-lane markings, NO vertical center divider. BOTH crystal ground bases align on the exact horizontal midline of the walkable arena, at y45.5%; own jade crystal at x8%, enemy ruby crystal at x92%. Match their base centers, scale, perspective. Crystals are at opposite ends, not together in the screen center. Do not put either crystal along the bottom edge.

PREPARATION CONTENT: top left compact jade crystal icon with a teal health bar and '20'; top center '第3回合' with smaller '整备'; top right red crystal health bar with '18', then one small gear button at the far corner. Keep everything in safe margins. On our left half show exactly three deployed actual units spaced vertically: red-ribbon spear fighter 哪吒 near x38%,y26%; sturdy bronze shield guardian near x39%,y60%; a mobile bronze wheeled cannon near x25%,y44%. These are real standing unit portraits/models, NOT rectangles or card slots. Each has a fine jade team ring. Opponent side contains four faint but visible red-tinted formation previews at upper, middle and lower positions x65%-80%,y24%-70%. Make broad traversable space both above and below the crystals.

Show ONE clear drag-in-progress interaction: a real illustrated 离火轮 card lifted above the bottom hand near x49%,y76%, with a very subtle curved gesture trail ending at a translucent unit preview near x29%,y69%. The preview has a single soft jade footprint. A modest translucent jade wash marks just our legal deployment area WHILE this card is being dragged. No drawn human hand, no explanatory paragraphs, no pointer blocking the art. Keep the dragging card distinguishable from placed units.

Bottom left show coin icon + '12' and a small troop icon + '3/6', with one compact supply icon (a small pack of cards with plus) and price '3'. Bottom center show ONLY TWO other genuinely owned illustrated cards, closely grouped, one named '哪吒' and one '玄甲卫', each with a small '1' level badge. These and the floating 离火轮 card are the entire hand, not a full-width grid. There must be NO empty card outlines, NO placeholder outlines, NO disabled grey cards, NO empty bench pedestals, NO dotted card slots. The space either side of the actual cards remains open scenery. Bottom right a single clear rounded amber button '开战', with a small forward triangle icon. Cards have bold character artwork and very little text.

Typography must be clean and correctly spelled Chinese. Only short labels specified above. No 填入残字, 调整残字, 取回残字, 待拼装, 等待部署, loading text, English, tutorial blocks, stats tables, permanent slot placeholders. Preserve useful negative space, generous touch targets, premium but restrained game UI.
```

## 整备：最终局部修正

```text
Use case: precise-object-edit. Edit this preparation-screen mockup with ONLY two local corrections; preserve its wide landscape dimensions, entire art style, all UI, exact Chinese words, card illustrations, three deployed characters, enemy previews, stage geometry and composition.
1. The translucent aqua drag-placement ghost on the lower-left of the arena currently incorrectly resembles the wheeled cannon. Replace ONLY this ghost silhouette with a single upright circular bladed mechanical fire wheel matching the floating card labeled 离火轮. The ghost must clearly be the same circular wheel unit illustrated on the dragged card. Retain its ground ring and the curved aqua drag trail.
2. The bases of the large left jade and right ruby crystals should both sit on the horizontal centerline of the WALKABLE arena: the floor runs roughly y150 to y600 in this image, so move BOTH crystal-and-base assemblies slightly down, about 30 pixels, keeping them horizontally opposite. Their ground centers must align around y375, not the bottom of the stage. Integrate the platform edges cleanly. Do not move the HUD crystal icons.
No other changes. No extra text or slots.
```

## 战斗：由整备图生成

```text
Use case: ui-mockup. Transform the provided PREPARATION game-screen reference into the BATTLE screen of exactly the same Chinese mythological mobile game 神机合阵. This is one full-bleed wide landscape mobile screenshot, same aspect ratio and high-quality 2.5D painted game art as the reference, not a collage or a poster. Preserve the character identities, jade/bronze/amber UI style, cloud-island sandstone arena and readable chibi silhouettes.

The battle has begun, roster locked. Remove ALL bottom cards, supply button, coin display, troop counter, play button, translucent placement ghost, drag trail, green half-arena selection tint, and red formation-preview silhouettes. Do not leave empty docks, dark panels or slots where controls were removed. Expand the actual playable arena into the freed lower area: broad usable pale sandstone floor from y13% to y91%, with narrow jade rims and cloud scenery beyond. Field must have no grids, no lanes, no center divider. The left JADE crystal's ground center is x8%,y52%, and the right RUBY crystal's ground center x92%,y52%, exactly the vertical midpoint of this expanded walkable field. Both crystals and their bases equal scale and exact same y. Keep the bases modest so troops can walk above and below them.

Maintain the same slim top HUD: jade crystal icon and full health bar with '20' at upper left, ruby icon and health bar with '18' at upper right. Center: '第3回合', beneath it a tiny closed-lock icon and the short label '战斗', then a discreet '00:18'. At far top right replace the gear with a single pause button featuring exactly two equal-width, equal-height separated solid vertical bars. Only one pause button. No paragraphs, instructions, big phase banners, English, floating damage-number spam, skill controls, or card frames.

Show exactly four distinct allied battle units and four distinct enemies occupying upper, middle and lower portions of the whole arena. All allied units have subtle teal base rings and small teal HP bars; enemies have coral base rings and small coral HP bars. In the upper third near x45%,y29%, red-ribbon spear hero 哪吒 from the reference is engaging the enemy horned swordsman near x56%,y28% with a small readable crescent slash. Mid-left x30%,y46%, the recognizable bronze wheeled cannon aims a single restrained projectile diagonally at an enemy staff-wielding caster near x66%,y43%. Lower-center near x45%,y70%, the bronze shield guardian from the reference intercepts the large enemy bronze automaton near x57%,y72%, with a small shield impact. The fourth ally is the single upright flaming mechanical wheel from the 离火轮 card, advancing diagonally from x36%,y80% toward an enemy mage at x74%,y75%. Distinct tactical encounters across both upper and lower regions, not a single horizontal collision line. Keep enough distance to see units and cause/effect, no huge glowing blast obscuring models. Leave navigable space around the crystals, do not pack everyone near one crystal. No extra allies, duplicates or summons; this is one unit per deployed card. No controllable characters being dragged during battle.

Make it look like a legible live battle in the same game, with cohesive finished art and responsive phone UI.
```

## 战斗：最终水晶位置修正

```text
Use case: precise-object-edit. Make one exact geometry correction to this battle screenshot. Preserve everything else byte-for-byte in appearance: characters and their eight identities and positions, effects, terrain, UI, Chinese text, art style, aspect ratio and colors.
The ground centers of the two large arena crystals are still slightly above the playable floor's centerline. The floor extends from approximately y170 to y780 in this reference image. Relocate the ENTIRE left jade crystal with its circular stone foundation and the ENTIRE right ruby crystal with its circular stone foundation downward by about 60 image pixels so their ground-contact base centers are both at y475 (roughly 55% of image height), the midpoint of the playable arena. Keep their x positions unchanged. Their crystal tips naturally extend above this line; it is the ground centers that must be centered. Repair the old areas and attach the moved circular foundations naturally to the island sides, leaving equally usable battlefield space above and below. Do not create duplicate crystals or abandoned foundations. Do not move the small HUD crystals. No other changes.
```

## 暂停：由战斗图生成

```text
Use case: ui-mockup. Create the PAUSED state of this exact supplied battle screenshot for 神机合阵. Same wide landscape dimensions and art style. Preserve the battlefield, all eight characters, positions, visible frozen effects, top HUD and timer as the background. First align the two arena crystals' GROUND BASE CENTERS to the exact vertical midpoint of the walkable floor, around image y475 (55% of image height), by moving their entire large crystal and circular foundation assemblies down about 60 pixels, same x, cleanly repair old locations; do not move the small HUD crystals.

Place a single uniform translucent deep-jade scrim over the entire scene, darkening background about 50% while leaving the crystals and broad battlefield visible. Everything beneath is frozen and inactive. Add ONE compact modal panel centrally, approximately x34%-66%, y23%-77%. Deep matte jade, delicate antique gold border, softly rounded corners and restrained Chinese corner ornament, not heavy decorative clutter. This is the only active interaction area. No buttons floating outside the modal, no ad button, no additional side panels.

Inside the panel, centered:
- At top, medium ivory Chinese title exactly '暂停'.
- In the upper middle, one large amber rounded primary button occupying most panel width, with a clean filled right-pointing triangle and exactly '继续'. It is the strongest action visually.
- Below, a single evenly spaced row of three generous square icon controls: a cog for settings, a circular restart arrow, and a house for return home. Each has a very small readable two-character caption underneath, respectively '设置', '重开', '返回'. Use unambiguous coherent pictogram shapes. No fourth button.
Nothing else: no paragraph, no tip, no '调整阵容', no gameplay instructions, no stats, no card slots, no dismiss x, no extra resume button. Maintain comfortable touch spacing, clean visual hierarchy, enough breathing room. Small concise captions clarify consequential secondary actions without filling the modal with text. Foreground text and icons are razor clear; background remains readable but subdued. Full-bleed game screen only, no device frame, concept board, or external annotation.
```

