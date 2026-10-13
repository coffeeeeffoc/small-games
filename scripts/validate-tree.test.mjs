import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertNodeOnly, validateTree, runIncrementalToolChecks } from './validate-tree.mjs';
import { publishingConsumers } from './publication-scopes.mjs';
import { createBrowserPreparation } from './browser-preparation.mjs';
import { run } from './validate-push.mjs';

test('cached and explicit browsers are launch-checked without reaching a forbidden download', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'offline browser '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const executable = path.join(root, 'browser');
  await writeFile(executable, '');
  for (const withDeps of [false, true]) {
    for (const explicit of [false, true]) {
      const env = explicit ? { PLAYWRIGHT_EXECUTABLE_PATH: executable } : {};
      let probes = 0;
      const prepare = createBrowserPreparation({
        root,
        env,
        withDeps,
        browserExecutable: () => executable,
        execute: (command, args) => {
          if (command === 'pnpm') throw new Error('403 Domain forbidden');
          assert.equal(command, process.execPath);
          assert.equal(args[0], '-e');
          assert.equal(env.CHROMIUM_PATH, executable);
          assert.equal(env.PLAYWRIGHT_EXECUTABLE_PATH, executable);
          probes++;
        },
      });
      prepare();
      prepare();
      assert.equal(probes, 1);
    }
  }
});

test('invalid explicit browser paths fail before validation without installing a replacement', () => {
  let probes = 0;
  const prepare = createBrowserPreparation({
    root: '/candidate',
    env: { CHROMIUM_PATH: '/invalid/browser' },
    browserExecutable: () => assert.fail('Explicit paths must not select another browser'),
    execute: (command) => {
      assert.equal(command, process.execPath, 'Explicit paths must not reach an installer');
      probes++;
      throw new Error('ENOENT: browser unavailable');
    },
  });
  assert.throws(prepare, /Chromium launch preflight failed.*ENOENT/);
  assert.throws(prepare, /Chromium launch preflight failed.*ENOENT/);
  assert.equal(probes, 2);
});

test('missing default browsers install then probe once with the local or CI dependency policy', () => {
  for (const withDeps of [false, true]) {
    const env = { PLAYWRIGHT_BROWSERS_PATH: '/shared browser cache' };
    const calls = [];
    const prepare = createBrowserPreparation({
      root: '/candidate with spaces',
      env,
      withDeps,
      browserExecutable: () => '/installed Chromium',
      execute: (command, args, cwd, childEnv) => calls.push({ command, args, cwd, childEnv }),
    });
    assert.equal(calls.length, 0, 'Creating the lazy callback must not install a browser');
    prepare();
    prepare();
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].args, [
      'exec',
      'playwright',
      'install',
      ...(withDeps ? ['--with-deps'] : []),
      'chromium',
    ]);
    assert.equal(calls[1].command, process.execPath);
    assert.equal(calls[1].args[0], '-e');
    assert(
      calls.every(({ cwd, childEnv }) => cwd === '/candidate with spaces' && childEnv === env),
    );
    assert.equal(env.CHROMIUM_PATH, '/installed Chromium');
    assert.equal(env.PLAYWRIGHT_EXECUTABLE_PATH, '/installed Chromium');
    assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, '/shared browser cache');
  }
});

test('browser preparation resolves Playwright using the candidate package and cache environment', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'candidate browser '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pkg = path.join(root, 'node_modules/@playwright/test');
  await mkdir(pkg, { recursive: true });
  await writeFile(path.join(root, 'package.json'), '{}');
  await writeFile(path.join(pkg, 'package.json'), '{"main":"index.cjs"}');
  await writeFile(
    path.join(pkg, 'index.cjs'),
    "exports.chromium = { executablePath: () => process.env.PLAYWRIGHT_BROWSERS_PATH + '/candidate-browser' };",
  );
  const parentCache = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.join(root, 'browser cache') };
  delete env.CHROMIUM_PATH;
  delete env.PLAYWRIGHT_EXECUTABLE_PATH;
  const expected = env.PLAYWRIGHT_BROWSERS_PATH + '/candidate-browser';
  createBrowserPreparation({
    root,
    env,
    execute: (command, args, cwd, childEnv, capture) => {
      if (capture === true) return run(command, args, cwd, childEnv, capture);
    },
  })();
  assert.equal(env.CHROMIUM_PATH, expected);
  assert.equal(env.PLAYWRIGHT_EXECUTABLE_PATH, expected);
  assert.equal(process.env.PLAYWRIGHT_BROWSERS_PATH, parentCache);
});

