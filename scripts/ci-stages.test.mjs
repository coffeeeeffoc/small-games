import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import { ciStages, assertCIPlan, stageResult, assertStageResults } from './ci-stages.mjs';
import { ciValidation } from './ci-validation.mjs';

const base = 'a'.repeat(40),
  head = 'b'.repeat(40);
const plan = {
  full: false,
  browser: true,
  cocos: false,
  diff_base: base,
  diff_head: head,
  browser_ids: ['stale-plan-id'],
};
const scope = {
  browser: true,
  browser_ids: ['castle-cannon', 'night-overwatch'],
  game_sources: ['games/local/game-castle-cannon', 'games/local/night-overwatch', 'games/builtin'],
  developer_mode_ids: [],
};
const needs = {
  plan: { result: 'success' },
  kart: { result: 'skipped' },
  'validation-tools': { result: 'success' },
  validate: { result: 'success' },
};

test('three phases use identical actual scope and only standalone runs the final selected browser entry', async () => {
  const results = [];
  for (const stage of ciStages) {
    const calls = [];
    const actual = await ciValidation({
      stage,
      env: { CI_VALIDATION_PLAN: JSON.stringify(plan), TURBO_SCM_HEAD: head },
      browserExecutable: () => '/fixture/chromium',
      execute: (command, args) => {
        if (command === 'git') return head;
        calls.push(args);
      },
      treeValidator: async (options) => {
        assert.equal(options.base, base);
        assert.equal(options.head, head);
        assert.equal(options.stage, stage);
        assert.equal(options.incremental, true);
        assert.equal(options.deferIdenticalRulesToAggregate, false);
        return scope;
      },
    });
    assert.deepEqual(actual.browser_ids, scope.browser_ids);
    assert.deepEqual(actual.game_sources, scope.game_sources, 'built-in smoke consumers retained');
    if (stage === 'standalone') {
      assert.equal(calls.at(-1)[0], 'scripts/run-selected-browser.mjs');
      assert.deepEqual(JSON.parse(calls.at(-1)[1]), actual);
    } else assert.deepEqual(calls, []);
    results.push(stageResult(stage, plan, actual));
  }
  assertStageResults(plan, results, needs);
});

test('summary rejects missing/duplicate/unknown phases, altered comparison/scope, and any failed job', () => {
  const results = ciStages.map((stage) => stageResult(stage, plan, scope));
  for (const invalid of [
    results.slice(1),
    [...results, results[0]],
    [{ ...results[0], stage: 'unknown' }, ...results.slice(1)],
  ])
    assert.throws(() => assertStageResults(plan, invalid, needs), /CI stage/);
  for (const override of [
    { base: head },
    { head: base },
    { plan_sha256: 'f'.repeat(64) },
    { scope_sha256: 'f'.repeat(64) },
  ])
    assert.throws(() =>
      assertStageResults(plan, [{ ...results[0], ...override }, ...results.slice(1)], needs),
    );
  for (const job of Object.keys(needs))
    for (const result of ['failure', 'cancelled', 'skipped', undefined]) {
      if (job === 'kart' && result === 'skipped') continue;
      assert.throws(() => assertStageResults(plan, results, { ...needs, [job]: { result } }));
    }
  const creator = { ...plan, cocos: true };
  assert.throws(
    () =>
      assertStageResults(
        creator,
        ciStages.map((stage) => stageResult(stage, creator, scope)),
        needs,
      ),
    /Creator/,
  );
  assert.throws(() => assertCIPlan({ ...plan, diff_base: 'HEAD' }, head), /base/);
  assert.throws(() => assertCIPlan(plan, base), /target SHA/);
  assert.throws(() => stageResult('unknown', plan, scope), /Unknown/);
});

test('full comparison retains all five aggregate gates in core, other phases explicitly delegate to core', async () => {
  const full = { ...plan, diff_base: '', full: true };
  for (const stage of ciStages) {
    const calls = [];
    await ciValidation({
      stage,
      env: { CI_VALIDATION_PLAN: JSON.stringify(full), TURBO_SCM_HEAD: head },
      browserExecutable: () => '/fixture/chromium',
      execute: (command, args) => {
        if (command === 'git') return head;
        calls.push(args);
      },
      treeValidator: async (options) => {
        assert.equal(stage, 'core');
        assert.equal(options.stage, 'all');
        assert.equal(options.incremental, false);
        assert.equal(options.deferIdenticalRulesToAggregate, true);
      },
    });
    assert.deepEqual(
      calls.slice(2),
      stage === 'core'
        ? ['test', 'test:contract', 'test:integration', 'test:dialogs', 'smoke'].map((task) => [
            task,
            '--concurrency=1',
          ])
        : [],
    );
  }
});

test('bad phase/checkout or actual validation failure cannot produce a successful result', async () => {
  const options = {
    env: { CI_VALIDATION_PLAN: JSON.stringify(plan), TURBO_SCM_HEAD: head },
    execute: () => head,
    treeValidator: async () => {
      throw Error('stage failure');
    },
  };
  for (const stage of ciStages)
    await assert.rejects(ciValidation({ ...options, stage }), /stage failure/);
  await assert.rejects(ciValidation({ ...options, stage: 'unknown' }), /Unknown/);
  await assert.rejects(
    ciValidation({ ...options, stage: 'core', execute: () => base }),
    /checkout SHA mismatch/,
  );
});

