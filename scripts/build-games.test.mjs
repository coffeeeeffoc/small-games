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
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { crc32 } from 'node:zlib';
import { main, parseGameBuildConfig, gameBuildPlan } from './build-games.mjs';
import { buildNativePackages } from './native-game-build.mjs';
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
const nativeConfiguration = {
  version: 2,
  games: ['cops-robbers', 'cops-robbers-realtime'],
  ads: [false],
  backend: [false],
  targets: [
    {
      platform: 'taptap',
      type: 'minigame',
      appIds: { 'cops-robbers': 'tap-test-cops', 'cops-robbers-realtime': 'tap-test-street' },
    },
  ],
};

// Synthetic stored ZIP for delivery tests; no engine or official-tool acceptance is claimed.
function nativeZip(entries) {
  const local = [],
    central = [];
  let offset = 0;
  for (const [name, value] of entries) {
    const filename = Buffer.from(name),
      bytes = Buffer.from(value);
    const header = Buffer.alloc(30),
      record = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc32(bytes), 14);
    header.writeUInt32LE(bytes.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(filename.length, 26);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt32LE(crc32(bytes), 16);
    record.writeUInt32LE(bytes.length, 20);
    record.writeUInt32LE(bytes.length, 24);
    record.writeUInt16LE(filename.length, 28);
    record.writeUInt32LE(offset, 42);
    local.push(header, filename, bytes);
    central.push(record, filename);
    offset += header.length + filename.length + bytes.length;
  }
  const index = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(index.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, index, end]);
}

async function nativeFixture(folder, config, { badZip = false } = {}) {
  const base = path.join(folder, 'games/minigames', config.game, 'build', config.platform);
  const directory = path.join(base, 'game');
  await mkdir(directory, { recursive: true });
  const entries = [
    ['game.js', 'tap.createCanvas();'],
    ['game.json', JSON.stringify({ appId: config.appId, deviceOrientation: config.orientation })],
    ['project.config.json', JSON.stringify({ appid: config.appId })],
    ['texture.bin', Buffer.from([0, 255, 128])],
  ];
  for (const [name, bytes] of entries) await writeFile(path.join(directory, name), bytes);
  const archive = nativeZip(
    entries.map(([name, bytes]) => [badZip ? 'outer/' + name : name, bytes]),
  );
  await writeFile(path.join(base, 'game.zip'), archive);
  const receipt = {
    schema: 1,
    creator: '3.8.8',
    config,
    files: await inventory(directory),
    gitSha: 'fixture',
    sourceHash: 'fixture',
    conversion: { packageSha256: digest(archive) },
    status: config.preview ? 'preview-build' : 'build-awaiting-platform-acceptance',
  };
  const receiptPath = path.join(base, 'receipt.json');
  await writeFile(receiptPath, JSON.stringify(receipt));
  return { directory, receiptPath, ...receipt };
}

