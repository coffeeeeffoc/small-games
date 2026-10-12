import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  reviewedSharedFileScopes,
  competitionConsumers,
  competitionToolPlan,
  threeChooseTwoBackendFileScope,
  flickIntegrationFileScope,
  carromBackendFileScope,
  publishingConsumers,
  publishingScopePaths,
  deploymentBundleScopePaths,
  publicationConfigScopePaths,
  mobileViewportScopeFile,
  independentPreviewScopeFile,
} from './publication-scopes.mjs';
import {
  incrementalPlan,
  developerModeFileScopes,
  entryAdapterFileScopes,
} from './incremental-validation.mjs';
import { executeCompetitionChecks } from './run-selected-competition.mjs';
import { shellContractTargets, shellContractFiles } from './validation-plan.mjs';

test('company Pages publication adds only its tested artifact and preserves game gates', async () => {
  const { execFileSync } = await import('node:child_process');
  const file = '.github/workflows/pages-validate.yml';
  const before = execFileSync('git', ['show', '4fe9716ce5b9277e42b976e005931f6e8c7dc2f3:' + file], {
    encoding: 'utf8',
  });
  const after = readFileSync(new URL('../' + file, import.meta.url), 'utf8').replaceAll(
    '\r\n',
    '\n',
  );
  const packages = [{ dir: 'apps/company-web', name: '@coffeeeeffoc/company-web' }];
  const classify = (old, current, consumers = packages) =>
    reviewedSharedFileScopes({
      changedPaths: [file],
      games: [],
      packages: consumers,
      readBase: () => old,
      readHead: () => current,
    });
  const scopes = classify(before, after);
  assert.deepEqual(scopes.get(file), ['apps/company-web']);
  const plan = incrementalPlan({
    changedPaths: [file],
    packages,
    games: [],
    fileScopes: scopes,
    readSource: () => '',
  });
  assert.deepEqual(plan.consumer_sources, ['apps/company-web']);
  assert.deepEqual(plan.game_sources, []);
  assert.equal(plan.full, false);
  const testAt = after.indexOf('pnpm --filter @coffeeeeffoc/company-web test');
  const copyAt = after.indexOf('cp -R apps/company-web/dist apps/shell-web/dist/company');
  assert(after.indexOf('pnpm build:pages') < testAt && testAt < copyAt);
  assert(copyAt < after.indexOf('name: pages-build'));
  for (const invalid of [
    after.replace('company-web test', 'company-web build'),
    after.replace('apps/shell-web/dist/company', 'apps/shell-web/dist'),
    after.replace('contents: read', 'contents: write'),
    after + '\n',
  ])
    assert.equal(classify(before, invalid).has(file), false);
  assert.equal(classify(before + '\n', after).has(file), false);
  assert.equal(classify(before, after, []).has(file), false);
});

test('viewport extraction selects all nine real consumers and rejects any unreviewed bytes', () => {
  const file = mobileViewportScopeFile;
  const after = readFileSync(new URL('../' + file, import.meta.url), 'utf8').replaceAll(
    '\r\n',
    '\n',
  );
  const before = after.replace(/\n\/\/ Shared by the Pages[\s\S]*?(?=\nfunction attributes)/, '');
  assert.notEqual(before, after);
  const games = JSON.parse(
    readFileSync(new URL('../apps/shell-web/src/standalone-games.json', import.meta.url), 'utf8'),
  );
  const packages = games.map((game) => ({ dir: game.source, name: '@fixture/' + game.id }));
  const classify = (old, current, catalog = games) =>
    reviewedSharedFileScopes({
      changedPaths: [file],
      games: catalog,
      packages,
      readBase: () => old,
      readHead: () => current,
    });
  const scopes = classify(before, after);
  const plan = incrementalPlan({
    packages,
    games,
    changedPaths: [file],
    fileScopes: scopes,
    readSource: () => '',
  });
  assert.deepEqual(plan.browser_ids, [
    'carding-car',
    'fishing',
    'fold-the-world',
    'hold-tight-acrobats',
    'night-overwatch',
    'one-stroke-course',
    'vibeJam-myself-delivery',
    'vibeJam-myself-nullrange',
    'wulong-city',
  ]);
  assert.equal(plan.validation_tools, true);
  assert.equal(plan.full, false);
  for (const rejected of [
    classify(before + '\n', after),
    classify(before, after.replace('width: 844', 'width: 843')),
    classify(before, after + '\n'),
    classify(
      before,
      after,
      games.filter((game) => game.id !== 'fishing'),
    ),
  ]) {
    assert(!rejected.has(file));
    assert.throws(
      () =>
        incrementalPlan({
          packages,
          games,
          changedPaths: [file],
          fileScopes: rejected,
          readSource: () => '',
        }),
      /Mobile viewport scope undefined/,
    );
  }
});

test('independent preview selects nine viewport consumers plus Tower Defense and fails closed', async () => {
  const { execFileSync } = await import('node:child_process');
  const files = [mobileViewportScopeFile, independentPreviewScopeFile];
  const before = Object.fromEntries(
    files.map((file) => [
      file,
      execFileSync('git', ['show', 'e37783aef3042289d9cfbb7f4b0badb6a106f6d8:' + file], {
        encoding: 'utf8',
      }),
    ]),
  );
  const after = Object.fromEntries(
    files.map((file) => [
      file,
      readFileSync(new URL('../' + file, import.meta.url), 'utf8').replaceAll('\r\n', '\n'),
    ]),
  );
  const games = JSON.parse(
    readFileSync(new URL('../apps/shell-web/src/standalone-games.json', import.meta.url), 'utf8'),
  );
  const packages = games.map((game) => ({ dir: game.source, name: '@fixture/' + game.id }));
  const classify = (current = after, catalog = games, old = before) =>
    reviewedSharedFileScopes({
      changedPaths: files,
      games: catalog,
      packages,
      readBase: (file) => old[file],
      readHead: (file) => current[file],
    });
  const scopes = classify();
  assert.equal(scopes.get(independentPreviewScopeFile).length, 10);
  assert(scopes.get(independentPreviewScopeFile).includes('games/submodules/tower-defense-game'));
  const plan = incrementalPlan({
    packages,
    games,
    changedPaths: files,
    fileScopes: scopes,
    readSource: () => '',
  });
  assert.equal(plan.full, false);
  assert.equal(plan.validation_tools, true);
  assert.deepEqual(plan.browser_ids, [
    'carding-car',
    'fishing',
    'fold-the-world',
    'hold-tight-acrobats',
    'letters-words2',
    'night-overwatch',
    'one-stroke-course',
    'tower-defense-game',
    'vibeJam-myself-delivery',
    'vibeJam-myself-nullrange',
    'wulong-city',
    'xiangqi-five',
  ]);
  for (const rejected of [
    classify({
      ...after,
      [independentPreviewScopeFile]: after[independentPreviewScopeFile] + '\n',
    }),
    classify(after, games, {
      ...before,
      [independentPreviewScopeFile]: before[independentPreviewScopeFile] + '\n',
    }),
    classify({ ...after, [mobileViewportScopeFile]: after[mobileViewportScopeFile] + '\n' }),
    classify(
      after,
      games.filter((game) => game.id !== 'tower-defense-game'),
    ),
  ]) {
    assert(!rejected.has(independentPreviewScopeFile));
    assert.throws(
      () =>
        incrementalPlan({
          packages,
          games,
          changedPaths: [independentPreviewScopeFile],
          fileScopes: rejected,
          readSource: () => '',
        }),
      /Independent preview scope undefined/,
    );
  }
});

test('flick runtime integration accepts only the exact reviewed deployment, MIME and import deltas', async () => {
  const { execFileSync } = await import('node:child_process');
  const base = '8beb6d98a804fc1646ba6daceaf57bdcadab7494';
  const flick = { id: 'flick-arena', source: 'games/local/flick-arena' };
  const cases = [
    {
      file: 'scripts/deploy-tencent.mjs',
      anchor: "    'services/runtime-api/rules',\n",
      addition: "    'games/local/flick-arena/src',\n",
      consumers: [flick.source, 'services/runtime-api'],
    },
    {
      file: 'scripts/competition-gateway.mjs',
      anchor: "  '.js': 'text/javascript',\n",
      addition: "  '.mjs': 'text/javascript',\n",
      consumers: [flick.source, 'apps/shell-web'],
    },
    {
      file: 'scripts/check-workspace-dependencies.mjs',
      anchor:
        "  'services/runtime-api/rules/chess.mjs -> games/submodules/xiangqi-five/game.js',\n",
      addition:
        "  'services/runtime-api/rules/flick.mjs -> games/local/flick-arena/src/core.mjs',\n" +
        "  'services/runtime-api/rules/flick.mjs -> games/local/flick-arena/src/tournament.mjs',\n",
      consumers: [flick.source, 'services/runtime-api'],
    },
  ];
  for (const { file, anchor, addition, consumers } of cases) {
    const before = execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8' });
    const after = before.replace(anchor, anchor + addition);
    assert.equal(flickIntegrationFileScope(file, before, after), true, file);
    const context = {
      changedPaths: [file],
      games: [...games, flick],
      readBase: () => before,
      readHead: () => after,
    };
    const scopes = reviewedSharedFileScopes(context);
    assert.deepEqual(scopes.get(file), consumers);
    const selected = incrementalPlan({
      changedPaths: [file],
      games: context.games,
      packages: [...packages, { name: 'flick-arena', dir: flick.source }],
      fileScopes: scopes,
      readSource: () => '',
    });
    assert.equal(selected.full, false);
    assert.deepEqual(selected.game_sources, [flick.source]);
    assert.deepEqual(selected.browser_ids, ['flick-arena']);
    assert.equal(selected.competition.h5, false);
    assert.equal(selected.competition.native, false);
    for (const changed of [
      after + '\n',
      after.replace(addition, addition + addition),
      after.replace(addition, addition.replace(/flick-arena|text\/javascript/, 'unreviewed')),
      after.replace(anchor, ''),
    ]) {
      assert.equal(flickIntegrationFileScope(file, before, changed), false);
      assert.equal(
        reviewedSharedFileScopes({ ...context, readHead: () => changed }).has(file),
        false,
      );
    }
    assert.equal(flickIntegrationFileScope(file, before + '\n', after), false);
    assert.equal(flickIntegrationFileScope(file, after, before), false);
    assert.equal(flickIntegrationFileScope(file, null, after), false);
    assert.equal(reviewedSharedFileScopes({ ...context, games }).has(file), false);
    assert.equal(
      reviewedSharedFileScopes({ ...context, games: [...games, flick, flick] }).has(file),
      false,
    );
  }
  assert.equal(flickIntegrationFileScope('scripts/unknown.mjs', '', ''), false);
});

