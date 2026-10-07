export type ModuleKind = 'gate' | 'tower' | 'obstacle';
export interface ModuleSpec {
  id: string;
  kind: ModuleKind;
  x: number;
  y: number;
  hp: number;
  radius: number;
  attack?: number;
}
export interface Level {
  id: string;
  name: string;
  hint: string;
  soldiers: number;
  staging: number;
  speed: number;
  capture: number;
  duration: number;
  reward: number;
  modules: ModuleSpec[];
  extensions: { reinforcementGates: never[]; covers: never[]; routes: never[] };
}
const gate = (hp: number): ModuleSpec => ({
  id: 'gate',
  kind: 'gate',
  x: 590,
  y: 280,
  hp,
  radius: 48,
});
const tower = (id: string, x: number, y: number, hp = 3, attack = 1): ModuleSpec => ({
  id,
  kind: 'tower',
  x,
  y,
  hp,
  radius: 35,
  attack,
});
const extra = () => ({ reinforcementGates: [], covers: [], routes: [] });
export const LEVELS: Level[] = [
  {
    id: 'grass-v1',
    name: '草丘城',
    hint: '破门！让小队冲进去',
    soldiers: 12,
    staging: 548,
    speed: 34,
    capture: 7,
    duration: 75,
    reward: 4,
    modules: [gate(3), tower('tower', 680, 160)],
    extensions: extra(),
  },
  {
    id: 'twins-v1',
    name: '双塔城',
    hint: '双塔相邻，试试爆破弹',
    soldiers: 12,
    staging: 360,
    speed: 32,
    capture: 8,
    duration: 80,
    reward: 4,
    modules: [
      gate(5),
      tower('tower-a', 680, 175, 4),
      tower('tower-b', 748, 188, 4),
      { id: 'barricade', kind: 'obstacle', x: 715, y: 326, hp: 2, radius: 28 },
    ],
    extensions: extra(),
  },
  {
    id: 'ridge-v1',
    name: '石脊城',
    hint: '先压箭塔，留住攻城兵力',
    soldiers: 11,
    staging: 340,
    speed: 31,
    capture: 9,
    duration: 85,
    reward: 5,
    modules: [
      gate(6),
      tower('tower-a', 660, 140, 6, 1.25),
      tower('tower-b', 748, 210, 3, 1.25),
      { id: 'barricade', kind: 'obstacle', x: 708, y: 326, hp: 3, radius: 28 },
    ],
    extensions: extra(),
  },
];
export function validateLevels(levels: readonly Level[]) {
  const ids = new Set<string>();
  for (const l of levels) {
    if (
      !l.id ||
      ids.has(l.id) ||
      !Number.isInteger(l.soldiers) ||
      l.soldiers < 1 ||
      !Number.isFinite(l.staging) ||
      l.staging < 200 ||
      l.staging > 550 ||
      l.speed <= 0 ||
      l.capture <= 0 ||
      l.duration <= 0 ||
      l.reward < 0
    )
      throw new Error('Invalid castle level');
    ids.add(l.id);
    const modules = new Set<string>();
    if (
      l.modules.filter((m) => m.kind === 'gate').length !== 1 ||
      !l.modules.some((m) => m.kind === 'tower')
    )
      throw new Error('Castle needs gate and tower');
    for (const m of l.modules) {
      if (
        modules.has(m.id) ||
        !m.id ||
        !['gate', 'tower', 'obstacle'].includes(m.kind) ||
        ![m.x, m.y, m.hp, m.radius].every(Number.isFinite) ||
        m.hp <= 0 ||
        m.radius < 1 ||
        m.x < 400 ||
        m.x > 830 ||
        m.y < 90 ||
        m.y > 350 ||
        (m.kind === 'tower' && (!m.attack || m.attack <= 0))
      )
        throw new Error('Invalid castle module');
      modules.add(m.id);
    }
  }
  return levels;
}
validateLevels(LEVELS);