test('native delivery copies the original ZIP byte-for-byte and keeps variants before scratch overwrite', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'native-delivery-'));
  try {
    const config = parseGameBuildConfig({
      ...nativeConfiguration,
      games: ['cops-robbers'],
      backend: [false, true],
      apiUrl: 'https://api.example.test/v1',
      targets: [{ ...nativeConfiguration.targets[0], appIds: { 'cops-robbers': 'tap-test-cops' } }],
    });
    const archives = [];
    const result = await buildNativePackages(
      { jobs: gameBuildPlan(config), output: 'outputs/batch' },
      {
        workspace: folder,
        compile: async (native) => {
          const built = await nativeFixture(folder, native);
          archives.push(await readFile(path.join(path.dirname(built.directory), 'game.zip')));
          return built;
        },
      },
    );
    assert.equal(result.variants.length, 2);
    for (const [i, item] of result.variants.entries()) {
      assert.equal(item.uploadFile, item.zip);
      assert.equal(item.delivery, 'upload-zip');
      assert.equal(item.realDeviceVerified, false);
      assert.deepEqual(await readFile(path.join(result.output, item.zip)), archives[i]);
      const receipt = JSON.parse(await readFile(path.join(result.output, item.receipt), 'utf8'));
      assert.equal(receipt.config.competitionEnabled, Boolean(i));
    }
    await assert.rejects(
      buildNativePackages(
        { jobs: gameBuildPlan(config), output: 'outputs/batch' },
        { workspace: folder },
      ),
      { code: 'EEXIST' },
    );
    await assert.rejects(
      buildNativePackages(
        { jobs: gameBuildPlan(config).slice(0, 1), output: 'outputs/invalid' },
        {
          workspace: folder,
          compile: (native) => nativeFixture(folder, native, { badZip: true }),
        },
      ),
      /ZIP inventory mismatch/,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('native previews and platform projects never claim to be release-upload ZIPs', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'native-projects-'));
  try {
    for (const platform of ['taptap', 'wechat', 'douyin', 'bilibili', 'alipay', 'kuaishou']) {
      const jobs = gameBuildPlan(
        parseGameBuildConfig({
          ...nativeConfiguration,
          games: ['cops-robbers'],
          targets: [{ platform, type: 'minigame', release: false }],
        }),
      );
      const result = await buildNativePackages(
        { jobs, output: 'outputs/' + platform },
        {
          workspace: folder,
          compile: async (config, options) => {
            assert.equal(options.prepareSource, platform === 'kuaishou');
            return nativeFixture(folder, config);
          },
        },
      );
      const item = result.variants[0];
      assert.equal(item.uploadFile, null);
      assert.equal(Boolean(item.zip), platform === 'taptap');
      assert.equal(
        item.delivery,
        platform === 'taptap'
          ? 'preview-zip'
          : platform === 'kuaishou'
            ? 'conversion-source'
            : 'developer-project',
      );
      assert((await readdir(path.join(result.output, item.project))).includes('game.js'));
    }
    const outside = path.join(folder, 'outside');
    await mkdir(outside);
    await symlink(outside, path.join(folder, 'outputs', 'linked'), 'junction');
    await assert.rejects(
      buildNativePackages({ jobs: [], output: 'outputs/linked/batch' }, { workspace: folder }),
      /cannot be a link/,
    );
    assert.deepEqual(await readdir(outside), []);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('native write paths reject junctions before any destructive compiler work', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'native-paths-'));
  const outside = await mkdtemp(path.join(tmpdir(), 'native-preserve-'));
  const jobs = gameBuildPlan(parseGameBuildConfig(nativeConfiguration));
  const project = path.join(folder, 'games/minigames/cops-robbers');
  const build = path.join(project, 'build');
  try {
    await mkdir(project, { recursive: true });
    await writeFile(path.join(outside, 'keep.txt'), 'KEEP');
    await symlink(outside, build, 'junction');
    let compiled = false;
    const options = {
      workspace: folder,
      compile: async () => {
        compiled = true;
      },
    };
    await assert.rejects(
      buildNativePackages({ jobs, output: 'outputs/top-link' }, options),
      /cannot be a link/,
    );
    assert.equal(compiled, false);
    await unlink(build);
    await mkdir(build);
    await symlink(outside, path.join(build, 'taptap-source'), 'junction');
    await assert.rejects(
      buildNativePackages({ jobs, output: 'outputs/nested-link' }, options),
      /cannot be a link/,
    );
    assert.equal(compiled, false);
    assert.equal(await readFile(path.join(outside, 'keep.txt'), 'utf8'), 'KEEP');
    await unlink(path.join(build, 'taptap-source'));
  } finally {
    await rm(folder, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('commented JavaScript config takes precedence, supports explicit .js, and falls back only when absent', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'game-config-'));
  const module = path.join(folder, 'game-build.local.mjs');
  const source =
    '// 每款游戏独立选择\nexport default ' + JSON.stringify(nativeConfiguration) + ';\n';
  try {
    await writeFile(module, source);
    await writeFile(
      path.join(folder, 'game-build.local.json'),
      JSON.stringify({ ...configuration, games: ['xiangqi-five'] }),
    );
    const result = await main(['--dry-run'], { workspace: folder });
    assert.deepEqual(
      result.jobs.map((job) => job.game),
      nativeConfiguration.games,
    );
    await writeFile(path.join(folder, 'custom.js'), source);
    assert.equal(
      (await main(['--config', 'custom.js', '--dry-run'], { workspace: folder })).jobs.length,
      2,
    );
    await writeFile(path.join(folder, 'broken.mjs'), "import './absent.mjs'; export default {};\n");
    await assert.rejects(
      main(['--config', 'broken.mjs', '--dry-run'], { workspace: folder }),
      /BUILD_CONFIG_INVALID/,
    );
    await unlink(module);
    const legacy = await main(['--dry-run'], { workspace: folder });
    assert(legacy.jobs.every((job) => job.game === 'xiangqi-five'));
    await assert.rejects(
      main(['--config', 'missing.mjs', '--dry-run'], { workspace: folder }),
      /BUILD_CONFIG_MISSING/,
    );
    assert(!(await readdir(folder)).includes('outputs'));
    await writeFile(module, 'export default { syntax error };');
    const child = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('./build-games.mjs', import.meta.url)),
        '--config',
        module,
        '--dry-run',
      ],
      { encoding: 'utf8' },
    );
    assert.equal(child.status, 1);
    assert.match(child.stderr, /BUILD_CONFIG_INVALID/);
    assert(!child.stderr.includes('syntax error'));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('target backend overrides and legacy nullable adUnits preserve the requested effective jobs', () => {
  const config = parseGameBuildConfig({
    ...nativeConfiguration,
    backend: [true],
    targets: nativeConfiguration.targets.map((target) => ({ ...target, backend: [false] })),
  });
  assert(gameBuildPlan(config).every((job) => !job.backend && !job.config.apiUrl));
  assert.deepEqual(parseGameBuildConfig({ ...configuration, adUnits: null }).adUnits, {});
  assert.throws(
    () => gameBuildPlan(parseGameBuildConfig({ ...nativeConfiguration, backend: [true] })),
    /BUILD_API_URL_REQUIRED/,
  );
  assert.throws(
    () =>
      gameBuildPlan(
        parseGameBuildConfig({
          ...nativeConfiguration,
          backend: [true],
          apiUrl: 'https://user:CANARY@example.test',
        }),
      ),
    /BUILD_API_URL_INVALID/,
  );
});