test('reviewed Codex roles select no game consumers; extra settings and unknown files stay blocked', () => {
  for (const role of ['repo_explorer', 'implementer', 'reviewer']) {
    const file = `.codex/agents/${role}.toml`;
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replaceAll(
      '\r\n',
      '\n',
    );
    const scopes = classify(file, null, source);
    assert.deepEqual(scopes.get(file), []);
    const result = plan([file], scopes);
    assert.equal(result.full, false);
    assert.equal(result.browser, false);
    assert.deepEqual(result.game_sources, []);
    assert.deepEqual(result.consumer_sources, []);
    for (const changed of [
      null,
      source.replace(`name = "${role}"`, 'name = "other"'),
      source + '\napproval_policy = "never"\n',
      source + '\n[mcp_servers.other]\ncommand = "external-tool"\n',
      source + '\n[hooks]\n',
      source.replace('read-only', 'workspace-write'),
    ].filter((changed) => changed !== source)) {
      const rejected = classify(file, source, changed);
      assert.equal(rejected.has(file), false);
      assert.throws(() => plan([file], rejected), /scope undefined/);
    }
    for (const sibling of ['.codex/config.toml', '.codex/agents/other.toml', file + '.backup']) {
      const rejected = classify(sibling, null, source);
      assert.equal(rejected.has(sibling), false);
      assert.throws(() => plan([sibling], rejected), /scope undefined/);
    }
  }
});

test('publishing adapter selects all registered standalone consumers and rejects missing identities', () => {
  const games = Object.entries(publishingConsumers).map(([id, source]) => ({ id, source }));
  const packages = games.map((game) => ({ name: game.id, dir: game.source }));
  for (const file of publishingScopePaths) {
    const context = { games, packages, changedPaths: [file], readSource: () => '' };
    const fileScopes = reviewedSharedFileScopes(context);
    const plan = incrementalPlan({ ...context, fileScopes });
    assert.deepEqual(plan.browser_ids, games.map((game) => game.id).sort());
    assert.equal(plan.publishing_checks, true);
    for (const invalid of [{ games: games.slice(1) }, { packages: packages.slice(1) }]) {
      const rejected = reviewedSharedFileScopes({ ...context, ...invalid });
      assert.equal(rejected.size, 0);
      assert.throws(() => incrementalPlan({ ...context, fileScopes: rejected }), /scope undefined/);
    }
  }
  assert.throws(
    () => incrementalPlan({ games, packages, changedPaths: ['platforms/h5/unknown.js'] }),
    /scope undefined/,
  );
});

test('deployment and public platform configuration select mandatory checks without unrelated games', () => {
  const packages = ['runtime-api', 'management-api'].map((name) => ({
    name,
    dir: `services/${name}`,
  }));
  for (const file of [...deploymentBundleScopePaths, ...publicationConfigScopePaths]) {
    const context = { packages, games: [], changedPaths: [file], readSource: () => '' };
    const fileScopes = reviewedSharedFileScopes(context);
    const plan = incrementalPlan({ ...context, fileScopes });
    assert.equal(plan.browser, false);
    assert.equal(plan.deployment_bundle_checks, deploymentBundleScopePaths.includes(file));
    assert.equal(plan.publication_config_checks, publicationConfigScopePaths.includes(file));
  }
  const before = { scripts: { build: 'keep-existing-build' }, dependencies: {} };
  const after = structuredClone(before);
  after.scripts['deployment:bundle'] = 'node scripts/deployment-bundle.mjs';
  after.scripts['test:deployment-bundle'] = 'node --test scripts/deployment-bundle.test.mjs';
  const context = {
    packages,
    games: [],
    changedPaths: ['package.json'],
    readBase: () => JSON.stringify(before),
    readHead: () => JSON.stringify(after),
  };
  assert.equal(reviewedSharedFileScopes(context).size, 1);
  after.scripts.build = 'changed-build';
  assert.equal(reviewedSharedFileScopes(context).size, 0);
  for (const file of [
    'scripts/deployment-other.mjs',
    'infra/deployment/unknown.sh',
    'platforms/publication-extra.mjs',
  ])
    assert.throws(
      () =>
        incrementalPlan({
          packages,
          games: [],
          changedPaths: [file],
          fileScopes: reviewedSharedFileScopes({ ...context, changedPaths: [file] }),
        }),
      /scope undefined/,
    );
});

const carromDirectory = 'games/local/carrom-club';
const carromCoreFile = `${carromDirectory}/src/core.mjs`;
const carromContentFile = `${carromDirectory}/src/content.mjs`;
const carromFriendsCoreFile = `${carromDirectory}/src/friends-core.mjs`;
const carromFriendsContentFile = `${carromDirectory}/src/friends-content.mjs`;
const carromApp = 'services/runtime-api/src/app.ts';
const carromBackendRule = 'services/runtime-api/rules/carrom.mjs';
const carromDeployment = 'scripts/deploy-tencent.mjs';
const carromCopyAnchor =
  "  for (const name of [\n    'services/runtime-api/dist',\n    'services/runtime-api/rules',\n";
const carromCopyAddition = `    '${carromCoreFile}',\n    '${carromContentFile}',\n`;
const carromDeploymentBefore =
  `export async function prepareBackend() {\n${carromCopyAnchor}` +
  "    'games/local/three-choose-two/src',\n  ]) await copy(name);\n}\n";
const carromDeploymentAfter = carromDeploymentBefore.replace(
  carromCopyAnchor,
  carromCopyAnchor + carromCopyAddition,
);
const carromFriendsCopyAddition =
  `    '${carromFriendsCoreFile}',\n` + `    '${carromFriendsContentFile}',\n`;
const carromFriendsDeploymentAfter = carromDeploymentAfter.replace(
  carromCopyAddition,
  carromCopyAddition + carromFriendsCopyAddition,
);
const carromCatalog = [{ id: 'carrom-club', source: carromDirectory }];
const carromPackages = [
  { name: 'carrom', dir: carromDirectory },
  { name: 'runtime', dir: 'services/runtime-api' },
  { name: 'unrelated', dir: 'games/local/unrelated' },
];
const carromSources = {
  [carromDeployment]: carromDeploymentAfter,
  [carromBackendRule]: `import { createGame } from '../../../${carromCoreFile}';\n`,
  [carromCoreFile]:
    "import { LEVELS } from './content.mjs';\nexport const createGame = () => LEVELS;\n",
  [carromContentFile]: 'export const LEVELS = [];\n',
  [carromFriendsCoreFile]:
    "import { createGame } from './core.mjs';\n" +
    "import { FRIEND_LEVELS } from './friends-content.mjs';\n" +
    'export const createMultiplayerMatch = () => createGame(FRIEND_LEVELS);\n',
  [carromFriendsContentFile]: 'export const FRIEND_LEVELS = [];\n',
  [carromApp]:
    `const carromUrl = new URL('../../../${carromFriendsCoreFile}', import.meta.url).href;\n` +
    'const carromEngine = await import(carromUrl);\n' +
    `const levelsUrl = new URL('../../../${carromFriendsContentFile}', import.meta.url).href;\n` +
    'const { FRIEND_LEVELS } = await import(levelsUrl);\n',
};
function carromContext(changedPaths, overrides = {}) {
  return {
    changedPaths,
    games: carromCatalog,
    packages: carromPackages,
    readBase: () => carromDeploymentBefore,
    readHead: (file) => {
      assert(Object.hasOwn(carromSources, file), `Unknown fixture: ${file}`);
      return carromSources[file];
    },
    ...overrides,
  };
}

test('carrom deployment proof accepts only the two shared rule files with unchanged surrounding bytes', () => {
  assert.equal(
    carromBackendFileScope(carromDeployment, carromDeploymentBefore, carromDeploymentAfter),
    true,
  );
  for (const after of [
    carromDeploymentBefore,
    carromDeploymentAfter + '\n',
    carromDeploymentAfter.replace('await copy(name)', 'await execute(name)'),
    carromDeploymentAfter.replace(carromContentFile, `${carromDirectory}/src/main.mjs`),
    carromDeploymentAfter.replace(carromCopyAddition, carromCopyAddition + carromCopyAddition),
    carromDeploymentAfter.replace(carromCopyAddition, `    '${carromCoreFile}',\n`),
  ])
    assert.equal(carromBackendFileScope(carromDeployment, carromDeploymentBefore, after), false);
  for (const before of [null, '', carromDeploymentAfter, carromDeploymentBefore + carromCopyAnchor])
    assert.equal(carromBackendFileScope(carromDeployment, before, carromDeploymentAfter), false);
  assert.equal(
    carromBackendFileScope(
      'scripts/deploy-other.mjs',
      carromDeploymentBefore,
      carromDeploymentAfter,
    ),
    false,
  );
});

test('carrom deployment selects its game and server; unknown deployment edits remain blocked', () => {
  const context = carromContext([carromDeployment]);
  const fileScopes = reviewedSharedFileScopes(context);
  assert.deepEqual(
    [...fileScopes],
    [[carromDeployment, [carromDirectory, 'services/runtime-api']]],
  );
  const selected = incrementalPlan({ ...context, fileScopes, readSource: context.readHead });
  assert.equal(selected.full, false);
  assert.deepEqual(selected.game_sources, [carromDirectory]);
  assert.deepEqual(selected.browser_ids, ['carrom-club']);
  assert.deepEqual(selected.consumer_sources, [carromDirectory, 'services/runtime-api']);
  for (const changed of [
    { readHead: () => carromDeploymentAfter + 'unreviewed();\n' },
    {
      readBase: () => {
        throw new Error('Missing comparison');
      },
    },
    { games: [] },
    { games: [...carromCatalog, ...carromCatalog] },
    { games: [{ id: 'another-game', source: carromDirectory }] },
    { packages: carromPackages.filter((pkg) => pkg.dir !== 'services/runtime-api') },
  ]) {
    const invalid = { ...context, ...changed };
    const rejected = reviewedSharedFileScopes(invalid);
    assert.equal(rejected.size, 0);
    assert.throws(
      () => incrementalPlan({ ...invalid, fileScopes: rejected, readSource: invalid.readHead }),
      /scope undefined/,
    );
  }
  const sibling = carromContext(['scripts/deploy-tencent-extra.mjs']);
  assert.equal(reviewedSharedFileScopes(sibling).size, 0);
  assert.throws(
    () => incrementalPlan({ ...sibling, readSource: sibling.readHead }),
    /scope undefined/,
  );
});

