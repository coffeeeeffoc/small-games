import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { main as selectScope } from './pages-test-scope.mjs';
import { run, cleanGitEnv } from './validate-push.mjs';

const validSha = (value) =>
  typeof value === 'string' && /^[a-f\d]{40}$/i.test(value) && !/^0+$/.test(value);

/** Only successful push runs of this repository's dev CI can advance its baseline. */
export async function readCIBaseline(env = process.env, fetchFn = fetch) {
  const repository = env.GITHUB_REPOSITORY;
  assert(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || ''), 'Invalid CI repository');
  assert.equal(env.GITHUB_REF_NAME, 'dev', 'CI saved baseline is dev-only');
  const api = (env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
  const get = async (endpoint) => {
    const response = await fetchFn(api + '/repos/' + repository + endpoint, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(env.GH_TOKEN ? { Authorization: 'Bearer ' + env.GH_TOKEN } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    });
    assert(response.ok, 'CI baseline unavailable (HTTP ' + response.status + ')');
    return response.json();
  };
  const workflow = await get('/actions/workflows/ci.yml');
  assert(
    Number.isSafeInteger(workflow.id) &&
      workflow.id > 0 &&
      workflow.path === '.github/workflows/ci.yml' &&
      workflow.name === 'CI' &&
      workflow.state === 'active',
    'Unexpected CI workflow',
  );
  const response = await get(
    '/actions/workflows/ci.yml/runs?branch=dev&status=success&event=push&per_page=1',
  );
  assert(
    Array.isArray(response.workflow_runs) && response.workflow_runs.length === 1,
    'No successful dev CI baseline; refusing an empty comparison',
  );
  const saved = response.workflow_runs[0];
  assert(
    saved.workflow_id === workflow.id &&
      saved.path === '.github/workflows/ci.yml' &&
      saved.head_branch === 'dev' &&
      saved.event === 'push' &&
      saved.status === 'completed' &&
      saved.conclusion === 'success' &&
      saved.head_repository?.full_name?.toLowerCase() === repository.toLowerCase() &&
      validSha(saved.head_sha),
    'Invalid successful dev CI run',
  );
  return saved.head_sha.toLowerCase();
}

export async function selectCIPlan({
  env = process.env,
  root = process.cwd(),
  fetchFn = fetch,
  execute = run,
  selectPlan = selectScope,
} = {}) {
  const clean = cleanGitEnv(env);
  const head = env.PAGES_DIFF_HEAD;
  assert(validSha(head), 'Invalid CI target SHA');
  assert.equal(
    execute('git', ['rev-parse', 'HEAD'], root, clean, true),
    head,
    'CI checkout SHA mismatch',
  );
  let base;
  if (env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF_NAME === 'dev') {
    base = await readCIBaseline(env, fetchFn);
    execute('git', ['cat-file', '-e', base + '^{commit}'], root, clean);
    execute('git', ['merge-base', '--is-ancestor', base, head], root, clean);
  }
  const plan = await selectPlan(
    {
      ...env,
      VALIDATION_RISK_PLAN: 'true',
      ...(base ? { PAGES_VALIDATED_BASE: base, PAGES_DIFF_BASE: base } : {}),
    },
    root,
  );
  assert.equal(plan.diff_head, head, 'CI selector target mismatch');
  if (base) assert.equal(plan.diff_base, base, 'CI selector lost successful CI baseline');
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  selectCIPlan().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
