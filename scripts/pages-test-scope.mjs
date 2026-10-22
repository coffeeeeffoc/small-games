import {
  localRetirementFileScopes,
  localRetirementHeadQueryPaths,
  isReviewedLocalRetirementDeletion,
  hasLocalRetirementFileProof,
  hasLocalRetirementDeletionProof,
} from './local-game-retirement-scope.mjs';
import { appendFile, readFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  riskPlan,
  requiresCocos,
  affectedPackages,
  staticBuildTargets,
  workspacePackages,
  isDocumentation as isValidationDocumentation,
} from './validation-plan.mjs';
import { registrationFileScopes } from './pages-registration-scope.mjs';
import {
  retirementFileScopes,
  retirementHeadQueryPaths,
  isReviewedRetirementDeletion,
} from './game-retirement-scope.mjs';
import { nineNativeFileScopes } from './nine-native-scope.mjs';
import { nineLockFileScopes } from './nine-lock-scope.mjs';
import {
  incrementalPlan,
  entryAdapterFileScopes,
  developerModeFileScopes,
  nativeWorkspaceFileScopes,
  h5AdapterFileScopes,
  reviewedSharedFileScopes,
} from './incremental-validation.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const GAME_SOURCE = /^games\/(?:local|submodules)\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const NON_PAGES_APPS = new Set([
  'admin-web',
  'company-web',
  'shell-android',
  'shell-ios',
  'shell-minigame',
  'studio-web',
  'workspace-agent',
]);
const NON_PAGES_SERVICES = new Set(['kart-server', 'management-api', 'runtime-api']);
const NON_PAGES_PLATFORMS = new Set(['bilibili', 'douyin', 'kuaishou', 'wechat', 'taptap']);
const SHARED_COCOS_SCRIPTS = new Set(
  ['toolchain.mjs', 'native-targets.mjs', 'clear-output.mjs'].map(
    (name) => `games/local/carding-car/scripts/${name}`,
  ),
);

