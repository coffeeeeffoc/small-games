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
    'c7bff5384e989a5699dfec44dc22314ca7b2ff60e9add79ef7c4a09046aa7763',
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
    'f25351dd626b59d9f078c73c51d962a3358e42348d83a2cb6da604a229ddf6ec',
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
