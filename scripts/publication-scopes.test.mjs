import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  reviewedSharedFileScopes,
  homeboundCocosWiringOnly,
  bulletGardenCreatorFileScope,
  bulletGardenLockOnly,
  orbitCreatorIntegrationFileScope,
  mergeCreatorIntegrationFileScope,
  mergeCreatorIntegrationHashes,
  mergeBulletCreatorIntegrationFileScope,
  mergeBulletCreatorIntegrationHashes,
  competitionConsumers,
  competitionToolPlan,
  competitionServiceScopePaths,
  h5AcceptanceScopePaths,
  sixH5Ids,
  sixH5ScopePaths,
  sixH5PresetOnly,
  competitionServiceConfigOnly,
  identityGatewayFileScope,
  playerSessionBackendFileScope,
  anonymousPagesFileScope,
  threeChooseTwoBackendFileScope,
  flickIntegrationFileScope,
  carromBackendFileScope,
  publishingConsumers,
  publishingScopePaths,
  safeAreaConsumers,
  safeAreaScopePaths,
  platformAdsScopePaths,
  deploymentBundleScopePaths,
  companyDeploymentScopePaths,
  competitionIngressScopePaths,
  adminConsoleScopePaths,
  adminDeploymentScopePaths,
  adminControlDeploymentScopePaths,
  adminCspScopePaths,
  sharedDeploymentScopePaths,
  selectedBackendConsumers,
  backendDeploymentScopePaths,
  backendSharedScopePaths,
  imageAuthorityScopePaths,
  imageAuthorityConsumers,
  targetedCommandsOnly,
  runtimeProxyDefaultScopePaths,
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
import { shellContractTargets, shellContractFiles, requiresCocos } from './validation-plan.mjs';
import { ingressPreflightGuard } from './competition-ingress.mjs';
import { requiresIncrementalCocos } from './pages-test-scope.mjs';

