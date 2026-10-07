import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  collectChangedPaths,
  loadGameCatalog,
  main,
  parseChangedPaths,
  readSavedDevBaseline,
  requiresIncrementalCocos,
  selectPagesScope,
} from './pages-test-scope.mjs';
import { gameTestCommand } from './run-pages-game-tests.mjs';
import { registrationFileScopes } from './pages-registration-scope.mjs';
import { incrementalPlan } from './incremental-validation.mjs';
import { workspacePackages } from './validation-plan.mjs';
import { nineNativeFileScopes } from './nine-native-scope.mjs';

const catalog = {
  standaloneGames: [
    { id: 'travel-bund-25d', source: 'games/local/travel-bund-2.5D' },
    { id: 'fishing', source: 'games/submodules/fishing' },
    { id: 'echo-lab', source: 'games/local/echo-lab' },
  ],
  gameSources: [
    'games/local/travel-bund-2.5D',
    'games/submodules/fishing',
    'games/local/echo-lab',
    'games/local/game-cultivation',
  ],
};
const scope = (options) => selectPagesScope({ ...catalog, ...options });
const skipped = { required: false, full: false, game_ids: [], game_sources: [] };

const REGISTRY = 'apps/shell-web/src/standalone-games.json';
const META = 'apps/shell-web/src/game-meta.json';
const SHELL = 'apps/shell-web/package.json';
const LOCK = 'pnpm-lock.yaml';
const registration = (id) => ({
  id,
  source: `games/local/${id}`,
  title: id,
  description: id,
  output: 'dist',
});
const metaEntry = (id, commit = 'a'.repeat(40)) => ({
  source: `games/local/${id}`,
  created: { commit, time: '2026-10-01T00:00:00Z' },
  updated: { commit, time: '2026-10-01T00:00:00Z' },
});

function semanticScope(before, after, options = {}) {
  const changedPaths =
    options.changedPaths || Object.keys(after).filter((file) => before[file] !== after[file]);
  const games = [registration('echo-lab'), registration('new-game')];
  const read = (files) => (file) => {
    if (!Object.hasOwn(files, file)) throw new Error(`Missing ${file}`);
    return files[file];
  };
  return selectPagesScope({
    eventName: 'push',
    refName: 'dev',
    standaloneGames: games,
    gameSources: games.map((game) => game.source),
    ...options,
    changedPaths,
    fileScopes: registrationFileScopes({
      changedPaths,
      readBase: read(before),
      readHead: read(after),
      gameSources: games.map((game) => game.source),
    }),
  });
}

function wiringFixture() {
  const oldRegistry = JSON.stringify([registration('echo-lab')]);
  const newRegistry = JSON.stringify([registration('echo-lab'), registration('new-game')]);
  const manifest = {
    name: '@games/shell',
    scripts: { build: 'vite build' },
    dependencies: { react: '19.2.8' },
  };
  const lock =
    "---\nlockfileVersion: '9.0'\nimporters:\n  .: {}\n---\nlockfileVersion: '9.0'\n\nimporters:\n\n  apps/shell-web:\n    dependencies:\n      react:\n        specifier: 19.2.8\n        version: 19.2.8\n\n  games/local/echo-lab: {}\n\npackages:\n  react@19.2.8: {}\n\nsnapshots:\n  react@19.2.8: {}\n";
  const before = { [REGISTRY]: oldRegistry, [SHELL]: JSON.stringify(manifest), [LOCK]: lock };
  const after = {
    ...before,
    [REGISTRY]: newRegistry,
    [SHELL]: JSON.stringify({
      ...manifest,
      dependencies: { ...manifest.dependencies, '@games/new-game': 'workspace:*' },
    }),
    [LOCK]: lock
      .replace(
        '      react:',
        "      '@games/new-game':\n        specifier: workspace:*\n        version: link:../../games/local/new-game\n      react:",
      )
      .replace('packages:\n', '  games/local/new-game: {}\n\npackages:\n'),
    'games/local/new-game/package.json': JSON.stringify({
      name: '@games/new-game',
      scripts: { build: 'node build.mjs' },
    }),
  };
  return { before, after };
}

function developmentWiringFixture() {
  const { before, after } = wiringFixture();
  const tuples =
    "      '@playwright/test':\n        specifier: 1.55.1\n        version: 1.55.1\n" +
    '      typescript:\n        specifier: 7.0.2\n        version: 7.0.2\n' +
    '      vite:\n        specifier: 8.2.2\n        version: 8.2.2(@types/node@24.10.4)(esbuild@0.28.2)\n';
  for (const files of [before, after]) {
    files[LOCK] = files[LOCK].replace(
      '  games/local/echo-lab: {}\n',
      `  tools/game-build:\n    devDependencies:\n${tuples}\n  games/local/echo-lab: {}\n`,
    ).replace(
      '  react@19.2.8: {}\n',
      "  '@playwright/test@1.55.1': {}\n  typescript@7.0.2: {}\n  vite@8.2.2: {}\n  react@19.2.8: {}\n",
    );
  }
  after[LOCK] = after[LOCK].replace(
    '  games/local/new-game: {}\n',
    `  games/local/new-game:\n    devDependencies:\n${tuples}`,
  );
  after['games/local/new-game/package.json'] = JSON.stringify({
    name: '@games/new-game',
    devDependencies: { '@playwright/test': '1.55.1', typescript: '7.0.2', vite: '8.2.2' },
  });
  return { before, after, tuples };
}

function combinedWiringFixture() {
  const { before, after, tuples } = developmentWiringFixture();
  const native = 'apps/shell-minigame/package.json';
  const game = 'games/local/new-game/package.json';
  const existing = 'games/local/echo-lab/package.json';
  const service = 'services/game-server/package.json';
  const contract = '@coffeeeeffoc/game-contract';
  const nativeManifest = {
    name: '@games/native-shell',
    scripts: { build: 'build-native' },
    dependencies: { [contract]: 'workspace:*' },
  };
  const link = (name, target) =>
    `      '${name}':\n        specifier: workspace:*\n        version: link:${target}\n`;
  const contractLink = link(contract, '../../../packages/game-contract');
  const nativeBefore =
    '  apps/shell-minigame:\n    dependencies:\n' +
    link(contract, '../../packages/game-contract') +
    '\n';
  const nativeAfter = nativeBefore.replace(
    '    dependencies:\n',
    '    dependencies:\n' +
      link('@games/new-game', '../../games/local/new-game') +
      link('@games/echo-lab', '../../games/local/echo-lab'),
  );
  for (const files of [before, after]) {
    files[native] = JSON.stringify(nativeManifest);
    files[existing] = JSON.stringify({
      name: '@games/echo-lab',
      devDependencies: { vite: '8.2.2' },
    });
    files['packages/game-contract/package.json'] = JSON.stringify({ name: contract });
    files[LOCK] = files[LOCK].replace('  apps/shell-web:', nativeBefore + '  apps/shell-web:')
      .replace(
        '  games/local/echo-lab: {}\n',
        '  games/local/echo-lab:\n    devDependencies:\n' +
          tuples.slice(tuples.indexOf('      vite:')),
      )
      .replace('packages:\n', '  packages/game-contract: {}\n\npackages:\n');
  }
  after[native] = JSON.stringify({
    ...nativeManifest,
    dependencies: {
      ...nativeManifest.dependencies,
      '@games/new-game': 'workspace:*',
      '@games/echo-lab': 'workspace:*',
    },
  });
  after[existing] = JSON.stringify({
    ...JSON.parse(after[existing]),
    exports: { './canvas': './native/canvas.js' },
    dependencies: { [contract]: 'workspace:*' },
  });
  after[game] = JSON.stringify({
    ...JSON.parse(after[game]),
    exports: { './canvas': './src/canvas.ts' },
    dependencies: { [contract]: 'workspace:*', react: '19.2.8' },
  });
  after[service] = JSON.stringify({
    name: '@games/game-server',
    coffeeeeffoc: { role: 'service' },
    dependencies: { '@games/new-game': 'workspace:*' },
  });
  const newGameDeps =
    '    dependencies:\n' +
    contractLink +
    '      react:\n        specifier: 19.2.8\n        version: 19.2.8\n';
  const serviceImporter =
    '  services/game-server:\n    dependencies:\n' +
    link('@games/new-game', '../../games/local/new-game') +
    '\n';
  after[LOCK] = after[LOCK].replace(nativeBefore, nativeAfter)
    .replace(
      '  games/local/echo-lab:\n',
      '  games/local/echo-lab:\n    dependencies:\n' + contractLink,
    )
    .replace('  games/local/new-game:\n', '  games/local/new-game:\n' + newGameDeps)
    .replace('packages:\n', serviceImporter + 'packages:\n');
  const read = (files) => (file) => {
    if (!Object.hasOwn(files, file)) throw new Error(`Missing ${file}`);
    return files[file];
  };
  const classify = (candidate = after, base = before, changedPaths) =>
    registrationFileScopes({
      changedPaths:
        changedPaths || Object.keys(candidate).filter((file) => base[file] !== candidate[file]),
      readBase: read(base),
      readHead: read(candidate),
      gameSources: ['games/local/echo-lab', 'games/local/new-game'],
    });
  return {
    before,
    after,
    native,
    game,
    existing,
    service,
    contractLink,
    newGameDeps,
    serviceImporter,
    classify,
  };
}