test('browser installation and launch failures block preparation and never mark it ready', () => {
  for (const failedStep of ['exec', '-e']) {
    let attempts = 0;
    const prepare = createBrowserPreparation({
      root: '/candidate',
      env: {},
      browserExecutable: () => '/browser',
      execute: (command, args) => {
        if (args[0] === failedStep) {
          attempts++;
          throw new Error('environment unavailable');
        }
      },
    });
    const message =
      failedStep === '-e' ? /Chromium launch preflight failed/ : /environment unavailable/;
    assert.throws(prepare, message);
    assert.throws(prepare, message);
    assert.equal(attempts, 2);
  }
});

test('local deployment skips broken browsers, reuses a working installation, and never downloads it again', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'reuse browser '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cached = path.join(root, 'cached'),
    chrome = path.join(root, 'chrome'),
    edge = path.join(root, 'edge');
  for (const file of [cached, chrome, edge]) await writeFile(file, '');
  for (const working of [cached, chrome, edge]) {
    const env = {},
      tried = [];
    const prepare = createBrowserPreparation({
      root,
      env,
      reuseInstalled: true,
      browserExecutable: () => cached,
      installedExecutables: () => [chrome, chrome, edge],
      execute: (command, args, cwd, childEnv) => {
        assert.equal(command, process.execPath, 'A working browser must never reach the installer');
        assert.equal(cwd, root);
        assert.equal(childEnv.CHROMIUM_PATH, childEnv.PLAYWRIGHT_EXECUTABLE_PATH);
        tried.push(childEnv.CHROMIUM_PATH);
        if (childEnv.CHROMIUM_PATH !== working) throw new Error('spawn UNKNOWN');
      },
    });
    prepare();
    prepare();
    assert.deepEqual(
      tried,
      [cached, chrome, edge].slice(0, [cached, chrome, edge].indexOf(working) + 1),
    );
    assert.equal(env.PLAYWRIGHT_EXECUTABLE_PATH, working);
    assert.equal(env.CHROMIUM_PATH, working);
  }
});

test('local deployment installs only after every existing browser is unavailable, then launch-checks the download', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'install browser '));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const cachedExists of [false, true]) {
    const executable = path.join(root, cachedExists ? 'broken' : 'missing');
    if (cachedExists) await writeFile(executable, '');
    const env = {},
      calls = [];
    createBrowserPreparation({
      root,
      env,
      reuseInstalled: true,
      browserExecutable: () => executable,
      installedExecutables: () => [],
      execute: (command, args, cwd, childEnv, capture) => {
        calls.push(args);
        if (capture === true) throw new Error('spawn UNKNOWN');
      },
    })();
    assert.deepEqual(calls[cachedExists ? 1 : 0], [
      'exec',
      'playwright',
      'install',
      ...(cachedExists ? ['--force'] : []),
      'chromium',
    ]);
    assert.equal(calls.at(-1)[0], '-e');
    assert.equal(env.PLAYWRIGHT_EXECUTABLE_PATH, executable);
  }
});

test('automatic reuse never replaces an invalid explicitly configured browser', () => {
  const prepare = createBrowserPreparation({
    root: '/game',
    env: { PLAYWRIGHT_EXECUTABLE_PATH: '/invalid/browser' },
    reuseInstalled: true,
    installedExecutables: () => assert.fail('Do not override an explicit browser'),
    browserExecutable: () => assert.fail('Do not override an explicit browser'),
    execute: (command) => {
      assert.equal(command, process.execPath);
      throw new Error('ENOENT');
    },
  });
  assert.throws(prepare, /Chromium launch preflight failed.*ENOENT/);
});

