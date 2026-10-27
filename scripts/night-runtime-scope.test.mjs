import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  nightBackendFileScope,
  nightRuntimeInputs,
  matchGatewayFileScope,
  reviewedSharedFileScopes,
  nightServiceTurboOnly,
} from './publication-scopes.mjs';

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
  const readHead = (name) =>
    readFileSync(new URL('../' + name, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const after = readHead(file);
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