// Reviewed removal of obsolete diagnostics/generators and duplicate npm locks.
// The file bytes are identical at the successful Pages base ba88e46 and dev
// 457bc63. Keep the deleted paths in normal game regression selection; this
// proof only permits those exact D records through the global deletion guard.
const reviewedCleanupDeletions = Object.freeze({
  'games/local/tetracube/index.html':
    '475d14a286a3ab5d46307c2ba39aa02a413d5433b9459b68538f8e68f95e4b4a',
  'games/local/tetracube/src/app.mjs':
    '5a626c3d81ef0761a697cbeef35dc961ed2645b867c3f4fe5fdd9c90f9c754c7',
  'games/local/tetracube/style.css':
    '77b284ea1bbda998b56654d3bf9f5491fcc083f1e87b1116e6d53b69bb1eefb9',
  // f0f2576 replaces these exact legacy Chase sources/tests with the city-chase runtime.
  // Only their deletion is exempted; the retained game still receives normal regression.
  'games/local/chase-thief/audio.mjs':
    'fce36f9f6e5fc88f65da5502ba75d67e51e6d5db1f2540b02b3c59e902a56f31',
  'games/local/chase-thief/challenge.mjs':
    'fbe97d6ee077a05eddf8fdb5f67ec03e62c0507401ab066382db1c3df60ce07a',
  'games/local/chase-thief/engine.mjs':
    '1f0255495d6e35bcb8695af4848172a5e7d13110377f4673fb63dc3c19ed9bd1',
  'games/local/chase-thief/levels.mjs':
    '5c429d2e20c5efe70ef880c2020ed3a419aac84bf628251ae8833bcb1bc73522',
  'games/local/chase-thief/main.mjs':
    'ee23f8ef447c352356a8b56013179116f8e0db340c4454163a9564259bfda3a2',
  'games/local/chase-thief/progress.mjs':
    '905387335974263b61b05e3b8d7bda9184df2d51e5cf5a4c93a23745a3618bce',
  'games/local/chase-thief/scene.mjs':
    'b3c8702e46d43365bf1d219135efe4df19d701cde539b250dd441c168601104f',
  'games/local/chase-thief/tests/challenge.test.mjs':
    'cd8432b00000e986406a2ccf2096acc4fd822e47a4064078ef08fb065657e3e7',
  'games/local/chase-thief/tests/core.test.mjs':
    '5d3c486804dd6249fe75c0ce760545da25725a7ae3946670d9be5c3cbf167fbb',
  'games/local/chase-thief/tests/progress.test.mjs':
    '4b081ba561934d6897d78bc9415473be4714bf0d3dd5d404b892582029802d9f',
  'games/local/merge-front/favicon.svg':
    'c17665fab3504b77fce9b6b107f46e4250ed704deb5848f5c07088194cad4489',
  'games/local/merge-front/index.html':
    '7f0df17ce765c5cc9c0a183c9b3dd5bc59c7e1fec45a98b3f3a3933d15fce9a2',
  'games/local/merge-front/src/content.mjs':
    '88b4fbd04a117f0dd7524d1ac0800cd8dbdd6d9d543159eaf53f4dc9bcb11bde',
  'games/local/merge-front/src/engine.mjs':
    'ab26fb6bbc566dc87c2e36aa2ddf69805caafe95f63f1b4a2b24c9082c7708af',
  'games/local/merge-front/src/main.mjs':
    '8aa1f05e6f0602d573633d45f377d9c44b1c7b41d09f8d603594e96bc0935f0e',
  'games/local/merge-front/src/render.mjs':
    'adf178ac883ffdac5bf5baadb8f8246e68f9abee9319c21cb37f3aee0c8e9197',
  'games/local/merge-front/src/style.css':
    '117a098bc15458c2358fd66205dfa10983333a492f314b1429d75ac6fb402903',
  'games/local/merge-front/tests/browser.mjs':
    '19eaeccd918551943a841021bb1790ea0820c68c45d5661e58aa86bdec914da7',
  'games/local/merge-front/tests/engine.test.mjs':
    'b6a2263662449b2a894e174d71f1579923afc31d4fb5359aebe020661110facb',
  'games/local/merge-front/vite.config.mjs':
    'e93f7ca0ec71b277ef4b6826d6ab00abd43ab23c68213457e13e7e95aec7864d',
  // Cocos replaces the Canvas renderer/build and its source-string feedback test at ba3f396.
  'games/local/tianxia-chalu/build.mjs':
    '76cc094e11d696453d5cecd705b47983b7d6de746e7750915f2a03ecbe000f81',
  'games/local/tianxia-chalu/render.mjs':
    'b399ea8683fa6176ca29a143a3069c5852c64120cba6aa5611ef027e8a74501c',
  'games/local/tianxia-chalu/tests/route-feedback.test.mjs':
    '41ab1335014b2801cf4dcd1ddde5fc65487d21c377b97f3b8b788cce1ae6e363',
  'games/local/cops-robbers-realtime/package-lock.json':
    'b2db36b4a1adac540aed69833bfb66ae1dcab19c507ff51606ccc8d28bc1a017',
  'games/local/cops-robbers-realtime/scripts/cartoon-playtest.mjs':
    '59f313e430030ec0f36c5e20ee05962fb894973225f164a068fbf466cf67d6f1',
  'games/local/cops-robbers-realtime/scripts/guided-playtest.mjs':
    '3ab6cfe7314c65f334372339489c103e47a618012968b37a67817446a62cd6c4',
  'games/local/cops-robbers-realtime/scripts/home-playtest.mjs':
    '434c3b2271e3d51eaed37733df9fb8106d541c0813451372fa8497e488b69b0c',
  'games/local/cops-robbers-realtime/scripts/input-playtest.mjs':
    'f1efdc07d84140f6e19953a7c56217273563027def3dec617b90c72e8b7b204a',
  'games/local/cops-robbers-realtime/scripts/lifecycle-playtest.mjs':
    '9642b462bd8da03ac69f099b49d00b9df66dac87a17f2c0973c8b15aaa78aa39',
  'games/local/cops-robbers-realtime/scripts/mobile-pages-playtest.mjs':
    'c3067fbe80b2d98eadb68e8195b19f22a1ad75ec197bb331fcd720ca727b2add',
  'games/local/cops-robbers-realtime/scripts/mobile-roster-playtest.mjs':
    '3af45c8f190945b14ea9f61292dc2e0c07db251a344fb490745ad463e4e41319',
  'games/local/cops-robbers-realtime/scripts/playtest.mjs':
    'c876f84b0f61d4e4b971bb3eacf602f58a8a4e95a82848a1db9e450c8553573f',
  'games/local/cops-robbers-realtime/scripts/quick-playtest.mjs':
    '49af35cf3e0e45ba5cfc1b38114f704bcac70515c9ec6c39be9b98060a9e271c',
  'games/local/cops-robbers-realtime/scripts/relay-playtest.mjs':
    '7b344791f66d0cd8df0a2691ca37f78d7e5ac3c5148937260f3aec6f48ea3f79',
  'games/local/cops-robbers-realtime/scripts/review-repro.mjs':
    'e9170221f69268d281106abc15d39b6f9f93bd97201506686ce0fd017dd214d6',
  'games/local/cops-robbers/package-lock.json':
    '3ccfb3796e945ff8dc0caba75c0e2891b8bfa1098f77e10fcf0ab4ad447c53bd',
  'games/local/cops-robbers/scripts/extend-levels.mjs':
    '45e6d964d670bd9f621d2de58027c915711c8e2bbfbf8dcd266e82af3f8246a1',
  'games/local/cops-robbers/scripts/generate-levels.mjs':
    '5792406bf617165e74a34887cb045b582416c657c03b402bd942b00f4e758bc7',
});
const tetracubeMoves = Object.freeze({
  'games/local/tetracube/dev-mode.js': {
    to: 'games/local/tetracube/scripts/dev-mode.js',
    hash: '986844491337ac0bb53394d44917356a820f346f0d2b0d63b2ab34e36a7a4a2f',
  },
  'games/local/tetracube/dev-mode.d.ts': {
    to: 'games/local/tetracube/scripts/dev-mode.d.ts',
    hash: 'b72515b11a1a65cf101125ce3bc23bf2aa3236cdb2331e0b018a962571f7a195',
  },
  'games/local/tetracube/fullscreen.js': {
    to: 'games/local/tetracube/scripts/fullscreen.js',
    hash: '72acd28e8258e9e49b91288dc67b9af8f857c9eda6eaa5b80a4dfaa4009bedc7',
  },
});
export function isReviewedTetracubeMove({
  change,
  readBase,
  readHead,
  headHasPath,
  standaloneGames,
  gameSources,
}) {
  const [from, to] = change.paths,
    review = tetracubeMoves[from],
    source = 'games/local/tetracube';
  if (change.status !== 'R100' || change.paths.length !== 2 || !review || to !== review.to)
    return false;
  try {
    const entries = standaloneGames.filter((g) => g.id === 'tetracube' || g.source === source);
    if (
      entries.length !== 1 ||
      entries[0].id !== 'tetracube' ||
      entries[0].source !== source ||
      gameSources.filter((s) => s === source).length !== 1
    )
      return false;
    const hash = (value) => createHash('sha256').update(value).digest('hex');
    return (
      headHasPath(from) === false &&
      headHasPath(to) === true &&
      hash(readBase(from)) === review.hash &&
      hash(readHead(to)) === review.hash
    );
  } catch {
    return false;
  }
}

