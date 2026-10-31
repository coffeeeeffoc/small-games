import assert from 'node:assert/strict';
import { gameRenameFileScopes } from './game-rename-scope.mjs';
import { isDeepStrictEqual } from 'node:util';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { vitePatchFileScopes } from './vite-patch-scope.mjs';
import { ingressShellGuard, ingressPreflightGuard } from './competition-ingress.mjs';
import { mainRetirementTreesMatch } from './local-game-retirement-scope.mjs';

const loadDependency = createRequire(import.meta.url);

// Castle Cannon Creator migration: exact reviewed base/head bytes only.
export const castleCreatorReviews = Object.freeze({
  'scripts/h5-taptap-matrix.test.mjs': {
    before: '8952a0a92f463cd20169ba30b581219efc3be59038b1480f62dfe26b8a091cb3',
    after: '6fe5a1d627474b3cf619f24e4de21b3d92cac2eb2dec129ea85dfd82dc0c2dd6',
    sources: [],
  },
  '.github/workflows/carding-car.yml': {
    before: '689c4edd7ec46f6f6caa6dfd2c6eff628f47a3985ed3e882e56a2f7afd157e3f',
    after: '156789c9b27107e43481c612fdf0583acd9c2aaecd131202f2adfd39e6a7a9dd',
    sources: ['games/local/game-castle-cannon'],
  },
  '.github/workflows/ci.yml': {
    before: '504f25c7c90beb1d45c6d43f9bb7eb40aec763cd5d1465e09674a34510c8b093',
    after: '2ff2324c75192d8c49253c881d828e0d96843f55503dd0227dc2503212fab2a0',
    sources: ['games/local/game-castle-cannon'],
  },
  '.github/workflows/mobile.yml': {
    before: '1ec7608f8cfc9057a575a395227f8563b5b7db0935d45102d29f5aa1287cf5c1',
    after: 'a8b816e6b5187cfc42180fbe796a454501b8f81873151f8bf8c8d344e1f1e919',
    sources: ['games/local/game-castle-cannon'],
  },
  '.github/workflows/pages-validate.yml': {
    before: 'd485fd62cb95943485e01c0fba6d332950601efa524eb446976e6f698b024d2b',
    after: 'b6d0e2eeb4c64eff7e78305a6a745ddfac86da48fc0f1e40ec84bca51c223f1a',
    sources: ['games/local/game-castle-cannon'],
  },
  'apps/shell-web/scripts/game-checks/castle-cannon.mjs': {
    before: '6e2b0fd6a44a776e553fe09ed6f7235c1225282d8613b23168156a4fc0eeadcb',
    after: '5c655baca51a037d8642f9c1862a0bfc20045c812e07ec2f94735dfc960c39ee',
    sources: ['games/local/game-castle-cannon', 'apps/shell-web'],
  },
  'apps/shell-web/scripts/pages-smoke.mjs': {
    before: '57361de65e6f84fc79951be178ea8796a6a8e7b49918f90388322cd985a856d9',
    after: '34a39129aa775595c21ec6c3e055f98909193beb69102996e8bfaa686a7c4306',
    sources: ['games/local/game-castle-cannon', 'apps/shell-web'],
  },
  'apps/shell-web/scripts/standalone-game-entry.mjs': {
    before: 'b5cadbb403ce37bbab9a70b431238e9198c9cf8edefbb0a90f00eb44e41e9eca',
    after: 'd57f4b42bd35848cdf9dd44310d02cc795722e16a23cba656ed63ac62bc0bb4a',
    sources: ['games/local/game-castle-cannon', 'apps/shell-web'],
  },
  'apps/shell-web/scripts/standalone-game-entry.test.mjs': {
    before: 'dad4f355f2ed244779e8f74ff2402818549eff228a4aebe388e8d9efa64051b0',
    after: '57fefbc516b1e2e84972d7d183c6a4d514075066d828de6de9ea3b611ce312a1',
    sources: ['games/local/game-castle-cannon', 'apps/shell-web'],
  },
  'apps/shell-web/src/StandaloneGame.tsx': {
    before: '6373e72764ea5f518b258a46c6b9af884cf7e0d0b5ed11ebf614bf0bf8360d41',
    after: '331d000450110ede5ffefb2332269b99011fb8d5f3eb587fd7f1065520a99b6f',
    sources: ['games/local/game-castle-cannon', 'apps/shell-web'],
  },
  'apps/shell-web/tests/standalone-immersive.integration.test.tsx': {
    before: '75b962ab101fb473ad4e604800bd1f2b78982dd60bebeb97a2548ca10a25a4f4',
    after: '8c4e1fc79e056c9a2266233909125590be507bcdd6b5e892ba18df4afe54dac8',
    sources: ['games/local/game-castle-cannon', 'apps/shell-web'],
  },
  'scripts/check-game-config.test.mjs': {
    before: '83257dfe8558dc6164729cd3b6cb4061f9a7e721c5a8b15f2412937ed54271f1',
    after: 'd3c973703a9ee73c551fbfab55b84f9b3d5dcac51ee1e1828bef8aac405fd07a',
    sources: ['games/local/game-castle-cannon'],
  },
  'scripts/check-workspace-dependencies.mjs': {
    before: '81406bc8e6b8f33677b85e608f42ba10a7d2070fb1221bb34dc91e5bfd50bfbd',
    after: 'c63ac98faeb1c028193010739f9fbefab6c06e7832d22a0310999786ec12c3de',
    sources: ['games/local/game-castle-cannon'],
  },
  'scripts/cocos-validation.mjs': {
    before: '9fca2edc2d3e0485f20a63930de78bbf8d5bd2702e1c322ad03d96c0e39aacb5',
    after: 'df65e6f13eb92aa19d4dc034ce0fa47a81ea53eded61aaa2789a18c921591e47',
    sources: ['games/local/game-castle-cannon'],
  },
  'scripts/cocos-validation.test.mjs': {
    before: 'fe8b7a02ff3d2fd6a3991a5742272b9e6d6a485373ec1836af7ef1a514fdde1e',
    after: '2f48fd1f93c5b9dd4192058693bde5276557a5d974767ded18dc9e6af40558c1',
    sources: ['games/local/game-castle-cannon'],
  },
  'scripts/reuse-cocos-artifacts.mjs': {
    before: '97311301cf068af5e6f607e214fa9fd8bf25956b64465335f837b588a2a13ff2',
    after: '7fd0d6fd7527127a2b32421c7b85b384e6818bd5edb321b8fbfa7d58d7e18f41',
    sources: ['games/local/game-castle-cannon'],
  },
  'scripts/reuse-cocos-artifacts.test.mjs': {
    before: '04b29083de780c4c9a695084e026acbaf5c53ed5a60fa523b1998c705c8a9898',
    after: 'ffac04bcbe08b0b0ba5da93ce0e9516cfc573d51ebf965f4d7d39f7aa3777a92',
    sources: ['games/local/game-castle-cannon'],
  },
  'scripts/sync-h5-fullscreen.mjs': {
    before: '13ba2904af89e73207f2809fa861b7d5c23b72ff6df77ebdb73dfd27e332c363',
    after: '5cc3a429c77d376929c0be7e1f17ae2aae3b2356d7a6ace9b5cca74ac5ee1d64',
    sources: ['games/local/game-castle-cannon'],
  },
  'scripts/test-game-dev-mode.mjs': {
    before: 'e5ea1284cb2d040076aa35a747acea3604c5e1881af76ac06d6b18c51bed9166',
    after: 'f911bb11751f1ade391613a622fcd915ec8a19f737f7d7eadd6acd708b08027b',
    sources: ['games/local/game-castle-cannon', 'apps/shell-web', 'games/local/wulong-city'],
  },
  'turbo.json': {
    before: 'c6c6f3d6bcd2a77b1e7e3457f3b4ecb2493a0bbaef7fa5882d5e070cc5b8c568',
    after: '2939bab45107ebb53888d6f5a0a77420f2e05551bf464a91e4c8fef7c79d7c3a',
    sources: ['games/local/game-castle-cannon'],
  },
});
export function castleCreatorFileScopes({ changedPaths, readBase, readHead, games, packages }) {
  const scopes = new Map(),
    source = 'games/local/game-castle-cannon';
  try {
    const entries = games.filter((g) => g.id === 'castle-cannon' || g.source === source);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, 'castle-cannon');
    assert.equal(entries[0].source, source);
    assert.equal(entries[0].output, 'dist');
    const targets = packages.filter(
      (p) => p.dir === source || p.name === '@coffeeeeffoc/game-castle-cannon',
    );
    assert.equal(targets.length, 1);
    assert.equal(targets[0].dir, source);
    assert.equal(targets[0].name, '@coffeeeeffoc/game-castle-cannon');
    assert.equal(targets[0].creator?.version, '3.8.8');
    assert.equal(targets[0].scripts?.build, 'node scripts/build.mjs web-mobile');
    const digest = (s) => createHash('sha256').update(s.replaceAll('\r\n', '\n')).digest('hex');
    for (const file of changedPaths) {
      const review = castleCreatorReviews[file];
      if (!review) continue;
      const before = digest(readBase(file)),
        after = digest(readHead(file));
      const chargeWait =
        file === 'apps/shell-web/scripts/game-checks/castle-cannon.mjs' &&
        [review.before, review.after].includes(before) &&
        after === '71ad9d9507dfbbdf534f3a9b6f860be4e52df8a0b04a28c546c0d1e05a7bb302';
      const qualityBudget =
        file === '.github/workflows/ci.yml' &&
        before === review.before &&
        after === 'd983ffe34a30e39b8a8d4675197cb73b193ddea9a5adfaac4f95a42ad39926c9';
      if (!chargeWait && !qualityBudget && (before !== review.before || after !== review.after))
        continue;
      if (review.sources.some((dir) => !packages.some((p) => p.dir === dir))) continue;
      scopes.set(file, Object.freeze([...review.sources]));
    }
  } catch {
    return new Map();
  }
  return scopes;
}

// Tetracube routes reviewed against 90aae860; unrelated bytes keep their original consumers.
export const tetracubeCreatorReviews = Object.freeze({
  'scripts/h5-ad-config.test.mjs': {
    before: '6a8a3c60e00b0b1ef29f49f55d0755e1271b54c3abd62caa22d8cc96cdda18ba',
    after: '716b6c536eee1b2731a3bd043da0971e5e2317df1817043b6fbf37af21b42fcb',
    sources: [],
  },
  '.github/workflows/carding-car.yml': {
    before: '420192e8c991ff7166a1828e48b3087cdbf65604b8d659393c4802bdad6ac2c7',
    after: '8e65a86cb76f00de5bef025c4fafa09d022e38b3157529e6b6874b1cf145754d',
    sources: ['games/local/tetracube'],
  },
  '.github/workflows/ci.yml': {
    before: '073903ff62e45572e1b2f07a25d64ca19ad381800f7859bd73b3c6bb3da96e9f',
    after: 'c8a3dd2a8a9052bc8f655d7dcffba2813a0171f77512aeb72ce8876ae55ce5ff',
    sources: ['games/local/tetracube'],
  },
  '.github/workflows/mobile.yml': {
    before: '046cada0323b6b92a6d95a894acc8a9c31881faa874e98d9f25f5b47ff7ed5f5',
    after: '2dce51a636fc13fd5b29a085320567ee3939128d3749f8d8653e9817aa7682d8',
    sources: ['games/local/tetracube'],
  },
  '.github/workflows/pages-validate.yml': {
    before: 'f7c119db7da3a46f682da323558a38214f3fed2f7cb79b8b9cbfbcf16378d258',
    after: 'b7ae553e2e4046d676cb3419df392f54c926d1473370c62ea9faf464ff106271',
    sources: ['games/local/tetracube'],
  },
  'turbo.json': {
    before: '8e715b054f404963935c195b1fb8dccc4d90ccab8a40c826411f033e810ca6fa',
    after: 'dd0b8881e1ed540d66f3da77b10c5e12b6ea5d07c9b536c5f59a18da42cb7793',
    sources: ['games/local/tetracube'],
  },
  'pnpm-lock.yaml': {
    before: 'bf37f530bd0253a9fdcff185ea435f94a3a7ab9969b6925c06377c92fa4ca9cc',
    after: '8871279d6efa7623ffd0562a0ab45b376ba2844072862dbbbed4c0d6a3f2a821',
    sources: ['games/local/tetracube'],
  },
  'scripts/reuse-cocos-artifacts.mjs': {
    before: 'c626dd77cf003383f2ce6bcdbd28b4769f938077f0b7ee2700af77c3810247de',
    after: '8fefae65629d55d628960d8e11aba129475f43195e66eb21c110820832f10daf',
    sources: ['games/local/tetracube'],
  },
  'scripts/h5-ad-config.mjs': {
    before: '3619e524dfb5ecd4ddcc5e9939a2ef243685150beb063913a7cbf5af236f385c',
    after: 'add9c24b2ee744d2ee3f6759ad3bcd8b866b1a04256307fb8dfe648944d6b46c',
    sources: ['games/local/tetracube', 'games/local/homebound-station'],
  },
  'scripts/h5-game-build.mjs': {
    before: '5a76a4e6e968193b244177c2c268becc14a1c022107045bebe719a2c2fd2380f',
    after: '5820316069dc3e103004b81562ec374f82bc9b5efb7f6800c13920d44ed40228',
    sources: ['games/local/tetracube'],
  },
  'scripts/h5-taptap-build.mjs': {
    before: 'ccbbf960a1f33c8fda6f7d447ad06a2234f306db478f06c18bc4df69b7c57a89',
    after: 'd3d3e15a02d63e53690e9e510f58f20b7ff44092cf5b1bf1db36739e1a70d38e',
    sources: ['games/local/tetracube'],
  },
  'scripts/h5-taptap-matrix.mjs': {
    before: '71257b7d52add72213aff79dfd05b0d4a4a240d42a0a2c292fb64a958fc78cac',
    after: '032ef04dccde57ccd892bd1bcda9189fd444c35a8bb186a39750f4902958a48e',
    sources: ['games/local/tetracube'],
  },
  'scripts/sync-h5-fullscreen.mjs': {
    before: '444c0792a85d7cf3713555abfc12904972b26c2c7d03ca4330a9b03478c161cf',
    after: '564f3ae2b4c1e423d495dbd399d7ef339ac87483885d0e0d089e81f93b2bd053',
    sources: ['games/local/tetracube'],
  },
  'scripts/test-game-dev-mode.mjs': {
    before: 'f916c53b903f180056aaa35cdb8137ac9b6b4f42592d1f44416914006e4a8423',
    after: '20ae1e5a48e927e3b1a382c96bb50eff28e9c2b103137e3e657e2b193d7a978e',
    sources: ['games/local/tetracube', 'apps/shell-web', 'games/local/wulong-city'],
  },
  'apps/shell-web/src/StandaloneGame.tsx': {
    before: 'c5b576c61c47f68fe2e65c66864c7fecf68a6f36414f45fce1ad10a71289a003',
    after: '0981d15b383cd6faa9896159c44f76c0ed55d7c7f32908aa987ab37add81c1b6',
    sources: ['games/local/tetracube', 'apps/shell-web'],
  },
  'apps/shell-web/scripts/pages-smoke.mjs': {
    before: '173f91964552dc5b73919f4007d7419092c7eafb27ed6e0d0e741254c0d668e3',
    after: 'c54ce6078385f4d26570e9d5825468b4cef83ed927da73c4260263e66e449b72',
    sources: ['games/local/tetracube', 'apps/shell-web'],
  },
  'apps/shell-web/scripts/standalone-game-checks.mjs': {
    before: '93ab6fd3d3e94f8bf4f3efae1c0ac288d0b7d7cf33718e768595ffb45afd0609',
    after: '09dc45561f6c8f56bf1e87f2db804723818c7309bb17b2c28f643604a1c0a694',
    sources: ['games/local/tetracube', 'apps/shell-web'],
  },
});
export function tetracubeCreatorFileScopes({ changedPaths, readBase, readHead, games, packages }) {
  const scopes = new Map(),
    source = 'games/local/tetracube';
  try {
    const entries = games.filter((g) => g.id === 'tetracube' || g.source === source);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, 'tetracube');
    assert.equal(entries[0].source, source);
    const targets = packages.filter(
      (p) => p.dir === source || p.name === '@coffeeeeffoc/tetracube',
    );
    assert.equal(targets.length, 1);
    assert.equal(targets[0].dir, source);
    assert.equal(targets[0].name, '@coffeeeeffoc/tetracube');
    assert.equal(targets[0].creator?.version, '3.8.8');
    assert.equal(targets[0].scripts?.build, 'node scripts/build.mjs web-mobile');
    const digest = (s) => createHash('sha256').update(s.replaceAll('\r\n', '\n')).digest('hex');
    for (const file of changedPaths) {
      const review = tetracubeCreatorReviews[file];
      if (!review) continue;
      if (digest(readBase(file)) !== review.before || digest(readHead(file)) !== review.after)
        continue;
      if (
        file === 'pnpm-lock.yaml' &&
        !tetracubeLockOnly(
          readBase(file),
          readHead(file),
          JSON.parse(readHead(source + '/package.json')),
        )
      )
        continue;
      if (review.sources.some((dir) => !packages.some((p) => p.dir === dir))) continue;
      scopes.set(file, Object.freeze([...review.sources]));
    }
  } catch {
    return new Map();
  }
  return scopes;
}
export function tetracubeLockOnly(before, after, manifest) {
  return existingDevImporterOnly(
    before,
    after,
    manifest,
    'games/local/tetracube',
    '@coffeeeeffoc/tetracube',
    { '@playwright/test': '1.55.1', typescript: '7.0.2' },
  );
}

// Exact main-base review; unrelated bytes and consumers remain unclassified.
export const mainIntegrationReviews = Object.freeze({
  '.github/workflows/carding-car.yml': {
    before: '79c7e62376cb93cfcf894fcbb6518f88d68a83f6dd22f161539a381a73fe119e',
    after: '420192e8c991ff7166a1828e48b3087cdbf65604b8d659393c4802bdad6ac2c7',
    sources: [
      'games/local/carding-car',
      'games/local/night-overwatch',
      'games/local/tianxia-chalu',
      'games/local/homebound-station',
      'games/local/merge-front',
      'games/local/bullet-garden',
    ],
  },
  '.github/workflows/ci.yml': {
    before: '7dc23c17a7b8180c0abc4eb5869b872d41e466a755da9757cae56235bcd2bf12',
    after: '073903ff62e45572e1b2f07a25d64ca19ad381800f7859bd73b3c6bb3da96e9f',
    sources: [
      'games/local/tianxia-chalu',
      'games/local/homebound-station',
      'games/local/merge-front',
      'games/local/bullet-garden',
    ],
  },
  '.github/workflows/pages-validate.yml': {
    before: 'c4766cd65e637f9baadea7659184e154bfe5fb9951a0f97d95d1bcc4010de244',
    after: 'f7c119db7da3a46f682da323558a38214f3fed2f7cb79b8b9cbfbcf16378d258',
    sources: [
      'games/local/tianxia-chalu',
      'games/local/homebound-station',
      'games/local/merge-front',
      'games/local/bullet-garden',
    ],
  },
  '.github/workflows/mobile.yml': {
    before: '860a6b07cc7b9acf17033726fd44c6f768b58ef9e316a48bce55fb05ff80f3c3',
    after: '046cada0323b6b92a6d95a894acc8a9c31881faa874e98d9f25f5b47ff7ed5f5',
    sources: [
      'games/local/tianxia-chalu',
      'games/local/homebound-station',
      'games/local/merge-front',
      'games/local/bullet-garden',
    ],
  },
  '.github/workflows/pages.yml': {
    before: '013b6713eab6344a5ec2d77ff88542c825874c1888eb6b1b1f3dcf5c9010989e',
    after: '228364b8559ed1ff24890594999d8c4adfff46af57b7f11a2861fb305a5e5419',
    sources: [],
  },
  '.gitmodules': {
    before: 'fd6fee180db917e510df608c4620ee5227aea7d85fc54473a677b5bc2e1cfdfd',
    after: '7148d0cc476f0c5f8cf45156c60a4bd5360010a2a6aa4909b5ae1d0e1895d47b',
    sources: ['apps/shell-web'],
  },
  '.prettierignore': {
    before: 'f5b7244238ddc228cb70961aa872fc4eeeddf5a226d8740b60b5feacfa4a8eed',
    after: 'b62aa1aca97995c32b1b8cf6e3c53f499578799b9ed5aee0765f30f2b9e39056',
    sources: [],
  },
  'package.json': {
    before: 'db55d5e6ec2effe93b512311e5e7470eaba81d17b63f599929fe2ea6d63115a2',
    after: '1219ff74515170e5b17a133373050ec14ae93cb610431575cf9ba20e75b181f0',
    sources: [
      'apps/shell-web',
      'apps/shell-minigame',
      'apps/studio-web',
      'services/management-api',
    ],
  },
  'pnpm-lock.yaml': {
    before: '39b5be38d1b6e2b421a7cbf88a3e954db69ef4bef397b82d2a3a9a9324bcc9e9',
    after: 'b23918aa79186aa5922438925c7df51d6433d07eec54cc0af3f3996d47b8c9c7',
    sources: [
      'apps/shell-web',
      'apps/shell-minigame',
      'apps/studio-web',
      'services/management-api',
      'games/local/echo-lab',
      'games/local/bullet-garden',
      'games/local/merge-front',
    ],
  },
  'turbo.json': {
    before: '87cffb64731a1e510934645439f1f23e3ecbbd60e3e076c7237caeddb22268c9',
    after: '8e715b054f404963935c195b1fb8dccc4d90ccab8a40c826411f033e810ca6fa',
    sources: [
      'games/local/tianxia-chalu',
      'games/local/homebound-station',
      'games/local/merge-front',
      'games/local/bullet-garden',
      'apps/shell-minigame',
    ],
  },
  'infra/migrations/003-content-drafts.sql': {
    before: '744d3ffbc3ce992e6a9b8a6c9d2a15d98bd331fe79d7d56ce22d4237f24afd26',
    after: 'e1f9d69a82826ddaf9ac4b272d01f3a0d6888e5850858303eddbeab414d316c5',
    sources: ['services/management-api', 'apps/studio-web'],
  },
  'infra/migrations/015-generic-content-drafts.sql': {
    before: null,
    after: 'd51a5c661c34cb8a3bb5ce69eddbe4a1e4b9fb878f9460384f537c33a40f0b85',
    sources: ['services/management-api', 'apps/studio-web'],
  },
  'scripts/artifact.integration.mjs': {
    before: 'd62715f1d4a5e8030a3496ffc17d26c5ad8cf554ba789fc0d43eb750d9d222c7',
    after: 'f209beedb83c14203ad03ccc0ef6034de7416e0da0143765ab2baae42632fa69',
    sources: ['services/management-api', 'packages/game-artifact'],
  },
  'scripts/auth.integration.mjs': {
    before: '3db33588e9d455ca02f7c74cfe369513bbf56f03a924032dd53a01bd0418fea8',
    after: '8a77862887bacc9cbbb1fe58e9eb5f91770da4f89244749d891632bba7b565c6',
    sources: ['services/management-api'],
  },
  'scripts/check-game-config.mjs': {
    before: '4618a187bdd69c4ddb9e6e09c5ebabc29e3f5c62ef4d6b450c9643412f97fa93',
    after: 'b94272674ffaf5e9df04589f3a5e9b438d8049e51f05203519224d327c0cc38e',
    sources: [],
  },
  'scripts/deploy-tencent.mjs': {
    before: 'cf2d1df8a6106fdf5ede892802963d480e1506e5b5f7dc3b18b4747b95bd2f75',
    after: 'ef83f5e926bdd57e6b5743c09c69fba7c21735b6d117a83b2b9896f12d2b54b4',
    sources: ['services/management-api'],
  },
  'scripts/platform-apps.mjs': {
    before: '33de52996e096939a0a0ff478751d133083fb3499acbc0e3386352b3d7f8d0f6',
    after: '8160c23e78b2b02a6d7d2b1a8a603e5dda2f5c0dd939a80074b193921ca9fc28',
    sources: [],
  },
  'scripts/platform-process.test.mjs': {
    before: '444ca3d87c5370357b2d06cb369968bd467ca712293f1f4a7f31110dda38224a',
    after: '94ff5fc6a4af3738ed1fa3c196458d0d7a613f8d59950a5a4950100ef2ab1abe',
    sources: [],
  },
  'scripts/platform.mjs': {
    before: '7f8a88433229acbf7d131f8812b84f2fcf13c7b8d514c045413bfbee8c4b11f9',
    after: 'd557e68e536132f7164d987565c317f67a92db27a143fe87ee38f4bcf2cd25f2',
    sources: ['services/management-api'],
  },
  'scripts/test-game-dev-mode.mjs': {
    before: 'db3f9ed8b7106baa7e868b7d4dc926dc9f41ab82ae9ee5474edce52c522b3c51',
    after: 'de3df3cddcfa91f7005570a17d9c27483cc58ef2df0d3310cf598e4e4686d801',
    sources: [
      'apps/shell-web',
      'games/local/bullet-garden',
      'games/local/homebound-station',
      'games/local/tianxia-chalu',
      'games/local/merge-front',
      'games/local/wulong-city',
    ],
  },
  'apps/shell-web/package.json': {
    before: 'bb21e2eafd28ca91922f7e6cd42916a7b8c69929934c06556f93476c0b4d0bdd',
    after: '12633e0d00275065080519b5ad1372e3827999a1a4acde6b71af48e9b5091ddd',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/game-meta.json': {
    before: '6b22589def2a349182e2e1dad19b9a8e5abc0564fdc0aed54cc7bb743ef340d8',
    after: '80a8683eb547705a488145b71976ccf6ecfcb02faa64f84ea68a56265595758b',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/standalone-games.json': {
    before: '0b0ddec4114d335ba88fb95ba74f0624c8e1e299611d742869405e83020894fa',
    after: 'edc4f65dbe89a68385987264ae871d22fa50a1d1936d228405529683d4a9dd89',
    sources: ['apps/shell-web', 'games/local/merge-front', 'games/local/bullet-garden'],
  },
});
for (const review of Object.values(mainIntegrationReviews)) {
  Object.freeze(review.sources);
  Object.freeze(review);
}
const mainLockManifestHashes = Object.freeze({
  'package.json': {
    before: 'db55d5e6ec2effe93b512311e5e7470eaba81d17b63f599929fe2ea6d63115a2',
    after: '1219ff74515170e5b17a133373050ec14ae93cb610431575cf9ba20e75b181f0',
  },
  'apps/shell-web/package.json': {
    before: 'bb21e2eafd28ca91922f7e6cd42916a7b8c69929934c06556f93476c0b4d0bdd',
    after: '12633e0d00275065080519b5ad1372e3827999a1a4acde6b71af48e9b5091ddd',
  },
  'apps/shell-minigame/package.json': {
    before: '4aa92bd462c741b324d6d6b86e4c9140ebbd8aaa8b7df61e3dbb6449678f0f71',
    after: 'aa28f0baebb07ea7eb741b3d644d4937a263cb998737b2e1362ac3307dfbc5d3',
  },
  'apps/studio-web/package.json': {
    before: '34a71615b8a85fc72eda485cb01251eb5fb9336f803fbc3f806fe1e62d160fd4',
    after: '0e37c4253728587587635a1d63bc98506b100c21625de6cc8968fadad4d7015d',
  },
  'services/management-api/package.json': {
    before: 'fbeea00d06c89ada8c90826465c675350bf3eb9cd08363b512c6441530784b31',
    after: '744d87faa39c4ebeac39d9d169d38db0ea56028cf9dd26b175c310da519232c9',
  },
  'games/local/echo-lab/package.json': {
    before: 'aa8d80fc64a902f8f5648b657a82d2058055f6ba077ccc4f3a12ea72c4095e58',
    after: 'e8e39dd67f910e9f13f75b9b90e53edf5fb92b670dd05b7140148f61f38858bb',
  },
  'games/local/bullet-garden/package.json': {
    before: '57a566b2cb489ca96db04c5a6f2fbd2914df662a40c2b9edcc0f885ad5fa9ebe',
    after: '103ffa2b80c66479e8c67931e5af78d13ffca118fb378bff5e03a13e11fb3cd5',
  },
  'games/local/merge-front/package.json': {
    before: 'bf31881da9ef054bb61281cdbe4538d3e7ad6fbd3fd74dc113f9d601d93bb8a6',
    after: 'efda63d3c7e0f5c40c94ab9f72c416af7dbf4b109819008aa75205e01cac7443',
  },
});
const mainIntegrationNames = Object.freeze({
  'games/local/carding-car': '@coffeeeeffoc/carding-car',
  'games/local/night-overwatch': '@coffeeeeffoc/night-overwatch',
  'games/local/tianxia-chalu': '@coffeeeeffoc/tianxia-chalu',
  'games/local/homebound-station': '@coffeeeeffoc/homebound-station',
  'games/local/merge-front': '@small-games/merge-front',
  'games/local/bullet-garden': '@coffeeeeffoc/bullet-garden',
  'apps/shell-web': '@coffeeeeffoc/shell-web',
  'apps/shell-minigame': '@coffeeeeffoc/shell-minigame',
  'apps/studio-web': '@coffeeeeffoc/studio-web',
  'services/management-api': '@coffeeeeffoc/management-api',
  'games/local/echo-lab': '@coffeeeeffoc/echo-lab',
  'packages/game-artifact': '@coffeeeeffoc/game-artifact',
  'games/local/wulong-city': '@coffeeeeffoc/wulong-city',
});
const mainIntegrationIds = Object.freeze({
  'games/local/tianxia-chalu': 'tianxia-chalu',
  'games/local/echo-lab': 'echo-lab',
  'games/local/homebound-station': 'homebound-station',
  'games/local/carding-car': 'carding-car',
  'games/local/merge-front': 'merge-front',
  'games/local/wulong-city': 'wulong-city',
  'games/local/night-overwatch': 'night-overwatch',
  'games/local/bullet-garden': 'bullet-garden',
});

