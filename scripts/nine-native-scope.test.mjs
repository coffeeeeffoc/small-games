import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  nineNativeFileScopes,
  nineNativeChecks,
  nineNativeScopePaths,
  nightProtocolFileScopes,
} from './nine-native-scope.mjs';
const baseline = '748f0b15be225ecb03807b4a7b1a3cd737298bda';
const competition = 'platforms/competition/native.js';
const nightHelper = 'apps/shell-web/scripts/standalone-game-checks.mjs';
const nightSource = 'games/local/night-overwatch';
const nightBase = execFileSync(
  'git',
  ['show', `d3874c73bd75128b45082c4815afef8f9918169a:${nightHelper}`],
  { encoding: 'utf8' },
);
// This proof is for the exact historical Night substitution. The current
// shared helper may contain unrelated game additions, which must stay rejected.
const nightHead = execFileSync(
  'git',
  ['show', `dcf778794c36562634a969b8b8975889c4001d0c:${nightHelper}`],
  { encoding: 'utf8' },
);
function nightContext() {
  return {
    changedPaths: [nightHelper],
    readBase: () => nightBase,
    readHead: () => nightHead,
    gameSources: [nightSource],
  };
}
const catalog = JSON.parse(
  readFileSync(new URL('../apps/shell-web/src/standalone-games.json', import.meta.url)),
);
// Digest proofs use committed Git bytes, independent of Windows checkout EOLs.
const snapshot = (file) =>
  readFileSync(new URL('../' + file, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const beforeCompetition = execFileSync('git', ['show', `${baseline}:${competition}`], {
  encoding: 'utf8',
});
const reviewedCompetitionHead = execFileSync('git', ['show', `f96e909:${competition}`], {
  encoding: 'utf8',
});
const reviewedSnapshot = (file) =>
  file === competition
    ? reviewedCompetitionHead
    : file === nightHelper
      ? nightHead
      : snapshot(file);
const packages = [
  ...catalog.map((game) => ({ dir: game.source })),
  ...['apps/shell-minigame', 'apps/shell-bilibili', 'platforms/bilibili'].map((dir) => ({ dir })),
];
function context(changedPaths = nineNativeScopePaths) {
  return {
    changedPaths,
    games: catalog,
    packages,
    readHead: reviewedSnapshot,
    readBase: (file) => {
      if (file === competition) return beforeCompetition;
      throw new Error('No such file in reviewed base');
    },
  };
}
test('exact seven code paths map reviewed games and actual native hosts; unrelated games are excluded', () => {
  const scopes = nineNativeFileScopes(context());
  assert.equal(scopes.size, 7);
  const checks = nineNativeChecks(nineNativeScopePaths, scopes);
  assert.deepEqual(checks.find((item) => item.type === 'canvas').games, [
    'cops-robbers',
    'cops-robbers-realtime',
    'vibeJam-myself-history-guess',
    'xiangqi-five',
  ]);
  assert.deepEqual(checks.find((item) => item.type === 'entry').games, [
    'cops-robbers',
    'cops-robbers-realtime',
    'letters-words2',
    'vibeJam-myself-history-guess',
    'xiangqi-five',
  ]);
  assert.deepEqual(checks.find((item) => item.type === 'wulong').games, ['wulong-city']);
  assert(
    checks.every(
      (item) =>
        !item.games.includes('carding-car') &&
        !item.games.includes('night-overwatch') &&
        !item.games.includes('travel-bund'),
    ),
  );
  assert(
    checks.find((item) => item.type === 'entry').consumer_sources.includes('platforms/bilibili'),
  );
});
test('only explicit reviewed new-file bytes may classify without base; missing competition base/head stays blocked', () => {
  const c = context();
  c.readBase = () => {
    throw new Error('missing base');
  };
  const scopes = nineNativeFileScopes(c);
  assert.equal(scopes.size, 6);
  assert(!scopes.has(competition));
  c.readHead = () => {
    throw new Error('missing head');
  };
  assert.equal(nineNativeFileScopes(c).size, 0);
});
test('known mixed with unknown or similar paths never classifies the unknown path or lockfile', () => {
  const known = 'scripts/nine-wulong-smoke.mjs';
  const unknown = [
    'scripts/nine-wulong-smoke-new.mjs',
    'platforms/competition/xiangqi-five/other.js',
    'platforms/competition/xiangqi-five/tests/other.test.mjs',
    'scripts/nine-canvas-games-smoke.mjs/bad.js',
    'pnpm-lock.yaml',
  ];
  const scopes = nineNativeFileScopes(context([known, ...unknown]));
  assert.deepEqual([...scopes.keys()], [known]);
  assert.deepEqual(
    nineNativeChecks([known, ...unknown], scopes).map((check) => check.path),
    [known],
  );
});
test('Alipay is additive only: other execution, whitespace, reordered platforms and missing old guard reject', () => {
  const head = reviewedSnapshot(competition),
    c = context([competition]);
  for (const changed of [
    head + '\nglobalThis.unreviewed = true;\n',
    head.replace('const street =', 'const streetChanged ='),
    head.replace("'wechat', 'bilibili'", "'bilibili', 'wechat'"),
    head.replace('if (!sdk)', 'if (false)'),
    head + '\n',
  ]) {
    c.readHead = () => changed;
    assert.equal(nineNativeFileScopes(c).size, 0);
  }
  c.readHead = () => head;
  c.readBase = () => head;
  assert.equal(nineNativeFileScopes(c).size, 0);
  c.readBase = () => beforeCompetition;
  assert.equal(nineNativeFileScopes(c).size, 1);
});
test('source/import/slug additions require new review and do not execute candidate code', () => {
  for (const file of nineNativeScopePaths.filter((file) => file !== competition)) {
    const c = context([file]);
    c.readHead = () => snapshot(file) + '\nthrow new Error("must not execute candidate");\n';
    assert.equal(nineNativeFileScopes(c).size, 0);
  }
  for (const file of [
    'scripts/nine-canvas-games-smoke.mjs',
    'scripts/nine-channel-entry-smoke.mjs',
  ]) {
    const c = context([file]);
    c.readHead = () => snapshot(file).replace("'cops-robbers'", "'unrelated-game'");
    assert.equal(nineNativeFileScopes(c).size, 0);
    c.readHead = () => snapshot(file) + "\nawait import('unreviewed-module');\n";
    assert.equal(nineNativeFileScopes(c).size, 0);
  }
});
test('existing unreviewed baselines and catalog/workspace identity changes remain undefined', () => {
  const file = 'scripts/nine-wulong-smoke.mjs',
    c = context([file]);
  c.readBase = () => 'old unreviewed executable';
  assert.equal(nineNativeFileScopes(c).size, 0);
  c.readBase = () => snapshot(file);
  assert.equal(nineNativeFileScopes(c).size, 1);
  c.games = catalog.filter((game) => game.id !== 'wulong-city');
  assert.equal(nineNativeFileScopes(c).size, 0);
  c.games = [...catalog, { id: 'wulong-city', source: 'games/local/other' }];
  assert.equal(nineNativeFileScopes(c).size, 0);
  c.games = [...catalog, { id: 'other', source: 'games/local/wulong-city' }];
  assert.equal(nineNativeFileScopes(c).size, 0);
  c.games = catalog;
  c.packages = packages.filter((pkg) => pkg.dir !== 'apps/shell-minigame');
  assert.equal(nineNativeFileScopes(c).size, 0);
});
test('root execution descriptors use real script commands and browser is never node --test', () => {
  const checks = nineNativeChecks(nineNativeScopePaths, nineNativeFileScopes(context()));
  for (const check of checks.filter((item) => item.command)) {
    assert.equal(check.command.args.at(-1), check.command.file);
    if (check.command.browser) assert(!check.command.args.includes('--test'));
  }
  for (const file of [
    'scripts/nine-canvas-games-smoke.mjs',
    'scripts/nine-channel-entry-smoke.mjs',
    'scripts/nine-wulong-smoke.mjs',
  ])
    assert.deepEqual(checks.find((check) => check.path === file).command.args, [file]);
  assert.throws(() =>
    nineNativeChecks(
      ['scripts/nine-wulong-smoke.mjs'],
      new Map([['scripts/nine-wulong-smoke.mjs', ['games/local/unrelated']]]),
    ),
  );
});

test('reviewed CJS subset guard retains exact four slugs and rejects whitelist expansion', () => {
  const file = 'scripts/nine-canvas-games-smoke.mjs',
    c = context([file]);
  assert.equal(nineNativeFileScopes(c).size, 1);
  for (const source of [
    snapshot(file).replace('selectedGames.length > 0', 'true'),
    snapshot(file).replace('if (selectedGames && !selectedGames.includes(game)) continue;', ''),
    snapshot(file).replace("'xiangqi-five',", "'xiangqi-five', 'carding-car',"),
  ]) {
    c.readHead = () => source;
    assert.equal(nineNativeFileScopes(c).size, 0);
  }
});

test('overlapping competition proof retains both native runners and all actual host consumers', async () => {
  const { incrementalPlan, reviewedSharedFileScopes } = await import(
    './incremental-validation.mjs'
  );
  const dirs = [
    'apps/shell-web',
    'services/runtime-api',
    'platforms/wechat',
    'platforms/douyin',
    'platforms/kuaishou',
    'platforms/alipay',
  ];
  const c = context([competition]);
  c.packages = [...packages, ...dirs.map((dir) => ({ dir }))];
  const scopes = reviewedSharedFileScopes(c);
  for (const [file, sources] of nineNativeFileScopes(c)) scopes.set(file, sources);
  const plan = incrementalPlan({ ...c, fileScopes: scopes, readSource: snapshot });
  assert.equal(plan.competition.native, true);
  assert.equal(plan.competition.letters, true);
  assert.equal(plan.nine_native_checks.length, 1);
  assert.deepEqual(plan.nine_native_checks[0].games, [
    'cops-robbers',
    'cops-robbers-realtime',
    'letters-words2',
    'vibeJam-myself-history-guess',
    'xiangqi-five',
  ]);
  assert(plan.consumer_sources.includes('apps/shell-bilibili'));
  assert(plan.consumer_sources.includes('services/runtime-api'));
  assert(plan.consumer_sources.includes('platforms/wechat'));
  assert.throws(
    () =>
      incrementalPlan({
        ...c,
        fileScopes: scopes,
        changedPaths: [competition, 'scripts/nine-unreviewed-smoke.mjs'],
        readSource: snapshot,
      }),
    /scope undefined/,
  );
});

test('reviewed Night protocol body maps only its unique canonical game source', () => {
  assert.deepEqual([...nightProtocolFileScopes(nightContext())], [[nightHelper, [nightSource]]]);
  const c = { ...context([nightHelper]), readBase: () => nightBase };
  assert.deepEqual([...nineNativeFileScopes(c)], [[nightHelper, [nightSource]]]);
  assert.equal(nineNativeScopePaths.length, 7);
  assert.deepEqual(nineNativeChecks([nightHelper], nineNativeFileScopes(c)), []);
});

test('Night classification fails closed for unavailable or unreviewed bodies and boundaries', () => {
  const start = "  } else if (id === 'night-overwatch') {";
  const end = "  } else if (id === 'carding-car') {";
  const variants = [
    {
      readBase: () => {
        throw new Error('missing base');
      },
    },
    {
      readHead: () => {
        throw new Error('missing head');
      },
    },
    { readBase: () => undefined },
    { readHead: () => undefined },
    { readBase: () => nightHead },
    { readHead: () => nightBase },
    { readBase: () => nightBase.replace(start, start + '\n// unknown baseline') },
    { readHead: () => nightHead.replace(start, start + '\n// unknown proposal') },
    { readHead: () => nightHead + '\n// outside word' },
    { readHead: () => '// global timeout change\n' + nightHead },
    { readHead: () => nightHead.replace('60000', '60001') },
    { readHead: () => nightHead + start },
    { readHead: () => nightHead + end },
    { readHead: () => nightHead.replace(start, '') },
    { readHead: () => nightHead.replace(end, '') },
    { readHead: () => end + nightHead.replace(end, '') },
    { changedPaths: [nightHelper + '.unknown'] },
    { gameSources: [] },
    { gameSources: [nightSource, nightSource] },
    { gameSources: ['games/local/night-overwatch-alias'] },
    { gameSources: undefined },
    { gameSources: [nightSource, null] },
  ];
  for (const variant of variants) {
    assert.equal(nightProtocolFileScopes({ ...nightContext(), ...variant }).size, 0);
  }
});

test('current shared gameplay additions cannot borrow the historical Night-only scope', () => {
  const current = snapshot(nightHelper);
  assert.notEqual(current, nightHead, 'Current gameplay has independently reviewed game additions');
  assert.equal(nightProtocolFileScopes({ ...nightContext(), readHead: () => current }).size, 0);
  const c = { ...context([nightHelper]), readBase: () => nightBase, readHead: () => current };
  assert.equal(nineNativeFileScopes(c).size, 0);
});

test('integrated Night scope requires exact catalog identity and actual workspace', () => {
  const c = { ...context([nightHelper]), readBase: () => nightBase };
  const other = catalog.filter((game) => game.id !== 'night-overwatch');
  for (const games of [
    other,
    [...catalog, catalog.find((game) => game.id === 'night-overwatch')],
    [...other, { id: 'night-overwatch', source: 'games/local/unknown' }],
    [...catalog, { id: 'alias', source: nightSource }],
    catalog.map((game) => (game.id === 'night-overwatch' ? { ...game, id: 'alias' } : game)),
  ])
    assert.equal(nineNativeFileScopes({ ...c, games }).size, 0);
  assert.equal(
    nineNativeFileScopes({ ...c, packages: packages.filter((pkg) => pkg.dir !== nightSource) })
      .size,
    0,
  );
});

test('Pages consumer selects Night only with explicit mapping; unknown and unmapped helper remain full', async () => {
  const { selectPagesScope } = await import('./pages-test-scope.mjs');
  const c = {
    eventName: 'push',
    refName: 'dev',
    standaloneGames: catalog,
    gameSources: catalog.map((game) => game.source),
    changedPaths: [nightHelper],
    fileScopes: nightProtocolFileScopes(nightContext()),
  };
  const selected = selectPagesScope(c);
  assert.equal(selected.full, false);
  assert.deepEqual(selected.game_ids, ['night-overwatch']);
  assert.deepEqual(selected.game_sources, [nightSource]);
  assert.equal(selectPagesScope({ ...c, fileScopes: new Map() }).full, true);
  assert.equal(
    selectPagesScope({ ...c, changedPaths: [nightHelper, 'scripts/unknown.mjs'] }).full,
    true,
  );
});

test('native dependency graph is source-controlled and includes real game/channel ownership', async () => {
  const { nineNativeDependencyPlan, nineNativeDependencySources } = await import(
    './nine-native-scope.mjs'
  );
  const select = (paths, readSource) =>
    nineNativeDependencyPlan({ changedPaths: paths, games: catalog, readSource });
  assert(
    nineNativeDependencySources().some(
      (entry) => entry.file === 'games/local/travel-bund/src/physics.ts',
    ),
  );
  for (const file of [
    'games/local/travel-bund/native/index.tsx',
    'games/local/travel-bund/src/physics.ts',
    'assets/bund/runtime/world/world.json',
  ]) {
    assert.equal(select([file]).targets.length, 5);
    assert(select([file]).targets.every((target) => target.game === 'travel-bund'));
  }
  assert.deepEqual(select(['games/local/travel-bund/src/main.tsx']).targets, []);
  assert.deepEqual(select(['games/local/travel-bund/src/styles.css']).targets, []);
  const resource = select(['platforms/alipay/native-resources.mjs']);
  assert.deepEqual(
    resource.targets.map(({ game, platform }) => game + ':' + platform),
    ['travel-bund:alipay', 'vibeJam-myself-history-guess:alipay'],
  );
  assert(
    select(['platforms/douyin/new-native-runtime.ts']).targets.every(
      (target) => target.platform === 'douyin',
    ),
  );
  const files = new Map([
    ['games/local/travel-bund/src/physics.ts', "import './new-shared-physics';"],
    ['games/local/travel-bund/src/new-shared-physics.ts', 'export const actual = 1;'],
  ]);
  const dynamic = select(['games/local/travel-bund/src/new-shared-physics.ts'], (file) => {
    if (!files.has(file)) throw new Error('not a file');
    return files.get(file);
  });
  assert.equal(dynamic.targets.length, 5);
  assert(dynamic.targets.every((target) => target.game === 'travel-bund'));
  assert.throws(
    () =>
      nineNativeDependencyPlan({
        changedPaths: ['games/local/travel-bund/native/input.ts'],
        games: catalog.filter((game) => game.id !== 'travel-bund'),
      }),
    /identity/,
  );
});

test('Cocos canonical and shared tool changes require real five-channel Creator artifacts', async () => {
  const { nineNativeDependencyPlan } = await import('./nine-native-scope.mjs');
  for (const file of [
    'games/local/night-overwatch/assets/Bootstrap.ts',
    'games/local/night-overwatch/scripts/build-native.mjs',
  ]) {
    const result = nineNativeDependencyPlan({ changedPaths: [file], games: catalog });
    assert.deepEqual(
      result.blocked.map((item) => item.game),
      ['night-overwatch'],
    );
    assert.equal(result.targets.length, 5);
    assert(result.targets.every((target) => target.requiresCreator === '3.8.8'));
  }
  const result = nineNativeDependencyPlan({
    changedPaths: ['games/local/carding-car/scripts/toolchain.mjs'],
    games: catalog,
  });
  assert.equal(result.targets.length, 10);
  assert.equal(result.blocked.length, 2);
});

test('controlled Travel tool classifies only exact reviewed bytes and canonical consumer', () => {
  const file = 'scripts/nine-travel-native-smoke.mjs';
  const c = context([file]);
  assert.deepEqual([...nineNativeFileScopes(c)], [[file, ['games/local/travel-bund']]]);
  assert.deepEqual(nineNativeChecks([file], nineNativeFileScopes(c)), []);
  assert.equal(nineNativeFileScopes({ ...c, readHead: () => snapshot(file) + '\n' }).size, 0);
  assert.equal(nineNativeFileScopes({ ...c, readBase: () => 'unknown old tool' }).size, 0);
  assert.equal(nineNativeFileScopes({ ...c, changedPaths: [file + '.unknown'] }).size, 0);
  assert.equal(
    nineNativeFileScopes({ ...c, games: catalog.filter((game) => game.id !== 'travel-bund') }).size,
    0,
  );
});

test('root developer helper producers cannot silently skip matching Creator verification', async () => {
  const { nineNativeDependencyPlan } = await import('./nine-native-scope.mjs');
  for (const file of ['platforms/h5/dev-mode.js', 'scripts/sync-game-dev-mode.mjs']) {
    const result = nineNativeDependencyPlan({ changedPaths: [file], games: catalog });
    assert.deepEqual(
      result.blocked.map((item) => item.game),
      ['carding-car', 'night-overwatch'],
    );
    assert.equal(result.targets.length, 10);
  }
});

test('native source discovery honors actual generated Scene boundary and audio port replacement', async () => {
  const { nineNativeDependencyPlan } = await import('./nine-native-scope.mjs');
  const files = new Map([
    [
      'games/local/travel-bund/src/Scene.tsx',
      "import {audio} from './audio';\n// The homepage and tour share one runtime and viewpoint;\nimport './renderer-capabilities';",
    ],
    ['games/local/travel-bund/src/audio.ts', 'export const audio = 1;'],
    ['games/local/travel-bund/src/renderer-capabilities.ts', 'export const gpu = 1;'],
    ['games/local/travel-bund/native/audio.ts', 'export const audio = 1;'],
  ]);
  const readSource = (file) => {
    if (!files.has(file)) throw Error('missing');
    return files.get(file);
  };
  for (const file of [
    'games/local/travel-bund/src/audio.ts',
    'games/local/travel-bund/src/renderer-capabilities.ts',
  ]) {
    assert.deepEqual(
      nineNativeDependencyPlan({ changedPaths: [file], games: catalog, readSource }).targets,
      [],
    );
  }
});

test('real dcf publication base to candidate preserves both reviewed channel-selection scope mappings', () => {
  const files = ['scripts/nine-canvas-games-smoke.mjs', 'scripts/nine-wulong-smoke.mjs'];
  const readBase = (file) =>
    execFileSync('git', ['show', `dcf778794c36562634a969b8b8975889c4001d0c:${file}`], {
      encoding: 'utf8',
    });
  const readHead = (file) =>
    execFileSync('git', ['show', `6e356b17cf69502052ea8a694f6ea9bc308a54bd:${file}`], {
      encoding: 'utf8',
    });
  const c = { ...context(files), readBase, readHead };
  const scopes = nineNativeFileScopes(c);
  assert.equal(scopes.size, 2);
  assert.deepEqual(
    nineNativeChecks(files, scopes).map((check) => check.games),
    [
      ['cops-robbers', 'cops-robbers-realtime', 'vibeJam-myself-history-guess', 'xiangqi-five'],
      ['wulong-city'],
    ],
  );
  for (const file of files) {
    const one = { ...c, changedPaths: [file] };
    assert.equal(nineNativeFileScopes({ ...one, readBase: () => readBase(file) + '\n' }).size, 0);
    assert.equal(nineNativeFileScopes({ ...one, readHead: () => readHead(file) + '\n' }).size, 0);
    assert.equal(
      nineNativeFileScopes({ ...one, readBase: () => readBase(file).replace('alipay', 'unknown') })
        .size,
      0,
    );
    assert.equal(
      nineNativeFileScopes({
        ...one,
        readHead: () => readHead(file).replace('NATIVE_PLATFORMS', 'UNREVIEWED_PLATFORMS'),
      }).size,
      0,
    );
    assert.equal(
      nineNativeFileScopes({
        ...one,
        readBase: () => readHead(file),
        readHead: () => readBase(file),
      }).size,
      0,
    );
  }
});

test('real publication diff with all classifiers keeps navigation H5 and all 35 native pairs including Travel', async () => {
  const base = 'dcf778794c36562634a969b8b8975889c4001d0c',
    head = '6e356b17cf69502052ea8a694f6ea9bc308a54bd';
  const paths = execFileSync('git', ['diff', '--name-only', base, head], { encoding: 'utf8' })
    .trim()
    .split('\n');
  const { workspacePackages } = await import('./validation-plan.mjs');
  const { registrationFileScopes } = await import('./pages-registration-scope.mjs');
  const { nineLockFileScopes } = await import('./nine-lock-scope.mjs');
  const {
    incrementalPlan,
    entryAdapterFileScopes,
    h5AdapterFileScopes,
    developerModeFileScopes,
    nativeWorkspaceFileScopes,
    reviewedSharedFileScopes,
  } = await import('./incremental-validation.mjs');
  const actualPackages = await workspacePackages(fileURLToPath(new URL('../', import.meta.url)));
  const cache = new Map();
  const read = (sha, file) => {
    const key = sha + ':' + file;
    if (!cache.has(key)) {
      try {
        cache.set(
          key,
          execFileSync('git', ['show', key], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          }),
        );
      } catch {
        cache.set(key, undefined);
      }
    }
    if (cache.get(key) === undefined) throw Error('Missing source: ' + key);
    return cache.get(key);
  };
  const c = {
    changedPaths: paths,
    games: catalog,
    packages: actualPackages,
    readBase: (file) => read(base, file),
    readHead: (file) => read(head, file),
  };
  const fileScopes = registrationFileScopes({
    ...c,
    gameSources: actualPackages.filter((pkg) => pkg.dir.startsWith('games/')).map((pkg) => pkg.dir),
  });
  for (const classify of [
    entryAdapterFileScopes,
    h5AdapterFileScopes,
    developerModeFileScopes,
    nativeWorkspaceFileScopes,
    reviewedSharedFileScopes,
    nineNativeFileScopes,
    nineLockFileScopes,
  ]) {
    for (const [file, sources] of classify(c)) fileScopes.set(file, sources);
  }
  const result = incrementalPlan({ ...c, fileScopes, readSource: c.readHead });
  assert.deepEqual(result.browser_ids, ['letters-words2', 'xiangqi-five']);
  const effective = new Set(
    result.nine_native_targets.map((target) => target.game + ':' + target.platform),
  );
  for (const check of result.nine_native_checks)
    for (const game of check.games)
      for (const platform of ['wechat', 'bilibili', 'douyin', 'kuaishou', 'alipay'])
        effective.add(game + ':' + platform);
  assert.equal(effective.size, 35);
  assert.equal([...effective].filter((pair) => pair.startsWith('travel-bund:')).length, 5);
  assert(![...effective].some((pair) => /^(carding-car|night-overwatch):/.test(pair)));
  assert.deepEqual(result.nine_native_blocked, []);
  if (process.env.NINE_NATIVE_SCOPE_REPORT) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      process.env.NINE_NATIVE_SCOPE_REPORT,
      JSON.stringify(
        {
          base,
          head,
          changedPaths: paths,
          fileScopes: [...fileScopes],
          browser_ids: result.browser_ids,
          dependency_native_targets: result.nine_native_targets,
          effective_native_targets: [...effective].sort(),
          native_blocked: result.nine_native_blocked,
          scope:
            'Actual git diff/base/head and workspace/catalog through all production classifiers and incrementalPlan; effective targets use the same legacy-check union as runNineNativeChecks.',
        },
        null,
        2,
      ),
    );
  }
});