test('version 2 plans per-game native identities, mixed package types and explicit previews', () => {
  const subset = gameBuildPlan(
    parseGameBuildConfig({
      ...nativeConfiguration,
      games: ['cops-robbers'],
      targets: [
        {
          ...nativeConfiguration.targets[0],
          appIds: { 'cops-robbers': 'tap-test-cops', 'cops-robbers-realtime': '' },
        },
      ],
    }),
  );
  assert.deepEqual(
    subset.map((job) => job.game),
    ['cops-robbers'],
  );
  const config = parseGameBuildConfig({
    ...nativeConfiguration,
    targets: [
      { platform: 'taptap', type: 'h5' },
      ...nativeConfiguration.targets,
      { platform: 'wechat', type: 'minigame', release: false },
    ],
  });
  const jobs = gameBuildPlan(config);
  assert.equal(jobs.length, 6);
  assert.equal(jobs[0].delivery, 'upload-zip');
  assert.equal(jobs[2].config.appId, 'tap-test-cops');
  assert.equal(jobs[3].config.appId, 'tap-test-street');
  assert.equal(jobs[2].config.preview, false);
  assert.equal(jobs[2].config.apiUrl, '');
  assert.equal(jobs[4].config.preview, true);
  assert.equal(jobs[4].config.appId, '');
  assert.equal(jobs[4].delivery, 'developer-project');
});