test('browser preparation CLI returns the launch-checked executable from its caller package', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'game browser CLI '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pkg = path.join(root, 'node_modules/@playwright/test');
  await mkdir(pkg, { recursive: true });
  const executable = path.join(root, 'candidate-browser');
  await writeFile(executable, '');
  await writeFile(path.join(pkg, 'package.json'), '{"main":"index.cjs"}');
  await writeFile(
    path.join(pkg, 'index.cjs'),
    `
    exports.chromium = {
      executablePath: () => process.env.PLAYWRIGHT_BROWSERS_PATH + '/candidate-browser',
      launch: async ({ executablePath, channel }) => {
        require('node:assert/strict').equal(executablePath, process.env.PLAYWRIGHT_EXECUTABLE_PATH);
        require('node:assert/strict').equal(channel, 'chromium');
        return { close: async () => {} };
      }
    };
  `,
  );
  const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: root };
  delete env.PLAYWRIGHT_EXECUTABLE_PATH;
  delete env.CHROMIUM_PATH;
  const output = run(
    process.execPath,
    [path.resolve('scripts/browser-preparation.mjs')],
    root,
    env,
    true,
  );
  assert.match(output, /Chromium launch preflight passed/);
  assert.deepEqual(JSON.parse(output.split(/\r?\n/).at(-1)), {
    executablePath: root + '/candidate-browser',
  });
});

test(
  'Windows local browser discovery selects Chrome after cached Chromium fails',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'discover Chrome '));
    t.after(() => rm(root, { recursive: true, force: true }));
    const pkg = path.join(root, 'node_modules/@playwright/test');
    await mkdir(pkg, { recursive: true });
    const cached = path.join(root, 'cached-browser');
    const programFiles = path.join(root, 'Program Files');
    const chrome = path.join(programFiles, 'Google/Chrome/Application/chrome.exe');
    await mkdir(path.dirname(chrome), { recursive: true });
    await writeFile(cached, '');
    await writeFile(chrome, '');
    await writeFile(path.join(pkg, 'package.json'), '{"main":"index.cjs"}');
    await writeFile(
      path.join(pkg, 'index.cjs'),
      `exports.chromium = {
    executablePath: () => process.env.PLAYWRIGHT_BROWSERS_PATH + '/cached-browser',
    launch: async ({ executablePath }) => {
      if (executablePath.endsWith('cached-browser')) throw new Error('spawn UNKNOWN');
      require('node:assert/strict').equal(executablePath, ${JSON.stringify(chrome)});
      return { close: async () => {} };
    }
  };`,
    );
    const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: root };
    for (const key of Object.keys(env)) if (/^ProgramFiles$/i.test(key)) delete env[key];
    env.ProgramFiles = programFiles;
    delete env.PLAYWRIGHT_EXECUTABLE_PATH;
    delete env.CHROMIUM_PATH;
    createBrowserPreparation({
      root,
      env,
      reuseInstalled: true,
      browserExecutable: () => cached,
    })();
    assert.equal(env.PLAYWRIGHT_EXECUTABLE_PATH, chrome);
    assert.equal(env.CHROMIUM_PATH, chrome);
  },
);

test('an H5 preflight failure stops the candidate before validation suites or builds', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'browser preflight candidate '));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'apps/shell-web/src'), { recursive: true });
  await writeFile(
    path.join(root, 'apps/shell-web/src/standalone-games.json'),
    JSON.stringify([{ id: 'letters-words2', source: 'games/local/letters-words2' }]),
  );
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({
      volta: { node: process.versions.node },
      packageManager: 'pnpm@12.6.0',
    }),
  );
  const calls = [];
  await assert.rejects(
    validateTree({
      root,
      incremental: true,
      env: {},
      selectScope: async () => ({ required: true, full: false, risk: 'incremental' }),
      prepareBrowser: () => {
        throw new Error('browser environment unavailable');
      },
      execute: (command, args) => {
        calls.push(args);
        if (command === 'git') return 'scripts/browser-preparation.mjs\0';
        if (args[0] === '--version') return '12.6.0';
      },
    }),
    /browser environment unavailable/,
  );
  assert(
    !calls.some(
      (args) =>
        args.includes('test:validation') || args.includes('build') || args.includes('typecheck'),
    ),
  );
});

