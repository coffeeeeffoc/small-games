import { hasLocalRetirementFileProof } from './local-game-retirement-scope.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { affectedPackages, isDocumentation, riskPlan } from './validation-plan.mjs';
import { hasVitePatch, viteBuiltinSources } from './vite-patch-scope.mjs';
import {
  nineNativeScopePaths,
  nineNativeChecks,
  nineNativeDependencyPlan,
} from './nine-native-scope.mjs';
import {
  competitionToolPlan,
  competitionServiceScopePaths,
  competitionReviewScopePaths,
  submoduleDialogScopePath,
  submoduleDialogIds,
  tapServiceSharedScopePaths,
  tapServiceConfigScopePath,
  h5AcceptanceScopePaths,
  sixH5ScopePaths,
  competitionIdentityScopePaths,
  competitionIdentityMirrorPaths,
  gameServiceScopePaths,
  publishingConsumers,
  publishingScopePaths,
  safeAreaScopePaths,
  platformAdsScopePaths,
  deploymentBundleScopePaths,
  companyDeploymentScopePaths,
  competitionIngressScopePaths,
  adminDeploymentScopePaths,
  adminCspScopePaths,
  backendDeploymentScopePaths,
  backendSharedScopePaths,
  imageAuthorityScopePaths,
  runtimeProxyDefaultScopePaths,
  publicationConfigScopePaths,
  mobileViewportScopeFile,
  independentPreviewScopeFile,
} from './publication-scopes.mjs';
export { reviewedSharedFileScopes } from './publication-scopes.mjs';

const loadFormatter = createRequire(import.meta.url);

export const cacheToolPaths = Object.freeze([
  'scripts/prune-turbo-cache.mjs',
  'scripts/prune-turbo-cache.test.mjs',
  'scripts/prune-actions-cache.mjs',
  'scripts/prune-actions-cache.test.mjs',
]);

const validationTool =
  /^(?:scripts\/(?:validate-(?:push(?:-hook)?|tree)|validation-plan|incremental-validation|validate-candidate|hook-diagnostics|run-selected-(?:shell|browser)|ci-validation|browser-preparation|rule-tasks|cocos-validation|workspace-bootstrap|pages-test-scope|pages-registration-scope|fullscreen-removal-scope|test-no-fullscreen|local-game-retirement-(?:scope|reviews)|game-retirement-scope|pages-regression-shards|publication-scopes|vite-patch-scope|run-selected-competition)(?:\.[^/]+)?\.mjs|scripts\/reuse-cocos-artifacts\.test\.mjs|scripts\/nine-(?:native|lock)-scope(?:\.test)?\.mjs|scripts\/check-staged-format(?:\.test)?\.mjs|\.githooks\/[^/]+)$/;
