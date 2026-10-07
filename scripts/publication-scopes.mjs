import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const loadDependency = createRequire(import.meta.url);

// Exact dependency-checkout repairs for the two bare planning jobs. Commands,
// permissions, conditions and all other workflow bytes remain producer-bound.
const planningCheckoutHashes = {
  '.github/workflows/ci.yml': {
    original: '7bf17695b0e6a9062ed81dd0d0b4febbfbb8318da4ef469aacbd411e64b29411',
    recursive: 'bf277f8e20d7991a89a3c6f4bd203a8d2f093eb1177c2d88025b92e42d11e87f',
    locked: 'fdc0f51bc350921e31064da3ef56acbe01ee9ec4d0865cc03c56ba82ab619fe3',
  },
  '.github/workflows/pages.yml': {
    original: '9a2493b15ddd4d6379ae117a94bd4620acfaa20bdf084eab6e96c0a03ca92a51',
    recursive: 'dfe0f60b9f1a3f30806960dc98ccfaeb17f51c09f57f30a9d57c10129ca31d97',
    locked: '5ce491178ca6d928b02d3c74843aee8115f1b507763b377ba6a5033904ca151f',
  },
};
const planningCheckoutAnchor =
  '      - uses: actions/checkout@v5\n        with:\n          fetch-depth: 0\n      - uses: actions/setup-node@v6\n';
const recursivePlanningAnchor =
  '      - uses: actions/checkout@v5\n        with:\n          fetch-depth: 0\n          submodules: recursive\n      - uses: actions/setup-node@v6\n';
const lockedPlanningAnchor =
  '      - uses: actions/checkout@v5\n        with:\n          fetch-depth: 0\n      - name: Read locked Xiangqi workspace for planning\n        run: |\n          git -c url.https://github.com/.insteadOf=git@github.com: submodule update --init -- games/submodules/xiangqi-five\n      - uses: actions/setup-node@v6\n';
function exactPlanningCheckout(file, before, after) {
  const hashes = planningCheckoutHashes[file];
  if (!hashes) return false;
  const digest = (text) => createHash('sha256').update(text).digest('hex');
  const oldHash = digest(before),
    newHash = digest(after);
  const anchor =
    oldHash === hashes.original
      ? planningCheckoutAnchor
      : oldHash === hashes.recursive
        ? recursivePlanningAnchor
        : null;
  const replacement =
    oldHash === hashes.original && newHash === hashes.recursive
      ? recursivePlanningAnchor
      : newHash === hashes.locked
        ? lockedPlanningAnchor
        : null;
  return (
    !!anchor &&
    !!replacement &&
    before.split(anchor).length === 2 &&
    after === before.replace(anchor, replacement)
  );
}

const validationHistoryFile = '.github/workflows/pages-validate.yml';
function exactValidationHistory(file, before, after) {
  if (file !== validationHistoryFile) return false;
  const digest = (text) => createHash('sha256').update(text).digest('hex');
  if (
    digest(before) !== 'd2f8f24d28033d97df0af0232d82580d5f2c97739424e48728a7d3c3c7f34543' ||
    digest(after) !== '29c49bdf51d0ff0a5182c21912b035e158f3345e02ec5fd143b5fa947ef2cb92'
  )
    return false;
  const marker = '  logic:\n';
  if (before.split(marker).length !== 2) return false;
  const offset = before.indexOf(marker);
  const anchor =
    '      - uses: actions/checkout@v5\n        with:\n          submodules: recursive\n';
  const tail = before.slice(offset);
  return (
    tail.includes(anchor) &&
    after ===
      before.slice(0, offset) +
        tail.replace(
          anchor,
          anchor.replace(
            '          submodules: recursive\n',
            '          submodules: recursive\n          fetch-depth: 0\n',
          ),
        )
  );
}

