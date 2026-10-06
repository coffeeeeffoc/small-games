import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { affectedPackages, isDocumentation, riskPlan } from './validation-plan.mjs';

const loadFormatter = createRequire(import.meta.url);

const validationTool =
  /^(?:scripts\/(?:validate-(?:push(?:-hook)?|tree)|validation-plan|incremental-validation|validate-candidate|run-selected-(?:shell|browser)|ci-validation|rule-tasks|cocos-validation|workspace-bootstrap|pages-test-scope|pages-registration-scope)(?:\.[^/]+)?\.mjs|\.githooks\/[^/]+)$/;
// Reviewed shared navigation contracts: exercise both home and immersive frame exits.
const navigationSamples = ['letters-words2', 'xiangqi-five'];
export function incrementalPlan({
  packages,
  games,
  changedPaths,
  readSource,
  fileScopes = new Map(),
}) {
  const paths = changedPaths.filter((file) => !isDocumentation(file));
  const unknown = paths.filter(
    (file) =>
      !packages.some((pkg) => file === pkg.dir || file.startsWith(pkg.dir + '/')) &&
      !validationTool.test(file) &&
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
  return {
    full: false,
    browser: ids.size > 0,
    browser_ids: [...ids].sort(),
    game_sources: selected.map((game) => game.source),
    validation_tools: paths.some((file) => validationTool.test(file)),
  };
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
  const { ast, nodes } = adapterSyntax(text);
  const matches = nodes.filter(
    ({ node }) =>
      node.type === 'VariableDeclarator' &&
      node.id.type === 'Identifier' &&
      node.id.name === 'copies',
  );
  assert(matches.length === 1, 'Expected one copies declaration');
  const { node, parent } = matches[0];
  assert(
    parent.kind === 'const' &&
      parent.declarations.length === 1 &&
      ast.program.body.includes(parent),
  );
  const list = node.init;
  assert(list?.type === 'ArrayExpression');
  const string = `(?:'[A-Za-z0-9._/-]+'|"[A-Za-z0-9._/-]+")`;
  assert(
    new RegExp(`^\\[\\s*(?:${string}\\s*(?:,\\s*${string}\\s*)*,?\\s*)?\\]$`).test(
      text.slice(list.start, list.end),
    ),
  );
  assert(list.elements.every((item) => item?.type === 'StringLiteral'));
  return literalRange(
    text,
    list,
    list.elements.map((item) => item.value),
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