// Reviewed merge-front migration: only these exact artifact, ad and entry routes changed.
export const mergeCreatorIntegrationHashes = Object.freeze({
  '.github/workflows/carding-car.yml': [
    'ee77322f7414ab0a398af5c2d10763757ea679dbfa452520a653aacf43bdf05b',
    '1ef11a9cf351cbee63f5f2bf20f5738e132a006db32aaf16aae5b67e3b3193fe',
  ],
  '.github/workflows/ci.yml': [
    '6d1e55268d42feda5767a6e95c5986239a53b9bd8f922a231ba24f0d69cd2e29',
    '5510611e680bba157680b097e8377250cb406779c0a8cb76ffc12f682edb83bd',
  ],
  '.github/workflows/pages-validate.yml': [
    '7a89794f444b282c995d86ddb8970c3e3ca8f9f4cea40fbf9d984a25348bcbc2',
    '47aa8fba216a73f7d2ea069be9a5c556240a5bfd9c6ed062c0ec7f62add37987',
  ],
  '.github/workflows/mobile.yml': [
    'a91039605ebf6eaa455d4159df9f061fcbb28c0dc14304d0c817d6d23766c7d4',
    '3246698d6c39c0ae44df20006c068d2821a11a74f4cd3b7bb16b57b4219c2de7',
  ],
  'turbo.json': [
    'ffa105c8ac861d36457df2da83998e2be0e35f6cb19cdf86e46d85844a997d75',
    'e8c3d619e5de1b4b1dd871bc880b5985c76cc9e1b63447e6e2aefda9f2366c94',
  ],
  'pnpm-lock.yaml': [
    '959125ee6a824b1a1b820f12dde14b8f2aad9f99080afefe70ca3c2584d94379',
    '6d0947a09773bbd9b905d79abdb073d212f67adb00b5bb02fe4c88249c276fac',
  ],
  'scripts/reuse-cocos-artifacts.mjs': [
    '6a6014b181ffb9ee2b04044eb74b0d9bea0a25f7567776b253abcf71a97e0d4d',
    '661cd9742e592cc4f57d5c48e55d2da4505945e1dfcb25b548e3e39050af4cfc',
  ],
  'scripts/sync-h5-fullscreen.mjs': [
    'e957ed27a35195484dc23d1de7e0762924e65d42c567a1ebfbd20ac23fb009a7',
    '13c2e80cb9bdcee4cdfbdf7d502c0e1a51f2f4e4070230eaccbe091e22a84d47',
  ],
  'scripts/h5-ad-config.mjs': [
    'a501f7acb287811727d3868cade43a442260e5ebe426fe8ab7c3cab6db3ea5dd',
    '3619e524dfb5ecd4ddcc5e9939a2ef243685150beb063913a7cbf5af236f385c',
  ],
  'scripts/h5-game-build.mjs': [
    '7f8263e69185ccedb4ce2d89b0678535a9ee5c1be13f6c8c179be023a1557fc3',
    '5a76a4e6e968193b244177c2c268becc14a1c022107045bebe719a2c2fd2380f',
  ],
  'scripts/h5-taptap-build.mjs': [
    '167851290dd00ba94817494e8549f8852e72a232ffe2f82aff13bfdff70d8df7',
    'ccbbf960a1f33c8fda6f7d447ad06a2234f306db478f06c18bc4df69b7c57a89',
  ],
  'scripts/h5-taptap-matrix.mjs': [
    'b6cf3de496f6eeccf26a64c1c68c6dafbf2be06b0653db208c075a3f69a483fd',
    '71257b7d52add72213aff79dfd05b0d4a4a240d42a0a2c292fb64a958fc78cac',
  ],
  'scripts/test-game-dev-mode.mjs': [
    '3deb5108ff5f83733c42d28bbaa50151e47c8ff0169aa939d1870072cc5b25c5',
    '66a660486b89310d99115babec194df529b3f362814e43acd05645c55abb7397',
  ],
  'apps/shell-web/scripts/standalone-game-checks.mjs': [
    '2d44211054098f6446474773aafc241438fb37c85ce1f4ec61c8b58b3cb3f764',
    '446d0917a29f714b34e437721cee961390fefba16fb0e3012b99a6ce10911b39',
  ],
  'apps/shell-web/scripts/pages-host-smoke.mjs': [
    '30b47a586c2ad818a8b86465bd1f98390389cd61ec2eb5cd49fe5cafebcc5ebd',
    '9de23cd0bee7692dd2d48d0c32fa7ec891893941392eaec78b624992b581ac21',
  ],
  'apps/shell-web/scripts/standalone-game-entry.mjs': [
    'cf533318eae2d05db18d2a83087b00d62b123ae3e306671933477c62afd5b4a7',
    '2b6221a2e3989e3b2a5372fd04326bff16b4e358ae459c1ab561bfe4cc4f7e07',
  ],
  'apps/shell-web/src/StandaloneGame.tsx': [
    'b384f736f48a38816ba2c69c498dcf914f199dd7486861aacedabc3bd5a1c099',
    '398a6a9cf1f2a90f3e7cd1b8118522b6eafe098fc3ad2ceaa57adc07d0cfd86f',
  ],
  'apps/shell-web/scripts/pages-smoke.mjs': [
    '0e22c3fabf195d177d75ae60c4066a027e302511f9d251a79816c493b5934460',
    '7c10e7500a7472cd860c3fb508f73e0d043355a8b2c285b85f1db1a4e5a522ea',
  ],
});
export function mergeCreatorIntegrationFileScope(file, before, after) {
  const pair = mergeCreatorIntegrationHashes[file];
  if (!pair || typeof before !== 'string' || typeof after !== 'string') return false;
  const digest = (value) =>
    createHash('sha256').update(value.replaceAll('\r\n', '\n')).digest('hex');
  return digest(before) === pair[0] && digest(after) === pair[1];
}

// Reviewed cumulative Merge/Bullet wiring from the last successful Pages tree
// (39388e3a) to b652c346. Both consumers remain subject to Creator/browser checks.
export const mergeBulletCreatorIntegrationHashes = Object.freeze({
  '.github/workflows/carding-car.yml': [
    'ee77322f7414ab0a398af5c2d10763757ea679dbfa452520a653aacf43bdf05b',
    '420192e8c991ff7166a1828e48b3087cdbf65604b8d659393c4802bdad6ac2c7',
  ],
  '.github/workflows/ci.yml': [
    '6d1e55268d42feda5767a6e95c5986239a53b9bd8f922a231ba24f0d69cd2e29',
    '073903ff62e45572e1b2f07a25d64ca19ad381800f7859bd73b3c6bb3da96e9f',
  ],
  '.github/workflows/mobile.yml': [
    'a91039605ebf6eaa455d4159df9f061fcbb28c0dc14304d0c817d6d23766c7d4',
    '046cada0323b6b92a6d95a894acc8a9c31881faa874e98d9f25f5b47ff7ed5f5',
  ],
  '.github/workflows/pages-validate.yml': [
    '7a89794f444b282c995d86ddb8970c3e3ca8f9f4cea40fbf9d984a25348bcbc2',
    'f7c119db7da3a46f682da323558a38214f3fed2f7cb79b8b9cbfbcf16378d258',
  ],
  'pnpm-lock.yaml': [
    '959125ee6a824b1a1b820f12dde14b8f2aad9f99080afefe70ca3c2584d94379',
    'b23918aa79186aa5922438925c7df51d6433d07eec54cc0af3f3996d47b8c9c7',
  ],
  'turbo.json': [
    'ffa105c8ac861d36457df2da83998e2be0e35f6cb19cdf86e46d85844a997d75',
    '8e715b054f404963935c195b1fb8dccc4d90ccab8a40c826411f033e810ca6fa',
  ],
});
export function mergeBulletCreatorIntegrationFileScope(file, before, after) {
  const pair = mergeBulletCreatorIntegrationHashes[file];
  if (!pair || typeof before !== 'string' || typeof after !== 'string') return false;
  const digest = (value) =>
    createHash('sha256').update(value.replaceAll('\r\n', '\n')).digest('hex');
  return digest(before) === pair[0] && digest(after) === pair[1];
}
// Exact additive wiring for Homebound after the earlier Creator integrations. Existing compiler paths,
// workflow gates, permissions and presets remain byte-for-byte unchanged.
const homeboundCocosWiring = {
  'apps/shell-web/src/StandaloneGame.tsx': [
    'ed4397135869b47ec8e031a7c603a85336f024b58184edc2b7cb18af5bf67724',
    'b384f736f48a38816ba2c69c498dcf914f199dd7486861aacedabc3bd5a1c099',
  ],
  'apps/shell-web/scripts/pages-smoke.mjs': [
    'f1a1a2295772498305b5766d530aa55e774887333b76029de951033bae9b4424',
    '0e22c3fabf195d177d75ae60c4066a027e302511f9d251a79816c493b5934460',
  ],
  'apps/shell-web/tests/standalone-immersive.integration.test.tsx': [
    '9a0071ba38e725b7bb672e8d06b73167340bec9c3fdab22a792c6f45865818a5',
    'f7e26ca16c0c5dfc587437eeb28e4ff93be9a1b72a58b9996b6aa1270e81219d',
  ],
  'apps/shell-web/tests/standalone.integration.test.tsx': [
    '9bb0d0095ba2cdcced396e56114a1db42a7e531a4a5c787a9865120ee54fb245',
    'c19a2313195d70419d987e0a5ce9e7839b96951cdda88edadb25976431873b53',
  ],
  'scripts/check-workspace-dependencies.mjs': [
    '73dc48694ca96af93c54b09fb5d3d78b118e90ef67da63e94d4896aa1cba200d',
    '747c3c83428003489abb997b4b3358d4f27b0d4c4d5113f18988023ff408fc83',
  ],
  'scripts/deployment-bundle.mjs': [
    'c5f934e35dc618739626d904a4c642b6e68683edf52dd856d69fa38e05819858',
    'c345987270dbbbb1afa801499c903c283a75313d61336208ab9a7973f663150e',
  ],
  'scripts/deployment-bundle.test.mjs': [
    '3e5ca2e1bc48c1fa363fdf5f91b9b981a611f2aac4b759a6e338b171b02c5212',
    'b68715bf1c1fde6a5941e4df75fd840fcdbe02daf4996f33851e667cd9be16f8',
  ],

  '.github/workflows/carding-car.yml': [
    '47f0097106baf378c851c8c5314721dce979053f04a31accb0cacdc37ce71a83',
    'ee77322f7414ab0a398af5c2d10763757ea679dbfa452520a653aacf43bdf05b',
  ],
  '.github/workflows/ci.yml': [
    'afe7f1175b964bf22719623a404307f62134156687c87f029dd55903b4252952',
    '6d1e55268d42feda5767a6e95c5986239a53b9bd8f922a231ba24f0d69cd2e29',
  ],
  '.github/workflows/pages-validate.yml': [
    '00fe3a8822311ee9faebcb20c32436b39ad612e482fb86ca86a90b3d202be713',
    '7a89794f444b282c995d86ddb8970c3e3ca8f9f4cea40fbf9d984a25348bcbc2',
  ],
  '.github/workflows/mobile.yml': [
    '6cb0350243edbf7a21c23e346fbc3d74da50464096866db09319364015e6933e',
    'a91039605ebf6eaa455d4159df9f061fcbb28c0dc14304d0c817d6d23766c7d4',
  ],
  'turbo.json': [
    'ed165c08070ddd40672167a48ca2d472f385a797813c8c08957aa76c1f8cc0d3',
    'ffa105c8ac861d36457df2da83998e2be0e35f6cb19cdf86e46d85844a997d75',
  ],
  'scripts/h5-game-build.mjs': [
    '81d761755a2fb16ed85a8704dc102901f4e375fae50a7b9fa008295dee228d2f',
    '7f8263e69185ccedb4ce2d89b0678535a9ee5c1be13f6c8c179be023a1557fc3',
  ],
  'scripts/h5-taptap-build.mjs': [
    'c7f3a83a2758605f8e51e51783bc5d181b05851ba9095b9f867cbe9d9c609749',
    '167851290dd00ba94817494e8549f8852e72a232ffe2f82aff13bfdff70d8df7',
  ],
  'scripts/h5-ad-config.mjs': [
    'fa85c578995d4a7972d75a336493546eb4fc6d9fe1e634ef4b405b14478a258a',
    'a501f7acb287811727d3868cade43a442260e5ebe426fe8ab7c3cab6db3ea5dd',
  ],
  'scripts/h5-taptap-matrix.mjs': [
    '7c50260480d71f034281c53e78d145fb7d679055698c898902a5a32aa1c02d3a',
    'b6cf3de496f6eeccf26a64c1c68c6dafbf2be06b0653db208c075a3f69a483fd',
  ],
};
export function homeboundCocosWiringOnly(file, before, after) {
  const hashes = homeboundCocosWiring[file];
  if (!hashes || typeof before !== 'string' || typeof after !== 'string') return false;
  const digest = (value) =>
    createHash('sha256').update(value.replaceAll('\r\n', '\n')).digest('hex');
  return digest(before) === hashes[0] && digest(after) === hashes[1];
}
const cocosWebSources = [
  'carding-car',
  'night-overwatch',
  'tianxia-chalu',
  'homebound-station',
].map((id) => `games/local/${id}`);

// The third Creator project adds one artifact route. Prove that every existing
// producer, consumer and build gate is byte-for-byte unchanged outside that route.

// Exact reviewed cache-only workflow changes. This proof works in bare planning
// jobs without YAML dependencies and cannot admit unrelated gates or permissions.
const cacheWorkflowHashes = {
  '.github/workflows/ci.yml': [
    'e75bfeb396879c1e6550f8e54d61639a7a7509476cd68d87b20243a2984111a7',
    'fbf776770868d3e3b36a7e73de682c736ce42ee21e19dcde6b4ab9edb8763eab',
  ],
  '.github/workflows/pages-validate.yml': [
    '29c49bdf51d0ff0a5182c21912b035e158f3345e02ec5fd143b5fa947ef2cb92',
    '10e5fa89f611a547ef1608d4c4802399d6ab830398cc53c8f42ff25a53c7b467',
  ],
};
function exactCacheWorkflow(file, before, after) {
  const hashes = cacheWorkflowHashes[file];
  const digest = (text) => createHash('sha256').update(text).digest('hex');
  return !!hashes && digest(before) === hashes[0] && digest(after) === hashes[1];
}

// CI orchestration only, from both 64aa76f4 (last successful dev CI) and 6dc7585f.
// Bind the entire workflow; an extra command, permission or missing phase is not covered.
export function ciStageWorkflowScope(before, after) {
  if (typeof before !== 'string' || typeof after !== 'string') return false;
  const digest = (text) => createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');
  return (
    digest(before) === 'd51bd123442361243b8226280bb7869d07d115602c44b97fc1a50af451fa76ed' &&
    digest(after) === '1e7599cffbc73f70405a415f0b09c8ec7d779387a6f568a3c8162a04a36571c3'
  );
}

// Reviewed role instructions only; extra permissions, hooks and MCP settings need a new review.
const codexAgentHashes = {
  '.codex/agents/repo_explorer.toml':
    'e087c33533d1fde39ce515ad7ec290178b45b9fd74ba25e3db39bef9a1023b01',
  '.codex/agents/implementer.toml':
    '46b95c6b6b342ffed23e9b3ef425a20cba9ea9ba0a9d91d67097583b8309e7b8',
  '.codex/agents/reviewer.toml': 'fb5948d12ef52eee6927ee12d632a1ac78ed1345a7cfbd70a4418596e64a55a3',
};

// Exact dependency-checkout repairs for the two bare planning jobs. Commands,
// permissions, conditions and all other workflow bytes remain producer-bound.
const planningCheckoutHashes = {
  '.github/workflows/ci.yml': {
    original: '7bf17695b0e6a9062ed81dd0d0b4febbfbb8318da4ef469aacbd411e64b29411',
    recursive: 'bf277f8e20d7991a89a3c6f4bd203a8d2f093eb1177c2d88025b92e42d11e87f',
    locked: 'fdc0f51bc350921e31064da3ef56acbe01ee9ec4d0865cc03c56ba82ab619fe3',
    parser: '287190c89099b2cd3fd55769341d7ea3dd210d92de0d8164d788492b2d177b5e',
    nativeGate: 'e764209ad852faa7018194ffcea21c6cdf0ebac287df66185be948bc5ad93add',
    qualityBudget: 'e75bfeb396879c1e6550f8e54d61639a7a7509476cd68d87b20243a2984111a7',
    partialBase: 'bf4633cebeee4c9b8b5c7030246e11a664ddd364a8f9901095720aca5ff88221',
    partial: 'abf95876beccbf0e41cb2f5b3b6544198bee5ff965215b564e0701bd0fb5666a',
  },
  '.github/workflows/pages.yml': {
    original: '9a2493b15ddd4d6379ae117a94bd4620acfaa20bdf084eab6e96c0a03ca92a51',
    recursive: 'dfe0f60b9f1a3f30806960dc98ccfaeb17f51c09f57f30a9d57c10129ca31d97',
    locked: '5ce491178ca6d928b02d3c74843aee8115f1b507763b377ba6a5033904ca151f',
    parser: 'da0f2c9bff3757127328d00834e7b160f2cf4e886035fe588e7a0bd2c91adc1e',
    partialBase: '228364b8559ed1ff24890594999d8c4adfff46af57b7f11a2861fb305a5e5419',
    partial: '9bce1a4826a02c17a4f368c2314746f623dc0938b453732a5234891c9e226985',
  },
};
// Only expand the bare planner's exact gitlink inputs; no recursive assets,
// remote branch updates, gate changes or other workflow edits are covered.
const planningCheckoutAnchor =
  '      - uses: actions/checkout@v5\n        with:\n          fetch-depth: 0\n      - uses: actions/setup-node@v6\n';
const recursivePlanningAnchor =
  '      - uses: actions/checkout@v5\n        with:\n          fetch-depth: 0\n          submodules: recursive\n      - uses: actions/setup-node@v6\n';
const lockedPlanningAnchor =
  '      - uses: actions/checkout@v5\n        with:\n          fetch-depth: 0\n      - name: Read locked Xiangqi workspace for planning\n        run: |\n          git -c url.https://github.com/.insteadOf=git@github.com: submodule update --init -- games/submodules/xiangqi-five\n      - uses: actions/setup-node@v6\n';
function exactPlanningCheckout(file, before, after) {
  const hashes = planningCheckoutHashes[file];
  if (!hashes) return false;
  const digest = (text) => createHash('sha256').update(text).digest('hex');
  const oldHash = digest(before),
    newHash = digest(after);
  // Keep full commit/tree history and the complete checkout; defer historical blobs only.
  if (oldHash === hashes.partialBase && newHash === hashes.partial) return true;
  // The planning job has no YAML dependency. This exact reviewed 40 -> 60
  // minute quality budget changes no command, condition or permission.
  if (oldHash === hashes.nativeGate && newHash === hashes.qualityBudget) return true;
  // Serial Castle Web checks exceed 60 minutes on software rendering; only grow the job budget.
  if (
    file === '.github/workflows/ci.yml' &&
    oldHash === '2ff2324c75192d8c49253c881d828e0d96843f55503dd0227dc2503212fab2a0' &&
    newHash === 'd983ffe34a30e39b8a8d4675197cb73b193ddea9a5adfaac4f95a42ad39926c9'
  )
    return true;
  // Exact reviewed parser bootstrap only; all execution, permissions and gates stay bound.
  if (
    [hashes.original, hashes.recursive, hashes.locked].includes(oldHash) &&
    [hashes.parser, hashes.nativeGate].includes(newHash)
  )
    return true;
  const anchor =
    oldHash === hashes.original
      ? planningCheckoutAnchor
      : oldHash === hashes.recursive
        ? recursivePlanningAnchor
        : null;
  const replacement =
    oldHash === hashes.original && newHash === hashes.recursive
      ? recursivePlanningAnchor
      : newHash === hashes.locked
        ? lockedPlanningAnchor
        : null;
  return (
    !!anchor &&
    !!replacement &&
    before.split(anchor).length === 2 &&
    after === before.replace(anchor, replacement)
  );
}

const validationHistoryFile = '.github/workflows/pages-validate.yml';
function exactValidationHistory(file, before, after) {
  if (file !== validationHistoryFile) return false;
  const digest = (text) => createHash('sha256').update(text).digest('hex');
  if (
    digest(before) !== 'd2f8f24d28033d97df0af0232d82580d5f2c97739424e48728a7d3c3c7f34543' ||
    digest(after) !== '29c49bdf51d0ff0a5182c21912b035e158f3345e02ec5fd143b5fa947ef2cb92'
  )
    return false;
  const marker = '  logic:\n';
  if (before.split(marker).length !== 2) return false;
  const offset = before.indexOf(marker);
  const anchor =
    '      - uses: actions/checkout@v5\n        with:\n          submodules: recursive\n';
  const tail = before.slice(offset);
  return (
    tail.includes(anchor) &&
    after ===
      before.slice(0, offset) +
        tail.replace(
          anchor,
          anchor.replace(
            '          submodules: recursive\n',
            '          submodules: recursive\n          fetch-depth: 0\n',
          ),
        )
  );
}

function literalDeclaration(source, name, allowBoolean = false) {
  const { parsers } = loadDependency('prettier/plugins/babel');
  const ast = parsers.babel.parse(source, {});
  const declarations = ast.program.body
    .map((node) => (node.type === 'ExportNamedDeclaration' ? node.declaration : node))
    .filter((node) => node?.type === 'VariableDeclaration')
    .flatMap((node) => node.declarations.map((entry) => ({ node, entry })))
    .filter(({ entry }) => entry.id.type === 'Identifier' && entry.id.name === name);
  assert(declarations.length === 1 && declarations[0].node.kind === 'const');
  const { entry } = declarations[0];
  function check(node) {
    if (node.type === 'ObjectExpression') {
      const names = node.properties.map((property) => {
        assert(property.type === 'ObjectProperty' && !property.computed);
        check(property.value);
        return property.key.name ?? property.key.value;
      });
      assert(new Set(names).size === names.length, 'Duplicate literal key');
    } else if (node.type === 'ArrayExpression') {
      for (const item of node.elements) check(item);
    } else
      assert(
        node.type === 'StringLiteral' || (allowBoolean && node.type === 'BooleanLiteral'),
        'Unreviewed executable literal',
      );
  }
  check(entry.init);
  return JSON.parse(
    source
      .slice(entry.init.start, entry.init.end)
      .replace(/'([^'\\]*)'/g, (_, value) => JSON.stringify(value))
      .replace(/([,{]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3')
      .replace(/,\s*([}\]])/g, '$1'),
  );
}

// These are the complete consumers of the shared competition adapters. The
// classifier verifies the builder's literal registry before using this boundary.
export const competitionConsumers = {
  'cops-robbers': 'games/local/cops-robbers',
  'cops-robbers-realtime': 'games/local/cops-robbers-realtime',
  'letters-words2': 'games/local/letters-words2',
  'vibeJam-myself-history-guess': 'games/local/vibeJam-myself-history-guess',
  'xiangqi-five': 'games/submodules/xiangqi-five',
};
export const competitionIdentityConsumers = Object.freeze({
  ...competitionConsumers,
  'carding-car': 'games/local/carding-car',
  'carrom-club': 'games/local/carrom-club',
  'flick-arena': 'games/local/flick-arena',
  'place-and-clear': 'games/local/place-and-clear',
  'cage-rescue': 'games/local/cage-rescue',
  'tower-brake': 'games/local/tower-brake',
  'wulong-city': 'games/local/wulong-city',
  'night-overwatch': 'games/local/night-overwatch',
});
export const competitionIdentityScopePaths = Object.freeze([
  'scripts/competition-connection.test.mjs',
  'platforms/competition/client.js',
  'scripts/competition-client.test.mjs',
  'platforms/competition/tests/identity.test.mjs',
]);
export const competitionIdentityMirrorPaths = Object.freeze([
  'games/local/flick-arena/competition-client.js',
  'games/local/place-and-clear/competition.js',
]);
const competitionProtocolTools = {
  'scripts/review-competition-kart-chess.mjs': 'xiangqi-five',
  'scripts/street-runs.integration.mjs': 'cops-robbers-realtime',
};
// These diagnostic runners exercise existing game/protocol pairs. They need
// their real consumers, not a directory-wide exemption for arbitrary scripts.
const competitionReviewTools = {
  'scripts/review-chase-update.mjs': ['cops-robbers', 'cops-robbers-realtime'],
  'scripts/review-competition-cops-letters.mjs': ['cops-robbers', 'letters-words2'],
  'scripts/review-competition-realtime-history.mjs': [
    'cops-robbers-realtime',
    'vibeJam-myself-history-guess',
  ],
};
export const competitionReviewScopePaths = Object.freeze(Object.keys(competitionReviewTools));
export const submoduleDialogScopePath = 'scripts/test-submodule-dialogs.mjs';
export const submoduleDialogIds = Object.freeze(['xiangqi-five']);
// Three H5 entrances use these services; Night additionally uses the identity adapter and calls.
// Native discovery separately follows real imports; these mappings preserve H5 checks.
export const tapServiceSharedScopePaths = Object.freeze([
  'platforms/taptap/browser-entry.mjs',
  'platforms/taptap/calls.mjs',
  'platforms/taptap/competition-identity.mjs',
  'platforms/taptap/game-services.mjs',
  'platforms/taptap/service-screen.mjs',
  'platforms/taptap/multiplayer-screen.mjs',
  'platforms/taptap/multiplayer-session.mjs',
]);
export const tapServiceConfigScopePath = 'scripts/taptap-services-config.mjs';
export const competitionServiceScopePaths = [
  ...Object.keys(competitionProtocolTools),
  'scripts/competition-service-config.mjs',
  'scripts/competition-service-config.test.mjs',
  'scripts/competition-service.browser.mjs',
  'scripts/competition-h5-service.mjs',
  'scripts/competition-game.mjs',
  'platforms/competition/service-config.js',
  'platforms/competition/.env.example',
  'scripts/h5-ad-config.mjs',
  'scripts/h5-ad-config.test.mjs',
  'scripts/h5-taptap.mjs',
  'scripts/h5-taptap-build.mjs',
  'scripts/check-tap-multiplayer.mjs',
  'scripts/build-games.mjs',
  'scripts/build-games.test.mjs',
  'game-build.local.mjs',
  'infra/builds/games.example.json',
  'infra/builds/games.example.mjs',
  'scripts/h5-taptap.browser.mjs',
  'scripts/h5-taptap-matrix.mjs',
  'scripts/h5-taptap-matrix.test.mjs',
  'scripts/h5-taptap-touch.mjs',
  'platforms/h5/rewarded-host.js',
  'scripts/competition-client.test.mjs',
  'scripts/competition.integration.mjs',
];
// These acceptance tools never start Docker/Chrome from hooks; their bounded unit contracts do.
export const h5AcceptanceScopePaths = Object.freeze([
  'scripts/h5-taptap-build.mjs',
  'scripts/h5-taptap-build.test.mjs',
  'scripts/h5-taptap-matrix.mjs',
  'scripts/h5-taptap-matrix.test.mjs',
  'scripts/h5-taptap.browser.mjs',
  'scripts/h5-taptap-touch.mjs',
  'scripts/h5-taptap-runtime.mjs',
  'scripts/h5-taptap-runtime.test.mjs',
  'scripts/h5-taptap-trace.mjs',
  'scripts/h5-taptap-trace.test.mjs',
]);
const competitionServiceIds = ['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'];
export const sixH5Ids = [
  'carding-car',
  'vibeJam-myself-history-guess',
  'wulong-city',
  'night-overwatch',
  'homebound-station',
  'travel-bund',
  'letters-words2',
];
// Historical six/five-game presets retain their existing exact membership.
const presetH5Ids = sixH5Ids.filter((id) => id !== 'homebound-station');
const sixH5Sources = sixH5Ids.map((id) => `games/local/${id}`);
// Flick uses these shared runtime ports, but is not part of the channel build presets.
const flickRewardRuntimePaths = [
  'platforms/h5/game-rewards.js',
  'platforms/h5/platform-ads.js',
  'platforms/h5/interstitial.js',
];
function flickRewardConsumers(file, games, packages) {
  if (!flickRewardRuntimePaths.includes(file)) return [];
  const source = 'games/local/flick-arena';
  const bindings = games.filter((game) => game.id === 'flick-arena' || game.source === source);
  if (!bindings.length && !packages.some((pkg) => pkg.dir === source)) return [];
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].id, 'flick-arena');
  assert.equal(bindings[0].source, source);
  assert.equal(packages.filter((pkg) => pkg.dir === source).length, 1);
  return [source];
}
export const sixH5ScopePaths = [
  'scripts/h5-game-build.mjs',
  'scripts/six-taptap-h5.test.mjs',
  'scripts/five-taptap-rewards.browser.mjs',
  'platforms/h5/interstitial.js',
  'platforms/h5/tests/interstitial.test.mjs',
  'scripts/h5-game-services.mjs',
  'scripts/h5-game-services.test.mjs',
  'platforms/competition/game-bootstrap.js',
  'platforms/competition/tests/game-bootstrap.test.mjs',
  'platforms/h5/game-rewards.js',
  'platforms/h5/tests/game-rewards.test.mjs',
  'infra/builds/six-taptap-h5.mjs',
];
const sharedH5PackagePaths = [
  'scripts/h5-ad-config.mjs',
  'scripts/h5-taptap-build.mjs',
  'scripts/h5-taptap-matrix.mjs',
  'scripts/build-games.mjs',
  'game-build.local.mjs',
];
function assertSixH5(games, packages, readHead) {
  const registered = literalDeclaration(readHead('scripts/h5-ad-config.mjs'), 'additionalH5Games');
  const extraIds = [
    'porcelain-puzzle',
    'ashfall-front',
    'merge-front',
    'tetracube',
    registered.includes('place-and-clear') ? 'place-and-clear' : 'three-choose-two',
    'bullet-garden',
    'tower-brake',
    'tianxia-chalu',
    'ball-roguelite',
    'flick-arena',
    'chase-thief',
    'moss-garden',
    'cage-rescue',
    'ember-bounce',
    'fold-the-world',
    'out-of-frame',
    'surprise-kept',
    'two-sided-box',
  ];
  assert.deepEqual(
    registered.filter((id) => !extraIds.includes(id)),
    sixH5Ids,
  );
  for (const id of extraIds.filter((id) => registered.includes(id))) {
    const source = `games/local/${id === 'moss-garden' ? 'game-moss-garden' : id}`;
    assert.equal(registered.filter((item) => item === id).length, 1);
    const entries = games.filter((g) => g.id === id || g.source === source);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, id);
    assert.equal(entries[0].source, source);
    assert.equal(packages.filter((p) => p.dir === source).length, 1);
  }
  for (const [i, id] of sixH5Ids.entries()) {
    assert.equal(games.filter((g) => g.id === id && g.source === sixH5Sources[i]).length, 1);
    assert.equal(packages.filter((p) => p.dir === sixH5Sources[i]).length, 1);
  }
  return [
    ...sixH5Sources,
    ...extraIds
      .filter((id) => registered.includes(id))
      .map((id) => `games/local/${id === 'moss-garden' ? 'game-moss-garden' : id}`),
  ];
}
export function sixH5PresetOnly(source, five = false) {
  try {
    const ast = loadDependency('prettier/plugins/babel').parsers.babel.parse(source, {}).program
      .body;
    assert.equal(ast.length, 1);
    assert.equal(ast[0].type, 'ExportDefaultDeclaration');
    const literal = (node) => {
      if (['StringLiteral', 'BooleanLiteral', 'NumericLiteral'].includes(node.type))
        return node.value;
      if (node.type === 'ArrayExpression') return node.elements.map(literal);
      assert.equal(node.type, 'ObjectExpression');
      const result = {};
      for (const p of node.properties) {
        assert(p.type === 'ObjectProperty' && !p.computed && !p.shorthand);
        const key = p.key.name ?? p.key.value;
        assert(!Object.hasOwn(result, key));
        result[key] = literal(p.value);
      }
      return result;
    };
    const cfg = literal(ast[0].declaration);
    assert.deepEqual(Object.keys(cfg).sort(), [
      'ads',
      ...(five ? ['apiUrl'] : []),
      'backend',
      'games',
      'targets',
      'version',
    ]);
    if (five) assert.equal(cfg.apiUrl, 'https://api.nenggongzhiren.cn/small-games/v1');
    assert.equal(cfg.version, 2);
    const ids = five ? presetH5Ids.filter((id) => id !== 'travel-bund') : presetH5Ids;
    assert.deepEqual(cfg.games, ids);
    assert.deepEqual(cfg.backend, [five]);
    assert(
      cfg.ads.length > 0 && cfg.ads.length <= 2 && cfg.ads.every((x) => typeof x === 'boolean'),
    );
    assert.equal(cfg.targets.length, 1);
    const target = cfg.targets[0];
    const identity = Object.hasOwn(target, 'tapIdentityAppIds');
    assert.deepEqual(Object.keys(target).sort(), [
      'adUnits',
      'platform',
      ...(identity ? ['tapIdentityAppIds'] : []),
      'type',
    ]);
    if (identity) {
      assert(five);
      assert.deepEqual(Object.keys(target.tapIdentityAppIds), ['night-overwatch']);
      assert(
        typeof target.tapIdentityAppIds['night-overwatch'] === 'string' &&
          /^tap[A-Za-z0-9_-]{4,96}$/.test(target.tapIdentityAppIds['night-overwatch']),
      );
    }
    assert.equal(target.platform, 'taptap');
    assert.equal(target.type, 'h5');
    assert.deepEqual(Object.keys(target.adUnits).sort(), [...ids].sort());
    assert(
      Object.values(target.adUnits).every((x) => typeof x === 'string' && /^[\w-]{0,160}$/.test(x)),
    );
    return true;
  } catch {
    return false;
  }
}
export function competitionServiceConfigOnly(file, before, after) {
  try {
    const previous = JSON.parse(before),
      current = JSON.parse(after);
    if (file === 'package.json') {
      assert.equal(current.scripts['competition:game'], 'node scripts/competition-game.mjs');
      if (!Object.hasOwn(previous.scripts, 'competition:game'))
        delete current.scripts['competition:game'];
    } else if (file === 'turbo.json') {
      const inputs = [
        'scripts/competition-service-config.mjs',
        'scripts/competition-h5-service.mjs',
        'scripts/h5-ad-config.mjs',
        'platforms/competition/service-config.js',
      ];
      const adVariables = [
        'H5_ADS_ENABLED',
        'TAPTAP_COPS_ROBBERS_AD_UNIT_ID',
        'TAPTAP_COPS_ROBBERS_REALTIME_AD_UNIT_ID',
        'TAPTAP_XIANGQI_FIVE_AD_UNIT_ID',
      ];
      const variables = [
        'COMPETITION_SERVICE_ENABLED',
        'COMPETITION_PUBLIC_API_URL',
        ...adVariables,
      ];
      assert.equal(new Set(current.globalDependencies).size, current.globalDependencies.length);
      assert.equal(new Set(current.tasks.build.env).size, current.tasks.build.env.length);
      for (const value of inputs) assert(current.globalDependencies.includes(value));
      for (const value of variables) assert(current.tasks.build.env.includes(value));
      current.globalDependencies = current.globalDependencies.filter(
        (value) => !inputs.includes(value) || previous.globalDependencies.includes(value),
      );
      current.tasks.build.env = current.tasks.build.env.filter(
        (value) => !variables.includes(value) || previous.tasks.build.env.includes(value),
      );
      for (const task of [
        'dev',
        '@coffeeeeffoc/shell-web#build',
        '@coffeeeeffoc/shell-web#build:pages',
      ]) {
        assert.deepEqual(current.tasks[task].env, variables);
        current.tasks[task].env = current.tasks[task].env.filter(
          (value) => !adVariables.includes(value) || previous.tasks[task]?.env?.includes(value),
        );
        if (!Object.hasOwn(previous.tasks[task], 'env')) delete current.tasks[task].env;
      }
    } else return false;
    return isDeepStrictEqual(previous, current);
  } catch {
    return false;
  }
}