function literalDeclaration(source, name) {
  const { parsers } = loadDependency('prettier/plugins/babel');
  const ast = parsers.babel.parse(source, {});
  const declarations = ast.program.body
    .map((node) => (node.type === 'ExportNamedDeclaration' ? node.declaration : node))
    .filter((node) => node?.type === 'VariableDeclaration')
    .flatMap((node) => node.declarations.map((entry) => ({ node, entry })))
    .filter(({ entry }) => entry.id.type === 'Identifier' && entry.id.name === name);
  assert(declarations.length === 1 && declarations[0].node.kind === 'const');
  const { entry } = declarations[0];
  function check(node) {
    if (node.type === 'ObjectExpression') {
      const names = node.properties.map((property) => {
        assert(property.type === 'ObjectProperty' && !property.computed);
        check(property.value);
        return property.key.name ?? property.key.value;
      });
      assert(new Set(names).size === names.length, 'Duplicate literal key');
    } else if (node.type === 'ArrayExpression') {
      for (const item of node.elements) check(item);
    } else assert(node.type === 'StringLiteral', 'Unreviewed executable literal');
  }
  check(entry.init);
  return JSON.parse(
    source
      .slice(entry.init.start, entry.init.end)
      .replace(/'([^'\\]*)'/g, (_, value) => JSON.stringify(value))
      .replace(/([,{]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3')
      .replace(/,\s*([}\]])/g, '$1'),
  );
}

// These are the complete consumers of the shared competition adapters. The
// classifier verifies the builder's literal registry before using this boundary.
export const competitionConsumers = {
  'cops-robbers': 'games/local/cops-robbers',
  'cops-robbers-realtime': 'games/local/cops-robbers-realtime',
  'letters-words2': 'games/local/letters-words2',
  'vibeJam-myself-history-guess': 'games/local/vibeJam-myself-history-guess',
  'xiangqi-five': 'games/submodules/xiangqi-five',
};
const h5Files = ['platforms/competition/h5.js', 'scripts/test-competition-dialogs.mjs'];
const nativeFiles = ['platforms/competition/native.js', 'scripts/competition-native-smoke.mjs'];
const builder = 'scripts/competition-build.mjs';
const lettersTests = [
  'scripts/letters-words2-competition-mobile.browser.mjs',
  'scripts/letters-words2-competition-renderer.test.mjs',
  'scripts/letters-words2-iframe.browser.mjs',
];
const competitionFiles = [...h5Files, ...nativeFiles, builder, ...lettersTests];
const localIgnores = new Set([
  '.codex/config.toml',
  '.codex/config.toml.backup.*',
  '.mcp.json',
  '.mcp.json.backup.*',
  '.claude/settings.json',
  '.claude/settings.json.backup.*',
  '.cursor/mcp.json',
  '.cursor/mcp.json.backup.*',
  'opencode.json',
  'opencode.json.backup.*',
  'AGENTS.md.backup.*',
]);
const ignoreLines = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
function additiveLines(before, after) {
  const old = ignoreLines(before),
    current = ignoreLines(after);
  assert(new Set(current).size === current.length, 'Duplicate ignore rule');
  assert(
    isDeepStrictEqual(
      old,
      current.filter((line) => old.includes(line)),
    ),
    'Ignore rule changed',
  );
  return current.filter((line) => !old.includes(line));
}

function assertCompetitionRegistry(readHead, games) {
  const source = readHead(builder);
  const registry = literalDeclaration(source, 'competitionGames');
  assert(
    isDeepStrictEqual(Object.keys(registry).sort(), Object.keys(competitionConsumers).sort()),
    'Unreviewed competition consumer',
  );
  for (const [id, directory] of Object.entries(competitionConsumers)) {
    assert(
      registry[id].directory === directory &&
        games.some((game) => game.id === id && game.source === directory),
      'Competition source mismatch',
    );
    assert(
      isDeepStrictEqual(Object.keys(registry[id]).sort(), ['directory', 'renderer', 'title']),
      'Unreviewed competition registry fields',
    );
    assert(typeof registry[id].renderer === 'string' && typeof registry[id].title === 'string');
  }
}

