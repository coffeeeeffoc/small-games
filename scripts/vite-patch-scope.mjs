import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

// Audited pnpm 12.6.0 output for GHSA-vfpm-58rq-9qcg / GHSA-rq7h-c2jc-7f22.
// Both YAML documents, integrity, peers and transitive resolutions are bound.
// See docs/operations/vite-rotation-2026-10-12.md for the dependency audit.
export const vitePatchLocks = Object.freeze({
  bases: [
    'a0cd6c201e6637f0244ac34930dc48b7e719e3ab3b47ccda21479bbd6187d016',
    '981e1fbb9139f59cdf357f781ca42f175dc356665d07811746e7f4595a5673e0',
  ],
  head: '5fdaa007c884ee4f52f9c0d3d05d3bb8cf53db125fcbcb0fc9406ea45c29125f',
});
export const viteVersions = Object.freeze({
  '8.2.2': '8.2.4',
  '8.3.0': '8.3.3',
  '8.0.13': '8.1.6',
  '7.3.6': '7.3.7',
  '7.1.5': '7.3.7',
  '6.4.1': '6.4.4',
  '6.3.6': '6.4.4',
  '6.3.5': '6.4.4',
});
const audited = {
  direct: [
    'apps/company-web',
    'apps/shell-minigame',
    'apps/shell-web',
    'apps/studio-web',
    'games/local/fold-the-world',
    'games/local/game-castle-cannon',
    'games/local/game-moss-garden',
    'games/local/homebound-station',
    'games/local/luban-workshop',
    'games/local/maze-wander',
    'games/local/merge-front',
    'games/local/travel-bund',
    'games/local/urban-breakout',
    'games/local/vibeJam-myself-delivery',
    'games/local/vibeJam-myself-history-guess',
    'games/local/vibeJam-myself-nullrange',
    'packages/vite-smoke-test',
  ],
  vitest: [
    'apps/shell-minigame',
    'apps/shell-web',
    'apps/studio-web',
    'apps/workspace-agent',
    'games/local/game-castle-cannon',
    'packages/ad-config',
    'packages/ad-runtime',
    'packages/canvas-game-adapter',
    'packages/content-schema',
    'packages/game-artifact',
    'packages/game-contract',
    'packages/game-contract-test',
    'packages/game-host',
    'packages/game-loader',
    'packages/native-game-shell',
    'packages/react-game-adapter',
    'packages/release-contract',
    'packages/repository-bridge',
    'packages/service-kit',
    'packages/vite-smoke-test',
    'platforms/douyin',
    'platforms/kuaishou',
    'services/management-api',
    'services/runtime-api',
  ],
  registry: {
    'apps/shell-web/src/standalone-games.json': [
      '2cfa0796a243f25b80bf5242ae89cfa6d12227a98934e2c2770de44891fde134',
      '79d8866b82ef5a0df3cf0c472313eaba18c4eca71971796f19db5c2188ff2e0b',
    ],
    'apps/shell-web/src/game-meta.json': [
      'e2e0245d0e09c127662add5cfd409734044c64b141b1fda8bfa09c3e9de59698',
      '4f336b9a4aa90b3d1e03809023f68ca9e01bf3eb849c010a659c338462473766',
    ],
  },
};
const cumulativeManifests = {
  'games/local/game-castle-cannon/package.json': [
    '542a918579ca72945f9442c03093a462aad199ceb027bd0d00260ca880783ed6',
    '9a477d5d72d20fb297d211d44229d3802b29e77a37a8621346df6c3457c7572d',
  ],
  'games/local/vibeJam-myself-history-guess/package.json': [
    'ca743f9ed93cbd1f75894623e50d5945b81a61ffa0e6cabae12e789f93c3ad33',
    '8327ed68033a08a87b274e4d3ce0a7d35134b1128c3e45999b300c9f5ef04bc8',
  ],
};
export const viteBuildSources = Object.freeze([
  ...audited.direct,
  ...['cops-robbers', 'cops-robbers-realtime', 'letters-words2'].map((id) => 'games/local/' + id),
  'games/submodules/xiangqi-five',
]);
export const viteTestSources = Object.freeze(audited.vitest);
// These Node suites reach the native build/Vite parseAst APIs. Other native
// packaging suites use Node alone and are not changed by this dependency patch.
export const viteNativeNodeTests = Object.freeze(
  [
    'nine-games-build',
    'taptap-build',
    'taptap-cocos',
    'taptap-cocos-inputs',
    'taptap-package',
    'taptap-smoke',
  ].map((name) => 'apps/shell-minigame/scripts/' + name + '.test.mjs'),
);
export const viteBuiltinSources = Object.freeze([]);
export const viteNativeSources = Object.freeze(['apps/shell-minigame']);
export const viteSmokeSources = Object.freeze([
  ...viteBuiltinSources,
  'apps/shell-web',
  'apps/studio-web',
  'apps/company-web',
]);
const digest = (text) => createHash('sha256').update(text).digest('hex');
export function matchesLockPair(before, after, pairs = vitePatchLocks) {
  return pairs.bases.includes(digest(before)) && digest(after) === pairs.head;
}
export function isViteManifestPatch(before, after, allowAshfall = false) {
  const old = structuredClone(before),
    next = structuredClone(after);
  let found = false;
  for (const bucket of ['dependencies', 'devDependencies']) {
    const version = old[bucket]?.vite;
    if (!version) continue;
    const patched = viteVersions[version.replace(/^\^/, '')];
    if (!patched || ![patched, '^' + patched].includes(next[bucket]?.vite)) return false;
    next[bucket].vite = version;
    found = true;
  }
  if (
    allowAshfall &&
    !old.dependencies?.['@coffeeeeffoc/ashfall-front'] &&
    next.dependencies?.['@coffeeeeffoc/ashfall-front'] === 'workspace:*'
  )
    delete next.dependencies['@coffeeeeffoc/ashfall-front'];
  return found && isDeepStrictEqual(old, next);
}
export function vitePatchFileScopes({ changedPaths, readBase, readHead }) {
  const scopes = new Map();
  if (!changedPaths.includes('pnpm-lock.yaml')) return scopes;
  try {
    const before = readBase('pnpm-lock.yaml'),
      after = readHead('pnpm-lock.yaml');
    assert(matchesLockPair(before, after), 'Unreviewed dependency resolution');
    const cumulative = digest(before) === vitePatchLocks.bases[1];
    assert(
      digest(readBase('pnpm-workspace.yaml')) ===
        '7e28cfdc86b577b1886f94a6abdea4ae45fa638e09d1f42278ca15646ae6d403',
    );
    assert(
      digest(readHead('pnpm-workspace.yaml')) ===
        '1c5a0133fa0e47e1edbb442967af4cde3026a043611f30579e0ab3a6b2d37c06',
    );
    for (const source of [
      '.',
      ...audited.direct.filter((source) => !source.startsWith('games/submodules/')),
    ]) {
      const file = source === '.' ? 'package.json' : source + '/package.json';
      const previous = readBase(file),
        current = readHead(file);
      const reviewed = cumulativeManifests[file];
      assert(
        isViteManifestPatch(
          JSON.parse(previous),
          JSON.parse(current),
          cumulative && source === 'apps/shell-web',
        ) ||
          (cumulative &&
            reviewed &&
            digest(previous) === reviewed[0] &&
            digest(current) === reviewed[1]),
        'Unexpected manifest change: ' + file,
      );
      if (changedPaths.includes(file))
        scopes.set(file, source === '.' ? viteBuildSources : [source]);
    }
    if (cumulative)
      for (const [file, [oldHash, newHash]] of Object.entries(audited.registry)) {
        if (!changedPaths.includes(file)) continue;
        assert(
          digest(readBase(file)) === oldHash && digest(readHead(file)) === newHash,
          'Unreviewed cumulative registry change',
        );
        scopes.set(file, ['games/local/ashfall-front']);
      }
    scopes.set('pnpm-lock.yaml', viteBuildSources);
    scopes.set('pnpm-workspace.yaml', viteBuildSources);
    return scopes;
  } catch {
    return new Map();
  }
}
export function hasVitePatch(changedPaths, fileScopes) {
  return (
    changedPaths.includes('pnpm-lock.yaml') &&
    isDeepStrictEqual(fileScopes.get('pnpm-lock.yaml'), viteBuildSources)
  );
}
