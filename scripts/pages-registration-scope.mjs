import { isDeepStrictEqual } from 'node:util';

const REGISTRY = 'apps/shell-web/src/standalone-games.json';
const META = 'apps/shell-web/src/game-meta.json';
const SHELL = 'apps/shell-web/package.json';
const LOCK = 'pnpm-lock.yaml';
const SOURCE = /^games\/(?:local|submodules)\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const keysAre = (value, keys) =>
  object(value) && Object.keys(value).every((key) => keys.includes(key));

function registry(text) {
  const games = JSON.parse(text);
  if (
    !Array.isArray(games) ||
    games.some(
      (game) =>
        !keysAre(game, ['id', 'source', 'title', 'description', 'output']) ||
        typeof game.id !== 'string' ||
        !ID.test(game.id) ||
        !SOURCE.test(game.source) ||
        !['title', 'description', 'output'].every((key) => typeof game[key] === 'string') ||
        !game.title ||
        !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(game.output) ||
        game.output.split('/').some((part) => part === '..' || part === '.'),
    ) ||
    new Set(games.map((game) => game.id)).size !== games.length ||
    new Set(games.map((game) => game.source)).size !== games.length
  ) {
    throw new Error('Unrecognized standalone registry');
  }
  return games;
}

function registrationChanges(before, after) {
  const current = new Map(after.map((game) => [game.id, game]));
  const old = new Map(before.map((game) => [game.id, game]));
  if (
    before.some((game) => current.get(game.id)?.source !== game.source) ||
    !isDeepStrictEqual(
      before.map((game) => game.id),
      after.filter((game) => old.has(game.id)).map((game) => game.id),
    )
  ) {
    throw new Error('Removed, renamed or reordered registration');
  }
  return after.filter((game) => !isDeepStrictEqual(game, old.get(game.id)));
}

function metadata(text, games, sources) {
  const data = JSON.parse(text);
  if (
    !keysAre(data, ['schemaVersion', 'games']) ||
    data.schemaVersion !== 1 ||
    !object(data.games)
  ) {
    throw new Error('Unrecognized game metadata');
  }
  for (const [id, entry] of Object.entries(data.games)) {
    if (
      !ID.test(id) ||
      !keysAre(entry, ['source', 'created', 'updated']) ||
      !sources.has(entry.source) ||
      (games.some((game) => game.id === id) &&
        games.find((game) => game.id === id).source !== entry.source)
    ) {
      throw new Error('Unrecognized metadata game');
    }
    for (const key of ['created', 'updated']) {
      const stamp = entry[key];
      if (
        !keysAre(stamp, ['commit', 'time']) ||
        typeof stamp.commit !== 'string' ||
        !/^[a-f\d]{40}$/i.test(stamp.commit) ||
        typeof stamp.time !== 'string' ||
        !Number.isFinite(Date.parse(stamp.time))
      ) {
        throw new Error('Invalid metadata history');
      }
    }
  }
  return data;
}

/** Only additional workspace:* links to newly registered packages are wiring. */
function shellAdditions(before, after, addedGames, readHead) {
  if (
    !object(before) ||
    !object(after) ||
    !object(before.dependencies) ||
    !object(after.dependencies)
  ) {
    throw new Error('Invalid Shell manifest');
  }
  const added = [];
  const remaining = { ...after, dependencies: { ...after.dependencies } };
  const names = new Set();
  for (const game of addedGames) {
    const pkg = JSON.parse(readHead(`${game.source}/package.json`));
    if (
      typeof pkg.name !== 'string' ||
      !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(pkg.name) ||
      names.has(pkg.name)
    ) {
      throw new Error('Invalid or duplicate game package name');
    }
    names.add(pkg.name);
    if (
      !Object.hasOwn(before.dependencies, pkg.name) &&
      after.dependencies[pkg.name] === 'workspace:*'
    ) {
      added.push({ ...game, name: pkg.name, pkg });
      delete remaining.dependencies[pkg.name];
    }
  }
  if (!isDeepStrictEqual(before, remaining))
    throw new Error('Shell dependencies or configuration changed');
  return added;
}

/**
 * Accept only pnpm's exact additive workspace wiring, not arbitrary YAML.
 * Strip the proven new links/empty importers from HEAD and require every other
 * byte (including all documents, resolutions, settings and snapshots) to match.
 * No dependency install is needed in the lightweight changes job. Unknown pnpm
 * formats deliberately retain full regression.
 */