test('only exact reviewed source-inventory filter repair exempts unchanged Cocos builders', async () => {
  const { nativeSourceInventoryFileScopes, nineNativeDependencyPlan } = await import(
    './nine-native-scope.mjs'
  );
  const file = 'apps/shell-minigame/scripts/nine-games-build.mjs';
  const original = execFileSync(
    'git',
    ['show', `dcf778794c36562634a969b8b8975889c4001d0c:${file}`],
    { encoding: 'utf8' },
  );
  const repaired = execFileSync('git', ['show', `f96e909:${file}`], { encoding: 'utf8' });
  const c = { ...context([file]), readBase: () => original, readHead: () => repaired };
  const fileScopes = nativeSourceInventoryFileScopes(c);
  assert.equal(fileScopes.size, 1);
  assert.equal(fileScopes.get(file).length, 7);
  assert.deepEqual([...nineNativeFileScopes(c)], [...fileScopes]);
  const plan = (overrides = {}) =>
    nineNativeDependencyPlan({
      changedPaths: [file],
      games: catalog,
      fileScopes,
      readSource: () => repaired,
      ...overrides,
    });
  const exact = plan();
  assert.equal(exact.targets.length, 35);
  assert.deepEqual(exact.blocked, []);
  assert(!exact.targets.some((target) => ['carding-car', 'night-overwatch'].includes(target.game)));
  const { incrementalPlan } = await import('./incremental-validation.mjs');
  const integrated = incrementalPlan({
    ...c,
    fileScopes,
    readSource: (source) => (source === file ? repaired : snapshot(source)),
  });
  assert.equal(integrated.nine_native_targets.length, 35);
  assert.deepEqual(integrated.nine_native_blocked, []);
  assert.deepEqual(integrated.browser_ids, []);
  for (const override of [
    { fileScopes: new Map() },
    { fileScopes: new Map([[file, [...fileScopes.get(file)]]]) },
    { readSource: undefined },
    { readSource: () => repaired + '\n// unrelated builder change' },
    { readSource: () => original },
  ]) {
    const result = plan(override);
    assert.equal(result.targets.length, 45);
    assert.equal(result.blocked.length, 2);
  }
  for (const override of [
    {
      readBase: () => {
        throw Error('missing base');
      },
    },
    { readBase: () => repaired },
    { readBase: () => original + '\n' },
    { readHead: () => repaired + '\n' },
    { readHead: () => original },
    { readHead: () => repaired.replace('sourceFiles,', 'sourceFiles: [],') },
    { games: catalog.filter((game) => game.id !== 'travel-bund') },
    { changedPaths: [file + '.unknown'] },
  ])
    assert.equal(nativeSourceInventoryFileScopes({ ...c, ...override }).size, 0);
});

