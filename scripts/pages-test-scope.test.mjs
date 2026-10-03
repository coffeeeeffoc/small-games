import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  collectChangedPaths,
  loadGameCatalog,
  main,
  parseChangedPaths,
  readSavedDevBaseline,
  selectPagesScope,
} from './pages-test-scope.mjs';
import { gameTestCommand } from './run-pages-game-tests.mjs';

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