test('metadata early return retains mandatory publication checks and propagates their failure', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'publication-metadata-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'apps/shell-web/src'), { recursive: true });
  await writeFile(path.join(root, 'apps/shell-web/src/standalone-games.json'), '[]');
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ volta: { node: process.versions.node }, packageManager: 'pnpm@12.6.0' }),
  );
  const calls = [];
  let failContract = false;
  const options = {
    root,
    incremental: true,
    env: { MINIGAME_RELEASE_GATES: '0' },
    selectScope: async () => ({ required: true, full: false, risk: 'metadata' }),
    prepareBrowser: () => assert.fail('Metadata must not prepare a browser'),
    execute(command, args) {
      calls.push([command === process.execPath ? 'node' : command, ...args]);
      if (command === 'git') return 'platforms/publication-config.mjs\0';
      if (args[0] === '--version') return '12.6.0';
      if (failContract && args.includes('platforms/tests/publication-config.test.mjs'))
        throw new Error('publication config regression');
    },
  };
  const selected = await validateTree(options);
  assert.equal(selected.publication_config_checks, true);
  assert.equal(selected.browser, false);
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  assert.deepEqual(calls.slice(-3), [
    [pnpm, 'check:dependencies'],
    [pnpm, 'test:game-config'],
    ['node', '--test', 'platforms/tests/publication-config.test.mjs'],
  ]);
  assert(!calls.some((call) => call.includes('build') || call.includes('typecheck')));
  failContract = true;
  await assert.rejects(validateTree(options), /publication config regression/);
});

test('catalog and non-publishing interaction checks require explicit affected consumers', () => {
  const calls = [];
  const plan = {
    browser: true,
    catalog_rollout_checks: true,
    native_consumers: [],
    developer_mode_ids: [],
    game_sources: ['games/local/letters-words2', 'games/local/tianxia-chalu'],
    browser_ids: ['letters-words2', 'tianxia-chalu'],
    interaction_browser_ids: ['letters-words2', 'tianxia-chalu'],
  };
  const options = {
    plan,
    packages: plan.game_sources.map((dir) => ({ dir })),
    root: '/candidate',
    env: {},
    execute(command, args) {
      calls.push(args);
    },
  };
  runIncrementalToolChecks(options);
  assert.deepEqual(calls, [
    ['apps/shell-web/scripts/catalog-rollout-smoke.mjs'],
    ['games/local/letters-words2/tests/word-flow.browser.mjs'],
    ['games/local/tianxia-chalu/tests/browser.mjs'],
  ]);
  calls.length = 0;
  runIncrementalToolChecks({
    ...options,
    plan: { ...plan, catalog_rollout_checks: false, game_sources: [], interaction_browser_ids: [] },
  });
  assert.deepEqual(calls, []);
  assert.throws(
    () => runIncrementalToolChecks({ ...options, plan: { ...plan, browser: false } }),
    /requires real browser/,
  );
  assert.throws(
    () => runIncrementalToolChecks({ ...options, packages: [] }),
    /Missing interaction browser consumer/,
  );
  assert.throws(
    () =>
      runIncrementalToolChecks({
        ...options,
        execute() {
          throw new Error('touch regression');
        },
      }),
    /touch regression/,
  );
});

