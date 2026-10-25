// Exact source trees for the two retired games. The directory tree IDs bind every
// tracked source file, document, and binary asset in the reviewed base commit.
export const mazeVoiceRetirementBase = '61759eb643f97601323bcaf12706d0d1737b1ce5';
export const mazeVoiceRetirementTrees = Object.freeze({
  'games/local/maze-wander':
    '040000 tree 87472def6b5d71d3f1ee63492eecb032552ca175\tgames/local/maze-wander\n',
  'games/local/voiceprint-case':
    '040000 tree 5c8e022fef5f7e137bc72abc45610c984dff44d3\tgames/local/voiceprint-case\n',
});
export const mazeVoiceRetirementReviews = Object.freeze({
  'apps/shell-web/package.json': {
    before: '34b9b61e8106b032ebc5ccf457aac7186af25f856912a15325780cff3421e3fc',
    after: 'da9caee901116c64d4f050581a73dadf4467dc52fe1b7450fe7fcfc10493f968',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/game-meta.json': {
    before: '37fd4bd10f228bb1405183d7e7857bf901eb09e2790f3f859fec57ef18abeda3',
    after: '4b0c8d19e5747a0184e91917465b88aa161216a74c8a79b7c0d638b4b255d3f0',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/standalone-games.json': {
    before: '6483f95872c936e1b251527e5d7bd7613fcbc070a082af9b0d4ac16eb67f041e',
    after: '365f9fb8f9ed3c778a28f72ce3b6efd02a8b4143e8268012e8f27083e420381c',
    sources: ['apps/shell-web'],
  },
  'pnpm-lock.yaml': {
    before: '2614344f65b1483c2997f9e2866c1e2b06d0a385c26fd916341f63ad5f7f4762',
    after: 'd016202fe6a6ee51961f2defa9224a0fddf9e29364991916397a034a91d0b806',
    sources: ['apps/shell-web'],
  },
  'scripts/test-game-dev-mode.mjs': {
    before: '657ba38e4aac440e50314db3194f0ecfac71ba8061410cfd1bb8a2025c33fea2',
    after: 'd13197ae582a50792dd82a7aaa796e55d7913f1144a1b977d98ef9f0317e20e0',
    sources: ['apps/shell-web'],
  },
});

