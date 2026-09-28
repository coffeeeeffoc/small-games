export type Point = { x: number; z: number };
export type Kind = 'light' | 'heavy' | 'turret' | 'rescue' | 'escort';
export type Language = 'zh' | 'en';
export const MAP = { halfWidth: 115, halfDepth: 72 };
export const WEAPONS = [
  {
    id: 'rapid',
    name: ['速射炮', 'Rapid'],
    interval: 0.12,
    flight: 0.2,
    damage: 8,
    radius: 0.5,
    ammo: Infinity,
    heat: 6,
    armor: 0.2,
    automatic: true,
  },
  {
    id: 'blast',
    name: ['爆破炮', 'Burst'],
    interval: 0.8,
    flight: 0.55,
    damage: 35,
    radius: 2.4,
    ammo: 40,
    heat: 15,
    armor: 0.65,
    automatic: true,
  },
  {
    id: 'heavy',
    name: ['重型炮', 'Heavy'],
    interval: 3,
    flight: 1.05,
    damage: 140,
    radius: 5,
    ammo: 6,
    heat: 0,
    armor: 1,
    automatic: false,
  },
] as const;
export const UNITS = {
  light: {
    hp: 32,
    radius: 0.9,
    speed: 2.2,
    damage: 8,
    range: 19,
    heat: 0.78,
    assetId: 'vehicle.light',
  },
  heavy: {
    hp: 180,
    radius: 1.6,
    speed: 0.75,
    damage: 18,
    range: 24,
    heat: 0.85,
    assetId: 'vehicle.heavy',
  },
  turret: {
    hp: 90,
    radius: 1.4,
    speed: 0,
    damage: 14,
    range: 24,
    heat: 0.6,
    assetId: 'vehicle.turret',
  },
  rescue: {
    hp: 260,
    radius: 1.5,
    speed: 0.85,
    damage: 0,
    range: 0,
    heat: 0.7,
    assetId: 'vehicle.rescue',
  },
  escort: {
    hp: 160,
    radius: 1.3,
    speed: 0.85,
    damage: 0,
    range: 0,
    heat: 0.7,
    assetId: 'vehicle.escort',
  },
} as const;
export const ROUTE: Point[] = [
  { x: -92, z: 34 },
  { x: -75, z: 34 },
  { x: -63, z: 20 },
  { x: -68, z: 4 },
  { x: -55, z: -12 },
  { x: -36, z: -12 },
  { x: -22, z: 1 },
  { x: -8, z: 1 },
  { x: 8, z: 1 },
  { x: 23, z: -14 },
  { x: 39, z: -14 },
  { x: 49, z: -32 },
  { x: 66, z: -32 },
  { x: 78, z: -18 },
  { x: 87, z: -18 },
  { x: 94, z: -6 },
];
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
export const ROUTE_LENGTH = ROUTE.slice(1).reduce((n, p, i) => n + distance(ROUTE[i], p), 0);
export const HOLD_POINTS = [ROUTE_LENGTH * 0.28, ROUTE_LENGTH * 0.64];
export const PROTECTED = [{ x: -38, z: 25, radius: 8, assetId: 'zone.shelter' }];
export const SECTORS = [
  { end: 0.28, name: ['西岭盘山路', 'WESTERN SWITCHBACKS'] },
  { end: 0.64, name: ['河谷桥与村落', 'RIVER CROSSING'] },
  { end: 1, name: ['东岭撤离走廊', 'EASTERN EXTRACTION'] },
];
// Aircraft follows a level orbit; the stabilized sensor remains north-up.
export function aircraft(time: number) {
  const angle = time * 0.035;
  return {
    x: Math.cos(angle) * 145,
    z: Math.sin(angle) * 100,
    y: 180,
    heading: ((((-angle * 180) / Math.PI) % 360) + 360) % 360,
  };
}
export const MISSION = {
  id: 'corridor-01',
  duration: 185,
  speed: ROUTE_LENGTH / 128,
  warmup: 4,
  events: [
    {
      time: 0,
      progress: 0,
      kind: 'light',
      x: -75,
      z: 16,
      direction: ['西岭：轻型巡逻车接近', 'WEST RIDGE: light patrol approaching'],
    },
    {
      time: 0,
      progress: 0,
      kind: 'turret',
      x: -56,
      z: 29,
      direction: ['西岭弯道发现炮台', 'Emplacement above the switchbacks'],
    },
    {
      time: 42,
      progress: 0.33,
      kind: 'heavy',
      x: -20,
      z: -26,
      direction: ['桥西：重甲驶入，请切换重炮', 'WEST BANK: armor entering'],
    },
    {
      time: 24,
      progress: 0.18,
      kind: 'light',
      x: -47,
      z: 3,
      direction: ['山口轻车正在穿插', 'Light patrol at the mountain pass'],
    },
    {
      time: 60,
      progress: 0.47,
      kind: 'turret',
      x: 13,
      z: -16,
      direction: ['桥东高地发现炮台', 'EAST BANK: emplacement on high ground'],
    },
    {
      time: 91,
      progress: 0.71,
      kind: 'heavy',
      x: 58,
      z: -12,
      direction: ['东岭：重甲封锁撤离道路', 'EAST RIDGE: armor blocking extraction'],
    },
    {
      time: 109,
      progress: 0.85,
      kind: 'light',
      x: 86,
      z: -38,
      direction: ['撤离区北侧轻车接近', 'Light patrol north of extraction'],
    },
    {
      time: 73,
      progress: 0.57,
      kind: 'light',
      x: 26,
      z: 4,
      direction: ['村落出口：快速目标', 'Fast contact at the village exit'],
    },
    {
      time: 116,
      progress: 0.9,
      kind: 'turret',
      x: 103,
      z: -26,
      direction: ['最后一道封锁：清除撤离区炮台', 'Final emplacement near extraction'],
    },
  ] as { time: number; progress: number; kind: Kind; x: number; z: number; direction: string[] }[],
};
export function routePoint(d: number): Point & { heading: number } {
  d = Math.max(0, Math.min(ROUTE_LENGTH, d));
  for (let i = 1; i < ROUTE.length; i++) {
    const a = ROUTE[i - 1],
      b = ROUTE[i],
      len = distance(a, b);
    if (d <= len || i === ROUTE.length - 1)
      return {
        x: a.x + ((b.x - a.x) * d) / len,
        z: a.z + ((b.z - a.z) * d) / len,
        heading: Math.atan2(b.x - a.x, b.z - a.z),
      };
    d -= len;
  }
  return { ...ROUTE[0], heading: 0 };
}
export const text = (pair: readonly string[], language: Language) =>
  pair[language === 'zh' ? 0 : 1];
export function validateData() {
  if (
    ROUTE.length < 2 ||
    !Number.isFinite(ROUTE_LENGTH) ||
    MISSION.duration <= ROUTE_LENGTH / MISSION.speed
  )
    throw Error('Mission route/time invalid');
  if (
    MISSION.events.some(
      (e) => !UNITS[e.kind] || ![e.time, e.progress, e.x, e.z].every(Number.isFinite),
    )
  )
    throw Error('Invalid mission event');
  if (
    MISSION.events.some((e) => Math.abs(e.x) > MAP.halfWidth || Math.abs(e.z) > MAP.halfDepth) ||
    ROUTE.some((p) => Math.abs(p.x) > MAP.halfWidth || Math.abs(p.z) > MAP.halfDepth)
  )
    throw Error('Mission point outside map');
  if (WEAPONS.some((w) => w.interval <= 0 || w.flight < 0 || w.radius <= 0))
    throw Error('Invalid weapon configuration');
}
