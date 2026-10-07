import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertNodeOnly } from './validate-tree.mjs';
test('pure test dependency traversal and glob expansion; browser, unknown and missing tests fail closed', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pure-tests-'));
  try {
    await writeFile(path.join(dir, 'rules.mjs'), 'export const result = 1;');
    await writeFile(
      path.join(dir, 'rules.test.mjs'),
      "import assert from 'node:assert'; import { result } from './rules.mjs'; assert(result);",
    );
    await assertNodeOnly('node --test *.test.mjs', dir);
    for (const command of [
      'playwright test',
      'unknown test',
      'node missing.mjs',
      'node --test empty*.mjs',
    ])
      await assert.rejects(assertNodeOnly(command, dir));
    await writeFile(path.join(dir, 'rules.mjs'), "import { chromium } from '@playwright/test';");
    await assert.rejects(assertNodeOnly('node --test rules.test.mjs', dir), /Unreviewed/);
    await writeFile(path.join(dir, 'rules.mjs'), "import cp from 'node:child_process';");
    await assert.rejects(assertNodeOnly('node --test rules.test.mjs', dir), /Executable/);
    await writeFile(path.join(dir, 'rules.mjs'), 'export const run = () => import(target);');
    await assert.rejects(assertNodeOnly('node --test rules.test.mjs', dir), /Unreviewed/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Cocos pure rule policy retains exact files without modifying Creator package inputs', async () => {
  const { ruleTask, cocosRuleCommands } = await import('./rule-tasks.mjs');
  for (const [dir, command] of Object.entries(cocosRuleCommands)) {
    const task = ruleTask({
      dir,
      name: dir.split('/').at(-1),
      scripts: { test: 'unsafe browser' },
    });
    assert.equal(task.command, command);
    assert.deepEqual(task.args.slice(2), ['exec', ...command.split(' ')]);
    await assertNodeOnly(command, path.resolve(dir));
  }
});

test('imported browser lint retains rules and declares URLSearchParams read-only', async () => {
  const { staticTaskArgs } = await import('./rule-tasks.mjs');
  const pkg = { dir: 'games/submodules/fishing', name: 'tidebreak', scripts: { lint: 'eslint .' } };
  assert.deepEqual(staticTaskArgs(pkg, 'lint'), [
    '--filter',
    'tidebreak',
    'lint',
    '--global',
    'URLSearchParams',
  ]);
  assert.deepEqual(staticTaskArgs(pkg, 'typecheck'), ['--filter', 'tidebreak', 'typecheck']);
  assert.deepEqual(staticTaskArgs({ ...pkg, dir: 'games/local/a' }, 'lint'), [
    '--filter',
    'tidebreak',
    'lint',
  ]);
});

test('lint follows explicit tracked repository scope; absent or unknown exclusions never skip', async () => {
  const { lintExcludedByRepository } = await import('./rule-tasks.mjs');
  const external = { dir: 'games/submodules/tower-defense-game' };
  const manifest = { scripts: { lint: 'turbo run lint --filter=!./games/submodules/*' } };
  assert.equal(lintExcludedByRepository(external, manifest), true);
  assert.equal(lintExcludedByRepository({ dir: 'games/local/a' }, manifest), false);
  assert.equal(lintExcludedByRepository(external, { scripts: { lint: 'turbo run lint' } }), false);
  assert.equal(
    lintExcludedByRepository(external, {
      scripts: { lint: 'turbo run lint --filter=!something-else' },
    }),
    false,
  );
});

test('aggregate coverage requires the exact same rule command and an unfiltered root task', async () => {
  const { rulesCoveredByAggregate } = await import('./rule-tasks.mjs');
  const manifest = {
    scripts: { test: 'node --test scripts/platform-process.test.mjs && turbo run test' },
  };
  const pkg = {
    name: 'a',
    dir: 'games/local/a',
    scripts: { test: 'node --test tests/*.test.mjs' },
  };
  const tasks = new Map([['a', { command: pkg.scripts.test, directory: pkg.dir }]]);
  assert.equal(rulesCoveredByAggregate(pkg, manifest, tasks), true);
  assert.equal(rulesCoveredByAggregate(pkg, manifest), false);
  assert.equal(rulesCoveredByAggregate(pkg, manifest, new Map()), false);
  assert.equal(
    rulesCoveredByAggregate(
      pkg,
      manifest,
      new Map([['a', { command: pkg.scripts.test, directory: 'games/local/other' }]]),
    ),
    false,
  );
  assert.equal(
    rulesCoveredByAggregate(
      pkg,
      manifest,
      new Map([['a', { command: 'node other.test.mjs', directory: pkg.dir }]]),
    ),
    false,
  );
  assert.equal(
    rulesCoveredByAggregate(
      pkg,
      manifest,
      new Map([['a', { command: pkg.scripts.test, directory: 'games\\local\\a' }]]),
    ),
    true,
  );
  assert.equal(
    rulesCoveredByAggregate(
      { ...pkg, scripts: { ...pkg.scripts, 'test:rules': 'node rules.mjs' } },
      manifest,
      tasks,
    ),
    false,
  );
  for (const command of [
    'turbo run test --filter=a',
    manifest.scripts.test + ' --affected',
    manifest.scripts.test + ' --filter=!a',
    'node custom-tests.mjs',
  ])
    assert.equal(rulesCoveredByAggregate(pkg, { scripts: { test: command } }, tasks), false);
  assert.equal(
    rulesCoveredByAggregate({ name: 'a', dir: 'games/local/a', scripts: {} }, manifest, tasks),
    false,
  );
  assert.equal(
    rulesCoveredByAggregate(
      { dir: 'games/local/carding-car', scripts: { test: 'node --test tests/*.test.ts' } },
      manifest,
      tasks,
    ),
    false,
  );
});

test('first-nine native checks build only mapped games across five platforms, then execute real CJS checks', async () => {
  const { runNineNativeChecks } = await import('./validate-tree.mjs');
  const host = {
    name: '@coffeeeeffoc/shell-minigame',
    dir: 'apps/shell-minigame',
    scripts: {
      test: 'vitest run tests && node --test scripts/*.test.mjs',
      'build:nine': 'node scripts/nine-games-build.mjs',
    },
  };
  const command = { file: 'scripts/nine-wulong-smoke.mjs', args: [] };
  const plan = {
    nine_native_checks: [
      { games: ['wulong-city'], command },
      { games: ['wulong-city'], command },
    ],
  };
  const calls = [];
  runNineNativeChecks({
    plan,
    packages: [host],
    root: '/candidate',
    env: {},
    execute: (...args) => calls.push(args),
  });
  const builds = calls.filter(
    (call) => call[1][0] === 'apps/shell-minigame/scripts/nine-games-build.mjs',
  );
  assert.equal(builds.length, 5);
  assert.deepEqual(
    builds.map((call) => call[1][4]),
    ['wechat', 'bilibili', 'douyin', 'kuaishou', 'alipay'],
  );
  assert(builds.every((call) => call[1][2] === 'wulong-city'));
  assert.equal(calls.filter((call) => call[1][0] === command.file).length, 1);
  assert(
    calls.every(
      (call) =>
        call[3].NATIVE_OUTPUT_ROOT ===
          path.join('/candidate', 'apps/shell-minigame/dist/nine-games') &&
        call[3].NATIVE_SCREENSHOT_ROOT ===
          path.join('/candidate', '.scratch/nine-native-validation/screenshots'),
    ),
  );
  // On Windows this exercises an actual drive-qualified native path, including
  // spaces and Unicode. Preserve the relationship between cwd and both outputs.
  const nativeRoot = path.join(os.tmpdir(), 'native candidate 游戏');
  const nativeCalls = [];
  runNineNativeChecks({
    plan,
    packages: [host],
    root: nativeRoot,
    env: {},
    execute: (...args) => nativeCalls.push(args),
  });
  assert.equal(nativeCalls.length, calls.length);
  for (const call of nativeCalls) {
    assert.equal(call[2], nativeRoot);
    assert.equal(
      call[3].NATIVE_OUTPUT_ROOT,
      path.join(nativeRoot, 'apps', 'shell-minigame', 'dist', 'nine-games'),
    );
    assert.equal(
      call[3].NATIVE_SCREENSHOT_ROOT,
      path.join(nativeRoot, '.scratch', 'nine-native-validation', 'screenshots'),
    );
    assert.equal(
      path.relative(nativeRoot, call[3].NATIVE_OUTPUT_ROOT),
      path.join('apps', 'shell-minigame', 'dist', 'nine-games'),
    );
    assert.equal(
      path.relative(nativeRoot, call[3].NATIVE_SCREENSHOT_ROOT),
      path.join('.scratch', 'nine-native-validation', 'screenshots'),
    );
  }
  for (const key of ['test', 'build:nine']) {
    const rejected = [];
    assert.throws(
      () =>
        runNineNativeChecks({
          plan,
          packages: [{ ...host, scripts: { ...host.scripts, [key]: 'unknown' } }],
          root: '/candidate',
          env: {},
          execute: (...args) => rejected.push(args),
        }),
      /Unreviewed/,
    );
    assert.deepEqual(rejected, []);
  }
  const rejected = [];
  assert.throws(
    () =>
      runNineNativeChecks({
        plan,
        packages: [host],
        root: '/candidate',
        env: {},
        execute: (...args) => {
          rejected.push(args);
          throw Error('build failed');
        },
      }),
    /build failed/,
  );
  assert.equal(rejected.length, 1);
});

test('explicit source targets select only their actual platform and include compiled Travel contracts', async () => {
  const { runNineNativeChecks } = await import('./validate-tree.mjs');
  const host = {
    name: '@coffeeeeffoc/shell-minigame',
    dir: 'apps/shell-minigame',
    scripts: {
      test: 'vitest run tests && node --test scripts/*.test.mjs',
      'build:nine': 'node scripts/nine-games-build.mjs',
    },
  };
  const calls = [];
  const env = {};
  let browserPreparations = 0;
  const plan = {
    nine_native_targets: [
      { game: 'travel-bund', platform: 'alipay' },
      { game: 'travel-bund', platform: 'alipay' },
      { game: 'cops-robbers', platform: 'bilibili' },
      { game: 'letters-words2', platform: 'wechat' },
    ],
  };
  runNineNativeChecks({
    plan,
    packages: [host],
    root: os.tmpdir(),
    env,
    prepareBrowser: () => {
      browserPreparations++;
      env.PLAYWRIGHT_EXECUTABLE_PATH = path.join(os.tmpdir(), 'real-installed-chromium');
    },
    execute: (...args) => calls.push(args),
  });
  assert.equal(browserPreparations, 1);
  const travelCall = calls.find((call) => call[1][0] === 'scripts/nine-travel-native-smoke.mjs');
  assert.equal(travelCall[3].PLAYWRIGHT_EXECUTABLE_PATH, env.PLAYWRIGHT_EXECUTABLE_PATH);
  const builds = calls.filter((call) => call[1][0].endsWith('nine-games-build.mjs'));
  assert.deepEqual(
    builds.map((call) => [call[1][2], call[1][4]]),
    [
      ['travel-bund', 'alipay'],
      ['cops-robbers', 'bilibili'],
      ['letters-words2', 'wechat'],
    ],
  );
  assert.equal(
    calls.find((call) => call[1][0] === 'scripts/nine-travel-native-smoke.mjs')[3].NATIVE_PLATFORMS,
    'alipay',
  );
  const canvas = calls.filter((call) => call[1][0] === 'scripts/nine-canvas-games-smoke.mjs');
  assert.equal(canvas.length, 1);
  assert.equal(canvas[0][3].NATIVE_PLATFORMS, 'bilibili');
  assert.equal(canvas[0][3].NATIVE_GAME_IDS, 'cops-robbers');
  assert.equal(
    calls.find(
      (call) => call[1][1] === 'games/local/letters-words2/tests/native-bundle.test.mjs',
    )[3].NATIVE_PLATFORMS,
    'wechat',
  );
  assert(!calls.some((call) => call[1][0] === 'scripts/nine-wulong-smoke.mjs'));
  assert.throws(
    () =>
      runNineNativeChecks({
        plan: { nine_native_targets: [{ game: 'travel-bund', platform: 'unknown' }] },
        packages: [host],
        root: os.tmpdir(),
        env: {},
        execute: () => assert.fail('invalid selection must not execute'),
      }),
    /Unknown/,
  );
});

test('selected Cocos targets attempt the genuine native builder and missing tools block', async () => {
  const { runNineNativeChecks } = await import('./validate-tree.mjs');
  const host = {
    name: '@coffeeeeffoc/shell-minigame',
    dir: 'apps/shell-minigame',
    scripts: {
      test: 'vitest run tests && node --test scripts/*.test.mjs',
      'build:nine': 'node scripts/nine-games-build.mjs',
    },
  };
  const calls = [];
  assert.throws(
    () =>
      runNineNativeChecks({
        plan: {
          nine_native_targets: [
            { game: 'night-overwatch', platform: 'wechat', requiresCreator: '3.8.8' },
          ],
          nine_native_blocked: [{ game: 'night-overwatch', reason: 'requires actual Creator' }],
        },
        packages: [host],
        root: os.tmpdir(),
        env: {},
        execute: (...args) => {
          calls.push(args);
          throw Error('Creator 3.8.8 missing');
        },
      }),
    /Creator 3.8.8 missing/,
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], [
    'apps/shell-minigame/scripts/nine-games-build.mjs',
    '--game',
    'night-overwatch',
    '--platform',
    'wechat',
    '--preview',
  ]);
});

