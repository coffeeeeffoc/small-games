import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const COMPETITION = 'platforms/competition/native.js';
const XIANGQI = 'platforms/competition/xiangqi-five/';
const MINIGAME = 'apps/shell-minigame',
  BILIBILI = 'apps/shell-bilibili';
const sources = {
  'cops-robbers': 'games/local/cops-robbers',
  'cops-robbers-realtime': 'games/local/cops-robbers-realtime',
  'letters-words2': 'games/local/letters-words2',
  'vibeJam-myself-history-guess': 'games/local/vibeJam-myself-history-guess',
  'xiangqi-five': 'games/submodules/xiangqi-five',
  'wulong-city': 'games/local/wulong-city',
};
const competitionGames = Object.keys(sources).filter((id) => id !== 'wulong-city');
const canvasGames = competitionGames.filter((id) => id !== 'letters-words2');
const definitions = {
  [COMPETITION]: {
    type: 'competition',
    games: competitionGames,
    consumer_sources: [MINIGAME, BILIBILI],
  },
  [XIANGQI + 'native.js']: {
    type: 'xiangqi',
    games: ['xiangqi-five'],
    consumer_sources: [MINIGAME],
  },
  [XIANGQI + 'tests/native.test.mjs']: {
    type: 'xiangqi',
    games: ['xiangqi-five'],
    consumer_sources: [MINIGAME],
    command: {
      file: XIANGQI + 'tests/native.test.mjs',
      args: ['--test', XIANGQI + 'tests/native.test.mjs'],
      browser: false,
    },
  },
  [XIANGQI + 'tests/browser.mjs']: {
    type: 'xiangqi',
    games: ['xiangqi-five'],
    consumer_sources: [MINIGAME],
    command: {
      file: XIANGQI + 'tests/browser.mjs',
      args: [XIANGQI + 'tests/browser.mjs'],
      browser: true,
    },
  },
  'scripts/nine-canvas-games-smoke.mjs': {
    type: 'canvas',
    games: canvasGames,
    consumer_sources: [MINIGAME],
    command: {
      file: 'scripts/nine-canvas-games-smoke.mjs',
      args: ['scripts/nine-canvas-games-smoke.mjs'],
      browser: false,
    },
  },
  'scripts/nine-channel-entry-smoke.mjs': {
    type: 'entry',
    games: competitionGames,
    consumer_sources: [BILIBILI, 'platforms/bilibili'],
    command: {
      file: 'scripts/nine-channel-entry-smoke.mjs',
      args: ['scripts/nine-channel-entry-smoke.mjs'],
      browser: false,
    },
  },
  'scripts/nine-wulong-smoke.mjs': {
    type: 'wulong',
    games: ['wulong-city'],
    consumer_sources: [MINIGAME],
    command: {
      file: 'scripts/nine-wulong-smoke.mjs',
      args: ['scripts/nine-wulong-smoke.mjs'],
      browser: false,
    },
  },
};
export const nineNativeScopePaths = Object.freeze(Object.keys(definitions));

