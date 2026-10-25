import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

// Only this reviewed identity transition is supported. New game files still enter
// their real rules, Creator build, browser and dependency-consumer checks.
export const gameRename = Object.freeze({
  from: 'three-choose-two',
  to: 'place-and-clear',
  oldSource: 'games/local/three-choose-two',
  source: 'games/local/place-and-clear',
  tree: 'dba03c9a99c7592babbf886a52d391e33ad56e0e',
});
const REGISTRY = 'apps/shell-web/src/standalone-games.json';
const META = 'apps/shell-web/src/game-meta.json';
const LOCK = 'pnpm-lock.yaml';
const proofs = new WeakMap();
const digest = (text) => createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');
const rename = (text) => text.replaceAll(gameRename.from, gameRename.to);
const readJson = (read, file) => JSON.parse(read(file));
const blob = (entry, file) =>
  new RegExp(
    '^(100644|100755) blob [a-f0-9]{40}\\t' +
      file.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&') +
      '\\n?$',
  ).test(entry);

// Full before/after hashes are reviewed separately from the per-game rename.
// No extra executable bytes or changed dependency resolution inherit this scope.
export const gameRenameReviews = Object.freeze({
  '.github/workflows/carding-car.yml': {
    before: '29bda512463659ed022b1e2bd16b70f9f0a74103c27b9600a4df3c8df8cabef4',
    after: '28f7f7f7c22ce1b2e4d94f046ef1ad3da31c634066f7711d7b288144bff3e5ca',
    sources: ['games/local/place-and-clear'],
  },
  '.github/workflows/ci.yml': {
    before: '349e197269c39ecbc02694ab654b9cdff837220a4f85fda36edd58173a391ddf',
    after: 'd51bd123442361243b8226280bb7869d07d115602c44b97fc1a50af451fa76ed',
    sources: ['games/local/place-and-clear'],
  },
  '.github/workflows/mobile.yml': {
    before: 'd771d80a3c9a5de9202559b5083636b75b04220a486904458286d3e874bcc4c2',
    after: '49a7113afe2ed48a2e72a732e0ea8427fc247d069c0818000030dab95923acc2',
    sources: ['games/local/place-and-clear'],
  },
  '.github/workflows/pages-validate.yml': {
    before: '2de509f645b0351bbeafb057614f6113583d4e0e9efec60a9ee65692196345e7',
    after: 'f9e1a4964375f0c6e5376afa84bec6fdc8ed122c87a5babe92c07dea6435f22b',
    sources: ['games/local/place-and-clear'],
  },
  'apps/shell-minigame/scripts/build.mjs': {
    before: '0d879fad2c1898ffbb97e9246e584975429b0328de79108bb832fb994bf2b348',
    after: '964fd9b6e7f5ebc85587d51ff4d6f7e7f4d6157104b87fbc9ec3e3da0d9152b0',
    sources: ['games/local/place-and-clear', 'apps/shell-minigame'],
  },
  'apps/shell-minigame/scripts/games.mjs': {
    before: '15619b9231d5d3299150eeb2de0d91ee3bf7af5a0346739143d7a567cb03dbe5',
    after: '1a7d332ac3f11e60b7437231de1dc3c2b212a81d721d062b730a83ccd6c00174',
    sources: ['games/local/place-and-clear', 'apps/shell-minigame'],
  },
  'apps/shell-web/scripts/pages-smoke.mjs': {
    before: '3d6053ceaca61859f6a807932be4632a431c54ea7be6ce728010ec3aa024409e',
    after: '81f6ab429efd3c6f39840fdd9cf69526a430582429ddaaba2bc008c6c93bbb94',
    sources: ['games/local/place-and-clear', 'apps/shell-web'],
  },
  'apps/shell-web/scripts/standalone-game-checks.mjs': {
    before: '679bbdacf0838a00591b56fc157d72fbd39a9d291775e8146be5cd0a102dc5d7',
    after: '446e8765fbb066a3fc54b587fbad4b47ec91149cc2056c0569131dc99bb606a0',
    sources: ['games/local/place-and-clear', 'apps/shell-web'],
  },
  'apps/shell-web/scripts/standalone-game-entry.mjs': {
    before: '7bddd0e019ba2ad26c232f953908f3b27f8feef61c76e0dcb95f03be9dbe5027',
    after: '61dcf54befe778203207cfc8cada910f7f8ba8b32845ac58d5257afb2defa89a',
    sources: ['games/local/place-and-clear', 'apps/shell-web'],
  },
  'apps/shell-web/scripts/standalone-game-entry.test.mjs': {
    before: '297e48707b662ab1601f772508227d91c68cd64bbab64651252df0d160d5c312',
    after: '4fd6002e4a2c5f7edf16cea79648c604d9529ec12f5c7c900c2d4f7435d7823e',
    sources: ['games/local/place-and-clear', 'apps/shell-web'],
  },
  'apps/shell-web/src/StandaloneGame.tsx': {
    before: 'a4618a25ec15ce38c17623aa988b68d6c80409bb162eb5f48280a492bc6a8d1c',
    after: 'c62c400289ee03fc0e2560e033a27f735ec3018742150bbb4dc374ed407dc9fc',
    sources: ['games/local/place-and-clear', 'apps/shell-web'],
  },
  'apps/shell-web/src/game-assessments.json': {
    before: '81db3e7027aa5762a267b7f431eb8810d3abfcfc8cc1ca96b858a5ee1af98bcf',
    after: '2aa6a324ac58a9e1d00678a1c64aeb541f0a3d7d5bcbf283d6ff668c8895a9e7',
    sources: ['games/local/place-and-clear', 'apps/shell-web'],
  },
  'apps/shell-web/src/game-route.ts': {
    before: '1ba885292909e5cc1cba9fbd17af17722a09389f3cc5895723655d00f67a1ae1',
    after: '5630d9fd571de1960088f98ab18aa3142ccb2833ddbde5ea7eae504b4cd1a02b',
    sources: ['games/local/place-and-clear', 'apps/shell-web'],
  },
  'apps/shell-web/src/game-sharing.ts': {
    before: 'd7a120d50fd2782cabcc64a4767bbd2d7600b6f335a99cf5ab32bea8ffe7cea4',
    after: 'c34479c7218d00663d603a2b33aa2933605a20e409cfe06e06c0ab978c7f8399',
    sources: ['games/local/place-and-clear', 'apps/shell-web'],
  },
  'apps/shell-web/tests/catalog-assessments.test.ts': {
    before: 'bb436e9a58bb7d90d6bed798ac99438078456dfe5c9057d23271726b4e1a685e',
    after: '5d1c1a1fa6d6851f51c64a2aebfc9b578e8589b2100720bf6a93d83d08e9893f',
    sources: ['games/local/place-and-clear', 'apps/shell-web'],
  },
  'apps/shell-web/tests/game-sharing.test.tsx': {
    before: 'd8f88dd3957eeab50df86816b78238e31ec15408664c6cb13a5f96a7957eebb1',
    after: '5e6dcae90653dee6316c3136f2baf31ad692ec65c58da7d4afe380c07c973c82',
    sources: ['games/local/place-and-clear', 'apps/shell-web'],
  },
  'apps/shell-web/tests/routes.integration.test.tsx': {
    before: '957545ade1e2333019dde9be47eccd71e8d8a64a896db4207c01e794fd4aacf9',
    after: '593aa7ac4e1772b70ec317fff6881ec36e836e0cef82b2df18898cd87e4942bc',
    sources: ['games/local/place-and-clear', 'apps/shell-web'],
  },
  'apps/shell-web/tests/standalone-immersive.integration.test.tsx': {
    before: 'eb5561286268f0004e75f0f528e08a3db5120959cb13105f82aa9b7f283cd27f',
    after: '3cfd2916137b2652682b23f441da036eab0a4ba53bb8f73213a881a70e79fd65',
    sources: ['games/local/place-and-clear', 'apps/shell-web'],
  },
  'apps/shell-web/tests/standalone.integration.test.tsx': {
    before: 'd82ceb3fad5e81f1f9fce82eeba48ddee1978d77638ddcc41a971339e5887e0c',
    after: '858c256299e29d1eec65277fda77b82a0e180c56758206738356d237ef541d77',
    sources: ['games/local/place-and-clear', 'apps/shell-web'],
  },
  'game-build.local.mjs': {
    before: '691d6085bf35d29b9545946ba4772d5a322032dde2e23d834329839d1a86a40b',
    after: '64017c34a2c52c9c7b02840b49cbf5c97b9d88043b351bba5bede1db479cc8cf',
    sources: ['games/local/place-and-clear'],
  },
  'packages/native-game-shell/src/host.ts': {
    before: '8d25046abbaa104e4d2e10ff69786f5aa52cdd649908fd1afb64c48a07bcf672',
    after: 'cb63e9223d2b19d95bf1bf682f1456b420240422826618305cded39def06e111',
    sources: ['games/local/place-and-clear', 'packages/native-game-shell', 'apps/shell-minigame'],
  },
  'packages/native-game-shell/src/shell.ts': {
    before: 'c72628884fa2ec73010aaa7366594ab498886e13aaf8ddbfdc3fa96aad8f298f',
    after: '2005e820e26199c110e82d296ee7bebd6990670a469f569bbb2b99ca30ea528e',
    sources: ['games/local/place-and-clear', 'packages/native-game-shell', 'apps/shell-minigame'],
  },
  'scripts/build-games.test.mjs': {
    before: 'd6463b56f8c40eeb9db07caf0a79d83d7013d1e18173af20ace9632b44e697e2',
    after: '5ebde3d7195b6bc5754c39340f708f3aab222c72b6174aa0881487cfe4912803',
    sources: ['games/local/place-and-clear'],
  },
  'scripts/check-game-config.test.mjs': {
    before: '2d74251977f01a2d976a25ddb10e13eda55712438604efefb1f5e45d9bca1441',
    after: '4fea5a38b45d0d4bba30fe7a8a61f72cd2957eaf60090101611cd0104efca544',
    sources: ['games/local/place-and-clear'],
  },
  'scripts/check-workspace-dependencies.mjs': {
    before: '3d61e62cdfa9d03f9969b2149e1971df158a4788b1da68b13ac03ac3e954ecab',
    after: '7801001d1d53c7808e8afe233703d19e862c322e04803a9b15c95755bae7e959',
    sources: ['games/local/place-and-clear'],
  },
  'scripts/check-workspace-dependencies.test.mjs': {
    before: '275c300320f3f0755265af5d739b0624aa818d964509d5aaa85c1a2140af60f4',
    after: '15c54686436dead9db8727c7ef0f5426ed55e453ac69b50f2492f49e5186289b',
    sources: ['games/local/place-and-clear'],
  },
  'scripts/cocos-validation.mjs': {
    before: '00ac32f5a9b097cb635c472c3158e41d7546678684161f71f653ea89b6285d52',
    after: '730e7f81607fc83c4f83922ab19f4bf770e496c39f4104efae91bc1655114fc8',
    sources: ['games/local/place-and-clear'],
  },
  'scripts/cocos-validation.test.mjs': {
    before: '4fe529566be2b434b966f742419b626bf8b15825f8d7e26c3eeeda28c89525f3',
    after: 'f6a27a96af374a9988e82b24cbd7f5b05bc3d32c2ee161840e29c1fd2846bafa',
    sources: ['games/local/place-and-clear'],
  },
  'scripts/deploy-tencent.mjs': {
    before: 'ef83f5e926bdd57e6b5743c09c69fba7c21735b6d117a83b2b9896f12d2b54b4',
    after: 'b4f7f40c8985b8cae8a7a4ee15a45726d1d12cee3b72c1eb3e62401c73f2204a',
    sources: ['games/local/place-and-clear', 'services/runtime-api'],
  },
  'scripts/deployment-bundle.mjs': {
    before: 'c345987270dbbbb1afa801499c903c283a75313d61336208ab9a7973f663150e',
    after: '6ab0a07fd7c6a35546eede733d6b226e8e4c269c3afa9b07bd7e730031305226',
    sources: ['games/local/place-and-clear', 'services/runtime-api'],
  },
  'scripts/deployment-bundle.test.mjs': {
    before: 'b68715bf1c1fde6a5941e4df75fd840fcdbe02daf4996f33851e667cd9be16f8',
    after: 'db85ba204e9f1de41d596900b362cbe69e4bb7c1f9a636a731ab430bad100b4a',
    sources: ['games/local/place-and-clear', 'services/runtime-api'],
  },
  'scripts/h5-ad-config.mjs': {
    before: 'b54e752e6b9185ca1cd93c361ce1b1bc366935513799463c6609f561c93cc538',
    after: 'bbd7ccc2fa5441405f672eef4c2fdd4fc652353994c2abe0a018ea42624a4961',
    sources: ['games/local/place-and-clear'],
  },
  'scripts/h5-ad-config.test.mjs': {
    before: '5e5c9275cbe8d46ed866bbb9dbe85157eddead8709cae3d9ec82ece898f702f2',
    after: '5c7decb5f3ae74afca18d430adc943fa7d80507f7f7ca5345e7d6e46259279ea',
    sources: ['games/local/place-and-clear'],
  },
  'scripts/h5-game-build.mjs': {
    before: '111888f9e86dd9f3b6c707ae6e43dc90ac6b999000a74286b665f2d0351f8f6e',
    after: 'ddaa5fdb2be8c4cac26b61cc9fafffab29e70268035a61e6f019302da4aa07c2',
    sources: ['games/local/place-and-clear'],
  },
  'scripts/h5-taptap-build.mjs': {
    before: 'c7a86b78b7db0518d3a4dc101282655b0c1f1e9dbdd4a7cc369f0412ef7852db',
    after: 'fa11b2b88ddcd2279dfda129b9932789042199617d373530de8079761862ad05',
    sources: ['games/local/place-and-clear'],
  },
  'scripts/h5-taptap-matrix.mjs': {
    before: '18f5ec36f778586facb0cc65110e76d3e0eac7cae5ef5e9782751fe00ff9a0c9',
    after: '34c6cb623a69a9b6273e032a9688a3d9bab9fb5344bea4d7e4f9aa7b01d47d48',
    sources: ['games/local/place-and-clear'],
  },
  'scripts/h5-taptap-matrix.test.mjs': {
    before: 'b19c72649d171b003c61a24d3772329c525b17d507a5464105348ac8c610a764',
    after: '89e8a51f082fd8071cb1bb7485c4f7cbaa0eaf9c5293e773fd8f0f87633e0c4e',
    sources: ['games/local/place-and-clear'],
  },
  'scripts/incremental-validation.test.mjs': {
    before: 'af4a4c3913ddb0a6d204ac77bdfaacfad6d7a0814f558fa39e2a36640f81e94f',
    after: '73cfaeb37b3325e5ca3e91b5fd6deb3ffd27aa053fd4e0309c74e3e1692c0b54',
    sources: ['games/local/place-and-clear'],
  },
  'scripts/native-game-smoke.mjs': {
    before: 'bbf5acd58be12f144f861f716a94f2bf8ba25170a527d6302d93904a9ec00ef0',
    after: 'a22bc46e00655e67ded50ae07155dc0b965ec0bdfe1c36745cc438ac8cd08e3c',
    sources: ['games/local/place-and-clear', 'apps/shell-minigame'],
  },
  'scripts/reuse-cocos-artifacts.mjs': {
    before: '9bc4931e8fd9b3e63cb8cbd2091f805579588a58ca943581915ddea4bc619560',
    after: '8a93df0a01f67d30f41993d5b29893bd0ce7224a152246484ca82173185fe378',
    sources: ['games/local/place-and-clear'],
  },
  'scripts/reuse-cocos-artifacts.test.mjs': {
    before: '60767daa24019127aef8cf2d0325b8118090b9520f90f8c368bdce968d9864ed',
    after: 'ae0729854468680e1445340799686b379a7612582644fbe8c64c5b7e884d5f6c',
    sources: ['games/local/place-and-clear'],
  },
  'scripts/test-game-dev-mode.mjs': {
    before: 'd13197ae582a50792dd82a7aaa796e55d7913f1144a1b977d98ef9f0317e20e0',
    after: 'b6f277d93c742f9685403facbd9157025d4cf209caa6e045df191e5dbb73aace',
    sources: ['games/local/place-and-clear'],
  },
  'scripts/validate-tree.test.mjs': {
    before: '2fa35179e1c8198fa953a6da074d2c691bc87eec1580b5e1756fb759f615c690',
    after: '2dd4721194d6e168fde1e04a5787ae91c0476410e3b159a4d3d66498b60ebd53',
    sources: ['games/local/place-and-clear'],
  },
  'turbo.json': {
    before: '33c37ca3d37d890b92b56e52d3a4ac9e1c1b5f80ffcbffdc643fb790ebd45cb9',
    after: '6cefbc9c55ddcc5adf8e307b56902a267e7b282e6971048040fd6aeee2f5af73',
    sources: ['games/local/place-and-clear'],
  },
  'apps/shell-web/scripts/legacy-game-redirects.mjs': {
    sources: ['games/local/place-and-clear', 'apps/shell-web'],
    before: null,
    after: 'b30e5cfbc8557c34776f281963df708408da5648094432be686bdf821ee9ebad',
  },
  'apps/shell-web/scripts/legacy-game-redirects.test.mjs': {
    sources: ['games/local/place-and-clear', 'apps/shell-web'],
    before: null,
    after: '0d064c1c295b811994f4b7d035f16bf574bdc6baebafaba62bf57431d60ccec9',
  },
  'apps/shell-web/scripts/prepare-standalone-games.mjs': {
    sources: ['games/local/place-and-clear', 'apps/shell-web'],
    before: 'f9426561d97799a5cc8fbc5f90b3cb80acdab7dd21ebfac5c53bebf78b04c6d2',
    after: 'd11121a2ec1849b85adc9f48618f99778e867a250108bfc30efe80511a23df71',
  },
  'scripts/run-selected-shell.mjs': {
    sources: ['games/local/place-and-clear', 'apps/shell-web'],
    before: '754baabf77f9c5f1c7c3b909fe0ddb92a46a768bf04bcda9ce7fddd4525e70c2',
    after: 'b31364c32a019349074472a3b8aec9498d227e53f8f23a3de29f789faffce3c5',
  },
  'platforms/bilibili/src/index.ts': {
    sources: ['games/local/place-and-clear', 'platforms/bilibili', 'packages/native-game-shell'],
    before: '3632af7e47d667cdc3302044d29a8019f3ee4b18542a9673297f46ee4b7b349c',
    after: '7c00175134eca6981e4b7af8080068df0db4ed4e4e253c17fe893e501aabc1a8',
  },
});

