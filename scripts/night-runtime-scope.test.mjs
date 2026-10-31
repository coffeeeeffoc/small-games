import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { incrementalPlan } from './incremental-validation.mjs';
import {
  nightBackendFileScope,
  nightRuntimeInputs,
  matchGatewayFileScope,
  nightGatewayFileScope,
  reviewedSharedFileScopes,
  nightServiceTurboOnly,
} from './publication-scopes.mjs';

test('Night resume gateway binds exact bytes and retains its client, server and shell checks', () => {
  const file = 'scripts/competition-gateway.mjs',
    source = 'games/local/night-overwatch';
  const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
  const history = (ref) => execFileSync('git', ['show', ref + ':' + file], { encoding: 'utf8' });
  const after = history('c31ca40ce5896fd293fbfe1d66ed9bacf24e8568');
  const games = [{ id: 'night-overwatch', source }];
  const packages = [source, 'services/runtime-api', 'apps/shell-web'].map((dir) => ({
    dir,
    ...JSON.parse(read(dir + '/package.json')),
  }));
  for (const ref of [
    '8c4c821addb627e4196ccdc0b9437475e4b60f47',
    'c31ca40ce5896fd293fbfe1d66ed9bacf24e8568^',
  ]) {
    const before = history(ref);
    assert(nightGatewayFileScope(before, after));
    const options = {
      changedPaths: [file],
      games,
      packages,
      readBase: () => before,
      readHead: (name) => (name === file ? after : read(name)),
    };
    const scopes = reviewedSharedFileScopes(options);
    assert.deepEqual(scopes.get(file), [source, 'services/runtime-api', 'apps/shell-web']);
    const plan = incrementalPlan({ ...options, fileScopes: scopes, readSource: read });
    assert(plan.game_services_checks);
    assert(plan.competition_service_checks);
    assert(plan.game_sources.includes(source));
    assert(plan.service_rule_sources.includes('services/runtime-api'));
    for (const changed of [
      after + '\n',
      after.replace('night-overwatch', 'tower-brake'),
      after.replace('resume$', 'resume.*$'),
    ])
      assert(
        !reviewedSharedFileScopes({
          ...options,
          readHead: (name) => (name === file ? changed : read(name)),
        }).has(file),
      );
    assert(!nightGatewayFileScope(before + '\n', after));
    for (const gameList of [[], [...games, ...games]])
      assert(!reviewedSharedFileScopes({ ...options, games: gameList }).has(file));
    for (const dir of [source, 'services/runtime-api', 'apps/shell-web']) {
      assert(
        !reviewedSharedFileScopes({
          ...options,
          packages: packages.filter((pkg) => pkg.dir !== dir),
        }).has(file),
      );
      assert(
        !reviewedSharedFileScopes({
          ...options,
          packages: [...packages, packages.find((pkg) => pkg.dir === dir)],
        }).has(file),
      );
    }
    assert(
      !reviewedSharedFileScopes({
        ...options,
        readHead: (name) => (name.includes('/rules/night') ? '' : options.readHead(name)),
      }).has(file),
    );
    assert.throws(
      () =>
        incrementalPlan({
          ...options,
          changedPaths: ['scripts/competition-gateway-extra.mjs'],
          fileScopes: scopes,
          readSource: read,
        }),
      /scope undefined/,
    );
  }
});

test('Night scope test changes execute validation tooling rather than becoming unclassified', () => {
  const plan = incrementalPlan({
    packages: [],
    games: [],
    changedPaths: ['scripts/night-runtime-scope.test.mjs'],
    readSource: () => '',
  });
  assert.equal(plan.validation_tools, true);
});

test('Night armory and room integration from the saved CI/Pages base retains actual consumers', () => {
  const source = 'games/local/night-overwatch';
  const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
  const history = (ref, file) =>
    execFileSync('git', ['show', ref + ':' + file], { encoding: 'utf8' });
  const games = [{ id: 'night-overwatch', source }];
  const packages = [source, 'services/runtime-api', 'apps/shell-web'].map((dir) => ({
    dir,
    ...JSON.parse(read(dir + '/package.json')),
  }));
  for (const file of ['scripts/competition-gateway.mjs', 'scripts/deploy-tencent.mjs']) {
    const before = history('425d2851ba4659cc868bd887469ed39746c4adc4', file);
    const after = history('4b2e5ae55fb10deea40fa9b34f6fdbef4ef4d8af', file);
    const gateway = file.includes('gateway');
    const options = {
      changedPaths: [file],
      games,
      packages,
      readBase: () => before,
      readHead: (name) => (name === file ? after : read(name)),
    };
    const scopes = reviewedSharedFileScopes(options);
    assert.deepEqual(
      scopes.get(file),
      gateway ? [source, 'services/runtime-api', 'apps/shell-web'] : ['services/runtime-api'],
    );
    const plan = incrementalPlan({ ...options, fileScopes: scopes, readSource: read });
    assert(plan.competition_service_checks);
    assert(plan.service_rule_sources.includes('services/runtime-api'));
    if (gateway) {
      assert(plan.game_services_checks);
      assert(plan.game_sources.includes(source));
    } else assert(plan.ranked_deployment_checks);
    for (const override of [
      { readBase: () => before + '\n' },
      { readHead: (name) => (name === file ? after + '\n' : read(name)) },
      { readHead: (name) => (name.endsWith('/Armory.ts') ? '' : options.readHead(name)) },
      { games: [] },
      { packages: packages.filter((pkg) => pkg.dir !== 'services/runtime-api') },
    ])
      assert(!reviewedSharedFileScopes({ ...options, ...override }).has(file));
    assert.throws(
      () =>
        incrementalPlan({
          ...options,
          changedPaths: [file.replace('.mjs', '-extra.mjs')],
          fileScopes: scopes,
          readSource: read,
        }),
      /scope undefined/,
    );
  }
});

