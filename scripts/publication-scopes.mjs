import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { vitePatchFileScopes } from './vite-patch-scope.mjs';
import { ingressShellGuard, ingressPreflightGuard } from './competition-ingress.mjs';

const loadDependency = createRequire(import.meta.url);

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
  },
  '.github/workflows/pages.yml': {
    original: '9a2493b15ddd4d6379ae117a94bd4620acfaa20bdf084eab6e96c0a03ca92a51',
    recursive: 'dfe0f60b9f1a3f30806960dc98ccfaeb17f51c09f57f30a9d57c10129ca31d97',
    locked: '5ce491178ca6d928b02d3c74843aee8115f1b507763b377ba6a5033904ca151f',
    parser: 'da0f2c9bff3757127328d00834e7b160f2cf4e886035fe588e7a0bd2c91adc1e',
  },
};
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
  // The planning job has no YAML dependency. This exact reviewed 40 -> 60
  // minute quality budget changes no command, condition or permission.
  if (oldHash === hashes.nativeGate && newHash === hashes.qualityBudget) return true;
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
  'three-choose-two': 'games/local/three-choose-two',
  'cage-rescue': 'games/local/cage-rescue',
  'tower-brake': 'games/local/tower-brake',
});
export const competitionIdentityScopePaths = Object.freeze([
  'platforms/competition/client.js',
  'scripts/competition-client.test.mjs',
  'platforms/competition/tests/identity.test.mjs',
]);
export const competitionIdentityMirrorPaths = Object.freeze([
  'games/local/flick-arena/competition-client.js',
  'games/local/three-choose-two/competition.js',
]);
export const competitionServiceScopePaths = [
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
  'scripts/h5-taptap.browser.mjs',
  'scripts/h5-taptap-matrix.mjs',
  'scripts/h5-taptap-matrix.test.mjs',
  'platforms/h5/rewarded-host.js',
  'scripts/competition-client.test.mjs',
  'scripts/competition.integration.mjs',
];
const competitionServiceIds = ['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'];
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
const h5Files = [
  'platforms/competition/h5.js',
  'platforms/competition/h5.css',
  'platforms/competition/profile-dom.js',
  'scripts/test-competition-dialogs.mjs',
];
const streetFiles = ['platforms/competition/street-pages.js', 'platforms/competition/street.css'];
const nativeFiles = ['platforms/competition/native.js', 'scripts/competition-native-smoke.mjs'];
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
    for (const file of ['game-services.js', 'client.js'])
      assert(hasCopyReference(build, '../../../platforms/competition/' + file, file));
    const server = readHead(source + '/server.mjs');
    assert.equal(
      server.split("pathname === '/client.js' && !process.argv.includes('--dist')").length,
      2,
    );
    assert(hasUrlReference(server, '../../../platforms/competition/client.js'));
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
function exactOrbitBoundsGuard(before, after) {
  // Only the reviewed masked-SVG offset fix; all input and behavior assertions stay fixed.
  return (
    createHash('sha256').update(before).digest('hex') ===
      'b2ab2d1ddb7b7426b2046a238e138a0b6bc6824f555dfabe2bb0e3b90719e8f5' &&
    after ===
      before
        .replace(
          'const bounds = node.getBoundingClientRect();',
          'const bounds = node.ownerSVGElement.getBoundingClientRect();',
        )
        .replace(
          'const bounds = await ring.boundingBox();',
          'const bounds = await board.boundingBox();',
        )
        .replace(
          '// SVG screen coordinates are local to the child document; native input is page-wide.',
          '// Masked ring bounds differ between DOM/CDP; the board gives a stable iframe offset.',
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
    createHash('sha256').update(source).digest('hex') ===
      'd854f227aa1e1a59090f76e403937d4623a6c8d4ca82a0eaaa637734c862e3b9',
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
  'three-choose-two': 'games/local/three-choose-two',
  'flick-arena': 'games/local/flick-arena',
  'moss-garden': 'games/local/game-moss-garden',
  'ember-bounce': 'games/local/ember-bounce',
  'chase-thief': 'games/local/chase-thief',
  'retreat-rally': 'games/local/retreat-rally',
  'tiny-signals': 'games/local/tiny-signals',
  'orbit-atelier': 'games/local/orbit-atelier',
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
// Only cops-robbers currently packages the explicit channel adapter and H5 uploader.
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
export const adminConsoleScopePaths = [
  'infra/admin-console/.env.example',
  'infra/admin-console/migrations/001-admin-auth.sql',
];
const adminConsumers = ['services/management-api', 'apps/admin-web'];
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
// One reviewed importer and ten complete immutable blocks, preserving both YAML documents byte for byte.
function adminWebLockOnly(before, after, manifest) {
  const digest = (text) => createHash('sha256').update(text).digest('hex');
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
  'one-stroke-course': 'games/local/one-stroke-course',
  'hold-tight-acrobats': 'games/local/hold-tight-acrobats',
  'carding-car': 'games/local/carding-car',
  'night-overwatch': 'games/local/night-overwatch',
  fishing: 'games/submodules/fishing',
  'vibeJam-myself-delivery': 'games/local/vibeJam-myself-delivery',
  'vibeJam-myself-nullrange': 'games/local/vibeJam-myself-nullrange',
  'wulong-city': 'games/local/wulong-city',
};
const independentPreviewConsumers = {
  ...mobileViewportConsumers,
  'tower-defense-game': 'games/submodules/tower-defense-game',
};

/** Structural proofs for config-only changes; explicit consumers for known tools.
 * No prefix wildcard accepts a new workflow, shared runtime or test script.
 */
export function reviewedSharedFileScopes({
  changedPaths,
  readBase,
  readHead,
  games,
  packages = [],
}) {
  const scopes = vitePatchFileScopes({ changedPaths, readBase, readHead });
  for (const file of changedPaths) {
    try {
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
      if (adminConsoleScopePaths.includes(file)) {
        for (const source of adminConsumers) assert(packages.some((pkg) => pkg.dir === source));
        scopes.set(file, adminConsumers);
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
          for (const host of ['apps/shell-minigame', 'apps/shell-bilibili']) {
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
        const sources = xiangqi
          ? [competitionConsumers['xiangqi-five']]
          : native
            ? Object.values(competitionConsumers)
            : competitionServiceIds.map((id) => competitionConsumers[id]);
        const gateway = ['scripts/deploy-tencent.mjs', 'scripts/competition-gateway.mjs'].includes(
          file,
        );
        if (gateway) {
          assertRankedConsumers(games, packages, readHead);
          assertGameServiceCopies(readHead);
        }
        scopes.set(file, [
          ...new Set([
            ...sources,
            ...(native || xiangqi ? [] : ['apps/shell-web']),
            ...(file === 'scripts/competition-service-config.mjs' ? ['apps/shell-minigame'] : []),
            ...(native
              ? ['apps/shell-minigame', 'apps/shell-bilibili']
              : xiangqi
                ? ['apps/shell-minigame']
                : []),
            ...(gateway ? [...Object.values(rankedConsumers), 'services/runtime-api'] : []),
            ...(file === 'scripts/competition.integration.mjs' ? ['services/runtime-api'] : []),
          ]),
        ]);
        continue;
      }
      if (
        gameServiceScopePaths.includes(file) &&
        (file !== 'scripts/competition-gateway.mjs' ||
          rankedGatewayFileScope(readBase(file), readHead(file)))
      ) {
        assertRankedConsumers(games, packages, readHead);
        assertGameServiceCopies(readHead);
        if (file === 'scripts/competition-gateway.mjs')
          assert(rankedGatewayFileScope(readBase(file), readHead(file)));
        const gateway = file.startsWith('scripts/');
        if (gateway) assert(packages.some((pkg) => pkg.dir === 'apps/shell-web'));
        scopes.set(file, [
          ...Object.values(rankedConsumers),
          ...(gateway ? ['services/runtime-api', 'apps/shell-web'] : []),
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
        // The reviewed runner changes only nine mobile viewports and the static
        // Pages config for Tower Defense. Bind its imported helper as well.
        const digest = (text) => createHash('sha256').update(text).digest('hex');
        assert.equal(
          digest(readBase(file)),
          '790e82ca9e5a2402af68264950835cb51fa209366ec2a2be40cc5ae0db7f00eb',
        );
        assert.equal(
          digest(readHead(file)),
          '40b88c9a89b30e8622f5521aec578cbbdf585d8dacf01492729c28c0a2527b6f',
        );
        assert.equal(
          digest(readHead(mobileViewportScopeFile)),
          '9842e1dd43a69e8abd7067bd4bb1a126775a0c57f7df0733c98acec3a6ecc272',
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
          'da88c72eea1d129b416d24510a701054116829f010478c856420cb0e7df45a33',
        );
        assert.equal(
          digest(readHead(file)),
          '9842e1dd43a69e8abd7067bd4bb1a126775a0c57f7df0733c98acec3a6ecc272',
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
        scopes.set(file, [source]);
      } else if (safeAreaScopePaths.includes(file)) {
        for (const [id, source] of Object.entries(safeAreaConsumers)) {
          assert(games.filter((game) => game.id === id && game.source === source).length === 1);
          assert(packages.some((pkg) => pkg.dir === source));
        }
        scopes.set(file, Object.values(safeAreaConsumers));
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
            ? [...competitionServiceIds.map((id) => competitionConsumers[id]), 'apps/shell-web']
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
        exactOrbitBoundsGuard(readBase(file), readHead(file))
      ) {
        assert(
          games.filter(
            (game) => game.id === 'orbit-atelier' && game.source === 'games/local/orbit-atelier',
          ).length === 1,
        );
        scopes.set(file, ['games/local/orbit-atelier']);
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
      } else if (file === 'scripts/street-native-smoke.mjs') {
        assert(
          games.filter(
            (game) =>
              game.id === 'cops-robbers-realtime' && game.source === competitionConsumers[game.id],
          ).length === 1,
        );
        assert.equal(
          createHash('sha256').update(readHead(file).replaceAll('\r\n', '\n')).digest('hex'),
          'ccf421e8a4fee57645b4d1476bdad24b03ef12d1f4a0b20f08553cb56a336462',
        );
        scopes.set(file, [competitionConsumers['cops-robbers-realtime']]);
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
