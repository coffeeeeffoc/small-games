import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';

const REGISTRY = 'apps/shell-web/src/standalone-games.json';
const META = 'apps/shell-web/src/game-meta.json';
const SHELL = 'apps/shell-web/package.json';
const LOCK = 'pnpm-lock.yaml';
const NATIVE_SHELL = 'apps/shell-minigame/package.json';
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

const dependencyTuple = () =>
  /^      ('(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+'|[a-z0-9._-]+):\n        specifier: ([^\n]+)\n        version: ([^\n]+)\n/gm;

/** Reuse an identical existing importer tuple, including its peer resolution. */
function existingDependencyTuples(base) {
  const tuples = new Set();
  for (const importer of base.matchAll(/^importers:\n((?:[ \t][^\n]*\n|\n)*)/gm)) {
    for (const section of importer[1].matchAll(
      /^    (?:dependencies|devDependencies|optionalDependencies):\n((?: {6,}[^\n]*\n)*)/gm,
    )) {
      for (const tuple of section[1].matchAll(dependencyTuple())) tuples.add(tuple[0]);
    }
  }
  return tuples;
}

function importerBlock(lock, source) {
  const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const header = new RegExp(`\\n  ${escaped}:[^\\n]*\\n`, 'g');
  if ([...lock.matchAll(header)].length !== 1) return null;
  // Only real importer sections may supply a block; similarly indented package
  // or snapshot data must never authorize a workspace dependency.
  for (const section of lock.matchAll(/^importers:\n((?:[ \t][^\n]*\n|\n)*)/gm)) {
    const block = section[0].match(new RegExp(`\\n  ${escaped}:[^\\n]*\\n(?:[^\\n]+\\n)*\\n`));
    if (block) return block[0];
  }
  return null;
}

function workspaceTarget(source, name, version, readHead, headLock) {
  if (!version.startsWith('link:')) return null;
  const relative = version.slice(5);
  const target = path.posix.normalize(path.posix.join(source, relative));
  if (
    !/^(?:(?:packages|platforms)\/[A-Za-z0-9][A-Za-z0-9._-]*|games\/(?:local|submodules)\/[A-Za-z0-9][A-Za-z0-9._-]*)$/.test(
      target,
    ) ||
    relative !== path.posix.relative(source, target) ||
    !importerBlock(headLock, target) ||
    JSON.parse(readHead(`${target}/package.json`)).name !== name
  )
    return null;
  return target;
}

function newImporterIsWiring(importer, pkg, source, context, service = false) {
  const { existingTuples, readHead, base, head, newSources } = context;
  for (const key of ['optionalDependencies', 'peerDependencies'])
    if (pkg[key] !== undefined && (!object(pkg[key]) || Object.keys(pkg[key]).length)) return false;
  const declarations = new Map();
  for (const section of ['dependencies', 'devDependencies']) {
    if (pkg[section] !== undefined && !object(pkg[section])) return false;
    const entries = Object.entries(pkg[section] || {});
    if (entries.length) declarations.set(section, new Map(entries));
  }
  if (!declarations.size) return !service && importer === `\n  ${source}: {}\n\n`;
  const prefix = `\n  ${source}:\n`;
  if (!importer.startsWith(prefix) || !importer.endsWith('\n\n')) return false;
  let body = importer.slice(prefix.length, -1);
  const seenSections = new Set();
  for (const section of body.matchAll(
    /^    (dependencies|devDependencies):\n((?: {6,}[^\n]*\n)*)/gm,
  )) {
    const [, sectionName, sectionBody] = section;
    if (seenSections.has(sectionName) || !declarations.has(sectionName)) return false;
    seenSections.add(sectionName);
    const declared = declarations.get(sectionName);
    const tuples = [...sectionBody.matchAll(dependencyTuple())];
    if (tuples.length !== declared.size || sectionBody.replace(dependencyTuple(), '') !== '')
      return false;
    const seen = new Set();
    for (const [text, rawName, specifier, version] of tuples) {
      const name = rawName.replace(/^'|'$/g, '');
      if (seen.has(name) || !declared.has(name) || declared.get(name) !== specifier) return false;
      seen.add(name);
      if (specifier === 'workspace:*') {
        const target = workspaceTarget(source, name, version, readHead, head);
        if (!target || (!importerBlock(base, target) && !newSources.has(target))) return false;
        // A new source service is tied to a newly registered game; it cannot
        // introduce unrelated workspace consumers or external runtime dependencies.
        if (service && (sectionName !== 'dependencies' || !newSources.has(target))) return false;
      } else if (
        service ||
        !/^[~^]?\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(specifier) ||
        !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?(?:\([A-Za-z0-9@/_.:+()-]+\))*$/.test(version) ||
        !existingTuples.has(text)
      )
        return false;
    }
    body = body.replace(section[0], '');
  }
  return body === '' && seenSections.size === declarations.size;
}

