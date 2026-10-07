import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { affectedPackages, isDocumentation, riskPlan } from './validation-plan.mjs';
import {
  nineNativeScopePaths,
  nineNativeChecks,
  nineNativeDependencyPlan,
} from './nine-native-scope.mjs';
import { competitionToolPlan } from './publication-scopes.mjs';
export { reviewedSharedFileScopes } from './publication-scopes.mjs';

const loadFormatter = createRequire(import.meta.url);

const validationTool =
  /^(?:scripts\/(?:validate-(?:push(?:-hook)?|tree)|validation-plan|incremental-validation|validate-candidate|run-selected-(?:shell|browser)|ci-validation|rule-tasks|cocos-validation|workspace-bootstrap|pages-test-scope|pages-registration-scope|pages-regression-shards|publication-scopes|run-selected-competition)(?:\.[^/]+)?\.mjs|scripts\/nine-(?:native|lock)-scope(?:\.test)?\.mjs|\.githooks\/[^/]+)$/;
export const workspaceBoundaryScopePaths = Object.freeze([
  'scripts/check-workspace-dependencies.mjs',
  'scripts/check-workspace-dependencies.test.mjs',
]);
// Reviewed shared navigation contracts: exercise both home and immersive frame exits.
const navigationSamples = ['letters-words2', 'xiangqi-five'];
const nativeSmoke = 'scripts/native-game-smoke.mjs';
const developerMode = 'scripts/test-game-dev-mode.mjs';
export const nativeToolConsumers = [
  {
    dir: 'apps/shell-minigame',
    smoke: 'node ../../scripts/native-game-smoke.mjs --standalone',
  },
  {
    dir: 'apps/shell-bilibili',
    smoke: 'node ../../scripts/native-game-smoke.mjs --catalog',
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
      !workspaceBoundaryScopePaths.includes(file) &&
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
    !nineScopes.get(nativeCompetition).includes('apps/shell-bilibili')
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
    (file) => file.startsWith('apps/shell-web/') && !fileScopes.has(file),
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
  if (devModeIds.length)
    for (const id of navigationSamples) if (games.some((game) => game.id === id)) ids.add(id);
  return {
    full: false,
    browser: ids.size > 0,
    browser_ids: [...ids].sort(),
    game_sources: selected.map((game) => game.source),
    validation_tools: paths.some(
      (file) =>
        validationTool.test(file) ||
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