export function isReviewedCleanupDeletion({
  change,
  readBase,
  headHasPath,
  standaloneGames,
  gameSources,
}) {
  if (change.status !== 'D' || change.paths.length !== 1) return false;
  const [file] = change.paths,
    expected = reviewedCleanupDeletions[file];
  if (!expected) return false;
  try {
    const source = file.split('/').slice(0, 3).join('/'),
      id = source.split('/').at(-1);
    if (
      standaloneGames.filter((game) => game.id === id).length !== 1 ||
      standaloneGames.filter((game) => game.source === source).length !== 1 ||
      standaloneGames.filter((game) => game.id === id && game.source === source).length !== 1 ||
      gameSources.filter((value) => value === source).length !== 1
    )
      return false;
    return (
      headHasPath(file) === false &&
      createHash('sha256').update(readBase(file)).digest('hex') === expected
    );
  } catch {
    return false;
  }
}

export function isGameSource(value) {
  return typeof value === 'string' && GAME_SOURCE.test(value);
}

/** Read the same catalog that Pages uses; built-in games also need package tests. */
export async function loadGameCatalog(root = ROOT) {
  const standaloneGames = JSON.parse(
    await readFile(path.join(root, 'apps/shell-web/src/standalone-games.json'), 'utf8'),
  );
  if (
    !Array.isArray(standaloneGames) ||
    standaloneGames.some(
      (game) =>
        !game ||
        typeof game.id !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(game.id) ||
        !isGameSource(game.source),
    )
  ) {
    throw new Error('Invalid standalone game catalog');
  }
  if (
    new Set(standaloneGames.map((game) => game.id)).size !== standaloneGames.length ||
    new Set(standaloneGames.map((game) => game.source)).size !== standaloneGames.length
  ) {
    throw new Error('Duplicate standalone game ID or source');
  }

  const gameSources = new Set();
  for (const parent of ['games/local', 'games/submodules']) {
    let entries;
    try {
      entries = await readdir(path.join(root, parent), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    for (const entry of entries) {
      const source = `${parent}/${entry.name}`;
      if (!entry.isDirectory() || !isGameSource(source)) continue;
      try {
        const packageFile = await stat(path.join(root, source, 'package.json'));
        if (packageFile.isFile()) gameSources.add(source);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        // The scope job can run before recursive submodule checkout. Their registered
        // sources still select tests, which run after the package has been checked out.
        if (
          parent === 'games/submodules' &&
          standaloneGames.some((game) => game.source === source)
        ) {
          gameSources.add(source);
        }
      }
    }
  }
  return { standaloneGames, gameSources: [...gameSources].sort() };
}

function isDocumentation(file) {
  return (
    /(?:^|\/)(?:docs|reports)(?:\/|$)/.test(file) ||
    /\.(?:md|rst)$/i.test(file) ||
    /^(?:LICENSE(?:\.[^/]+)?|NOTICE(?:\.[^/]+)?)$/i.test(file) ||
    /^(?:\.agents|\.codex|\.vscode)\//.test(file)
  );
}

function isKnownNonPagesPath(file) {
  // Several game test suites import these shared competition rules directly.
  if (file.startsWith('services/runtime-api/rules/')) return false;
  const [group, name] = file.split('/');
  return (
    (group === 'apps' && NON_PAGES_APPS.has(name)) ||
    (group === 'services' && NON_PAGES_SERVICES.has(name)) ||
    (group === 'platforms' && NON_PAGES_PLATFORMS.has(name))
  );
}

/** Unknown paths expand coverage rather than silently dropping a deployment check. */
export function selectPagesScope({
  eventName = 'push',
  refName = '',
  changedPaths = [],
  diffAvailable = true,
  standaloneGames = [],
  gameSources = [],
  fileScopes = new Map(),
}) {
  const sources = new Set(gameSources);
  const fullScope = () => ({
    required: true,
    full: true,
    game_ids: [...new Set(standaloneGames.map((game) => game.id))].sort(),
    game_sources: [...sources].sort(),
  });
  if (eventName === 'schedule' || eventName === 'workflow_dispatch' || !diffAvailable) {
    return fullScope();
  }

  let needsFull = false;
  let needsHost = false;
  const selected = new Set();
  for (const file of changedPaths) {
    if (isDocumentation(file) || isKnownNonPagesPath(file)) continue;
    if (fileScopes.has(file)) {
      needsHost = true;
      for (const source of fileScopes.get(file)) {
        if (sources.has(source)) selected.add(source);
        else needsFull = true;
      }
      continue;
    }
    // Night Overwatch imports and hashes these files from the Carding Car package.
    if (SHARED_COCOS_SCRIPTS.has(file)) {
      needsFull = true;
      continue;
    }
    const source = file.match(/^(games\/(?:local|submodules)\/[^/]+)(?:\/|$)/)?.[1];
    if (source && sources.has(source)) selected.add(source);
    else needsFull = true;
  }
  if (!needsFull && !needsHost && selected.size === 0) {
    return { required: false, full: false, game_ids: [], game_sources: [] };
  }
  if (needsFull || (eventName === 'push' && ['main', 'test'].includes(refName))) {
    return fullScope();
  }
  return {
    required: true,
    full: false,
    game_ids: standaloneGames
      .filter((game) => selected.has(game.source))
      .map((game) => game.id)
      .sort(),
    game_sources: [...selected].sort(),
  };
}

/** --name-status -z represents renames as status, old path, new path. Keep both. */
function parseChangedEntries(output) {
  const fields = output.split('\0');
  if (fields.at(-1) === '') fields.pop();
  const changes = [];
  for (let index = 0; index < fields.length; ) {
    const status = fields[index++];
    if (!/^(?:[ACDMRTUXB]|[RC]\d+)$/.test(status)) {
      throw new Error(`Unexpected git diff status: ${status}`);
    }
    const count = /^[RC]/.test(status) ? 2 : 1,
      paths = [];
    for (let item = 0; item < count; item++) {
      const file = fields[index++];
      if (!file) throw new Error('Incomplete git diff path');
      paths.push(file);
    }
    changes.push({ status, paths });
  }
  return changes;
}
export function parseChangedPaths(output) {
  return [...new Set(parseChangedEntries(output).flatMap((change) => change.paths))].sort();
}

function git(root, args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'git command failed');
  return result.stdout;
}

function comparison({ root = ROOT, base, head = 'HEAD', eventName = 'push' }) {
  if (!base || /^0+$/.test(base)) throw new Error('No usable diff base');
  const baseCommit = git(root, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${base}^{commit}`,
  ]).trim();
  const headCommit = git(root, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${head}^{commit}`,
  ]).trim();
  const diffBase =
    eventName === 'pull_request'
      ? git(root, ['merge-base', baseCommit, headCommit]).trim()
      : baseCommit;
  return { diffBase, headCommit };
}

