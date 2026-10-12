import assert from 'node:assert/strict';
import test from 'node:test';
import {
  flattenPages,
  retentionPlan,
  pruneActionsCache,
  readSnapshot,
  turboKey,
} from './prune-actions-cache.mjs';

const now = Date.parse('2026-10-12T10:00:00Z');
const sha = (id) => String(id).padStart(40, 'a');
const cache = (id, extra = {}) => ({
  id,
  key: `turbo-bounded-v1-Linux-${sha(id)}`,
  ref: 'refs/heads/dev',
  version: 'b'.repeat(64),
  size_in_bytes: 100,
  created_at: new Date(now - (20 - id) * 3600000).toISOString(),
  last_accessed_at: '2026-10-11T00:00:00Z',
  ...extra,
});
const snapshot = (caches, extra = {}) => ({
  caches,
  branches: { 'refs/heads/dev': sha(99), 'refs/heads/main': sha(99) },
  pulls: {},
  activeRuns: [],
  ...extra,
});

test('only exact existing Turbo namespaces and full SHA keys are managed', () => {
  for (const key of [
    'node-cache-Linux-x64-pnpm-hash',
    'cocos-creator-3.8.8-win-121518',
    `turbo-bounded-v2-Linux-${sha(1)}`,
    `turbo-bounded-v1-pages-Linux-unknown-${sha(1)}`,
    'turbo-bounded-v1-Linux-aabb',
    `turbo-bounded-v1-Linux-${sha(1)}-suffix`,
  ])
    assert.equal(turboKey(key), null);
  assert.equal(turboKey(`turbo-bounded-v1-pages-Linux-build-${sha(1)}`).category, 'pages-build');
});

test('retains newest two per branch/category/OS/version; one legacy logic rollback', () => {
  const caches = [1, 2, 3].map((id) => cache(id));
  caches.push(...[4, 5, 6].map((id) => cache(id, { ref: 'refs/heads/main' })));
  caches.push(
    ...[7, 8, 9].map((id) => cache(id, { key: `turbo-bounded-v1-pages-Linux-logic-${sha(id)}` })),
  );
  caches.push(
    cache(10, { version: 'c'.repeat(64) }),
    cache(11, { key: `turbo-bounded-v1-Windows-${sha(11)}` }),
    cache(12, { key: `turbo-bounded-v1-pages-Linux-build-${sha(12)}` }),
  );
  const result = retentionPlan(snapshot(caches), now);
  assert.deepEqual(
    result.remove.map((entry) => entry.id),
    [1, 4, 7, 8],
  );
  assert.equal(result.deleteBytes, 400);
  assert.equal(result.bytes, 1200);
});

test('current SHA, recent access, unknown ref/key, missing branch and any active run are protected', () => {
  const caches = [1, 2, 3, 4, 5].map((id) => cache(id));
  caches[0].last_accessed_at = new Date(now - 500).toISOString();
  const data = snapshot(caches, { branches: { 'refs/heads/dev': sha(2) } });
  assert.deepEqual(
    retentionPlan(data, now).remove.map((entry) => entry.id),
    [3],
  );
  for (const status of ['queued', 'waiting', 'in_progress', 'pending', 'requested'])
    assert.equal(retentionPlan({ ...data, activeRuns: [{ status }] }, now).remove.length, 0);
  for (const ref of ['refs/heads/feature', 'refs/tags/release', 'refs/heads/test'])
    assert.equal(
      retentionPlan(snapshot(caches.map((entry) => ({ ...entry, ref }))), now).remove.length,
      0,
    );
  assert.equal(
    retentionPlan(snapshot(caches.map((entry) => ({ ...entry, key: 'unrecognized' }))), now).remove
      .length,
    0,
  );
});

test('closed PR caches are removable only for managed Turbo keys', () => {
  const caches = [
    cache(1, { ref: 'refs/pull/42/merge' }),
    cache(2, { ref: 'refs/pull/43/merge' }),
    cache(3, { ref: 'refs/pull/44/merge' }),
    cache(4, { ref: 'refs/pull/42/merge', key: 'node-cache-pnpm' }),
  ];
  assert.deepEqual(
    retentionPlan(snapshot(caches, { pulls: { 42: 'closed', 43: 'open' } }), now).remove.map(
      (entry) => entry.id,
    ),
    [1],
  );
});

test('complete paginated inventories and empty data; drift, duplicates and malformed metadata fail closed', () => {
  assert.deepEqual(flattenPages([{ total_count: 0, actions_caches: [] }], 'actions_caches'), []);
  assert.equal(
    flattenPages(
      [
        { total_count: 2, actions_caches: [cache(1)] },
        { total_count: 2, actions_caches: [cache(2)] },
      ],
      'actions_caches',
    ).length,
    2,
  );
  for (const pages of [
    [],
    [{ total_count: 2, actions_caches: [cache(1)] }],
    [{ total_count: 2, actions_caches: [cache(1), cache(1)] }],
    [
      { total_count: 1, actions_caches: [cache(1)] },
      { total_count: 2, actions_caches: [cache(2)] },
    ],
  ])
    assert.throws(() => flattenPages(pages, 'actions_caches'));
  for (const extra of [
    { size_in_bytes: -1 },
    { created_at: 'invalid' },
    { id: '12' },
    { version: undefined },
  ])
    assert.throws(() => retentionPlan(snapshot([cache(1, extra)]), now));
  assert.equal(retentionPlan(snapshot([]), now).bytes, 0);
});