// Exact existing integration edits reviewed with this service configuration change.
// Later unrelated deployment/native edits must establish their own consumer scope.
const competitionServiceIntegrations = {
  'scripts/deployment-bundle.mjs': [
    'f05a5a3385373da9c1170634def557b1d8d3979867c2f5c1d203c94d7acd3b83',
    '795d32fa380d6f50e9aac24969d78c9df7646ad86470749e3a6cb77eb9d21dfc',
  ],
  'scripts/competition-gateway.mjs': [
    'bbfc69bf5d9c9c9a2f1c3d28ab245024dc78030e7eec18953a9705ccccd16f92',
    '35c4d646992f89799a559091f793518f1da72d8c675c0cab73a0a6146e213e51',
  ],
  'scripts/deploy-tencent.mjs': [
    'e8623f1a812418ffcbf56519fb6ac72dcc163960421a7fe2efe6eee3c15bb825',
    '3e7e728a461a30c24baaee7462b0ba8ddc715dfb0694776ea61843ce197e1f4a',
  ],
  'platforms/competition/client.js': [
    '445d0b6f8f81cc58e2c84d9dfd5951e1fbf7fb7cc93883a50772ba172841637d',
    '8426f3cd53e8eccafabe63ab626a1c039e7df44fa88000f8f4978934ae263649',
  ],
  'platforms/competition/native.js': [
    '37e2f19ed16a3d6c01ecbbf5d953265f1134a560af8addb2dcf890d37630f2c8',
    'de8d7e999b3fb0fb9cfd28e9c2425594ce8f30ee62ac11225464845f41b8bfd8',
  ],
  'platforms/competition/xiangqi-five/native.js': [
    'b1cfc9787be26a3f72471fa929f0a2cf258579df6ee334090662fb6affba98a6',
    'ce106bb530030e833ec00cc6ec42b266cd4d568a0abccc627ff6b799c026e9dc',
  ],
  'platforms/competition/xiangqi-five/tests/native.test.mjs': [
    '79aae92d0c368a95ec88bd1eff10d51156b4cd1d97170536ead1d5414baaa9e2',
    'aa9dd9390d54dc91799ff408cd55d6caa2bfb66a0b8191f4121ae5b28c80a802',
  ],
};
function competitionServiceIntegration(file, before, after) {
  const expected = competitionServiceIntegrations[file];
  const digest = (text) => createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');
  return (
    expected &&
    typeof before === 'string' &&
    expected[0] === digest(before) &&
    expected[1] === digest(after)
  );
}

// Only the reviewed pnpm 12 unsupported-option removal. Both original and
// candidate bytes are pinned; other deployment changes keep their wider gates.
const backendInstallerChanges = {
  'infra/tencent/Dockerfile': {
    before: 'eefbccfbb24da204b16d4302dd98dc9b732df71243bbfae99753da06e6ffb8b4',
    after: '030b985d734218108ed5ee550bb1a881ede4c579d53f2c0cc358161695d449a7',
    consumers: ['services/runtime-api', 'services/kart-server'],
  },
  'scripts/deployment-bundle.mjs': {
    before: '795d32fa380d6f50e9aac24969d78c9df7646ad86470749e3a6cb77eb9d21dfc',
    after: '104b56b34db09ade741e493a0ab6bfea051106deee89f2bf88152f07f93db0e4',
    consumers: [
      'services/runtime-api',
      'services/management-api',
      'services/kart-server',
      'services/tianxia-server',
    ],
  },
};
function backendInstallerOnly(file, before, after) {
  const expected = backendInstallerChanges[file];
  const digest = (source) =>
    createHash('sha256').update(source.replaceAll('\r\n', '\n')).digest('hex');
  return expected && digest(before) === expected.before && digest(after) === expected.after;
}
const sharedPresentationFiles = [
  'platforms/competition/avatars.js',
  'platforms/competition/format.js',
];
const h5Files = [
  ...sharedPresentationFiles,
  'scripts/competition-connection.browser.mjs',
  'platforms/competition/connection-info.js',
  'platforms/competition/h5.js',
  'platforms/competition/h5.css',
  'platforms/competition/profile-dom.js',
  'scripts/test-competition-dialogs.mjs',
];
const streetFiles = [
  'platforms/competition/street-pages.js',
  'platforms/competition/street.css',
  'platforms/competition/tests/street-admission.test.mjs',
];
const nativeFiles = [
  ...sharedPresentationFiles,
  'platforms/competition/native.js',
  'scripts/competition-native-smoke.mjs',
];
const builder = 'scripts/competition-build.mjs';
const lettersTests = [
  'scripts/letters-words2-competition-mobile.browser.mjs',
  'scripts/letters-words2-competition-renderer.test.mjs',
  'scripts/letters-words2-iframe.browser.mjs',
];
const competitionFiles = [...h5Files, ...nativeFiles, builder, ...lettersTests];
const flickSource = 'games/local/flick-arena';
// These three reviewed integration deltas leave commands, proxy policy and all
// other dependency permissions byte-for-byte unchanged. Pin the real baseline
// as well as the single replacement so comments cannot impersonate an anchor.
const flickIntegrationChanges = {
  'scripts/deploy-tencent.mjs': {
    base: '02acecb81829ab2ee56e628653a7e4b37b92098067531fd770c535db889a2a34',
    anchor: "    'services/runtime-api/rules',\n",
    addition: "    'games/local/flick-arena/src',\n",
    consumers: [flickSource, 'services/runtime-api'],
  },
  'scripts/competition-gateway.mjs': {
    base: '4d6b9bac6b42679f28489663a0ac05e47bec4429a9c5488653499c2976be5b7e',
    anchor: "  '.js': 'text/javascript',\n",
    addition: "  '.mjs': 'text/javascript',\n",
    consumers: [flickSource, 'apps/shell-web'],
  },
  'scripts/check-workspace-dependencies.mjs': {
    base: '365ff86b574b7c082275d886ce7f388a182dba8b6382c28013dc3616fba7ef46',
    anchor: "  'services/runtime-api/rules/chess.mjs -> games/submodules/xiangqi-five/game.js',\n",
    addition:
      "  'services/runtime-api/rules/flick.mjs -> games/local/flick-arena/src/core.mjs',\n" +
      "  'services/runtime-api/rules/flick.mjs -> games/local/flick-arena/src/tournament.mjs',\n",
    consumers: [flickSource, 'services/runtime-api'],
  },
};

export function flickIntegrationFileScope(file, before, after) {
  const change = flickIntegrationChanges[file];
  return Boolean(
    change &&
      typeof before === 'string' &&
      createHash('sha256').update(before).digest('hex') === change.base &&
      before.split(change.anchor).length === 2 &&
      !before.includes(change.addition) &&
      after === before.replace(change.anchor, change.anchor + change.addition),
  );
}

const threeChooseTwoMigration = 'infra/migrations/012-three-choose-two.sql';
const threeChooseTwoBackendChanges = {
  'scripts/competition.mjs': [
    [
      "    await readFile(new URL('../infra/migrations/011-competition-profiles.sql', import.meta.url)),\n    mode === 'test-db' ? 'competition_test' : 'small_games',\n  );\n",
      "    await readFile(new URL('../infra/migrations/011-competition-profiles.sql', import.meta.url)),\n    mode === 'test-db' ? 'competition_test' : 'small_games',\n  );\n  await psql(\n    await readFile(new URL('../infra/migrations/012-three-choose-two.sql', import.meta.url)),\n    mode === 'test-db' ? 'competition_test' : 'small_games',\n  );\n",
    ],
  ],
  'scripts/platform.mjs': [
    [
      "    '011-competition-profiles.sql',\n",
      "    '011-competition-profiles.sql',\n    '012-three-choose-two.sql',\n",
    ],
  ],
  'scripts/deploy-tencent.mjs': [
    [
      "    'services/runtime-api/rules',\n",
      "    'services/runtime-api/rules',\n    'games/local/three-choose-two/src',\n",
    ],
    [
      "  for (const file of ['010-competition.sql', '011-competition-profiles.sql'])\n",
      "  for (const file of [\n    '010-competition.sql',\n    '011-competition-profiles.sql',\n    '012-three-choose-two.sql',\n  ])\n",
    ],
  ],
};

/** Exact reviewed additions only; credentials, commands and all other bytes stay bound. */
export function threeChooseTwoBackendFileScope(file, before, after) {
  if (file === threeChooseTwoMigration) {
    return (
      before === null &&
      createHash('sha256').update(after).digest('hex') ===
        'b45b1af51c76770d1141b00912696dacd31f05c63c122be61a3a48e0c9a41898'
    );
  }
  const changes = threeChooseTwoBackendChanges[file];
  if (!changes || typeof before !== 'string') return false;
  let expected = before;
  for (const [oldText, newText] of changes) {
    if (expected.split(oldText).length !== 2 || expected.includes(newText)) return false;
    expected = expected.replace(oldText, newText);
  }
  return expected === after;
}

const playerSessionMigration = 'infra/migrations/014-player-sessions.sql';
const playerSessionChanges = {
  'scripts/competition.mjs': [
    '64c72ea195ed65e748739539f8beab44f058409c4eeb0ac61514922d28ea92da',
    "  await psql(\n    await readFile(new URL('../infra/migrations/014-player-sessions.sql', import.meta.url)),\n    mode === 'test-db' ? 'competition_test' : 'small_games',\n  );\n",
  ],
  'scripts/platform.mjs': [
    '46ded3328e004801c67707845da131618f5710ce45c454defc9b6dba651212d6',
    "    '014-player-sessions.sql',\n",
  ],
  'scripts/deploy-tencent.mjs': [
    '157e7c41e678015a743abc54c3d265949b8a5c98ad36e8ca6f7db6c10a5ca2c8',
    "    '014-player-sessions.sql',\n",
  ],
};
export function playerSessionBackendFileScope(file, before, after) {
  const normalize = (value) => value?.replaceAll('\r\n', '\n');
  before = normalize(before);
  after = normalize(after);
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  if (file === playerSessionMigration)
    return (
      before == null &&
      digest(after) === 'db03e89f74f8dd7f04197182d2353f1e59104b6a5f245f34a749743e77cdfaa2'
    );
  const review = playerSessionChanges[file];
  if (!review || typeof before !== 'string' || typeof after !== 'string') return false;
  const [baseHash, addition] = review;
  return (
    digest(before) === baseHash &&
    after.split(addition).length === 2 &&
    after.replace(addition, '') === before
  );
}
export function anonymousPagesFileScope(file, before, after) {
  if (file !== '.github/workflows/pages-validate.yml' || typeof before !== 'string') return false;
  before = before.replaceAll('\r\n', '\n');
  after = after.replaceAll('\r\n', '\n');
  const addition =
    "      COMPETITION_SERVICE_ENABLED: '1'\n      COMPETITION_PUBLIC_API_URL: 'https://api.nenggongzhiren.cn/small-games/v1'\n";
  return (
    createHash('sha256').update(before).digest('hex') ===
      '195f158be27400dab8f9b73e263d66854375add335df1442cb4464a3495e6809' &&
    after.split(addition).length === 3 &&
    after.replaceAll(addition, '') === before
  );
}

const identityMigration = 'infra/migrations/013-competition-identities.sql';
const identityMigrationHash = '807825e0f99eb41b0ad97c0b1a7a2a98d5cbf1ad0d9d7406e08c2ed557c0978f';
const identityBackendChanges = {
  'scripts/competition.mjs': [
    '4d6d7118079c0e63e9399dc335b4e754c3bfe43125c3a09ac3cf2cd0a18b5d86',
    '64c72ea195ed65e748739539f8beab44f058409c4eeb0ac61514922d28ea92da',
    "    await readFile(new URL('../infra/migrations/012-three-choose-two.sql', import.meta.url)),\n    mode === 'test-db' ? 'competition_test' : 'small_games',\n  );\n",
    "  await psql(\n    await readFile(new URL('../infra/migrations/013-competition-identities.sql', import.meta.url)),\n    mode === 'test-db' ? 'competition_test' : 'small_games',\n  );\n",
  ],
  'scripts/platform.mjs': [
    '34c2de49422a98c5574083fe6b43e785c2c521bc2ae3ce3674091b2767bca1e6',
    '46ded3328e004801c67707845da131618f5710ce45c454defc9b6dba651212d6',
    "    '012-three-choose-two.sql',\n",
    "    '013-competition-identities.sql',\n",
  ],
  'scripts/deploy-tencent.mjs': [
    '3e7e728a461a30c24baaee7462b0ba8ddc715dfb0694776ea61843ce197e1f4a',
    '85e9bc13b35896c286f16282109825d08c542c203fb13a5a69efb4d0d99a7aea',
    "    '012-three-choose-two.sql',\n",
    "    '013-competition-identities.sql',\n",
  ],
};
/** This additive identity migration cannot classify another migration or deployment edit. */
export function identityBackendFileScope(file, before, after) {
  const digest = (text) => createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');
  if (file === identityMigration) return before === null && digest(after) === identityMigrationHash;
  const review = identityBackendChanges[file];
  if (!review || typeof before !== 'string' || typeof after !== 'string') return false;
  const [baseHash, headHash, anchor, addition] = review;
  before = before.replaceAll('\r\n', '\n');
  after = after.replaceAll('\r\n', '\n');
  return (
    digest(before) === baseHash &&
    digest(after) === headHash &&
    before.split(anchor).length === 2 &&
    !before.includes(addition) &&
    after === before.replace(anchor, anchor + addition)
  );
}