export function collectChangedPaths(options) {
  const root = options.root || ROOT;
  const { diffBase, headCommit } = comparison(options);
  return parseChangedPaths(
    git(root, [
      'diff',
      '--no-ext-diff',
      '--name-status',
      '-z',
      '--find-renames',
      diffBase,
      headCommit,
      '--',
    ]),
  );
}

/** Reviewed shared files can reach Creator games without changing their package paths. */
export function requiresIncrementalCocos({
  packages,
  games,
  changedPaths,
  scope,
  risk,
  fileScopes = new Map(),
  readSource,
}) {
  const creatorSources = new Set(packages.filter((pkg) => pkg.creator).map((pkg) => pkg.dir));
  // Navigation samples also typecheck Shell. Its emitted workspace dependencies
  // are built by validateTree even when the changed files are validation tools.
  const browserPrerequisites = (() => {
    if (!scope.browser) return [];
    const affected = affectedPackages(packages, [
      ...changedPaths,
      ...(scope.consumer_sources || []).map((source) => source + '/package.json'),
    ]);
    const shell = packages.find((pkg) => pkg.dir === 'apps/shell-web');
    if (shell && !affected.includes(shell)) affected.push(shell);
    const direct = packages.filter((pkg) =>
      games.some((game) => scope.browser_ids.includes(game.id) && game.source === pkg.dir),
    );
    return staticBuildTargets(packages, direct, affected);
  })();
  return (
    browserPrerequisites.some((pkg) => pkg.creator) ||
    requiresCocos(
      packages,
      changedPaths.filter(
        (file) =>
          !hasLocalRetirementFileProof(file, fileScopes.get(file), readSource) &&
          !hasLocalRetirementDeletionProof(file, fileScopes.get(file)),
      ),
      { ...scope, risk },
    ) ||
    scope.game_sources.some((source) => creatorSources.has(source)) ||
    scope.nine_native_targets.some((target) => Boolean(target.requiresCreator)) ||
    scope.nine_native_blocked.some((blocked) =>
      games.some((game) => game.id === blocked.game && creatorSources.has(game.source)),
    )
  );
}