test('TapTap tools select exactly nine sixth-channel consumers and retain real Creator gates', async () => {
  const { nineNativeDependencyPlan } = await import('./nine-native-scope.mjs');
  const select = (changedPaths) =>
    nineNativeDependencyPlan({
      changedPaths,
      games: catalog,
      packages: [...packages, { dir: 'platforms/taptap' }],
    });
  for (const file of [
    'apps/shell-minigame/scripts/taptap-build.mjs',
    'apps/shell-minigame/scripts/taptap-targets.mjs',
    'apps/shell-minigame/scripts/taptap-package.mjs',
    'apps/shell-minigame/scripts/taptap-smoke.mjs',
  ]) {
    const result = select([file]);
    assert.equal(result.targets.length, 9);
    assert(result.targets.every((target) => target.platform === 'taptap'));
    assert.deepEqual(
      result.targets.filter((target) => target.requiresCreator).map((target) => target.game),
      ['carding-car', 'night-overwatch'],
    );
    assert.deepEqual(
      result.blocked.map((target) => target.game),
      ['carding-car', 'night-overwatch'],
    );
    assert.deepEqual(result.native_only_paths, [file]);
  }
  for (const file of ['taptap-cocos.mjs', 'taptap-cocos-import.mjs', 'taptap-cocos-inputs.mjs']) {
    const result = select(['apps/shell-minigame/scripts/' + file]);
    assert.deepEqual(
      result.targets.map((target) => target.game),
      ['carding-car', 'night-overwatch'],
    );
    assert(
      result.targets.every(
        (target) => target.platform === 'taptap' && target.requiresCreator === '3.8.8',
      ),
    );
  }
  assert.deepEqual(
    select(['apps/shell-minigame/scripts/taptap-travel-smoke.mjs']).targets.map(
      (target) => target.game,
    ),
    ['travel-bund'],
  );
  assert.throws(
    () => select(['apps/shell-minigame/scripts/taptap-unreviewed.mjs']),
    /scope undefined/,
  );
  assert.deepEqual(
    select(['platforms/taptap/native-resources.mjs']).targets.map(
      ({ game, platform }) => `${game}:${platform}`,
    ),
    ['travel-bund:taptap', 'vibeJam-myself-history-guess:taptap'],
  );
  assert.deepEqual(
    select(['platforms/taptap/src/index.ts']).targets.map(
      ({ game, platform }) => `${game}:${platform}`,
    ),
    ['wulong-city:taptap'],
  );
});