test('combined new-game runtime, native and source-service wiring proves one additive lock delta', () => {
  const fixture = combinedWiringFixture();
  for (const crlf of [false, true]) {
    const before = { ...fixture.before },
      after = { ...fixture.after };
    if (crlf) {
      before[LOCK] = before[LOCK].replaceAll('\n', '\r\n');
      after[LOCK] = after[LOCK].replaceAll('\n', '\r\n');
    }
    const scopes = fixture.classify(after, before);
    assert.deepEqual(scopes.get(SHELL), ['games/local/new-game']);
    assert.deepEqual(scopes.get(LOCK), ['games/local/new-game', 'games/local/echo-lab']);
  }
  const missingService = fixture.classify(
    fixture.after,
    fixture.before,
    Object.keys(fixture.after).filter((file) => file !== fixture.service),
  );
  assert.equal(missingService.has(LOCK), false);
});

test('combined wiring rejects external resolution, importer syntax and remaining-byte drift', () => {
  const fixture = combinedWiringFixture();
  const { before, after, newGameDeps, serviceImporter } = fixture;
  const candidates = [
    after[LOCK].replace(newGameDeps, newGameDeps.replace('version: 19.2.8', 'version: 19.2.9')),
    after[LOCK].replace(
      newGameDeps,
      newGameDeps.replace('specifier: 19.2.8', 'specifier: ^19.2.8'),
    ),
    after[LOCK].replace(
      newGameDeps,
      newGameDeps.replace('version: 19.2.8', 'version: 19.2.8(extra@1.0.0)'),
    ),
    after[LOCK].replace(newGameDeps, newGameDeps + '    dependenciesMeta: {}\n'),
    after[LOCK].replace(newGameDeps, newGameDeps + newGameDeps),
    after[LOCK].replace(
      '  games/local/new-game:',
      '  games/local/new-game: {}\n\n  games/local/new-game:',
    ),
    after[LOCK].replace(
      '  apps/shell-minigame:',
      '  apps/shell-minigame: {}\n\n  apps/shell-minigame:',
    ),
    after[LOCK].replace(serviceImporter, serviceImporter + serviceImporter),
    after[LOCK].replace(
      serviceImporter,
      serviceImporter.replace('../../games/local/new-game', '../../games/local/echo-lab'),
    ),
    after[LOCK].replace(
      serviceImporter,
      serviceImporter.replace('    dependencies:', '    devDependencies:'),
    ),
    after[LOCK].replace('link:../../../packages/game-contract', 'link:../../../packages/wrong'),
    after[LOCK].replace('  react@19.2.8: {}', '  react@19.2.8: {resolution: changed}'),
    after[LOCK].replace('snapshots:\n', 'snapshots:\n  unexpected: {}\n'),
    after[LOCK].replace('  .: {}', '  .: {unexpected: true}'),
    after[LOCK] + '\nsettings: {unexpected: true}\n',
  ];
  for (const lock of candidates) {
    const scopes = fixture.classify({ ...after, [LOCK]: lock });
    assert.equal(scopes.has(LOCK), false, lock);
    assert.equal(scopes.has(SHELL), false);
  }
  const runtimeDeps = newGameDeps.replace('      react:', '      unknown-runtime:');
  const unknown = {
    ...after,
    [LOCK]: after[LOCK].replace(newGameDeps, runtimeDeps),
    [fixture.game]: JSON.stringify({
      ...JSON.parse(after[fixture.game]),
      dependencies: {
        '@coffeeeeffoc/game-contract': 'workspace:*',
        'unknown-runtime': '19.2.8',
      },
    }),
  };
  assert.equal(fixture.classify(unknown).has(LOCK), false);
  // A tuple in snapshots is not a baseline resolution proof.
  const runtimeTuple = '      react:\n        specifier: 19.2.8\n        version: 19.2.8\n';
  const relocate = (text) =>
    text.replace(runtimeTuple, '').replace('snapshots:\n', 'snapshots:\n' + runtimeTuple);
  assert.equal(
    fixture
      .classify(
        { ...after, [LOCK]: relocate(after[LOCK]) },
        { ...before, [LOCK]: relocate(before[LOCK]) },
      )
      .has(LOCK),
    false,
  );
});

