import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const WORKSPACE_DIRECTORIES = [
  'apps',
  'packages',
  'platforms',
  'services',
  'tools',
  'games/local',
  'games/submodules',
];
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];
// Standalone games retain their own packaging. These exact edges reuse their pure
// rules on the authoritative server, or exercise those rules from repository tests.
// Runtime game code must still never import service implementations.
const REPOSITORY_IMPORTS = new Set([
  'games/local/homebound-station/scripts/build.mjs -> games/local/carding-car/scripts/cocos-branding.mjs',
  'games/local/homebound-station/scripts/build.mjs -> games/local/carding-car/scripts/toolchain.mjs',
  'games/local/homebound-station/scripts/typecheck.mjs -> games/local/carding-car/scripts/toolchain.mjs',
  'games/local/homebound-station/scripts/build.mjs -> scripts/h5-ad-config.mjs',
  'games/local/merge-front/scripts/build-native.mjs -> games/local/carding-car/scripts/toolchain.mjs',
  'games/local/merge-front/scripts/build-native.mjs -> games/local/carding-car/scripts/native-targets.mjs',
  'games/local/merge-front/scripts/build-native.mjs -> games/local/carding-car/scripts/clear-output.mjs',
  'games/local/merge-front/scripts/build.mjs -> games/local/carding-car/scripts/toolchain.mjs',
  'games/local/merge-front/scripts/typecheck.mjs -> games/local/carding-car/scripts/toolchain.mjs',
  'games/local/cops-robbers-realtime/src/taptap-h5-ads.js -> platforms/h5/platform-ads.js',
  'games/local/night-overwatch/scripts/build.mjs -> games/local/carding-car/scripts/cocos-branding.mjs',
  'games/local/night-overwatch/scripts/build-native.mjs -> games/local/carding-car/scripts/cocos-branding.mjs',
  // H5 integration tests exercise the real three-game saves, rules and build inputs.
  'platforms/taptap/tests/tap-services.browser.mjs -> scripts/competition-h5-service.mjs',
  'platforms/taptap/tests/tap-services.browser.mjs -> scripts/taptap-services-config.mjs',
  'platforms/taptap/tests/tap-multiplayer.browser.mjs -> scripts/competition-h5-service.mjs',
  'platforms/taptap/tests/tap-multiplayer.browser.mjs -> scripts/taptap-services-config.mjs',
  'platforms/taptap/tests/tap-services.test.mjs -> games/local/cops-robbers/src/tap-save.js',
  'platforms/taptap/tests/tap-services.test.mjs -> games/local/cops-robbers-realtime/src/tap-save.js',
  'platforms/taptap/tests/tap-services.test.mjs -> games/submodules/xiangqi-five/game.js',
  'platforms/taptap/tests/tap-services.test.mjs -> games/submodules/xiangqi-five/local-game.js',
  'platforms/taptap/tests/tap-services.test.mjs -> games/submodules/xiangqi-five/tap-save.js',
  'platforms/taptap/tests/tap-multiplayer.test.mjs -> games/local/cops-robbers/src/tap-multiplayer.js',
  'platforms/taptap/tests/tap-multiplayer.test.mjs -> games/local/cops-robbers-realtime/src/tap-multiplayer.js',
  'platforms/taptap/tests/tap-multiplayer.test.mjs -> games/submodules/xiangqi-five/tap-multiplayer.js',
  // These standalone H5 entries are bundled by Vite; rules/native entries stay host-only.
  'games/local/game-moss-garden/src/web.ts -> platforms/h5/publishing.js',
  'games/local/fold-the-world/src/main.ts -> platforms/h5/publishing.js',
  'games/local/homebound-station/src/main.ts -> platforms/h5/publishing.js',
  'games/local/orbit-atelier/src/main.ts -> platforms/h5/publishing.js',
  // The share-handler contract uses the real public adapter; other game tests gain no edge.
  'games/local/wulong-city/tests/game.test.mjs -> platforms/h5/publishing.js',
  // These two identity fixtures reuse the actual client/session lifecycle only in tests.
  'apps/shell-minigame/scripts/taptap-login.test.mjs -> platforms/competition/client.js',
  'games/local/three-choose-two/tests/online.browser.mjs -> services/runtime-api/dist/competition/identity-store.js',
  // Build tooling and browser acceptance helpers, never game runtime dependencies.
  'apps/admin-web/vite.config.ts -> scripts/admin-csp.mjs',
  'apps/admin-web/tests/browser.mjs -> scripts/admin-caddy-fixture.mjs',
  'apps/shell-minigame/scripts/nine-games-build.mjs -> scripts/competition-service-config.mjs',
  'apps/shell-minigame/scripts/nine-games-targets.mjs -> scripts/competition-service-config.mjs',
  'apps/shell-minigame/scripts/taptap-build.mjs -> scripts/competition-service-config.mjs',
  'apps/shell-minigame/scripts/taptap-login.mjs -> scripts/competition-service-config.mjs',
  'apps/shell-minigame/scripts/taptap-targets.mjs -> scripts/competition-service-config.mjs',
  'apps/shell-minigame/scripts/taptap-targets.mjs -> platforms/publication-config.mjs',
  'games/local/cops-robbers/scripts/build.mjs -> scripts/competition-h5-service.mjs',
  'games/local/cops-robbers/scripts/serve.mjs -> scripts/competition-h5-service.mjs',
  'games/local/cops-robbers-realtime/scripts/build.mjs -> scripts/competition-h5-service.mjs',
  'games/local/cops-robbers-realtime/scripts/serve.mjs -> scripts/competition-h5-service.mjs',
  'games/local/cops-robbers/scripts/ad-config.mjs -> scripts/h5-ad-config.mjs',
  'games/local/cops-robbers-realtime/scripts/build.mjs -> scripts/h5-ad-config.mjs',
  'games/local/cops-robbers-realtime/tests/security-release.test.mjs -> scripts/build-games.mjs',
  'games/local/cops-robbers-realtime/tests/security-release.test.mjs -> scripts/h5-ad-config.mjs',
  'games/local/cops-robbers/scripts/check-ad-core.mjs -> platforms/h5/platform-ads.js',
  'games/local/tianxia-chalu/scripts/build.mjs -> games/local/carding-car/scripts/toolchain.mjs',
  'games/local/tianxia-chalu/scripts/build.mjs -> games/local/carding-car/scripts/cocos-branding.mjs',
  'games/local/tianxia-chalu/scripts/typecheck.mjs -> games/local/carding-car/scripts/toolchain.mjs',
  'games/local/tianxia-chalu/scripts/typecheck.mjs -> games/local/carding-car/package.json',
  'games/local/tianxia-chalu/scripts/artifact.mjs -> games/local/carding-car/scripts/toolchain.mjs',
  'games/local/tianxia-chalu/scripts/artifact.mjs -> games/local/carding-car/scripts/native-targets.mjs',
  'games/local/tianxia-chalu/scripts/artifact.mjs -> games/local/carding-car/scripts/clear-output.mjs',
  'games/local/tianxia-chalu/scripts/artifact.mjs -> games/local/carding-car/scripts/cocos-branding.mjs',
  'games/local/tianxia-chalu/tests/rewards.test.mjs -> platforms/h5/publishing.js',
  'services/tianxia-server/tests/browser.mjs -> games/local/tianxia-chalu/scripts/artifact.mjs',
  'games/local/night-overwatch/scripts/build.mjs -> games/local/carding-car/scripts/toolchain.mjs',
  'games/local/night-overwatch/scripts/build-native.mjs -> games/local/carding-car/scripts/toolchain.mjs',
  'games/local/night-overwatch/scripts/build-native.mjs -> games/local/carding-car/scripts/native-targets.mjs',
  'games/local/night-overwatch/scripts/build-native.mjs -> games/local/carding-car/scripts/clear-output.mjs',
  'games/local/night-overwatch/scripts/typecheck.mjs -> games/local/carding-car/scripts/toolchain.mjs',
  'games/local/orbit-atelier/scripts/build.mjs -> games/local/carding-car/scripts/toolchain.mjs',
  'games/local/orbit-atelier/scripts/typecheck.mjs -> games/local/carding-car/scripts/toolchain.mjs',
  'games/local/night-overwatch/tests/h5.mjs -> apps/shell-web/scripts/standalone-game-checks.mjs',
  'games/local/night-overwatch/tests/smoke.mjs -> apps/shell-web/scripts/standalone-game-checks.mjs',
  'apps/shell-web/scripts/prepare-standalone-games.mjs -> scripts/competition-build.mjs',
  // TapTap artifact acceptance reuses the existing pure native SDK/actions and
  // vocabulary fixtures; no runtime or other Shell script gains these edges.
  'apps/shell-minigame/scripts/taptap-smoke.mjs -> games/local/letters-words2/tests/native-sdk-fixture.mjs',
  'apps/shell-minigame/scripts/taptap-smoke.mjs -> games/local/letters-words2/tests/native-test-actions.mjs',
  'apps/shell-minigame/scripts/taptap-smoke.mjs -> games/local/letters-words2/library.js',
  'services/kart-server/tests/server.test.ts -> games/local/carding-car/assets/scripts/KartAI.ts',
  'services/runtime-api/rules/ranked-games.mjs -> games/local/cage-rescue/src/core.mjs',
  'services/runtime-api/rules/ranked-games.mjs -> games/local/tower-brake/engine.mjs',
  'services/runtime-api/rules/ranked-games.mjs -> games/local/tower-brake/levels.mjs',
  'services/runtime-api/rules/carrom.mjs -> games/local/carrom-club/src/core.mjs',
  'services/runtime-api/rules/chess.mjs -> games/submodules/xiangqi-five/game.js',
  'services/runtime-api/rules/flick.mjs -> games/local/flick-arena/src/core.mjs',
  'services/runtime-api/rules/flick.mjs -> games/local/flick-arena/src/tournament.mjs',
  'services/runtime-api/rules/cops.mjs -> games/local/cops-robbers/src/duel-levels.js',
  'services/runtime-api/rules/cops.mjs -> games/local/cops-robbers/src/duel.js',
  'services/runtime-api/rules/history.mjs -> games/local/vibeJam-myself-history-guess/src/game.js',
  'services/runtime-api/rules/letters.mjs -> games/local/letters-words2/engine.js',
  'services/runtime-api/rules/realtime.mjs -> games/local/cops-robbers-realtime/src/engine.js',
  'services/runtime-api/rules/realtime.mjs -> games/local/cops-robbers-realtime/src/levels.js',
  'services/runtime-api/rules/street-runs.mjs -> games/local/cops-robbers-realtime/src/engine.js',
  'services/runtime-api/rules/street-runs.mjs -> games/local/cops-robbers-realtime/src/levels.js',
  'games/local/cops-robbers-realtime/tests/records.test.mjs -> services/runtime-api/rules/street-runs.mjs',
  'games/local/cops-robbers-realtime/scripts/competition-playtest.mjs -> services/runtime-api/rules/realtime.mjs',
  'games/local/cops-robbers-realtime/tests/competition.test.mjs -> services/runtime-api/rules/realtime.mjs',
  'games/local/cops-robbers/scripts/check-competition-renderer.mjs -> services/runtime-api/rules/cops.mjs',
  'games/local/cops-robbers/scripts/check-ranking.mjs -> services/runtime-api/rules/cops.mjs',
  'games/local/cops-robbers/scripts/check-viewport-layout.mjs -> services/runtime-api/rules/cops.mjs',
  'games/local/letters-words2/tests/competition.test.mjs -> services/runtime-api/rules/letters.mjs',
  'games/local/vibeJam-myself-history-guess/scripts/competition-playtest.mjs -> services/runtime-api/rules/history.mjs',
  'games/local/vibeJam-myself-history-guess/tests/competition.test.mjs -> services/runtime-api/rules/history.mjs',
  'games/submodules/xiangqi-five/competition.test.mjs -> services/runtime-api/rules/chess.mjs',
]);
const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'dist-pages',
  'dist-content',
  'coverage',
  '.turbo',
  '.prebuilt',
  '.git',
  '.next',
  '.vinext',
  '.wrangler',
  'vendor',
  'build',
  'library',
  'temp',
  'reports',
  'test-results',
  'biligame-builder',
]);

