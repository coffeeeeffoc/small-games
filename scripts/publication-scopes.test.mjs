import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  reviewedSharedFileScopes,
  competitionConsumers,
  competitionToolPlan,
  threeChooseTwoBackendFileScope,
} from './publication-scopes.mjs';
import {
  incrementalPlan,
  developerModeFileScopes,
  entryAdapterFileScopes,
} from './incremental-validation.mjs';
import { executeCompetitionChecks } from './run-selected-competition.mjs';
import { shellContractTargets, shellContractFiles } from './validation-plan.mjs';

test('three choose two migration wiring is exact and does not authorize other deployment edits', () => {
  const oldPlatform = "const unrelated = 'keep';\n    '011-competition-profiles.sql',\n";
  const newPlatform = oldPlatform.replace(
    "    '011-competition-profiles.sql',\n",
    "    '011-competition-profiles.sql',\n    '012-three-choose-two.sql',\n",
  );
  assert.equal(
    threeChooseTwoBackendFileScope('scripts/platform.mjs', oldPlatform, newPlatform),
    true,
  );
  for (const after of [
    newPlatform + '\n',
    newPlatform.replace('keep', 'changed'),
    newPlatform.replace('012-', '013-'),
    newPlatform + "    '012-three-choose-two.sql',\n",
  ])
    assert.equal(threeChooseTwoBackendFileScope('scripts/platform.mjs', oldPlatform, after), false);
  assert.equal(
    threeChooseTwoBackendFileScope('scripts/unknown-deploy.mjs', oldPlatform, newPlatform),
    false,
  );
  const migration = readFileSync(
    new URL('../infra/migrations/012-three-choose-two.sql', import.meta.url),
    'utf8',
  );
  assert.equal(
    threeChooseTwoBackendFileScope('infra/migrations/012-three-choose-two.sql', null, migration),
    true,
  );
  assert.equal(
    threeChooseTwoBackendFileScope('infra/migrations/012-three-choose-two.sql', '', migration),
    false,
  );
  assert.equal(
    threeChooseTwoBackendFileScope(
      'infra/migrations/012-three-choose-two.sql',
      null,
      migration + '\n',
    ),
    false,
  );
  assert.equal(
    threeChooseTwoBackendFileScope('infra/migrations/013-other.sql', null, migration),
    false,
  );
});

const games = Object.entries(competitionConsumers).map(([id, source]) => ({ id, source }));
const registry =
  'export const competitionGames = ' +
  JSON.stringify(
    Object.fromEntries(
      games.map(({ id, source }) => [
        id,
        { directory: source, renderer: 'renderer.js', title: id },
      ]),
    ),
    null,
    2,
  ) +
  ';';
const packages = [
  ...games.map(({ id, source }) => ({ name: id, dir: source })),
  ...[
    'apps/shell-web',
    'services/runtime-api',
    'apps/shell-minigame',
    'platforms/wechat',
    'platforms/bilibili',
    'platforms/douyin',
    'platforms/kuaishou',
  ].map((dir) => ({ name: dir, dir })),
];
function classify(file, before, after, more = {}) {
  return reviewedSharedFileScopes({
    changedPaths: [file],
    games,
    readBase: () => before,
    readHead: (name) => (name === file ? after : (more[name] ?? registry)),
  });
}
function plan(paths, fileScopes) {
  return incrementalPlan({
    changedPaths: paths,
    packages,
    games,
    fileScopes,
    readSource: () => '',
  });
}

test('CI timeout growth is a bounded configuration change; commands, conditions and reduced budgets block', () => {
  const file = '.github/workflows/ci.yml';
  const before =
    'jobs:\n  quality:\n    timeout-minutes: 20\n    steps:\n      - run: pnpm check:games\n';
  const after = before.replace('20', '40');
  const scopes = classify(file, before, after);
  assert.deepEqual(scopes.get(file), []);
  assert.equal(plan([file], scopes).competition.config_tests, true);
  assert.equal(plan([file], scopes).validation_tools, true);
  for (const bad of [
    after.replace('check:games', 'echo skipped'),
    after.replace('40', '19'),
    after.replace('40', '361'),
    after + '    if: false\n',
    after + '    timeout-minutes: 50\n',
  ]) {
    const rejected = classify(file, before, bad);
    assert.equal(rejected.has(file), false);
    assert.throws(() => plan([file], rejected), /scope undefined/);
  }
});

