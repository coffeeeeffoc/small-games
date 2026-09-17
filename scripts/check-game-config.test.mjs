import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { auditGameConfig } from './check-game-config.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const gameSource = 'games/local/mini-front';
const builtinSource = 'games/local/game-builtin';
const gameName = '@fixture/mini-front';
const builtinName = '@fixture/game-builtin';
const artifactRoots = [
  `${gameSource}/dist`,
  'apps/shell-web/public/games/mini-front',
  'apps/shell-web/dist/games/mini-front',
];

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'small-games-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = async (relative, value) => {
    const destination = path.join(root, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(
      destination,
      typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    );
  };
  const read = (relative) => readFile(path.join(root, relative), 'utf8');
  const json = async (relative) => JSON.parse(await read(relative));
  for (const relative of [
    'package.json',
    'pnpm-workspace.yaml',
    'turbo.json',
    '.github/workflows/ci.yml',
    '.github/workflows/pages.yml',
    '.github/workflows/mobile.yml',
    'apps/shell-web/scripts/prepare-standalone-games.mjs',
    'apps/shell-android/app/build.gradle',
    'apps/shell-ios/scripts/build-ios.mjs',
  ])
    await write(relative, await readFile(path.join(repo, relative), 'utf8'));
  const rootPackage = await json('package.json');
  Object.assign(rootPackage.scripts, {
    'check:games': 'node scripts/check-game-config.mjs',
    'test:game-config': 'node --test scripts/check-game-config.test.mjs',
  });
  await write('package.json', rootPackage);
  await write(`${gameSource}/package.json`, {
    name: gameName,
    version: '1.0.0',
    scripts: { build: 'node build.mjs', test: 'node --test' },
    coffeeeeffoc: { role: 'game' },
  });
  await write(`${builtinSource}/package.json`, {
    name: builtinName,
    version: '1.0.0',
    scripts: { build: 'tsc -b', test: 'node --test' },
    exports: { '.': './src/index.ts' },
    coffeeeeffoc: { role: 'game' },
  });
  await write(`${builtinSource}/src/index.ts`, 'export const builtinGameDefinition = {};');
  const shellPackage = JSON.parse(
    await readFile(path.join(repo, 'apps/shell-web/package.json'), 'utf8'),
  );
  shellPackage.dependencies = { [gameName]: 'workspace:*', [builtinName]: 'workspace:*' };
  await write('apps/shell-web/package.json', shellPackage);
  await write('pnpm-lock.yaml', {
    lockfileVersion: '6.0',
    importers: {
      '.': {},
      [gameSource]: {},
      [builtinSource]: {},
      'apps/shell-web': {
        dependencies: {
          [gameName]: { specifier: 'workspace:*', version: 'link:../../games/local/mini-front' },
          [builtinName]: {
            specifier: 'workspace:*',
            version: 'link:../../games/local/game-builtin',
          },
        },
      },
    },
  });
  await write('apps/shell-web/src/standalone-games.json', [
    {
      id: 'mini-front',
      source: gameSource,
      title: 'Fixture game',
      description: 'Fixture description',
      output: 'dist',
    },
  ]);
  await write(
    'apps/shell-web/src/registry.ts',
    `import { builtinGameDefinition } from '${builtinName}';
export const builtInGameRegistry = [{ id: 'builtin', definition: builtinGameDefinition }];`,
  );
  await write(
    'apps/shell-web/scripts/standalone-game-checks.mjs',
    `export const markers = { 'mini-front': '#start' };
export async function exerciseStandalone(frame, id) {
  if (id === 'mini-front') await frame.locator('#start').click();
}`,
  );
  await mkdir(path.join(root, 'games/submodules'), { recursive: true });
  await write('apps/shell-web/dist/index.html', '<!doctype html><title>Shell</title>');
  for (const output of artifactRoots) {
    await write(
      `${output}/index.html`,
      '<!doctype html><link rel="stylesheet" href="./assets/app.css"><button id="start">Play</button><script type="module" src="./assets/app.js"></script>',
    );
    await write(
      `${output}/assets/app.js`,
      'document.querySelector("#start").addEventListener("click", () => {});',
    );
    await write(`${output}/assets/app.css`, 'body { margin: 0; }');
  }
  return { root, write, read, json };
}

