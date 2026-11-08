import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  nightProgressionFileScope,
  nightLocalScopePaths,
  nightReleaseRuleScopePaths,
  nightReleaseImportsScope,
  nightBuildVersionScopePaths,
  nightVersionBuildScope,
  selectedBackendConsumers,
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

test('frozen rule tooling selects Runtime and rejects unknown paths or missing consumer identities', () => {
  const options = {
    games,
    packages,
    changedPaths: nightReleaseRuleScopePaths,
    readBase: () => '',
    readHead: read,
  };
  const scopes = reviewedSharedFileScopes(options);
  for (const file of nightReleaseRuleScopePaths)
    assert.deepEqual(scopes.get(file), ['services/runtime-api']);
  const plan = incrementalPlan({ ...options, fileScopes: scopes, readSource: read });
  assert(plan.service_rule_sources.includes('services/runtime-api'));
  assert(!plan.game_sources.includes(source));
  assert.throws(
    () =>
      incrementalPlan({
        ...options,
        changedPaths: ['scripts/night-release-rules-extra.mjs'],
        fileScopes: scopes,
        readSource: read,
      }),
    /scope undefined/,
  );
  for (const input of [
    { ...options, games: [] },
    { ...options, packages: packages.filter((p) => p.dir !== 'services/runtime-api') },
  ])
    for (const file of nightReleaseRuleScopePaths)
      assert(!reviewedSharedFileScopes(input).has(file));
  assert(
    JSON.parse(read('services/runtime-api/package.json')).scripts.test.includes(
      'night-release-rules.test.mjs',
    ),
  );
});

test('release browser import accepts only its precise additive dependency edge', () => {
  const file = 'scripts/check-workspace-dependencies.mjs';
  const before = execFileSync('git', ['show', 'b2a9dc3e581dc79fd60bede8c1606b7d583ad71a:' + file], {
      encoding: 'utf8',
    }),
    after = read(file);
  assert(nightReleaseImportsScope(before, after));
  assert(!nightReleaseImportsScope(before, after + '\nunsafe();'));
  assert(!nightReleaseImportsScope(before, after.replace('release-browser.mjs', 'other.mjs')));
  assert.deepEqual(
    reviewedSharedFileScopes({
      games,
      packages,
      changedPaths: [file],
      readBase: () => before,
      readHead: read,
    }).get(file),
    [source, 'services/runtime-api'],
  );
});
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

test('version counter tools and exact build wiring select their real consumers', () => {
  const allPackages = [
    ...packages,
    ...['services/kart-server', 'services/tianxia-server'].map((dir) => ({
      dir,
      ...JSON.parse(read(dir + '/package.json')),
    })),
  ];
  const options = {
    games,
    packages: allPackages,
    changedPaths: nightBuildVersionScopePaths,
    readBase: () => '',
    readHead: read,
  };
  const scopes = reviewedSharedFileScopes(options);
  for (const file of nightBuildVersionScopePaths)
    assert.deepEqual(scopes.get(file), [source, ...selectedBackendConsumers]);
  for (const bad of [
    { ...options, games: [] },
    { ...options, packages },
  ])
    for (const file of nightBuildVersionScopePaths)
      assert(!reviewedSharedFileScopes(bad).has(file));
  assert(
    !reviewedSharedFileScopes({
      ...options,
      changedPaths: ['scripts/night-build-version-extra.mjs'],
    }).has('scripts/night-build-version-extra.mjs'),
  );
  for (const file of ['.gitignore', 'turbo.json', 'scripts/check-workspace-dependencies.mjs']) {
    const before = execFileSync(
        'git',
        ['show', '9c9c3797a7a85d3b5cd2f18dbc8d39cd6fd1f001:' + file],
        { encoding: 'utf8' },
      ),
      after = read(file);
    assert(nightVersionBuildScope(file, before, after));
    assert(!nightVersionBuildScope(file, before, after + '\nunsafe();'));
    const changed =
      file === '.gitignore'
        ? after.replace('versions.json.lock', '*.json')
        : file === 'turbo.json'
          ? after.replace('"cache": false', '"cache": true')
          : after.replace('night-build-version.mjs', 'unknown.mjs');
    assert(!nightVersionBuildScope(file, before, changed));
    assert.deepEqual(
      reviewedSharedFileScopes({ ...options, changedPaths: [file], readBase: () => before }).get(
        file,
      ),
      [source],
    );
  }
});
