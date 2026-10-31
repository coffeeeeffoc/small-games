import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  isReviewedNightRetirement,
  nightRetirementHeadQueryPaths,
} from './night-retirement-scope.mjs';
import { incrementalPlan } from './incremental-validation.mjs';
import { main } from './pages-test-scope.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = 'baaae8d717559610df529aff43a0cb2a31961393';
const head = '0f95d5ab192213c146600b8af77e3ea5d2a1db7a';
const source = 'games/local/night-overwatch';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const tree = (ref) =>
  new Map(
    git('ls-tree', '-r', '-t', ref, '--', source)
      .trimEnd()
      .split('\n')
      .map((entry) => [entry.split('\t')[1], entry + '\n']),
  );
const before = tree(base),
  after = tree(head);
const queries = new Set(nightRetirementHeadQueryPaths());
const changes = git(
  'diff',
  '--no-ext-diff',
  '--name-status',
  '--find-renames',
  '--diff-filter=DR',
  base,
  head,
  '--',
  source,
)
  .trimEnd()
  .split('\n')
  .map((line) => {
    const [status, ...paths] = line.split('\t');
    return { status, paths };
  })
  .filter((change) => queries.has(change.paths[0]));
const context = {
  baseCommit: base,
  standaloneGames: [{ id: 'night-overwatch', source }],
  gameSources: [source],
  readBaseEntry: (file) => before.get(file) ?? '',
  readHeadEntry: (file) => after.get(file) ?? '',
  headHasPath: (file) => after.has(file),
};
const accepts = (change, overrides = {}) =>
  isReviewedNightRetirement({ ...context, change, ...overrides });

test('exact published baseline proves 19 Night deletions and 7 Git-inferred renames', () => {
  assert.equal(changes.length, 26);
  assert.equal(changes.filter((change) => change.status === 'D').length, 19);
  assert.equal(changes.filter((change) => change.status.startsWith('R')).length, 7);
  assert.equal(queries.size, 33);
  for (const change of changes) {
    assert(accepts(change), change.paths[0]);
    for (const file of change.paths) assert(queries.has(file), file);
  }
});

test('old bytes, mode, path and baseline must match; copied scope arrays confer no proof', () => {
  for (const change of changes) {
    const from = change.paths[0];
    for (const alter of [
      (entry) => entry.replace(/blob [a-f\d]{40}/, 'blob ' + '0'.repeat(40)),
      (entry) => entry.replace('100644', '100755'),
      (entry) => entry.replace(from, from + '.other'),
      () => '',
    ]) {
      assert.equal(
        accepts(change, {
          readBaseEntry: (file) =>
            file === from ? alter(context.readBaseEntry(file)) : context.readBaseEntry(file),
          fileScopes: new Map([[from, [source]]]),
          reviews: { [from]: { status: change.status, before: context.readBaseEntry(from) } },
        }),
        false,
        from,
      );
    }
    assert.equal(accepts(change, { baseCommit: head }), false, from);
  }
});

test('source resurrection, uncertain presence and any tree-read failure fail closed', () => {
  for (const change of changes) {
    const from = change.paths[0];
    for (const overrides of [
      { headHasPath: (file) => file === from || context.headHasPath(file) },
      { headHasPath: () => undefined },
      {
        readHeadEntry: (file) =>
          file === from ? context.readBaseEntry(file) : context.readHeadEntry(file),
      },
      ...['readBaseEntry', 'readHeadEntry', 'headHasPath'].map((key) => ({
        [key]: () => {
          throw new Error('tree unavailable');
        },
      })),
    ])
      assert.equal(accepts(change, overrides), false, from);
  }
});

test('rename status and destination cannot drift, disappear or pre-exist in the base', () => {
  for (const change of changes.filter((entry) => entry.status.startsWith('R'))) {
    const [from, to] = change.paths;
    for (const overrides of [
      { change: { ...change, status: 'R099' } },
      { change: { ...change, status: 'D', paths: [from] } },
      { change: { ...change, paths: [from, to + '.other'] } },
      {
        readBaseEntry: (file) =>
          file === to ? context.readHeadEntry(file) : context.readBaseEntry(file),
      },
      { headHasPath: (file) => file !== to && context.headHasPath(file) },
      { readHeadEntry: (file) => (file === to ? '' : context.readHeadEntry(file)) },
      { readHeadEntry: (file) => context.readHeadEntry(file).replace('100644', '100755') },
      {
        readHeadEntry: (file) =>
          context.readHeadEntry(file).replace(/blob [a-f\d]{40}/, 'blob ' + '0'.repeat(40)),
      },
      { readHeadEntry: (file) => context.readHeadEntry(file).replace(to, to + '.other') },
    ])
      assert.equal(accepts(change, overrides), false, from);
  }
});

test('unknown paths, extra paths, other statuses and missing or ambiguous identities are rejected', () => {
  for (const change of [
    undefined,
    { status: 'D', paths: [source + '/assets/scripts/Unknown.ts'] },
    { status: 'D', paths: ['toString'] },
    ...changes.flatMap((entry) => [
      { ...entry, status: 'M' },
      { ...entry, paths: [...entry.paths, source + '/extra'] },
    ]),
  ])
    assert.equal(accepts(change), false);
  for (const change of changes) {
    for (const overrides of [
      { standaloneGames: [] },
      { standaloneGames: [...context.standaloneGames, ...context.standaloneGames] },
      { standaloneGames: [{ id: 'different-game', source }] },
      { standaloneGames: [{ id: 'night-overwatch', source: 'games/local/other' }] },
      { gameSources: [] },
      { gameSources: [source, source] },
    ])
      assert.equal(accepts(change, overrides), false, change.paths[0]);
  }
});

test('only the exact helper and test paths schedule validation-tool checks', () => {
  const plan = (changedPaths) =>
    incrementalPlan({
      changedPaths,
      packages: [],
      games: [],
      readSource: () => '',
    });
  for (const file of [
    'scripts/night-retirement-scope.mjs',
    'scripts/night-retirement-scope.test.mjs',
  ])
    assert.equal(plan([file]).validation_tools, true);
  for (const file of [
    'scripts/night-retirement-scope-extra.mjs',
    'scripts/night-retirement-scope.extra.mjs',
    'scripts/night-retirement-scope.test.extra.mjs',
  ])
    assert.throws(() => plan([file]), /scope undefined/);
});

test('the actual cumulative published interval retains Night, Runtime and shared consumers', async () => {
  const result = await main(
    {
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF_NAME: 'dev',
      PAGES_VALIDATED_BASE: base,
      PAGES_DIFF_HEAD: head,
      VALIDATION_RISK_PLAN: 'true',
    },
    root,
  );
  assert.equal(result.full, false);
  assert.equal(result.diff_base, base);
  assert.equal(result.diff_head, head);
  assert(result.game_sources.includes(source));
  assert(result.game_ids.includes('night-overwatch'));
  assert(result.browser_ids.includes('night-overwatch'));
  assert(result.service_rule_sources.includes('services/runtime-api'));
  assert(result.game_services_checks);
  assert(result.identity_checks);
  assert(result.deployment_bundle_checks);
  assert(result.night_local_checks);
});