test('the exact TapTap CI workflow selects two Cocos consumers and rejects changed execution', () => {
  const file = '.github/workflows/taptap-cocos.yml';
  const text = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const context = {
    changedPaths: [file],
    games: catalog,
    packages: [...packages, { dir: 'platforms/taptap' }],
    readBase: () => null,
    readHead: () => text,
  };
  assert.equal(nineNativeFileScopes(context).size, 1);
  for (const altered of [
    text + '\n',
    text.replace('contents: read', 'contents: write'),
    text.replace('ref: ${{ github.sha }}', 'ref: dev'),
  ])
    assert.equal(nineNativeFileScopes({ ...context, readHead: () => altered }).size, 0);
});

test('shared game sources include TapTap only when its real workspace is available', async () => {
  const { nineNativeDependencyPlan } = await import('./nine-native-scope.mjs');
  const changedPaths = ['games/local/travel-bund/src/physics.ts'];
  const without = nineNativeDependencyPlan({ changedPaths, games: catalog, packages });
  const withTap = nineNativeDependencyPlan({
    changedPaths,
    games: catalog,
    packages: [...packages, { dir: 'platforms/taptap' }],
  });
  assert.equal(without.targets.length, 5);
  assert.equal(withTap.targets.length, 6);
  assert(withTap.targets.every((target) => target.game === 'travel-bund'));
  const platform = nineNativeDependencyPlan({
    changedPaths: ['platforms/wechat/build.mjs'],
    games: catalog,
    packages: [...packages, { dir: 'platforms/taptap' }],
  });
  assert(platform.targets.every((target) => target.platform === 'wechat'));
});