export const gameServiceScopePaths = Object.freeze([
  'platforms/competition/game-services.js',
  'platforms/competition/tests/game-services.test.mjs',
  'scripts/competition-gateway.mjs',
  'scripts/competition-gateway.test.mjs',
]);
export const nightRuntimeInputs = Object.freeze(
  ['Armory', 'Duel', 'Replay', 'Simulation', 'MissionCatalog', 'Data', 'Flight'].map(
    (name) => `games/local/night-overwatch/assets/scripts/core/${name}.ts`,
  ),
);
export function nightServiceTurboOnly(before, after) {
  try {
    const base = JSON.parse(before),
      head = JSON.parse(after);
    const key = '@coffeeeeffoc/night-overwatch#build';
    const previous = {
      dependsOn: ['^build'],
      outputs: ['dist/**'],
      env: ['COCOS_CREATOR', 'NIGHT_OVERWATCH_PREBUILT_DIR'],
      inputs: ['$TURBO_DEFAULT$', '$TURBO_ROOT$/games/local/night-overwatch/.prebuilt/**'],
    };
    assert.deepEqual(base.tasks[key], previous);
    assert.deepEqual(head.tasks[key], {
      ...previous,
      env: [
        ...previous.env,
        'COMPETITION_SERVICE_ENABLED',
        'COMPETITION_PUBLIC_API_URL',
        'COMPETITION_LOCAL_BACKEND',
      ],
      inputs: [
        ...previous.inputs,
        ...[
          'scripts/h5-game-services.mjs',
          'scripts/competition-service-config.mjs',
          'platforms/competition/client.js',
          'platforms/competition/game-services.js',
          'platforms/competition/game-bootstrap.js',
        ].map((file) => '$TURBO_ROOT$/' + file),
      ],
    });
    head.tasks[key] = previous;
    return isDeepStrictEqual(base, head);
  } catch {
    return false;
  }
}
const nightImports = [
  'services/runtime-api/rules/night.mjs -> games/local/night-overwatch/assets/scripts/core/Duel.ts',
  'services/runtime-api/rules/night-ranked.mjs -> games/local/night-overwatch/assets/scripts/core/Replay.ts',
  'services/runtime-api/rules/night-ranked.mjs -> games/local/night-overwatch/assets/scripts/core/MissionCatalog.ts',
];
/** Exact additions only: unrelated deployment or boundary changes remain unclassified. */
export function nightBackendFileScope(file, before, after) {
  if (typeof before !== 'string' || typeof after !== 'string') return false;
  before = before.replaceAll('\r\n', '\n');
  after = after.replaceAll('\r\n', '\n');
  let anchor, addition;
  if (file === 'scripts/deploy-tencent.mjs') {
    const digest = (text) => createHash('sha256').update(text).digest('hex');
    // Saved CI/Pages base already copies the other Night cores; only Armory was added.
    if (
      digest(before) === '96ff4938768af03e86865766c36b93f308d0c2348aef7fdb34b90eaa5d1c455b' &&
      digest(after) === '3b1fe63a108fa03172c6ddf6f2e9884510a4e3c7d9a182ccdd2b19d9fc6df88e'
    )
      return true;
    anchor = "    'services/runtime-api/rules',\n";
    addition = nightRuntimeInputs.map((value) => `    '${value}',\n`).join('');
  } else if (file === 'scripts/check-workspace-dependencies.mjs') {
    anchor = 'const REPOSITORY_IMPORTS = new Set([\n';
    addition = [
      ...nightImports,
      'games/local/night-overwatch/scripts/build.mjs -> scripts/h5-game-services.mjs',
    ]
      .map((value) => `  '${value}',\n`)
      .join('');
  } else return false;
  return (
    before.split(anchor).length === 2 &&
    !before.includes(addition) &&
    after === before.replace(anchor, anchor + addition)
  );
}
export function matchGatewayFileScope(before, after) {
  if (typeof before !== 'string' || typeof after !== 'string') return false;
  const anchor = String.raw`(?:\/leaderboards\/`;
  return (
    before.split(anchor).length === 2 &&
    after === before.replace(anchor, String.raw`(?:\/match|\/leaderboards\/`)
  );
}
export function nightGatewayFileScope(before, after) {
  if (typeof before !== 'string' || typeof after !== 'string') return false;
  const digest = (source) =>
    createHash('sha256').update(source.replaceAll('\r\n', '\n')).digest('hex');
  // Reviewed resume and later wallet/room routes; transport and other paths stay bound.
  const base = digest(before),
    head = digest(after);
  return [
    [
      '6173996a7d134555386f652d18e552ae9e70998f6868e52be5b1c9736317ca3a',
      'aa9d6cca578c5edf7f4a81865fd7c97aa20157fcf88e0e9ce860cbbe1648ddfd',
    ],
    [
      'aa9d6cca578c5edf7f4a81865fd7c97aa20157fcf88e0e9ce860cbbe1648ddfd',
      '5058a2adf4cb1fc6b3637f932175e33da718d508d3ca3d6b617b09a87b92a66f',
    ],
  ].some(([expectedBase, expectedHead]) => base === expectedBase && head === expectedHead);
}
function assertNightRuntimeConsumer(games, packages, readHead) {
  const source = 'games/local/night-overwatch';
  assert.equal(
    games.filter((game) => game.id === 'night-overwatch' && game.source === source).length,
    1,
  );
  for (const dir of [source, 'services/runtime-api'])
    assert.equal(packages.filter((pkg) => pkg.dir === dir).length, 1);
  for (const edge of nightImports) {
    const [from, to] = edge.split(' -> ');
    assert(importsModule(readHead(from), '../../../' + to));
  }
  for (const file of nightRuntimeInputs) assert(readHead(file));
}
const rankedConsumers = {
  'cage-rescue': 'games/local/cage-rescue',
  'tower-brake': 'games/local/tower-brake',
};
const rankedInputs = [
  'games/local/cage-rescue/src/core.mjs',
  'games/local/cage-rescue/src/levels.mjs',
  'games/local/tower-brake/engine.mjs',
  'games/local/tower-brake/levels.mjs',
];
function assertRankedConsumers(games, packages, readHead) {
  for (const [id, source] of Object.entries(rankedConsumers)) {
    assert(games.filter((game) => game.id === id || game.source === source).length === 1);
    assert(games.some((game) => game.id === id && game.source === source));
    assert(packages.some((pkg) => pkg.dir === source));
  }
  assert(packages.some((pkg) => pkg.dir === 'services/runtime-api'));
  const rule = readHead('services/runtime-api/rules/ranked-games.mjs');
  for (const input of [rankedInputs[0], ...rankedInputs.slice(2)])
    assert(importsModule(rule, '../../../' + input));
  assert(importsModule(readHead(rankedInputs[0]), './levels.mjs'));
  assert(importsModule(readHead(rankedInputs[2]), './levels.mjs'));
}
function hasUrlReference(source, target) {
  let found = false;
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (
      node.type === 'NewExpression' &&
      node.callee?.name === 'URL' &&
      node.arguments?.[0]?.type === 'StringLiteral' &&
      node.arguments[0].value === target
    )
      found = true;
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(parsedSource(source));
  return found;
}
function hasCopyReference(source, from, to) {
  let count = 0;
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (
      node.type === 'CallExpression' &&
      node.callee?.name === 'cp' &&
      node.arguments?.[0]?.type === 'NewExpression' &&
      node.arguments[0].callee?.name === 'URL' &&
      node.arguments[0].arguments?.[0]?.value === from &&
      node.arguments?.[1]?.type === 'NewExpression' &&
      node.arguments[1].callee?.name === 'URL' &&
      node.arguments[1].arguments?.[0]?.value === to
    )
      count++;
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(parsedSource(source));
  return count === 1;
}
function assertGameServiceCopies(readHead) {
  const service = readHead('platforms/competition/game-services.js');
  assert.deepEqual(
    parsedSource(service)
      .body.filter((node) => node.type === 'ImportDeclaration')
      .map((node) => node.source.value),
    ['./client.js'],
  );
  assert(!/\bimport\s*\(|\brequire\s*\(/m.test(service));
  for (const [id, source] of Object.entries(rankedConsumers)) {
    const build = readHead(source + '/build.mjs');
    const creator = id === 'tower-brake' && importsModule(build, './scripts/build.mjs');
    if (creator) {
      const manifest = JSON.parse(readHead(source + '/package.json'));
      assert.equal(manifest.creator?.version, '3.8.8');
      assert.equal(manifest.scripts?.build, 'node scripts/build.mjs web-mobile');
      assert.equal(manifest.scripts?.dev, 'node scripts/serve.mjs');
      for (const file of ['game-services.js', 'client.js'])
        assert(
          hasCopyReference(
            readHead(source + '/scripts/build.mjs'),
            '../../../../platforms/competition/' + file,
            file,
          ),
        );
      assert(importsModule(readHead(source + '/startup/host.js'), './game-services.js'));
      assert(importsModule(readHead(source + '/server.mjs'), './scripts/serve.mjs'));
      assert(
        readHead(source + '/scripts/serve.mjs').includes(
          "desktop ? '../build/web-desktop/' : '../dist/'",
        ),
      );
    } else {
      for (const file of ['game-services.js', 'client.js'])
        assert(hasCopyReference(build, '../../../platforms/competition/' + file, file));
      const server = readHead(source + '/server.mjs');
      assert.equal(
        server.split("pathname === '/client.js' && !process.argv.includes('--dist')").length,
        2,
      );
      assert(hasUrlReference(server, '../../../platforms/competition/client.js'));
    }
    const turbo = JSON.parse(readHead(source + '/turbo.json'));
    assert.deepEqual(turbo.extends, ['//']);
    const inputs = turbo.tasks?.build?.inputs;
    assert(Array.isArray(inputs) && new Set(inputs).size === inputs.length);
    for (const input of [
      '$TURBO_DEFAULT$',
      '$TURBO_ROOT$/platforms/competition/client.js',
      '$TURBO_ROOT$/platforms/competition/game-services.js',
    ])
      assert(inputs.includes(input));
    const entry = id === 'cage-rescue' ? '/src/main.mjs' : '/main.mjs';
    if (!creator)
      assert(
        hasUrlReference(
          readHead(source + entry),
          id === 'cage-rescue' ? '../game-services.js' : './game-services.js',
        ),
      );
  }
}

/** One complete client boundary shared by general and native classifiers. */
export function competitionIdentityFileScope({ games, packages, readBase, readHead }) {
  const file = 'platforms/competition/client.js';
  for (const reader of [readBase, readHead]) {
    const text = reader(file);
    assert(typeof text === 'string' && text.trim());
    assert(!/\bimport\b|\brequire\s*\(|\bexport\s*[^;\n]*\bfrom\s*['"]/m.test(text));
  }
  assertCompetitionRegistry(readHead, games);
  for (const [id, source] of Object.entries(competitionIdentityConsumers)) {
    assert.equal(games.filter((game) => game.id === id).length, 1);
    assert.equal(games.filter((game) => game.source === source).length, 1);
    assert.equal(games.filter((game) => game.id === id && game.source === source).length, 1);
    assert.equal(packages.filter((pkg) => pkg.dir === source).length, 1);
  }
  for (const copy of competitionIdentityMirrorPaths) assert.equal(readHead(copy), readHead(file));
  assert(
    hasUrlReference(
      readHead('games/local/carding-car/scripts/build.mjs'),
      '../../../../platforms/competition/client.js',
    ),
  );
  assert(
    hasUrlReference(
      readHead('games/local/carrom-club/network-config.mjs'),
      '../../../platforms/competition/client.js',
    ),
  );
  assertGameServiceCopies(readHead);
  return Object.values(competitionIdentityConsumers);
}
/** Only the four new shared rule inputs may be added to the deployment list. */
export function rankedDeploymentFileScope(before, after) {
  const anchor = "    'services/runtime-api/rules',\n";
  const addition = rankedInputs.map((file) => `    '${file}',\n`).join('');
  return (
    typeof before === 'string' &&
    before.split(anchor).length === 2 &&
    rankedInputs.every((file) => !before.includes(file)) &&
    after === before.replace(anchor, anchor + addition)
  );
}
function rankedGatewayFileScope(before, after) {
  const digest = (source) => createHash('sha256').update(source).digest('hex');
  // Reviewed main guard/extracted public predicate; legacy proxy, static files and
  // kart upgrade handling are unchanged. Any additional executable delta blocks.
  return (
    digest(before) === '2c9bcc4c116b52553c317da5ee4c83959f988d4d4f02cff55a22a1b273efafc8' &&
    digest(after) === 'bbfc69bf5d9c9c9a2f1c3d28ab245024dc78030e7eec18953a9705ccccd16f92'
  );
}

/** Add only the two identity routes; static serving, proxy policy and other paths remain bound. */
export function identityGatewayFileScope(before, after) {
  if (typeof before !== 'string' || typeof after !== 'string') return false;
  before = before.replaceAll('\r\n', '\n');
  after = after.replaceAll('\r\n', '\n');
  const digest = (source) => createHash('sha256').update(source).digest('hex');
  const anchor = String.raw`sessions\/(?:guest|platform)`;
  const scoped = String.raw`sessions\/(?:guest|platform|refresh|upgrade)`;
  if (digest(before) === '1b2e94613c2985e2d9f7ac9defe98eba5b001d77150a58c756bb6b9618ad71f6')
    return (
      before.split(scoped).length === 2 &&
      after ===
        before.replace(scoped, String.raw`sessions\/(?:guest|platform|refresh|upgrade|logout)`)
    );
  return (
    digest(before) === '35c4d646992f89799a559091f793518f1da72d8c675c0cab73a0a6146e213e51' &&
    digest(after) === '1b2e94613c2985e2d9f7ac9defe98eba5b001d77150a58c756bb6b9618ad71f6' &&
    before.split(anchor).length === 2 &&
    after === before.replace(anchor, String.raw`sessions\/(?:guest|platform|refresh|upgrade)`)
  );
}

const carromSource = 'games/local/carrom-club';
const carromCore = `${carromSource}/src/core.mjs`;
const carromContent = `${carromSource}/src/content.mjs`;
const carromFriendsCore = `${carromSource}/src/friends-core.mjs`;
const carromFriendsContent = `${carromSource}/src/friends-content.mjs`;
const carromRule = 'services/runtime-api/rules/carrom.mjs';
const carromDeployFile = 'scripts/deploy-tencent.mjs';
const carromDeployAnchor =
  "  for (const name of [\n    'services/runtime-api/dist',\n    'services/runtime-api/rules',\n";
const carromDeployAddition = `    '${carromCore}',\n    '${carromContent}',\n`;
const carromFriendsDeployAnchors = [
  carromDeployAnchor + carromDeployAddition,
  carromDeployAnchor + "    'games/local/flick-arena/src',\n" + carromDeployAddition,
];
const carromFriendsDeployAddition =
  `    '${carromFriendsCore}',\n` + `    '${carromFriendsContent}',\n`;

function carromFriendsDeploymentScope(before, after) {
  if (typeof before !== 'string') return false;
  // Accept the original list or the already-merged Flick input, keeping every
  // surrounding byte (including that input) fixed to this candidate's baseline.
  const anchors = carromFriendsDeployAnchors.filter((anchor) => before.includes(anchor));
  const anchor = anchors[0];
  return (
    anchors.length === 1 &&
    before.split(anchor).length === 2 &&
    !before.includes(carromFriendsCore) &&
    !before.includes(carromFriendsContent) &&
    after === before.replace(anchor, anchor + carromFriendsDeployAddition)
  );
}

/** Only add the reviewed rule inputs; deployment commands and secrets stay bound. */
export function carromBackendFileScope(file, before, after) {
  return (
    file === carromDeployFile &&
    typeof before === 'string' &&
    ((before.split(carromDeployAnchor).length === 2 &&
      !before.includes(carromCore) &&
      !before.includes(carromContent) &&
      after === before.replace(carromDeployAnchor, carromDeployAnchor + carromDeployAddition)) ||
      carromFriendsDeploymentScope(before, after))
  );
}

function cumulativeRuntimeDeploymentScope(file, before, after) {
  if (file !== carromDeployFile || typeof before !== 'string') return false;
  // A push can span all three reviewed additions; prove each intermediate tree.
  const carrom = before.replace(carromDeployAnchor, carromDeployAnchor + carromDeployAddition);
  const change = flickIntegrationChanges[file];
  const flick = carrom.replace(change.anchor, change.anchor + change.addition);
  return (
    carromBackendFileScope(file, before, carrom) &&
    flickIntegrationFileScope(file, carrom, flick) &&
    carromFriendsDeploymentScope(flick, after)
  );
}

function assertCarromConsumers(games, packages) {
  const catalog = games.filter((game) => game.id === 'carrom-club' || game.source === carromSource);
  assert(
    catalog.length === 1 && catalog[0].id === 'carrom-club' && catalog[0].source === carromSource,
    'Unreviewed carrom catalog binding',
  );
  assert(
    packages.some((pkg) => pkg.dir === 'services/runtime-api'),
    'Missing carrom server consumer',
  );
}

function importsModule(source, target) {
  return parsedSource(source).body.some(
    (node) => node.type === 'ImportDeclaration' && node.source.value === target,
  );
}

function assertRelativeUrlImport(program, name, target) {
  const url = namedVariable(program, name).init;
  assert(
    url?.type === 'MemberExpression' &&
      !url.computed &&
      url.property.name === 'href' &&
      url.object.type === 'NewExpression' &&
      url.object.callee.type === 'Identifier' &&
      url.object.callee.name === 'URL' &&
      url.object.arguments.length === 2 &&
      url.object.arguments[0].type === 'StringLiteral' &&
      url.object.arguments[0].value === target,
    'Unreviewed carrom engine URL',
  );
  const base = url.object.arguments[1];
  assert(
    base.type === 'MemberExpression' &&
      !base.computed &&
      base.property.name === 'url' &&
      base.object.type === 'MetaProperty' &&
      base.object.meta.name === 'import' &&
      base.object.property.name === 'meta',
    'Carrom engine URL is not relative to its consumer',
  );
  let imported = false;
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (
      node.type === 'ImportExpression' &&
      node.source.type === 'Identifier' &&
      node.source.name === name
    )
      imported = true;
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(program);
  assert(imported, 'Missing authoritative carrom engine import');
}

function assertCarromFriendsInputs(readHead) {
  const core = readHead(carromFriendsCore);
  assert(importsModule(core, './core.mjs'));
  assert(importsModule(core, './friends-content.mjs'));
  namedVariable(parsedSource(readHead(carromFriendsContent)), 'FRIEND_LEVELS');
  const consumer = parsedSource(readHead('services/runtime-api/src/app.ts'), true);
  assertRelativeUrlImport(consumer, 'carromUrl', '../../../' + carromFriendsCore);
  assertRelativeUrlImport(consumer, 'levelsUrl', '../../../' + carromFriendsContent);
}
const localIgnores = new Set([
  '.codex/config.toml',
  '.codex/config.toml.backup.*',
  '.mcp.json',
  '.mcp.json.backup.*',
  '.claude/settings.json',
  '.claude/settings.json.backup.*',
  '.cursor/mcp.json',
  '.cursor/mcp.json.backup.*',
  'opencode.json',
  'opencode.json.backup.*',
  'AGENTS.md.backup.*',
  '/game-build.local.json',
  '/game-build.local.js',
  'outputs_backup*/',
]);
const ignoreLines = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
function additiveLines(before, after) {
  const old = ignoreLines(before),
    current = ignoreLines(after);
  assert(new Set(current).size === current.length, 'Duplicate ignore rule');
  assert(
    isDeepStrictEqual(
      old,
      current.filter((line) => old.includes(line)),
    ),
    'Ignore rule changed',
  );
  return current.filter((line) => !old.includes(line));
}

function assertCompetitionRegistry(readHead, games) {
  const source = readHead(builder);
  const registry = literalDeclaration(source, 'competitionGames', true);
  assert(
    isDeepStrictEqual(Object.keys(registry).sort(), Object.keys(competitionConsumers).sort()),
    'Unreviewed competition consumer',
  );
  for (const [id, directory] of Object.entries(competitionConsumers)) {
    assert.equal(games.filter((game) => game.id === id).length, 1);
    assert.equal(games.filter((game) => game.source === directory).length, 1);
    assert(
      registry[id].directory === directory &&
        games.some((game) => game.id === id && game.source === directory),
      'Competition source mismatch',
    );
    assert(
      isDeepStrictEqual(
        Object.keys(registry[id])
          .filter((key) => key !== 'online')
          .sort(),
        ['directory', 'renderer', 'title'],
      ) &&
        (!Object.hasOwn(registry[id], 'online') ||
          (['cops-robbers', 'cops-robbers-realtime'].includes(id) &&
            registry[id].online === false)),
      'Unreviewed competition registry fields',
    );
    assert(typeof registry[id].renderer === 'string' && typeof registry[id].title === 'string');
  }
}

function exactCopsOfflineBuild(before, after) {
  const anchor =
    "  'cops-robbers': {\n    directory: 'games/local/cops-robbers',\n    renderer: 'src/competition-renderer.js',\n    title: '围捕小队',\n";
  return (
    before.split(anchor).length === 2 &&
    after === before.replace(anchor, anchor + '    online: false,\n')
  );
}

const cageRescueSource = 'games/local/cage-rescue';
const cageRescueGameplayFile = 'apps/shell-web/scripts/game-checks/cage-rescue.mjs';
const standaloneChecksFile = 'apps/shell-web/scripts/standalone-game-checks.mjs';
const tianxiaSource = 'games/local/tianxia-chalu';
const tianxiaWorkflowFiles = [
  '.github/workflows/carding-car.yml',
  '.github/workflows/ci.yml',
  '.github/workflows/pages-validate.yml',
  '.github/workflows/mobile.yml',
];
const tianxiaImmersiveFiles = {
  'apps/shell-web/src/StandaloneGame.tsx': [
    '  const immersive =\n',
    "    id === 'tianxia-chalu' ||\n",
  ],
  'apps/shell-web/scripts/pages-smoke.mjs': [
    'const immersiveGame = (id) =>\n  [\n',
    "    'tianxia-chalu',\n",
  ],
  'apps/shell-web/tests/standalone-immersive.integration.test.tsx': [
    'it.each([\n',
    "  'tianxia-chalu',\n",
  ],
  'apps/shell-web/tests/standalone.integration.test.tsx': [
    '    if (\n',
    "      id === 'tianxia-chalu' ||\n",
  ],
  'scripts/test-game-dev-mode.mjs': [
    '        if (\n',
    "          game.id === 'tianxia-chalu' ||\n",
  ],
};

// Reproduce only fixed additions. Comparing the whole result preserves every old
// workflow byte and requires no YAML dependency in the bare CI planning job.
function tianxiaWorkflowOnly(
  file,
  before,
  after,
  game = 'tianxia-chalu',
  variable = 'TIANXIA',
  step = 'tianxia',
) {
  assert(!before.includes(game) && !before.includes(`${variable}_PREBUILT_DIR`));
  const hasOrbit = before.includes('orbit-atelier');
  let expected = before;
  const replace = (anchor, replacement, count = 1) => {
    assert.equal(expected.split(anchor).length, count + 1);
    expected = expected.replaceAll(anchor, replacement);
  };
  const clone = (anchor, count = 1) => {
    if (hasOrbit)
      anchor = anchor
        .replaceAll('night-overwatch', 'orbit-atelier')
        .replaceAll('NIGHT_OVERWATCH', 'ORBIT_ATELIER')
        .replace('id: night', 'id: orbit');
    replace(
      anchor,
      anchor +
        anchor
          .replaceAll('night-overwatch', game)
          .replaceAll('NIGHT_OVERWATCH', variable)
          .replace('id: night', `id: ${step}`)
          .replaceAll('orbit-atelier', game)
          .replaceAll('ORBIT_ATELIER', variable)
          .replace('id: orbit', `id: ${step}`),
      count,
    );
  };
  if (file === '.github/workflows/carding-car.yml') {
    const matrix = before.match(/game:\s*\[([-a-z,\s]+)\]/g);
    assert.equal(matrix?.length, 1);
    const ids = matrix[0]
      .slice(matrix[0].indexOf('[') + 1, -1)
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    assert.deepEqual(ids, [
      'carding-car',
      'night-overwatch',
      ...(hasOrbit ? ['orbit-atelier'] : []),
      ...(game === 'bullet-garden' ? ['tianxia-chalu'] : []),
      ...(game === 'bullet-garden' && before.includes('homebound-station')
        ? ['homebound-station']
        : []),
      ...(game === 'bullet-garden' && before.includes('merge-front') ? ['merge-front'] : []),
    ]);
    replace(
      matrix[0],
      ids.includes('homebound-station')
        ? 'game:\n          [\n' +
            [...ids, game].map((id) => '            ' + id + ',\n').join('') +
            '          ]'
        : 'game: [' + [...ids, game].join(', ') + ']',
    );
    clone(
      "          NIGHT_OVERWATCH_PREBUILT_DIR: ${{ steps.artifact.outputs.cache-hit == 'true' && format('{0}/games/local/night-overwatch', github.workspace) || '' }}\n",
    );
    clone(
      '      - name: Download CI night-overwatch artifact\n' +
        "        id: night\n        if: steps.producer.outputs.run_id != ''\n" +
        '        continue-on-error: true\n        uses: actions/download-artifact@v8\n        with:\n' +
        '          name: night-overwatch-${{ github.sha }}\n          path: .scratch/ci-cocos/night-overwatch\n' +
        '          run-id: ${{ steps.producer.outputs.run_id }}\n          github-token: ${{ github.token }}\n',
    );
    const gates =
      "        if: steps.kart.outcome == 'success' && steps.night.outcome == 'success'" +
      (hasOrbit ? " && steps.orbit.outcome == 'success'" : '') +
      (before.includes('tianxia-chalu') ? " && steps.tianxia.outcome == 'success'" : '') +
      (before.includes('homebound-station') ? " && steps.homebound.outcome == 'success'" : '') +
      (before.includes('merge-front') ? " && steps.merge.outcome == 'success'" : '');
    replace(gates + '\n', gates + ' && steps.' + step + ".outcome == 'success'\n");
    clone(
      '          node scripts/reuse-cocos-artifacts.mjs verify night-overwatch .scratch/ci-cocos/night-overwatch\n',
    );
    clone(
      "      - uses: actions/upload-artifact@v7\n        if: steps.verify.outcome == 'success'\n" +
        '        with:\n          name: night-overwatch-${{ github.sha }}\n' +
        '          path: .scratch/ci-cocos/night-overwatch\n          if-no-files-found: error\n',
    );
  } else {
    const count = file === '.github/workflows/ci.yml' ? 1 : 2;
    clone(
      '      NIGHT_OVERWATCH_PREBUILT_DIR: ${{ github.workspace }}/games/local/night-overwatch/.prebuilt\n',
      count,
    );
    clone(
      '      - uses: actions/download-artifact@v8\n' +
        (count === 1 ? "        if: needs.plan.outputs.cocos == 'true'\n" : '') +
        '        with:\n          name: night-overwatch-${{ github.sha }}\n' +
        '          path: games/local/night-overwatch/.prebuilt\n',
      count,
    );
  }
  assert.equal(after, expected, 'Other workflow bytes changed');
}

function tianxiaTurboOnly(
  before,
  after,
  game = 'tianxia-chalu',
  variable = 'TIANXIA_PREBUILT_DIR',
) {
  function uniqueKeys(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'ObjectExpression') {
      const keys = node.properties.map((property) => property.key.value ?? property.key.name);
      assert.equal(new Set(keys).size, keys.length, 'Duplicate Turbo key');
    }
    for (const child of Object.values(node))
      if (Array.isArray(child)) child.forEach(uniqueKeys);
      else if (child && typeof child === 'object') uniqueKeys(child);
  }
  uniqueKeys(parsedSource(`const config = ${after};`));
  const previous = JSON.parse(before),
    current = JSON.parse(after);
  const key = `@coffeeeeffoc/${game}#build`;
  const config = 'BULLET_GARDEN_PLATFORM_CONFIG';
  const garden = game === 'bullet-garden';
  assert(!Object.hasOwn(previous.tasks, key));
  assert(!previous.globalPassThroughEnv.includes(variable));
  assert.deepEqual(current.globalPassThroughEnv, [
    ...previous.globalPassThroughEnv,
    variable,
    ...(garden ? [config] : []),
  ]);
  assert.deepEqual(current.tasks[key], {
    dependsOn: ['^build'],
    ...(garden ? { cache: false } : {}),
    outputs: ['dist/**'],
    env: ['COCOS_CREATOR', variable, ...(garden ? [config] : [])],
    inputs: ['$TURBO_DEFAULT$', `$TURBO_ROOT$/games/local/${game}/.prebuilt/**`],
  });
  if (garden) {
    const typecheck = `@coffeeeeffoc/${game}#typecheck`;
    assert(!Object.hasOwn(previous.tasks, typecheck));
    assert.deepEqual(current.tasks[typecheck], {
      dependsOn: ['^build'],
      cache: false,
      outputs: [],
      env: ['COCOS_CREATOR', variable, config],
    });
    delete current.tasks[typecheck];
    current.globalPassThroughEnv.pop();
  }
  delete current.tasks[key];
  current.globalPassThroughEnv.pop();
  assert.deepEqual(current, previous);
}

function tianxiaLiteralOnly(
  file,
  before,
  after,
  game = 'tianxia-chalu',
  variable = 'TIANXIA_PREBUILT_DIR',
) {
  const mapping = file === 'scripts/cocos-validation.mjs';
  const name = mapping ? 'prebuiltVariables' : 'games';
  const previous = literalDeclaration(before, name),
    current = literalDeclaration(after, name);
  const expected = {
    'games/local/carding-car': 'KART_PREBUILT_DIR',
    'games/local/night-overwatch': 'NIGHT_OVERWATCH_PREBUILT_DIR',
    ...(before.includes('orbit-atelier')
      ? { 'games/local/orbit-atelier': 'ORBIT_ATELIER_PREBUILT_DIR' }
      : {}),
    ...(game === 'bullet-garden' ? { 'games/local/tianxia-chalu': 'TIANXIA_PREBUILT_DIR' } : {}),
    ...(game === 'bullet-garden' && before.includes('homebound-station')
      ? { 'games/local/homebound-station': 'HOMEBOUND_STATION_PREBUILT_DIR' }
      : {}),
    ...(game === 'bullet-garden' && before.includes('merge-front')
      ? { 'games/local/merge-front': 'MERGE_FRONT_PREBUILT_DIR' }
      : {}),
  };
  assert.deepEqual(
    previous,
    mapping ? expected : Object.keys(expected).map((dir) => dir.slice('games/local/'.length)),
  );
  assert.deepEqual(
    current,
    mapping ? { ...previous, [`games/local/${game}`]: variable } : [...previous, game],
  );
  const strip = (source) => {
    const node = namedVariable(parsedSource(source), name).init;
    return source.slice(0, node.start) + 'LITERAL' + source.slice(node.end);
  };
  assert.equal(strip(before), strip(after), 'Other Cocos declaration bytes changed');
}

function tianxiaImmersiveOnly(file, before, after, game = 'tianxia-chalu') {
  const [anchor, template] = tianxiaImmersiveFiles[file];
  const addition = template.replaceAll('tianxia-chalu', game);
  assert(!before.includes(game === 'bullet-garden' ? addition : "'" + game + "'"));
  assert.equal(before.split(anchor).length, 2);
  let expected = before.replace(anchor, anchor + addition);
  const program = parsedSource(after, file.endsWith('.tsx'));
  if (file.endsWith('StandaloneGame.tsx')) {
    assert.equal(namedVariable(program, 'immersive').init.start, after.indexOf(addition) + 4);
  } else if (file.endsWith('pages-smoke.mjs')) {
    const declaration = namedVariable(program, 'immersiveGame');
    assert.equal(declaration.start, after.indexOf('immersiveGame'));
    const guard =
      "      } else if (\n        game.id === '" +
      (game === 'bullet-garden' ? 'tianxia-chalu' : 'ashfall-front') +
      "' ||\n";
    assert.equal(before.split(guard).length, 2);
    expected = expected.replace(
      guard,
      guard.replace('        game.id', "        game.id === '" + game + "' ||\n        game.id"),
    );
    const offset = after.indexOf("      } else if (\n        game.id === '" + game + "'");
    ifStatementAt(program, offset + '      } else '.length);
  } else if (file.endsWith('standalone-immersive.integration.test.tsx')) {
    const statement = program.body.find((node) => node.start === after.indexOf(anchor));
    assert.equal(statement?.expression?.callee?.callee?.property?.name, 'each');
    assert.equal(statement.expression.callee.callee.object.name, 'it');
    const ids = statement.expression.callee.arguments[0].elements.map((node) => {
      assert.equal(node.type, 'StringLiteral');
      return node.value;
    });
    assert.equal(new Set(ids).size, ids.length);
  } else {
    ifStatementAt(program, after.indexOf(anchor) + anchor.indexOf('if'));
  }
  assert.equal(after, expected, 'Other immersion bytes changed');
}

function tianxiaGameplayOnly(before, after, game = 'tianxia-chalu') {
  const strip = (source) => {
    const program = parsedSource(source);
    const exported = program.body.filter(
      (node) =>
        node.type === 'ExportNamedDeclaration' &&
        node.declaration?.type === 'FunctionDeclaration' &&
        node.declaration.id.name === 'assertStandaloneGameplay',
    );
    assert.equal(exported.length, 1);
    const branches = [];
    for (let node of exported[0].declaration.body.body) {
      while (node?.type === 'IfStatement') {
        const test = node.test;
        if (
          test.type === 'BinaryExpression' &&
          test.operator === '===' &&
          test.left.type === 'Identifier' &&
          test.left.name === 'id' &&
          test.right.type === 'StringLiteral' &&
          test.right.value === game
        )
          branches.push(node);
        node = node.alternate;
      }
    }
    assert.equal(branches.length, 1);
    const body = branches[0].consequent;
    assert.equal(body.type, 'BlockStatement');
    return source.slice(0, body.start) + 'GAME_BODY' + source.slice(body.end);
  };
  assert.notEqual(before, after);
  assert.equal(strip(before), strip(after), 'Other gameplay branch bytes changed');
}

function tianxiaWiringOnly(file, before, after) {
  try {
    if (tianxiaWorkflowFiles.includes(file)) tianxiaWorkflowOnly(file, before, after);
    else if (file === 'turbo.json') tianxiaTurboOnly(before, after);
    else if (['scripts/cocos-validation.mjs', 'scripts/reuse-cocos-artifacts.mjs'].includes(file))
      tianxiaLiteralOnly(file, before, after);
    else if (Object.hasOwn(tianxiaImmersiveFiles, file)) tianxiaImmersiveOnly(file, before, after);
    else if (file === standaloneChecksFile) tianxiaGameplayOnly(before, after);
    else return false;
    return true;
  } catch {
    return false;
  }
}
export function bulletGardenLockOnly(before, after, manifest) {
  return existingDevImporterOnly(
    before,
    after,
    manifest,
    'games/local/bullet-garden',
    '@coffeeeeffoc/bullet-garden',
    { '@playwright/test': '1.55.1', esbuild: '0.28.2', typescript: '7.0.2' },
  );
}
function existingDevImporterOnly(before, after, manifest, source, name, deps) {
  try {
    assert.equal(manifest.name, name);
    assert.deepEqual(manifest.devDependencies, deps);
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies'])
      assert(!manifest[field]);
    const empty = '  ' + source + ': {}\n';
    assert.equal(before.split(empty).length, 2);
    let addition = '  ' + source + ':\n    devDependencies:\n';
    for (const [name, version] of Object.entries(deps)) {
      const key = name.startsWith('@') ? "'" + name + "'" : name;
      const tuple =
        '      ' +
        key +
        ':\n        specifier: ' +
        version +
        '\n        version: ' +
        version +
        '\n';
      assert(
        (before.match(/^importers:\n(?:[ \t].*\n|\n)*/gm) || []).some((block) =>
          block.includes(tuple),
        ),
        'Only already resolved importer tuples are reusable',
      );
      addition += tuple;
    }
    return before.replace(empty, addition) === after;
  } catch {
    return false;
  }
}
const bulletGardenShellCss =
  "\n.standalone-page[data-game-id='bullet-garden'][data-immersive='true'] > nav {\n  top: calc(8px + env(safe-area-inset-top, 0px));\n  left: calc(12px + env(safe-area-inset-left, 0px));\n  transform: none;\n}\n.standalone-page[data-game-id='bullet-garden'][data-immersive='true'][data-screen='home'] iframe {\n  top: calc(60px + env(safe-area-inset-top, 0px));\n  height: calc(100% - 60px - env(safe-area-inset-top, 0px));\n}\n";
export function bulletGardenCreatorFileScope(file, before, after) {
  try {
    if (file === 'apps/shell-web/src/styles.css') {
      assert(!before.includes("data-game-id='bullet-garden'"));
      assert.equal(after, before + bulletGardenShellCss);
    } else if (tianxiaWorkflowFiles.includes(file))
      tianxiaWorkflowOnly(file, before, after, 'bullet-garden', 'BULLET_GARDEN', 'garden');
    else if (file === 'turbo.json')
      tianxiaTurboOnly(before, after, 'bullet-garden', 'BULLET_GARDEN_PREBUILT_DIR');
    else if (['scripts/cocos-validation.mjs', 'scripts/reuse-cocos-artifacts.mjs'].includes(file))
      tianxiaLiteralOnly(file, before, after, 'bullet-garden', 'BULLET_GARDEN_PREBUILT_DIR');
    else if (Object.hasOwn(tianxiaImmersiveFiles, file))
      tianxiaImmersiveOnly(file, before, after, 'bullet-garden');
    else if (file === standaloneChecksFile) tianxiaGameplayOnly(before, after, 'bullet-garden');
    else return false;
    return true;
  } catch {
    return false;
  }
}

function exactHomeboundReadyGuard(before, after) {
  // The exported diagnostic API exists only after Creator starts the scene.
  // Bind this readiness assertion to the reviewed complete file, preserving every gameplay check.
  const previous = before.replaceAll('\r\n', '\n');
  const current = after.replaceAll('\r\n', '\n');
  const anchor = "  } else if (id === 'homebound-station') {\n";
  return (
    createHash('sha256').update(previous).digest('hex') ===
      '895deb1ad37dd28850139cfefd23d6178813a40e2d3dca0670bf9a1bc74fd65d' &&
    current ===
      previous.replace(
        anchor,
        anchor +
          "    await expect(frame.locator('body')).toHaveAttribute('data-homebound-ready', 'true', {\n" +
          '      timeout: 60_000,\n' +
          '    });\n',
      )
  );
}

const towerLevelsBefore =
  "    await expect(frame.locator('#levels-screen button[data-level]')).toHaveCount(8);\n";
const towerLevelsAfter =
  "    await expect(frame.locator('#levels-screen button[data-level]')).toHaveCount(30);\n" +
  '    await expect(frame.locator(\'#levels-screen button[data-level="0"]\')).toBeEnabled();\n' +
  '    await expect(frame.locator(\'#levels-screen button[data-level="29"]\')).toBeDisabled();\n';
function exactTowerLevelsGuard(before, after) {
  // Bind this assertion-only update to the reviewed Tower branch; shared execution
  // code and other game contracts must remain byte-for-byte identical.
  return (
    createHash('sha256').update(before).digest('hex') ===
      'bed0bfc66e235bb68493782714df87c9ec67e39dec62d936db3356012f799128' &&
    after === before.replace(towerLevelsBefore, towerLevelsAfter)
  );
}
const copsStartBefore = `  } else if (id === 'cops-robbers') {
    await expect(frame.locator('#level-dialog')).toBeVisible();
    await click(frame.getByTestId('level-button-1'));
`;
const copsStartAfter = `  } else if (id === 'cops-robbers') {
    await expect(frame.locator('#level-dialog')).toBeHidden();
    await expect(frame.locator('body')).toHaveAttribute('data-level', '1');
`;
const copsAdBefore = `    await click(frame.getByTestId('hint'));
    const destination = frame.locator('.node-target.chosen');
`;
const copsAdAfter = `    await click(frame.getByTestId('hint'));
    await click(
      frame
        .getByRole('dialog', { name: '模拟广告' })
        .getByRole('button', { name: '领取奖励', exact: true }),
    );
    const destination = frame.locator('.node-target.chosen');
`;
const copsFreeHintAfter = `    await expect(frame.getByTestId('hint')).toHaveAttribute('aria-label', '获取提示');
    await click(frame.getByTestId('hint'));
    await expect(frame.getByRole('dialog', { name: '模拟广告' })).toHaveCount(0);
    const destination = frame.locator('.node-target.chosen');
`;
function exactCopsStartGuard(before, after) {
  const startChange =
    before.split(copsStartBefore).length === 2 &&
    after === before.replace(copsStartBefore, copsStartAfter);
  const adChange =
    before.split(copsAdBefore).length === 2 &&
    after === before.replace(copsAdBefore, copsAdAfter) &&
    before.split(copsStartAfter).length === 2;
  const freeHintChange =
    before.split(copsAdAfter).length === 2 &&
    after === before.replace(copsAdAfter, copsFreeHintAfter) &&
    before.split(copsStartAfter).length === 2;
  if (!startChange && !adChange && !freeHintChange) return false;
  const program = parsedSource(after);
  const exported = program.body.filter(
    (node) =>
      node.type === 'ExportNamedDeclaration' &&
      node.declaration?.type === 'FunctionDeclaration' &&
      node.declaration.id.name === 'assertStandaloneGameplay',
  );
  assert(exported.length === 1);
  const header = startChange ? copsStartBefore : copsStartAfter;
  const offset = before.indexOf(header) + header.indexOf('if (');
  const branch = ifStatementAt(program, offset);
  assert(offset > exported[0].declaration.start && branch.end < exported[0].declaration.end);
  function verifyOwner(node, owner = null) {
    if (!node || typeof node !== 'object') return;
    if (
      [
        'FunctionDeclaration',
        'FunctionExpression',
        'ArrowFunctionExpression',
        'ObjectMethod',
        'ClassMethod',
        'ClassPrivateMethod',
      ].includes(node.type)
    )
      owner = node;
    if (node === branch) assert(owner === exported[0].declaration);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach((child) => verifyOwner(child, owner));
      else if (value && typeof value === 'object') verifyOwner(value, owner);
    }
  }
  verifyOwner(program);
  const hintGuard = freeHintChange ? copsFreeHintAfter : copsAdAfter;
  if (adChange || freeHintChange)
    assert(
      after.indexOf(hintGuard) > branch.consequent.start &&
        after.indexOf(hintGuard) + hintGuard.length < branch.consequent.end,
    );
  assert(
    branch.test.type === 'BinaryExpression' &&
      branch.test.operator === '===' &&
      branch.test.left.type === 'Identifier' &&
      branch.test.left.name === 'id' &&
      branch.test.right.type === 'StringLiteral' &&
      branch.test.right.value === 'cops-robbers',
  );
  return true;
}
const castleEntryBefore = `  } else if (id === 'castle-cannon') {
    await expect(frame.locator('.castle-root')).toHaveAttribute('data-screen', 'playing');
    await click(frame.locator('[data-action="blast"]'));
    await click(frame.locator('[data-action="pause"]'));
    await expect(frame.locator('.castle-root')).toHaveAttribute('data-screen', 'paused');
    await click(frame.locator('[data-action="resume"]'));
    await expect(frame.locator('.castle-root')).toHaveAttribute('data-screen', 'playing');
`;
const castleEntryAfter = `  } else if (id === 'castle-cannon') {
    const { assertCastleDuelEntry } = await import('./game-checks/castle-cannon.mjs');
    return assertCastleDuelEntry(frame, mobile);
`;
const cageRescueDelegate =
  "  if (id === 'cage-rescue') {\n" +
  "    const { assertCageRescueGameplay } = await import('./game-checks/cage-rescue.mjs');\n" +
  '    return assertCageRescueGameplay(frame, mobile);\n' +
  '  }\n';
const standaloneGameplayHeader =
  'export async function assertStandaloneGameplay(frame, id, mobile = false) {\n';
const cageRescueHomeGuardBefore =
  "      } else if (game.id === 'ball-roguelite' || game.id === 'orbit-atelier') {\n";
const cageRescueHomeGuardAfter =
  '      } else if (\n' +
  "        game.id === 'cage-rescue' ||\n" +
  "        game.id === 'ball-roguelite' ||\n" +
  "        game.id === 'orbit-atelier'\n" +
  '      ) {\n';
const cageRescueImmersiveFiles = {
  'apps/shell-web/src/StandaloneGame.tsx': {
    name: 'immersive',
    anchor: '  const immersive =\n',
    addition: "    id === 'cage-rescue' ||\n",
  },
  'apps/shell-web/scripts/pages-smoke.mjs': {
    name: 'immersiveGame',
    anchor: 'const immersiveGame = (id) =>\n  [\n',
    addition: "    'cage-rescue',\n",
  },
  'apps/shell-web/tests/standalone-immersive.integration.test.tsx': {
    name: 'cases',
    anchor: 'it.each([\n',
    addition: "  'cage-rescue',\n",
  },
  'apps/shell-web/tests/standalone.integration.test.tsx': {
    name: 'catalogCases',
    anchor: '      if (\n',
    addition: "        id === 'cage-rescue' ||\n",
  },
};

function assertCageRescueCatalog(games) {
  const entries = games.filter(
    (game) => game.id === 'cage-rescue' || game.source === cageRescueSource,
  );
  assert(
    entries.length === 1 &&
      entries[0].id === 'cage-rescue' &&
      entries[0].source === cageRescueSource,
    'Unreviewed cage rescue catalog binding',
  );
}

function parsedSource(source, typescript = false) {
  const { parsers } = loadDependency('prettier/plugins/babel');
  return parsers[typescript ? 'babel-ts' : 'babel'].parse(source, {}).program;
}

function namedVariable(program, name) {
  const matches = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (
      node.type === 'VariableDeclarator' &&
      node.id.type === 'Identifier' &&
      node.id.name === name
    )
      matches.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(program);
  assert(matches.length === 1, 'Ambiguous per-game wiring declaration');
  return matches[0];
}

function ifStatementAt(program, offset) {
  const cases = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'IfStatement' && node.start === offset) cases.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(program);
  assert(cases.length === 1, 'Expected the real immersion guard');
  return cases[0];
}

function assertCageRescueGameplayModule(source) {
  // Reviewed native mouse/touch, pointer-release, pause/resume and home assertions.
  // Pin the complete module, not just an import regex: nested eval/loaders and
  // executable injections cannot acquire a single-game classification.
  assert(
    [
      'd854f227aa1e1a59090f76e403937d4623a6c8d4ca82a0eaaa637734c862e3b9',
      'cdb748df34911a85e2cd90f3a324358fcfa6b8d3599912ccba3d1b536c47099e',
    ].includes(createHash('sha256').update(source).digest('hex')),
    'Unreviewed cage rescue gameplay checks',
  );
  const body = parsedSource(source).body;
  assert(body.length === 2);
  const [dependency, exported] = body;
  assert(dependency.type === 'ImportDeclaration' && dependency.source.value === '@playwright/test');
  assert(
    dependency.specifiers.length === 1 &&
      dependency.specifiers[0].type === 'ImportSpecifier' &&
      dependency.specifiers[0].imported.name === 'expect' &&
      dependency.specifiers[0].local.name === 'expect',
  );
  assert(
    exported.type === 'ExportNamedDeclaration' &&
      exported.declaration?.type === 'FunctionDeclaration' &&
      exported.declaration.id.name === 'assertCageRescueGameplay' &&
      exported.declaration.async,
  );
}

function assertCageRescueDelegate({ readBase, readHead }) {
  const before = readBase(standaloneChecksFile);
  const after = readHead(standaloneChecksFile);
  assertCageRescueGameplayModule(readHead(cageRescueGameplayFile));
  assert(
    after.split(cageRescueDelegate).length === 2,
    'Missing or duplicate cage rescue delegation',
  );
  const declaration = parsedSource(after).body.filter(
    (node) =>
      node.type === 'ExportNamedDeclaration' &&
      node.declaration?.type === 'FunctionDeclaration' &&
      node.declaration.id.name === 'assertStandaloneGameplay',
  );
  assert(declaration.length === 1);
  // The lazy import is the first statement of the real exported function, never
  // a lookalike string/comment or an unconditional top-level dependency.
  assert(after.indexOf(standaloneGameplayHeader + cageRescueDelegate) === declaration[0].start);
  const first = declaration[0].declaration.body.body[0];
  assert(
    first?.type === 'IfStatement' &&
      after.slice(first.start, first.end) === cageRescueDelegate.trim(),
  );
  const stripped = after.replace(cageRescueDelegate, '');
  assert(before === stripped || before === after, 'Other shared gameplay bytes changed');
  if (before !== after) {
    assert(before.split(standaloneGameplayHeader).length === 2);
    assert(
      after ===
        before.replace(standaloneGameplayHeader, standaloneGameplayHeader + cageRescueDelegate),
    );
  }
}

function assertCageRescueImmersive(file, before, after) {
  const { name, anchor, addition } = cageRescueImmersiveFiles[file];
  assert(before.split(anchor).length === 2 && !before.includes("'cage-rescue'"));
  let expected = before.replace(anchor, anchor + addition);
  const addHomeGuard = name === 'immersiveGame' && after !== expected;
  if (addHomeGuard) {
    assert(before.split(cageRescueHomeGuardBefore).length === 2);
    assert(after.split(cageRescueHomeGuardAfter).length === 2);
    expected = expected.replace(cageRescueHomeGuardBefore, cageRescueHomeGuardAfter);
  }
  assert(after === expected, 'Other shared immersion bytes changed');
  const program = parsedSource(after, file.endsWith('.tsx'));
  if (addHomeGuard) {
    const guard = ifStatementAt(
      program,
      after.indexOf(cageRescueHomeGuardAfter) + cageRescueHomeGuardAfter.indexOf('if'),
    );
    const ids = [];
    const compare = (node) => {
      if (node.type === 'LogicalExpression' && node.operator === '||') {
        compare(node.left);
        compare(node.right);
      } else {
        assert(
          node.type === 'BinaryExpression' &&
            node.operator === '===' &&
            node.left.type === 'MemberExpression' &&
            !node.left.computed &&
            node.left.object.type === 'Identifier' &&
            node.left.object.name === 'game' &&
            node.left.property.type === 'Identifier' &&
            node.left.property.name === 'id' &&
            node.right.type === 'StringLiteral',
        );
        ids.push(node.right.value);
      }
    };
    compare(guard.test);
    assert(isDeepStrictEqual(ids, ['cage-rescue', 'ball-roguelite', 'orbit-atelier']));
  }
  if (name === 'cases') {
    const cases = program.body.filter(
      (node) =>
        node.type === 'ExpressionStatement' &&
        node.expression.type === 'CallExpression' &&
        node.expression.callee.type === 'CallExpression' &&
        node.expression.callee.callee.type === 'MemberExpression' &&
        !node.expression.callee.callee.computed &&
        node.expression.callee.callee.object.type === 'Identifier' &&
        node.expression.callee.callee.object.name === 'it' &&
        node.expression.callee.callee.property.name === 'each',
    );
    assert(cases.length === 1 && cases[0].start === after.indexOf(anchor));
    const args = cases[0].expression.callee.arguments;
    assert(
      args.length === 1 &&
        args[0].type === 'ArrayExpression' &&
        args[0].elements.every((node) => node?.type === 'StringLiteral'),
    );
    const ids = args[0].elements.map((node) => node.value);
    assert(ids[0] === 'cage-rescue' && new Set(ids).size === ids.length);
    return;
  }
  let declaration;
  if (name === 'catalogCases') {
    const guard = ifStatementAt(program, after.indexOf(anchor) + anchor.indexOf('if'));
    declaration = { init: guard.test };
  } else {
    declaration = namedVariable(program, name);
    assert(declaration.start === after.indexOf(anchor) + anchor.indexOf(name));
  }
  if (name === 'immersive' || name === 'catalogCases') {
    const ids = [];
    const compare = (node) => {
      if (node.type === 'LogicalExpression' && node.operator === '||') {
        compare(node.left);
        compare(node.right);
      } else {
        assert(
          node.type === 'BinaryExpression' &&
            node.operator === '===' &&
            node.left.type === 'Identifier' &&
            node.left.name === 'id' &&
            node.right.type === 'StringLiteral',
        );
        ids.push(node.right.value);
      }
    };
    compare(declaration.init);
    assert(ids[0] === 'cage-rescue' && new Set(ids).size === ids.length);
  } else {
    const arrow = declaration.init;
    assert(
      arrow.type === 'ArrowFunctionExpression' &&
        arrow.params.length === 1 &&
        arrow.params[0].type === 'Identifier' &&
        arrow.params[0].name === 'id',
    );
    const call = arrow.body;
    assert(
      call.type === 'CallExpression' &&
        call.callee.type === 'MemberExpression' &&
        !call.callee.computed &&
        call.callee.property.name === 'includes' &&
        call.arguments.length === 1 &&
        call.arguments[0].type === 'Identifier' &&
        call.arguments[0].name === 'id',
    );
    const list = call.callee.object;
    assert(
      list.type === 'ArrayExpression' &&
        list.elements.every((node) => node?.type === 'StringLiteral'),
    );
    const ids = list.elements.map((node) => node.value);
    assert(ids[0] === 'cage-rescue' && new Set(ids).size === ids.length);
  }
}

// H5 publishing is copied/bundled into these standalone games. This explicit
// boundary keeps a change to the shared adapter from silently skipping consumers.
export const publishingConsumers = {
  'cops-robbers': 'games/local/cops-robbers',
  'cops-robbers-realtime': 'games/local/cops-robbers-realtime',
  'tower-brake': 'games/local/tower-brake',
  'cage-rescue': 'games/local/cage-rescue',
  'ball-roguelite': 'games/local/ball-roguelite',
  'place-and-clear': 'games/local/place-and-clear',
  'flick-arena': 'games/local/flick-arena',
  'moss-garden': 'games/local/game-moss-garden',
  'ember-bounce': 'games/local/ember-bounce',
  'chase-thief': 'games/local/chase-thief',
  'tiny-signals': 'games/local/tiny-signals',
  'wulong-city': 'games/local/wulong-city',
  'surprise-kept': 'games/local/surprise-kept',
  'homebound-station': 'games/local/homebound-station',
  'waterline-station': 'games/local/waterline-station',
  'rescue-team': 'games/local/rescue-team',
  'out-of-frame': 'games/local/out-of-frame',
  'fold-the-world': 'games/local/fold-the-world',
  'two-sided-box': 'games/local/two-sided-box',
};
export const publishingScopePaths = [
  'platforms/h5/publishing.js',
  'platforms/h5/publishing.d.ts',
  'platforms/h5/tests/publishing.test.mjs',
];
// The generated TapTap host loader is injected only into these five entries.
export const publishingHostConsumers = {
  'ember-bounce': publishingConsumers['ember-bounce'],
  'fold-the-world': publishingConsumers['fold-the-world'],
  'out-of-frame': publishingConsumers['out-of-frame'],
  'surprise-kept': publishingConsumers['surprise-kept'],
  'two-sided-box': publishingConsumers['two-sided-box'],
};
export const publishingHostScopePaths = [
  'platforms/h5/publishing-host.js',
  'platforms/h5/tests/publishing-host.test.mjs',
  'platforms/h5/tests/two-sided-box-rewards.test.mjs',
];
export const safeAreaConsumers = {
  'cops-robbers': 'games/local/cops-robbers',
  'cops-robbers-realtime': 'games/local/cops-robbers-realtime',
  'xiangqi-five': 'games/submodules/xiangqi-five',
};
export const safeAreaScopePaths = [
  'platforms/h5/safe-area.js',
  'platforms/h5/tests/safe-area.test.mjs',
  'platforms/h5/tests/safe-area.browser.mjs',
];
// The SDK adapter is shared by nine H5 entries; the uploader remains chase-only.
export const platformAdsScopePaths = [
  'platforms/h5/platform-ads.js',
  'platforms/h5/platform-ads.d.ts',
  'platforms/h5/tests/platform-ads.test.mjs',
  'platforms/h5/deploy-taptap.ps1',
  'platforms/h5/tests/deploy-taptap.test.mjs',
];
export const publicationConfigScopePaths = [
  'platforms/publication-config.mjs',
  'platforms/.env.example',
  'platforms/tests/publication-config.test.mjs',
];
export const deploymentBundleScopePaths = [
  'scripts/deployment-bundle.mjs',
  'scripts/deployment-bundle.test.mjs',
  'infra/deployment/.env.example',
  'infra/deployment/bootstrap.sql',
  'infra/deployment/deploy.sh',
  'infra/deployment/validate-env.mjs',
  'infra/deployment/initialize-operator.mjs',
];
export const competitionIngressScopePaths = [
  'scripts/competition-ingress.mjs',
  'scripts/competition-ingress.test.mjs',
  'scripts/deploy-caddy.mjs',
  'infra/caddy/deploy.sh',
  'infra/caddy/ingress.py',
  'infra/caddy/ingress.test.py',
  'infra/caddy/ingress.example.json',
  'infra/caddy/backup.py',
  'infra/caddy/backup.test.py',
  'scripts/deploy-tencent.test.mjs',
];
export const adminControlDeploymentScopePaths = [
  'infra/admin-console/.gitattributes',
  'scripts/deploy-admin.mjs',
  'scripts/deploy-admin.test.mjs',
  'infra/admin-console/control-deploy.py',
  'infra/admin-console/control-deploy.test.py',
  'infra/admin-console/control-database.py',
  'infra/admin-console/control-database.test.py',
  'infra/admin-console/control-fingerprint.sql',
  'infra/admin-console/migrations/002-control-center.sql',
  'infra/admin-console/migrations/003-night-overwatch-control.sql',
];
export const adminDeploymentScopePaths = [
  ...adminControlDeploymentScopePaths,
  'scripts/backend-build.mjs',
  'scripts/deployment-progress.mjs',
  'scripts/company-deployment.mjs',
  'infra/admin-console/.env.example',
  'infra/admin-console/migrations/001-admin-auth.sql',
  'infra/admin-console/deploy.py',
  'infra/admin-console/deploy.test.py',
  'infra/admin-console/fingerprint.sql',
];
export const adminConsoleScopePaths = [...adminDeploymentScopePaths];
const adminConsumers = ['services/management-api', 'apps/admin-web'];
export const adminControlIntegrationScopePaths = [
  'scripts/admin-control-postgres.mjs',
  'scripts/admin-control-runtime-postgres.mjs',
];
export const adminCspScopePaths = [
  'scripts/admin-csp.mjs',
  'scripts/admin-csp.d.mts',
  'scripts/admin-csp.test.mjs',
  'scripts/admin-caddy-fixture.mjs',
  'scripts/admin-caddy-fixture.test.mjs',
];
function adminCspTurboOnly(before, after) {
  try {
    const previous = JSON.parse(before),
      current = JSON.parse(after);
    const key = '@coffeeeeffoc/admin-web#build';
    assert(!Object.hasOwn(previous.tasks, key));
    assert.deepEqual(current.tasks[key], {
      dependsOn: ['^build'],
      inputs: [
        '$TURBO_DEFAULT$',
        '$TURBO_ROOT$/scripts/admin-csp.mjs',
        '$TURBO_ROOT$/scripts/admin-csp.d.mts',
      ],
      outputs: ['dist/**'],
    });
    delete current.tasks[key];
    return isDeepStrictEqual(previous, current);
  } catch {
    return false;
  }
}
export const sharedDeploymentScopePaths = [
  'scripts/company-deployment.mjs',
  'scripts/deployment-progress.mjs',
];
export const selectedBackendConsumers = [
  'services/runtime-api',
  'services/kart-server',
  'services/tianxia-server',
];
export const backendDeploymentScopePaths = [
  'scripts/deploy-backend.mjs',
  'scripts/deploy-backend.test.mjs',
  'infra/backend-update/deploy.py',
  'infra/backend-update/deploy.test.py',
];
export const imageAuthorityScopePaths = [
  'infra/deployment/image-authority.py',
  'infra/deployment/image-authority.test.py',
];
export const imageAuthorityConsumers = [
  'services/runtime-api',
  'services/kart-server',
  'services/management-api',
];
export const backendSharedScopePaths = ['scripts/backend-build.mjs', ...sharedDeploymentScopePaths];
export function targetedCommandsOnly(before, after) {
  try {
    const previous = JSON.parse(before),
      current = JSON.parse(after),
      consumers = [];
    assert.equal(before.replaceAll('\r\n', '\n'), JSON.stringify(previous, null, 2) + '\n');
    assert.equal(after.replaceAll('\r\n', '\n'), JSON.stringify(current, null, 2) + '\n');
    let added = false;
    for (const [name, command, targets] of [
      ['push:no-verify', 'git push --no-verify', []],
      ['validate:candidate', 'node scripts/validate-candidate.mjs', []],
      [
        'build:taptap:h5',
        'node scripts/build-games.mjs --config infra/builds/six-taptap-h5.mjs',
        presetH5Ids.map((id) => `games/local/${id}`),
      ],
      ['deploy:backend', 'node scripts/deploy-backend.mjs', selectedBackendConsumers],
      [
        'build:games',
        'node scripts/build-games.mjs',
        competitionServiceIds.map((id) => competitionConsumers[id]),
      ],
    ]) {
      if (Object.hasOwn(previous.scripts, name))
        assert.equal(current.scripts[name], previous.scripts[name]);
      else if (Object.hasOwn(current.scripts, name)) {
        assert.equal(current.scripts[name], command);
        delete current.scripts[name];
        added = true;
        consumers.push(...targets);
      }
    }
    assert(added && isDeepStrictEqual(previous, current));
    return [...new Set(consumers)];
  } catch {
    return null;
  }
}
function adminCommandsOnly(before, after) {
  try {
    const previous = JSON.parse(before),
      current = JSON.parse(after);
    assert.equal(before.replaceAll('\r\n', '\n'), JSON.stringify(previous, null, 2) + '\n');
    assert.equal(after.replaceAll('\r\n', '\n'), JSON.stringify(current, null, 2) + '\n');
    assert.equal(current.scripts?.['deploy:admin'], 'node scripts/deploy-admin.mjs');
    assert(!Object.hasOwn(previous.scripts, 'deploy:admin'));
    delete current.scripts['deploy:admin'];
    return isDeepStrictEqual(previous, current);
  } catch {
    return false;
  }
}
const ingressConsumers = ['apps/company-web', 'services/runtime-api', ...adminConsumers];
const adminLockBlocks = [
  [
    'importers',
    'apps/admin-web',
    'be075a8e11cb779742017134248abe64263a3fa44b710917fa1d4fbe4488bb40',
  ],
  [
    'packages',
    '@remix-run/route-pattern@0.22.1',
    'b92144f2ca8fdb42fa4e91048e88d0191b93af23e72902bd401c6defabe82afb',
  ],
  [
    'packages',
    'react-dom@19.3.1',
    'c8faa95760593f1c7ec0c920ed8f45d19625c3ae1b83d6691c4de0ff808fbc1b',
  ],
  [
    'packages',
    'react-router@8.4.0',
    'aedd8cf8b95a1ef62c1fd2febad1c8968620467a1d4e718e5bbf78eacc30f309',
  ],
  ['packages', 'react@19.3.1', '9e8d6071e2c047769af663dad5444697bfeef921716efa6fca204377bd9c3120'],
  ['packages', 'vite@8.3.4', '100c7615f501e0bed71fa1013bdd59779a9e7258a52d45074999d360c22736fe'],
  [
    'snapshots',
    '@remix-run/route-pattern@0.22.1',
    '035e985eb4a917bbc49831d67dd64414b8377a6dccf69210b476875bea0b9326',
  ],
  [
    'snapshots',
    'react-dom@19.3.1(react@19.3.1)',
    '60a538b25f823770692987e57adc6c1263fed5d47e679a81242b3d7e8989e77d',
  ],
  [
    'snapshots',
    'react-router@8.4.0(react-dom@19.3.1(react@19.3.1))(react@19.3.1)',
    'e9d0f84938da1f74cb9630a89e113914f967602cd31db1d50d28963b4ba01389',
  ],
  ['snapshots', 'react@19.3.1', '1d39ab4f8b9d3f27f44be168020ff6d0e9038edc9995350f3277c152a2e0b4cf'],
  [
    'snapshots',
    'vite@8.3.4(@types/node@24.10.4)(esbuild@0.28.2)(jiti@2.7.0)(terser@5.51.2)(tsx@4.23.13)',
    '315b55e55b2d45f94c5ce4043e8f5d0ac3011d835f07d14d203c7e02195d1017',
  ],
];
function lockBlocks(text) {
  const blocks = [];
  for (const table of text.matchAll(/^(importers|packages|snapshots):\n/gm)) {
    const start = table.index + table[0].length;
    const boundary = text.slice(start).search(/^\S/m);
    const end = boundary < 0 ? text.length : start + boundary;
    const entries = [...text.slice(start, end).matchAll(/^ {2}(\S[^\n]*?):(?: \{\})?\n/gm)];
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      blocks.push({
        table: table[1],
        key: entry[1].replace(/^'(.*)'$/, '$1'),
        start: start + entry.index,
        end: index + 1 < entries.length ? start + entries[index + 1].index : end,
      });
    }
  }
  return blocks;
}
const adminAntdPackages = [
  '@ant-design/colors@8.0.1',
  '@ant-design/cssinjs-utils@2.1.2',
  '@ant-design/cssinjs@2.1.2',
  '@ant-design/fast-color@3.0.1',
  '@ant-design/icons-svg@4.6.0',
  '@ant-design/icons@6.3.4',
  '@ant-design/react-slick@2.0.0',
  '@babel/runtime@8.0.7',
  '@emotion/hash@0.8.0',
  '@emotion/unitless@0.7.5',
  '@rc-component/async-validator@6.0.0',
  '@rc-component/cascader@1.22.0',
  '@rc-component/checkbox@2.0.0',
  '@rc-component/collapse@1.2.0',
  '@rc-component/color-picker@3.1.1',
  '@rc-component/context@2.0.2',
  '@rc-component/dialog@1.10.0',
  '@rc-component/drawer@1.4.2',
  '@rc-component/dropdown@1.0.3',
  '@rc-component/form@1.8.6',
  '@rc-component/image@1.10.0',
  '@rc-component/input-number@1.6.2',
  '@rc-component/input@1.3.1',
  '@rc-component/listy@1.2.3',
  '@rc-component/mentions@1.12.0',
  '@rc-component/menu@1.5.0',
  '@rc-component/mini-decimal@1.1.4',
  '@rc-component/motion@1.3.3',
  '@rc-component/mutate-observer@2.0.1',
  '@rc-component/notification@2.1.1',
  '@rc-component/overflow@1.0.1',
  '@rc-component/pagination@1.4.0',
  '@rc-component/picker@1.12.2',
  '@rc-component/portal@2.2.1',
  '@rc-component/progress@1.0.3',
  '@rc-component/qrcode@2.0.0',
  '@rc-component/rate@1.0.1',
  '@rc-component/resize-observer@1.1.2',
  '@rc-component/segmented@1.4.0',
  '@rc-component/select@1.10.1',
  '@rc-component/slider@1.1.1',
  '@rc-component/steps@1.2.3',
  '@rc-component/switch@1.0.3',
  '@rc-component/table@1.11.1',
  '@rc-component/tabs@1.13.0',
  '@rc-component/tooltip@1.5.2',
  '@rc-component/tour@2.4.0',
  '@rc-component/tree-select@1.16.1',
  '@rc-component/tree@1.4.0',
  '@rc-component/trigger@3.10.1',
  '@rc-component/upload@1.1.1',
  '@rc-component/util@1.14.0',
  '@rc-component/virtual-list@1.5.2',
  'antd@6.6.6',
  'compute-scroll-into-view@3.1.1',
  'dayjs@1.11.23',
  'is-mobile@5.0.0',
  'json2mq@0.2.0',
  'scroll-into-view-if-needed@3.1.0',
  'string-convert@0.2.1',
  'stylis@4.4.0',
  'throttle-debounce@5.0.2',
];
function adminAntdLockOnly(before, after, manifest) {
  const digest = (text) => createHash('sha256').update(text).digest('hex');
  assert.equal(digest(before), 'e502c45f69cc2ce487aefcca7b6745cb3703ba96d79b3e9194018c6f6ac6d0fe');
  // Binds all 62 package integrities, peer-resolved snapshots and both YAML documents.
  assert.equal(digest(after), '368395f73d1fb9465161f7e98568ee426623dbde047af5addc24ab0a7434dffb');
  const canonicalManifest = manifest.replaceAll('\r\n', '\n');
  assert.equal(canonicalManifest, JSON.stringify(JSON.parse(manifest), null, 2) + '\n');
  assert.equal(
    digest(canonicalManifest),
    'ac4ed4049a84caf0a05e13c9b230c00552582e4075f4e10c062ccce6929f42f9',
  );
  const old = lockBlocks(before),
    current = lockBlocks(after);
  const added = current.filter(
    (block) => !old.some((item) => item.table === block.table && item.key === block.key),
  );
  assert.equal(added.length, 124);
  for (const table of ['packages', 'snapshots']) {
    const keys = added
      .filter((block) => block.table === table)
      .map((block) => block.key.split('(')[0]);
    assert.equal(new Set(keys).size, 62);
    assert.deepEqual(keys.sort(), [...adminAntdPackages].sort());
  }
  const importer = (blocks) => {
    const matches = blocks.filter(
      (block) => block.table === 'importers' && block.key === 'apps/admin-web',
    );
    assert.equal(matches.length, 1);
    return matches[0];
  };
  const remove = (text, blocks) => {
    for (const block of [...blocks].sort((a, b) => b.start - a.start))
      text = text.slice(0, block.start) + text.slice(block.end);
    return text;
  };
  assert.equal(
    remove(after, [...added, importer(current)]),
    remove(before, [importer(old)]),
    'Unrelated lockfile bytes changed',
  );
  return true;
}
// Exact initial admin addition or the separately reviewed AntD-only extension.
function adminWebLockOnly(before, after, manifest) {
  const digest = (text) => createHash('sha256').update(text).digest('hex');
  if (digest(before) === 'e502c45f69cc2ce487aefcca7b6745cb3703ba96d79b3e9194018c6f6ac6d0fe')
    return adminAntdLockOnly(before, after, manifest);
  assert.equal(digest(before), '5fdaa007c884ee4f52f9c0d3d05d3bb8cf53db125fcbcb0fc9406ea45c29125f');
  assert.equal(digest(after), 'e502c45f69cc2ce487aefcca7b6745cb3703ba96d79b3e9194018c6f6ac6d0fe');
  const parsedManifest = JSON.parse(manifest);
  assert.equal(manifest.replaceAll('\r\n', '\n'), JSON.stringify(parsedManifest, null, 2) + '\n');
  assert.deepEqual(parsedManifest, {
    name: '@coffeeeeffoc/admin-web',
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite --host 127.0.0.1 --port 5182 --strictPort',
      build: 'tsc --noEmit && vite build',
      preview: 'vite preview --host 127.0.0.1 --port 4182 --strictPort',
      typecheck: 'tsc --noEmit',
      lint: 'tsc --noEmit',
      test: 'pnpm build && node tests/browser.mjs',
    },
    dependencies: { react: '19.3.1', 'react-dom': '19.3.1', 'react-router': '8.4.0' },
    devDependencies: {
      '@types/react': '19.2.14',
      '@types/react-dom': '19.2.3',
      typescript: '7.0.2',
      vite: '8.3.4',
      '@playwright/test': '1.55.1',
    },
  });
  const old = lockBlocks(before),
    current = lockBlocks(after),
    additions = [];
  for (const [table, key, hash] of adminLockBlocks) {
    assert(!old.some((block) => block.table === table && block.key === key));
    const matches = current.filter((block) => block.table === table && block.key === key);
    assert.equal(matches.length, 1);
    assert.equal(digest(after.slice(matches[0].start, matches[0].end)), hash);
    additions.push(matches[0]);
  }
  let remainder = after;
  for (const block of additions.sort((a, b) => b.start - a.start))
    remainder = remainder.slice(0, block.start) + remainder.slice(block.end);
  assert.equal(remainder, before);
  return true;
}
export const runtimeProxyDefaultScopePaths = [
  'infra/tencent/compose.yaml',
  'scripts/deployment-bundle.mjs',
];
const runtimeProxyDefaultChanges = {
  'infra/tencent/compose.yaml': [
    "      PORT: '43002'\n      TRUST_PROXY: '1'",
    "      PORT: '43002'\n      TRUST_PROXY: '0'",
  ],
  'scripts/deployment-bundle.mjs': [
    "      Object.assign(env, { HOST: '0.0.0.0', PORT: String(port), TRUST_PROXY: '1' });",
    "      Object.assign(env, {\n        HOST: '0.0.0.0',\n        PORT: String(port),\n        TRUST_PROXY: service === 'runtime' ? '0' : '1',\n      });",
  ],
};
export const companyDeploymentScopePaths = [
  'scripts/deployment-progress.mjs',
  'infra/company/.gitattributes',
  'scripts/deploy-company.mjs',
  'scripts/deploy-company.test.mjs',
  'scripts/company-deployment.mjs',
  'scripts/deploy-caddy.mjs',
  'infra/company/.env.example',
  'infra/company/deploy.sh',
  'infra/company/deploy.test.sh',
  'infra/company/backup.py',
  'infra/company/backup.test.py',
  'infra/company/company-caddy-backup.service',
  'infra/company/company-caddy-backup.timer',
  'infra/caddy/.gitattributes',
  'infra/caddy/deploy.sh',
  'infra/caddy/deploy.test.sh',
  'infra/caddy/backup.py',
  'infra/caddy/backup.test.py',
  'infra/caddy/company-caddy-backup.service',
  'infra/caddy/company-caddy-backup.timer',
];
function companyCommandsOnly(before, after) {
  try {
    const previous = JSON.parse(before);
    const current = JSON.parse(after);
    for (const [name, command] of Object.entries({
      'deploy:company': 'node scripts/deploy-company.mjs',
      'deploy:caddy': 'node scripts/deploy-caddy.mjs',
      'test:deploy-company': 'node --test scripts/deploy-company.test.mjs',
    })) {
      assert(current.scripts?.[name] === command);
      assert(!Object.hasOwn(previous.scripts, name) || previous.scripts[name] === command);
      if (!Object.hasOwn(previous.scripts, name)) delete current.scripts[name];
    }
    return isDeepStrictEqual(previous, current);
  } catch {
    return false;
  }
}
const deploymentCommands = {
  'deployment:bundle': 'node scripts/deployment-bundle.mjs',
  'test:deployment-bundle': 'node --test scripts/deployment-bundle.test.mjs',
};
function deploymentCommandsOnly(before, after) {
  const previous = JSON.parse(before);
  const current = JSON.parse(after);
  for (const [name, command] of Object.entries(deploymentCommands)) {
    assert(current.scripts?.[name] === command);
    assert(!Object.hasOwn(previous.scripts, name) || previous.scripts[name] === command);
    if (!Object.hasOwn(previous.scripts, name)) delete current.scripts[name];
  }
  return isDeepStrictEqual(previous, current);
}