test('the complete batch rejects missing release IDs and unsupported or ambiguous targets', async () => {
  for (const target of [
    { platform: 'taptap', type: 'minigame' },
    { platform: 'wechat', type: 'minigame', appIds: { 'cops-robbers': 'not-wechat' } },
    { platform: 'baidu', type: 'minigame', release: false },
    { platform: 'wechat', type: 'h5' },
    { platform: 'taptap', type: 'h5', appIds: { 'cops-robbers': 'unused' } },
    { platform: 'taptap', type: 'minigame', release: false, appSecret: 'CANARY' },
    { platform: 'taptap', type: 'minigame', release: false, appIds: { unknown: 'id' } },
    { platform: 'taptap', type: 'minigame', release: false, ads: [true] },
    { platform: 'alipay', type: 'minigame', release: false, backend: [true] },
  ]) {
    let compiled = false;
    await assert.rejects(
      main(['--config', 'test.json'], {
        read: async () =>
          JSON.stringify({
            ...nativeConfiguration,
            targets: [{ platform: 'taptap', type: 'h5' }, target],
          }),
        build: async () => {
          compiled = true;
        },
        buildNative: async () => {
          compiled = true;
        },
      }),
    );
    assert.equal(compiled, false);
  }
  assert.throws(() =>
    parseGameBuildConfig({
      ...nativeConfiguration,
      targets: [...nativeConfiguration.targets, ...nativeConfiguration.targets],
    }),
  );
});

test('dry-run validates without building or creating output, with no inherited IDs or credentials', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'game-plan-'));
  try {
    const env = {};
    Object.defineProperty(env, 'TAPTAP_APP_ID', {
      enumerable: true,
      get() {
        throw Error('ENV_ID_READ');
      },
    });
    Object.defineProperty(env, 'ADMIN_GITHUB_CLIENT_SECRET', {
      enumerable: true,
      get() {
        throw Error('SECRET_READ');
      },
    });
    const result = await main(['--config', 'test.json', '--dry-run'], {
      workspace: folder,
      env,
      read: async () => JSON.stringify(nativeConfiguration),
      build: async () => {
        throw Error('MUST_NOT_BUILD');
      },
      buildNative: async () => {
        throw Error('MUST_NOT_BUILD');
      },
    });
    assert.equal(result.jobs.length, 2);
    assert.deepEqual(await readdir(folder), []);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('mixed targets dispatch serially, isolate H5/native IDs and retain a combined batch index', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'game-dispatch-'));
  try {
    const calls = [];
    const result = await main(['--config', 'test.json'], {
      workspace: folder,
      read: async () =>
        JSON.stringify({
          ...nativeConfiguration,
          targets: [
            { platform: 'taptap', type: 'h5', adUnits: { 'cops-robbers': 'h5-ad' } },
            {
              ...nativeConfiguration.targets[0],
              ads: [true],
              adUnits: { 'cops-robbers': 'native-ad', 'cops-robbers-realtime': 'street-ad' },
            },
          ],
        }),
      env: { TAPTAP_COPS_ROBBERS_AD_UNIT_ID: 'wrong-ad' },
      build: async (values, options) => {
        calls.push('h5');
        assert.equal(options.env.TAPTAP_COPS_ROBBERS_AD_UNIT_ID, 'h5-ad');
        assert.equal(options.env.TAPTAP_COPS_ROBBERS_REALTIME_AD_UNIT_ID, '');
        assert(values.batch);
        return { output: path.join(folder, values.output), variants: [] };
      },
      buildNative: async (values) => {
        assert.deepEqual(calls, ['h5']);
        calls.push('native');
        assert.equal(values.jobs[0].config.rewardedAdUnitId, 'native-ad');
        return { output: path.join(folder, values.output), variants: [] };
      },
    });
    assert.deepEqual(calls, ['h5', 'native']);
    const summary = JSON.parse(await readFile(path.join(result.output, 'builds.json'), 'utf8'));
    assert.equal(summary.targets.length, 2);
    assert.equal(summary.platformAcceptance, 'not-run');
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
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
    { games: Array(1) },
    { ads: [] },
    { ads: Array(1) },
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
    main(['--config', 'test.json'], {
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
  await main(['--config', 'test.json'], {
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
        output: 'outputs/game-builds/batch-one/taptap-h5',
        batch: 'batch-one',
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
      {
        games: ['cops-robbers'],
        modes: [[false, false]],
        output: 'outputs/game-builds/batch-two/taptap-h5',
        batch: 'batch-two',
      },
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
          output: 'outputs/game-builds/batch-one/taptap-h5',
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
