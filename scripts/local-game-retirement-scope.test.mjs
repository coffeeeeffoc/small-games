import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  localRetirementScopesForReview,
  hasLocalRetirementDeletionProof,
  isReviewedLocalRetirementDeletion,
} from './local-game-retirement-scope.mjs';
const hash = (value) => createHash('sha256').update(value).digest('hex');
test('current main retirement binds the real Git deletions and moves without lending proofs to surviving files', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const {
    mainIntegrationBase: base,
    mainIntegrationFixture: head,
    mainRetirementTrees,
    mainRetirementMoves,
  } = await import('./local-game-retirement-reviews.mjs');
  const { mainRetirementDeletionScopes, mainRetirementTreesMatch, hasLocalRetirementFileProof } =
    await import('./local-game-retirement-scope.mjs');
  const { isDocumentation } = await import('./validation-plan.mjs');
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  const tree = (ref) =>
    new Map(
      git('ls-tree', '-r', '-t', ref)
        .trimEnd()
        .split('\n')
        .map((line) => [line.split('\t')[1], line + '\n']),
    );
  const before = tree(base),
    after = tree(head),
    cache = new Map();
  const read = (ref, file) => {
    const key = ref + ':' + file;
    if (!cache.has(key)) cache.set(key, git('show', key));
    return cache.get(key);
  };
  const tokens = git('diff', '--find-renames', '--name-status', '-z', base, head)
    .split('\0')
    .filter(Boolean);
  const changes = [];
  while (tokens.length) {
    const status = tokens.shift();
    changes.push({ status, paths: tokens.splice(0, /^[RC]/.test(status) ? 2 : 1) });
  }
  const context = {
    baseCommit: base,
    changedPaths: changes.flatMap((change) => change.paths),
    readBaseEntry: (file) => before.get(file) ?? '',
    readHeadEntry: (file) => after.get(file) ?? '',
    readBase: (file) => read(base, file),
    readHead: (file) => read(head, file),
    headHasPath: (file) => after.has(file),
  };
  const scopes = mainRetirementDeletionScopes(context);
  assert.equal(Object.keys(mainRetirementTrees).length, 27);
  assert.equal(Object.keys(mainRetirementMoves).length, 16);
  assert(scopes.size > 700, 'Actual historical deletion set must be exercised');
  const underRetired = (file) =>
    Object.keys(mainRetirementTrees).some((root) => file === root || file.startsWith(root + '/'));
  for (const change of changes.filter(
    (change) =>
      /^[DR]/.test(change.status) &&
      underRetired(change.paths[0]) &&
      !change.paths.every(isDocumentation),
  )) {
    assert(isReviewedLocalRetirementDeletion(change, scopes), JSON.stringify(change));
    const value = scopes.get(change.paths[0]);
    assert(!isReviewedLocalRetirementDeletion(change, new Map([[change.paths[0], [...value]]])));
  }
  for (const [from, move] of Object.entries(mainRetirementMoves)) {
    assert(!scopes.has(move.to), move.to);
    assert(!hasLocalRetirementFileProof(move.to, scopes.get(from), context.readHead));
    assert(
      !isReviewedLocalRetirementDeletion(
        { status: move.status, paths: [from, move.to + '.extra'] },
        scopes,
      ),
    );
    assert(!isReviewedLocalRetirementDeletion({ status: 'C100', paths: [from, move.to] }, scopes));
    assert(!isReviewedLocalRetirementDeletion({ status: 'R099', paths: [from, move.to] }, scopes));
  }
  const [from, move] = Object.entries(mainRetirementMoves)[0];
  const retiredRoot = Object.keys(mainRetirementTrees)[0];
  const overrides = [
    { baseCommit: head },
    { readBaseEntry: (file) => (file === retiredRoot ? '' : context.readBaseEntry(file)) },
    { headHasPath: (file) => file === retiredRoot || context.headHasPath(file) },
    { headHasPath: () => undefined },
    {
      headHasPath: () => {
        throw new Error('query failed');
      },
    },
    { readHead: () => JSON.stringify([{ id: 'revived', source: retiredRoot }]) },
    { readBaseEntry: (file) => (file === move.to ? move.afterEntry : context.readBaseEntry(file)) },
    {
      readHeadEntry: (file) =>
        file === move.to
          ? move.afterEntry.replace(/blob [a-f\d]{40}/, 'blob ' + '0'.repeat(40))
          : context.readHeadEntry(file),
    },
    { readBaseEntry: (file) => (file === from ? '' : context.readBaseEntry(file)) },
  ];
  for (const override of overrides)
    assert.equal(mainRetirementDeletionScopes({ ...context, ...override }).size, 0);
  for (const override of [
    {
      readHeadEntry: (file) =>
        file === move.to
          ? move.afterEntry.replace('100644', '100755')
          : context.readHeadEntry(file),
    },
    { headHasPath: (file) => file === from || context.headHasPath(file) },
  ])
    assert.equal(mainRetirementDeletionScopes({ ...context, ...override }).size, 0);
  assert(mainRetirementTreesMatch(context));
  for (const file of ['scripts/unknown-deletion.mjs', retiredRoot + '/unknown-extra.mjs']) {
    const additional = mainRetirementDeletionScopes({
      ...context,
      changedPaths: [...context.changedPaths, file],
    });
    assert(!isReviewedLocalRetirementDeletion({ status: 'D', paths: [file] }, additional));
  }
  const standalone = 'scripts/build-artifact.mjs';
  assert(scopes.has(standalone));
  assert.equal(
    mainRetirementDeletionScopes({
      ...context,
      readBase: (file) => context.readBase(file) + (file === standalone ? '\nextra' : ''),
    }).size,
    0,
  );
});

