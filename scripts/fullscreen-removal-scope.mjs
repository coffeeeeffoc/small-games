import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Exact removal reviewed on 2026-10-24; additional bytes need their own scope.
export const fullscreenRemovalReviews = Object.freeze({
  '.prettierignore': [
    'b62aa1aca97995c32b1b8cf6e3c53f499578799b9ed5aee0765f30f2b9e39056',
    'f7790647b7505e1bf54c3f05d648c146da613c5dc4b5f08e8c9385413819a306',
  ],
  'apps/shell-web/package.json': [
    '05fd51dc8cd2b738552c71cbe1842d4cb5fac81242b32e152b559565c3415ede',
    '38b7d740bd9224ea04acd6af871d778aaa4893497c1de54f9508053773e0146d',
  ],
  'apps/shell-web/public/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/ashfall-front/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/ball-roguelite/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/cage-rescue/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/carding-car/scripts/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/carrom-club/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/chase-thief/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/cops-robbers-realtime/src/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/cops-robbers/src/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/echo-lab/shared/browser/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/ember-bounce/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/flick-arena/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/fold-the-world/src/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/game-castle-cannon/public/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/game-moss-garden/public/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/letters-words2/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/merge-front/scripts/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/out-of-frame/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/tetracube/scripts/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/three-choose-two/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/tianxia-chalu/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/tower-brake/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/tower-brake/scripts/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/two-sided-box/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'games/local/vibeJam-myself-history-guess/public/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'package.json': [
    '1219ff74515170e5b17a133373050ec14ae93cb610431575cf9ba20e75b181f0',
    'e0033d7f5f54060bcdb89a335db54636fe66e68dc63cc52772a593a07afdb161',
  ],
  'platforms/h5/dev-mode.js': [
    '986844491337ac0bb53394d44917356a820f346f0d2b0d63b2ab34e36a7a4a2f',
    'fcc49bdcc071a234df52081bbb6f09ce0a002e4c633403cb460724c921cb4b39',
  ],
  'platforms/h5/fullscreen.js': [
    '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
    null,
  ],
  'platforms/h5/publishing.js': [
    '7f43dd0452c2623e473739e9310cb2b5dfbf981ee03aa76c25e8eae693030dad',
    '56d31e3441ff163ff71f7eda0001e1344eebf689accb5cfcde3ad9015a63b1f8',
  ],
  'platforms/h5/role-appearance.js': [
    '380532fd54f29ccb57ed4f8dd0afbae0b69ce56ba00975454491d11b20e13d06',
    'd7ae05baee532f78f6d2d1380e8a81db955ac7a089b8367c613031b9fd6d2166',
  ],
  'platforms/h5/safe-area.js': [
    '1ee082917f90e933ff2d018b68b41f32b4680dd25f34ae66039189b42ccf3da4',
    'ed1e29048745532256c980444dbe8d3523ae3711a65aefed03317b20e9239224',
  ],
  'platforms/h5/tests/publishing.test.mjs': [
    'ca1a36ef6b47a32d8788f9f583c76a34efe7e8456dc6c9e02685837647b22c8c',
    'b27a218b212c4540c56aa0609f17a5e665c4d2ef2799b923f539fb8ec1c2c275',
  ],
  'scripts/letters-words2-iframe.browser.mjs': [
    '46ff400125e081b1182f408435ea62c486696c4d48fdd0fd42b406a984065fba',
    'dc001b37115f5c8268c87736274ba36778662bd64886bdad22fe03666e0ded98',
  ],
  'scripts/review-competition-cops-letters.mjs': [
    '686565a828884a9580ece2f9923e8e56701745487e2296afd386e00e62435ccc',
    '9b9b4455bd937f0f17c974d533ebf99787e14dd2c70ac07f2cc0702749ddab4a',
  ],
  'scripts/review-competition-realtime-history.mjs': [
    '342866782bc0ffd6ddd942fe34dafbc7176dd0cdbb1e27b612da3391b9c1f252',
    'cc1e34559f98dbd531fdfc51b9aa1d087a3f471c7f3be85f42bdc882660388bf',
  ],
  'scripts/sync-h5-fullscreen.mjs': [
    '5cc3a429c77d376929c0be7e1f17ae2aae3b2356d7a6ace9b5cca74ac5ee1d64',
    null,
  ],
  'scripts/test-competition-dialogs.mjs': [
    '97996e9c978ea7b5d7aeb834cbfa75ace550c584ca59db7247d6bc03071109bb',
    '1695c1a181494767723c50fae5ec3955b49a9ee90d010a1b4c31f7bdd9bf5aff',
  ],
  'scripts/test-h5-fullscreen.mjs': [
    '3cea00bd7e6e513c2566a759fd8750dbcb850da598ffbcd7ac9b897f2c601d2f',
    null,
  ],
  'scripts/test-submodule-dialogs.mjs': [
    'c8a66b32c2983074cdd9a7068e69984810ac973f55deb1d263b63d87ae512a4b',
    '7514b9bb39e5ca84bb2cd379568dec433b1b30d0411ea1117623b5c2f80e4e30',
  ],
});
const digest = (text) => createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');

export function isFullscreenRemovalDeletion({
  change,
  readBase,
  headHasPath,
  standaloneGames,
  gameSources,
}) {
  if (change.status !== 'D' || change.paths.length !== 1) return false;
  const [file] = change.paths,
    review = fullscreenRemovalReviews[file];
  if (!review || review[1] !== null) return false;
  try {
    if (file.startsWith('games/')) {
      const source = file.split('/').slice(0, 3).join('/');
      assert.equal(gameSources.filter((value) => value === source).length, 1);
      const entries = standaloneGames.filter((game) => game.source === source);
      assert.equal(entries.length, 1);
      assert.equal(standaloneGames.filter((game) => game.id === entries[0].id).length, 1);
    }
    return headHasPath(file) === false && digest(readBase(file)) === review[0];
  } catch {
    return false;
  }
}

export function fullscreenRemovalFileScopes({
  changedPaths,
  readBase,
  readHead,
  headHasPath,
  packages,
  games,
}) {
  const scopes = new Map();
  const consumers = packages
    .filter((pkg) => /^games\/(?:local|submodules)\/[^/]+$/.test(pkg.dir))
    .map((pkg) => pkg.dir);
  for (const file of changedPaths) {
    const review = fullscreenRemovalReviews[file];
    if (!review) continue;
    try {
      assert.equal(digest(readBase(file)), review[0]);
      if (review[1] === null) assert.equal(headHasPath(file), false);
      else assert.equal(digest(readHead(file)), review[1]);
      if (file.startsWith('games/')) {
        const source = file.split('/').slice(0, 3).join('/');
        const entries = games.filter((game) => game.source === source);
        assert.equal(entries.length, 1);
        assert.equal(games.filter((game) => game.id === entries[0].id).length, 1);
        assert.equal(consumers.filter((value) => value === source).length, 1);
        scopes.set(file, [source]);
      } else {
        assert(consumers.length && packages.some((pkg) => pkg.dir === 'apps/shell-web'));
        scopes.set(file, [...consumers, 'apps/shell-web']);
      }
    } catch {
      /* Unknown bytes and unavailable trees retain the existing blocking gate. */
    }
  }
  return scopes;
}
