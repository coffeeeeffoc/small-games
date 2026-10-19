import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const registry = 'apps/shell-web/src/standalone-games.json';
const metadata = 'apps/shell-web/src/game-meta.json';
const shell = 'apps/shell-web/package.json';
const retiredSource = 'games/submodules/office-slacking';
const nativeSource = 'games/minigames';
const h5Sources = Object.freeze({
  'cops-robbers': 'games/local/cops-robbers',
  'cops-robbers-realtime': 'games/local/cops-robbers-realtime',
  'xiangqi-five': 'games/submodules/xiangqi-five',
});

// Edits bind exact base/head UTF-8 bytes. Deletions bind the exact base
// ls-tree record (mode, Git object ID, path), including binary assets and gitlinks.
// A null head means deletion; a successful HEAD tree query must prove absence.
// The office gitlink preimage is its raw `git ls-tree` record, including LF.
// Only exact reviewed additions/deletions may compose a relocation; unknown
// paths, unreviewed bytes and other renames receive no retirement proof.
export const retirementFileReviews = Object.freeze({
  '.github/workflows/ci.yml': {
    before: '36d82cd54b6a004616feae0cbf646997ddc6f179ae5627e2d2703fbb410a561e',
    after: '7dc23c17a7b8180c0abc4eb5869b872d41e466a755da9757cae56235bcd2bf12',
  },
  '.github/workflows/cocos-minigames.yml': {
    before: 'd06d323384f5cc011f4c20439f8d2c0ef5812ffd63d623add12f8b87e5159bc3',
    after: null,
  },
  '.github/workflows/pages.yml': {
    before: '692cd678a338862699215dccb1bddb6c4478d4f6d5ca310f6579931e62ded34c',
    after: '013b6713eab6344a5ec2d77ff88542c825874c1888eb6b1b1f3dcf5c9010989e',
  },
  '.gitmodules': {
    before: '15c2faa3488d8504083db3560cb4e7bd580ecdf362458566687c277961ec8cd6',
    after: 'fd6fee180db917e510df608c4620ee5227aea7d85fc54473a677b5bc2e1cfdfd',
  },
  'README.md': {
    before: '97d38704154391539bdfeef8e81931b8d3793ce818231222085c93d4c5bb139f',
    after: '10302b2e600076f3f954e5b63b0547aaf41d59385e3d453252752654f4ca461a',
  },
  'apps/shell-minigame/.env.example': {
    before: 'b64b8bf1861235113872714f54b88372487607167c54f3093a617ef77ddfe8df',
    after: 'f0df0047ef1a3776c326ddd4d53568b91d0e049d134717bfdf548a979b13dff6',
  },
  'apps/shell-minigame/scripts/nine-games-build.test.mjs': {
    before: '94d522ad68fb9a1f3a84af0030a27acbc2cfd90a0b18b0a6acb1512be0865402',
    after: '3ef0ea2eafb5a948637e91ef2c02533343fefc3dcf02b30b9770184f736a9205',
  },
  'apps/shell-minigame/scripts/nine-games-targets.mjs': {
    before: '34a1647faded832e8040d87250327d860a58a848d73c7724b69ae8ef4c22d070',
    after: '091d1b50f82a502bdd30a07632b3dbffe02e16eb3dc6c709e8f7959a2fbb9f03',
  },
  'apps/shell-minigame/scripts/taptap-build.test.mjs': {
    before: '5243fd88d0b05b34ee14b0f5de3d2b0f755ccfbfea20da94650d7f4d064e7857',
    after: '1df26cfbe958f8cd895ae4d53cc5bce9d8e5bfcf72b0bd908d64fb69b791bf35',
  },
  'apps/shell-minigame/scripts/taptap-smoke.mjs': {
    before: '55f4fb9ed508cdd78444fca846888fa65d50c3b854b20434734f265adcab93f7',
    after: 'a56f22f25863e9e2b8f3aafece132a334e322c396ad92ba8a6652f5961f6b9dc',
  },
  'apps/shell-minigame/scripts/taptap-smoke.test.mjs': {
    before: 'a0d6c7de63b1452fc05033ef5768e5ad57313d5142cc06ce67f5aa707d06a31c',
    after: '6e442ed97e436b5c350f853f5f78b502c818f6f8a79eae0ead4346246ce1f68a',
  },
  'apps/shell-minigame/scripts/taptap-targets.mjs': {
    before: 'bd8b97bbc9fab7355248b260aad5c76022c81356521c15a6d2c699180277a44a',
    after: '57ece5380b6825adbef80fc72ec4541b5648ecc6328852799f6a8cca65812ed1',
  },
  'apps/shell-web/package.json': {
    before: '3a392aea6931ff91a553294d377fdaf2dcaabb566ae253ed6c6c94a1ebfe0ac5',
    after: 'bb21e2eafd28ca91922f7e6cd42916a7b8c69929934c06556f93476c0b4d0bdd',
  },
  'apps/shell-web/scripts/catalog-rollout-smoke.mjs': {
    before: '9eb2cdecfb6e281b7c917940acc319af8cc837b649db97dd6e2d5792738bd0ac',
    after: '8c960e90de3bb937d03a933b1ea6c6822548c5045e1b22935b4fdbed3302f86c',
  },
  'apps/shell-web/scripts/standalone-game-checks.mjs': {
    before: '656827c724acac06e7bf2ea48cd6d914e3e36c7ca3d97c6ae935250cff6c0169',
    after: 'aa04f7c7d71a844b97aa52ccd3a5c0f81052b95f17d90ea5812b485e61d2b47e',
  },
  'apps/shell-web/scripts/standalone-game-entry.mjs': {
    before: '0cb4de8c8cc162b5961bb7f11bd20497b29656bb2048b6b696d1e0d8dd376515',
    after: 'e1a6bc99d979eaa7d45e6d3f781502999079c13dfc23ac7cd70b7d98a3a7b44d',
  },
  'apps/shell-web/src/game-assessments.json': {
    before: '9dc5c48871132cf915f5c3f855172204dc105c1b79c82d938b8c424b8b517784',
    after: '61fbe0912c556b2f5b544d3a92e5ac087c9d8fcd421e6ba50173e2158676048c',
  },
  'apps/shell-web/src/game-meta.json': {
    before: '4f336b9a4aa90b3d1e03809023f68ca9e01bf3eb849c010a659c338462473766',
    after: '6b22589def2a349182e2e1dad19b9a8e5abc0564fdc0aed54cc7bb743ef340d8',
  },
  'apps/shell-web/src/standalone-games.json': {
    before: '9f8faed32f241a637337d094b0e40237ccbb3bac9bcddfe5d6f22b6b725ffe0e',
    after: '0b0ddec4114d335ba88fb95ba74f0624c8e1e299611d742869405e83020894fa',
  },
  'apps/shell-web/tests/catalog-assessments.test.ts': {
    before: '447b5ccb4c722cc869dd5228ef3412b3c88a190d61b1816846462c6a0b6f4612',
    after: '883e20d1d217f306e6ffb8f8960e1540653715467409ca8440eff7ab9e11cf4b',
  },
  'apps/shell-web/tests/catalog-filters.integration.test.tsx': {
    before: '0e1ba13252078c20452f4db370e070de0dfaa8512b8f523ca172fd5988f22719',
    after: '103d5a6be897c107b18ac438e893fdb583fb872684f28dc3ddad770b8d3e39f1',
  },
  'docs/adr/0009-independent-game-submodules.md': {
    before: 'baa22e9b92c6c98ef3843686f433b50b39b590d1a4e8b255782eab34e9155c0b',
    after: '69c1282bf5359b4a9b734bb02bc4c9aa1cd5d1dae6171cd9aa79913d5c4ed549',
  },
  'docs/deployment/native-target-validation.md': {
    before: '6b584506674690d0b467749eee4b6dc2f34701168a977a1684c59b52a9bfaef7',
    after: 'dfddbe220698cbcb95a1860d160b9c70e985f7e5a309958e6f0a049bea832bea',
  },
  'docs/deployment/nine-games-platform-status.md': {
    before: 'b2a5081a794c8c00ee1eb60408873d801674b13c5fd47b9c1a0242283e26f163',
    after: '7c92a51e4d66b1184d9146a7782a2b6675071edf5b857968e2f986fba0e70916',
  },
  'docs/games.md': {
    before: 'e4a2cfa7ff1228cee2258071d2a983ac3e65e5a4da56f7faca1043e63b770bb2',
    after: '6b8a99711d89e0100d88bb3be3a9b2c8ec8e66503f759ad5d93aac7535d617b5',
  },
  'docs/operations/competition-service.md': {
    before: '08138b1338a375a2398c28c84ca6658a365884443a372a2615208e5832a74051',
    after: '9240cbfb9118b9ac1576a488e5f696ed79576ab547ff31f4dada9355e7e3ffe2',
  },
  'docs/operations/game-builds.md': {
    before: '8cdb2f7c978ad0b5f122aa7fd2c9e7dc89c5e17f5225ff03eb9202d5d9bed27f',
    after: 'fc7769a6486564f17a2894a4462c07609f052be4c957b6a921e3566bcbabb47e',
  },
  'docs/operations/incremental-publication.md': {
    before: 'ffc43481a1e0685983b02e392884081b1b42bc5404b2e368ca505d241fe3dd0e',
    after: '8d5310739a0e0e5a8c65a206a64f16150caddce5db69c6d7819f661f333ae910',
  },
  'docs/operations/pnpm-12-migration.md': {
    before: '8a90ead64c94864568fcd5a03f7d40f75734c05904676c2481430444d5a71bbb',
    after: 'ed6c11f1274609b0c7a67589903870b4e419e7cda413b5a998ea637159c52b1e',
  },
  'docs/operations/taptap-rewarded-ads.md': {
    before: '924c6beb5eb34e8d9720ccf5b640f2c5c678cb8879694d27e2802f5f87d04455',
    after: '7e16a7173563c7b5dbbc44aa25d75da9b38ab769c00c819e17745b0999d22e6d',
  },
  'docs/plans/2026-10-11-game-portfolio-assessment.md': {
    before: '8f5255b657c9122b9259690014c6b34191d8ef534a4acc2f00881df3d798d223',
    after: '37b0805a4f3efc12ee1f49920bf410ecc20392a46b0cd3aeacdf4c0aec2d7b0b',
  },
  'docs/plans/2026-10-19-unified-game-builds.md': {
    before: '28c76494d056878692687cc3f68d9f9465d4329217a0d370c2f955c5fb6cf69a',
    after: 'c592aa9996f420290d9ed4eac038194245b94aca65ed396d8479c82f90365396',
  },
  'docs/standalone-games.md': {
    before: '0126ec4fc5a3304328e3be70bac37f3aeee40a4f5a76e3d39f5747d60898d029',
    after: '3dbcbac7862b1e3c4c6559c22188b268470e1c80791b6fa22397f9137331186c',
  },
  'game-build.local.mjs': {
    before: 'cad72019e1f9302ff609871d1b852d47d1097add3030ad4b22a5f66d0f44d24e',
    after: '158a369a4c4e588fefe31535007e81ccc89841415abbe57fb8ea2e074bf40daf',
  },
  'games/local/cops-robbers-realtime/README.md': {
    before: '213d19fdde8a289f96c1cfb32db2cd619b39c0edcfa79c25f5140c4500fc8816',
    after: '30cfdf1312257c37eb2893cc990228d385c7a3c00d7919939927450d01b86155',
  },
  'games/local/cops-robbers-realtime/docs/README.md': {
    before: '909461aee97cbb7e00646cc77625e2183e1d838b467187e2f892c4690b472603',
    after: 'be98f16c60211eb84934aa69679189d058346123a374f8a27f8a75e5d4cb85a4',
  },
  'games/local/cops-robbers-realtime/docs/design/mobile-2026-10-05/verification.md': {
    before: '508fd5aa4823cbd7e7967b93168ed64258028b2f2a1e23a78d1970e80b6708e6',
    after: '03e7dc6bee037a3d79168236793b2f3e94f244815ad7388cb020cbcb76d9aeeb',
  },
  'games/local/cops-robbers-realtime/docs/design/native-2026-10-06/VALIDATION.md': {
    before: '9cb0ad19f1ff4eaf27fd9773839e31064436fb520078d590acdec75f6cf35bed',
    after: null,
  },
  'games/local/cops-robbers-realtime/docs/design/native-2026-10-06/actual-help-667.png': {
    before: '62483f4031eaaf05a77f418c61598f7fbb85ad29da04219358099cae9792a608',
    after: null,
  },
  'games/local/cops-robbers-realtime/docs/design/native-2026-10-06/actual-help-844.png': {
    before: '9da3e1fe7b474f30843774ce0252cc8217e492b84e5a4b0eb7a2d66c73119e45',
    after: null,
  },
  'games/local/cops-robbers-realtime/docs/design/native-2026-10-06/actual-help-932.png': {
    before: '43aef6925f73fb8e9c9b548f58ce5f3ddb286ae6e773bb4f9e652705b917c885',
    after: null,
  },
  'games/local/cops-robbers-realtime/docs/design/native-2026-10-06/actual-home-667.png': {
    before: '497b119e19915ab9e57389283ea91b22f0b04aed9a50eba65b562ed80b5777d9',
    after: null,
  },
  'games/local/cops-robbers-realtime/docs/design/native-2026-10-06/actual-home-844.png': {
    before: 'dcd37a2657ba38b179eb0ea402e9edf8c43d25ac2a3b7dddc6ff6e55887fb353',
    after: null,
  },
  'games/local/cops-robbers-realtime/docs/design/native-2026-10-06/actual-home-932.png': {
    before: '44ec82b7e5bab7c168eb4e670bf712f058c9f577d3e70c0a3a97fb3f9d8e624c',
    after: null,
  },
  'games/local/cops-robbers-realtime/docs/design/native-2026-10-06/actual-levels-667.png': {
    before: '4385542b152c6be5b63939627d7613e9cd91ba3a752315276a8ba632fbd85654',
    after: null,
  },
  'games/local/cops-robbers-realtime/docs/design/native-2026-10-06/actual-levels-844.png': {
    before: '1414f8bf0dcabe48a68efbae3ca84887e7b6eb0a99642e4aaa1a7ea595266719',
    after: null,
  },
  'games/local/cops-robbers-realtime/docs/design/native-2026-10-06/actual-levels-932.png': {
    before: '8091d3e8abdb0ca4e66b2bc2650672fe924b5d857865a874a2ac73917b1b0514',
    after: null,
  },
  'games/local/cops-robbers-realtime/docs/design/native-2026-10-06/actual-pause-667.png': {
    before: '44838b3a2403e1127a76aa4a442adda14ae51732f0d31f97b0a96c10be38c8e3',
    after: null,
  },
  'games/local/cops-robbers-realtime/docs/design/native-2026-10-06/actual-pause-844.png': {
    before: 'b9cf5fc4657a910a133d0d01442be3796c24e94400d34a0e9fd86b0f35d35f11',
    after: null,
  },
  'games/local/cops-robbers-realtime/docs/design/native-2026-10-06/actual-pause-932.png': {
    before: 'f11ee7a68ccf61793f8a8de88deb004d01d573f241c9f66d29ded2c2c9d60091',
    after: null,
  },
  'games/local/cops-robbers-realtime/docs/design/native-2026-10-06/actual-play-667.png': {
    before: 'd383bcc5648a6237af14212e42a1354afae02a481f42da6c6eef347aafe7218c',
    after: null,
  },
  'games/local/cops-robbers-realtime/docs/design/native-2026-10-06/actual-play-844.png': {
    before: 'c582a49d4b16a9bac9af300dfe2c6d339037b0eef8191caa40cca663f1a33298',
    after: null,
  },
  'games/local/cops-robbers-realtime/docs/design/native-2026-10-06/actual-play-932.png': {
    before: '1411b2f1ff5c8e080b23b7e3cb8f6d0a0f4f837b608ab44eab5bed95b3426c51',
    after: null,
  },
  'games/local/cops-robbers-realtime/docs/design/native-2026-10-06/bilibili-entry-actual.png': {
    before: '1a0168e98f81a1a39b6aa1a15883d5ce7d9ba597e701488bdfec9aec290d4882',
    after: null,
  },
  'games/local/cops-robbers-realtime/docs/design/native-2026-10-06/bilibili-entry-concept.svg': {
    before: 'b361c6178215ba94e9ca3f1e0c901ed35bc55e00a3c4a5c2b44a4b6798898323',
    after: null,
  },
  'games/local/cops-robbers-realtime/package.json': {
    before: 'c03cf4fa4f908c349025bebe3c4e752d0bacc8323c81f09b1353ffe70c1213f1',
    after: '6aed647829b0f8426e640cdc51cd5c5abaf76d582d0b467d3d96de3502f8487f',
  },
  'games/local/cops-robbers-realtime/scripts/native-input-browser.mjs': {
    before: 'e6092e6c0e3b525a4322e103b95ec337daa499de7a8af889aac3ddd93d47de88',
    after: null,
  },
  'games/local/cops-robbers-realtime/src/assets/characters-native.webp': {
    before: '418cefcb2ddcfd3018f6806bfb216a831afd6055f46b20ac2b7de1d410ca55d6',
    after: null,
  },
  'games/local/cops-robbers-realtime/src/native.js': {
    before: '7a96e8f42c2256ecaac9dadadeda1ba80af44cf70b51766dedcfea0de2b51360',
    after: null,
  },
  'games/local/cops-robbers-realtime/src/tap-save.js': {
    before: 'ce79118e38dccbcc5cbf86413c6f80528c3f509f48fbb203f7f0831bb6e44835',
    after: '2d664c73c797fa4290d8179d0b7098debcc58abf9fd2e04faa0d48f29b4129d3',
  },
  'games/local/cops-robbers-realtime/tests/native-input.test.mjs': {
    before: '279b4f769248a8db6065fcf8455401ae72b1a4df63e8c34c7dd2abcddfeccf81',
    after: null,
  },
  'games/local/cops-robbers/README.md': {
    before: '1932cfb90e65fca24ba6e120cbf977640dd6b08d46d203d64ce97ba851cfbab3',
    after: '73926cc9ba44f60fef5f644663856aee0bace24e50dad9bafbc07ee5f6e31513',
  },
  'games/local/cops-robbers/docs/README.md': {
    before: 'feace324e39423caabdf7205c7ebf526b42170ca8f842dc417ac0560f6b3d484',
    after: '05e7ad749ed108aeb5b166e55b14fa64f3dd254540524a6df1ae0dafeb3c1785',
  },
  'games/local/cops-robbers/docs/design/native-2026-10-06/bilibili-entry-actual.png': {
    before: 'a05570a7bcc1a0809cde752fc8603e3ed606a2c022bacf02281401741c8616b5',
    after: null,
  },
  'games/local/cops-robbers/docs/design/native-2026-10-06/bilibili-entry-concept.svg': {
    before: '18c23a33ed1df86feca828db7fcd8ffee8868c02368b35ffac09af57e272cd7c',
    after: null,
  },
  'games/local/cops-robbers/docs/design/native-2026-10-06/design.md': {
    before: '9062cfb2b3cd9a8d575671d329bc1aa6e3d7ff9def07b355a1db896eac2ac964',
    after: null,
  },
  'games/local/cops-robbers/docs/design/native-2026-10-06/help-actual-320.png': {
    before: '0a5a9ea2db46c2995e8c19a254bd67efe163ce014fa184dc12d6fddadad6d8b7',
    after: null,
  },
  'games/local/cops-robbers/docs/design/native-2026-10-06/help-actual-390.png': {
    before: '9d6343c3ccd1f848c0bb2cf8d0a66f3941ebf93c54bd29975dd85031512bb2ca',
    after: null,
  },
  'games/local/cops-robbers/docs/design/native-2026-10-06/help-actual-430.png': {
    before: 'db6d4e5c2bc3376eeed9be982bce1464d528205508770461ff30976654c694e4',
    after: null,
  },
  'games/local/cops-robbers/docs/design/native-2026-10-06/home-actual-320.png': {
    before: '2bc5c423a5f266c9d2381693e163f3d8dfa0b4fc16554bee3af87e88d0acc670',
    after: null,
  },
  'games/local/cops-robbers/docs/design/native-2026-10-06/home-actual-390.png': {
    before: '3221bf03a52cf3192ddbe854daa667020fe103ee697e318f859407d63f097dc5',
    after: null,
  },
  'games/local/cops-robbers/docs/design/native-2026-10-06/home-actual-430.png': {
    before: '9241e2e082c07ef53518205516d03714a255e74a53efc1cc878f41f15a0e874e',
    after: null,
  },
  'games/local/cops-robbers/docs/design/native-2026-10-06/home-concept.svg': {
    before: '2c2a697a0de15957bb3628bdb110d83a8747f51fff2fd823a760ee8ec5ae75b8',
    after: null,
  },
  'games/local/cops-robbers/docs/design/native-2026-10-06/levels-actual-320.png': {
    before: '8aa05880a0160b6d1723f8e2037dd7e8ee3ba7c139c2d1c44d8dce2b2d6b949f',
    after: null,
  },
  'games/local/cops-robbers/docs/design/native-2026-10-06/levels-actual-390.png': {
    before: '4ad94482767b06deff541a45f6b65cba9c3e803242542ea3ab09e44a6ecdc85f',
    after: null,
  },
  'games/local/cops-robbers/docs/design/native-2026-10-06/levels-actual-430.png': {
    before: '45a23b511b46cf316e98447d9786d15ef630522828bf8852878fe68d22cb11ba',
    after: null,
  },
  'games/local/cops-robbers/docs/design/native-2026-10-06/levels-concept.svg': {
    before: '3bebe0b63da51eef57f5caeef8291fc5f156ebf223671cd8be90a9a73985f136',
    after: null,
  },
  'games/local/cops-robbers/docs/design/native-2026-10-06/pause-actual-320.png': {
    before: '8b226bc9e789ee28bd3dd32b19cbe2b6b60b3963c74d29d373d9aabdf2d55b23',
    after: null,
  },
  'games/local/cops-robbers/docs/design/native-2026-10-06/pause-actual-390.png': {
    before: 'd0046ff043a2626b82b255a70d82a76bd95aa0d8cfa5f4ac2f073620e69955e8',
    after: null,
  },
  'games/local/cops-robbers/docs/design/native-2026-10-06/pause-actual-430.png': {
    before: 'be1621274252eb9af74983ad4ca8146f413d0b1651e84cd59b9bfc931e0b61cb',
    after: null,
  },
  'games/local/cops-robbers/docs/design/native-2026-10-06/play-actual-320.png': {
    before: 'f151d0a3fc4be20e5b89f8d0cc385570a89249420f583875bca7ca1361b05522',
    after: null,
  },
  'games/local/cops-robbers/docs/design/native-2026-10-06/play-actual-390.png': {
    before: '26f0d783c67fba6616f4bd3835671d5d7f24b408920f529c2187cf5b713c4d89',
    after: null,
  },
  'games/local/cops-robbers/docs/design/native-2026-10-06/play-actual-430.png': {
    before: 'd64d5f5c4207c2d0a187ee01046781b8bb1410d4a41a13ebe08dfc30cd9387a1',
    after: null,
  },
  'games/local/cops-robbers/docs/design/native-2026-10-06/play-concept.svg': {
    before: 'b3ec646d2040aa34b10c3e196f597cf0204bc33ca02f758c91a0182d45c1779e',
    after: null,
  },
  'games/local/cops-robbers/docs/design/native-2026-10-06/verification.md': {
    before: 'd876839b920afca2a020b2977246497e74f03b59edc27912ca6e3c622a428076',
    after: null,
  },
  'games/local/cops-robbers/docs/design/security-guards-2026-10-18/README.md': {
    before: '1cdfa8bc918286f12064f0f26551dbd7f1b2f8587119caf7eada45e2f14039fc',
    after: '02a86f1e1c03f14ed168a04def411e07185f0a8cc7c79fdb445c2a710548c714',
  },
  'games/local/cops-robbers/package.json': {
    before: '16133afcbf746d59fb1cb0a5338d2cadd9e45a98b27f90ed6155c85c214b4bc3',
    after: 'be30d91332ba12547e47e1f064f8a68ba8423ac861a7153de8971d4f5c83b761',
  },
  'games/local/cops-robbers/scripts/check-native-browser.mjs': {
    before: 'a233525dbace3669cfbea4b01febdb7a5ceb8105e2552f4f1fced05bfcb49c8f',
    after: null,
  },
  'games/local/cops-robbers/scripts/check-native-parity-browser.mjs': {
    before: 'cd65f7696a5f86d527a37263d78d728104012d95429175b36ded44ff5e6cec5a',
    after: null,
  },
  'games/local/cops-robbers/scripts/check-native.mjs': {
    before: '0074d2c7d57cd0b3bbbee14c5701035474a486c36100116759123ff07f17c2e9',
    after: null,
  },
  'games/local/cops-robbers/scripts/check-security-art.mjs': {
    before: '98e07af2c0b6cc2f53210e6fdb3b10b5491c76c832a6a341d899dae52236ac33',
    after: 'dcff8efba7b76b5dd3cd9580c3a23cc4827f1da93e284e12c7beb09001616e35',
  },
  'games/local/cops-robbers/src/native.js': {
    before: '6becc258f387704a746acc4fdc247be3922d2b4ea2e66da00cf21476227d184a',
    after: null,
  },
  'games/local/night-overwatch/reports/balance-overhaul/game-config.log': {
    before: '1c2760bca5308bcc45f0615363836652fc0d2f7de87ff87475af9b78e020718f',
    after: '34d4c59957197fe611984e2fc81e07880dc51c10f06220fa60318494f583b63d',
  },
  'games/local/tower-brake/docs/TESTING.md': {
    before: '3b935ddd1d811d56b5cf5184f5a713bbda2cd3ce9cd8bb232468796e8518b7fb',
    after: 'a6657e94d2c42b99ed6bb294c7e66dd2a08b43ce3c48ad5a4dc23f85813aca13',
  },
  'games/local/urban-breakout/docs/testing.md': {
    before: 'd93b2c0d036e0222e388555455665042de762a22cf1159c9baa33c3d3b2bbaeb',
    after: '11e45fc4dedd39f4ef35b1079d88cf0f3fd419b72ba482a5a5db79b493728199',
  },
  'games/minigames/.env.example': {
    before: '0371a0bd7064b513871330f31a4c961bb099411aa3b366038f65d1959abc3cee',
    after: null,
  },
  'games/minigames/.gitignore': {
    before: '55055ab3c2e7fa9375553fd1fc70b6906b6763d71d0008d063f085a99e816e6c',
    after: null,
  },
  'games/minigames/README.md': {
    before: '2f70a0f1a68c57d51af6a40850b0043f9b343bc5d2519535ac1ff842cb18fcd9',
    after: null,
  },
  'games/minigames/cops-robbers-realtime/assets/scenes.meta': {
    before: '060c9bf2c8e8f829153294467994680e29dc5a54ae18040262e14edf52c231e5',
    after: null,
  },
  'games/minigames/cops-robbers-realtime/assets/scenes/main.scene': {
    before: '1e717522d462a15bf1e84f863774437f98c36555b18a488a0598891a701a091d',
    after: null,
  },
  'games/minigames/cops-robbers-realtime/assets/scenes/main.scene.meta': {
    before: 'b406ef7eb7fbcadde4e62a5e4c29476a1589a0ea015f358f43c149d154d40a79',
    after: null,
  },
  'games/minigames/cops-robbers-realtime/assets/scripts.meta': {
    before: 'fed1f9094e4aa8c58442c6faa4ae2d316668ce1c56240ce1ada689556422611d',
    after: null,
  },
  'games/minigames/cops-robbers-realtime/assets/scripts/CocosMiniGame.ts.meta': {
    before: '4d0d4c2796be7065306594469178489fb6b340f9559e605d437546229ef1e18a',
    after: null,
  },
  'games/minigames/cops-robbers-realtime/assets/scripts/browser-sdk.d.ts.meta': {
    before: '5189a7953983d8c1d3cab3bca33f00ab3ec1cb1d9fb26283c6961c9144c91534',
    after: null,
  },
  'games/minigames/cops-robbers-realtime/assets/scripts/browser-sdk.js.meta': {
    before: 'f8e793e7004603ea90f55d61125f89e63dd6c5135dc3a3ead6a9e69e3cad3eeb',
    after: null,
  },
  'games/minigames/cops-robbers-realtime/assets/scripts/game-entry.d.ts.meta': {
    before: 'b4e8f5a5266d6742e1d08b9e6d4498a817a0c60dc6caaaf22346184fa2a1f1fe',
    after: null,
  },
  'games/minigames/cops-robbers-realtime/assets/scripts/game-entry.js.meta': {
    before: '56787f5dd140ea59114c991aa35a18624d582f1da4e9e4aa6347ef6385ae109c',
    after: null,
  },
  'games/minigames/cops-robbers-realtime/assets/scripts/runtime.d.ts.meta': {
    before: 'ee87514016d6b01941f0efe5215aefd9141d1871dc2fbda808545d53b24abdf4',
    after: null,
  },
  'games/minigames/cops-robbers-realtime/assets/scripts/runtime.js.meta': {
    before: '352a75334e11564f871c0f153ec7b482f55054c477ee9c338a2bb422d242e117',
    after: null,
  },
  'games/minigames/cops-robbers-realtime/package.json': {
    before: '489e918507188e2f52440dbdad80cfa6988e5cfbad3efb5815bcc190efb838f1',
    after: null,
  },
  'games/minigames/cops-robbers-realtime/settings/v2/packages/engine.json': {
    before: '2152b9a790d5fa2cdefe92e95ea2a962c6d30619569b77ddaf7c5eb626989f0e',
    after: null,
  },
  'games/minigames/cops-robbers-realtime/settings/v2/packages/project.json': {
    before: '152a4441e2c72e2e2ef0cffd69abb1e0887cb62d151dd2af9ccf64162e2157fe',
    after: null,
  },
  'games/minigames/cops-robbers-realtime/tsconfig.json': {
    before: '0ad0007f0360fb32355798de8724aeaa2f5186df884129358131941b10657cde',
    after: null,
  },
  'games/minigames/cops-robbers/art.mjs': {
    before: '3796525a933bbb1152b69d556eb9d41259bc8c195f0d7af0f67dd321ecd1413d',
    after: null,
  },
  'games/minigames/cops-robbers/assets/scenes.meta': {
    before: '784b9ca46b2fc8a55e3c8daee164b83c3589db19dab467e0d6fa0f3561a2f448',
    after: null,
  },
  'games/minigames/cops-robbers/assets/scenes/main.scene': {
    before: '8d6644460d52ed3af3f783762b97a7ba59a0da8c0e9bdca1388e1da8925354d6',
    after: null,
  },
  'games/minigames/cops-robbers/assets/scenes/main.scene.meta': {
    before: 'c54f8ab4a18fe024dcac96ce53dc9fa380f195fc90cb68026ef4ac975bf43d2d',
    after: null,
  },
  'games/minigames/cops-robbers/assets/scripts.meta': {
    before: '2dc35c402098f720c2391526e545a8976ce2e491eabf6c7e6b1228e4a0299f82',
    after: null,
  },
  'games/minigames/cops-robbers/assets/scripts/CocosMiniGame.ts.meta': {
    before: '762ecdd5f626e847aa6b626c39f51177981beb9f2d0087b5b769de49ca8a1881',
    after: null,
  },
  'games/minigames/cops-robbers/assets/scripts/browser-sdk.d.ts.meta': {
    before: 'c3220aac9410e3405b1da829f14b4eb87bc246f2fa684f2f300149a98103160e',
    after: null,
  },
  'games/minigames/cops-robbers/assets/scripts/browser-sdk.js.meta': {
    before: '4c5ad59ddfa1cb47b604606a8ab72a4c3c8098d32ca62da38eece7af08f8cfad',
    after: null,
  },
  'games/minigames/cops-robbers/assets/scripts/game-entry.d.ts.meta': {
    before: 'cf5f335f678755a0539f90026b6aa086939e56d360eab602fa4581bfd1e21baa',
    after: null,
  },
  'games/minigames/cops-robbers/assets/scripts/game-entry.js.meta': {
    before: '94f1e9d12a8659c4127def3a2ddd3c746d0530abb99a60e92330b4bee18d8480',
    after: null,
  },
  'games/minigames/cops-robbers/assets/scripts/runtime.d.ts.meta': {
    before: '2ac4777e3219dd87dd5e7ea3a8c263a5dd7db5733f9b38068f630de217fe1e5d',
    after: null,
  },
  'games/minigames/cops-robbers/assets/scripts/runtime.js.meta': {
    before: '6e8be3d14edc0c6e778d409dd7a5e2c16b8ae58f41326246f80fca64b7640b52',
    after: null,
  },
  'games/minigames/cops-robbers/controller.mjs': {
    before: '3a4c5b39d92d9f8ff1676ef1893588cf7ccdf6352389828c868a1ee28a4f0f35',
    after: null,
  },
  'games/minigames/cops-robbers/package.json': {
    before: 'b8d78832b15ea75cdc0cdc9892f980788fcb9efe6f65945626bace69e64a74df',
    after: null,
  },
  'games/minigames/cops-robbers/settings/v2/packages/engine.json': {
    before: 'cfccf33bc3f3146a451c1abc170c8b6dafbe5c31be8fe38683e9f5fe971c71d8',
    after: null,
  },
  'games/minigames/cops-robbers/settings/v2/packages/project.json': {
    before: 'b1f2a55dee6d4fb064544ac63a901fdce54f60c04b41abee97f84ae87bdacfde',
    after: null,
  },
  'games/minigames/cops-robbers/tsconfig.json': {
    before: '3a00d94099c01fea6787793ca2b226d3372165f0b223ec2419386681fa4716a1',
    after: null,
  },
  'games/minigames/docs/design/cops-original-art-2026-10-16.md': {
    before: 'f5959ab70dc9dbc56d1d9ce149287614702097d8023ee46458c004045447f3f8',
    after: null,
  },
  'games/minigames/docs/design/cops-original-art-2026-10-16/before-home.png': {
    before: '12500832045267b07c50367d3fb162ed9ab0094b158fcb238394eae3838acfe0',
    after: null,
  },
  'games/minigames/docs/design/cops-original-art-2026-10-16/before-play.png': {
    before: '77e4ee7693dd5fef405c6c668e8c1ad09f16e81f7ef9e5285d7922d0b6c8313a',
    after: null,
  },
  'games/minigames/docs/design/cops-original-art-2026-10-16/creator-browser.json': {
    before: '852769774252e275865b0bbf0c17f432f407da1bdcf203f522d1329eacc8c3f7',
    after: null,
  },
  'games/minigames/docs/design/cops-original-art-2026-10-16/creator-home-390.png': {
    before: '723a23445bb79216c3ff25c139fa523d912f47220a4bb608d4166ca0bfdd14fc',
    after: null,
  },
  'games/minigames/docs/design/cops-original-art-2026-10-16/creator-levels-320.png': {
    before: 'a685657b4afb1922de3cd6b20244c5749b20553e768ede001320291ef76b507f',
    after: null,
  },
  'games/minigames/docs/design/cops-original-art-2026-10-16/creator-pause-320.png': {
    before: '5a3bec1d0ec160e7fdc72d77f4a1e59da24170bd8f0f2ca1432cfb85f84d8859',
    after: null,
  },
  'games/minigames/docs/design/cops-original-art-2026-10-16/creator-play-390.png': {
    before: '0130e721f131e773afb9b2b64cd298239e6126aa1369df081de60116543a98ae',
    after: null,
  },
  'games/minigames/docs/design/cops-original-art-2026-10-16/creator-result-320.png': {
    before: 'd6e57bc52684ffbc714619ea8749e6bca68e927be68942103a4cdb7663cbbcc5',
    after: null,
  },
  'games/minigames/docs/design/cops-original-art-2026-10-16/taptap-package.json': {
    before: '2a94cbbd5af381c1eb79e04816bc2b0549cae987f61c75cf9680b9ecd252782f',
    after: null,
  },
  'games/minigames/docs/design/h5-parity-2026-10-19.md': {
    before: '9d99baa2229222f52a368264f4b509191128709097cbc48590caf1c9880e4312',
    after: null,
  },
  'games/minigames/docs/design/h5-parity-2026-10-19/canvas-report.json': {
    before: '567af92f696dbdd74f4c684fddf4ce257f29d862b3f4babba50171737ad76aca',
    after: null,
  },
  'games/minigames/docs/design/h5-parity-2026-10-19/cops-320-play.png': {
    before: 'ecb6be84fe3253a45ecb5c63e60124b587587867da8cb0cb70eafde7cfb1e36f',
    after: null,
  },
  'games/minigames/docs/design/h5-parity-2026-10-19/cops-390-home.png': {
    before: 'b8442bc1593899e483b73c3c6c9ce60f189f477eb8797c8467aa258c1fdfb79d',
    after: null,
  },
  'games/minigames/docs/design/h5-parity-2026-10-19/h5/browser-report.json': {
    before: '11a5a355a964b8c3cb4a8e3905898fef5e6bea3c29039e91537851728b326bd0',
    after: null,
  },
  'games/minigames/docs/design/h5-parity-2026-10-19/street-568-avatars.png': {
    before: 'aa84edf47ee6ff1115fcc67f92396befcf8a70a3f92f715f7d95a5c9ab4edd40',
    after: null,
  },
  'games/minigames/docs/design/h5-parity-2026-10-19/street-844-home.png': {
    before: '9e57c93133def983402f392b26e4708f37a0ef238b6810a547e2687ddeaad3ce',
    after: null,
  },
  'games/minigames/docs/design/h5-parity-2026-10-19/street-844-play.png': {
    before: 'e1b4ef98df320e66ff55c62fa43a291037c61e6f06ade6a99e0551f7fff0de67',
    after: null,
  },
  'games/minigames/docs/design/local-validation.md': {
    before: 'f2598aab8ff92645ef4919325bf158c68b9f5a25b3226d7eee4487899fbceb0a',
    after: null,
  },
  'games/minigames/docs/design/migration.md': {
    before: 'a9dc51dcabab798efe272f924fefd27b0a89734bbc0bd6566ddeaaaa8fcfcb9d',
    after: null,
  },
  'games/minigames/package.json': {
    before: 'd9426382c81c52bb2aebe3240cc8207a8a4f48afb67a0ad7c8de0ae888da7300',
    after: null,
  },
  'games/minigames/scripts/browser.mjs': {
    before: 'd95a7c332a2322e181ed1388923ccc4293259cc3fd804eb3f32ebe27d765f742',
    after: null,
  },
  'games/minigames/scripts/build.mjs': {
    before: 'f5f81ec37c1b612744d2751909dfdf3e91f388e40e4a252336f13a3c9baeaa2c',
    after: null,
  },
  'games/minigames/scripts/check-tap-multiplayer.mjs': {
    before: 'a101d286fe7342133bc7cf57d0a24ba4688d60f3bb0ca83e17e80445998a6ee2',
    after: null,
  },
  'games/minigames/scripts/config.mjs': {
    before: 'df58f3cc29895692414d69beff11a40e8377781a8aaa9b8c2cbe558f59775368',
    after: null,
  },
  'games/minigames/scripts/import-kuaishou.mjs': {
    before: '16925d02768e315253e1fadc559a136610d461e241e24845fb67aef04c62ff65',
    after: null,
  },
  'games/minigames/scripts/prepare.mjs': {
    before: '110d3cde122fff1c217e800bad80f082ec1e8edb5e9ddeb88ca6c42b7544b3c3',
    after: null,
  },
  'games/minigames/scripts/setup.mjs': {
    before: 'e861e0c2b776ba65ca5c6904c39693f75366c10a4ca8992778766e8ecdc24459',
    after: null,
  },
  'games/minigames/scripts/taptap-services-bootstrap.mjs': {
    before: 'd844cf856f4b75e928110f0a6d748b88112df28187cb2c1c05c070d22fa55979',
    after: null,
  },
  'games/minigames/scripts/validation-scope.mjs': {
    before: '6bb92fa23329f8dd5421646c1935a2b215b9b7806e89bc89da1b037e1b85d1e1',
    after: null,
  },
  'games/minigames/shared/CocosMiniGame.ts': {
    before: 'b9525ab3c48fa065e9812c7eb0e84e117e011e0596a4105a3b6475624c02d602',
    after: null,
  },
  'games/minigames/shared/browser-sdk.d.ts': {
    before: '5acf925127269bc0b4beaa814d56331434481f36927d9ef720d31b59fdf3c178',
    after: null,
  },
  'games/minigames/shared/browser-sdk.js': {
    before: 'bd8349f10aeebba88dffaa4cd7347d2fef969255cd39a95abdd2e02f85d02d7d',
    after: null,
  },
  'games/minigames/shared/runtime.d.ts': {
    before: '3bebe8f441942e52d1ce1e90af10a16ace9d231f152cb2d012559d66881901ee',
    after: null,
  },
  'games/minigames/shared/runtime.js': {
    before: '24c9ca1cb3607c8bc25f5cb3bb71c4cb72fa1bc4fa14549cbec357fa53dce15c',
    after: null,
  },
  'games/minigames/tests/build.test.mjs': {
    before: '9d9a1cb749cac539705fcf33fcde065459266d83f9a53f4c34fdf3769fc12ba1',
    after: null,
  },
  'games/minigames/tests/cops.test.mjs': {
    before: '4169f37f936a69cd28615f46dbf7cbedc61ca68ee9418a96066e06ca0f0e533a',
    after: null,
  },
  'games/minigames/tests/runtime.test.mjs': {
    before: 'ef923663d442ceeee7a1ae57e24ce973adfe400cb793a2d58b9f3705431d4e1f',
    after: null,
  },
  'games/minigames/tests/scope.test.mjs': {
    before: 'c12791139ecdb68f1ece8fdd6e1312836f33ee623a1e9029190f63e4e4c37f73',
    after: null,
  },
  'games/minigames/tests/tap-multiplayer-fixture.mjs': {
    before: '3a0496e82bdce67f9d83f0df9ef6d37849eae56a0e444c370aa207c661976424',
    after: null,
  },
  'games/minigames/tests/tap-multiplayer.browser.mjs': {
    before: 'c86dd9f44ca905434eff2fa4c37a256221674bc4cb882fd16bc8bb87f9768a64',
    after: null,
  },
  'games/minigames/tests/tap-multiplayer.test.mjs': {
    before: '7af62daa9425c0c5d824ed36809d9a38e4158d06751d8bbd165ff66a27eed559',
    after: null,
  },
  'games/minigames/tests/tap-services.browser.mjs': {
    before: '4ea82b09837ee05970fcae974f4a6ee24f4726f9a4fb3f9b9be2eff0efc070d3',
    after: null,
  },
  'games/minigames/tests/tap-services.test.mjs': {
    before: '811eebcc970c7eaad842d158aa611a65eeb67f2a6c8c4fac0820c15cd430bd52',
    after: null,
  },
  'games/minigames/xiangqi-five/assets/scenes.meta': {
    before: '6f6f9b2de7c1aadb8455da935bdd8e732a16fda6ac6a7691e27404d95c2e889b',
    after: null,
  },
  'games/minigames/xiangqi-five/assets/scenes/main.scene': {
    before: 'dc173a4ae3b3c38aa7a074bf9ee4111811c75b9527177f849c284da59bdc76f7',
    after: null,
  },
  'games/minigames/xiangqi-five/assets/scenes/main.scene.meta': {
    before: '2d7ba6e73054cead7df14379d8b2a931fe0bbc6d2c788a223ea506aad8f7e870',
    after: null,
  },
  'games/minigames/xiangqi-five/assets/scripts.meta': {
    before: '6ab246fead536d9f1705ec8a4482ebb3abcd8062f2fecb4bc49c3ba88340322c',
    after: null,
  },
  'games/minigames/xiangqi-five/assets/scripts/CocosMiniGame.ts.meta': {
    before: 'ca33ebcbb640a8fd175af089f28dde635cf77498190d0b9460df8cb68bcfacf6',
    after: null,
  },
  'games/minigames/xiangqi-five/assets/scripts/browser-sdk.d.ts.meta': {
    before: 'd2e35e8400537fdc20b56a9ca6b0935cfc8bd547d9dab8708a24988134e68779',
    after: null,
  },
  'games/minigames/xiangqi-five/assets/scripts/browser-sdk.js.meta': {
    before: 'e37af8f7524d4aa6b2e30d917d5944074b8a788687015ff5544f17b1b2844324',
    after: null,
  },
  'games/minigames/xiangqi-five/assets/scripts/game-entry.d.ts.meta': {
    before: 'de14171e9f6b5341e1bf1fa2e25457875c5247efd51a2fbb82309b3edc76b5af',
    after: null,
  },
  'games/minigames/xiangqi-five/assets/scripts/game-entry.js.meta': {
    before: '3a90cc2c9e3b2170536f28aedc612a30006578c9f6647639e0100d1ff59fe57c',
    after: null,
  },
  'games/minigames/xiangqi-five/assets/scripts/runtime.d.ts.meta': {
    before: '893c4d4dda9b2e12a44269e6db0b34b4487c1446e1f5de14d22aae3fcd3a9f35',
    after: null,
  },
  'games/minigames/xiangqi-five/assets/scripts/runtime.js.meta': {
    before: '7af129c3f10847db7e83498b3709fd00d7014b568254a8c40658bee537f4195f',
    after: null,
  },
  'games/minigames/xiangqi-five/package.json': {
    before: '1742971190ac2335c4c69208918582f53a469521ba92328a45a901d347b349e0',
    after: null,
  },
  'games/minigames/xiangqi-five/settings/v2/packages/engine.json': {
    before: 'c0242104b6d6d22d397069020bd34d3d6ad62c9e3a63130bb89dc37142ac9c7f',
    after: null,
  },
  'games/minigames/xiangqi-five/settings/v2/packages/project.json': {
    before: 'ccf54566bce0fc614d7183011c6dce697f8a8fd3b0b89e72a480f3cc3e362367',
    after: null,
  },
  'games/minigames/xiangqi-five/tsconfig.json': {
    before: '35dd132545639b838a694d20f17c9faf5fd2f2155ef93387fd5ebec43c1024af',
    after: null,
  },
  'games/submodules/office-slacking': {
    before: '61f8abd856f43f5ee4c2e0d787964bbeb43b0d810411841346e14750897b3ad3',
    after: null,
  },
  'infra/builds/games.example.mjs': {
    before: 'b036c418d9f2df1a44757075976e0bd5fec7e93bcc80e1d4ca9e50c1a56ec95f',
    after: '6d7a8f33aaba0e30b40df60cf65fe6e8f0bfb75a469a1f150cb9d3f8a3a386a4',
  },
  'platforms/competition/tests/street-admission.test.mjs': {
    before: '1b3825028cfa6e636b8e106e95161c6047fc6788fd85531ca2a46c0b7c6bebba',
    after: '2f6decb2283f1fb9ad564d318debf23a0087d650f8d8ab2d5e916fee7874247b',
  },
  'platforms/competition/xiangqi-five/docs/design/PLAN.md': {
    before: 'f35d698a7dc31d5daed69559c1b916fb70ce11c0d3d5b06785c91c1c88bc47a5',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/VALIDATION.md': {
    before: 'be7ca798e8437e50013eed37ffbf77b6b960429b23894f4055bc2d8aa9866c82',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/actual-gomoku-320.png': {
    before: '2db58b5d6f5e82a650ddffd5f3303de23c77982991a76d0072d32a2c6125be3f',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/actual-gomoku-390.png': {
    before: 'bf7ccdff851f5cb781cc8b9ee92f08091ee0a5098d974c94c0e906c5a2039dfc',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/actual-gomoku-430.png': {
    before: '5118940e3c768ed80da17b8822ca77c908aa1216b3eccbcd595474888d727446',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/actual-gomoku-844.png': {
    before: 'cd358e3a6966d6a08d3cd603955844ebb659339b6232e9cc7c15686e79880882',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/actual-help-320.png': {
    before: 'd6bf49409584f28b6cacc1f4d9c7c69490d37bedab32baf40cba06d9002f48f6',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/actual-help-390.png': {
    before: '53ddff94e4d15b6198c6d4474827ce3a7c6ab9c94099a33c4889379a26593b3f',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/actual-help-430.png': {
    before: '8537b8a0a495bb0fbb06b99edbb1f1052a10c2db55e92c2ce745e62112c82e41',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/actual-help-844.png': {
    before: '732829cd017de0f47120b40661ecf7765e51435b164bddeb8cd3e1d8eaed37f1',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/actual-home-320.png': {
    before: '09e226c440a28a98a3a1b4aa0a2b45f1afadee59294b25451eb85795e4102dc4',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/actual-home-390.png': {
    before: '0fbd7353d8b4ac5cc17f912c7b46625fbc2e38b7ad9a8fc5fdf7d3495b48cfa3',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/actual-home-430.png': {
    before: 'cbe2b1ed537b5036912734a97a748c30b98671edccec4bbb12c969a4ed752fca',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/actual-home-844.png': {
    before: 'e918d3a88e84370afec210c0b00e8084e85637bd3a03a245f3aa3f6520a17cf8',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/actual-pause-320.png': {
    before: '8fc8167f08e9506240c75297d57aa2c4f849454949bf1906ca52c75003e411b3',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/actual-pause-390.png': {
    before: '030d8f7d6b96f983e07c1e5189de78afc60e9068f225af5a3daecb925d374ce1',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/actual-pause-430.png': {
    before: 'cd2d2b3ce58302b4f73a7a95459f967833cbefbdc4fc037d9b408c88478271b5',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/actual-pause-844.png': {
    before: 'a02c38bcbff3a552f2bc5460e4f644c0039d0f64c162dbd5c4c4b68267edfe5a',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/actual-play-320.png': {
    before: '94f340d7cfef7392bc4e0e0e8ba8fdd9b7f037374d24ba8e059a515c30c12843',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/actual-play-390.png': {
    before: 'c90c4d1f5845b3c3ea4ae197b479af795c258097ad7c958af5ff0f2f08518774',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/actual-play-430.png': {
    before: '47c8c74e61e610ea8f5661eab27b40efeb385ab37737c1dbb578faec9f7d8621',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/actual-play-844.png': {
    before: '639eeb010b7bef409ed809103bf77fa416acf350df3a0e221f0c5036624c9cc7',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/ads-2026-10-18.md': {
    before: '5037bd80a97bd5b81ce51eb47825dedf7d852ea49eacd8e8bcf004bc6dc397a2',
    after: '7ff79757d94da5cb240b2ab826ab4779ac83c10b02b36fb5eaba65c2efaf3f53',
  },
  'platforms/competition/xiangqi-five/docs/design/ads-2026-10-18/native-earned-390.png': {
    before: '3b789ac98319195dd87767f042f74f475ffeb3e756ab2f8fbd21872098f82f85',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/ads-2026-10-18/native-hint-390.png': {
    before: '343b52ada48339eae4b63c97f91a478d51ac65f7f9584ec948bbdc4eda8d3cf4',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/bilibili-entry-actual.png': {
    before: '3527e1b95f7dcc5cab0cfedf51cf2114dc42e322530001e31eb625ac3d43af6a',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/bilibili-entry-concept.svg': {
    before: '6ee75c81bdd8091b907c56c9d1827f1820630b1b27f56fae4f421803d0c0275b',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/concept-home.png': {
    before: '91488ec7c5707787c331defd96215951fa8c2bf04d69667e889181a8479d1271',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/concept-play.png': {
    before: 'f93ae0cd7e40fae74393ba20b5586ee78a35e7dc9eccc3adee45f8417044e3ad',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/concept-training.svg': {
    before: '1b444eb55df35ba44480e0f198fe2cbebffc45db965a8abac2baa7165cdeb2ed',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/concept.html': {
    before: 'aa8c3e72c88eec17fe75efe8fd76a77bb0e19197aab0bcba51f8f5901d2ac5ce',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/h5-parity-2026-10-19/README.md': {
    before: '5baf945daa4a21273f49d3d656611577d1d6ef02c3d773da1d86f498c4a9625e',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/h5-parity-2026-10-19/actual-home-390.png': {
    before: '3fb0216a83723193d2c758537f4d8cb75a4acdb4238069af23f001ab4fde35f2',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/h5-parity-2026-10-19/actual-play-390.png': {
    before: 'af1f2a29012d216c433590980be96c32ff1574b855b6f8a646d172d4d9283811',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/h5-parity-2026-10-19/actual-setup-computer-390.png':
    {
      before: '815b6ddf5a1204799f38696a9efbebf2d4da4d70d5bdeded8827030f212e8354',
      after: null,
    },
  'platforms/competition/xiangqi-five/docs/design/h5-parity-2026-10-19/concept.html': {
    before: 'a3da4d9b9b5165e085ce7dc8bf122baeb0d7486753febc6b96eb86f9cab94690',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/h5-parity-2026-10-19/concept.png': {
    before: '9d9c4fcf72ac622da5a64fb62e052a48dc7677969c17ee82ca54b3c6d29b42d6',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/shared-identity-2026-10-16/actual-local/leaderboard.png':
    {
      before: '14e9a1a9c0e89ff43f098bcee2e6ec6c5ce9592ac46ffa099cb3f54081dfe4ad',
      after: null,
    },
  'platforms/competition/xiangqi-five/docs/design/shared-identity-2026-10-16/actual-local/playing.png':
    {
      before: '9806f4f051bb2c46990efbe53728065511a0a05ed102ed2a0b3a24ecb8b3b554',
      after: null,
    },
  'platforms/competition/xiangqi-five/docs/design/shared-identity-2026-10-16/actual-local/profile-320x568.png':
    {
      before: '0f76618511732ee1c695f492173eee1c46dee4ae62dfd0fca4bdb44997767c25',
      after: null,
    },
  'platforms/competition/xiangqi-five/docs/design/shared-identity-2026-10-16/actual-local/profile-390x844.png':
    {
      before: '98fe53aad3495f3ea76fbbf7e82b528f2f3a8749d71375ff5593d456e73abf46',
      after: null,
    },
  'platforms/competition/xiangqi-five/docs/design/shared-identity-2026-10-16/actual-local/profile-844x390.png':
    {
      before: '2059ad9ae262b4c17a95d57035f5e2e05609e0f0055167a4d4c22b7ba360bb9c',
      after: null,
    },
  'platforms/competition/xiangqi-five/docs/design/shared-identity-2026-10-16/concept-board.png': {
    before: '3b63af0d1c13c825b12647b581aac2a3e38f8e486f817330fb348d7379fe211c',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/shared-identity-2026-10-16/concept-profile.png': {
    before: '31dbaf81c46d5f9ba51d5a4ef3da9e652a4f6d64b85d0afc46787b00dc50a32e',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/shared-identity-2026-10-16/concept-room.png': {
    before: '4744b8670e2d77cdfa9ef62051bae0b24a44f82cfc4c3e52fd1cdebc812c15b8',
    after: null,
  },
  'platforms/competition/xiangqi-five/docs/design/shared-identity-2026-10-16/concept.html': {
    before: '7e1769dd6b20a9c6d1368d1ed08c8843ba10e561e3b7f81dd6d18c3d7a861f1b',
    after: null,
  },
  'platforms/competition/xiangqi-five/native.js': {
    before: 'addcb7e0e0a2bc8d58e7ece8436fe20f02b84be651230b40ce838e5d1729afa0',
    after: null,
  },
  'platforms/competition/xiangqi-five/tests/browser.mjs': {
    before: 'da08dfbeaf38b8edc764e0468949b527f19b59ce78d7a88852214d68dcf0177a',
    after: null,
  },
  'platforms/competition/xiangqi-five/tests/native.test.mjs': {
    before: '7e41a08d5960c3cfd6189d5707c1c415ea430d727902fbea8d33d742a31b241a',
    after: null,
  },
  'platforms/taptap/docs/design/multiplayer-2026-10-19/README.md': {
    before: 'a20b0a0783d13dffb66e97ecea923a720f6afcf73f2a1560291f3febac052db3',
    after: '93dba7b1010504e6549e8504f1965b5b0d4692fda117bea0c627d0a6eec3b57b',
  },
  'platforms/taptap/docs/design/multiplayer-2026-10-19/actual-native-cops-robbers-play.png': {
    before: 'b561b2e2de73fa2805c910b7ce640a7216e3c77f6505e8a14161bcc2988b66c0',
    after: null,
  },
  'platforms/taptap/docs/design/multiplayer-2026-10-19/actual-native-cops-robbers-realtime-play.png':
    {
      before: '79d26f1fab5d1425dccc599ecd09f0c9eabf7471d33ad2d12a5890528d8dc78d',
      after: null,
    },
  'platforms/taptap/docs/design/multiplayer-2026-10-19/actual-native-cops-robbers-realtime-room.png':
    {
      before: 'c57e0e1ab53495a1e5f5f726564cf3c6c638428ce60e7e133d5127ed8cba9eb6',
      after: null,
    },
  'platforms/taptap/docs/design/multiplayer-2026-10-19/actual-native-cops-robbers-realtime-rotated.png':
    {
      before: '88519243d46bccae17381ff1fa97d9d877538c741de51ee967d1ed8e262000fd',
      after: null,
    },
  'platforms/taptap/docs/design/multiplayer-2026-10-19/actual-native-cops-robbers-room.png': {
    before: '018210f4fed3ba7eeae11ea89084f0dec94d582125a19b1f424d538817b4f339',
    after: null,
  },
  'platforms/taptap/docs/design/multiplayer-2026-10-19/actual-native-xiangqi-five-320.png': {
    before: 'cd0f02dc20b8c643b8277646760614cb5579b55934e8b12a12428fa74218a155',
    after: null,
  },
  'platforms/taptap/docs/design/multiplayer-2026-10-19/actual-native-xiangqi-five-568.png': {
    before: '4c050a9a44fb2f7dcda41ecaf30ccc0bc498cb3d16b59a7873ffad7e697a1859',
    after: null,
  },
  'platforms/taptap/docs/design/multiplayer-2026-10-19/actual-native-xiangqi-five-play.png': {
    before: 'fd9021882c78b19148c6fad760a833cbe8080898ca326ee0c7bac4b5d4391bf7',
    after: null,
  },
  'platforms/taptap/docs/design/multiplayer-2026-10-19/actual-native-xiangqi-five-room.png': {
    before: '0a446b19035e6ad613e9f886afbdf7c3ed885d7690e0923903a952f1bcd0d432',
    after: null,
  },
  'platforms/taptap/docs/design/services-2026-10-19/README.md': {
    before: 'a83b7a1a684af74218f41292ed458a9d0e9a3c5c18c5e6491684412a279d6fb8',
    after: '8fc41205708add4a385524793d84f7aa113a878970efe5d24b94e05e11db3e09',
  },
  'platforms/taptap/docs/design/services-2026-10-19/actual-native-cops-robbers-realtime-568.png': {
    before: '4146945483c8396cef4b4d194b7d1362264a933a9937d7242e0b2d7b8e2b45c4',
    after: null,
  },
  'platforms/taptap/docs/design/services-2026-10-19/actual-native-cops-robbers-realtime.png': {
    before: '2d5cc7b63119c9a1b08593817958b346ff4e3b5d87fed18f2fbc1092b711d561',
    after: null,
  },
  'platforms/taptap/docs/design/services-2026-10-19/actual-native-cops-robbers.png': {
    before: '83be83319d35b7d91eac5cf14691b494ad80bb7bd2269bbad55acdd9589b7fd9',
    after: null,
  },
  'platforms/taptap/docs/design/services-2026-10-19/actual-native-xiangqi-five.png': {
    before: 'a638eb7d9b32ef1a9c97f9e2ea2fabe58a6c448f652395a1b83345e571fe9f0a',
    after: null,
  },
  'platforms/taptap/docs/game-services.md': {
    before: '4c47558356275290122d2882daeaf0fd12067a86bd3a2e1bb7b13d7ad56593a6',
    after: 'fda9a1d618c96e7660cfdd21ca7e4c062b0cee3730b48c9f71a0a4f5a51e66b4',
  },
  'platforms/taptap/native-portal.mjs': {
    before: '27e72d523ddb22155002d491525c33369d72eaca1cf1e64f3e8bf26f66829a0f',
    after: null,
  },
  'platforms/taptap/rewarded-ads.mjs': {
    before: 'c509e885254f2d5bf92c8e7ba9f66aacd555c2c74de08e817c3e4b5660763329',
    after: null,
  },
  'platforms/taptap/tests/rewarded-ads.test.mjs': {
    before: '194cc60504cecb472905f629e38176de82c61be57d4b731fbfc4c907eb2a27ff',
    after: null,
  },
  'platforms/taptap/tests/tap-multiplayer-fixture.mjs': {
    before: null,
    after: 'eaa9347a92284bccc85bfb4e023b9516c83f9006d33a8b90877ce07f3ff20bb2',
  },
  'platforms/taptap/tests/tap-multiplayer.browser.mjs': {
    before: null,
    after: '3de1ca5deaef9101b4d4b40ce69029c676854171f671efd6b528adb955a61f2c',
  },
  'platforms/taptap/tests/tap-multiplayer.test.mjs': {
    before: null,
    after: '558f46e2401f158a61b6d8874cfe40ac64892fb1457b4223ecde8cc3e13980e8',
  },
  'platforms/taptap/tests/tap-services.browser.mjs': {
    before: null,
    after: 'a9444bbc4d2e1a5ebceec99caec5df866d081ed5a4fae81729c2a0a2904df842',
  },
  'platforms/taptap/tests/tap-services.test.mjs': {
    before: null,
    after: '2ff362791cdd4be343c89ff639b3bd649820b21fc57f14f45129ca20062c3474',
  },
  'pnpm-lock.yaml': {
    before: '368395f73d1fb9465161f7e98568ee426623dbde047af5addc24ab0a7434dffb',
    after: '39b5be38d1b6e2b421a7cbf88a3e954db69ef4bef397b82d2a3a9a9324bcc9e9',
  },
  'scripts/build-games.mjs': {
    before: 'e4d62d6171881e275699c3ab64720cf13edb9963635e963b96b378e69337b654',
    after: '3a509aa2174577be3733f51e74d117a967d2c15dad4331a3e4173aa01dfefa54',
  },
  'scripts/build-games.test.mjs': {
    before: '41031e2c973a3c994ba50f31e999adb239726ba82bb8f68bff17d45904438553',
    after: '32ddce3a6d4d030be214a0e0839816df489f8614ce020d5c522082de03fbe554',
  },
  'scripts/check-tap-multiplayer.mjs': {
    before: null,
    after: '3b869c77718a98a5d65d3aeab8c7bee17776edde22a93468b4ea3af773ab55f0',
  },
  'scripts/check-workspace-dependencies.mjs': {
    before: 'ac3ec1b7a1fc8a7feb8ffdf07e038116a62aff26b1c478cf701608514ab0adb0',
    after: '69db600735305dab756f2904efbd42f3dff68c6a8e4aa174b05328a671f78636',
  },
  'scripts/competition-build.mjs': {
    before: '9d4054cb913e7a60ffe20035f644e3b4b0650646ee1cc70b14ca967a5ffd63c7',
    after: 'c49ffe00854ce47ce31a0fc4714b627039aaa4823e18ee7f74270de3b68be3aa',
  },
  'scripts/competition-native-smoke.mjs': {
    before: 'ef90289d9827894c4dfcb1d88b7f7d28c6c3748f6563d1c46b5c5ac1366c35c1',
    after: 'bacc982ea11fb6933f6567f98b357db14d6967cc6426417392d3fb743a6bd665',
  },
  'scripts/competition-service-config.test.mjs': {
    before: 'f1559efef409b009de8d6d8ee9b7b7b2b6f80b9cf4828d246adab365d4ee8e91',
    after: '5ef2e693e8cf7df3d356eac53ad08e9db33be9b96e972b621b6792a101ba08f0',
  },
  'scripts/game-retirement-scope.test.mjs': {
    before: null,
    after: '9572e6a49dca8f52f4802d89c2ff3e8eef92668c68c97436c37104e73ff577c9',
  },
  'scripts/incremental-validation.mjs': {
    before: '76fe137e1682fd555648d789fe22f3ddd96ccceeeebb25fa3a9f96c0730d12a7',
    after: '02d1f468d04c3a4e930970c0461c6984e0b7d889912a58e94b7dc92987e368e6',
  },
  'scripts/incremental-validation.test.mjs': {
    before: 'b0592aba77a867ac69d90ec1d1599eb871ba25f76915a77f1546c37d1fbc279a',
    after: 'de2f24b7688bcc14e21a9979d1e3bd6ab46c18e09b918af920bb21bcb5e19a57',
  },
  'scripts/native-game-build.mjs': {
    before: 'bc349838a181508e7ee8612d6ac2d966fa254d2f1b968cda568efa9a60339d12',
    after: null,
  },
  'scripts/nine-canvas-games-smoke.mjs': {
    before: '8fcd530956d69e92c989357b1b059d0fa2b0a7ca7d80e33c02c4cda79ab53a3a',
    after: 'fcbec68e6027f31e6232b8ce89bf78bd32e664ae2128d0625b7312148c928546',
  },
  'scripts/nine-channel-entry-smoke.mjs': {
    before: 'd1a42f2b6f427601bad573416d7b3b5357521139511a251d2bbcfb9d3ef6e91a',
    after: 'ad4117daf11fc9d4d196e01e436b36c1d58bc6defef41e006d28dd4b0f2947b5',
  },
  'scripts/nine-native-scope.mjs': {
    before: 'a3245518a318ce43ff76c36ef37df59d4c0d612714fc638076f20cf850558b42',
    after: 'c34f25c09b0c38fa43fe4e8298a3e6decd89cd86528f14648b799faa99ff4fa4',
  },
  'scripts/nine-native-scope.test.mjs': {
    before: '655284ae1110ee8d94723589c7c494cc1385fbb9e9ad219822c3abb700b7ec18',
    after: '7436eecd34ab70b5c6a290941f9629a6b49de6b82d9052fd867c646a8e276c6b',
  },
  'scripts/pages-regression-timings.json': {
    before: '70629955616de72ab67a61cd9086271a8129f401db475969bc08c72022ca7e3b',
    after: '594635ad9e1c0305587c378df53fb8755c9f773c8ae7c06ec1c98dce53536a0f',
  },
  'scripts/pages-test-scope.mjs': {
    before: 'f965f0fa4ff7ba7cdd8e0ebb7e4daab63a50d63277112bb22813b2615ab6115d',
    after: '676f79d500e378dd90d17fcdb2f35ca6df52c8092915df1266bc9d0cd69ec2bc',
  },
  'scripts/pages-test-scope.test.mjs': {
    before: '739adb98fb01c3b0e5eef024ed2c902caa601dee0a34ab03483944ac4b66542c',
    after: 'c1374ae597524877362bc2adf97de05ba81192355e9941271928409cd9218e87',
  },
  'scripts/publication-scopes.mjs': {
    before: '76f019e1bfe357f8147593e463ef869cff2778f0f53b436018a03c9c6c58dc82',
    after: 'e5bc827ddbfca541677a46bdf2402a883b08becf4a620b79bda4506c16c1e787',
  },
  'scripts/publication-scopes.test.mjs': {
    before: '1b790bc54dd062f40671cfdc4536b131cbd6ff35dfd25fb7624b9b8c8bdcb13d',
    after: '036477839af1d89025fcd4303cd07c3fe2a039b0d474c69bc9b0f6304e5c5496',
  },
  'scripts/run-selected-competition.mjs': {
    before: '3b9e9368f63b9d98508c91c06b11132429f6a13dbe2eeffd1bf719362c26323c',
    after: '95d32e1898041e407b1ee32da9ead4bcf97b3f9a85317d1a01bfb64cb4291910',
  },
  'scripts/street-native-smoke.mjs': {
    before: 'cb15bf7f4cf5a4b8f793c9b96a96afbc963c5c75979d71b2a262ad1a3e10cdef',
    after: null,
  },
  'scripts/test-submodule-dialogs.mjs': {
    before: '6b8a55c50232d63a127e2d879bd9f658772282b2dd17058319e7b93a40996b92',
    after: '750310b232aea5ec03ee17b0258074bdab6884dc5c111daba7b1221112474e4b',
  },
  'scripts/validate-push-hook.test.mjs': {
    before: '6a7ca92f01760e981c50044b6085e187e18ad6728e45a79c1165750a5d239c76',
    after: 'a66e2053edea0d5030e0f13ccf89b42f4b8eca20d706ac3daedecc7847375df4',
  },
  'scripts/validate-tree.mjs': {
    before: 'dfc3b8a7c5aa1f8b11e3ef82d3305a8f126e8f7d235ad15ad2fd1ac1109bb6cb',
    after: '24f4ce38af097d715659e413918380061b4e9bc280c6e15fc9791d8a55b508b9',
  },
  'scripts/validate-tree.test.mjs': {
    before: '6183db0641222765574d689a34e3d3a26474e7fc9df6088a28c3b085836348be',
    after: '83b9201452d775c1af88b932d9723750a05daef842cf3e4f8fff1617f83029ce',
  },
});

export function retirementHeadQueryPaths(changedPaths) {
  return [
    ...new Set([
      ...changedPaths,
      nativeSource,
      retiredSource,
      ...Object.keys(retirementFileReviews),
    ]),
  ];
}

const proofValues = new WeakMap();

export function hasRetirementDeletionProof(file, value) {
  const proof = proofValues.get(value);
  return (
    !!proof &&
    proof.file === file &&
    proof.review === retirementFileReviews[file] &&
    proof.review.after === null
  );
}

export function hasRetirementFileProof(file, value, readSource) {
  const proof = proofValues.get(value);
  if (
    !proof ||
    proof.file !== file ||
    proof.review !== retirementFileReviews[file] ||
    proof.review.after === null ||
    !readSource
  )
    return false;
  try {
    return digest(readSource(file)) === proof.review.after;
  } catch {
    return false;
  }
}

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const validDigest = (value) => typeof value === 'string' && /^[a-f\d]{64}$/.test(value);

/** Exact file proof; a failed tree query never establishes absence. */
export function matchesRetirementFile(
  file,
  review,
  { readBase, readBaseEntry, readHead, headHasPath },
) {
  if (
    !review ||
    !(review.before === null || validDigest(review.before)) ||
    !(review.after === null || validDigest(review.after))
  )
    return false;
  try {
    if (review.before === null)
      return (
        validDigest(review.after) &&
        readBaseEntry(file) === '' &&
        headHasPath(file) === true &&
        digest(readHead(file)) === review.after
      );
    const before = review.after === null ? readBaseEntry(file) : readBase(file);
    if (
      review.after === null &&
      !(file === retiredSource
        ? /^160000 commit [a-f\d]{40}\tgames\/submodules\/office-slacking\n$/.test(before)
        : /^(?:100644|100755) blob [a-f\d]{40}\t[^\n]+\n$/.test(before))
    )
      return false;
    if (digest(before) !== review.before) return false;
    if (review.after === null) return headHasPath(file) === false;
    return headHasPath(file) === true && digest(readHead(file)) === review.after;
  } catch {
    return false;
  }
}

function retirementIdentities({ readHead, headHasPath }) {
  const games = JSON.parse(readHead(registry));
  if (!Array.isArray(games)) return false;
  for (const [id, source] of Object.entries(h5Sources))
    if (
      games.filter((game) => game.id === id).length !== 1 ||
      games.filter((game) => game.source === source).length !== 1 ||
      games.filter((game) => game.id === id && game.source === source).length !== 1
    )
      return false;
  if (games.some((game) => game.id === 'office-slacking' || game.source === retiredSource))
    return false;
  const meta = JSON.parse(readHead(metadata));
  if (
    !meta?.games ||
    Object.hasOwn(meta.games, 'office-slacking') ||
    Object.values(meta.games).some((game) => game.source === retiredSource)
  )
    return false;
  const pkg = JSON.parse(readHead(shell));
  if (
    ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'].some((field) =>
      Object.hasOwn(pkg[field] || {}, '@coffeeeeffoc/office-slacking'),
    ) ||
    readHead('.gitmodules').includes('office-slacking') ||
    readHead('pnpm-lock.yaml').includes('office-slacking')
  )
    return false;
  return headHasPath(nativeSource) === false && headHasPath(retiredSource) === false;
}

/**
 * The review is atomic: every recorded edit/deletion and the remaining H5
 * identities must match before any changed path receives a finite scope.
 */
export function retirementScopesForReview(context, reviews) {
  const scopes = new Map();
  if (!context.changedPaths.some((file) => Object.hasOwn(reviews, file))) return scopes;
  try {
    if (
      !retirementIdentities(context) ||
      !Object.entries(reviews).every(([file, review]) =>
        matchesRetirementFile(file, review, context),
      )
    )
      return scopes;
    for (const file of context.changedPaths.filter((file) => Object.hasOwn(reviews, file))) {
      const sources = reviews[file].sources ?? Object.values(h5Sources);
      if (
        !Array.isArray(sources) ||
        !isDeepStrictEqual(sources, [...new Set(sources)]) ||
        sources.some((source) => !Object.values(h5Sources).includes(source))
      )
        return new Map();
      const value = [...sources];
      if (reviews[file] === retirementFileReviews[file])
        proofValues.set(value, { file, review: reviews[file] });
      scopes.set(file, value);
    }
  } catch {
    // Missing or unreadable snapshots never prove a retired source's absence.
    return new Map();
  }
  return scopes;
}

export function retirementFileScopes(context) {
  return retirementScopesForReview(context, retirementFileReviews);
}

export function isReviewedRetirementDeletion(change, scopes) {
  const [before, after] = change.paths;
  if (change.status === 'D' && change.paths.length === 1)
    return retirementFileReviews[before]?.after === null && scopes.has(before);
  return (
    /^R\d+$/.test(change.status) &&
    change.paths.length === 2 &&
    retirementFileReviews[before]?.after === null &&
    retirementFileReviews[after]?.before === null &&
    scopes.has(before) &&
    scopes.has(after)
  );
}