test('carrom friends deployment only appends both rule files to the existing carrom copy list', () => {
  assert.equal(
    carromBackendFileScope(carromDeployment, carromDeploymentAfter, carromFriendsDeploymentAfter),
    true,
  );
  for (const after of [
    carromDeploymentAfter,
    carromFriendsDeploymentAfter + '\n',
    carromFriendsDeploymentAfter + 'unreviewed();\n',
    carromFriendsDeploymentAfter.replace('await copy(name)', 'await execute(name)'),
    carromFriendsDeploymentAfter.replace(
      carromFriendsContentFile,
      `${carromDirectory}/src/main.mjs`,
    ),
    carromFriendsDeploymentAfter.replace(
      carromFriendsCopyAddition,
      `    '${carromFriendsCoreFile}',\n`,
    ),
    carromFriendsDeploymentAfter.replace(
      carromFriendsCopyAddition,
      carromFriendsCopyAddition + carromFriendsCopyAddition,
    ),
    carromFriendsDeploymentAfter.replace(
      carromFriendsCopyAddition,
      `    '${carromFriendsContentFile}',\n    '${carromFriendsCoreFile}',\n`,
    ),
  ])
    assert.equal(carromBackendFileScope(carromDeployment, carromDeploymentAfter, after), false);
  for (const before of [
    null,
    '',
    carromDeploymentBefore,
    carromFriendsDeploymentAfter,
    carromDeploymentAfter.replace(carromContentFile, 'other-content.mjs'),
    carromDeploymentAfter + carromCopyAnchor + carromCopyAddition,
    carromDeploymentAfter + `// ${carromFriendsCoreFile}\n`,
  ])
    assert.equal(
      carromBackendFileScope(carromDeployment, before, carromFriendsDeploymentAfter),
      false,
    );
  assert.equal(
    carromBackendFileScope(
      'scripts/deploy-tencent-extra.mjs',
      carromDeploymentAfter,
      carromFriendsDeploymentAfter,
    ),
    false,
  );
});

function carromFriendsContext(changedPaths, overrides = {}) {
  return carromContext(changedPaths, {
    readBase: () => carromDeploymentAfter,
    readHead: (file) =>
      file === carromDeployment ? carromFriendsDeploymentAfter : carromSources[file],
    ...overrides,
  });
}

test('carrom friends proof preserves an existing Flick input without accepting other list changes', () => {
  const flickInput = "    'games/local/flick-arena/src',\n";
  const before = carromDeploymentAfter.replace(carromCopyAnchor, carromCopyAnchor + flickInput);
  const after = before.replace(carromCopyAddition, carromCopyAddition + carromFriendsCopyAddition);
  assert.equal(carromBackendFileScope(carromDeployment, before, after), true);
  const context = carromFriendsContext([carromDeployment], {
    readBase: () => before,
    readHead: (file) => (file === carromDeployment ? after : carromSources[file]),
  });
  const fileScopes = reviewedSharedFileScopes(context);
  assert.deepEqual(fileScopes.get(carromDeployment), [carromDirectory, 'services/runtime-api']);
  const selected = incrementalPlan({ ...context, fileScopes, readSource: context.readHead });
  assert.deepEqual(selected.browser_ids, ['carrom-club']);
  assert.deepEqual(selected.consumer_sources, [carromDirectory, 'services/runtime-api']);
  for (const changed of [
    after.replace(flickInput, ''),
    after.replace(flickInput, flickInput + flickInput),
    after.replace(flickInput, "    'games/local/other/src',\n"),
    after.replace(carromFriendsCopyAddition, `    '${carromFriendsCoreFile}',\n`),
    after + 'unreviewed();\n',
  ])
    assert.equal(carromBackendFileScope(carromDeployment, before, changed), false);
  for (const extra of [
    carromCopyAnchor + carromCopyAddition,
    carromCopyAnchor + flickInput + carromCopyAddition,
  ])
    assert.equal(carromBackendFileScope(carromDeployment, before + extra, after + extra), false);
  const unknownBefore = before.replace(flickInput, "    'games/local/other/src',\n");
  assert.equal(
    carromBackendFileScope(
      carromDeployment,
      unknownBefore,
      unknownBefore.replace(carromCopyAddition, carromCopyAddition + carromFriendsCopyAddition),
    ),
    false,
  );
});

test('cumulative runtime deployment additions select Flick, Carrom and the server', async () => {
  const { execFileSync } = await import('node:child_process');
  const base = '46493d57d1c275b976cdbd8fbc43a2d5ee2eeedf';
  const head = 'b4217ac8a6b761198acda9ddcf59846f6ccfa1ce';
  const cache = new Map();
  const read = (ref, file) => {
    const key = `${ref}:${file}`;
    if (!cache.has(key)) cache.set(key, execFileSync('git', ['show', key], { encoding: 'utf8' }));
    return cache.get(key);
  };
  const flick = { id: 'flick-arena', source: 'games/local/flick-arena' };
  const context = carromContext([carromDeployment], {
    games: [...carromCatalog, flick],
    packages: [...carromPackages, { name: 'flick', dir: flick.source }],
    readBase: (file) => read(base, file),
    readHead: (file) => read(head, file),
  });
  const fileScopes = reviewedSharedFileScopes(context);
  const consumers = [flick.source, carromDirectory, 'services/runtime-api'];
  const selected = incrementalPlan({ ...context, fileScopes, readSource: () => '' });
  assert.deepEqual(fileScopes.get(carromDeployment), consumers);
  assert.equal(selected.full, false);
  assert.deepEqual(selected.browser_ids, ['carrom-club', 'flick-arena']);
  assert.deepEqual(selected.consumer_sources, consumers);
  const after = context.readHead(carromDeployment);
  const flickInput = "    'games/local/flick-arena/src',\n";
  for (const changed of [
    after + 'unreviewed();\n',
    after.replace(flickInput, flickInput + flickInput),
    after.replace(flickInput, "    'games/local/other/src',\n"),
    after.replace(carromFriendsContentFile, `${carromDirectory}/src/main.mjs`),
    after.replace(carromFriendsCopyAddition, ''),
    after.replace(carromCopyAddition, ''),
  ]) {
    const invalid = {
      ...context,
      readHead: (file) => (file === carromDeployment ? changed : context.readHead(file)),
    };
    const rejected = reviewedSharedFileScopes(invalid);
    assert.equal(rejected.has(carromDeployment), false);
    assert.throws(
      () => incrementalPlan({ ...invalid, fileScopes: rejected, readSource: () => '' }),
      /scope undefined/,
    );
  }
  for (const invalid of [
    { games: carromCatalog },
    { games: [...context.games, flick] },
    { games: [flick] },
    { packages: context.packages.filter((pkg) => pkg.dir !== 'services/runtime-api') },
    { readBase: () => context.readBase(carromDeployment) + '\n' },
    { readBase: () => after, readHead: context.readBase },
    {
      readHead: (file) =>
        file === carromApp ? `/* ${context.readHead(file)} */` : context.readHead(file),
    },
    { changedPaths: ['scripts/deploy-tencent-extra.mjs'] },
  ])
    assert.equal(reviewedSharedFileScopes({ ...context, ...invalid }).size, 0);
});

test('friends deployment and engine changes select their real consumers only with executable inputs', () => {
  for (const file of [carromDeployment, carromFriendsCoreFile, carromFriendsContentFile]) {
    const context = carromFriendsContext([file]);
    const fileScopes = reviewedSharedFileScopes(context);
    const consumers =
      file === carromDeployment
        ? [carromDirectory, 'services/runtime-api']
        : ['services/runtime-api'];
    assert.deepEqual([...fileScopes], [[file, consumers]]);
    const selected = incrementalPlan({ ...context, fileScopes, readSource: context.readHead });
    assert.equal(selected.full, false);
    assert.deepEqual(selected.consumer_sources, consumers);
    assert.deepEqual(selected.game_sources, [carromDirectory]);
    assert.deepEqual(selected.browser_ids, ['carrom-club']);
  }

  const invalidInputs = [
    [carromFriendsCoreFile, null],
    [carromFriendsContentFile, null],
    [carromApp, null],
    [
      carromFriendsCoreFile,
      carromSources[carromFriendsCoreFile].replace('./core.mjs', './other.mjs'),
    ],
    [
      carromFriendsCoreFile,
      carromSources[carromFriendsCoreFile].replace(
        'import { FRIEND_LEVELS }',
        '// import { FRIEND_LEVELS }',
      ),
    ],
    [carromFriendsContentFile, '// export const FRIEND_LEVELS = [];\n'],
    [
      carromApp,
      carromSources[carromApp].replace(carromFriendsCoreFile, `${carromDirectory}/src/main.mjs`),
    ],
    [carromApp, carromSources[carromApp].replace('import.meta.url', "'https://example.com/'")],
    [
      carromApp,
      carromSources[carromApp].replace('await import(carromUrl)', "'await import(carromUrl)'"),
    ],
    [
      carromApp,
      carromSources[carromApp].replace('await import(levelsUrl)', 'await import(otherUrl)'),
    ],
    [carromApp, `/* ${carromSources[carromApp]} */`],
  ];
  for (const [invalidFile, source] of invalidInputs) {
    const context = carromFriendsContext([carromDeployment], {
      readHead: (file) => {
        if (file === invalidFile) {
          if (source === null) throw new Error('Missing engine input');
          return source;
        }
        return file === carromDeployment ? carromFriendsDeploymentAfter : carromSources[file];
      },
    });
    const fileScopes = reviewedSharedFileScopes(context);
    assert.equal(fileScopes.size, 0, `Reject ${invalidFile}: ${source}`);
    assert.throws(
      () => incrementalPlan({ ...context, fileScopes, readSource: context.readHead }),
      /scope undefined/,
    );
  }
  const sibling = carromFriendsContext(['scripts/deploy-tencent-extra.mjs']);
  assert.equal(reviewedSharedFileScopes(sibling).size, 0);
  assert.throws(
    () => incrementalPlan({ ...sibling, readSource: sibling.readHead }),
    /scope undefined/,
  );
});

test('shared carrom rule inputs select the real authoritative server without unrelated consumers', () => {
  for (const file of [carromCoreFile, carromContentFile]) {
    const context = carromContext([file]);
    const fileScopes = reviewedSharedFileScopes(context);
    assert.deepEqual([...fileScopes], [[file, ['services/runtime-api']]]);
    const selected = incrementalPlan({ ...context, fileScopes, readSource: context.readHead });
    assert.deepEqual(selected.consumer_sources, ['services/runtime-api']);
    assert.deepEqual(selected.game_sources, [carromDirectory]);
    if (file === carromCoreFile)
      assert.equal(selected.browser, false, 'Pure physics rules stay browser-free');
  }
  const sibling = carromContext([`${carromDirectory}/src/render.mjs`]);
  assert.equal(reviewedSharedFileScopes(sibling).size, 0);
  for (const falseImport of [
    `// import { createGame } from '../../../${carromCoreFile}';\n`,
    `const example = "import { createGame } from '../../../${carromCoreFile}';";\n`,
    "import { createGame } from '../../../games/local/other/src/core.mjs';\n",
  ]) {
    const context = carromContext([carromCoreFile], {
      readHead: (file) => (file === carromBackendRule ? falseImport : carromSources[file]),
    });
    assert.equal(reviewedSharedFileScopes(context).size, 0);
  }
});