async function pathExists(target) {
  try {
    await readFile(target);
    return true;
  } catch {
    return false;
  }
}

async function discoverPackages(root) {
  const packages = [];

  for (const directory of WORKSPACE_DIRECTORIES) {
    const parent = path.join(root, directory);
    let entries = [];
    try {
      entries = await readdir(parent, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const packageRoot = path.join(parent, entry.name);
      const manifestPath = path.join(packageRoot, 'package.json');
      if (!(await pathExists(manifestPath))) continue;
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      if (!manifest.name) continue;
      packages.push({ manifest, root: packageRoot });
    }
  }

  return packages.sort((left, right) => left.manifest.name.localeCompare(right.manifest.name));
}

async function discoverSourceFiles(root) {
  const files = [];
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORED_DIRECTORIES.has(entry.name)) continue;
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await discoverSourceFiles(target)));
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(target);
  }

  return files;
}

function dependencyNames(manifest) {
  return new Set(DEPENDENCY_FIELDS.flatMap((field) => Object.keys(manifest[field] ?? {})).sort());
}

function packageNameFromSpecifier(specifier) {
  if (!specifier.startsWith('@')) return specifier.split('/')[0];
  return specifier.split('/').slice(0, 2).join('/');
}

function exportedSubpaths(exportsField) {
  if (typeof exportsField === 'string' || Array.isArray(exportsField)) return new Set(['.']);
  if (!exportsField || typeof exportsField !== 'object') return new Set();
  return new Set(Object.keys(exportsField).filter((key) => key.startsWith('.')));
}