test('publishing browsers run exact bounded suites with native gates off and failures stop publication', () => {
  const expected = {
    'cops-robbers': ['check-rewarded-hints.mjs'],
    'tower-brake': ['publishing-browser.mjs', 'browser.mjs', 'expansion-browser.mjs'],
    'cage-rescue': [
      'reward-browser.mjs',
      'browser.mjs',
      'touch-activation-browser.mjs',
      'expansion-browser.mjs',
    ],
    'ball-roguelite': ['browser.mjs'],
    'ember-bounce': ['browser.mjs'],
    'three-choose-two': ['publishing.browser.mjs'],
    'flick-arena': ['publishing.browser.mjs'],
    'moss-garden': ['publishing.browser.mjs'],
    'chase-thief': ['publishing.browser.mjs'],
    'retreat-rally': ['publishing.browser.mjs'],
    'tiny-signals': ['publishing.browser.mjs'],
    'orbit-atelier': ['publishing.browser.mjs', 'browser.mjs'],
    'wulong-city': ['publishing.browser.mjs'],
    'surprise-kept': ['publishing.browser.mjs'],
    'homebound-station': ['publishing.browser.mjs'],
    'waterline-station': ['publishing.browser.mjs'],
    'rescue-team': ['publishing.browser.mjs'],
    'out-of-frame': ['publishing.browser.mjs'],
    'fold-the-world': ['publishing.browser.mjs'],
    'two-sided-box': ['publishing.browser.mjs'],
  };
  const ids = Object.keys(expected);
  const calls = [];
  const options = {
    plan: {
      browser: true,
      browser_ids: ids,
      publishing_browser_ids: ids,
      native_consumers: [],
      developer_mode_ids: [],
    },
    packages: Object.values(publishingConsumers).map((dir) => ({ dir })),
    root: '/candidate',
    env: { MINIGAME_RELEASE_GATES: '0', PLAYWRIGHT_EXECUTABLE_PATH: '/chromium' },
    execute(command, args, cwd, env, mode) {
      assert.equal(command, process.execPath);
      assert.equal(cwd, '/candidate');
      assert.equal(env.PLAYWRIGHT_EXECUTABLE_PATH, '/chromium');
      assert.equal(mode, 'logged');
      calls.push(args);
    },
  };
  runIncrementalToolChecks(options);
  const scripts = ids.flatMap((id) =>
    expected[id].map(
      (file) => `${publishingConsumers[id]}/${id === 'cops-robbers' ? 'scripts' : 'tests'}/${file}`,
    ),
  );
  assert.deepEqual(
    calls,
    scripts.map((file) => [file]),
  );
  for (const failing of scripts) {
    const attempted = [];
    assert.throws(
      () =>
        runIncrementalToolChecks({
          ...options,
          execute(command, [file]) {
            attempted.push(file);
            if (file === failing) throw new Error('browser regression');
          },
        }),
      /browser regression/,
    );
    assert.deepEqual(attempted, scripts.slice(0, scripts.indexOf(failing) + 1));
  }
  for (const invalid of [
    { publishing_browser_ids: ['unknown'] },
    { browser: false },
    { browser_ids: [] },
  ])
    assert.throws(
      () =>
        runIncrementalToolChecks({
          ...options,
          plan: { ...options.plan, ...invalid },
          execute: () => assert.fail('Invalid target must fail before execution'),
        }),
      /Unreviewed publishing browser target/,
    );
  assert.throws(
    () =>
      runIncrementalToolChecks({
        ...options,
        packages: [],
        execute: () => assert.fail('Missing consumer must fail before execution'),
      }),
    /Unreviewed publishing browser target/,
  );
});
test('publishing and deployment contracts run with native gates deferred and service failures propagate', async () => {
  const { runIncrementalToolChecks } = await import('./validate-tree.mjs');
  const calls = [];
  const options = {
    plan: {
      publishing_checks: true,
      platform_ads_checks: true,
      publication_config_checks: true,
      deployment_bundle_checks: true,
      service_rule_sources: ['services/runtime-api'],
      native_consumers: [],
      developer_mode_ids: [],
    },
    packages: [{ dir: 'services/runtime-api', name: 'runtime', scripts: { test: 'vitest run' } }],
    root: '/fixture',
    env: { MINIGAME_RELEASE_GATES: '0' },
    execute: (command, args) =>
      calls.push([command === process.execPath ? 'node' : command, ...args]),
  };
  runIncrementalToolChecks(options);
  assert.deepEqual(calls, [
    ['node', '--test', 'platforms/h5/tests/publishing.test.mjs'],
    [
      'node',
      '--test',
      'platforms/h5/tests/platform-ads.test.mjs',
      'platforms/h5/tests/deploy-taptap.test.mjs',
      'games/local/cops-robbers/scripts/check-ad-core.mjs',
    ],
    ['node', '--test', 'platforms/tests/publication-config.test.mjs'],
    ['node', '--test', 'scripts/deployment-bundle.test.mjs'],
    ['pnpm', '--filter', 'runtime', 'test'],
  ]);
  assert.throws(
    () =>
      runIncrementalToolChecks({
        ...options,
        execute() {
          throw new Error('regression');
        },
      }),
    /regression/,
  );
});
test('native publication gates default off, retain root rules and preserve Web checks', async () => {
  const { nativeReleaseGatesEnabled, runNineNativeChecks, runIncrementalToolChecks } = await import(
    './validate-tree.mjs'
  );
  for (const value of [undefined, '', '0']) {
    const env = value === undefined ? {} : { MINIGAME_RELEASE_GATES: value };
    assert.equal(nativeReleaseGatesEnabled(env), false);
    const calls = [];
    runNineNativeChecks({
      plan: {
        nine_native_targets: [{ game: 'carding-car', platform: 'taptap' }],
        nine_native_root_checks: [
          {
            file: 'scripts/kart-sharing.test.mjs',
            args: ['--test', 'scripts/kart-sharing.test.mjs'],
          },
        ],
      },
      packages: [],
      root: '/fixture',
      env,
      execute: (command, args) => calls.push(args),
      prepareBrowser: () => assert.fail('No native browser preparation'),
    });
    assert.deepEqual(calls, [['--test', 'scripts/kart-sharing.test.mjs']]);
    const competition = { h5: true, native: true, letters: true, config_tests: false };
    runIncrementalToolChecks({
      plan: {
        competition,
        native_consumers: ['apps/shell-minigame'],
        developer_mode_ids: ['letters-words2'],
      },
      packages: [
        {
          dir: 'games/local/wulong-city',
          name: '@coffeeeeffoc/wulong-city',
          scripts: { build: 'node build.mjs' },
        },
      ],
      root: '/fixture',
      env,
      execute: (command, args) => calls.push(args),
    });
    assert.equal(calls[1][0], 'scripts/run-selected-competition.mjs');
    assert.deepEqual(JSON.parse(calls[1][1]), { ...competition, native: false });
    assert.deepEqual(calls[2], ['--filter', '@coffeeeeffoc/wulong-city', 'build']);
    assert.equal(calls[3][0], 'scripts/test-game-dev-mode.mjs');
    assert.equal(competition.native, true);
  }
  assert.equal(nativeReleaseGatesEnabled({ MINIGAME_RELEASE_GATES: '1' }), true);
  for (const value of ['true', 'yes', '2'])
    assert.throws(
      () => nativeReleaseGatesEnabled({ MINIGAME_RELEASE_GATES: value }),
      /must be 0 or 1/,
    );
});