export const mobileViewportScopeFile = 'apps/shell-web/scripts/pages-validation.mjs';
export const independentPreviewScopeFile = 'scripts/run-selected-browser.mjs';
const mobileViewportConsumers = {
  'fold-the-world': 'games/local/fold-the-world',
  'carding-car': 'games/local/carding-car',
  'night-overwatch': 'games/local/night-overwatch',
  'vibeJam-myself-nullrange': 'games/local/vibeJam-myself-nullrange',
  'wulong-city': 'games/local/wulong-city',
};
const independentPreviewConsumers = mobileViewportConsumers;

/** Structural proofs for config-only changes; explicit consumers for known tools.
 * No prefix wildcard accepts a new workflow, shared runtime or test script.
 */
export function mainIntegrationFileScopes(context) {
  const scopes = new Map();
  if (!mainRetirementTreesMatch(context)) return scopes;
  const { changedPaths, readBase, readHead, readBaseEntry, packages, games } = context;
  const exact = (file, review) =>
    (review.before === null
      ? readBaseEntry(file) === ''
      : createHash('sha256').update(readBase(file)).digest('hex') === review.before) &&
    createHash('sha256').update(readHead(file)).digest('hex') === review.after;
  for (const file of changedPaths) {
    const review = mainIntegrationReviews[file];
    if (!review) continue;
    try {
      if (!exact(file, review)) continue;
      if (
        file === 'pnpm-lock.yaml' &&
        !Object.entries(mainLockManifestHashes).every(([name, pair]) => exact(name, pair))
      )
        continue;
      for (const source of review.sources) {
        const name = mainIntegrationNames[source];
        const matches = packages.filter((pkg) => pkg.dir === source || pkg.name === name);
        assert.equal(matches.length, 1);
        assert.equal(matches[0].dir, source);
        assert.equal(matches[0].name, name);
        if (mainIntegrationIds[source]) {
          const id = mainIntegrationIds[source];
          const entries = games.filter((game) => game.id === id || game.source === source);
          assert.equal(entries.length, 1);
          assert.equal(entries[0].id, id);
          assert.equal(entries[0].source, source);
          if (!['echo-lab', 'wulong-city'].includes(id)) {
            assert.equal(matches[0].creator?.version, '3.8.8');
            assert.equal(matches[0].scripts?.build, 'node scripts/build.mjs web-mobile');
          }
        }
      }
      scopes.set(file, Object.freeze([...review.sources]));
    } catch {
      // Failed/missing snapshots or identities cannot establish this file's scope.
    }
  }
  return scopes;
}