test('Pages entry rejects extra deletion and rename alongside the valid current main retirement', async (t) => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const { mainIntegrationBase: base, mainIntegrationFixture: head } = await import(
    './local-game-retirement-reviews.mjs'
  );
  const { main } = await import('./pages-test-scope.mjs');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const temp = await mkdtemp(path.join(tmpdir(), 'main-scope-negative-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  // A private index creates unreachable fixture objects; no branch, checkout or
  // user index changes. The candidate catalog stays identical to the real head.
  const env = {
    ...process.env,
    GIT_INDEX_FILE: path.join(temp, 'index'),
    GIT_AUTHOR_NAME: 'scope fixture',
    GIT_AUTHOR_EMAIL: 'scope@example.invalid',
    GIT_COMMITTER_NAME: 'scope fixture',
    GIT_COMMITTER_EMAIL: 'scope@example.invalid',
  };
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  const source = 'scripts/platform-config.mjs';
  const blob = git('rev-parse', head + ':' + source);
  for (const rename of [false, true]) {
    git('read-tree', head);
    git('update-index', '--force-remove', source);
    if (rename)
      git(
        'update-index',
        '--add',
        '--cacheinfo',
        '100644,' + blob + ',scripts/platform-config-extra.mjs',
      );
    const candidate = git(
      'commit-tree',
      git('write-tree'),
      '-p',
      head,
      '-m',
      'extra unknown scope fixture',
    );
    await assert.rejects(
      main(
        {
          PAGES_DIFF_BASE: base,
          PAGES_DIFF_HEAD: candidate,
          GITHUB_EVENT_NAME: 'push',
          GITHUB_REF_NAME: 'main',
          VALIDATION_RISK_PLAN: 'true',
        },
        root,
      ),
      /Relevant deletion or rename/,
    );
  }
});
const root = 'games/local/retired-fixture';
const file = root + '/main.js';
const tree = `040000 tree ${'a'.repeat(40)}\t${root}\n`;
const entry = `100644 blob ${'b'.repeat(40)}\t${file}\n`;
const trees = { [root]: tree };
const reviews = {
  'package.json': { before: hash('old'), after: hash('new'), sources: ['apps/shell-web'] },
};
function context(overrides = {}) {
  return {
    changedPaths: [file, 'package.json'],
    readBaseEntry: (name) => (name === root ? tree : name === file ? entry : ''),
    readBase: () => 'old',
    readHead: () => 'new',
    headHasPath: (name) => name === 'package.json',
    ...overrides,
  };
}
test('exact retired trees and reviewed edits select only surviving consumers', () => {
  const scopes = localRetirementScopesForReview(context(), trees, reviews);
  assert.deepEqual(
    [...scopes],
    [
      [file, []],
      ['package.json', ['apps/shell-web']],
    ],
  );
  // A caller-controlled review or an array with identical values cannot forge production proof.
  assert.equal(hasLocalRetirementDeletionProof(file, scopes.get(file)), false);
  assert.equal(hasLocalRetirementDeletionProof(file, []), false);
});
test('missing inputs, byte drift, surviving roots and unreviewed deletions fail closed', () => {
  for (const change of [
    { readBaseEntry: () => '' },
    { readBase: () => 'drift' },
    { readHead: () => 'drift' },
    { headHasPath: () => true },
    {
      headHasPath: () => {
        throw new Error('query failed');
      },
    },
  ])
    assert.equal(localRetirementScopesForReview(context(change), trees, reviews).size, 0);
  const scopes = localRetirementScopesForReview(
    context({ changedPaths: ['unknown.js'] }),
    trees,
    reviews,
  );
  assert.equal(scopes.size, 0);
  assert.equal(
    isReviewedLocalRetirementDeletion(
      { status: 'R100', paths: [file, 'new.js'] },
      new Map([[file, []]]),
    ),
    false,
  );
});

test('retired gitlinks require the exact recorded commit and confirmed absence', () => {
  const source = 'games/submodules/retired-fixture';
  const gitlink = `160000 commit ${'c'.repeat(40)}\t${source}\n`;
  const fixture = context({
    changedPaths: [source],
    readBaseEntry: () => gitlink,
    headHasPath: () => false,
  });
  assert.deepEqual(
    [...localRetirementScopesForReview(fixture, { [source]: gitlink }, {})],
    [[source, []]],
  );
  for (const override of [
    { readBaseEntry: () => gitlink.replace('c'.repeat(40), 'd'.repeat(40)) },
    { headHasPath: () => true },
    { headHasPath: () => undefined },
    { readBaseEntry: () => '' },
  ])
    assert.equal(
      localRetirementScopesForReview({ ...fixture, ...override }, { [source]: gitlink }, {}).size,
      0,
    );
  const directory = `040000 tree ${'c'.repeat(40)}\t${source}\n`;
  assert.equal(
    localRetirementScopesForReview(
      { ...fixture, readBaseEntry: () => directory },
      { [source]: directory },
      {},
    ).size,
    0,
  );
});

test('production review binds historical file bytes, retained consumers and unforgeable deletion proofs', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const { localRetirementBase, localRetirementTrees, localRetirementReviews } = await import(
    './local-game-retirement-reviews.mjs'
  );
  const { localRetirementFileScopes, hasLocalRetirementFileProof } = await import(
    './local-game-retirement-scope.mjs'
  );
  const root = fileURLToPath(new URL('../', import.meta.url));
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const retired = Object.keys(localRetirementTrees)[0] + '/package.json';
  // The reviewed deletion is a historical transition. Later valid game changes
  // must not become part of its fixed byte proof or its positive fixture.
  const reviewedHead = 'f62716c317b391b89e78eec220abc053f874f981';
  const readHead = (file) => git('show', `${reviewedHead}:${file}`);
  const readHeadEntry = (file) => git('--literal-pathspecs', 'ls-tree', reviewedHead, '--', file);
  const context = {
    changedPaths: [
      retired,
      'games/local/game-cricket/public/cricket-audio/perfect.wav',
      ...Object.keys(localRetirementReviews),
    ],
    readBase: (file) => git('show', `${localRetirementBase}:${file}`),
    readBaseEntry: (file) => git('--literal-pathspecs', 'ls-tree', localRetirementBase, '--', file),
    readHead,
    readHeadEntry,
    headHasPath: (file) => readHeadEntry(file) !== '',
  };
  const scopes = localRetirementFileScopes(context);
  assert.equal(scopes.size, context.changedPaths.length);
  assert.equal(hasLocalRetirementDeletionProof(retired, scopes.get(retired)), true);
  assert.equal(hasLocalRetirementDeletionProof(retired, [...scopes.get(retired)]), false);
  assert.equal(isReviewedLocalRetirementDeletion({ status: 'D', paths: [retired] }, scopes), true);
  assert.equal(
    isReviewedLocalRetirementDeletion({ status: 'R100', paths: [retired, 'elsewhere'] }, scopes),
    false,
  );
  const builder = 'apps/shell-minigame/scripts/nine-games-build.mjs';
  assert.equal(
    localRetirementFileScopes({
      ...context,
      readHead: (file) => readHead(file) + (file === builder ? '\n// extra executable change' : ''),
    }).size,
    0,
  );
  assert.equal(hasLocalRetirementFileProof(builder, scopes.get(builder), readHead), true);
  assert.equal(
    hasLocalRetirementFileProof(builder, scopes.get(builder), () => 'drift'),
    false,
  );
  const { requiresIncrementalCocos } = await import('./pages-test-scope.mjs');
  const creator = {
    dir: 'games/local/creator-fixture',
    name: 'creator',
    creator: { version: '3.8.8' },
  };
  const packages = [
    creator,
    { dir: 'apps/shell-web', name: 'shell', dependencies: { creator: 'workspace:*' } },
  ];
  const scoped = {
    full: false,
    required: true,
    game_sources: [],
    nine_native_targets: [],
    nine_native_blocked: [],
  };
  const candidate = {
    packages,
    games: [],
    changedPaths: ['apps/shell-web/package.json'],
    scope: scoped,
    risk: 'incremental',
    fileScopes: scopes,
    readSource: readHead,
  };
  assert.equal(requiresIncrementalCocos(candidate), false);
  assert.equal(
    requiresIncrementalCocos({
      ...candidate,
      changedPaths: [...candidate.changedPaths, 'apps/shell-web/src/unreviewed.ts'],
    }),
    true,
  );
  const audio = 'platforms/competition/assets/action.wav';
  const originalAudio = 'games/local/game-cricket/public/cricket-audio/perfect.wav';
  assert.equal(
    isReviewedLocalRetirementDeletion({ status: 'R100', paths: [originalAudio, audio] }, scopes),
    true,
  );
  assert.equal(
    isReviewedLocalRetirementDeletion({ status: 'R90', paths: [originalAudio, audio] }, scopes),
    false,
  );
  assert.equal(
    isReviewedLocalRetirementDeletion({ status: 'R100', paths: [retired, audio] }, scopes),
    false,
  );
  assert.equal(
    localRetirementFileScopes({ ...context, readHeadEntry: () => 'different blob' }).size,
    0,
  );
  assert.equal(
    localRetirementFileScopes({
      ...context,
      headHasPath: (file) => (file === audio ? false : context.headHasPath(file)),
    }).size,
    0,
  );
});