test('developer-mode touch fixture is required even outside the selected game matrix', () => {
  const calls = [];
  const options = {
    plan: { native_consumers: [], developer_mode_ids: ['out-of-frame'] },
    packages: [],
    root: '/fixture',
    env: {},
    execute: (command, args, root, env) => calls.push({ args, env }),
  };
  assert.throws(() => runIncrementalToolChecks(options), /browser fixture: wulong-city/);
  assert.equal(calls.length, 0);
  runIncrementalToolChecks({
    ...options,
    packages: [
      {
        dir: 'games/local/wulong-city',
        name: '@coffeeeeffoc/wulong-city',
        scripts: { build: 'node build.mjs' },
      },
    ],
  });
  assert.deepEqual(calls[0].args, ['--filter', '@coffeeeeffoc/wulong-city', 'build']);
  assert.deepEqual(calls[1].args, ['scripts/test-game-dev-mode.mjs']);
  assert.equal(calls[1].env.DEV_MODE_GAME_IDS, 'out-of-frame');
});
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
    env: { MINIGAME_RELEASE_GATES: '1' },
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
    env: { MINIGAME_RELEASE_GATES: '1' },
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
          env: { MINIGAME_RELEASE_GATES: '1' },
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
        env: { MINIGAME_RELEASE_GATES: '1' },
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
  const env = { MINIGAME_RELEASE_GATES: '1' };
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
        env: { MINIGAME_RELEASE_GATES: '1' },
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
        env: { MINIGAME_RELEASE_GATES: '1' },
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
    env = { MINIGAME_RELEASE_GATES: '1' };
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
        env: { MINIGAME_RELEASE_GATES: '1' },
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
        env: { MINIGAME_RELEASE_GATES: '1' },
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
        env: { MINIGAME_RELEASE_GATES: '1' },
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
        env: { MINIGAME_RELEASE_GATES: '1' },
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
    MINIGAME_RELEASE_GATES: '1',
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
    const sharing = execFileSync('git', ['show', 'HEAD:platforms/kart-sharing.js'], {
      cwd: new URL('../', import.meta.url),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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
    git('config', 'core.autocrlf', 'false');
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
    assert(calls.some((args) => args.includes('apps/shell-web/scripts/pages-validation.test.mjs')));
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

test('game service client, gateway and deployment checks run in the candidate and fail publication on regression', () => {
  const calls = [];
  const options = {
    root: '/candidate',
    env: {},
    packages: [],
    plan: {
      game_services_checks: true,
      ranked_deployment_checks: true,
      native_consumers: [],
      developer_mode_ids: [],
    },
    execute: (command, args) => calls.push(args),
  };
  runIncrementalToolChecks(options);
  assert.deepEqual(calls, [
    [
      '--test',
      'platforms/competition/tests/game-services.test.mjs',
      'scripts/competition-gateway.test.mjs',
    ],
    ['--test', 'scripts/deploy-tencent.test.mjs'],
  ]);
  assert.throws(
    () =>
      runIncrementalToolChecks({
        ...options,
        execute() {
          throw new Error('game service regression');
        },
      }),
    /game service regression/,
  );
});