export const tapServiceCheckPaths = Object.freeze([
  ...tapServiceSharedScopePaths,
  tapServiceConfigScopePath,
  'scripts/competition-h5-service.mjs',
  'scripts/check-tap-multiplayer.mjs',
  'platforms/taptap/tests/tap-services.test.mjs',
  'platforms/taptap/tests/tap-services.browser.mjs',
  'platforms/taptap/tests/tap-multiplayer-fixture.mjs',
  'platforms/taptap/tests/tap-multiplayer.test.mjs',
  'platforms/taptap/tests/tap-multiplayer.browser.mjs',
  'games/submodules/xiangqi-five',
  ...['cops-robbers', 'cops-robbers-realtime'].flatMap((id) =>
    ['main.js', 'tap-save.js', 'tap-multiplayer.js'].map((file) => `games/local/${id}/src/${file}`),
  ),
]);
// Follow the actual three-game entry imports as well as the explicit generated
// injection inputs. Engine, renderer and level changes must exercise the same
// Tap contracts; documentation and historical evidence are outside this graph.
export function tapServicesChanged(changedPaths, readSource) {
  if (changedPaths.some((file) => tapServiceCheckPaths.includes(file))) return true;
  if (!readSource) return false;
  const visited = new Set(),
    queue = tapServiceCheckPaths.filter((file) => /\.[cm]?js$/.test(file));
  while (queue.length) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    if (changedPaths.includes(file)) return true;
    let text;
    try {
      text = readSource(file);
    } catch {
      continue;
    }
    if (typeof text !== 'string') continue;
    for (const match of text.matchAll(
      /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g,
    )) {
      if (!match[1].startsWith('.')) continue;
      const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
      if (!dependency.startsWith('../') && /\.[cm]?[jt]sx?$/.test(dependency))
        queue.push(dependency);
    }
  }
  return false;
}
export const workspaceBoundaryScopePaths = Object.freeze([
  'scripts/check-workspace-dependencies.mjs',
  'scripts/check-workspace-dependencies.test.mjs',
]);
const pagesDeployScopePaths = ['scripts/prepare-pages-deploy.py', 'scripts/test-pages-deploy.py'];
// Reviewed shared navigation contracts: exercise both home and immersive frame exits.
const navigationSamples = ['letters-words2', 'xiangqi-five'];
const nativeSmoke = 'scripts/native-game-smoke.mjs';
const developerMode = 'scripts/test-game-dev-mode.mjs';
export const nativeToolConsumers = [
  {
    dir: 'apps/shell-minigame',
    smoke: 'node ../../scripts/native-game-smoke.mjs --standalone',
  },
];
export function reviewedNativeTest(pkg, consumer) {
  return (
    !!consumer &&
    (pkg?.scripts?.test === 'vitest run' ||
      (consumer.dir === 'apps/shell-minigame' &&
        pkg?.scripts?.test === 'vitest run tests && node --test scripts/*.test.mjs'))
  );
}
export function incrementalPlan({
  packages,
  games,
  changedPaths,
  readSource,
  fileScopes = new Map(),
}) {
  const paths = changedPaths.filter((file) => !isDocumentation(file));
  for (const file of paths.filter((file) => competitionIdentityMirrorPaths.includes(file)))
    assert(fileScopes.has(file), `Shared identity mirror drift: ${file}`);
  assert(
    !paths.includes(independentPreviewScopeFile) || fileScopes.has(independentPreviewScopeFile),
    'Independent preview scope undefined: review changed behavior and its actual game consumers',
  );
  assert(
    !paths.includes(mobileViewportScopeFile) || fileScopes.has(mobileViewportScopeFile),
    'Mobile viewport scope undefined: review changed behavior and its actual game consumers',
  );
  const nineNative = nineNativeDependencyPlan({
    changedPaths: paths,
    games,
    packages,
    readSource,
    fileScopes,
  });
  const nativeOnlyPaths = new Set(nineNative.native_only_paths);
  const h5Paths = paths.filter((file) => !nativeOnlyPaths.has(file));
  const nativeConsumers = paths.includes(nativeSmoke) ? nativeToolConsumers : [];
  for (const consumer of nativeConsumers) {
    const pkg = packages.find((item) => item.dir === consumer.dir);
    assert(
      pkg?.scripts?.smoke === consumer.smoke &&
        reviewedNativeTest(pkg, consumer) &&
        ['build', 'typecheck', 'lint'].every((task) => pkg.scripts[task]),
      `Unreviewed native tool consumer: ${consumer.dir}`,
    );
  }
  const unknown = paths.filter(
    (file) =>
      !packages.some((pkg) => file === pkg.dir || file.startsWith(pkg.dir + '/')) &&
      !validationTool.test(file) &&
      !cacheToolPaths.includes(file) &&
      !workspaceBoundaryScopePaths.includes(file) &&
      !pagesDeployScopePaths.includes(file) &&
      file !== 'scripts/pages-regression-timings.json' &&
      file !== nativeSmoke &&
      !fileScopes.has(file),
  );
  assert(
    !unknown.length,
    `Incremental scope undefined for: ${unknown.join(', ')}. Define affected consumers before publishing; no automatic full regression.`,
  );
  const registrationFiles = new Set([
    'apps/shell-web/src/standalone-games.json',
    'apps/shell-web/src/game-meta.json',
    'apps/shell-web/package.json',
    'pnpm-lock.yaml',
  ]);
  const unclassifiedRegistration = paths.filter(
    (file) => registrationFiles.has(file) && !fileScopes.has(file),
  );
  assert(
    !unclassifiedRegistration.length,
    `Incremental registration scope undefined for: ${unclassifiedRegistration.join(', ')}. Define a reviewed structural comparison before publishing.`,
  );
  const competitionScopes = new Map(fileScopes);
  // An exact byte-preserving sound relocation changes no competition output.
  const competitionBuilder = 'scripts/competition-build.mjs';
  if (
    hasLocalRetirementFileProof(competitionBuilder, fileScopes.get(competitionBuilder), readSource)
  )
    competitionScopes.delete(competitionBuilder);
  for (const file of nineNative.taptap_only_paths) competitionScopes.delete(file);
  const competition = competitionToolPlan({
    paths,
    games,
    packages,
    fileScopes: competitionScopes,
  });
  // The general competition proof and the stricter nine-game proof share one
  // path. Only a scope carrying the native hosts came from the nine proof.
  const nineScopes = new Map(fileScopes);
  const nativeCompetition = 'platforms/competition/native.js';
  if (
    nineScopes.has(nativeCompetition) &&
    !isDeepStrictEqual(nineScopes.get(nativeCompetition), [
      'games/local/letters-words2',
      'games/local/vibeJam-myself-history-guess',
      'apps/shell-minigame',
    ])
  )
    nineScopes.delete(nativeCompetition);
  const scopedConsumers = [...new Set([...fileScopes.values()].flat())].filter((dir) =>
    packages.some((pkg) => pkg.dir === dir),
  );
  const affected = affectedPackages(packages, [
    ...paths,
    ...competition.consumer_sources.map((dir) => dir + '/package.json'),
    ...scopedConsumers.map((dir) => dir + '/package.json'),
  ]);
  const adminConsoleChecks = affected.some((pkg) =>
    ['apps/admin-web', 'services/management-api'].includes(pkg.dir),
  );
  const directGames = games.filter((game) =>
    h5Paths.some((file) => file === game.source || file.startsWith(game.source + '/')),
  );
  const shared = paths.some((file) => file.startsWith('packages/'));
  // Native-only tool consumers require their package checks and actual native CJS
  // flows; they do not change the H5 entry and do not select its browser regression.
  const registrations = new Set(
    [...fileScopes].filter(([file]) => !nativeOnlyPaths.has(file)).flatMap(([, dirs]) => dirs),
  );
  const selected = games.filter(
    (game) =>
      directGames.includes(game) ||
      registrations.has(game.source) ||
      (shared && affected.some((pkg) => pkg.dir === game.source)),
  );
  const ids = new Set();
  for (const game of selected) {
    const scope = { required: true, full: false, game_ids: [game.id], game_sources: [game.source] };
    const result = riskPlan({
      changedPaths: h5Paths.filter((file) => file.startsWith(game.source + '/')),
      scope,
      readSource,
    });
    if (
      registrations.has(game.source) ||
      shared ||
      (result.risk !== 'rules' && result.risk !== 'metadata')
    )
      ids.add(game.id);
  }
  const shellChanged = paths.some(
    (file) =>
      file.startsWith('apps/shell-web/') &&
      (!fileScopes.has(file) ||
        ([
          'apps/shell-web/package.json',
          'apps/shell-web/src/game-meta.json',
          'apps/shell-web/src/standalone-games.json',
        ].includes(file) &&
          fileScopes.get(file).includes('apps/shell-web'))),
  );
  if (
    shellChanged ||
    paths.some(
      (file) => validationTool.test(file) && !/^scripts\/pages-regression-shards/.test(file),
    )
  )
    for (const id of navigationSamples) if (games.some((game) => game.id === id)) ids.add(id);
  const devModeIds = paths.includes(developerMode)
    ? games
        .filter((game) => fileScopes.get(developerMode)?.includes(game.source))
        .map((game) => game.id)
    : [];
  for (const id of ['cage-rescue', 'tower-brake']) {
    const game = games.find((item) => item.id === id);
    if (
      game &&
      paths.some(
        (file) =>
          (gameServiceScopePaths.includes(file) && fileScopes.get(file)?.includes(game.source)) ||
          [
            'build.mjs',
            'scripts/build.mjs',
            'api-config.mjs',
            'index.html',
            'main.mjs',
            'src/main.mjs',
            'startup/host.js',
            'assets/scripts/TowerBrake.ts',
          ].some((entry) => file === game.source + '/' + entry),
      )
    )
      devModeIds.push(id);
  }
  if (devModeIds.length)
    for (const id of navigationSamples) if (games.some((game) => game.id === id)) ids.add(id);
  if (hasVitePatch(paths, fileScopes))
    devModeIds.push(...ids, ...viteBuiltinSources.map((source) => source.split('/game-')[1]));
  const publishingChanged = paths.some((file) => publishingScopePaths.includes(file));
  const publishingBrowserIds = Object.entries(publishingConsumers)
    .filter(
      ([id]) =>
        ids.has(id) &&
        (publishingChanged ||
          directGames.some((game) => game.id === id) ||
          paths.some(
            (file) =>
              gameServiceScopePaths.includes(file) &&
              fileScopes.get(file)?.includes(publishingConsumers[id]),
          )),
    )
    .map(([id, source]) => {
      assert(
        games.some((game) => game.id === id && game.source === source) &&
          packages.some((pkg) => pkg.dir === source),
        `Unreviewed publishing browser consumer: ${id}`,
      );
      return id;
    });
  return {
    full: false,
    ...(hasVitePatch(paths, fileScopes) ? { vite_patch: true } : {}),
    browser: ids.size > 0,
    browser_ids: [...ids].sort(),
    admin_console_checks: adminConsoleChecks,
    xiangqi_build_checks:
      paths.some(
        (file) =>
          file === 'games/submodules/xiangqi-five' ||
          file.startsWith('games/submodules/xiangqi-five/'),
      ) ||
      scopedConsumers.includes('games/submodules/xiangqi-five') ||
      (ids.has('xiangqi-five') &&
        games.some(
          (game) => game.id === 'xiangqi-five' && game.source === 'games/submodules/xiangqi-five',
        )) ||
      selected.some((game) => game.source === 'games/submodules/xiangqi-five') ||
      nineNative.targets.some((target) => target.game === 'xiangqi-five'),
    tap_services_checks: tapServicesChanged(paths, readSource),
    hook_checks: paths.some((file) => /^scripts\/check-staged-format(?:\.test)?\.mjs$/.test(file)),
    submodule_dialog_ids:
      paths.includes(submoduleDialogScopePath) && fileScopes.has(submoduleDialogScopePath)
        ? [...submoduleDialogIds]
        : [],
    ...(paths.some((file) =>
      [
        'platforms/competition/tests/street-admission.test.mjs',
        'games/local/cops-robbers-realtime/src/main.js',
        'games/local/cops-robbers-realtime/src/records.js',
      ].includes(file),
    )
      ? { street_admission_checks: true }
      : {}),
    ...(paths.some(
      (file) => adminCspScopePaths.includes(file) || file === 'scripts/competition-ingress.mjs',
    )
      ? { admin_csp_checks: true }
      : {}),
    ...(paths.some(
      (file) =>
        adminDeploymentScopePaths.includes(file) ||
        (file === 'package.json' &&
          fileScopes.get(file)?.includes('apps/admin-web') &&
          fileScopes.get(file)?.includes('services/management-api')),
    )
      ? { admin_deployment_checks: true }
      : {}),
    ...(paths.some(
      (file) =>
        backendDeploymentScopePaths.includes(file) ||
        backendSharedScopePaths.includes(file) ||
        (file === 'package.json' && fileScopes.get(file)?.includes('services/tianxia-server')),
    )
      ? { backend_deployment_checks: true }
      : {}),
    ...(paths.some((file) => imageAuthorityScopePaths.includes(file))
      ? { image_authority_checks: true }
      : {}),
    game_sources: selected.map((game) => game.source),
    pages_deploy: paths.some((file) => pagesDeployScopePaths.includes(file)),
    validation_tools: paths.some(
      (file) =>
        validationTool.test(file) ||
        (file === 'package.json' && fileScopes.get(file)?.includes('services/management-api')) ||
        cacheToolPaths.includes(file) ||
        file === mobileViewportScopeFile ||
        file === 'apps/shell-web/scripts/pages-validation.test.mjs' ||
        workspaceBoundaryScopePaths.includes(file) ||
        file === 'scripts/pages-regression-timings.json' ||
        [
          '.github/workflows/ci.yml',
          '.github/workflows/pages.yml',
          '.github/workflows/pages-validate.yml',
          '.gitignore',
          '.prettierignore',
          'scripts/check-game-config.test.mjs',
        ].includes(file),
    ),
    competition,
    consumer_sources: [
      ...new Set([
        ...competition.consumer_sources,
        ...scopedConsumers,
        ...nativeConsumers.map((consumer) => consumer.dir),
        ...(adminConsoleChecks ? ['apps/admin-web'] : []),
        ...(devModeIds.length ? ['apps/shell-web'] : []),
      ]),
    ],
    nine_native_paths: paths.filter(
      (file) => nineNativeScopePaths.includes(file) && nineScopes.has(file),
    ),
    nine_native_checks: nineNativeChecks(paths, nineScopes),
    nine_native_targets: nineNative.targets,
    nine_native_root_checks: nineNative.root_checks,
    nine_native_blocked: nineNative.blocked,
    nine_native_travel_contract: nineNative.travel_contract,
    native_consumers: nativeConsumers.map((consumer) => consumer.dir),
    developer_mode_ids: [...new Set(devModeIds)].sort(),
    catalog_rollout_checks:
      shellChanged ||
      paths.includes('apps/shell-web/src/game-assessments.json') ||
      paths.includes('apps/shell-web/scripts/catalog-rollout-smoke.mjs'),
    interaction_browser_ids: ['letters-words2', 'tianxia-chalu', 'tetracube'].filter(
      (id) => ids.has(id) && directGames.some((game) => game.id === id),
    ),
    game_services_checks: paths.some(
      (file) => gameServiceScopePaths.includes(file) && fileScopes.has(file),
    ),
    identity_checks: paths.some((file) =>
      [
        ...competitionIdentityScopePaths,
        ...competitionIdentityMirrorPaths,
        'platforms/competition/game-services.js',
        'platforms/competition/tests/game-services.test.mjs',
        'platforms/competition/profile-dom.js',
        'services/runtime-api/src/competition/identity-store.ts',
        'services/runtime-api/src/competition/platform-login.ts',
        'services/runtime-api/src/competition/profile.ts',
      ].includes(file),
    ),
    competition_service_checks: paths.some(
      (file) =>
        competitionServiceScopePaths.includes(file) ||
        competitionReviewScopePaths.includes(file) ||
        ['scripts/deploy-tencent.mjs', 'scripts/competition-gateway.mjs'].includes(file) ||
        (file === 'scripts/deployment-bundle.mjs' &&
          fileScopes.get(file)?.includes('games/local/cops-robbers')) ||
        (['package.json', 'turbo.json'].includes(file) &&
          fileScopes.get(file)?.includes('games/local/cops-robbers')),
    ),
    h5_acceptance_checks: paths.some(
      (file) => h5AcceptanceScopePaths.includes(file) && fileScopes.has(file),
    ),
    six_h5_checks: paths.some(
      (file) =>
        sixH5ScopePaths.includes(file) ||
        file === 'infra/builds/five-taptap-h5.mjs' ||
        (platformAdsScopePaths.includes(file) && !file.includes('deploy-taptap')) ||
        [
          'scripts/h5-ad-config.mjs',
          'scripts/h5-taptap-build.mjs',
          'scripts/h5-taptap-matrix.mjs',
          'scripts/build-games.mjs',
          'scripts/competition-service-config.mjs',
          'games/local/carding-car/scripts/cocos-branding.mjs',
          'games/local/carding-car/tests/cocos-branding.test.mjs',
        ].includes(file) ||
        (file === 'package.json' &&
          fileScopes.get(file)?.includes('games/local/vibeJam-myself-history-guess')),
    ),
    ranked_deployment_checks:
      paths.includes('scripts/deploy-tencent.mjs') &&
      ['games/local/cage-rescue', 'services/management-api'].some((source) =>
        fileScopes.get('scripts/deploy-tencent.mjs')?.includes(source),
      ),
    platform_process_checks: paths.some((file) =>
      [
        'scripts/platform-apps.mjs',
        'scripts/platform-process.mjs',
        'scripts/platform-process.test.mjs',
      ].includes(file),
    ),
    game_config_checks: paths.some((file) =>
      ['scripts/check-game-config.mjs', 'scripts/check-game-config.test.mjs'].includes(file),
    ),
    vocabulary_export_checks: paths.some((file) =>
      [
        'games/local/letters-words2/scripts/export-vocabulary.py',
        'games/local/letters-words2/scripts/test-export.py',
        'games/local/letters-words2/scripts/sync-vocabulary.py',
      ].includes(file),
    ),
    publishing_checks: publishingChanged,
    safe_area_checks: paths.some((file) => safeAreaScopePaths.includes(file)),
    platform_ads_checks: paths.some((file) => platformAdsScopePaths.includes(file)),
    publishing_browser_ids: publishingBrowserIds.sort(),
    publication_config_checks: paths.some((file) => publicationConfigScopePaths.includes(file)),
    deployment_bundle_checks: paths.some(
      (file) =>
        deploymentBundleScopePaths.includes(file) ||
        (file === 'infra/tencent/Dockerfile' && fileScopes.has(file)) ||
        (file === 'package.json' && fileScopes.get(file)?.includes('services/runtime-api')),
    ),
    company_deployment_checks: paths.some(
      (file) =>
        companyDeploymentScopePaths.includes(file) ||
        (file === 'package.json' && fileScopes.get(file)?.includes('apps/company-web')),
    ),
    competition_ingress_checks: paths.some(
      (file) =>
        competitionIngressScopePaths.includes(file) ||
        (runtimeProxyDefaultScopePaths.includes(file) &&
          fileScopes.get(file)?.includes('services/runtime-api')) ||
        (['scripts/deploy-tencent.mjs', 'infra/tencent/deploy.sh'].includes(file) &&
          fileScopes.get(file)?.includes('apps/company-web')),
    ),
    service_rule_sources: [
      'services/runtime-api',
      'services/kart-server',
      'services/tianxia-server',
      'services/management-api',
      'packages/service-kit',
      'packages/ad-runtime',
      'platforms/douyin',
      'platforms/taptap',
    ].filter((source) => affected.some((pkg) => pkg.dir === source)),
  };
}