function inferRole(workspacePackage) {
  const configuredRole = workspacePackage.manifest.coffeeeeffoc?.role;
  if (configuredRole) return configuredRole;
  const normalizedRoot = workspacePackage.root.replaceAll('\\', '/');
  const name = workspacePackage.manifest.name;
  if (normalizedRoot.includes('/platforms/')) return 'shell';
  if (normalizedRoot.includes('/services/') || name.endsWith('-service')) return 'service';
  if (name.includes('shell')) return 'shell';
  if (/\/games\/(?:local|submodules)\/[^/]+$/.test(normalizedRoot) || name.includes('/game-'))
    return 'game';
  return 'shared';
}

function importSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return [...specifiers];
}

// Tianxia hashes shared build inputs via URL as well as importing them. Resolve
// only literals and its finite for-of lists; unknown hash inputs stay rejected.
function tianxiaResourceSpecifiers(source, typescript, artifact) {
  const { parsers } = createRequire(import.meta.url)('prettier/plugins/babel');
  const program = parsers[typescript ? 'babel-ts' : 'babel'].parse(source, {}).program;
  const result = [];
  const values = (node, bindings) => {
    if (node?.type === 'StringLiteral') return [node.value];
    if (node?.type === 'Identifier') return bindings[node.name] ?? [];
    if (node?.type === 'BinaryExpression' && node.operator === '+')
      return values(node.left, bindings).flatMap((a) =>
        values(node.right, bindings).map((b) => a + b),
      );
    return [];
  };
  function visit(node, bindings = {}) {
    if (!node || typeof node !== 'object') return;
    if (
      node.type === 'ForOfStatement' &&
      node.left.type === 'VariableDeclaration' &&
      node.left.kind === 'const' &&
      node.left.declarations.length === 1 &&
      node.left.declarations[0].id.type === 'Identifier' &&
      node.right.type === 'ArrayExpression' &&
      node.right.elements.every((item) => item?.type === 'StringLiteral')
    ) {
      visit(node.body, {
        ...bindings,
        [node.left.declarations[0].id.name]: node.right.elements.map((item) => item.value),
      });
      return;
    }
    if (
      node.type === 'NewExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === 'URL' &&
      node.arguments[1]?.type === 'MemberExpression' &&
      node.arguments[1].object.type === 'MetaProperty' &&
      node.arguments[1].property.name === 'url'
    ) {
      const paths = values(node.arguments[0], bindings);
      // Fail closed without granting a directory-wide exception to dynamic URLs.
      result.push(...(paths.length ? paths : artifact ? [null] : []));
    }
    for (const child of Object.values(node))
      if (Array.isArray(child)) child.forEach((item) => visit(item, bindings));
      else if (child && typeof child === 'object') visit(child, bindings);
  }
  visit(program);
  return result;
}