test('only additive local machine configuration ignores are accepted; source exclusions and negations block', () => {
  const file = '.gitignore',
    before = 'node_modules/\ndist/\n';
  const allowed = classify(
    file,
    before,
    before + '# local\n.codex/config.toml\n.mcp.json.backup.*\n',
  );
  assert.deepEqual(allowed.get(file), []);
  assert.equal(plan([file], allowed).validation_tools, true);
  for (const after of [
    before + 'games/\n',
    before + '!dist/\n',
    'dist/\nnode_modules/\n.codex/config.toml\n',
    before + '.codex/config.toml\n.codex/config.toml\n',
    'node_modules/\n.codex/config.toml\n',
  ])
    assert.equal(classify(file, before, after).has(file), false);
});

test('format exclusions must point to registered byte-identical fullscreen copies with checked sync entries', () => {
  const file = '.prettierignore',
    before = 'node_modules/\n';
  const copy = games[0].source + '/public/fullscreen.js';
  const extra = {
    [copy]: 'canonical',
    'platforms/h5/fullscreen.js': 'canonical',
    'scripts/sync-h5-fullscreen.mjs': `const copies = ['${copy}'];`,
  };
  assert.deepEqual(classify(file, before, before + copy + '\n', extra).get(file), [
    games[0].source,
  ]);
  for (const [after, more] of [
    [before + copy + '\n', { ...extra, [copy]: 'modified' }],
    [before + copy + '\n', { ...extra, 'scripts/sync-h5-fullscreen.mjs': '' }],
    [before + 'games/local/unknown/public/fullscreen.js\n', extra],
    [before + games[0].source + '/src/app.js\n', extra],
  ])
    assert.equal(classify(file, before, after, more).has(file), false);
});

test('competition shared paths select exactly five registry consumers, while letter tests select one game', () => {
  for (const file of [
    'platforms/competition/h5.js',
    'platforms/competition/native.js',
    'scripts/competition-build.mjs',
    'scripts/competition-native-smoke.mjs',
    'scripts/test-competition-dialogs.mjs',
  ]) {
    const scopes = classify(
      file,
      '',
      file === 'scripts/competition-build.mjs' ? registry : 'new implementation',
    );
    assert.deepEqual(scopes.get(file), Object.values(competitionConsumers));
    const result = plan([file], scopes);
    // competition-build imports native.js only for native entries; the H5 branch
    // imports h5.js. Native contracts remain selected without H5 browser targets.
    assert.deepEqual(
      result.browser_ids,
      file === 'platforms/competition/native.js' ? [] : games.map((game) => game.id).sort(),
    );
    assert.equal(result.full, false);
    assert.equal(result.competition.letters, true);
    const native = [
      'platforms/competition/native.js',
      'scripts/competition-build.mjs',
      'scripts/competition-native-smoke.mjs',
    ].includes(file);
    assert.equal(result.competition.native, native);
    assert.equal(result.consumer_sources.includes('platforms/wechat'), native);
  }
  for (const file of [
    'scripts/letters-words2-competition-mobile.browser.mjs',
    'scripts/letters-words2-competition-renderer.test.mjs',
    'scripts/letters-words2-iframe.browser.mjs',
  ]) {
    const scopes = classify(file, '', 'new test');
    const result = plan([file], scopes);
    assert.deepEqual(result.browser_ids, ['letters-words2']);
    assert.equal(result.competition.letters, true);
    assert.equal(result.competition.native, false);
  }
  assert.throws(() => plan(['platforms/competition/new.js'], new Map()), /scope undefined/);
});

test('new or renamed competition consumers and missing native packages remain classification gaps', () => {
  const file = 'platforms/competition/h5.js';
  for (const altered of [
    registry.replace('"cops-robbers":', '"unknown":'),
    registry.replace('games/local/cops-robbers', 'games/local/unmapped'),
    registry.replace('"title":', '"other":'),
  ])
    assert.equal(
      classify(file, '', 'changed', { 'scripts/competition-build.mjs': altered }).has(file),
      false,
    );
  assert.throws(
    () =>
      competitionToolPlan({
        paths: ['platforms/competition/native.js'],
        games,
        packages: [],
        fileScopes: new Map([
          ['platforms/competition/native.js', Object.values(competitionConsumers)],
        ]),
      }),
    /Missing competition consumer/,
  );
});

