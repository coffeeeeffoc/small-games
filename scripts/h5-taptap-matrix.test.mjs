import assert from 'node:assert/strict';
import test from 'node:test';
import {
  reachableStreetNodes,
  streetTouchPlans,
  isBlockedStreetTouch,
  isExpectedTouchRequest,
  touchAttemptFinished,
  completeTouchResponse,
  prepareTouchCanvas,
  streetActorTouchPoint,
  touchHitPoints,
} from './h5-taptap-touch.mjs';
import { createRenderer as streetRenderer } from '../games/local/cops-robbers-realtime/src/competition-renderer.js';
import { getLevels } from '../games/local/cops-robbers-realtime/src/levels.js';
import {
  matrixContract,
  matrixGames,
  h5Orientations,
  packageModes,
  productionCompetitionApi,
  acceptanceSelection,
  assertCandidateSource,
  browserEntryContract,
} from './h5-taptap-matrix.mjs';

test('only a matching planned runner movement may enter the verified blocked-route recovery path', () => {
  const request = { seq: 3, action: { type: 'move', actor: 0, x: 80, y: 520 } };
  const fixture = {
    game: 'cops-robbers-realtime',
    code: 'ABCDEF012345',
    path: '/small-games/v1/rooms/ABCDEF012345/actions',
    status: 422,
    body: { error: 'ILLEGAL_ACTION' },
    input: structuredClone(request),
    expected: { role: 'runner', request },
  };
  assert.equal(isBlockedStreetTouch(fixture), true);
  assert.equal(
    isBlockedStreetTouch({
      ...fixture,
      path: fixture.path.replace('/small-games/v1', '/api/competition/v1'),
    }),
    true,
  );
  for (const change of [
    { game: 'cops-robbers' },
    { code: undefined, path: '/me' },
    { code: 'AAAAAAAAAAAA' },
    { status: 403 },
    { status: 409 },
    { body: { error: 'VALIDATION_ERROR' } },
    { path: '/small-games/v1/me' },
    { expected: { ...fixture.expected, role: 'pursuer' } },
    { expected: null },
    { input: undefined, expected: { role: 'runner' } },
    {
      input: { ...request, action: { type: 'hold', actor: 0 } },
      expected: { role: 'runner', request: { ...request, action: { type: 'hold', actor: 0 } } },
    },
    { input: { ...request, seq: 2 } },
    { input: { ...request, action: { ...request.action, score: 3 } } },
  ])
    assert.equal(Boolean(isBlockedStreetTouch({ ...fixture, ...change })), false);
});

test('canvas preparation only tolerates a hidden canvas after authoritative settlement', async () => {
  const timeout = Object.assign(new Error('fixture hidden canvas'), { name: 'TimeoutError' });
  let finished = false;
  const canvas = {
    async scrollIntoViewIfNeeded(options) {
      assert.equal(options.timeout, 2000);
      finished = true;
      throw timeout;
    },
    async isVisible() {
      return false;
    },
  };
  assert.equal(await prepareTouchCanvas(canvas, () => finished), false);
  await assert.rejects(
    prepareTouchCanvas(canvas, () => false),
    (error) => error === timeout,
  );
  await assert.rejects(
    prepareTouchCanvas(
      {
        ...canvas,
        async isVisible() {
          return true;
        },
      },
      () => true,
    ),
    (error) => error === timeout,
  );
  const unrelated = new Error('fixture unrelated error');
  await assert.rejects(
    prepareTouchCanvas(
      {
        ...canvas,
        async scrollIntoViewIfNeeded() {
          throw unrelated;
        },
      },
      () => true,
    ),
    (error) => error === unrelated,
  );
  assert.equal(await prepareTouchCanvas({ async scrollIntoViewIfNeeded() {} }, () => false), true);
  assert.equal(await prepareTouchCanvas({ async scrollIntoViewIfNeeded() {} }, () => true), false);
});