function findCycles(packagesByName) {
  const state = new Map();
  const stack = [];
  const cycles = [];

  function visit(name) {
    state.set(name, 'visiting');
    stack.push(name);
    const current = packagesByName.get(name);

    for (const dependency of dependencyNames(current.manifest)) {
      if (!packagesByName.has(dependency)) continue;
      if (state.get(dependency) === 'visiting') {
        const start = stack.indexOf(dependency);
        cycles.push([...stack.slice(start), dependency]);
      } else if (!state.has(dependency)) {
        visit(dependency);
      }
    }

    stack.pop();
    state.set(name, 'visited');
  }

  for (const name of packagesByName.keys()) {
    if (!state.has(name)) visit(name);
  }
  return cycles;
}

export async function validateWorkspace(root = process.cwd()) {
  const packages = await discoverPackages(root);
  const packagesByName = new Map(
    packages.map((workspacePackage) => [workspacePackage.manifest.name, workspacePackage]),
  );
  const violations = [];

  for (const workspacePackage of packages) {
    const packageRole = inferRole(workspacePackage);
    if (packageRole === 'game') {
      for (const dependency of dependencyNames(workspacePackage.manifest)) {
        const target = packagesByName.get(dependency);
        if (!target || !['service', 'shell'].includes(inferRole(target))) continue;
        violations.push({
          code: 'game-layer',
          message: `${workspacePackage.manifest.name} cannot depend on ${dependency} (${inferRole(target)})`,
        });
      }
    }

    for (const file of await discoverSourceFiles(workspacePackage.root)) {
      const source = await readFile(file, 'utf8');
      const resources =
        path.relative(root, workspacePackage.root).replaceAll('\\', '/') ===
        'games/local/tianxia-chalu'
          ? tianxiaResourceSpecifiers(
              source,
              /\.[cm]?tsx?$/.test(file),
              path.relative(workspacePackage.root, file).replaceAll('\\', '/') ===
                'scripts/artifact.mjs',
            )
          : [];
      for (const specifier of [...importSpecifiers(source), ...resources]) {
        if (specifier === null) {
          violations.push({
            code: 'cross-package-relative',
            message: `${path.relative(root, file)} has an unresolved module-relative resource URL`,
          });
          continue;
        }
        if (specifier.startsWith('.')) {
          const resolved = path.resolve(path.dirname(file), specifier);
          const edge = [file, resolved]
            .map((entry) => path.relative(root, entry).replaceAll('\\', '/'))
            .join(' -> ');
          if (REPOSITORY_IMPORTS.has(edge)) continue;
          const relative = path.relative(workspacePackage.root, resolved);
          if (relative.startsWith('..') || path.isAbsolute(relative)) {
            violations.push({
              code: 'cross-package-relative',
              message: `${path.relative(root, file)} imports outside its package: ${specifier}`,
            });
          }
          continue;
        }

        const dependencyName = packageNameFromSpecifier(specifier);
        const target = packagesByName.get(dependencyName);
        if (!target) continue;
        if (packageRole === 'game' && ['service', 'shell'].includes(inferRole(target))) {
          violations.push({
            code: 'game-layer',
            message: `${path.relative(root, file)} cannot import ${dependencyName} (${inferRole(target)})`,
          });
        }
        const requestedSubpath = `.${specifier.slice(dependencyName.length)}`;
        if (requestedSubpath.split('/').some((part) => part === 'src' || part === 'internal')) {
          violations.push({
            code: 'internal-import',
            message: `${path.relative(root, file)} imports an internal workspace path: ${specifier}`,
          });
          continue;
        }
        if (!exportedSubpaths(target.manifest.exports).has(requestedSubpath)) {
          violations.push({
            code: 'private-export',
            message: `${path.relative(root, file)} imports non-exported path: ${specifier}`,
          });
        }
      }
    }
  }

  for (const cycle of findCycles(packagesByName)) {
    violations.push({
      code: 'dependency-cycle',
      message: `Workspace dependency cycle: ${cycle.join(' -> ')}`,
    });
  }

  return violations.sort((left, right) =>
    `${left.code}:${left.message}`.localeCompare(`${right.code}:${right.message}`),
  );
}

async function main() {
  const violations = await validateWorkspace();
  if (violations.length === 0) {
    console.log('Workspace dependency boundaries and cycle checks passed.');
    return;
  }

  for (const violation of violations) console.error(`[${violation.code}] ${violation.message}`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