test('shared dependency closure and explicit shared-runtime consumers are combined', () => {
  const file = 'platforms/competition/h5.js';
  const scopes = classify(file, '', 'changed');
  const result = incrementalPlan({
    changedPaths: [file, 'packages/shared/index.js'],
    fileScopes: scopes,
    games,
    packages: [...packages, { name: 'shared', dir: 'packages/shared' }],
    readSource: () => '',
  });
  assert.deepEqual(result.browser_ids, games.map((game) => game.id).sort());
});

test('competition runner builds each native game on all default platforms before its real smoke and propagates failures', async () => {
  const calls = [];
  await executeCompetitionChecks({
    plan: { h5: true, native: true, letters: true },
    env: { KEEP: 'yes', PLAYWRIGHT_EXECUTABLE_PATH: '/browser' },
    execute: async (args, env) => calls.push({ args, env }),
    serve: async () => ({
      url: 'http://fixture/',
      close: async () => calls.push({ closed: true }),
    }),
  });
  const ids = Object.keys(competitionConsumers);
  for (let i = 0; i < ids.length; i++) {
    assert.deepEqual(calls[i * 2].args, [
      'scripts/competition-build.mjs',
      '--native',
      `--game=${ids[i]}`,
    ]);
    assert.deepEqual(calls[i * 2 + 1].args, [
      'scripts/competition-native-smoke.mjs',
      `--game=${ids[i]}`,
    ]);
  }
  assert.deepEqual(
    calls.slice(10, 14).map((call) => call.args[0]),
    [
      'scripts/test-competition-dialogs.mjs',
      'scripts/letters-words2-competition-renderer.test.mjs',
      'scripts/letters-words2-competition-mobile.browser.mjs',
      'scripts/letters-words2-iframe.browser.mjs',
    ],
  );
  assert.equal(calls[13].env.GAME_URL, 'http://fixture/');
  assert.equal(calls[13].env.PLAYWRIGHT_EXECUTABLE, '/browser');
  assert.equal(calls[13].env.KEEP, 'yes');
  assert.equal(calls[14].closed, true);
  let closed = false;
  await assert.rejects(
    () =>
      executeCompetitionChecks({
        plan: { h5: false, native: false, letters: true },
        execute: async (args) => {
          if (args[0].includes('iframe')) throw new Error('real assertion failed');
        },
        serve: async () => ({
          url: 'http://fixture/',
          close: async () => {
            closed = true;
          },
        }),
      }),
    /real assertion failed/,
  );
  assert.equal(closed, true);
  let count = 0;
  await assert.rejects(
    () =>
      executeCompetitionChecks({
        plan: { h5: false, native: true, letters: false },
        execute: async () => {
          count++;
          throw new Error('build failed');
        },
      }),
    /build failed/,
  );
  assert.equal(count, 1);
});

test('developer-mode exact legacy-to-immersive migration selects new guarded entries without accepting shared edits', () => {
  const file = 'scripts/test-game-dev-mode.mjs';
  const link = `        assert.equal(\n          await page.getByRole('link', { name: '独立打开' }).getAttribute('href'),\n          await page.locator('iframe').getAttribute('src'),\n        );`;
  const suffix = '\n  await page.goto(`${origin}/independent/wulong-city/?dev`);\n';
  const before = 'const shared = 1;\n' + link + suffix;
  const after = `const shared = 1;\n        if (\n          game.id === 'letters-words2' ||\n          game.id === 'xiangqi-five'\n        ) {\n          await expect(page.locator('.standalone-page')).toHaveAttribute('data-immersive', 'true');\n          await expect(page.getByRole('button', { name: '返回目录', exact: true })).toHaveCount(1);\n          await expect(page.getByRole('link', { name: '独立打开' })).toHaveCount(0);\n        } else {\n${link
    .split('\n')
    .map((line) => '  ' + line)
    .join('\n')}\n        }${suffix}  await page.locator('#start-game').tap();\n`;
  const allGames = [...games, { id: 'wulong-city', source: 'games/local/wulong-city' }];
  const context = {
    changedPaths: [file],
    readBase: () => before,
    readHead: () => after,
    games: allGames,
  };
  assert.deepEqual(
    developerModeFileScopes(context).get(file),
    allGames
      .filter((game) => ['letters-words2', 'xiangqi-five', 'wulong-city'].includes(game.id))
      .map((game) => game.source),
  );
  for (const changed of [
    after.replace('shared = 1', 'shared = 2'),
    after.replace('toHaveCount(1)', 'toHaveCount(0)'),
    after.replace("getAttribute('src')", "getAttribute('wrong')"),
  ])
    assert.equal(developerModeFileScopes({ ...context, readHead: () => changed }).has(file), false);
});