test('finished polling cannot bypass a sent touch with delayed response headers or body', async () => {
  const expected = {
    role: 'runner',
    code: 'ABCDEF012345',
    request: { seq: 3, action: { type: 'move', actor: 0, x: 80, y: 520 } },
    sent: false,
    completed: false,
  };
  const request = {};
  const requests = new WeakMap();
  const fixture = {
    code: expected.code,
    path: `/small-games/v1/rooms/${expected.code}/actions`,
    method: 'POST',
    input: structuredClone(expected.request),
    expected,
  };
  assert.equal(isExpectedTouchRequest({ ...fixture, method: 'GET' }), false);
  assert.equal(isExpectedTouchRequest(fixture), true);
  expected.sent = true;
  requests.set(request, expected);
  assert.equal(touchAttemptFinished(expected, true), false, 'Response headers have not arrived');
  let readBody;
  const body = new Promise((resolve) => (readBody = resolve));
  let verifyRecovery;
  const recovery = new Promise((resolve) => (verifyRecovery = resolve));
  const bound = requests.get(request);
  let checked = false;
  const task = completeTouchResponse(bound, async () => {
    const value = await body;
    assert.equal(
      isBlockedStreetTouch({
        ...fixture,
        expected: bound,
        game: 'cops-robbers-realtime',
        status: 422,
        body: value,
      }),
      true,
    );
    await recovery;
    checked = true;
  });
  assert.equal(touchAttemptFinished(expected, true), false, 'Response body is still pending');
  readBody({ error: 'ILLEGAL_ACTION' });
  await Promise.resolve();
  assert.equal(touchAttemptFinished(expected, true), false, 'Recovery checks are still pending');
  verifyRecovery();
  await task;
  assert.equal(checked, true);
  assert.equal(touchAttemptFinished(expected, true), true);
  assert.equal(touchAttemptFinished({ sent: false }, true), true, 'Idle UI sent no action');
  const failed = { sent: true };
  await assert.rejects(
    completeTouchResponse(failed, async () => {
      throw new Error('fixture');
    }),
  );
  assert.equal(failed.completed, true, 'Failed processing also resolves the lifecycle');
  assert.equal(failed.error, true, 'Failure is recorded before the attempt completes');
});

test('street touch planning excludes routes blocked by opponents in real public snapshots', () => {
  for (const fixture of [
    { levelId: 26, cop: { x: 752, y: 352.3333333333361 }, robber: { x: 920, y: 80 } },
    { levelId: 33, cop: { x: 492.4499999999957, y: 80 }, robber: { x: 920, y: 520 } },
  ]) {
    const level = getLevels('classic').find((item) => item.id === fixture.levelId);
    const state = {
      levelId: fixture.levelId,
      mode: 'classic',
      role: 'runner',
      map: { nodes: level.nodes, edges: level.edges },
      cops: [
        { id: 0, ...fixture.cop },
        { id: 1, x: 248, y: 80 },
        { id: 2, x: 416, y: 80 },
      ],
      robbers: [{ id: 0, ...fixture.robber, caught: false, escaped: false }],
    };
    const before = structuredClone(state);
    const reachable = reachableStreetNodes(state, 0);
    const blocked = state.map.nodes.findIndex((node) => node.x === 80 && node.y === 520);
    assert(blocked >= 0);
    assert.equal(reachable.has(blocked), false);
    assert(reachable.size > 0 && reachable.size < state.map.nodes.length);
    assert.deepEqual(state, before, 'Planning cannot mutate authoritative state');
    assert.equal(reachableStreetNodes({ ...state, role: 'pursuer' }, 0).has(blocked), true);
  }
});

test('street planning uses other stationary actors and re-evaluates changed blocked routes', () => {
  const level = getLevels('classic').find((item) => item.id === 26);
  const state = {
    levelId: level.id,
    mode: 'classic',
    role: 'pursuer',
    map: { nodes: level.nodes, edges: level.edges },
    cops: [
      { id: 0, x: 80, y: 80, moving: true },
      { id: 1, x: 248, y: 80, moving: false },
      { id: 2, x: 416, y: 80, moving: false },
    ],
    robbers: [{ id: 0, x: 920, y: 80, caught: false, escaped: false }],
  };
  const plans = streetTouchPlans(state);
  assert(plans.some((plan) => plan.actor === 1));
  assert(plans.some((plan) => plan.actor === 2));
  assert(plans.every((plan) => plan.actor !== 0));
  const near = level.nodes.findIndex((node) => node.x === 80 && node.y === 80);
  assert(
    plans.some((plan) => plan.actor === 1 && plan.node === near),
    'Nearby roads remain candidates; renderer hit testing decides visibility',
  );
  state.role = 'runner';
  const before = streetTouchPlans(state);
  state.cops[0] = { id: 0, x: 752, y: 352.3333333333361 };
  const after = streetTouchPlans(state);
  const blocked = level.nodes.findIndex((node) => node.x === 80 && node.y === 520);
  assert(before.some((plan) => plan.node === blocked));
  assert(after.every((plan) => plan.node !== blocked));
  state.robbers[0].caught = true;
  assert.deepEqual(streetTouchPlans(state), []);
});

