// Every solid uses the same axis-aligned rectangle for rendering and collision.
export const WORLD = { w: 400, h: 550, floor: 522 };
const edge = (id, to, x, y, push) => ({ id, to, x, y, push, hp: 3, capacity: 40 });
const plate = (id, name, x, y, w, h, mass, edges) => ({ id, name, x, y, w, h, mass, edges, target: true });
const pillar = () => ({ id: 'blue', name: '承重柱', x: 134, y: 414, w: 36, h: 108, mass: 0, anchored: true, capacity: 5, protected: true, impactLimit: 4000, edges: [] });
const foundation = { id: 'ground', name: '地基', x: 0, y: 522, w: 400, h: 28, mass: 0, anchored: true, edges: [] };
const lower = (mass = 4) => [
  plate('beam', '横梁', 132, 326, 136, 56, mass, [edge('beam-L', 'blue', 150, 396, 150), edge('beam-R', 'prop', 254, 396, -150)]),
  plate('prop', '右支柱', 244, 430, 34, 58, 1, [edge('prop-R', 'ground', 260, 498, -150)]),
];
export const LEVELS = [
  {
    title: '先卸重，再动柱', short: '卸重', label: '01 / 结构课',
    tip: '先凿上方两块，等它们落下，再拆右支柱。',
    lesson: '两侧各承重 4。先拆右柱，左柱就要承重 8，超过上限 5。',
    nodes: [foundation, pillar(), ...lower(),
      plate('upperL', '上层左板', 96, 232, 64, 64, 2, [edge('upperL-R', 'beam', 143, 309, -165)]),
      plate('upperR', '上层右板', 244, 232, 64, 64, 2, [edge('upperR-L', 'beam', 258, 309, 165)]),
    ], obstacles: [],
  },
  {
    title: '花瓶还在里面', short: '花瓶', label: '02 / 落点课',
    tip: '上板先凿左缝，再凿右缝，让最后一锤把它推向左。',
    lesson: '最后切断哪侧，板就被推向另一侧。别让整板滑进花瓶。',
    nodes: [foundation,
      plate('shelf', '下层托板', 144, 326, 120, 52, 2, [edge('shelf-R', 'stand', 258, 394, -150)]),
      plate('stand', '下层支柱', 186, 432, 44, 54, 1, [edge('stand-R', 'ground', 208, 498, -150)]),
      plate('top', '花瓶上方墙板', 192, 166, 114, 60, 2, [edge('top-L', 'shelf', 204, 249, 165), edge('top-R', 'shelf', 292, 249, -165)]),
    ], obstacles: [{ id: 'vase', name: '青瓷花瓶', kind: 'vase', x: 335, y: 469, w: 34, h: 53, impactLimit: 60, protected: true }],
  },
  {
    title: '隔壁的墙也要好好的', short: '邻墙', label: '03 / 综合课',
    tip: '先卸上面四块；右侧墙板最后凿右缝，把它们推向左。',
    lesson: '既要给左柱减重，也要避开右侧邻墙。拆下的板仍然会撞东西。',
    nodes: [foundation, pillar(), ...lower(2),
      plate('upperL', '左中板', 96, 232, 64, 64, 2, [edge('upperL-R', 'beam', 143, 309, -165)]),
      plate('upperR', '右中板', 244, 232, 64, 64, 2, [edge('upperR-L', 'beam', 250, 309, 165), edge('upperR-R', 'beam', 318, 309, -165)]),
      plate('capL', '左顶板', 92, 104, 60, 52, 1, [edge('capL-R', 'upperL', 140, 178, -165)]),
      plate('capR', '右顶板', 244, 104, 60, 52, 1, [edge('capR-L', 'upperR', 244, 178, 165), edge('capR-R', 'upperR', 316, 178, -165)]),
    ], obstacles: [{ id: 'neighbor', name: '邻居的墙', kind: 'wall', x: 370, y: 214, w: 20, h: 308, impactLimit: 70, protected: true }],
  },
];