// Exact Creator migration wiring; unrelated bytes retain the normal shared-file gates.
export const threeChooseTwoCreatorReviews = Object.freeze({
  '.github/workflows/carding-car.yml': {
    before: [
      {
        hash: '420192e8c991ff7166a1828e48b3087cdbf65604b8d659393c4802bdad6ac2c7',
        sources: [
          'games/local/three-choose-two',
          'games/local/tower-brake',
          'games/local/tetracube',
        ],
      },
      {
        hash: 'ed37f62fe6afb8bc23154cf5449dec571577000238a9e7af256548a18f6e27c0',
        sources: ['games/local/three-choose-two'],
      },
    ],
    after: 'de1f4958297534d075cd1a71724c86bf3f126365eb1ec722ee16d717ff274ded',
  },
  '.github/workflows/ci.yml': {
    before: [
      {
        hash: '073903ff62e45572e1b2f07a25d64ca19ad381800f7859bd73b3c6bb3da96e9f',
        sources: [
          'games/local/three-choose-two',
          'games/local/tower-brake',
          'games/local/tetracube',
        ],
      },
      {
        hash: 'eb409c1e039a2f9c1b689c5edf0d740783be64e93a5a9886e83e55d4e2fd7da7',
        sources: ['games/local/three-choose-two'],
      },
    ],
    after: '504f25c7c90beb1d45c6d43f9bb7eb40aec763cd5d1465e09674a34510c8b093',
  },
  '.github/workflows/mobile.yml': {
    before: [
      {
        hash: '046cada0323b6b92a6d95a894acc8a9c31881faa874e98d9f25f5b47ff7ed5f5',
        sources: [
          'games/local/three-choose-two',
          'games/local/tower-brake',
          'games/local/tetracube',
        ],
      },
      {
        hash: '61599c743ca6e6ec7eb654a8bdbc8cb8263ae33b338df73fcfeac0e782f97cfa',
        sources: ['games/local/three-choose-two'],
      },
    ],
    after: '1ec7608f8cfc9057a575a395227f8563b5b7db0935d45102d29f5aa1287cf5c1',
  },
  '.github/workflows/pages-validate.yml': {
    before: [
      {
        hash: 'f7c119db7da3a46f682da323558a38214f3fed2f7cb79b8b9cbfbcf16378d258',
        sources: [
          'games/local/three-choose-two',
          'games/local/tower-brake',
          'games/local/tetracube',
        ],
      },
      {
        hash: 'bb7ea514e20f6565185f8a7026b46b0af34f0ef7fdb47c69dc46ce141939137d',
        sources: ['games/local/three-choose-two'],
      },
    ],
    after: '34991575ae5de7c5dc5c91f15bc5910439d2f3ebcf919c52bdc68a11b1bf7be9',
  },
  'apps/shell-web/scripts/pages-smoke.mjs': {
    before: [
      {
        hash: '173f91964552dc5b73919f4007d7419092c7eafb27ed6e0d0e741254c0d668e3',
        sources: [
          'apps/shell-web',
          'games/local/three-choose-two',
          'games/local/tower-brake',
          'games/local/tetracube',
        ],
      },
      {
        hash: '8f2fc3ba828ac4ca2c91f58d7199465121cf9eeb3c6ef76f0706410f41ba17c9',
        sources: [
          'apps/shell-web',
          'games/local/three-choose-two',
          'games/local/chase-thief',
          'games/local/tower-brake',
          'games/local/tetracube',
        ],
      },
      {
        hash: 'd9e565ce6fd05cc2bc065ab82d186691491e21191099893e328a4e59659ab58b',
        sources: ['apps/shell-web', 'games/local/three-choose-two'],
      },
    ],
    after: '57361de65e6f84fc79951be178ea8796a6a8e7b49918f90388322cd985a856d9',
  },
  'apps/shell-web/scripts/standalone-game-checks.mjs': {
    before: [
      {
        hash: '93ab6fd3d3e94f8bf4f3efae1c0ac288d0b7d7cf33718e768595ffb45afd0609',
        sources: [
          'apps/shell-web',
          'games/local/three-choose-two',
          'games/local/tower-brake',
          'games/local/tetracube',
        ],
      },
      {
        hash: 'be16d0ad7be4290296e2e9eed1c34e1e20b07c465b7b988e579696ce37f81670',
        sources: [
          'apps/shell-web',
          'games/local/three-choose-two',
          'games/local/chase-thief',
          'games/local/merge-front',
          'games/local/tower-brake',
          'games/local/tetracube',
        ],
      },
      {
        hash: 'a75dc74a9ce108f129740ead705eee8163aaea55996db8472a8f5e6c50ec6efc',
        sources: ['apps/shell-web', 'games/local/three-choose-two'],
      },
    ],
    after: 'ac6e7418d1f7b3f672287e6847e83729c18770695fecf4abe77ecd76384ee9ec',
  },
  'apps/shell-web/scripts/standalone-game-entry.mjs': {
    before: [
      {
        hash: 'b7da91bb3b61b4ce6199af69650224fa8fc5e6944a92c93240730ae7722732c8',
        sources: [
          'apps/shell-web',
          'games/local/three-choose-two',
          'games/local/tower-brake',
          'games/local/tetracube',
        ],
      },
      {
        hash: '402e1783f800475d55f9d0f70b73943b7543723e8de585701f1c80d91bf1b7f4',
        sources: [
          'apps/shell-web',
          'games/local/three-choose-two',
          'games/local/chase-thief',
          'games/local/tower-brake',
          'games/local/tetracube',
        ],
      },
      {
        hash: 'd8564a35df6be3c6a5ffd9c9604e41cbf180a5dab80b639348c245693e61702e',
        sources: ['apps/shell-web', 'games/local/three-choose-two'],
      },
    ],
    after: 'b5cadbb403ce37bbab9a70b431238e9198c9cf8edefbb0a90f00eb44e41e9eca',
  },
  'pnpm-lock.yaml': {
    before: [
      {
        hash: 'bf37f530bd0253a9fdcff185ea435f94a3a7ab9969b6925c06377c92fa4ca9cc',
        sources: [
          'games/local/three-choose-two',
          'games/local/tower-brake',
          'games/local/tetracube',
        ],
      },
      {
        hash: '6779080d02bd8f6cc0a83543b3193b59ce2a28b8967108b15be20e1e01be666a',
        sources: ['games/local/three-choose-two'],
      },
    ],
    after: '8d2f2811eda6b51e0008662e352e27c9c8f5218a0e985d76c62a356caca775c0',
  },
  'scripts/check-game-config.test.mjs': {
    before: [
      {
        hash: '2d6edbffc2267d38ff0c45605c846058cd08d5a83fe1c90ed77407e6b057336f',
        sources: [
          'games/local/three-choose-two',
          'games/local/tower-brake',
          'games/local/tetracube',
        ],
      },
      {
        hash: 'dc68485c6320cc6bda1fc7c8d98d39843778330018c8b58a5eaa653608ea9b23',
        sources: ['games/local/three-choose-two'],
      },
    ],
    after: '83257dfe8558dc6164729cd3b6cb4061f9a7e721c5a8b15f2412937ed54271f1',
  },
  'scripts/check-workspace-dependencies.mjs': {
    before: [
      {
        hash: 'e304693617a8005ba383149caaf72fe5ad06d4a0ad01261a6b701422cd38452a',
        sources: [
          'games/local/three-choose-two',
          'games/local/tower-brake',
          'games/local/tetracube',
        ],
      },
      {
        hash: '81e42a4dae115164249864851cbbebb39d8e2da6b15d9e90af5c71312d4bc0cd',
        sources: ['games/local/three-choose-two'],
      },
    ],
    after: '81406bc8e6b8f33677b85e608f42ba10a7d2070fb1221bb34dc91e5bfd50bfbd',
  },
  'scripts/cocos-validation.mjs': {
    before: [
      {
        hash: '86535b0a4adf2592479090729ecaee34ff2f71070fea948604cedc76be1eafc2',
        sources: [
          'games/local/three-choose-two',
          'games/local/tower-brake',
          'games/local/tetracube',
        ],
      },
      {
        hash: 'cdb496316dd760e9a3b5901e6dd73d998ea259e8e7e9a6c77ef8caa4a153aaef',
        sources: ['games/local/three-choose-two'],
      },
    ],
    after: '9fca2edc2d3e0485f20a63930de78bbf8d5bd2702e1c322ad03d96c0e39aacb5',
  },
  'scripts/cocos-validation.test.mjs': {
    before: [
      {
        hash: '715f010d7b5aa8407e9fcc101145aaf21cc1fafe2317ff3d95dad22cbe5a3699',
        sources: [
          'games/local/three-choose-two',
          'games/local/tower-brake',
          'games/local/tetracube',
        ],
      },
      {
        hash: '2e0bc5d7dc0d447a4b7e6c15031ab5f27734e0fa11da51d875e158d006ca1bb3',
        sources: ['games/local/three-choose-two'],
      },
    ],
    after: 'fe8b7a02ff3d2fd6a3991a5742272b9e6d6a485373ec1836af7ef1a514fdde1e',
  },
  'scripts/h5-ad-config.mjs': {
    before: [
      {
        hash: '3619e524dfb5ecd4ddcc5e9939a2ef243685150beb063913a7cbf5af236f385c',
        sources: ['games/local/three-choose-two', 'games/local/tetracube'],
      },
      {
        hash: 'add9c24b2ee744d2ee3f6759ad3bcd8b866b1a04256307fb8dfe648944d6b46c',
        sources: ['games/local/three-choose-two'],
      },
    ],
    after: 'b48002922f35785c20ad3daba43d637373e9cc008ae03c5be511ede95bcf39c1',
  },
  'scripts/h5-ad-config.test.mjs': {
    before: [
      {
        hash: '6a8a3c60e00b0b1ef29f49f55d0755e1271b54c3abd62caa22d8cc96cdda18ba',
        sources: ['games/local/three-choose-two', 'games/local/tetracube'],
      },
      {
        hash: '716b6c536eee1b2731a3bd043da0971e5e2317df1817043b6fbf37af21b42fcb',
        sources: ['games/local/three-choose-two'],
      },
    ],
    after: '5e5c9275cbe8d46ed866bbb9dbe85157eddead8709cae3d9ec82ece898f702f2',
  },
  'scripts/h5-game-build.mjs': {
    before: [
      {
        hash: '5a76a4e6e968193b244177c2c268becc14a1c022107045bebe719a2c2fd2380f',
        sources: ['games/local/three-choose-two', 'games/local/tetracube'],
      },
      {
        hash: '5820316069dc3e103004b81562ec374f82bc9b5efb7f6800c13920d44ed40228',
        sources: ['games/local/three-choose-two'],
      },
    ],
    after: '677c352368e22204dc1d733f91408383fd6a2dc4312c7a7d03f28b4897497bef',
  },
  'scripts/h5-taptap-build.mjs': {
    before: [
      {
        hash: 'ccbbf960a1f33c8fda6f7d447ad06a2234f306db478f06c18bc4df69b7c57a89',
        sources: ['games/local/three-choose-two', 'games/local/tetracube'],
      },
      {
        hash: 'd3d3e15a02d63e53690e9e510f58f20b7ff44092cf5b1bf1db36739e1a70d38e',
        sources: ['games/local/three-choose-two'],
      },
    ],
    after: '28802aa608f195ca14641e8cdb9f238e9b584c9ff0e8e931bb6c3a2cfeaef677',
  },
  'scripts/h5-taptap-matrix.mjs': {
    before: [
      {
        hash: '71257b7d52add72213aff79dfd05b0d4a4a240d42a0a2c292fb64a958fc78cac',
        sources: ['games/local/three-choose-two', 'games/local/tetracube'],
      },
      {
        hash: '032ef04dccde57ccd892bd1bcda9189fd444c35a8bb186a39750f4902958a48e',
        sources: ['games/local/three-choose-two'],
      },
    ],
    after: 'e9fd8492ef8c8187b85bdd34e678b15512719ccd8dd180684ea5ec55b9ea5516',
  },
  'scripts/h5-taptap-matrix.test.mjs': {
    before: [
      {
        hash: '14bd65e0520191061b4cb5b42df71325de12e2c4f21f6479ff78ddada81fe041',
        sources: ['games/local/three-choose-two'],
      },
    ],
    after: '8952a0a92f463cd20169ba30b581219efc3be59038b1480f62dfe26b8a091cb3',
  },
  'scripts/reuse-cocos-artifacts.mjs': {
    before: [
      {
        hash: 'c626dd77cf003383f2ce6bcdbd28b4769f938077f0b7ee2700af77c3810247de',
        sources: [
          'games/local/three-choose-two',
          'games/local/tower-brake',
          'games/local/tetracube',
        ],
      },
      {
        hash: 'c62c3e572fa4cc01afb8b4cda3b681fd01f222229ad6737976cf70d368071ac7',
        sources: ['games/local/three-choose-two'],
      },
    ],
    after: '97311301cf068af5e6f607e214fa9fd8bf25956b64465335f837b588a2a13ff2',
  },
  'scripts/reuse-cocos-artifacts.test.mjs': {
    before: [
      {
        hash: '02f244e69079861469b8b458fc7ce9e34ce758444667b7771a1496532f5868b1',
        sources: [
          'games/local/three-choose-two',
          'games/local/tower-brake',
          'games/local/tetracube',
        ],
      },
      {
        hash: 'e39bbbeb295e8416ae9bc4350b4db9a384e3ab5a92cd386b7fd1784e43ece962',
        sources: ['games/local/three-choose-two'],
      },
    ],
    after: '04b29083de780c4c9a695084e026acbaf5c53ed5a60fa523b1998c705c8a9898',
  },
  'turbo.json': {
    before: [
      {
        hash: '8e715b054f404963935c195b1fb8dccc4d90ccab8a40c826411f033e810ca6fa',
        sources: [
          'games/local/three-choose-two',
          'games/local/tower-brake',
          'games/local/tetracube',
        ],
      },
      {
        hash: '23bf97ae3be4a5e1e35cdeb3cf68ef47c9d4d24941fed93e8200969779f92725',
        sources: ['games/local/three-choose-two'],
      },
    ],
    after: 'c6c6f3d6bcd2a77b1e7e3457f3b4ecb2493a0bbaef7fa5882d5e070cc5b8c568',
  },
});
const threeChooseTwoLockManifest = {
  before: '9d9cfee4fff466dbdcf3988a99779a594f66d2667037821e9ff75f8432db05f2',
  after: '31174e289f7e41a44d3774993b1c2aa3479d86d83f8cd4b19d86e06095788e8b',
};
export function threeChooseTwoCreatorFileScope(
  file,
  before,
  after,
  { games, packages, readBase, readHead },
) {
  try {
    const review = threeChooseTwoCreatorReviews[file];
    if (!review || typeof before !== 'string' || typeof after !== 'string') return null;
    const digest = (value) =>
      createHash('sha256').update(value.replaceAll('\r\n', '\n')).digest('hex');
    const prior = review.before.find((entry) => entry.hash === digest(before));
    if (!prior || review.after !== digest(after)) return null;
    const names = {
      'apps/shell-web': '@coffeeeeffoc/shell-web',
      'games/local/three-choose-two': '@coffeeeeffoc/three-choose-two',
      'games/local/chase-thief': '@coffeeeeffoc/chase-thief',
      'games/local/merge-front': '@small-games/merge-front',
      'games/local/tower-brake': '@coffeeeeffoc/tower-brake',
      'games/local/tetracube': '@coffeeeeffoc/tetracube',
    };
    for (const source of prior.sources) {
      const entries = packages.filter((p) => p.dir === source || p.name === names[source]);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].dir, source);
      assert.equal(entries[0].name, names[source]);
      if (source.startsWith('games/')) {
        const id = source.split('/').at(-1),
          registered = games.filter((g) => g.source === source || g.id === id);
        assert.equal(registered.length, 1);
        assert.equal(registered[0].source, source);
        assert.equal(registered[0].id, id);
      }
      if (source === 'games/local/three-choose-two') {
        assert.equal(entries[0].creator?.version, '3.8.8');
        assert.equal(entries[0].scripts?.build, 'node scripts/build.mjs web-mobile');
      }
    }
    if (file === 'pnpm-lock.yaml') {
      const manifest = 'games/local/three-choose-two/package.json';
      assert.equal(digest(readBase(manifest)), threeChooseTwoLockManifest.before);
      assert.equal(digest(readHead(manifest)), threeChooseTwoLockManifest.after);
    }
    return [...prior.sources];
  } catch {
    return null;
  }
}
// Saved Pages cbee0202 and migration base a0b4e324 have identical inputs here.
export const towerCreatorIntegrationHashes = Object.freeze({
  'scripts/sync-h5-fullscreen.mjs': [
    '444c0792a85d7cf3713555abfc12904972b26c2c7d03ca4330a9b03478c161cf',
    '1aba61eef265f7c0dfffb1af7b463e351a6a8799efe0e9c5243b106ef88fe731',
  ],
  '.github/workflows/carding-car.yml': [
    '420192e8c991ff7166a1828e48b3087cdbf65604b8d659393c4802bdad6ac2c7',
    '35a72e638feb6d5d698cce35fd28f3be805d4613d68a64840b3d6279f93276b1',
  ],
  '.github/workflows/ci.yml': [
    '073903ff62e45572e1b2f07a25d64ca19ad381800f7859bd73b3c6bb3da96e9f',
    '3a281e527f82b5f4e84faa66a1ec5e9c2fb5133d882d2a6a1d61c2cb03596b90',
  ],
  '.github/workflows/pages-validate.yml': [
    'f7c119db7da3a46f682da323558a38214f3fed2f7cb79b8b9cbfbcf16378d258',
    '8ecec73c79ac505cd7b6df1b503f06bb0a00c0c3b23826319e39de4176610d12',
  ],
  '.github/workflows/mobile.yml': [
    '046cada0323b6b92a6d95a894acc8a9c31881faa874e98d9f25f5b47ff7ed5f5',
    'b805ce80fbb9c6276df298afcc4476f9e72f78565ca5c9814153eaafbcbf7199',
  ],
  'turbo.json': [
    '8e715b054f404963935c195b1fb8dccc4d90ccab8a40c826411f033e810ca6fa',
    'f92efc5e14d3db1a0cc44ea8ece75014c5dc444a14fdce8bb43fc120dcebc86e',
  ],
  'pnpm-lock.yaml': [
    'bf37f530bd0253a9fdcff185ea435f94a3a7ab9969b6925c06377c92fa4ca9cc',
    'a3625e137817b27d05e464ee2aa3f3391b53e04cbbc045adc2c9640017aa3a93',
  ],
});

// Exact combined Tower/Tetracube wiring; retain both original single-game proofs.
export const towerTetracubeIntegrationHashes = Object.freeze({
  'scripts/sync-h5-fullscreen.mjs':
    '13ba2904af89e73207f2809fa861b7d5c23b72ff6df77ebdb73dfd27e332c363',
  '.github/workflows/carding-car.yml':
    'ed37f62fe6afb8bc23154cf5449dec571577000238a9e7af256548a18f6e27c0',
  '.github/workflows/ci.yml': 'eb409c1e039a2f9c1b689c5edf0d740783be64e93a5a9886e83e55d4e2fd7da7',
  '.github/workflows/pages-validate.yml':
    'bb7ea514e20f6565185f8a7026b46b0af34f0ef7fdb47c69dc46ce141939137d',
  '.github/workflows/mobile.yml':
    '61599c743ca6e6ec7eb654a8bdbc8cb8263ae33b338df73fcfeac0e782f97cfa',
  'turbo.json': '23bf97ae3be4a5e1e35cdeb3cf68ef47c9d4d24941fed93e8200969779f92725',
  'pnpm-lock.yaml': '6779080d02bd8f6cc0a83543b3193b59ce2a28b8967108b15be20e1e01be666a',
});

// Only the reviewed Tower configuration wiring is removed before applying the
// existing cumulative migration proof; every other byte and consumer stays bound.
const towerArtifactConfigChanges = {
  '.github/workflows/carding-car.yml': [
    [
      '    inputs:\n',
      "    inputs:\n      competition_public_api_url:\n        description: Public API URL used to fingerprint and build Tower Brake artifacts.\n        type: string\n        default: ''\n",
    ],
    [
      '  reuse:\n    if: inputs.reuse_ci\n',
      '  reuse:\n    if: inputs.reuse_ci\n    env:\n      COMPETITION_PUBLIC_API_URL: ${{ inputs.competition_public_api_url }}\n',
    ],
    [
      '    runs-on: windows-latest\n',
      "    runs-on: windows-latest\n    env:\n      COMPETITION_PUBLIC_API_URL: ${{ matrix.game == 'tower-brake' && inputs.competition_public_api_url || '' }}\n",
    ],
  ],
  '.github/workflows/pages-validate.yml': [
    [
      "      reuse_ci: ${{ github.event_name == 'push' && inputs.cocos }}\n",
      "      reuse_ci: ${{ github.event_name == 'push' && inputs.cocos }}\n      competition_public_api_url: 'https://api.nenggongzhiren.cn/small-games/v1'\n",
    ],
  ],
};
export function towerArtifactConfigFileScope(file, before, after, context) {
  try {
    const changes = towerArtifactConfigChanges[file];
    if (!changes || typeof before !== 'string' || typeof after !== 'string') return null;
    before = before.replaceAll('\r\n', '\n');
    let stripped = after.replaceAll('\r\n', '\n');
    for (const [oldText, newText] of changes) {
      assert.equal(stripped.split(newText).length, 2);
      stripped = stripped.replace(newText, oldText);
    }
    const digest = createHash('sha256').update(stripped).digest('hex');
    assert.equal(digest, threeChooseTwoCreatorReviews[file].after);
    const source = 'games/local/tower-brake';
    const entries = context.games.filter((g) => g.id === 'tower-brake' || g.source === source);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, 'tower-brake');
    assert.equal(entries[0].source, source);
    assert.equal(entries[0].output, 'dist');
    const targets = context.packages.filter(
      (p) => p.dir === source || p.name === '@coffeeeeffoc/tower-brake',
    );
    assert.equal(targets.length, 1);
    assert.equal(targets[0].dir, source);
    assert.equal(targets[0].name, '@coffeeeeffoc/tower-brake');
    assert.equal(targets[0].creator?.version, '3.8.8');
    assert.equal(targets[0].scripts?.build, 'node scripts/build.mjs web-mobile');
    const inherited =
      before === stripped ? [] : threeChooseTwoCreatorFileScope(file, before, stripped, context);
    assert(inherited, 'Unreviewed workflow baseline');
    return [...new Set([...inherited, source])];
  } catch {
    return null;
  }
}

// Planning installs only Prettier; use its YAML parser without a workspace dependency.
function planningYaml(text) {
  const ast = loadDependency('prettier/plugins/yaml').parsers.yaml.parse(text);
  function value(node) {
    assert(!node.anchor && !node.tag, 'Unsupported planning YAML anchor or tag');
    if (['mapping', 'flowMapping'].includes(node.type)) {
      const entries = node.children.map((item) => item.children.map(value));
      assert(entries.every(([key]) => typeof key === 'string'));
      assert.equal(new Set(entries.map(([key]) => key)).size, entries.length);
      return Object.fromEntries(entries);
    }
    if (['sequence', 'flowSequence'].includes(node.type)) return node.children.map(value);
    if (
      ['plain', 'quoteSingle', 'quoteDouble', 'blockLiteral', 'blockFolded'].includes(node.type)
    ) {
      if (node.type === 'plain') {
        if (node.value === '~') return null;
        try {
          return JSON.parse(node.value);
        } catch {
          /* Ordinary YAML string. */
        }
      }
      return node.value;
    }
    assert(
      ['mappingKey', 'mappingValue', 'sequenceItem', 'flowSequenceItem', 'documentBody'].includes(
        node.type,
      ),
      'Unsupported planning YAML node: ' + node.type,
    );
    assert(node.children.length <= 1);
    return node.children.length ? value(node.children[0]) : null;
  }
  return ast.children.map((document) => {
    assert.equal(document.type, 'document');
    assert.equal(document.children[0].children.length, 0, 'Unsupported YAML directive');
    return value(document.children[1]);
  });
}

// Verify an additive registration by restoring all existing consumers before comparison.
export function ashfallCreatorWiringOnly(file, before, after) {
  const source = 'games/local/ashfall-front',
    variable = 'ASHFALL_FRONT_PREBUILT_DIR';
  if (file === 'pnpm-lock.yaml') {
    const oldDocuments = planningYaml(before),
      currentDocuments = planningYaml(after);
    const old = oldDocuments.at(-1),
      current = currentDocuments.at(-1);
    assert.deepEqual(old.importers[source], {});
    const tools = {
      '@playwright/test': { specifier: '1.55.1', version: '1.55.1' },
      typescript: { specifier: '7.0.2', version: '7.0.2' },
    };
    assert.deepEqual(current.importers[source], { devDependencies: tools });
    for (const [name, tuple] of Object.entries(tools))
      assert(
        Object.values(old.importers).some((entry) =>
          isDeepStrictEqual(entry.devDependencies?.[name], tuple),
        ),
      );
    current.importers[source] = old.importers[source];
    assert.deepEqual(currentDocuments, oldDocuments);
    return true;
  }
  if (file === 'turbo.json') {
    const old = JSON.parse(before),
      current = JSON.parse(after),
      task = '@coffeeeeffoc/ashfall-front#build';
    assert(!old.tasks[task] && !old.globalPassThroughEnv.includes(variable));
    assert.deepEqual(current.tasks[task], {
      dependsOn: ['^build'],
      outputs: ['dist/**'],
      env: ['COCOS_CREATOR', variable, 'H5_ADS_ENABLED', 'TAPTAP_ASHFALL_FRONT_AD_UNIT_ID'],
      inputs: [
        '$TURBO_DEFAULT$',
        '$TURBO_ROOT$/games/local/ashfall-front/.prebuilt/**',
        '$TURBO_ROOT$/scripts/h5-ad-config.mjs',
      ],
    });
    delete current.tasks[task];
    assert.equal(current.globalPassThroughEnv.pop(), variable);
    assert.deepEqual(current, old);
    return true;
  }
  if (['scripts/cocos-validation.mjs', 'scripts/reuse-cocos-artifacts.mjs'].includes(file)) {
    const mapping = file.includes('cocos-validation'),
      name = mapping ? 'prebuiltVariables' : 'games';
    const old = literalDeclaration(before, name),
      current = literalDeclaration(after, name);
    assert(mapping ? !Object.hasOwn(old, source) : !old.includes('ashfall-front'));
    assert.deepEqual(current, mapping ? { ...old, [source]: variable } : [...old, 'ashfall-front']);
    const strip = (text) => {
      const node = namedVariable(parsedSource(text), name).init;
      return text.slice(0, node.start) + 'LITERAL' + text.slice(node.end);
    };
    assert.equal(strip(after), strip(before));
    return true;
  }
  if (
    !['ci', 'pages-validate', 'mobile', 'carding-car'].some(
      (name) => file === '.github/workflows/' + name + '.yml',
    )
  )
    return false;
  const oldDocuments = planningYaml(before),
    currentDocuments = planningYaml(after);
  assert.equal(oldDocuments.length, 1);
  assert.equal(currentDocuments.length, 1);
  const old = oldDocuments[0],
    current = currentDocuments[0];
  const clone = (value) =>
    JSON.parse(
      JSON.stringify(value)
        .replaceAll('game-castle-cannon', 'ashfall-front')
        .replace('"id":"castle"', '"id":"ashfall"'),
    );
  let additions = 0;
  for (const [id, job] of Object.entries(current.jobs)) {
    const prior = old.jobs[id];
    assert(prior);
    if (job.env?.[variable]) {
      assert.equal(job.env[variable], clone(prior.env.CASTLE_CANNON_PREBUILT_DIR));
      delete job.env[variable];
      additions++;
    }
    if (job.strategy?.matrix?.game?.includes('ashfall-front')) {
      assert.deepEqual(job.strategy.matrix.game, [...prior.strategy.matrix.game, 'ashfall-front']);
      job.strategy.matrix.game.pop();
      additions++;
    }
    if (!job.steps) continue;
    job.steps = job.steps.filter((step) => {
      if (step.with?.name !== 'ashfall-front-${{ github.sha }}') return true;
      const template = prior.steps.find(
        (item) =>
          item.uses === step.uses && item.with?.name === 'game-castle-cannon-${{ github.sha }}',
      );
      assert(template);
      assert.deepEqual(step, clone(template));
      additions++;
      return false;
    });
    for (let i = 0; i < job.steps.length; i++) {
      const step = job.steps[i],
        previous = prior.steps[i];
      assert(previous);
      if (step.env?.[variable]) {
        assert.equal(step.env[variable], clone(previous.env.CASTLE_CANNON_PREBUILT_DIR));
        delete step.env[variable];
        additions++;
      }
      if (step.id === 'verify' && step.if?.includes('steps.ashfall.outcome')) {
        assert.equal(step.if, previous.if + " && steps.ashfall.outcome == 'success'");
        step.if = previous.if;
        const line =
          'node scripts/reuse-cocos-artifacts.mjs verify ashfall-front .scratch/ci-cocos/ashfall-front\n';
        assert.equal(step.run.split(line).length, 2);
        step.run = step.run.replace(line, '');
        additions++;
      }
    }
  }
  assert(additions > 0);
  assert.deepEqual(current, old);
  return true;
}

// Porcelain wiring adds dispatch IDs, portrait metadata and public ad environment names.
// Exact bytes retain fail-closed behavior for all other edits and comparison bases.
export function porcelainH5FileScopes({ changedPaths, readBase, readHead, games, packages = [] }) {
  const scopes = new Map();
  const reviewed = {
    'apps/shell-web/package.json': [
      '05fd51dc8cd2b738552c71cbe1842d4cb5fac81242b32e152b559565c3415ede',
      '8dd903436188b5cd1dbb48a749ebc04cb1a13d745a6e617909e8b983b8099164',
    ],
    'pnpm-lock.yaml': [
      '8d2f2811eda6b51e0008662e352e27c9c8f5218a0e985d76c62a356caca775c0',
      'fe6169c2abc5b69726c54856b37c8ac2e3ff30f9e6921127989dbcc908cdbced',
    ],
    'scripts/h5-taptap-build.mjs': [
      '4cdea763a2e71cb31563d887db1d17f1deb0d8f66381cd5ad9d37a140f5130a4',
      'ea03001d9c693b8b45599dcf52728e8bb3d0289ce307d63c67a04913c5533c33',
    ],
    'scripts/h5-taptap-matrix.mjs': [
      '12f53f7d422fdc68704c7fff95f9bc0f92d8c35cf8c43d2dfb2d6774087df9bf',
      'c63d8fef1b9a7ad4219c80a6fe102801820e73c0890e787585bf2ed9200ec9ee',
    ],
    'scripts/h5-ad-config.mjs': [
      'b272edc8d3559c6ebcd5ba6918ea63f3aeff74a34d7ff04d63d1e36c1c8e3079',
      'e075f10a3e0f18147f97ef0cef66bf823b5709893c00ad84f219b3259c763c71',
    ],
    'scripts/h5-game-build.mjs': [
      '5b5d6a6dee975cbacfc8d11e9f5e514a3433a298c215d76e3ed273a7d479fc1e',
      '76034eee6d03fd200211aea469672e7841cd398ed1f757ce8e06fcb369841f22',
    ],
  };
  try {
    const id = 'porcelain-puzzle',
      source = 'games/local/porcelain-puzzle',
      name = '@coffeeeeffoc/porcelain-puzzle';
    const entries = games.filter((g) => g.id === id || g.source === source);
    const targets = packages.filter((p) => p.dir === source || p.name === name);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, id);
    assert.equal(entries[0].source, source);
    assert.equal(entries[0].output, 'dist');
    assert.equal(targets.length, 1);
    assert.equal(targets[0].dir, source);
    assert.equal(targets[0].name, name);
    const manifest = JSON.parse(readHead(source + '/package.json'));
    assert.equal(manifest.name, name);
    assert.equal(manifest.coffeeeeffoc?.engine, 'cocos-source-3.8.8');
    assert.equal(manifest.scripts?.build, 'node build.mjs');
    for (const file of changedPaths) {
      const pair = reviewed[file];
      if (!pair) continue;
      const hash = (text) => createHash('sha256').update(text).digest('hex');
      if (hash(readBase(file)) === pair[0] && hash(readHead(file)) === pair[1]) {
        const consumers = [source];
        if (file === 'scripts/h5-taptap-build.mjs' || file === 'pnpm-lock.yaml') {
          // This same literal edit also repairs Ashfall's missing public ad variable.
          const ashfall = 'games/local/ashfall-front';
          assert.equal(
            games.filter((g) => g.id === 'ashfall-front' && g.source === ashfall).length,
            1,
          );
          assert.equal(packages.filter((p) => p.dir === ashfall).length, 1);
          consumers.push(ashfall);
        }
        if (file === 'pnpm-lock.yaml' || file === 'apps/shell-web/package.json') {
          const shell = 'apps/shell-web';
          assert.equal(packages.filter((p) => p.dir === shell).length, 1);
          consumers.push(shell);
        }
        scopes.set(file, consumers);
      }
    }
  } catch {
    return new Map();
  }
  return scopes;
}