// Reviewed removal of five local games; precise snapshots and finite surviving consumers.
export const localRetirementBase = 'aa7e30777290989ac8a48f854f65eb1c8f242a8b';
export const localRetirementTrees = Object.freeze({
  'games/local/game-cultivation':
    '040000 tree 6be4907f141c4245de4588dfd382f6b651ff72cd\tgames/local/game-cultivation\n',
  'games/local/game-cricket':
    '040000 tree 4437a8a8357f441166496ff09bb92b809c62a4ac\tgames/local/game-cricket\n',
  'games/local/game-office':
    '040000 tree 947cd600110749fa57951ba8187f1ec7387a1006\tgames/local/game-office\n',
  'games/local/game-arena':
    '040000 tree fcf6dc23ce5850cf26ccb2c8d820f83a0fc20363\tgames/local/game-arena\n',
  'games/local/game-building-power':
    '040000 tree bbcd3f2c76c4af267f2207a11b2526a8078c2388\tgames/local/game-building-power\n',
  'apps/shell-bilibili':
    '040000 tree 81cdc329c2c3966c7514e631b947835ff33657fb\tapps/shell-bilibili\n',
});
export const localRetirementReviews = Object.freeze({
  '.prettierignore': {
    before: 'f5b7244238ddc228cb70961aa872fc4eeeddf5a226d8740b60b5feacfa4a8eed',
    after: 'b62aa1aca97995c32b1b8cf6e3c53f499578799b9ed5aee0765f30f2b9e39056',
    sources: [],
  },
  'apps/shell-minigame/package.json': {
    before: '4aa92bd462c741b324d6d6b86e4c9140ebbd8aaa8b7df61e3dbb6449678f0f71',
    after: 'aa28f0baebb07ea7eb741b3d644d4937a263cb998737b2e1362ac3307dfbc5d3',
    sources: ['apps/shell-minigame'],
  },
  'apps/shell-minigame/release-config.example.json': {
    before: '777c1349ac55ee1d2193e472f92efdfcc2f12d65313e8bfd789c443c65f78264',
    after: '0ab7f3c7215bd90dc7f8027463d6fe482c9516be207f0540d85a64c3c2e52294',
    sources: ['apps/shell-minigame'],
  },
  'apps/shell-minigame/scripts/games.mjs': {
    before: '2eefa5e575cfcfd98735ff8eee8b45801f52ac40c9c60a31c0dbaeacf91f1896',
    after: 'be0b987c00dcf8c56e1445df57d7cb19ee208d841ee8cddd83717ff4e57d2e3f',
    sources: ['apps/shell-minigame'],
  },
  'apps/shell-minigame/scripts/night-native-project.test.mjs': {
    before: 'a5b6e36bf2c926a318c65d000c2f93f123756614c7e63c4c216393faaeb9ac21',
    after: '5f3fc5f0aad399dc588468630c78df682f9d5c32615fe1a778d55728c45aeccc',
    sources: ['apps/shell-minigame'],
  },
  'apps/shell-minigame/scripts/nine-games-build.mjs': {
    before: '36f0218a2a1ee89b9d56234ef3063c0911681d9edbd1e975a01eede6df0f0ed0',
    after: 'b8ef3764af69ca22cbbf292bd85aabbcdc025ef7262bdc0493d52696a2fbb452',
    sources: ['apps/shell-minigame'],
  },
  'apps/shell-minigame/tests/building-power.test.mjs': {
    before: '62c420cc400aae0f022ed6278d55e1aba8778c89631a2766d6079260e7ac2ca0',
    after: null,
    sources: ['apps/shell-minigame'],
  },
  'apps/shell-minigame/tests/native.test.ts': {
    before: 'cddc7b65c8c3c8c5409e326c6cb50a73f9efd555337b2c99771aabd38508d3ea',
    after: '081cbaa03d8503730fa2aa1c27d4f7ee308188a91c5cbab524518d2e10e10d42',
    sources: ['apps/shell-minigame'],
  },
  'apps/shell-web/package.json': {
    before: 'bb21e2eafd28ca91922f7e6cd42916a7b8c69929934c06556f93476c0b4d0bdd',
    after: '26223cf649a2c2eba9a7f3048b7715ba7237d9e1546698a20b272442f6367e28',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/catalog-rollout-smoke.mjs': {
    before: '8c960e90de3bb937d03a933b1ea6c6822548c5045e1b22935b4fdbed3302f86c',
    after: '7b596aef11323bc220cc64ea7052463b7ab356da07caa3960ce595b768e72cf4',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/game-meta-smoke.mjs': {
    before: 'abd8d859280bf5f5e3654f6e37c5ad461e40130f291336793be172694f1ff5b0',
    after: 'ede49bc2d8ac556d83158dc4ff423c741e8736db2353ce4dc7b7e736b0a9f50b',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/lazy-loading-smoke.mjs': {
    before: '4303dd49df784077119789696ff1999b7f69e32f79b15df8de06bef03d0bfc5c',
    after: '184f05ee37be48a72029d2f3f5a165614bb330eafb6020ab70e60069581c734a',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/pages-host-smoke.mjs': {
    before: '6cf8d7496312a7e7e08e0ff7537aae6737d317b93167032033fd76e746753523',
    after: '30b47a586c2ad818a8b86465bd1f98390389cd61ec2eb5cd49fe5cafebcc5ebd',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/pages-smoke.mjs': {
    before: '8f14e995dba995a3cb02c006a3439dadea95c875fd0ee11f4ff47bf1ef79b30d',
    after: '9b8d9e3b859c9c03f72fe7d6f4f3de511df3b24f4dbcfa9aaf8a693f9f841ddc',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/remote-smoke.mjs': {
    before: 'a2f81aff67fb2aee98d3574c1e1cef2689f13ceaa73a4959bfeaab6d14328f88',
    after: null,
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/game-assessments.json': {
    before: '61fbe0912c556b2f5b544d3a92e5ac087c9d8fcd421e6ba50173e2158676048c',
    after: '3bd431c46376bab6f0ae3633f58ee4e027c1aabd2974ead21c9e4c3fde4f6634',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/game-meta.json': {
    before: '6b22589def2a349182e2e1dad19b9a8e5abc0564fdc0aed54cc7bb743ef340d8',
    after: '66ede3f5978020247adcfa39d0e1381f2a3ceb31b1ebc0561a1d36e0b0edb70a',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/registry.ts': {
    before: '1fd626e2e46bf55dd04124af24f49515fe5482277c88721a19035d25228212de',
    after: '235a36dd1a2a8cbb9544be7136956dde948b0978698e2ee85de8a92297428992',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/catalog-assessments.test.ts': {
    before: '883e20d1d217f306e6ffb8f8960e1540653715467409ca8440eff7ab9e11cf4b',
    after: '16f732547aec33f676e905765c88f0e043305baefb3055432c551c8cac05ca78',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/catalog-filters.integration.test.tsx': {
    before: '103d5a6be897c107b18ac438e893fdb583fb872684f28dc3ddad770b8d3e39f1',
    after: 'b2ea506e0021c6183199945768915c92b8da3ecb060b7b7314a8cbd9b0a29ad6',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/catalog-links.test.tsx': {
    before: 'c904216bf709be2710f6d930edf241eab23384c2282736dbe40faba0877dc3d9',
    after: 'ed7b227a9e529fd1d7ab1469eef96dffd5d7199b4a9ce4a4396ac332c17a4475',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/catalog.integration.test.tsx': {
    before: '1f1aa04c7ebac74b321dcd3587620dbbe949c2b2669336e1efab1e88ec83c1a9',
    after: '7b6056bbda6ca0b65a643d63d10092332d64b4e58632532a0b5a463481beda06',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/game.fixture.ts': {
    before: null,
    after: '9cfd63e7472ebc5f7f95d18a0dc41b57632a87df22c384d6494aa5e5f96dfcca',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/managed-ad.test.ts': {
    before: '0d00181564d5135714f1706cbc7d37b915995e5a8203cb8a08232db97f32e320',
    after: '8ce3fe8ae0de62276d05deb7bf7ee983609e7ebc6fd0eb7c4784c2f4df3fdbee',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/routes.integration.test.tsx': {
    before: '0e7baa2d52f417351226d9982eaa5165934cfe557bc916ed907854a37d3e51cc',
    after: '23a1893b81b195e4c71bb7d28cb87eb56525d74e1aced248a8351322c2da552f',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/runtime.test.ts': {
    before: '49fbe32957b44f26ad09703677d9bb998f905335e734bf3d04d4795e0f6e3854',
    after: 'bd3bb5ccaa78b82b24dbe4681e64729f3beca842de6e624bde4151f98c5a23fd',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/shell.integration.test.tsx': {
    before: '8010b31d3290ebf6f44850cae5a428a6c3afb360c54c1e06840c0f1ecbcc8d0c',
    after: 'e899f31c99f5d776f6bc98a49692d0f9553f3bf06ac23c5bfa7a53db201e8a3f',
    sources: ['apps/shell-web'],
  },
  'apps/studio-web/package.json': {
    before: '34a71615b8a85fc72eda485cb01251eb5fb9336f803fbc3f806fe1e62d160fd4',
    after: '0e37c4253728587587635a1d63bc98506b100c21625de6cc8968fadad4d7015d',
    sources: ['apps/studio-web'],
  },
  'apps/studio-web/src/ad-draft-client.ts': {
    before: '267022d46b72d8a07574780b8bd017b575137c9126f39e5b1784fc65e65289a6',
    after: '9ebcfa263ae1bc3d564d12dffc029a9b5472bff28b5ee12167648c869cdf4abf',
    sources: ['apps/studio-web'],
  },
  'apps/studio-web/src/ad-editor.tsx': {
    before: 'f1b03ce54d9beaad4b575eae2e1498292bf204edb72ef41aac3c366f797b400e',
    after: '0fdf63a766b3f82e7fa3ac691ce1d5ab72881d9e2a15887ed785ddf7dd125097',
    sources: ['apps/studio-web'],
  },
  'apps/studio-web/src/content-target.ts': {
    before: null,
    after: 'c42d4d86da2f5f6cf9a44a12524af10f716d865a577930c951874d4bf7ce362a',
    sources: ['apps/studio-web'],
  },
  'apps/studio-web/src/draft-editor.tsx': {
    before: '1b3eade174f6060981db99383353ec6736ed3c639d4daaa1f0307cdde2a77508',
    after: '3b12a08a2c4afa0a1cc44d64eb8b9da200a70fe2f1a7c3e0526436be03142360',
    sources: ['apps/studio-web'],
  },
  'apps/studio-web/src/draft-preview-host.ts': {
    before: '50999dbf9f1ea61e9babcd9b8dc537cc5ecfeb0ce971a03e57d3949cb8e4d354',
    after: 'fa7fbcb00157c19f71838c63ce414783bd63f0448d9f72caf08dbf2f2b77fceb',
    sources: ['apps/studio-web'],
  },
  'apps/studio-web/src/draft-preview.tsx': {
    before: '2926545b016f027cd0b855557038cb0ed22cd0adedb3f5384ace737d935f1ed6',
    after: 'e657e79a9030b58246fb1fc8ceb27b3d90988965a5430d2e949c4eeea6755d29',
    sources: ['apps/studio-web'],
  },
  'apps/studio-web/src/generation-panel.tsx': {
    before: '9562c4682b37ac868c8288f7baff32662f1f573b2f8295f92e8fe14687fa5715',
    after: 'b2aaa97f28cc07643e6e7558b98a87494cb11fccbf0ce301bc95d13d4aebbbb5',
    sources: ['apps/studio-web'],
  },
  'apps/studio-web/src/index.ts': {
    before: 'd2b0fda9d51c39b4f159a4c299004803b71b4e9e629fae14250fbdbbbbe1aaa2',
    after: '8915a4f2596dbce65dd64197fcbc989920b6762b6bc4a091a6ded086e6e9298a',
    sources: ['apps/studio-web'],
  },
  'apps/studio-web/src/router.tsx': {
    before: 'bb953fbbe08e5cf40380e6eda98b84a850e23e0c71a643c9efb292d0e30c60c6',
    after: '1ab73e5b7e01ad3ab760e28cc3c494299dc869daf3ff1d5f3853309895705a7d',
    sources: ['apps/studio-web'],
  },
  'apps/studio-web/src/styles.css': {
    before: '3e3f11888c2238748aecc28bbd9b9c8aae32b4774dbe76295ea4da84e52bbe65',
    after: 'bf7571aad20b705a04d1b2b341d3fbc15115d74b91d059ffcf2b5c9e8f0e10d2',
    sources: ['apps/studio-web'],
  },
  'apps/studio-web/src/views.tsx': {
    before: '4596cb67db9cf5adf7df2a55a4e5653b6207a842edb7adf8c87f8f83731ca06a',
    after: 'd22f9ebe46f16312c497365d3ad72d8b010f40e98d9e6654a1a8ea9147f5403b',
    sources: ['apps/studio-web'],
  },
  'apps/studio-web/tests/ad-drafts.test.tsx': {
    before: 'd2b9c448f72af4ace7e49ce64d95178e8511ad7137caf4ce0f13ab02581e3952',
    after: '0e334d5f011cd41b1c3f1fa768f37cbcd876a4f472b396b7b5dab4c14a06f428',
    sources: ['apps/studio-web'],
  },
  'apps/studio-web/tests/auth.test.tsx': {
    before: 'b313ea97bad7b84b9eb7e3f5eba72089b0eaeb4b0f69c34504a2f13fdb5fdb05',
    after: '9102110bd77c02b04744b4f220b2104336166a6851146622d08a4826340acdb6',
    sources: ['apps/studio-web'],
  },
  'apps/studio-web/tests/canvas.fixture.ts': {
    before: 'd86edf4a40ca53ab8b49b70df69c4de6228291c7822afed1ec72dcb972a9eb66',
    after: null,
    sources: ['apps/studio-web'],
  },
  'apps/studio-web/tests/content.fixture.ts': {
    before: null,
    after: '885ad0efd334b9b748a8ee51876787abffc1499a1b094fbdf3b5d462af855ed3',
    sources: ['apps/studio-web'],
  },
  'apps/studio-web/tests/drafts.test.tsx': {
    before: 'f77b72090f0584866cf17d9019f6443e9b9e86a21d4a405782f6bcd66db0bb09',
    after: '8e811b2a32a6d5cb5d6c333ba9c8e4b19ed2121c2042c8c45df68971df43c542',
    sources: ['apps/studio-web'],
  },
  'apps/studio-web/tests/generation-panel.test.tsx': {
    before: '9162fbc0efa6f5e3d01888ad379ed6fbcdcd20e6e28867fbdee0f94e4d2cac51',
    after: 'e1ecc4f90b948815dd8bbd8de803d2a31098898ca1da5aef68a39cf04dbf32af',
    sources: ['apps/studio-web'],
  },
  'apps/studio-web/tests/releases.test.tsx': {
    before: '61d0b66ddd8dde282fc7a93d4812abab993d066a8e17ebb639b259bf7b88c86c',
    after: 'fd64921e201fb84c6c7531b00d51b647c4637a6a3de8aef4c908a26dce75c405',
    sources: ['apps/studio-web'],
  },
  'apps/studio-web/tests/repository-browser.test.tsx': {
    before: '0da45e04f967005f5dab9b296300dd6859a3893efa3047edcba46bd9e6ba1c19',
    after: 'f36b0dec989c9f95ade0b6e64b5ae74da05bfd0d7b90bb209dfbf1307b7f8821',
    sources: ['apps/studio-web'],
  },
  'apps/workspace-agent/tests/agent.test.ts': {
    before: '4373bd6a42f84ef764c70522e19b8e6b6b4762a53bc40b7c6b42d5a20fb5bd3c',
    after: 'a322c59a8c513b68507af77a77eb83431e2507f1f590127c2c3620a6bbfb1e9f',
    sources: ['apps/workspace-agent'],
  },
  'infra/migrations/003-content-drafts.sql': {
    before: '744d3ffbc3ce992e6a9b8a6c9d2a15d98bd331fe79d7d56ce22d4237f24afd26',
    after: 'e1f9d69a82826ddaf9ac4b272d01f3a0d6888e5850858303eddbeab414d316c5',
    sources: ['services/management-api'],
  },
  'infra/migrations/015-generic-content-drafts.sql': {
    before: null,
    after: 'd51a5c661c34cb8a3bb5ce69eddbe4a1e4b9fb878f9460384f537c33a40f0b85',
    sources: ['services/management-api'],
  },
  'package.json': {
    before: 'db55d5e6ec2effe93b512311e5e7470eaba81d17b63f599929fe2ea6d63115a2',
    after: '3e84abbdd381113c1795deb2ae2dd3146cb377fa9b50fdb2b14fdc0063a9f652',
    sources: [
      'apps/shell-web',
      'apps/shell-minigame',
      'apps/studio-web',
      'services/management-api',
    ],
  },
  'packages/repository-bridge/tests/diff.test.ts': {
    before: '893e973ca341ce5027421f4906789a813a06b8728b9596c949e310202015401b',
    after: '2295608ae3b535bfc2b3df0603073af3b8f88e121ab27f36ec0634d0f81e9784',
    sources: ['packages/repository-bridge'],
  },
  'platforms/competition/assets/action.wav': {
    before: null,
    after: '2a4be5f0adbaac6a743811ce03a1d9d5d6c3b8255b6f1965dcb38a34ffd35f39',
    sources: [],
    afterEntry:
      '100644 blob 93d1978b99333a0cfdb9781ea2c79432d625b8de\tplatforms/competition/assets/action.wav\n',
    movedFrom: 'games/local/game-cricket/public/cricket-audio/perfect.wav',
  },
  'pnpm-lock.yaml': {
    before: '39b5be38d1b6e2b421a7cbf88a3e954db69ef4bef397b82d2a3a9a9324bcc9e9',
    after: '5889b0e4f368df3938cfb80b85f40f7da3ae0d258a72f7f0aabe2050eb666ad8',
    sources: [
      'apps/shell-web',
      'apps/shell-minigame',
      'apps/studio-web',
      'services/management-api',
    ],
  },
  'scripts/arena-playtest.mjs': {
    before: '96e25718f3332e978ec1e9e614fa54e24b46ad3bd92417ef56c1af32c912fef2',
    after: null,
    sources: [],
  },
  'scripts/artifact.integration.mjs': {
    before: 'd62715f1d4a5e8030a3496ffc17d26c5ad8cf554ba789fc0d43eb750d9d222c7',
    after: 'f209beedb83c14203ad03ccc0ef6034de7416e0da0143765ab2baae42632fa69',
    sources: ['services/management-api'],
  },
  'scripts/auth.integration.mjs': {
    before: '3db33588e9d455ca02f7c74cfe369513bbf56f03a924032dd53a01bd0418fea8',
    after: '8a77862887bacc9cbbb1fe58e9eb5f91770da4f89244749d891632bba7b565c6',
    sources: ['services/management-api'],
  },
  'scripts/backend-build.mjs': {
    before: '5d4b6426daa46e3a19ab62f2c69f162e2983048e3b423fbe5f675d9f94d3e449',
    after: '275dc06305d10acb40c26df0564f6117176490f86a687404ed415abffaf9a106',
    sources: ['services/management-api'],
  },
  'scripts/build-artifact.mjs': {
    before: 'f2c772de1838eff14e2ec15d72f3d9c2c3c36d294cbb24d2a4bc2a7323978add',
    after: null,
    sources: [],
  },
  'scripts/catalog.integration.mjs': {
    before: 'c7633cabd7a7b37c7d6f2cdf387914600824a41aa19c4d50c07ef40f69ebaca1',
    after: null,
    sources: [],
  },
  'scripts/check-game-config.mjs': {
    before: '4618a187bdd69c4ddb9e6e09c5ebabc29e3f5c62ef4d6b450c9643412f97fa93',
    after: 'b94272674ffaf5e9df04589f3a5e9b438d8049e51f05203519224d327c0cc38e',
    sources: [],
  },
  'scripts/competition-build.mjs': {
    before: 'c49ffe00854ce47ce31a0fc4714b627039aaa4823e18ee7f74270de3b68be3aa',
    after: '37dfcd731360e1a0cbf62028ec356c4d7187ad222492bb065ccf8c8da5ecfd7c',
    sources: ['apps/shell-minigame'],
  },
  'scripts/cricket-playtest.mjs': {
    before: '15f372463d7bfd06d45f5a769a1499118e378b2520109aaf8d9059c54e1b21b8',
    after: null,
    sources: [],
  },
  'scripts/cultivation-playtest.mjs': {
    before: '886a6a31a4f68fc53ded344c8a3390ef86d77fb77f60eb24a2b0cdb756bd2693',
    after: null,
    sources: [],
  },
  'scripts/deploy-admin.test.mjs': {
    before: '01dae14d3562d52374f6214a93c4050a6538b56e84e9d1e2e20b03acb535265e',
    after: '415ee31ec789c641d669a0713863c24c59d0979b5021b85ecf4ef5d241f0ceba',
    sources: ['services/management-api'],
  },
  'scripts/deploy-tencent.mjs': {
    before: 'cf2d1df8a6106fdf5ede892802963d480e1506e5b5f7dc3b18b4747b95bd2f75',
    after: 'ef83f5e926bdd57e6b5743c09c69fba7c21735b6d117a83b2b9896f12d2b54b4',
    sources: ['services/management-api'],
  },
  'scripts/deployment-bundle.mjs': {
    before: '83fc0070d115e7a4501a82943714b9b5cf239e0db6fc6cdde6e6ea20c4ec6a90',
    after: 'c5f934e35dc618739626d904a4c642b6e68683edf52dd856d69fa38e05819858',
    sources: ['services/management-api'],
  },
  'scripts/incremental-validation.mjs': {
    before: '511a88c830b1aeb249b0968a2cb6746b525c014b098a70e6968f1d5876345eda',
    after: 'c61f58ba9a72906e84f327b65c1545ddb09e7241913dd8a45f89f98f71bcb31c',
    sources: [],
  },
  'scripts/incremental-validation.test.mjs': {
    before: '4748fd1bbd4769d88bc17666e3ea9f0b5bac54f5485eb1e9fc35ded777bd49ce',
    after: '6e079f78823f0e5287711f168a1ca8a80c84d5b67c707c8d87b83eddaffa08fd',
    sources: [],
  },
  'scripts/native-game-smoke.mjs': {
    before: '4ea4c47c94e8ae15dd6dacfc13a91f452cf9111bc3c258013a57fdd9f54641aa',
    after: '722d4eef3f0bd1efa81031664755ade8a361f681e8d0a3abf6e614df50057e94',
    sources: ['apps/shell-minigame'],
  },
  'scripts/nine-native-scope.mjs': {
    before: '695e7d60e274daf3c83c1abea326e56fd652111898182886b5bcb964b48c1646',
    after: '5c134baf6c9f408be50fd86086a1a0203bea9b89be0d0eb4cfcd0c7aaf60ed5a',
    sources: [],
  },
  'scripts/nine-native-scope.test.mjs': {
    before: '7436eecd34ab70b5c6a290941f9629a6b49de6b82d9052fd867c646a8e276c6b',
    after: '78134fee06c848cd02a4a837d490a2216f0f21e0d24ee0a8e79991f53df63d25',
    sources: [],
  },
  'scripts/pages-test-scope.mjs': {
    before: '676f79d500e378dd90d17fcdb2f35ca6df52c8092915df1266bc9d0cd69ec2bc',
    after: 'fe2d1fe8b75fd69cf743547a589ba830b8b2e1a12450578ee03adfb7d48bf38a',
    sources: [],
  },
  'scripts/pages-test-scope.test.mjs': {
    before: 'c1374ae597524877362bc2adf97de05ba81192355e9941271928409cd9218e87',
    after: '4e3341710f9084173fd6febf2219ed6b385f86572f7ff2b56959150eb0c2edba',
    sources: [],
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
  'scripts/publication-scopes.mjs': {
    before: '9930c3d23b0bb89502d0c63ff0f323d2ae77a864165cce8afad088e09c2f7ed5',
    after: '923e505fe89a0d3fe12bb0ec4b69c76e5639545725d0cc4e280a367f9d339726',
    sources: [],
  },
  'scripts/publication-scopes.test.mjs': {
    before: 'a1621ce77a8ebb377bf1bde177f29c4167e22b1b90e781fbb524b78ed2a536e9',
    after: '2d40964ce4f496c74340d988afdb3b0d2ec879c664d4c69069da0b1ab4e953bd',
    sources: [],
  },
  'scripts/test-game-dev-mode.mjs': {
    before: 'db3f9ed8b7106baa7e868b7d4dc926dc9f41ab82ae9ee5474edce52c522b3c51',
    after: '5ec2f000318a181cacc5160aa5c24d9158526a7d7204b059a0878e6f5d121d26',
    sources: ['apps/shell-web'],
  },
  'scripts/validate-push-hook.test.mjs': {
    before: 'a66e2053edea0d5030e0f13ccf89b42f4b8eca20d706ac3daedecc7847375df4',
    after: '65e341a5ae0ea0491e014248ffa71389d3ff080daf8b4c97016d6e70fa8528ce',
    sources: [],
  },
  'scripts/validate-tree.mjs': {
    before: '4bece2fa09b5a8c7d38145d353b1f00f7ab70f7694e1cd704a40e66f5bf8f003',
    after: '52cff6a2cb4c0c51bb69d0f1c9effb1ba9a0217cf298d9a690ac74998f6a49aa',
    sources: [],
  },
  'scripts/vite-patch-scope.mjs': {
    before: '41207d01d4c548bca8424e8d1746733fbb82d6367198e3877d9da52040e24917',
    after: '2cd5f2773873c4fc8852d81b8250fe13b129e2c347e627e8c4fdc618a098ad39',
    sources: [],
  },
  'services/management-api/package.json': {
    before: 'fbeea00d06c89ada8c90826465c675350bf3eb9cd08363b512c6441530784b31',
    after: '744d87faa39c4ebeac39d9d169d38db0ea56028cf9dd26b175c310da519232c9',
    sources: ['services/management-api'],
  },
  'services/management-api/src/ad-drafts/routes.ts': {
    before: '7e38045a3ef09282fe1afda1742b4b8fc256b05edfb6857e506b9837113fdacf',
    after: 'd4698ec7edc428dabb118b8343fff93ba0c3ef9fd5b4a51b889b47a7b3ba54ad',
    sources: ['services/management-api'],
  },
  'services/management-api/src/app.ts': {
    before: '8f8b446353524d44737be6cb0a86bb08cfc9fe06ac3fc407855f72df217c031b',
    after: 'db40a4b4216ec1ec9f6eb7d0f2fd7636b1a1235d518cb64fa12ce1f66cd48eda',
    sources: ['services/management-api'],
  },
  'services/management-api/src/content-target.ts': {
    before: null,
    after: '1504eef2a991127f438c600e59c6472b0d771b0d5265f38a012db98ee4682604',
    sources: ['services/management-api'],
  },
  'services/management-api/src/drafts/routes.ts': {
    before: 'de4857a16ee067f22ff7a7ea123fc874175d33ab30d76cb35070694897475040',
    after: '5683ce1622a16b19d07ce9a44e918c8e6ea05e36443c0d967162c42526620e9e',
    sources: ['services/management-api'],
  },
  'services/management-api/src/generation/routes.ts': {
    before: 'f43766b2abb1bc71aca6bb8d75ab0fc1c68dca3b4cb4e6b9499482ffe9f271f4',
    after: '792a21a4135c62ba7334f674deb098179c4a79892160eb2e50b602c872e20e96',
    sources: ['services/management-api'],
  },
  'services/management-api/src/index.ts': {
    before: '4db8e101e575360d538e1c8339a415db3d45d39380d2ccc8edb85de0c818868a',
    after: 'b295661496006b4ee333f773081df2fd454c3fded149da2514a159df3175c86d',
    sources: ['services/management-api'],
  },
  'services/management-api/src/releases/routes.ts': {
    before: 'e90da5f6ef8fb00afc69ddd023f1c8b29d98a5b3e34480b4b57c21e89748566d',
    after: '5265f563ce86a24dad12e651dad3c331b78094b0faf19e1e44bb2d879dbb4111',
    sources: ['services/management-api'],
  },
  'services/management-api/tests/ad-drafts.test.ts': {
    before: 'ba4fb430f953cc8491f8728bf613ad3e29cb447af6ad2d721fe365ec57876407',
    after: '39b66d18d551b9069ebcaa56004b799ee706f966f926e8c65ff26d6bc4c15066',
    sources: ['services/management-api'],
  },
  'services/management-api/tests/content.fixture.ts': {
    before: null,
    after: 'ca9c0404bc5ebe896dbea84f6050b4c0c277896f2279c94c64a612cfa4e6b23c',
    sources: ['services/management-api'],
  },
  'services/management-api/tests/drafts.test.ts': {
    before: '5275444336d24e2b4d6041848deaa0a15b0b440c1bb2dc32b0ed5ce1587b9dfe',
    after: '295b1fdbe20c07a4aaa3162140656ca52f3baedb59c0dee0f89268e8e61953b8',
    sources: ['services/management-api'],
  },
  'services/management-api/tests/generation-jobs.test.ts': {
    before: '9c4a540d7b098920ac841aa0106df47ac49f78b14e3bc05f93b174c1120927e4',
    after: 'b5b408d1a31960fc81821c89a961cabf35df40fb95767c740b9232b48f57e5d9',
    sources: ['services/management-api'],
  },
  'services/management-api/tests/releases.test.ts': {
    before: '651a4ad81f72d27da362d9d3a310798794db7d16d07fa1baa60b2d4cebdd6509',
    after: 'a32f0512dd9dba0a59af48c96a9a983237f18d474675e9744ed1a32ff856f4ac',
    sources: ['services/management-api'],
  },
  'turbo.json': {
    before: '87cffb64731a1e510934645439f1f23e3ecbbd60e3e076c7237caeddb22268c9',
    after: '3f5b2f6a90c2e05cbe97359e9028654b92724951c4e3eb2e72a24f2300338da0',
    sources: ['apps/shell-minigame'],
  },
});

// Exact retirement snapshots; retained game code remains independently validated.
export const portfolioRetirementBase = '4224be0a1a3c9c108e34c39d996642765cfdca54';
export const portfolioRetirementHead = 'e6f871ecc0074fa93ac5c0f5c8bcfe807d421f70';
export const portfolioRetirementTrees = Object.freeze({
  'games/local/night-merge':
    '040000 tree fbcf86f12f4b8c4b5863441a2a80834c3c9f8f52\tgames/local/night-merge\n',
  'games/submodules/fishing':
    '160000 commit 57423097cc62f6544455ca791e1a77c1ee3e7545\tgames/submodules/fishing\n',
  'games/submodules/tower-defense-game':
    '160000 commit 75ac87f7be6e1a7d603571c2114f4a69d914fd7f\tgames/submodules/tower-defense-game\n',
  'games/local/h5-security':
    '040000 tree 3f5e59bdc6417d491ee217e00a30a9f96fd0d9de\tgames/local/h5-security\n',
  'games/local/letters-words':
    '040000 tree 663e079ac91f80fa8867dfa8558bf5e26f8e2323\tgames/local/letters-words\n',
  'games/local/multi-battle':
    '040000 tree 90091de4ec687dc35e159e7eca7f11c94895b557\tgames/local/multi-battle\n',
  'games/local/puzzle':
    '040000 tree 556d1d3d194ddb88381f212c8aef1813d3e8554d\tgames/local/puzzle\n',
  'games/local/travel':
    '040000 tree fc2d2e05d625875929b6e2fa068062cdd9724d8d\tgames/local/travel\n',
  'games/local/travel-bund-2.5D':
    '040000 tree b27b9010f2cc91069ded0e8798e78a10a5f17033\tgames/local/travel-bund-2.5D\n',
  'games/local/travel2':
    '040000 tree e5289b0f74b06bc3e3670825ce57d3fdd1c14293\tgames/local/travel2\n',
  'games/local/one-stroke-course':
    '040000 tree fa9a7d6d4bffe24e20b2abb8716d062a608ef292\tgames/local/one-stroke-course\n',
  'games/local/hold-tight-acrobats':
    '040000 tree b1867af8b0656d29d834ed6d478b7663c4a76860\tgames/local/hold-tight-acrobats\n',
  'games/local/balloon-movers':
    '040000 tree 09964dd039e1650e863655f87973419571eb9a20\tgames/local/balloon-movers\n',
  'games/local/weather-command':
    '040000 tree 8e7deb4a15a0f08504706f413e3bd5ed7f753f05\tgames/local/weather-command\n',
  'games/local/off-camera':
    '040000 tree fa56040043dbc7d58b3e0e93419a7dac0948ba19\tgames/local/off-camera\n',
  'games/local/precision-demolition':
    '040000 tree fff15c61c044f38cdffa4f6de9e7c068ad374f30\tgames/local/precision-demolition\n',
  'games/local/afterimage-arena':
    '040000 tree 78d6d92a74a19db920a1e715a91b4ed89089f99a\tgames/local/afterimage-arena\n',
  'games/local/ghost-shift-manager':
    '040000 tree e77268ec5ff1db5b274fe1237cd5c44065c3ed93\tgames/local/ghost-shift-manager\n',
  'games/local/rule-thief':
    '040000 tree a6cf68f4ce00054223d934726e4486994be1520e\tgames/local/rule-thief\n',
  'docs/plans/2026-10-11-catalog-verification':
    '040000 tree 13403c1af36ccec32aed2fb2201a667202e91a3f\tdocs/plans/2026-10-11-catalog-verification\n',
  'docs/plans/2026-10-11-catalog-complete-verification':
    '040000 tree 0b52631057dce932153400b76bef3125f0b44a50\tdocs/plans/2026-10-11-catalog-complete-verification\n',
});
export const portfolioRetirementReviews = Object.freeze({
  '.github/workflows/ci.yml': {
    before: '8ec42971a72e5dec8bdde2800105522b428170925bea489c910a3f2f8b0790a9',
    after: '21ee0e1a07b780ab17efc4290ee58d58dec409e30adc61e3ad11918141f317b1',
    sources: [],
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
  'README.md': {
    before: 'a9eb1dfbb94d76c8ba7edcc4cf4401c31e4c6f5433c0d0df2ea220760d092c3b',
    after: 'b4c48db7f5c0b1f29d9fb24dcc10d576b9bb1b88d26cf1af376e6698e21ee07b',
    sources: [],
  },
  'apps/shell-android/scripts/device-smoke.mjs': {
    before: '14fce9bf68e18a03b5061b6aa42ef0e1e6015d7408d8eb5eb95f9168a012a35e',
    after: '1b4952bd271282c2ff4e458d4c7325370b04147342580c60d35779975ed09e01',
    sources: [],
  },
  'apps/shell-web/package.json': {
    before: '26223cf649a2c2eba9a7f3048b7715ba7237d9e1546698a20b272442f6367e28',
    after: '12633e0d00275065080519b5ad1372e3827999a1a4acde6b71af48e9b5091ddd',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/catalog-rollout-smoke.mjs': {
    before: '7b596aef11323bc220cc64ea7052463b7ab356da07caa3960ce595b768e72cf4',
    after: '2547f23c242a7aad072bda975433eab9de5e3e36699f669f3c279e8ade5099a0',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/pages-smoke.mjs': {
    before: '9b8d9e3b859c9c03f72fe7d6f4f3de511df3b24f4dbcfa9aaf8a693f9f841ddc',
    after: '61c2dbe3091718f70df0903b783f8046abb35c26a841c3885319d0cfba59a7d0',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/pages-validation.mjs': {
    before: '9842e1dd43a69e8abd7067bd4bb1a126775a0c57f7df0733c98acec3a6ecc272',
    after: '5926ba1cbaca0e5f2706bd7ac68dee3faf5d0ea3605f941bfdceed496edbefed',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/pages-validation.test.mjs': {
    before: '944ec5b6c4db7f844e87e2588044c19e2a326f7531025cae3ae83bbc854025e4',
    after: 'c18edf50ec02a5ad289a17a8b495e85c794be5243f413105ee481e65365908c6',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/standalone-game-checks.mjs': {
    before: '31eaab8b99cb0fadacaa41a8026880fc8b2c6318d8511593f44f0fe56dc9144d',
    after: '102f2520f1677456ffd13bbb8a3c008b173f68d52fb3dd03d53ebd85bb2c674d',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/standalone-game-entry.mjs': {
    before: '6a57f5526993ab65efe680307f041cffd80cf433b84d3eb601db071cc56bd793',
    after: 'c7ca792124759b2a72588b432c2be5f8e0c6e902287ff14e9c62ed3c6272a436',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/game-assessments.json': {
    before: '3bd431c46376bab6f0ae3633f58ee4e027c1aabd2974ead21c9e4c3fde4f6634',
    after: '16efb76c09b10cd813718f4cce3622df7c388ba83f5acb6496098e43872a4cff',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/game-meta.json': {
    before: '66ede3f5978020247adcfa39d0e1381f2a3ceb31b1ebc0561a1d36e0b0edb70a',
    after: '80a8683eb547705a488145b71976ccf6ecfcb02faa64f84ea68a56265595758b',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/standalone-games.json': {
    before: '0b0ddec4114d335ba88fb95ba74f0624c8e1e299611d742869405e83020894fa',
    after: '91aad8166ea5e4d7d034a400e5494aa9fd6818f6f89405229babcb2348769c22',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/catalog-assessments.test.ts': {
    before: '16f732547aec33f676e905765c88f0e043305baefb3055432c551c8cac05ca78',
    after: '96cb2c59a97cd502471010e70da2ab00eb2044974bf82a7d332fe3bca8dc32b8',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/catalog-filters.integration.test.tsx': {
    before: 'b2ea506e0021c6183199945768915c92b8da3ecb060b7b7314a8cbd9b0a29ad6',
    after: 'd088e3fee833f956790d8ee0cae4a040145c1c5522a7265b87e39c7a4f7e581d',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/standalone-immersive.integration.test.tsx': {
    before: '3ca9d37e923bfb6daf7d03fe01907dd1e4cea844ab78affac642da078dedb21a',
    after: '18fedcd00f1c6653acfcd223a932744ef8e1fb48c05acf360f914e8f3e22b388',
    sources: ['apps/shell-web'],
  },
  'docs/adr/0009-independent-game-submodules.md': {
    before: '69c1282bf5359b4a9b734bb02bc4c9aa1cd5d1dae6171cd9aa79913d5c4ed549',
    after: '10d112b093b3a36d94d5aa2fef25fb932448ad08f8c2cee2b4b0b3cb223d3ccd',
    sources: [],
  },
  'docs/games.md': {
    before: '1c12bef793e1be71ac214a103b2626bd2261668d8d18177fd64749be01ad8ad5',
    after: '354478c06ba52cbb3148800b7d0f3dc5e15d9beff74efdf471ad0449f1fec661',
    sources: [],
  },
  'docs/operations/pnpm-12-migration.md': {
    before: 'ed6c11f1274609b0c7a67589903870b4e419e7cda413b5a998ea637159c52b1e',
    after: 'dc31ee2cd1522759298fb5b9b5e5cdff9c19cf67775d511da4f718fb152b783c',
    sources: [],
  },
  'docs/operations/vite-rotation-2026-10-12.md': {
    before: '51c62c76130a2dd4bfd666ef9f1657a2917adca2bc5aafeb8ca9b54e2efa7606',
    after: 'dc4b4e21eddc7ffd690f179684d14a5fde04c34e3512db588c3c951cd73a6184',
    sources: [],
  },
  'docs/plans/2026-09-14-game-directory-integration.md': {
    before: 'a5aa081b1c5dca72b8235d2616af98ef7cd230d90c07ebdefbb1a9a738f0d7b4',
    after: '4fc100ce5ad7d4ee7a05a3585cfb0bacafb77b801a16dc2cd9d45531008fed01',
    sources: [],
  },
  'docs/plans/2026-09-16-night-merge.md': {
    before: '0453d2b83a6f3c083ce34926bc5f7d1757eefd761151211cbd97e8b25b112504',
    after: null,
    sources: [],
  },
  'docs/plans/2026-09-21-six-games-release-quality.md': {
    before: '86c16831e9aab630f423c526203be94784c2fbcf431389df0aff9dac4fcaa4ae',
    after: '2f6af8494f23f080fbdb517785781d52f076eb3226dafd4b5fffff983c7c1210',
    sources: [],
  },
  'docs/plans/2026-10-11-game-portfolio-assessment.md': {
    before: 'f9daf8325612916422e062e1c8ef3e339af762debd34a7b95718efef2bcd071d',
    after: 'a4ebb3306e34cd15af4b67d67af41f5478325a728f77b83428c85ac7e583506e',
    sources: [],
  },
  'docs/research/mini-game-platforms-2026-09-17.md': {
    before: 'b537346e2b49e4ad2b01b66f3748589c9c8d2ffabb63c1f44f81a4170f17f063',
    after: '58844e6d54900b9ce07fdfd27a38d3c42d587692e17e2f7c2be2b75ad444a25e',
    sources: [],
  },
  'docs/standalone-games.md': {
    before: 'f71e88a6824e6f6b8d3e90f6e18b6e056d0d594f317fb4e7d335ee2da9bb51fe',
    after: '88f98c74778dc4d91609b22ad37cec89978c6c570217b64906c9d19e825b934c',
    sources: [],
  },
  'games/local/cops-robbers-realtime/docs/design/cartoon-refresh-2026-10-05/README.md': {
    before: '33f497d62bf58227d43ef556779952f1bde51ffe111ac2314cba3062c254eb0a',
    after: '9c50ef00c9b80b5253468519d126661ca2360b28fa8c8cdd5cabac66eca1f362',
    sources: [],
  },
  'games/local/letters-words2/RELEASE-REVIEW.md': {
    before: '924b192473b6a80c408e10c314508e215f3c173b482d141e496dda691a63dae5',
    after: '547b49237efe2e62fbf4dc705226f3a14efd361adcaca4af82e908b273600af1',
    sources: [],
  },
  'games/local/letters-words2/library.js': {
    before: '949bd40a2869b3268b8b225702d21b1be795ee7040cddc0bb892f76e66649a73',
    after: '718557981b1a2d8e72ae2543276c2f7c4729cc88147647d674011747782c173f',
    sources: ['games/local/letters-words2'],
  },
  'games/local/letters-words2/scripts/export-vocabulary.py': {
    before: null,
    after: '7d7cb8c00e2a08e8b403218ac42bb5a11be7b7f9510a8da65589ce06f7078bb3',
    sources: ['games/local/letters-words2'],
    afterEntry:
      '100644 blob 4e533642d524c890425dea6c4e57af933991f5fe\tgames/local/letters-words2/scripts/export-vocabulary.py\n',
    movedFrom: 'games/local/letters-words/scripts/export-vocabulary.py',
  },
  'games/local/letters-words2/scripts/sync-vocabulary.py': {
    before: '392e70e03446a259eb98b1bc13cf354746be0b67e721a4bf7c26162fb55c0530',
    after: '44f172a9707ee8597828ed9239287345a9d58cb22ca83c65dc6602e9a8d2329e',
    sources: ['games/local/letters-words2'],
  },
  'games/local/letters-words2/scripts/test-export.py': {
    before: null,
    after: '714c9c4ccf76e56e7c0fc3a11d9fdfbffda8a8e0c98aa401816528078a46b87d',
    sources: ['games/local/letters-words2'],
    afterEntry:
      '100644 blob 4a10bfc2dbdfcae3f10787005dabd1145a8dc5bf\tgames/local/letters-words2/scripts/test-export.py\n',
    movedFrom: 'games/local/letters-words/scripts/test-export.py',
  },
  'games/local/night-overwatch/reports/balance-overhaul/artifact-manifest.json': {
    before: 'c7af136cb13de2bbfd00602b08fd9893ee7a625f9a4b9b8a5b4a57d3334bba47',
    after: '09df358fa35496c0f4a1aebf515310e45609774c23b113770c82d847e7446c96',
    sources: [],
  },
  'games/local/night-overwatch/reports/balance-overhaul/game-config.log': {
    before: '34d4c59957197fe611984e2fc81e07880dc51c10f06220fa60318494f583b63d',
    after: null,
    sources: [],
  },
  'games/local/night-overwatch/reports/interaction-overhaul/previous-verification.json': {
    before: 'db314f3edf8b18817804bb66f58db49b4984bf53f0c7b8c9b21b965342ed2af3',
    after: '5356b1ac9b6537873355a2f24272971ba692c63e16be2e2d6a9a527aa22c583b',
    sources: [],
  },
  'games/local/tower-brake/docs/TESTING.md': {
    before: 'a6657e94d2c42b99ed6bb294c7e66dd2a08b43ce3c48ad5a4dc23f85813aca13',
    after: '395902bf80c1c3331a4a2ba83c3b4befcde886a8e7da3907b3d384ce66d679e5',
    sources: [],
  },
  'pnpm-lock.yaml': {
    before: 'c030eb6778a401a42b4baa8dccb2cec9fe3e4fb8cd28ff5a4e44e4882669eec4',
    after: '959125ee6a824b1a1b820f12dde14b8f2aad9f99080afefe70ca3c2584d94379',
    sources: ['apps/shell-web'],
  },
  'scripts/check-workspace-dependencies.test.mjs': {
    before: '32ffca66f16ce51a765405e311da98ef36ccff994777da6b82dbf0368eefa291',
    after: '239d846127645b0e4181a0eab823c34772aff5f1ab58a90f70d45952026450ff',
    sources: [],
  },
  'scripts/pages-regression-timings.json': {
    before: '594635ad9e1c0305587c378df53fb8755c9f773c8ae7c06ec1c98dce53536a0f',
    after: '6ff73ec46ad86847af61c52efae06de06d1d541964464d5731b86e97e177a74d',
    sources: [],
  },
  'scripts/pages-test-scope.test.mjs': {
    before: 'cdf618a18d39feb65200ab53932e66051824c7a9401f6fbeb1a5003516a01494',
    after: '2335fb482cee9b74af0d70ee11c123ddb519f1157da592d7f03a1a1dacf51b68',
    sources: [],
  },
  'scripts/prepare-pages-deploy.py': {
    before: '92a101d2ca4cd226f023c879c65ae44265a5a21debfb6db04d071cd5827a228b',
    after: '92360beb8d4127e9261faa6338ae82d7c2dcac632f186d45d377d0291c862a0d',
    sources: [],
  },
  'scripts/publication-scopes.mjs': {
    before: '326258bee04519d2278a499d3cad80e2c69cea89f07da340a8eb4b52a6ca268f',
    after: '1c559971c47972cdc2e9c5cb4fe2a700b2a07f1f7ca39f6689e4c2eee5a66718',
    sources: [],
  },
  'scripts/publication-scopes.test.mjs': {
    before: 'f515fa13e8d94726fe3c2b4e781011cb42834054982bcc752c5fc182baed247c',
    after: '5de6ef05ade4d7cfd5fb30bad548e384d2be0648deb8de90500b7d29b8499c2f',
    sources: [],
  },
  'scripts/rule-tasks.mjs': {
    before: '25eb7faf0f55868a2ae74593dc5b4d0ba1436e7499fed1793c963c9839e62665',
    after: 'beaa1a20bdd19dbe5a77660062b6bea3c55852af035657a00cbbaa500d7b6f8b',
    sources: [],
  },
  'scripts/run-selected-browser.mjs': {
    before: '40b88c9a89b30e8622f5521aec578cbbdf585d8dacf01492729c28c0a2527b6f',
    after: 'bd72ed4fe39dc75aaa5994a21c8a41735225b3e9aa29d01a44af67167865008c',
    sources: [],
  },
  'scripts/test-game-dev-mode.mjs': {
    before: '5ec2f000318a181cacc5160aa5c24d9158526a7d7204b059a0878e6f5d121d26',
    after: '2d8159944b02d193c921d02c403be5d11135aeacb195ba9560e683e2907cdb50',
    sources: ['games/local/letters-words2', 'games/submodules/xiangqi-five'],
  },
  'scripts/test-pages-deploy.py': {
    before: '526cf35acf7679f5f57aca9b668110c9ef0bedefcaf6e265f7293907b02c2239',
    after: '89d4bf68f5617e1fca9018729289ea77e64e091789d19cb62be1241b65d0a2c0',
    sources: [],
  },
  'scripts/test-submodule-dialogs.mjs': {
    before: '750310b232aea5ec03ee17b0258074bdab6884dc5c111daba7b1221112474e4b',
    after: 'c8a66b32c2983074cdd9a7068e69984810ac973f55deb1d263b63d87ae512a4b',
    sources: ['games/submodules/xiangqi-five'],
  },
  'scripts/validate-push.integration.mjs': {
    before: '75b75b2bdcfdc7a9c053a55c2ec451331a2b81d5eab582d7c9347cd953b79bfb',
    after: 'b57eadeb914c93e0b033a0cb4e677b1458031274a224473626c77fbf410b130d',
    sources: [],
  },
  'scripts/validate-tree.mjs': {
    before: '52cff6a2cb4c0c51bb69d0f1c9effb1ba9a0217cf298d9a690ac74998f6a49aa',
    after: '718bbfae77c8a376a9a6aa1b739001b966aae39961f5dcfad769d6cfb40169c4',
    sources: [],
  },
  'scripts/validate-tree.test.mjs': {
    before: '5343860874831d18cac867bd916254205a72cb8c9916b588d31e0ebf32d9dde7',
    after: 'b0566305f0105b7bf42a4531ed34c05abd754850514c4476e4ead03509c0d6f8',
    sources: [],
  },
  'scripts/vite-patch-scope.mjs': {
    before: '2cd5f2773873c4fc8852d81b8250fe13b129e2c347e627e8c4fdc618a098ad39',
    after: 'f447b4026fb11161df97fd297099ac13c4934301267c463cbbc3e96bec1a18aa',
    sources: [],
  },
  'scripts/vite-patch-scope.test.mjs': {
    before: '34a7e2cb9777f3f7fae6a730c030101a49d3187fe27ec2a88daa31763ece95a2',
    after: 'e00e5e9d135cbc78144382b68f233567f66fcd1090677e9ca6c85b8f0dfebf1e',
    sources: [],
  },
});

// Independent cumulative review for the actual main integration base. It does
// not extend either earlier retirement transition or grant proofs to live files.
export const mainIntegrationBase = '0459b0cb3c89a748f3a6bd252858951ba1ca073d';
export const mainIntegrationFixture = 'bf68adb31aaf27be4f809c5e875aa8babee8c147';
export const mainRetirementTrees = Object.freeze({
  ...localRetirementTrees,
  ...portfolioRetirementTrees,
});
const moved = (from, to, status, before, after = before) => [
  from,
  Object.freeze({
    to,
    status,
    beforeEntry: `100644 blob ${before}\t${from}\n`,
    afterEntry: `100644 blob ${after}\t${to}\n`,
  }),
];
export const mainRetirementMoves = Object.freeze(
  Object.fromEntries([
    ...[
      ['afterimage-arena', 'bullet-garden'],
      ['balloon-movers', 'homebound-station'],
      ['game-arena', 'merge-front'],
      ['game-building-power', 'orbit-atelier'],
      ['game-cricket', 'tianxia-chalu'],
    ].flatMap(([from, to]) =>
      [
        ['dev-mode.js', 'b184ed2ed1f23f612143491235bbfe348c42e627'],
        ['dev-mode.d.ts', '19ecd63375b8c703a717e650860e303b67af3ab5'],
      ].map(([file, blob]) =>
        moved(`games/local/${from}/${file}`, `games/local/${to}/scripts/${file}`, 'R100', blob),
      ),
    ),
    moved(
      'games/local/letters-words/scripts/export-vocabulary.py',
      'games/local/letters-words2/scripts/export-vocabulary.py',
      'R100',
      '4e533642d524c890425dea6c4e57af933991f5fe',
    ),
    moved(
      'games/local/letters-words/scripts/test-export.py',
      'games/local/letters-words2/scripts/test-export.py',
      'R100',
      '4a10bfc2dbdfcae3f10787005dabd1145a8dc5bf',
    ),
    moved(
      'games/local/game-cricket/public/cricket-audio/perfect.wav',
      'platforms/competition/assets/action.wav',
      'R100',
      '93d1978b99333a0cfdb9781ea2c79432d625b8de',
    ),
    // Git detects these separately reviewed deletions/additions as partial renames.
    // Their different destination blobs retain normal game/Creator validation.
    moved(
      'games/local/travel-bund-2.5D/tsconfig.json',
      'games/local/bullet-garden/tsconfig.json',
      'R050',
      '8764f603c5e21fc3f8e8dc84398f15876549e006',
      '73d4d35b268eaf878e444c6b62930908e0a1f465',
    ),
    moved(
      'games/local/night-merge/tsconfig.json',
      'games/local/tianxia-chalu/tsconfig.json',
      'R055',
      '6dee0ea6200dd0dec495b0e4fa7c39b6abfa1691',
      '10af18e21c1405859671e1979b6a484b8d06f36d',
    ),
    moved(
      'games/local/letters-words/assets/english-dict/LICENSE-ECDICT.txt',
      'games/local/ball-roguelite/vendor/cocos/LICENSE',
      'R089',
      '594da8a1009c6a9b96d0fe8d1689aa192cf187fe',
      'bc24fb9700aa43adf14d65a2ed53cafe6cd90f10',
    ),
  ]),
);

// Catalog cleanup: bind the removed tree and every surviving executable edit.
export const catalogCleanupBase = '89b24fb923a6b44aa022c2b9bb302c9f12686ae3';
export const catalogCleanupTrees = Object.freeze({
  'games/local/retreat-rally':
    '040000 tree a70506bed2f7ce84c96f767f4c7cc50afa8a3bc5\tgames/local/retreat-rally\n',
});
export const catalogCleanupReviews = Object.freeze({
  'apps/shell-minigame/package.json': {
    before: 'aa28f0baebb07ea7eb741b3d644d4937a263cb998737b2e1362ac3307dfbc5d3',
    after: '58a0eb3b27ff168a967fea5463065a2ff3c2776affb6c978af4cc2018bba740d',
    sources: ['apps/shell-minigame'],
  },
  'apps/shell-minigame/scripts/games.mjs': {
    before: 'be0b987c00dcf8c56e1445df57d7cb19ee208d841ee8cddd83717ff4e57d2e3f',
    after: '15619b9231d5d3299150eeb2de0d91ee3bf7af5a0346739143d7a567cb03dbe5',
    sources: ['apps/shell-minigame'],
  },
  'apps/shell-web/package.json': {
    before: '12633e0d00275065080519b5ad1372e3827999a1a4acde6b71af48e9b5091ddd',
    after: '05fd51dc8cd2b738552c71cbe1842d4cb5fac81242b32e152b559565c3415ede',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/catalog-rollout-smoke.mjs': {
    before: 'be5e0a0d38ec6d6d72389492c72b176d85b9735648ae331261c923608542e662',
    after: '05e9a6da2b44be68f8ece67ad075b2f6f48150983ab34a902c50c93b40cdd54d',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/pages-smoke.mjs': {
    before: '0b17f12fc5de1db2eb555a6dabc3e79c996ed214bdaf40a766c12f829e92ba5e',
    after: '8f2fc3ba828ac4ca2c91f58d7199465121cf9eeb3c6ef76f0706410f41ba17c9',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/standalone-game-checks.mjs': {
    before: 'e676be9ed613c7abae499fe9f5962709496b842b10ef79f852b0b8cbd1f2e5c1',
    after: 'be16d0ad7be4290296e2e9eed1c34e1e20b07c465b7b988e579696ce37f81670',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/standalone-game-entry.mjs': {
    before: '6c9185d1c0a6a9a69e54276e617669b33363438ae2d149c8103b3cbc5a0ba2c6',
    after: '402e1783f800475d55f9d0f70b73943b7543723e8de585701f1c80d91bf1b7f4',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/StandaloneGame.tsx': {
    before: 'a073cc0dc901da461ca3e455331178d1cf9547e21520d9af65946fe6b5421f94',
    after: 'c5b576c61c47f68fe2e65c66864c7fecf68a6f36414f45fce1ad10a71289a003',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/game-assessments.json': {
    before: '9427a3297cfff57ea4b71183463385bd0d901aff6169dbb4e6853bd6b36fe9bf',
    after: '3d2c610cd8d44e2fbbeffc6c646c3207375254b93a8fa3806acf32bc7f96a6fe',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/game-meta.json': {
    before: '80a8683eb547705a488145b71976ccf6ecfcb02faa64f84ea68a56265595758b',
    after: '462b3153ad38b932573e2ecfa67a3785fbb45fc54ff01af3cb8c0afee1b7f402',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/game-sharing.ts': {
    before: 'a7307ac7f5c8f00931da71374d562c2c924f8f4ea091d0828e91ab30d29f8563',
    after: 'c4520e3b01b74d92252af659bb68ed9392d47471c0092b01fbd3de39cfb44523',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/standalone-games.json': {
    before: 'edc4f65dbe89a68385987264ae871d22fa50a1d1936d228405529683d4a9dd89',
    after: '3f7bb180a5c59470e12852fa4f11bf940d134afe5d56bb5de5944b346aa8a128',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/catalog-assessments.test.ts': {
    before: '8dd6db5646c0f8e3f047f9872bd71c939ca681faf82e18f2a881df78233b4333',
    after: '1bde8c982117a13e44ee06a72b9d81f68899361b23ea08f3159039f2efe9f013',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/catalog-filters.integration.test.tsx': {
    before: 'dd9d4b3c4666d0535eae0e122c687272844a65c810007978b1d5ebe4106d3b0d',
    after: 'cccbc547e2a5b168a04e3fbbf7cc65cb88fcce40d568d50e24a347f43d01696a',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/game-sharing.test.tsx': {
    before: 'f5622994f2ffb6fab998db14f525691e436557d82f633b25db59d62009212dea',
    after: 'e59c68960d839a18b53549b25b2ecade3aac6d099261a763136a33d05165e095',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/standalone-immersive.integration.test.tsx': {
    before: '98e468ef41741d7c393833b28d4a3eb6323f7158865b3e22cf98776b28626642',
    after: '60b592bb4b5133793c1ff62438ffd96899dcfffc53a6eb8fbfa0d21cfbaefaab',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/standalone.integration.test.tsx': {
    before: '176522c7db16551db09fbf863a0c41a67d4d3ae02a2d3eab70ad8b3500d49901',
    after: 'd51f359b9cce5e46295d19d0cce8fddea443c954c276939720ad5f2840262890',
    sources: ['apps/shell-web'],
  },
  'pnpm-lock.yaml': {
    before: 'b23918aa79186aa5922438925c7df51d6433d07eec54cc0af3f3996d47b8c9c7',
    after: 'bf37f530bd0253a9fdcff185ea435f94a3a7ab9969b6925c06377c92fa4ca9cc',
    sources: ['apps/shell-web', 'apps/shell-minigame'],
  },
  'scripts/native-game-smoke.mjs': {
    before: '722d4eef3f0bd1efa81031664755ade8a361f681e8d0a3abf6e614df50057e94',
    after: 'bbf5acd58be12f144f861f716a94f2bf8ba25170a527d6302d93904a9ec00ef0',
    sources: ['apps/shell-minigame'],
  },
  'scripts/nine-lock-scope.mjs': {
    before: 'bbdc10347538d29aa3f6c6fad0df0850a5076ef28ead992ffcf06a04a4fbe427',
    after: '81105ceccf3747e1dad7e371dda15af3321e1659c379fb57d01f3ada5bf12225',
    sources: [],
  },
  'scripts/publication-scopes.mjs': {
    before: 'f691f077a4c5b3f402b0481c0389e7ede43e409e25f575c118f3c3be9c0754df',
    after: 'fb9662c46583c204eb9285cfe935ecd4fb9650b8c33db812da6000d225ddc4ff',
    sources: [],
  },
  'scripts/publication-scopes.test.mjs': {
    before: 'bdaa5e3d49578b624aa64ef1971b24ff99e7984ca5bbcd7ea95af10e9ca5f15e',
    after: 'a11c2e66d818dc2bc3ed403ed76676ad0c642cd0e974116546e466f82ff856b6',
    sources: [],
  },
  'scripts/sync-h5-fullscreen.mjs': {
    before: '13c2e80cb9bdcee4cdfbdf7d502c0e1a51f2f4e4070230eaccbe091e22a84d47',
    after: '444c0792a85d7cf3713555abfc12904972b26c2c7d03ca4330a9b03478c161cf',
    sources: [],
  },
  'scripts/test-game-dev-mode.mjs': {
    before: 'de3df3cddcfa91f7005570a17d9c27483cc58ef2df0d3310cf598e4e4686d801',
    after: 'f916c53b903f180056aaa35cdb8137ac9b6b4f42592d1f44416914006e4a8423',
    sources: ['games/local/letters-words2', 'games/submodules/xiangqi-five'],
  },
  'scripts/validate-tree.mjs': {
    before: 'ccf945093a2e72c444e9d60256f40dbdef68835da40028c15f043f2509c290a3',
    after: '3ee9964438a6972bb1de158fb7c57d6c3c094bd1ddb957f11c32ae31ae089098',
    sources: [],
  },
  'scripts/validate-tree.test.mjs': {
    before: 'b9ce651877a004e5284f7b7c5789bec25050a65a5fa5f1e81f924f25dcdedf78',
    after: '84d8e45ef0ace5c3a630855198db7c44a5a4b8da3a123c5241c533fbce8b81a3',
    sources: [],
  },
});

// One complete game removal; surviving edits bind exact Git bytes and retained consumers.
export const singleGameRetirementBase = '0cc3d0f8f83c2499e67db43b7d56aa84ea7397a7';
export const singleGameRetirementFixture = 'fbfdee0ec08a823a9888d7d2737c4078d52f3b8f';
export const singleGameRetirementTrees = Object.freeze({
  'games/local/orbit-atelier':
    '040000 tree c4cd2c47a1acf7f4d18ec3b8c62fd7a25bf87077\tgames/local/orbit-atelier\n',
});
export const singleGameRetirementReviews = Object.freeze({
  '.github/workflows/carding-car.yml': {
    before: '717092deb39241e5e481eed2163f38d4090996d876c6ace9177149516ed01084',
    after: '29bda512463659ed022b1e2bd16b70f9f0a74103c27b9600a4df3c8df8cabef4',
    sources: [],
  },
  '.github/workflows/ci.yml': {
    before: '49710171c3d1db587f2b413da6f17c2fdc6670f0d1cd65f851a642b62ec3b6f2',
    after: '349e197269c39ecbc02694ab654b9cdff837220a4f85fda36edd58173a391ddf',
    sources: [],
  },
  '.github/workflows/mobile.yml': {
    before: '04cf72867c6d3e508e31c1a9a9ae7fa099078cb7d9798e37ef6996db5880521b',
    after: 'd771d80a3c9a5de9202559b5083636b75b04220a486904458286d3e874bcc4c2',
    sources: [],
  },
  '.github/workflows/pages-validate.yml': {
    before: 'c236fb0627ee3fc288aaf45145d39d6054ca882da60cd523105f0499a27b1396',
    after: '2de509f645b0351bbeafb057614f6113583d4e0e9efec60a9ee65692196345e7',
    sources: [],
  },
  'apps/shell-web/package.json': {
    before: '8dd903436188b5cd1dbb48a749ebc04cb1a13d745a6e617909e8b983b8099164',
    after: '34b9b61e8106b032ebc5ccf457aac7186af25f856912a15325780cff3421e3fc',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/catalog-rollout-smoke.mjs': {
    before: 'af59d43f449098a9ab3058633de9032b5bc02dbeedc6be100574b1694a380963',
    after: 'ccde9c5f05dda932f104495aa8620485d8eaed2118fca1bd0c6a3d98bc697a02',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/pages-smoke.mjs': {
    before: '13ab44f5c97f902a4a3022cbdebf6558b1bb241eccaf8398157d9bb07db9f111',
    after: '3d6053ceaca61859f6a807932be4632a431c54ea7be6ce728010ec3aa024409e',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/standalone-game-checks.mjs': {
    before: 'e1811e3d2f3d8a5d339c13d63f63aa186e531e442cf1af0f0f6e8f0632b7c6d8',
    after: '8642a6da0f812d7cbafb2cf3f955dffa18e877f9f757645b4d8203313029e4af',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/standalone-game-entry.mjs': {
    before: '49135976574bfb3b471f8ff6fd3ea7d978072523735575f2840aac9eaabacb19',
    after: '28908fa1b5a49f844e457e80d2f3e7127f0b6a245e09903d08c13e9ddb75bc24',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/standalone-game-entry.test.mjs': {
    before: '8e4cf5eb1bcb2fabeeda2f2c152a9e41f32f4f377cebaf0326f04efbea24e0b0',
    after: '297e48707b662ab1601f772508227d91c68cd64bbab64651252df0d160d5c312',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/StandaloneGame.tsx': {
    before: '7416b008adf38d051df8ae0f28e6add18605268b4baceaf995197c299e0c885c',
    after: 'a4618a25ec15ce38c17623aa988b68d6c80409bb162eb5f48280a492bc6a8d1c',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/game-assessments.json': {
    before: '925025032df7b69e02cbee2cc3e90f792118cd50aefd747f367a2c4cc6fdc1d9',
    after: 'e76c9c28a07ca60cd4bc8f8fae247a0842fc2de224c466accd2e86142f18d493',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/game-meta.json': {
    before: '83ca53302800c1348512aaa2f00056a60ebea30e4a6a3223989398b32bef3a0c',
    after: '37fd4bd10f228bb1405183d7e7857bf901eb09e2790f3f859fec57ef18abeda3',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/game-sharing.ts': {
    before: '8852bf41fbbf7ccf077d2de670087716de8692bb123f1d4f8cca515358ecdf44',
    after: '60e545c5a1d690ce5dff0ed78c2c62c3558418ebe1a2dbe40b8726076d2b81eb',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/standalone-games.json': {
    before: 'e8033f575d1a1e9a2227916c2d6da2158e5f93dfa0a6f603a65b1ea26d0ef170',
    after: '38738f0a9fe41072960969957ac5802f0677f630ae9cf634b4bf89af9e90ef7e',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/catalog-assessments.test.ts': {
    before: '2d2ecdd9cf319ecbefc3d5aae03b47480f6af5dcdaee6c732f8195be080779b3',
    after: '512594ee3789783eb26174c8722b03b2caf2c63bc0fa4cdd39edf7fe417e6f5a',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/catalog-filters.integration.test.tsx': {
    before: 'ae976bb0839eb0d3180f287f7b1bfcbe6a37ad60e8545278d2565721bca90058',
    after: '101d8d0645f7bf26a400ef06da844549cfec2af9b918fb3c973b4d9241c8b760',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/game-sharing.test.tsx': {
    before: 'be2b5739711ee519658bbe8343471aa89a78b17839ba59e81381c60b60af0d4f',
    after: '1b804dd9b9efee45b978dbce5e8ee173787725f3acbe9d3b76f464b86f8a10b5',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/standalone-immersive.integration.test.tsx': {
    before: '0b99dff1225eec9f0d8cf3e55d577691ac4cefdb35d5f082de666e22b0b8457d',
    after: 'eb5561286268f0004e75f0f528e08a3db5120959cb13105f82aa9b7f283cd27f',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/standalone.integration.test.tsx': {
    before: '22615cf6550ab5fcfde850f447aa3dbae690e040283ee76c1661d58c29b1adb2',
    after: 'd82ceb3fad5e81f1f9fce82eeba48ddee1978d77638ddcc41a971339e5887e0c',
    sources: ['apps/shell-web'],
  },
  'game-build.local.mjs': {
    before: '35a4e394feed1435ae71951b93ff8074fa9f983d3bd5d02e3a03a10f9e03c3f5',
    after: '691d6085bf35d29b9545946ba4772d5a322032dde2e23d834329839d1a86a40b',
    sources: [],
  },
  'pnpm-lock.yaml': {
    before: 'fe6169c2abc5b69726c54856b37c8ac2e3ff30f9e6921127989dbcc908cdbced',
    after: '2614344f65b1483c2997f9e2866c1e2b06d0a385c26fd916341f63ad5f7f4762',
    sources: ['apps/shell-web'],
  },
  'scripts/build-games.test.mjs': {
    before: '43b332f96b95f50bac2a9a67732558ce1ccb7697d918531bbb0a08bcd848c110',
    after: 'd6463b56f8c40eeb9db07caf0a79d83d7013d1e18173af20ace9632b44e697e2',
    sources: [],
  },
  'scripts/check-game-config.test.mjs': {
    before: '290b5b2ec79f9ecaef9b98d1af69bfa8eb55467be86887033116f390932212c9',
    after: '2d74251977f01a2d976a25ddb10e13eda55712438604efefb1f5e45d9bca1441',
    sources: [],
  },
  'scripts/check-workspace-dependencies.mjs': {
    before: '87dd8c0471e7915295fb3a46058f5e7ff41bdbc3ea654aabc800c77cf7fce87c',
    after: '3d61e62cdfa9d03f9969b2149e1971df158a4788b1da68b13ac03ac3e954ecab',
    sources: [],
  },
  'scripts/check-workspace-dependencies.test.mjs': {
    before: '7fce33e5f4e0730311f512038bdfaf292247a2ff4e83a2837b8e5d946b98a00b',
    after: '275c300320f3f0755265af5d739b0624aa818d964509d5aaa85c1a2140af60f4',
    sources: [],
  },
  'scripts/cocos-validation.mjs': {
    before: '7581f6b85ee28c5c1541866a365d848d5d040a0b37d2ba75ecc35c2f5818c919',
    after: '00ac32f5a9b097cb635c472c3158e41d7546678684161f71f653ea89b6285d52',
    sources: [],
  },
  'scripts/cocos-validation.test.mjs': {
    before: '7c1ca66cede7f6935450cc24f2071e87cb6871eafcab258aced65709f3824948',
    after: '4fe529566be2b434b966f742419b626bf8b15825f8d7e26c3eeeda28c89525f3',
    sources: [],
  },
  'scripts/fullscreen-removal-scope.mjs': {
    before: 'b08c792041c1a2cacd6bd160829682952844f30cf901748aaa3cb3843e855168',
    after: '536f7a23372c13ea2fa15f75ce4f54753988a47e009b6f7e862e6267f6ebc4a4',
    sources: [],
  },
  'scripts/h5-ad-config.mjs': {
    before: 'e075f10a3e0f18147f97ef0cef66bf823b5709893c00ad84f219b3259c763c71',
    after: 'b54e752e6b9185ca1cd93c361ce1b1bc366935513799463c6609f561c93cc538',
    sources: [],
  },
  'scripts/h5-game-build.mjs': {
    before: '76034eee6d03fd200211aea469672e7841cd398ed1f757ce8e06fcb369841f22',
    after: '111888f9e86dd9f3b6c707ae6e43dc90ac6b999000a74286b665f2d0351f8f6e',
    sources: [],
  },
  'scripts/h5-taptap-build.mjs': {
    before: 'ea03001d9c693b8b45599dcf52728e8bb3d0289ce307d63c67a04913c5533c33',
    after: 'c7a86b78b7db0518d3a4dc101282655b0c1f1e9dbdd4a7cc369f0412ef7852db',
    sources: [],
  },
  'scripts/h5-taptap-matrix.mjs': {
    before: 'c63d8fef1b9a7ad4219c80a6fe102801820e73c0890e787585bf2ed9200ec9ee',
    after: '18f5ec36f778586facb0cc65110e76d3e0eac7cae5ef5e9782751fe00ff9a0c9',
    sources: [],
  },
  'scripts/h5-taptap-matrix.test.mjs': {
    before: 'e115b48adaf1e727e4208dafdccdb308ede25301d4bde9c5a648580fc8d922ff',
    after: 'b19c72649d171b003c61a24d3772329c525b17d507a5464105348ac8c610a764',
    sources: [],
  },
  'scripts/incremental-validation.test.mjs': {
    before: '8be1eeeb18f1a60c72c115f1df5dbe60ed7d91883aaac074f8a5e1b7c6040cf6',
    after: 'af4a4c3913ddb0a6d204ac77bdfaacfad6d7a0814f558fa39e2a36640f81e94f',
    sources: [],
  },
  'scripts/reuse-cocos-artifacts.mjs': {
    before: 'cba653456b3be4201d46c68ca76219030646e9e0c5b7c86e9f130ff103e85858',
    after: '9bc4931e8fd9b3e63cb8cbd2091f805579588a58ca943581915ddea4bc619560',
    sources: [],
  },
  'scripts/reuse-cocos-artifacts.test.mjs': {
    before: '10f9abc4157fa3e87558c666e206f67a90ec2b8cdfbdcd363b53abda910909a2',
    after: '60767daa24019127aef8cf2d0325b8118090b9520f90f8c368bdce968d9864ed',
    sources: [],
  },
  'scripts/test-game-dev-mode.mjs': {
    before: '7dcb753faff1fbc315a075bf6cd8d768a65a6602820b55d584b0c94777e89524',
    after: '657ba38e4aac440e50314db3194f0ecfac71ba8061410cfd1bb8a2025c33fea2',
    sources: ['games/local/letters-words2', 'games/submodules/xiangqi-five'],
  },
  'scripts/validate-tree.mjs': {
    before: '4efecff555e75de1e46e3c4fc536068288338c00391f5b4137037e1be4b84c10',
    after: 'eba50791f61064dcf897bdcc940ea2f5202b201932db2078aea94ceb7076063a',
    sources: [],
  },
  'scripts/validate-tree.test.mjs': {
    before: '36fdd8abd3ae80e7c4a335ff1f102b95bec453af870c85042001e14184d6f72c',
    after: '2fa35179e1c8198fa953a6da074d2c691bc87eec1580b5e1756fb759f615c690',
    sources: [],
  },
  'scripts/vite-patch-scope.mjs': {
    before: 'f447b4026fb11161df97fd297099ac13c4934301267c463cbbc3e96bec1a18aa',
    after: '0827d55a53a9c65778d6b0cd567b0856d87256862416552bda78667021456eee',
    sources: [],
  },
  'turbo.json': {
    before: 'f4a408d39885a61838d157911a5c0d82a9d95a06a2d7d60c2f4377a3cecbcb9d',
    after: '33c37ca3d37d890b92b56e52d3a4ac9e1c1b5f80ffcbffdc643fb790ebd45cb9',
    sources: [],
  },
});
export const singleGamePagesRetirementBase = '171423331a4bdc0f8d45369b047dbc9e3d971b5c';
export const singleGamePagesRetirementTrees = Object.freeze({
  'games/local/orbit-atelier':
    '040000 tree 8edd94ccfe3ac7f79ce18815d08a0bfb9a7f6917\tgames/local/orbit-atelier\n',
});
export const singleGamePagesRetirementReviews = Object.freeze({
  ...singleGameRetirementReviews,
  '.github/workflows/carding-car.yml': {
    ...singleGameRetirementReviews['.github/workflows/carding-car.yml'],
    before: '156789c9b27107e43481c612fdf0583acd9c2aaecd131202f2adfd39e6a7a9dd',
    sources: ['games/local/ashfall-front'],
  },
  '.github/workflows/ci.yml': {
    ...singleGameRetirementReviews['.github/workflows/ci.yml'],
    before: 'd983ffe34a30e39b8a8d4675197cb73b193ddea9a5adfaac4f95a42ad39926c9',
    sources: ['games/local/ashfall-front'],
  },
  '.github/workflows/mobile.yml': {
    ...singleGameRetirementReviews['.github/workflows/mobile.yml'],
    before: 'a8b816e6b5187cfc42180fbe796a454501b8f81873151f8bf8c8d344e1f1e919',
    sources: ['games/local/ashfall-front'],
  },
  '.github/workflows/pages-validate.yml': {
    ...singleGameRetirementReviews['.github/workflows/pages-validate.yml'],
    before: 'b6d0e2eeb4c64eff7e78305a6a745ddfac86da48fc0f1e40ec84bca51c223f1a',
    sources: ['games/local/ashfall-front'],
  },
  'apps/shell-web/package.json': {
    ...singleGameRetirementReviews['apps/shell-web/package.json'],
    before: '05fd51dc8cd2b738552c71cbe1842d4cb5fac81242b32e152b559565c3415ede',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/pages-smoke.mjs': {
    ...singleGameRetirementReviews['apps/shell-web/scripts/pages-smoke.mjs'],
    before: '34a39129aa775595c21ec6c3e055f98909193beb69102996e8bfaa686a7c4306',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/standalone-game-checks.mjs': {
    ...singleGameRetirementReviews['apps/shell-web/scripts/standalone-game-checks.mjs'],
    before: 'ac6e7418d1f7b3f672287e6847e83729c18770695fecf4abe77ecd76384ee9ec',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/standalone-game-entry.mjs': {
    ...singleGameRetirementReviews['apps/shell-web/scripts/standalone-game-entry.mjs'],
    before: 'd57f4b42bd35848cdf9dd44310d02cc795722e16a23cba656ed63ac62bc0bb4a',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/scripts/standalone-game-entry.test.mjs': {
    ...singleGameRetirementReviews['apps/shell-web/scripts/standalone-game-entry.test.mjs'],
    before: '57fefbc516b1e2e84972d7d183c6a4d514075066d828de6de9ea3b611ce312a1',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/StandaloneGame.tsx': {
    ...singleGameRetirementReviews['apps/shell-web/src/StandaloneGame.tsx'],
    before: '897fc6d95c5cf064b97d4ce671510e37714e25c79ec340e2a86d5af1aae1441c',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/game-assessments.json': {
    ...singleGameRetirementReviews['apps/shell-web/src/game-assessments.json'],
    before: 'f99063d969b5bd5dbe3cd27785ca0497229de8bc0e038d75225a7b41482cd3a3',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/game-meta.json': {
    ...singleGameRetirementReviews['apps/shell-web/src/game-meta.json'],
    before: '4e4298f0f0a4b1dd09f55c6cf3bd0c7f91b665e58e65f909aec56992c4b3c921',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/game-sharing.ts': {
    ...singleGameRetirementReviews['apps/shell-web/src/game-sharing.ts'],
    before: 'c4520e3b01b74d92252af659bb68ed9392d47471c0092b01fbd3de39cfb44523',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/src/standalone-games.json': {
    ...singleGameRetirementReviews['apps/shell-web/src/standalone-games.json'],
    before: '41228efe4f04ba978f09b4580222481d7c35de41b65987a059e612b65fda6d21',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/game-sharing.test.tsx': {
    ...singleGameRetirementReviews['apps/shell-web/tests/game-sharing.test.tsx'],
    before: 'e59c68960d839a18b53549b25b2ecade3aac6d099261a763136a33d05165e095',
    sources: ['apps/shell-web'],
  },
  'apps/shell-web/tests/standalone.integration.test.tsx': {
    ...singleGameRetirementReviews['apps/shell-web/tests/standalone.integration.test.tsx'],
    before: '6ef47c2cc729d2d4e5a05618d6de0ba8044c68ade266e6bb060225f54690724b',
    sources: ['apps/shell-web'],
  },
  'pnpm-lock.yaml': {
    ...singleGameRetirementReviews['pnpm-lock.yaml'],
    before: '8d2f2811eda6b51e0008662e352e27c9c8f5218a0e985d76c62a356caca775c0',
    sources: ['apps/shell-web', 'games/local/ashfall-front', 'games/local/porcelain-puzzle'],
  },
  'scripts/build-games.test.mjs': {
    ...singleGameRetirementReviews['scripts/build-games.test.mjs'],
    before: 'e09827846b666382b30ff3ebaae570dcc08aaa0713a0b40ab443b59592d081a6',
    sources: [],
  },
  'scripts/check-game-config.test.mjs': {
    ...singleGameRetirementReviews['scripts/check-game-config.test.mjs'],
    before: 'd3c973703a9ee73c551fbfab55b84f9b3d5dcac51ee1e1828bef8aac405fd07a',
    sources: [],
  },
  'scripts/check-workspace-dependencies.mjs': {
    ...singleGameRetirementReviews['scripts/check-workspace-dependencies.mjs'],
    before: 'c63ac98faeb1c028193010739f9fbefab6c06e7832d22a0310999786ec12c3de',
    sources: [],
  },
  'scripts/cocos-validation.mjs': {
    ...singleGameRetirementReviews['scripts/cocos-validation.mjs'],
    before: 'df65e6f13eb92aa19d4dc034ce0fa47a81ea53eded61aaa2789a18c921591e47',
    sources: [],
  },
  'scripts/cocos-validation.test.mjs': {
    ...singleGameRetirementReviews['scripts/cocos-validation.test.mjs'],
    before: '2f48fd1f93c5b9dd4192058693bde5276557a5d974767ded18dc9e6af40558c1',
    sources: [],
  },
  'scripts/fullscreen-removal-scope.mjs': {
    ...singleGameRetirementReviews['scripts/fullscreen-removal-scope.mjs'],
    before: null,
    sources: [],
  },
  'scripts/h5-ad-config.mjs': {
    ...singleGameRetirementReviews['scripts/h5-ad-config.mjs'],
    before: 'b0f8cf1c666f01d2a2e5cd0fb1c1de2ab849cb35996369b8270c47312edf950b',
    sources: [],
  },
  'scripts/h5-game-build.mjs': {
    ...singleGameRetirementReviews['scripts/h5-game-build.mjs'],
    before: '8cb6f9c6430c42a01e9b4eae833ca84a61388340ddb3cc4d17e0de49126b0438',
    sources: [],
  },
  'scripts/h5-taptap-build.mjs': {
    ...singleGameRetirementReviews['scripts/h5-taptap-build.mjs'],
    before: '4cdea763a2e71cb31563d887db1d17f1deb0d8f66381cd5ad9d37a140f5130a4',
    sources: [],
  },
  'scripts/h5-taptap-matrix.mjs': {
    ...singleGameRetirementReviews['scripts/h5-taptap-matrix.mjs'],
    before: '67e0c2510a16af1656606920a5b2bb323d5b38e84dabc668f0a017f5d6ffac3a',
    sources: [],
  },
  'scripts/h5-taptap-matrix.test.mjs': {
    ...singleGameRetirementReviews['scripts/h5-taptap-matrix.test.mjs'],
    before: '6fe5a1d627474b3cf619f24e4de21b3d92cac2eb2dec129ea85dfd82dc0c2dd6',
    sources: [],
  },
  'scripts/reuse-cocos-artifacts.mjs': {
    ...singleGameRetirementReviews['scripts/reuse-cocos-artifacts.mjs'],
    before: '7fd0d6fd7527127a2b32421c7b85b384e6818bd5edb321b8fbfa7d58d7e18f41',
    sources: [],
  },
  'scripts/reuse-cocos-artifacts.test.mjs': {
    ...singleGameRetirementReviews['scripts/reuse-cocos-artifacts.test.mjs'],
    before: 'ffac04bcbe08b0b0ba5da93ce0e9516cfc573d51ebf965f4d7d39f7aa3777a92',
    sources: [],
  },
  'scripts/test-game-dev-mode.mjs': {
    ...singleGameRetirementReviews['scripts/test-game-dev-mode.mjs'],
    before: 'f911bb11751f1ade391613a622fcd915ec8a19f737f7d7eadd6acd708b08027b',
    sources: [
      'games/local/letters-words2',
      'games/submodules/xiangqi-five',
      'games/local/porcelain-puzzle',
    ],
  },
  'scripts/validate-tree.mjs': {
    ...singleGameRetirementReviews['scripts/validate-tree.mjs'],
    before: '337b204edf32844bf2affdf5a95c73a5cf52626fc64366897bcaac2a7503cf7f',
    sources: [],
  },
  'scripts/validate-tree.test.mjs': {
    ...singleGameRetirementReviews['scripts/validate-tree.test.mjs'],
    before: 'd4ab2a4c56bb104e11276ecfc45c2f896b63076f8dbf03fbe7e79cf85d29aaea',
    sources: [],
  },
  'turbo.json': {
    ...singleGameRetirementReviews['turbo.json'],
    before: '2939bab45107ebb53888d6f5a0a77420f2e05551bf464a91e4c8fef7c79d7c3a',
    sources: ['games/local/ashfall-front'],
  },
});
// Git pairs similar Creator templates with new surviving files; only these exact pairs are reviewed.
export const singleGamePagesRetirementMoves = Object.freeze({
  'games/local/orbit-atelier/assets/resources.meta': {
    to: 'games/local/ashfall-front/assets/resources.meta',
    status: 'R063',
    beforeEntry:
      '100644 blob c79c4f3f9eb284ad339706e92f0348cfc7846002\tgames/local/orbit-atelier/assets/resources.meta\n',
    afterEntry:
      '100644 blob e9b3a21b7b5cc1f659babafd7b01bc3ce1aa9748\tgames/local/ashfall-front/assets/resources.meta\n',
  },
  'games/local/orbit-atelier/assets/scripts/core.meta': {
    to: 'games/local/ashfall-front/assets/resources/art.meta',
    status: 'R070',
    beforeEntry:
      '100644 blob eb3d7961c6535415f1702a05d82ef67588e812a6\tgames/local/orbit-atelier/assets/scripts/core.meta\n',
    afterEntry:
      '100644 blob 35a1fe62af95d781b7ccdc7f1379ca8afc30e331\tgames/local/ashfall-front/assets/resources/art.meta\n',
  },
  'games/local/orbit-atelier/assets/resources/armillary.png.meta': {
    to: 'games/local/ashfall-front/assets/resources/art/barrel.png.meta',
    status: 'R064',
    beforeEntry:
      '100644 blob d9486863b1b50de7561bf9a2ba4f961dec4f2d80\tgames/local/orbit-atelier/assets/resources/armillary.png.meta\n',
    afterEntry:
      '100644 blob 47e041c0e799678e698efbe66a4621e07542d84e\tgames/local/ashfall-front/assets/resources/art/barrel.png.meta\n',
  },
  'games/local/orbit-atelier/assets/resources/audio/turn.wav.meta': {
    to: 'games/local/ashfall-front/assets/resources/checkpoint.wav.meta',
    status: 'R077',
    beforeEntry:
      '100644 blob 7ef5390b03f8db85317eadeae46769edeef7e45e\tgames/local/orbit-atelier/assets/resources/audio/turn.wav.meta\n',
    afterEntry:
      '100644 blob 8da9d82d7465703dcbcaeb0b151d174a387a634b\tgames/local/ashfall-front/assets/resources/checkpoint.wav.meta\n',
  },
  'games/local/orbit-atelier/assets/resources/audio/complete.wav.meta': {
    to: 'games/local/ashfall-front/assets/resources/explode.wav.meta',
    status: 'R077',
    beforeEntry:
      '100644 blob e7459c0a3498beb287e54685750158c3fac32217\tgames/local/orbit-atelier/assets/resources/audio/complete.wav.meta\n',
    afterEntry:
      '100644 blob 8d76afee33985c4eae5f7cf18c0e0eb211890ef0\tgames/local/ashfall-front/assets/resources/explode.wav.meta\n',
  },
  'games/local/orbit-atelier/assets/resources/audio/release.wav.meta': {
    to: 'games/local/ashfall-front/assets/resources/hit.wav.meta',
    status: 'R077',
    beforeEntry:
      '100644 blob b804e277f1915ba3d07e55ccb18a6b7374edce6a\tgames/local/orbit-atelier/assets/resources/audio/release.wav.meta\n',
    afterEntry:
      '100644 blob 0c451328f637caf7b939b83009f1ae7baefb1344\tgames/local/ashfall-front/assets/resources/hit.wav.meta\n',
  },
  'games/local/orbit-atelier/assets/scenes.meta': {
    to: 'games/local/ashfall-front/assets/scenes.meta',
    status: 'R070',
    beforeEntry:
      '100644 blob d07728d7789d3a265df11133d6b0eb4fd9f5e320\tgames/local/orbit-atelier/assets/scenes.meta\n',
    afterEntry:
      '100644 blob c8fb70d80ed3a5715acf23147a5f0469e9e23b0b\tgames/local/ashfall-front/assets/scenes.meta\n',
  },
  'games/local/orbit-atelier/assets/scenes/main.scene': {
    to: 'games/local/ashfall-front/assets/scenes/main.scene',
    status: 'R087',
    beforeEntry:
      '100644 blob 487eb1f3222dd9f3d87ab2cf8b3cee82a4298723\tgames/local/orbit-atelier/assets/scenes/main.scene\n',
    afterEntry:
      '100644 blob 4f41fb233d4f713064c3f93b7363b4b479a61a30\tgames/local/ashfall-front/assets/scenes/main.scene\n',
  },
  'games/local/orbit-atelier/assets/scenes/main.scene.meta': {
    to: 'games/local/ashfall-front/assets/scenes/main.scene.meta',
    status: 'R072',
    beforeEntry:
      '100644 blob 01653c5b8902279c5dc07febd47d91ad636b91c8\tgames/local/orbit-atelier/assets/scenes/main.scene.meta\n',
    afterEntry:
      '100644 blob 981bc91ceecb206afddaf51645e02565f4f05ed8\tgames/local/ashfall-front/assets/scenes/main.scene.meta\n',
  },
  'games/local/orbit-atelier/assets/scripts.meta': {
    to: 'games/local/ashfall-front/assets/scripts.meta',
    status: 'R070',
    beforeEntry:
      '100644 blob e1b4a4f1fe84cf039e3dbc4beef08d08a419e16b\tgames/local/orbit-atelier/assets/scripts.meta\n',
    afterEntry:
      '100644 blob 52654dc8ed5cf341f1095bed819d1e679d1eadf1\tgames/local/ashfall-front/assets/scripts.meta\n',
  },
  'games/local/orbit-atelier/assets/scripts/OrbitAtelier.ts.meta': {
    to: 'games/local/ashfall-front/assets/scripts/Ashfall.ts.meta',
    status: 'R070',
    beforeEntry:
      '100644 blob bc2921e8bce191a1e8bd964aff62e955a29d3e22\tgames/local/orbit-atelier/assets/scripts/OrbitAtelier.ts.meta\n',
    afterEntry:
      '100644 blob 4c9e99d63c5de5015d77a6768e86b7cd998a31fe\tgames/local/ashfall-front/assets/scripts/Ashfall.ts.meta\n',
  },
  'games/local/orbit-atelier/assets/scripts/core/catalog.ts.meta': {
    to: 'games/local/ashfall-front/assets/scripts/FrontView.ts.meta',
    status: 'R070',
    beforeEntry:
      '100644 blob 583609f9a941f4fdb4f3337e553ea0c621d75ae1\tgames/local/orbit-atelier/assets/scripts/core/catalog.ts.meta\n',
    afterEntry:
      '100644 blob 91a4ba84b7113660f8f73f743338a8f7c950b7d4\tgames/local/ashfall-front/assets/scripts/FrontView.ts.meta\n',
  },
  'games/local/orbit-atelier/scripts/artifact.mjs': {
    to: 'games/local/ashfall-front/scripts/artifact.mjs',
    status: 'R066',
    beforeEntry:
      '100644 blob e89b910ba9359eec24d71e955f62d52fa108c8c2\tgames/local/orbit-atelier/scripts/artifact.mjs\n',
    afterEntry:
      '100644 blob a86fb4b601bebb477a4418207d3a9a70796a9d27\tgames/local/ashfall-front/scripts/artifact.mjs\n',
  },
  'games/local/orbit-atelier/dev-mode.d.ts': {
    to: 'games/local/ashfall-front/scripts/dev-mode.d.ts',
    status: 'R100',
    beforeEntry:
      '100644 blob 19ecd63375b8c703a717e650860e303b67af3ab5\tgames/local/orbit-atelier/dev-mode.d.ts\n',
    afterEntry:
      '100644 blob 19ecd63375b8c703a717e650860e303b67af3ab5\tgames/local/ashfall-front/scripts/dev-mode.d.ts\n',
  },
  'games/local/orbit-atelier/scripts/dev-mode.js': {
    to: 'games/local/ashfall-front/scripts/dev-mode.js',
    status: 'R099',
    beforeEntry:
      '100644 blob b184ed2ed1f23f612143491235bbfe348c42e627\tgames/local/orbit-atelier/scripts/dev-mode.js\n',
    afterEntry:
      '100644 blob 149c2470bb0be0226b8604a4a9faae52ebf6c8cb\tgames/local/ashfall-front/scripts/dev-mode.js\n',
  },
  'games/local/orbit-atelier/scripts/serve.mjs': {
    to: 'games/local/ashfall-front/scripts/serve.mjs',
    status: 'R079',
    beforeEntry:
      '100644 blob 4953fdac6698c76edb1cdc51b9168a1f5d23ced3\tgames/local/orbit-atelier/scripts/serve.mjs\n',
    afterEntry:
      '100644 blob 614a7fc40f5b27b5a12e013c1eae3dc7b8bff14e\tgames/local/ashfall-front/scripts/serve.mjs\n',
  },
  'games/local/orbit-atelier/scripts/typecheck.mjs': {
    to: 'games/local/ashfall-front/scripts/typecheck.mjs',
    status: 'R090',
    beforeEntry:
      '100644 blob 3f4ea1acb2109e17dcf4372d3f4a169e6b3d0c54\tgames/local/orbit-atelier/scripts/typecheck.mjs\n',
    afterEntry:
      '100644 blob d27efcd9cf7eb32e1ecf2320c654b4a47ad2c83b\tgames/local/ashfall-front/scripts/typecheck.mjs\n',
  },
  'games/local/orbit-atelier/settings/v2/packages/builder.json': {
    to: 'games/local/ashfall-front/settings/v2/packages/builder.json',
    status: 'R100',
    beforeEntry:
      '100644 blob 7526e4073d3807dd595fdebf9732cc79d3c3a108\tgames/local/orbit-atelier/settings/v2/packages/builder.json\n',
    afterEntry:
      '100644 blob 7526e4073d3807dd595fdebf9732cc79d3c3a108\tgames/local/ashfall-front/settings/v2/packages/builder.json\n',
  },
  'games/local/orbit-atelier/settings/v2/packages/device.json': {
    to: 'games/local/ashfall-front/settings/v2/packages/device.json',
    status: 'R100',
    beforeEntry:
      '100644 blob 70e599e6c94711f84807c353d7bda58c61472ec9\tgames/local/orbit-atelier/settings/v2/packages/device.json\n',
    afterEntry:
      '100644 blob 70e599e6c94711f84807c353d7bda58c61472ec9\tgames/local/ashfall-front/settings/v2/packages/device.json\n',
  },
  'games/local/orbit-atelier/settings/v2/packages/engine.json': {
    to: 'games/local/ashfall-front/settings/v2/packages/engine.json',
    status: 'R079',
    beforeEntry:
      '100644 blob 0a993947fb4e0e7c6152f7516a9647e91d8c399e\tgames/local/orbit-atelier/settings/v2/packages/engine.json\n',
    afterEntry:
      '100644 blob ba8210d8db4be0511a3e20d14a4a79b104f4631f\tgames/local/ashfall-front/settings/v2/packages/engine.json\n',
  },
  'games/local/orbit-atelier/settings/v2/packages/information.json': {
    to: 'games/local/ashfall-front/settings/v2/packages/information.json',
    status: 'R100',
    beforeEntry:
      '100644 blob 94848dec1f2251d4ff16bbd83b42c3ec773f835d\tgames/local/orbit-atelier/settings/v2/packages/information.json\n',
    afterEntry:
      '100644 blob 94848dec1f2251d4ff16bbd83b42c3ec773f835d\tgames/local/ashfall-front/settings/v2/packages/information.json\n',
  },
  'games/local/orbit-atelier/settings/v2/packages/program.json': {
    to: 'games/local/ashfall-front/settings/v2/packages/program.json',
    status: 'R100',
    beforeEntry:
      '100644 blob 916c1b2018a771c2006a05ebd438649652a46940\tgames/local/orbit-atelier/settings/v2/packages/program.json\n',
    afterEntry:
      '100644 blob 916c1b2018a771c2006a05ebd438649652a46940\tgames/local/ashfall-front/settings/v2/packages/program.json\n',
  },
  'games/local/orbit-atelier/tsconfig.json': {
    to: 'games/local/ashfall-front/tsconfig.json',
    status: 'R066',
    beforeEntry:
      '100644 blob 41e0cfb3d4b5a8fe7ba72623a274e3db6b476ec5\tgames/local/orbit-atelier/tsconfig.json\n',
    afterEntry:
      '100644 blob 53907692bbdb82d1eabb8eb378e65f9a0ee1d9a7\tgames/local/ashfall-front/tsconfig.json\n',
  },
  'games/local/orbit-atelier/assets/resources/audio.meta': {
    to: 'games/local/night-overwatch/assets/resources/ui.meta',
    status: 'R070',
    beforeEntry:
      '100644 blob 71d9112a2b36bba3d40f8e6436adf6f1e041b9b3\tgames/local/orbit-atelier/assets/resources/audio.meta\n',
    afterEntry:
      '100644 blob 1afab5667438839f0f196373ab7eee7cdf717743\tgames/local/night-overwatch/assets/resources/ui.meta\n',
  },
  'games/local/orbit-atelier/assets/resources/atelier.jpg.meta': {
    to: 'games/local/night-overwatch/assets/resources/ui/home.png.meta',
    status: 'R062',
    beforeEntry:
      '100644 blob 2a84ddaaf18f4ace7ce54a8fc896348c6c21f528\tgames/local/orbit-atelier/assets/resources/atelier.jpg.meta\n',
    afterEntry:
      '100644 blob c9dd5cb20a8654e0e91d553d8e75388b8e567290\tgames/local/night-overwatch/assets/resources/ui/home.png.meta\n',
  },
  'games/local/orbit-atelier/scripts/dev-mode.d.ts': {
    to: 'games/local/porcelain-puzzle/dev-mode.d.ts',
    status: 'R100',
    beforeEntry:
      '100644 blob 19ecd63375b8c703a717e650860e303b67af3ab5\tgames/local/orbit-atelier/scripts/dev-mode.d.ts\n',
    afterEntry:
      '100644 blob 19ecd63375b8c703a717e650860e303b67af3ab5\tgames/local/porcelain-puzzle/dev-mode.d.ts\n',
  },
  'games/local/orbit-atelier/dev-mode.js': {
    to: 'games/local/porcelain-puzzle/dev-mode.js',
    status: 'R099',
    beforeEntry:
      '100644 blob b184ed2ed1f23f612143491235bbfe348c42e627\tgames/local/orbit-atelier/dev-mode.js\n',
    afterEntry:
      '100644 blob 149c2470bb0be0226b8604a4a9faae52ebf6c8cb\tgames/local/porcelain-puzzle/dev-mode.js\n',
  },
});
