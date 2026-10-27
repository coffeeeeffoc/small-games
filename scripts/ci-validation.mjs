import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { main as selectScope } from './pages-test-scope.mjs';
import { validateTree } from './validate-tree.mjs';
import { run } from './validate-push.mjs';
import { createBrowserPreparation } from './browser-preparation.mjs';
import { ciStages, assertCIPlan, writeStageResult } from './ci-stages.mjs';
export async function ciValidation({
  root = process.cwd(),
  env = process.env,
  execute = run,
  treeValidator = validateTree,
  selectPlan = selectScope,
  browserExecutable,
  stage = 'all',
} = {}) {
  assert(stage === 'all' || ciStages.includes(stage), 'Unknown CI validation stage');
  const plan = env.CI_VALIDATION_PLAN
    ? JSON.parse(env.CI_VALIDATION_PLAN)
    : await selectPlan(
        {
          ...env,
          VALIDATION_RISK_PLAN: 'true',
          PAGES_DIFF_BASE: env.TURBO_SCM_BASE,
          PAGES_DIFF_HEAD: env.TURBO_SCM_HEAD,
        },
        root,
      );
  assert(
    typeof plan.browser === 'boolean' && typeof plan.cocos === 'boolean',
    'Missing shared CI risk outputs',
  );
  if (env.TURBO_SCM_HEAD)
    assert.equal(plan.diff_head, env.TURBO_SCM_HEAD, 'CI plan target SHA mismatch');
  const incremental =
    typeof plan.diff_base === 'string' &&
    plan.diff_base.trim().length > 0 &&
    !/^0+$/.test(plan.diff_base);
  if (stage !== 'all') {
    assertCIPlan(plan, env.TURBO_SCM_HEAD);
    assert.equal(
      execute('git', ['rev-parse', 'HEAD'], root, env, true),
      plan.diff_head,
      'CI checkout SHA mismatch',
    );
    if (!incremental && stage !== 'core') return plan;
  }
  const validationEnv = { ...env };
  const ensureBrowser = createBrowserPreparation({
    root,
    env: validationEnv,
    execute,
    withDeps: true,
    browserExecutable,
  });
  const validation = await treeValidator({
    root,
    base: incremental ? plan.diff_base : '',
    head: plan.diff_head,
    env: validationEnv,
    prepareBrowser: ensureBrowser,
    incremental,
    stage: incremental ? stage : 'all',
    deferIdenticalRulesToAggregate: !incremental && plan.full && plan.browser,
  });
  let browserPlan = plan;
  if (incremental) {
    const scope = validation;
    assert(
      scope &&
        typeof scope.browser === 'boolean' &&
        Array.isArray(scope.browser_ids) &&
        scope.browser_ids.every((id) => typeof id === 'string' && id.length > 0) &&
        new Set(scope.browser_ids).size === scope.browser_ids.length &&
        scope.browser === scope.browser_ids.length > 0 &&
        (!scope.browser || Array.isArray(scope.game_sources)),
      'Missing validated incremental browser scope',
    );
    browserPlan = {
      ...plan,
      game_sources: [],
      ...scope,
      full: false,
      diff_base: plan.diff_base,
      diff_head: plan.diff_head,
    };
  }
  if (
    browserPlan.browser &&
    (stage === 'all' || stage === 'standalone' || (!incremental && stage === 'core'))
  ) {
    // The serial Shell phase configured these same selected H5 outputs before
    // standalone validation. Its isolated runner must retain that preparation.
    if (stage === 'standalone') {
      const { competitionGames } = await import('./competition-build.mjs');
      for (const id of browserPlan.browser_ids.filter((id) => Object.hasOwn(competitionGames, id)))
        execute(
          process.execPath,
          ['scripts/competition-build.mjs', '--game=' + id],
          root,
          validationEnv,
        );
    }
    ensureBrowser();
    if (browserPlan.full) {
      for (const task of ['test', 'test:contract', 'test:integration', 'test:dialogs', 'smoke'])
        execute('pnpm', [task, '--concurrency=1'], root, validationEnv);
    } else
      execute(
        process.execPath,
        ['scripts/run-selected-browser.mjs', JSON.stringify(browserPlan)],
        root,
        validationEnv,
      );
  }
  return browserPlan;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  (async () => {
    const args = process.argv.slice(2);
    assert(
      args.length === 0 || (args.length === 2 && args[0] === '--stage'),
      'Expected --stage <phase>',
    );
    const stage = args[1] || 'all';
    const scope = await ciValidation({ stage });
    if (stage !== 'all')
      await writeStageResult(
        process.cwd(),
        stage,
        JSON.parse(process.env.CI_VALIDATION_PLAN),
        scope,
      );
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
