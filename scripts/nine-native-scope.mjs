import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
const formatter = createRequire(import.meta.url);
const tapWorkflow = '.github/workflows/taptap-cocos.yml';
const tapWorkflowSha256 = '16b39a784ea6a1f1bc4553e4260d545452214c083aac0a61ba692da59b3c0851';

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
    '9dd613d33cad07cca9ea9998778b67e7a3fe7860bd1198cde2e623325a85fec2',
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
    '13625aca661242dc2229b48311a5c1eb7f5792bbb2f150e97f254aacf7302f71',
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
// Explicitly reviewed dcf7787 -> 6e356b1 channel-selection additions. These
// full-file hash pairs preserve all existing game flows/assertions and lock the
// NATIVE_PLATFORMS guards (including Wulong's conditional Alipay block).
const reviewedChannelSelectionBases = {
  'scripts/nine-canvas-games-smoke.mjs':
    '7f6550910297dc9870655c78923b791efa90aacd80ba9616488eefa30dccfe1e',
  'scripts/nine-wulong-smoke.mjs':
    'f2f1bdecd836acc9a1420d60c9bffddba563e8c4adbc85a0ccd7807df3d7472d',
};
const INVENTORY_BUILDER = 'apps/shell-minigame/scripts/nine-games-build.mjs';
const INVENTORY_BASE_SHA = '6f19a3c8a5e9abcc77c07bd4c0b0182e8ff0129776ca5c6d5716ab475b28f7c8';
const INVENTORY_HEAD_SHA = '7e71113977277fb08ffbd6368e3d345675f8a1ee7ed40fee6daad23ed393f0bb';
const inventoryProofValues = new WeakSet();

/** Only repair the package-root-relative source inventory filter, not the builder. */
export function nativeSourceInventoryFileScopes({
  changedPaths,
  readBase,
  readHead,
  games,
  packages,
}) {
  const scopes = new Map();
  if (!changedPaths.includes(INVENTORY_BUILDER)) return scopes;
  try {
    const before = readBase(INVENTORY_BUILDER),
      after = readHead(INVENTORY_BUILDER);
    assert.equal(digest(before), INVENTORY_BASE_SHA);
    assert.equal(digest(after), INVENTORY_HEAD_SHA);
    const oldExpression = "!file.includes('/.scratch/')";
    const newExpression =
      "!path.relative(root, file).replaceAll('\\\\', '/').startsWith('.scratch/')";
    assert.equal(before.split(oldExpression).length, 2);
    assert.equal(after.split(newExpression).length, 2);
    assert.equal(before.replace(oldExpression, newExpression), after);
    const ids = [...competitionGames, 'travel-bund', 'wulong-city'];
    const affected = ids.map((id) => nativeGameSources[id]);
    for (const [index, id] of ids.entries()) {
      assert.equal(games.filter((game) => game.id === id).length, 1);
      assert.equal(games.filter((game) => game.source === affected[index]).length, 1);
      assert.equal(
        games.filter((game) => game.id === id && game.source === affected[index]).length,
        1,
      );
      assert(packages.some((pkg) => pkg.dir === affected[index]));
    }
    inventoryProofValues.add(affected);
    scopes.set(INVENTORY_BUILDER, affected);
  } catch {
    /* Missing base, altered bytes or identities never waive Creator builds. */
  }
  return scopes;
}
const TAP_NORMALIZER_HEAD_SHA = '02247727d9d13015d7a3362bc07273595522b0d65222e853a476d99b8f6c505a';
const tapNormalizerProofValues = new WeakSet();

/** Three TapTap-only generator additions; every other producer byte must match. */
export function tapNormalizerFileScopes({ changedPaths, readBase, readHead, games, packages }) {
  const scopes = new Map();
  if (!changedPaths.includes(INVENTORY_BUILDER)) return scopes;
  try {
    const before = readBase(INVENTORY_BUILDER),
      after = readHead(INVENTORY_BUILDER);
    assert.equal(digest(before), INVENTORY_HEAD_SHA);
    assert.equal(digest(after), TAP_NORMALIZER_HEAD_SHA);
    const variable =
      "    const tapNormalize = path.join(root, 'platforms/taptap/normalize.mjs');\n";
    const imported =
      "      ${config.platform === 'taptap' ? `import {normalizeTapTapSdk} from ${JSON.stringify(tapNormalize)};` : ''}\n";
    const oldSdk =
      "const baseSdk=${config.platform === 'alipay' ? 'normalizeAlipaySdk(raw)' : 'raw'};";
    const newSdk =
      "const baseSdk=${config.platform === 'alipay' ? 'normalizeAlipaySdk(raw)' : config.platform === 'taptap' ? 'normalizeTapTapSdk(raw)' : 'raw'};";
    for (const addition of [variable, imported, newSdk])
      assert.equal(after.split(addition).length, 2);
    assert.equal(after.replace(variable, '').replace(imported, '').replace(newSdk, oldSdk), before);
    const affected = [...competitionGames, 'travel-bund', 'wulong-city'].map((id) => {
      const source = nativeGameSources[id];
      assert.equal(games.filter((game) => game.id === id).length, 1);
      assert.equal(games.filter((game) => game.source === source).length, 1);
      assert.equal(games.filter((game) => game.id === id && game.source === source).length, 1);
      assert(packages.some((pkg) => pkg.dir === source));
      return source;
    });
    for (const dir of [MINIGAME, TAPTAP]) assert(packages.some((pkg) => pkg.dir === dir));
    affected.push(MINIGAME, TAPTAP);
    tapNormalizerProofValues.add(affected);
    scopes.set(INVENTORY_BUILDER, affected);
  } catch {
    // Any other generator/control-flow change retains all genuine build consumers.
  }
  return scopes;
}
const tapCompetitionDefinitions = {
  'platforms/competition/client.js': {
    base: 'b593f1ff501d6451e550d4645295694a3d31f75c96352221a3d56162b9ec244a',
    head: 'fe6eafe4a5446940c318f4121b9d1160ac71eccd2878a61c8214a195ffda66e1',
    original:
      "  const nativePlatforms = { wechat: 'wx', bilibili: 'bl', douyin: 'tt', kuaishou: 'ks' };\n",
    replacement:
      "  const nativePlatforms = {\n    wechat: 'wx',\n    bilibili: 'bl',\n    douyin: 'tt',\n    kuaishou: 'ks',\n    taptap: 'tap',\n  };\n",
    games: [...competitionGames, 'carding-car'],
  },
  'platforms/kart-sharing.js': {
    base: 'f90719f0ee923af4180d94e96b785354ad86c12f7198e93756e9245d1043b0a6',
    head: '7997a39372053d90eac5425186ba62e501837189c63d74d92fc664bcf7edff9c',
    changes: [
      [
        "    kuaishou: typeof ks !== 'undefined' ? ks : undefined,\n",
        "    kuaishou: typeof ks !== 'undefined' ? ks : undefined,\n    taptap: typeof tap !== 'undefined' ? tap : undefined,\n",
      ],
      [
        'sdks.bilibili || sdks.wechat || sdks.douyin || sdks.kuaishou;',
        'sdks.bilibili || sdks.wechat || sdks.douyin || sdks.kuaishou || sdks.taptap;',
      ],
    ],
    games: ['carding-car'],
  },
  'scripts/kart-sharing.test.mjs': {
    base: '9775ef325bb29ca5e07f883489482fd6e9fb262a868e344f513ba3b54cb75d89',
    head: '4fdf3780064b4de080458ddca847be9d9449426783b9aa79645f8f8fd09f9c69',
    original: "  kuaishou: 'ks',\n",
    replacement: "  kuaishou: 'ks',\n  taptap: 'tap',\n",
    games: ['carding-car'],
  },
  [COMPETITION]: {
    base: 'c68d5a4ce038bbc861a66fcda47187339059e83d3eaadd70b4e8a8053a3501e6',
    head: '37e2f19ed16a3d6c01ecbbf5d953265f1134a560af8addb2dcf890d37630f2c8',
    original:
      "if (!['wechat', 'bilibili', 'douyin', 'kuaishou', 'alipay'].includes(config?.platform))",
    replacement:
      "if (!['wechat', 'bilibili', 'douyin', 'kuaishou', 'alipay', 'taptap'].includes(config?.platform))",
    games: competitionGames,
  },
};
const tapCompetitionProofValues = new WeakMap();

