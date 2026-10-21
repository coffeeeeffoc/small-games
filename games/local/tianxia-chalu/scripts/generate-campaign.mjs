import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { format, resolveConfig } from 'prettier';

const root = new URL('../', import.meta.url);
const chapters = [
  '初识军令',
  '补给合流',
  '驿路疾行',
  '沃野争粮',
  '雄关险隘',
  '兵器争锋',
  '将星入阵',
  '四方逐鹿',
  '奇策纵横',
  '百战归一',
];
const places = ['芦汀', '松溪', '白沙', '青坪', '烟渡', '望川', '栖霞', '石梁', '云岫', '长风'];
const tasks = [
  '抢占外线补给，接通内环。',
  '后城合流，集中突破侧翼。',
  '利用捷径抢先占领中枢。',
  '守住高产城再向两翼扩张。',
  '积兵破关，绕行包夹城后。',
  '观察兵器冷却，合流攻城。',
  '保护点将进度，随军争夺要地。',
  '判断四方兵线，避免同时受敌。',
  '用快慢路的时差组织夹击。',
  '统筹兵器、将领与补给夺取中枢。',
];
const city = (id, name, x, y, type = 'town', extra = {}) => ({
  id,
  name,
  x,
  y,
  type,
  terrain: 'plain',
  owner: null,
  troops: 0,
  reserve: 0,
  weapon: null,
  general: null,
  ...extra,
});

