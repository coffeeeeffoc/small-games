import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  localRetirementScopesForReview,
  hasLocalRetirementDeletionProof,
  isReviewedLocalRetirementDeletion,
} from './local-game-retirement-scope.mjs';
const hash = (value) => createHash('sha256').update(value).digest('hex');
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