test('planning checkout scope accepts only both exact reviewed producer byte changes', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const base = '9180c805c77c15634f47f0aeee1092a5b1043a73';
  const anchor =
    '      - uses: actions/checkout@v5\n        with:\n          fetch-depth: 0\n      - uses: actions/setup-node@v6\n';
  for (const file of ['.github/workflows/ci.yml', '.github/workflows/pages.yml']) {
    const before = execFileSync('git', ['show', `${base}:${file}`], {
      cwd: root,
      encoding: 'utf8',
    });
    const after = before.replace(
      anchor,
      anchor.replace(
        '          fetch-depth: 0\n',
        '          fetch-depth: 0\n          submodules: recursive\n',
      ),
    );
    const scopes = classify(file, before, after);
    assert.deepEqual(scopes.get(file), []);
    assert.equal(plan([file], scopes).validation_tools, true);
    assert.deepEqual(plan([file], scopes).nine_native_targets, []);
    for (const bad of [
      after + '\n',
      after.replace('recursive', 'false'),
      after.replace('fetch-depth: 0', 'fetch-depth: 1'),
      after + '\npermissions:\n  contents: write\n',
      after.replace('node-version: 24.21.0', 'node-version: 22'),
    ]) {
      assert.equal(classify(file, before, bad).has(file), false);
    }
    assert.equal(classify(file, before + '\n', after).has(file), false);
    assert.equal(classify(file, after, before).has(file), false);
  }
});

test('planning checkout narrows both real producers to one locked gitlink without changing other execution', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const original =
    '      - uses: actions/checkout@v5\n        with:\n          fetch-depth: 0\n      - uses: actions/setup-node@v6\n';
  const recursive =
    '      - uses: actions/checkout@v5\n        with:\n          fetch-depth: 0\n          submodules: recursive\n      - uses: actions/setup-node@v6\n';
  const locked =
    '      - uses: actions/checkout@v5\n        with:\n          fetch-depth: 0\n      - name: Read locked Xiangqi workspace for planning\n        run: |\n          git -c url.https://github.com/.insteadOf=git@github.com: submodule update --init -- games/submodules/xiangqi-five\n      - uses: actions/setup-node@v6\n';
  for (const [base, anchor] of [
    ['9180c805c77c15634f47f0aeee1092a5b1043a73', original],
    ['d75a26ff456d088745d05b499f86872169ae8bc2', recursive],
  ]) {
    for (const file of ['.github/workflows/ci.yml', '.github/workflows/pages.yml']) {
      const before = execFileSync('git', ['show', `${base}:${file}`], {
        cwd: root,
        encoding: 'utf8',
      });
      assert.equal(before.split(anchor).length, 2);
      const after = before.replace(anchor, locked);
      const scopes = classify(file, before, after);
      assert.deepEqual(scopes.get(file), []);
      assert.equal(plan([file], scopes).validation_tools, true);
      assert.deepEqual(plan([file], scopes).nine_native_targets, []);
      for (const bad of [
        after + '\n',
        after.replace('--init --', '--init --remote --'),
        after.replace(' -- games/submodules/xiangqi-five', ''),
        after.replace('games/submodules/xiangqi-five', 'games/submodules/office-slacking'),
        after.replace('node-version: 24.21.0', 'node-version: 22'),
      ])
        assert.equal(classify(file, before, bad).has(file), false);
      assert.equal(classify(file, before + '\n', after).has(file), false);
    }
  }
});