function buildLevel(order) {
  const chapter = Math.ceil(order / 10),
    slot = (order - 1) % 10;
  const id =
    order === 1
      ? 'crossroads'
      : order === 3
        ? 'riverfork'
        : order === 5
          ? 'four-kingdoms'
          : `campaign-${String(order).padStart(3, '0')}`;
  const n = order === 3 ? 3 : order === 5 ? 4 : chapter < 4 ? 2 : chapter < 8 ? 3 : 4;
  const cities = [],
    roads = [];
  const addRoad = (a, b, type = 'normal') => {
    const existing = roads.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
    if (existing) {
      if (
        ['normal', 'slow', 'fast'].indexOf(type) > ['normal', 'slow', 'fast'].indexOf(existing.type)
      )
        existing.type = type;
      return;
    }
    roads.push({ id: `road-${roads.length + 1}`, a, b, type });
  };
  let spawnSets;
  if (order === 1) {
    cities.push(
      city('redgate', '赤关', 195, 545),
      city('westford', '西津', 88, 365),
      city('eastford', '东津', 302, 365),
      city('bluegate', '苍关', 195, 185),
    );
    for (const a of ['redgate', 'bluegate'])
      for (const b of ['westford', 'eastford']) addRoad(a, b);
    addRoad('westford', 'eastford');
    spawnSets = [['redgate', 'bluegate']];
  } else {
    // Each sector has identical roads and starting budgets; faction assignment rotates over it.
    const layers = n === 2 ? 3 + (slot >= 5 ? 1 : 0) : n === 3 && chapter >= 5 ? 3 : 2;
    for (let s = 0; s < n; s++) {
      for (let l = 0; l < layers; l++) {
        const angle =
          (n === 4 ? Math.PI / 4 : Math.PI / 2) +
          (s * Math.PI * 2) / n +
          (l % 2 ? (n === 4 ? Math.PI / 4 : layers === 3 ? Math.PI / 3 : 0.55) : 0);
        const radius = layers === 3 ? [160, 118, 75][l] : [160, 85][l];
        const pair = [
          [70, 565],
          [70, 400],
          [75, 230],
          [195, 170],
        ][l];
        const x =
          n === 2 ? (s ? 390 - pair[0] : pair[0]) : Math.round(195 + Math.cos(angle) * radius);
        const y =
          n === 2 ? (s ? 680 - pair[1] : pair[1]) : Math.round(340 + Math.sin(angle) * radius);
        const special = l === layers - 1;
        const type = !special
          ? 'town'
          : chapter >= 7
            ? ['muster', 'barracks', 'pass'][slot % 3]
            : chapter >= 5
              ? 'pass'
              : chapter >= 2
                ? 'barracks'
                : 'town';
        const weapon =
          chapter >= 6 && special ? ['crossbow', 'catapult', 'cannon'][slot % 3] : null;
        const general =
          type === 'muster'
            ? ['warrior', 'commander', 'guardian', 'ranger', 'arbalist', 'medic'][slot % 6]
            : null;
        cities.push(
          city(
            `s${s}-${l}`,
            `${['南', '北', '东', '西'][s]}${['关', '津', '垒', '营', '台'][l]}`,
            x,
            y,
            type,
            {
              weapon,
              general,
              terrain: !special
                ? 'plain'
                : ['plain', 'forest', 'mountain', 'river'][(slot + l) % 4],
            },
          ),
        );
        if (l)
          addRoad(
            `s${s}-${l - 1}`,
            `s${s}-${l}`,
            chapter >= 3
              ? (l + slot) % 3 === 0
                ? 'fast'
                : (l + slot) % 3 === 1
                  ? 'slow'
                  : 'normal'
              : 'normal',
          );
      }
    }
    const masks = order - 1;
    for (let s = 0; s < n; s++) {
      const next = (s + 1) % n;
      addRoad(
        `s${s}-${layers - 1}`,
        `s${next}-${layers - 1}`,
        chapter >= 3 && slot % 2 ? 'fast' : 'normal',
      );
      const optional =
        layers > 2
          ? [
              [`s${s}-0`, `s${s}-2`],
              [`s${s}-0`, `s${next}-0`],
              [`s${s}-1`, `s${next}-1`],
              [`s${s}-0`, `s${next}-1`],
              [`s${s}-0`, `s${next}-${layers - 1}`],
              [`s${s}-0`, 'heartland'],
              [`s${s}-1`, 'heartland'],
            ]
          : [
              [`s${s}-0`, `s${next}-0`],
              [`s${s}-0`, `s${next}-1`],
              [`s${s}-0`, `s${(s + n - 1) % n}-1`],
              [`s${s}-0`, 'heartland'],
              [`s${s}-1`, `s${(s + 2) % n}-1`],
              [`s${s}-0`, `s${(s + 2) % n}-0`],
            ];
      optional.forEach(([a, b], bit) => {
        if (masks & (1 << bit))
          addRoad(a, b, chapter >= 3 ? (bit % 2 ? 'fast' : 'slow') : 'normal');
      });
    }
    cities.push(
      city(
        'heartland',
        '中枢',
        195,
        340,
        chapter >= 7 ? 'muster' : chapter >= 5 ? 'pass' : chapter >= 2 ? 'barracks' : 'town',
        {
          general:
            chapter >= 7
              ? ['warrior', 'commander', 'guardian', 'ranger', 'arbalist', 'medic'][slot % 6]
              : null,
          weapon: chapter >= 6 ? ['crossbow', 'catapult', 'cannon'][slot % 3] : null,
        },
      ),
    );
    for (let s = 0; s < n; s++)
      addRoad(
        `s${s}-${layers - 1}`,
        'heartland',
        chapter >= 3 && slot % 3 === 0 ? 'slow' : 'normal',
      );
    spawnSets = [Array.from({ length: n }, (_, s) => `s${s}-0`)];
    if (layers > 2) spawnSets.push(Array.from({ length: n }, (_, s) => `s${s}-1`));
  }
  assert.ok(cities.length <= 12);
  for (const [i, c] of cities.entries()) {
    for (const other of cities.slice(i + 1))
      assert.ok(Math.hypot(c.x - other.x, c.y - other.y) >= 64, `${id}: overlapping city/label`);
    c.junction = {
      id: `${c.id}-switch`,
      x: c.x,
      y: c.y,
      routeIndex: -1,
      exits: roads
        .filter((r) => r.a === c.id || r.b === c.id)
        .map((r) => (r.a === c.id ? r.b : r.a)),
    };
  }
  return {
    id,
    order,
    chapter,
    chapterName: chapters[chapter - 1],
    name:
      order === 1
        ? '初识岔路'
        : order === 3
          ? '两岸争渡'
          : order === 5
            ? '四方逐鹿'
            : `${places[slot]}·${chapters[chapter - 1].slice(0, 2)}`,
    subtitle: chapters[chapter - 1],
    objective: tasks[chapter - 1],
    tutorial: order <= 4 ? ['改道夺城', '屯兵积累', '后方合流', '查看军情'][order - 1] : '',
    duration: chapter >= 5 ? 240 : 180,
    requires: [],
    reward: { unlock: null },
    factions: Array.from({ length: n }, (_, i) => i),
    ai: Object.fromEntries(
      Array.from({ length: n - 1 }, (_, i) => [
        i + 1,
        ['defensive', 'expansionist', 'opportunist'][i],
      ]),
    ),
    baseline: { kind: 'production', value: 0.08, radius: 95 },
    terrain: [
      {
        type: ['forest', 'river', 'mountain', 'plain'][slot % 4],
        x: 195,
        y: 340,
        radius: 65 + slot * 3,
      },
    ],
    spawnSets,
    cities,
    roads,
  };
}

