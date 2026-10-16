import assert from 'node:assert/strict';

export const matrixGames = ['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'];
export const productionCompetitionApi = 'https://api.nenggongzhiren.cn/api/competition/v1';
export function packageModes(values, env = {}) {
  assert(!(values['with-ads'] && values['without-ads']), 'Choose an advertising mode');
  assert(!(values['with-service'] && values['without-service']), 'Choose a service mode');
  const axis = (withKey, withoutKey, variable) =>
    values[withKey]
      ? [true]
      : values[withoutKey]
        ? [false]
        : values.matrix
          ? [false, true]
          : [env[variable] === '1'];
  return axis('with-service', 'without-service', 'COMPETITION_SERVICE_ENABLED').flatMap((service) =>
    axis('with-ads', 'without-ads', 'H5_ADS_ENABLED').map((ads) => [ads, service]),
  );
}

/** Acceptance has two exact scopes, never a partially filtered successful matrix. */
export function matrixContract(matrix, { production = false } = {}) {
  const api = production ? productionCompetitionApi : 'http://127.0.0.1:43802/api/competition/v1';
  const origin = production ? 'http://localhost:8080' : 'http://127.0.0.1:43810';
  const expected = matrixGames.flatMap((game) =>
    (production ? [true] : [false, true]).flatMap((service) =>
      [false, true].map(
        (ads) => `${game}-ads-${ads ? 'on' : 'off'}-service-${service ? 'on' : 'off'}`,
      ),
    ),
  );
  assert(Array.isArray(matrix.variants), 'Missing package matrix');
  assert.deepEqual(
    matrix.variants.map((v) => v.name).sort(),
    expected.sort(),
    'Incomplete or duplicate H5 matrix',
  );
  for (const v of matrix.variants) {
    assert(matrixGames.includes(v.game));
    assert.equal(typeof v.adsEnabled, 'boolean');
    assert.equal(typeof v.serviceEnabled, 'boolean');
    assert.equal(
      v.name,
      `${v.game}-ads-${v.adsEnabled ? 'on' : 'off'}-service-${v.serviceEnabled ? 'on' : 'off'}`,
    );
    assert.equal(v.packageType, 'h5');
    assert.equal(v.sourceSHA, matrix.sourceSHA);
    assert.equal(v.submoduleSHA, matrix.submoduleSHA);
    assert.equal(v.apiUrl, v.serviceEnabled ? api : '');
    assert.equal(
      v.localValidation,
      !production,
      'Local-validation packages cannot be formal deliverables',
    );
  }
  return { api, origin, port: production ? 8080 : 43810 };
}
