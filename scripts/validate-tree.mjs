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
import {
  incrementalPlan,
  entryAdapterFileScopes,
  developerModeFileScopes,
  nativeWorkspaceFileScopes,
  nativeToolConsumers,
  h5AdapterFileScopes,
} from './incremental-validation.mjs';
import { verifyCocosBuildInputs } from './cocos-validation.mjs';
import { run, cleanGitEnv } from './validate-push.mjs';
import {
  workspacePackages,
  affectedPackages,
  staticBuildTargets,
  isDocumentation,
  shellContractTargets,
  shellContractFiles,
} from './validation-plan.mjs';
import { main as selectScope, collectChangedPaths } from './pages-test-scope.mjs';

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
    assert(
      !/globalSetup|browser\s*:|projects\s*:/.test(text),
      `Unreviewed test configuration: ${file}`,
    );
    assert(
      !/from\s*['"](?:@playwright|playwright|puppeteer)|\beval\s*\(/.test(text),
      `Unreviewed executable dependency: ${file}`,
    );
    for (const match of text.matchAll(
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
    for (const match of text.matchAll(
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

export function runIncrementalToolChecks({ plan, packages, root, env, execute = run }) {
  for (const dir of plan.native_consumers) {
    const pkg = packages.find((item) => item.dir === dir);
    const consumer = nativeToolConsumers.find((item) => item.dir === dir);
    assert(consumer && pkg?.scripts?.test === 'vitest run' && pkg.scripts.smoke === consumer.smoke);
    execute('pnpm', ['--filter', pkg.name, 'test'], root, env, 'logged');
    execute('pnpm', ['--filter', pkg.name, 'smoke'], root, env, 'logged');
  }
  if (plan.developer_mode_ids.length)
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

export async function validateTree({
  root,
  base,
  head = 'HEAD',
  env = process.env,
  execute = run,
  deferIdenticalRulesToAggregate = false,
  incremental = false,
}) {
  const clean = { ...cleanGitEnv(env), PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false' };
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
    if (files.length)
      execute(pnpm, ['exec', 'prettier', '--check', '--ignore-unknown', ...files], root, clean);
  } else execute(pnpm, ['format:check'], root, clean);
  execute(pnpm, ['check:games'], root, clean);
  const sourcePaths = paths.filter((file) => !isDocumentation(file));
  if (!sourcePaths.length) return;
  const plan = await selectScope(
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
        readBase: (file) => execute('git', ['show', `${base}:${file}`], root, clean, true),
        readHead: (file) => execute('git', ['show', `${head}:${file}`], root, clean, true),
      })
    : new Map();
  if (incremental) {
    const context = {
      changedPaths: sourcePaths,
      games: catalog,
      packages,
      readBase: (file) => execute('git', ['show', `${base}:${file}`], root, clean, true),
      readHead: (file) => execute('git', ['show', `${head}:${file}`], root, clean, true),
    };
    for (const classify of [
      entryAdapterFileScopes,
      h5AdapterFileScopes,
      developerModeFileScopes,
      nativeWorkspaceFileScopes,
    ])
      for (const [file, sources] of classify(context)) fileScopes.set(file, sources);
  }
  const incrementalScope = incremental
    ? incrementalPlan({
        packages,
        games: catalog,
        fileScopes,
        changedPaths: sourcePaths,
        readSource: (file) => execute('git', ['show', `${head}:${file}`], root, clean, true),
      })
    : null;
  if (incrementalScope) console.log(`Incremental scope: ${JSON.stringify(incrementalScope)}`);
  if (incrementalScope?.validation_tools) {
    execute(pnpm, ['test:validation'], root, clean, 'logged');
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
  // Build the changed package's dependency chain. Do not build every game merely because
  // Shell consumes this game; check consumers directly without Turbo's ^build expansion.
  const browserGames = incrementalScope?.browser_ids || [];
  const browserDirect = packages.filter((pkg) =>
    catalog.some((game) => browserGames.includes(game.id) && game.source === pkg.dir),
  );
  // Shell's ordinary build intentionally prepares the whole deployment. Incremental
  // gates build its emitted prerequisites and selected game artifacts separately.
  const metadataOnly = plan.required && plan.risk === 'metadata' && !incrementalScope?.browser;
  const buildDirect = metadataOnly
    ? []
    : incremental
      ? [...new Set([...direct.filter((pkg) => pkg.dir !== 'apps/shell-web'), ...browserDirect])]
      : direct;
  const buildTargets = staticBuildTargets(packages, buildDirect, affected);
  await verifyCocosBuildInputs(root, buildTargets, clean);
  if (buildTargets.length)
    execute(
      pnpm,
      [
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
    return;
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
  if (incrementalScope?.browser)
    execute(
      process.execPath,
      ['scripts/run-selected-shell.mjs', JSON.stringify(incrementalScope)],
      root,
      clean,
      'logged',
    );
  if (incrementalScope)
    runIncrementalToolChecks({ plan: incrementalScope, packages, root, env: clean, execute });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const value = (flag) => process.argv[process.argv.indexOf(flag) + 1];
  validateTree({
    root: value('--root') || process.cwd(),
    base: value('--base'),
    head: value('--head') || 'HEAD',
    incremental: process.argv.includes('--incremental'),
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