test('combined wiring rejects mismatched manifests, native changes and unrelated source services', () => {
  const fixture = combinedWiringFixture();
  const { before, after, native, game, existing, service } = fixture;
  const mutate = (file, update) => ({
    ...after,
    [file]: JSON.stringify(update(JSON.parse(after[file]))),
  });
  const candidates = [
    mutate(native, (value) => ({ ...value, scripts: { build: 'changed' } })),
    mutate(native, (value) => ({
      ...value,
      dependencies: { ...value.dependencies, '@games/new-game': '^1.0.0' },
    })),
    mutate(game, (value) => ({ ...value, exports: { './canvas': '../shared.js' } })),
    mutate(game, (value) => ({
      ...value,
      dependencies: { ...value.dependencies, react: '19.2.9' },
    })),
    mutate(game, (value) => ({ ...value, optionalDependencies: { react: '19.2.8' } })),
    mutate(existing, (value) => ({ ...value, exports: { './canvas': './src/shared.ts' } })),
    mutate(existing, (value) => ({
      ...value,
      dependencies: { ...value.dependencies, unexpected: 'workspace:*' },
    })),
    mutate(existing, (value) => ({ ...value, devDependencies: { vite: '8.2.3' } })),
    mutate(existing, (value) => ({ ...value, name: '@games/renamed' })),
    mutate(service, (value) => ({ ...value, coffeeeeffoc: { role: 'game' } })),
    mutate(service, (value) => ({ ...value, dependencies: { '@games/echo-lab': 'workspace:*' } })),
    mutate(service, (value) => ({ ...value, dependencies: { '@games/new-game': '^1.0.0' } })),
    mutate(service, (value) => ({ ...value, devDependencies: { vite: '8.2.2' } })),
    mutate('packages/game-contract/package.json', (value) => ({
      ...value,
      name: '@games/wrong-contract',
    })),
  ];
  for (const candidate of candidates) {
    assert.equal(fixture.classify(candidate).has(LOCK), false, JSON.stringify(candidate));
    assert.equal(fixture.classify(candidate).has(SHELL), false);
  }
  for (const [name, specifier, version] of [
    ['@games/echo-lab', 'workspace:*', 'link:../../games/local/echo-lab'],
    ['react', '19.2.8', '19.2.8'],
  ]) {
    const candidate = mutate(service, (value) => ({
      ...value,
      dependencies: { [name]: specifier },
    }));
    candidate[LOCK] = after[LOCK].replace(
      fixture.serviceImporter,
      `  services/game-server:\n    dependencies:\n      ${name.startsWith('@') ? `'${name}'` : name}:\n        specifier: ${specifier}\n        version: ${version}\n\n`,
    );
    assert.equal(fixture.classify(candidate).has(LOCK), false);
  }
  assert.equal(fixture.classify(after, { ...before, [service]: after[service] }).has(LOCK), false);
  const removedBase = { ...before };
  delete removedBase[existing];
  assert.equal(fixture.classify(after, removedBase).has(LOCK), false);
});

test('registration-only manifest and multi-document lock wiring select the new game', () => {
  const { before, after } = wiringFixture();
  assert.deepEqual(semanticScope(before, after), {
    required: true,
    full: false,
    game_ids: ['new-game'],
    game_sources: ['games/local/new-game'],
  });
  assert.equal(
    semanticScope(before, {
      ...after,
      'games/local/new-game/package.json': JSON.stringify({
        name: '@games/new-game',
        devDependencies: {},
      }),
    }).full,
    false,
  );
});

test('new game development tools reuse exact base importer tuples without expanding scope', () => {
  const { before, after } = developmentWiringFixture();
  for (const windowsNewlines of [false, true]) {
    const oldFiles = { ...before },
      newFiles = { ...after };
    if (windowsNewlines) {
      oldFiles[LOCK] = oldFiles[LOCK].replaceAll('\n', '\r\n');
      newFiles[LOCK] = newFiles[LOCK].replaceAll('\n', '\r\n');
    }
    assert.deepEqual(semanticScope(oldFiles, newFiles), {
      required: true,
      full: false,
      game_ids: ['new-game'],
      game_sources: ['games/local/new-game'],
    });
  }
});

test('development wiring rejects undeclared fields, duplicate entries and unproven tool resolutions', () => {
  const { before, after, tuples } = developmentWiringFixture();
  const prefix = '  games/local/new-game:\n    devDependencies:\n';
  const replaceNew = (next) => after[LOCK].replace(prefix + tuples, prefix + next);
  const playwright =
    "      '@playwright/test':\n        specifier: 1.55.1\n        version: 1.55.1\n";
  for (const next of [
    replaceNew(tuples.replace('specifier: 1.55.1', 'specifier: 1.55.2')),
    replaceNew(tuples.replace('version: 1.55.1', 'version: 1.55.2')),
    replaceNew(tuples.replace('@types/node@24.10.4', '@types/node@24.3.1')),
    replaceNew(tuples.replace('      typescript:\n', "      typescript: {specifier: '7.0.2'}\n")),
    replaceNew(tuples + playwright),
    replaceNew(tuples + '    dependenciesMeta: {}\n'),
    replaceNew(tuples + '    optionalDependencies: {}\n'),
    after[LOCK].replace('  vite@8.2.2: {}', '  vite@8.2.2: {resolution: changed}'),
    after[LOCK] + '\n  games/local/unregistered: {}\n',
  ])
    assert.equal(semanticScope(before, { ...after, [LOCK]: next }).full, true);
  const pkg = JSON.parse(after['games/local/new-game/package.json']);
  for (const update of [
    { devDependencies: { ...pkg.devDependencies, vite: '8.2.3' } },
    { devDependencies: { typescript: '7.0.2', vite: '8.2.2' } },
    { devDependencies: { ...pkg.devDependencies, unknown: '1.0.0' } },
    { devDependencies: [] },
    { dependencies: { react: '19.2.8' } },
    { optionalDependencies: { react: '19.2.8' } },
    { peerDependencies: { react: '19.2.8' } },
  ])
    assert.equal(
      semanticScope(before, {
        ...after,
        'games/local/new-game/package.json': JSON.stringify({ ...pkg, ...update }),
      }).full,
      true,
    );
  const externalTool =
    "      'new-external-tool':\n        specifier: 1.0.0\n        version: 1.0.0\n";
  assert.equal(
    semanticScope(before, {
      ...after,
      [LOCK]: replaceNew(tuples.replace(playwright, externalTool)),
      'games/local/new-game/package.json': JSON.stringify({
        ...pkg,
        devDependencies: { 'new-external-tool': '1.0.0', typescript: '7.0.2', vite: '8.2.2' },
      }),
    }).full,
    true,
  );
});

test('tool tuples outside real baseline dependency sections cannot prove reuse', () => {
  const { before, after, tuples } = developmentWiringFixture();
  for (const section of ['packages:', 'snapshots:']) {
    const move = (text) =>
      text
        .replace('  tools/game-build:\n    devDependencies:\n' + tuples + '\n', '')
        .replace(section + '\n', section + '\n' + tuples);
    assert.equal(
      semanticScope(
        { ...before, [LOCK]: move(before[LOCK]) },
        { ...after, [LOCK]: move(after[LOCK]) },
      ).full,
      true,
    );
  }
  const renamed = (text) =>
    text.replace('    devDependencies:\n' + tuples, '    resolutions:\n' + tuples);
  assert.equal(
    semanticScope(
      { ...before, [LOCK]: renamed(before[LOCK]) },
      { ...after, [LOCK]: renamed(after[LOCK]) },
    ).full,
    true,
  );
});

test('one registration presentation or output change selects only its game', () => {
  for (const update of [
    { description: 'new description' },
    { title: 'New title' },
    { output: 'dist-pages' },
  ]) {
    const games = [registration('echo-lab'), registration('new-game')];
    assert.deepEqual(
      semanticScope(
        { [REGISTRY]: JSON.stringify(games) },
        { [REGISTRY]: JSON.stringify([{ ...games[0], ...update }, games[1]]) },
      ),
      {
        required: true,
        full: false,
        game_ids: ['echo-lab'],
        game_sources: ['games/local/echo-lab'],
      },
    );
  }
});

test('metadata history changes retain host gates without unrelated gameplay tests', () => {
  const games = [registration('echo-lab'), registration('new-game')];
  const before = {
    [REGISTRY]: JSON.stringify(games),
    [META]: JSON.stringify({ schemaVersion: 1, games: { 'echo-lab': metaEntry('echo-lab') } }),
  };
  const after = {
    ...before,
    [META]: JSON.stringify({
      schemaVersion: 1,
      games: {
        'echo-lab': metaEntry('echo-lab', 'b'.repeat(40)),
        'new-game': metaEntry('new-game'),
      },
    }),
  };
  assert.deepEqual(semanticScope(before, after), {
    required: true,
    full: false,
    game_ids: [],
    game_sources: [],
  });
  for (const refName of ['main', 'test'])
    assert.equal(semanticScope(before, after, { refName }).full, true);
});

