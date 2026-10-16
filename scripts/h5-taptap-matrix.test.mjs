import assert from 'node:assert/strict';
import test from 'node:test';
import { reachableStreetNodes } from './h5-taptap-touch.mjs';
import { getLevels } from '../games/local/cops-robbers-realtime/src/levels.js';
import {
  matrixContract,
  matrixGames,
  packageModes,
  productionCompetitionApi,
} from './h5-taptap-matrix.mjs';

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
function fixture(production, allServices = false) {
  const sourceSHA = 'a'.repeat(40),
    submoduleSHA = 'b'.repeat(40);
  return {
    sourceSHA,
    submoduleSHA,
    variants: matrixGames.flatMap((game) =>
      packageModes({
        matrix: true,
        ...(production && !allServices ? { 'with-service': true } : {}),
      }).map(([ads, service]) => ({
        name: `${game}-ads-${ads ? 'on' : 'off'}-service-${service ? 'on' : 'off'}`,
        game,
        packageType: 'h5',
        adsEnabled: ads,
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
test('acceptance requires twelve local variants or complete six/twelve formal variants', () => {
  assert.equal(productionCompetitionApi, 'https://api.nenggongzhiren.cn/small-games/v1');
  assert.equal(matrixContract(fixture(false)).port, 43810);
  assert.deepEqual(matrixContract(fixture(true), { production: true }), {
    api: productionCompetitionApi,
    origin: 'http://localhost:8080',
    port: 8080,
  });
  assert.deepEqual(matrixContract(fixture(true, true), { production: true }), {
    api: productionCompetitionApi,
    origin: 'http://localhost:8080',
    port: 8080,
  });
  assert.throws(() => matrixContract(fixture(false), { production: true }));
  assert.throws(() => matrixContract(fixture(true)));
  for (const mutate of [
    (m) => m.variants.pop(),
    (m) => m.variants.push(m.variants[0]),
    (m) => (m.variants[0].localValidation = true),
    (m) => (m.variants[0].apiUrl = 'http://localhost:43802/api/competition/v1'),
    (m) => (m.variants[0].adsEnabled = 'false'),
    (m) => (m.variants[0].submoduleSHA = 'c'.repeat(40)),
    (m) => (m.variants[0].serviceEnabled = false),
  ]) {
    const m = fixture(true);
    mutate(m);
    assert.throws(() => matrixContract(m, { production: true }));
  }
  for (const mutate of [
    (m) => m.variants.pop(),
    (m) => m.variants.push(m.variants[0]),
    (m) => (m.variants[0].localValidation = true),
    (m) => (m.variants[0].apiUrl = productionCompetitionApi),
    (m) => (m.variants[0].sourceSHA = 'c'.repeat(40)),
    (m) => {
      m.variants[0] = m.variants[1];
    },
  ]) {
    const m = fixture(true, true);
    mutate(m);
    assert.throws(() => matrixContract(m, { production: true }));
  }
});
