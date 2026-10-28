export const RULE_VERSION = 'nullrange-b4-v1';
export const GAME_ID = 'vibeJam-myself-nullrange';
export type CraftId = 'falcon' | 'kestrel' | 'warden';
export type Craft = {
  id: CraftId;
  name: string;
  role: string;
  unlock: string | null;
  speed: number;
  boost: number;
  turn: number;
  pitch: number;
  hull: number;
  shield: number;
  heat: number;
  missiles: number;
  nozzles: readonly (readonly number[])[];
  samples: readonly (readonly number[])[];
};
export const CRAFTS: readonly Craft[] = [
  {
    id: 'falcon',
    name: '战隼',
    role: '均衡巡航 / 稳定火力',
    unlock: null,
    speed: 92,
    boost: 165,
    turn: 1.42,
    pitch: 0.95,
    hull: 100,
    shield: 70,
    heat: 0.105,
    missiles: 6,
    nozzles: [
      [-1.18, -0.16, 8.8],
      [1.18, -0.16, 8.8],
    ],
    samples: [
      [0, -1.1, 0],
      [-10.625, 0.05, 4.9],
      [10.625, 0.05, 4.9],
      [0, 0, -14.15],
      [-5.3, -0.06, 7.8],
      [5.3, -0.06, 7.8],
      [-1.18, -1.1, 9.15],
      [1.18, -1.1, 9.15],
    ],
  },
  {
    id: 'kestrel',
    name: '红隼',
    role: '轻型截击 / 高机动低防护',
    unlock: 'ridge-intercept',
    speed: 108,
    boost: 192,
    turn: 1.9,
    pitch: 1.2,
    hull: 75,
    shield: 48,
    heat: 0.12,
    missiles: 5,
    nozzles: [
      [-0.72, -0.1, 7.1],
      [0.72, -0.1, 7.1],
    ],
    samples: [
      [0, -0.728, 0],
      [-7, 0.12, 3.4],
      [7, 0.12, 3.4],
      [0, 0, -10.003],
      [-3.45, 0.2, -2.75],
      [3.45, 0.2, -2.75],
      [-0.72, -0.728, 7.35],
      [0.72, -0.728, 7.35],
    ],
  },
  {
    id: 'warden',
    name: '守望',
    role: '重装压制 / 持续火力低转向',
    unlock: 'valley-escort',
    speed: 80,
    boost: 144,
    turn: 1.12,
    pitch: 0.78,
    hull: 145,
    shield: 100,
    heat: 0.074,
    missiles: 8,
    nozzles: [
      [-1.5, -0.1, 8.05],
      [1.5, -0.1, 8.05],
    ],
    samples: [
      [0, -1.111, 0],
      [-10.301, 0.22, 3.2],
      [10.301, 0.22, 3.2],
      [0, 0, -11.003],
      [-5.4, -1.111, 4.5],
      [5.4, -1.111, 4.5],
      [-1.5, -1.111, 8.301],
      [1.5, -1.111, 8.301],
    ],
  },
];
export const craftById = (id: string) => CRAFTS.find((c) => c.id === id);
export type EnemyKind = 'interceptor' | 'skirmisher' | 'heavy' | 'elite';
export type EnemySpec = {
  kind: EnemyKind;
  offset: [number, number, number];
  hp: number;
  shield?: number;
  priority?: boolean;
};
export type Wave = {
  label: string;
  gate: { kind: 'clear' } | { kind: 'recovered' | 'route' | 'phase'; value: number };
  enemies: EnemySpec[];
};
export type Objective =
  | { kind: 'clear' }
  | { kind: 'intercept'; escapeDistance: number }
  | { kind: 'recover'; count: number }
  | { kind: 'escort'; hull: number; speed: number; route: [number, number, number][] }
  | { kind: 'elite' };
