import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const ciStages = Object.freeze(['core', 'castle', 'standalone']);
const sha = (value) =>
  typeof value === 'string' && /^[a-f\d]{40}$/.test(value) && !/^0+$/.test(value);
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function assertCIPlan(plan, head) {
  assert(sha(head) && plan.diff_head === head, 'CI plan target SHA mismatch');
  assert(typeof plan.browser === 'boolean' && typeof plan.cocos === 'boolean', 'Invalid CI plan');
  assert(!plan.diff_base || sha(plan.diff_base), 'Invalid CI comparison base');
}

export function stageResult(stage, plan, scope) {
  assert(ciStages.includes(stage), 'Unknown CI validation stage');
  assertCIPlan(plan, plan.diff_head);
  assert(scope && typeof scope.browser === 'boolean', 'Missing actual validation scope');
  return {
    version: 1,
    stage,
    base: plan.diff_base || '',
    head: plan.diff_head,
    plan_sha256: digest(plan),
    scope_sha256: digest(scope),
  };
}

export async function writeStageResult(root, stage, plan, scope) {
  const result = stageResult(stage, plan, scope);
  const directory = path.join(root, '.scratch/ci-validation');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, stage + '.json'), JSON.stringify(result) + '\n');
}

export function assertStageResults(plan, results, needs) {
  assertCIPlan(plan, plan.diff_head);
  for (const job of ['plan', 'validation-tools', 'validate'])
    assert.equal(needs[job]?.result, 'success', 'Required CI job failed or missing: ' + job);
  assert.equal(
    needs.kart?.result,
    plan.cocos ? 'success' : 'skipped',
    'Unexpected Creator job result',
  );
  assert.deepEqual(
    results.map((result) => result.stage).sort(),
    [...ciStages].sort(),
    'Missing, duplicate or unknown CI stage',
  );
  let scopeDigest;
  for (const result of results) {
    assert.equal(result.version, 1);
    assert.equal(result.base, plan.diff_base || '', 'CI stage base mismatch');
    assert.equal(result.head, plan.diff_head, 'CI stage head mismatch');
    assert.equal(result.plan_sha256, digest(plan), 'CI stage plan mismatch');
    assert(/^[a-f\d]{64}$/.test(result.scope_sha256), 'Missing actual scope digest');
    scopeDigest ??= result.scope_sha256;
    assert.equal(result.scope_sha256, scopeDigest, 'CI stages validated different scopes');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  (async () => {
    const plan = JSON.parse(process.env.CI_VALIDATION_PLAN);
    assertCIPlan(plan, process.env.TURBO_SCM_HEAD);
    assert.deepEqual(
      (await readdir('.scratch/ci-validation')).sort(),
      ciStages.map((stage) => stage + '.json').sort(),
      'Unexpected or missing CI phase evidence',
    );
    const results = await Promise.all(
      ciStages.map(async (stage) =>
        JSON.parse(await readFile(path.join('.scratch/ci-validation', stage + '.json'), 'utf8')),
      ),
    );
    assertStageResults(plan, results, JSON.parse(process.env.CI_NEEDS_JSON));
    console.log('All CI stages passed for ' + (plan.diff_base || 'full') + '..' + plan.diff_head);
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