/** Saved dev artifacts have already passed every selected release check. */
export async function readSavedDevBaseline(env = process.env, fetchFn = fetch) {
  const override = env.PAGES_VALIDATED_BASE;
  if (override !== undefined) {
    if (!/^[a-f\d]{40}$/i.test(override)) throw new Error('Invalid PAGES_VALIDATED_BASE SHA');
    return override.toLowerCase();
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY || '')) {
    throw new Error('Missing or invalid GITHUB_REPOSITORY');
  }
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (env.GH_TOKEN) headers.Authorization = `Bearer ${env.GH_TOKEN}`;
  const api = (env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
  const response = await fetchFn(
    `${api}/repos/${env.GITHUB_REPOSITORY}/contents/dev/deployment.json?ref=gh-pages`,
    { headers, signal: AbortSignal.timeout(10_000) },
  );
  if (!response.ok) throw new Error(`Saved dev baseline unavailable (HTTP ${response.status})`);
  const payload = await response.json();
  if (
    payload.encoding !== 'base64' ||
    typeof payload.content !== 'string' ||
    !payload.content ||
    !/^[A-Za-z\d+/=\s]+$/.test(payload.content)
  ) {
    throw new Error('Invalid saved dev deployment content');
  }
  const deployment = JSON.parse(Buffer.from(payload.content, 'base64').toString('utf8'));
  if (deployment.branch !== 'dev' || !/^[a-f\d]{40}$/i.test(deployment.sha || '')) {
    throw new Error('Invalid saved dev deployment branch or SHA');
  }
  return deployment.sha.toLowerCase();
}

