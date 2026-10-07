import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import { ciValidation } from './ci-validation.mjs';
import { incrementalPlan } from './incremental-validation.mjs';
test('CI consumes the same comparison SHAs and never installs/launches browsers for docs or pure metadata', async () => {
  for (const risk of ['metadata', 'rules']) {
    const plan = {
      full: false,
      risk,
      browser: false,
      cocos: false,
      diff_base: 'saved-validated-base',
      diff_head: 'actual-target',
    };
    let tree;
    await ciValidation({
      root: '/fixture',
      env: { TURBO_SCM_BASE: 'cancelled-predecessor' },
      selectPlan: async () => plan,
      treeValidator: async (value) => {
        tree = value;
        return { browser: false, browser_ids: [] };
      },
      execute: () => {
        throw new Error('unexpected browser command');
      },
    });
    assert.equal(tree.base, 'saved-validated-base');
    assert.equal(tree.head, 'actual-target');
    assert.equal(tree.incremental, true);
  }
});
test('selective CI does not call aggregate Shell smoke or ^build game test tasks', async () => {
  const calls = [];
  const plan = { full: false, browser: true, cocos: false, diff_base: 'base', diff_head: 'head' };
  await ciValidation({
    env: {},
    selectPlan: async () => plan,
    treeValidator: async (value) => {
      assert.equal(value.deferIdenticalRulesToAggregate, false);
      return { browser: true, browser_ids: ['actual-game'], game_sources: ['games/actual'] };
    },
    execute: (command, args) => calls.push({ command, args }),
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].args[0], 'scripts/run-selected-browser.mjs');
  assert(
    !calls.some(({ args }) => args.includes('smoke:affected') || args.includes('test:affected')),
  );
});
test('workflow skips are tied to explicit shared risk; metadata retains static artifact gates', async () => {
  const load = async (file) =>
    yaml.load(await readFile(new URL('../' + file, import.meta.url), 'utf8'));
  const ci = await load('.github/workflows/ci.yml');
  const pages = await load('.github/workflows/pages.yml');
  const validation = await load('.github/workflows/pages-validate.yml');
  const tap = await load('.github/workflows/taptap-cocos.yml');
  assert.equal(
    ci.jobs.quality.env.MINIGAME_RELEASE_GATES,
    "${{ vars.MINIGAME_RELEASE_GATES || '0' }}",
  );
  assert.equal(tap.jobs.producer.if, "vars.MINIGAME_RELEASE_GATES == '1'");
  assert.equal(tap.jobs.consumer.needs, 'producer');
  assert.equal(ci.jobs.kart.if, "needs.plan.outputs.cocos == 'true'");
  assert(
    ci.jobs.quality.if.includes(
      "needs.plan.outputs.cocos == 'false' && needs.kart.result == 'skipped'",
    ),
  );
  assert(
    ci.jobs.quality.if.includes(
      "needs.plan.outputs.cocos == 'true' && needs.kart.result == 'success'",
    ),
  );
  assert.equal(pages.jobs.validate.with.browser, "${{ needs.changes.outputs.browser == 'true' }}");
  assert.equal(validation.jobs.smoke.if, 'inputs.browser');
  assert(
    validation.jobs.build.steps.some(
      (step) => step.run?.includes('test:pages:artifacts') && !step.if,
    ),
  );
});

test('CI freezes the plan before conditional Creator jobs and rejects a substituted target', async () => {
  const plan = {
    full: false,
    browser: false,
    cocos: false,
    diff_base: 'saved',
    diff_head: 'target',
  };
  const env = { CI_VALIDATION_PLAN: JSON.stringify(plan), TURBO_SCM_HEAD: 'target' };
  await ciValidation({
    env,
    selectPlan: async () => {
      throw new Error('Do not recompute a moving deployment baseline');
    },
    treeValidator: async (value) => {
      assert.equal(value.base, 'saved');
      return { browser: false, browser_ids: [] };
    },
    execute: () => {
      throw new Error('No browser');
    },
  });
  await assert.rejects(
    ciValidation({
      env: { ...env, TURBO_SCM_HEAD: 'different' },
      treeValidator: async () => {},
      execute: () => {},
    }),
    /target SHA mismatch/,
  );
});