function removeWorkspaceLink(lock, importer, name, destination, removeSection = false) {
  const original = importerBlock(lock, importer);
  if (!original) throw new Error('Unrecognized or duplicate lock importer');
  let block = original;
  const section = '\n    dependencies:\n';
  if (block.split(section).length !== 2) throw new Error('Missing lock dependencies');
  const start = block.indexOf(section) + section.length;
  const next = block.slice(start).search(/^    \S/m);
  const end = next < 0 ? block.length : start + next;
  const dependency = `      ${name.startsWith('@') ? `'${name}'` : name}:\n        specifier: workspace:*\n        version: link:${path.posix.relative(importer, destination)}\n`;
  const dependencies = block.slice(start, end);
  if (dependencies.split(dependency).length !== 2) throw new Error('Unproven workspace link');
  const remaining = dependencies.replace(dependency, '');
  block = block.slice(0, start) + remaining + block.slice(end);
  if (removeSection) {
    if (remaining.trim() !== '') throw new Error('Unexpected remaining game dependency');
    block = block.replace(section, '\n');
  }
  return lock.replace(original, block);
}

function stripNativeWiring(current, additions, games, context) {
  const { changedPaths, readBase, readHead } = context;
  if (!changedPaths.includes(NATIVE_SHELL)) return { current, sources: [] };
  const before = JSON.parse(readBase(NATIVE_SHELL));
  const after = JSON.parse(readHead(NATIVE_SHELL));
  if (!object(before.dependencies) || !object(after.dependencies))
    throw new Error('Invalid native Shell manifest');
  const remaining = { ...after, dependencies: { ...after.dependencies } };
  const sources = [];
  const candidates = games
    .filter((game) => changedPaths.includes(`${game.source}/package.json`))
    .map((game) => ({ ...game, pkg: JSON.parse(readHead(`${game.source}/package.json`)) }));
  for (const [name, value] of Object.entries(after.dependencies)) {
    if (Object.hasOwn(before.dependencies, name)) continue;
    const matching = candidates.filter((game) => game.pkg.name === name);
    if (value !== 'workspace:*' || matching.length !== 1)
      throw new Error('Unrecognized native game link');
    const game = matching[0];
    const added = additions.some((entry) => entry.source === game.source);
    const canvas = game.pkg.exports?.['./canvas'];
    if (
      typeof canvas !== 'string' ||
      !(
        added
          ? /^\.\/(?:src|native)\/[A-Za-z0-9._/-]+\.(?:ts|js|mjs)$/
          : /^\.\/native\/[A-Za-z0-9._/-]+\.js$/
      ).test(canvas) ||
      canvas.split('/').includes('..')
    )
      throw new Error('Missing native game export');
    if (!added) {
      const oldGame = JSON.parse(readBase(`${game.source}/package.json`));
      if (oldGame.name !== name) throw new Error('Changed game package identity');
      if (
        (oldGame.dependencies !== undefined && !object(oldGame.dependencies)) ||
        (game.pkg.dependencies !== undefined && !object(game.pkg.dependencies))
      )
        throw new Error('Invalid native dependency declarations');
      const oldDeps = oldGame.dependencies || {};
      const newDeps = { ...game.pkg.dependencies };
      const contract = '@coffeeeeffoc/game-contract';
      if (!Object.hasOwn(oldDeps, contract) && newDeps[contract] === 'workspace:*') {
        if (
          !importerBlock(current, 'packages/game-contract') ||
          JSON.parse(readHead('packages/game-contract/package.json')).name !== contract
        )
          throw new Error('Unknown contract package');
        current = removeWorkspaceLink(
          current,
          game.source,
          contract,
          'packages/game-contract',
          !oldGame.dependencies,
        );
        delete newDeps[contract];
      }
      if (!isDeepStrictEqual(oldDeps, newDeps)) throw new Error('Changed native dependencies');
      for (const key of ['devDependencies', 'optionalDependencies', 'peerDependencies'])
        if (!isDeepStrictEqual(oldGame[key], game.pkg[key]))
          throw new Error('Changed native dependency declarations');
    }
    current = removeWorkspaceLink(current, 'apps/shell-minigame', name, game.source);
    sources.push(game.source);
    delete remaining.dependencies[name];
  }
  if (!sources.length || !isDeepStrictEqual(before, remaining))
    throw new Error('Changed native Shell configuration');
  return { current, sources };
}

