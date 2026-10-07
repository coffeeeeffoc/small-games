import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import yaml from 'js-yaml';
import { auditGameConfig } from './check-game-config.mjs';
import { syncGameDevMode } from './sync-game-dev-mode.mjs';

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

test('Pages publishes three branches through one queued publisher with read-only PR builds', async () => {
  const read = async (name) => yaml.load(await readFile(path.join(repo, name), 'utf8'));
  const ci = await read('.github/workflows/ci.yml');
  const pages = await read('.github/workflows/pages.yml');
  const validation = await read('.github/workflows/pages-validate.yml');
  for (const config of [ci, pages])
    assert.deepEqual(config.on.push.branches, ['main', 'dev', 'test']);
  assert.equal(pages.permissions.contents, 'read');
  assert.equal(validation.permissions.contents, 'read');
  assert.equal(pages.jobs.build.permissions, undefined);
  assert.equal(pages.concurrency, undefined);
  assert.equal(pages.jobs.validate.concurrency['cancel-in-progress'], true);
  assert.equal(pages.jobs.validate.uses, './.github/workflows/pages-validate.yml');
  assert.deepEqual(pages.jobs.validate.with, {
    cocos: "${{ needs.changes.outputs.cocos == 'true' }}",
    browser: "${{ needs.changes.outputs.browser == 'true' }}",
    full: "${{ needs.changes.outputs.full == 'true' }}",
    game_ids: '${{ needs.changes.outputs.browser_ids }}',
    game_sources: '${{ needs.changes.outputs.game_sources }}',
  });
  assert.equal(pages.jobs.deploy.concurrency.group, 'pages-publish');
  assert.equal(pages.jobs.deploy.concurrency.queue, 'max');
  assert.match(pages.jobs.deploy.if, /github.event_name == 'push'/);
  assert.match(pages.jobs.deploy.if, /github.event_name == 'workflow_dispatch'/);
  assert.match(pages.jobs.deploy.if, /needs.build.result == 'success'/);
  assert.deepEqual(pages.jobs.deploy.needs, ['changes', 'build']);
  for (const branch of ['main', 'dev', 'test'])
    assert(pages.jobs.deploy.if.includes(`refs/heads/${branch}`));
  assert.equal(pages.jobs.deploy.permissions.contents, 'write');
  const buildUpload = validation.jobs.build.steps.find((step) => step.with?.name === 'pages-build');
  assert.equal(buildUpload.with.path, 'apps/shell-web/dist');
  assert.equal(buildUpload.with['include-hidden-files'], true);
  const commands = pages.jobs.deploy.steps.map((step) => step.run ?? '').join('\n');
  assert.match(commands, /scripts\/prepare-pages-deploy\.py/);
  assert.match(commands, /push origin HEAD:gh-pages/);
});

test('Pages summary propagates selected validation failures and permits only explicit skips', async () => {
  const pages = yaml.load(await readFile(path.join(repo, '.github/workflows/pages.yml'), 'utf8'));
  assert.deepEqual(pages.jobs.build.needs, ['changes', 'validate']);
  assert.equal(pages.jobs.build.if, 'always()');
  const gate = pages.jobs.build.steps.find((step) => step.env?.VALIDATION_RESULT);
  assert.equal(gate.env.SCOPE_RESULT, '${{ needs.changes.result }}');
  assert.equal(gate.env.VALIDATION_RESULT, '${{ needs.validate.result }}');
  assert.equal(gate.env.VALIDATION_REQUIRED, '${{ needs.changes.outputs.required }}');
  const cases = [
    ['success', 'true', 'success', 0],
    ['success', 'false', 'skipped', 0],
    ['failure', 'false', 'skipped', 1],
    ['cancelled', 'true', 'success', 1],
    ['success', 'true', 'failure', 1],
    ['success', 'true', 'cancelled', 1],
    ['success', 'true', 'skipped', 1],
    ['success', '', 'skipped', 1],
    ['success', 'unexpected', 'success', 1],
  ];
  const bash =
    process.platform === 'win32'
      ? path.resolve(
          execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(),
          '../../../bin/bash.exe',
        )
      : 'bash';
  for (const [scope, required, validation, expected] of cases) {
    const result = spawnSync(bash, ['-c', gate.run], {
      encoding: 'utf8',
      env: {
        ...process.env,
        SCOPE_RESULT: scope,
        VALIDATION_REQUIRED: required,
        VALIDATION_RESULT: validation,
      },
    });
    assert.equal(result.status, expected, `${scope}/${required}/${validation}: ${result.stdout}`);
  }
});