test('Linux and Windows independently exercise production hooks and gate quality', async () => {
  const ci = yaml.load(
    await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
  );
  const job = ci.jobs['validation-tools'];
  assert.deepEqual(job.strategy.matrix.os, ['ubuntu-latest', 'windows-latest']);
  assert(job.steps.some((step) => step.run?.includes('scripts/validate-push-hook.test.mjs')));
  assert(job.steps.some((step) => step.run?.includes('scripts/validate-push.test.mjs')));
  assert(ci.jobs.quality.needs.includes('validation-tools'));
  assert(ci.jobs.quality.if.includes("needs.validation-tools.result == 'success'"));
});

test('full CI retains original dialog and dependency checker gates', async () => {
  const calls = [];
  await ciValidation({
    env: {},
    selectPlan: async () => ({ full: true, browser: true, cocos: true }),
    treeValidator: async (value) => assert.equal(value.deferIdenticalRulesToAggregate, true),
    execute: (command, args) => calls.push(args),
  });
  assert(calls.some((args) => args[0] === 'test:dialogs'));
  const ci = yaml.load(
    await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
  );
  assert(ci.jobs.quality.steps.some((step) => step.run === 'pnpm test:boundaries'));
});

test('deferred full rules require aggregate success before contract, interaction or smoke gates', async () => {
  const calls = [];
  await assert.rejects(
    ciValidation({
      env: {},
      selectPlan: async () => ({ full: true, browser: true, cocos: true }),
      treeValidator: async (value) => assert.equal(value.deferIdenticalRulesToAggregate, true),
      execute: (command, args) => {
        calls.push(args);
        if (args[0] === 'test') throw new Error('aggregate rules failure');
      },
    }),
    /aggregate rules failure/,
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[1][0], 'test');
});

test('a valid comparison base uses the returned browser IDs even when the risk flag is full', async () => {
  const frozen = {
    full: true,
    browser: true,
    cocos: true,
    browser_ids: ['unrelated-old-full-game'],
    diff_base: 'exact-base',
    diff_head: 'exact-head',
  };
  const scope = {
    full: false,
    browser: true,
    browser_ids: ['travel-bund'],
    game_sources: ['games/local/travel-bund'],
    nine_native_targets: [{ game: 'travel-bund', platform: 'alipay' }],
  };
  const calls = [];
  const result = await ciValidation({
    root: '/fixture',
    env: { CI_VALIDATION_PLAN: JSON.stringify(frozen), TURBO_SCM_HEAD: 'exact-head' },
    treeValidator: async (options) => {
      assert.equal(options.base, 'exact-base');
      assert.equal(options.head, 'exact-head');
      assert.equal(options.incremental, true);
      assert.equal(options.deferIdenticalRulesToAggregate, false);
      return scope;
    },
    execute: (command, args) => calls.push({ command, args }),
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].args[0], 'scripts/run-selected-browser.mjs');
  const executed = JSON.parse(calls[1].args[1]);
  assert.deepEqual(executed.browser_ids, ['travel-bund']);
  assert.deepEqual(executed.game_sources, scope.game_sources);
  assert.deepEqual(executed.nine_native_targets, scope.nine_native_targets);
  assert.equal(executed.full, false);
  assert.equal(executed.diff_base, frozen.diff_base);
  assert.equal(executed.diff_head, frozen.diff_head);
  assert.deepEqual(result, executed);
  assert.equal(frozen.full, true);
});

test('CI consumes the actual local native-only dependency plan without installing browsers', async () => {
  const games = JSON.parse(
    await readFile(new URL('../apps/shell-web/src/standalone-games.json', import.meta.url)),
  );
  const scope = incrementalPlan({
    games,
    packages: [...games.map((game) => ({ dir: game.source })), { dir: 'apps/shell-minigame' }],
    changedPaths: ['games/local/travel-bund/native/input.ts'],
  });
  assert.equal(scope.browser, false);
  assert.deepEqual(scope.browser_ids, []);
  assert.equal(scope.nine_native_targets.length, 5);
  const result = await ciValidation({
    env: {},
    selectPlan: async () => ({
      full: true,
      browser: true,
      cocos: true,
      diff_base: 'validated-base',
      diff_head: 'native-head',
    }),
    treeValidator: async (options) => {
      assert.equal(options.incremental, true);
      return scope;
    },
    execute: () => assert.fail('Native-only changes must not execute browser commands'),
  });
  assert.equal(result.browser, false);
  assert.deepEqual(result.nine_native_targets, scope.nine_native_targets);
  assert.equal(result.nine_native_travel_contract, scope.nine_native_travel_contract);
});