test('Street actor touches use a visible selection point when hit boxes overlap', () => {
  const level = getLevels('classic').find((item) => item.id === 26);
  const state = {
    role: 'pursuer',
    name: 'fixture',
    elapsedMs: 0,
    caught: 0,
    total: 1,
    map: { nodes: level.nodes, edges: level.edges },
    exits: [],
    cops: [
      { id: 0, x: 100, y: 80 },
      { id: 1, x: 140, y: 80 },
    ],
    robbers: [],
    openingRemainingMs: 0,
  };
  const context = new Proxy(
    {
      measureText: () => ({ width: 0 }),
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
    },
    { get: (object, key) => (key in object ? object[key] : () => {}) },
  );
  for (const position of [
    { x: 140, y: 80 },
    { x: 110, y: 80 },
    { x: 100, y: 90 },
  ]) {
    Object.assign(state.cops[1], position);
    const renderer = streetRenderer();
    const hit = renderer.draw(context, 390, 844, state).find((item) => item.action?.local === 0);
    renderer.tap(hit.x + hit.w / 2, hit.y + hit.h / 2, state);
    assert.equal(
      renderer.getSelected(),
      1,
      'The old center-only choice selects the overlapping actor',
    );
    const point = streetActorTouchPoint(streetRenderer, context, 390, 844, state, 0);
    assert(point, 'A narrow visible strip still selects the intended actor');
    const actual = streetRenderer();
    actual.draw(context, 390, 844, state);
    assert.equal(actual.tap(...point, state), null);
    assert.equal(actual.getSelected(), 0);
  }
  Object.assign(state.cops[1], { x: 100, y: 80 });
  assert.equal(streetActorTouchPoint(streetRenderer, context, 390, 844, state, 0), null);
  assert(streetActorTouchPoint(streetRenderer, context, 390, 844, state, 1));
});

test('Street road touches find a visible strip beneath a higher-priority actor hit', () => {
  const level = getLevels('classic').find((item) => item.id === 26),
    target = level.nodes[0];
  const state = {
    role: 'pursuer',
    name: 'fixture',
    elapsedMs: 0,
    caught: 0,
    total: 1,
    map: { nodes: level.nodes, edges: level.edges },
    exits: [],
    cops: [
      { id: 0, ...target },
      { id: 1, x: 920, y: 520 },
    ],
    robbers: [],
    openingRemainingMs: 0,
  };
  const context = new Proxy(
    {
      measureText: () => ({ width: 0 }),
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
    },
    { get: (object, key) => (key in object ? object[key] : () => {}) },
  );
  const selection = streetActorTouchPoint(streetRenderer, context, 390, 844, state, 1);
  assert(selection);
  const renderer = streetRenderer();
  renderer.draw(context, 390, 844, state);
  renderer.tap(...selection, state);
  const hits = renderer.draw(context, 390, 844, state);
  const hit = hits.find(
    (item) =>
      item.action?.type === 'move' && item.action.x === target.x && item.action.y === target.y,
  );
  const tap = (point) => {
    const probe = streetRenderer();
    probe.draw(context, 390, 844, state);
    probe.tap(...selection, state);
    probe.draw(context, 390, 844, state);
    return probe.tap(...point, state);
  };
  const oldPoints = [
    [0.5, 0.5],
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
  ].map(([x, y]) => [hit.x + hit.w * x, hit.y + hit.h * y]);
  assert(
    oldPoints.every((point) => tap(point)?.type !== 'move'),
    'The old five points are all occluded',
  );
  const actual = touchHitPoints(hit, hits, 390, 844)
    .map(tap)
    .find((action) => action?.type === 'move');
  assert.deepEqual(actual, { type: 'move', actor: 1, x: target.x, y: target.y });
  const unrelated = { x: -10000, y: -10000, w: 1, h: 1, action: { local: 99 } };
  assert.deepEqual(
    touchHitPoints(hit, hits, 390, 844),
    touchHitPoints(hit, [...hits, unrelated], 390, 844),
  );
});

