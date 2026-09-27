Use case: ui-mockup
Asset type: one final gameplay concept image for a standalone Chinese mobile web game, portrait 9:16.
Primary request: create a polished yet implementable gameplay screen for 天气指挥部 / Weather Command. Warm retro weather station enamel tabletop canal toy, strictly orthographic top view, shallow physical thickness, warm ivory frame, dark navy ink, turquoise shallow water, orange-red supply boat, honey wood gate. Refined editorial typography and tactile paper/enamel textures, not a weather dashboard.
The actual puzzle is a 7 by 7 tile board. Walls are ivory raised blocks. Here is the EXACT geometry (# wall, . water, S boat, D dock, W breakable wooden gate):
#######
#######
#...D##
#.##.##
#.##W##
#S....#
#######
Draw a single connected rectangular ring canal with an extra one-cell tail to the right of the lower-right turning point. Boat starts at left end of bottom canal. Dock at top right. Wooden gate in right vertical canal just above bottom turning point. No islands or extra disconnected canals. Walls may merge into elegant solid shapes.
Show shallow water after rain, the orange boat visibly floating. A rightward translucent wind arrow and three-cell path from boat to the bottom-right turning point previews a precise stop BEFORE the one-cell tail. The route and the gate remain unobscured. Small water-level gauge.
UI exact Chinese: top small "WEATHER COMMAND", main title "天气指挥部"; "02 / 分岔航道"; "剩余 2 次"; brief hint "拖动小船，决定风向". Four large bottom touch buttons labelled "雨" with "涨水 · 融雪", "风" with "拖动定向", "太阳" with "退水 · 融雪", "雪" with "结冰 · 长滑". Small footer controls "撤销", "重来", "静音". No confirmation dialog, no double-click instruction.
Lighting: soft daylight, warm ivory with tiny mustard and orange accents, restrained maritime teal. Ship, wooden gate and dock are the three main eye-catching objects. Board fills most of screen, touch controls spacious and feasible in SVG and CSS.
Avoid: mobile device mockup, hands, advertising copy, gradients on every panel, glossy purple, futuristic HUD, photoreal fluid, isometric occlusion, extra paths, charts, stats cards, invented gameplay, English-only UI.

生成记录：使用内置 image_gen，2026-09-27。最终文件为 concept.png，已实际打开检查。视觉方向、单船、环形双路、末端延伸、木栅和四种天气与玩法一致；生成图的格子比例、落点箭头及装饰文字不作为精确关卡规范。实际 7×7 地形与落点由 levels.mjs / rules.mjs 决定，真实画面见 playtest-desktop.png、playtest-mobile.png。
