import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import { ciValidation } from './ci-validation.mjs';
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
      },
      execute: () => {
        throw new Error('unexpected browser command');
      },
    });
    assert.equal(tree.base, 'saved-validated-base');
    assert.equal(tree.head, 'actual-target');
  }
});
test('selective CI does not call aggregate Shell smoke or ^build game test tasks', async () => {
  const calls = [];
  const plan = { full: false, browser: true, cocos: false, diff_base: 'base', diff_head: 'head' };
  await ciValidation({
    env: {},
    selectPlan: async () => plan,
    treeValidator: async (value) => assert.equal(value.deferIdenticalRulesToAggregate, false),
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
    treeValidator: async (value) => assert.equal(value.base, 'saved'),
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