function identity(readBase, readHead) {
  const before = readJson(readBase, REGISTRY),
    after = readJson(readHead, REGISTRY);
  if (!Array.isArray(before) || !Array.isArray(after)) return false;
  for (const games of [before, after])
    if (
      new Set(games.map((g) => g.id)).size !== games.length ||
      new Set(games.map((g) => g.source)).size !== games.length
    )
      return false;
  const old = before.filter((g) => g.id === gameRename.from || g.source === gameRename.oldSource);
  const current = after.filter((g) => g.id === gameRename.to || g.source === gameRename.source);
  if (
    old.length !== 1 ||
    current.length !== 1 ||
    old[0].id !== gameRename.from ||
    old[0].source !== gameRename.oldSource ||
    current[0].id !== gameRename.to ||
    current[0].source !== gameRename.source ||
    current[0].title !== '摆消乐' ||
    current[0].output !== 'dist' ||
    before.some((g) => g.id === gameRename.to || g.source === gameRename.source) ||
    after.some((g) => g.id === gameRename.from || g.source === gameRename.oldSource)
  )
    return false;
  const expected = { ...old[0], id: gameRename.to, source: gameRename.source, title: '摆消乐' };
  if (!isDeepStrictEqual(current[0], expected)) return false;
  const oldPackage = readJson(readBase, gameRename.oldSource + '/package.json');
  const pkg = readJson(readHead, gameRename.source + '/package.json');
  return (
    oldPackage.name === '@coffeeeeffoc/' + gameRename.from &&
    pkg.name === '@coffeeeeffoc/' + gameRename.to &&
    pkg.coffeeeeffoc?.role === 'game' &&
    pkg.creator?.version === '3.8.8' &&
    pkg.scripts?.build === 'node scripts/build.mjs web-mobile' &&
    pkg.uuid === oldPackage.uuid &&
    isDeepStrictEqual(pkg.dependencies, oldPackage.dependencies) &&
    isDeepStrictEqual(pkg.devDependencies, oldPackage.devDependencies)
  );
}