const cageRescueSource = 'games/local/cage-rescue';
const cageRescueGameplayFile = 'apps/shell-web/scripts/game-checks/cage-rescue.mjs';
const standaloneChecksFile = 'apps/shell-web/scripts/standalone-game-checks.mjs';
const cageRescueDelegate =
  "  if (id === 'cage-rescue') {\n" +
  "    const { assertCageRescueGameplay } = await import('./game-checks/cage-rescue.mjs');\n" +
  '    return assertCageRescueGameplay(frame, mobile);\n' +
  '  }\n';
const standaloneGameplayHeader =
  'export async function assertStandaloneGameplay(frame, id, mobile = false) {\n';
const cageRescueImmersiveFiles = {
  'apps/shell-web/src/StandaloneGame.tsx': {
    name: 'immersive',
    anchor: '  const immersive =\n',
    addition: "    id === 'cage-rescue' ||\n",
  },
  'apps/shell-web/scripts/pages-smoke.mjs': {
    name: 'immersiveGame',
    anchor: 'const immersiveGame = (id) =>\n  [\n',
    addition: "    'cage-rescue',\n",
  },
  'apps/shell-web/tests/standalone-immersive.integration.test.tsx': {
    name: 'cases',
    anchor: 'it.each([\n',
    addition: "  'cage-rescue',\n",
  },
};

function assertCageRescueCatalog(games) {
  const entries = games.filter(
    (game) => game.id === 'cage-rescue' || game.source === cageRescueSource,
  );
  assert(
    entries.length === 1 &&
      entries[0].id === 'cage-rescue' &&
      entries[0].source === cageRescueSource,
    'Unreviewed cage rescue catalog binding',
  );
}

function parsedSource(source, typescript = false) {
  const { parsers } = loadDependency('prettier/plugins/babel');
  return parsers[typescript ? 'babel-ts' : 'babel'].parse(source, {}).program;
}

function namedVariable(program, name) {
  const matches = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (
      node.type === 'VariableDeclarator' &&
      node.id.type === 'Identifier' &&
      node.id.name === name
    )
      matches.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(program);
  assert(matches.length === 1, 'Ambiguous per-game wiring declaration');
  return matches[0];
}

function assertCageRescueGameplayModule(source) {
  // Reviewed native mouse/touch, pointer-release, pause/resume and home assertions.
  // Pin the complete module, not just an import regex: nested eval/loaders and
  // executable injections cannot acquire a single-game classification.
  assert(
    createHash('sha256').update(source).digest('hex') ===
      'e537cb9effeae6f00d615d8001c132637cfc99a932cdc074718c45100c1cce0b',
    'Unreviewed cage rescue gameplay checks',
  );
  const body = parsedSource(source).body;
  assert(body.length === 2);
  const [dependency, exported] = body;
  assert(dependency.type === 'ImportDeclaration' && dependency.source.value === '@playwright/test');
  assert(
    dependency.specifiers.length === 1 &&
      dependency.specifiers[0].type === 'ImportSpecifier' &&
      dependency.specifiers[0].imported.name === 'expect' &&
      dependency.specifiers[0].local.name === 'expect',
  );
  assert(
    exported.type === 'ExportNamedDeclaration' &&
      exported.declaration?.type === 'FunctionDeclaration' &&
      exported.declaration.id.name === 'assertCageRescueGameplay' &&
      exported.declaration.async,
  );
}

function assertCageRescueDelegate({ readBase, readHead }) {
  const before = readBase(standaloneChecksFile);
  const after = readHead(standaloneChecksFile);
  assertCageRescueGameplayModule(readHead(cageRescueGameplayFile));
  assert(
    after.split(cageRescueDelegate).length === 2,
    'Missing or duplicate cage rescue delegation',
  );
  const declaration = parsedSource(after).body.filter(
    (node) =>
      node.type === 'ExportNamedDeclaration' &&
      node.declaration?.type === 'FunctionDeclaration' &&
      node.declaration.id.name === 'assertStandaloneGameplay',
  );
  assert(declaration.length === 1);
  // The lazy import is the first statement of the real exported function, never
  // a lookalike string/comment or an unconditional top-level dependency.
  assert(after.indexOf(standaloneGameplayHeader + cageRescueDelegate) === declaration[0].start);
  const first = declaration[0].declaration.body.body[0];
  assert(
    first?.type === 'IfStatement' &&
      after.slice(first.start, first.end) === cageRescueDelegate.trim(),
  );
  const stripped = after.replace(cageRescueDelegate, '');
  assert(before === stripped || before === after, 'Other shared gameplay bytes changed');
  if (before !== after) {
    assert(before.split(standaloneGameplayHeader).length === 2);
    assert(
      after ===
        before.replace(standaloneGameplayHeader, standaloneGameplayHeader + cageRescueDelegate),
    );
  }
}