/**
 * Prove combined additive registration, native and source-service wiring. Every
 * importer matches its manifest; external tuples must already exist verbatim in
 * a baseline importer. Removing only these proven additions must restore every
 * remaining byte, including all documents, settings, resolutions and snapshots.
 */
function lockWiringSources(before, after, additions, games, context) {
  const normalize = (text) => text.replaceAll('\r\n', '\n');
  const base = normalize(before);
  const head = normalize(after);
  let current = head;
  const { changedPaths, readBase, readHead } = context;
  const proof = {
    existingTuples: existingDependencyTuples(base),
    readHead,
    base,
    head,
    newSources: new Set(additions.map((game) => game.source)),
  };
  const sources = new Set(proof.newSources);
  for (const game of additions) {
    const { pkg, name, source } = game;
    const importer = importerBlock(current, source);
    if (
      importerBlock(base, source) ||
      !importer ||
      !newImporterIsWiring(importer, pkg, source, proof)
    )
      throw new Error('Unproven new game importer');
    current = current.replace(importer, '\n');
    current = removeWorkspaceLink(current, 'apps/shell-web', name, source);
  }
  const native = stripNativeWiring(current, additions, games, context);
  current = native.current;
  for (const source of native.sources) sources.add(source);
  for (const file of changedPaths.filter((file) =>
    /^services\/[A-Za-z0-9][A-Za-z0-9._-]*\/package\.json$/.test(file),
  )) {
    const source = file.slice(0, -'/package.json'.length);
    if (importerBlock(base, source)) {
      const oldPackage = JSON.parse(readBase(file));
      const newPackage = JSON.parse(readHead(file));
      if (
        oldPackage.coffeeeeffoc?.role !== 'service' ||
        !object(oldPackage.dependencies) ||
        !object(newPackage.dependencies)
      )
        throw new Error('Invalid existing service dependencies');
      const remaining = { ...newPackage, dependencies: { ...newPackage.dependencies } };
      for (const [name, specifier] of Object.entries(newPackage.dependencies)) {
        if (Object.hasOwn(oldPackage.dependencies, name)) continue;
        const matches = additions.filter((game) => game.name === name);
        if (specifier !== 'workspace:*' || matches.length !== 1)
          throw new Error('Unproven existing service game dependency');
        current = removeWorkspaceLink(current, source, name, matches[0].source);
        delete remaining.dependencies[name];
      }
      if (!isDeepStrictEqual(oldPackage, remaining))
        throw new Error('Existing service configuration changed');
      continue;
    }
    let exists = false;
    try {
      exists = typeof readBase(file) === 'string';
    } catch {
      // A service importer is additive only when its source manifest is new.
    }
    if (exists) throw new Error('Existing service missing baseline importer');
    const pkg = JSON.parse(readHead(file));
    const importer = importerBlock(current, source);
    if (
      pkg.coffeeeeffoc?.role !== 'service' ||
      typeof pkg.name !== 'string' ||
      !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(pkg.name) ||
      !importer ||
      !newImporterIsWiring(importer, pkg, source, proof, true)
    )
      throw new Error('Unproven source service importer');
    current = current.replace(importer, '\n');
  }
  if (current !== base) throw new Error('Unproven remaining lock changes');
  return [...sources];
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
        const lockSources = lockWiringSources(readBase(LOCK), readHead(LOCK), additions, after, {
          changedPaths,
          readBase,
          readHead,
        });
        if (changedPaths.includes(SHELL))
          scopes.set(
            SHELL,
            additions.map((game) => game.source),
          );
        if (changedPaths.includes(LOCK)) scopes.set(LOCK, lockSources);
      } catch {
        /* Real dependency changes or unfamiliar wiring keep full regression. */
      }
    }
  } catch {
    /* Invalid snapshots, identity changes and missing baselines fail closed. */
  }
  return scopes;
}