function mockApi({ mutate, failDelete = false } = {}) {
  let reads = 0;
  const state = { caches: [1, 2, 3, 4].map((id) => cache(id)), active: [], writes: [], pulls: {} };
  const api = (endpoint, options = {}) => {
    if (options.method === 'DELETE') {
      state.writes.push(endpoint);
      if (failDelete) throw new Error('ambiguous network failure');
      state.caches = state.caches.filter(
        (entry) => String(entry.id) !== endpoint.split('/').at(-1),
      );
      return null;
    }
    if (endpoint.includes('/actions/caches?')) {
      mutate?.(++reads, state);
      return [{ total_count: state.caches.length, actions_caches: structuredClone(state.caches) }];
    }
    if (endpoint.includes('/branches?')) return [[{ name: 'dev', commit: { sha: sha(99) } }]];
    if (endpoint.includes('/actions/runs?')) {
      assert.equal(endpoint, 'repos/o/r/actions/runs?per_page=100');
      const runs = state.active;
      return [{ total_count: runs.length, workflow_runs: runs }];
    }
    if (endpoint.includes('/pulls/')) {
      const number = Number(endpoint.split('/').at(-1));
      return { number, state: state.pulls[number] };
    }
    assert.fail(endpoint);
  };
  return { api, state };
}

test('default dry-run makes no writes; explicit apply deletes only individual planned IDs', () => {
  const { api, state } = mockApi();
  assert.equal(pruneActionsCache({ repo: 'o/r', api, now: () => now }).before.remove.length, 2);
  assert.deepEqual(state.writes, []);
  const result = pruneActionsCache({ repo: 'o/r', api, apply: true, now: () => now });
  assert.deepEqual(state.writes, ['repos/o/r/actions/caches/1', 'repos/o/r/actions/caches/2']);
  assert.equal(result.after.count, 2);
  assert.equal(result.deleted.length, 2);
});

test('fresh protection defers deletion when a run starts, an old cache is accessed or a PR reopens', () => {
  for (const change of ['run', 'access', 'pr']) {
    const { api, state } = mockApi({
      mutate: (reads, state) => {
        if (change === 'pr') {
          state.caches[0].ref = 'refs/pull/42/merge';
          state.pulls[42] = reads === 1 ? 'closed' : 'open';
        }
        if (reads < 2) return;
        if (change === 'run') state.active = [{ id: 99, status: 'queued' }];
        if (change === 'access')
          for (const entry of state.caches) entry.last_accessed_at = new Date(now).toISOString();
      },
    });
    const result = pruneActionsCache({ repo: 'o/r', api, apply: true, now: () => now });
    assert(result.deferred.includes(1));
    assert(!state.writes.includes('repos/o/r/actions/caches/1'));
  }
});

test('API errors stop apply; ambiguous deletion is never retried', () => {
  const { api, state } = mockApi({ failDelete: true });
  let report;
  assert.throws(
    () =>
      pruneActionsCache({
        repo: 'o/r',
        api,
        apply: true,
        now: () => now,
        report: (value) => {
          report = structuredClone(value);
        },
      }),
    /ambiguous/,
  );
  assert.equal(state.writes.length, 1);
  assert.equal(report.status, 'failed');
  assert.equal(report.after, null);
  assert.deepEqual(report.deleted, []);
  assert.throws(
    () =>
      readSnapshot('o/r', () => {
        throw new Error('403');
      }),
    /403/,
  );
  assert.throws(() => readSnapshot('../wrong/path', api));
});

test('only the trusted main maintenance run may exclude itself from active-run protection', () => {
  const { api, state } = mockApi();
  state.active = [
    {
      id: 99,
      status: 'in_progress',
      path: '.github/workflows/cache-maintenance.yml',
      head_branch: 'main',
      event: 'schedule',
    },
  ];
  assert.equal(readSnapshot('o/r', api, '99').activeRuns.length, 0);
  for (const extra of [
    { path: '.github/workflows/ci.yml' },
    { head_branch: 'dev' },
    { event: 'pull_request' },
  ]) {
    const original = { ...state.active[0] };
    Object.assign(state.active[0], extra);
    assert.equal(readSnapshot('o/r', api, '99').activeRuns.length, 1);
    state.active[0] = original;
  }
});

test('unfiltered run inventory protects transitions, future statuses and old waiting runs', () => {
  const { api, state } = mockApi();
  for (const status of ['waiting', 'in_progress', 'queued', 'future_state']) {
    state.active = [
      { id: 10, status },
      { id: 11, status: 'completed' },
    ];
    const current = readSnapshot('o/r', api);
    assert.deepEqual(
      current.activeRuns.map((run) => run.id),
      [10],
    );
    assert.equal(retentionPlan(current, now).remove.length, 0);
  }
  const pagedApi = (endpoint, options) =>
    endpoint.includes('/actions/runs?')
      ? [
          { total_count: 2, workflow_runs: [{ id: 11, status: 'completed' }] },
          { total_count: 2, workflow_runs: [{ id: 10, status: 'waiting' }] },
        ]
      : api(endpoint, options);
  assert.equal(readSnapshot('o/r', pagedApi).activeRuns.length, 1);
});
