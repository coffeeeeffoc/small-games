import { appendFile, readFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const GAME_SOURCE = /^games\/(?:local|submodules)\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const NON_PAGES_APPS = new Set([
  'company-web',
  'shell-android',
  'shell-bilibili',
  'shell-ios',
  'shell-minigame',
  'studio-web',
  'workspace-agent',
]);
const NON_PAGES_SERVICES = new Set(['kart-server', 'management-api', 'runtime-api']);
const NON_PAGES_PLATFORMS = new Set(['bilibili', 'douyin', 'kuaishou', 'wechat']);
const SHARED_COCOS_SCRIPTS = new Set(
  ['toolchain.mjs', 'native-targets.mjs', 'clear-output.mjs'].map(
    (name) => `games/local/carding-car/scripts/${name}`,
  ),
);

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
  const selected = new Set();
  for (const file of changedPaths) {
    if (isDocumentation(file) || isKnownNonPagesPath(file)) continue;
    // Night Overwatch imports and hashes these files from the Carding Car package.
    if (SHARED_COCOS_SCRIPTS.has(file)) {
      needsFull = true;
      continue;
    }
    const source = file.match(/^(games\/(?:local|submodules)\/[^/]+)(?:\/|$)/)?.[1];
    if (source && sources.has(source)) selected.add(source);
    else needsFull = true;
  }
  if (!needsFull && selected.size === 0) {
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
export function parseChangedPaths(output) {
  const fields = output.split('\0');
  if (fields.at(-1) === '') fields.pop();
  const paths = new Set();
  for (let index = 0; index < fields.length; ) {
    const status = fields[index++];
    if (!/^(?:[ACDMRTUXB]|[RC]\d+)$/.test(status)) {
      throw new Error(`Unexpected git diff status: ${status}`);
    }
    const count = /^[RC]/.test(status) ? 2 : 1;
    for (let item = 0; item < count; item++) {
      const file = fields[index++];
      if (!file) throw new Error('Incomplete git diff path');
      paths.add(file);
    }
  }
  return [...paths].sort();
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

export function collectChangedPaths({ root = ROOT, base, head = 'HEAD', eventName = 'push' }) {
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
    } catch (error) {
      diffAvailable = false;
      console.warn(`Pages scope: falling back to full regression (${error.message})`);
    }
  }
  const result = selectPagesScope({
    ...catalog,
    eventName,
    refName: env.GITHUB_REF_NAME,
    changedPaths,
    diffAvailable,
  });
  const output = Object.entries(result)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}\n`)
    .join('');
  if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, output);
  console.log(`Pages scope: ${JSON.stringify(result)}`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