test('TapTap conditional dependency ownership parses execution branches and fails closed on disguised guards', async () => {
  const { nineNativeDependencyPlan } = await import('./nine-native-scope.mjs');
  const producer = 'apps/shell-minigame/scripts/taptap-build.mjs';
  const dependency = 'apps/shell-minigame/scripts/taptap-cocos.mjs';
  const guarded =
    "if (selected.cocos) {\n  const { build } = await import('./taptap-cocos.mjs');\n}";
  for (const [source, count] of [
    [guarded, 2],
    [guarded.replace('selected.cocos', 'true'), 9],
    [guarded + "\nawait import('./taptap-cocos.mjs');", 9],
    ["// if (selected.cocos) {\nconst { build } = await import('./taptap-cocos.mjs');", 9],
    [
      "const misleading = 'if (selected.cocos) {';\nconst { build } = await import('./taptap-cocos.mjs');",
      9,
    ],
  ]) {
    const files = new Map([
      [producer, source],
      [dependency, 'export const build = 1;'],
      ['platforms/taptap/package.json', JSON.stringify({ name: '@coffeeeeffoc/platform-taptap' })],
    ]);
    const result = nineNativeDependencyPlan({
      changedPaths: [dependency],
      games: catalog,
      packages: [...packages, { dir: 'platforms/taptap' }],
      readSource(file) {
        if (!files.has(file)) throw Error('missing');
        return files.get(file);
      },
    });
    assert.equal(result.targets.length, count);
    assert(result.targets.every((target) => target.platform === 'taptap'));
  }
});