test('registration removals, identity changes, duplicates, reordering and unknown fields stay full', () => {
  const games = [registration('echo-lab'), registration('new-game')];
  const before = { [REGISTRY]: JSON.stringify(games) };
  for (const current of [
    [games[0]],
    [games[1], games[0]],
    [games[0], games[0]],
    [{ ...games[0], id: 'renamed' }, games[1]],
    [{ ...games[0], source: 'games/local/renamed' }, games[1]],
    [{ ...games[0], sharedRuntime: 'new-runtime' }, games[1]],
    [{ ...games[0], output: '../other-game' }, games[1]],
  ])
    assert.equal(semanticScope(before, { [REGISTRY]: JSON.stringify(current) }).full, true);
  for (const invalid of ['{', 'null', '{}'])
    assert.equal(semanticScope(before, { [REGISTRY]: invalid }).full, true);
  assert.equal(semanticScope({}, before).full, true);
});

test('invalid or removed metadata and changed source mappings stay full', () => {
  const before = {
    [REGISTRY]: JSON.stringify([registration('echo-lab')]),
    [META]: JSON.stringify({ schemaVersion: 1, games: { 'echo-lab': metaEntry('echo-lab') } }),
  };
  for (const meta of [
    { schemaVersion: 2, games: { 'echo-lab': metaEntry('echo-lab') } },
    { schemaVersion: 1, games: {} },
    { schemaVersion: 1, games: { 'echo-lab': metaEntry('new-game') } },
    { schemaVersion: 1, games: { 'echo-lab': { ...metaEntry('echo-lab'), runtime: 'shared' } } },
    { schemaVersion: 1, games: { 'echo-lab': metaEntry('echo-lab', 'not-a-sha') } },
  ])
    assert.equal(semanticScope(before, { ...before, [META]: JSON.stringify(meta) }).full, true);
  assert.equal(semanticScope(before, { ...before, [META]: '{' }).full, true);
});

test('shared runtime, global configuration and shared browser assertions still override local registration', () => {
  const { before, after } = wiringFixture();
  for (const file of [
    'apps/shell-web/scripts/standalone-game-checks.mjs',
    'apps/shell-web/src/registry.ts',
    'packages/game-host/src/index.ts',
    'platforms/competition/h5.js',
    'turbo.json',
    '.gitignore',
    'unknown-config.json',
  ]) {
    assert.equal(semanticScope(before, { ...after, [file]: 'changed' }).full, true, file);
  }
  for (const options of [
    { diffAvailable: false },
    { eventName: 'schedule' },
    { eventName: 'workflow_dispatch' },
  ]) {
    assert.equal(semanticScope(before, after, options).full, true);
  }
});

test('real Shell dependency, script and lock resolution changes cannot masquerade as registration wiring', () => {
  const { before, after } = wiringFixture();
  assert.equal(semanticScope(before, { ...after, [LOCK]: before[LOCK] }).full, true);
  const manifest = JSON.parse(after[SHELL]);
  for (const next of [
    { ...manifest, scripts: { build: 'another-builder' } },
    { ...manifest, dependencies: { ...manifest.dependencies, react: '20.0.0' } },
    { ...manifest, dependencies: { '@games/new-game': 'workspace:*' } },
    { ...manifest, dependencies: { ...manifest.dependencies, '@games/new-game': 'workspace:^' } },
    { ...manifest, devDependencies: { vite: '99.0.0' } },
  ])
    assert.equal(semanticScope(before, { ...after, [SHELL]: JSON.stringify(next) }).full, true);
  for (const next of [
    after[LOCK].replace('version: 19.2.8', 'version: 20.0.0'),
    after[LOCK].replace('snapshots:\n', 'snapshots:\n  unexpected: {}\n'),
    after[LOCK].replace('  .: {}', '  .: {injected: true}'),
    after[LOCK].replace('link:../../games/local/new-game', 'link:../../packages/shared'),
    after[LOCK].replace(
      'games/local/new-game: {}',
      'games/local/new-game:\n    dependencies:\n      external: {version: 1.0.0}',
    ),
    after[LOCK] + '\nsettings: {injected: true}\n',
    'not valid yaml',
  ])
    assert.equal(semanticScope(before, { ...after, [LOCK]: next }).full, true);
  assert.equal(
    semanticScope(before, {
      ...after,
      'games/local/new-game/package.json': JSON.stringify({
        name: '@games/new-game',
        dependencies: { react: '19.2.8' },
      }),
    }).full,
    true,
  );
});

test('dev and PR game changes select the registry ID and exact package directory', () => {
  for (const options of [
    { eventName: 'push', refName: 'dev' },
    { eventName: 'pull_request', refName: '123/merge', baseRef: 'main' },
    { eventName: 'pull_request', refName: '123/merge', baseRef: 'test' },
  ]) {
    assert.deepEqual(
      scope({ ...options, changedPaths: ['games/local/travel-bund-2.5D/src/main.ts'] }),
      {
        required: true,
        full: false,
        game_ids: ['travel-bund-25d'],
        game_sources: ['games/local/travel-bund-2.5D'],
      },
    );
  }
});

test('built-in game changes retain logical package tests without a standalone ID', () => {
  assert.deepEqual(scope({ changedPaths: ['games/local/game-cultivation/src/game.ts'] }), {
    required: true,
    full: false,
    game_ids: [],
    game_sources: ['games/local/game-cultivation'],
  });
});

test('submodule gitlink updates select the corresponding game', () => {
  assert.deepEqual(scope({ changedPaths: ['games/submodules/fishing'] }), {
    required: true,
    full: false,
    game_ids: ['fishing'],
    game_sources: ['games/submodules/fishing'],
  });
});

test('Shell, shared dependencies, assets and build configuration select all games', () => {
  for (const file of [
    'apps/shell-web/src/registry.ts',
    'apps/shell-web/src/standalone-games.json',
    'packages/game-contract/src/index.ts',
    'assets',
    'assets/bund/runtime/scene.glb',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'turbo.json',
    '.gitmodules',
    '.github/workflows/pages.yml',
    'scripts/pages-test-scope.mjs',
    'scripts/pages-test-scope.test.mjs',
    'scripts/build-artifact.mjs',
    // The H5 competition adapter is injected into Pages game outputs.
    'platforms/competition/h5.js',
    'services/runtime-api/rules/cops.mjs',
  ]) {
    const result = scope({ changedPaths: [file] });
    assert.equal(result.full, true, file);
    assert.equal(result.required, true, file);
    assert.deepEqual(result.game_ids, ['echo-lab', 'fishing', 'travel-bund-25d']);
    assert.deepEqual(result.game_sources, [...catalog.gameSources].sort());
  }
});

test('Carding Car toolchain scripts shared with Night Overwatch expand coverage', () => {
  const sharedCatalog = {
    standaloneGames: [
      { id: 'carding-car', source: 'games/local/carding-car' },
      { id: 'night-overwatch', source: 'games/local/night-overwatch' },
    ],
    gameSources: ['games/local/carding-car', 'games/local/night-overwatch'],
  };
  for (const name of ['toolchain.mjs', 'native-targets.mjs', 'clear-output.mjs']) {
    assert.deepEqual(
      selectPagesScope({
        ...sharedCatalog,
        eventName: 'push',
        refName: 'dev',
        changedPaths: [`games/local/carding-car/scripts/${name}`],
      }),
      {
        required: true,
        full: true,
        game_ids: ['carding-car', 'night-overwatch'],
        game_sources: ['games/local/carding-car', 'games/local/night-overwatch'],
      },
    );
  }
});