test('Pages logic history repair preserves all other jobs and execution bytes', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const file = '.github/workflows/pages-validate.yml';
  const before = execFileSync('git', ['show', `654a0acf72cb76748c7bc8df82ba06916b2c303d:${file}`], {
    cwd: root,
    encoding: 'utf8',
  });
  const offset = before.indexOf('  logic:\n');
  const anchor =
    '      - uses: actions/checkout@v5\n        with:\n          submodules: recursive\n';
  const after =
    before.slice(0, offset) +
    before.slice(offset).replace(anchor, anchor + '          fetch-depth: 0\n');
  const scopes = classify(file, before, after);
  assert.deepEqual(scopes.get(file), []);
  assert.equal(plan([file], scopes).validation_tools, true);
  assert.deepEqual(plan([file], scopes).nine_native_targets, []);
  for (const bad of [
    after + '\n',
    after.replace('fetch-depth: 0', 'fetch-depth: 1'),
    after.replace('pnpm check:games', 'echo skipped'),
    after.replace('timeout-minutes: 40', 'timeout-minutes: 1'),
    before.replace(anchor, anchor + '          fetch-depth: 0\n'),
  ])
    assert.equal(classify(file, before, bad).has(file), false);
  assert.equal(classify(file, before + '\n', after).has(file), false);
});