function requireCodes(result, codes) {
  const actual = new Set(result.errors.map((error) => error.code));
  for (const code of codes)
    assert.ok(actual.has(code), `Missing ${code}: ${JSON.stringify(result.errors)}`);
}

test('discovers standalone and imported builtin games, including their built artifacts', async (t) => {
  const f = await fixture(t);
  const result = await auditGameConfig(f.root, { artifacts: true });
  assert.deepEqual(result.errors, []);
  assert.equal(result.games.length, 2);
  assert.equal(result.games.find((game) => game.source === gameSource)?.kind, 'standalone');
  assert.equal(result.games.find((game) => game.source === builtinSource)?.kind, 'builtin');
});

test('finds an omitted game and an incomplete directory instead of only following the catalog', async (t) => {
  const f = await fixture(t);
  await f.write('games/local/unlisted/package.json', {
    name: '@fixture/unlisted',
    scripts: { build: 'node build.mjs', test: 'node --test' },
  });
  await f.write('games/local/draft/index.html', '<title>Unfinished game</title>');
  const result = await auditGameConfig(f.root);
  requireCodes(result, ['unregistered-game', 'missing-package']);
  assert.equal(
    result.games.find((game) => game.name === '@fixture/unlisted')?.kind,
    'unregistered',
  );
});

test('rejects duplicate ids, sources, package names and escaping catalog paths', async (t) => {
  const f = await fixture(t);
  const catalog = await f.json('apps/shell-web/src/standalone-games.json');
  catalog.push({ ...catalog[0] });
  catalog.push({ ...catalog[0], id: 'escaped', source: '../outside' });
  catalog[0].output = '../outside';
  await f.write('apps/shell-web/src/standalone-games.json', catalog);
  await f.write('games/local/duplicate/package.json', {
    name: gameName,
    scripts: { build: 'node build.mjs', test: 'node --test' },
  });
  requireCodes(await auditGameConfig(f.root), [
    'duplicate-id',
    'duplicate-source',
    'duplicate-package',
    'unsafe-source',
    'unsafe-output',
  ]);
});

test('requires the dependency, lock importer, game scripts and both smoke hooks', async (t) => {
  const f = await fixture(t);
  const shell = await f.json('apps/shell-web/package.json');
  delete shell.dependencies[gameName];
  await f.write('apps/shell-web/package.json', shell);
  const lock = await f.json('pnpm-lock.yaml');
  delete lock.importers[gameSource];
  await f.write('pnpm-lock.yaml', lock);
  const game = await f.json(`${gameSource}/package.json`);
  game.scripts = {};
  await f.write(`${gameSource}/package.json`, game);
  await f.write(
    'apps/shell-web/scripts/standalone-game-checks.mjs',
    'export const markers = {};\nexport async function exerciseStandalone() {}',
  );
  requireCodes(await auditGameConfig(f.root), [
    'shell-dependency',
    'lock-missing',
    'missing-build',
    'missing-test',
    'missing-marker',
    'missing-exercise',
  ]);
});

test('honors pnpm workspace exclusions', async (t) => {
  const f = await fixture(t);
  await f.write('pnpm-workspace.yaml', {
    packages: ['apps/*', 'games/local/*', 'games/submodules/*', '!games/local/mini-front'],
  });
  requireCodes(await auditGameConfig(f.root), ['workspace-missing']);
});

test('checks artifacts only when requested and detects a missing emitted entry', async (t) => {
  const f = await fixture(t);
  for (const output of artifactRoots) await rm(path.join(f.root, output, 'index.html'));
  assert.deepEqual((await auditGameConfig(f.root)).errors, []);
  requireCodes(await auditGameConfig(f.root, { artifacts: true }), ['missing-artifact']);
});

test('detects missing relative assets in emitted HTML', async (t) => {
  const f = await fixture(t);
  for (const output of artifactRoots) await rm(path.join(f.root, output, 'assets/app.js'));
  requireCodes(await auditGameConfig(f.root, { artifacts: true }), ['missing-asset']);
});