/** Reviewed game guards may change their entry assertions; shared execution stays fail closed. */
export function developerModeFileScopes({ changedPaths, readBase, readHead, games }) {
  const scopes = new Map();
  if (!changedPaths.includes(developerMode)) return scopes;
  const additive = h5AdapterFileScopes({ changedPaths, readBase, readHead, games }).get(
    developerMode,
  );
  if (additive) {
    // Keep the unconditional mobile fixture without widening an unchanged guard to all its games.
    scopes.set(developerMode, [
      ...new Set([
        ...additive,
        ...games.filter((game) => game.id === 'wulong-city').map((game) => game.source),
      ]),
    ]);
    return scopes;
  }
  try {
    const parse = (source) => {
      const ids = new Set(['wulong-city']); // The existing mobile and external-frame fixture.
      const guardIds = [];
      let guards = 0;
      let fixtures = 0;
      const legacyLink =
        /        assert\.equal\(\n          await page\.getByRole\('link', \{ name: '独立打开' \}\)\.getAttribute\('href'\),\n          await page\.locator\('iframe'\)\.getAttribute\('src'\),\n        \);/;
      const legacyWrapper =
        /IMMERSIVE_ENTRY_ASSERTIONS\n          assert\.equal\(\n            await page\.getByRole\('link', \{ name: '独立打开' \}\)\.getAttribute\('href'\),\n            await page\.locator\('iframe'\)\.getAttribute\('src'\),\n          \);\n        \}/;
      const rest = source
        .replace(
          /        if \(\n([\s\S]*?)        \) \{\n([\s\S]*?)        \} else \{/g,
          (whole, condition, body) => {
            guards++;
            for (const expression of condition.replace(/\s/g, '').split('||')) {
              const match = expression.match(/^game\.id==='([A-Za-z0-9._-]+)'$/);
              assert(match, 'Unreviewed developer-mode game guard');
              assert(!guardIds.includes(match[1]), 'Duplicate developer-mode game guard');
              guardIds.push(match[1]);
              ids.add(match[1]);
            }
            const assertion = body.replace(/\s/g, '');
            const prefix =
              "awaitexpect(page.locator('.standalone-page')).toHaveAttribute('data-immersive','true');awaitexpect(page.getByRole('button',{name:'返回目录',exact:true})).";
            const suffix = ";awaitexpect(page.getByRole('link',{name:'独立打开'})).toHaveCount(0);";
            assert(
              [prefix + 'toBeVisible()' + suffix, prefix + 'toHaveCount(1)' + suffix].includes(
                assertion,
              ),
              'Unreviewed developer-mode entry assertions',
            );
            return 'IMMERSIVE_ENTRY_ASSERTIONS';
          },
        )
        .replace(legacyWrapper, 'REVIEWED_LINK_ENTRY')
        .replace(legacyLink, () => {
          guards++;
          return 'REVIEWED_LINK_ENTRY';
        })
        .replace(
          /  await page\.goto\(`\$\{origin\}\/independent\/wulong-city\/\?dev`\);\n(?:  await page\.locator\('#start-game'\)\.tap\(\);\n)?/g,
          () => {
            fixtures++;
            return 'WULONG_MOBILE_ENTRY\n';
          },
        );
      assert(guards === 1 && fixtures === 1);
      return { rest, ids, guardIds };
    };
    const before = parse(readBase(developerMode));
    const after = parse(readHead(developerMode));
    if (before.rest !== after.rest) return scopes;
    if (
      !isDeepStrictEqual(
        before.guardIds,
        after.guardIds.filter((id) => before.guardIds.includes(id)),
      )
    )
      return scopes;
    const ids = new Set([...before.ids, ...after.ids]);
    if ([...ids].some((id) => !games.some((game) => game.id === id))) return scopes;
    scopes.set(
      developerMode,
      games.filter((game) => ids.has(game.id)).map((game) => game.source),
    );
  } catch {
    // Generic runner changes or unknown executable grammar require a new consumer definition.
  }
  return scopes;
}