const tianxiaBase = 'd4a677542c5a034c4fef21798845dbf16e5bcfdd';
const tianxiaSource = 'games/local/tianxia-chalu';
const tianxiaWiring = [
  '.github/workflows/carding-car.yml',
  '.github/workflows/ci.yml',
  '.github/workflows/pages-validate.yml',
  '.github/workflows/mobile.yml',
  'turbo.json',
  'scripts/cocos-validation.mjs',
  'scripts/reuse-cocos-artifacts.mjs',
  'apps/shell-web/src/StandaloneGame.tsx',
  'apps/shell-web/scripts/pages-smoke.mjs',
  'apps/shell-web/scripts/standalone-game-checks.mjs',
  'apps/shell-web/tests/standalone-immersive.integration.test.tsx',
  'apps/shell-web/tests/standalone.integration.test.tsx',
  'scripts/test-game-dev-mode.mjs',
];
// Keep the already reviewed Tianxia delta fixed when later games add shared wiring.
const tianxiaHead = '22c95185813177bd860127563cf2eddbfe573e7e';
const tianxiaAfter = new Map();
const tianxiaRead = (file) => {
  if (!tianxiaAfter.has(file)) {
    try {
      let cwd = new URL('../', import.meta.url);
      let reference = `${tianxiaHead}:${file}`;
      const submodule = /^(games\/submodules\/[^/]+)\/(.+)$/.exec(file);
      if (submodule) {
        const revision = execFileSync('git', ['rev-parse', `${tianxiaHead}:${submodule[1]}`], {
          cwd,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
        cwd = new URL('../' + submodule[1] + '/', import.meta.url);
        reference = `${revision}:${submodule[2]}`;
      }
      tianxiaAfter.set(
        file,
        execFileSync('git', ['show', reference], {
          cwd,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }).replaceAll('\r\n', '\n'),
      );
    } catch (error) {
      // Missing historical candidates are queried repeatedly by import resolution.
      tianxiaAfter.set(file, error);
    }
  }
  const value = tianxiaAfter.get(file);
  if (value instanceof Error) throw value;
  return value;
};
const tianxiaBefore = new Map();
function tianxiaContext(file, overrides = {}) {
  if (!tianxiaBefore.has(file))
    tianxiaBefore.set(
      file,
      execFileSync('git', ['show', `${tianxiaBase}:${file}`], { encoding: 'utf8' }).replaceAll(
        '\r\n',
        '\n',
      ),
    );
  const games = [
    'tianxia-chalu',
    'carding-car',
    'night-overwatch',
    'orbit-atelier',
    'letters-words2',
    'xiangqi-five',
    'wulong-city',
  ].map((id) => ({ id, source: `games/${id === 'xiangqi-five' ? 'submodules' : 'local'}/${id}` }));
  const packages = games.map((game) => ({
    dir: game.source,
    ...JSON.parse(tianxiaRead(game.source + '/package.json')),
  }));
  packages.push({
    name: 'shell',
    dir: 'apps/shell-web',
    coffeeeeffoc: { role: 'shell' },
    dependencies: { '@coffeeeeffoc/tianxia-chalu': 'workspace:*' },
  });
  packages.push({
    name: 'server',
    dir: 'services/tianxia-server',
    dependencies: { '@coffeeeeffoc/tianxia-chalu': 'workspace:*' },
  });
  return {
    changedPaths: [file],
    games,
    packages,
    readBase: (name) => tianxiaBefore.get(name),
    readHead: tianxiaRead,
    readSource: tianxiaRead,
    ...overrides,
  };
}

test('fourth Creator wiring is proved against the handoff base without expanding to the old producers', () => {
  for (const file of tianxiaWiring) {
    const context = tianxiaContext(file);
    const scopes = reviewedSharedFileScopes(context);
    assert.deepEqual(
      scopes.get(file),
      [
        tianxiaSource,
        ...(file === 'scripts/test-game-dev-mode.mjs' ? ['games/local/wulong-city'] : []),
      ],
      file,
    );
    const plan = incrementalPlan({ ...context, fileScopes: scopes });
    assert.equal(plan.full, false);
    assert(plan.game_sources.includes(tianxiaSource), file);
    assert(!plan.game_sources.includes('games/local/carding-car'), file);
    assert(!plan.game_sources.includes('games/local/night-overwatch'), file);
    assert(plan.service_rule_sources.includes('services/tianxia-server'), file);
    assert.equal(
      requiresCocos(context.packages, [file, tianxiaSource + '/package.json'], plan),
      true,
    );
    if (file === 'scripts/cocos-validation.mjs') {
      assert(plan.validation_tools);
      assert(plan.browser_ids.includes('letters-words2'));
      assert(plan.browser_ids.includes('xiangqi-five'));
    }
    if (file === 'scripts/test-game-dev-mode.mjs')
      assert(plan.developer_mode_ids.includes('wulong-city'));
    for (const after of [
      ...(file === 'turbo.json' ? [] : [context.readHead(file) + '\n']),
      context.readHead(file) + '\nconsole.log("extra instruction");\n',
    ])
      assert(!reviewedSharedFileScopes({ ...context, readHead: () => after }).has(file), file);
  }
});

test('fourth artifact workflow proofs reject changed old steps, duplicate IDs, wrong env/path, conditions and omissions', () => {
  for (const file of tianxiaWiring.filter((file) => file.endsWith('.yml'))) {
    const context = tianxiaContext(file),
      after = context.readHead(file);
    for (const bad of [
      after.replace('pnpm check:games', 'echo bypass'),
      after.replace('actions/download-artifact@v8', 'actions/download-artifact@v7'),
      after.replace('TIANXIA_PREBUILT_DIR', 'TIANXIA_WRONG_DIR'),
      after
        .replace(
          'path: games/local/tianxia-chalu/.prebuilt',
          'path: games/local/night-overwatch/.prebuilt',
        )
        .replace('path: .scratch/ci-cocos/tianxia-chalu', 'path: .scratch/ci-cocos/other'),
      after.replace(/^(\s+TIANXIA_PREBUILT_DIR:.*\n)/m, '$1$1'),
      after.replace(/\s*&& steps.tianxia.outcome == 'success'/, ''),
      after.replace(
        '[carding-car, night-overwatch, orbit-atelier, tianxia-chalu]',
        '[carding-car, night-overwatch, orbit-atelier, tianxia-chalu, tianxia-chalu]',
      ),
      after.replace('id: tianxia', 'id: night'),
    ].filter((text) => text !== after))
      assert(!reviewedSharedFileScopes({ ...context, readHead: () => bad }).has(file), file);
    assert(
      !reviewedSharedFileScopes({ ...context, readBase: () => context.readBase(file) + '\n' }).has(
        file,
      ),
    );
  }
});

test('fourth Creator literal/Turbo proofs reject duplicate registrations and executable changes outside the declaration', () => {
  for (const file of [
    'scripts/cocos-validation.mjs',
    'scripts/reuse-cocos-artifacts.mjs',
    'turbo.json',
  ]) {
    const context = tianxiaContext(file),
      after = context.readHead(file);
    for (const bad of [
      after.replace('TIANXIA_PREBUILT_DIR', 'KART_PREBUILT_DIR'),
      after.replace("'tianxia-chalu']", "'tianxia-chalu', 'tianxia-chalu']"),
      after.replace(
        "  'games/local/tianxia-chalu': 'TIANXIA_PREBUILT_DIR',",
        "  'games/local/tianxia-chalu': 'TIANXIA_PREBUILT_DIR',\n  'games/local/tianxia-chalu': 'TIANXIA_PREBUILT_DIR',",
      ),
      after.replace('3.8.8', '3.8.9'),
      after.replace('"dependsOn": ["^build"]', '"dependsOn": []'),
      after.replace('"outputs": ["dist/**"]', '"outputs": ["dist/**"], "outputs": ["dist/**"]'),
      after.replace(
        "const platform = 'web-mobile';",
        "const platform = 'web-mobile'; console.log('extra');",
      ),
    ].filter((text) => text !== after))
      assert(!reviewedSharedFileScopes({ ...context, readHead: () => bad }).has(file), file);
    for (const games of [
      [],
      [...context.games, { id: 'tianxia-chalu', source: tianxiaSource }],
      [...context.games, { id: 'alias', source: tianxiaSource }],
    ])
      assert(!reviewedSharedFileScopes({ ...context, games }).has(file));
    assert(
      !reviewedSharedFileScopes({
        ...context,
        packages: context.packages.filter((pkg) => pkg.dir !== tianxiaSource),
      }).has(file),
    );
  }
});

test('Tianxia semantic checks change only its real AST branch and exact immersive ID additions', () => {
  const file = 'apps/shell-web/scripts/standalone-game-checks.mjs';
  const context = tianxiaContext(file),
    after = context.readHead(file);
  for (const bad of [
    after.replace("id === 'voiceprint-case'", "id === 'other'"),
    after.replace('const click = (locator)', 'const changed = (locator)'),
    after.replace("id === 'tianxia-chalu'", "id === 'other'"),
    after + '\nexport const leaked = true;\n',
  ])
    assert(!reviewedSharedFileScopes({ ...context, readHead: () => bad }).has(file));
  for (const name of tianxiaWiring.filter((name) =>
    /StandaloneGame|pages-smoke|integration|test-game-dev-mode/.test(name),
  )) {
    const entry = tianxiaContext(name),
      text = entry.readHead(name);
    const addition = text.split('\n').find((line) => line.includes("'tianxia-chalu'")) + '\n';
    for (const bad of [
      text.replace(addition, addition + addition),
      text.replace("'tianxia-chalu'", "'other'"),
      text.replace("'ashfall-front'", "'other'"),
    ])
      assert(!reviewedSharedFileScopes({ ...entry, readHead: () => bad }).has(name), name);
    const before = 'const lookalike = ' + JSON.stringify(entry.readBase(name)) + ';\n';
    const fakeAfter = 'const lookalike = ' + JSON.stringify(text) + ';\n';
    assert(
      !reviewedSharedFileScopes({
        ...entry,
        readBase: () => before,
        readHead: () => fakeAfter,
      }).has(name),
    );
  }
});

test('the local validation aggregate includes reuse tests without allowing other root command changes', () => {
  const file = 'package.json',
    context = tianxiaContext(file);
  assert.deepEqual(reviewedSharedFileScopes(context).get(file), []);
  const after = context.readHead(file);
  for (const bad of [
    after.replace('scripts/reuse-cocos-artifacts.test.mjs', 'scripts/unknown.test.mjs'),
    after.replace(
      'scripts/reuse-cocos-artifacts.test.mjs',
      'scripts/reuse-cocos-artifacts.test.mjs scripts/reuse-cocos-artifacts.test.mjs',
    ),
    after.replace('git push --no-verify', 'git push --force'),
  ])
    assert(!reviewedSharedFileScopes({ ...context, readHead: () => bad }).has(file));
});

test('combined Tianxia wiring keeps only its entry, navigation samples, tooling and real server checks', () => {
  const entry = 'apps/shell-web/scripts/standalone-game-entry.mjs';
  const paths = [
    ...tianxiaWiring,
    entry,
    'scripts/reuse-cocos-artifacts.test.mjs',
    'scripts/publication-scopes.mjs',
  ];
  for (const file of paths) tianxiaContext(file);
  const context = tianxiaContext(entry, { changedPaths: paths });
  const fileScopes = new Map([
    ...entryAdapterFileScopes(context),
    ...developerModeFileScopes(context),
    ...reviewedSharedFileScopes(context),
  ]);
  assert.deepEqual(fileScopes.get(entry), [tianxiaSource]);
  const plan = incrementalPlan({ ...context, fileScopes });
  assert.equal(plan.full, false);
  assert.equal(plan.validation_tools, true);
  assert.deepEqual(plan.browser_ids, [
    'letters-words2',
    'tianxia-chalu',
    'wulong-city',
    'xiangqi-five',
  ]);
  assert.deepEqual(plan.developer_mode_ids, ['tianxia-chalu', 'wulong-city']);
  assert.deepEqual(plan.service_rule_sources, ['services/tianxia-server']);
  assert.deepEqual(
    shellContractTargets(context.packages, paths).map((pkg) => pkg.dir),
    ['apps/shell-web'],
  );
});

test('fourth Creator classification works in a bare planner with only Prettier and no YAML package', async (t) => {
  const { mkdtemp, copyFile, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createRequire } = await import('node:module');
  const directory = await mkdtemp(join(tmpdir(), 'tianxia-bare-plan-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const module of [
    'publication-scopes.mjs',
    'vite-patch-scope.mjs',
    'competition-ingress.mjs',
    'admin-csp.mjs',
  ])
    await copyFile(new URL(module, import.meta.url), join(directory, module));
  const fixtures = tianxiaWiring.map((file) => {
    const context = tianxiaContext(file);
    return {
      file,
      before: context.readBase(file),
      after: context.readHead(file),
      games: context.games,
      packages: context.packages,
    };
  });
  await writeFile(join(directory, 'fixture.json'), JSON.stringify(fixtures));
  const parser = createRequire(import.meta.url).resolve('prettier/plugins/babel');
  await writeFile(
    join(directory, 'probe.mjs'),
    `
    import assert from 'node:assert/strict';
    import Module, { createRequire } from 'node:module';
    import { readFileSync } from 'node:fs';
    import { reviewedSharedFileScopes } from './publication-scopes.mjs';
    assert.throws(() => createRequire(import.meta.url).resolve('js-yaml'));
    const originalLoad = Module._load;
    Module._load = function(name, ...args) {
      assert.notEqual(name, 'js-yaml');
      return originalLoad.call(this, name === 'prettier/plugins/babel' ? ${JSON.stringify(parser)} : name, ...args);
    };
    for (const { file, before, after, games, packages } of JSON.parse(readFileSync('fixture.json', 'utf8'))) {
      assert(reviewedSharedFileScopes({ changedPaths: [file], games, packages,
        readBase: () => before, readHead: () => after }).has(file), file);
    }
  `,
  );
  execFileSync(process.execPath, ['probe.mjs'], {
    cwd: directory,
    env: { ...process.env, NODE_PATH: '' },
    stdio: 'pipe',
  });
});

test('unified package tools keep the three H5 consumers and reject unknown siblings', () => {
  const ids = ['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'];
  const games = [
    ...ids.map((id) => ({ id, source: competitionConsumers[id] })),
    ...sixH5Ids.map((id) => ({ id, source: `games/local/${id}` })),
    { id: 'merge-front', source: 'games/local/merge-front' },
  ];
  const packages = games.map((game) => ({ name: game.id, dir: game.source }));
  const readSource = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  for (const file of [
    'scripts/build-games.mjs',
    'scripts/competition-service-config.mjs',
    'scripts/build-games.test.mjs',
    'game-build.local.mjs',
    'infra/builds/games.example.json',
    'infra/builds/games.example.mjs',
  ]) {
    const context = {
      changedPaths: [file],
      games,
      packages,
      readBase: readSource,
      readHead: readSource,
      readSource,
    };
    const fileScopes = reviewedSharedFileScopes(context);
    assert(fileScopes.has(file), file);
    const selected = incrementalPlan({ ...context, fileScopes });
    assert.equal(selected.full, false);
    assert.equal(selected.competition_service_checks, true);
    if (file === 'scripts/competition-service-config.mjs') {
      assert.equal(selected.six_h5_checks, true);
      for (const id of sixH5Ids.filter((id) => id !== 'travel-bund' && id !== 'homebound-station'))
        assert(selected.browser_ids.includes(id), `service config consumer: ${id}`);
      assert(!selected.browser_ids.includes('travel-bund'));
    }
    for (const id of ids) assert(selected.browser_ids.includes(id), id);
    assert.equal(selected.cocos_minigame_ids, undefined);
  }
  assert.equal(
    reviewedSharedFileScopes({
      changedPaths: ['scripts/native-game-build-extra.mjs'],
      games: [],
      packages: [],
    }).size,
    0,
  );
});

test('six H5 tools declare exact consumers and preserve fail-closed configuration scope', () => {
  const games = [...sixH5Ids, 'merge-front'].map((id) => ({ id, source: `games/local/${id}` }));
  const packages = games.map((g) => ({ name: g.id, dir: g.source }));
  const readHead = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  for (const file of sixH5ScopePaths) {
    const ctx = { changedPaths: [file], games, packages, readHead, readSource: readHead };
    const fileScopes = reviewedSharedFileScopes(ctx);
    assert.deepEqual(
      fileScopes.get(file),
      file.endsWith('.test.mjs')
        ? []
        : games
            .filter(
              (g) =>
                (file !== 'infra/builds/six-taptap-h5.mjs' || g.id !== 'homebound-station') &&
                (g.id !== 'merge-front' ||
                  [
                    'platforms/h5/game-rewards.js',
                    'platforms/h5/interstitial.js',
                    'scripts/h5-game-build.mjs',
                  ].includes(file)),
            )
            .map((g) => g.source),
    );
    const plan = incrementalPlan({ ...ctx, fileScopes });
    assert.equal(plan.full, false);
    assert.equal(plan.six_h5_checks, true);
    assert.equal(plan.competition_service_checks, false);
    assert.deepEqual(plan.cocos_minigame_ids || [], []);
  }
  const preset = readHead('infra/builds/six-taptap-h5.mjs');
  assert(sixH5PresetOnly(preset));
  assert(!sixH5PresetOnly(preset.replace("type: 'h5'", "type: 'minigame'")));
  assert(!sixH5PresetOnly(preset + '\nprocess.exit(0);'));
  assert(!sixH5PresetOnly(preset.replace('backend: [false]', 'backend: [true]')));
});

test('Cocos branding implementation and its test trigger the actual branding contract', () => {
  const games = [...sixH5Ids, 'tianxia-chalu'].map((id) => ({ id, source: `games/local/${id}` }));
  const packages = games.map((game) => ({ name: game.id, dir: game.source }));
  const readHead = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  for (const file of [
    'games/local/carding-car/scripts/cocos-branding.mjs',
    'games/local/carding-car/tests/cocos-branding.test.mjs',
  ]) {
    const context = { changedPaths: [file], games, packages, readHead, readSource: readHead };
    const fileScopes = reviewedSharedFileScopes(context);
    assert.equal(incrementalPlan({ ...context, fileScopes }).six_h5_checks, true, file);
    if (file.endsWith('/scripts/cocos-branding.mjs'))
      assert(fileScopes.get(file).includes(tianxiaSource));
  }
});

test('new H5 acceptance helpers have finite unit-only scope and unknown siblings remain blocked', () => {
  for (const file of h5AcceptanceScopePaths.filter(
    (file) => !competitionServiceScopePaths.includes(file),
  )) {
    const context = {
      changedPaths: [file],
      games: [],
      packages: [],
      readBase: () => '',
      readHead: () => '',
      readSource: () => '',
    };
    const fileScopes = reviewedSharedFileScopes(context);
    assert.deepEqual(fileScopes.get(file), []);
    const plan = incrementalPlan({ ...context, fileScopes });
    assert.equal(plan.h5_acceptance_checks, true);
    assert.equal(plan.competition_service_checks, false);
    assert.deepEqual(plan.browser_ids, []);
    assert.deepEqual(plan.consumer_sources, []);
  }
  for (const file of [
    'scripts/h5-taptap-runtime-extra.mjs',
    'scripts/h5-taptap-trace-private.mjs',
  ]) {
    const context = {
      changedPaths: [file],
      games: [],
      packages: [],
      readBase: () => '',
      readHead: () => '',
      readSource: () => '',
    };
    const fileScopes = reviewedSharedFileScopes(context);
    assert.equal(fileScopes.has(file), false);
    assert.throws(() => incrementalPlan({ ...context, fileScopes }), /scope undefined/);
  }
});

test('admin deployment paths select exact consumers, including the control policy readers', () => {
  const packages = [
    { dir: 'services/management-api', name: 'management' },
    { dir: 'apps/admin-web', name: '@coffeeeeffoc/admin-web' },
    { dir: 'apps/company-web', name: '@coffeeeeffoc/company-web' },
    ...selectedBackendConsumers.map((dir) => ({ dir, name: dir })),
  ];
  const before = JSON.stringify({ scripts: { other: 'keep' } }, null, 2) + '\n';
  const after =
    JSON.stringify(
      { scripts: { other: 'keep', 'deploy:admin': 'node scripts/deploy-admin.mjs' } },
      null,
      2,
    ) + '\n';
  for (const file of [...adminDeploymentScopePaths, 'package.json']) {
    const scopes = reviewedSharedFileScopes({
      changedPaths: [file],
      games: [],
      packages,
      readBase: () => before,
      readHead: () => after,
    });
    assert.deepEqual(scopes.get(file), [
      ...(sharedDeploymentScopePaths.includes(file) ? ['apps/company-web'] : []),
      'services/management-api',
      'apps/admin-web',
      ...(adminControlDeploymentScopePaths.includes(file)
        ? ['services/runtime-api', 'services/kart-server']
        : []),
      ...(backendSharedScopePaths.includes(file) ? selectedBackendConsumers : []),
    ]);
    const plan = incrementalPlan({
      changedPaths: [file],
      games: [],
      packages,
      fileScopes: scopes,
      readSource: () => '',
    });
    assert.equal(plan.admin_deployment_checks, true);
    assert.equal(plan.admin_console_checks, true);
    assert.deepEqual(plan.browser_ids, []);
    assert.ok(plan.consumer_sources.includes('apps/admin-web'));
  }
  for (const file of [
    'infra/admin-console/unknown.py',
    'scripts/deploy-admin-extra.mjs',
    'pnpm-lock.yaml',
  ])
    assert.equal(
      reviewedSharedFileScopes({
        changedPaths: [file],
        games: [],
        packages,
        readBase: () => before,
        readHead: () => after,
      }).has(file),
      false,
    );
  for (const current of [
    after.replace('node scripts/deploy-admin.mjs', 'node unsafe.mjs'),
    after.replace('"keep"', '"changed"'),
    after.replace('"scripts": {', '"scripts": {}, "scripts": {'),
  ])
    assert.equal(
      reviewedSharedFileScopes({
        changedPaths: ['package.json'],
        games: [],
        packages,
        readBase: () => before,
        readHead: () => current,
      }).has('package.json'),
      false,
    );
});

test('company Pages publication adds only its tested artifact and preserves game gates', async () => {
  const { execFileSync } = await import('node:child_process');
  const file = '.github/workflows/pages-validate.yml';
  const before = execFileSync('git', ['show', '4fe9716ce5b9277e42b976e005931f6e8c7dc2f3:' + file], {
    encoding: 'utf8',
  });
  const after = execFileSync('git', ['show', '0d7bfdfe4087b85139dc525e9a75f3ab792e17f6:' + file], {
    encoding: 'utf8',
  }).replaceAll('\r\n', '\n');
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

test('viewport retirement selects all remaining real consumers and rejects any unreviewed bytes', () => {
  const file = mobileViewportScopeFile;
  const after = readFileSync(new URL('../' + file, import.meta.url), 'utf8').replaceAll(
    '\r\n',
    '\n',
  );
  const before = execFileSync('git', ['show', '4224be0a1a3c9c108e34c39d996642765cfdca54:' + file], {
    encoding: 'utf8',
  });
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
    'fold-the-world',
    'night-overwatch',
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
      games.filter((game) => game.id !== 'fold-the-world'),
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

test('independent preview selects retained viewport consumers and fails closed', async () => {
  const { execFileSync } = await import('node:child_process');
  const files = [mobileViewportScopeFile, independentPreviewScopeFile];
  const before = Object.fromEntries(
    files.map((file) => [
      file,
      execFileSync('git', ['show', '4224be0a1a3c9c108e34c39d996642765cfdca54:' + file], {
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
  assert.equal(scopes.get(independentPreviewScopeFile).length, 6);
  assert(scopes.get(independentPreviewScopeFile).includes('games/local/fold-the-world'));
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
    'fold-the-world',
    'letters-words2',
    'night-overwatch',
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
      games.filter((game) => game.id !== 'fold-the-world'),
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

test('H5 safe areas select the three standalone consumers and require their geometry checks', () => {
  const games = Object.entries(safeAreaConsumers).map(([id, source]) => ({ id, source }));
  const packages = games.map((game) => ({ name: game.id, dir: game.source }));
  for (const file of safeAreaScopePaths) {
    const context = { games, packages, changedPaths: [file], readSource: () => '' };
    const fileScopes = reviewedSharedFileScopes(context);
    const plan = incrementalPlan({ ...context, fileScopes });
    assert.deepEqual(plan.browser_ids, games.map((game) => game.id).sort());
    assert.equal(plan.safe_area_checks, true);
    assert.equal(reviewedSharedFileScopes({ ...context, games: games.slice(1) }).size, 0);
    assert.equal(reviewedSharedFileScopes({ ...context, packages: packages.slice(1) }).size, 0);
  }
  assert.throws(
    () => incrementalPlan({ games, packages, changedPaths: ['platforms/h5/unknown-safe-area.js'] }),
    /scope undefined/,
  );
});

test('shared channel advertising covers all ten consumers; the uploader stays chase-only', () => {
  const games = [
    { id: 'cops-robbers', source: 'games/local/cops-robbers' },
    { id: 'cops-robbers-realtime', source: 'games/local/cops-robbers-realtime' },
    { id: 'xiangqi-five', source: 'games/submodules/xiangqi-five' },
    ...sixH5Ids.map((id) => ({ id, source: `games/local/${id}` })),
    { id: 'merge-front', source: 'games/local/merge-front' },
  ];
  const packages = games.map((game) => ({ name: game.id, dir: game.source }));
  const readHead = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  for (const file of platformAdsScopePaths) {
    const adapter = !file.includes('deploy-taptap');
    const context = { games, packages, changedPaths: [file], readHead, readSource: readHead };
    const fileScopes = reviewedSharedFileScopes(context);
    const expected = adapter ? games : games.slice(0, 1);
    assert.deepEqual(
      fileScopes.get(file),
      expected.map((g) => g.source),
    );
    const plan = incrementalPlan({ ...context, fileScopes });
    assert.deepEqual(plan.browser_ids, expected.map((g) => g.id).sort());
    assert.equal(plan.platform_ads_checks, true);
    assert.equal(plan.six_h5_checks, adapter);
    assert.equal(reviewedSharedFileScopes({ ...context, games: games.slice(1) }).size, 0);
  }
});

test('company deployment selects only the website and rejects unknown siblings and root commands', () => {
  const packages = [
    { name: '@coffeeeeffoc/company-web', dir: 'apps/company-web' },
    { name: '@coffeeeeffoc/runtime-api', dir: 'services/runtime-api' },
    { name: '@coffeeeeffoc/management-api', dir: 'services/management-api' },
    { name: '@coffeeeeffoc/admin-web', dir: 'apps/admin-web' },
    ...['services/kart-server', 'services/tianxia-server'].map((dir) => ({ dir, name: dir })),
  ];
  for (const file of companyDeploymentScopePaths) {
    const context = { packages, games: [], changedPaths: [file], readSource: () => '' };
    const fileScopes = reviewedSharedFileScopes(context);
    assert.deepEqual(
      fileScopes.get(file),
      competitionIngressScopePaths.includes(file)
        ? ['apps/company-web', 'services/runtime-api', 'services/management-api', 'apps/admin-web']
        : sharedDeploymentScopePaths.includes(file)
          ? [
              'apps/company-web',
              'services/management-api',
              'apps/admin-web',
              ...selectedBackendConsumers,
            ]
          : ['apps/company-web'],
    );
    const plan = incrementalPlan({ ...context, fileScopes });
    assert.equal(plan.company_deployment_checks, true);
    assert.equal(plan.deployment_bundle_checks, false);
    assert.deepEqual(plan.browser_ids, []);
  }
  const before = { scripts: { build: 'keep' } };
  const after = {
    scripts: {
      ...before.scripts,
      'deploy:company': 'node scripts/deploy-company.mjs',
      'deploy:caddy': 'node scripts/deploy-caddy.mjs',
      'test:deploy-company': 'node --test scripts/deploy-company.test.mjs',
    },
  };
  const context = {
    packages,
    games: [],
    changedPaths: ['package.json'],
    readBase: () => JSON.stringify(before),
    readHead: () => JSON.stringify(after),
  };
  assert.deepEqual(reviewedSharedFileScopes(context).get('package.json'), ['apps/company-web']);
  after.scripts.build = 'changed';
  assert.equal(reviewedSharedFileScopes(context).size, 0);
  for (const file of [
    'scripts/deploy-company-other.mjs',
    'infra/company/unknown.sh',
    'infra/caddy/unknown.sh',
  ]) {
    const fileScopes = reviewedSharedFileScopes({ ...context, changedPaths: [file] });
    assert.equal(fileScopes.size, 0);
    assert.throws(
      () => incrementalPlan({ packages, games: [], changedPaths: [file], fileScopes }),
      /scope undefined/,
    );
  }
});

test('competition ingress selects the actual website and both API/frontend consumers, with legacy deltas still bounded', async () => {
  const packages = [
    { name: 'company', dir: 'apps/company-web' },
    { name: 'runtime', dir: 'services/runtime-api' },
    { name: 'management', dir: 'services/management-api' },
    { name: 'admin', dir: 'apps/admin-web' },
  ];
  for (const file of competitionIngressScopePaths) {
    const context = { packages, games: [], changedPaths: [file], readSource: () => '' };
    const fileScopes = reviewedSharedFileScopes(context);
    assert.deepEqual(fileScopes.get(file), [
      'apps/company-web',
      'services/runtime-api',
      'services/management-api',
      'apps/admin-web',
      ...(backendSharedScopePaths.includes(file) ? selectedBackendConsumers : []),
    ]);
    const plan = incrementalPlan({ ...context, fileScopes });
    assert.equal(plan.competition_ingress_checks, true);
    assert.deepEqual(plan.browser_ids, []);
  }
  const { ingressShellGuard, ingressPreflightGuard } = await import('./competition-ingress.mjs');
  for (const file of ['scripts/deploy-tencent.mjs', 'infra/tencent/deploy.sh']) {
    // Classifier inputs come from git show (LF), including Windows CRLF checkouts.
    const after = readFileSync(new URL('../' + file, import.meta.url), 'utf8').replaceAll(
      '\r\n',
      '\n',
    );
    const guard = file.endsWith('.mjs') ? ingressPreflightGuard : ingressShellGuard;
    assert(after.includes(guard), 'Fixture must contain the reviewed ingress guard');
    const before = after.replaceAll(guard, '');
    const context = {
      packages,
      games: [],
      changedPaths: [file],
      readBase: () => before,
      readHead: () => after,
    };
    assert.deepEqual(reviewedSharedFileScopes(context).get(file), [
      'apps/company-web',
      'services/runtime-api',
    ]);
    assert.equal(
      reviewedSharedFileScopes({
        ...context,
        readHead: () => after + '\n// unrelated deployment mutation\n',
      }).size,
      0,
    );
  }
  for (const file of ['scripts/competition-ingress-extra.mjs', 'infra/caddy/ingress-extra.py'])
    assert.equal(reviewedSharedFileScopes({ packages, games: [], changedPaths: [file] }).size, 0);
});

test('generic Runtime proxy defaults admit exactly the reviewed producer bytes and block extra changes', () => {
  const packages = [{ name: 'runtime', dir: 'services/runtime-api' }];
  for (const file of runtimeProxyDefaultScopePaths) {
    const after = readFileSync(new URL('../' + file, import.meta.url), 'utf8').replaceAll(
      '\r\n',
      '\n',
    );
    const before = file.endsWith('.yaml')
      ? after.replace(
          "      PORT: '43002'\n      TRUST_PROXY: '0'",
          "      PORT: '43002'\n      TRUST_PROXY: '1'",
        )
      : after.replace(
          "      Object.assign(env, {\n        HOST: '0.0.0.0',\n        PORT: String(port),\n        TRUST_PROXY: service === 'runtime' ? '0' : '1',\n      });",
          "      Object.assign(env, { HOST: '0.0.0.0', PORT: String(port), TRUST_PROXY: '1' });",
        );
    assert.notEqual(before, after);
    const context = {
      packages,
      games: [],
      changedPaths: [file],
      readBase: () => before,
      readHead: () => after,
    };
    const fileScopes = reviewedSharedFileScopes(context);
    assert.deepEqual(fileScopes.get(file), ['services/runtime-api']);
    assert.equal(incrementalPlan({ ...context, fileScopes }).competition_ingress_checks, true);
    assert.equal(
      reviewedSharedFileScopes({ ...context, readHead: () => after + '\n# unreviewed mutation\n' })
        .size,
      0,
    );
  }
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

test('optional service configuration has finite H5 consumers and rejects unknown siblings or game identities', async () => {
  const { workspacePackages } = await import('./validation-plan.mjs');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const consumers = await workspacePackages(root);
  const catalog = JSON.parse(
    readFileSync(new URL('../apps/shell-web/src/standalone-games.json', import.meta.url), 'utf8'),
  );
  const read = (file) =>
    file === 'package.json'
      ? execFileSync('git', ['show', '47687063bd522437962026b52ee6d784dfecd099:' + file], {
          encoding: 'utf8',
        })
      : file === 'turbo.json'
        ? execFileSync('git', ['show', '1367ae4f9758fb3a36935267db236e481b67d52a:' + file], {
            encoding: 'utf8',
          })
        : readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const context = {
    packages: consumers,
    games: catalog,
    readHead: read,
    readBase: (file) =>
      execFileSync('git', ['show', 'c010423731cc22fb0657a4a86ac9811e1997bbc1:' + file], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
  };
  for (const file of [...competitionServiceScopePaths, 'package.json', 'turbo.json']) {
    const fileScopes = reviewedSharedFileScopes({ ...context, changedPaths: [file] });
    assert(fileScopes.has(file), file);
    const selected = incrementalPlan({
      ...context,
      changedPaths: [file],
      fileScopes,
      readSource: read,
    });
    const protocolGame = {
      'scripts/review-competition-kart-chess.mjs': 'xiangqi-five',
      'scripts/street-runs.integration.mjs': 'cops-robbers-realtime',
    }[file];
    if (protocolGame) {
      assert.deepEqual(selected.browser_ids, [protocolGame]);
      assert(fileScopes.get(file).includes('services/runtime-api'));
    } else
      for (const id of ['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'])
        assert(selected.browser_ids.includes(id), file + ': ' + id);
    assert.equal(selected.competition_service_checks, true);
    if (file === 'scripts/competition.integration.mjs')
      assert(fileScopes.get(file).includes('services/runtime-api'));
    if (file === 'scripts/competition-client.test.mjs') {
      for (const source of [
        'games/local/letters-words2',
        'games/local/vibeJam-myself-history-guess',
        'apps/shell-minigame',
      ])
        assert(fileScopes.get(file).includes(source));
    }
  }
  const bundleFile = 'scripts/deployment-bundle.mjs';
  const bundleContext = {
    ...context,
    changedPaths: [bundleFile],
    readHead: (file) =>
      file === bundleFile
        ? execFileSync('git', ['show', '5cd8d72f42ff70268710049b8b20074df53bf7a3:' + file], {
            encoding: 'utf8',
          })
        : read(file),
    readBase: (file) =>
      file === bundleFile
        ? execFileSync('git', ['show', '5fbc6feadf2663e1905538ab6b6feae0ed26156b:' + file], {
            encoding: 'utf8',
          })
        : context.readBase(file),
  };
  assert.deepEqual(reviewedSharedFileScopes(bundleContext).get(bundleFile), [
    'games/local/cops-robbers',
    'games/local/cops-robbers-realtime',
    'games/submodules/xiangqi-five',
    'apps/shell-web',
  ]);
  assert.notDeepEqual(
    reviewedSharedFileScopes({
      ...bundleContext,
      readHead: (file) =>
        bundleContext.readHead(file) +
        (file === bundleFile ? '\n// unrelated deployment edit\n' : ''),
    }).get(bundleFile),
    reviewedSharedFileScopes(bundleContext).get(bundleFile),
  );
  for (const file of [
    'scripts/competition-service-extra.mjs',
    'platforms/competition/service-extra.js',
  ]) {
    const fileScopes = reviewedSharedFileScopes({ ...context, changedPaths: [file] });
    assert(!fileScopes.has(file));
    assert.throws(
      () => incrementalPlan({ ...context, changedPaths: [file], fileScopes, readSource: read }),
      /scope undefined/,
    );
  }
  const file = 'scripts/competition-service-config.mjs';
  for (const games of [
    [...catalog, catalog.find((game) => game.id === 'xiangqi-five')],
    catalog.filter((game) => game.id !== 'cops-robbers'),
  ])
    assert(!reviewedSharedFileScopes({ ...context, games, changedPaths: [file] }).has(file));
  assert(
    !reviewedSharedFileScopes({
      ...context,
      changedPaths: [file],
      readHead: (name) =>
        name === file
          ? read(name).replace("'xiangqi-five'", "'xiangqi-five', 'fourth-game'")
          : read(name),
    }).has(file),
  );
  assert(
    !reviewedSharedFileScopes({
      ...context,
      changedPaths: [file],
      readHead: (name) =>
        name === 'scripts/h5-ad-config.mjs'
          ? read(name).replace("'xiangqi-five'", "'xiangqi-five', 'unexpected-game'")
          : read(name),
    }).has(file),
  );
});

test('historical pnpm installer compatibility selects actual backends and preserves deployment provenance gates', async () => {
  const { workspacePackages } = await import('./validation-plan.mjs');
  const packages = await workspacePackages(fileURLToPath(new URL('../', import.meta.url)));
  const read = (file) =>
    file === 'scripts/deployment-bundle.mjs'
      ? execFileSync('git', ['show', '26756c80cfa4ddf9bda16269265e353fddeaeeaf:' + file], {
          encoding: 'utf8',
        })
      : readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const readBase = (file) =>
    execFileSync('git', ['show', '5cd8d72f42ff70268710049b8b20074df53bf7a3:' + file], {
      encoding: 'utf8',
    }).replaceAll('\r\n', '\n');
  const catalog = JSON.parse(read('apps/shell-web/src/standalone-games.json'));
  for (const file of ['infra/tencent/Dockerfile', 'scripts/deployment-bundle.mjs']) {
    const before = readBase(file);
    const anchor = file.endsWith('Dockerfile')
      ? '--store-dir=/pnpm/store --fetch-timeout=60000 --fetch-retries=2'
      : 'pnpm ${filters} install --prod --frozen-lockfile --ignore-scripts --fetch-timeout=60000 --fetch-retries=2';
    assert.equal(before.split(anchor).length, 2);
    const after = before.replace(anchor, anchor.replace(' --fetch-retries=2', ''));
    assert.equal(read(file).replaceAll('\r\n', '\n'), after);
    // npm still supports its retry option; pnpm keeps the existing production
    // lockfile, script isolation, timeout and registry settings.
    assert.match(after, /npm install[^\n]*--fetch-retries=2/);
    const context = {
      packages,
      games: catalog,
      changedPaths: [file],
      readBase,
      readHead: (name) => (name === file ? after : read(name)),
    };
    const classify = (extra = {}) => reviewedSharedFileScopes({ ...context, ...extra });
    const fileScopes = classify();
    assert.deepEqual(
      fileScopes.get(file),
      file.endsWith('Dockerfile')
        ? ['services/runtime-api', 'services/kart-server']
        : [
            'services/runtime-api',
            'services/management-api',
            'services/kart-server',
            'services/tianxia-server',
          ],
    );
    const plan = incrementalPlan({ ...context, fileScopes, readSource: read });
    assert.equal(plan.deployment_bundle_checks, true);
    assert.equal(plan.competition_service_checks, false);
    assert.equal(plan.browser, false);
    for (const bad of [
      after + '\n',
      after.replace('--fetch-retries=2', '--fetch-retries=0'),
      after.replace('registry.npm', 'untrusted.npm'),
    ]) {
      const rejected = classify({ readHead: (name) => (name === file ? bad : read(name)) });
      if (file.endsWith('Dockerfile')) assert.equal(rejected.has(file), false);
      else assert(rejected.get(file).includes('games/local/cops-robbers'));
    }
    assert.notDeepEqual(
      classify({ readBase: () => before + '\n' }).get(file),
      fileScopes.get(file),
    );
    const mixedPaths = [file, 'scripts/h5-ad-config.mjs'];
    const mixed = classify({ changedPaths: mixedPaths });
    assert.equal(
      incrementalPlan({ ...context, changedPaths: mixedPaths, fileScopes: mixed, readSource: read })
        .competition_service_checks,
      true,
    );
  }
  assert.equal(
    reviewedSharedFileScopes({
      packages,
      games: catalog,
      changedPaths: ['infra/tencent/unknown.Dockerfile'],
      readBase,
      readHead: read,
    }).size,
    0,
  );
});

test('service command and Turbo environment changes preserve every unrelated task and cache setting', () => {
  for (const file of ['package.json', 'turbo.json']) {
    const before = execFileSync(
      'git',
      ['show', 'c010423731cc22fb0657a4a86ac9811e1997bbc1:' + file],
      { encoding: 'utf8' },
    );
    const current = JSON.parse(
      execFileSync('git', ['show', '47687063bd522437962026b52ee6d784dfecd099:' + file], {
        encoding: 'utf8',
      }),
    );
    assert(competitionServiceConfigOnly(file, before, JSON.stringify(current)));
    const bad = structuredClone(current);
    if (file === 'package.json') bad.scripts['competition:game'] += ' && arbitrary-command';
    else bad.tasks['@coffeeeeffoc/shell-web#build:pages'].cache = true;
    assert(!competitionServiceConfigOnly(file, before, JSON.stringify(bad)));
    if (file === 'turbo.json') {
      current.tasks.build.env.push('COMPETITION_SERVICE_ENABLED');
      assert(!competitionServiceConfigOnly(file, before, JSON.stringify(current)));
    }
  }
});

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

test('only the two chase games may declare their online functionality disabled', () => {
  const file = 'scripts/competition-build.mjs';
  const value = JSON.parse(registry.slice(registry.indexOf('=') + 1, -1));
  value['cops-robbers-realtime'].online = false;
  const source = () => 'export const competitionGames = ' + JSON.stringify(value) + ';';
  assert.deepEqual(
    classify(file, registry, source()).get(file),
    Object.values(competitionConsumers),
  );
  for (const invalid of [true, 'false', 0]) {
    value['cops-robbers-realtime'].online = invalid;
    assert.equal(classify(file, registry, source()).has(file), false);
  }
  value['cops-robbers-realtime'].online = false;
  value['cops-robbers'].online = false;
  assert.deepEqual(
    classify(file, registry, source()).get(file),
    Object.values(competitionConsumers),
  );
  for (const invalid of [true, 'false', 0]) {
    value['cops-robbers'].online = invalid;
    assert.equal(classify(file, registry, source()).has(file), false);
  }
  value['cops-robbers'].online = false;
  value['letters-words2'].online = false;
  assert.equal(classify(file, registry, source()).has(file), false);
});

test('the exact cops offline flag selects only its game; surrounding builder changes retain the shared scope', () => {
  const file = 'scripts/competition-build.mjs';
  const after = readFileSync(new URL('../' + file, import.meta.url), 'utf8').replaceAll(
    '\r\n',
    '\n',
  );
  const before = after.replace("title: '围捕小队',\n    online: false,", "title: '围捕小队',");
  assert.notEqual(before, after);
  assert.deepEqual(classify(file, before, after).get(file), ['games/local/cops-robbers']);
  assert.deepEqual(
    classify(file, before, after + '\n').get(file),
    Object.values(competitionConsumers),
  );
});

test('offline chase competition builds discard stale service addresses and bundles', async () => {
  const { buildCompetition } = await import('./competition-build.mjs');
  const { mkdtemp, mkdir, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const outputRoot = await mkdtemp(join(tmpdir(), 'street-offline-build-'));
  try {
    for (const only of ['cops-robbers', 'cops-robbers-realtime']) {
      const directory = join(outputRoot, only);
      await mkdir(directory);
      await writeFile(
        join(directory, 'index.html'),
        '<html><head></head><body><script defer src="./competition.js"></script></body></html>',
      );
      await writeFile(join(directory, 'competition.js'), 'stale online code');
      await buildCompetition({
        only,
        outputRoot,
        env: {
          COMPETITION_SERVICE_ENABLED: '0',
          COMPETITION_PUBLIC_API_URL: 'https://old.invalid/api',
        },
      });
      const html = await readFile(join(directory, 'index.html'), 'utf8');
      assert(!html.includes('competition.js') && !html.includes('old.invalid'));
      assert(html.includes('"competitionEnabled":false'));
      await assert.rejects(readFile(join(directory, 'competition.js')), { code: 'ENOENT' });
    }
  } finally {
    await rm(outputRoot, { recursive: true });
  }
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
  const ids = ['letters-words2', 'vibeJam-myself-history-guess'];
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
    calls.slice(4, 8).map((call) => call.args[0]),
    [
      'scripts/test-competition-dialogs.mjs',
      'scripts/letters-words2-competition-renderer.test.mjs',
      'scripts/letters-words2-competition-mobile.browser.mjs',
      'scripts/letters-words2-iframe.browser.mjs',
    ],
  );
  assert.equal(calls[7].env.GAME_URL, 'http://fixture/');
  assert.equal(calls[7].env.PLAYWRIGHT_EXECUTABLE, '/browser');
  assert.equal(calls[7].env.KEEP, 'yes');
  assert.equal(calls[8].closed, true);
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
        after.replace('games/submodules/xiangqi-five', 'games/submodules/unregistered-game'),
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
    for (const module of [
      'publication-scopes.mjs',
      'vite-patch-scope.mjs',
      'competition-ingress.mjs',
      'admin-csp.mjs',
    ])
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
    for (const module of [
      'publication-scopes.mjs',
      'vite-patch-scope.mjs',
      'competition-ingress.mjs',
      'admin-csp.mjs',
    ])
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
test('cops rewarded hint guard stays in its game branch and rejects unrelated edits', () => {
  const after = execFileSync(
    'git',
    ['show', '5fbc6feadf2663e1905538ab6b6feae0ed26156b:' + sharedChecksFile],
    { encoding: 'utf8' },
  );
  const added = `    await click(
      frame
        .getByRole('dialog', { name: '模拟广告' })
        .getByRole('button', { name: '领取奖励', exact: true }),
    );
`;
  const before = after.replace(added, '');
  assert.notEqual(before, after);
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
  for (const invalid of [
    after.replace("name: '领取奖励'", "name: '关闭并继续'"),
    after.replace("'data-turn', '1'", "'data-turn', '2'"),
    after + 'globalThis.injected = true;\n',
  ])
    assert.equal(reviewedSharedFileScopes({ ...context, readHead: () => invalid }).size, 0);
});

test('cops free-hint contract remains scoped and rejects weakened or unrelated assertions', () => {
  const before = execFileSync(
    'git',
    ['show', '5fbc6feadf2663e1905538ab6b6feae0ed26156b:' + sharedChecksFile],
    { encoding: 'utf8' },
  );
  const after = frozenCleanupBase(sharedChecksFile).replaceAll('\r\n', '\n');
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
  for (const invalid of [
    after.replace("'aria-label', '获取提示'", "'aria-label', '看广告获取提示'"),
    after.replace("{ name: '模拟广告' })).toHaveCount(0)", "{ name: '模拟广告' })).toHaveCount(1)"),
    after.replace("'data-turn', '1'", "'data-turn', '2'"),
    after.replace("id === 'cops-robbers'", "id === 'other'"),
    after + '\n',
  ])
    assert.equal(reviewedSharedFileScopes({ ...context, readHead: () => invalid }).size, 0);
  assert.equal(reviewedSharedFileScopes({ ...context, games: [] }).size, 0);
  assert.equal(
    reviewedSharedFileScopes({
      ...context,
      readBase: () => '/*\n' + before + '\n*/',
      readHead: () => '/*\n' + after + '\n*/',
    }).size,
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
  const after = execFileSync(
    'git',
    ['show', '5fbc6feadf2663e1905538ab6b6feae0ed26156b:' + sharedChecksFile],
    { encoding: 'utf8' },
  )
    .replaceAll('\r\n', '\n')
    .replace(
      `    await click(
      frame
        .getByRole('dialog', { name: '模拟广告' })
        .getByRole('button', { name: '领取奖励', exact: true }),
    );
`,
      '',
    ); // Exercise the historical Orbit-only diff; the cops delta is checked separately above.
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
  // Historical service delta; identity migration and gateway renewal are reviewed separately.
  const read = (file) =>
    ['scripts/deploy-tencent.mjs', 'scripts/competition-gateway.mjs'].includes(file)
      ? execFileSync('git', ['show', '26756c80cfa4ddf9bda16269265e353fddeaeeaf:' + file], {
          encoding: 'utf8',
        })
      : readFileSync(new URL('../' + file, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const files = [
    'platforms/competition/game-services.js',
    'platforms/competition/tests/game-services.test.mjs',
    'scripts/competition-gateway.mjs',
    'scripts/competition-gateway.test.mjs',
    'scripts/deploy-tencent.mjs',
  ];
  const before = (file) =>
    execFileSync('git', ['show', 'c010423731cc22fb0657a4a86ac9811e1997bbc1:' + file], {
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
    'carding-car',
    'cops-robbers',
    'cops-robbers-realtime',
    'letters-words2',
    'night-overwatch',
    'tower-brake',
    'vibeJam-myself-history-guess',
    'wulong-city',
    'xiangqi-five',
  ]);
  assert.deepEqual(plan.developer_mode_ids, ['cage-rescue', 'tower-brake']);
  assert.deepEqual(plan.publishing_browser_ids, [
    'cage-rescue',
    'cops-robbers',
    'cops-robbers-realtime',
    'tower-brake',
    'wulong-city',
  ]);
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

test('shared identity client proves all thirteen consumers and native composition never loses any', async () => {
  const { competitionIdentityConsumers, competitionIdentityFileScope } = await import(
    './publication-scopes.mjs'
  );
  const { nineNativeFileScopes } = await import('./nine-native-scope.mjs');
  const { workspacePackages } = await import('./validation-plan.mjs');
  const catalog = JSON.parse(
    readFileSync(new URL('../apps/shell-web/src/standalone-games.json', import.meta.url), 'utf8'),
  );
  const pkgs = await workspacePackages(fileURLToPath(new URL('../', import.meta.url)));
  const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const context = {
    changedPaths: ['platforms/competition/client.js'],
    games: catalog,
    packages: pkgs,
    readBase: read,
    readHead: read,
  };
  const expected = Object.values(competitionIdentityConsumers);
  assert.equal(expected.length, 13);
  assert.deepEqual(competitionIdentityFileScope(context), expected);
  const general = reviewedSharedFileScopes(context),
    native = nineNativeFileScopes(context);
  const combined = new Map([...general, ...native]);
  assert.deepEqual(general.get(context.changedPaths[0]), expected);
  assert.deepEqual(native.get(context.changedPaths[0]), expected);
  assert.deepEqual(combined.get(context.changedPaths[0]), expected);
  const result = incrementalPlan({ ...context, fileScopes: combined, readSource: read });
  assert.deepEqual(result.browser_ids, Object.keys(competitionIdentityConsumers).sort());
  assert.equal(result.identity_checks, true);
  assert.equal(result.nine_native_targets.length, 18);
  assert.deepEqual(
    result.nine_native_blocked.map((item) => item.game),
    ['carding-car'],
  );
  assert(
    result.nine_native_targets
      .filter((target) => target.game === 'carding-car')
      .every((target) => target.requiresCreator === '3.8.8'),
  );
  for (const variant of [
    { games: catalog.filter((game) => game.id !== 'carrom-club') },
    { games: [...catalog, catalog.find((game) => game.id === 'flick-arena')] },
    { games: [...catalog, { id: 'alias', source: 'games/local/tower-brake' }] },
    { packages: pkgs.filter((pkg) => pkg.dir !== 'games/local/cage-rescue') },
    { packages: [...pkgs, pkgs.find((pkg) => pkg.dir === 'games/local/carding-car')] },
  ]) {
    assert.equal(reviewedSharedFileScopes({ ...context, ...variant }).size, 0);
    assert.equal(nineNativeFileScopes({ ...context, ...variant }).size, 0);
  }
  for (const [file, changed] of [
    [
      'platforms/competition/client.js',
      read('platforms/competition/client.js') + "\nimport './unknown.js';",
    ],
    [
      'platforms/competition/client.js',
      read('platforms/competition/client.js') + '\nrequire(dynamicModule);',
    ],
    [
      'games/local/flick-arena/competition-client.js',
      read('games/local/flick-arena/competition-client.js') + '\n',
    ],
    [
      'games/local/three-choose-two/competition.js',
      read('games/local/three-choose-two/competition.js') + '\n',
    ],
    [
      'platforms/competition/game-services.js',
      read('platforms/competition/game-services.js').replace("import './client.js';", ''),
    ],
    [
      'platforms/competition/game-services.js',
      read('platforms/competition/game-services.js') + "\nimport './unknown.js';",
    ],
    [
      'platforms/competition/game-services.js',
      read('platforms/competition/game-services.js') + "\nimport './client.js';",
    ],
    [
      'platforms/competition/game-services.js',
      read('platforms/competition/game-services.js') + "\nawait import('./unknown.js');",
    ],
    [
      'games/local/cage-rescue/build.mjs',
      read('games/local/cage-rescue/build.mjs').replace(
        "new URL('client.js', dist)",
        "new URL('other.js', dist)",
      ),
    ],
    [
      'games/local/tower-brake/build.mjs',
      read('games/local/tower-brake/build.mjs').replace(
        "new URL('../../../platforms/competition/client.js', import.meta.url)",
        "new URL('../../../platforms/competition/other.js', import.meta.url)",
      ),
    ],
    [
      'games/local/cage-rescue/server.mjs',
      read('games/local/cage-rescue/server.mjs').replace(
        "pathname === '/client.js'",
        "pathname === '/wrong.js'",
      ),
    ],
    [
      'games/local/tower-brake/turbo.json',
      JSON.stringify({
        extends: ['//'],
        tasks: {
          build: {
            inputs: ['$TURBO_DEFAULT$', '$TURBO_ROOT$/platforms/competition/game-services.js'],
          },
        },
      }),
    ],
    [
      'games/local/cage-rescue/turbo.json',
      JSON.stringify({
        extends: ['//'],
        tasks: {
          build: {
            inputs: [
              '$TURBO_DEFAULT$',
              '$TURBO_ROOT$/platforms/competition/client.js',
              '$TURBO_ROOT$/platforms/competition/game-services.js',
              '$TURBO_DEFAULT$',
            ],
          },
        },
      }),
    ],
  ]) {
    assert.notEqual(changed, read(file), file);
    const altered = { ...context, readHead: (name) => (name === file ? changed : read(name)) };
    assert.equal(reviewedSharedFileScopes(altered).has(context.changedPaths[0]), false, file);
    assert.equal(nineNativeFileScopes(altered).has(context.changedPaths[0]), false, file);
  }
  const mirror = 'games/local/flick-arena/competition-client.js';
  const drift = {
    ...context,
    changedPaths: [mirror],
    readHead: (name) => read(name) + (name === mirror ? '\n' : ''),
  };
  assert.throws(
    () =>
      incrementalPlan({
        ...drift,
        fileScopes: reviewedSharedFileScopes(drift),
        readSource: drift.readHead,
      }),
    /identity mirror drift/,
  );
});

test('identity display and security files have their real H5 consumers; unknown siblings stay blocked', async () => {
  const { workspacePackages } = await import('./validation-plan.mjs');
  const catalog = JSON.parse(
    readFileSync(new URL('../apps/shell-web/src/standalone-games.json', import.meta.url), 'utf8'),
  );
  const pkgs = await workspacePackages(fileURLToPath(new URL('../', import.meta.url)));
  const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  for (const file of [
    'platforms/competition/profile-dom.js',
    'platforms/competition/h5.css',
    'platforms/competition/street-pages.js',
    'platforms/competition/street.css',
    'platforms/competition/tests/street-admission.test.mjs',
    'platforms/competition/tests/identity.test.mjs',
  ]) {
    const context = {
      changedPaths: [file],
      games: catalog,
      packages: pkgs,
      readBase: read,
      readHead: read,
    };
    const scoped = reviewedSharedFileScopes(context);
    const expected = file.includes('/street')
      ? [competitionConsumers['cops-robbers-realtime']]
      : file.includes('/tests/identity')
        ? Object.values((await import('./publication-scopes.mjs')).competitionIdentityConsumers)
        : Object.values(competitionConsumers);
    assert.deepEqual(scoped.get(file), expected, file);
    const result = incrementalPlan({ ...context, fileScopes: scoped, readSource: read });
    assert.equal(result.full, false);
    if (file.endsWith('profile-dom.js') || file.endsWith('identity.test.mjs'))
      assert.equal(result.identity_checks, true);
  }
  const unknown = 'platforms/competition/profile-extra.js';
  const context = {
    changedPaths: [unknown],
    games: catalog,
    packages: pkgs,
    readBase: read,
    readHead: read,
  };
  assert.throws(
    () =>
      incrementalPlan({
        ...context,
        fileScopes: reviewedSharedFileScopes(context),
        readSource: read,
      }),
    /scope undefined/,
  );
});

test('identity migration and registrations are exact additive runtime-only changes', () => {
  const read = (file) =>
    ([
      'scripts/competition.mjs',
      'scripts/platform.mjs',
      'scripts/deploy-tencent.mjs',
      'infra/migrations/013-competition-identities.sql',
    ].includes(file)
      ? execFileSync('git', ['show', '0d7bfdfe4087b85139dc525e9a75f3ab792e17f6:' + file], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      : readFileSync(new URL('../' + file, import.meta.url), 'utf8')
    )
      .replaceAll('\r\n', '\n')
      .replace(file === 'scripts/deploy-tencent.mjs' ? ingressPreflightGuard : '\0', '');
  const migration = 'infra/migrations/013-competition-identities.sql';
  const files = [
    migration,
    'scripts/competition.mjs',
    'scripts/platform.mjs',
    'scripts/deploy-tencent.mjs',
  ];
  const original = (file) =>
    file === migration
      ? null
      : execFileSync('git', ['show', '26756c80cfa4ddf9bda16269265e353fddeaeeaf:' + file], {
          encoding: 'utf8',
        });
  const context = {
    changedPaths: files,
    games: [],
    packages: [{ name: 'runtime', dir: 'services/runtime-api' }],
    readBase: original,
    readHead: read,
  };
  const classified = reviewedSharedFileScopes(context);
  for (const file of files) assert.deepEqual(classified.get(file), ['services/runtime-api'], file);
  const result = incrementalPlan({ ...context, fileScopes: classified, readSource: read });
  assert.deepEqual(result.game_sources, []);
  assert.deepEqual(result.service_rule_sources, ['services/runtime-api']);
  for (const file of files) {
    for (const changed of [read(file) + '\n', read(file) + '\nselect 1;\n'])
      assert.equal(
        reviewedSharedFileScopes({
          ...context,
          changedPaths: [file],
          readHead: (name) => (name === file ? changed : read(name)),
        }).has(file),
        false,
        file,
      );
    if (file !== migration) {
      assert.equal(
        reviewedSharedFileScopes({
          ...context,
          changedPaths: [file],
          readBase: (name) => original(name) + '\n',
        }).has(file),
        false,
      );
      const marker =
        file === 'scripts/competition.mjs'
          ? "  await psql(\n    await readFile(new URL('../infra/migrations/013-competition-identities.sql', import.meta.url)),\n    mode === 'test-db' ? 'competition_test' : 'small_games',\n  );\n"
          : "    '013-competition-identities.sql',\n";
      assert(read(file).includes(marker));
      const duplicated = read(file).replace(marker, marker + marker);
      assert.equal(
        reviewedSharedFileScopes({
          ...context,
          changedPaths: [file],
          readHead: (name) => (name === file ? duplicated : read(name)),
        }).has(file),
        false,
      );
    }
  }
  const unknown = 'infra/migrations/014-unreviewed.sql';
  const other = {
    ...context,
    changedPaths: [unknown],
    readBase: () => null,
    readHead: () => read(migration),
  };
  assert.throws(
    () =>
      incrementalPlan({
        ...other,
        fileScopes: reviewedSharedFileScopes(other),
        readSource: other.readHead,
      }),
    /scope undefined/,
  );
});

test('identity gateway routing has exact consumers and rejects any other proxy change', async () => {
  const { workspacePackages } = await import('./validation-plan.mjs');
  const file = 'scripts/competition-gateway.mjs';
  const read = (name) =>
    name === file
      ? execFileSync('git', ['show', '0d7bfdfe4087b85139dc525e9a75f3ab792e17f6:' + name], {
          encoding: 'utf8',
        })
      : readFileSync(new URL('../' + name, import.meta.url), 'utf8');
  const before = execFileSync('git', ['show', '26756c80cfa4ddf9bda16269265e353fddeaeeaf:' + file], {
    encoding: 'utf8',
  });
  const after = read(file);
  assert(identityGatewayFileScope(before, after));
  for (const [old, current] of [
    [before + '\n', after],
    [before, after + '\n'],
    [before, after.replace("host: '127.0.0.1'", "host: '0.0.0.0'")],
    [before, after.replace('refresh|upgrade', 'refresh|upgrade|internal')],
  ])
    assert.equal(identityGatewayFileScope(old, current), false);
  const context = {
    changedPaths: [file],
    games: JSON.parse(read('apps/shell-web/src/standalone-games.json')),
    packages: await workspacePackages(fileURLToPath(new URL('../', import.meta.url))),
    readBase: (name) => (name === file ? before : read(name)),
    readHead: read,
  };
  const consumers = reviewedSharedFileScopes(context).get(file);
  assert(consumers);
  assert.equal(new Set(consumers).size, 15);
  for (const source of [
    'games/local/cops-robbers',
    'games/local/flick-arena',
    'games/local/three-choose-two',
    'services/runtime-api',
    'apps/shell-web',
  ])
    assert(consumers.includes(source));
});

test('identity compatibility fixtures keep the existing finite Runtime package scope', async () => {
  const { workspacePackages } = await import('./validation-plan.mjs');
  const packages = await workspacePackages(fileURLToPath(new URL('../', import.meta.url)));
  for (const file of [
    'competition-compatibility-fixture.mjs',
    'competition-compatibility.test.mjs',
    'competition-compatibility.integration.test.mjs',
    'competition-identity.integration.test.ts',
  ]) {
    const changedPaths = ['services/runtime-api/tests/' + file];
    const plan = incrementalPlan({ packages, games: [], changedPaths, readSource: () => '' });
    assert.equal(plan.full, false);
    assert.deepEqual(plan.game_sources, []);
    assert.deepEqual(plan.service_rule_sources, ['services/runtime-api']);
  }
});

test('admin infrastructure has exact consumers and unknown neighboring paths fail closed', () => {
  const packages = [
    { name: 'management', dir: 'services/management-api' },
    { name: '@coffeeeeffoc/admin-web', dir: 'apps/admin-web' },
    { name: '@coffeeeeffoc/company-web', dir: 'apps/company-web' },
    ...selectedBackendConsumers.map((dir) => ({ dir, name: dir })),
  ];
  for (const file of adminConsoleScopePaths) {
    const context = { packages, games: [], changedPaths: [file], readSource: () => '' };
    const fileScopes = reviewedSharedFileScopes(context);
    const controlMigration = adminControlDeploymentScopePaths.includes(file);
    assert.deepEqual(fileScopes.get(file), [
      ...(sharedDeploymentScopePaths.includes(file) ? ['apps/company-web'] : []),
      'services/management-api',
      'apps/admin-web',
      ...(controlMigration ? ['services/runtime-api', 'services/kart-server'] : []),
      ...(backendSharedScopePaths.includes(file) ? selectedBackendConsumers : []),
    ]);
    const plan = incrementalPlan({ ...context, fileScopes });
    assert.equal(plan.admin_console_checks, true);
    assert.equal(plan.browser, false);
    assert.deepEqual(plan.browser_ids, []);
    assert.deepEqual(plan.service_rule_sources, [
      ...(backendSharedScopePaths.includes(file) || controlMigration
        ? ['services/runtime-api', 'services/kart-server']
        : []),
      ...(backendSharedScopePaths.includes(file) ? ['services/tianxia-server'] : []),
      'services/management-api',
    ]);
  }
  for (const file of [
    'infra/admin-console/migrations/002-unreviewed.sql',
    'infra/admin-console/migrations/003-control-center.sql',
    'infra/admin-console/compose.yaml',
    'infra/admin-console/.env.other',
    'infra/admin-console/.gitattributes.other',
  ]) {
    const context = { packages, games: [], changedPaths: [file] };
    const fileScopes = reviewedSharedFileScopes(context);
    assert.equal(fileScopes.size, 0);
    assert.throws(() => incrementalPlan({ ...context, fileScopes }), /scope undefined/);
  }
});

const frozenCleanupBase = (file) =>
  execFileSync('git', ['show', '87f541738ff49df880b0dcb5069ef485c5102e95:' + file], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
  });

// Freeze the reviewed pre-Cocos wiring when exercising older, exact delta proofs.
const frozenHomeboundBaseline = (file) =>
  execFileSync('git', ['show', '0459b0cb3c89a748f3a6bd252858951ba1ca073d:' + file], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
  }).replaceAll('\r\n', '\n');

const frozenAdminBaseline = (file) =>
  execFileSync('git', ['show', '1367ae4f9758fb3a36935267db236e481b67d52a:' + file], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
  }).replaceAll('\r\n', '\n');

test('AntD lock extension preserves all other importers and resolutions and rejects extra dependency or byte changes', () => {
  const file = 'pnpm-lock.yaml',
    before = frozenAdminBaseline(file);
  const after = frozenCleanupBase(file).replaceAll('\r\n', '\n');
  const manifest = readFileSync(
    new URL('../apps/admin-web/package.json', import.meta.url),
    'utf8',
  ).replaceAll('\r\n', '\n');
  const classify = (head, pkg = manifest, base = before) =>
    reviewedSharedFileScopes({
      changedPaths: [file],
      games: [],
      packages: [{ dir: 'apps/admin-web', name: '@coffeeeeffoc/admin-web' }],
      readBase: () => base,
      readHead: (name) => (name === file ? head : pkg),
    });
  assert.deepEqual(classify(after).get(file), ['apps/admin-web']);
  for (const changed of [
    after + '\n',
    after.replace('specifier: 6.6.6', 'specifier: 6.6.7'),
    after.replace('sha512-', 'sha512-X'),
    after.replace(
      "  '@ant-design/colors@8.0.1':",
      "  '@ant-design/colors@8.0.1': {}\n\n  '@ant-design/colors@8.0.1':",
    ),
  ])
    assert.equal(classify(changed).has(file), false);
  assert.equal(classify(after, manifest, before + '\n').has(file), false);
  const extra = JSON.parse(manifest);
  extra.dependencies.unrelated = '1.0.0';
  assert.equal(classify(after, JSON.stringify(extra, null, 2) + '\n').has(file), false);
  assert.equal(
    classify(after, manifest.replace('"antd": "6.6.6"', '"antd": "0.0.0", "antd": "6.6.6"')).has(
      file,
    ),
    false,
  );
});

test('cross-service PostgreSQL acceptance selects both real services and rejects adjacent tools', () => {
  const consumers = ['services/management-api', 'services/runtime-api'];
  const packages = consumers.map((dir) => ({ dir, name: dir.split('/').at(-1) }));
  const files = [
    'scripts/admin-control-postgres.mjs',
    'scripts/admin-control-runtime-postgres.mjs',
  ];
  const context = { changedPaths: files, packages, games: [] };
  const scopes = reviewedSharedFileScopes(context);
  for (const file of files) {
    assert.deepEqual(scopes.get(file), consumers);
    assert.equal(
      reviewedSharedFileScopes({ ...context, packages: packages.slice(0, 1) }).has(file),
      false,
    );
  }
  assert.equal(
    reviewedSharedFileScopes({
      ...context,
      changedPaths: ['scripts/admin-control-postgres-other.mjs'],
    }).size,
    0,
  );
});

test('CSP tools select only actual admin/company consumers, exact Turbo inputs and mandatory Caddy checks', () => {
  const packages = [
    { dir: 'apps/admin-web', name: '@coffeeeeffoc/admin-web' },
    { dir: 'apps/company-web', name: '@coffeeeeffoc/company-web' },
  ];
  for (const file of adminCspScopePaths) {
    const context = {
      changedPaths: [file],
      packages,
      games: [],
      readBase: () => '',
      readHead: () => '',
    };
    const fileScopes = reviewedSharedFileScopes(context);
    assert.deepEqual(fileScopes.get(file), ['apps/admin-web', 'apps/company-web']);
    const plan = incrementalPlan({ ...context, fileScopes, readSource: () => '' });
    assert.equal(plan.full, false);
    assert.equal(plan.admin_csp_checks, true);
    assert.equal(plan.admin_console_checks, true);
    assert.deepEqual(plan.browser_ids, []);
    assert.equal(reviewedSharedFileScopes({ ...context, packages: [] }).has(file), false);
  }
  const before = frozenAdminBaseline('turbo.json');
  const after = frozenHomeboundBaseline('turbo.json');
  const classify = (value) =>
    reviewedSharedFileScopes({
      changedPaths: ['turbo.json'],
      packages,
      games: [],
      readBase: () => before,
      readHead: () => value,
    });
  assert.deepEqual(classify(after).get('turbo.json'), ['apps/admin-web']);
  const invalid = JSON.parse(after);
  invalid.tasks['@coffeeeeffoc/admin-web#build'].inputs.push('$TURBO_ROOT$/arbitrary/**');
  assert.equal(classify(JSON.stringify(invalid)).has('turbo.json'), false);
  assert.equal(
    reviewedSharedFileScopes({
      changedPaths: ['scripts/admin-csp-other.mjs'],
      packages,
      games: [],
      readBase: () => '',
      readHead: () => '',
    }).size,
    0,
  );
});

test('admin lock proof accepts only the 11 reviewed complete blocks, manifest tuple, and unchanged two-document remainder', () => {
  const file = 'pnpm-lock.yaml';
  const before = execFileSync('git', ['show', '6e9c1f7246090c7009e9519a8cda6e8efab956d5:' + file], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
  });
  const after = frozenAdminBaseline(file);
  const manifest = JSON.parse(frozenAdminBaseline('apps/admin-web/package.json'));
  const packages = [{ dir: 'apps/admin-web', name: manifest.name }];
  const classify = (old, current, pkg = manifest) =>
    reviewedSharedFileScopes({
      changedPaths: [file],
      packages,
      games: [],
      readBase: () => old,
      readHead: (name) => {
        if (name === file) return current;
        assert.equal(name, 'apps/admin-web/package.json', 'manifest absent from this tree');
        return typeof pkg === 'string' ? pkg : JSON.stringify(pkg, null, 2) + '\n';
      },
    });
  assert.equal((before.match(/^---$/gm) || []).length, 2);
  assert.equal((after.match(/^---$/gm) || []).length, 2);
  assert.deepEqual(classify(before, after).get(file), ['apps/admin-web']);
  const manifestText = JSON.stringify(manifest, null, 2) + '\n';
  const duplicateKey = manifestText.replace(
    '"react": "19.3.1"',
    '"react": "0.0.0",\n    "react": "19.3.1"',
  );
  assert.deepEqual(JSON.parse(duplicateKey), manifest);
  assert.equal(classify(before, after, duplicateKey).has(file), false, 'duplicate manifest key');
  assert.equal(
    classify(before, after, JSON.stringify(manifest)).has(file),
    false,
    'noncanonical manifest bytes',
  );
  const blocks = [];
  for (const table of ['importers', 'packages', 'snapshots']) {
    const start = after.lastIndexOf(`\n${table}:\n`) + table.length + 3;
    const tail = after.slice(start),
      end = tail.search(/^\S/m);
    const body = end < 0 ? tail : tail.slice(0, end);
    const entries = [...body.matchAll(/^  (\S[^\n]*?):(?: \{\})?\n/gm)];
    for (let i = 0; i < entries.length; i++) {
      const key = entries[i][1].replace(/^'(.*)'$/, '$1');
      if (
        key === 'apps/admin-web' ||
        /^@remix-run\/route-pattern@0\.22\.1(?:$|\()/.test(key) ||
        /^(react(?:-dom|-router)?|vite)@(19\.3\.1|8\.4\.0|8\.3\.4)(?:$|\()/.test(key)
      )
        blocks.push(
          body.slice(entries[i].index, i + 1 < entries.length ? entries[i + 1].index : body.length),
        );
    }
  }
  assert.equal(blocks.length, 11);
  let remainder = after;
  for (const block of blocks) {
    assert.equal(remainder.split(block).length, 2);
    remainder = remainder.replace(block, '');
  }
  assert.equal(remainder, before);
  for (const block of blocks) {
    assert.equal(
      classify(before, after.replace(block, '')).has(file),
      false,
      'missing reviewed block',
    );
    assert.equal(
      classify(before, after.replace(block, block + block)).has(file),
      false,
      'duplicate reviewed block',
    );
    assert.equal(
      classify(before, after.replace(block, block.replace('\n', ' # drift\n'))).has(file),
      false,
      'block bytes drift',
    );
  }
  for (const [old, current] of [
    [before + '\n', after],
    [before, after + '\n'],
    [before, after.replace("lockfileVersion: '9.0'", "lockfileVersion: '8.0'")],
    [before, after.replace('sha512-', 'sha512-Z')],
  ])
    assert.equal(classify(old, current).has(file), false, 'other document/remainder byte drift');
  for (const mutate of [
    (p) => (p.dependencies.react = '19.3.2'),
    (p) => (p.devDependencies.vite = '8.3.5'),
    (p) => (p.optionalDependencies = { extra: '1.0.0' }),
    (p) => (p.peerDependencies = { react: '*' }),
    (p) => (p.scripts.test = 'node bypass.mjs'),
    (p) => (p.name = 'wrong'),
  ]) {
    const current = structuredClone(manifest);
    mutate(current);
    assert.equal(classify(before, after, current).has(file), false);
  }
});

test('admin lock proof plans without installed YAML dependencies', async () => {
  const { mkdtemp, copyFile, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const file = 'pnpm-lock.yaml';
  const before = execFileSync('git', ['show', '6e9c1f7246090c7009e9519a8cda6e8efab956d5:' + file], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
  });
  const after = frozenAdminBaseline(file);
  const manifest = JSON.parse(frozenAdminBaseline('apps/admin-web/package.json'));
  const directory = await mkdtemp(join(tmpdir(), 'admin-gates-no-deps-'));
  try {
    for (const module of [
      'publication-scopes.mjs',
      'vite-patch-scope.mjs',
      'competition-ingress.mjs',
      'admin-csp.mjs',
    ])
      await copyFile(new URL(module, import.meta.url), join(directory, module));
    await writeFile(
      join(directory, 'fixture.json'),
      JSON.stringify([
        { before, after, manifest },
        {
          before: frozenAdminBaseline(file),
          after: frozenCleanupBase(file).replaceAll('\r\n', '\n'),
          manifest: JSON.parse(
            readFileSync(new URL('../apps/admin-web/package.json', import.meta.url), 'utf8'),
          ),
        },
      ]),
    );
    await writeFile(
      join(directory, 'probe.mjs'),
      `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      import { readFileSync } from 'node:fs';
      import { reviewedSharedFileScopes } from './publication-scopes.mjs';
      assert.throws(() => createRequire(import.meta.url).resolve('js-yaml'));
      for (const { before, after, manifest } of JSON.parse(readFileSync(new URL('./fixture.json', import.meta.url), 'utf8'))) {
      const classify = (current, pkg = manifest) => reviewedSharedFileScopes({
        changedPaths: ['pnpm-lock.yaml'], games: [],
        packages: [{ dir: 'apps/admin-web', name: manifest.name }],
        readBase: () => before,
        readHead: (file) => file === 'pnpm-lock.yaml' ? current : JSON.stringify(pkg, null, 2) + '\\n',
      });
      assert.deepEqual(classify(after).get('pnpm-lock.yaml'), ['apps/admin-web']);
      assert.equal(classify(after + '\\n').has('pnpm-lock.yaml'), false);
      assert.equal(classify(after, { ...manifest, name: 'unreviewed' }).has('pnpm-lock.yaml'), false);
      }
    `,
    );
    execFileSync(process.execPath, [join(directory, 'probe.mjs')], {
      cwd: directory,
      env: { ...process.env, NODE_PATH: '' },
      stdio: 'pipe',
      encoding: 'utf8',
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const [name, command] of [
  ['push:no-verify', 'git push --no-verify'],
  ['validate:candidate', 'node scripts/validate-candidate.mjs'],
])
  test(`the ${name} command has no game consumers and rejects unrelated package changes`, () => {
    const json = (value) => JSON.stringify(value, null, 2) + '\n';
    const previous = { scripts: { build: 'keep' }, dependencies: { example: '1.0.0' } };
    const current = structuredClone(previous);
    current.scripts[name] = command;
    const before = json(previous),
      after = json(current);
    assert.deepEqual(targetedCommandsOnly(before, after), []);
    const context = {
      changedPaths: ['package.json'],
      packages: [],
      games: [],
      readBase: () => before,
      readHead: () => after,
    };
    const fileScopes = reviewedSharedFileScopes(context);
    assert.deepEqual(fileScopes.get('package.json'), []);
    const plan = incrementalPlan({ ...context, fileScopes, readSource: () => '' });
    assert.equal(plan.full, false);
    assert.deepEqual(plan.consumer_sources, []);
    assert.deepEqual(plan.browser_ids, []);
    for (const invalid of [
      after.replace(command, command + ' --unexpected'),
      after.replace('keep', 'changed'),
      after.replace('1.0.0', '2.0.0'),
      after.replace('"scripts": {', '"scripts": {}, "scripts": {'),
      after.replace('"build":', '"prepush:no-verify": "arbitrary-command", "build":'),
    ]) {
      assert.equal(targetedCommandsOnly(before, invalid), null);
      assert.equal(
        reviewedSharedFileScopes({ ...context, readHead: () => invalid }).has('package.json'),
        false,
      );
    }
    assert.equal(targetedCommandsOnly(after, before), null);
    assert.equal(targetedCommandsOnly(after, after), null);
  });

test('selected backend tools and additive local build commands have finite consumers', () => {
  const games = ['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'].map((id) => ({
    id,
    source: competitionConsumers[id],
  }));
  const packages = [
    ...games.map((game) => ({ dir: game.source, name: game.id })),
    ...selectedBackendConsumers.map((dir) => ({ dir, name: dir })),
  ];
  const previous = { scripts: { 'deploy:admin': 'node scripts/deploy-admin.mjs', other: 'keep' } },
    next = {
      scripts: {
        ...previous.scripts,
        'deploy:backend': 'node scripts/deploy-backend.mjs',
        'build:games': 'node scripts/build-games.mjs',
        'push:no-verify': 'git push --no-verify',
      },
    };
  const json = (value) => JSON.stringify(value, null, 2) + '\n',
    before = json(previous),
    after = json(next);
  assert.deepEqual(targetedCommandsOnly(before, after), [
    ...selectedBackendConsumers,
    ...games.map((game) => game.source),
  ]);
  for (const current of [
    after.replace('keep', 'changed'),
    after.replace('node scripts/build-games.mjs', 'node unsafe.mjs'),
    after.replace('"scripts": {', '"scripts": {}, "scripts": {'),
  ])
    assert.equal(targetedCommandsOnly(before, current), null);
  for (const file of [...backendDeploymentScopePaths, 'package.json']) {
    const context = {
      changedPaths: [file],
      packages,
      games,
      readBase: () => before,
      readHead: () => after,
    };
    const scopes = reviewedSharedFileScopes(context),
      plan = incrementalPlan({ ...context, fileScopes: scopes, readSource: () => '' });
    assert.deepEqual(
      scopes.get(file),
      file === 'package.json'
        ? [...selectedBackendConsumers, ...games.map((game) => game.source)]
        : selectedBackendConsumers,
    );
    assert.equal(plan.backend_deployment_checks, true);
    assert.equal(plan.full, false);
    assert.deepEqual(plan.native_consumers, []);
    assert(!plan.consumer_sources.includes('apps/admin-web'));
  }
  for (const file of [
    'infra/backend-update/extra.py',
    'infra/builds/extra.json',
    'scripts/build-games-extra.mjs',
  ])
    assert.equal(reviewedSharedFileScopes({ changedPaths: [file], packages, games }).size, 0);
  const classify = (current) =>
    reviewedSharedFileScopes({
      changedPaths: ['.gitignore'],
      packages,
      games,
      readBase: () => '',
      readHead: () => current,
    });
  assert(classify('/game-build.local.json\n').has('.gitignore'));
  assert(classify('/game-build.local.js\n').has('.gitignore'));
  assert.equal(classify('/game-build.local.mjs\n').size, 0);
  assert.equal(classify('/game-build.local.json\nscripts/\n').size, 0);
});

test('shared authority helper selects only its three backend consumers and bounded contracts', async () => {
  const packages = [...imageAuthorityConsumers, 'services/tianxia-server'].map((dir) => ({
    dir,
    name: dir,
  }));
  for (const file of imageAuthorityScopePaths) {
    const context = { changedPaths: [file], packages, games: [], readSource: () => '' };
    const fileScopes = reviewedSharedFileScopes(context);
    assert.deepEqual(fileScopes.get(file), imageAuthorityConsumers);
    const plan = incrementalPlan({ ...context, fileScopes });
    assert.equal(plan.image_authority_checks, true);
    assert.equal(plan.full, false);
    assert.equal(plan.admin_console_checks, true);
    assert(!plan.consumer_sources.includes('services/tianxia-server'));
    assert.deepEqual(plan.browser_ids, []);
    assert.deepEqual(plan.native_consumers, []);
  }
  assert.equal(
    reviewedSharedFileScopes({
      changedPaths: ['infra/deployment/image-authority-extra.py'],
      packages,
      games: [],
    }).size,
    0,
  );
  assert.equal(
    reviewedSharedFileScopes({
      changedPaths: imageAuthorityScopePaths,
      packages: packages.slice(1),
      games: [],
    }).size,
    0,
  );
  const { mkdtemp, copyFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'image-authority-no-deps-'));
  try {
    // Keep this bare fixture explicit: scope planning must not need the probe or YAML installs.
    for (const module of [
      'publication-scopes.mjs',
      'vite-patch-scope.mjs',
      'competition-ingress.mjs',
      'admin-csp.mjs',
    ])
      await copyFile(new URL(module, import.meta.url), join(directory, module));
    const code = `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      import { reviewedSharedFileScopes, imageAuthorityScopePaths, imageAuthorityConsumers } from './publication-scopes.mjs';
      assert.throws(() => createRequire(import.meta.url).resolve('js-yaml'));
      const packages=imageAuthorityConsumers.map(dir=>({dir,name:dir}));
      const scope=reviewedSharedFileScopes({changedPaths:imageAuthorityScopePaths,packages,games:[]});
      for(const file of imageAuthorityScopePaths)assert.deepEqual(scope.get(file),imageAuthorityConsumers);
      assert.equal(reviewedSharedFileScopes({changedPaths:['infra/deployment/unknown.py'],packages,games:[]}).size,0);
    `;
    execFileSync(process.execPath, ['--input-type=module', '-e', code], {
      cwd: directory,
      env: { ...process.env, NODE_PATH: '' },
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 10000,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('anonymous session migration and Pages service defaults admit only the reviewed delta', () => {
  for (const file of [
    'scripts/competition.mjs',
    'scripts/platform.mjs',
    'scripts/deploy-tencent.mjs',
    'infra/migrations/014-player-sessions.sql',
    '.github/workflows/pages-validate.yml',
  ]) {
    const before = file.startsWith('infra/')
      ? null
      : execFileSync('git', ['show', '0d7bfdfe4087b85139dc525e9a75f3ab792e17f6:' + file], {
          encoding: 'utf8',
        });
    const after =
      file === '.github/workflows/pages-validate.yml'
        ? execFileSync('git', ['show', 'ba3f3966082a24861e1a05c1e1e293ae1f032136:' + file], {
            encoding: 'utf8',
          })
        : ['scripts/platform.mjs', 'scripts/deploy-tencent.mjs'].includes(file)
          ? execFileSync('git', ['show', '0459b0cb3c89a748f3a6bd252858951ba1ca073d:' + file], {
              encoding: 'utf8',
            })
          : readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    const check = file.startsWith('.github/')
      ? anonymousPagesFileScope
      : playerSessionBackendFileScope;
    assert(check(file, before, after), file);
    assert(!check(file, before, after + '\n# unrelated command\n'), file);
    assert(!check(file + '.other', before, after), file);
  }
});

test('review tools, submodule dialogs and the realtime preset have finite validated consumers', async () => {
  const { workspacePackages } = await import('./validation-plan.mjs');
  const { competitionReviewScopePaths, submoduleDialogScopePath, submoduleDialogIds } =
    await import('./publication-scopes.mjs');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const games = JSON.parse(
    readFileSync(new URL('../apps/shell-web/src/standalone-games.json', import.meta.url)),
  );
  const packages = await workspacePackages(root);
  const readHead = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const preset = 'infra/builds/cops-robbers-realtime-taptap.json';
  const changedPaths = [...competitionReviewScopePaths, submoduleDialogScopePath, preset];
  const context = { games, packages, changedPaths, readHead };
  const scopes = reviewedSharedFileScopes(context);
  assert.deepEqual([...scopes.keys()], changedPaths);
  assert.deepEqual(scopes.get(competitionReviewScopePaths[0]), [
    'games/local/cops-robbers',
    'games/local/cops-robbers-realtime',
    'services/runtime-api',
  ]);
  assert.deepEqual(scopes.get(competitionReviewScopePaths[1]), [
    'games/local/cops-robbers',
    'games/local/letters-words2',
    'services/runtime-api',
  ]);
  assert.deepEqual(scopes.get(competitionReviewScopePaths[2]), [
    'games/local/cops-robbers-realtime',
    'games/local/vibeJam-myself-history-guess',
    'services/runtime-api',
  ]);
  assert.deepEqual(
    scopes.get(submoduleDialogScopePath),
    submoduleDialogIds.map((id) => `games/submodules/${id}`),
  );
  assert.deepEqual(scopes.get(preset), ['games/local/cops-robbers-realtime']);
  assert.equal(
    reviewedSharedFileScopes({
      ...context,
      changedPaths: [
        'scripts/review-competition-unknown.mjs',
        'scripts/test-submodule-unknown.mjs',
        'infra/builds/cops-robbers-realtime-extra.json',
      ],
    }).size,
    0,
  );
  assert(
    !reviewedSharedFileScopes({
      ...context,
      readHead: (file) =>
        readHead(file).replace('const allGames = [', "const allGames = ['unreviewed', "),
    }).has(submoduleDialogScopePath),
  );
  for (const transform of [
    (config) => ({ ...config, games: [...config.games, 'carding-car'] }),
    (config) => ({ ...config, arbitraryNativeInput: true }),
    (config) => ({ ...config, version: 2 }),
  ])
    assert(
      !reviewedSharedFileScopes({
        ...context,
        readHead: (file) =>
          file === preset ? JSON.stringify(transform(JSON.parse(readHead(file)))) : readHead(file),
      }).has(preset),
    );
  const selected = incrementalPlan({
    ...context,
    changedPaths: [submoduleDialogScopePath],
    fileScopes: scopes,
    readSource: readHead,
  });
  assert.deepEqual(selected.submodule_dialog_ids, submoduleDialogIds);
  const hooks = incrementalPlan({
    ...context,
    changedPaths: ['scripts/check-staged-format.test.mjs'],
    fileScopes: new Map(),
    readSource: readHead,
  });
  assert(hooks.hook_checks && hooks.validation_tools);
});

test('Homebound Creator wiring admits only the reviewed additive compiler change', () => {
  const file = 'scripts/h5-game-build.mjs';
  const after = execFileSync('git', ['show', '8a3c141a6b2ef83913c97a58832261cc113e4375:' + file], {
    encoding: 'utf8',
  });
  const before = execFileSync('git', ['show', '22c95185813177bd860127563cf2eddbfe573e7e:' + file], {
    encoding: 'utf8',
  });
  assert(homeboundCocosWiringOnly(file, before, after));
  assert(!homeboundCocosWiringOnly(file, before, after.replace("'carding-car'", "'other-game'")));
  assert(!homeboundCocosWiringOnly(file, before, after + '\nprocess.exit(0);'));
  assert(!homeboundCocosWiringOnly('scripts/unreviewed-build.mjs', before, after));
  const games = [{ id: 'homebound-station', source: 'games/local/homebound-station' }];
  const packages = [{ name: 'homebound', dir: games[0].source }];
  const scope = reviewedSharedFileScopes({
    changedPaths: [file],
    games,
    packages,
    readBase: () => before,
    readHead: () => after,
  });
  assert.deepEqual(scope.get(file), [games[0].source]);
});

test('Orbit Creator routing permits its exact new consumer and rejects altered existing gates', () => {
  const file = '.github/workflows/ci.yml';
  const env =
    '      NIGHT_OVERWATCH_PREBUILT_DIR: ${{ github.workspace }}/games/local/night-overwatch/.prebuilt\n';
  const download =
    "      - uses: actions/download-artifact@v8\n        if: needs.plan.outputs.cocos == 'true'\n        with:\n          name: night-overwatch-${{ github.sha }}\n          path: games/local/night-overwatch/.prebuilt\n";
  const before = 'existing-gate\n' + env + download + 'existing-assertion\n';
  const after = before
    .replace(
      env,
      env +
        env
          .replaceAll('NIGHT_OVERWATCH', 'ORBIT_ATELIER')
          .replaceAll('night-overwatch', 'orbit-atelier'),
    )
    .replace(download, download + download.replaceAll('night-overwatch', 'orbit-atelier'));
  assert(orbitCreatorIntegrationFileScope(file, before, after));
  for (const invalid of [
    after.replace('existing-gate', 'skip-gate'),
    after.replace('orbit-atelier/.prebuilt', 'other/.prebuilt'),
    after + 'extra-command\n',
    after.replace("if: needs.plan.outputs.cocos == 'true'", 'if: always()'),
  ])
    assert.equal(orbitCreatorIntegrationFileScope(file, before, invalid), false);
  assert.equal(
    orbitCreatorIntegrationFileScope('.github/workflows/unknown.yml', before, after),
    false,
  );
});

test('Orbit Creator Turbo routing retains every previous input and task', () => {
  const before = {
    globalPassThroughEnv: ['COCOS_CREATOR'],
    tasks: { build: { dependsOn: ['^build'] } },
  };
  const after = structuredClone(before);
  after.globalPassThroughEnv.push('ORBIT_ATELIER_PREBUILT_DIR');
  after.tasks['@coffeeeeffoc/orbit-atelier#build'] = {
    dependsOn: ['^build'],
    outputs: ['dist/**'],
    env: ['COCOS_CREATOR', 'ORBIT_ATELIER_PREBUILT_DIR'],
    inputs: ['$TURBO_DEFAULT$', '$TURBO_ROOT$/games/local/orbit-atelier/.prebuilt/**'],
  };
  const accepts = () =>
    orbitCreatorIntegrationFileScope('turbo.json', JSON.stringify(before), JSON.stringify(after));
  assert(accepts());
  after.tasks.build.dependsOn = [];
  assert.equal(accepts(), false);
});

test('Orbit Cocos gameplay scope isolates the real exported branch without admitting other game changes', () => {
  const file = 'apps/shell-web/scripts/standalone-game-checks.mjs';
  const before =
    "export async function assertStandaloneGameplay(frame, id) { if (id === 'orbit-atelier') { await oldOrbit(frame); } else if (id === 'other') { await keepOther(frame); } }";
  const after = before.replace('await oldOrbit(frame);', 'await actualTouch(frame);');
  assert(orbitCreatorIntegrationFileScope(file, before, after));
  assert.equal(
    orbitCreatorIntegrationFileScope(file, before, after.replace('keepOther', 'skipOther')),
    false,
  );
  assert.equal(
    orbitCreatorIntegrationFileScope(
      file,
      before,
      after.replace("id === 'orbit-atelier'", "id === 'other'"),
    ),
    false,
  );
  assert.equal(orbitCreatorIntegrationFileScope(file, before, after + '\nrunUnrelated();'), false);
  const nested =
    "export async function assertStandaloneGameplay(frame, id) { async function nested() { if (id === 'orbit-atelier') { await oldOrbit(frame); } } }";
  assert.equal(
    orbitCreatorIntegrationFileScope(file, nested, nested.replace('oldOrbit', 'actualTouch')),
    false,
  );
});

test('merge Creator routes bind exact reviewed base/head bytes and reject extra changes', () => {
  const games = [{ id: 'merge-front', source: 'games/local/merge-front' }];
  const packages = [{ dir: games[0].source, creator: { version: '3.8.8' } }];
  for (const file of Object.keys(mergeCreatorIntegrationHashes)) {
    const before = execFileSync(
      'git',
      ['show', '39388e3a89df1b1a0d573bb800016fdbfbc4ac86:' + file],
      { encoding: 'utf8' },
    );
    const after = execFileSync(
      'git',
      ['show', '53eb4b69bd1c2c3bbfe01349624235a1636b121e:' + file],
      { encoding: 'utf8' },
    );
    assert(mergeCreatorIntegrationFileScope(file, before, after), file);
    assert(!mergeCreatorIntegrationFileScope(file, before, after + '\nextra();'), file);
    assert(!mergeCreatorIntegrationFileScope(file, before + '\n', after), file);
    assert(!mergeCreatorIntegrationFileScope('unknown.mjs', before, after));
    const ctx = {
      changedPaths: [file],
      games,
      packages,
      readBase: () => before,
      readHead: () => after,
    };
    assert.deepEqual(reviewedSharedFileScopes(ctx).get(file), [games[0].source]);
    assert(!reviewedSharedFileScopes({ ...ctx, packages: [] }).has(file));
  }
});

test('Creator host smoke repair binds both real baselines and retains its game consumer', () => {
  const file = 'apps/shell-web/scripts/pages-host-smoke.mjs';
  const source = 'games/local/merge-front';
  const games = [{ id: 'merge-front', source }];
  const packages = [
    { dir: 'apps/shell-web', name: '@coffeeeeffoc/shell-web' },
    {
      dir: source,
      name: '@small-games/merge-front',
      creator: { version: '3.8.8' },
      scripts: { build: 'node scripts/build.mjs web-mobile' },
    },
  ];
  const after = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  for (const ref of [
    '39388e3a89df1b1a0d573bb800016fdbfbc4ac86',
    '5af700e8b0b7a82b42e3caab3475c3923de02665',
  ]) {
    const before = execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8' });
    const context = {
      changedPaths: [file],
      games,
      packages,
      readBase: () => before,
      readHead: () => after,
    };
    const scopes = reviewedSharedFileScopes(context);
    assert.deepEqual(scopes.get(file), ['apps/shell-web', source]);
    const plan = incrementalPlan({ ...context, fileScopes: scopes });
    assert.equal(plan.full, false);
    assert(plan.game_sources.includes(source));
    assert(plan.browser_ids.includes('merge-front'));
    assert.equal(requiresIncrementalCocos({ ...context, fileScopes: scopes, scope: plan }), true);
    for (const side of ['readBase', 'readHead']) {
      assert.equal(
        reviewedSharedFileScopes({ ...context, [side]: () => context[side]() + '\nextra();' }).has(
          file,
        ),
        false,
      );
      assert.equal(
        reviewedSharedFileScopes({
          ...context,
          [side]: () => {
            throw new Error('missing tree');
          },
        }).has(file),
        false,
      );
    }
    for (const mutate of [
      (ctx) => ctx.games.splice(0, 1),
      (ctx) => ctx.games.push({ id: 'alias', source }),
      (ctx) => ctx.games.push({ id: 'merge-front', source: 'games/local/alias' }),
      (ctx) => ctx.packages.splice(1, 1),
      (ctx) => ctx.packages.push({ ...ctx.packages[1], dir: 'games/local/alias' }),
      (ctx) => (ctx.packages[1].name = '@unknown/game'),
      (ctx) => (ctx.packages[1].creator.version = '3.8.9'),
      (ctx) => (ctx.packages[1].scripts.build = 'node bypass.mjs'),
    ]) {
      const identities = structuredClone({ games, packages });
      mutate(identities);
      assert.equal(reviewedSharedFileScopes({ ...context, ...identities }).has(file), false);
    }
    const unknown = { ...context, changedPaths: [file, 'scripts/unreviewed.mjs'] };
    assert.throws(
      () => incrementalPlan({ ...unknown, fileScopes: reviewedSharedFileScopes(unknown) }),
      /Incremental scope undefined/,
    );
  }
});

test('cumulative Merge/Bullet wiring proves exact bytes and both Creator consumers', () => {
  const games = ['merge-front', 'bullet-garden'].map((id) => ({
    id,
    source: `games/local/${id}`,
  }));
  const packages = games.map(({ id, source }) => ({
    dir: source,
    name: `${id === 'merge-front' ? '@small-games' : '@coffeeeeffoc'}/${id}`,
    creator: { version: '3.8.8' },
    scripts: { build: 'node scripts/build.mjs web-mobile' },
  }));
  const changedPaths = Object.keys(mergeBulletCreatorIntegrationHashes);
  const historical = (ref, file) =>
    execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8' });
  const before = new Map(
    changedPaths.map((file) => [
      file,
      historical('39388e3a89df1b1a0d573bb800016fdbfbc4ac86', file),
    ]),
  );
  const after = new Map(
    changedPaths.map((file) => [
      file,
      historical('b652c346dfdee952194c2ab267c167894b7718e4', file),
    ]),
  );
  const context = {
    changedPaths,
    games,
    packages,
    readBase: (file) => before.get(file),
    readHead: (file) => after.get(file),
  };
  const consumers = games.map((game) => game.source);
  const scopes = reviewedSharedFileScopes(context);
  for (const file of changedPaths) {
    assert(mergeBulletCreatorIntegrationFileScope(file, before.get(file), after.get(file)), file);
    assert.deepEqual(scopes.get(file), consumers, file);
    for (const side of ['readBase', 'readHead']) {
      assert.equal(
        reviewedSharedFileScopes({
          ...context,
          changedPaths: [file],
          [side]: (name) => context[side](name) + '\n# unreviewed',
        }).has(file),
        false,
        `${file}: extra ${side} bytes`,
      );
      assert.equal(
        reviewedSharedFileScopes({
          ...context,
          changedPaths: [file],
          [side]: () => {
            throw new Error('tree unavailable');
          },
        }).has(file),
        false,
        `${file}: unavailable ${side}`,
      );
    }
    assert.equal(
      mergeBulletCreatorIntegrationFileScope(
        file,
        historical('53eb4b69bd1c2c3bbfe01349624235a1636b121e', file),
        after.get(file),
      ),
      false,
      `${file}: a different transition needs its own proof`,
    );
  }
  for (let index = 0; index < games.length; index++) {
    for (const mutate of [
      (ctx) => ctx.games.splice(index, 1),
      (ctx) => ctx.games.push({ ...ctx.games[index], source: 'games/local/alias' }),
      (ctx) => ctx.games.push({ ...ctx.games[index], id: 'alias' }),
      (ctx) => (ctx.games[index].id = 'alias'),
      (ctx) => (ctx.games[index].source = 'games/local/alias'),
      (ctx) => ctx.packages.splice(index, 1),
      (ctx) => (ctx.packages[index].name = '@unknown/game'),
      (ctx) => (ctx.packages[index].dir = 'games/local/alias'),
      (ctx) => ctx.packages.push({ ...ctx.packages[index], name: '@unknown/alias' }),
      (ctx) => ctx.packages.push({ ...ctx.packages[index], dir: 'games/local/alias' }),
      (ctx) => (ctx.packages[index].creator.version = '3.8.9'),
      (ctx) => (ctx.packages[index].scripts.build = 'node bypass.mjs'),
    ]) {
      const identities = structuredClone({ games, packages });
      mutate(identities);
      assert.equal(reviewedSharedFileScopes({ ...context, ...identities }).size, 0);
    }
  }
  const plan = incrementalPlan({ ...context, fileScopes: scopes });
  assert.equal(plan.full, false);
  assert.deepEqual([...plan.consumer_sources].sort(), [...consumers].sort());
  assert.deepEqual([...plan.game_sources].sort(), [...consumers].sort());
  assert.deepEqual(plan.browser_ids, games.map((game) => game.id).sort());
  assert.equal(requiresIncrementalCocos({ ...context, fileScopes: scopes, scope: plan }), true);
  for (const unknown of ['.github/workflows/unknown.yml', 'scripts/unknown.mjs']) {
    const extra = { ...context, changedPaths: [...changedPaths, unknown] };
    assert.throws(
      () => incrementalPlan({ ...extra, fileScopes: reviewedSharedFileScopes(extra) }),
      /Incremental scope undefined/,
    );
  }
});

test('merged Homebound Creator routes preserve Orbit and Tianxia and reject changes to existing gates', () => {
  const files = [
    'apps/shell-web/src/StandaloneGame.tsx',
    'apps/shell-web/scripts/pages-smoke.mjs',
    'apps/shell-web/tests/standalone-immersive.integration.test.tsx',
    'apps/shell-web/tests/standalone.integration.test.tsx',
    '.github/workflows/carding-car.yml',
    '.github/workflows/ci.yml',
    '.github/workflows/pages-validate.yml',
    '.github/workflows/mobile.yml',
    'turbo.json',
    'scripts/check-workspace-dependencies.mjs',
    'scripts/deployment-bundle.mjs',
    'scripts/deployment-bundle.test.mjs',
    'scripts/h5-game-build.mjs',
    'scripts/h5-taptap-build.mjs',
    'scripts/h5-ad-config.mjs',
    'scripts/h5-taptap-matrix.mjs',
  ];
  const games = [{ id: 'homebound-station', source: 'games/local/homebound-station' }];
  const packages = [{ name: 'homebound', dir: games[0].source }];
  for (const file of files) {
    const before = execFileSync(
      'git',
      ['show', '22c95185813177bd860127563cf2eddbfe573e7e:' + file],
      { encoding: 'utf8' },
    );
    const after = execFileSync(
      'git',
      ['show', '8a3c141a6b2ef83913c97a58832261cc113e4375:' + file],
      { encoding: 'utf8' },
    );
    assert(homeboundCocosWiringOnly(file, before, after), file);
    assert.equal(homeboundCocosWiringOnly(file, before + '\n', after), false, file);
    assert.equal(homeboundCocosWiringOnly(file, before, after + '\n// extra command'), false, file);
    if (after.includes('orbit-atelier'))
      assert.equal(
        homeboundCocosWiringOnly(file, before, after.replaceAll('orbit-atelier', 'missing-orbit')),
        false,
        file,
      );
    if (after.includes('tianxia-chalu'))
      assert.equal(
        homeboundCocosWiringOnly(
          file,
          before,
          after.replaceAll('tianxia-chalu', 'missing-tianxia'),
        ),
        false,
        file,
      );
    const scopes = reviewedSharedFileScopes({
      changedPaths: [file],
      games,
      packages,
      readBase: () => before,
      readHead: () => after,
    });
    assert.deepEqual(scopes.get(file), [games[0].source], file);
  }
});

test('Bullet Garden Creator routing preserves every old producer and consumer gate', () => {
  for (const file of [
    '.github/workflows/carding-car.yml',
    '.github/workflows/ci.yml',
    '.github/workflows/pages-validate.yml',
    '.github/workflows/mobile.yml',
  ]) {
    const head = readFileSync(new URL('../' + file, import.meta.url), 'utf8').replaceAll(
      '\r\n',
      '\n',
    );
    const base = execFileSync('git', ['show', '53eb4b69bd1c2c3bbfe01349624235a1636b121e:' + file], {
      encoding: 'utf8',
    }).replaceAll('\r\n', '\n');
    assert.equal(bulletGardenCreatorFileScope(file, base, head), true, file);
    assert.equal(
      bulletGardenCreatorFileScope(file, base, head + '\n# unrelated change\n'),
      false,
      file,
    );
    assert.equal(
      bulletGardenCreatorFileScope(
        file,
        base,
        head.replaceAll('actions/checkout@v5', 'actions/checkout@v6'),
      ),
      false,
      file,
    );
  }
});
test('Bullet Garden lock scope only adds three existing exact importer tuples', () => {
  const manifest = {
    name: '@coffeeeeffoc/bullet-garden',
    devDependencies: { '@playwright/test': '1.55.1', esbuild: '0.28.2', typescript: '7.0.2' },
  };
  const tuples = Object.entries(manifest.devDependencies)
    .map(
      ([name, version]) =>
        '      ' +
        (name.startsWith('@') ? "'" + name + "'" : name) +
        ':\n        specifier: ' +
        version +
        '\n        version: ' +
        version +
        '\n',
    )
    .join('');
  const base =
    'importers:\n  fixture:\n    devDependencies:\n' +
    tuples +
    '\n  games/local/bullet-garden: {}\n\npackages:\n';
  const head = base.replace(
    '  games/local/bullet-garden: {}\n',
    '  games/local/bullet-garden:\n    devDependencies:\n' + tuples,
  );
  assert.equal(bulletGardenLockOnly(base, head, manifest), true);
  const tooling = 'importers:\n  .: {}\npackages:\n  tool: {}\nsnapshots: {}\n---\n';
  assert.equal(bulletGardenLockOnly(tooling + base, tooling + head, manifest), true);
  assert.equal(
    bulletGardenLockOnly(tooling + base, tooling.replace('tool:', 'changed:') + head, manifest),
    false,
  );
  assert.equal(bulletGardenLockOnly(base, head + '  unrelated: {}\n', manifest), false);
  assert.equal(
    bulletGardenLockOnly(base, head.replace('specifier: 1.55.1', 'specifier: latest'), manifest),
    false,
  );
  assert.equal(
    bulletGardenLockOnly(base, head, { ...manifest, dependencies: { unexpected: '1' } }),
    false,
  );
});

test('Bullet Garden routes preserve fixed predecessors, identity and config-sensitive validation', () => {
  const read = (file) =>
    readFileSync(new URL('../' + file, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const base = (file) =>
    execFileSync('git', ['show', '53eb4b69bd1c2c3bbfe01349624235a1636b121e:' + file], {
      encoding: 'utf8',
    }).replaceAll('\r\n', '\n');
  const source = 'games/local/bullet-garden';
  const manifest = JSON.parse(read(source + '/package.json'));
  const games = [
    { id: 'bullet-garden', source },
    { id: 'wulong-city', source: 'games/local/wulong-city' },
  ];
  const packages = [{ dir: source, ...manifest }];
  for (const file of [...tianxiaWiring, 'apps/shell-web/src/styles.css']) {
    const context = { changedPaths: [file], readBase: base, readHead: read, games, packages };
    assert.equal(bulletGardenCreatorFileScope(file, base(file), read(file)), true, file);
    assert(reviewedSharedFileScopes(context).get(file)?.includes(source), file);
    assert(
      !reviewedSharedFileScopes({ ...context, games: [...games, { id: 'alias', source }] }).has(
        file,
      ),
      file,
    );
    assert(
      !reviewedSharedFileScopes({
        ...context,
        packages: [...packages, { dir: 'other', name: manifest.name }],
      }).has(file),
      file,
    );
  }
  const turbo = read('turbo.json');
  const unsafe = JSON.parse(turbo);
  unsafe.tasks['@coffeeeeffoc/bullet-garden#build'].cache = true;
  assert(!bulletGardenCreatorFileScope('turbo.json', base('turbo.json'), JSON.stringify(unsafe)));
  const file = 'scripts/cocos-validation.mjs';
  assert(
    !bulletGardenCreatorFileScope(
      file,
      base(file).replace('KART_PREBUILT_DIR', 'WRONG'),
      read(file).replace('KART_PREBUILT_DIR', 'WRONG'),
    ),
  );
  const branding = 'games/local/carding-car/scripts/cocos-branding.mjs';
  assert(
    reviewedSharedFileScopes({ changedPaths: [branding], games, packages })
      .get(branding)
      .includes(source),
  );
});

test('Homebound Creator readiness guard preserves gameplay and scopes only its registered game', () => {
  const file = 'apps/shell-web/scripts/standalone-game-checks.mjs';
  const before = execFileSync('git', ['show', '8a3c141a6b2ef83913c97a58832261cc113e4375:' + file], {
    encoding: 'utf8',
  });
  const anchor = "  } else if (id === 'homebound-station') {\n";
  const ready =
    "    await expect(frame.locator('body')).toHaveAttribute('data-homebound-ready', 'true', {\n" +
    '      timeout: 60_000,\n' +
    '    });\n';
  const after = before.replace(anchor, anchor + ready);
  const context = {
    changedPaths: [file],
    games: [{ id: 'homebound-station', source: 'games/local/homebound-station' }],
    readBase: () => before,
    readHead: () => after,
  };
  assert.deepEqual(
    [...reviewedSharedFileScopes(context)],
    [[file, ['games/local/homebound-station']]],
  );
  for (const invalid of [
    after + '\nrunUnrelated();',
    after.replace(ready, ready + ready),
    after.replace('timeout: 60_000', 'timeout: 0'),
    after.replace("id === 'urban-breakout'", "id === 'other'"),
  ]) {
    assert.equal(reviewedSharedFileScopes({ ...context, readHead: () => invalid }).size, 0);
  }
  assert.equal(reviewedSharedFileScopes({ ...context, readBase: () => before + '\n' }).size, 0);
  assert.equal(reviewedSharedFileScopes({ ...context, games: [] }).size, 0);
});

test('ordinary Creator reuse changes include Bullet while preserving the historical five-game fixture', () => {
  const file = 'scripts/reuse-cocos-artifacts.mjs';
  const current = readFileSync(new URL('../' + file, import.meta.url), 'utf8').replaceAll(
    '\r\n',
    '\n',
  );
  for (const [includeMerge, includeBullet] of [
    [false, false],
    [true, false],
    [true, true],
  ]) {
    const ids = [
      'carding-car',
      'night-overwatch',
      'orbit-atelier',
      'tianxia-chalu',
      'homebound-station',
      ...(includeMerge ? ['merge-front'] : []),
      ...(includeBullet ? ['bullet-garden'] : []),
    ];
    let source = includeBullet ? current : current.replace("  'bullet-garden',\n", '');
    if (!includeMerge) source = source.replace("  'merge-front',\n", '');
    const packages = ids.map((id) => ({ dir: 'games/local/' + id }));
    const scopes = reviewedSharedFileScopes({
      changedPaths: [file],
      games: [],
      packages,
      readBase: () => source,
      readHead: () => source + '\n// ordinary reuse change\n',
    });
    assert.deepEqual(
      scopes.get(file),
      packages.map((pkg) => pkg.dir),
    );
    assert.equal(
      reviewedSharedFileScopes({
        changedPaths: [file],
        games: [],
        packages: packages.slice(1),
        readBase: () => source,
        readHead: () => source,
      }).size,
      0,
    );
  }
});
