export type BattlefieldId = 'valley' | 'highland';
export type Point = { x: number; z: number };
export type Point3 = Point & { y: number };
export type Kind = 'light' | 'heavy' | 'turret' | 'rescue' | 'escort';
export type Language = 'zh' | 'en';
export const ZOOM_LEVELS = [5, 10, 20, 40, 80, 160] as const;
export const HOMING = { speed: 70, damage: 120 } as const;
export const COMBAT_BUFF = { duration: 60, rateMultiplier: 1.3, trackingRadius: 8 } as const;
// Spread the actual route, contacts and posts together; keep the 240-second convoy journey.
export const BATTLEFIELD_SCALE = 1.4;
const spread = <T extends Point>(p: T): T => ({ ...p, x: p.x * BATTLEFIELD_SCALE, z: p.z * BATTLEFIELD_SCALE });
export const MAP = { halfWidth: 115 * BATTLEFIELD_SCALE, halfDepth: 72 * BATTLEFIELD_SCALE };
// AC-130-sized reference envelope, NOT a claim of authentic weapon performance/layout.
// AFSOC fact sheet: https://www.afsoc.af.mil/About-Us/Fact-Sheets/Display/Article/2547234/ac-130j-ghostrider/
// Dimensions use the consistent metric/imperial table in AFSOCI32-1084, table 7.2.1.
// https://static.e-publishing.af.mil/production/1/afsoc/publication/afsoci32-1084/afsoci32-1084.pdf
export const AIRFRAME = {
  length: 2.98, wingspan: 4.04, height: 1.194,
  // Existing asset is a local gun-bay detail authored in metres, not a whole aircraft.
  cabinScale: 0.1,
  cabinMuzzle: { x: -1.8, y: -1.1, z: 1.2 },
  camera: { x: -0.22, y: -0.12, z: 0.35 },
  cameraNear: 0.02,
  // +Z nose, -X port. Three stations are a creative gameplay abstraction.
  muzzles: [
    { x: -0.30, y: -0.04, z: 0.75 },
    { x: -0.32, y: -0.04, z: 0.25 },
    { x: -0.36, y: -0.05, z: -0.65 },
  ],
} as const;
// One world unit is 10 metres; all speeds are world units/second, gravity units/second².
export const FLIGHT = {
  metersPerUnit: 10,
  gravity: 0.981,
  speed: 9, // 90 m/s = 324 km/h; default 2 km orbit takes 139.6 seconds.
  radius: 200,
  minRadius: 150, // 1.5 km gives 28.8 degrees at cruise, below the 30-degree game limit.
  maxRadius: 300,
  altitude: 100,
  minAltitude: 12,
  maxAltitude: 230,
  response: 0.45,
  climbRate: 2,
  radiusRate: 3.5,
  maxBank: Math.PI / 6,
  rollRate: 0.18,
  muzzle: AIRFRAME.muzzles[0], // Compatibility alias; live fire selects WEAPONS[weapon].muzzle.
} as const;
export const TERRAIN = {
  roadLift: 0.12,
  // Smooth, low hills shared by rendering, roads, units and projectile collisions.
  hills: [
    { x: -42, z: -31, height: 7, width: 22, depth: 18 },
    { x: 30, z: 23, height: 8, width: 34, depth: 22 },
    { x: 80, z: -45, height: 6, width: 25, depth: 20 },
    { x: -92, z: 52, height: 5, width: 32, depth: 19 },
  ],
} as const;
export function terrainHeight(x: number, z: number, map: BattlefieldId = 'valley'): number {
  if (map === 'highland') return 1.2 + 5 * (1 + Math.sin(x * 0.025 + z * 0.017))
    + 10 * Math.exp(-(((z + 35 - 12 * Math.sin(x * 0.02)) / 20) ** 2))
    + 6 * Math.exp(-(((x - 75) / 32) ** 2) - ((z - 35) / 22) ** 2);
  let height = 0.3 + 0.45 * (1 + Math.sin(x * 0.04 + z * 0.025));
  for (const h of TERRAIN.hills)
    height += h.height * Math.exp(-(((x - h.x) / h.width) ** 2 + ((z - h.z) / h.depth) ** 2));
  return height;
}
// AFSOC describes trainable 30 mm / 105 mm weapons. Our rapid/burst/heavy trio,
// calibres, ammunition, traverse and ballistics are gameplay abstractions, not an AC-130J loadout.
// Aim has no azimuth firing-sector restriction, including after orbit reversal; stations stay port.
// This is arcade targeting, not authentic fire control.
export const WEAPONS = [
  {
    id: 'rapid',
    muzzle: AIRFRAME.muzzles[0],
    name: ['速射炮', 'Rapid'],
    interval: 0.12,
    speed: 60,
    calibre: 0.0025, // 25 mm at ten metres per world unit; tracer is a visibility cue.
    length: 0.012,
    tracerTime: 0.035,
    damage: 8,
    radius: 0.5,
    ammo: Infinity,
    heat: 6,
    armor: 0.2,
    automatic: true,
  },
  {
    id: 'blast',
    muzzle: AIRFRAME.muzzles[1],
    name: ['爆破炮', 'Burst'],
    interval: 0.8,
    speed: 56,
    calibre: 0.004,
    length: 0.021,
    tracerTime: 0.055,
    damage: 60, // Keep the dispersed mission forgiving with smaller vehicle hit hulls.
    radius: 3.4,
    ammo: 80,
    heat: 15,
    armor: 0.65,
    automatic: true,
  },
  {
    id: 'heavy',
    muzzle: AIRFRAME.muzzles[2],
    name: ['重型炮', 'Heavy'],
    interval: 3,
    speed: 32,
    calibre: 0.0105,
    length: 0.05,
    tracerTime: 0.075,
    damage: 140,
    radius: 6.5,
    ammo: 30,
    heat: 0,
    armor: 1,
    automatic: false,
  },
] as const;
export const UNITS = {
  light: {
    hp: 32,
    radius: 0.225, // Matches World's 0.25-scale hulls; blast radii remain in world units.
    speed: 2.2,
    damage: 8,
    range: 19,
    heat: 0.78,
    assetId: 'vehicle.light',
  },
  heavy: {
    hp: 180,
    radius: 0.4,
    speed: 0.75,
    damage: 18,
    range: 24,
    heat: 0.85,
    assetId: 'vehicle.heavy',
  },
  turret: {
    hp: 90,
    radius: 0.35,
    speed: 0,
    damage: 14,
    range: 24,
    heat: 0.6,
    assetId: 'vehicle.turret',
  },
  rescue: {
    hp: 520,
    radius: 0.375,
    speed: 0.85,
    damage: 0,
    range: 0,
    heat: 0.7,
    assetId: 'vehicle.rescue',
  },
  escort: {
    hp: 360,
    radius: 0.325,
    speed: 0.85,
    damage: 1.6,
    range: 17,
    heat: 0.7,
    assetId: 'vehicle.escort',
  },
} as const;
// Distance to the hull, rather than its centre, keeps direct hits at full damage.
export function impactDamage(weapon: number, kind: Kind, centreDistance: number): number {
  const w = WEAPONS[weapon];
  if (!w || !Number.isFinite(centreDistance) || centreDistance < 0) return 0;
  const falloff = Math.max(0, 1 - Math.max(0, centreDistance - UNITS[kind].radius) / w.radius);
  return w.damage * falloff * (kind === 'heavy' ? w.armor : 1);
}
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
].map(spread);
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
export const ROUTE_LENGTH = ROUTE.slice(1).reduce((n, p, i) => n + distance(ROUTE[i], p), 0);
export const HOLD_POINTS = [ROUTE_LENGTH * 0.28, ROUTE_LENGTH * 0.64];
export const PROTECTED = [spread({ x: -38, z: 25, radius: 8, assetId: 'zone.shelter' })];
export const SECTORS = [
  { end: 0.28, name: ['西岭盘山路', 'WESTERN SWITCHBACKS'] },
  { end: 0.64, name: ['河谷桥与村落', 'RIVER CROSSING'] },
  { end: 1, name: ['东岭撤离走廊', 'EASTERN EXTRACTION'] },
];
// Legacy display-only helper. Live flight and every shot use Simulation.aircraft instead.
export function aircraft(time: number) {
  const angle = Math.PI / 2 + time * FLIGHT.speed / FLIGHT.radius;
  return {
    x: Math.cos(angle) * FLIGHT.radius,
    z: Math.sin(angle) * FLIGHT.radius,
    y: FLIGHT.altitude,
    yaw: -angle,
    pitch: 0,
    bank: Math.atan(FLIGHT.speed ** 2 / (FLIGHT.gravity * FLIGHT.radius)),
    heading: (((-angle * 180 / Math.PI) % 360) + 360) % 360,
  };
}
export const FRIENDLY_POSTS: Point[] = [
  { x: -61, z: -32 },
  { x: 12, z: 26 },
  { x: 78, z: -24 },
].map(spread);
const CONTACTS: [Kind, number, number][] = [
  ['light', -78, 16], ['light', -80, 50], ['turret', -62, 34], ['light', -101, 1],
  ['light', -78, -40], ['turret', -51, -43], ['light', -44, -21], ['heavy', -72, -13],
  ['light', -22, -34], ['turret', -21, 10], ['light', -5, -16], ['light', -52, 3],
  ['light', 24, 44], ['turret', 35, 11], ['light', 0, 48], ['heavy', 34, -25],
  ['light', 65, -41], ['turret', 95, -28], ['light', 57, -17], ['heavy', 82, -47],
  ['light', 76, 32], ['turret', 101, 15], ['light', 91, 49], ['turret', 51, 48],
];
export const MISSION = {
  id: 'corridor-01',
  duration: 390, // Wider search area gets 30 seconds more; convoy still arrives in four minutes.
  speed: ROUTE_LENGTH / 240,
  warmup: 8,
  attackInterval: 4.8,
  friendlyAttackInterval: 6,
  friendlyArmor: 0.2, // Ground fire is resisted; aircraft friendly fire still deals full blast damage.
  events: CONTACTS.map(([kind, x, z], i) => ({
    time: 0, progress: 0, kind, ...spread({ x, z }),
    direction: [`第${Math.floor(i / 4) + 1}区：发现敌方目标，保护分散友军`,
      `SECTOR ${Math.floor(i / 4) + 1}: contacts near friendly positions`],
  })),
};
export const HIGHLAND_ROUTE: Point[] = [
  { x: -129, z: 67 }, { x: -95, z: 59 }, { x: -70, z: 30 }, { x: -40, z: 45 },
  { x: -12, z: 20 }, { x: 22, z: 38 }, { x: 55, z: 3 }, { x: 85, z: 12 },
  { x: 117, z: -28 }, { x: 137, z: -42 },
];
export const mapRoute = (map: BattlefieldId = 'valley') => map === 'highland' ? HIGHLAND_ROUTE : ROUTE;
export const routeLength = (map: BattlefieldId = 'valley') => mapRoute(map).slice(1)
  .reduce((n, p, i) => n + distance(mapRoute(map)[i], p), 0);