test('known documentation and separate applications skip Pages', () => {
  for (const file of [
    'README.md',
    'AGENTS.md',
    'docs/platform/runbook.md',
    'reports/playtest/trace.json',
    'games/local/echo-lab/README.md',
    'games/local/echo-lab/docs/screenshots/mobile.png',
    '.agents/instructions.md',
    'apps/studio-web/src/index.ts',
    'apps/shell-android/build.gradle',
    'apps/shell-minigame/src/main.ts',
    'services/runtime-api/src/main.ts',
    'services/kart-server/src/main.ts',
    'platforms/wechat/src/index.ts',
  ]) {
    assert.deepEqual(scope({ changedPaths: [file] }), skipped, file);
  }
  assert.deepEqual(scope({ refName: 'main', changedPaths: ['README.md'] }), skipped);
});

test('main and test publication run full regression only for relevant changes', () => {
  for (const refName of ['main', 'test']) {
    assert.equal(
      scope({ eventName: 'push', refName, changedPaths: ['games/local/echo-lab/src/main.ts'] })
        .full,
      true,
    );
    assert.deepEqual(scope({ eventName: 'push', refName, changedPaths: ['README.md'] }), skipped);
  }
});

test('nightly, manual and unavailable bases cannot silently skip checks', () => {
  for (const options of [
    { eventName: 'schedule' },
    { eventName: 'workflow_dispatch' },
    { diffAvailable: false },
  ]) {
    assert.equal(scope({ ...options, changedPaths: [] }).full, true);
    assert.equal(scope({ ...options, changedPaths: ['README.md'] }).full, true);
  }
  assert.deepEqual(scope({ changedPaths: [] }), skipped);
});

test('unknown sources, removed packages and unknown application groups expand coverage', () => {
  for (const file of [
    'games/local/deleted-game/src/index.ts',
    'games/local/echo-lab-renamed/src/index.ts',
    'apps/new-shell/src/index.ts',
    'services/new-service/src/index.ts',
    'platforms/new-platform/config.json',
    'unexpected/root-config.json',
    'games/local/echo-lab/public/config.txt',
  ]) {
    const result = scope({ changedPaths: [file] });
    assert.equal(result.required, true, file);
    assert.equal(result.full, file !== 'games/local/echo-lab/public/config.txt', file);
  }
});

test('changed paths and selected games are deduplicated and sorted deterministically', () => {
  const result = scope({
    changedPaths: [
      'games/submodules/fishing',
      'games/local/echo-lab/src/main.ts',
      'games/local/echo-lab/src/style.css',
      'README.md',
    ],
  });
  assert.deepEqual(result.game_ids, ['echo-lab', 'fishing']);
  assert.deepEqual(result.game_sources, ['games/local/echo-lab', 'games/submodules/fishing']);
});

test('NUL-delimited diff preserves rename sides, deletions and unusual filenames', () => {
  assert.deepEqual(
    parseChangedPaths(
      'R100\0games/local/echo-lab/old.ts\0games/local/echo-lab/new.ts\0D\0apps/shell-web/deleted.ts\0M\0games/submodules/fishing\0A\0name with\nnewline.ts\0',
    ),
    [
      'apps/shell-web/deleted.ts',
      'games/local/echo-lab/new.ts',
      'games/local/echo-lab/old.ts',
      'games/submodules/fishing',
      'name with\nnewline.ts',
    ],
  );
  assert.deepEqual(parseChangedPaths(''), []);
  assert.throws(() => parseChangedPaths('R100\0one\0'), /Incomplete/);
  assert.throws(() => parseChangedPaths('nonsense\0one\0'), /Unexpected/);
});

async function temporaryRepository(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pages-scope-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '--initial-branch=main');
  git('config', 'user.name', 'Pages scope test');
  git('config', 'user.email', 'pages-scope@example.invalid');
  return { root, git };
}

test('adding one standalone registration selects only that game and keeps Pages required', async (t) => {
  const { root, git } = await temporaryRepository(t);
  const registration = (id) => ({
    id,
    source: `games/local/${id}`,
    title: id,
    description: id,
    output: 'dist',
  });
  await mkdir(path.join(root, 'apps/shell-web/src'), { recursive: true });
  for (const id of ['echo-lab', 'new-game']) {
    await mkdir(path.join(root, `games/local/${id}`), { recursive: true });
    await writeFile(
      path.join(root, `games/local/${id}/package.json`),
      JSON.stringify({ name: `@games/${id}` }),
    );
  }
  const file = path.join(root, 'apps/shell-web/src/standalone-games.json');
  await writeFile(file, JSON.stringify([registration('echo-lab')]));
  git('add', '.');
  git('commit', '-m', 'baseline');
  const base = git('rev-parse', 'HEAD');
  await writeFile(file, JSON.stringify([registration('echo-lab'), registration('new-game')]));
  git('add', '.');
  git('commit', '-m', 'register new game');
  assert.deepEqual(
    await main(
      { GITHUB_EVENT_NAME: 'push', GITHUB_REF_NAME: 'dev', PAGES_VALIDATED_BASE: base },
      root,
    ),
    {
      required: true,
      full: false,
      game_ids: ['new-game'],
      game_sources: ['games/local/new-game'],
    },
  );
});

test('CLI semantic comparison uses the PR merge base, not unrelated target-branch registrations', async (t) => {
  const { root, git } = await temporaryRepository(t);
  await mkdir(path.join(root, 'apps/shell-web/src'), { recursive: true });
  for (const id of ['echo-lab', 'new-game']) {
    await mkdir(path.join(root, `games/local/${id}`), { recursive: true });
    await writeFile(
      path.join(root, `games/local/${id}/package.json`),
      JSON.stringify({ name: `@games/${id}` }),
    );
  }
  const file = path.join(root, REGISTRY);
  await writeFile(file, JSON.stringify([registration('echo-lab')]));
  git('add', '.');
  git('commit', '-m', 'baseline');
  git('checkout', '-b', 'feature');
  await writeFile(file, JSON.stringify([registration('echo-lab'), registration('new-game')]));
  git('add', '.');
  git('commit', '-m', 'new registration');
  const head = git('rev-parse', 'HEAD');
  git('checkout', 'main');
  await writeFile(
    file,
    JSON.stringify([{ ...registration('echo-lab'), title: 'Unrelated target branch edit' }]),
  );
  git('add', '.');
  git('commit', '-m', 'target changed');
  const base = git('rev-parse', 'HEAD');
  git('checkout', 'feature');
  assert.deepEqual(
    await main(
      { GITHUB_EVENT_NAME: 'pull_request', PAGES_DIFF_BASE: base, PAGES_DIFF_HEAD: head },
      root,
    ),
    {
      required: true,
      full: false,
      game_ids: ['new-game'],
      game_sources: ['games/local/new-game'],
    },
  );
});

