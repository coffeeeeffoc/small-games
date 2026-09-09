import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const WORKSPACE_DIRECTORIES = ['apps', 'packages', 'services', 'tools', 'games'];
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];
const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'dist-pages',
  'dist-content',
  'coverage',
  '.turbo',
  '.git',
  '.next',
  '.vinext',
  '.wrangler',
  'vendor',
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
  if (normalizedRoot.includes('/services/') || name.endsWith('-service')) return 'service';
  if (name.includes('shell')) return 'shell';
  if (/\/(?:game-[^/]+|games\/[^/]+)$/.test(normalizedRoot) || name.includes('/game-'))
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
      for (const specifier of importSpecifiers(source)) {
        if (specifier.startsWith('.')) {
          const resolved = path.resolve(path.dirname(file), specifier);
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
