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

/** Structural proofs for config-only changes; explicit consumers for known tools.
 * No prefix wildcard accepts a new workflow, shared runtime or test script.
 */
export function reviewedSharedFileScopes({ changedPaths, readBase, readHead, games }) {
  const scopes = new Map();
  for (const file of changedPaths) {
    try {
      if (
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