function lockIsWiring(before, after, additions) {
  const normalize = (text) => text.replaceAll('\r\n', '\n');
  const base = normalize(before);
  let current = normalize(after);
  for (const game of additions) {
    const { pkg, name, source } = game;
    if (
      ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'].some(
        (key) => pkg[key] !== undefined && (!object(pkg[key]) || Object.keys(pkg[key]).length > 0),
      )
    )
      return false;
    const importer = `\n  ${source}: {}\n`;
    if (base.includes(importer) || current.split(importer).length !== 2) return false;
    current = current.replace(`${importer}\n`, '\n');
    const shellStart = current.indexOf('\n  apps/shell-web:\n');
    if (shellStart < 0 || current.indexOf('\n  apps/shell-web:\n', shellStart + 1) >= 0)
      return false;
    const rest = current.slice(shellStart + 1);
    const end = rest.slice(1).search(/\n(?:  \S|\S)/);
    if (end < 0) return false;
    const shellEnd = shellStart + 2 + end;
    const block = current.slice(shellStart, shellEnd);
    const dependency = `      ${name.startsWith('@') ? `'${name}'` : name}:\n        specifier: workspace:*\n        version: link:../../${source}\n`;
    const depsStart = block.indexOf('\n    dependencies:\n');
    const nextSection = block.slice(depsStart + '\n    dependencies:\n'.length).search(/^    \S/m);
    const depsEnd = nextSection < 0 ? -1 : depsStart + '\n    dependencies:\n'.length + nextSection;
    const offset = block.indexOf(dependency);
    if (
      depsStart < 0 ||
      offset < depsStart ||
      (depsEnd >= 0 && offset > depsEnd) ||
      block.split(dependency).length !== 2
    )
      return false;
    current =
      current.slice(0, shellStart) + block.replace(dependency, '') + current.slice(shellEnd);
  }
  return current === base;
}

/** A missing entry means full coverage; an empty selection still requires host validation. */
export function registrationFileScopes({ changedPaths, readBase, readHead, gameSources }) {
  const scopes = new Map();
  if (!changedPaths.some((file) => [REGISTRY, META, SHELL, LOCK].includes(file))) return scopes;
  try {
    const before = registry(readBase(REGISTRY));
    const after = registry(readHead(REGISTRY));
    const changed = registrationChanges(before, after);
    const sources = new Set(gameSources);
    if (after.some((game) => !sources.has(game.source))) return scopes;
    if (changedPaths.includes(REGISTRY))
      scopes.set(
        REGISTRY,
        changed.map((game) => game.source),
      );
    if (changedPaths.includes(META)) {
      try {
        const oldMeta = metadata(readBase(META), before, sources);
        const newMeta = metadata(readHead(META), after, sources);
        if (
          Object.entries(oldMeta.games).every(
            ([id, game]) => newMeta.games[id]?.source === game.source,
          ) &&
          Object.entries(newMeta.games).every(
            ([id, game]) =>
              Object.hasOwn(oldMeta.games, id) ||
              after.some((entry) => entry.id === id && entry.source === game.source),
          )
        ) {
          scopes.set(META, []);
        }
      } catch {
        /* Unknown metadata keeps full regression. */
      }
    }
    if (changedPaths.includes(SHELL) || changedPaths.includes(LOCK)) {
      try {
        const addedGames = after.filter((game) => !before.some((old) => old.id === game.id));
        const additions = shellAdditions(
          JSON.parse(readBase(SHELL)),
          JSON.parse(readHead(SHELL)),
          addedGames,
          readHead,
        );
        const lockMatches = lockIsWiring(readBase(LOCK), readHead(LOCK), additions);
        if (additions.length > 0 && !lockMatches) {
          throw new Error('Registration links do not match the lockfile');
        }
        if (changedPaths.includes(SHELL))
          scopes.set(
            SHELL,
            additions.map((game) => game.source),
          );
        if (changedPaths.includes(LOCK) && lockMatches) {
          scopes.set(
            LOCK,
            additions.map((game) => game.source),
          );
        }
      } catch {
        /* Real dependency changes or unfamiliar wiring keep full regression. */
      }
    }
  } catch {
    /* Invalid snapshots, identity changes and missing baselines fail closed. */
  }
  return scopes;
}