test('only the exact TapTap normalizer generator additions select seven TapTap flows without unchanged Creator builds', async () => {
  const { tapNormalizerFileScopes, nineNativeDependencyPlan } = await import(
    './nine-native-scope.mjs'
  );
  const { incrementalPlan } = await import('./incremental-validation.mjs');
  const file = 'apps/shell-minigame/scripts/nine-games-build.mjs';
  const original = execFileSync('git', ['show', `f96e909:${file}`], { encoding: 'utf8' });
  const current = execFileSync('git', ['show', `695b8043:${file}`], { encoding: 'utf8' });
  const reviewedSource = (source) => (source === file ? current : snapshot(source));
  const c = {
    ...context([file]),
    packages: [...packages, { dir: 'platforms/taptap' }],
    readBase: () => original,
    readHead: reviewedSource,
  };
  const fileScopes = tapNormalizerFileScopes(c);
  assert.equal(fileScopes.size, 1);
  assert.deepEqual([...nineNativeFileScopes(c)], [...fileScopes]);
  const result = incrementalPlan({ ...c, fileScopes, readSource: reviewedSource });
  assert.equal(result.nine_native_targets.length, 7);
  assert(
    result.nine_native_targets.every(
      (target) => target.platform === 'taptap' && !target.requiresCreator,
    ),
  );
  assert.deepEqual(result.nine_native_blocked, []);
  assert.deepEqual(result.browser_ids, []);
  for (const override of [
    { fileScopes: new Map() },
    { fileScopes: new Map([[file, [...fileScopes.get(file)]]]) },
    { readSource: (source) => (source === file ? current + '\n' : snapshot(source)) },
  ]) {
    const plan = nineNativeDependencyPlan({
      ...c,
      fileScopes,
      readSource: reviewedSource,
      ...override,
    });
    assert(plan.targets.some((target) => target.platform === 'wechat'));
    assert.deepEqual(
      plan.blocked.map((target) => target.game),
      ['carding-car', 'night-overwatch'],
    );
  }
  for (const override of [
    { readBase: () => original + '\n' },
    { readBase: () => current },
    { readHead: () => current + '\n' },
    {
      readHead: () =>
        current.replace("config.platform === 'taptap'", "config.platform !== 'taptap'"),
    },
    {
      readHead: () =>
        current.replace('await stat(entry);', 'await stat(entry); globalThis.unreviewed = true;'),
    },
    { games: catalog.filter((game) => game.id !== 'wulong-city') },
    { packages },
    { changedPaths: [file + '.unknown'] },
  ])
    assert.equal(tapNormalizerFileScopes({ ...c, ...override }).size, 0);
});