function assertCageRescueImmersive(file, before, after) {
  const { name, anchor, addition } = cageRescueImmersiveFiles[file];
  assert(before.split(anchor).length === 2 && !before.includes("'cage-rescue'"));
  assert(
    after === before.replace(anchor, anchor + addition),
    'Other shared immersion bytes changed',
  );
  const program = parsedSource(after, file.endsWith('.tsx'));
  if (name === 'cases') {
    const cases = program.body.filter(
      (node) =>
        node.type === 'ExpressionStatement' &&
        node.expression.type === 'CallExpression' &&
        node.expression.callee.type === 'CallExpression' &&
        node.expression.callee.callee.type === 'MemberExpression' &&
        !node.expression.callee.callee.computed &&
        node.expression.callee.callee.object.type === 'Identifier' &&
        node.expression.callee.callee.object.name === 'it' &&
        node.expression.callee.callee.property.name === 'each',
    );
    assert(cases.length === 1 && cases[0].start === after.indexOf(anchor));
    const args = cases[0].expression.callee.arguments;
    assert(
      args.length === 1 &&
        args[0].type === 'ArrayExpression' &&
        args[0].elements.every((node) => node?.type === 'StringLiteral'),
    );
    const ids = args[0].elements.map((node) => node.value);
    assert(ids[0] === 'cage-rescue' && new Set(ids).size === ids.length);
    return;
  }
  const declaration = namedVariable(program, name);
  assert(declaration.start === after.indexOf(anchor) + anchor.indexOf(name));
  if (name === 'immersive') {
    const ids = [];
    const compare = (node) => {
      if (node.type === 'LogicalExpression' && node.operator === '||') {
        compare(node.left);
        compare(node.right);
      } else {
        assert(
          node.type === 'BinaryExpression' &&
            node.operator === '===' &&
            node.left.type === 'Identifier' &&
            node.left.name === 'id' &&
            node.right.type === 'StringLiteral',
        );
        ids.push(node.right.value);
      }
    };
    compare(declaration.init);
    assert(ids[0] === 'cage-rescue' && new Set(ids).size === ids.length);
  } else {
    const arrow = declaration.init;
    assert(
      arrow.type === 'ArrowFunctionExpression' &&
        arrow.params.length === 1 &&
        arrow.params[0].type === 'Identifier' &&
        arrow.params[0].name === 'id',
    );
    const call = arrow.body;
    assert(
      call.type === 'CallExpression' &&
        call.callee.type === 'MemberExpression' &&
        !call.callee.computed &&
        call.callee.property.name === 'includes' &&
        call.arguments.length === 1 &&
        call.arguments[0].type === 'Identifier' &&
        call.arguments[0].name === 'id',
    );
    const list = call.callee.object;
    assert(
      list.type === 'ArrayExpression' &&
        list.elements.every((node) => node?.type === 'StringLiteral'),
    );
    const ids = list.elements.map((node) => node.value);
    assert(ids[0] === 'cage-rescue' && new Set(ids).size === ids.length);
  }
}

/** Structural proofs for config-only changes; explicit consumers for known tools.
 * No prefix wildcard accepts a new workflow, shared runtime or test script.
 */