test('three choose two migration wiring is exact and does not authorize other deployment edits', () => {
  const oldPlatform = "const unrelated = 'keep';\n    '011-competition-profiles.sql',\n";
  const newPlatform = oldPlatform.replace(
    "    '011-competition-profiles.sql',\n",
    "    '011-competition-profiles.sql',\n    '012-three-choose-two.sql',\n",
  );
  assert.equal(
    threeChooseTwoBackendFileScope('scripts/platform.mjs', oldPlatform, newPlatform),
    true,
  );
  for (const after of [
    newPlatform + '\n',
    newPlatform.replace('keep', 'changed'),
    newPlatform.replace('012-', '013-'),
    newPlatform + "    '012-three-choose-two.sql',\n",
  ])
    assert.equal(threeChooseTwoBackendFileScope('scripts/platform.mjs', oldPlatform, after), false);
  assert.equal(
    threeChooseTwoBackendFileScope('scripts/unknown-deploy.mjs', oldPlatform, newPlatform),
    false,
  );
  const migration = readFileSync(
    new URL('../infra/migrations/012-three-choose-two.sql', import.meta.url),
    'utf8',
  ).replaceAll('\r\n', '\n');
  assert.equal(
    threeChooseTwoBackendFileScope('infra/migrations/012-three-choose-two.sql', null, migration),
    true,
  );
  assert.equal(
    threeChooseTwoBackendFileScope('infra/migrations/012-three-choose-two.sql', '', migration),
    false,
  );
  assert.equal(
    threeChooseTwoBackendFileScope(
      'infra/migrations/012-three-choose-two.sql',
      null,
      migration + '\n',
    ),
    false,
  );
  assert.equal(
    threeChooseTwoBackendFileScope('infra/migrations/013-other.sql', null, migration),
    false,
  );
});

const games = Object.entries(competitionConsumers).map(([id, source]) => ({ id, source }));
const registry =
  'export const competitionGames = ' +
  JSON.stringify(
    Object.fromEntries(
      games.map(({ id, source }) => [
        id,
        { directory: source, renderer: 'renderer.js', title: id },
      ]),
    ),
    null,
    2,
  ) +
  ';';
const packages = [
  ...games.map(({ id, source }) => ({ name: id, dir: source })),
  ...[
    'apps/shell-web',
    'services/runtime-api',
    'apps/shell-minigame',
    'platforms/wechat',
    'platforms/bilibili',
    'platforms/douyin',
    'platforms/kuaishou',
  ].map((dir) => ({ name: dir, dir })),
];
function classify(file, before, after, more = {}) {
  return reviewedSharedFileScopes({
    changedPaths: [file],
    games,
    readBase: () => before,
    readHead: (name) => (name === file ? after : (more[name] ?? registry)),
  });
}
function plan(paths, fileScopes) {
  return incrementalPlan({
    changedPaths: paths,
    packages,
    games,
    fileScopes,
    readSource: () => '',
  });
}

test('the native gate variable wiring is exact and cannot authorize other CI changes', async () => {
  const { execFileSync } = await import('node:child_process');
  const file = '.github/workflows/ci.yml';
  const before = execFileSync('git', ['show', `695b8043cd2d8b5c35e161719830d5ce7d30d871:${file}`], {
    encoding: 'utf8',
  });
  const anchor = '    env:\n      KART_PREBUILT_DIR:';
  const after = before.replace(
    anchor,
    "    env:\n      MINIGAME_RELEASE_GATES: ${{ vars.MINIGAME_RELEASE_GATES || '0' }}\n      KART_PREBUILT_DIR:",
  );
  assert.deepEqual(classify(file, before, after).get(file), []);
  for (const bad of [
    after + '\n',
    after.replace("|| '0'", "|| '1'"),
    after.replace('pnpm check:games', 'echo skipped'),
  ])
    assert.equal(classify(file, before, bad).has(file), false);
});

test('CI timeout growth is a bounded configuration change; commands, conditions and reduced budgets block', () => {
  const file = '.github/workflows/ci.yml';
  const before =
    'jobs:\n  quality:\n    timeout-minutes: 20\n    steps:\n      - run: pnpm check:games\n';
  const after = before.replace('20', '40');
  const scopes = classify(file, before, after);
  assert.deepEqual(scopes.get(file), []);
  assert.equal(plan([file], scopes).competition.config_tests, true);
  assert.equal(plan([file], scopes).validation_tools, true);
  for (const bad of [
    after.replace('check:games', 'echo skipped'),
    after.replace('40', '19'),
    after.replace('40', '361'),
    after + '    if: false\n',
    after + '    timeout-minutes: 50\n',
  ]) {
    const rejected = classify(file, before, bad);
    assert.equal(rejected.has(file), false);
    assert.throws(() => plan([file], rejected), /scope undefined/);
  }
});

test('only additive local machine configuration ignores are accepted; source exclusions and negations block', () => {
  const file = '.gitignore',
    before = 'node_modules/\ndist/\n';
  const allowed = classify(
    file,
    before,
    before + '# local\n.codex/config.toml\n.mcp.json.backup.*\n',
  );
  assert.deepEqual(allowed.get(file), []);
  assert.equal(plan([file], allowed).validation_tools, true);
  for (const after of [
    before + 'games/\n',
    before + '!dist/\n',
    'dist/\nnode_modules/\n.codex/config.toml\n',
    before + '.codex/config.toml\n.codex/config.toml\n',
    'node_modules/\n.codex/config.toml\n',
  ])
    assert.equal(classify(file, before, after).has(file), false);
});

test('format exclusions must point to registered byte-identical fullscreen copies with checked sync entries', () => {
  const file = '.prettierignore',
    before = 'node_modules/\n';
  const copy = games[0].source + '/public/fullscreen.js';
  const extra = {
    [copy]: 'canonical',
    'platforms/h5/fullscreen.js': 'canonical',
    'scripts/sync-h5-fullscreen.mjs': `const copies = ['${copy}'];`,
  };
  assert.deepEqual(classify(file, before, before + copy + '\n', extra).get(file), [
    games[0].source,
  ]);
  for (const [after, more] of [
    [before + copy + '\n', { ...extra, [copy]: 'modified' }],
    [before + copy + '\n', { ...extra, 'scripts/sync-h5-fullscreen.mjs': '' }],
    [before + 'games/local/unknown/public/fullscreen.js\n', extra],
    [before + games[0].source + '/src/app.js\n', extra],
  ])
    assert.equal(classify(file, before, after, more).has(file), false);
});

test('competition shared paths select exactly five registry consumers, while letter tests select one game', () => {
  for (const file of [
    'platforms/competition/h5.js',
    'platforms/competition/native.js',
    'scripts/competition-build.mjs',
    'scripts/competition-native-smoke.mjs',
    'scripts/test-competition-dialogs.mjs',
  ]) {
    const scopes = classify(
      file,
      '',
      file === 'scripts/competition-build.mjs' ? registry : 'new implementation',
    );
    assert.deepEqual(scopes.get(file), Object.values(competitionConsumers));
    const result = plan([file], scopes);
    // competition-build imports native.js only for native entries; the H5 branch
    // imports h5.js. Native contracts remain selected without H5 browser targets.
    assert.deepEqual(
      result.browser_ids,
      file === 'platforms/competition/native.js' ? [] : games.map((game) => game.id).sort(),
    );
    assert.equal(result.full, false);
    assert.equal(result.competition.letters, true);
    const native = [
      'platforms/competition/native.js',
      'scripts/competition-build.mjs',
      'scripts/competition-native-smoke.mjs',
    ].includes(file);
    assert.equal(result.competition.native, native);
    assert.equal(result.consumer_sources.includes('platforms/wechat'), native);
  }
  for (const file of [
    'scripts/letters-words2-competition-mobile.browser.mjs',
    'scripts/letters-words2-competition-renderer.test.mjs',
    'scripts/letters-words2-iframe.browser.mjs',
  ]) {
    const scopes = classify(file, '', 'new test');
    const result = plan([file], scopes);
    assert.deepEqual(result.browser_ids, ['letters-words2']);
    assert.equal(result.competition.letters, true);
    assert.equal(result.competition.native, false);
  }
  assert.throws(() => plan(['platforms/competition/new.js'], new Map()), /scope undefined/);
});

test('new or renamed competition consumers and missing native packages remain classification gaps', () => {
  const file = 'platforms/competition/h5.js';
  for (const altered of [
    registry.replace('"cops-robbers":', '"unknown":'),
    registry.replace('games/local/cops-robbers', 'games/local/unmapped'),
    registry.replace('"title":', '"other":'),
  ])
    assert.equal(
      classify(file, '', 'changed', { 'scripts/competition-build.mjs': altered }).has(file),
      false,
    );
  assert.throws(
    () =>
      competitionToolPlan({
        paths: ['platforms/competition/native.js'],
        games,
        packages: [],
        fileScopes: new Map([
          ['platforms/competition/native.js', Object.values(competitionConsumers)],
        ]),
      }),
    /Missing competition consumer/,
  );
});

test('shared dependency closure and explicit shared-runtime consumers are combined', () => {
  const file = 'platforms/competition/h5.js';
  const scopes = classify(file, '', 'changed');
  const result = incrementalPlan({
    changedPaths: [file, 'packages/shared/index.js'],
    fileScopes: scopes,
    games,
    packages: [...packages, { name: 'shared', dir: 'packages/shared' }],
    readSource: () => '',
  });
  assert.deepEqual(result.browser_ids, games.map((game) => game.id).sort());
});

test('competition runner builds each native game on all default platforms before its real smoke and propagates failures', async () => {
  const calls = [];
  await executeCompetitionChecks({
    plan: { h5: true, native: true, letters: true },
    env: { KEEP: 'yes', PLAYWRIGHT_EXECUTABLE_PATH: '/browser' },
    execute: async (args, env) => calls.push({ args, env }),
    serve: async () => ({
      url: 'http://fixture/',
      close: async () => calls.push({ closed: true }),
    }),
  });
  const ids = Object.keys(competitionConsumers);
  for (let i = 0; i < ids.length; i++) {
    assert.deepEqual(calls[i * 2].args, [
      'scripts/competition-build.mjs',
      '--native',
      `--game=${ids[i]}`,
    ]);
    assert.deepEqual(calls[i * 2 + 1].args, [
      'scripts/competition-native-smoke.mjs',
      `--game=${ids[i]}`,
    ]);
  }
  assert.deepEqual(
    calls.slice(10, 14).map((call) => call.args[0]),
    [
      'scripts/test-competition-dialogs.mjs',
      'scripts/letters-words2-competition-renderer.test.mjs',
      'scripts/letters-words2-competition-mobile.browser.mjs',
      'scripts/letters-words2-iframe.browser.mjs',
    ],
  );
  assert.equal(calls[13].env.GAME_URL, 'http://fixture/');
  assert.equal(calls[13].env.PLAYWRIGHT_EXECUTABLE, '/browser');
  assert.equal(calls[13].env.KEEP, 'yes');
  assert.equal(calls[14].closed, true);
  let closed = false;
  await assert.rejects(
    () =>
      executeCompetitionChecks({
        plan: { h5: false, native: false, letters: true },
        execute: async (args) => {
          if (args[0].includes('iframe')) throw new Error('real assertion failed');
        },
        serve: async () => ({
          url: 'http://fixture/',
          close: async () => {
            closed = true;
          },
        }),
      }),
    /real assertion failed/,
  );
  assert.equal(closed, true);
  let count = 0;
  await assert.rejects(
    () =>
      executeCompetitionChecks({
        plan: { h5: false, native: true, letters: false },
        execute: async () => {
          count++;
          throw new Error('build failed');
        },
      }),
    /build failed/,
  );
  assert.equal(count, 1);
});