export function gameRenameRegistrationScopes({ changedPaths, readBase, readHead }) {
  const scopes = new Map();
  try {
    if (!identity(readBase, readHead)) return scopes;
    const targets = [
      gameRename.source,
      'apps/shell-web',
      'apps/shell-minigame',
      'services/runtime-api',
    ];
    if (changedPaths.includes(REGISTRY)) {
      const before = readJson(readBase, REGISTRY);
      const expected = before.map((g) =>
        g.id === gameRename.from
          ? { ...g, id: gameRename.to, source: gameRename.source, title: '摆消乐' }
          : g,
      );
      // Other catalog changes must retain their own consumer/deletion review.
      // They cannot invalidate this game's separately bound directory move.
      if (isDeepStrictEqual(readJson(readHead, REGISTRY), expected))
        scopes.set(REGISTRY, [gameRename.source]);
    }
    // A pure textual workspace move cannot alter any registry resolution,
    // dependency tuple, duplicate importer, integrity or unrelated lock byte.
    if (changedPaths.includes(LOCK)) {
      const before = readBase(LOCK),
        after = readHead(LOCK);
      if (
        after === rename(before) &&
        (before.match(/\n  games\/local\/three-choose-two:/g) || []).length === 1 &&
        (after.match(/\n  games\/local\/place-and-clear:/g) || []).length === 1
      )
        scopes.set(LOCK, targets);
    }
    for (const source of ['apps/shell-web', 'apps/shell-minigame', 'services/runtime-api']) {
      const file = source + '/package.json';
      if (changedPaths.includes(file) && readHead(file) === rename(readBase(file)))
        scopes.set(file, [source, gameRename.source]);
    }
    if (changedPaths.includes(META)) {
      const before = readJson(readBase, META),
        after = readJson(readHead, META);
      const expected = JSON.parse(rename(JSON.stringify(before)));
      if (isDeepStrictEqual(after, expected)) scopes.set(META, []);
    }
  } catch {
    return new Map();
  }
  return scopes;
}