// B1 shared wiring reviewed against 2b6a4e18; unknown bytes keep the existing scope guard.
export const nullrangeCreatorReviews = Object.freeze({
  'pnpm-lock.yaml': [
    'c1c3b174acc1430149209c2155611019935730c61c0969b5bfdbf5537a99b030',
    'ebafbfc7ebc0fe4f2e4e9f267868e4d69d44569f03cbb841608d5c98be890534',
  ],
  'turbo.json': [
    'd3367a8c79a29efa8d4518f84d080958307617cef8f921be083b0ba66d429268',
    '6731d27d4c8e58300c97b77a4793bd3dc82d7b47748a9d1c78c499f52bca0994',
  ],
  'scripts/cocos-validation.mjs': [
    '730e7f81607fc83c4f83922ab19f4bf770e496c39f4104efae91bc1655114fc8',
    '5c005662fe4972cd755fdc439bd8ef2ac9419d65741631400053360bb83e8739',
  ],
  'scripts/cocos-validation.test.mjs': [
    'f6a27a96af374a9988e82b24cbd7f5b05bc3d32c2ee161840e29c1fd2846bafa',
    '1120f870d7aa77b98b43b9352bc757d32565a283b1b0e9ca7882796af0b311c9',
  ],
  'scripts/reuse-cocos-artifacts.mjs': [
    '8a93df0a01f67d30f41993d5b29893bd0ce7224a152246484ca82173185fe378',
    'b3baea80429b2ac1ff2c9686371b58fe01821ec2e43309aaa43002218137a159',
  ],
  'scripts/reuse-cocos-artifacts.test.mjs': [
    'ae0729854468680e1445340799686b379a7612582644fbe8c64c5b7e884d5f6c',
    '7bda3b96c13c3fbd176d28dbaed374b497fdc638ae8bd207b0f66d4b09b3aba6',
  ],
  'scripts/test-game-dev-mode.mjs': [
    'ff37d9ea32e508972fd4ccef576cddad78f7614ae86d1a2b96e0f511870868dd',
    '0e479160713a66a075ac65df058539eea4313be1ed1e108eeab604617948ad49',
  ],
  '.github/workflows/carding-car.yml': [
    '28f7f7f7c22ce1b2e4d94f046ef1ad3da31c634066f7711d7b288144bff3e5ca',
    '01c4ccc9d72f27e38f95af1637fc1f224796875e646dd4599cc03a1ae3ae1ee9',
  ],
  '.github/workflows/ci.yml': [
    '1e7599cffbc73f70405a415f0b09c8ec7d779387a6f568a3c8162a04a36571c3',
    'bf4633cebeee4c9b8b5c7030246e11a664ddd364a8f9901095720aca5ff88221',
  ],
  '.github/workflows/pages-validate.yml': [
    'f9e1a4964375f0c6e5376afa84bec6fdc8ed122c87a5babe92c07dea6435f22b',
    '42124d77909b385fafbbd7f2a30a11a124902f87dd225ffb0de4f30ae4ccbca6',
  ],
  '.github/workflows/mobile.yml': [
    '49a7113afe2ed48a2e72a732e0ea8427fc247d069c0818000030dab95923acc2',
    '88e1c267d58ef8c8bbbc4b57b7b24b307dfa0100660669b8ea64d768918c4ae0',
  ],
  'apps/shell-web/scripts/pages-smoke.mjs': [
    '2364ebce7fbd1ee96034ff7eaae40233ab3fae72c8693e63edba8b887c30ad5d',
    '5e84773e5a75456ece5e245f96ccc90e2a8b2eee33974291ca4b3479ba23a9d7',
  ],
  'apps/shell-web/scripts/standalone-game-checks.mjs': [
    '84afe8c2578d637d87c9b38b9abb817493b80be42ba0d794b412bb6f0c438447',
    '95cf0e066977513328a0d9fbcc250d31ffb1939e1e85734ac06a8646832d307c',
  ],
  'apps/shell-web/scripts/standalone-game-entry.mjs': [
    'a55098b4008a2423cc3e78a73c42257dcee5308f71f6553cb2420e5235786810',
    'e54f9efa88b9382b38ba2135f39a9a8a47bf55ddcfa7c8323b1e2e6c9309b6e7',
  ],
  'apps/shell-web/scripts/standalone-game-entry.test.mjs': [
    '74c2965e10a27f68f4010b0b41410f7ba38f26495529f7108337b90f347ea668',
    '5bf5a81ead0d1759e7f47861805e62a2478deb6be1702b3435a90d254acad2a2',
  ],
  'apps/shell-web/src/StandaloneGame.tsx': [
    'ab27967b440f3ff8d662b2ae62cab09070a5eacba2de983af04d611b979cd16e',
    '660906eed48994da99cab4839ff1257479a9e3a40a9485e5c1d153a9c47f5e6d',
  ],
  'apps/shell-web/tests/standalone-immersive.integration.test.tsx': [
    '44ab187caff826893417b19739bb961faf6d5f5767e8eb44db57f492ac75811d',
    '7292f3eed6a4e207d19df8eb414c022bc4c9e7d08588a1f48edcd4fd413e4b3e',
  ],
  'apps/shell-web/tests/standalone.integration.test.tsx': [
    'c3db90c2c9ea82ee4bda83acdbc62bfbf26eb218f4c327382813ca1b41916ffa',
    'a579be352a2e6fc7b48225da5845093cd48456708de305cc3783b60f492781fd',
  ],
  'apps/shell-web/scripts/game-checks/nullrange.mjs': [
    null,
    '3c6d24fcbbe179c616e8985bcd3bfa60cbb4b4f517616c50e72cb5eb75e991a6',
  ],
  'scripts/check-game-config.test.mjs': [
    'd0b77aa70fddacc02de8b987bd3f16ddb8db2ce1c753c64f0d8f3b9e39949248',
    '7bd94b07c8f895f36f264e2508077db02091576de8fa3d6d771fe9d91b998574',
  ],
  'scripts/pages-test-scope.mjs': [
    'ef6ed59c81536dfa99d1bdaeb63945f6839be5924d4caf04d621433abaccdfb0',
    'ec5e3f9b7eba41b8a247a533a0895b8890e4e944304586f5911a447f9ca34ef8',
  ],
  'scripts/pages-test-scope.test.mjs': [
    '367959098e1fd5c58f0e5e199bb2ba8dac684df6e18ea57b69aa846553b3e4bd',
    '22ebe25cd8ac84560a3bea875b8f97e6c6891fe028f7ab2546e55a2dab090971',
  ],
});

export function nullrangeLockOnly(before, after, oldManifest, manifest) {
  before = before.replaceAll('\r\n', '\n');
  after = after.replaceAll('\r\n', '\n');
  const source = 'games/local/vibeJam-myself-nullrange';
  const oldDocuments = planningYaml(before),
    currentDocuments = planningYaml(after);
  assert.equal(oldDocuments.length, 2);
  assert.equal(currentDocuments.length, 2);
  const old = oldDocuments.at(-1),
    current = currentDocuments.at(-1);
  assert.equal(oldManifest.name, 'null-range-mobile-cn');
  assert.deepEqual(oldManifest.dependencies, { three: '0.170.0' });
  assert.deepEqual(oldManifest.devDependencies, { vite: '6.4.4' });
  assert.equal(manifest.name, oldManifest.name);
  assert.equal(manifest.creator?.version, '3.8.8');
  assert.equal(manifest.scripts?.build, 'node scripts/build.mjs web-mobile');
  assert.equal(manifest.dependencies, undefined);
  assert.deepEqual(manifest.devDependencies, { '@playwright/test': '1.55.1', typescript: '7.0.2' });
  assert.deepEqual(old.importers[source], {
    dependencies: { three: { specifier: '0.170.0', version: '0.170.0' } },
    devDependencies: {
      vite: {
        specifier: '6.4.4',
        version:
          '6.4.4(@types/node@24.10.1)(jiti@2.7.0)(lightningcss@1.33.0)(terser@5.51.2)(tsx@4.21.0)',
      },
    },
  });
  const tools = Object.fromEntries(
    Object.entries(manifest.devDependencies).map(([name, version]) => [
      name,
      { specifier: version, version },
    ]),
  );
  assert.deepEqual(current.importers[source], { devDependencies: tools });
  for (const [name, tuple] of Object.entries(tools))
    assert(
      Object.values(old.importers).some((entry) =>
        isDeepStrictEqual(entry.devDependencies?.[name], tuple),
      ),
    );
  // Restore only this importer; all remaining lock bytes, including resolutions, must be identical.
  const block = /^  games\/local\/vibeJam-myself-nullrange:[^\n]*\n(?:(?!  \S|\S)[^\n]*\n)*/gm;
  const previous = before.match(block),
    next = after.match(block);
  assert.equal(previous?.length, 1);
  assert.equal(next?.length, 1);
  assert.equal(
    after.replace(block, () => previous[0]),
    before,
  );
  return true;
}

export function nullrangeCreatorFileScopes({
  changedPaths,
  readBase,
  readHead,
  games,
  packages = [],
}) {
  const scopes = new Map(),
    source = 'games/local/vibeJam-myself-nullrange',
    id = 'vibeJam-myself-nullrange';
  try {
    const entries = games.filter((g) => g.id === id || g.source === source);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, id);
    assert.equal(entries[0].source, source);
    assert.equal(entries[0].output, 'dist');
    const targets = packages.filter((p) => p.dir === source || p.name === 'null-range-mobile-cn');
    assert.equal(targets.length, 1);
    assert.equal(targets[0].dir, source);
    assert.equal(targets[0].name, 'null-range-mobile-cn');
    assert.equal(targets[0].creator?.version, '3.8.8');
    assert.equal(targets[0].scripts?.build, 'node scripts/build.mjs web-mobile');
    const digest = (text) =>
      createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');
    for (const file of changedPaths) {
      const review = nullrangeCreatorReviews[file];
      if (!review) continue;
      try {
        if (
          ![
            review[1],
            ...(file === '.github/workflows/ci.yml' ? [planningCheckoutHashes[file].partial] : []),
          ].includes(digest(readHead(file))) ||
          (review[0] !== null && digest(readBase(file)) !== review[0])
        )
          continue;
        if (file === 'pnpm-lock.yaml') {
          nullrangeLockOnly(
            readBase(file),
            readHead(file),
            JSON.parse(readBase(source + '/package.json')),
            JSON.parse(readHead(source + '/package.json')),
          );
        }
        const consumers = [source];
        if (file.startsWith('apps/shell-web/') || file === 'scripts/test-game-dev-mode.mjs')
          consumers.push('apps/shell-web');
        if (file === 'scripts/test-game-dev-mode.mjs') consumers.push('games/local/wulong-city');
        for (const dir of consumers) assert.equal(packages.filter((p) => p.dir === dir).length, 1);
        scopes.set(file, consumers);
      } catch {
        /* Missing comparison or manifest evidence cannot authorize this file. */
      }
    }
  } catch {
    /* Ambiguous runtime identity keeps all paths unclassified. */
  }
  return scopes;
}

