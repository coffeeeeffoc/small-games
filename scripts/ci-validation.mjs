import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { main as selectScope } from './pages-test-scope.mjs';
import { validateTree } from './validate-tree.mjs';
import { run } from './validate-push.mjs';
const require = createRequire(import.meta.url);
export async function ciValidation({
  root = process.cwd(),
  env = process.env,
  execute = run,
  treeValidator = validateTree,
  selectPlan = selectScope,
  browserExecutable = () => require('@playwright/test').chromium.executablePath(),
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
  const incremental =
    typeof plan.diff_base === 'string' &&
    plan.diff_base.trim().length > 0 &&
    !/^0+$/.test(plan.diff_base);
  const validationEnv = { ...env };
  let browserReady = false;
  const ensureBrowser = () => {
    if (browserReady) return;
    execute(
      'pnpm',
      ['exec', 'playwright', 'install', '--with-deps', 'chromium'],
      root,
      validationEnv,
    );
    if (!validationEnv.CHROMIUM_PATH || !validationEnv.PLAYWRIGHT_EXECUTABLE_PATH) {
      const executable = browserExecutable();
      assert(
        typeof executable === 'string' && executable.length > 0,
        'Missing installed Chromium executable path',
      );
      validationEnv.CHROMIUM_PATH ||= executable;
      validationEnv.PLAYWRIGHT_EXECUTABLE_PATH ||= executable;
    }
    browserReady = true;
  };
  const validation = await treeValidator({
    root,
    base: incremental ? plan.diff_base : '',
    head: plan.diff_head,
    env: validationEnv,
    prepareBrowser: ensureBrowser,
    incremental,
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
  if (browserPlan.browser) {
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
  ciValidation().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
