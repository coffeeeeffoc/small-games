import {
  localRetirementFileScopes,
  localRetirementHeadQueryPaths,
} from './local-game-retirement-scope.mjs';
import assert from 'node:assert/strict';
import { readFile, stat, glob } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ruleTask,
  staticTaskArgs,
  lintExcludedByRepository,
  rulesCoveredByAggregate,
  aggregateRunsAllTests,
} from './rule-tasks.mjs';
import { registrationFileScopes } from './pages-registration-scope.mjs';
import { retirementFileScopes, retirementHeadQueryPaths } from './game-retirement-scope.mjs';
import { nineNativeFileScopes, isNineNativeOnlyPath } from './nine-native-scope.mjs';
import { nineLockFileScopes } from './nine-lock-scope.mjs';
import {
  viteTestSources,
  viteSmokeSources,
  viteNativeSources,
  viteNativeNodeTests,
} from './vite-patch-scope.mjs';
import {
  incrementalPlan,
  entryAdapterFileScopes,
  developerModeFileScopes,
  nativeWorkspaceFileScopes,
  nativeToolConsumers,
  reviewedNativeTest,
  h5AdapterFileScopes,
  reviewedSharedFileScopes,
  workspaceBoundaryScopePaths,
} from './incremental-validation.mjs';
import { verifyCocosBuildInputs, cocosPreflightTargets } from './cocos-validation.mjs';
import { run, cleanGitEnv } from './validate-push.mjs';
import { createBrowserPreparation } from './browser-preparation.mjs';
import {
  workspacePackages,
  affectedPackages,
  staticBuildTargets,
  isDocumentation,
  shellContractTargets,
  shellContractFiles,
} from './validation-plan.mjs';
import { main as selectScope, collectChangedPaths } from './pages-test-scope.mjs';
import { publishingConsumers } from './publication-scopes.mjs';
import { createRequire } from 'node:module';

function dependencyText(source) {
  const { parsers } = createRequire(import.meta.url)('prettier/plugins/babel');
  const fragments = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (
      (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(
        node.type,
      ) &&
        node.source) ||
      ['ImportExpression', 'TSImportType', 'TSExternalModuleReference'].includes(node.type) ||
      (node.type === 'CallExpression' &&
        (node.callee.type === 'Import' || node.callee.name === 'require'))
    )
      fragments.push(source.slice(node.start, node.end));
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(parsers['babel-ts'].parse(source, {}));
  return fragments.join('\n');
}

// Fail closed on test commands without a demonstrably browser-free entry/import graph.
export async function assertNodeOnly(command, dir, visited = new Set()) {
  assert(
    !/playwright|puppeteer|chromium|browser|smoke|\.html|\b(?:curl|wget)\b/i.test(command),
    `Browser/unknown test command: ${command}`,
  );
  if (command.includes(' && ')) {
    for (const part of command.split(' && ')) await assertNodeOnly(part, dir, visited);
    return;
  }
  assert(
    /^(?:node (?:--test )?|tsx (?:--test )?|vitest run)/.test(command),
    `Unreviewed test runner: ${command}`,
  );
  let entries = [...command.matchAll(/(?:^|\s)([^\s;&|]+\.(?:[cm]?[jt]sx?))(?=\s|$)/g)].map(
    (match) => match[1],
  );
  if (/^vitest run/.test(command)) {
    if (!entries.length) {
      for await (const file of glob(['**/*.test.ts', '**/*.test.tsx'], {
        cwd: dir,
        exclude: ['node_modules/**', 'dist/**'],
      }))
        entries.push(file);
    }
    for await (const file of glob(['vitest.config.*', 'vite.config.*'], { cwd: dir }))
      entries.push(file);
  }
  const expanded = [];
  for (const entry of entries)
    for await (const file of glob(entry, { cwd: dir })) expanded.push(file);
  entries = expanded;
  assert(entries.length, `No explicit rule test files: ${command}`);
  async function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const text = await readFile(file, 'utf8');
    if (path.extname(file) === '.json') {
      JSON.parse(text);
      return;
    }
    assert(
      !/globalSetup|browser\s*:|projects\s*:/.test(text),
      `Unreviewed test configuration: ${file}`,
    );
    assert(
      !/from\s*['"](?:@playwright|playwright|puppeteer)|\beval\s*\(/.test(text),
      `Unreviewed executable dependency: ${file}`,
    );
    // Generated source and comments are data; imports inside template expressions remain code.
    const dependencies = dependencyText(text);
    for (const match of dependencies.matchAll(
      /(?:import|require)\s*\(\s*(?:'([^']+)'|"([^"]+)"|`([^`]+)`|([^\n)]+))\s*\)/g,
    )) {
      if (match[1] || match[2]) continue;
      const template = match[3];
      assert(
        template && template.startsWith('.') && /\$\{[^}]+\}/.test(template),
        `Unreviewed executable dependency: ${file}`,
      );
      const pattern = template.replace(/\$\{[^}]+\}/g, '*');
      let count = 0;
      for await (const candidate of glob(pattern, { cwd: path.dirname(file) })) {
        count++;
        await visit(path.resolve(path.dirname(file), candidate));
      }
      assert(count, `Missing dynamic test dependency: ${file}`);
    }
    for (const setup of text.matchAll(/setupFiles\s*:\s*\[([^\]]+)\]/g)) {
      for (const match of setup[1].matchAll(/['"](\.[^'"]+)['"]/g))
        await visit(path.resolve(path.dirname(file), match[1]));
    }
    for (const match of dependencies.matchAll(
      /(?:import|export)\s+(?:[^;"']*?from\s*)?["']([^"']+)["']|(?:import|require)\s*\(\s*["']([^"']+)["']/g,
    )) {
      const ref = match[1] || match[2];
      assert(ref !== 'node:child_process', `Executable test dependency ${ref}`);
      if (ref.startsWith('node:')) continue;
      if (
        [
          'vitest',
          'vitest/config',
          'vite',
          '@vitejs/plugin-react',
          'three',
          'zustand',
          'phaser',
          'zod',
          'react',
          'react-dom',
          'react-dom/client',
          '@testing-library/react',
          'typescript',
          '@react-three/rapier',
        ].includes(ref) ||
        ref.startsWith('phaser/src/') ||
        ref.startsWith('three/addons/')
      )
        continue;
      if (ref.startsWith('@coffeeeeffoc/')) {
        let root = dir;
        while (!(await stat(path.join(root, 'pnpm-workspace.yaml')).catch(() => null))) {
          const parent = path.dirname(root);
          assert(parent !== root, `Missing workspace for ${ref}`);
          root = parent;
        }
        const parts = ref.split('/');
        const pkg = (await workspacePackages(root)).find(
          (item) => item.name === parts.slice(0, 2).join('/'),
        );
        const exported = pkg?.exports?.[parts.length === 2 ? '.' : './' + parts.slice(2).join('/')];
        const target = typeof exported === 'string' ? exported : exported?.default;
        assert(typeof target === 'string', `Unreviewed workspace export ${ref}`);
        let filename = path.join(root, pkg.dir, target);
        if (
          !(await stat(filename).catch(() => null)) &&
          (target.startsWith('./dist/') || target.startsWith('./dist-content/'))
        )
          filename = path.join(
            root,
            pkg.dir,
            target
              .replace('./dist/', './src/')
              .replace('./dist-content/', './src/content/')
              .replace(/\.js$/, '.ts'),
          );
        await visit(filename);
        continue;
      }
      assert(ref.startsWith('.'), `Unreviewed external test dependency ${ref} in ${file}`);
      const target = path.resolve(path.dirname(file), ref);
      let resolved;
      for (const candidate of [
        target,
        target.replace(/\.js$/, '.ts'),
        target.replace(/\.js$/, '.tsx'),
        ...['.ts', '.js', '.mjs', '/index.ts', '/index.js'].map((ext) => target + ext),
      ]) {
        if ((await stat(candidate).catch(() => null))?.isFile()) {
          resolved = candidate;
          break;
        }
      }
      assert(resolved, `Missing test dependency ${ref}`);
      await visit(resolved);
    }
  }
  for (const entry of entries) await visit(path.resolve(dir, entry));
}