test('developer-mode exact legacy-to-immersive migration selects new guarded entries without accepting shared edits', () => {
  const file = 'scripts/test-game-dev-mode.mjs';
  const link = `        assert.equal(\n          await page.getByRole('link', { name: '独立打开' }).getAttribute('href'),\n          await page.locator('iframe').getAttribute('src'),\n        );`;
  const suffix = '\n  await page.goto(`${origin}/independent/wulong-city/?dev`);\n';
  const before = 'const shared = 1;\n' + link + suffix;
  const after = `const shared = 1;\n        if (\n          game.id === 'letters-words2' ||\n          game.id === 'xiangqi-five'\n        ) {\n          await expect(page.locator('.standalone-page')).toHaveAttribute('data-immersive', 'true');\n          await expect(page.getByRole('button', { name: '返回目录', exact: true })).toHaveCount(1);\n          await expect(page.getByRole('link', { name: '独立打开' })).toHaveCount(0);\n        } else {\n${link
    .split('\n')
    .map((line) => '  ' + line)
    .join('\n')}\n        }${suffix}  await page.locator('#start-game').tap();\n`;
  const allGames = [...games, { id: 'wulong-city', source: 'games/local/wulong-city' }];
  const context = {
    changedPaths: [file],
    readBase: () => before,
    readHead: () => after,
    games: allGames,
  };
  assert.deepEqual(
    developerModeFileScopes(context).get(file),
    allGames
      .filter((game) => ['letters-words2', 'xiangqi-five', 'wulong-city'].includes(game.id))
      .map((game) => game.source),
  );
  for (const changed of [
    after.replace('shared = 1', 'shared = 2'),
    after.replace('toHaveCount(1)', 'toHaveCount(0)'),
    after.replace("getAttribute('src')", "getAttribute('wrong')"),
  ])
    assert.equal(developerModeFileScopes({ ...context, readHead: () => changed }).has(file), false);
});

test('planning checkout scope accepts only both exact reviewed producer byte changes', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const base = '9180c805c77c15634f47f0aeee1092a5b1043a73';
  const anchor =
    '      - uses: actions/checkout@v5\n        with:\n          fetch-depth: 0\n      - uses: actions/setup-node@v6\n';
  for (const file of ['.github/workflows/ci.yml', '.github/workflows/pages.yml']) {
    const before = execFileSync('git', ['show', `${base}:${file}`], {
      cwd: root,
      encoding: 'utf8',
    });
    const after = before.replace(
      anchor,
      anchor.replace(
        '          fetch-depth: 0\n',
        '          fetch-depth: 0\n          submodules: recursive\n',
      ),
    );
    const scopes = classify(file, before, after);
    assert.deepEqual(scopes.get(file), []);
    assert.equal(plan([file], scopes).validation_tools, true);
    assert.deepEqual(plan([file], scopes).nine_native_targets, []);
    for (const bad of [
      after + '\n',
      after.replace('recursive', 'false'),
      after.replace('fetch-depth: 0', 'fetch-depth: 1'),
      after + '\npermissions:\n  contents: write\n',
      after.replace('node-version: 24.21.0', 'node-version: 22'),
    ]) {
      assert.equal(classify(file, before, bad).has(file), false);
    }
    assert.equal(classify(file, before + '\n', after).has(file), false);
    assert.equal(classify(file, after, before).has(file), false);
  }
});

test('planning checkout narrows both real producers to one locked gitlink without changing other execution', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const original =
    '      - uses: actions/checkout@v5\n        with:\n          fetch-depth: 0\n      - uses: actions/setup-node@v6\n';
  const recursive =
    '      - uses: actions/checkout@v5\n        with:\n          fetch-depth: 0\n          submodules: recursive\n      - uses: actions/setup-node@v6\n';
  const locked =
    '      - uses: actions/checkout@v5\n        with:\n          fetch-depth: 0\n      - name: Read locked Xiangqi workspace for planning\n        run: |\n          git -c url.https://github.com/.insteadOf=git@github.com: submodule update --init -- games/submodules/xiangqi-five\n      - uses: actions/setup-node@v6\n';
  for (const [base, anchor] of [
    ['9180c805c77c15634f47f0aeee1092a5b1043a73', original],
    ['d75a26ff456d088745d05b499f86872169ae8bc2', recursive],
  ]) {
    for (const file of ['.github/workflows/ci.yml', '.github/workflows/pages.yml']) {
      const before = execFileSync('git', ['show', `${base}:${file}`], {
        cwd: root,
        encoding: 'utf8',
      });
      assert.equal(before.split(anchor).length, 2);
      const after = before.replace(anchor, locked);
      const scopes = classify(file, before, after);
      assert.deepEqual(scopes.get(file), []);
      assert.equal(plan([file], scopes).validation_tools, true);
      assert.deepEqual(plan([file], scopes).nine_native_targets, []);
      for (const bad of [
        after + '\n',
        after.replace('--init --', '--init --remote --'),
        after.replace(' -- games/submodules/xiangqi-five', ''),
        after.replace('games/submodules/xiangqi-five', 'games/submodules/office-slacking'),
        after.replace('node-version: 24.21.0', 'node-version: 22'),
      ])
        assert.equal(classify(file, before, bad).has(file), false);
      assert.equal(classify(file, before + '\n', after).has(file), false);
    }
  }
});

test('Pages logic history repair preserves all other jobs and execution bytes', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const file = '.github/workflows/pages-validate.yml';
  const before = execFileSync('git', ['show', `654a0acf72cb76748c7bc8df82ba06916b2c303d:${file}`], {
    cwd: root,
    encoding: 'utf8',
  });
  const offset = before.indexOf('  logic:\n');
  const anchor =
    '      - uses: actions/checkout@v5\n        with:\n          submodules: recursive\n';
  const after =
    before.slice(0, offset) +
    before.slice(offset).replace(anchor, anchor + '          fetch-depth: 0\n');
  const scopes = classify(file, before, after);
  assert.deepEqual(scopes.get(file), []);
  assert.equal(plan([file], scopes).validation_tools, true);
  assert.deepEqual(plan([file], scopes).nine_native_targets, []);
  for (const bad of [
    after + '\n',
    after.replace('fetch-depth: 0', 'fetch-depth: 1'),
    after.replace('pnpm check:games', 'echo skipped'),
    after.replace('timeout-minutes: 40', 'timeout-minutes: 1'),
    before.replace(anchor, anchor + '          fetch-depth: 0\n'),
  ])
    assert.equal(classify(file, before, bad).has(file), false);
  assert.equal(classify(file, before + '\n', after).has(file), false);
});