test('parallel Pages logic builds Shell dependencies and keeps Node test gates', async () => {
  const read = async (name) => yaml.load(await readFile(path.join(repo, name), 'utf8'));
  const pages = await read('.github/workflows/pages.yml');
  const validation = await read('.github/workflows/pages-validate.yml');
  const turbo = await read('turbo.json');
  const { build, logic } = validation.jobs;
  assert.equal(build.needs, 'kart');
  assert.equal(logic.needs, 'kart');
  assert.equal(logic.if, undefined);
  assert.equal(logic['continue-on-error'], undefined);
  const shellTest = logic.steps.find(
    (step) =>
      step.run === 'pnpm exec turbo run test --filter=@coffeeeeffoc/shell-web --concurrency=1',
  );
  assert(shellTest, 'Shell tests must use the Turbo dependency graph in the independent logic job');
  assert.equal(shellTest.if, undefined);
  assert.equal(shellTest['continue-on-error'], undefined);
  const shellTask = turbo.tasks['@coffeeeeffoc/shell-web#test'] ?? turbo.tasks.test;
  assert(shellTask.dependsOn.includes('^build'));
  for (const job of [pages.jobs.changes, logic]) {
    const nodeTests = job.steps.find(
      (step) =>
        step.run ===
        'node --test scripts/pages-test-scope.test.mjs apps/shell-web/scripts/pages-validation.test.mjs',
    );
    assert(nodeTests, 'Pages selection and artifact tests must still run through node:test');
    assert.equal(nodeTests.if, undefined);
    assert.equal(nodeTests['continue-on-error'], undefined);
  }
});