export function nativeReleaseGatesEnabled(env = process.env) {
  const value = env.MINIGAME_RELEASE_GATES;
  assert(
    value === undefined || value === '' || value === '0' || value === '1',
    'MINIGAME_RELEASE_GATES must be 0 or 1',
  );
  return value === '1';
}

export function runNineNativeChecks({
  plan,
  packages,
  root,
  env,
  execute = run,
  prepareBrowser = () => {},
}) {
  const rootChecks = plan.nine_native_root_checks || [];
  for (const check of rootChecks) {
    assert(
      check.file === 'scripts/kart-sharing.test.mjs' &&
        JSON.stringify(check.args) === JSON.stringify(['--test', check.file]),
      'Unreviewed native root check',
    );
  }
  const executeRootChecks = () => {
    for (const check of rootChecks) execute(process.execPath, check.args, root, env, 'logged');
  };
  const checks = plan.nine_native_checks || [];
  const platforms = ['wechat', 'bilibili', 'douyin', 'kuaishou', 'alipay'];
  const games = [
    'carding-car',
    'letters-words2',
    'vibeJam-myself-history-guess',
    'travel-bund',
    'night-overwatch',
    'wulong-city',
  ];
  const targets = new Map();
  for (const target of plan.nine_native_targets || []) {
    const standaloneTapTarget =
      target.game === 'homebound-station' &&
      target.platform === 'taptap' &&
      target.source === 'games/local/homebound-station' &&
      target.requiresCreator === '3.8.8';
    assert(
      standaloneTapTarget ||
        (games.includes(target.game) && [...platforms, 'taptap'].includes(target.platform)),
      'Unknown first-nine native target',
    );
    targets.set(`${target.game}/${target.platform}`, target);
  }
  for (const check of checks)
    for (const game of check.games)
      for (const platform of platforms) {
        assert(games.includes(game), 'Unknown first-nine native game');
        targets.set(`${game}/${platform}`, { game, platform });
      }
  if (!targets.size) {
    executeRootChecks();
    return;
  }
  if (!nativeReleaseGatesEnabled(env)) {
    executeRootChecks();
    console.log(
      `MINIGAME_RELEASE_GATES=0: deferred ${targets.size} native platform targets; platform acceptance unverified.`,
    );
    return;
  }
  const host = packages.find((pkg) => pkg.dir === 'apps/shell-minigame');
  assert(
    host?.scripts?.test === 'vitest run tests && node --test scripts/*.test.mjs' &&
      host.scripts['build:nine'] === 'node scripts/nine-games-build.mjs',
    'Unreviewed first-nine native host commands',
  );
  const nativeEnv = {
    ...env,
    NATIVE_OUTPUT_ROOT: path.join(root, 'apps/shell-minigame/dist/nine-games'),
    NATIVE_SCREENSHOT_ROOT: path.join(root, '.scratch/nine-native-validation/screenshots'),
    TRAVEL_NATIVE_EVIDENCE_ROOT: path.join(root, '.scratch/nine-native-validation/travel'),
  };
  const tapGames = [...targets.values()]
    .filter((target) => target.platform === 'taptap')
    .map((target) => target.game);
  if (tapGames.length) {
    assert(
      host.scripts['build:taptap'] === 'node scripts/taptap-build.mjs' &&
        host.scripts['test:taptap'] === 'node scripts/taptap-smoke.mjs',
      'Unreviewed TapTap build/smoke commands',
    );
    assert(
      packages.some((pkg) => pkg.dir === 'platforms/taptap'),
      'Missing TapTap workspace',
    );
  }
  executeRootChecks();
  for (const { game, platform } of targets.values())
    execute(
      process.execPath,
      platform === 'taptap'
        ? [
            'apps/shell-minigame/scripts/taptap-build.mjs',
            '--game',
            game,
            '--preview',
            '--output',
            nativeEnv.NATIVE_OUTPUT_ROOT,
          ]
        : [
            'apps/shell-minigame/scripts/nine-games-build.mjs',
            '--game',
            game,
            '--platform',
            platform,
            '--preview',
          ],
      root,
      nativeEnv,
      'logged',
    );
  // Creator targets use the genuine builder above. Missing tools fail this gate;
  // configured output or H5 artifacts cannot replace a native compilation.
  execute('pnpm', ['--filter', host.name, 'test'], root, nativeEnv, 'logged');
  if ([...targets.values()].some((target) => platforms.includes(target.platform)))
    execute('pnpm', ['--filter', host.name, 'test:nine:resources'], root, nativeEnv, 'logged');
  if (tapGames.length) {
    const tap = packages.find((pkg) => pkg.dir === 'platforms/taptap');
    execute('pnpm', ['--filter', tap.name, 'test'], root, nativeEnv, 'logged');
    if (tapGames.includes('travel-bund')) {
      prepareBrowser();
      for (const key of ['CHROMIUM_PATH', 'PLAYWRIGHT_EXECUTABLE_PATH'])
        if (env[key]) nativeEnv[key] = env[key];
    }
    for (const game of tapGames)
      execute(
        process.execPath,
        [
          'apps/shell-minigame/scripts/taptap-smoke.mjs',
          '--game',
          game,
          '--output',
          nativeEnv.NATIVE_OUTPUT_ROOT,
        ],
        root,
        nativeEnv,
        'logged',
      );
  }
  const selectedFor = (game) => platforms.filter((platform) => targets.has(`${game}/${platform}`));
  const executeScript = (args, extra = {}) =>
    execute(process.execPath, args, root, { ...nativeEnv, ...extra }, 'logged');
  if (selectedFor('letters-words2').length)
    executeScript(['--test', 'games/local/letters-words2/tests/native-bundle.test.mjs'], {
      NATIVE_PLATFORMS: selectedFor('letters-words2').join(','),
    });
  if (selectedFor('wulong-city').length)
    executeScript(['scripts/nine-wulong-smoke.mjs'], {
      NATIVE_PLATFORMS: selectedFor('wulong-city').join(','),
    });
  const canvasGames = ['vibeJam-myself-history-guess'];
  for (const platform of platforms) {
    const ids = canvasGames.filter((game) => targets.has(`${game}/${platform}`));
    if (ids.length)
      executeScript(['scripts/nine-canvas-games-smoke.mjs'], {
        NATIVE_PLATFORMS: platform,
        NATIVE_GAME_IDS: ids.join(','),
      });
  }
  if (selectedFor('travel-bund').length) {
    prepareBrowser();
    // CI resolves the installed real browser before the child process inherits env.
    for (const key of ['CHROMIUM_PATH', 'PLAYWRIGHT_EXECUTABLE_PATH'])
      if (env[key]) nativeEnv[key] = env[key];
    executeScript(['scripts/nine-travel-native-smoke.mjs'], {
      NATIVE_PLATFORMS: selectedFor('travel-bund').join(','),
    });
  }
  const executed = new Set([
    'scripts/nine-wulong-smoke.mjs',
    'scripts/nine-canvas-games-smoke.mjs',
    'scripts/nine-travel-native-smoke.mjs',
  ]);
  for (const check of checks) {
    if (!check.command || executed.has(check.command.file)) continue;
    if (
      check.type === 'entry' &&
      ![...targets.values()].some((target) => target.platform === 'bilibili')
    )
      continue;
    executed.add(check.command.file);
    executeScript(
      check.command.args?.length ? check.command.args : [check.command.file],
      check.type === 'entry' ? { BILIBILI_BROWSER: '1' } : {},
    );
  }
}