test('portfolio retirement binds the selected games, retained catalog and exact snapshot deletions', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const {
    portfolioRetirementBase: base,
    portfolioRetirementHead: head,
    portfolioRetirementTrees: trees,
    portfolioRetirementReviews: reviews,
  } = await import('./local-game-retirement-reviews.mjs');
  const { localRetirementFileScopes, hasLocalRetirementFileProof } = await import(
    './local-game-retirement-scope.mjs'
  );
  const root = fileURLToPath(new URL('../', import.meta.url));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const read = (revision, file) => git('show', `${revision}:${file}`);
  const entry = (revision, file) => git('--literal-pathspecs', 'ls-tree', revision, '--', file);
  const before = JSON.parse(read(base, 'apps/shell-web/src/game-assessments.json')).games;
  const removed = before.filter(
    (game) => game.id !== 'merge-front' && game.potential.includes('low'),
  );
  assert.equal(removed.length, 19);
  assert.deepEqual(
    Object.keys(trees)
      .filter((source) => source.startsWith('games/'))
      .sort(),
    removed.map((game) => game.source).sort(),
  );
  const ids = new Set(removed.map((game) => game.id));
  assert.deepEqual(
    JSON.parse(read(head, 'apps/shell-web/src/game-assessments.json')).games,
    before.filter((game) => !ids.has(game.id)),
  );
  assert.deepEqual(
    JSON.parse(read(head, 'apps/shell-web/src/standalone-games.json')),
    JSON.parse(read(base, 'apps/shell-web/src/standalone-games.json')).filter(
      (game) => !ids.has(game.id),
    ),
  );
  assert.equal(entry(base, 'games/local/merge-front'), entry(head, 'games/local/merge-front'));
  const changedPaths = git('diff', '--no-renames', '--name-only', base, head).trim().split('\n');
  const context = {
    changedPaths,
    readBase: (file) => read(base, file),
    readBaseEntry: (file) => entry(base, file),
    readHead: (file) => read(head, file),
    readHeadEntry: (file) => entry(head, file),
    headHasPath: (file) => entry(head, file) !== '',
  };
  const scopes = localRetirementFileScopes(context);
  for (const file of changedPaths.filter((file) => entry(head, file) === '')) {
    assert(hasLocalRetirementDeletionProof(file, scopes.get(file)), file);
    assert(isReviewedLocalRetirementDeletion({ status: 'D', paths: [file] }, scopes), file);
    assert(!hasLocalRetirementDeletionProof(file, [...scopes.get(file)]), file);
  }
  for (const [file, review] of Object.entries(reviews)) {
    if (review.after !== null)
      assert(hasLocalRetirementFileProof(file, scopes.get(file), context.readHead), file);
    if (review.movedFrom)
      assert(
        isReviewedLocalRetirementDeletion(
          { status: 'R100', paths: [review.movedFrom, file] },
          scopes,
        ),
      );
  }
  const library = 'games/local/letters-words2/library.js';
  const beforeLibrary = read(base, library);
  const afterLibrary = read(head, library);
  assert(beforeLibrary.startsWith('// ') && afterLibrary.startsWith('// '));
  assert.equal(
    beforeLibrary.slice(beforeLibrary.indexOf('\n')),
    afterLibrary.slice(afterLibrary.indexOf('\n')),
  );
  const { nineNativeDependencyPlan } = await import('./nine-native-scope.mjs');
  const { readFileSync } = await import('node:fs');
  const { workspacePackages } = await import('./validation-plan.mjs');
  const nativeContext = {
    changedPaths: [library],
    games: JSON.parse(read(head, 'apps/shell-web/src/standalone-games.json')),
    packages: await workspacePackages(root),
    readSource: (file) =>
      file === library
        ? afterLibrary
        : readFileSync(new URL('../' + file, import.meta.url), 'utf8'),
    fileScopes: scopes,
  };
  assert.deepEqual(nineNativeDependencyPlan(nativeContext).targets, []);
  for (const override of [
    { fileScopes: new Map([[library, [...scopes.get(library)]]]) },
    {
      readSource: (file) =>
        nativeContext.readSource(file) + (file === library ? '\nexport const changed = true;' : ''),
    },
  ])
    assert(
      nineNativeDependencyPlan({ ...nativeContext, ...override }).targets.some(
        (target) => target.requiresCreator,
      ),
    );
  assert.equal(localRetirementFileScopes({ ...context, headHasPath: () => undefined }).size, 0);
  assert.equal(
    localRetirementFileScopes({ ...context, readHead: (file) => read(head, file) + 'drift' }).size,
    0,
  );
  assert(!scopes.has('unreviewed-file.mjs'));
});
