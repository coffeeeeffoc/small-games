export const layouts = [
  {
    id: 'first-push',
    name: '初入江湖',
    hint: '先推远，再抓住靠边的机会',
    points: [
      [0, 90],
      [28, -72],
      [-86, -32],
    ],
  },
  {
    id: 'triangle',
    name: '三足鼎立',
    hint: '站稳脚跟，寻找碰撞角度',
    points: [
      [0, 94],
      [82, -48],
      [-82, -48],
    ],
  },
  {
    id: 'chain',
    name: '一箭双雕',
    hint: '找准夹角，试试一弹双飞',
    points: [
      [0, 55],
      [-21, -122],
      [21, -122],
    ],
  },
  {
    id: 'edge',
    name: '临渊一弹',
    hint: '红方靠边，你也要留有余地',
    points: [
      [0, 70],
      [60, -118],
      [-80, -20],
    ],
  },
  {
    id: 'cross',
    name: '左右逢源',
    hint: '两侧来敌，落点也是防守',
    points: [
      [0, 30],
      [110, -25],
      [-110, -25],
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
      if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) > 136)
        throw new Error('起始圆盘超出安全区域');
      for (const [a, b] of item.points.slice(0, i))
        if (Math.hypot(x - a, y - b) < 40) throw new Error('起始圆盘重叠');
    });
  }
  return items;
}
validateLayouts(layouts);