export function runIncrementalToolChecks({ plan, packages, root, env, execute = run }) {
  // This subprocess contract owns only temporary fixtures; it is separate from
  // pure rule traversal and remains required when native release gates are off.
  if (plan.xiangqi_build_checks)
    execute(
      process.execPath,
      ['--test', 'games/submodules/xiangqi-five/build.test.js'],
      root,
      env,
      'logged',
    );
  if (plan.hook_checks) execute('pnpm', ['test:hooks'], root, env, 'logged');
  if (plan.street_admission_checks)
    execute(
      process.execPath,
      ['--test', 'platforms/competition/tests/street-admission.test.mjs'],
      root,
      env,
      'logged',
    );
  if (plan.identity_checks)
    execute(
      process.execPath,
      [
        '--test',
        'scripts/competition-client.test.mjs',
        'platforms/competition/tests/game-services.test.mjs',
        'platforms/competition/tests/identity.test.mjs',
      ],
      root,
      env,
      'logged',
    );
  if (plan.six_h5_checks)
    execute(
      process.execPath,
      [
        '--test',
        '--test-concurrency=1',
        'scripts/six-taptap-h5.test.mjs',
        'platforms/h5/tests/game-rewards.test.mjs',
        'platforms/h5/tests/interstitial.test.mjs',
        'scripts/h5-game-services.test.mjs',
        'platforms/competition/tests/game-bootstrap.test.mjs',
        'games/local/carding-car/tests/cocos-branding.test.mjs',
      ],
      root,
      env,
      'logged',
    );
  if (plan.h5_acceptance_checks)
    execute(
      process.execPath,
      [
        '--test',
        '--test-concurrency=1',
        'scripts/h5-taptap-build.test.mjs',
        'scripts/h5-taptap-runtime.test.mjs',
        'scripts/h5-taptap-trace.test.mjs',
        ...(plan.competition_service_checks ? [] : ['scripts/h5-taptap-matrix.test.mjs']),
      ],
      root,
      env,
      'logged',
    );
  if (plan.competition_service_checks) {
    execute(
      process.execPath,
      [
        '--test',
        'scripts/competition-service-config.test.mjs',
        'scripts/h5-ad-config.test.mjs',
        'scripts/h5-taptap-matrix.test.mjs',
        'scripts/build-games.test.mjs',
        'apps/shell-minigame/scripts/taptap-cocos.test.mjs',
        'apps/shell-minigame/scripts/taptap-cocos-inputs.test.mjs',
        'apps/shell-minigame/scripts/taptap-conversion.test.mjs',
        'apps/shell-minigame/scripts/taptap-login.test.mjs',
      ],
      root,
      env,
      'logged',
    );
    execute(process.execPath, ['scripts/competition-service.browser.mjs'], root, env, 'logged');
  }
  // Host SDK fixtures and actual H5 touch entrances are Web contracts.
  // Keep these before release-gate deferral, and keep generated builds serial.
  if (plan.tap_services_checks) {
    const consumers = [
      ['cops-robbers', 'games/local/cops-robbers'],
      ['cops-robbers-realtime', 'games/local/cops-robbers-realtime'],
      ['@coffeeeeffoc/xiangqi-five', 'games/submodules/xiangqi-five'],
    ];
    for (const [name, dir] of consumers)
      assert.equal(
        packages.filter((pkg) => pkg.name === name && pkg.dir === dir && pkg.scripts?.build).length,
        1,
        'Missing candidate H5 restoration consumer',
      );
    let primaryError;
    try {
      execute(
        process.execPath,
        ['--test', 'platforms/taptap/tests/tap-services.test.mjs'],
        root,
        env,
        'logged',
      );
      execute(
        process.execPath,
        ['platforms/taptap/tests/tap-services.browser.mjs'],
        root,
        env,
        'logged',
      );
      // This entry owns multiplayer rules and all three enabled H5 touch entrances.
      execute(process.execPath, ['scripts/check-tap-multiplayer.mjs'], root, env, 'logged');
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      // The fixtures deliberately replace three dist trees with SDK-enabled
      // builds. Restore each real candidate build before subsequent acceptance
      // checks or publication; preserve both errors if testing and cleanup fail.
      const restorationErrors = [];
      for (const [name] of consumers) {
        try {
          execute('pnpm', ['--filter', name, 'run', 'build'], root, env, 'logged');
        } catch (error) {
          restorationErrors.push(error);
        }
      }
      if (restorationErrors.length)
        throw new AggregateError(
          [...(primaryError ? [primaryError] : []), ...restorationErrors],
          'Tap candidate H5 restoration failed' + (primaryError ? ': ' + primaryError.message : ''),
        );
    }
  }
  if (plan.submodule_dialog_ids?.length) {
    assert.deepEqual(plan.submodule_dialog_ids, ['xiangqi-five']);
    for (const id of plan.submodule_dialog_ids)
      assert(
        packages.some((pkg) => pkg.dir === `games/submodules/${id}`),
        'Missing dialog browser consumer',
      );
    execute(
      process.execPath,
      ['scripts/test-submodule-dialogs.mjs'],
      root,
      {
        ...env,
        DIALOG_GAMES: plan.submodule_dialog_ids.join(','),
        PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: env.PLAYWRIGHT_EXECUTABLE_PATH || env.CHROMIUM_PATH,
      },
      'logged',
    );
  }
  if (plan.vite_patch) {
    // A test-runner dependency changes these tests, not their downstream runtime
    // consumers. Keep this separate from affectedPackages' runtime graph.
    for (const source of viteTestSources) {
      const pkg = packages.find((item) => item.dir === source);
      assert(
        pkg?.devDependencies?.vitest === '5.0.0' && pkg.scripts?.test?.includes('vitest'),
        `Missing audited Vite test consumer: ${source}`,
      );
      if (source === 'apps/shell-minigame') {
        assert.equal(
          pkg.scripts.test,
          'vitest run tests && node --test scripts/*.test.mjs',
          'Unreviewed mixed native test command',
        );
        execute(
          'pnpm',
          ['--filter', pkg.name, 'exec', 'vitest', 'run', 'tests'],
          root,
          env,
          'logged',
        );
        execute(process.execPath, ['--test', ...viteNativeNodeTests], root, env, 'logged');
      } else execute('pnpm', ['--filter', pkg.name, 'test'], root, env, 'logged');
    }
    for (const source of viteSmokeSources) {
      const pkg = packages.find((item) => item.dir === source);
      assert(pkg?.scripts?.smoke, `Missing audited Vite smoke consumer: ${source}`);
      execute('pnpm', ['--filter', pkg.name, 'smoke'], root, env, 'logged');
    }
    if (nativeReleaseGatesEnabled(env)) {
      for (const source of viteNativeSources) {
        const pkg = packages.find((item) => item.dir === source);
        assert(pkg?.scripts?.smoke, `Missing native Vite consumer: ${source}`);
        execute('pnpm', ['--filter', pkg.name, 'smoke'], root, env, 'logged');
      }
    } else
      console.log(
        'Vite native host builds/smoke deferred by MINIGAME_RELEASE_GATES=0; their unit, type and lint checks remain required.',
      );
  }
  if (plan.catalog_rollout_checks) {
    assert(plan.browser, 'Catalog rollout validation requires real browser checks');
    execute(
      process.execPath,
      ['apps/shell-web/scripts/catalog-rollout-smoke.mjs'],
      root,
      env,
      'logged',
    );
  }
  // These games use existing sharing or no ads; validate their interaction changes
  // without classifying them as consumers of the public H5 publishing adapter.
  const interactionBrowsers = {
    'letters-words2': 'word-flow.browser.mjs',
    'tianxia-chalu': 'browser.mjs',
  };
  for (const [id, file] of Object.entries(interactionBrowsers)) {
    const source = `games/local/${id}`;
    if (!plan.interaction_browser_ids?.includes(id)) continue;
    assert(
      plan.browser &&
        plan.browser_ids?.includes(id) &&
        plan.game_sources?.includes(source) &&
        packages.some((pkg) => pkg.dir === source),
      `Missing interaction browser consumer: ${id}`,
    );
    execute(process.execPath, [`${source}/tests/${file}`], root, env, 'logged');
  }
  if (plan.safe_area_checks) {
    execute(
      process.execPath,
      ['--test', 'platforms/h5/tests/safe-area.test.mjs'],
      root,
      env,
      'logged',
    );
    execute(process.execPath, ['platforms/h5/tests/safe-area.browser.mjs'], root, env, 'logged');
  }
  if (plan.publishing_checks)
    execute(
      process.execPath,
      ['--test', 'platforms/h5/tests/publishing.test.mjs'],
      root,
      env,
      'logged',
    );
  if (plan.platform_ads_checks)
    execute(
      process.execPath,
      [
        '--test',
        'platforms/h5/tests/platform-ads.test.mjs',
        'platforms/h5/tests/deploy-taptap.test.mjs',
        'games/local/cops-robbers/scripts/check-ad-core.mjs',
        'games/local/cops-robbers-realtime/tests/taptap-h5-ads.test.mjs',
        'games/submodules/xiangqi-five/rewarded-hints.test.js',
      ],
      root,
      env,
      'logged',
    );
  if (plan.publication_config_checks)
    execute(
      process.execPath,
      ['--test', 'platforms/tests/publication-config.test.mjs'],
      root,
      env,
      'logged',
    );
  if (plan.deployment_bundle_checks)
    execute(
      process.execPath,
      ['--test', 'scripts/deployment-bundle.test.mjs'],
      root,
      env,
      'logged',
    );
  if (plan.company_deployment_checks)
    execute(process.execPath, ['--test', 'scripts/deploy-company.test.mjs'], root, env, 'logged');
  if (plan.backend_deployment_checks || plan.image_authority_checks)
    execute(process.execPath, ['--test', 'scripts/deploy-backend.test.mjs'], root, env, 'logged');
  if (plan.admin_deployment_checks)
    execute(process.execPath, ['--test', 'scripts/deploy-admin.test.mjs'], root, env, 'logged');
  if (plan.admin_csp_checks)
    execute(
      process.execPath,
      [
        '--test',
        '--test-concurrency=1',
        'scripts/admin-csp.test.mjs',
        'scripts/admin-caddy-fixture.test.mjs',
      ],
      root,
      env,
      'logged',
    );
  if (plan.competition_ingress_checks)
    execute(
      process.execPath,
      ['--test', 'scripts/competition-ingress.test.mjs'],
      root,
      env,
      'logged',
    );
  if (plan.game_services_checks)
    execute(
      process.execPath,
      [
        '--test',
        ...(plan.identity_checks ? [] : ['platforms/competition/tests/game-services.test.mjs']),
        'scripts/competition-gateway.test.mjs',
      ],
      root,
      env,
      'logged',
    );
  if (plan.ranked_deployment_checks)
    execute(process.execPath, ['--test', 'scripts/deploy-tencent.test.mjs'], root, env, 'logged');
  // These reviewed entry points exercise sharing/ad lifecycle in the real UI.
  // Keep them sequential: several own a local server and write candidate evidence.
  const publishingBrowsers = {
    'cops-robbers': ['check-rewarded-hints.mjs'],
    'cops-robbers-realtime': ['publishing.browser.mjs', 'start-lifecycle.browser.mjs'],
    'tower-brake': ['publishing-browser.mjs', 'browser.mjs', 'expansion-browser.mjs'],
    'cage-rescue': [
      'reward-browser.mjs',
      'browser.mjs',
      'touch-activation-browser.mjs',
      'expansion-browser.mjs',
    ],
    'ball-roguelite': ['browser.mjs'],
    'ember-bounce': ['browser.mjs'],
    'three-choose-two': ['publishing.browser.mjs'],
    'flick-arena': ['publishing.browser.mjs'],
    'moss-garden': ['publishing.browser.mjs'],
    'chase-thief': ['publishing.browser.mjs'],
    'retreat-rally': ['publishing.browser.mjs'],
    'tiny-signals': ['publishing.browser.mjs'],
    'orbit-atelier': ['publishing.browser.mjs', 'browser.mjs'],
    'wulong-city': ['publishing.browser.mjs'],
    'surprise-kept': ['publishing.browser.mjs'],
    'homebound-station': ['publishing.browser.mjs'],
    'waterline-station': ['publishing.browser.mjs'],
    'rescue-team': ['publishing.browser.mjs'],
    'out-of-frame': ['publishing.browser.mjs'],
    'fold-the-world': ['publishing.browser.mjs'],
    'two-sided-box': ['publishing.browser.mjs'],
  };
  const publishingIds = [...new Set(plan.publishing_browser_ids || [])];
  for (const id of publishingIds)
    assert(
      Object.hasOwn(publishingBrowsers, id) &&
        plan.browser &&
        plan.browser_ids.includes(id) &&
        packages.some((pkg) => pkg.dir === publishingConsumers[id]),
      `Unreviewed publishing browser target: ${id}`,
    );
  for (const id of publishingIds)
    for (const file of publishingBrowsers[id])
      execute(
        process.execPath,
        [`${publishingConsumers[id]}/${id === 'cops-robbers' ? 'scripts' : 'tests'}/${file}`],
        root,
        env,
        'logged',
      );
  for (const source of plan.service_rule_sources || []) {
    assert(
      [
        'services/runtime-api',
        'services/kart-server',
        'services/tianxia-server',
        'services/management-api',
        'packages/service-kit',
        'packages/ad-runtime',
        'platforms/douyin',
        'platforms/taptap',
      ].includes(source),
    );
    const pkg = packages.find((item) => item.dir === source);
    assert(pkg?.scripts?.test, `Missing runtime rule suite: ${source}`);
    execute('pnpm', ['--filter', pkg.name, 'test'], root, env, 'logged');
  }
  if (plan.admin_console_checks) {
    const admin = packages.find((pkg) => pkg.dir === 'apps/admin-web');
    assert(
      admin?.name === '@coffeeeeffoc/admin-web' &&
        admin.scripts?.test === 'pnpm build && node tests/browser.mjs',
      'Unreviewed admin browser consumer',
    );
    execute(process.execPath, ['apps/admin-web/tests/browser.mjs'], root, env, 'logged');
  }
  const releaseGates = nativeReleaseGatesEnabled(env);
  const competition = plan.competition && {
    ...plan.competition,
    native: plan.competition.native && releaseGates,
  };
  const nativeConsumers = releaseGates ? plan.native_consumers : [];
  if (plan.competition?.config_tests)
    execute(
      process.execPath,
      ['--test', 'scripts/check-game-config.test.mjs'],
      root,
      env,
      'logged',
    );
  if (competition && ['h5', 'native', 'letters'].some((key) => competition[key]))
    execute(
      process.execPath,
      ['scripts/run-selected-competition.mjs', JSON.stringify(competition)],
      root,
      env,
      'logged',
    );
  for (const dir of nativeConsumers) {
    const pkg = packages.find((item) => item.dir === dir);
    const consumer = nativeToolConsumers.find((item) => item.dir === dir);
    assert(reviewedNativeTest(pkg, consumer) && pkg.scripts.smoke === consumer.smoke);
    execute('pnpm', ['--filter', pkg.name, 'test'], root, env, 'logged');
    execute('pnpm', ['--filter', pkg.name, 'smoke'], root, env, 'logged');
  }
  if (plan.developer_mode_ids.length) {
    // The shared touch/cancel and external-iframe cases always open Wulong City,
    // even when it is not one of the changed games selected for the mode matrix.
    const fixture = packages.find((pkg) => pkg.dir === 'games/local/wulong-city');
    assert(
      fixture?.name === '@coffeeeeffoc/wulong-city' && fixture.scripts?.build === 'node build.mjs',
      'Missing reviewed developer-mode browser fixture: wulong-city',
    );
    execute('pnpm', ['--filter', fixture.name, 'build'], root, env, 'logged');
    execute(
      process.execPath,
      ['scripts/test-game-dev-mode.mjs'],
      root,
      {
        ...env,
        DEV_MODE_GAME_IDS: plan.developer_mode_ids.join(','),
      },
      'logged',
    );
  }
}