test('workflow isolates three bounded phases and requires exact-run evidence even after upstream failure', async () => {
  const ci = yaml.load(
    await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
  );
  assert.deepEqual(ci.permissions, { contents: 'read', actions: 'read' });
  assert(ci.jobs.plan.steps.some((step) => step.run === 'node scripts/ci-baseline.mjs'));
  const job = ci.jobs.validate;
  assert.deepEqual(job.strategy.matrix.stage, ciStages);
  assert.equal(job.strategy['fail-fast'], false);
  assert.equal(job['timeout-minutes'], 90);
  assert.equal(job.env.CI_VALIDATION_PLAN, '${{ needs.plan.outputs.plan }}');
  assert.equal(job.env.TURBO_SCM_HEAD, '${{ github.sha }}');
  const phase = job.steps.find((step) => step.run?.includes('node scripts/ci-validation.mjs'));
  assert.equal(phase.run, 'node scripts/ci-validation.mjs --stage ${{ matrix.stage }}');
  const upload = job.steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(upload.with.name, 'ci-stage-${{ github.sha }}-${{ matrix.stage }}');
  assert.equal(upload.with.path, '.scratch/ci-validation/${{ matrix.stage }}.json');
  assert.equal(upload.with['if-no-files-found'], 'error');
  for (const step of job.steps.filter((step) =>
    step.uses?.startsWith('actions/download-artifact@'),
  ))
    assert(step.with.name.endsWith('-${{ github.sha }}'));
  assert.equal(ci.jobs.quality.if, 'always()');
  assert.deepEqual(ci.jobs.quality.needs, ['plan', 'kart', 'validation-tools', 'validate']);
  assert(
    ci.jobs.quality.steps.some((step) => step.run === 'node scripts/ci-stages.mjs' && !step.if),
  );
});

test('docs and no-browser phases still validate the tree, without an independent browser fallback', async () => {
  const quiet = { ...plan, browser: false, browser_ids: [] };
  for (const stage of ciStages) {
    let checked = false;
    const actual = await ciValidation({
      stage,
      env: { CI_VALIDATION_PLAN: JSON.stringify(quiet), TURBO_SCM_HEAD: head },
      treeValidator: async ({ stage: treeStage }) => {
        assert.equal(treeStage, stage);
        checked = true;
        return { browser: false, browser_ids: [], admin_console_checks: true };
      },
      execute: (command) => {
        assert.equal(command, 'git');
        return head;
      },
    });
    assert(checked);
    assert.equal(actual.admin_console_checks, true);
  }
});

test('real summary entry consumes ignored scratch evidence and refuses missing or extra files', async (t) => {
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { spawnSync } = await import('node:child_process');
  const { writeStageResult } = await import('./ci-stages.mjs');
  const root = await mkdtemp(path.join(tmpdir(), 'ci-evidence-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const stage of ciStages) await writeStageResult(root, stage, plan, scope);
  const summary = () =>
    spawnSync(process.execPath, [fileURLToPath(new URL('./ci-stages.mjs', import.meta.url))], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        CI_VALIDATION_PLAN: JSON.stringify(plan),
        TURBO_SCM_HEAD: head,
        CI_NEEDS_JSON: JSON.stringify(needs),
      },
    });
  assert.equal(summary().status, 0);
  const extra = path.join(root, '.scratch/ci-validation/unknown.json');
  await writeFile(extra, '{}');
  assert.notEqual(summary().status, 0);
  await rm(extra);
  await rm(path.join(root, '.scratch/ci-validation/standalone.json'));
  assert.notEqual(summary().status, 0);
});

test('isolated standalone retains selected competition preparation and stops on its failure', async () => {
  const actual = { ...scope, browser_ids: ['letters-words2', 'xiangqi-five', 'night-overwatch'] };
  for (const fail of [false, true]) {
    const calls = [];
    const validation = ciValidation({
      stage: 'standalone',
      env: { CI_VALIDATION_PLAN: JSON.stringify(plan), TURBO_SCM_HEAD: head },
      browserExecutable: () => '/fixture/chromium',
      treeValidator: async () => actual,
      execute: (command, args) => {
        if (command === 'git') return head;
        calls.push(args);
        if (fail) throw Error('competition preparation failed');
      },
    });
    if (fail) {
      await assert.rejects(validation, /competition preparation failed/);
      assert.deepEqual(calls, [['scripts/competition-build.mjs', '--game=letters-words2']]);
    } else {
      await validation;
      assert.deepEqual(calls.slice(0, 2), [
        ['scripts/competition-build.mjs', '--game=letters-words2'],
        ['scripts/competition-build.mjs', '--game=xiangqi-five'],
      ]);
      assert.equal(calls.at(-1)[0], 'scripts/run-selected-browser.mjs');
    }
  }
});
