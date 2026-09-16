export type V3 = [number, number, number];
export type Placement = { position: V3; yaw: number; scale: V3 };
export type WorldData = {
  tiles: { name: string; center: V3; radius: number }[];
  surfaces: { position: V3; half: V3; yaw: number }[];
  parkHulls: V3[][];
  sidewalkHulls: V3[][];
  colliders: { position: V3; half: V3; yaw: number }[];
  benches: { position: V3; yaw: number }[];
  landmarks: { id: string; name: string; position: V3 }[];
  props: Record<string, Placement[]>;
  water: [number, number][][];
  bounds: [number, number, number, number];
};
export const destinations = [
  { name: '外滩 · 江畔', subtitle: '江风与万国建筑', position: [-377, 2, 37] as V3, yaw: -1.5 },
  { name: '和平饭店', subtitle: '石墙里的旧时光', position: [-413, 2, -213] as V3, yaw: 1.5 },
  { name: '外白渡桥', subtitle: '走过苏州河', position: [-425, 2, -630] as V3, yaw: -0.267 },
  { name: '陆家嘴 · 滨江', subtitle: '隔江回望外滩', position: [385, 2, -95] as V3, yaw: 1.5 },
  { name: '上海中心', subtitle: '抬头，城市的高度', position: [1147, 2, 405] as V3, yaw: 1.4 },
];
export const stories: Record<string, string> = {
  'customs-house':
    '沿江抬头，钟楼是外滩最鲜明的轮廓之一。退后几步，把钟楼、石砌立面和江面一起收入取景框。',
  'hsbc-building':
    '穹顶、柱廊与层层展开的石砌立面，构成这座建筑沉稳的节奏。试着沿街移动，观察透视如何变化。',
  'peace-hotel':
    '绿色塔顶标记着南京东路与外滩的交会处。转身望向黄浦江，历史建筑与对岸天际线在这里相遇。',
  'oriental-pearl':
    '球体与立柱构成鲜明的城市剪影。你可以从外滩远望，也可以到陆家嘴滨江近距离观察。',
  'shanghai-tower': '扭转上升的轮廓延伸至天空。沿街绕行，立面的曲线会随着视角逐渐改变。',
  'jin-mao-tower':
    '层叠的塔冠让高楼有了清晰的节奏。它与旁边的两座超高层，共同组成陆家嘴的高空剪影。',
  'world-financial-center':
    '顶部开口是这座建筑最容易辨认的特征。不同位置看到的开口比例，也会随透视改变。',
};

export function inTriangle(x: number, z: number, t: number[][]) {
  const [a, b, c] = t;
  const cross = (p: number[], q: number[]) =>
    (x - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (z - q[1]);
  const u = cross(a, b),
    v = cross(b, c),
    w = cross(c, a);
  return !((u < -1e-6 || v < -1e-6 || w < -1e-6) && (u > 1e-6 || v > 1e-6 || w > 1e-6));
}
export function onWater(x: number, z: number, water: WorldData['water']) {
  return water.some((t) => inTriangle(x, z, t));
}
export function movement(x: number, z: number, yaw: number, speed: number, dt: number): V3 {
  const length = Math.max(1, Math.hypot(x, z));
  return [
    ((x * Math.cos(yaw) + z * Math.sin(yaw)) / length) * speed * dt,
    0,
    ((z * Math.cos(yaw) - x * Math.sin(yaw)) / length) * speed * dt,
  ];
}
export function readVisits(value: string | null): string[] {
  try {
    const data: unknown = JSON.parse(value || '[]');
    return Array.isArray(data)
      ? [
          ...new Set(data.filter((x): x is string => typeof x === 'string' && x.length < 100)),
        ].slice(0, 100)
      : [];
  } catch {
    return [];
  }
}

export type Input = {
  keys: Set<string>;
  stick: [number, number];
  look: [number, number];
  active: boolean;
  sitting: boolean;
  fast: boolean;
  boost: boolean;
  jump: boolean;
  sensitivity: number;
};
export const input: Input = {
  keys: new Set(),
  stick: [0, 0],
  look: [0, 0],
  active: false,
  sitting: false,
  fast: false,
  boost: false,
  jump: false,
  sensitivity: 1,
};
export function clearInput() {
  input.keys.clear();
  input.jump = false;
  input.stick = [0, 0];
  input.look = [0, 0];
}