test('TapTap targets execute their own builder, package tests and smoke without five-channel packaging', async () => {
  const { runNineNativeChecks } = await import('./validate-tree.mjs');
  const host = {
    name: '@coffeeeeffoc/shell-minigame',
    dir: 'apps/shell-minigame',
    scripts: {
      test: 'vitest run tests && node --test scripts/*.test.mjs',
      'build:nine': 'node scripts/nine-games-build.mjs',
      'build:taptap': 'node scripts/taptap-build.mjs',
      'test:taptap': 'node scripts/taptap-smoke.mjs',
    },
  };
  const packages = [host, { dir: 'platforms/taptap', name: '@coffeeeeffoc/platform-taptap' }];
  const calls = [],
    env = {};
  let preparations = 0;
  runNineNativeChecks({
    plan: {
      nine_native_targets: [
        { game: 'travel-bund', platform: 'taptap' },
        { game: 'wulong-city', platform: 'taptap' },
      ],
    },
    packages,
    root: '/candidate',
    env,
    prepareBrowser: () => {
      preparations++;
      env.PLAYWRIGHT_EXECUTABLE_PATH = '/browser';
    },
    execute: (...args) => calls.push(args),
  });
  const output = path.join('/candidate', 'apps/shell-minigame/dist/nine-games');
  const builds = calls.filter((call) => call[1][0].endsWith('taptap-build.mjs'));
  assert.deepEqual(
    builds.map((call) => call[1]),
    [
      [
        'apps/shell-minigame/scripts/taptap-build.mjs',
        '--game',
        'travel-bund',
        '--preview',
        '--output',
        output,
      ],
      [
        'apps/shell-minigame/scripts/taptap-build.mjs',
        '--game',
        'wulong-city',
        '--preview',
        '--output',
        output,
      ],
    ],
  );
  assert(
    !calls.some(
      (call) =>
        call[1].includes('test:nine:resources') || call[1][0].endsWith('nine-games-build.mjs'),
    ),
  );
  assert(calls.some((call) => call[1].join(' ') === '--filter @coffeeeeffoc/platform-taptap test'));
  const smokes = calls.filter((call) => call[1][0].endsWith('taptap-smoke.mjs'));
  assert.equal(smokes.length, 2);
  assert.equal(preparations, 1);
  assert(smokes.every((call) => call[3].PLAYWRIGHT_EXECUTABLE_PATH === '/browser'));
  assert(!calls.some((call) => call[1][0].endsWith('nine-travel-native-smoke.mjs')));
  assert.throws(
    () =>
      runNineNativeChecks({
        plan: { nine_native_targets: [{ game: 'wulong-city', platform: 'taptap' }] },
        packages: [
          { ...host, scripts: { ...host.scripts, 'build:taptap': 'node fake.mjs' } },
          packages[1],
        ],
        root: '/candidate',
        env: {},
        execute: () => assert.fail('unreviewed command must not execute'),
      }),
    /Unreviewed TapTap/,
  );
});