function removeWorkspaceLink(lock, importer, name, destination, removeSection) {
  const header = `\n  ${importer}:\n`;
  assert(lock.split(header).length === 2, 'Unrecognized or duplicate lock importer');
  const start = lock.indexOf(header);
  const tail = lock.slice(start + header.length);
  const boundary = tail.search(/\n(?:  \S|\S)/);
  const end = boundary < 0 ? lock.length : start + header.length + boundary;
  let block = lock.slice(start, end);
  const section = '\n    dependencies:\n';
  assert(block.split(section).length === 2, 'Missing lock dependencies');
  const depsStart = block.indexOf(section) + section.length;
  const next = block.slice(depsStart).search(/^    \S/m);
  const depsEnd = next < 0 ? block.length : depsStart + next;
  const link = `      ${name.startsWith('@') ? `'${name}'` : name}:\n        specifier: workspace:*\n        version: link:${path.posix.relative(importer, destination)}\n`;
  assert(block.slice(depsStart, depsEnd).split(link).length === 2, 'Unproven workspace link');
  const remainingDependencies = block.slice(depsStart, depsEnd).replace(link, '');
  block = block.slice(0, depsStart) + remainingDependencies + block.slice(depsEnd);
  if (removeSection) {
    assert(remainingDependencies.trim() === '', 'Unexpected remaining game dependency');
    block = block.replace(section, '\n');
  }
  return lock.slice(0, start) + block + lock.slice(end);
}

