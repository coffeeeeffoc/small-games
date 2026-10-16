import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  symlink,
  unlink,
  rename,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { main, parseGameBuildConfig } from './build-games.mjs';
import {
  buildH5Packages,
  compilerEnvironment,
  writeH5Zip,
  recoverRetainedPackages,
} from './h5-taptap-build.mjs';
import { inventory, zipInventory, digest } from '../apps/shell-minigame/scripts/taptap-package.mjs';

const configuration = {
  version: 1,
  games: ['cops-robbers'],
  ads: [false, true],
  backend: [false, true],
  apiUrl: 'https://api.nenggongzhiren.cn/small-games/v1',
};
test('configuration requires explicit targets and variants, without accepting credential-bearing URLs', () => {
  assert.deepEqual(parseGameBuildConfig(configuration).modes, [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ]);
  for (const change of [
    { games: [] },
    { games: ['all'] },
    { games: ['cops-robbers', 'cops-robbers'] },
    { ads: [] },
    { backend: ['false'] },
    { secret: 'CANARY' },
    { apiUrl: 'https://user:CANARY@example.invalid' },
    { backend: [false], apiUrl: 'https://user:CANARY@example.invalid' },
  ])
    assert.throws(() => parseGameBuildConfig({ ...configuration, ...change }));
  assert(
    parseGameBuildConfig({
      ...configuration,
      localBackend: true,
      apiUrl: 'http://127.0.0.1:43802/api/competition/v1',
    }),
  );
});
test('missing local config never builds all; build-only entry passes only its declared public scope', async () => {
  let calls = 0;
  await assert.rejects(
    main([], {
      read: async () => {
        throw Object.assign(Error(), { code: 'ENOENT' });
      },
      build: async () => calls++,
    }),
    /BUILD_CONFIG_MISSING/,
  );
  assert.equal(calls, 0);
  const env = { PATH: process.env.PATH };
  Object.defineProperty(env, 'ADMIN_GITHUB_CLIENT_SECRET', {
    enumerable: true,
    get() {
      throw Error('SECRET_READ');
    },
  });
  await main([], {
    read: async () => JSON.stringify(configuration),
    env,
    build: async (values, options) => {
      calls++;
      assert.deepEqual(values.games, configuration.games);
      assert.equal(values.modes.length, 4);
      assert.equal(options.allowDirty, true);
      assert.equal(options.buildOnly, true);
      assert.equal(options.perGame, true);
      assert(!Object.hasOwn(options.env, 'ADMIN_GITHUB_CLIENT_SECRET'));
      assert(values.output.startsWith('outputs/game-builds/'));
    },
  });
  assert.equal(calls, 1);
  assert(
    !Object.hasOwn(
      compilerEnvironment({ PATH: 'public', RUNTIME_DATABASE_URL: 'CANARY' }),
      'RUNTIME_DATABASE_URL',
    ),
  );
});
test('portable ZIP preserves exact binary inventory and refuses overwrite', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'h5-zip-'));
  try {
    const source = path.join(folder, 'source');
    await mkdir(source);
    await writeFile(path.join(source, 'index.html'), '<head></head>');
    await writeFile(path.join(source, 'binary.dat'), Buffer.from([0, 255, 12, 128]));
    const files = await inventory(source),
      zip = path.join(folder, 'game.zip');
    await writeH5Zip(source, files, zip);
    assert.deepEqual(
      zipInventory(await readFile(zip)),
      files
        .map((file) => ({ ...file, path: 'dist/' + file.path }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    );
    await assert.rejects(writeH5Zip(source, files, zip), { code: 'EEXIST' });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
async function workspaceFixture() {
  const folder = await mkdtemp(path.join(tmpdir(), 'game-local-build-')),
    game = path.join(folder, 'games/local/cops-robbers');
  await mkdir(path.join(game, 'dist/h5-packages/old-batch'), { recursive: true });
  await writeFile(path.join(game, 'dist/h5-packages/old-batch/keep.txt'), 'OLD_BATCH');
  return { folder, game };
}
test('dirty/ungitted source builds selected variants, survives a compiler clearing dist and retains both locations', async () => {
  const { folder, game } = await workspaceFixture();
  try {
    let builds = 0;
    const compile = async ({ buildOutput, env }) => {
      builds++;
      assert.equal(env.COMPETITION_SERVICE_ENABLED, '0');
      await rm(buildOutput, { recursive: true, force: true });
      await mkdir(buildOutput);
      await writeFile(
        path.join(buildOutput, 'index.html'),
        '<html><head></head><body>fixture</body></html>',
      );
    };
    const result = await buildH5Packages(
      {
        games: ['cops-robbers'],
        modes: [
          [false, false],
          [true, false],
        ],
        output: 'outputs/game-builds/batch-one',
      },
      { workspace: folder, allowDirty: true, perGame: true, buildOnly: true, compile },
    );
    assert.equal(builds, 2);
    assert.equal(result.variants.length, 2);
    assert.equal(result.sourceDirty, 'unknown');
    assert.equal(result.qualityChecks, 'not-run');
    for (const variant of result.variants) {
      const rootZip = await readFile(path.join(result.output, variant.zip)),
        gameZip = await readFile(path.join(folder, variant.gameOutput, variant.zip));
      assert.equal(digest(rootZip), digest(gameZip));
      assert.equal(variant.orientation, 'portrait');
      assert.equal(variant.orientationVerified, false);
      const rootManifest = JSON.parse(
        await readFile(path.join(result.output, variant.name + '.json')),
      );
      const gameManifest = JSON.parse(
        await readFile(path.join(folder, variant.gameOutput, variant.name + '.json')),
      );
      assert.deepEqual(rootManifest, gameManifest);
      assert.equal(rootManifest.orientation, 'portrait');
      assert.equal(variant.serviceEnabled, false);
      assert.equal(variant.apiUrl, '');
      assert(variant.files.every((file) => !file.path.startsWith('h5-packages/')));
    }
    await buildH5Packages(
      { games: ['cops-robbers'], modes: [[false, false]], output: 'outputs/game-builds/batch-two' },
      { workspace: folder, allowDirty: true, perGame: true, buildOnly: true, compile },
    );
    assert.equal(
      await readFile(path.join(game, 'dist/h5-packages/old-batch/keep.txt'), 'utf8'),
      'OLD_BATCH',
    );
    assert((await readdir(path.join(game, 'dist/h5-packages'))).includes('batch-one'));
    assert((await readdir(path.join(game, 'dist/h5-packages'))).includes('batch-two'));
    await assert.rejects(
      buildH5Packages(
        {
          games: ['cops-robbers'],
          modes: [[false, false]],
          output: 'outputs/game-builds/batch-one',
        },
        { workspace: folder, allowDirty: true, compile },
      ),
      { code: 'EEXIST' },
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
test('compiler failure restores old batches and output links cannot redirect writes', async () => {
  const { folder, game } = await workspaceFixture(),
    outside = await mkdtemp(path.join(tmpdir(), 'game-outside-'));
  try {
    await assert.rejects(
      buildH5Packages(
        { games: ['cops-robbers'], modes: [[false, false]], output: 'outputs/game-builds/failed' },
        {
          workspace: folder,
          allowDirty: true,
          compile: async ({ buildOutput }) => {
            await rm(buildOutput, { recursive: true, force: true });
            throw Error('COMPILER_FAILED');
          },
        },
      ),
      /COMPILER_FAILED/,
    );
    assert.equal(
      await readFile(path.join(game, 'dist/h5-packages/old-batch/keep.txt'), 'utf8'),
      'OLD_BATCH',
    );
    await rm(path.join(folder, 'outputs'), { recursive: true, force: true });
    await symlink(outside, path.join(folder, 'outputs'), 'junction');
    await assert.rejects(
      buildH5Packages(
        { games: ['cops-robbers'], modes: [[false, false]], output: 'outputs/game-builds/escape' },
        {
          workspace: folder,
          allowDirty: true,
          compile: async () => {
            throw Error('MUST_NOT_BUILD');
          },
        },
      ),
      /cannot be a link/,
    );
    assert.deepEqual(await readdir(outside), []);
    await unlink(path.join(folder, 'outputs'));
  } finally {
    await rm(folder, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('a terminated build recovers retained batches, while live or ambiguous ownership refuses writes', async () => {
  const { folder, game } = await workspaceFixture(),
    name = 'cops-robbers';
  try {
    const parent = path.join(folder, 'outputs', 'aborted'),
      holding = path.join(parent, '.retained-' + name),
      recovery = path.join(folder, 'outputs', '.h5-package-recovery'),
      record = path.join(recovery, name + '.json');
    await mkdir(parent, { recursive: true });
    await mkdir(recovery);
    const child = spawnSync(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
    assert.equal(child.status, 0);
    const value = {
      version: 1,
      game: name,
      pid: child.pid,
      holding: path.relative(folder, holding),
    };
    await rename(path.join(game, 'dist/h5-packages'), holding);
    await writeFile(record, JSON.stringify(value));
    await recoverRetainedPackages(folder, game, name);
    assert.equal(
      await readFile(path.join(game, 'dist/h5-packages/old-batch/keep.txt'), 'utf8'),
      'OLD_BATCH',
    );
    await assert.rejects(readFile(record), { code: 'ENOENT' });
    await writeFile(record, JSON.stringify({ ...value, pid: process.pid }));
    await assert.rejects(recoverRetainedPackages(folder, game, name), /Another build/);
    await writeFile(record, JSON.stringify(value));
    await mkdir(holding);
    await assert.rejects(recoverRetainedPackages(folder, game, name), /ambiguous/);
    assert.equal(
      await readFile(path.join(game, 'dist/h5-packages/old-batch/keep.txt'), 'utf8'),
      'OLD_BATCH',
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