test('a TapTap Creator conversion failure blocks before an old platform package can substitute', async () => {
  const { runNineNativeChecks } = await import('./validate-tree.mjs');
  const host = {
    name: '@coffeeeeffoc/shell-minigame',
    dir: 'apps/shell-minigame',
    scripts: {
      test: 'vitest run tests && node --test scripts/*.test.mjs',
      'build:nine': 'node scripts/nine-games-build.mjs',
      'build:taptap': 'node scripts/taptap-build.mjs',
      'test:taptap': 'node scripts/taptap-smoke.mjs',
    },
  };
  const calls = [];
  assert.throws(
    () =>
      runNineNativeChecks({
        plan: {
          nine_native_targets: [
            { game: 'carding-car', platform: 'taptap', requiresCreator: '3.8.8' },
          ],
        },
        packages: [host, { dir: 'platforms/taptap', name: '@coffeeeeffoc/platform-taptap' }],
        root: '/candidate',
        env: {},
        execute: (...args) => {
          calls.push(args);
          throw Error('Official TapTap conversion missing');
        },
      }),
    /Official TapTap conversion missing/,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1][0], 'apps/shell-minigame/scripts/taptap-build.mjs');
  assert(!calls[0][1].includes('--platform'));
});

test('selected kart-sharing root contracts run before the TapTap Creator gate and unreviewed descriptors never execute', async () => {
  const { runNineNativeChecks } = await import('./validate-tree.mjs');
  const host = {
    name: '@coffeeeeffoc/shell-minigame',
    dir: 'apps/shell-minigame',
    scripts: {
      test: 'vitest run tests && node --test scripts/*.test.mjs',
      'build:nine': 'node scripts/nine-games-build.mjs',
      'build:taptap': 'node scripts/taptap-build.mjs',
      'test:taptap': 'node scripts/taptap-smoke.mjs',
    },
  };
  const calls = [];
  assert.throws(
    () =>
      runNineNativeChecks({
        plan: {
          nine_native_targets: [
            { game: 'carding-car', platform: 'taptap', requiresCreator: '3.8.8' },
          ],
          nine_native_root_checks: [
            {
              file: 'scripts/kart-sharing.test.mjs',
              args: ['--test', 'scripts/kart-sharing.test.mjs'],
            },
          ],
        },
        packages: [host, { dir: 'platforms/taptap', name: '@coffeeeeffoc/platform-taptap' }],
        root: '/candidate',
        env: {},
        execute: (...args) => {
          calls.push(args);
          if (args[1][0].endsWith('taptap-build.mjs'))
            throw Error('Official Creator conversion missing');
        },
      }),
    /Official Creator conversion missing/,
  );
  assert.deepEqual(
    calls.map((call) => call[1][0]),
    ['--test', 'apps/shell-minigame/scripts/taptap-build.mjs'],
  );
  assert.deepEqual(calls[0][1], ['--test', 'scripts/kart-sharing.test.mjs']);
  assert.throws(
    () =>
      runNineNativeChecks({
        plan: {
          nine_native_root_checks: [
            {
              file: 'scripts/unreviewed.test.mjs',
              args: ['--test', 'scripts/unreviewed.test.mjs'],
            },
          ],
        },
        packages: [],
        root: '/candidate',
        env: {},
        execute: () => assert.fail('unknown test must not execute'),
      }),
    /Unreviewed native root check/,
  );
});

