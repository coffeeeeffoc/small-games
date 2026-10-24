import assert from 'node:assert/strict';

export const matrixGames = ['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'];
// H5 orientation belongs to app upload metadata, not native game.json.
export const h5Orientations = Object.freeze({
  'ashfall-front': 'landscape',
  'merge-front': 'landscape',
  tetracube: 'portrait',
  'three-choose-two': 'portrait',
  'bullet-garden': 'portrait',
  'tower-brake': 'portrait',
  'orbit-atelier': 'portrait',
  'tianxia-chalu': 'portrait',
  'ball-roguelite': 'portrait',
  'flick-arena': 'portrait',
  'chase-thief': 'portrait',
  'moss-garden': 'portrait',
  'cage-rescue': 'portrait',
  'cops-robbers': 'portrait',
  'cops-robbers-realtime': 'preserve',
  'xiangqi-five': 'portrait',
  'carding-car': 'landscape',
  'vibeJam-myself-history-guess': 'portrait',
  'wulong-city': 'landscape',
  'night-overwatch': 'landscape',
  'travel-bund': 'landscape',
  'letters-words2': 'portrait',
  'homebound-station': 'portrait',
});
export const productionCompetitionApi = 'https://api.nenggongzhiren.cn/small-games/v1';
export const localCompetitionApi = 'http://127.0.0.1:43802/api/competition/v1';
export const localH5Origin = 'http://127.0.0.1:43810';
export const acceptanceProfiles = Object.freeze(['qa-matrix', 'online-ads']);
export function assertCandidateSource(matrix, { head, submodule, dirty }) {
  assert.equal(dirty, '', 'Acceptance requires the whole tree and submodules clean');
  assert.equal(head, matrix.sourceSHA, 'Acceptance main SHA changed');
  assert.equal(submodule, matrix.submoduleSHA, 'Acceptance submodule SHA changed');
}
export function browserEntryContract({ production, localRestart, owned, ipc }) {
  assert(!(production && localRestart), 'Production acceptance cannot restart local resources');
  if (!production) {
    assert(localRestart && ipc && owned, 'Local acceptance requires the fresh-owned IPC wrapper');
    assert.match(owned.runId, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
    assert.equal(owned.api, localCompetitionApi);
    assert.equal(owned.origin, localH5Origin);
  }
}
/** Explicit acceptance scopes never inherit axes from process environment or array length. */
export function acceptanceSelection(values) {
  if (values.profile === undefined) return null;
  assert(acceptanceProfiles.includes(values.profile), 'Unknown H5 acceptance profile');
  assert(!values.game || values.game === 'all', 'Acceptance profiles require all three games');
  assert(
    !values.games ||
      JSON.stringify([...values.games].sort()) === JSON.stringify([...matrixGames].sort()),
    'Acceptance profiles require the exact three games',
  );
  assert(!values.modes, 'Acceptance profiles do not accept custom modes');
  const local = values.profile === 'qa-matrix';
  assert(
    Boolean(values.local) === local,
    'QA profiles require --local; online-ads forbids --local',
  );
  if (local) {
    assert(
      !['with-ads', 'without-ads', 'with-service', 'without-service'].some((key) => values[key]),
      'QA profiles require all four combinations',
    );
  } else {
    assert(
      !values.matrix && !values['without-ads'] && !values['without-service'],
      'online-ads requires ads and service enabled',
    );
  }
  return {
    profile: values.profile,
    games: [...matrixGames],
    modes: local
      ? [
          [false, false],
          [true, false],
          [false, true],
          [true, true],
        ]
      : [[true, true]],
  };
}
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

/** Acceptance requires a complete scope, never a partially filtered successful matrix. */
export function matrixContract(matrix, { production = false } = {}) {
  assert.equal(
    matrix.profile,
    production ? 'online-ads' : 'qa-matrix',
    'Explicit acceptance profile required',
  );
  assert.equal(matrix.sourceDirty, false, 'Acceptance requires a clean packaged candidate');
  assert.match(matrix.sourceSHA, /^[a-f0-9]{40}$/);
  assert.match(matrix.submoduleSHA, /^[a-f0-9]{40}$/);
  const api = production ? productionCompetitionApi : localCompetitionApi;
  const origin = production ? 'http://localhost:8080' : localH5Origin;
  assert(Array.isArray(matrix.variants), 'Missing package matrix');
  const expected = matrixGames.flatMap((game) =>
    (production ? [true] : [false, true]).flatMap((service) =>
      (production ? [true] : [false, true]).map(
        (ads) => `${game}-ads-${ads ? 'on' : 'off'}-service-${service ? 'on' : 'off'}`,
      ),
    ),
  );
  assert.deepEqual(
    matrix.variants.map((v) => v.name).sort(),
    expected.sort(),
    'Incomplete or duplicate H5 matrix',
  );
  for (const v of matrix.variants) {
    assert(matrixGames.includes(v.game));
    assert.equal(typeof v.adsEnabled, 'boolean');
    assert.equal(typeof v.adUnitConfigured, 'boolean');
    assert.equal(v.effectiveAdsEnabled, v.adsEnabled && v.adUnitConfigured);
    assert.equal(v.adMode, v.effectiveAdsEnabled ? 'host' : 'off');
    assert.equal(typeof v.serviceEnabled, 'boolean');
    assert.equal(
      v.name,
      `${v.game}-ads-${v.adsEnabled ? 'on' : 'off'}-service-${v.serviceEnabled ? 'on' : 'off'}`,
    );
    assert.equal(v.packageType, 'h5');
    assert.equal(v.orientation, h5Orientations[v.game]);
    assert.equal(v.orientationVerified, false);
    assert.equal(v.sourceSHA, matrix.sourceSHA);
    assert.equal(v.profile, matrix.profile);
    assert.equal(v.sourceDirty, false);
    assert.equal(v.identityMode, 'persistent');
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