test('Night service cache inputs retain the game consumer and reject unrelated Turbo changes', () => {
  const after = JSON.parse(readFileSync(new URL('../turbo.json', import.meta.url), 'utf8'));
  const before = structuredClone(after);
  const task = before.tasks['@coffeeeeffoc/night-overwatch#build'];
  task.env = ['COCOS_CREATOR', 'NIGHT_OVERWATCH_PREBUILT_DIR'];
  task.inputs = ['$TURBO_DEFAULT$', '$TURBO_ROOT$/games/local/night-overwatch/.prebuilt/**'];
  assert(nightServiceTurboOnly(JSON.stringify(before), JSON.stringify(after)));
  const changed = structuredClone(after);
  changed.tasks.build.cache = false;
  assert(!nightServiceTurboOnly(JSON.stringify(before), JSON.stringify(changed)));
  changed.tasks = structuredClone(after.tasks);
  changed.tasks['@coffeeeeffoc/night-overwatch#build'].env.push('SECRET');
  assert(!nightServiceTurboOnly(JSON.stringify(before), JSON.stringify(changed)));
  const source = 'games/local/night-overwatch';
  const options = {
    changedPaths: ['turbo.json'],
    games: [{ id: 'night-overwatch', source }],
    packages: [{ dir: source }, { dir: 'services/runtime-api' }],
    readBase: () => JSON.stringify(before),
    readHead: (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8'),
  };
  assert.deepEqual(reviewedSharedFileScopes(options).get('turbo.json'), [source]);
});

test('Night pure cores select their authoritative Runtime consumer and fail closed without it', () => {
  const source = 'games/local/night-overwatch';
  const options = {
    changedPaths: nightRuntimeInputs,
    games: [{ id: 'night-overwatch', source }],
    packages: [{ dir: source }, { dir: 'services/runtime-api' }],
    readBase: () => '',
    readHead: (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8'),
  };
  for (const file of nightRuntimeInputs)
    assert.deepEqual(reviewedSharedFileScopes(options).get(file), ['services/runtime-api']);
  assert.equal(reviewedSharedFileScopes({ ...options, packages: [{ dir: source }] }).size, 0);
  assert.equal(reviewedSharedFileScopes({ ...options, readHead: () => '' }).size, 0);
});

test('Night deployment additions and match gateway cannot classify unrelated edits', () => {
  const file = 'scripts/deploy-tencent.mjs';
  const before = "const paths = [\n    'services/runtime-api/rules',\n];\n";
  const after = before.replace(
    "    'services/runtime-api/rules',\n",
    "    'services/runtime-api/rules',\n" +
      nightRuntimeInputs.map((value) => `    '${value}',\n`).join(''),
  );
  assert(nightBackendFileScope(file, before, after));
  assert(!nightBackendFileScope(file, before, after + 'unsafe();'));
  assert(!nightBackendFileScope(file, before, after.replace(nightRuntimeInputs[0], 'other.ts')));
  const gateway = String.raw`route(?:\/leaderboards\/)`;
  const matched = gateway.replace(
    String.raw`(?:\/leaderboards\/`,
    String.raw`(?:\/match|\/leaderboards\/`,
  );
  assert(matchGatewayFileScope(gateway, matched));
  assert(!matchGatewayFileScope(gateway, matched + '|any-route'));
});

test('Night build helper exception retains both game and server consumers', () => {
  const file = 'scripts/check-workspace-dependencies.mjs';
  // This exact historical proof predates later games inserting their own boundary edges.
  const after = execFileSync('git', ['show', '9d81f48725b67cc8736f4df41f156b2c3e0cf2f8:' + file], {
    encoding: 'utf8',
  });
  const readHead = (name) =>
    name === file
      ? after
      : readFileSync(new URL('../' + name, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const before = after.replace(
    /^  '(?:services\/runtime-api\/rules\/night(?:-ranked)?\.mjs -> games\/local\/night-overwatch\/[^']+|games\/local\/night-overwatch\/scripts\/build\.mjs -> scripts\/h5-game-services\.mjs)',\n/gm,
    '',
  );
  assert(nightBackendFileScope(file, before, after));
  const source = 'games/local/night-overwatch';
  const scope = reviewedSharedFileScopes({
    changedPaths: [file],
    readBase: () => before,
    readHead,
    games: [{ id: 'night-overwatch', source }],
    packages: [{ dir: source }, { dir: 'services/runtime-api' }],
  });
  assert.deepEqual(scope.get(file), ['services/runtime-api', source]);
});