export function reviewedSharedFileScopes({ changedPaths, readBase, readHead, games }) {
  const scopes = new Map();
  for (const file of changedPaths) {
    try {
      if (file === standaloneChecksFile || file === cageRescueGameplayFile) {
        assertCageRescueCatalog(games);
        assertCageRescueDelegate({ readBase, readHead });
        scopes.set(file, [cageRescueSource]);
      } else if (Object.hasOwn(cageRescueImmersiveFiles, file)) {
        assertCageRescueCatalog(games);
        assertCageRescueImmersive(file, readBase(file), readHead(file));
        scopes.set(file, [cageRescueSource]);
      } else if (
        file === validationHistoryFile &&
        exactValidationHistory(file, readBase(file), readHead(file))
      ) {
        scopes.set(file, []);
      } else if (
        planningCheckoutHashes[file] &&
        exactPlanningCheckout(file, readBase(file), readHead(file))
      ) {
        scopes.set(file, []);
      } else if (file === '.github/workflows/ci.yml') {
        const yaml = loadDependency('js-yaml');
        const before = yaml.load(readBase(file)),
          after = yaml.load(readHead(file));
        const old = before.jobs?.quality?.['timeout-minutes'];
        const current = after.jobs?.quality?.['timeout-minutes'];
        assert(
          Number.isInteger(old) && Number.isInteger(current) && current >= old && current <= 360,
        );
        after.jobs.quality['timeout-minutes'] = old;
        assert(isDeepStrictEqual(before, after), 'Workflow execution changed');
        scopes.set(file, []);
      } else if (file === '.gitignore') {
        const added = additiveLines(readBase(file), readHead(file));
        assert(
          added.length && added.every((line) => localIgnores.has(line)),
          'Unreviewed ignored source',
        );
        scopes.set(file, []);
      } else if (file === '.prettierignore') {
        const added = additiveLines(readBase(file), readHead(file));
        assert(added.length);
        const sources = new Set();
        for (const copy of added) {
          const game = games.find((entry) => copy === `${entry.source}/public/fullscreen.js`);
          assert(
            game && readHead(copy) === readHead('platforms/h5/fullscreen.js'),
            'Ignored source is not a canonical fullscreen copy',
          );
          const copies = literalDeclaration(readHead('scripts/sync-h5-fullscreen.mjs'), 'copies');
          assert(
            Array.isArray(copies) &&
              new Set(copies).size === copies.length &&
              copies.includes(copy),
            'Fullscreen copy is not checked',
          );
          sources.add(game.source);
        }
        scopes.set(file, [...sources]);
      } else if (file === 'scripts/check-game-config.test.mjs') {
        scopes.set(file, []);
      } else if (competitionFiles.includes(file)) {
        assertCompetitionRegistry(readHead, games);
        scopes.set(
          file,
          lettersTests.includes(file)
            ? [competitionConsumers['letters-words2']]
            : Object.values(competitionConsumers),
        );
      }
    } catch {
      // Unproved config or new registry consumers stay absent and block publication.
    }
  }
  return scopes;
}

export function competitionToolPlan({ paths, games, packages, fileScopes }) {
  const selected = competitionFiles.filter((file) => paths.includes(file) && fileScopes.has(file));
  const h5 = selected.some((file) => h5Files.includes(file) || file === builder);
  const native = selected.some((file) => nativeFiles.includes(file) || file === builder);
  const letters = h5 || native || selected.some((file) => lettersTests.includes(file));
  const consumers = new Set();
  if (selected.length) {
    for (const [id, source] of Object.entries(competitionConsumers))
      assert(games.some((game) => game.id === id && game.source === source));
    for (const dir of [
      'apps/shell-web',
      'services/runtime-api',
      ...(native
        ? [
            'apps/shell-minigame',
            'platforms/wechat',
            'platforms/bilibili',
            'platforms/douyin',
            'platforms/kuaishou',
          ]
        : []),
    ]) {
      assert(
        packages.some((pkg) => pkg.dir === dir),
        `Missing competition consumer ${dir}`,
      );
      consumers.add(dir);
    }
  }
  return {
    h5,
    native,
    letters,
    config_tests:
      paths.includes('scripts/check-game-config.test.mjs') ||
      paths.includes('.github/workflows/ci.yml'),
    consumer_sources: [...consumers],
  };
}