export function reviewedSharedFileScopes({
  changedPaths,
  readBase,
  readHead,
  games,
  packages = [],
  ...treeContext
}) {
  const scopes = vitePatchFileScopes({ changedPaths, readBase, readHead });
  const renameScopes = gameRenameFileScopes({
    changedPaths,
    readBase,
    readHead,
    games,
    packages,
    ...treeContext,
  });
  const nullrangeScopes = nullrangeCreatorFileScopes({
    changedPaths,
    readBase,
    readHead,
    games,
    packages,
  });
  const porcelainScopes = porcelainH5FileScopes({
    changedPaths,
    readBase,
    readHead,
    games,
    packages,
  });
  const mainScopes = mainIntegrationFileScopes({
    changedPaths,
    readBase,
    readHead,
    games,
    packages,
    ...treeContext,
  });
  const castleScopes = castleCreatorFileScopes({
    changedPaths,
    readBase,
    readHead,
    games,
    packages,
  });
  const tetracubeScopes = tetracubeCreatorFileScopes({
    changedPaths,
    readBase,
    readHead,
    games,
    packages,
  });
  for (const file of changedPaths) {
    if (file === 'scripts/check-game-config.mjs') {
      try {
        const digest = (text) =>
          createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');
        if (
          digest(readBase(file)) ===
            'b94272674ffaf5e9df04589f3a5e9b438d8049e51f05203519224d327c0cc38e' &&
          digest(readHead(file)) ===
            '2f707614d30d961c9d55f9ff1b5cc077ea83c50cfd098bdcc2286e4d01c9fe13'
        ) {
          scopes.set(file, []);
          continue;
        }
      } catch {
        /* Only the reviewed CI coordination gate repair is covered. */
      }
    }
    if (
      file === '.github/workflows/ci.yml' &&
      typeof readBase === 'function' &&
      typeof readHead === 'function'
    ) {
      try {
        if (ciStageWorkflowScope(readBase(file), readHead(file))) {
          scopes.set(file, []);
          continue;
        }
      } catch {
        /* Missing comparison evidence remains unclassified. */
      }
    }
    if (renameScopes.has(file)) {
      scopes.set(file, renameScopes.get(file));
      continue;
    }
    if (nullrangeScopes.has(file)) {
      scopes.set(file, nullrangeScopes.get(file));
      continue;
    }
    if (porcelainScopes.has(file)) {
      scopes.set(file, porcelainScopes.get(file));
      continue;
    }
    if (file === 'apps/shell-web/scripts/game-checks/nullrange.mjs') {
      scopes.set(file, ['games/local/vibeJam-myself-nullrange', 'apps/shell-web']);
      continue;
    }
    if (file === 'apps/shell-web/scripts/game-checks/chase-thief.mjs') {
      scopes.set(file, ['games/local/chase-thief', 'apps/shell-web']);
      continue;
    }
    if (file === 'apps/shell-web/scripts/game-checks/ashfall-front.mjs') {
      scopes.set(file, ['games/local/ashfall-front', 'apps/shell-web']);
      continue;
    }
    if (
      [
        'pnpm-lock.yaml',
        'turbo.json',
        'scripts/cocos-validation.mjs',
        'scripts/reuse-cocos-artifacts.mjs',
        '.github/workflows/ci.yml',
        '.github/workflows/pages-validate.yml',
        '.github/workflows/mobile.yml',
        '.github/workflows/carding-car.yml',
      ].includes(file)
    ) {
      try {
        const source = 'games/local/ashfall-front';
        const entries = games.filter((g) => g.id === 'ashfall-front' || g.source === source);
        const targets = packages.filter(
          (p) => p.dir === source || p.name === '@coffeeeeffoc/ashfall-front',
        );
        assert.equal(entries.length, 1);
        assert.equal(entries[0].source, source);
        assert.equal(entries[0].id, 'ashfall-front');
        assert.equal(entries[0].output, 'dist');
        assert.equal(targets.length, 1);
        assert.equal(targets[0].dir, source);
        assert.equal(targets[0].creator?.version, '3.8.8');
        assert.equal(targets[0].scripts?.build, 'node scripts/build.mjs web-mobile');
        if (ashfallCreatorWiringOnly(file, readBase(file), readHead(file))) {
          scopes.set(file, [source]);
          continue;
        }
      } catch {
        /* Other changes keep their existing consumer proof or remain unclassified. */
      }
    }
    if (castleScopes.has(file)) {
      scopes.set(file, castleScopes.get(file));
      continue;
    }
    if (tetracubeScopes.has(file)) {
      scopes.set(file, tetracubeScopes.get(file));
      continue;
    }
    if (mainScopes.has(file)) {
      scopes.set(file, mainScopes.get(file));
      continue;
    }
    let towerConfig;
    if (Object.hasOwn(towerArtifactConfigChanges, file))
      try {
        towerConfig = towerArtifactConfigFileScope(file, readBase?.(file), readHead?.(file), {
          games,
          packages,
          readBase,
          readHead,
        });
      } catch {}
    if (towerConfig) {
      scopes.set(file, towerConfig);
      continue;
    }
    let threeScope;
    if (Object.hasOwn(threeChooseTwoCreatorReviews, file))
      try {
        threeScope = threeChooseTwoCreatorFileScope(file, readBase?.(file), readHead?.(file), {
          games,
          packages,
          readBase,
          readHead,
        });
      } catch {}
    if (threeScope) {
      scopes.set(file, threeScope);
      continue;
    }
    if (file === 'platforms/competition/assets/action.wav') {
      const ids = ['letters-words2', 'vibeJam-myself-history-guess', 'travel-bund'];
      const sources = ids.map((id) => `games/local/${id}`);
      const consumers = [
        ...sources,
        'apps/shell-minigame',
        ...['alipay', 'bilibili', 'douyin', 'kuaishou', 'wechat', 'taptap'].map(
          (platform) => `platforms/${platform}`,
        ),
      ];
      const names = [
        'ciyu-word-tiles',
        'here-and-then',
        '@coffeeeeffoc/travel-bund',
        '@coffeeeeffoc/shell-minigame',
        ...['alipay', 'bilibili', 'douyin', 'kuaishou', 'wechat', 'taptap'].map(
          (platform) => `@coffeeeeffoc/platform-${platform}`,
        ),
      ];
      if (
        ids.every((id, index) => {
          const entries = games.filter((game) => game.id === id || game.source === sources[index]);
          return (
            entries.length === 1 && entries[0].id === id && entries[0].source === sources[index]
          );
        }) &&
        consumers.every((source, index) => {
          const entries = packages.filter((pkg) => pkg.dir === source || pkg.name === names[index]);
          return (
            entries.length === 1 && entries[0].dir === source && entries[0].name === names[index]
          );
        })
      )
        scopes.set(file, consumers);
      continue;
    }
    let mergeBulletIntegration = false;
    if (Object.hasOwn(mergeBulletCreatorIntegrationHashes, file)) {
      try {
        mergeBulletIntegration = mergeBulletCreatorIntegrationFileScope(
          file,
          readBase?.(file),
          readHead?.(file),
        );
      } catch {
        // Missing history cannot establish this cumulative proof.
      }
    }
    let mergeIntegration = false;
    if (Object.hasOwn(mergeCreatorIntegrationHashes, file)) {
      try {
        mergeIntegration = mergeCreatorIntegrationFileScope(
          file,
          readBase?.(file),
          readHead?.(file),
        );
      } catch {
        // Historical baselines may predate this file; retain the shared consumer checks below.
      }
    }
    let bulletLock = false;
    if (file === 'pnpm-lock.yaml') {
      try {
        bulletLock = bulletGardenLockOnly(
          readBase?.(file),
          readHead?.(file),
          JSON.parse(readHead?.('games/local/bullet-garden/package.json')),
        );
      } catch {
        // Other/historical workspaces may lack Bullet; try their lock proofs below.
      }
    }
    try {
      const towerPair = towerCreatorIntegrationHashes[file];
      if (towerPair) {
        const digest = (text) =>
          createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');
        const before = digest(readBase(file)),
          after = digest(readHead(file));
        let ids = [],
          consumers = [];
        if (before === towerPair[0] && after === towerPair[1]) {
          ids = ['tower-brake'];
          consumers = ['games/local/tower-brake'];
        } else if (after === towerTetracubeIntegrationHashes[file]) {
          if (before === towerPair[0]) {
            ids = ['tower-brake', 'tetracube'];
            consumers = ids.map((id) => 'games/local/' + id);
          } else if (before === tetracubeCreatorReviews[file]?.after) {
            ids = ['tower-brake', 'tetracube'];
            consumers = ['games/local/tower-brake'];
          }
        }
        for (const id of ids) {
          const source = 'games/local/' + id,
            name = '@coffeeeeffoc/' + id;
          const entries = games.filter((game) => game.id === id || game.source === source);
          assert.equal(entries.length, 1);
          assert.equal(entries[0].id, id);
          assert.equal(entries[0].source, source);
          assert.equal(entries[0].output, 'dist');
          const targets = packages.filter((pkg) => pkg.dir === source || pkg.name === name);
          assert.equal(targets.length, 1);
          assert.equal(targets[0].dir, source);
          assert.equal(targets[0].name, name);
          assert.equal(targets[0].creator?.version, '3.8.8');
          assert.equal(targets[0].scripts?.build, 'node scripts/build.mjs web-mobile');
          if (file === 'pnpm-lock.yaml') {
            const manifest = JSON.parse(readHead(source + '/package.json'));
            assert.equal(manifest.name, name);
            assert.deepEqual(manifest.devDependencies, {
              '@playwright/test': '1.55.1',
              typescript: '7.0.2',
            });
            for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies'])
              assert(!manifest[field]);
          }
        }
        if (ids.length) {
          scopes.set(file, consumers);
          continue;
        }
      }
      if (file === 'apps/shell-web/scripts/pages-host-smoke.mjs') {
        const digest = (value) =>
          createHash('sha256').update(value.replaceAll('\r\n', '\n')).digest('hex');
        // The last successful Pages tree and the immediate repair parent differ
        // only in the already reviewed mobile Creator startup check.
        const before = digest(readBase(file));
        const after = digest(readHead(file));
        if (
          [
            '30b47a586c2ad818a8b86465bd1f98390389cd61ec2eb5cd49fe5cafebcc5ebd',
            '9de23cd0bee7692dd2d48d0c32fa7ec891893941392eaec78b624992b581ac21',
          ].includes(before) &&
          after === '0080de8bd5a61712c72f9489e786c7a7318a152f568ac017a2d70300f45ed6e1'
        ) {
          const source = 'games/local/merge-front';
          const entries = games.filter(
            (game) => game.id === 'merge-front' || game.source === source,
          );
          assert.equal(entries.length, 1);
          assert.equal(entries[0].id, 'merge-front');
          assert.equal(entries[0].source, source);
          const targets = packages.filter(
            (pkg) => pkg.dir === source || pkg.name === '@small-games/merge-front',
          );
          assert.equal(targets.length, 1);
          assert.equal(targets[0].dir, source);
          assert.equal(targets[0].name, '@small-games/merge-front');
          assert.equal(targets[0].creator?.version, '3.8.8');
          assert.equal(targets[0].scripts?.build, 'node scripts/build.mjs web-mobile');
          scopes.set(file, ['apps/shell-web', source]);
          continue;
        }
      }
      if (mergeBulletIntegration) {
        const consumers = [];
        for (const [id, name] of [
          ['merge-front', '@small-games/merge-front'],
          ['bullet-garden', '@coffeeeeffoc/bullet-garden'],
        ]) {
          const source = `games/local/${id}`;
          const entries = games.filter((game) => game.id === id || game.source === source);
          assert.equal(entries.length, 1);
          assert.equal(entries[0].id, id);
          assert.equal(entries[0].source, source);
          const targets = packages.filter((pkg) => pkg.dir === source || pkg.name === name);
          assert.equal(targets.length, 1);
          assert.equal(targets[0].dir, source);
          assert.equal(targets[0].name, name);
          assert.equal(targets[0].creator?.version, '3.8.8');
          assert.equal(targets[0].scripts?.build, 'node scripts/build.mjs web-mobile');
          consumers.push(source);
        }
        scopes.set(file, consumers);
        continue;
      }
      if (mergeIntegration) {
        const source = 'games/local/merge-front';
        assert.equal(games.filter((g) => g.id === 'merge-front' && g.source === source).length, 1);
        assert.equal(
          packages.filter((p) => p.dir === source && p.creator?.version === '3.8.8').length,
          1,
        );
        scopes.set(file, [source]);
        continue;
      }
      if (bulletLock) {
        scopes.set(file, ['games/local/bullet-garden']);
        continue;
      }
      if (
        [
          ...tianxiaWorkflowFiles,
          ...Object.keys(tianxiaImmersiveFiles),
          'apps/shell-web/src/styles.css',
          'turbo.json',
          'scripts/cocos-validation.mjs',
          'scripts/reuse-cocos-artifacts.mjs',
          standaloneChecksFile,
        ].includes(file) &&
        bulletGardenCreatorFileScope(file, readBase(file), readHead(file))
      ) {
        const source = 'games/local/bullet-garden';
        const entries = games.filter(
          (game) => game.id === 'bullet-garden' || game.source === source,
        );
        assert.equal(entries.length, 1);
        assert.equal(entries[0].id, 'bullet-garden');
        assert.equal(entries[0].source, source);
        const targets = packages.filter(
          (pkg) => pkg.dir === source || pkg.name === '@coffeeeeffoc/bullet-garden',
        );
        assert.equal(targets.length, 1);
        assert.equal(targets[0].dir, source);
        assert.equal(targets[0].name, '@coffeeeeffoc/bullet-garden');
        assert.equal(targets[0].creator?.version, '3.8.8');
        assert.equal(targets[0].scripts?.build, 'node scripts/build.mjs web-mobile');
        scopes.set(file, [
          source,
          ...(file === 'scripts/test-game-dev-mode.mjs' ? ['games/local/wulong-city'] : []),
        ]);
        continue;
      }
      if (
        Object.hasOwn(homeboundCocosWiring, file) &&
        readBase &&
        readHead &&
        homeboundCocosWiringOnly(
          file,
          (() => {
            try {
              return readBase(file);
            } catch {
              return undefined;
            }
          })(),
          readHead(file),
        )
      ) {
        assert(
          games.some(
            (game) =>
              game.id === 'homebound-station' && game.source === 'games/local/homebound-station',
          ),
        );
        assert(packages.some((pkg) => pkg.dir === 'games/local/homebound-station'));
        scopes.set(file, ['games/local/homebound-station']);
        continue;
      }
      if (
        [
          ...tianxiaWorkflowFiles,
          ...Object.keys(tianxiaImmersiveFiles),
          standaloneChecksFile,
          'turbo.json',
          'scripts/cocos-validation.mjs',
          'scripts/reuse-cocos-artifacts.mjs',
        ].includes(file) &&
        readBase &&
        readHead &&
        tianxiaWiringOnly(
          file,
          (() => {
            try {
              return readBase(file);
            } catch {
              return undefined;
            }
          })(),
          readHead(file),
        )
      ) {
        const entries = games.filter(
          (game) => game.id === 'tianxia-chalu' || game.source === tianxiaSource,
        );
        assert.equal(entries.length, 1);
        assert.equal(entries[0].id, 'tianxia-chalu');
        assert.equal(entries[0].source, tianxiaSource);
        const targets = packages.filter(
          (pkg) => pkg.dir === tianxiaSource || pkg.name === '@coffeeeeffoc/tianxia-chalu',
        );
        assert.equal(targets.length, 1);
        assert.equal(targets[0].dir, tianxiaSource);
        assert.equal(targets[0].name, '@coffeeeeffoc/tianxia-chalu');
        assert.equal(targets[0].creator?.version, '3.8.8');
        assert.equal(targets[0].scripts?.build, 'node scripts/build.mjs web-mobile');
        scopes.set(file, [
          tianxiaSource,
          ...(file === 'scripts/test-game-dev-mode.mjs' ? ['games/local/wulong-city'] : []),
        ]);
        continue;
      }
      if (
        file === 'scripts/reuse-cocos-artifacts.mjs' ||
        file === 'scripts/reuse-cocos-artifacts.test.mjs'
      ) {
        const ids = literalDeclaration(readHead('scripts/reuse-cocos-artifacts.mjs'), 'games');
        const consumers = [
          ...cocosWebSources,
          ...(ids.includes('merge-front') ? ['games/local/merge-front'] : []),
          ...(ids.includes('bullet-garden') ? ['games/local/bullet-garden'] : []),
          ...(ids.includes('tower-brake') ? ['games/local/tower-brake'] : []),
          ...(ids.includes('tetracube') ? ['games/local/tetracube'] : []),
          ...(ids.includes('three-choose-two') ? ['games/local/three-choose-two'] : []),
        ];
        assert.deepEqual(
          ids,
          consumers.map((dir) => dir.slice('games/local/'.length)),
        );
        for (const dir of consumers) assert(packages.some((pkg) => pkg.dir === dir));
        scopes.set(file, file.endsWith('.test.mjs') ? [] : consumers);
        continue;
      }
      if (file === 'package.json') {
        const before = readBase(file),
          after = readHead(file);
        const previous = JSON.parse(before),
          current = JSON.parse(after);
        const old = previous.scripts?.['test:validation'];
        const addition = ' scripts/reuse-cocos-artifacts.test.mjs';
        const anchor = 'scripts/cocos-validation.test.mjs';
        if (
          typeof old === 'string' &&
          old.split(anchor).length === 2 &&
          !old.includes(addition) &&
          current.scripts?.['test:validation'] === old.replace(anchor, anchor + addition)
        ) {
          current.scripts['test:validation'] = old;
          assert.deepEqual(current, previous);
          assert.equal(
            after,
            before.replace(
              JSON.stringify(old),
              JSON.stringify(old.replace(anchor, anchor + addition)),
            ),
          );
          scopes.set(file, []);
          continue;
        }
      }
      if (tapServiceSharedScopePaths.includes(file) || file === tapServiceConfigScopePath) {
        assert.deepEqual(
          literalDeclaration(readHead(tapServiceConfigScopePath), 'games'),
          competitionServiceIds,
        );
        const consumers = competitionServiceIds.map((id) => competitionConsumers[id]);
        for (const [index, id] of competitionServiceIds.entries()) {
          assert.equal(games.filter((game) => game.id === id).length, 1);
          assert.equal(games.filter((game) => game.source === consumers[index]).length, 1);
          assert.equal(
            games.filter((game) => game.id === id && game.source === consumers[index]).length,
            1,
          );
        }
        if (
          ['platforms/taptap/competition-identity.mjs', 'platforms/taptap/calls.mjs'].includes(file)
        ) {
          const source = 'games/local/night-overwatch';
          assert.equal(games.filter((game) => game.id === 'night-overwatch').length, 1);
          assert.equal(games.filter((game) => game.source === source).length, 1);
          assert.equal(
            games.filter((game) => game.id === 'night-overwatch' && game.source === source).length,
            1,
          );
          assert.equal(packages.find((pkg) => pkg.dir === source)?.creator?.version, '3.8.8');
          assert(
            importsModule(
              readHead(source + '/scripts/build.mjs'),
              '../../../../scripts/h5-game-services.mjs',
            ),
          );
          consumers.push(source);
        }
        consumers.push('apps/shell-web', 'platforms/taptap');
        for (const dir of consumers)
          assert.equal(packages.filter((pkg) => pkg.dir === dir).length, 1);
        scopes.set(file, consumers);
        continue;
      }
      if (competitionReviewScopePaths.includes(file)) {
        assertCompetitionRegistry(readHead, games);
        const consumers = [
          ...competitionReviewTools[file].map((id) => competitionConsumers[id]),
          'services/runtime-api',
        ];
        for (const dir of consumers)
          assert.equal(packages.filter((pkg) => pkg.dir === dir).length, 1);
        scopes.set(file, consumers);
        continue;
      }
      if (file === submoduleDialogScopePath) {
        assert.deepEqual(literalDeclaration(readHead(file), 'allGames'), submoduleDialogIds);
        const consumers = submoduleDialogIds.map((id) => {
          const source = `games/submodules/${id}`;
          assert.equal(games.filter((game) => game.id === id).length, 1);
          assert.equal(games.filter((game) => game.source === source).length, 1);
          assert.equal(games.filter((game) => game.id === id && game.source === source).length, 1);
          assert.equal(packages.filter((pkg) => pkg.dir === source).length, 1);
          return source;
        });
        scopes.set(file, consumers);
        continue;
      }
      if (file === 'infra/builds/cops-robbers-realtime-taptap.json') {
        const config = JSON.parse(readHead(file));
        assert.deepEqual(Object.keys(config).sort(), [
          'adUnits',
          'ads',
          'backend',
          'games',
          'version',
        ]);
        assert.equal(config.version, 1);
        assert.deepEqual(config.games, ['cops-robbers-realtime']);
        for (const key of ['ads', 'backend'])
          assert(
            Array.isArray(config[key]) &&
              config[key].length === 1 &&
              typeof config[key][0] === 'boolean',
          );
        assert.deepEqual(Object.keys(config.adUnits), config.games);
        assert(/^\d+$/.test(config.adUnits['cops-robbers-realtime']));
        const source = competitionConsumers['cops-robbers-realtime'];
        assert.equal(games.filter((game) => game.id === 'cops-robbers-realtime').length, 1);
        assert.equal(games.filter((game) => game.source === source).length, 1);
        assert.equal(
          games.filter((game) => game.id === 'cops-robbers-realtime' && game.source === source)
            .length,
          1,
        );
        assert.equal(packages.filter((pkg) => pkg.dir === source).length, 1);
        scopes.set(file, [source]);
        continue;
      }

      if (adminControlIntegrationScopePaths.includes(file)) {
        const consumers = ['services/management-api', 'services/runtime-api'];
        for (const dir of consumers) assert(packages.some((pkg) => pkg.dir === dir));
        scopes.set(file, consumers);
        continue;
      }
      if (
        adminCspScopePaths.includes(file) ||
        (file === 'turbo.json' &&
          readBase &&
          readHead &&
          adminCspTurboOnly(readBase(file), readHead(file)))
      ) {
        const consumers =
          file === 'turbo.json' ? ['apps/admin-web'] : ['apps/admin-web', 'apps/company-web'];
        for (const dir of consumers) assert(packages.some((pkg) => pkg.dir === dir));
        scopes.set(file, consumers);
        continue;
      }
      if (adminControlDeploymentScopePaths.includes(file)) {
        const consumers = [...adminConsumers, 'services/runtime-api', 'services/kart-server'];
        for (const dir of consumers) assert(packages.some((pkg) => pkg.dir === dir));
        scopes.set(file, consumers);
        continue;
      }
      if (
        file === 'pnpm-lock.yaml' &&
        readBase &&
        readHead &&
        adminWebLockOnly(readBase(file), readHead(file), readHead('apps/admin-web/package.json'))
      ) {
        assert.equal(
          packages.filter(
            (pkg) => pkg.dir === 'apps/admin-web' && pkg.name === '@coffeeeeffoc/admin-web',
          ).length,
          1,
        );
        scopes.set(file, ['apps/admin-web']);
        continue;
      }
      if (imageAuthorityScopePaths.includes(file)) {
        for (const dir of imageAuthorityConsumers) assert(packages.some((pkg) => pkg.dir === dir));
        scopes.set(file, imageAuthorityConsumers);
        continue;
      }
      if (backendDeploymentScopePaths.includes(file)) {
        for (const dir of selectedBackendConsumers) assert(packages.some((pkg) => pkg.dir === dir));
        scopes.set(file, selectedBackendConsumers);
        continue;
      }
      if (file === 'package.json' && readBase && readHead) {
        const consumers = targetedCommandsOnly(readBase(file), readHead(file));
        if (consumers) {
          for (const dir of consumers) assert(packages.some((pkg) => pkg.dir === dir));
          if (consumers.some((dir) => sixH5Sources.includes(dir)))
            assertSixH5(games, packages, readHead);
          for (const id of competitionServiceIds.filter((id) =>
            consumers.includes(competitionConsumers[id]),
          ))
            assert(
              games.some((game) => game.id === id && game.source === competitionConsumers[id]),
            );
          scopes.set(file, consumers);
          continue;
        }
      }
      if (sharedDeploymentScopePaths.includes(file)) {
        const consumers = ['apps/company-web', ...adminConsumers, ...selectedBackendConsumers];
        for (const source of consumers) assert(packages.some((pkg) => pkg.dir === source));
        scopes.set(file, consumers);
        continue;
      }
      if (
        adminConsoleScopePaths.includes(file) ||
        (file === 'package.json' &&
          readBase &&
          readHead &&
          adminCommandsOnly(readBase(file), readHead(file)))
      ) {
        for (const source of adminConsumers) assert(packages.some((pkg) => pkg.dir === source));
        const consumers = [
          ...adminConsumers,
          ...(backendSharedScopePaths.includes(file) ? selectedBackendConsumers : []),
        ];
        for (const dir of consumers) assert(packages.some((pkg) => pkg.dir === dir));
        scopes.set(file, consumers);
        continue;
      }
      if (runtimeProxyDefaultScopePaths.includes(file) && readBase && readHead) {
        const before = readBase(file)?.replaceAll('\r\n', '\n'),
          after = readHead(file)?.replaceAll('\r\n', '\n');
        const [oldDefault, newDefault] = runtimeProxyDefaultChanges[file];
        if (before.includes(oldDefault) && after.includes(newDefault)) {
          assert(before.split(oldDefault).length === 2 && after.split(newDefault).length === 2);
          assert.equal(
            after.replace(newDefault, oldDefault),
            before,
            'Other producer bytes changed',
          );
          assert(packages.some((pkg) => pkg.dir === 'services/runtime-api'));
          scopes.set(file, ['services/runtime-api']);
          continue;
        }
      }
      if (competitionIngressScopePaths.includes(file)) {
        for (const source of ingressConsumers) assert(packages.some((pkg) => pkg.dir === source));
        scopes.set(file, ingressConsumers);
        continue;
      }
      if (['scripts/deploy-tencent.mjs', 'infra/tencent/deploy.sh'].includes(file)) {
        const before = readBase(file),
          after = readHead(file);
        const guard = file.endsWith('.mjs') ? ingressPreflightGuard : ingressShellGuard;
        const count = file.endsWith('.mjs') ? 1 : 2;
        if (!before.includes(guard) && after.split(guard).length === count + 1) {
          const stripped = after.replaceAll(guard, '');
          // The early guard and lock-race guard must precede every service/build/database mutation.
          if (file.endsWith('.mjs'))
            assert(after.includes('return `set -eu\n' + guard + 'docker compose version'));
          else {
            assert(after.includes('set +a\n' + guard + 'compose()'));
            assert(
              after.includes(
                "flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }\n" +
                  guard +
                  'previous=',
              ),
            );
          }
          let consumers = [];
          if (stripped !== before) {
            const inherited = reviewedSharedFileScopes({
              changedPaths: [file],
              readBase,
              readHead: (name) => (name === file ? stripped : readHead(name)),
              games,
              packages,
            });
            assert(inherited.has(file), 'Unrelated deployment delta remains unreviewed');
            consumers = inherited.get(file);
          }
          for (const source of ['apps/company-web', 'services/runtime-api'])
            assert(packages.some((pkg) => pkg.dir === source));
          scopes.set(file, [
            ...new Set([...consumers, 'apps/company-web', 'services/runtime-api']),
          ]);
          continue;
        }
      }
      if (
        file === 'scripts/competition-gateway.mjs' &&
        identityGatewayFileScope(readBase(file), readHead(file))
      ) {
        const consumers = competitionIdentityFileScope({ games, packages, readBase, readHead });
        for (const source of ['services/runtime-api', 'apps/shell-web']) {
          assert.equal(packages.filter((pkg) => pkg.dir === source).length, 1);
          consumers.push(source);
        }
        scopes.set(file, consumers);
        continue;
      }
      if (
        competitionIdentityScopePaths.includes(file) ||
        competitionIdentityMirrorPaths.includes(file)
      ) {
        const consumers = competitionIdentityFileScope({ games, packages, readBase, readHead });
        if (file === 'scripts/competition-client.test.mjs')
          for (const host of ['apps/shell-minigame']) {
            assert.equal(packages.filter((pkg) => pkg.dir === host).length, 1);
            consumers.push(host);
          }
        scopes.set(
          file,
          competitionIdentityMirrorPaths.includes(file)
            ? consumers.filter((source) => file.startsWith(source + '/'))
            : consumers,
        );
        continue;
      }
      if (file === playerSessionMigration || Object.hasOwn(playerSessionChanges, file)) {
        let before = null;
        try {
          before = readBase(file);
        } catch {}
        if (playerSessionBackendFileScope(file, before, readHead(file))) {
          assert(packages.some((pkg) => pkg.dir === 'services/runtime-api'));
          assert(packages.some((pkg) => pkg.dir === 'services/kart-server'));
          scopes.set(file, ['services/runtime-api', 'services/kart-server']);
          continue;
        }
      }
      if (
        file === '.github/workflows/pages-validate.yml' &&
        anonymousPagesFileScope(file, readBase(file), readHead(file))
      ) {
        scopes.set(file, [
          'games/local/cops-robbers',
          'games/local/cops-robbers-realtime',
          'games/submodules/xiangqi-five',
        ]);
        continue;
      }
      if (file === identityMigration || Object.hasOwn(identityBackendChanges, file)) {
        let before;
        try {
          before = readBase(file);
        } catch {
          before = null;
        }
        if (identityBackendFileScope(file, before, readHead(file))) {
          assert.equal(packages.filter((pkg) => pkg.dir === 'services/runtime-api').length, 1);
          scopes.set(file, ['services/runtime-api']);
          continue;
        }
        if (file === identityMigration) continue;
      }
      if (streetFiles.includes(file)) {
        assertCompetitionRegistry(readHead, games);
        assert(importsModule(readHead('platforms/competition/h5.js'), './street-pages.js'));
        assert(
          importsModule(readHead('platforms/competition/street-pages.js'), './profile-dom.js'),
        );
        assert(
          importsModule(readHead('platforms/competition/street-pages.js'), './street.css?inline'),
        );
        scopes.set(file, [competitionConsumers['cops-robbers-realtime']]);
        continue;
      }
      if (
        Object.hasOwn(backendInstallerChanges, file) &&
        typeof readBase === 'function' &&
        typeof readHead === 'function' &&
        backendInstallerOnly(file, readBase(file), readHead(file))
      ) {
        const { consumers } = backendInstallerChanges[file];
        for (const source of consumers) assert(packages.some((pkg) => pkg.dir === source));
        scopes.set(file, consumers);
        continue;
      }
      if (file === 'infra/builds/five-taptap-h5.mjs') {
        assert(sixH5PresetOnly(readHead(file), true));
        assertSixH5(games, packages, readHead);
        scopes.set(
          file,
          sixH5Sources.filter(
            (source) => !source.endsWith('/travel-bund') && !source.endsWith('/homebound-station'),
          ),
        );
        continue;
      }
      if (file === 'games/local/carding-car/scripts/cocos-branding.mjs') {
        scopes.set(file, [
          'games/local/carding-car',
          'games/local/night-overwatch',
          tianxiaSource,
          ...(packages.some(
            (pkg) => pkg.dir === 'games/local/bullet-garden' && pkg.creator?.version === '3.8.8',
          )
            ? ['games/local/bullet-garden']
            : []),
          'games/local/homebound-station',
          ...(packages.some(
            (pkg) => pkg.dir === 'games/local/three-choose-two' && pkg.creator?.version === '3.8.8',
          )
            ? ['games/local/three-choose-two']
            : []),
        ]);
        continue;
      }
      if (sixH5ScopePaths.includes(file)) {
        if (file.endsWith('.test.mjs')) scopes.set(file, []);
        else {
          const h5Sources = assertSixH5(games, packages, readHead);
          if (file === 'infra/builds/six-taptap-h5.mjs') assert(sixH5PresetOnly(readHead(file)));
          const sharedConsumer = [
            'platforms/h5/game-rewards.js',
            'platforms/h5/interstitial.js',
            'scripts/h5-game-build.mjs',
          ].includes(file);
          scopes.set(
            file,
            file === 'infra/builds/six-taptap-h5.mjs'
              ? presetH5Ids.map((id) => `games/local/${id}`)
              : [
                  ...(sharedConsumer ? h5Sources : sixH5Sources),
                  ...flickRewardConsumers(file, games, packages).filter(
                    (source) => !h5Sources.includes(source),
                  ),
                ],
          );
        }
        continue;
      }
      if (h5AcceptanceScopePaths.includes(file) && !competitionServiceScopePaths.includes(file)) {
        scopes.set(file, []);
        continue;
      }
      if (
        competitionServiceScopePaths.includes(file) ||
        (['package.json', 'turbo.json'].includes(file) &&
          competitionServiceConfigOnly(file, readBase(file), readHead(file))) ||
        (typeof readBase === 'function' &&
          typeof readHead === 'function' &&
          Object.hasOwn(competitionServiceIntegrations, file) &&
          competitionServiceIntegration(file, readBase(file), readHead(file)))
      ) {
        assert.deepEqual(
          literalDeclaration(readHead('scripts/competition-service-config.mjs'), 'serviceGames'),
          competitionServiceIds,
        );
        assert.deepEqual(
          literalDeclaration(readHead('scripts/h5-ad-config.mjs'), 'h5AdGames'),
          competitionServiceIds,
        );
        for (const id of competitionServiceIds) {
          assert.equal(
            games.filter((game) => game.id === id && game.source === competitionConsumers[id])
              .length,
            1,
          );
          assert.equal(packages.filter((pkg) => pkg.dir === competitionConsumers[id]).length, 1);
        }
        const native = [
          'platforms/competition/native.js',
          'platforms/competition/client.js',
          'scripts/competition-client.test.mjs',
        ].includes(file);
        const xiangqi = file.startsWith('platforms/competition/xiangqi-five/');
        const protocolGame = competitionProtocolTools[file];
        const sources = protocolGame
          ? [competitionConsumers[protocolGame]]
          : xiangqi
            ? [competitionConsumers['xiangqi-five']]
            : native
              ? Object.values(competitionConsumers)
              : competitionServiceIds.map((id) => competitionConsumers[id]);
        const gateway = ['scripts/deploy-tencent.mjs', 'scripts/competition-gateway.mjs'].includes(
          file,
        );
        if (
          sharedH5PackagePaths.includes(file) &&
          readHead('scripts/h5-ad-config.mjs').includes('additionalH5Games')
        ) {
          sources.push(...assertSixH5(games, packages, readHead));
        }
        if (file === 'scripts/competition-service-config.mjs') {
          assertSixH5(games, packages, readHead);
          sources.push(
            ...sixH5Sources.filter(
              (source) =>
                !source.endsWith('/travel-bund') && !source.endsWith('/homebound-station'),
            ),
          );
        }
        if (gateway) {
          assertRankedConsumers(games, packages, readHead);
          assertGameServiceCopies(readHead);
        }
        scopes.set(file, [
          ...new Set([
            ...sources,
            ...(native || xiangqi || protocolGame ? [] : ['apps/shell-web']),
            ...(file === 'scripts/competition-service-config.mjs' ? ['apps/shell-minigame'] : []),
            ...(native ? ['apps/shell-minigame'] : xiangqi ? ['apps/shell-minigame'] : []),
            ...(gateway ? [...Object.values(rankedConsumers), 'services/runtime-api'] : []),
            ...(file === 'scripts/competition.integration.mjs' || protocolGame
              ? ['services/runtime-api']
              : []),
          ]),
        ]);
        continue;
      }
      if (file === 'scripts/night-overwatch-selftest.mjs') {
        scopes.set(file, ['games/local/night-overwatch', 'services/runtime-api']);
        continue;
      }
      if (
        file === 'scripts/competition-gateway.mjs' &&
        nightGatewayFileScope(readBase(file), readHead(file))
      ) {
        assertNightRuntimeConsumer(games, packages, readHead);
        assert.equal(packages.filter((pkg) => pkg.dir === 'apps/shell-web').length, 1);
        scopes.set(file, ['games/local/night-overwatch', 'services/runtime-api', 'apps/shell-web']);
        continue;
      }
      if (
        gameServiceScopePaths.includes(file) &&
        (file !== 'scripts/competition-gateway.mjs' ||
          rankedGatewayFileScope(readBase(file), readHead(file)) ||
          matchGatewayFileScope(readBase(file), readHead(file)))
      ) {
        assertRankedConsumers(games, packages, readHead);
        assertGameServiceCopies(readHead);
        if (file === 'scripts/competition-gateway.mjs')
          assert(
            rankedGatewayFileScope(readBase(file), readHead(file)) ||
              matchGatewayFileScope(readBase(file), readHead(file)),
          );
        const gateway = file.startsWith('scripts/');
        if (gateway) assert(packages.some((pkg) => pkg.dir === 'apps/shell-web'));
        scopes.set(file, [
          ...Object.values(rankedConsumers),
          ...sixH5Sources.filter(
            (source) => !source.endsWith('/travel-bund') && !source.endsWith('/homebound-station'),
          ),
          ...(gateway ? ['services/runtime-api', 'apps/shell-web'] : []),
        ]);
        continue;
      }
      if (file === 'turbo.json' && nightServiceTurboOnly(readBase(file), readHead(file))) {
        assertNightRuntimeConsumer(games, packages, readHead);
        scopes.set(file, ['games/local/night-overwatch']);
        continue;
      }
      if (
        nightRuntimeInputs.includes(file) ||
        (['scripts/deploy-tencent.mjs', 'scripts/check-workspace-dependencies.mjs'].includes(
          file,
        ) &&
          typeof readBase === 'function' &&
          typeof readHead === 'function' &&
          nightBackendFileScope(file, readBase(file), readHead(file)))
      ) {
        assertNightRuntimeConsumer(games, packages, readHead);
        scopes.set(file, [
          'services/runtime-api',
          ...(file === 'scripts/check-workspace-dependencies.mjs'
            ? ['games/local/night-overwatch']
            : []),
        ]);
        continue;
      }
      if (rankedInputs.includes(file)) {
        assertRankedConsumers(games, packages, readHead);
        scopes.set(file, ['services/runtime-api']);
        continue;
      }
      if (
        file === 'scripts/deploy-tencent.mjs' &&
        rankedDeploymentFileScope(readBase(file), readHead(file))
      ) {
        assertRankedConsumers(games, packages, readHead);
        scopes.set(file, [...Object.values(rankedConsumers), 'services/runtime-api']);
        continue;
      }
      if (file === independentPreviewScopeFile) {
        // Bind the reviewed independent runner and its retained viewport helper.
        const digest = (text) => createHash('sha256').update(text).digest('hex');
        assert.equal(
          digest(readBase(file)),
          '40b88c9a89b30e8622f5521aec578cbbdf585d8dacf01492729c28c0a2527b6f',
        );
        assert.equal(
          digest(readHead(file)),
          'bd72ed4fe39dc75aaa5994a21c8a41735225b3e9aa29d01a44af67167865008c',
        );
        assert.equal(
          digest(readHead(mobileViewportScopeFile)),
          '2cae660cd9fe007ec4c2fcf70eca62aff533c500379a51a29252fc45cfa7b163',
        );
        for (const [id, source] of Object.entries(independentPreviewConsumers))
          assert(
            games.filter((game) => game.id === id || game.source === source).length === 1 &&
              games.some((game) => game.id === id && game.source === source),
          );
        scopes.set(file, Object.values(independentPreviewConsumers));
        continue;
      }
      if (file === mobileViewportScopeFile) {
        // Exact reviewed extraction of the existing Pages viewport contract.
        // Arbitrary selection/artifact/default-viewport changes stay unclassified.
        const digest = (text) => createHash('sha256').update(text).digest('hex');
        assert.equal(
          digest(readBase(file)),
          '9842e1dd43a69e8abd7067bd4bb1a126775a0c57f7df0733c98acec3a6ecc272',
        );
        assert.equal(
          digest(readHead(file)),
          '2cae660cd9fe007ec4c2fcf70eca62aff533c500379a51a29252fc45cfa7b163',
        );
        for (const [id, source] of Object.entries(mobileViewportConsumers))
          assert(games.filter((game) => game.id === id && game.source === source).length === 1);
        scopes.set(file, Object.values(mobileViewportConsumers));
        continue;
      }
      const cumulative =
        file === carromDeployFile &&
        cumulativeRuntimeDeploymentScope(file, readBase(file), readHead(file));
      if (
        cumulative ||
        (Object.hasOwn(flickIntegrationChanges, file) &&
          flickIntegrationFileScope(file, readBase(file), readHead(file)))
      ) {
        const bindings = games.filter(
          (game) => game.id === 'flick-arena' || game.source === flickSource,
        );
        assert(
          bindings.length === 1 &&
            bindings[0].id === 'flick-arena' &&
            bindings[0].source === flickSource,
        );
        if (cumulative) {
          assertCarromConsumers(games, packages);
          assertCarromFriendsInputs(readHead);
          scopes.set(file, [flickSource, carromSource, 'services/runtime-api']);
        } else scopes.set(file, flickIntegrationChanges[file].consumers);
      } else if (Object.hasOwn(codexAgentHashes, file)) {
        assert.equal(
          createHash('sha256').update(readHead(file)).digest('hex'),
          codexAgentHashes[file],
        );
        scopes.set(file, []);
      } else if (platformAdsScopePaths.includes(file)) {
        const source = 'games/local/cops-robbers';
        assert(
          games.filter((game) => game.id === 'cops-robbers' && game.source === source).length === 1,
        );
        assert(packages.some((pkg) => pkg.dir === source));
        const adapter = !file.includes('deploy-taptap');
        const h5Sources = adapter ? assertSixH5(games, packages, readHead) : [];
        scopes.set(
          file,
          adapter
            ? [
                source,
                'games/local/cops-robbers-realtime',
                'games/submodules/xiangqi-five',
                ...h5Sources,
                ...packages
                  .filter(
                    (pkg) =>
                      pkg.dir === 'games/local/bullet-garden' &&
                      pkg.creator?.version === '3.8.8' &&
                      !h5Sources.includes(pkg.dir),
                  )
                  .map((pkg) => pkg.dir),
                ...flickRewardConsumers(file, games, packages).filter(
                  (source) => !h5Sources.includes(source),
                ),
              ]
            : [source],
        );
      } else if (safeAreaScopePaths.includes(file)) {
        for (const [id, source] of Object.entries(safeAreaConsumers)) {
          assert(games.filter((game) => game.id === id && game.source === source).length === 1);
          assert(packages.some((pkg) => pkg.dir === source));
        }
        scopes.set(file, Object.values(safeAreaConsumers));
      } else if (publishingHostScopePaths.includes(file)) {
        if (file.endsWith('.test.mjs')) scopes.set(file, []);
        else {
          assert.deepEqual(
            literalDeclaration(readHead('scripts/h5-ad-config.mjs'), 'publishingInterstitialGames'),
            Object.keys(publishingHostConsumers),
          );
          for (const [id, source] of Object.entries(publishingHostConsumers)) {
            const entries = games.filter((game) => game.id === id || game.source === source);
            assert.equal(entries.length, 1);
            assert.equal(entries[0].id, id);
            assert.equal(entries[0].source, source);
            assert.equal(packages.filter((pkg) => pkg.dir === source).length, 1);
          }
          scopes.set(file, Object.values(publishingHostConsumers));
        }
      } else if (publishingScopePaths.includes(file)) {
        for (const [id, source] of Object.entries(publishingConsumers)) {
          assert(games.filter((game) => game.id === id && game.source === source).length === 1);
          assert(packages.some((pkg) => pkg.dir === source));
        }
        scopes.set(file, Object.values(publishingConsumers));
      } else if (publicationConfigScopePaths.includes(file)) {
        scopes.set(file, []);
      } else if (
        companyDeploymentScopePaths.includes(file) ||
        (file === 'package.json' && companyCommandsOnly(readBase(file), readHead(file)))
      ) {
        assert(packages.some((pkg) => pkg.dir === 'apps/company-web'));
        scopes.set(file, ['apps/company-web']);
      } else if (
        deploymentBundleScopePaths.includes(file) ||
        (file === 'package.json' && deploymentCommandsOnly(readBase(file), readHead(file)))
      ) {
        // The bundle's source-copy/secret-isolation contract is checked directly.
        // Unchanged kart/Cocos game rendering is not an input to a backend archive.
        for (const source of ['services/runtime-api', 'services/management-api'])
          assert(packages.some((pkg) => pkg.dir === source));
        scopes.set(file, [
          'services/runtime-api',
          'services/management-api',
          ...(['scripts/deployment-bundle.mjs', 'scripts/deployment-bundle.test.mjs'].includes(file)
            ? [
                ...competitionServiceIds.map((id) => competitionConsumers[id]),
                ...sixH5Sources.filter(
                  (source) =>
                    !source.endsWith('/homebound-station') && !source.endsWith('/travel-bund'),
                ),
                'apps/shell-web',
              ]
            : []),
        ]);
      } else if (
        file === carromDeployFile &&
        carromBackendFileScope(file, readBase(file), readHead(file))
      ) {
        assertCarromConsumers(games, packages);
        if (carromFriendsDeploymentScope(readBase(file), readHead(file)))
          assertCarromFriendsInputs(readHead);
        scopes.set(file, [carromSource, 'services/runtime-api']);
      } else if (file === carromFriendsCore || file === carromFriendsContent) {
        assertCarromConsumers(games, packages);
        assertCarromFriendsInputs(readHead);
        scopes.set(file, ['services/runtime-api']);
      } else if (file === carromCore || file === carromContent) {
        assertCarromConsumers(games, packages);
        assert(importsModule(readHead(carromRule), '../../../' + carromCore));
        if (file === carromContent) assert(importsModule(readHead(carromCore), './content.mjs'));
        // A pure core edit still needs authoritative-server builds/types/tests,
        // without promoting a rules-only edit to a game browser regression.
        scopes.set(file, ['services/runtime-api']);
      } else if (
        file === threeChooseTwoMigration ||
        Object.hasOwn(threeChooseTwoBackendChanges, file)
      ) {
        assert(
          games.some(
            (game) =>
              game.id === 'three-choose-two' && game.source === 'games/local/three-choose-two',
          ),
        );
        let before = null;
        try {
          before = readBase(file);
        } catch {
          /* New reviewed migration has no baseline. */
        }
        assert(threeChooseTwoBackendFileScope(file, before, readHead(file)));
        scopes.set(file, ['games/local/three-choose-two', 'services/runtime-api']);
      } else if (
        file === standaloneChecksFile &&
        exactHomeboundReadyGuard(readBase(file), readHead(file))
      ) {
        assert(
          games.filter(
            (game) =>
              game.id === 'homebound-station' && game.source === 'games/local/homebound-station',
          ).length === 1,
        );
        scopes.set(file, ['games/local/homebound-station']);
      } else if (
        file === standaloneChecksFile &&
        exactTowerLevelsGuard(readBase(file), readHead(file))
      ) {
        assert(
          games.filter(
            (game) => game.id === 'tower-brake' && game.source === 'games/local/tower-brake',
          ).length === 1,
        );
        scopes.set(file, ['games/local/tower-brake']);
      } else if (
        file === standaloneChecksFile &&
        exactCopsStartGuard(readBase(file), readHead(file))
      ) {
        assert(
          games.filter(
            (game) => game.id === 'cops-robbers' && game.source === 'games/local/cops-robbers',
          ).length === 1,
        );
        scopes.set(file, ['games/local/cops-robbers']);
      } else if (
        file === standaloneChecksFile &&
        readBase(file).split(castleEntryBefore).length === 2 &&
        readHead(file) === readBase(file).replace(castleEntryBefore, castleEntryAfter)
      ) {
        assert(
          games.some(
            (game) =>
              game.id === 'castle-cannon' && game.source === 'games/local/game-castle-cannon',
          ),
        );
        scopes.set(file, ['games/local/game-castle-cannon']);
      } else if (file === 'apps/shell-web/scripts/game-checks/castle-cannon.mjs') {
        assert(
          games.some(
            (game) =>
              game.id === 'castle-cannon' && game.source === 'games/local/game-castle-cannon',
          ),
        );
        assert(readHead(standaloneChecksFile).includes(castleEntryAfter));
        assert(
          createHash('sha256').update(readHead(file)).digest('hex') ===
            '6e2b0fd6a44a776e553fe09ed6f7235c1225282d8613b23168156a4fc0eeadcb',
        );
        scopes.set(file, ['games/local/game-castle-cannon']);
      } else if (file === standaloneChecksFile || file === cageRescueGameplayFile) {
        assertCageRescueCatalog(games);
        assertCageRescueDelegate({ readBase, readHead });
        scopes.set(file, [cageRescueSource]);
      } else if (Object.hasOwn(cageRescueImmersiveFiles, file)) {
        assertCageRescueCatalog(games);
        assertCageRescueImmersive(file, readBase(file), readHead(file));
        scopes.set(file, [cageRescueSource]);
      } else if (
        file === validationHistoryFile &&
        createHash('sha256').update(readBase(file)).digest('hex') ===
          '10e5fa89f611a547ef1608d4c4802399d6ab830398cc53c8f42ff25a53c7b467' &&
        createHash('sha256').update(readHead(file)).digest('hex') ===
          '195f158be27400dab8f9b73e263d66854375add335df1442cb4464a3495e6809'
      ) {
        // Only the reviewed company build/test/copy step; all game gates stay unchanged.
        assert(packages.some((pkg) => pkg.dir === 'apps/company-web'));
        scopes.set(file, ['apps/company-web']);
      } else if (
        cacheWorkflowHashes[file] &&
        exactCacheWorkflow(file, readBase(file), readHead(file))
      ) {
        scopes.set(file, []);
      } else if (
        file === validationHistoryFile &&
        exactValidationHistory(file, readBase(file), readHead(file))
      ) {
        scopes.set(file, []);
      } else if (
        planningCheckoutHashes[file] &&
        exactPlanningCheckout(file, readBase(file), readHead(file))
      ) {
        scopes.set(file, []);
      } else if (file === '.github/workflows/ci.yml') {
        const beforeText = readBase(file),
          afterText = readHead(file);
        const gateAnchor = '    env:\n      KART_PREBUILT_DIR:';
        if (
          createHash('sha256').update(beforeText).digest('hex') ===
            planningCheckoutHashes[file].parser &&
          beforeText.split(gateAnchor).length === 2 &&
          afterText ===
            beforeText.replace(
              gateAnchor,
              "    env:\n      MINIGAME_RELEASE_GATES: ${{ vars.MINIGAME_RELEASE_GATES || '0' }}\n      KART_PREBUILT_DIR:",
            )
        ) {
          scopes.set(file, []);
          continue;
        }
        const yaml = loadDependency('js-yaml');
        const before = yaml.load(readBase(file)),
          after = yaml.load(readHead(file));
        const old = before.jobs?.quality?.['timeout-minutes'];
        const current = after.jobs?.quality?.['timeout-minutes'];
        assert(
          Number.isInteger(old) && Number.isInteger(current) && current >= old && current <= 360,
        );
        after.jobs.quality['timeout-minutes'] = old;
        assert(isDeepStrictEqual(before, after), 'Workflow execution changed');
        scopes.set(file, []);
      } else if (file === '.gitignore') {
        const added = additiveLines(readBase(file), readHead(file));
        assert(
          added.length && added.every((line) => localIgnores.has(line)),
          'Unreviewed ignored source',
        );
        scopes.set(file, []);
      } else if (file === '.prettierignore') {
        const added = additiveLines(readBase(file), readHead(file));
        assert(added.length);
        const sources = new Set();
        for (const copy of added) {
          const game = games.find((entry) => copy === `${entry.source}/public/fullscreen.js`);
          assert(
            game && readHead(copy) === readHead('platforms/h5/fullscreen.js'),
            'Ignored source is not a canonical fullscreen copy',
          );
          const copies = literalDeclaration(readHead('scripts/sync-h5-fullscreen.mjs'), 'copies');
          assert(
            Array.isArray(copies) &&
              new Set(copies).size === copies.length &&
              copies.includes(copy),
            'Fullscreen copy is not checked',
          );
          sources.add(game.source);
        }
        scopes.set(file, [...sources]);
      } else if (file === 'scripts/check-game-config.test.mjs') {
        scopes.set(file, []);
      } else if (competitionFiles.includes(file)) {
        assertCompetitionRegistry(readHead, games);
        if (
          ['platforms/competition/profile-dom.js', 'platforms/competition/h5.css'].includes(file)
        ) {
          assert(importsModule(readHead('platforms/competition/h5.js'), './profile-dom.js'));
          assert(importsModule(readHead('platforms/competition/h5.js'), './h5.css?inline'));
          assert(
            importsModule(readHead('platforms/competition/street-pages.js'), './profile-dom.js'),
          );
        }
        scopes.set(
          file,
          file === builder && exactCopsOfflineBuild(readBase(file), readHead(file))
            ? [competitionConsumers['cops-robbers']]
            : lettersTests.includes(file)
              ? [competitionConsumers['letters-words2']]
              : Object.values(competitionConsumers),
        );
      }
    } catch {
      // Unproved config or new registry consumers stay absent and block publication.
    }
  }
  return scopes;
}

export function competitionToolPlan({ paths, games, packages, fileScopes }) {
  const selected = competitionFiles.filter((file) => paths.includes(file) && fileScopes.has(file));
  const h5 = selected.some((file) => h5Files.includes(file) || file === builder);
  const native = selected.some((file) => nativeFiles.includes(file) || file === builder);
  const letters = h5 || native || selected.some((file) => lettersTests.includes(file));
  const consumers = new Set();
  if (selected.length) {
    for (const [id, source] of Object.entries(competitionConsumers))
      assert(games.some((game) => game.id === id && game.source === source));
    for (const dir of [
      'apps/shell-web',
      'services/runtime-api',
      ...(native
        ? [
            'apps/shell-minigame',
            'platforms/wechat',
            'platforms/bilibili',
            'platforms/douyin',
            'platforms/kuaishou',
          ]
        : []),
    ]) {
      assert(
        packages.some((pkg) => pkg.dir === dir),
        `Missing competition consumer ${dir}`,
      );
      consumers.add(dir);
    }
  }
  return {
    h5,
    native,
    letters,
    config_tests:
      paths.includes('scripts/check-game-config.test.mjs') ||
      paths.includes('.github/workflows/ci.yml'),
    consumer_sources: [...consumers],
  };
}