test('bare planning jobs install only the reviewed pinned parser without changing gates', async () => {
  const { readFileSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  for (const file of ['.github/workflows/ci.yml', '.github/workflows/pages.yml']) {
    const before = execFileSync(
      'git',
      ['show', `c83e51299219c969c934618ca76fe0ae77f0eaa3:${file}`],
      { encoding: 'utf8' },
    );
    const after = execFileSync(
      'git',
      ['show', `695b8043cd2d8b5c35e161719830d5ce7d30d871:${file}`],
      { encoding: 'utf8' },
    );
    assert.deepEqual(classify(file, before, after).get(file), []);
    for (const bad of [
      after.replace('--ignore-scripts ', ''),
      after.replace('prettier@$parser_version', 'prettier@latest'),
      after + '\n# unreviewed execution boundary\n',
      after.replace('node scripts/pages-test-scope.mjs', 'echo skipped'),
    ])
      assert.equal(classify(file, before, bad).has(file), false);
    assert.equal(classify(file, before + '\n# unknown baseline\n', after).has(file), false);
  }
});

test('reviewed quality budget can be planned without installed YAML dependencies', async () => {
  const { execFileSync } = await import('node:child_process');
  const { mkdtemp, copyFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const file = '.github/workflows/ci.yml';
  const before = execFileSync('git', ['show', 'e37783aef3042289d9cfbb7f4b0badb6a106f6d8:' + file], {
    encoding: 'utf8',
  });
  const after = execFileSync('git', ['show', '82b4e4c30c74f082b52b9a5ef95facbca2e49508:' + file], {
    encoding: 'utf8',
  });
  assert.equal(after, before.replace('    timeout-minutes: 40\n', '    timeout-minutes: 60\n'));
  const directory = await mkdtemp(join(tmpdir(), 'quality-budget-no-deps-'));
  try {
    for (const module of ['publication-scopes.mjs', 'vite-patch-scope.mjs'])
      await copyFile(new URL(module, import.meta.url), join(directory, module));
    const code = `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      import { reviewedSharedFileScopes } from './publication-scopes.mjs';
      assert.throws(() => createRequire(import.meta.url).resolve('js-yaml'));
      const before = ${JSON.stringify(before)};
      const after = ${JSON.stringify(after)};
      const classify = (old, current) => reviewedSharedFileScopes({
        changedPaths: [${JSON.stringify(file)}], games: [],
        readBase: () => old, readHead: () => current,
      });
      assert.deepEqual(classify(before, after).get(${JSON.stringify(file)}), []);
      for (const [old, current] of [
        [before + '\\n', after], [before, after + '\\n'],
        [before, after.replace('timeout-minutes: 60', 'timeout-minutes: 61')],
        [before, after.replace('node scripts/ci-validation.mjs', 'echo skipped')],
        [before, after + '\\npermissions:\\n  contents: write\\n'],
      ]) assert.equal(classify(old, current).has(${JSON.stringify(file)}), false);
    `;
    execFileSync(process.execPath, ['--input-type=module', '-e', code], {
      cwd: directory,
      env: { ...process.env, NODE_PATH: '' },
      stdio: 'pipe',
      encoding: 'utf8',
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('cache writer reduction has an exact dependency-free scope and rejects unrelated workflow changes', async () => {
  const { execFileSync } = await import('node:child_process');
  const { mkdtemp, copyFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'cache-scope-no-deps-'));
  try {
    for (const module of ['publication-scopes.mjs', 'vite-patch-scope.mjs'])
      await copyFile(new URL(module, import.meta.url), join(directory, module));
    for (const file of ['.github/workflows/ci.yml', '.github/workflows/pages-validate.yml']) {
      const before = execFileSync(
        'git',
        ['show', '82b4e4c30c74f082b52b9a5ef95facbca2e49508:' + file],
        { encoding: 'utf8' },
      );
      const after = execFileSync(
        'git',
        ['show', '4fe9716ce5b9277e42b976e005931f6e8c7dc2f3:' + file],
        { encoding: 'utf8' },
      );
      assert.deepEqual(classify(file, before, after).get(file), []);
      assert.equal(plan([file], classify(file, before, after)).validation_tools, true);
      const code = `
        import assert from 'node:assert/strict';
        import { createRequire } from 'node:module';
        import { reviewedSharedFileScopes } from './publication-scopes.mjs';
        assert.throws(() => createRequire(import.meta.url).resolve('js-yaml'));
        const before = ${JSON.stringify(before)}, after = ${JSON.stringify(after)};
        const classify = (old, current) => reviewedSharedFileScopes({ changedPaths: [${JSON.stringify(file)}], games: [], readBase: () => old, readHead: () => current });
        assert.deepEqual(classify(before, after).get(${JSON.stringify(file)}), []);
        for (const [old, current] of [
          [before + '\\n', after], [before, after + '\\n'],
          [before, after.replace("github.event_name == 'push'", "github.event_name != 'push'")],
          [before, after.replace('pnpm check:games', 'echo skipped')],
          [before, after + '\\npermissions:\\n  actions: write\\n'],
        ]) assert.equal(classify(old, current).has(${JSON.stringify(file)}), false);
      `;
      execFileSync(process.execPath, ['--input-type=module', '-e', code], {
        cwd: directory,
        env: { ...process.env, NODE_PATH: '' },
        stdio: 'pipe',
        encoding: 'utf8',
      });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('cumulative main workflow repairs retain exact reviewed producer boundaries', async () => {
  const { execFileSync } = await import('node:child_process');
  for (const file of ['.github/workflows/ci.yml', '.github/workflows/pages.yml']) {
    const read = (ref) => execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8' });
    const before = read('b551fe6e7d7f2bc1229e2e1d44666a878eec5a07');
    const after = read('bc3b386c435edc0e126f38065d4c496a10488c46');
    const scope = classify(file, before, after);
    assert.deepEqual(scope.get(file), []);
    assert.equal(plan([file], scope).validation_tools, true);
    for (const bad of [
      after + '\n',
      after.replace('--ignore-scripts ', ''),
      after.replace('fetch-depth: 0', 'fetch-depth: 1'),
      after + '\npermissions:\n  contents: write\n',
      after.replace('prettier@$parser_version', 'prettier@latest'),
    ])
      assert.equal(classify(file, before, bad).has(file), false);
    if (file.endsWith('ci.yml'))
      assert.equal(
        classify(
          file,
          before,
          after.replace("MINIGAME_RELEASE_GATES || '0'", "MINIGAME_RELEASE_GATES || '1'"),
        ).has(file),
        false,
      );
    assert.equal(classify(file, before + '\n', after).has(file), false);
  }
});
const cageSource = 'games/local/cage-rescue';
const cageChecksFile = 'apps/shell-web/scripts/game-checks/cage-rescue.mjs';
const sharedChecksFile = 'apps/shell-web/scripts/standalone-game-checks.mjs';
test('Tower expanded-level contract checks its game and rejects unrelated or weakened assertions', () => {
  const after = execFileSync(
    'git',
    ['show', '99904a43aee15199a9db387412bb7baff41e4e28:' + sharedChecksFile],
    { encoding: 'utf8' },
  );
  const before = after
    .replace("button[data-level]')).toHaveCount(30)", "button[data-level]')).toHaveCount(8)")
    .replace(
      '    await expect(frame.locator(\'#levels-screen button[data-level="0"]\')).toBeEnabled();\n',
      '',
    )
    .replace(
      '    await expect(frame.locator(\'#levels-screen button[data-level="29"]\')).toBeDisabled();\n',
      '',
    );
  const context = {
    changedPaths: [sharedChecksFile],
    games: [{ id: 'tower-brake', source: 'games/local/tower-brake' }],
    readBase: () => before,
    readHead: () => after,
  };
  assert.deepEqual(
    [...reviewedSharedFileScopes(context)],
    [[sharedChecksFile, ['games/local/tower-brake']]],
  );
  const plan = incrementalPlan({
    ...context,
    packages: [{ dir: 'games/local/tower-brake', name: '@fixture/tower-brake' }],
    fileScopes: reviewedSharedFileScopes(context),
    readSource: () => '',
  });
  assert.deepEqual(plan.browser_ids, ['tower-brake']);
  assert.equal(plan.full, false);
  for (const invalid of [
    after.replace('toHaveCount(30)', 'toHaveCount(8)'),
    after.replace('data-level="29"]\')).toBeDisabled()', 'data-level="29"]\')).toBeEnabled()'),
    after.replace("id === 'tower-brake'", "id === 'another-game'"),
    after + 'globalThis.injected = true;\n',
  ])
    assert.equal(reviewedSharedFileScopes({ ...context, readHead: () => invalid }).size, 0);
  assert.equal(reviewedSharedFileScopes({ ...context, readBase: () => before + '\n' }).size, 0);
  assert.equal(reviewedSharedFileScopes({ ...context, games: [] }).size, 0);
  assert.equal(
    reviewedSharedFileScopes({ ...context, games: [...context.games, ...context.games] }).size,
    0,
  );
});
test('cops start-to-play guard keeps a single-game scope and rejects changes outside its exact assertions', () => {
  const oldGuard = `  } else if (id === 'cops-robbers') {
    await expect(frame.locator('#level-dialog')).toBeVisible();
    await click(frame.getByTestId('level-button-1'));
`;
  const newGuard = `  } else if (id === 'cops-robbers') {
    await expect(frame.locator('#level-dialog')).toBeHidden();
    await expect(frame.locator('body')).toHaveAttribute('data-level', '1');
`;
  const before =
    'export async function assertStandaloneGameplay(frame, id, mobile = false) {\n' +
    "  if (id === 'other') {\n    await frame.locator('canvas').click();\n" +
    oldGuard +
    "    await expect(frame.locator('#board')).toBeVisible();\n  }\n}\n";
  const after = before.replace(oldGuard, newGuard);
  const context = {
    changedPaths: [sharedChecksFile],
    games: [{ id: 'cops-robbers', source: 'games/local/cops-robbers' }],
    readBase: () => before,
    readHead: () => after,
  };
  assert.deepEqual(
    [...reviewedSharedFileScopes(context)],
    [[sharedChecksFile, ['games/local/cops-robbers']]],
  );
  const realAfter = readFileSync(
    new URL('../' + sharedChecksFile, import.meta.url),
    'utf8',
  ).replaceAll('\r\n', '\n');
  assert.equal(realAfter.split(newGuard).length, 2);
  assert.deepEqual(
    [
      ...reviewedSharedFileScopes({
        ...context,
        readBase: () => realAfter.replace(newGuard, oldGuard),
        readHead: () => realAfter,
      }),
    ],
    [[sharedChecksFile, ['games/local/cops-robbers']]],
  );
  for (const invalid of [
    after.replace("'data-level', '1'", "'data-level', '120'"),
    after.replace("id === 'cops-robbers'", "id !== 'cops-robbers'"),
    after.replace("locator('canvas').click()", "locator('canvas').tap()"),
    after + 'globalThis.injected = true;\n',
    after.replace(newGuard, newGuard + newGuard),
  ])
    assert.equal(reviewedSharedFileScopes({ ...context, readHead: () => invalid }).size, 0);
  const commentedBefore = `/*\n${before}*/\n`;
  assert.equal(
    reviewedSharedFileScopes({
      ...context,
      readBase: () => commentedBefore,
      readHead: () => commentedBefore.replace(oldGuard, newGuard),
    }).size,
    0,
  );
  for (const suffix of [
    `/*\n${oldGuard}*/\n`,
    `function unrelated(frame, id) {\n  if (id === 'other') {\n${oldGuard}  }\n}\n`,
  ]) {
    const wrongAnchor = after + suffix;
    assert.equal(
      reviewedSharedFileScopes({
        ...context,
        readBase: () => wrongAnchor,
        readHead: () => wrongAnchor.replace(oldGuard, newGuard),
      }).size,
      0,
    );
  }
  const nestedBefore =
    'export async function assertStandaloneGameplay(frame, id, mobile = false) {\n' +
    "  async function unrelated(frame, id) {\n    if (id === 'other') {\n" +
    oldGuard +
    '    }\n  }\n}\n';
  assert.equal(
    reviewedSharedFileScopes({
      ...context,
      readBase: () => nestedBefore,
      readHead: () => nestedBefore.replace(oldGuard, newGuard),
    }).size,
    0,
  );
  assert.equal(reviewedSharedFileScopes({ ...context, games: [] }).size, 0);
  assert.equal(
    reviewedSharedFileScopes({ ...context, games: [...context.games, ...context.games] }).size,
    0,
  );
});
const cageEntryFile = 'apps/shell-web/scripts/standalone-game-entry.mjs';
test('Orbit masked-SVG offset repair preserves input and gameplay assertions in a single-game scope', () => {
  const before = execFileSync(
    'git',
    ['show', '036bb4d3e98cdb1c373ff3445155bcdc783ca671:' + sharedChecksFile],
    { encoding: 'utf8' },
  );
  const after = readFileSync(new URL('../' + sharedChecksFile, import.meta.url), 'utf8').replaceAll(
    '\r\n',
    '\n',
  );
  const context = {
    changedPaths: [sharedChecksFile],
    games: [{ id: 'orbit-atelier', source: 'games/local/orbit-atelier' }],
    readBase: () => before,
    readHead: () => after,
  };
  assert.deepEqual(
    [...reviewedSharedFileScopes(context)],
    [[sharedChecksFile, ['games/local/orbit-atelier']]],
  );
  for (const invalid of [
    after.replace(
      "not.toHaveAttribute('data-angle', initialAngle)",
      "toHaveAttribute('data-angle', initialAngle)",
    ),
    after.replace("id === 'orbit-atelier'", "id === 'another-game'"),
    after + 'globalThis.injected = true;\n',
    after.replace(
      'const bounds = await board.boundingBox();',
      'const bounds = await ring.boundingBox();',
    ),
  ])
    assert.equal(reviewedSharedFileScopes({ ...context, readHead: () => invalid }).size, 0);
  assert.equal(reviewedSharedFileScopes({ ...context, readBase: () => before + '\n' }).size, 0);
  for (const games of [[], [...context.games, ...context.games]])
    assert.equal(reviewedSharedFileScopes({ ...context, games }).size, 0);
});
const cageModule = readFileSync(
  new URL('../' + cageChecksFile, import.meta.url),
  'utf8',
).replaceAll('\r\n', '\n');
const cageHeader = 'export async function assertStandaloneGameplay(frame, id, mobile = false) {\n';
const cageDelegate =
  "  if (id === 'cage-rescue') {\n" +
  "    const { assertCageRescueGameplay } = await import('./game-checks/cage-rescue.mjs');\n" +
  '    return assertCageRescueGameplay(frame, mobile);\n' +
  '  }\n';
const cageBase =
  "import { expect } from '@playwright/test';\n" +
  "import { enterStandalone } from './standalone-game-entry.mjs';\n" +
  cageHeader +
  '  const click = (locator) => (mobile ? locator.tap() : locator.click());\n' +
  "  if (id === 'letters-words2') await click(frame.locator('#start'));\n" +
  '}\n';
const cageHead = cageBase.replace(cageHeader, cageHeader + cageDelegate);
const cageGames = [...games, { id: 'cage-rescue', source: cageSource }];
const cagePackages = [
  ...packages.map((pkg) =>
    pkg.dir === 'apps/shell-web' ? { ...pkg, coffeeeeffoc: { role: 'shell' } } : pkg,
  ),
  { name: 'cage-rescue', dir: cageSource },
];
function cageContext(changes = {}) {
  return {
    games: cageGames,
    changedPaths: [sharedChecksFile, cageChecksFile],
    readBase: (file) => (file === sharedChecksFile ? cageBase : ''),
    readHead: (file) =>
      file === sharedChecksFile ? cageHead : file === cageChecksFile ? cageModule : '',
    ...changes,
  };
}

test('cage rescue lazy gameplay delegation selects only its catalog source and keeps finite Shell contracts', () => {
  const context = cageContext();
  const scopes = reviewedSharedFileScopes(context);
  assert.deepEqual(
    [...scopes],
    context.changedPaths.map((file) => [file, [cageSource]]),
  );
  assert.equal(cageHead.replace(cageDelegate, ''), cageBase);
  const result = incrementalPlan({
    ...context,
    packages: cagePackages,
    fileScopes: scopes,
    readSource: context.readHead,
  });
  assert.equal(result.full, false);
  assert.deepEqual(result.browser_ids, ['cage-rescue']);
  assert.deepEqual(result.game_sources, [cageSource]);
  assert.deepEqual(
    shellContractTargets(cagePackages, context.changedPaths).map((pkg) => pkg.dir),
    ['apps/shell-web'],
  );
  assert.ok(shellContractFiles.includes('tests/standalone-immersive.integration.test.tsx'));
  assert.ok(shellContractFiles.includes('tests/play-entry.integration.test.tsx'));
});

test('dedicated gameplay module is bounded when its delegation already exists in the baseline', () => {
  const context = cageContext({
    changedPaths: [cageChecksFile],
    readBase: (file) => (file === sharedChecksFile ? cageHead : ''),
  });
  assert.deepEqual([...reviewedSharedFileScopes(context)], [[cageChecksFile, [cageSource]]]);
  const sibling = 'apps/shell-web/scripts/game-checks/unknown.mjs';
  assert.equal(
    reviewedSharedFileScopes(cageContext({ changedPaths: [sibling] })).has(sibling),
    false,
  );
});

test('gameplay proof rejects changed shared behavior, moved/duplicate delegates and unconditional imports', () => {
  const variants = [
    cageHead.replace('locator.tap()', 'locator.click()'),
    cageHead.replace("id === 'cage-rescue'", "id !== 'cage-rescue'"),
    cageHead.replace('return assertCageRescueGameplay(frame, mobile);', 'return;'),
    cageHead.replace(cageDelegate, cageDelegate + cageDelegate),
    cageHead
      .replace(cageHeader + cageDelegate, cageHeader)
      .replace("  if (id === 'letters-words2')", cageDelegate + "  if (id === 'letters-words2')"),
    "import './game-checks/cage-rescue.mjs';\n" + cageHead,
    cageHead + 'globalThis.unreviewedSharedExecution = true;\n',
    `const lookalike = ${JSON.stringify(cageHeader + cageDelegate)};\n` + cageBase,
  ];
  for (const after of variants) {
    const context = cageContext({
      readHead: (file) => (file === sharedChecksFile ? after : cageModule),
    });
    assert.equal(reviewedSharedFileScopes(context).size, 0);
  }
  assert.equal(
    reviewedSharedFileScopes(
      cageContext({
        readBase: () => {
          throw new Error('Missing baseline');
        },
      }),
    ).size,
    0,
  );
});

test('dedicated gameplay proof rejects extra dependencies and nested executable injections without executing source', () => {
  const variants = [
    cageModule.replace("'@playwright/test'", "'./unreviewed.mjs'"),
    "import 'node:child_process';\n" + cageModule,
    cageModule + 'globalThis.cageScopeInjected = true;\n',
    cageModule.replace('  const click =', "  await import('node:child_process');\n  const click ="),
    cageModule.replace(
      '  const click =',
      "  eval('globalThis.cageScopeInjected = true');\n  const click =",
    ),
    cageModule.replace('locator.tap()', 'locator.click()'),
    cageModule.replace("await click(frame.locator('#pause'));", 'return;'),
  ];
  for (const module of variants) {
    const context = cageContext({
      readHead: (file) => (file === sharedChecksFile ? cageHead : module),
    });
    assert.equal(reviewedSharedFileScopes(context).size, 0);
  }
  assert.equal(globalThis.cageScopeInjected, undefined);
});

test('single-game classification requires a unique exact catalog id/source binding', () => {
  for (const catalog of [
    games,
    [...games, { id: 'cage-rescue', source: 'games/local/other' }],
    [...games, { id: 'other', source: cageSource }],
    [...cageGames, { id: 'cage-rescue', source: cageSource }],
    [...cageGames, { id: 'alias', source: cageSource }],
  ])
    assert.equal(reviewedSharedFileScopes(cageContext({ games: catalog })).size, 0);
});

const immersiveFixtures = [
  {
    file: 'apps/shell-web/src/StandaloneGame.tsx',
    anchor: '  const immersive =\n',
    addition: "    id === 'cage-rescue' ||\n",
    before:
      "export function Host(id: string) {\n  const immersive =\n    id === 'letters-words2' ||\n    id === 'xiangqi-five';\n  if (event.source !== frame.current?.contentWindow || event.origin !== origin) return;\n  return immersive;\n}\n",
  },
  {
    file: 'apps/shell-web/scripts/pages-smoke.mjs',
    anchor: 'const immersiveGame = (id) =>\n  [\n',
    addition: "    'cage-rescue',\n",
    before:
      "const immersiveGame = (id) =>\n  [\n    'letters-words2',\n    'xiangqi-five',\n  ].includes(id);\nexport const checkOrigin = (event) => event.origin === origin;\n",
  },
  {
    file: 'apps/shell-web/tests/standalone-immersive.integration.test.tsx',
    anchor: 'it.each([\n',
    addition: "  'cage-rescue',\n",
    before:
      "it.each([\n  'letters-words2',\n  'xiangqi-five',\n])('checks display state for %s', async (id) => {\n  expect(event.origin).toBe(origin);\n});\n",
  },
  {
    file: 'apps/shell-web/tests/standalone.integration.test.tsx',
    anchor: '      if (\n',
    addition: "        id === 'cage-rescue' ||\n",
    before:
      "it('opens all standalone games', async () => {\n  for (const { id } of games) {\n      if (\n        id === 'letters-words2' ||\n        id === 'xiangqi-five'\n      ) {\n        expect(event.origin).toBe(origin);\n      }\n  }\n});\n",
  },
];

test('exact cage rescue immersion allowlist additions stay game-scoped without dropping Shell contracts', () => {
  for (const { file, before, anchor, addition } of immersiveFixtures) {
    const after = before.replace(anchor, anchor + addition);
    const context = cageContext({
      changedPaths: [file],
      readBase: () => before,
      readHead: () => after,
    });
    const scopes = reviewedSharedFileScopes(context);
    assert.deepEqual([...scopes], [[file, [cageSource]]]);
    assert.equal(after.replace(addition, ''), before);
    const result = incrementalPlan({
      ...context,
      packages: cagePackages,
      fileScopes: scopes,
      readSource: context.readHead,
    });
    assert.deepEqual(result.browser_ids, ['cage-rescue']);
    assert.deepEqual(
      shellContractTargets(cagePackages, [file]).map((pkg) => pkg.dir),
      ['apps/shell-web'],
    );
  }
});

test('immersion proof rejects origin/source changes, unsafe selectors, duplicates and lookalike strings', () => {
  for (const { file, before, anchor, addition } of immersiveFixtures) {
    const after = before.replace(anchor, anchor + addition);
    for (const bad of [
      after.replace('event.origin', 'event.otherOrigin'),
      after.replace(addition, addition + addition),
      after.replace("'cage-rescue'", "'other-game'"),
      after + '\nconsole.log("shared execution changed");\n',
      after.replace("'cage-rescue'", '(globalThis.cageScopeInjected = true)'),
    ])
      assert.equal(
        reviewedSharedFileScopes(
          cageContext({ changedPaths: [file], readBase: () => before, readHead: () => bad }),
        ).has(file),
        false,
      );
    const lookalike = 'const text = `' + before + '`;\n';
    assert.equal(
      reviewedSharedFileScopes(
        cageContext({
          changedPaths: [file],
          readBase: () => lookalike,
          readHead: () => lookalike.replace(anchor, anchor + addition),
        }),
      ).has(file),
      false,
    );
  }
  const fixture = immersiveFixtures[0];
  const after = fixture.before
    .replace(fixture.anchor, fixture.anchor + fixture.addition)
    .replace('event.source !== frame.current?.contentWindow', 'false');
  assert.equal(
    reviewedSharedFileScopes(
      cageContext({
        changedPaths: [fixture.file],
        readBase: () => fixture.before,
        readHead: () => after,
      }),
    ).has(fixture.file),
    false,
  );
});

test('new cage gameplay, entry selectors and immersion wiring compose without unrelated browser targets', () => {
  const entryBase =
    "export const markers = { 'letters-words2': '#home' };\nexport const homeControls = { 'letters-words2': '#start' };\nexport const legacyEntryIds = [];\n";
  const entryHead = entryBase
    .replace(
      "{ 'letters-words2': '#home' }",
      "{ 'letters-words2': '#home', 'cage-rescue': '#app' }",
    )
    .replace(
      "{ 'letters-words2': '#start' }",
      "{ 'letters-words2': '#start', 'cage-rescue': '#start' }",
    );
  const before = new Map([
    [sharedChecksFile, cageBase],
    [cageEntryFile, entryBase],
  ]);
  const after = new Map([
    [sharedChecksFile, cageHead],
    [cageChecksFile, cageModule],
    [cageEntryFile, entryHead],
  ]);
  for (const fixture of immersiveFixtures) {
    before.set(fixture.file, fixture.before);
    after.set(
      fixture.file,
      fixture.before.replace(fixture.anchor, fixture.anchor + fixture.addition),
    );
  }
  const context = cageContext({
    changedPaths: [...after.keys()],
    readBase: (file) => before.get(file) ?? '',
    readHead: (file) => after.get(file) ?? '',
  });
  const scopes = new Map([
    ...reviewedSharedFileScopes(context),
    ...entryAdapterFileScopes(context),
  ]);
  assert.equal(scopes.size, context.changedPaths.length);
  const result = incrementalPlan({
    ...context,
    packages: cagePackages,
    fileScopes: scopes,
    readSource: context.readHead,
  });
  assert.deepEqual(result.browser_ids, ['cage-rescue']);
  assert.deepEqual(result.game_sources, [cageSource]);
  assert.equal(result.full, false);
  assert.deepEqual(
    shellContractTargets(cagePackages, context.changedPaths).map((pkg) => pkg.dir),
    ['apps/shell-web'],
  );
});

test('Pages cage rescue home-state guard and immersion list compose while every other byte stays fixed', () => {
  const fixture = immersiveFixtures.find(
    (entry) => entry.file === 'apps/shell-web/scripts/pages-smoke.mjs',
  );
  const oldGuard =
    "      } else if (game.id === 'ball-roguelite' || game.id === 'orbit-atelier') {\n";
  const newGuard =
    '      } else if (\n' +
    "        game.id === 'cage-rescue' ||\n" +
    "        game.id === 'ball-roguelite' ||\n" +
    "        game.id === 'orbit-atelier'\n" +
    '      ) {\n';
  const body =
    "        await expect(page.locator('.standalone-page nav')).toBeVisible();\n        await expect(page.getByRole('link', { name: '独立打开' })).toHaveCount(0);\n";
  const before =
    fixture.before +
    "async function check(game) {\n      if (game.id === 'chase-thief') {\n        await checkChase();\n" +
    oldGuard +
    body +
    '      }\n}\n';
  const after = before
    .replace(fixture.anchor, fixture.anchor + fixture.addition)
    .replace(oldGuard, newGuard);
  const context = cageContext({
    changedPaths: [fixture.file],
    readBase: () => before,
    readHead: () => after,
  });
  const scopes = reviewedSharedFileScopes(context);
  assert.deepEqual([...scopes], [[fixture.file, [cageSource]]]);
  assert.equal(after.replace(fixture.addition, '').replace(newGuard, oldGuard), before);
  const result = incrementalPlan({
    ...context,
    packages: cagePackages,
    fileScopes: scopes,
    readSource: context.readHead,
  });
  assert.deepEqual(result.browser_ids, ['cage-rescue']);
  assert.deepEqual(
    shellContractTargets(cagePackages, context.changedPaths).map((pkg) => pkg.dir),
    ['apps/shell-web'],
  );
  for (const bad of [
    after.replace('toBeVisible()', 'toBeHidden()'),
    after.replace('toHaveCount(0)', 'toHaveCount(1)'),
    after.replace(newGuard, newGuard.replace("'cage-rescue'", "'another-game'")),
    after.replace(newGuard, newGuard.replace('game.id ===', 'game.id !==')),
    after.replace(newGuard, newGuard.replace('game.id', "game['id']")),
    after.replace('await checkChase();', 'return;'),
    after.replace(body, body + '        globalThis.cageScopeInjected = true;\n'),
    after.replace(fixture.addition, ''),
  ])
    assert.equal(
      reviewedSharedFileScopes({ ...context, readHead: () => bad }).has(fixture.file),
      false,
    );
  const lookalikeBefore =
    fixture.before + 'const text = `' + before.slice(fixture.before.length) + '`;\n';
  const lookalikeAfter = lookalikeBefore
    .replace(fixture.anchor, fixture.anchor + fixture.addition)
    .replace(oldGuard, newGuard);
  assert.equal(
    reviewedSharedFileScopes({
      ...context,
      readBase: () => lookalikeBefore,
      readHead: () => lookalikeAfter,
    }).has(fixture.file),
    false,
  );
});

test('castle duel entry contract is scoped without accepting another game or shared edits', () => {
  const before =
    "  } else if (id === 'castle-cannon') {\n    await expect(frame.locator('.castle-root')).toHaveAttribute('data-screen', 'playing');\n    await click(frame.locator('[data-action=\"blast\"]'));\n    await click(frame.locator('[data-action=\"pause\"]'));\n    await expect(frame.locator('.castle-root')).toHaveAttribute('data-screen', 'paused');\n    await click(frame.locator('[data-action=\"resume\"]'));\n    await expect(frame.locator('.castle-root')).toHaveAttribute('data-screen', 'playing');\n";
  const after =
    "  } else if (id === 'castle-cannon') {\n    const { assertCastleDuelEntry } = await import('./game-checks/castle-cannon.mjs');\n    return assertCastleDuelEntry(frame, mobile);\n";
  const context = {
    changedPaths: ['apps/shell-web/scripts/standalone-game-checks.mjs'],
    games: [{ id: 'castle-cannon', source: 'games/local/game-castle-cannon' }],
    readBase: () => 'prefix\n' + before + 'suffix\n',
    readHead: () => 'prefix\n' + after + 'suffix\n',
  };
  assert.deepEqual(
    [...reviewedSharedFileScopes(context)],
    [['apps/shell-web/scripts/standalone-game-checks.mjs', ['games/local/game-castle-cannon']]],
  );
  for (const changed of [
    'unreviewed\n' + after + 'suffix\n',
    'prefix\n' + after + after + 'suffix\n',
    'prefix\n' + after.replace('frame, mobile', 'frame, false') + 'suffix\n',
  ])
    assert.equal(reviewedSharedFileScopes({ ...context, readHead: () => changed }).size, 0);
  assert.equal(reviewedSharedFileScopes({ ...context, games: [] }).size, 0);
});

test('castle dedicated contract selects its game and rejects unreviewed code', () => {
  const file = 'apps/shell-web/scripts/game-checks/castle-cannon.mjs';
  const shared = readFileSync(
    new URL('../apps/shell-web/scripts/standalone-game-checks.mjs', import.meta.url),
    'utf8',
  ).replaceAll('\r\n', '\n');
  const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8').replaceAll(
    '\r\n',
    '\n',
  );
  const context = {
    changedPaths: [file],
    games: [{ id: 'castle-cannon', source: 'games/local/game-castle-cannon' }],
    readBase: () => {
      throw new Error('new file');
    },
    readHead: (f) => (f === file ? source : shared),
  };
  assert.deepEqual(
    [...reviewedSharedFileScopes(context)],
    [[file, ['games/local/game-castle-cannon']]],
  );
  assert.equal(
    reviewedSharedFileScopes({
      ...context,
      readHead: (f) => (f === file ? source + 'globalThis.unreviewed = true;\n' : shared),
    }).size,
    0,
  );
});

test('shared game services select only their proven game consumers and fail closed on broken edges', async () => {
  const { execFileSync } = await import('node:child_process');
  const catalog = JSON.parse(
    readFileSync(new URL('../apps/shell-web/src/standalone-games.json', import.meta.url), 'utf8'),
  );
  const packages = [
    ...catalog.map((game) => ({ dir: game.source, name: game.id })),
    { dir: 'services/runtime-api', name: 'runtime' },
    { dir: 'apps/shell-web', name: 'shell' },
  ];
  const read = (file) =>
    readFileSync(new URL('../' + file, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const files = [
    'platforms/competition/game-services.js',
    'platforms/competition/tests/game-services.test.mjs',
    'scripts/competition-gateway.mjs',
    'scripts/competition-gateway.test.mjs',
    'scripts/deploy-tencent.mjs',
  ];
  const before = (file) =>
    execFileSync('git', ['show', '4fe9716ce5b9277e42b976e005931f6e8c7dc2f3:' + file], {
      encoding: 'utf8',
    });
  const context = {
    changedPaths: files,
    games: catalog,
    packages,
    readBase: before,
    readHead: read,
  };
  const scopes = reviewedSharedFileScopes(context);
  for (const file of files) assert(scopes.has(file), file);
  const plan = incrementalPlan({ ...context, fileScopes: scopes, readSource: read });
  assert.deepEqual(plan.browser_ids, [
    'cage-rescue',
    'letters-words2',
    'tower-brake',
    'xiangqi-five',
  ]);
  assert.deepEqual(plan.developer_mode_ids, ['cage-rescue', 'tower-brake']);
  assert.deepEqual(plan.publishing_browser_ids, ['cage-rescue', 'tower-brake']);
  assert.deepEqual(plan.service_rule_sources, ['services/runtime-api']);
  assert.equal(plan.game_services_checks, true);
  assert.equal(plan.ranked_deployment_checks, true);
  for (const input of [
    'games/local/cage-rescue/src/core.mjs',
    'games/local/cage-rescue/src/levels.mjs',
    'games/local/tower-brake/engine.mjs',
    'games/local/tower-brake/levels.mjs',
  ]) {
    const one = { ...context, changedPaths: [input] };
    const scoped = reviewedSharedFileScopes(one);
    assert.deepEqual(scoped.get(input), ['services/runtime-api']);
    assert.deepEqual(
      incrementalPlan({ ...one, fileScopes: scoped, readSource: read }).service_rule_sources,
      ['services/runtime-api'],
    );
  }
  for (const [file, replaced] of [
    [
      'games/local/cage-rescue/build.mjs',
      read('games/local/cage-rescue/build.mjs').replace(
        '../../../platforms/competition/game-services.js',
        '../../../platforms/competition/other.js',
      ),
    ],
    [
      'services/runtime-api/rules/ranked-games.mjs',
      read('services/runtime-api/rules/ranked-games.mjs').replace(
        '../../../games/local/tower-brake/engine.mjs',
        './other.mjs',
      ),
    ],
  ]) {
    const broken = reviewedSharedFileScopes({
      ...context,
      readHead: (name) => (name === file ? replaced : read(name)),
    });
    assert(!broken.has(files[0]));
  }
  for (const file of ['scripts/competition-gateway.mjs', 'scripts/deploy-tencent.mjs']) {
    const broken = reviewedSharedFileScopes({
      ...context,
      readHead: (name) => read(name) + (name === file ? '\n// unrelated change\n' : ''),
    });
    assert(!broken.has(file), file);
  }
  for (const file of [
    'platforms/competition/unknown-service.js',
    'scripts/competition-gateway-extra.mjs',
  ]) {
    const one = { ...context, changedPaths: [file] };
    assert.throws(
      () =>
        incrementalPlan({ ...one, readSource: read, fileScopes: reviewedSharedFileScopes(one) }),
      /scope undefined/,
    );
  }
});