export const riverX = (z: number) => Math.sin((z - 1.4) * 0.045) * 1.6
  + Math.max(0, Math.min(1, (Math.abs(z) - 75) / 100)) * Math.sin(z * 0.013) * 32;
export function isWater(p: Point, map: BattlefieldId = 'valley', margin = 0): boolean {
  return map === 'valley' && Math.abs(p.x - riverX(p.z)) < 2.9 + margin
    && !(Math.abs(p.z - 1.4) <= Math.max(0.1, 0.9 - margin) && Math.abs(p.x) < 12);
}
export function landPoint(p: Point, map: BattlefieldId = 'valley', side = p.x - riverX(p.z)): Point {
  if (map !== 'valley' || Math.abs(p.z - 1.4) <= .4 && Math.abs(p.x) < 12) return p;
  const bank = riverX(p.z) + (side < 0 ? -3.4 : 3.4);
  return { x: side < 0 ? Math.min(p.x, bank) : Math.max(p.x, bank), z: p.z };
}
export function routePoint(d: number, map: BattlefieldId = 'valley'): Point3 & { heading: number } {
  const route = mapRoute(map), length = routeLength(map);
  d = Math.max(0, Math.min(length, d));
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      len = distance(a, b);
    if (d <= len || i === route.length - 1) {
      const x = a.x + ((b.x - a.x) * d) / len, z = a.z + ((b.z - a.z) * d) / len;
      return {
        x, z, y: terrainHeight(x, z, map) + TERRAIN.roadLift,
        heading: Math.atan2(b.x - a.x, b.z - a.z),
      };
    }
    d -= len;
  }
  return { ...route[0], y: terrainHeight(route[0].x, route[0].z, map) + TERRAIN.roadLift, heading: 0 };
}
export function patrolPoint(origin: Point, elapsed: number, map: BattlefieldId = 'valley'): Point & { heading: number } {
  const angle = elapsed * UNITS.light.speed / 7;
  return {
    ...landPoint({ x: origin.x + Math.sin(angle) * 7, z: origin.z + (Math.cos(angle) - 1) * 3 }, map, origin.x - riverX(origin.z)),
    heading: Math.atan2(7 * Math.cos(angle), -3 * Math.sin(angle)),
  };
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
  if (WEAPONS.some((w) => w.interval <= 0 || w.speed <= 0 || w.radius <= 0))
    throw Error('Invalid weapon configuration');
}