test('explicit axes constrain matrix output and ordinary builds retain environment defaults', () => {
  assert.deepEqual(packageModes({ matrix: true }), [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ]);
  assert.deepEqual(packageModes({ matrix: true, 'with-service': true }), [
    [false, true],
    [true, true],
  ]);
  assert.deepEqual(packageModes({ matrix: true, 'without-ads': true }), [
    [false, false],
    [false, true],
  ]);
  assert.deepEqual(packageModes({}, { H5_ADS_ENABLED: '1', COMPETITION_SERVICE_ENABLED: '1' }), [
    [true, true],
  ]);
  assert.deepEqual(
    packageModes(
      { 'without-service': true, 'without-ads': true },
      { H5_ADS_ENABLED: '1', COMPETITION_SERVICE_ENABLED: '1' },
    ),
    [[false, false]],
  );
  assert.throws(() => packageModes({ 'with-ads': true, 'without-ads': true }));
  assert.throws(() => packageModes({ 'with-service': true, 'without-service': true }));
});
function fixture(production) {
  const sourceSHA = 'a'.repeat(40),
    submoduleSHA = 'b'.repeat(40);
  return {
    profile: production ? 'online-ads' : 'qa-matrix',
    sourceDirty: false,
    sourceSHA,
    submoduleSHA,
    variants: matrixGames.flatMap((game) =>
      acceptanceSelection({
        profile: production ? 'online-ads' : 'qa-matrix',
        local: !production,
      }).modes.map(([ads, service]) => ({
        profile: production ? 'online-ads' : 'qa-matrix',
        sourceDirty: false,
        identityMode: 'ephemeral',
        name: `${game}-ads-${ads ? 'on' : 'off'}-service-${service ? 'on' : 'off'}`,
        game,
        packageType: 'h5',
        orientation: h5Orientations[game],
        orientationVerified: false,
        adsEnabled: ads,
        effectiveAdsEnabled: false,
        adUnitConfigured: false,
        adMode: 'off',
        serviceEnabled: service,
        sourceSHA,
        submoduleSHA,
        apiUrl: service
          ? production
            ? productionCompetitionApi
            : 'http://127.0.0.1:43802/api/competition/v1'
          : '',
        localValidation: !production,
      })),
    ),
  };
}
test('explicit profiles require twelve local QA variants and only three online-ads deliverables', () => {
  assert.deepEqual(h5Orientations, {
    'cops-robbers': 'portrait',
    'cops-robbers-realtime': 'preserve',
    'xiangqi-five': 'portrait',
  });
  assert.equal(productionCompetitionApi, 'https://api.nenggongzhiren.cn/small-games/v1');
  assert.equal(matrixContract(fixture(false)).port, 43810);
  assert.deepEqual(matrixContract(fixture(true), { production: true }), {
    api: productionCompetitionApi,
    origin: 'http://localhost:8080',
    port: 8080,
  });
  assert.equal(fixture(false).variants.length, 12);
  assert.equal(fixture(true).variants.length, 3);
  const configured = fixture(true);
  for (const variant of configured.variants) {
    variant.adUnitConfigured = true;
    variant.effectiveAdsEnabled = true;
    variant.adMode = 'host';
  }
  assert.equal(matrixContract(configured, { production: true }).api, productionCompetitionApi);
  assert.throws(() => matrixContract(fixture(false), { production: true }));
  assert.throws(() => matrixContract(fixture(true)));
  for (const mutate of [
    (m) => m.variants.pop(),
    (m) => m.variants.push(m.variants[0]),
    (m) => (m.variants[0].localValidation = true),
    (m) => (m.variants[0].apiUrl = 'http://localhost:43802/api/competition/v1'),
    (m) => (m.variants[0].adsEnabled = 'false'),
    (m) => (m.variants[0].effectiveAdsEnabled = true),
    (m) => (m.variants[0].adMode = 'host'),
    (m) => (m.variants[0].adUnitConfigured = true),
    (m) => (m.variants[0].orientation = 'landscape'),
    (m) => (m.variants[0].orientationVerified = true),
    (m) => (m.variants[0].submoduleSHA = 'c'.repeat(40)),
    (m) => (m.variants[0].serviceEnabled = false),
    (m) => delete m.profile,
    (m) => (m.sourceDirty = true),
    (m) => (m.variants[0].sourceDirty = true),
    (m) => (m.variants[0].identityMode = 'persistent'),
    (m) => (m.variants[0].profile = 'qa-matrix'),
  ]) {
    const m = fixture(true);
    mutate(m);
    assert.throws(() => matrixContract(m, { production: true }));
  }
  for (const mutate of [
    (m) => m.variants.pop(),
    (m) => m.variants.push(m.variants[0]),
    (m) => (m.variants[0].localValidation = false),
    (m) => (m.variants[0].apiUrl = productionCompetitionApi),
    (m) => (m.variants[0].sourceSHA = 'c'.repeat(40)),
    (m) => {
      m.variants[0] = m.variants[1];
    },
  ]) {
    const m = fixture(false);
    mutate(m);
    assert.throws(() => matrixContract(m));
  }
  for (const count of [6, 12]) {
    const m = fixture(true);
    m.variants = Array.from({ length: count }, (_, index) => m.variants[index % 3]);
    assert.throws(() => matrixContract(m, { production: true }));
  }
});