test('exact TapTap competition recognition selects only its native consumers and retains Carding Creator verification', async () => {
  const { tapCompetitionFileScopes, nineNativeDependencyPlan } = await import(
    './nine-native-scope.mjs'
  );
  const { incrementalPlan } = await import('./incremental-validation.mjs');
  const tapPackages = [...packages, { dir: 'platforms/taptap' }];
  for (const [file, count, creators] of [
    ['platforms/competition/client.js', 6, ['carding-car']],
    ['platforms/competition/native.js', 5, []],
  ]) {
    const before = execFileSync('git', ['show', `f96e909:${file}`], { encoding: 'utf8' });
    const after = snapshot(file);
    const c = {
      ...context([file]),
      packages: tapPackages,
      readBase: () => before,
      readHead: snapshot,
    };
    const fileScopes = tapCompetitionFileScopes(c);
    assert.equal(fileScopes.size, 1);
    assert.deepEqual([...nineNativeFileScopes(c)], [...fileScopes]);
    const plan = incrementalPlan({ ...c, fileScopes, readSource: snapshot });
    assert.equal(plan.nine_native_targets.length, count);
    assert(plan.nine_native_targets.every((target) => target.platform === 'taptap'));
    assert.deepEqual(
      plan.nine_native_targets
        .filter((target) => target.requiresCreator)
        .map((target) => target.game),
      creators,
    );
    assert.deepEqual(
      plan.nine_native_blocked.map((target) => target.game),
      creators,
    );
    assert.deepEqual(plan.browser_ids, []);
    assert.equal(plan.competition.native, false);
    assert.equal(plan.competition.h5, false);
    assert.equal(plan.nine_native_checks.length, 0);
    for (const override of [
      { fileScopes: new Map() },
      { fileScopes: new Map([[file, [...fileScopes.get(file)]]]) },
      { readSource: (source) => (source === file ? after + '\n' : snapshot(source)) },
    ]) {
      const full = nineNativeDependencyPlan({
        ...c,
        fileScopes,
        readSource: snapshot,
        ...override,
      });
      assert(full.targets.some((target) => target.platform === 'wechat'));
      assert.deepEqual(full.taptap_only_paths, []);
    }
    for (const override of [
      { readBase: () => before + '\n' },
      { readBase: () => after },
      { readHead: () => after + '\n' },
      {
        readHead: () =>
          after.replace("'tap'", "'wx'").replace("'alipay', 'taptap'", "'taptap', 'alipay'"),
      },
      { readHead: () => after + '\nglobalThis.unreviewed = true;\n' },
      { games: catalog.filter((game) => game.id !== 'xiangqi-five') },
      { packages },
      { changedPaths: [file + '.unknown'] },
    ])
      assert.equal(tapCompetitionFileScopes({ ...c, ...override }).size, 0);
  }
});