test('CLI retains full coverage for relevant deletion and rename, even within one game', async (t) => {
  const { root, git } = await temporaryRepository(t);
  await mkdir(path.join(root, 'apps/shell-web/src'), { recursive: true });
  await mkdir(path.join(root, 'games/local/echo-lab'), { recursive: true });
  await writeFile(path.join(root, REGISTRY), JSON.stringify([registration('echo-lab')]));
  await writeFile(path.join(root, 'games/local/echo-lab/package.json'), '{}');
  await writeFile(path.join(root, 'games/local/echo-lab/old.js'), 'export const value = 1;');
  git('add', '.');
  git('commit', '-m', 'baseline');
  const base = git('rev-parse', 'HEAD');
  git('mv', 'games/local/echo-lab/old.js', 'games/local/echo-lab/new.js');
  git('commit', '-m', 'rename');
  assert.equal((await main({ PAGES_DIFF_BASE: base }, root)).full, true);
  const renamed = git('rev-parse', 'HEAD');
  git('rm', 'games/local/echo-lab/new.js');
  git('commit', '-m', 'delete');
  assert.equal((await main({ PAGES_DIFF_BASE: renamed }, root)).full, true);
});

test('CLI metadata-only commit keeps required=true and empty gameplay selection in GitHub outputs', async (t) => {
  const { root, git } = await temporaryRepository(t);
  await mkdir(path.join(root, 'apps/shell-web/src'), { recursive: true });
  await mkdir(path.join(root, 'games/local/echo-lab'), { recursive: true });
  await writeFile(path.join(root, REGISTRY), JSON.stringify([registration('echo-lab')]));
  await writeFile(path.join(root, 'games/local/echo-lab/package.json'), '{}');
  await writeFile(
    path.join(root, META),
    JSON.stringify({ schemaVersion: 1, games: { 'echo-lab': metaEntry('echo-lab') } }),
  );
  git('add', '.');
  git('commit', '-m', 'baseline');
  const base = git('rev-parse', 'HEAD');
  await writeFile(
    path.join(root, META),
    JSON.stringify({
      schemaVersion: 1,
      games: { 'echo-lab': metaEntry('echo-lab', 'b'.repeat(40)) },
    }),
  );
  git('add', '.');
  git('commit', '-m', 'metadata');
  const outputPath = path.join(root, 'github-output');
  assert.deepEqual(
    await main(
      {
        GITHUB_EVENT_NAME: 'push',
        GITHUB_REF_NAME: 'dev',
        PAGES_VALIDATED_BASE: base,
        GITHUB_OUTPUT: outputPath,
      },
      root,
    ),
    {
      required: true,
      full: false,
      game_ids: [],
      game_sources: [],
    },
  );
  assert.equal(
    await readFile(outputPath, 'utf8'),
    'required=true\nfull=false\ngame_ids=[]\ngame_sources=[]\n',
  );
});

test('real git diff uses a merge base for PRs and keeps rename and gitlink paths', async (t) => {
  const { root, git } = await temporaryRepository(t);
  await writeFile(path.join(root, 'old.txt'), 'rename this unchanged content\n');
  await writeFile(path.join(root, 'README.md'), 'base\n');
  git('add', '.');
  git('commit', '-m', 'initial');
  const initial = git('rev-parse', 'HEAD');
  git('checkout', '-b', 'feature');
  git('mv', 'old.txt', 'new.txt');
  git('update-index', '--add', '--cacheinfo', `160000,${initial},games/submodules/fishing`);
  git('commit', '-m', 'feature');
  const feature = git('rev-parse', 'HEAD');
  git('checkout', 'main');
  await mkdir(path.join(root, 'packages/shared'), { recursive: true });
  await writeFile(path.join(root, 'packages/shared/index.ts'), 'export const shared = 1;\n');
  git('add', '.');
  git('commit', '-m', 'base changed independently');
  const currentBase = git('rev-parse', 'HEAD');
  assert.deepEqual(
    collectChangedPaths({ root, base: currentBase, head: feature, eventName: 'pull_request' }),
    ['games/submodules/fishing', 'new.txt', 'old.txt'],
  );
  assert.deepEqual(collectChangedPaths({ root, base: initial, head: currentBase }), [
    'packages/shared/index.ts',
  ]);
  assert.throws(() => collectChangedPaths({ root, base: '' }), /No usable/);
  assert.throws(
    () => collectChangedPaths({ root, base: '0000000000000000000000000000000000000000' }),
    /No usable/,
  );
  assert.throws(() => collectChangedPaths({ root, base: 'missing-sha' }));
});

test('CLI output is valid GitHub output and an empty or unknown base selects full', async (t) => {
  const { root, git } = await temporaryRepository(t);
  await mkdir(path.join(root, 'apps/shell-web/src'), { recursive: true });
  await mkdir(path.join(root, 'games/local/echo-lab'), { recursive: true });
  await mkdir(path.join(root, 'games/local/game-cultivation'), { recursive: true });
  await mkdir(path.join(root, 'games/submodules/fishing'), { recursive: true });
  await writeFile(
    path.join(root, 'apps/shell-web/src/standalone-games.json'),
    JSON.stringify(catalog.standaloneGames.filter((game) => game.id !== 'travel-bund-25d')),
  );
  await writeFile(path.join(root, 'games/local/echo-lab/package.json'), '{}');
  await writeFile(path.join(root, 'games/local/game-cultivation/package.json'), '{}');
  await writeFile(path.join(root, 'README.md'), 'initial');
  git('add', '.');
  git('commit', '-m', 'initial');
  const initial = git('rev-parse', 'HEAD');
  await writeFile(path.join(root, 'README.md'), 'updated');
  git('add', '.');
  git('commit', '-m', 'docs');
  assert.deepEqual(await loadGameCatalog(root), {
    standaloneGames: catalog.standaloneGames.filter((game) => game.id !== 'travel-bund-25d'),
    gameSources: [
      'games/local/echo-lab',
      'games/local/game-cultivation',
      'games/submodules/fishing',
    ],
  });
  const outputPath = path.join(root, 'github-output');
  const result = await main(
    {
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF_NAME: 'dev',
      PAGES_DIFF_BASE: initial,
      PAGES_VALIDATED_BASE: initial,
      GITHUB_OUTPUT: outputPath,
    },
    root,
  );
  assert.deepEqual(result, skipped);
  assert.equal(
    await readFile(outputPath, 'utf8'),
    'required=false\nfull=false\ngame_ids=[]\ngame_sources=[]\n',
  );
  for (const base of ['', '0000000000000000000000000000000000000000', 'unknown-commit']) {
    assert.equal((await main({ PAGES_DIFF_BASE: base }, root)).full, true);
  }
});

test('saved dev baseline reads validated deployment metadata and rejects missing or invalid data', async () => {
  const sha = 'a'.repeat(40);
  const payload = (value) => ({
    encoding: 'base64',
    content: Buffer.from(JSON.stringify(value)).toString('base64'),
  });
  let request;
  assert.equal(
    await readSavedDevBaseline(
      { GITHUB_REPOSITORY: 'owner/small-games', GH_TOKEN: 'test-token' },
      async (url, options) => {
        request = { url, options };
        return { ok: true, json: async () => payload({ branch: 'dev', sha }) };
      },
    ),
    sha,
  );
  assert.equal(
    request.url,
    'https://api.github.com/repos/owner/small-games/contents/dev/deployment.json?ref=gh-pages',
  );
  assert.equal(request.options.headers.Authorization, 'Bearer test-token');
  assert.ok(request.options.signal instanceof AbortSignal);
  assert.equal(
    await readSavedDevBaseline({ PAGES_VALIDATED_BASE: sha.toUpperCase() }, async () => {
      assert.fail('A local validated baseline override must not fetch GitHub');
    }),
    sha,
  );
  for (const response of [
    { ok: false, status: 404 },
    { ok: true, json: async () => ({}) },
    { ok: true, json: async () => ({ encoding: 'base64', content: '!! invalid !!' }) },
    { ok: true, json: async () => payload({ branch: 'main', sha }) },
    { ok: true, json: async () => payload({ branch: 'dev', sha: 'not-a-sha' }) },
    { ok: true, json: async () => payload({ branch: 'dev' }) },
  ]) {
    await assert.rejects(
      readSavedDevBaseline({ GITHUB_REPOSITORY: 'owner/small-games' }, async () => response),
    );
  }
  await assert.rejects(readSavedDevBaseline({ PAGES_VALIDATED_BASE: '' }), /Invalid/);
  await assert.rejects(readSavedDevBaseline({}), /GITHUB_REPOSITORY/);
  await assert.rejects(
    readSavedDevBaseline({ GITHUB_REPOSITORY: 'owner/small-games' }, async () => {
      throw new Error('network unavailable');
    }),
    /network unavailable/,
  );
});