export async function main(env = process.env, root = ROOT, fetchFn = fetch) {
  const catalog = await loadGameCatalog(root);
  const eventName = env.GITHUB_EVENT_NAME || 'push';
  let changedPaths = [];
  let diffAvailable = true;
  let fileScopes = new Map();
  let headCommitForRisk;
  let diffBaseForRisk;
  let treeContextForRisk;
  if (!['schedule', 'workflow_dispatch'].includes(eventName)) {
    try {
      // A newer dev push can cancel earlier validation. Diff from the last successful
      // saved artifact so its unvalidated changes remain covered, including on docs pushes.
      const base =
        eventName === 'push' && env.GITHUB_REF_NAME === 'dev'
          ? await readSavedDevBaseline(env, fetchFn)
          : env.PAGES_DIFF_BASE;
      changedPaths = collectChangedPaths({
        root,
        base,
        head: env.PAGES_DIFF_HEAD || 'HEAD',
        eventName,
      });
      const { diffBase, headCommit } = comparison({
        root,
        base,
        head: env.PAGES_DIFF_HEAD || 'HEAD',
        eventName,
      });
      headCommitForRisk = headCommit;
      diffBaseForRisk = diffBase;
      console.log(`Pages comparison: ${diffBase}..${headCommit}`);
      const removed = parseChangedEntries(
        git(root, [
          'diff',
          '--no-ext-diff',
          '--name-status',
          '-z',
          '--find-renames',
          '--diff-filter=DR',
          diffBase,
          headCommit,
          '--',
        ]),
      );
      // A successful exact-tree query proves absence. Read failures never count
      // as absence, and no rename (including a reviewed source) uses this proof.
      const headQueries = [
        ...new Set([
          ...changedPaths.filter((file) => Object.hasOwn(reviewedCleanupDeletions, file)),
          ...Object.keys(tetracubeMoves),
          ...Object.values(tetracubeMoves).map((move) => move.to),
          ...retirementHeadQueryPaths(changedPaths),
          ...localRetirementHeadQueryPaths(changedPaths),
        ]),
      ];
      const headPaths = new Set(
        headQueries.length
          ? // Read directories, files and gitlinks once without a path-sized command line.
            git(root, ['ls-tree', '-r', '-t', '--name-only', '-z', headCommit])
              .split('\0')
              .filter(Boolean)
          : [],
      );
      const headHasPath = (file) => {
        assert(headQueries.includes(file), 'Unqueried candidate path');
        return headPaths.has(file);
      };
      const retirementContext = {
        baseCommit: diffBase,
        changedPaths,
        readBase: (file) => git(root, ['show', `${diffBase}:${file}`]),
        readBaseEntry: (file) =>
          git(root, ['--literal-pathspecs', 'ls-tree', diffBase, '--', file]),
        readHead: (file) => git(root, ['show', `${headCommit}:${file}`]),
        readHeadEntry: (file) =>
          git(root, ['--literal-pathspecs', 'ls-tree', headCommit, '--', file]),
        headHasPath,
      };
      treeContextForRisk = retirementContext;
      const retiredScopes = new Map([
        ...retirementFileScopes(retirementContext),
        ...localRetirementFileScopes(retirementContext),
      ]);
      if (
        removed.some(
          (change) =>
            change.paths.some((file) => !isDocumentation(file) && !isKnownNonPagesPath(file)) &&
            !isReviewedCleanupDeletion({
              change,
              ...catalog,
              readBase: (file) => git(root, ['show', `${diffBase}:${file}`]),
              headHasPath,
            }) &&
            !isReviewedTetracubeMove({ change, ...catalog, ...retirementContext }) &&
            !isReviewedRetirementDeletion(change, retiredScopes) &&
            !isReviewedLocalRetirementDeletion(change, retiredScopes),
        )
      )
        throw new Error('Relevant deletion or rename requires full regression');
      fileScopes = new Map([
        ...registrationFileScopes({
          changedPaths,
          gameSources: catalog.gameSources,
          readBase: (file) => git(root, ['show', `${diffBase}:${file}`]),
          readHead: (file) => git(root, ['show', `${headCommit}:${file}`]),
        }),
        ...retiredScopes,
      ]);
      for (const [file, sources] of fileScopes) {
        console.log(
          `Pages scoped registration: ${file} -> ${sources.length ? sources.join(', ') : 'host checks'}`,
        );
      }
    } catch (error) {
      if (env.VALIDATION_RISK_PLAN === 'true' && diffBaseForRisk) throw error;
      diffAvailable = false;
      console.warn(`Pages scope: falling back to full regression (${error.message})`);
    }
  }
  const scope = selectPagesScope({
    ...catalog,
    eventName,
    refName: env.GITHUB_REF_NAME,
    changedPaths,
    diffAvailable,
    fileScopes,
  });
  let result = riskPlan({
    changedPaths,
    scope,
    diffAvailable,
    readSource: (file) => git(root, ['show', `${headCommitForRisk}:${file}`]),
  });
  if (result.full && !scope.full) {
    result = {
      ...result,
      game_ids: catalog.standaloneGames.map((game) => game.id).sort(),
      game_sources: catalog.gameSources,
      browser_ids: catalog.standaloneGames.map((game) => game.id).sort(),
    };
  }
  // Preserve the existing scope API for callers that only need logical test selection.
  if (env.VALIDATION_RISK_PLAN !== 'true') result = scope;
  else if (diffAvailable && diffBaseForRisk) {
    const packages = await workspacePackages(root);
    const sourcePaths = changedPaths.filter((file) => !isValidationDocumentation(file));
    const context = {
      ...treeContextForRisk,
      changedPaths: sourcePaths,
      games: catalog.standaloneGames,
      packages,
      readBase: (file) => git(root, ['show', `${diffBaseForRisk}:${file}`]),
      readHead: (file) => git(root, ['show', `${headCommitForRisk}:${file}`]),
    };
    for (const classify of [
      entryAdapterFileScopes,
      h5AdapterFileScopes,
      developerModeFileScopes,
      nativeWorkspaceFileScopes,
      reviewedSharedFileScopes,
      nineNativeFileScopes,
      nineLockFileScopes,
    ])
      for (const [file, sources] of classify(context)) {
        const existing = fileScopes.get(file);
        if (
          !hasLocalRetirementFileProof(file, existing, context.readHead) &&
          !hasLocalRetirementDeletionProof(file, existing)
        )
          fileScopes.set(file, sources);
      }
    const incremental = incrementalPlan({
      packages,
      games: catalog.standaloneGames,
      fileScopes,
      changedPaths: sourcePaths,
      readSource: (file) => git(root, ['show', `${headCommitForRisk}:${file}`]),
    });
    result = {
      ...result,
      ...incremental,
      risk: result.full ? 'incremental' : result.risk,
      reason: result.full ? 'Reviewed source graph from an exact comparison' : result.reason,
      required: scope.required || sourcePaths.length > 0,
      game_ids: incremental.game_sources
        .flatMap((source) => catalog.standaloneGames.filter((game) => game.source === source))
        .map((game) => game.id)
        .sort(),
      cocos: requiresIncrementalCocos({
        fileScopes,
        readSource: context.readHead,
        packages,
        games: catalog.standaloneGames,
        changedPaths: sourcePaths,
        scope: incremental,
        risk: result.risk,
      }),
      diff_base: diffBaseForRisk,
      diff_head: headCommitForRisk,
    };
  } else
    result = {
      ...result,
      cocos: requiresCocos(await workspacePackages(root), changedPaths, result),
      browser: result.full || result.risk === 'interaction' || result.browser_ids.length > 0,
      diff_base: diffBaseForRisk || '',
      diff_head: headCommitForRisk || env.PAGES_DIFF_HEAD || 'HEAD',
    };
  const output = Object.entries(result)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}\n`)
    .join('');
  if (env.GITHUB_OUTPUT)
    await appendFile(
      env.GITHUB_OUTPUT,
      output + (env.VALIDATION_RISK_PLAN === 'true' ? `plan=${JSON.stringify(result)}\n` : ''),
    );
  console.log(`Pages scope: ${JSON.stringify(result)}`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