export async function validateTree({
  root,
  base,
  head = 'HEAD',
  env = process.env,
  execute = run,
  deferIdenticalRulesToAggregate = false,
  incremental = false,
  prepareBrowser = () => {},
  selectScope: selectValidationScope = selectScope,
}) {
  const clean = { ...cleanGitEnv(env), PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false' };
  console.log(
    `Native platform publication gates: ${nativeReleaseGatesEnabled(clean) ? 'enabled' : 'deferred (Web validation remains required)'}`,
  );
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert(process.version === `v${manifest.volta.node}`, `Use Node ${manifest.volta.node}`);
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  assert(
    execute(pnpm, ['--version'], root, clean, true) === manifest.packageManager.split('@').at(-1),
    `Use ${manifest.packageManager}`,
  );
  const paths = base
    ? collectChangedPaths({ root, base, head })
    : execute('git', ['ls-tree', '-r', '--name-only', '-z', head], root, clean, true)
        .split('\0')
        .filter(Boolean);
  // Formatting has no browser/build dependencies and is checked even for docs.
  if (incremental) {
    const files = [];
    for (const file of paths)
      if ((await stat(path.join(root, file)).catch(() => null))?.isFile()) files.push(file);
    // pnpm exec crosses cmd.exe on Windows; keep every batch below its 8191-character limit.
    for (let offset = 0; offset < files.length; offset += 20)
      execute(
        pnpm,
        ['exec', 'prettier', '--check', '--ignore-unknown', ...files.slice(offset, offset + 20)],
        root,
        clean,
      );
  } else execute(pnpm, ['format:check'], root, clean);
  execute(pnpm, ['check:games'], root, clean);
  const sourcePaths = paths.filter((file) => !isDocumentation(file));
  if (!sourcePaths.length)
    return { browser: false, cocos: false, browser_ids: [], nine_native_targets: [] };
  const plan = await selectValidationScope(
    {
      ...clean,
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF_NAME: '',
      GITHUB_OUTPUT: undefined,
      PAGES_DIFF_BASE: base,
      PAGES_DIFF_HEAD: head,
      VALIDATION_RISK_PLAN: 'true',
    },
    root,
  );
  const packages = await workspacePackages(root);
  const catalog = incremental
    ? JSON.parse(
        await readFile(path.join(root, 'apps/shell-web/src/standalone-games.json'), 'utf8'),
      )
    : [];
  const fileScopes = incremental
    ? registrationFileScopes({
        changedPaths: sourcePaths,
        gameSources: packages.filter((pkg) => pkg.dir.startsWith('games/')).map((pkg) => pkg.dir),
        readBase: (file) => execute('git', ['show', `${base}:${file}`], root, clean, 'raw'),
        readHead: (file) => execute('git', ['show', `${head}:${file}`], root, clean, 'raw'),
      })
    : new Map();
  if (incremental) {
    const headQueries = [
      ...new Set([
        ...retirementHeadQueryPaths(sourcePaths),
        ...localRetirementHeadQueryPaths(sourcePaths),
      ]),
    ];
    const headPaths = new Set(
      execute(
        'git',
        ['--literal-pathspecs', 'ls-tree', '--name-only', '-z', head, '--', ...headQueries],
        root,
        clean,
        'raw',
      )
        .split('\0')
        .filter(Boolean),
    );
    const context = {
      changedPaths: sourcePaths,
      games: catalog,
      packages,
      readBase: (file) => execute('git', ['show', `${base}:${file}`], root, clean, 'raw'),
      readBaseEntry: (file) =>
        execute('git', ['--literal-pathspecs', 'ls-tree', base, '--', file], root, clean, 'raw'),
      readHead: (file) => execute('git', ['show', `${head}:${file}`], root, clean, 'raw'),
      readHeadEntry: (file) =>
        execute('git', ['--literal-pathspecs', 'ls-tree', head, '--', file], root, clean, 'raw'),
      headHasPath: (file) => {
        assert(headQueries.includes(file), 'Unqueried candidate path');
        return headPaths.has(file);
      },
    };
    for (const classify of [
      retirementFileScopes,
      entryAdapterFileScopes,
      h5AdapterFileScopes,
      developerModeFileScopes,
      nativeWorkspaceFileScopes,
      reviewedSharedFileScopes,
      nineNativeFileScopes,
      nineLockFileScopes,
      localRetirementFileScopes,
    ])
      for (const [file, sources] of classify(context)) fileScopes.set(file, sources);
  }
  const incrementalScope = incremental
    ? incrementalPlan({
        packages,
        games: catalog,
        fileScopes,
        changedPaths: sourcePaths,
        readSource: (file) => execute('git', ['show', `${head}:${file}`], root, clean, 'raw'),
      })
    : null;
  if (incrementalScope) console.log(`Incremental scope: ${JSON.stringify(incrementalScope)}`);
  if (
    incrementalScope?.browser ||
    incrementalScope?.admin_console_checks ||
    incrementalScope?.tap_services_checks ||
    incrementalScope?.submodule_dialog_ids?.length
  ) {
    prepareBrowser();
    for (const key of ['CHROMIUM_PATH', 'PLAYWRIGHT_EXECUTABLE_PATH'])
      if (env[key]) clean[key] = env[key];
  }
  if (incrementalScope?.pages_deploy)
    execute(
      process.platform === 'win32' ? 'python' : 'python3',
      ['scripts/test-pages-deploy.py'],
      root,
      clean,
      'logged',
    );
  if (incrementalScope?.validation_tools) {
    if (sourcePaths.some((file) => workspaceBoundaryScopePaths.includes(file)))
      execute(pnpm, ['test:boundaries'], root, clean, 'logged');
    execute(pnpm, ['test:validation'], root, clean, 'logged');
    execute(
      process.execPath,
      [
        '--test',
        'scripts/incremental-validation.test.mjs',
        'scripts/game-retirement-scope.test.mjs',
        'scripts/local-game-retirement-scope.test.mjs',
        'scripts/nine-native-scope.test.mjs',
        'scripts/nine-lock-scope.test.mjs',
        'scripts/publication-scopes.test.mjs',
        'scripts/vite-patch-scope.test.mjs',
        'scripts/prune-turbo-cache.test.mjs',
        'scripts/prune-actions-cache.test.mjs',
        'apps/shell-web/scripts/pages-validation.test.mjs',
      ],
      root,
      clean,
      'logged',
    );
    if (sourcePaths.some((file) => /^scripts\/pages-regression-(shards|timings)/.test(file)))
      execute(
        process.execPath,
        ['--test', 'scripts/pages-regression-shards.test.mjs'],
        root,
        clean,
        'logged',
      );
  }
  const full =
    !incremental &&
    (!base ||
      sourcePaths.some(
        (file) => !packages.some((pkg) => file === pkg.dir || file.startsWith(pkg.dir + '/')),
      ));
  const consumerPaths = [
    ...sourcePaths,
    ...(incrementalScope?.consumer_sources || []).map((dir) => dir + '/package.json'),
  ];
  const affected = affectedPackages(packages, consumerPaths, full);
  if (incrementalScope?.browser) {
    const shell = packages.find((pkg) => pkg.dir === 'apps/shell-web');
    if (shell && !affected.includes(shell)) affected.push(shell);
  }
  const direct = packages.filter(
    (pkg) =>
      full || consumerPaths.some((file) => file === pkg.dir || file.startsWith(pkg.dir + '/')),
  );
  for (const pkg of direct.filter((pkg) => pkg.dir.startsWith('games/'))) {
    const { command } = ruleTask(pkg);
    assert(command, `${pkg.name}: missing rules tests`);
    await assertNodeOnly(command, path.join(root, pkg.dir));
  }
  const aggregateTasks = new Map();
  if (deferIdenticalRulesToAggregate && aggregateRunsAllTests(manifest)) {
    const graph = JSON.parse(
      execute(pnpm, ['exec', 'turbo', 'run', 'test', '--dry=json'], root, clean, true),
    );
    assert(Array.isArray(graph.tasks), 'Cannot prove full aggregate test coverage');
    for (const task of graph.tasks)
      if (task.task === 'test' && typeof task.directory === 'string')
        aggregateTasks.set(task.package, task);
  }
  // Build the explicit targets and emitted prerequisites in workspace order.
  // Turbo's ^build expansion would also rebuild unchanged source-only game inputs.
  const browserGames = incrementalScope?.browser_ids || [];
  const browserDirect = packages.filter((pkg) =>
    catalog.some((game) => browserGames.includes(game.id) && game.source === pkg.dir),
  );
  // Shell's ordinary build intentionally prepares the whole deployment. Incremental
  // gates build its emitted prerequisites and selected game artifacts separately.
  const metadataOnly =
    plan.required &&
    plan.risk === 'metadata' &&
    !incrementalScope?.browser &&
    !incrementalScope?.admin_console_checks;
  const buildDirect = metadataOnly
    ? []
    : incremental
      ? [
          ...new Set([
            ...direct.filter(
              (pkg) =>
                pkg.dir !== 'apps/shell-web' &&
                (!pkg.dir.startsWith('games/') ||
                  sourcePaths.some(
                    (file) => !isNineNativeOnlyPath(file) && file.startsWith(pkg.dir + '/'),
                  )),
            ),
            ...browserDirect,
          ]),
        ]
      : direct;
  const buildTargets = staticBuildTargets(packages, buildDirect, affected).filter(
    (pkg) =>
      !(
        incrementalScope?.vite_patch &&
        !nativeReleaseGatesEnabled(clean) &&
        viteNativeSources.includes(pkg.dir)
      ),
  );
  const cocosInputs = cocosPreflightTargets({
    packages,
    buildTargets,
    affected: metadataOnly ? [] : affected,
    nativeTargets: incrementalScope?.nine_native_targets || [],
  });
  await verifyCocosBuildInputs(root, cocosInputs, clean);
  if (buildTargets.length)
    execute(
      pnpm,
      incremental
        ? [
            ...buildTargets.map((pkg) => `--filter=${pkg.name}`),
            '--recursive',
            '--sort',
            '--workspace-concurrency=1',
            'run',
            'build',
          ]
        : [
            'exec',
            'turbo',
            'run',
            'build',
            ...buildTargets.map((pkg) => `--filter=${pkg.name}`),
            '--concurrency=1',
          ],
      root,
      clean,
    );
  for (const pkg of shellContractTargets(packages, consumerPaths, full)) {
    execute(
      process.execPath,
      ['--test', 'apps/shell-web/scripts/standalone-game-entry.test.mjs'],
      root,
      clean,
      'logged',
    );
    execute(
      pnpm,
      ['--filter', pkg.name, 'exec', 'vitest', 'run', ...shellContractFiles],
      root,
      clean,
      'logged',
    );
  }
  if (metadataOnly) {
    execute(pnpm, ['check:dependencies'], root, clean);
    execute(pnpm, ['test:game-config'], root, clean);
    if (incrementalScope)
      runIncrementalToolChecks({ plan: incrementalScope, packages, root, env: clean, execute });
    return incrementalScope || plan;
  }
  for (const task of ['typecheck', 'lint']) {
    for (const pkg of affected.filter((pkg) => pkg.scripts?.[task])) {
      if (task === 'lint' && lintExcludedByRepository(pkg, manifest)) {
        console.log(
          `Lint scope: ${pkg.name} excluded by tracked repository lint policy; builds, types and rules remain required.`,
        );
        continue;
      }
      execute(pnpm, staticTaskArgs(pkg, task), root, clean, 'logged');
    }
  }
  // Prefer reviewed rules tasks, otherwise validate the existing test entry/import graph.
  // Unknown runner or dependencies block instead of masquerading as success.
  for (const pkg of direct) {
    if (pkg.coffeeeeffoc?.role !== 'game' && !pkg.dir.startsWith('games/')) continue;
    const { command, args } = ruleTask(pkg);
    assert(
      command,
      `${pkg.name}: missing reviewed test:rules task; add explicit pure rule test files`,
    );
    await assertNodeOnly(command, path.join(root, pkg.dir));
    if (deferIdenticalRulesToAggregate && rulesCoveredByAggregate(pkg, manifest, aggregateTasks)) {
      console.log(
        `${pkg.name}: identical rules command required in subsequent full aggregate test.`,
      );
      continue;
    }
    execute(pnpm, args, root, clean, 'logged');
  }
  execute(pnpm, ['check:dependencies'], root, clean);
  if (incrementalScope?.browser) {
    prepareBrowser();
    for (const key of ['CHROMIUM_PATH', 'PLAYWRIGHT_EXECUTABLE_PATH'])
      if (env[key]) clean[key] = env[key];
    execute(
      process.execPath,
      ['scripts/run-selected-shell.mjs', JSON.stringify(incrementalScope)],
      root,
      clean,
      'logged',
    );
  }
  if (incrementalScope)
    runNineNativeChecks({
      plan: incrementalScope,
      packages,
      root,
      env: clean,
      execute,
      prepareBrowser: () => {
        prepareBrowser();
        for (const key of ['CHROMIUM_PATH', 'PLAYWRIGHT_EXECUTABLE_PATH'])
          if (env[key]) clean[key] = env[key];
      },
    });
  if (incrementalScope)
    runIncrementalToolChecks({ plan: incrementalScope, packages, root, env: clean, execute });
  return incrementalScope || plan;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const value = (flag) => process.argv[process.argv.indexOf(flag) + 1];
  const root = value('--root') || process.cwd();
  const env = { ...process.env };
  validateTree({
    root,
    env,
    prepareBrowser: createBrowserPreparation({ root, env }),
    base: value('--base'),
    head: value('--head') || 'HEAD',
    incremental: process.argv.includes('--incremental'),
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
