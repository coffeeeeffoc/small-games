import { direction, type Point, type Side, type Structure } from './duel-types.js';
import { landNoise } from './scene-valley.js';
export function duelGroundHeight(x: number, z: number) {
  if (Math.abs(x) < 16) return -4 * Math.max(0, 1 - Math.abs(x) / 16);
  const rise = Math.max(
    0,
    Math.min(1, (Math.abs(z) - 26) / 60),
    Math.min(1, (Math.abs(x) - 95) / 75),
  );
  return rise * (8 + landNoise(x * 0.018, z * 0.018) * 25);
}
export const DUEL_RULES = {
  step: 1 / 60,
  hp: 100,
  medicines: 3,
  heal: 35,
  healSeconds: 4,
  speed: 5,
  reload: 2.6,
  repairSeconds: 6,
  bunkerReload: 3.3,
  chargeSeconds: 1.8,
  gravity: 18,
  minVelocity: 31,
  maxVelocity: 58,
  minPitch: 10,
  maxPitch: 72,
  maxYaw: 16,
  bunkerYaw: 9,
  matchWait: 8,
  reconnect: 20,
  timeLimit: 900,
  inactive: 90,
  solid: { radius: 4.8, structure: 105, character: 47 },
  blast: { radius: 8, structure: 66, character: 42 },
};
export const DUEL_MAP = {
  id: 'ravine-v1',
  label: '双城峡谷',
  version: 1,
  nodes: {
    ground: { x: -54, y: 0, z: 6 },
    junction: { x: -57, y: 0, z: 20 },
    stair: { x: -58, y: 0, z: 20 },
    landing: { x: -58, y: 8, z: 20 },
    wall: { x: -58, y: 8, z: 10 },
    approach: { x: -58, y: 0, z: 0 },
    door: { x: -66, y: 0, z: 0 },
    shelter: { x: -69, y: 0, z: 0 },
    bunker: { x: -65, y: 0, z: 0 },
  },
  edges: [
    ['ground', 'junction'],
    ['junction', 'stair'],
    ['stair', 'landing'],
    ['landing', 'wall'],
    ['ground', 'approach'],
    ['approach', 'door'],
    ['door', 'shelter'],
    ['door', 'bunker'],
  ],
  guns: [
    { id: 'ground', label: '门前炮', node: 'ground', bunker: false },
    { id: 'wall', label: '城墙炮', node: 'wall', bunker: false },
    { id: 'bunker', label: '地堡炮', node: 'bunker', bunker: true },
  ],
};
export function trenchFor(side: Side) {
  return { position: pointFor(side, { x: -51.5, y: 0.45, z: 6 }), size: { x: 1, y: 0.9, z: 9 } };
}
export function pointFor(side: Side, p: Point): Point {
  const d = direction(side);
  return { x: p.x * d, y: p.y, z: p.z * d };
}
export function nodePoint(side: Side, id: string): Point {
  const p = DUEL_MAP.nodes[id as keyof typeof DUEL_MAP.nodes];
  if (!p) throw new Error(`Unknown route node ${id}`);
  return pointFor(side, p);
}
export function routeBetween(side: Side, from: string, to: string): Point[] {
  const queue = [[from]],
    visited = new Set([from]);
  while (queue.length) {
    const path = queue.shift()!,
      last = path.at(-1)!;
    if (last === to) return path.slice(1).map((id) => nodePoint(side, id));
    for (const edge of DUEL_MAP.edges) {
      const next = edge[0] === last ? edge[1] : edge[1] === last ? edge[0] : null;
      if (next && !visited.has(next)) {
        visited.add(next);
        queue.push([...path, next]);
      }
    }
  }
  throw new Error(`Unreachable route ${from}/${to}`);
}
export function createStructures(): Structure[] {
  const all: Structure[] = [];
  for (const side of [0, 1] as const) {
    const add = (
      id: string,
      kind: Structure['kind'],
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      hp = 90,
    ) =>
      all.push({
        id: `${side}:${id}`,
        side,
        kind,
        position: pointFor(side, { x, y, z }),
        size: { x: w, y: h, z: d },
        hp,
        maxHp: hp,
      });
    for (const z of [-14, 14])
      for (let row = 0; row < 3; row++)
        add(`tower:${z}:${row}`, 'tower', -63, 2 + row * 4, z, 5, 4, 5);
    for (const z of [-9, -5, 5, 9])
      for (let row = 0; row < 2; row++)
        add(`wall:${z}:${row}`, 'wall', -62, 2 + row * 4, z, 2, 4, 4, 70);
    add('gate', 'gate', -62, 6, 0, 2, 4, 6, 90);
    for (const z of [-3, 3])
      for (let row = 0; row < 3; row++)
        add(`keep:${z}:${row}`, 'keep', -73, 2 + row * 4, z, 7, 4, 6, 80);
  }
  return all;
}
export function validateDuelMap() {
  const ids = Object.keys(DUEL_MAP.nodes);
  if (new Set(DUEL_MAP.guns.map((g) => g.id)).size !== DUEL_MAP.guns.length)
    throw new Error('Duplicate gun');
  for (const [a, b] of DUEL_MAP.edges)
    if (!ids.includes(a) || !ids.includes(b)) throw new Error('Invalid route reference');
  for (const p of Object.values(DUEL_MAP.nodes))
    if (!Object.values(p).every(Number.isFinite)) throw new Error('Invalid coordinates');
  for (const id of ids) routeBetween(0, 'ground', id);
  for (const n of Object.values(DUEL_RULES))
    if (typeof n === 'number' && !(n > 0)) throw new Error('Invalid rule number');
  const structures = createStructures();
  if (!structures.length || new Set(structures.map((s) => s.id)).size !== structures.length)
    throw new Error('Invalid structures');
  const range = DUEL_RULES.maxVelocity ** 2 / DUEL_RULES.gravity;
  if (range < Math.abs(DUEL_MAP.nodes.bunker.x * 2)) throw new Error('Unreachable opponent');
  return true;
}
