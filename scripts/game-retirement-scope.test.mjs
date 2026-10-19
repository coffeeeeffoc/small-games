import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  matchesRetirementFile,
  retirementScopesForReview,
  retirementHeadQueryPaths,
  retirementFileScopes,
  isReviewedRetirementDeletion,
} from './game-retirement-scope.mjs';

const hash = (text) => createHash('sha256').update(text).digest('hex');
const retired = 'games/minigames/shared/runtime.js';
const edited = 'apps/shell-web/src/standalone-games.json';
const h5 = [
  { id: 'cops-robbers', source: 'games/local/cops-robbers' },
  { id: 'cops-robbers-realtime', source: 'games/local/cops-robbers-realtime' },
  { id: 'xiangqi-five', source: 'games/submodules/xiangqi-five' },
];
const head = {
  [edited]: JSON.stringify(h5),
  'apps/shell-web/src/game-meta.json': JSON.stringify({ games: {} }),
  'apps/shell-web/package.json': JSON.stringify({ dependencies: {} }),
  '.gitmodules': '',
  'pnpm-lock.yaml': 'importers: {}\n',
};
const before = {
  [retired]: `100644 blob ${'b'.repeat(40)}\t${retired}\n`,
  [edited]: 'old registry\n',
};
const reviews = {
  [retired]: { before: hash(before[retired]), after: null },
  [edited]: { before: hash(before[edited]), after: hash(head[edited]) },
};
const context = {
  changedPaths: [retired, edited],
  readBase: (file) => before[file],
  readBaseEntry: (file) => before[file],
  readHead: (file) => head[file],
  headHasPath: (file) => Object.hasOwn(head, file),
};

test('retirement requires every exact reviewed edit and deletion plus retained H5 identities', () => {
  assert.deepEqual(
    [...retirementScopesForReview(context, reviews)],
    [
      [retired, h5.map((game) => game.source)],
      [edited, h5.map((game) => game.source)],
    ],
  );
  for (const override of [
    { readBase: (file) => before[file] + 'extra' },
    { readHead: (file) => (file === edited ? head[file] + ' ' : head[file]) },
    { headHasPath: () => true },
    { headHasPath: () => undefined },
    {
      headHasPath() {
        throw Error('tree unavailable');
      },
    },
    {
      readBase() {
        throw Error('base unavailable');
      },
    },
  ])
    assert.equal(retirementScopesForReview({ ...context, ...override }, reviews).size, 0);
  for (const [file, bytes] of [
    [edited, JSON.stringify([...h5, h5[0]])],
    [edited, JSON.stringify(h5.slice(1))],
    [
      edited,
      JSON.stringify([
        ...h5,
        { id: 'office-slacking', source: 'games/submodules/office-slacking' },
      ]),
    ],
    ['apps/shell-web/src/game-meta.json', JSON.stringify({ games: { 'office-slacking': {} } })],
    [
      'apps/shell-web/package.json',
      JSON.stringify({ dependencies: { '@coffeeeeffoc/office-slacking': 'workspace:*' } }),
    ],
    ['.gitmodules', 'path = games/submodules/office-slacking'],
    ['pnpm-lock.yaml', 'games/submodules/office-slacking: {}'],
  ]) {
    const readHead = (name) => (name === file ? bytes : head[name]);
    const changedReview =
      file === edited
        ? { ...reviews, [edited]: { ...reviews[edited], after: hash(bytes) } }
        : reviews;
    assert.equal(retirementScopesForReview({ ...context, readHead }, changedReview).size, 0, file);
  }
});

test('unknown paths and copied proofs cannot authorize retirement or a rename', () => {
  assert.equal(retirementFileScopes({ changedPaths: ['scripts/unknown.mjs'] }).size, 0);
  assert.equal(
    isReviewedRetirementDeletion(
      { status: 'R100', paths: [retired, 'moved.js'] },
      new Map([[retired, []]]),
    ),
    false,
  );
  assert.equal(
    isReviewedRetirementDeletion(
      { status: 'D', paths: ['unknown.js'] },
      new Map([['unknown.js', []]]),
    ),
    false,
  );
  assert.equal(
    matchesRetirementFile(retired, reviews[retired], { ...context, headHasPath: () => undefined }),
    false,
  );
  assert.equal(
    matchesRetirementFile(edited, reviews[edited], { ...context, headHasPath: () => false }),
    false,
  );
  assert.equal(
    retirementScopesForReview({ ...context, changedPaths: ['unknown.js'] }, reviews).size,
    0,
  );
  assert.equal(
    retirementScopesForReview(context, {
      ...reviews,
      [retired]: { ...reviews[retired], sources: ['games/local/unreviewed'] },
    }).size,
    0,
  );
  assert(retirementHeadQueryPaths([]).includes('games/minigames'));
  assert(retirementHeadQueryPaths([]).includes('games/submodules/office-slacking'));
});

test('retired gitlinks bind the exact mode, commit and path without reading unavailable child objects', () => {
  const file = 'games/submodules/office-slacking';
  const record = `160000 commit ${'a'.repeat(40)}\t${file}\n`;
  const review = { before: hash(record), after: null };
  const fixture = {
    readBase() {
      throw Error('submodule object is unavailable');
    },
    readBaseEntry: () => record,
    headHasPath: () => false,
  };
  assert.equal(matchesRetirementFile(file, review, fixture), true);
  assert.equal(matchesRetirementFile(file, review, { ...fixture, readBaseEntry: () => '' }), false);
  assert.equal(
    matchesRetirementFile(file, review, {
      ...fixture,
      readBaseEntry: () => record.replace('160000', '100644'),
    }),
    false,
  );
  assert.equal(
    matchesRetirementFile(file, review, {
      ...fixture,
      readBaseEntry() {
        throw Error('tree unavailable');
      },
    }),
    false,
  );
});