test('a native validation failure stops CI before any browser install or execution', async () => {
  await assert.rejects(
    ciValidation({
      env: {},
      selectPlan: async () => ({
        full: true,
        browser: true,
        cocos: true,
        diff_base: 'validated-base',
        diff_head: 'native-head',
      }),
      treeValidator: async (options) => {
        assert.equal(options.incremental, true);
        assert.equal(options.deferIdenticalRulesToAggregate, false);
        throw new Error('Native CJS integrity failure');
      },
      execute: () => assert.fail('Native validation must finish before browsers'),
    }),
    /Native CJS integrity failure/,
  );
});

test('a missing or inconsistent incremental scope fails closed instead of restoring full browsers', async () => {
  for (const scope of [
    undefined,
    { browser: true, browser_ids: [], game_sources: [] },
    { browser: false, browser_ids: ['unexpected-game'] },
    { browser: true, browser_ids: ['repeat', 'repeat'], game_sources: [] },
  ]) {
    await assert.rejects(
      ciValidation({
        env: {},
        selectPlan: async () => ({
          full: true,
          browser: true,
          cocos: false,
          diff_base: 'base',
          diff_head: 'head',
        }),
        treeValidator: async () => scope,
        execute: () => assert.fail('No fallback to an unrelated browser suite'),
      }),
      /Missing validated incremental browser scope/,
    );
  }
});

test('a full or nightly plan without a usable base retains the original aggregate gates', async () => {
  for (const base of [undefined, '', '   ', '0'.repeat(40)]) {
    const calls = [];
    await ciValidation({
      env: {},
      selectPlan: async () => ({ full: true, browser: true, cocos: true, diff_base: base }),
      treeValidator: async (options) => {
        assert.equal(options.base, '');
        assert.equal(options.incremental, false);
        assert.equal(options.deferIdenticalRulesToAggregate, true);
      },
      execute: (command, args) => calls.push(args),
    });
    assert.deepEqual(
      calls.slice(1),
      ['test', 'test:contract', 'test:integration', 'test:dialogs', 'smoke'].map((task) => [
        task,
        '--concurrency=1',
      ]),
    );
  }
});

test('native-only Travel validation prepares Chromium once before its actual browser contract', async () => {
  const events = [];
  const originalEnv = {};
  let resolutions = 0;
  await ciValidation({
    env: originalEnv,
    selectPlan: async () => ({
      full: true,
      browser: true,
      cocos: false,
      diff_base: 'base',
      diff_head: 'head',
    }),
    browserExecutable: () => {
      events.push('resolve-installed-path');
      resolutions++;
      return '/fixture/installed/chromium';
    },
    treeValidator: async ({ prepareBrowser, env }) => {
      events.push('native-integrity');
      prepareBrowser();
      assert.equal(env.CHROMIUM_PATH, '/fixture/installed/chromium');
      assert.equal(env.PLAYWRIGHT_EXECUTABLE_PATH, '/fixture/installed/chromium');
      events.push('travel-browser-contract');
      prepareBrowser();
      return { browser: false, browser_ids: [], nine_native_travel_contract: true };
    },
    execute: (command, args) => {
      assert.equal(command, 'pnpm');
      assert.deepEqual(args, ['exec', 'playwright', 'install', '--with-deps', 'chromium']);
      events.push('install');
    },
  });
  assert.deepEqual(events, [
    'native-integrity',
    'install',
    'resolve-installed-path',
    'travel-browser-contract',
  ]);
  assert.equal(resolutions, 1);
  assert.deepEqual(originalEnv, {});
});

