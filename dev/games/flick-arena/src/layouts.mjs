export const layouts = [
  {
    id: 'first-push',
    name: '初入江湖',
    hint: '先接近，再把对手一步步逼向边缘',
    points: [
      [0, 96],
      [87, -46],
      [-82, -53],
    ],
  },
  {
    id: 'triangle',
    name: '三足鼎立',
    hint: '站稳脚跟，寻找侧击的角度',
    points: [
      [-12, 96],
      [91, -36],
      [-77, -61],
    ],
  },
  {
    id: 'chain',
    name: '借力打力',
    hint: '错开站位，观察碰撞后的落点',
    points: [
      [25, 93],
      [72, -67],
      [-95, -20],
    ],
  },
  {
    id: 'edge',
    name: '临渊一弹',
    hint: '把对手逼到边缘，自己留出退路',
    points: [
      [-25, 93],
      [96, -22],
      [-61, -76],
    ],
  },
  {
    id: 'cross',
    name: '左右逢源',
    hint: '两侧来敌，抢到好位置再出手',
    points: [
      [0, 98],
      [91, -37],
      [-83, -54],
    ],
  },
];
export function validateLayouts(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('摆位目录不能为空');
  const ids = new Set();
  for (const item of items) {
    if (!item.id || ids.has(item.id) || !item.name || !item.hint || item.points?.length !== 3)
      throw new Error('摆位格式或 ID 无效');
    ids.add(item.id);
    item.points.forEach(([x, y], i) => {
      if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) > 105)
        throw new Error('起始圆盘超出安全区域');
      for (const [a, b] of item.points.slice(0, i))
        if (Math.hypot(x - a, y - b) < 150) throw new Error('起始圆盘需要留出接近空间');
    });
  }
  return items;
}
validateLayouts(layouts);