/** Existing registered games can add native Host links; all other lock bytes must match. */
export function nativeWorkspaceFileScopes({ changedPaths, readBase, readHead, games, packages }) {
  const scopes = new Map();
  const lock = 'pnpm-lock.yaml';
  const shellFile = 'apps/shell-minigame/package.json';
  if (!changedPaths.includes(lock) || !changedPaths.includes(shellFile)) return scopes;
  try {
    const before = JSON.parse(readBase(shellFile));
    const after = JSON.parse(readHead(shellFile));
    assert(before.dependencies && after.dependencies);
    const remaining = { ...after, dependencies: { ...after.dependencies } };
    const additions = [];
    let current = readHead(lock).replaceAll('\r\n', '\n');
    const baseLock = readBase(lock).replaceAll('\r\n', '\n');
    for (const [name, value] of Object.entries(after.dependencies)) {
      if (Object.hasOwn(before.dependencies, name)) continue;
      assert(value === 'workspace:*');
      const game = games.find((entry) =>
        packages.some((pkg) => pkg.dir === entry.source && pkg.name === name),
      );
      assert(game && changedPaths.includes(game.source + '/package.json'));
      const oldGame = JSON.parse(readBase(game.source + '/package.json'));
      const newGame = JSON.parse(readHead(game.source + '/package.json'));
      assert(oldGame.name === name && newGame.name === name);
      assert(
        /^\.\/native\/[A-Za-z0-9._/-]+\.js$/.test(newGame.exports?.['./canvas']) &&
          !newGame.exports['./canvas'].split('/').includes('..'),
      );
      const oldDeps = oldGame.dependencies || {};
      const newDeps = { ...newGame.dependencies };
      const contract = '@coffeeeeffoc/game-contract';
      if (!Object.hasOwn(oldDeps, contract) && newDeps[contract] === 'workspace:*') {
        assert(
          packages.some((pkg) => pkg.name === contract && pkg.dir === 'packages/game-contract'),
        );
        current = removeWorkspaceLink(
          current,
          game.source,
          contract,
          'packages/game-contract',
          !oldGame.dependencies,
        );
        delete newDeps[contract];
      }
      assert(isDeepStrictEqual(oldDeps, newDeps));
      for (const key of ['devDependencies', 'optionalDependencies', 'peerDependencies'])
        assert(isDeepStrictEqual(oldGame[key], newGame[key]));
      current = removeWorkspaceLink(current, 'apps/shell-minigame', name, game.source, false);
      additions.push(game.source);
      delete remaining.dependencies[name];
    }
    assert(additions.length && isDeepStrictEqual(before, remaining) && current === baseLock);
    scopes.set(lock, additions);
  } catch {
    // Dependency/resolution changes, duplicate blocks and missing baselines remain undefined.
  }
  return scopes;
}