test('native-only Creator consumers are checked before types without rebuilding unchanged H5 or including unrelated games', async () => {
  const { mkdir, readFile } = await import('node:fs/promises');
  const { readFileSync, existsSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  const { validateTree } = await import('./validate-tree.mjs');
  const { cleanGitEnv } = await import('./validate-push.mjs');
  const { tapCompetitionFileScopes } = await import('./nine-native-scope.mjs');
  const root = await mkdtemp(path.join(os.tmpdir(), 'native-cocos-preflight-'));
  const env = cleanGitEnv({
    ...process.env,
    KART_PREBUILT_DIR: '',
    NIGHT_OVERWATCH_PREBUILT_DIR: '',
    COCOS_CREATOR: '',
    GIT_AUTHOR_NAME: 'fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  });
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const put = async (file, text) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), text);
  };
  const json = (value) => JSON.stringify(value, null, 2) + '\n';
  const kart = 'games/local/carding-car';
  try {
    await put(
      'package.json',
      json({ volta: { node: process.versions.node }, packageManager: 'pnpm@fixture', scripts: {} }),
    );
    await put(
      'apps/shell-web/src/standalone-games.json',
      json([{ id: 'carding-car', source: kart }]),
    );
    await put(
      `${kart}/package.json`,
      json({
        name: 'kart',
        creator: { version: '3.8.8' },
        scripts: {
          build: 'node unchanged-h5.mjs',
          typecheck: 'node check-types.mjs',
          'test:rules': 'node --test tests/rules.test.mjs',
        },
      }),
    );
    await put(`${kart}/tests/rules.test.mjs`, 'export const pureRulesFixture = true;\n');
    await put(
      `${kart}/scripts/toolchain.mjs`,
      `export const editor=${JSON.stringify(path.join(root, 'missing-Creator'))};\n`,
    );
    await put(
      'games/local/unrelated-cocos/package.json',
      json({
        name: 'unrelated',
        creator: { version: '3.8.8' },
        scripts: { build: 'node unrelated-h5.mjs', typecheck: 'node unrelated-types.mjs' },
      }),
    );
    await put('platforms/taptap/package.json', json({ name: '@coffeeeeffoc/platform-taptap' }));
    await put(
      'apps/shell-minigame/package.json',
      json({
        name: '@coffeeeeffoc/shell-minigame',
        scripts: {
          test: 'vitest run tests && node --test scripts/*.test.mjs',
          'build:nine': 'node scripts/nine-games-build.mjs',
          'build:taptap': 'node scripts/taptap-build.mjs',
          'test:taptap': 'node scripts/taptap-smoke.mjs',
        },
      }),
    );
    await put(
      'scripts/kart-sharing.test.mjs',
      readFileSync(new URL('./kart-sharing.test.mjs', import.meta.url), 'utf8'),
    );
    await put('scripts/check-workspace-dependencies.mjs', 'export const fixtureVersion = 0;\n');
    const sharing = readFileSync(new URL('../platforms/kart-sharing.js', import.meta.url), 'utf8');
    let sharingBaseline = sharing;
    for (const addition of [
      "    taptap: typeof tap !== 'undefined' ? tap : undefined,\n",
      ' || sdks.taptap',
    ]) {
      assert.equal(sharingBaseline.split(addition).length, 2);
      sharingBaseline = sharingBaseline.replace(addition, '');
    }
    assert.deepEqual(
      tapCompetitionFileScopes({
        changedPaths: ['platforms/kart-sharing.js'],
        readBase: () => sharingBaseline,
        readHead: () => sharing,
        games: [{ id: 'carding-car', source: kart }],
        packages: [{ dir: kart }, { dir: 'apps/shell-minigame' }, { dir: 'platforms/taptap' }],
      }).get('platforms/kart-sharing.js'),
      [kart, 'apps/shell-minigame', 'platforms/taptap'],
      'The production proof must accept the exact derived historical bytes',
    );
    await put('platforms/kart-sharing.js', sharingBaseline);
    git('init');
    git('add', '.');
    git('commit', '-m', 'fixture baseline');
    const base = git('rev-parse', 'HEAD').trim();
    await put('platforms/kart-sharing.js', sharing);
    await put('scripts/check-workspace-dependencies.mjs', 'export const fixtureVersion = 1;\n');
    git('commit', '-am', 'TapTap-only sharing');
    const head = git('rev-parse', 'HEAD').trim();
    const calls = [];
    const execute = (command, args, cwd, commandEnv) => {
      if (command === 'git')
        return execFileSync(command, args, {
          cwd,
          env: commandEnv,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      if (args[0] === '--version') return 'fixture';
      calls.push(args);
      if (args.includes('typecheck')) {
        assert.equal(args[1], 'kart', 'Only the real Creator type consumer is checked');
        assert(
          existsSync(path.join(root, kart, 'reports/engine.d.ts')),
          'Engine types must be prepared before typecheck',
        );
      }
      if (args[0] === 'apps/shell-minigame/scripts/taptap-build.mjs')
        throw Error('Official TapTap conversion still required');
      return '';
    };
    await assert.rejects(
      validateTree({ root, base, head, incremental: true, env, execute }),
      /Required Cocos target games\/local\/carding-car:.*requires Creator 3\.8\.8/,
    );
    assert(!calls.some((args) => args.includes('typecheck') || args.includes('build')));
    const editor = path.join(root, 'SDK', 'CocosCreator.exe');
    await put(path.relative(root, editor), 'fixture editor marker');
    await put(
      'SDK/resources/resources/3d/engine/bin/.declarations/cc.d.ts',
      'fixture engine declarations',
    );
    calls.length = 0;
    await assert.rejects(
      validateTree({
        root,
        base,
        head,
        incremental: true,
        env: { ...env, COCOS_CREATOR: editor },
        execute,
      }),
      /Official TapTap conversion still required/,
    );
    assert.equal(calls.filter((args) => args.includes('typecheck')).length, 1);
    const boundaryCheck = calls.findIndex((args) => args.includes('test:boundaries'));
    assert(boundaryCheck >= 0, 'Changed boundary tooling must exercise its real contract tests');
    assert(boundaryCheck < calls.findIndex((args) => args.includes('typecheck')));
    assert(
      !calls.some((args) => args.includes('build')),
      'The unchanged H5 artifact is not rebuilt',
    );
    assert(!existsSync(path.join(root, 'games/local/unrelated-cocos/reports/engine.d.ts')));
    assert(
      (await readFile(path.join(root, kart, 'reports/engine.d.ts'), 'utf8')).includes(
        editor
          .replaceAll('\\', '/')
          .replace('CocosCreator.exe', 'resources/resources/3d/engine/bin/.declarations/cc.d.ts'),
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