test('new dev pushes include pending changes from cancelled earlier runs and docs successors', async (t) => {
  const { root, git } = await temporaryRepository(t);
  const games = catalog.standaloneGames.filter((game) => game.id !== 'fishing');
  await mkdir(path.join(root, 'apps/shell-web/src'), { recursive: true });
  await writeFile(
    path.join(root, 'apps/shell-web/src/standalone-games.json'),
    JSON.stringify(games),
  );
  for (const game of games) {
    await mkdir(path.join(root, game.source, 'src'), { recursive: true });
    await writeFile(path.join(root, game.source, 'package.json'), '{}');
    await writeFile(path.join(root, game.source, 'src/index.ts'), 'initial\n');
  }
  await writeFile(path.join(root, 'README.md'), 'initial\n');
  git('add', '.');
  git('commit', '-m', 'validated baseline');
  const validated = git('rev-parse', 'HEAD');
  await writeFile(path.join(root, 'games/local/echo-lab/src/index.ts'), 'pending game A\n');
  git('add', '.');
  git('commit', '-m', 'pending game A');
  const pendingA = git('rev-parse', 'HEAD');
  await writeFile(path.join(root, 'games/local/travel-bund-2.5D/src/index.ts'), 'pending game B\n');
  git('add', '.');
  git('commit', '-m', 'pending game B');
  const pendingB = git('rev-parse', 'HEAD');
  const env = {
    GITHUB_EVENT_NAME: 'push',
    GITHUB_REF_NAME: 'dev',
    GITHUB_REPOSITORY: 'owner/small-games',
    PAGES_DIFF_BASE: pendingA,
  };
  const savedBaseline = async () => ({
    ok: true,
    json: async () => ({
      encoding: 'base64',
      content: Buffer.from(JSON.stringify({ branch: 'dev', sha: validated })).toString('base64'),
    }),
  });
  const expected = {
    required: true,
    full: false,
    game_ids: ['echo-lab', 'travel-bund-25d'],
    game_sources: ['games/local/echo-lab', 'games/local/travel-bund-2.5D'],
  };
  assert.deepEqual(await main(env, root, savedBaseline), expected);
  await writeFile(path.join(root, 'README.md'), 'docs successor cancels pending runs\n');
  git('add', '.');
  git('commit', '-m', 'docs successor');
  assert.deepEqual(
    await main({ ...env, PAGES_DIFF_BASE: pendingB }, root, savedBaseline),
    expected,
  );
  assert.deepEqual(await main({ ...env, PAGES_VALIDATED_BASE: pendingB }, root), skipped);
  for (const response of [
    { ok: false, status: 404 },
    { ok: true, json: async () => ({ content: 'malformed' }) },
  ]) {
    assert.equal((await main(env, root, async () => response)).full, true);
  }
  assert.equal((await main({ ...env, PAGES_VALIDATED_BASE: 'b'.repeat(40) }, root)).full, true);
});

test('affected logical test command uses exact filters and safely rejects invalid selections', () => {
  assert.deepEqual(
    gameTestCommand({
      PAGES_GAME_SOURCES: JSON.stringify([
        'games/local/echo-lab',
        'games/local/game-cultivation',
        'games/local/echo-lab',
      ]),
    }),
    {
      command: 'pnpm',
      args: [
        'exec',
        'turbo',
        'run',
        'test',
        '--filter=./games/local/echo-lab',
        '--filter=./games/local/game-cultivation',
        '--concurrency=1',
      ],
      sources: ['games/local/echo-lab', 'games/local/game-cultivation'],
    },
  );
  assert.deepEqual(gameTestCommand({ PAGES_FULL_REGRESSION: 'true' }), {
    command: 'pnpm',
    args: ['games:test'],
    sources: [],
  });
  assert.equal(gameTestCommand({ PAGES_FULL_REGRESSION: 'false', PAGES_GAME_SOURCES: '[]' }), null);
  assert.equal(gameTestCommand({}), null);
  assert.throws(() => gameTestCommand({ PAGES_FULL_REGRESSION: '1' }), /true or false/);
  for (const value of [
    '{}',
    'null',
    '"games/local/echo-lab"',
    'not json',
    '[null]',
    '[1]',
    '["--filter=*"]',
    '["games/local/../shared"]',
    '["games/local/echo-lab; touch hacked"]',
    '["games/local/*"]',
    '["games/local/$(touch hacked)"]',
    '["games/local/a/b"]',
  ]) {
    assert.throws(() => gameTestCommand({ PAGES_GAME_SOURCES: value }), value);
  }
});

test('actual e48 to c68 CI changes select two H5 navigation games without native or Creator builds', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const base = 'e48a4c8b5c82311683611c9a5fe1f6786d6ebed2';
  const head = 'c68deaeaea48c138f9a4613dbb719b2031ec1207';
  const result = await main(
    { VALIDATION_RISK_PLAN: 'true', PAGES_DIFF_BASE: base, PAGES_DIFF_HEAD: head },
    root,
  );
  const catalog = await loadGameCatalog(root);
  const local = incrementalPlan({
    packages: await workspacePackages(root),
    games: catalog.standaloneGames,
    changedPaths: collectChangedPaths({ root, base, head }),
    readSource: (file) =>
      execFileSync('git', ['show', `${head}:${file}`], { cwd: root, encoding: 'utf8' }),
  });
  assert.equal(result.diff_base, base);
  assert.equal(result.diff_head, head);
  assert.equal(result.full, false);
  assert.equal(result.cocos, false);
  assert.deepEqual(result.browser_ids, ['letters-words2', 'xiangqi-five']);
  assert.deepEqual(result.browser_ids, local.browser_ids);
  assert.deepEqual(result.nine_native_targets, []);
  assert.deepEqual(result.nine_native_targets, local.nine_native_targets);
});

test('actual dcf to e48 preserves thirty-five native targets and only two H5 navigation samples', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const base = 'dcf778794c36562634a969b8b8975889c4001d0c';
  const head = 'e48a4c8b5c82311683611c9a5fe1f6786d6ebed2';
  const result = await main(
    { VALIDATION_RISK_PLAN: 'true', PAGES_DIFF_BASE: base, PAGES_DIFF_HEAD: head },
    root,
  );
  assert.equal(result.diff_base, base);
  assert.equal(result.diff_head, head);
  assert.equal(result.full, false);
  assert.equal(result.cocos, false);
  assert.deepEqual(result.browser_ids, ['letters-words2', 'xiangqi-five']);
  assert.equal(result.nine_native_targets.length, 35);
  assert.equal(new Set(result.nine_native_targets.map(({ game }) => game)).size, 7);
  assert.equal(new Set(result.nine_native_targets.map(({ platform }) => platform)).size, 5);
  assert(result.nine_native_travel_contract);
  assert(
    !result.nine_native_targets.some(({ game }) =>
      ['carding-car', 'night-overwatch'].includes(game),
    ),
  );
});