test('rejects origin-absolute asset paths that break nested Pages URLs', async (t) => {
  const f = await fixture(t);
  for (const output of artifactRoots)
    await f.write(`${output}/index.html`, '<!doctype html><script src="/assets/app.js"></script>');
  requireCodes(await auditGameConfig(f.root, { artifacts: true }), ['absolute-asset']);
});

test('commented workflow gates do not satisfy the CI requirement', async (t) => {
  const f = await fixture(t);
  const workflow = (await f.read('.github/workflows/pages.yml')).replaceAll('\r\n', '\n');
  await f.write(
    '.github/workflows/pages.yml',
    workflow.replace(
      /^(\s*)- run: pnpm check:games(?: --artifacts)?$/gm,
      '$1# - run: pnpm check:games',
    ),
  );
  requireCodes(await auditGameConfig(f.root), ['workflow-gate']);
});

test('requires game build output to be covered by the Turbo cache', async (t) => {
  const f = await fixture(t);
  const turbo = await f.json('turbo.json');
  turbo.tasks.build.outputs = [];
  await f.write('turbo.json', turbo);
  requireCodes(await auditGameConfig(f.root), ['cache-output']);
});

for (const condition of ['false', '${{ false }}']) {
  test(`disabled workflow gates (${condition}) do not count as checks`, async (t) => {
    const f = await fixture(t);
    const workflow = (await f.read('.github/workflows/pages.yml')).replaceAll('\r\n', '\n');
    await f.write(
      '.github/workflows/pages.yml',
      workflow.replace(
        /^([ \t]*)- run: (pnpm check:games(?: --artifacts)?)$/gm,
        (_, indent, command) => `${indent}- if: ${condition}\n${indent}  run: ${command}`,
      ),
    );
    requireCodes(await auditGameConfig(f.root), ['workflow-gate']);
  });
}

test('a shell comment inside a workflow run block is not an executed gate', async (t) => {
  const f = await fixture(t);
  const workflow = (await f.read('.github/workflows/pages.yml')).replaceAll('\r\n', '\n');
  await f.write(
    '.github/workflows/pages.yml',
    workflow.replace(
      /^([ \t]*)- run: (pnpm check:games(?: --artifacts)?)$/gm,
      (_, indent, command) => `${indent}- run: |\n${indent}    # ${command}`,
    ),
  );
  requireCodes(await auditGameConfig(f.root), ['workflow-gate']);
});

test('requires a shell-to-game lockfile dependency in addition to the game importer', async (t) => {
  const f = await fixture(t);
  const lock = await f.json('pnpm-lock.yaml');
  delete lock.importers['apps/shell-web'].dependencies[gameName];
  await f.write('pnpm-lock.yaml', lock);
  requireCodes(await auditGameConfig(f.root), ['lock-missing']);
});

test('rejects a builtin lockfile dependency linked to the wrong game directory', async (t) => {
  const f = await fixture(t);
  const lock = await f.json('pnpm-lock.yaml');
  lock.importers['apps/shell-web'].dependencies[builtinName].version = `link:../../${gameSource}`;
  await f.write('pnpm-lock.yaml', lock);
  requireCodes(await auditGameConfig(f.root), ['lock-missing']);
});

test('requires the built hall entry in artifact mode', async (t) => {
  const f = await fixture(t);
  await rm(path.join(f.root, 'apps/shell-web/dist/index.html'));
  requireCodes(await auditGameConfig(f.root, { artifacts: true }), ['missing-artifact']);
});

test('treats a CSS data URL as one asset instead of parsing its embedded SVG url()', async (t) => {
  const f = await fixture(t);
  for (const output of artifactRoots) {
    await f.write(
      `${output}/assets/app.css`,
      `body { background: url("data:image/svg+xml,%3Csvg%3E%3Crect filter='url(%23n)'/%3E%3C/svg%3E"); }`,
    );
  }
  assert.deepEqual((await auditGameConfig(f.root, { artifacts: true })).errors, []);
});

test('does not require assets from commented HTML tags', async (t) => {
  const f = await fixture(t);
  for (const output of artifactRoots) {
    const html = await f.read(`${output}/index.html`);
    await f.write(
      `${output}/index.html`,
      html + '\n<!--\n<link href=".png"><img src="unused.png">\n-->',
    );
  }
  assert.deepEqual((await auditGameConfig(f.root, { artifacts: true })).errors, []);
});