export type Mission = {
  id: string;
  title: string;
  briefing: string;
  seed: number;
  timeLimit: number;
  objective: Objective;
  waves: Wave[];
};
const enemy = (kind: EnemyKind, x: number, forward: number, hp = 90, shield = 0): EnemySpec => ({
  kind,
  offset: [x, 115, forward],
  hp,
  shield,
});
const wave = (
  label: string,
  enemies: EnemySpec[],
  gate: Wave['gate'] = { kind: 'clear' },
): Wave => ({ label, enemies, gate });
export const MISSIONS: readonly Mission[] = [
  {
    id: 'dawn-patrol',
    title: '晨雾巡航',
    seed: 20261029,
    timeLimit: 180,
    briefing: '三段巡航：转向追击、松火散热、锁定重机。清除后立即进入下一段；扫描残骸恢复护盾。',
    objective: { kind: 'clear' },
    waves: [
      wave('初次接触', [enemy('interceptor', 0, 300, 72), enemy('interceptor', 100, 500, 90)]),
      wave('侧翼来袭', [enemy('skirmisher', -220, 650, 110), enemy('interceptor', 180, 850, 90)]),
      wave('重机压制', [enemy('heavy', 0, 750, 200, 60), enemy('interceptor', -220, 650, 90)]),
    ],
  },
  {
    id: 'ridge-intercept',
    title: '山脊截击',
    seed: 20261102,
    timeLimit: 330,
    briefing:
      '连续截住三批逃逸信标机。优先追击标记目标，脉冲与导弹结合；加速缩短距离，逃出边界即失败。',
    objective: { kind: 'intercept', escapeDistance: 10500 },
    waves: [0, 1, 2].map((i) =>
      wave(['前哨信标', '山脊接力', '最后拦截'][i], [
        { ...enemy('skirmisher', 0, 1850, 420, 180), priority: true },
        enemy('interceptor', (i % 2 ? 1 : -1) * 150, 420, 100),
        enemy('heavy', 200, 600, 140),
      ]),
    ),
  },
  {
    id: 'echo-recovery',
    title: '回声回收',
    seed: 20261103,
    timeLimit: 330,
    briefing:
      '击落巡逻机并扫描回收十二份残骸。每回收三份暴露下一组；导航菱形指向最近残骸，不必等它消失。',
    objective: { kind: 'recover', count: 12 },
    waves: [0, 1, 2, 3].map((i) =>
      wave(
        ['寻找回声', '重建坐标', '收集黑匣', '回声闭合'][i],
        [
          enemy('skirmisher', -220, 700, 130, 35),
          enemy('heavy', 180, 850, 210, 50),
          enemy('interceptor', 0, 1000, 110),
        ],
        i ? { kind: 'recovered', value: i * 3 } : { kind: 'clear' },
      ),
    ),
  },
  {
    id: 'valley-escort',
    title: '峡谷护航',
    seed: 20261104,
    timeLimit: 300,
    briefing:
      '护送运输机穿过峡谷。优先拦截攻击它的重机；到达终点且运输机存活才胜利。持续追踪友机与航程。',
    objective: {
      kind: 'escort',
      hull: 280,
      speed: 42,
      route: [
        [0, 130, -300],
        [100, 145, -1800],
        [-180, 150, -3400],
        [120, 140, -5200],
        [0, 135, -6800],
      ],
    },
    waves: [0, 1, 2, 3, 4].map((i) =>
      wave(
        ['离港掩护', '峡口伏击', '沿河突围', '侧翼封锁', '终点防卫'][i],
        [enemy('heavy', i % 2 ? 250 : -250, 500, 180, 40), enemy('skirmisher', 0, 750, 130)],
        i ? { kind: 'route', value: i * 0.2 } : { kind: 'clear' },
      ),
    ),
  },
  {
    id: 'crosswind',
    title: '交叉火网',
    seed: 20261105,
    timeLimit: 360,
    briefing:
      '突破五组交叉火网。左右交替来袭，近地转弯风险更高；重机蓄能时侧移，利用残骸补给继续压制。',
    objective: { kind: 'clear' },
    waves: Array.from({ length: 5 }, (_, i) =>
      wave(`火网 ${i + 1} / 5`, [
        enemy('interceptor', (i % 2 ? 1 : -1) * 320, 800, 130),
        enemy('skirmisher', (i % 2 ? -1 : 1) * 190, 1100, 170, 40),
        enemy('heavy', 60, 1250, 240, 65),
      ]),
    ),
  },
  {
    id: 'last-light',
    title: '终光决战',
    seed: 20261106,
    timeLimit: 360,
    briefing:
      '击破精英三阶段。护航机存在时精英护盾免伤；阶段变化会召入新护航。观察蓄能，错开正面齐射。',
    objective: { kind: 'elite' },
    waves: [
      wave('守卫阵列', [
        enemy('elite', 0, 750, 1200, 160),
        enemy('heavy', -200, 500, 160),
        enemy('skirmisher', 200, 600, 140),
      ]),
      wave(
        '第二阶段 · 交叉齐射',
        [enemy('interceptor', -260, 600, 150, 40), enemy('heavy', 220, 800, 210, 60)],
        { kind: 'phase', value: 2 },
      ),
      wave(
        '第三阶段 · 超载追击',
        [enemy('skirmisher', -230, 650, 190, 40), enemy('heavy', 240, 900, 240, 60)],
        { kind: 'phase', value: 3 },
      ),
    ],
  },
];
export const totalEnemies = (m: Mission) => m.waves.reduce((n, w) => n + w.enemies.length, 0);
export function validateMission(m: Mission) {
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (
    !/^[a-z][a-z-]+$/.test(m.id) ||
    !Number.isInteger(m.seed) ||
    !finite(m.timeLimit) ||
    m.timeLimit <= 0 ||
    !m.waves.length ||
    m.waves.length > 12
  )
    throw Error('Invalid mission');
  for (const [i, w] of m.waves.entries())
    if (
      !w.enemies.length ||
      w.enemies.length > 6 ||
      !['clear', 'recovered', 'route', 'phase'].includes(w.gate.kind) ||
      (i === 0 && w.gate.kind !== 'clear') ||
      ('value' in w.gate && (!finite(w.gate.value) || w.gate.value <= 0)) ||
      w.enemies.some(
        (e) =>
          !['interceptor', 'skirmisher', 'heavy', 'elite'].includes(e.kind) ||
          !finite(e.hp) ||
          e.hp <= 0 ||
          (e.shield !== undefined && (!finite(e.shield) || e.shield < 0)) ||
          e.offset.length !== 3 ||
          !e.offset.every(finite) ||
          e.offset[1] < 40 ||
          e.offset[2] < 200 ||
          e.offset[2] > 2000,
      )
    )
      throw Error('Invalid wave');
  const o = m.objective;
  if (!['clear', 'intercept', 'recover', 'escort', 'elite'].includes(o.kind))
    throw Error('Invalid objective');
  if (
    o.kind === 'recover' &&
    (!Number.isInteger(o.count) || o.count <= 0 || o.count > totalEnemies(m))
  )
    throw Error('Invalid recovery');
  if (
    o.kind === 'intercept' &&
    (!finite(o.escapeDistance) ||
      o.escapeDistance <= 0 ||
      m.waves.some((w) => !w.enemies.some((e) => e.priority)))
  )
    throw Error('Invalid intercept');
  if (
    o.kind === 'escort' &&
    (!finite(o.hull) ||
      o.hull <= 0 ||
      !finite(o.speed) ||
      o.speed <= 0 ||
      o.route.length < 2 ||
      o.route.some((p) => p.length !== 3 || !p.every(finite) || p[1] < 40))
  )
    throw Error('Invalid route');
  if (
    o.kind === 'elite' &&
    m.waves.flatMap((w) => w.enemies).filter((e) => e.kind === 'elite').length !== 1
  )
    throw Error('Invalid elite');
}