test('a valid risk comparison rejects unknown inputs and missing registration proof instead of broadening', async (t) => {
  for (const changed of ['unexpected/root-config.json', 'pnpm-lock.yaml']) {
    const fixture = await temporaryRepository(t);
    const { root, git } = fixture;
    await mkdir(path.join(root, 'apps/shell-web/src'), { recursive: true });
    await mkdir(path.join(root, 'games/local/echo-lab'), { recursive: true });
    await writeFile(path.join(root, REGISTRY), JSON.stringify([registration('echo-lab')]));
    await writeFile(
      path.join(root, 'games/local/echo-lab/package.json'),
      JSON.stringify({ name: '@games/echo-lab' }),
    );
    git('add', '.');
    git('commit', '-m', 'baseline');
    const base = git('rev-parse', 'HEAD');
    await mkdir(path.dirname(path.join(root, changed)), { recursive: true });
    await writeFile(
      path.join(root, changed),
      changed.endsWith('.yaml') ? "lockfileVersion: '9.0'\nimporters: {}\n" : '{}',
    );
    git('add', '.');
    git('commit', '-m', 'unknown or unproved change');
    await assert.rejects(
      main({ VALIDATION_RISK_PLAN: 'true', PAGES_DIFF_BASE: base }, root),
      /scope undefined|scope.*undefined|Missing|does not exist|full regression/,
    );
  }
});

test('risk plans without a usable baseline keep full coverage including Creator', async (t) => {
  const { root, git } = await temporaryRepository(t);
  await mkdir(path.join(root, 'apps/shell-web/src'), { recursive: true });
  await mkdir(path.join(root, 'games/local/echo-lab'), { recursive: true });
  await writeFile(path.join(root, REGISTRY), JSON.stringify([registration('echo-lab')]));
  await writeFile(
    path.join(root, 'games/local/echo-lab/package.json'),
    JSON.stringify({ name: '@games/echo-lab' }),
  );
  git('add', '.');
  git('commit', '-m', 'baseline');
  for (const options of [
    { PAGES_DIFF_BASE: '' },
    { GITHUB_EVENT_NAME: 'schedule' },
    { GITHUB_EVENT_NAME: 'workflow_dispatch' },
  ]) {
    const result = await main({ VALIDATION_RISK_PLAN: 'true', ...options }, root);
    assert.equal(result.full, true);
    assert.equal(result.cocos, true);
    assert.deepEqual(result.browser_ids, ['echo-lab']);
    assert.equal(result.diff_base, '');
  }
});

test('shared competition files keep actual Creator H5 consumers and native Creator requirements', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const { standaloneGames: games } = await loadGameCatalog(root);
  const packages = await workspacePackages(root);
  const read = (file) => readFileSync(path.join(root, file), 'utf8');
  for (const [file, expectedCreator] of [
    ['platforms/competition/client.js', true],
    ['platforms/competition/format.js', false],
  ]) {
    const context = { packages, games, changedPaths: [file], readBase: read, readHead: read };
    const scope = incrementalPlan({
      ...context,
      fileScopes: nineNativeFileScopes(context),
      readSource: read,
    });
    assert.equal(scope.game_sources.includes('games/local/carding-car'), expectedCreator);
    assert.equal(
      requiresIncrementalCocos({ packages, games, changedPaths: [file], scope }),
      expectedCreator,
    );
  }
  const native = incrementalPlan({
    packages,
    games,
    changedPaths: ['games/local/carding-car/native/input.ts'],
    readSource: read,
  });
  assert.deepEqual(native.browser_ids, []);
  assert.deepEqual(native.game_sources, []);
  assert.equal(native.nine_native_targets.length, 5);
  assert(native.nine_native_targets.every((target) => target.requiresCreator === '3.8.8'));
  assert.equal(
    requiresIncrementalCocos({ packages, games, changedPaths: [], scope: native }),
    true,
  );
  const blockedOnly = { ...native, nine_native_targets: [] };
  assert.equal(
    requiresIncrementalCocos({ packages, games, changedPaths: [], scope: blockedOnly }),
    true,
  );
});

test('planning checks out only the locked Xiangqi workspace and retains complete comparison history', async () => {
  for (const [file, job] of [
    ['.github/workflows/ci.yml', 'plan'],
    ['.github/workflows/pages.yml', 'changes'],
  ]) {
    const source = await readFile(new URL('../' + file, import.meta.url), 'utf8');
    const block = source.match(
      new RegExp(`^  ${job}:\\n([\\s\\S]*?)(?=^  [A-Za-z0-9_-]+:|$(?![\\s\\S]))`, 'm'),
    )?.[1];
    assert(block, `Missing actual ${job} job`);
    const checkout = block.match(
      /- uses: actions\/checkout@v5\n        with:\n((?:          [^\n]+\n)+)/,
    )?.[1];
    assert(checkout, `Missing actual ${job} checkout inputs`);
    assert.match(checkout, /^          fetch-depth: 0$/m);
    assert.doesNotMatch(checkout, /submodules:/);
    assert.doesNotMatch(block, /submodules:\s*recursive|--recursive|--remote/);
    const commands = [...block.matchAll(/^          (git[^\n]+)$/gm)].map((match) => match[1]);
    assert.deepEqual(commands, [
      'git -c url.https://github.com/.insteadOf=git@github.com: submodule update --init -- games/submodules/xiangqi-five',
    ]);
    assert.equal(block.split('Read locked Xiangqi workspace for planning').length, 2);
    assert.match(
      block,
      /- name: Read locked Xiangqi workspace for planning\n        run: \|\n          git[^\n]+\n      - uses: actions\/setup-node@v6/,
    );
    assert(
      block.indexOf('Read locked Xiangqi workspace for planning') <
        block.indexOf('actions/setup-node@v6'),
    );
  }
});

test('actual dcf to 9180 canvas proof rejects a missing Xiangqi workspace identity', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const { standaloneGames: games } = await loadGameCatalog(root);
  const packages = await workspacePackages(root);
  const context = {
    changedPaths: ['scripts/nine-canvas-games-smoke.mjs'],
    games,
    packages,
    readBase: (file) =>
      execFileSync('git', ['show', `dcf778794c36562634a969b8b8975889c4001d0c:${file}`], {
        cwd: root,
        encoding: 'utf8',
      }),
    readHead: (file) =>
      execFileSync('git', ['show', `9180c805c77c15634f47f0aeee1092a5b1043a73:${file}`], {
        cwd: root,
        encoding: 'utf8',
      }),
  };
  assert(packages.some((pkg) => pkg.dir === 'games/submodules/xiangqi-five'));
  assert(nineNativeFileScopes(context).has(context.changedPaths[0]));
  const missing = {
    ...context,
    packages: packages.filter((pkg) => pkg.dir !== 'games/submodules/xiangqi-five'),
  };
  const failedProof = nineNativeFileScopes(missing);
  assert.equal(failedProof.has(context.changedPaths[0]), false);
  assert.throws(
    () => incrementalPlan({ ...missing, fileScopes: failedProof }),
    /scope undefined.*nine-canvas-games-smoke/,
  );
});
