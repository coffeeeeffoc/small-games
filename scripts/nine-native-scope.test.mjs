import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  nineNativeFileScopes,
  nineNativeChecks,
  nineNativeScopePaths,
} from './nine-native-scope.mjs';
const baseline = '748f0b15be225ecb03807b4a7b1a3cd737298bda';
const competition = 'platforms/competition/native.js';
const catalog = JSON.parse(
  readFileSync(new URL('../apps/shell-web/src/standalone-games.json', import.meta.url)),
);
const snapshot = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const beforeCompetition = execFileSync('git', ['show', `${baseline}:${competition}`], {
  encoding: 'utf8',
});
const packages = [
  ...catalog.map((game) => ({ dir: game.source })),
  ...['apps/shell-minigame', 'apps/shell-bilibili', 'platforms/bilibili'].map((dir) => ({ dir })),
];
function context(changedPaths = nineNativeScopePaths) {
  return {
    changedPaths,
    games: catalog,
    packages,
    readHead: snapshot,
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
  const head = snapshot(competition),
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
