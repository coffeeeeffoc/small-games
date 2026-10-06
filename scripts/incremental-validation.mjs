import assert from 'node:assert/strict';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { affectedPackages, isDocumentation, riskPlan } from './validation-plan.mjs';

const validationTool =
  /^(?:scripts\/(?:validate-(?:push(?:-hook)?|tree)|validation-plan|incremental-validation|validate-candidate|run-selected-(?:shell|browser)|ci-validation|rule-tasks|cocos-validation|workspace-bootstrap|pages-test-scope)(?:\.[^/]+)?\.mjs|\.githooks\/[^/]+)$/;
// Reviewed shared navigation contracts: exercise both home and immersive frame exits.
const navigationSamples = ['letters-words2', 'xiangqi-five'];
const nativeSmoke = 'scripts/native-game-smoke.mjs';
const developerMode = 'scripts/test-game-dev-mode.mjs';
export const nativeToolConsumers = [
  { dir: 'apps/shell-minigame', smoke: 'node ../../scripts/native-game-smoke.mjs --standalone' },
  { dir: 'apps/shell-bilibili', smoke: 'node ../../scripts/native-game-smoke.mjs --catalog' },
];
export function incrementalPlan({
  packages,
  games,
  changedPaths,
  readSource,
  fileScopes = new Map(),
}) {
  const paths = changedPaths.filter((file) => !isDocumentation(file));
  const nativeConsumers = paths.includes(nativeSmoke) ? nativeToolConsumers : [];
  for (const consumer of nativeConsumers) {
    const pkg = packages.find((item) => item.dir === consumer.dir);
    assert(
      pkg?.scripts?.smoke === consumer.smoke &&
        pkg.scripts.test === 'vitest run' &&
        ['build', 'typecheck', 'lint'].every((task) => pkg.scripts[task]),
      `Unreviewed native tool consumer: ${consumer.dir}`,
    );
  }
  const unknown = paths.filter(
    (file) =>
      !packages.some((pkg) => file === pkg.dir || file.startsWith(pkg.dir + '/')) &&
      !validationTool.test(file) &&
      file !== nativeSmoke &&
      !fileScopes.has(file),
  );
  assert(
    !unknown.length,
    `Incremental scope undefined for: ${unknown.join(', ')}. Define affected consumers before publishing; no automatic full regression.`,
  );
  const affected = affectedPackages(packages, paths);
  const directGames = games.filter((game) =>
    paths.some((file) => file === game.source || file.startsWith(game.source + '/')),
  );
  const shared = paths.some((file) => file.startsWith('packages/'));
  const registrations = new Set([...fileScopes.values()].flat());
  const selected = shared
    ? games.filter((game) => affected.some((pkg) => pkg.dir === game.source))
    : games.filter((game) => directGames.includes(game) || registrations.has(game.source));
  const ids = new Set();
  for (const game of selected) {
    const scope = { required: true, full: false, game_ids: [game.id], game_sources: [game.source] };
    const result = riskPlan({
      changedPaths: paths.filter((file) => file.startsWith(game.source + '/')),
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
    (file) => file.startsWith('apps/shell-web/') && !fileScopes.has(file),
  );
  if (shellChanged || paths.some((file) => validationTool.test(file)))
    for (const id of navigationSamples) if (games.some((game) => game.id === id)) ids.add(id);
  const devModeIds = paths.includes(developerMode)
    ? games
        .filter((game) => fileScopes.get(developerMode)?.includes(game.source))
        .map((game) => game.id)
    : [];
  if (devModeIds.length)
    for (const id of navigationSamples) if (games.some((game) => game.id === id)) ids.add(id);
  return {
    full: false,
    browser: ids.size > 0,
    browser_ids: [...ids].sort(),
    game_sources: selected.map((game) => game.source),
    validation_tools: paths.some((file) => validationTool.test(file)),
    consumer_sources: [
      ...nativeConsumers.map((consumer) => consumer.dir),
      ...(devModeIds.length ? ['apps/shell-web'] : []),
    ],
    native_consumers: nativeConsumers.map((consumer) => consumer.dir),
    developer_mode_ids: devModeIds.sort(),
  };
}

/** Reviewed game guards may change their entry assertions; shared execution stays fail closed. */
export function developerModeFileScopes({ changedPaths, readBase, readHead, games }) {
  const scopes = new Map();
  if (!changedPaths.includes(developerMode)) return scopes;
  try {
    const parse = (source) => {
      const ids = new Set(['wulong-city']); // The existing mobile and external-frame fixture.
      let guards = 0;
      let fixtures = 0;
      const rest = source
        .replaceAll('\r\n', '\n')
        .replace(
          /        if \(\n([\s\S]*?)        \) \{\n([\s\S]*?)        \} else \{/g,
          (whole, condition, body) => {
            guards++;
            for (const expression of condition.replace(/\s/g, '').split('||')) {
              const match = expression.match(/^game\.id==='([A-Za-z0-9._-]+)'$/);
              assert(match, 'Unreviewed developer-mode game guard');
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
        .replace(
          /  await page\.goto\(`\$\{origin\}\/independent\/wulong-city\/\?dev`\);\n(?:  await page\.locator\('#start-game'\)\.tap\(\);\n)?/g,
          () => {
            fixtures++;
            return 'WULONG_MOBILE_ENTRY\n';
          },
        );
      assert(guards === 1 && fixtures === 1);
      return { rest, ids };
    };
    const before = parse(readBase(developerMode));
    const after = parse(readHead(developerMode));
    if (before.rest !== after.rest) return scopes;
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
