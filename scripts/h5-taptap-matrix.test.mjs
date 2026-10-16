import assert from 'node:assert/strict';
import test from 'node:test';
import {
  matrixContract,
  matrixGames,
  packageModes,
  productionCompetitionApi,
} from './h5-taptap-matrix.mjs';

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
    sourceSHA,
    submoduleSHA,
    variants: matrixGames.flatMap((game) =>
      packageModes({ matrix: true, ...(production ? { 'with-service': true } : {}) }).map(
        ([ads, service]) => ({
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
        }),
      ),
    ),
  };
}
test('local acceptance requires exactly twelve variants; formal acceptance requires exact six HTTPS service variants', () => {
  assert.equal(matrixContract(fixture(false)).port, 43810);
  assert.deepEqual(matrixContract(fixture(true), { production: true }), {
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
});
