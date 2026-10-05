import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { main as selectScope } from './pages-test-scope.mjs';
import { validateTree } from './validate-tree.mjs';
import { run } from './validate-push.mjs';
export async function ciValidation({
  root = process.cwd(),
  env = process.env,
  execute = run,
  treeValidator = validateTree,
  selectPlan = selectScope,
} = {}) {
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
  await treeValidator({
    root,
    base: plan.full ? '' : plan.diff_base,
    head: plan.diff_head,
    env,
    deferIdenticalRulesToAggregate: plan.full && plan.browser,
  });
  if (plan.browser) {
    execute('pnpm', ['exec', 'playwright', 'install', '--with-deps', 'chromium'], root, env);
    if (plan.full) {
      for (const task of ['test', 'test:contract', 'test:integration', 'test:dialogs', 'smoke'])
        execute('pnpm', [task, '--concurrency=1'], root, env);
    } else
      execute(
        process.execPath,
        ['scripts/run-selected-browser.mjs', JSON.stringify(plan)],
        root,
        env,
      );
  }
  return plan;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  ciValidation().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