// Explicit review of these six NEW files in the 2026-10-06 batch. Missing base is
// allowed only for these exact paths and exact bytes, never for a sibling path.
// Updating one of them requires a new source/import/consumer review and digest.
const reviewed = {
  [XIANGQI + 'native.js']: [
    'b1cfc9787be26a3f72471fa929f0a2cf258579df6ee334090662fb6affba98a6',
    [
      '../../../games/submodules/xiangqi-five/game.js',
      '../../../games/submodules/xiangqi-five/local-game.js',
      '../../../games/submodules/xiangqi-five/computer.js',
      '../../../games/submodules/xiangqi-five/competition-renderer.js',
      '../../../games/submodules/xiangqi-five/challenges.js',
    ],
  ],
  [XIANGQI + 'tests/native.test.mjs']: [
    '79aae92d0c368a95ec88bd1eff10d51156b4cd1d97170536ead1d5414baaa9e2',
    ['node:test', 'node:assert/strict', '../native.js'],
  ],
  [XIANGQI + 'tests/browser.mjs']: [
    '089ddfc4ac2340b9c096f172a5a7a32ddd2163b65724d86fc1269109bc992c27',
    [
      'node:http',
      'node:fs/promises',
      'node:url',
      'node:assert/strict',
      '/platforms/competition/xiangqi-five/native.js',
    ],
  ],
  'scripts/nine-canvas-games-smoke.mjs': [
    '7f6550910297dc9870655c78923b791efa90aacd80ba9616488eefa30dccfe1e',
    [
      'node:assert/strict',
      'node:fs',
      'node:path',
      'node:url',
      'node:vm',
      '../games/local/letters-words2/tests/native-sdk-fixture.mjs',
    ],
  ],
  'scripts/nine-channel-entry-smoke.mjs': [
    'd1a42f2b6f427601bad573416d7b3b5357521139511a251d2bbcfb9d3ef6e91a',
    [
      'node:assert/strict',
      '../games/local/letters-words2/tests/native-sdk-fixture.mjs',
      '../games/local/letters-words2/tests/native-test-actions.mjs',
      '../platforms/bilibili/native-entry.mjs',
      '../platforms/competition/native.js',
      '../games/local/cops-robbers/src/native.js',
      '../games/local/cops-robbers-realtime/src/native.js',
      '../games/local/letters-words2/native.js',
      '../games/local/vibeJam-myself-history-guess/native.js',
      '../platforms/competition/xiangqi-five/native.js',
      '/platforms/bilibili/native-entry.mjs',
    ],
  ],
  'scripts/nine-wulong-smoke.mjs': [
    'f2f1bdecd836acc9a1420d60c9bffddba563e8c4adbc85a0ccd7807df3d7472d',
    [
      'node:assert/strict',
      'node:fs',
      'node:path',
      'node:vm',
      'node:url',
      './native-game-smoke.mjs',
      '../games/local/letters-words2/tests/native-sdk-fixture.mjs',
    ],
  ],
};
const digest = (text) => createHash('sha256').update(text).digest('hex');
const equal = (actual, expected) => assert.deepEqual(actual, expected);
const imports = (text) =>
  [...text.matchAll(/(?:^|[;\n])import\s+(?:[^;]*?\bfrom\s*)?(['"])([^'"]+)\1\s*;/g)].map(
    (match) => match[2],
  );

function inspectReviewed(file, text) {
  assert.equal(typeof text, 'string');
  assert.equal(digest(text), reviewed[file][0], 'Exact reviewed native source bytes required');
  equal(imports(text), reviewed[file][1]);
  if (file === 'scripts/nine-canvas-games-smoke.mjs') {
    const body = text.match(/for \(const game of \[([\s\S]*?)\]\)/)?.[1];
    assert(
      body && /^\s*(?:'[A-Za-z0-9-]+'\s*,\s*)+$/.test(body),
      'Literal fixed game loop required',
    );
    equal(
      [...body.matchAll(/'([A-Za-z0-9-]+)'/g)].map((match) => match[1]),
      canvasGames,
    );
    const subset = text.match(
      /selectedGames\.every\(\(id\) =>\s*\[([\s\S]*?)\]\.includes\(id\)/,
    )?.[1];
    assert(subset && /^\s*(?:'[A-Za-z0-9-]+'\s*,\s*)+$/.test(subset));
    equal(
      [...subset.matchAll(/'([A-Za-z0-9-]+)'/g)].map((match) => match[1]),
      canvasGames,
    );
    assert(text.includes('new Set(selectedGames).size === selectedGames.length'));
    assert(text.includes('selectedGames.length > 0'));
    assert(text.includes('if (selectedGames && !selectedGames.includes(game)) continue;'));
  }
  if (file === 'scripts/nine-channel-entry-smoke.mjs') {
    const body = text.match(/for \(const \[id, start, entry\] of \[([\s\S]*?)\]\)/)?.[1];
    assert(body, 'Literal fixed entry loop required');
    const tuple = /\[\s*'([A-Za-z0-9-]+)'\s*,\s*([A-Za-z0-9]+)\s*,\s*'[^']*'\s*\]/g;
    const entries = [...body.matchAll(tuple)];
    assert(/^[\s,]*$/.test(body.replace(tuple, '')), 'No dynamic entry expressions');
    equal(
      entries.map((match) => match[1]),
      competitionGames,
    );
    equal(
      entries.map((match) => match[2]),
      [
        'startNativeCopsGame',
        'startNativeStreetGame',
        'startNativeLettersGame',
        'startNativeHistoryGame',
        'startNativeXiangqiGame',
      ],
    );
  }
  if (file === 'scripts/nine-wulong-smoke.mjs') {
    equal(
      [...text.matchAll(/game:\s*'([A-Za-z0-9-]+)'/g)].map((match) => match[1]),
      ['wulong-city'],
    );
    assert(text.includes("path.join(output, 'alipay', 'wulong-city')"));
    assert(text.includes("path.join(output, platform, 'wulong-city')"));
  }
}
function additiveAlipay(before, after) {
  assert.equal(typeof before, 'string');
  assert.equal(typeof after, 'string');
  const oldGuard = "if (!['wechat', 'bilibili', 'douyin', 'kuaishou'].includes(config?.platform))";
  const newGuard =
    "if (!['wechat', 'bilibili', 'douyin', 'kuaishou', 'alipay'].includes(config?.platform))";
  assert.equal(before.split(oldGuard).length, 2, 'Exactly one reviewed original platform guard');
  assert.equal(after.split(newGuard).length, 2, 'Exactly one additive platform guard');
  // Stronger than executable equivalence: every other byte, including comments,
  // strings and whitespace, must match the exact supplied publication baseline.
  assert.equal(before.replace(oldGuard, newGuard), after);
}

const NIGHT_HELPER = 'apps/shell-web/scripts/standalone-game-checks.mjs';
const NIGHT_SOURCE = 'games/local/night-overwatch';
const NIGHT_START = "  } else if (id === 'night-overwatch') {";
const NIGHT_END = "  } else if (id === 'carding-car') {";
const NIGHT_BASE_SHA = '59265bb06b3a6d4df0b56e912d0cfc83399dc6abd0980f476bffb6d2c83e8a4e';
const NIGHT_HEAD_SHA = '2405714061b6e1bb21dd0c9d6b69084c351021139c67f3afbba1f7c9ca7ea059';

function nightParts(text) {
  assert.equal(typeof text, 'string');
  assert.equal(text.split(NIGHT_START).length, 2, 'Unique Night branch required');
  assert.equal(text.split(NIGHT_END).length, 2, 'Unique next branch required');
  const start = text.indexOf(NIGHT_START),
    end = text.indexOf(NIGHT_END);
  assert(end > start, 'Ordered branch boundaries required');
  return [text.slice(0, start), text.slice(start, end), text.slice(end)];
}

/** Only the reviewed protocol-query substitution may narrow this shared helper. */
export function nightProtocolFileScopes({ changedPaths, readBase, readHead, gameSources }) {
  const scopes = new Map();
  if (!Array.isArray(changedPaths) || !changedPaths.includes(NIGHT_HELPER)) return scopes;
  try {
    assert(Array.isArray(gameSources));
    assert(gameSources.every((source) => typeof source === 'string'));
    assert.equal(gameSources.filter((source) => source === NIGHT_SOURCE).length, 1);
    const before = nightParts(readBase(NIGHT_HELPER));
    const after = nightParts(readHead(NIGHT_HELPER));
    assert.equal(digest(before[1]), NIGHT_BASE_SHA, 'Reviewed original Night body required');
    assert.equal(digest(after[1]), NIGHT_HEAD_SHA, 'Reviewed protocol-query Night body required');
    assert.equal(before[0], after[0], 'Every byte before Night must remain unchanged');
    assert.equal(before[2], after[2], 'Every byte after Night must remain unchanged');
    scopes.set(NIGHT_HELPER, [NIGHT_SOURCE]);
  } catch {
    // Missing inputs, unknown bodies and any shared-helper change remain unclassified.
  }
  return scopes;
}

/** Undefined entries deliberately leave unsupported/unknown changes blocked. */
export function nineNativeFileScopes({ changedPaths, readBase, readHead, games, packages }) {
  const scopes = new Map();
  for (const file of nineNativeScopePaths.filter((file) => changedPaths.includes(file))) {
    try {
      const definition = definitions[file],
        head = readHead(file);
      if (file === COMPETITION) additiveAlipay(readBase(file), head);
      else {
        inspectReviewed(file, head);
        let base;
        try {
          base = readBase(file);
        } catch {
          /* This exact digest was explicitly reviewed as a new file. */
        }
        assert(
          base === undefined || base === null || base === head,
          'Unreviewed pre-existing native baseline',
        );
      }
      for (const id of definition.games) {
        assert.equal(
          games.filter((game) => game.id === id).length,
          1,
          'Unique reviewed game identity required',
        );
        assert.equal(
          games.filter((game) => game.source === sources[id]).length,
          1,
          'Unique reviewed game source required',
        );
        assert.equal(
          games.filter((game) => game.id === id && game.source === sources[id]).length,
          1,
          'Reviewed catalog identity required',
        );
        assert(
          packages.some((pkg) => pkg.dir === sources[id]),
          'Reviewed game workspace required',
        );
      }
      for (const dir of definition.consumer_sources)
        assert(
          packages.some((pkg) => pkg.dir === dir),
          'Reviewed native host workspace required',
        );
      scopes.set(file, [
        ...definition.games.map((id) => sources[id]),
        ...definition.consumer_sources,
      ]);
    } catch {
      // Missing HEAD/baseline, different executable bytes, dynamic/import changes,
      // identities and similar paths receive no narrow mapping and must block.
    }
  }
  const nightGames = games.filter((game) => game.id === 'night-overwatch');
  if (
    nightGames.length === 1 &&
    nightGames[0].source === NIGHT_SOURCE &&
    packages.some((pkg) => pkg.dir === NIGHT_SOURCE)
  ) {
    for (const [file, affected] of nightProtocolFileScopes({
      changedPaths,
      readBase,
      readHead,
      gameSources: games.map((game) => game.source),
    }))
      scopes.set(file, affected);
  }
  return scopes;
}

/** Root runners invoke process.execPath + command.args from the repository root. */
export function nineNativeChecks(changedPaths, fileScopes) {
  return nineNativeScopePaths
    .filter((file) => changedPaths.includes(file) && fileScopes.has(file))
    .map((file) => {
      const definition = definitions[file];
      equal(fileScopes.get(file), [
        ...definition.games.map((id) => sources[id]),
        ...definition.consumer_sources,
      ]);
      return {
        path: file,
        type: definition.type,
        games: [...definition.games],
        consumer_sources: [...definition.consumer_sources],
        ...(definition.command
          ? { command: { ...definition.command, args: [...definition.command.args] } }
          : {}),
      };
    });
}
