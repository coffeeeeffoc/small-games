export type Point = { x: number; y: number };
export type Scene = 'cave' | 'forest' | 'summit';
export type Relic = 'return' | 'shield' | 'wood';
export const relicNames: Record<Relic, string> = {
  return: '回澜剑诀',
  shield: '护心灵玉',
  wood: '避雷木种',
};
export const relicDescriptions: Record<Relic, string> = {
  return: '回程飞剑再次命中 · 走位改变剑路',
  shield: '消耗真气护体 · Q 键主动开启',
  wood: '种下引雷木 · R 键引走一轮雷',
};
export type Obstacle = Point & { id: string; r: number; hp: number; kind: 'rock' | 'pillar' };
export type Enemy = Point & {
  id: string;
  kind: 'bamboo' | 'stone' | 'seal' | 'foxSeal' | 'dummy' | 'eye';
  hp: number;
  maxHp: number;
  r: number;
  mode: 'idle' | 'tell' | 'rush' | 'recover';
  timer: number;
  direction: Point;
  hit: boolean;
  flash: number;
};
export type Spring = Point & { id: string; guarded?: string };
export const sizeOf = (scene: Scene) =>
  scene === 'forest' ? { x: 760, y: 1080 } : { x: 480, y: 560 };
export const springs: Record<Scene, Spring[]> = {
  cave: [{ id: 'cave', x: 180, y: 370 }],
  forest: [
    { id: 'safe', x: 170, y: 890 },
    { id: 'guarded', x: 445, y: 660, guarded: 'stone-1' },
  ],
  summit: [{ id: 'summit', x: 240, y: 470 }],
};
export const portals: Record<Scene, (Point & { to: Scene; label: string })[]> = {
  cave: [{ x: 240, y: 105, to: 'forest', label: '出关 · 入秘境' }],
  forest: [
    { x: 80, y: 990, to: 'cave', label: '返回洞府' },
    { x: 380, y: 135, to: 'summit', label: '登台 · 提前渡劫' },
  ],
  summit: [],
};
export const relicSites: (Point & { relic: Relic; guardians: string[] })[] = [
  { x: 600, y: 440, relic: 'return', guardians: ['seal-0', 'seal-1', 'seal-2'] },
  { x: 445, y: 660, relic: 'shield', guardians: ['stone-1'] },
  { x: 135, y: 510, relic: 'wood', guardians: ['bamboo-2'] },
];
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function direction(a: Point, b: Point): Point {
  const d = distance(a, b) || 1;
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
}
export const enemy = (
  id: string,
  kind: Enemy['kind'],
  x: number,
  y: number,
  hp: number,
): Enemy => ({
  id,
  kind,
  x,
  y,
  hp,
  maxHp: hp,
  r: kind === 'stone' ? 25 : kind === 'eye' ? 30 : 18,
  mode: 'idle',
  timer: 0,
  direction: { x: 0, y: 1 },
  hit: false,
  flash: 0,
});
export function createWorld(scene: Scene) {
  const enemies: Enemy[] =
    scene === 'cave'
      ? [enemy('dummy', 'dummy', 325, 240, 48)]
      : scene === 'forest'
        ? [
            enemy('bamboo-1', 'bamboo', 240, 760, 48),
            enemy('stone-1', 'stone', 440, 620, 110),
            enemy('bamboo-2', 'bamboo', 150, 530, 64),
            enemy('stone-2', 'stone', 550, 280, 90),
            enemy('fox', 'foxSeal', 95, 295, 48),
            ...[0, 1, 2].map((i) =>
              enemy(`seal-${i}`, 'seal', 540 + i * 60, i === 1 ? 380 : 470, 40),
            ),
          ]
        : [];
  const obstacles: Obstacle[] = (
    scene === 'forest'
      ? [
          [355, 650, 25, 'pillar'],
          [510, 730, 23, 'pillar'],
          [540, 340, 26, 'pillar'],
          [80, 730, 27, 'rock'],
          [330, 455, 32, 'rock'],
          [400, 370, 30, 'rock'],
          [640, 600, 26, 'rock'],
        ]
      : scene === 'summit'
        ? [
            [88, 260, 19, 'pillar'],
            [392, 260, 19, 'pillar'],
          ]
        : [[75, 190, 32, 'rock']]
  ).map((row, i) => ({
    id: `rock-${i}`,
    x: Number(row[0]),
    y: Number(row[1]),
    r: Number(row[2]),
    kind: row[3] as Obstacle['kind'],
    hp: 1,
  }));
  return { enemies, obstacles };
}
/** Segment collision prevents a fast sword from stepping through small targets. */
export function segmentHits(a: Point, b: Point, center: Point, radius: number) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((center.x - a.x) * dx + (center.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return distance({ x: a.x + dx * t, y: a.y + dy * t }, center) <= radius;
}
