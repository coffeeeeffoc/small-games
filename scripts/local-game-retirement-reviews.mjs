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
    after: 'e371ed08f55ad834cadc5254261c5a683bfc134dbd2365d0701e0e057a665e35',
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
