import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  nightProgressionFileScope,
  nightLocalScopePaths,
  reviewedSharedFileScopes,
} from './publication-scopes.mjs';
import { incrementalPlan } from './incremental-validation.mjs';
const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const reviewedGrowth = (file) =>
  execFileSync('git', ['show', 'ea6e65230eba002eb1f093e1bdee285ea49a868d:' + file], {
    encoding: 'utf8',
  });
const source = 'games/local/night-overwatch',
  games = [{ id: 'night-overwatch', source }],
  packages = [source, 'services/runtime-api', 'apps/shell-web'].map((dir) => ({
    dir,
    ...JSON.parse(read(dir + '/package.json')),
  }));
test('growth producer additions are byte-bound and select their actual Night/Runtime consumers', () => {
  for (const file of [
    'scripts/deploy-tencent.mjs',
    'scripts/check-workspace-dependencies.mjs',
    'scripts/competition-gateway.mjs',
  ]) {
    const before = execFileSync('git', ['show', '358b1fe0:' + file], { encoding: 'utf8' }),
      after = reviewedGrowth(file);
    assert(nightProgressionFileScope(file, before, after), file);
    for (const changed of [
      after + '\nunsafe();',
      after.replace('night-overwatch', 'another-game'),
      after.replace('cancel)$', 'cancel.*)$'),
    ].filter((value) => value !== after))
      assert(!nightProgressionFileScope(file, before, changed), file);
    const options = {
      games,
      packages,
      changedPaths: [file],
      readBase: () => before,
      readHead: reviewedGrowth,
    };
    assert(reviewedSharedFileScopes(options).get(file)?.includes('services/runtime-api'), file);
    for (const changed of [[], [...games, ...games]])
      assert(!reviewedSharedFileScopes({ ...options, games: changed }).has(file));
  }
});
test('shared backend build behavior cannot reuse the Night-only copy-list proof', () => {
  for (const file of ['scripts/deployment-bundle.mjs', 'scripts/deployment-bundle.test.mjs']) {
    const before = execFileSync('git', ['show', '358b1fe0:' + file], { encoding: 'utf8' });
    assert(!nightProgressionFileScope(file, before, read(file)));
  }
});
test('cumulative Armory revert from the actual dev base keeps Night consumers and rejects unrelated bytes', () => {
  for (const file of ['scripts/deploy-tencent.mjs', 'scripts/competition-gateway.mjs']) {
    const before = execFileSync(
        'git',
        ['show', 'baaae8d717559610df529aff43a0cb2a31961393:' + file],
        { encoding: 'utf8' },
      ),
      after = reviewedGrowth(file);
    assert(nightProgressionFileScope(file, before, after));
    for (const changed of [
      after + '\nunsafe();',
      after.replace('night-overwatch', 'other-game'),
      after.replace('cancel)$', 'cancel.*)$'),
    ].filter((value) => value !== after))
      assert(!nightProgressionFileScope(file, before, changed));
    const scopes = reviewedSharedFileScopes({
      games,
      packages,
      changedPaths: [file],
      readBase: () => before,
      readHead: reviewedGrowth,
    });
    assert(scopes.get(file)?.includes('services/runtime-api'));
    assert(scopes.get(file)?.includes(source));
  }
});
test('local selftest is finite and schedules only its side-effect-free contract tests', () => {
  const options = {
    games,
    packages,
    changedPaths: nightLocalScopePaths,
    readBase: () => '',
    readHead: read,
  };
  const scopes = reviewedSharedFileScopes(options);
  for (const file of nightLocalScopePaths)
    assert.deepEqual(scopes.get(file), [source, 'services/runtime-api']);
  const plan = incrementalPlan({ ...options, fileScopes: scopes, readSource: read });
  assert(plan.night_local_checks);
  assert(plan.service_rule_sources.includes('services/runtime-api'));
  assert.throws(
    () =>
      incrementalPlan({
        ...options,
        changedPaths: ['scripts/night-overwatch-selftest-extra.mjs'],
        fileScopes: scopes,
        readSource: read,
      }),
    /scope undefined/,
  );
});