export function renamedGamePath(file) {
  if (!file.startsWith(gameRename.oldSource + '/')) return null;
  return (
    gameRename.source +
    file
      .slice(gameRename.oldSource.length)
      .replace('/assets/scripts/ThreeChooseTwo.ts', '/assets/scripts/PlaceAndClear.ts')
  );
}

function movedTree(context) {
  const { readBaseEntry, readHeadEntry, readBase, readHead } = context;
  return (
    identity(readBase, readHead) &&
    readBaseEntry(gameRename.oldSource).trim() ===
      '040000 tree ' + gameRename.tree + '\t' + gameRename.oldSource &&
    readBaseEntry(gameRename.source) === '' &&
    readHeadEntry(gameRename.oldSource) === '' &&
    /^040000 tree [a-f0-9]{40}\t/.test(readHeadEntry(gameRename.source))
  );
}

export function gameRenameFileScopes(context) {
  const { changedPaths, readBase, readHead, readBaseEntry, readHeadEntry } = context;
  const scopes = new Map();
  try {
    if (!movedTree(context)) return scopes;
    // Every removed tracked file must have its designated destination. A missing
    // target, revived old tree, foreign move or failed tree read grants no proof.
    const oldPaths = changedPaths.filter((f) => f.startsWith(gameRename.oldSource + '/'));
    for (const file of oldPaths) {
      const to = renamedGamePath(file);
      if (
        !blob(readBaseEntry(file), file) ||
        readHeadEntry(file) !== '' ||
        !blob(readHeadEntry(to), to)
      )
        return new Map();
    }
    for (const file of oldPaths) {
      const value = Object.freeze([gameRename.source]);
      proofs.set(value, { file, to: renamedGamePath(file), deleted: true });
      scopes.set(file, value);
    }
    for (const [file, sources] of gameRenameRegistrationScopes(context)) scopes.set(file, sources);
    for (const file of changedPaths) {
      const review = gameRenameReviews[file];
      if (!review) continue;
      if (
        review.before === null
          ? readBaseEntry(file) !== ''
          : digest(readBase(file)) !== review.before
      )
        continue;
      if (digest(readHead(file)) !== review.after) continue;
      const value = Object.freeze([...review.sources]);
      proofs.set(value, { file, after: review.after, deleted: false });
      scopes.set(file, value);
    }
  } catch {
    return new Map();
  }
  return scopes;
}

export function hasGameRenameFileProof(file, value, readHead) {
  const proof = proofs.get(value);
  try {
    return proof?.file === file && !proof.deleted && digest(readHead(file)) === proof.after;
  } catch {
    return false;
  }
}
export function hasGameRenameDeletionProof(file, value) {
  const proof = proofs.get(value);
  return proof?.file === file && proof.deleted === true;
}
export function isReviewedGameRename(change, scopes) {
  const [from, to] = change.paths;
  const proof = proofs.get(scopes.get(from));
  return (
    proof?.deleted === true &&
    proof.file === from &&
    ((change.status === 'D' && change.paths.length === 1) ||
      (/^R\d{1,3}$/.test(change.status) && change.paths.length === 2 && to === proof.to))
  );
}