test('bare planning jobs install only the reviewed pinned parser without changing gates', async () => {
  const { readFileSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  for (const file of ['.github/workflows/ci.yml', '.github/workflows/pages.yml']) {
    const before = execFileSync(
      'git',
      ['show', `c83e51299219c969c934618ca76fe0ae77f0eaa3:${file}`],
      { encoding: 'utf8' },
    );
    const after = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    assert.deepEqual(classify(file, before, after).get(file), []);
    for (const bad of [
      after.replace('--ignore-scripts ', ''),
      after.replace('prettier@$parser_version', 'prettier@latest'),
      after + '\n# unreviewed execution boundary\n',
      after.replace('node scripts/pages-test-scope.mjs', 'echo skipped'),
    ])
      assert.equal(classify(file, before, bad).has(file), false);
    assert.equal(classify(file, before + '\n# unknown baseline\n', after).has(file), false);
  }
});
const cageSource = 'games/local/cage-rescue';
const cageChecksFile = 'apps/shell-web/scripts/game-checks/cage-rescue.mjs';
const sharedChecksFile = 'apps/shell-web/scripts/standalone-game-checks.mjs';
const cageEntryFile = 'apps/shell-web/scripts/standalone-game-entry.mjs';
const cageModule = readFileSync(new URL('../' + cageChecksFile, import.meta.url), 'utf8');
const cageHeader = 'export async function assertStandaloneGameplay(frame, id, mobile = false) {\n';
const cageDelegate =
  "  if (id === 'cage-rescue') {\n" +
  "    const { assertCageRescueGameplay } = await import('./game-checks/cage-rescue.mjs');\n" +
  '    return assertCageRescueGameplay(frame, mobile);\n' +
  '  }\n';
const cageBase =
  "import { expect } from '@playwright/test';\n" +
  "import { enterStandalone } from './standalone-game-entry.mjs';\n" +
  cageHeader +
  '  const click = (locator) => (mobile ? locator.tap() : locator.click());\n' +
  "  if (id === 'letters-words2') await click(frame.locator('#start'));\n" +
  '}\n';
const cageHead = cageBase.replace(cageHeader, cageHeader + cageDelegate);
const cageGames = [...games, { id: 'cage-rescue', source: cageSource }];
const cagePackages = [
  ...packages.map((pkg) =>
    pkg.dir === 'apps/shell-web' ? { ...pkg, coffeeeeffoc: { role: 'shell' } } : pkg,
  ),
  { name: 'cage-rescue', dir: cageSource },
];
function cageContext(changes = {}) {
  return {
    games: cageGames,
    changedPaths: [sharedChecksFile, cageChecksFile],
    readBase: (file) => (file === sharedChecksFile ? cageBase : ''),
    readHead: (file) =>
      file === sharedChecksFile ? cageHead : file === cageChecksFile ? cageModule : '',
    ...changes,
  };
}

test('cage rescue lazy gameplay delegation selects only its catalog source and keeps finite Shell contracts', () => {
  const context = cageContext();
  const scopes = reviewedSharedFileScopes(context);
  assert.deepEqual(
    [...scopes],
    context.changedPaths.map((file) => [file, [cageSource]]),
  );
  assert.equal(cageHead.replace(cageDelegate, ''), cageBase);
  const result = incrementalPlan({
    ...context,
    packages: cagePackages,
    fileScopes: scopes,
    readSource: context.readHead,
  });
  assert.equal(result.full, false);
  assert.deepEqual(result.browser_ids, ['cage-rescue']);
  assert.deepEqual(result.game_sources, [cageSource]);
  assert.deepEqual(
    shellContractTargets(cagePackages, context.changedPaths).map((pkg) => pkg.dir),
    ['apps/shell-web'],
  );
  assert.ok(shellContractFiles.includes('tests/standalone-immersive.integration.test.tsx'));
  assert.ok(shellContractFiles.includes('tests/play-entry.integration.test.tsx'));
});

test('dedicated gameplay module is bounded when its delegation already exists in the baseline', () => {
  const context = cageContext({
    changedPaths: [cageChecksFile],
    readBase: (file) => (file === sharedChecksFile ? cageHead : ''),
  });
  assert.deepEqual([...reviewedSharedFileScopes(context)], [[cageChecksFile, [cageSource]]]);
  const sibling = 'apps/shell-web/scripts/game-checks/unknown.mjs';
  assert.equal(
    reviewedSharedFileScopes(cageContext({ changedPaths: [sibling] })).has(sibling),
    false,
  );
});

test('gameplay proof rejects changed shared behavior, moved/duplicate delegates and unconditional imports', () => {
  const variants = [
    cageHead.replace('locator.tap()', 'locator.click()'),
    cageHead.replace("id === 'cage-rescue'", "id !== 'cage-rescue'"),
    cageHead.replace('return assertCageRescueGameplay(frame, mobile);', 'return;'),
    cageHead.replace(cageDelegate, cageDelegate + cageDelegate),
    cageHead
      .replace(cageHeader + cageDelegate, cageHeader)
      .replace("  if (id === 'letters-words2')", cageDelegate + "  if (id === 'letters-words2')"),
    "import './game-checks/cage-rescue.mjs';\n" + cageHead,
    cageHead + 'globalThis.unreviewedSharedExecution = true;\n',
    `const lookalike = ${JSON.stringify(cageHeader + cageDelegate)};\n` + cageBase,
  ];
  for (const after of variants) {
    const context = cageContext({
      readHead: (file) => (file === sharedChecksFile ? after : cageModule),
    });
    assert.equal(reviewedSharedFileScopes(context).size, 0);
  }
  assert.equal(
    reviewedSharedFileScopes(
      cageContext({
        readBase: () => {
          throw new Error('Missing baseline');
        },
      }),
    ).size,
    0,
  );
});

test('dedicated gameplay proof rejects extra dependencies and nested executable injections without executing source', () => {
  const variants = [
    cageModule.replace("'@playwright/test'", "'./unreviewed.mjs'"),
    "import 'node:child_process';\n" + cageModule,
    cageModule + 'globalThis.cageScopeInjected = true;\n',
    cageModule.replace('  const click =', "  await import('node:child_process');\n  const click ="),
    cageModule.replace(
      '  const click =',
      "  eval('globalThis.cageScopeInjected = true');\n  const click =",
    ),
    cageModule.replace('locator.tap()', 'locator.click()'),
    cageModule.replace("await click(frame.locator('#pause'));", 'return;'),
  ];
  for (const module of variants) {
    const context = cageContext({
      readHead: (file) => (file === sharedChecksFile ? cageHead : module),
    });
    assert.equal(reviewedSharedFileScopes(context).size, 0);
  }
  assert.equal(globalThis.cageScopeInjected, undefined);
});

test('single-game classification requires a unique exact catalog id/source binding', () => {
  for (const catalog of [
    games,
    [...games, { id: 'cage-rescue', source: 'games/local/other' }],
    [...games, { id: 'other', source: cageSource }],
    [...cageGames, { id: 'cage-rescue', source: cageSource }],
    [...cageGames, { id: 'alias', source: cageSource }],
  ])
    assert.equal(reviewedSharedFileScopes(cageContext({ games: catalog })).size, 0);
});

const immersiveFixtures = [
  {
    file: 'apps/shell-web/src/StandaloneGame.tsx',
    anchor: '  const immersive =\n',
    addition: "    id === 'cage-rescue' ||\n",
    before:
      "export function Host(id: string) {\n  const immersive =\n    id === 'letters-words2' ||\n    id === 'xiangqi-five';\n  if (event.source !== frame.current?.contentWindow || event.origin !== origin) return;\n  return immersive;\n}\n",
  },
  {
    file: 'apps/shell-web/scripts/pages-smoke.mjs',
    anchor: 'const immersiveGame = (id) =>\n  [\n',
    addition: "    'cage-rescue',\n",
    before:
      "const immersiveGame = (id) =>\n  [\n    'letters-words2',\n    'xiangqi-five',\n  ].includes(id);\nexport const checkOrigin = (event) => event.origin === origin;\n",
  },
  {
    file: 'apps/shell-web/tests/standalone-immersive.integration.test.tsx',
    anchor: 'it.each([\n',
    addition: "  'cage-rescue',\n",
    before:
      "it.each([\n  'letters-words2',\n  'xiangqi-five',\n])('checks display state for %s', async (id) => {\n  expect(event.origin).toBe(origin);\n});\n",
  },
  {
    file: 'apps/shell-web/tests/standalone.integration.test.tsx',
    anchor: '      if (\n',
    addition: "        id === 'cage-rescue' ||\n",
    before:
      "it('opens all standalone games', async () => {\n  for (const { id } of games) {\n      if (\n        id === 'letters-words2' ||\n        id === 'xiangqi-five'\n      ) {\n        expect(event.origin).toBe(origin);\n      }\n  }\n});\n",
  },
];

test('exact cage rescue immersion allowlist additions stay game-scoped without dropping Shell contracts', () => {
  for (const { file, before, anchor, addition } of immersiveFixtures) {
    const after = before.replace(anchor, anchor + addition);
    const context = cageContext({
      changedPaths: [file],
      readBase: () => before,
      readHead: () => after,
    });
    const scopes = reviewedSharedFileScopes(context);
    assert.deepEqual([...scopes], [[file, [cageSource]]]);
    assert.equal(after.replace(addition, ''), before);
    const result = incrementalPlan({
      ...context,
      packages: cagePackages,
      fileScopes: scopes,
      readSource: context.readHead,
    });
    assert.deepEqual(result.browser_ids, ['cage-rescue']);
    assert.deepEqual(
      shellContractTargets(cagePackages, [file]).map((pkg) => pkg.dir),
      ['apps/shell-web'],
    );
  }
});

test('immersion proof rejects origin/source changes, unsafe selectors, duplicates and lookalike strings', () => {
  for (const { file, before, anchor, addition } of immersiveFixtures) {
    const after = before.replace(anchor, anchor + addition);
    for (const bad of [
      after.replace('event.origin', 'event.otherOrigin'),
      after.replace(addition, addition + addition),
      after.replace("'cage-rescue'", "'other-game'"),
      after + '\nconsole.log("shared execution changed");\n',
      after.replace("'cage-rescue'", '(globalThis.cageScopeInjected = true)'),
    ])
      assert.equal(
        reviewedSharedFileScopes(
          cageContext({ changedPaths: [file], readBase: () => before, readHead: () => bad }),
        ).has(file),
        false,
      );
    const lookalike = 'const text = `' + before + '`;\n';
    assert.equal(
      reviewedSharedFileScopes(
        cageContext({
          changedPaths: [file],
          readBase: () => lookalike,
          readHead: () => lookalike.replace(anchor, anchor + addition),
        }),
      ).has(file),
      false,
    );
  }
  const fixture = immersiveFixtures[0];
  const after = fixture.before
    .replace(fixture.anchor, fixture.anchor + fixture.addition)
    .replace('event.source !== frame.current?.contentWindow', 'false');
  assert.equal(
    reviewedSharedFileScopes(
      cageContext({
        changedPaths: [fixture.file],
        readBase: () => fixture.before,
        readHead: () => after,
      }),
    ).has(fixture.file),
    false,
  );
});

test('new cage gameplay, entry selectors and immersion wiring compose without unrelated browser targets', () => {
  const entryBase =
    "export const markers = { 'letters-words2': '#home' };\nexport const homeControls = { 'letters-words2': '#start' };\nexport const legacyEntryIds = [];\n";
  const entryHead = entryBase
    .replace(
      "{ 'letters-words2': '#home' }",
      "{ 'letters-words2': '#home', 'cage-rescue': '#app' }",
    )
    .replace(
      "{ 'letters-words2': '#start' }",
      "{ 'letters-words2': '#start', 'cage-rescue': '#start' }",
    );
  const before = new Map([
    [sharedChecksFile, cageBase],
    [cageEntryFile, entryBase],
  ]);
  const after = new Map([
    [sharedChecksFile, cageHead],
    [cageChecksFile, cageModule],
    [cageEntryFile, entryHead],
  ]);
  for (const fixture of immersiveFixtures) {
    before.set(fixture.file, fixture.before);
    after.set(
      fixture.file,
      fixture.before.replace(fixture.anchor, fixture.anchor + fixture.addition),
    );
  }
  const context = cageContext({
    changedPaths: [...after.keys()],
    readBase: (file) => before.get(file) ?? '',
    readHead: (file) => after.get(file) ?? '',
  });
  const scopes = new Map([
    ...reviewedSharedFileScopes(context),
    ...entryAdapterFileScopes(context),
  ]);
  assert.equal(scopes.size, context.changedPaths.length);
  const result = incrementalPlan({
    ...context,
    packages: cagePackages,
    fileScopes: scopes,
    readSource: context.readHead,
  });
  assert.deepEqual(result.browser_ids, ['cage-rescue']);
  assert.deepEqual(result.game_sources, [cageSource]);
  assert.equal(result.full, false);
  assert.deepEqual(
    shellContractTargets(cagePackages, context.changedPaths).map((pkg) => pkg.dir),
    ['apps/shell-web'],
  );
});

test('Pages cage rescue home-state guard and immersion list compose while every other byte stays fixed', () => {
  const fixture = immersiveFixtures.find(
    (entry) => entry.file === 'apps/shell-web/scripts/pages-smoke.mjs',
  );
  const oldGuard =
    "      } else if (game.id === 'ball-roguelite' || game.id === 'orbit-atelier') {\n";
  const newGuard =
    '      } else if (\n' +
    "        game.id === 'cage-rescue' ||\n" +
    "        game.id === 'ball-roguelite' ||\n" +
    "        game.id === 'orbit-atelier'\n" +
    '      ) {\n';
  const body =
    "        await expect(page.locator('.standalone-page nav')).toBeVisible();\n        await expect(page.getByRole('link', { name: '独立打开' })).toHaveCount(0);\n";
  const before =
    fixture.before +
    "async function check(game) {\n      if (game.id === 'chase-thief') {\n        await checkChase();\n" +
    oldGuard +
    body +
    '      }\n}\n';
  const after = before
    .replace(fixture.anchor, fixture.anchor + fixture.addition)
    .replace(oldGuard, newGuard);
  const context = cageContext({
    changedPaths: [fixture.file],
    readBase: () => before,
    readHead: () => after,
  });
  const scopes = reviewedSharedFileScopes(context);
  assert.deepEqual([...scopes], [[fixture.file, [cageSource]]]);
  assert.equal(after.replace(fixture.addition, '').replace(newGuard, oldGuard), before);
  const result = incrementalPlan({
    ...context,
    packages: cagePackages,
    fileScopes: scopes,
    readSource: context.readHead,
  });
  assert.deepEqual(result.browser_ids, ['cage-rescue']);
  assert.deepEqual(
    shellContractTargets(cagePackages, context.changedPaths).map((pkg) => pkg.dir),
    ['apps/shell-web'],
  );
  for (const bad of [
    after.replace('toBeVisible()', 'toBeHidden()'),
    after.replace('toHaveCount(0)', 'toHaveCount(1)'),
    after.replace(newGuard, newGuard.replace("'cage-rescue'", "'another-game'")),
    after.replace(newGuard, newGuard.replace('game.id ===', 'game.id !==')),
    after.replace(newGuard, newGuard.replace('game.id', "game['id']")),
    after.replace('await checkChase();', 'return;'),
    after.replace(body, body + '        globalThis.cageScopeInjected = true;\n'),
    after.replace(fixture.addition, ''),
  ])
    assert.equal(
      reviewedSharedFileScopes({ ...context, readHead: () => bad }).has(fixture.file),
      false,
    );
  const lookalikeBefore =
    fixture.before + 'const text = `' + before.slice(fixture.before.length) + '`;\n';
  const lookalikeAfter = lookalikeBefore
    .replace(fixture.anchor, fixture.anchor + fixture.addition)
    .replace(oldGuard, newGuard);
  assert.equal(
    reviewedSharedFileScopes({
      ...context,
      readBase: () => lookalikeBefore,
      readHead: () => lookalikeAfter,
    }).has(fixture.file),
    false,
  );
});