test('Shell Vitest discovery includes every application test and excludes Node script tests', async () => {
  const shell = path.join(repo, 'apps/shell-web');
  const require = createRequire(path.join(shell, 'package.json'));
  const vitestCli = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
  const result = spawnSync(process.execPath, [vitestCli, 'list', '--filesOnly', '--json'], {
    cwd: shell,
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const actual = JSON.parse(result.stdout)
    .map(({ file }) => path.relative(shell, file).replaceAll('\\', '/'))
    .sort();
  const expected = (await readdir(path.join(shell, 'tests'), { recursive: true }))
    .filter((file) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file))
    .map((file) => `tests/${file.replaceAll('\\', '/')}`)
    .sort();
  assert(expected.length > 0, 'Shell application tests must be present');
  assert.deepEqual(actual, expected);
});

test('all Cocos consumers download both source-verified artifacts and pass them through Turbo', async () => {
  const read = async (name) => yaml.load(await readFile(path.join(repo, name), 'utf8'));
  const producer = await read('.github/workflows/carding-car.yml');
  assert.deepEqual(producer.jobs.creator.strategy.matrix.game, ['carding-car', 'night-overwatch']);
  const turbo = await read('turbo.json');
  for (const variable of ['KART_PREBUILT_DIR', 'NIGHT_OVERWATCH_PREBUILT_DIR'])
    assert(turbo.globalPassThroughEnv.includes(variable));
  for (const workflow of ['ci', 'pages-validate', 'mobile']) {
    const config = await read(`.github/workflows/${workflow}.yml`);
    const consumers = Object.values(config.jobs).filter((job) => job.env?.KART_PREBUILT_DIR);
    assert(consumers.length > 0, `${workflow} must consume the verified Cocos artifacts`);
    for (const job of consumers) {
      assert.equal(
        job.env.NIGHT_OVERWATCH_PREBUILT_DIR,
        '${{ github.workspace }}/games/local/night-overwatch/.prebuilt',
      );
      const download = job.steps.find(
        (step) => step.with?.name === 'night-overwatch-${{ github.sha }}',
      );
      assert(download?.uses.startsWith('actions/download-artifact@'), workflow);
      assert.equal(download.with.path, 'games/local/night-overwatch/.prebuilt');
    }
  }
});

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
    '.github/workflows/pages-validate.yml',
    '.github/workflows/carding-car.yml',
    '.github/workflows/mobile.yml',
    'scripts/ci-validation.mjs',
    'scripts/validate-tree.mjs',
    'scripts/cocos-validation.mjs',
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
    lockfileVersion: '9.0',
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
  const record = { commit: 'a'.repeat(40), time: '2026-09-01T08:00:00+08:00' };
  await write('apps/shell-web/src/game-meta.json', {
    schemaVersion: 1,
    games: {
      'mini-front': { source: gameSource, created: record, updated: record },
      builtin: { source: builtinSource, created: record, updated: record },
    },
  });
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

test('discovers lazy builtins and rejects an import without a registered definition', async (t) => {
  const f = await fixture(t);
  const registry = `export const builtInGameRegistry = [{ id: 'builtin', load: async () => {
    const { builtinGameDefinition } = await import('${builtinName}');
    return { definition: builtinGameDefinition };
  } }];`;
  await f.write('apps/shell-web/src/registry.ts', registry);
  assert.deepEqual((await auditGameConfig(f.root)).errors, []);
  await f.write(
    'apps/shell-web/src/registry.ts',
    registry.replace('definition: builtinGameDefinition', 'unused: builtinGameDefinition'),
  );
  requireCodes(await auditGameConfig(f.root), ['unregistered-game']);
});

test('discovers standalone and imported builtin games, including their built artifacts', async (t) => {
  const f = await fixture(t);
  const result = await auditGameConfig(f.root, { artifacts: true });
  assert.deepEqual(result.errors, []);
  assert.equal(result.games.length, 2);
  assert.equal(result.games.find((game) => game.source === gameSource)?.kind, 'standalone');
  assert.equal(result.games.find((game) => game.source === builtinSource)?.kind, 'builtin');
});

test('reads the dependency graph after pnpm toolchain metadata and still rejects a missing link', async (t) => {
  const f = await fixture(t);
  const lock = await f.json('pnpm-lock.yaml');
  const metadata = {
    lockfileVersion: '9.0',
    importers: { '.': { packageManagerDependencies: {} } },
  };
  const writeLock = () =>
    f.write('pnpm-lock.yaml', `---\n${yaml.dump(metadata)}---\n${yaml.dump(lock)}`);
  await writeLock();
  assert.deepEqual((await auditGameConfig(f.root)).errors, []);
  delete lock.importers['apps/shell-web'].dependencies[gameName];
  await writeLock();
  requireCodes(await auditGameConfig(f.root), ['lock-missing']);
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

test('tree validation blocks missing registration or metadata after formatting', async (t) => {
  const f = await fixture(t);
  // Formatting is covered with real Prettier in check-staged-format.test.mjs.
  const fixturePackage = await f.json('package.json');
  fixturePackage.scripts['format:check'] = 'node -e "process.exit(0)"';
  await f.write('package.json', fixturePackage);
  for (const relative of [
    '.githooks/pre-push',
    '.prettierrc.json',
    '.prettierignore',
    'scripts/check-game-config.mjs',
    'scripts/game-meta.mjs',
    'scripts/platform-process.mjs',
    'scripts/sync-game-dev-mode.mjs',
    'platforms/h5/dev-mode.js',
    'platforms/h5/dev-mode.d.ts',
  ])
    await f.write(relative, await readFile(path.join(repo, relative), 'utf8'));
  for (const source of ['apps/shell-web', gameSource, builtinSource])
    await f.write(`${source}/index.html`, '<script type="module" src="./dev-mode.js"></script>');
  await f.write(`${gameSource}/build.mjs`, "const files = ['index.html', 'dev-mode.js'];");
  const builtinPackage = await f.json(`${builtinSource}/package.json`);
  builtinPackage.scripts.build = 'tsc -b && vite build';
  await f.write(`${builtinSource}/package.json`, builtinPackage);
  await syncGameDevMode({ root: f.root });
  await chmod(path.join(f.root, '.githooks/pre-push'), 0o755);
  // Git traverses Windows directory junctions; borrowed dependencies are not fixture sources.
  await f.write('.gitignore', 'node_modules/\n');
  await symlink(
    path.join(repo, 'node_modules'),
    path.join(f.root, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const git = (...args) =>
    spawnSync('git', args, {
      cwd: f.root,
      encoding: 'utf8',
      timeout: 20000,
      // This fixture deliberately borrows installed modules; never reinstall through its junction.
      // Its synthetic lockfile also omits the package-manager graph. Reuse the running pnpm
      // instead of downloading it here; pmOnFail replaces managePackageManagerVersions in
      // pnpm 11/12: https://pnpm.io/settings/cli#pmonfail. Real hooks still run unchanged.
      env: {
        ...process.env,
        PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
        PNPM_CONFIG_PM_ON_FAIL: 'ignore',
      },
    });
  const init = git('init', '--quiet');
  assert.equal(init.status, 0, init.stderr);
  let comparisonBase;
  const hook = () => {
    // The real hook also checks formatting; keep fixture edits formatted before testing registration.
    const formatted = spawnSync(
      process.execPath,
      [path.join(repo, 'node_modules/prettier/bin/prettier.cjs'), '--write', '.'],
      { cwd: f.root, encoding: 'utf8', timeout: 20000 },
    );
    assert.equal(formatted.status, 0, formatted.stdout + formatted.stderr);
    if (!comparisonBase) {
      const staged = git('add', '.');
      assert.equal(staged.status, 0, staged.error?.message || staged.stderr);
      const committed = git(
        '-c',
        'user.name=test',
        '-c',
        'user.email=test@example.com',
        'commit',
        '-qm',
        'fixture',
      );
      assert.equal(committed.status, 0, committed.error?.message || committed.stderr);
      comparisonBase = git('rev-parse', 'HEAD').stdout.trim();
    }
    return spawnSync(
      process.execPath,
      [
        path.join(repo, 'scripts/validate-tree.mjs'),
        '--root',
        f.root,
        '--base',
        comparisonBase,
        '--head',
        comparisonBase,
      ],
      {
        cwd: f.root,
        encoding: 'utf8',
        timeout: 20000,
        env: {
          ...process.env,
          PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
          PNPM_CONFIG_PM_ON_FAIL: 'ignore',
        },
      },
    );
  };
  const registered = hook();
  assert.equal(registered.status, 0, registered.stdout + registered.stderr);

  const meta = await f.json('apps/shell-web/src/game-meta.json');
  const saved = meta.games['mini-front'];
  delete meta.games['mini-front'];
  await f.write('apps/shell-web/src/game-meta.json', meta);
  const missingMeta = hook();
  assert.equal(missingMeta.status, 1, missingMeta.stdout + missingMeta.stderr);
  assert.match(missingMeta.stderr, /\[game-meta-missing\].*games\/local\/mini-front/);
  meta.games['mini-front'] = saved;
  await f.write('apps/shell-web/src/game-meta.json', meta);

  await f.write('apps/shell-web/src/standalone-games.json', []);
  const omitted = hook();
  assert.equal(omitted.status, 1, omitted.stdout + omitted.stderr);
  assert.match(omitted.stderr, /\[unregistered-game\].*games\/local\/mini-front/);
});

test('blocks missing metadata for both standalone and builtin games', async (t) => {
  const f = await fixture(t);
  for (const id of ['mini-front', 'builtin']) {
    const meta = await f.json('apps/shell-web/src/game-meta.json');
    const saved = meta.games[id];
    delete meta.games[id];
    await f.write('apps/shell-web/src/game-meta.json', meta);
    const report = await auditGameConfig(f.root);
    assert(
      report.errors.some(
        (error) => error.code === 'game-meta-missing' && error.path === saved.source,
      ),
    );
    meta.games[id] = saved;
    await f.write('apps/shell-web/src/game-meta.json', meta);
  }
});

test('tree validation rejects bad formatting before running the game checker', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'small-games-push-format-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = async (relative, content) => {
    const destination = path.join(root, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
  };
  for (const relative of ['.githooks/pre-push', '.prettierrc.json', '.prettierignore'])
    await write(relative, await readFile(path.join(repo, relative), 'utf8'));
  await chmod(path.join(root, '.githooks/pre-push'), 0o755);
  const prettierCli = path.join(repo, 'node_modules/prettier/bin/prettier.cjs');
  await write(
    'package.json',
    `${JSON.stringify(
      {
        private: true,
        packageManager: 'pnpm@12.6.0',
        volta: { node: '24.21.0' },
        scripts: {
          'format:check': `node "${prettierCli.replaceAll('\\', '/')}" --check .`,
          'check:games': 'node -e "console.log(\'game-check-ran\')"',
        },
      },
      null,
      2,
    )}\n`,
  );
  const git = (...args) =>
    spawnSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      timeout: 20000,
      // This throwaway formatting fixture has no toolchain lockfile. Use the installed pnpm,
      // not a fresh package-manager download; see the pnpm 11/12 pmOnFail note above.
      env: {
        ...process.env,
        PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
        PNPM_CONFIG_PM_ON_FAIL: 'ignore',
      },
    });
  const init = git('init', '--quiet');
  assert.equal(init.status, 0, init.stderr);
  git('add', '.');
  git('-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture');
  const comparisonBase = git('rev-parse', 'HEAD').stdout.trim();
  const hook = () =>
    spawnSync(
      process.execPath,
      [
        path.join(repo, 'scripts/validate-tree.mjs'),
        '--root',
        root,
        '--base',
        comparisonBase,
        '--head',
        comparisonBase,
      ],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 20000,
        env: {
          ...process.env,
          PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
          PNPM_CONFIG_PM_ON_FAIL: 'ignore',
        },
      },
    );
  const source = 'apps/shell-web/src/format-regression.js';
  const bad = 'const message="hello"\n';
  await write(source, bad);
  const rejected = hook();
  assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
  assert.match(rejected.stderr, /format-regression\.js/);
  assert.doesNotMatch(rejected.stdout + rejected.stderr, /game-check-ran/);
  assert.equal(await readFile(path.join(root, source), 'utf8'), bad);
  await write(source, "const message = 'hello';\n");
  const accepted = hook();
  assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
  assert.match(accepted.stdout + accepted.stderr, /game-check-ran/);
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
  const workflow = (await f.read('.github/workflows/pages-validate.yml')).replaceAll('\r\n', '\n');
  await f.write(
    '.github/workflows/pages-validate.yml',
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
    const workflow = (await f.read('.github/workflows/pages-validate.yml')).replaceAll(
      '\r\n',
      '\n',
    );
    await f.write(
      '.github/workflows/pages-validate.yml',
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
  const workflow = (await f.read('.github/workflows/pages-validate.yml')).replaceAll('\r\n', '\n');
  await f.write(
    '.github/workflows/pages-validate.yml',
    workflow.replace(
      /^([ \t]*)- run: (pnpm check:games(?: --artifacts)?)$/gm,
      (_, indent, command) => `${indent}- run: |\n${indent}    # ${command}`,
    ),
  );
  requireCodes(await auditGameConfig(f.root), ['workflow-gate']);
});

test('echoed command names and allowed failures are not workflow gates', async (t) => {
  const f = await fixture(t);
  const location = '.github/workflows/pages-validate.yml';
  const source = (await f.read(location)).replaceAll('\r\n', '\n');
  for (const replace of [
    (_, indent, command) => `${indent}- run: echo "${command}"`,
    (_, indent, command) => `${indent}- run: ${command} || true`,
    (_, indent, command) => `${indent}- continue-on-error: true\n${indent}  run: ${command}`,
  ]) {
    await f.write(
      location,
      source.replace(/^([ \t]*)- run: (pnpm check:games(?: --artifacts)?)$/gm, replace),
    );
    requireCodes(await auditGameConfig(f.root), ['workflow-gate']);
  }
});

test('requires both split Pages gates or the complete legacy browser command', async (t) => {
  const f = await fixture(t);
  const location = '.github/workflows/pages-validate.yml';
  const source = await f.read(location);
  for (const command of ['test:pages:smoke', 'test:pages:games']) {
    await f.write(location, source.replace(`run: pnpm ${command}`, 'run: echo skipped'));
    requireCodes(await auditGameConfig(f.root), ['workflow-gate']);
  }
  await f.write(
    location,
    source
      .replace('run: pnpm test:pages:smoke', 'run: pnpm test:pages')
      .replace('run: pnpm test:pages:games', 'run: echo legacy command covers both checks'),
  );
  assert.deepEqual((await auditGameConfig(f.root)).errors, []);
});

test('coordination jobs gain normal registration gates if they start building sources', async (t) => {
  const f = await fixture(t);
  for (const [location, id] of [
    ['.github/workflows/pages-validate.yml', 'plan'],
    ['.github/workflows/carding-car.yml', 'reuse'],
  ]) {
    const original = await f.read(location);
    for (const command of ['pnpm build:pages', 'pnpm --filter @fixture/mini-front build']) {
      const workflow = yaml.load(original);
      workflow.jobs[id].steps.push({ run: command });
      await f.write(location, yaml.dump(workflow));
      requireCodes(await auditGameConfig(f.root), ['workflow-gate']);
    }
    await f.write(location, original);
  }
});

test('scoped game logic must execute the runner and its job cannot ignore failures', async (t) => {
  const f = await fixture(t);
  const location = '.github/workflows/pages-validate.yml';
  const source = await f.read(location);
  await f.write(
    location,
    source.replace('run: node scripts/run-pages-game-tests.mjs', 'run: echo game tests'),
  );
  requireCodes(await auditGameConfig(f.root), ['workflow-gate']);
  const workflow = yaml.load(source);
  workflow.jobs.logic['continue-on-error'] = true;
  await f.write(location, yaml.dump(workflow));
  requireCodes(await auditGameConfig(f.root), ['workflow-gate']);
  delete workflow.jobs.logic['continue-on-error'];
  delete workflow.jobs.logic.env.PAGES_GAME_SOURCES;
  await f.write(location, yaml.dump(workflow));
  requireCodes(await auditGameConfig(f.root), ['workflow-gate']);
});

test('disabled reusable callers cannot supply required Pages gates', async (t) => {
  const f = await fixture(t);
  const location = '.github/workflows/pages.yml';
  const workflow = yaml.load(await f.read(location));
  workflow.jobs.validate.if = false;
  await f.write(location, yaml.dump(workflow));
  requireCodes(await auditGameConfig(f.root), ['workflow-gate']);
});

test('rejects missing, cyclic and escaping local reusable workflow references', async (t) => {
  const f = await fixture(t);
  const location = '.github/workflows/pages.yml';
  const source = await f.read(location);
  for (const reference of [
    './.github/workflows/missing.yml',
    './.github/workflows/pages.yml',
    './.github/workflows/../../outside.yml',
  ]) {
    const workflow = yaml.load(source);
    workflow.jobs.validate.uses = reference;
    await f.write(location, yaml.dump(workflow));
    const report = await auditGameConfig(f.root);
    requireCodes(report, ['workflow-gate']);
    assert(report.errors.some((error) => error.message.includes(reference)));
  }
});

test('rejects a reusable workflow symlink outside the workflow directory', async (t) => {
  const f = await fixture(t);
  const called = '.github/workflows/pages-validate.yml';
  await f.write('outside.yml', await f.read(called));
  await rm(path.join(f.root, called));
  try {
    await symlink(path.join(f.root, 'outside.yml'), path.join(f.root, called));
  } catch (error) {
    if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
    t.skip('Windows file symlink creation requires a privilege unavailable to this process');
    return;
  }
  const report = await auditGameConfig(f.root);
  requireCodes(report, ['workflow-gate']);
  assert(report.errors.some((error) => /越出工作流目录/.test(error.message)));
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