// Literal per-game adapter data is wiring; edits to executable code retain shared
// navigation coverage. JSON parsing never executes candidate source.
export function entryAdapterFileScopes({ changedPaths, readBase, readHead, games }) {
  const file = 'apps/shell-web/scripts/standalone-game-entry.mjs';
  const scopes = new Map();
  if (!changedPaths.includes(file)) return scopes;
  try {
    const parse = (text) => {
      const data = {};
      const rest = text.replace(
        /export const (markers|homeControls|legacyEntryIds) = ([\s\S]*?);/g,
        (whole, name, literal) => {
          const json = literal
            .replace(/'([^'\\]*)'/g, (_, value) => JSON.stringify(value))
            .replace(/([,{]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3')
            .replace(/,\s*([}\]])/g, '$1');
          data[name] = JSON.parse(json);
          return `export const ${name} = DATA;`;
        },
      );
      assert(Object.keys(data).length === 3 && Array.isArray(data.legacyEntryIds));
      return { data, rest };
    };
    const before = parse(readBase(file)),
      after = parse(readHead(file));
    if (before.rest !== after.rest) return scopes;
    const ids = new Set();
    for (const name of ['markers', 'homeControls'])
      for (const id of new Set([
        ...Object.keys(before.data[name]),
        ...Object.keys(after.data[name]),
      ]))
        if (!isDeepStrictEqual(before.data[name][id], after.data[name][id])) ids.add(id);
    for (const id of new Set([...before.data.legacyEntryIds, ...after.data.legacyEntryIds]))
      if (before.data.legacyEntryIds.includes(id) !== after.data.legacyEntryIds.includes(id))
        ids.add(id);
    if ([...ids].some((id) => !games.some((game) => game.id === id))) return scopes;
    scopes.set(
      file,
      games.filter((game) => ids.has(game.id)).map((game) => game.source),
    );
  } catch {
    // Unknown literal grammar stays a shared contract change.
  }
  return scopes;
}