/** Native recognition is additive; the existing H5/five-channel protocol is byte-identical. */
export function tapCompetitionFileScopes({ changedPaths, readBase, readHead, games, packages }) {
  const scopes = new Map();
  for (const [file, review] of Object.entries(tapCompetitionDefinitions)) {
    if (!changedPaths.includes(file)) continue;
    try {
      const before = readBase(file),
        after = readHead(file);
      assert.equal(digest(before), review.base);
      assert.equal(digest(after), review.head);
      let derived = before;
      for (const [original, replacement] of review.changes || [
        [review.original, review.replacement],
      ]) {
        assert.equal(derived.split(original).length, 2);
        assert.equal(after.split(replacement).length, 2);
        derived = derived.replace(original, replacement);
      }
      assert.equal(derived, after);
      const affected = review.games.map((id) => {
        const source = nativeGameSources[id];
        assert.equal(games.filter((game) => game.id === id).length, 1);
        assert.equal(games.filter((game) => game.source === source).length, 1);
        assert.equal(games.filter((game) => game.id === id && game.source === source).length, 1);
        assert(packages.some((pkg) => pkg.dir === source));
        return source;
      });
      for (const dir of [MINIGAME, TAPTAP]) assert(packages.some((pkg) => pkg.dir === dir));
      affected.push(MINIGAME, TAPTAP);
      tapCompetitionProofValues.set(affected, { file, review });
      scopes.set(file, affected);
    } catch {
      // Other protocol changes retain all old/new consumers and Creator requirements.
    }
  }
  return scopes;
}
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
  if (changedPaths.includes(tapWorkflow)) {
    try {
      assert.equal(digest(readHead(tapWorkflow).replaceAll('\r\n', '\n')), tapWorkflowSha256);
      const consumers = [
        MINIGAME,
        'platforms/taptap',
        ...cocosGames.map((game) => nativeGameSources[game]),
      ];
      assert(consumers.every((dir) => packages.some((pkg) => pkg.dir === dir)));
      assert(
        cocosGames.every(
          (id) =>
            games.filter((game) => game.id === id && game.source === nativeGameSources[id])
              .length === 1,
        ),
      );
      scopes.set(tapWorkflow, consumers);
    } catch {
      // Changed commands, permissions, references or consumers need fresh review.
    }
  }
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
          base === undefined ||
            base === null ||
            base === head ||
            (typeof base === 'string' &&
              reviewedChannelSelectionBases[file] !== undefined &&
              digest(base) === reviewedChannelSelectionBases[file]),
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
  const travelTool = 'scripts/nine-travel-native-smoke.mjs';
  if (changedPaths.includes(travelTool)) {
    try {
      const head = readHead(travelTool);
      assert.equal(
        digest(head),
        '16a6a0a4834fd4d48c1f8a3cd8321403f6c5855a2acd655472d55caa6dc3d719',
      );
      let base;
      try {
        base = readBase(travelTool);
      } catch {
        /* Explicit reviewed new tool. */
      }
      assert(base === undefined || base === null || base === head);
      assert.equal(games.filter((game) => game.id === 'travel-bund').length, 1);
      assert.equal(games.filter((game) => game.source === 'games/local/travel-bund').length, 1);
      assert.equal(
        games.filter(
          (game) => game.id === 'travel-bund' && game.source === 'games/local/travel-bund',
        ).length,
        1,
      );
      assert(packages.some((pkg) => pkg.dir === 'games/local/travel-bund'));
      scopes.set(travelTool, ['games/local/travel-bund']);
    } catch {
      /* Unknown tool bytes or identity remain undefined. */
    }
  }
  for (const file of [
    'platforms/competition/client.js',
    'platforms/competition/format.js',
    'platforms/kart-sharing.js',
  ]) {
    if (!changedPaths.includes(file)) continue;
    try {
      for (const text of [readBase(file), readHead(file)]) {
        assert.equal(typeof text, 'string');
        assert(text.trim());
        assert(
          !/\bimport\b|\brequire\s*\(|\bexport\s*[^;\n]*\bfrom\s*['"]/m.test(text),
          'New shared module dependencies require ownership review',
        );
      }
      const consumers =
        file === 'platforms/kart-sharing.js'
          ? ['carding-car']
          : file.endsWith('client.js')
            ? [...competitionGames, 'carding-car']
            : competitionGames;
      for (const id of consumers) {
        const source = id === 'carding-car' ? 'games/local/carding-car' : sources[id];
        assert.equal(games.filter((game) => game.id === id).length, 1);
        assert.equal(games.filter((game) => game.source === source).length, 1);
        assert.equal(games.filter((game) => game.id === id && game.source === source).length, 1);
        assert(packages.some((pkg) => pkg.dir === source));
      }
      scopes.set(
        file,
        consumers.map((id) => (id === 'carding-car' ? 'games/local/carding-car' : sources[id])),
      );
    } catch {
      /* Existing shared consumers are proven only without new module imports. */
    }
  }
  for (const file of ['platforms/h5/dev-mode.js', 'platforms/h5/dev-mode.d.ts']) {
    if (!changedPaths.includes(file)) continue;
    try {
      // Mirrors the locked devModeTargets producer's actual copy destinations.
      for (const reader of [readBase, readHead]) {
        assert.equal(
          digest(reader('scripts/sync-game-dev-mode.mjs')),
          '0456683f14b20bbad0664907a9b00e1bd7825732345f637a4f67156cb94f107d',
        );
        assert.equal(typeof reader(file), 'string');
      }
      const consumers = ['apps/shell-web'];
      assert(packages.some((pkg) => pkg.dir === consumers[0]));
      assert(
        /<script\b[^>]*\bsrc=["']\.\/dev-mode\.js["'][^>]*><\/script>/.test(
          readHead('apps/shell-web/index.html'),
        ),
      );
      for (const pkg of packages.filter((pkg) =>
        /^games\/(?:local|submodules)\/[^/]+$/.test(pkg.dir),
      )) {
        const metadata = JSON.parse(readHead(pkg.dir + '/package.json'));
        const build = metadata.scripts?.build || '';
        const generated = /\bnode scripts\/build\.mjs web-mobile\b/.test(build);
        let entry;
        if (!generated) {
          try {
            entry = readHead(pkg.dir + '/index.html');
          } catch {
            entry = readHead(pkg.dir + '/static-site/index.html');
          }
          assert(/<script\b[^>]*\bsrc=["']\.\/dev-mode\.js["'][^>]*><\/script>/.test(entry));
        }
        const runtime = generated
          ? 'scripts/dev-mode.js'
          : (() => {
              try {
                readHead(pkg.dir + '/index.html');
                return 'dev-mode.js';
              } catch {
                return 'static-site/dev-mode.js';
              }
            })();
        assert.equal(
          typeof readHead(
            pkg.dir + '/' + runtime.replace(/\.js$/, file.endsWith('.d.ts') ? '.d.ts' : '.js'),
          ),
          'string',
        );
        if (!/\bvite\s+build\b/.test(build) && build) {
          const producer = build.match(/\bnode\s+(\S+)/)?.[1];
          assert(producer && readHead(pkg.dir + '/' + producer).includes('dev-mode.js'));
        }
        consumers.push(pkg.dir);
      }
      assert.equal(new Set(consumers).size, consumers.length);
      scopes.set(file, consumers);
    } catch {
      /* Missing copy destination/import/reference or changed producer stays blocked. */
    }
  }
  for (const [file, affected] of nativeSourceInventoryFileScopes({
    changedPaths,
    readBase,
    readHead,
    games,
    packages,
  }))
    scopes.set(file, affected);
  for (const [file, affected] of tapNormalizerFileScopes({
    changedPaths,
    readBase,
    readHead,
    games,
    packages,
  }))
    scopes.set(file, affected);
  for (const [file, affected] of tapCompetitionFileScopes({
    changedPaths,
    readBase,
    readHead,
    games,
    packages,
  }))
    scopes.set(file, affected);
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

// Reviewed sourceFiles ownership from the final 35 CJS manifests. Kept in source,
// never loaded from ignored dist during incremental planning (producer dcf7787). Package dist inputs
// map to their canonical TypeScript sources; native/generated inputs are regenerated.
const nativeSourceGroups = [
  {
    paths: [
      'games/local/cops-robbers-realtime/src/challenge-finals.js',
      'games/local/cops-robbers-realtime/src/competition-renderer.js',
      'games/local/cops-robbers-realtime/src/engine.js',
      'games/local/cops-robbers-realtime/src/layout-variants.js',
      'games/local/cops-robbers-realtime/src/level-safety.js',
      'games/local/cops-robbers-realtime/src/levels.js',
      'games/local/cops-robbers-realtime/src/native.js',
      'games/local/cops-robbers-realtime/src/quick-trials.js',
      'games/local/cops-robbers-realtime/src/records.js',
      'games/local/cops-robbers-realtime/src/renderer.js',
      'games/local/cops-robbers-realtime/src/role-appearance.js',
    ],
    targets: [
      'cops-robbers-realtime:alipay',
      'cops-robbers-realtime:bilibili',
      'cops-robbers-realtime:douyin',
      'cops-robbers-realtime:kuaishou',
      'cops-robbers-realtime:wechat',
    ],
  },
  {
    paths: [
      'apps/shell-minigame/scripts/nine-games-build.mjs',
      'apps/shell-minigame/scripts/nine-games-targets.mjs',
    ],
    targets: [
      'cops-robbers-realtime:alipay',
      'cops-robbers-realtime:bilibili',
      'cops-robbers-realtime:douyin',
      'cops-robbers-realtime:kuaishou',
      'cops-robbers-realtime:wechat',
      'cops-robbers:alipay',
      'cops-robbers:bilibili',
      'cops-robbers:douyin',
      'cops-robbers:kuaishou',
      'cops-robbers:wechat',
      'letters-words2:alipay',
      'letters-words2:bilibili',
      'letters-words2:douyin',
      'letters-words2:kuaishou',
      'letters-words2:wechat',
      'travel-bund:alipay',
      'travel-bund:bilibili',
      'travel-bund:douyin',
      'travel-bund:kuaishou',
      'travel-bund:wechat',
      'vibeJam-myself-history-guess:alipay',
      'vibeJam-myself-history-guess:bilibili',
      'vibeJam-myself-history-guess:douyin',
      'vibeJam-myself-history-guess:kuaishou',
      'vibeJam-myself-history-guess:wechat',
      'wulong-city:alipay',
      'wulong-city:bilibili',
      'wulong-city:douyin',
      'wulong-city:kuaishou',
      'wulong-city:wechat',
      'xiangqi-five:alipay',
      'xiangqi-five:bilibili',
      'xiangqi-five:douyin',
      'xiangqi-five:kuaishou',
      'xiangqi-five:wechat',
    ],
  },
  {
    paths: ['apps/shell-minigame/src/competition-availability.mjs'],
    targets: [
      'cops-robbers-realtime:alipay',
      'cops-robbers-realtime:bilibili',
      'cops-robbers-realtime:douyin',
      'cops-robbers-realtime:kuaishou',
      'cops-robbers-realtime:wechat',
      'cops-robbers:alipay',
      'cops-robbers:bilibili',
      'cops-robbers:douyin',
      'cops-robbers:kuaishou',
      'cops-robbers:wechat',
      'letters-words2:alipay',
      'letters-words2:bilibili',
      'letters-words2:douyin',
      'letters-words2:kuaishou',
      'letters-words2:wechat',
      'travel-bund:alipay',
      'travel-bund:bilibili',
      'travel-bund:douyin',
      'travel-bund:kuaishou',
      'travel-bund:wechat',
      'vibeJam-myself-history-guess:alipay',
      'vibeJam-myself-history-guess:bilibili',
      'vibeJam-myself-history-guess:douyin',
      'vibeJam-myself-history-guess:kuaishou',
      'vibeJam-myself-history-guess:wechat',
      'xiangqi-five:alipay',
      'xiangqi-five:bilibili',
      'xiangqi-five:douyin',
      'xiangqi-five:kuaishou',
      'xiangqi-five:wechat',
    ],
  },
  {
    paths: [
      'platforms/competition/client.js',
      'platforms/competition/format.js',
      'platforms/competition/native.js',
    ],
    targets: [
      'cops-robbers-realtime:alipay',
      'cops-robbers-realtime:bilibili',
      'cops-robbers-realtime:douyin',
      'cops-robbers-realtime:kuaishou',
      'cops-robbers-realtime:wechat',
      'cops-robbers:alipay',
      'cops-robbers:bilibili',
      'cops-robbers:douyin',
      'cops-robbers:kuaishou',
      'cops-robbers:wechat',
      'letters-words2:alipay',
      'letters-words2:bilibili',
      'letters-words2:douyin',
      'letters-words2:kuaishou',
      'letters-words2:wechat',
      'vibeJam-myself-history-guess:alipay',
      'vibeJam-myself-history-guess:bilibili',
      'vibeJam-myself-history-guess:douyin',
      'vibeJam-myself-history-guess:kuaishou',
      'vibeJam-myself-history-guess:wechat',
      'xiangqi-five:alipay',
      'xiangqi-five:bilibili',
      'xiangqi-five:douyin',
      'xiangqi-five:kuaishou',
      'xiangqi-five:wechat',
    ],
  },
  {
    paths: ['platforms/alipay/build.mjs', 'platforms/alipay/normalize.mjs'],
    targets: [
      'cops-robbers-realtime:alipay',
      'cops-robbers:alipay',
      'letters-words2:alipay',
      'travel-bund:alipay',
      'vibeJam-myself-history-guess:alipay',
      'wulong-city:alipay',
      'xiangqi-five:alipay',
    ],
  },
  {
    paths: ['platforms/bilibili/build.mjs'],
    targets: [
      'cops-robbers-realtime:bilibili',
      'cops-robbers:bilibili',
      'letters-words2:bilibili',
      'travel-bund:bilibili',
      'vibeJam-myself-history-guess:bilibili',
      'wulong-city:bilibili',
      'xiangqi-five:bilibili',
    ],
  },
  {
    paths: ['platforms/bilibili/native-entry.mjs'],
    targets: [
      'cops-robbers-realtime:bilibili',
      'cops-robbers:bilibili',
      'letters-words2:bilibili',
      'travel-bund:bilibili',
      'vibeJam-myself-history-guess:bilibili',
      'xiangqi-five:bilibili',
    ],
  },
  {
    paths: ['platforms/douyin/build.mjs'],
    targets: [
      'cops-robbers-realtime:douyin',
      'cops-robbers:douyin',
      'letters-words2:douyin',
      'travel-bund:douyin',
      'vibeJam-myself-history-guess:douyin',
      'wulong-city:douyin',
      'xiangqi-five:douyin',
    ],
  },
  {
    paths: ['platforms/kuaishou/build.mjs'],
    targets: [
      'cops-robbers-realtime:kuaishou',
      'cops-robbers:kuaishou',
      'letters-words2:kuaishou',
      'travel-bund:kuaishou',
      'vibeJam-myself-history-guess:kuaishou',
      'wulong-city:kuaishou',
      'xiangqi-five:kuaishou',
    ],
  },
  {
    paths: ['platforms/wechat/build.mjs'],
    targets: [
      'cops-robbers-realtime:wechat',
      'cops-robbers:wechat',
      'letters-words2:wechat',
      'travel-bund:wechat',
      'vibeJam-myself-history-guess:wechat',
      'wulong-city:wechat',
      'xiangqi-five:wechat',
    ],
  },
  {
    paths: [
      'games/local/cops-robbers/src/competition-renderer.js',
      'games/local/cops-robbers/src/duel-levels.js',
      'games/local/cops-robbers/src/duel.js',
      'games/local/cops-robbers/src/engine.js',
      'games/local/cops-robbers/src/levels.js',
      'games/local/cops-robbers/src/native.js',
      'games/local/cops-robbers/src/quick-trials.js',
      'games/local/cops-robbers/src/relay.js',
      'games/local/cops-robbers/src/role-appearance.js',
    ],
    targets: [
      'cops-robbers:alipay',
      'cops-robbers:bilibili',
      'cops-robbers:douyin',
      'cops-robbers:kuaishou',
      'cops-robbers:wechat',
    ],
  },
  {
    paths: [
      'games/local/letters-words2/challenge.js',
      'games/local/letters-words2/competition-renderer.js',
      'games/local/letters-words2/engine.js',
      'games/local/letters-words2/library.js',
      'games/local/letters-words2/native-platform.js',
      'games/local/letters-words2/native-session.js',
      'games/local/letters-words2/native.js',
    ],
    targets: [
      'letters-words2:alipay',
      'letters-words2:bilibili',
      'letters-words2:douyin',
      'letters-words2:kuaishou',
      'letters-words2:wechat',
    ],
  },
  {
    paths: [
      'games/local/travel-bund/native/audio.ts',
      'games/local/travel-bund/native/build-native.mjs',
      'games/local/travel-bund/native/diagnostics.ts',
      'games/local/travel-bund/native/draco.ts',
      'games/local/travel-bund/native/generate-sources.mjs',
      'games/local/travel-bund/native/hud.ts',
      'games/local/travel-bund/native/index.tsx',
      'games/local/travel-bund/native/input.ts',
      'games/local/travel-bund/native/prepare-assets.mjs',
      'games/local/travel-bund/native/resources.ts',
      'games/local/travel-bund/native/sha256.ts',
      'games/local/travel-bund/native/state.ts',
      'games/local/travel-bund/native/suspend.ts',
      'games/local/travel-bund/native/utf8.ts',
      'games/local/travel-bund/native/wasm.ts',
      'games/local/travel-bund/src/Scene.tsx',
      'games/local/travel-bund/src/StreetLife.tsx',
      'games/local/travel-bund/src/camera-controls.ts',
      'games/local/travel-bund/src/clouds.ts',
      'games/local/travel-bund/src/facade-detail.ts',
      'games/local/travel-bund/src/life.ts',
      'games/local/travel-bund/src/photo-hunts.ts',
      'games/local/travel-bund/src/physics.ts',
      'games/local/travel-bund/src/render-budget.ts',
      'games/local/travel-bund/src/render-settings.ts',
      'games/local/travel-bund/src/routes.ts',
      'games/local/travel-bund/src/settings.ts',
      'games/local/travel-bund/src/world.ts',
    ],
    targets: [
      'travel-bund:alipay',
      'travel-bund:bilibili',
      'travel-bund:douyin',
      'travel-bund:kuaishou',
      'travel-bund:wechat',
    ],
  },
  {
    paths: ['platforms/alipay/native-resources.mjs'],
    targets: ['travel-bund:alipay', 'vibeJam-myself-history-guess:alipay'],
  },
  {
    paths: ['platforms/bilibili/native-resources.mjs'],
    targets: ['travel-bund:bilibili', 'vibeJam-myself-history-guess:bilibili'],
  },
  {
    paths: ['platforms/douyin/native-resources.mjs'],
    targets: ['travel-bund:douyin', 'vibeJam-myself-history-guess:douyin'],
  },
  {
    paths: ['platforms/kuaishou/native-resources.mjs'],
    targets: ['travel-bund:kuaishou', 'vibeJam-myself-history-guess:kuaishou'],
  },
  {
    paths: ['platforms/wechat/native-resources.mjs'],
    targets: ['travel-bund:wechat', 'vibeJam-myself-history-guess:wechat'],
  },
  {
    paths: [
      'apps/shell-minigame/scripts/nine-history-assets.mjs',
      'games/local/vibeJam-myself-history-guess/competition-renderer.js',
      'games/local/vibeJam-myself-history-guess/native-assets.mjs',
      'games/local/vibeJam-myself-history-guess/native-scenes.js',
      'games/local/vibeJam-myself-history-guess/native.js',
      'games/local/vibeJam-myself-history-guess/public/assets/angkor.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/athens.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/babylon.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/beijing.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/changan.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/competition/57ea76ec39a9758f.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/competition/864ea525e77b9d47.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/competition/977b70a72c57b5bf.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/competition/baeb7a17ce9ee29f.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/competition/d555a6d18aca817a.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/dujiangyan.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/dunhuang.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/florence.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/giza.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/hangzhou-song.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/istanbul.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/kaifeng.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/kyoto-heian.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/lhasa-potala.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/longmen.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/macau.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/machu-picchu.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/new-york.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/paris.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/petra.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/pingyao.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/qin-mausoleum.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/quanzhou.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/rome.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/shanghai.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/suzhou-garden.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/venice.webp',
      'games/local/vibeJam-myself-history-guess/public/assets/yinxu.webp',
      'games/local/vibeJam-myself-history-guess/public/data/world.json',
      'games/local/vibeJam-myself-history-guess/src/catalog.js',
      'games/local/vibeJam-myself-history-guess/src/cities.js',
      'games/local/vibeJam-myself-history-guess/src/game.js',
      'games/local/vibeJam-myself-history-guess/src/routes.js',
      'games/local/vibeJam-myself-history-guess/src/scenes/angkor.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/athens.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/babylon.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/beijing.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/changan.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/dujiangyan.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/dunhuang.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/florence.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/giza.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/hangzhou-song.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/istanbul.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/kaifeng.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/kyoto-heian.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/lhasa-potala.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/longmen.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/macau.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/machu-picchu.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/new-york.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/paris.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/petra.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/pingyao.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/qin-mausoleum.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/quanzhou.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/rome.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/shanghai.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/suzhou-garden.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/venice.json',
      'games/local/vibeJam-myself-history-guess/src/scenes/yinxu.json',
    ],
    targets: [
      'vibeJam-myself-history-guess:alipay',
      'vibeJam-myself-history-guess:bilibili',
      'vibeJam-myself-history-guess:douyin',
      'vibeJam-myself-history-guess:kuaishou',
      'vibeJam-myself-history-guess:wechat',
    ],
  },
  {
    paths: ['platforms/alipay/src/index.ts'],
    targets: ['wulong-city:alipay'],
  },
  {
    paths: [
      'games/local/wulong-city/level-order.js',
      'games/local/wulong-city/levels-data.js',
      'games/local/wulong-city/levels.js',
      'games/local/wulong-city/native/canvas.js',
      'games/local/wulong-city/native/manifest.json',
      'games/local/wulong-city/native/shared-source.mjs',
      'games/local/wulong-city/render.js',
      'packages/ad-config/src/index.ts',
      'packages/ad-config/src/managed.ts',
      'packages/ad-config/src/policy.ts',
      'packages/ad-runtime/src/index.ts',
      'packages/ad-runtime/src/runtime.ts',
      'packages/game-contract/src/capabilities.ts',
      'packages/game-contract/src/errors.ts',
      'packages/game-contract/src/index.ts',
      'packages/game-contract/src/schemas.ts',
      'packages/game-host/src/browser.ts',
      'packages/game-host/src/in-memory.ts',
      'packages/game-host/src/index.ts',
      'packages/game-host/src/ports.ts',
      'packages/game-host/src/session.ts',
      'packages/game-host/src/storage.ts',
      'packages/game-host/src/test.ts',
      'packages/native-game-shell/src/ads.ts',
      'packages/native-game-shell/src/host.ts',
      'packages/native-game-shell/src/index.ts',
      'packages/native-game-shell/src/media.ts',
      'packages/native-game-shell/src/render-surface.ts',
      'packages/native-game-shell/src/shell.ts',
      'packages/native-game-shell/src/viewport.ts',
    ],
    targets: [
      'wulong-city:alipay',
      'wulong-city:bilibili',
      'wulong-city:douyin',
      'wulong-city:kuaishou',
      'wulong-city:wechat',
    ],
  },
  {
    paths: ['packages/canvas-game-adapter/src/index.ts', 'platforms/bilibili/src/index.ts'],
    targets: ['wulong-city:bilibili'],
  },
  {
    paths: ['platforms/douyin/src/index.ts'],
    targets: ['wulong-city:douyin'],
  },
  {
    paths: ['platforms/kuaishou/src/index.ts'],
    targets: ['wulong-city:kuaishou'],
  },
  {
    paths: ['platforms/wechat/src/index.ts'],
    targets: ['wulong-city:wechat'],
  },
  {
    paths: [
      'games/submodules/xiangqi-five/challenges.js',
      'games/submodules/xiangqi-five/competition-renderer.js',
      'games/submodules/xiangqi-five/computer.js',
      'games/submodules/xiangqi-five/game.js',
      'games/submodules/xiangqi-five/local-game.js',
      'platforms/competition/xiangqi-five/native.js',
    ],
    targets: [
      'xiangqi-five:alipay',
      'xiangqi-five:bilibili',
      'xiangqi-five:douyin',
      'xiangqi-five:kuaishou',
      'xiangqi-five:wechat',
    ],
  },
];

const nativePlatforms = ['wechat', 'bilibili', 'douyin', 'kuaishou', 'alipay'];
const nativeGameSources = {
  ...sources,
  'travel-bund': 'games/local/travel-bund',
  'carding-car': 'games/local/carding-car',
  'night-overwatch': 'games/local/night-overwatch',
};
const nativeGraph = new Map(
  nativeSourceGroups.flatMap((group) => group.paths.map((file) => [file, group.targets])),
);

// TapTap has its own builder and official package conversion. The five-channel
// release batch stays fixed; shared game sources also have this sixth consumer.
const TAPTAP = 'platforms/taptap';
const taptapScripts = [
  'apps/shell-minigame/scripts/taptap-build.mjs',
  'apps/shell-minigame/scripts/taptap-targets.mjs',
  'apps/shell-minigame/scripts/taptap-package.mjs',
  'apps/shell-minigame/scripts/taptap-cocos.mjs',
  'apps/shell-minigame/scripts/taptap-cocos-inputs.mjs',
  'apps/shell-minigame/scripts/taptap-smoke.mjs',
  'apps/shell-minigame/scripts/taptap-travel-smoke.mjs',
  'apps/shell-minigame/scripts/taptap-cocos-import.mjs',
  'apps/shell-minigame/scripts/taptap-login.mjs',
];
const cocosGames = ['carding-car', 'night-overwatch'];
const taptapTargets = Object.keys(nativeGameSources).map((game) => `${game}:taptap`);
const taptapGraph = new Map();
taptapGraph.set(
  tapWorkflow,
  cocosGames.map((game) => game + ':taptap'),
);
for (const [file, targets] of nativeGraph) {
  if (/^platforms\/(?:wechat|bilibili|douyin|kuaishou|alipay)\//.test(file)) continue;
  taptapGraph.set(file, [...new Set(targets.map((target) => target.split(':')[0] + ':taptap'))]);
}
for (const file of taptapScripts) taptapGraph.set(file, taptapTargets);
for (const file of ['taptap-cocos.mjs', 'taptap-cocos-import.mjs', 'taptap-cocos-inputs.mjs'])
  taptapGraph.set(
    'apps/shell-minigame/scripts/' + file,
    cocosGames.map((game) => game + ':taptap'),
  );
taptapGraph.set('apps/shell-minigame/scripts/taptap-travel-smoke.mjs', ['travel-bund:taptap']);
for (const file of ['build.mjs', 'normalize.mjs', 'package.json'])
  taptapGraph.set(
    `${TAPTAP}/${file}`,
    taptapTargets.filter((target) => !cocosGames.some((game) => target.startsWith(game + ':'))),
  );
taptapGraph.set(`${TAPTAP}/src/index.ts`, ['wulong-city:taptap']);
taptapGraph.set(`${TAPTAP}/login.cjs`, taptapTargets);
taptapGraph.set(`${TAPTAP}/native-resources.mjs`, [
  'travel-bund:taptap',
  'vibeJam-myself-history-guess:taptap',
]);

/** Reviewed provenance graph, independent of generated/ignored build artifacts. */
export function nineNativeDependencySources() {
  const combined = new Map([...nativeGraph].map(([file, targets]) => [file, [...targets]]));
  for (const [file, targets] of taptapGraph)
    combined.set(file, [...(combined.get(file) || []), ...targets]);
  return [...combined].map(([file, targets]) => ({ file, targets: [...targets] }));
}

export function isNineNativeOnlyPath(file) {
  if (file === tapWorkflow) return true;
  if (['platforms/competition/client.js', 'platforms/competition/format.js'].includes(file))
    return false;
  if (file.startsWith('platforms/') && (nativeGraph.has(file) || taptapGraph.has(file)))
    return true;
  if (taptapScripts.includes(file) || taptapScripts.includes(file.replace(/\.test\.mjs$/, '.mjs')))
    return true;
  if (
    file === 'scripts/nine-travel-native-smoke.mjs' ||
    file === 'games/local/letters-words2/tests/native-bundle.test.mjs'
  )
    return true;
  if (file.startsWith('apps/shell-minigame/scripts/nine-')) return true;
  if (file === 'apps/shell-minigame/src/competition-availability.mjs') return true;
  return (
    Object.values(nativeGameSources).some((source) => {
      if (!file.startsWith(source + '/')) return false;
      const relative = file.slice(source.length + 1);
      return relative.startsWith('native/') || /^(?:src\/)?native(?:[-.][^/]*)?$/.test(relative);
    }) || nineNativeScopePaths.includes(file)
  );
}

function guardedTapConsumers(text, specifier) {
  const review = {
    './taptap-cocos.mjs': ['selected.cocos', cocosGames],
    './taptap-cocos-import.mjs': ['selected.cocos', cocosGames],
    './taptap-travel-smoke.mjs': ["game === 'travel-bund'", ['travel-bund']],
  }[specifier];
  if (!review) return null;
  try {
    const ast = formatter('prettier/plugins/babel').parsers.babel.parse(text, {});
    const matches = [];
    function visit(node, ancestors = []) {
      if (Array.isArray(node)) {
        for (const child of node) visit(child, ancestors);
      } else if (node && typeof node === 'object' && typeof node.type === 'string') {
        if (
          node.type === 'ImportExpression' &&
          node.source?.type === 'StringLiteral' &&
          node.source.value === specifier
        )
          matches.push({ node, ancestors });
        for (const [key, child] of Object.entries(node))
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
            visit(child, [...ancestors, node]);
      }
    }
    visit(ast);
    assert.equal(matches.length, 1, 'Exactly one guarded TapTap import required');
    const { node, ancestors } = matches[0];
    const [condition, consumers] = review;
    const guard = ancestors.findLast((parent) => parent.type === 'IfStatement');
    assert(
      guard?.consequent.type === 'BlockStatement' &&
        text.slice(guard.test.start, guard.test.end) === condition &&
        ancestors.includes(guard.consequent),
    );
    const declaration = guard.consequent.body[0];
    assert(
      declaration?.type === 'VariableDeclaration' &&
        declaration.kind === 'const' &&
        declaration.declarations.length === 1 &&
        declaration.declarations[0].init?.type === 'AwaitExpression' &&
        declaration.declarations[0].init.argument === node,
    );
    return consumers;
  } catch {
    // New guards, duplicated imports and disguised text retain every importer consumer.
    return null;
  }
}

/** Same explicit game/channel plan is consumed by hooks and CI. No SDK is executed here. */
export function nineNativeDependencyPlan({
  changedPaths,
  games,
  readSource,
  fileScopes = new Map(),
  packages = [],
}) {
  let hasTapTap = packages.some((pkg) => pkg.dir === TAPTAP);
  if (hasTapTap && readSource) {
    try {
      hasTapTap =
        JSON.parse(readSource(`${TAPTAP}/package.json`)).name === '@coffeeeeffoc/platform-taptap';
    } catch {
      // Current-workspace packages cannot invent consumers in a historical candidate.
      hasTapTap = false;
    }
  }
  if (changedPaths.some((file) => taptapScripts.includes(file) || file.startsWith(TAPTAP + '/')))
    assert(hasTapTap, 'Missing TapTap workspace in the exact candidate');
  for (const file of changedPaths.filter((file) =>
    /^apps\/shell-minigame\/scripts\/taptap[^/]*\.mjs$/.test(file),
  ))
    assert(
      taptapScripts.includes(file) || taptapScripts.includes(file.replace(/\.test\.mjs$/, '.mjs')),
      `Incremental scope undefined for: ${file}. Review the TapTap producer and consumers before publishing.`,
    );
  let inventoryOnly = false;
  if (inventoryProofValues.has(fileScopes.get(INVENTORY_BUILDER)) && readSource) {
    try {
      inventoryOnly = digest(readSource(INVENTORY_BUILDER)) === INVENTORY_HEAD_SHA;
    } catch {
      /* A stale proof or unreadable current source cannot exempt Cocos. */
    }
  }
  let tapNormalizerOnly = false;
  if (hasTapTap && tapNormalizerProofValues.has(fileScopes.get(INVENTORY_BUILDER)) && readSource) {
    try {
      tapNormalizerOnly = digest(readSource(INVENTORY_BUILDER)) === TAP_NORMALIZER_HEAD_SHA;
    } catch {
      /* A stale or copied proof cannot narrow the candidate. */
    }
  }
  const tapCompetitionOnly = new Map();
  if (hasTapTap && readSource)
    for (const file of Object.keys(tapCompetitionDefinitions)) {
      const proof = tapCompetitionProofValues.get(fileScopes.get(file));
      try {
        if (proof?.file === file && digest(readSource(file)) === proof.review.head)
          tapCompetitionOnly.set(file, proof.review.games);
      } catch {
        /* Stale/missing source cannot exclude shared consumers. */
      }
    }
  const graph = new Map([...nativeGraph].map(([file, targets]) => [file, new Set(targets)]));
  if (hasTapTap)
    for (const [file, targets] of taptapGraph) {
      const owners = graph.get(file) || new Set();
      for (const target of targets) owners.add(target);
      graph.set(file, owners);
    }
  // Discover new literal relative imports/requires without evaluating candidate code.
  // Unresolved imports are left to the real build, which must fail rather than skip them.
  if (readSource) {
    const queue = [...graph.keys()].filter((file) => /\.[cm]?[jt]sx?$/.test(file));
    const visited = new Map();
    while (queue.length) {
      const file = queue.shift(),
        owners = graph.get(file);
      const signature = [...owners].sort().join(',');
      if (visited.get(file) === signature) continue;
      visited.set(file, signature);
      let text;
      try {
        text = readSource(file);
      } catch {
        continue;
      }
      if (typeof text !== 'string') continue;
      // Match the reviewed generator's native boundary: Tour imports are H5-only,
      // and original scene audio/debug imports are replaced with native ports.
      if (file === 'games/local/travel-bund/src/Scene.tsx')
        text = text.split('// The homepage and tour share one runtime and viewpoint;')[0];
      if (/^games\/local\/travel-bund\/src\/(?:Scene|StreetLife|clouds)\.(?:tsx|ts)$/.test(file))
        text = text.replace(
          /from (['"])\.\/(audio|debug-snapshots)\1/g,
          (_, quote, id) =>
            'from ' + quote + '../native/' + (id === 'audio' ? 'audio' : 'diagnostics') + quote,
        );
      const specifiers = [
        ...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g),
      ].map((match) => match[1]);
      for (const specifier of specifiers.filter((id) => id.startsWith('.'))) {
        const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
        if (base.startsWith('../') || base.includes('/native/generated/')) continue;
        const candidates = path.posix.extname(base)
          ? [
              base,
              ...(base.endsWith('.js')
                ? [base.slice(0, -3) + '.ts', base.slice(0, -3) + '.tsx']
                : []),
            ]
          : [
              base,
              ...['.ts', '.tsx', '.js', '.mjs', '.json', '/index.ts', '/index.js'].map(
                (suffix) => base + suffix,
              ),
            ];
        const dependency = candidates.find((candidate) => {
          try {
            return typeof readSource(candidate) === 'string';
          } catch {
            return false;
          }
        });
        if (!dependency) continue;
        const previous = graph.get(dependency) || new Set();
        const size = previous.size;
        // Parse the actual direct branch; comments/strings cannot narrow consumers.
        const selectedGames = taptapScripts.includes(file)
          ? guardedTapConsumers(text, specifier)
          : null;
        const dependencyOwners = selectedGames
          ? new Set([...owners].filter((owner) => selectedGames.includes(owner.split(':')[0])))
          : owners;
        for (const owner of dependencyOwners) previous.add(owner);
        graph.set(dependency, previous);
        if (previous.size !== size && /\.[cm]?[jt]sx?$/.test(dependency)) queue.push(dependency);
      }
    }
  }
  const selected = new Set(),
    blocked = new Set();
  for (const file of changedPaths) {
    const platformDirectory = file.match(
      /^platforms\/(wechat|bilibili|douyin|kuaishou|alipay|taptap)\//,
    )?.[1];
    if (
      platformDirectory &&
      !graph.has(file) &&
      !/\.(?:test|spec)\.[cm]?[jt]s$/.test(file) &&
      !/\.(?:md|html|css)$/.test(file) &&
      !file.includes('/tests/')
    ) {
      for (const targets of graph.values())
        for (const target of targets) {
          const [game, platform] = target.split(':');
          if (platform === platformDirectory) selected.add(game + ':' + platform);
        }
    }
    const fileTargets = tapCompetitionOnly.has(file)
      ? tapCompetitionOnly.get(file).map((game) => game + ':taptap')
      : file === INVENTORY_BUILDER && tapNormalizerOnly
        ? [...competitionGames, 'travel-bund', 'wulong-city'].map((game) => game + ':taptap')
        : graph.get(file) || [];
    for (const target of fileTargets) {
      const [game, platform] = target.split(':');
      // Builder provenance includes configuration inputs for every channel. Only
      // the selected channel's wrapper/normalizer/resource bridge executes them.
      const channel = file.match(
        /^platforms\/(wechat|bilibili|douyin|kuaishou|alipay|taptap)\/(?:build\.mjs|normalize\.mjs|native-entry\.mjs|native-resources\.mjs)$/,
      )?.[1];
      if (!channel || channel === platform) selected.add(target);
    }
    for (const [id, source] of Object.entries(nativeGameSources)) {
      if (
        !['carding-car', 'night-overwatch'].includes(id) &&
        (file.startsWith(source + '/native/') ||
          (id === 'letters-words2' && file === source + '/tests/native-bundle.test.mjs') ||
          file === source + '/package.json' ||
          (id === 'letters-words2' && file.startsWith(source + '/assets/')) ||
          (id === 'wulong-city' &&
            /^(?:assets\/art\/|assets\/audio\/)/.test(file.slice(source.length + 1)) &&
            file.startsWith(source + '/')))
      )
        for (const platform of [...nativePlatforms, ...(hasTapTap ? ['taptap'] : [])])
          selected.add(id + ':' + platform);
    }
    if (
      file === 'scripts/nine-travel-native-smoke.mjs' ||
      file === 'assets/bund' ||
      file.startsWith('assets/bund/')
    )
      for (const platform of [...nativePlatforms, ...(hasTapTap ? ['taptap'] : [])])
        selected.add('travel-bund:' + platform);
    for (const id of ['carding-car', 'night-overwatch']) {
      const source = 'games/local/' + id;
      if (
        file === source + '/package.json' ||
        (/^(?:assets|scripts|settings|startup|native)\//.test(file.slice(source.length + 1)) &&
          file.startsWith(source + '/'))
      )
        blocked.add(id);
    }
    if (
      ['platforms/competition/client.js', 'platforms/kart-sharing.js'].includes(file) &&
      !tapCompetitionOnly.has(file)
    )
      blocked.add('carding-car');
    if (
      /^games\/local\/carding-car\/scripts\/(?:toolchain|native-targets|clear-output)\.mjs$/.test(
        file,
      )
    )
      blocked.add('night-overwatch');
    if (
      !(file === INVENTORY_BUILDER && (inventoryOnly || tapNormalizerOnly)) &&
      /^apps\/shell-minigame\/scripts\/(?:cocos-platform|night-native-project|kuaishou-cocos-import|nine-games-build|nine-games-targets)\.mjs$/.test(
        file,
      )
    )
      for (const id of ['carding-car', 'night-overwatch']) blocked.add(id);
  }
  if (
    changedPaths.some((file) =>
      [
        'platforms/h5/dev-mode.js',
        'platforms/h5/dev-mode.d.ts',
        'scripts/sync-game-dev-mode.mjs',
      ].includes(file),
    )
  ) {
    blocked.add('carding-car');
    blocked.add('night-overwatch');
  }
  for (const game of blocked)
    for (const platform of [...nativePlatforms, ...(hasTapTap ? ['taptap'] : [])])
      selected.add(game + ':' + platform);
  const taptapCreator = new Set(cocosGames.filter((game) => selected.has(game + ':taptap')));
  const targets = [...selected].sort().map((target) => {
    const [game, platform] = target.split(':');
    const source = nativeGameSources[game];
    assert.equal(
      games.filter((item) => item.id === game && item.source === source).length,
      1,
      'Unique native dependency identity required',
    );
    assert.equal(
      games.filter((item) => item.id === game).length,
      1,
      'Unique native dependency game required',
    );
    assert.equal(
      games.filter((item) => item.source === source).length,
      1,
      'Unique native dependency source required',
    );
    return {
      game,
      platform,
      source,
      ...(blocked.has(game) || taptapCreator.has(game) ? { requiresCreator: '3.8.8' } : {}),
    };
  });
  return {
    targets,
    native_only_paths: changedPaths.filter(
      (file) => isNineNativeOnlyPath(file) || tapCompetitionOnly.has(file),
    ),
    taptap_only_paths: [
      ...tapCompetitionOnly.keys(),
      ...(tapNormalizerOnly ? [INVENTORY_BUILDER] : []),
    ],
    blocked: [...new Set([...blocked, ...taptapCreator])].sort().map((game) => ({
      game,
      reason:
        'Requires real Creator 3.8.8 native build and exact matching artifact; no H5 substitute or silent skip.',
    })),
    root_checks: changedPaths.some(
      (file) =>
        ['platforms/kart-sharing.js', 'scripts/kart-sharing.test.mjs'].includes(file) &&
        fileScopes.has(file),
    )
      ? [
          {
            file: 'scripts/kart-sharing.test.mjs',
            args: ['--test', 'scripts/kart-sharing.test.mjs'],
          },
        ]
      : [],
    travel_contract: targets.some((target) => target.game === 'travel-bund')
      ? {
          file: 'games/local/travel-bund/native/tests/contracts.mjs',
          args: ['games/local/travel-bund/native/tests/contracts.mjs'],
        }
      : null,
  };
}