test('tree H5 preparation and later selected browsers share one installation and environment', async () => {
  let installations = 0;
  let resolutions = 0;
  let treeEnv;
  const executed = [];
  await ciValidation({
    env: {},
    selectPlan: async () => ({
      full: true,
      browser: true,
      cocos: false,
      diff_base: 'base',
      diff_head: 'head',
    }),
    browserExecutable: () => {
      resolutions++;
      return '/fixture/installed/chromium';
    },
    treeValidator: async ({ prepareBrowser, env }) => {
      treeEnv = env;
      prepareBrowser();
      prepareBrowser();
      return { browser: true, browser_ids: ['travel-bund'], game_sources: [] };
    },
    execute: (command, args, root, env) => {
      if (args[0] === 'exec') installations++;
      else {
        assert.equal(installations, 1);
        assert.equal(env, treeEnv);
        assert.equal(env.CHROMIUM_PATH, '/fixture/installed/chromium');
        assert.equal(env.PLAYWRIGHT_EXECUTABLE_PATH, '/fixture/installed/chromium');
        executed.push(args[0]);
      }
    },
  });
  assert.equal(installations, 1);
  assert.equal(resolutions, 1);
  assert.deepEqual(executed, ['scripts/run-selected-browser.mjs']);
});

test('explicit browser paths survive preparation and only missing paths use the installed resolver', async () => {
  for (const originalEnv of [
    { CHROMIUM_PATH: '/configured/chromium', PLAYWRIGHT_EXECUTABLE_PATH: '/configured/playwright' },
    { CHROMIUM_PATH: '/configured/chromium' },
    { PLAYWRIGHT_EXECUTABLE_PATH: '/configured/playwright' },
  ]) {
    const before = { ...originalEnv };
    let resolutions = 0;
    await ciValidation({
      env: originalEnv,
      selectPlan: async () => ({
        full: true,
        browser: true,
        cocos: false,
        diff_base: 'base',
        diff_head: 'head',
      }),
      browserExecutable: () => {
        resolutions++;
        return '/fixture/installed/chromium';
      },
      treeValidator: async ({ prepareBrowser, env }) => {
        prepareBrowser();
        for (const key of ['CHROMIUM_PATH', 'PLAYWRIGHT_EXECUTABLE_PATH'])
          assert.equal(env[key], before[key] || '/fixture/installed/chromium');
        return { browser: false, browser_ids: [] };
      },
      execute: () => {},
    });
    assert.equal(resolutions, Object.keys(before).length === 2 ? 0 : 1);
    assert.deepEqual(originalEnv, before);
  }
});

test('an installation failure stops native browser validation and later browser execution', async () => {
  let installations = 0;
  await assert.rejects(
    ciValidation({
      env: {},
      selectPlan: async () => ({
        full: true,
        browser: true,
        cocos: false,
        diff_base: 'base',
        diff_head: 'head',
      }),
      browserExecutable: () => assert.fail('Failed installation cannot resolve a browser'),
      treeValidator: async ({ prepareBrowser }) => {
        prepareBrowser();
        assert.fail('Failed preparation cannot launch the native browser contract');
      },
      execute: (command, args) => {
        assert.deepEqual(args, ['exec', 'playwright', 'install', '--with-deps', 'chromium']);
        installations++;
        throw new Error('Chromium download failed');
      },
    }),
    /Chromium download failed/,
  );
  assert.equal(installations, 1);
});

test('full validation without a base prepares browsers after the tree phase', async () => {
  const events = [];
  await ciValidation({
    env: {},
    selectPlan: async () => ({ full: true, browser: true, cocos: true }),
    browserExecutable: () => '/fixture/installed/chromium',
    treeValidator: async () => events.push('tree-complete'),
    execute: (command, args, root, env) => {
      events.push(args[0]);
      if (args[0] !== 'exec') {
        assert.equal(env.CHROMIUM_PATH, '/fixture/installed/chromium');
        assert.equal(env.PLAYWRIGHT_EXECUTABLE_PATH, '/fixture/installed/chromium');
      }
    },
  });
  assert.deepEqual(events, [
    'tree-complete',
    'exec',
    'test',
    'test:contract',
    'test:integration',
    'test:dialogs',
    'smoke',
  ]);
});