// Use the existing formatter's parser for source ranges, never candidate execution.
// Raw literal grammars below deliberately exclude comments, escapes and expressions.
function adapterSyntax(text) {
  const { parsers } = loadFormatter('prettier/plugins/babel');
  const ast = parsers.babel.parse(text, {});
  const nodes = [];
  function visit(node, parent) {
    if (Array.isArray(node)) {
      for (const child of node) visit(child, parent);
    } else if (node && typeof node === 'object' && typeof node.type === 'string') {
      nodes.push({ node, parent });
      for (const [key, value] of Object.entries(node))
        if (
          ![
            'loc',
            'extra',
            'comments',
            'leadingComments',
            'trailingComments',
            'innerComments',
            'tokens',
          ].includes(key)
        )
          visit(value, node);
    }
  }
  visit(ast, null);
  return { ast, nodes };
}

function literalRange(text, node, items) {
  assert(new Set(items).size === items.length, 'Duplicate adapter literal');
  return { items, prefix: text.slice(0, node.start), suffix: text.slice(node.end) };
}

function fullscreenCopies(text) {
  // Planning runs before dependency installation. Mask comments/quoted content
  // without evaluating source, then accept only one top-level const declaration.
  const masked = text.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\[\s\S]|[^'\\])*'|"(?:\\[\s\S]|[^"\\])*"|`(?:\\[\s\S]|[^`\\])*`/g,
    (token) => token.replace(/[^\r\n]/g, ' '),
  );
  const declarations = [...masked.matchAll(/\b(?:const|let|var)\s+copies\s*=/g)];
  assert(declarations.length === 1, 'Expected one copies declaration');
  const declaration = declarations[0];
  assert(declaration[0].startsWith('const '), 'Expected const copies');
  let depth = 0;
  for (const token of masked.slice(0, declaration.index)) {
    if ('{[('.includes(token)) depth++;
    if ('}])'.includes(token)) depth--;
    assert(depth >= 0, 'Unbalanced adapter prefix');
  }
  assert(depth === 0, 'Expected top-level copies');
  const start = declaration.index + declaration[0].length;
  const match = /^\s*(\[[\s\S]*?\])\s*;/.exec(text.slice(start));
  assert(match, 'Expected one literal array declaration');
  const literal = match[1];
  const string = `(?:'[A-Za-z0-9._/-]+'|"[A-Za-z0-9._/-]+")`;
  assert(new RegExp(`^\\[\\s*(?:${string}\\s*(?:,\\s*${string}\\s*)*,?\\s*)?\\]$`).test(literal));
  const at = start + match[0].indexOf('[');
  return literalRange(
    text,
    { start: at, end: at + literal.length },
    [...literal.matchAll(/['"]([A-Za-z0-9._/-]+)['"]/g)].map((item) => item[1]),
  );
}

function developerGameIds(text) {
  const { nodes } = adapterSyntax(text);
  const term = `game\\.id\\s*===\\s*(?:'[A-Za-z0-9][A-Za-z0-9._-]*'|"[A-Za-z0-9][A-Za-z0-9._-]*")`;
  const grammar = new RegExp(`^${term}(?:\\s*\\|\\|\\s*${term})+$`);
  const matches = nodes.filter(
    ({ node }) =>
      node.type === 'IfStatement' &&
      !node.test.extra?.parenthesized &&
      grammar.test(text.slice(node.test.start, node.test.end)),
  );
  assert(matches.length === 1, 'Expected one developer game OR-list');
  const condition = matches[0].node.test;
  const ids = [
    ...text.slice(condition.start, condition.end).matchAll(/['"]([A-Za-z0-9][A-Za-z0-9._-]*)['"]/g),
  ].map((match) => match[1]);
  return literalRange(text, condition, ids);
}

function adapterAdditions(before, after) {
  assert(
    before.prefix === after.prefix && before.suffix === after.suffix,
    'Adapter executable source changed',
  );
  const old = new Set(before.items);
  assert(
    isDeepStrictEqual(
      before.items,
      after.items.filter((item) => old.has(item)),
    ),
    'Removed or reordered adapter literals',
  );
  const added = after.items.filter((item) => !old.has(item));
  assert(added.length > 0, 'No adapter additions');
  return added;
}

/** Narrow only reviewed additive H5 wiring; unrecognized source stays an unknown gate. */
export function h5AdapterFileScopes({ changedPaths, readBase, readHead, games }) {
  const fullscreen = 'scripts/sync-h5-fullscreen.mjs';
  const developer = 'scripts/test-game-dev-mode.mjs';
  const scopes = new Map();
  for (const file of [fullscreen, developer].filter((path) => changedPaths.includes(path))) {
    try {
      assert(
        games.every(
          (game) =>
            /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(game.id) &&
            /^games\/(?:local|submodules)\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(game.source),
        ),
      );
      assert(
        new Set(games.map((game) => game.id)).size === games.length &&
          new Set(games.map((game) => game.source)).size === games.length,
      );
      const parse = file === fullscreen ? fullscreenCopies : developerGameIds;
      const before = parse(readBase(file)),
        after = parse(readHead(file));
      const added = adapterAdditions(before, after);
      const sources = new Set();
      if (file === fullscreen) {
        for (const copy of added) {
          assert(copy.split('/').every((part) => part && part !== '.' && part !== '..'));
          assert(copy.endsWith('/fullscreen.js'));
          const game = games.find((entry) => copy.startsWith(entry.source + '/'));
          assert(game, 'Unregistered fullscreen copy');
          sources.add(game.source);
        }
      } else {
        assert(
          [...before.items, ...after.items].every((id) => games.some((game) => game.id === id)),
        );
        for (const id of added) sources.add(games.find((game) => game.id === id).source);
      }
      scopes.set(
        file,
        games.filter((game) => sources.has(game.source)).map((game) => game.source),
      );
    } catch {
      // Unknown grammar, identities or executable edits remain unclassified and block.
    }
  }
  return scopes;
}
