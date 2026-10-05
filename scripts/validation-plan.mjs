import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export const isDocumentation = (file) =>
  /(?:^|\/)(?:docs|reports)(?:\/|$)/.test(file) || /\.(?:md|rst)$/i.test(file);

// Only independently testable rules modules get the cheaper tier. Ambiguous JS is full risk.
const RULE_FILE = /(?:^|\/)(?:rules?|core|engine|balance|levels?)(?:\/|\.(?:[cm]?[jt]s)$)/;
const UI_FILE =
  /\.(?:css|scss|html|tsx|jsx)$|(?:^|\/)(?:ui|input|navigation|layout|render)(?:\/|\.)/;
export function riskPlan({ changedPaths, scope, readSource = () => '', diffAvailable = true }) {
  const sources = scope.game_sources;
  const full = (reason) => ({
    ...scope,
    full: true,
    browser_ids: scope.game_ids,
    risk: 'full',
    reason,
  });
  if (scope.full || !diffAvailable) return full('full scope or unavailable comparison');
  const visited = new Set();
  const pureModule = (file) => {
    if (visited.has(file)) return true;
    visited.add(file);
    const text = readSource(file);
    if (/\b(?:document|window|HTMLElement|fetch|eval)\b|import\s*\(|require\s*\(/.test(text))
      return false;
    for (const match of text.matchAll(
      /(?:import|export)\s+(?:[^;"']*?from\s*)?["']([^"']+)["']/g,
    )) {
      if (match[1].startsWith('node:')) continue;
      if (!match[1].startsWith('.')) return false;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
      let resolved;
      for (const candidate of [
        target,
        target + '.ts',
        target + '.js',
        target + '.mjs',
        target + '/index.ts',
      ]) {
        try {
          readSource(candidate);
          resolved = candidate;
          break;
        } catch {
          /* Try a literal module extension. */
        }
      }
      if (!resolved || !pureModule(resolved)) return false;
    }
    return true;
  };
  let rules = false;
  let interaction = false;
  for (const file of changedPaths) {
    if (isDocumentation(file)) continue;
    const source = file.match(/^(games\/(?:local|submodules)\/[^/]+)\//)?.[1];
    if (!source) continue; // Existing scope handles shared paths and semantic registry diffs.
    if (!sources.includes(source)) return full('unmapped game change');
    if (/\/(?:game\.meta\.json|package\.json)$/.test(file)) {
      if (/game\.meta\.json$/.test(file)) continue;
      return full('package or task graph changed');
    }
    if (UI_FILE.test(file)) interaction = true;
    else if (RULE_FILE.test(file)) {
      try {
        if (!pureModule(file)) return full('rules import an unknown or runtime dependency');
      } catch {
        return full('rules dependency unavailable');
      }
      rules = true;
    } else return full(`unclassified source: ${file}`);
  }
  if (rules && interaction) return full('mixed rules and interaction');
  return {
    ...scope,
    browser_ids: interaction || (!rules && scope.game_ids.length) ? scope.game_ids : [],
    risk: interaction ? 'interaction' : rules ? 'rules' : 'metadata',
    reason: 'deterministic path and source checks',
  };
}

export async function workspacePackages(root) {
  const packages = [];
  for (const group of [
    'apps',
    'packages',
    'services',
    'tools',
    'platforms',
    'games/local',
    'games/submodules',
  ]) {
    for (const entry of await readdir(path.join(root, group), { withFileTypes: true }).catch(
      () => [],
    )) {
      if (!entry.isDirectory()) continue;
      const dir = `${group}/${entry.name}`;
      try {
        packages.push({
          dir,
          ...JSON.parse(await readFile(path.join(root, dir, 'package.json'), 'utf8')),
        });
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  return packages;
}

export function affectedPackages(packages, changedPaths, full = false) {
  const selected = new Set(
    packages
      .filter(
        (pkg) =>
          full || changedPaths.some((file) => file === pkg.dir || file.startsWith(pkg.dir + '/')),
      )
      .map((pkg) => pkg.name),
  );
  // Include dependents for checking; Turbo builds prerequisite outputs for changed targets.
  let changed;
  do {
    changed = false;
    for (const pkg of packages) {
      const deps = Object.keys({
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.optionalDependencies,
        ...pkg.peerDependencies,
      });
      if (deps.some((dep) => selected.has(dep)) && !selected.has(pkg.name)) {
        selected.add(pkg.name);
        changed = true;
      }
    }
  } while (changed);
  return packages.filter((pkg) => selected.has(pkg.name));
}

export function requiresCocos(packages, changedPaths, plan) {
  if (plan.full) return true;
  if (!changedPaths.some((file) => !isDocumentation(file))) return false;
  if (plan.required && plan.risk === 'metadata') return false;
  const selected = new Set(
    packages
      .filter((pkg) =>
        changedPaths.some((file) => file === pkg.dir || file.startsWith(pkg.dir + '/')),
      )
      .map((pkg) => pkg.name),
  );
  let expanded;
  do {
    expanded = false;
    for (const pkg of packages.filter((item) => selected.has(item.name)))
      for (const name of Object.keys({
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.optionalDependencies,
        ...pkg.peerDependencies,
      }))
        if (packages.some((item) => item.name === name) && !selected.has(name)) {
          selected.add(name);
          expanded = true;
        }
  } while (expanded);
  const direct = packages.filter((pkg) =>
    changedPaths.some((file) => file === pkg.dir || file.startsWith(pkg.dir + '/')),
  );
  const affected = affectedPackages(packages, changedPaths);
  return (
    staticBuildTargets(packages, direct, affected).some((pkg) => pkg.creator) ||
    packages.some((pkg) => selected.has(pkg.name) && pkg.creator)
  );
}

/** Build changed targets plus emitted workspace inputs needed by dependent static checks.
 * Source-exporting unrelated games do not need a web/Creator build merely for typechecking Shell.
 */
export function staticBuildTargets(packages, direct, affected) {
  const selected = new Set(affected.map((pkg) => pkg.name));
  let expanded;
  do {
    expanded = false;
    for (const pkg of packages.filter((item) => selected.has(item.name)))
      for (const name of Object.keys({
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.optionalDependencies,
        ...pkg.peerDependencies,
      }))
        if (packages.some((item) => item.name === name) && !selected.has(name)) {
          selected.add(name);
          expanded = true;
        }
  } while (expanded);
  const emittedExport = (value) =>
    typeof value === 'string'
      ? /^\.\/(?:dist|lib|build)(?:-|\/)/.test(value)
      : value && typeof value === 'object' && Object.values(value).some(emittedExport);
  return packages.filter(
    (pkg) =>
      pkg.scripts?.build &&
      (direct.includes(pkg) || (selected.has(pkg.name) && emittedExport(pkg.exports))),
  );
}