const levels = Array.from({ length: 100 }, (_, i) => buildLevel(i + 1));
levels.forEach((level, i) => {
  level.requires = i ? [levels[i - 1].id] : [];
  level.reward.unlock = levels[i + 1]?.id ?? null;
});
const mode = process.argv[2];
if (mode === '--simulate') {
  const { LEVELS, createMatch, tick, planRoutes, switchRoute, getScore } = await import(
    '../src/core/index.mjs'
  );
  const rows = [];
  for (const level of LEVELS) {
    for (const seed of [1, 2, 3]) {
      const state = createMatch({ levelId: level.id, seed });
      let nextDecision = 0;
      while (state.status === 'playing') {
        if (state.time >= nextDecision) {
          for (const command of planRoutes(state, 0, 'aggressive'))
            switchRoute(state, 0, command.junctionId, command.routeIndex);
          nextDecision += 4;
        }
        tick(state, 0.1);
        assert.ok(
          state.cities.every(
            (c) => Number.isInteger(c.troops) && c.troops >= 0 && c.troops <= c.capacity,
          ),
        );
        assert.ok(
          state.packets.every(
            (p) => Number.isInteger(p.troops) && p.troops >= 0 && Number.isFinite(p.progress),
          ),
        );
        assert.ok(state.generals.every((g) => Number.isFinite(g.health) && g.health > 0));
      }
      rows.push({
        levelId: level.id,
        seed,
        outcome: state.result.outcome,
        reason: state.result.reason,
        elapsed: state.time,
        rankings: getScore(state),
        digest: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
      });
    }
    console.log(
      `${level.order}/100 ${level.id}: ${rows
        .slice(-3)
        .map((r) => `${r.seed}:${r.outcome}/${r.reason}`)
        .join(', ')}`,
    );
  }
  const report = {
    rulesVersion: 2,
    seeds: [1, 2, 3],
    pilot: 'planRoutes aggressive, switchRoute only every 4s; no state edits',
    matches: rows.length,
    outcomes: Object.fromEntries(
      ['victory', 'draw', 'defeat'].map((key) => [
        key,
        rows.filter((r) => r.outcome === key).length,
      ]),
    ),
    timeouts: rows.filter((r) => r.reason === 'timeout').length,
    levelsWithoutPilotWin: LEVELS.filter(
      (l) => !rows.some((r) => r.levelId === l.id && r.outcome === 'victory'),
    ).map((l) => l.id),
    rows,
  };
  await writeFile(
    new URL('docs/design/cocos-2026-10-22/campaign-simulation.json', root),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify({ ...report, rows: undefined }));
} else {
  const files = new Map(
    levels.map((level) => [
      `src/content/maps/${level.id}.mjs`,
      `// Explicit campaign configuration; regenerate with scripts/generate-campaign.mjs.\nexport default ${JSON.stringify(level, null, 2)};\n`,
    ]),
  );
  files.set(
    'src/content/catalog.mjs',
    levels.map((l, i) => `import map${i} from './maps/${l.id}.mjs';`).join('\n') +
      `\nexport const LEVELS = [${levels.map((_, i) => `map${i}`).join(', ')}];\n`,
  );
  if (mode !== '--check') await mkdir(new URL('src/content/maps/', root), { recursive: true });
  const formatting = await resolveConfig(fileURLToPath(new URL('src/content/catalog.mjs', root)));
  for (const [file, text] of files) {
    const formatted = await format(text, { ...formatting, filepath: file });
    if (mode === '--check')
      assert.equal(await readFile(new URL(file, root), 'utf8'), formatted, file);
    else await writeFile(new URL(file, root), formatted);
  }
  console.log(
    `${mode === '--check' ? 'Verified' : 'Wrote'} 100 explicit maps in ${fileURLToPath(new URL('src/content/maps/', root))}`,
  );
}