test('only exact TapTap kart-sharing wiring and fixture additions select the genuine Carding TapTap consumer', async () => {
  const { tapCompetitionFileScopes, nineNativeDependencyPlan } = await import(
    './nine-native-scope.mjs'
  );
  const { incrementalPlan } = await import('./incremental-validation.mjs');
  const tapPackages = [...packages, { dir: 'platforms/taptap' }];
  for (const file of ['platforms/kart-sharing.js', 'scripts/kart-sharing.test.mjs']) {
    const before = execFileSync('git', ['show', `f96e909:${file}`], { encoding: 'utf8' });
    const after = snapshot(file);
    const c = {
      ...context([file]),
      packages: tapPackages,
      readBase: () => before,
      readHead: snapshot,
    };
    const fileScopes = tapCompetitionFileScopes(c);
    assert.equal(fileScopes.size, 1);
    assert.deepEqual([...nineNativeFileScopes(c)], [...fileScopes]);
    const plan = incrementalPlan({ ...c, fileScopes, readSource: snapshot });
    assert.deepEqual(plan.nine_native_targets, [
      {
        game: 'carding-car',
        platform: 'taptap',
        source: 'games/local/carding-car',
        requiresCreator: '3.8.8',
      },
    ]);
    assert.deepEqual(
      plan.nine_native_blocked.map((target) => target.game),
      ['carding-car'],
    );
    assert.deepEqual(plan.browser_ids, []);
    assert.deepEqual(plan.nine_native_root_checks, [
      { file: 'scripts/kart-sharing.test.mjs', args: ['--test', 'scripts/kart-sharing.test.mjs'] },
    ]);
    for (const override of [
      { readBase: () => before + '\n' },
      { readBase: () => after },
      { readHead: () => after + '\n' },
      { readHead: () => after.replace('taptap:', 'unreviewed:') },
      { readHead: () => after + '\nthrow Error("unreviewed test or runtime");\n' },
      { packages },
      { changedPaths: [file + '.unknown'] },
    ])
      assert.equal(tapCompetitionFileScopes({ ...c, ...override }).size, 0);
    const noProof = nineNativeDependencyPlan({ ...c, readSource: snapshot });
    if (file.startsWith('platforms/')) {
      assert(noProof.targets.some((target) => target.platform === 'wechat'));
      const generalScopes = nineNativeFileScopes({
        ...c,
        readHead: (source) => (source === file ? after + '\n' : snapshot(source)),
      });
      const general = incrementalPlan({ ...c, fileScopes: generalScopes, readSource: snapshot });
      assert.deepEqual(general.browser_ids, ['carding-car']);
    } else
      assert.throws(
        () => incrementalPlan({ ...c, fileScopes: new Map(), readSource: snapshot }),
        /scope undefined/,
      );
  }
});

test('the independent TapTap login installer and packaged helper select all nine TapTap consumers', async () => {
  const { nineNativeDependencyPlan } = await import('./nine-native-scope.mjs');
  for (const file of [
    'apps/shell-minigame/scripts/taptap-login.mjs',
    'platforms/taptap/login.cjs',
  ]) {
    const plan = nineNativeDependencyPlan({
      changedPaths: [file],
      games: catalog,
      packages: [...packages, { dir: 'platforms/taptap' }],
    });
    assert.equal(plan.targets.length, 9);
    assert(plan.targets.every((target) => target.platform === 'taptap'));
    assert.deepEqual(
      plan.blocked.map((target) => target.game),
      ['carding-car', 'night-overwatch'],
    );
    assert.deepEqual(plan.native_only_paths, [file]);
  }
});
