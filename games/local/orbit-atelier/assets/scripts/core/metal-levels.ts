import { METAL_GAP, type WireRing, type WireSpec, type Vec3 } from './metal.ts';

/** New physical catalog keeps every legacy level ID and save separate. */
export interface MetalLevel {
  id: string;
  name: string;
  chapter: 1 | 2;
  campaign: 'metal';
  intro: string;
  rings: WireRing[];
  goalRingIds: string[];
  parMoves: number;
  revision: number;
}
type Piece = {
  shape: WireSpec['shape'];
  r?: number;
  aspect?: number;
  length?: number;
  angle?: number;
  gap?: number;
  exit?: Vec3;
};
const circle: Piece = { shape: 'circle' };

/** Adjacent orthogonal loops share the extraction axis, 1.2 R apart (a Hopf chain).
 * Consecutive loops link without intersecting; only the exposed end can pass its rear opening.
 */
function chain(
  index: number,
  name: string,
  axis: 'x' | 'y' | 'z',
  pieces: Piece[],
  intro: string,
): MetalLevel {
  const direction: Vec3 = { x: 0, y: 0, z: 0 };
  direction[axis] = 1;
  const planes: WireSpec['plane'][] =
    axis === 'x' ? ['xy', 'xz'] : axis === 'y' ? ['yz', 'xy'] : ['xz', 'yz'];
  const rings = pieces.map((piece, i): WireRing => {
    const plane = planes[i % 2];
    const positive = axis === 'z' || (axis === 'y' && plane === 'xy') ? Math.PI / 2 : 0;
    const fixed = i === 0;
    return {
      id: fixed ? 'base' : i === 1 ? 'goal' : `link-${i}`,
      x: axis === 'x' ? i * 76.8 : 0,
      y: axis === 'y' ? i * 76.8 : 0,
      r: piece.r ?? 64,
      gap: piece.gap ?? (fixed ? 0 : METAL_GAP),
      angle: piece.angle ?? (i > 1 ? positive + Math.PI / 2 : positive),
      tilt: 0,
      color: fixed ? '#caa46a' : i === 1 ? '#87c5c6' : '#a7b5ca',
      wire: {
        shape: piece.shape,
        plane,
        z: axis === 'z' ? i * 76.8 : 0,
        exit: { ...(piece.exit ?? direction) },
        ...(fixed ? { fixed: true } : {}),
        ...(piece.aspect === undefined ? {} : { aspect: piece.aspect }),
        ...(piece.length === undefined ? {} : { length: piece.length }),
      },
    };
  });
  return {
    id: `metal-${String(index).padStart(2, '0')}`,
    name,
    chapter: index <= 6 ? 1 : 2,
    campaign: 'metal',
    intro,
    rings,
    goalRingIds: ['goal'],
    parMoves: rings.length - 1,
    revision: 1,
  };
}

export const METAL_LEVELS: MetalLevel[] = [
  chain(1, '第一对圆环', 'x', [circle, circle], '转动星标圆环，让小开口朝向底环，再沿箭头抽离。'),
  chain(
    2,
    '换个方向',
    'z',
    [circle, { ...circle, angle: Math.PI / 3 }],
    '观察垂直相扣的真实圆环；箭头在三维空间中改变了方向。',
  ),
  chain(3, '先拆外环', 'x', [circle, circle, circle], '先抽离最外侧圆环，再取出星标目标。'),
  chain(
    4,
    '竖向三环',
    'y',
    [circle, circle, { ...circle, r: 58 }],
    '大小圆环交错穿扣，开口仍然只有二十四度。',
  ),
  chain(
    5,
    '四环接力',
    'x',
    [circle, circle, circle, circle],
    '从自由端逐只拆开，固定底环留在原位。',
  ),
  chain(
    6,
    '转向四环',
    'z',
    [circle, circle, circle, { ...circle, r: 58 }],
    '沿另一条空间轴观察四环的先后关系。',
  ),
  chain(
    7,
    '长圆环',
    'x',
    [circle, { shape: 'oval', aspect: 1.5 }],
    '长圆环的两侧更长，碰撞仍按真实轮廓检查。',
  ),
  chain(
    8,
    '开口长叉',
    'x',
    [
      { shape: 'oval', aspect: 1.5 },
      { shape: 'u', length: 64 },
    ],
    'U 形件只有两条直臂和弯底，朝开口的反方向抽出。',
  ),
  chain(
    9,
    '焊杆底环',
    'x',
    [{ shape: 'stem', angle: Math.PI / 2, length: 56 }, circle],
    '底环连着真实焊杆；星标圆环必须避开杆身。',
  ),
  chain(
    10,
    '长叉与焊杆环',
    'x',
    [
      { shape: 'u', angle: Math.PI / 2, length: 56 },
      { shape: 'stem', length: 45, gap: 0, exit: { x: 0, y: 1, z: 0 } },
      { ...circle, angle: 0 },
    ],
    '先拆外围圆环，再把闭合的焊杆环沿 U 形长叉的直臂抽出。',
  ),
  chain(
    11,
    '长环套长叉',
    'x',
    [circle, { shape: 'u', length: 56 }, { shape: 'oval', r: 56, aspect: 1.4 }],
    '先解最外侧长圆环，星标长叉才能越过底环。',
  ),
  chain(
    12,
    '异形连环',
    'x',
    [
      { shape: 'stem', angle: Math.PI / 2, length: 48 },
      circle,
      { shape: 'u', length: 52 },
      { shape: 'oval', r: 52, aspect: 1.45 },
    ],
    '焊杆、长叉与长环组成空间连环，从自由端拆到星标目标。',
  ),
];