test('guest pacing honors the real server window without lowering its limit', async () => {
  const { guestScheduler } = await import('./h5-taptap-touch.mjs');
  let now = 1000,
    waited = 0;
  const schedule = guestScheduler(Array(18).fill(now), {
    now: () => now,
    pause: async (ms) => {
      assert(ms <= 1000);
      now += ms;
      waited += ms;
    },
  });
  await Promise.all([schedule(), schedule()]);
  assert(waited >= 60000);
  assert(waited <= 61000);
});
test('both browser entrypoints must retain the clean exact main and submodule candidate', () => {
  const matrix = fixture(false),
    proof = { head: matrix.sourceSHA, submodule: matrix.submoduleSHA, dirty: '' };
  assertCandidateSource(matrix, proof);
  for (const change of [
    { dirty: ' M scripts/h5-taptap-touch.mjs' },
    { dirty: ' m games/submodules/xiangqi-five' },
    { head: 'c'.repeat(40) },
    { submodule: 'd'.repeat(40) },
  ])
    assert.throws(() => assertCandidateSource(matrix, { ...proof, ...change }));
});
test('local browser cannot touch a fixed Runtime without its fresh-owned IPC wrapper', () => {
  const owned = {
    runId: '12345678-1234-1234-1234-123456789012',
    api: 'http://127.0.0.1:43802/api/competition/v1',
    origin: 'http://127.0.0.1:43810',
  };
  browserEntryContract({ production: false, localRestart: true, owned, ipc: true });
  browserEntryContract({ production: true, localRestart: false });
  for (const change of [
    { localRestart: false },
    { ipc: false },
    { owned: null },
    { production: true },
  ])
    assert.throws(() =>
      browserEntryContract({ production: false, localRestart: true, owned, ipc: true, ...change }),
    );
});
test('normal Street solo planning is read-only and uses existing first-level guard/hunter targets', async () => {
  const { soloStreetPlan } = await import('./h5-taptap-touch.mjs');
  const level = getLevels('challenge')[0],
    state = {
      mode: 'challenge',
      level: 1,
      role: 'cop',
      cops: level.cops.map((node, id) => ({ ...level.nodes[node], id })),
      robbers: level.robbers.map((node, id) => ({ ...level.nodes[node], id, caught: false })),
    };
  const before = structuredClone(state),
    plan = soloStreetPlan(state);
  assert.equal(plan.guards.length, level.solution.length);
  assert.equal(plan.pursuit.actor, level.hunter);
  assert.deepEqual(state, before);
  assert.throws(() => soloStreetPlan({ ...state, level: 0 }));
});
