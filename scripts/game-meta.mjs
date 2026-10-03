import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const GAME_META_PATH = 'apps/shell-web/src/game-meta.json';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const sha = /^[a-f0-9]{40}$/;
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const validTime = (value) => {
  if (typeof value !== 'string' || !iso.test(value) || !Number.isFinite(Date.parse(value)))
    return false;
  const offset = value.match(/([+-])(\d{2}):(\d{2})$/);
  const minutes = offset
    ? (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === '+' ? 1 : -1)
    : 0;
  return (
    new Date(Date.parse(value) + minutes * 60_000).toISOString().slice(0, 19) === value.slice(0, 19)
  );
};

/** Validate without Git so shallow CI checkouts and source archives can use the catalog. */
export function validateGameMeta(meta, games) {
  const errors = [];
  const fail = (code, location, message) => errors.push({ code, path: location, message });
  if (
    meta?.schemaVersion !== 1 ||
    !meta.games ||
    typeof meta.games !== 'object' ||
    Array.isArray(meta.games)
  ) {
    fail('game-meta-invalid', GAME_META_PATH, 'meta 必须包含 schemaVersion: 1 和 games 对象');
    return errors;
  }
  for (const game of games) {
    const entry = meta.games[game.id];
    if (!entry) {
      fail(
        'game-meta-missing',
        game.source,
        `游戏 ${game.id} 缺少创建和更新记录，请在游戏提交后运行 pnpm sync:game-meta`,
      );
      continue;
    }
    if (entry.source !== game.source)
      fail('game-meta-source', game.source, `游戏 ${game.id} 的 meta.source 与登记目录不一致`);
    for (const kind of ['created', 'updated']) {
      const record = entry[kind];
      if (!sha.test(record?.commit ?? '') || !validTime(record?.time))
        fail(
          'game-meta-invalid',
          game.source,
          `${game.id}.${kind} 必须包含完整 commit SHA 和带时区的 ISO 提交时间`,
        );
    }
    if (
      entry.created?.commit === entry.updated?.commit &&
      entry.created?.time !== entry.updated?.time
    )
      fail('game-meta-invalid', game.source, `${game.id} 的同一 commit 不能有两个不同提交时间`);
  }
  for (const id of Object.keys(meta.games))
    if (!games.some((game) => game.id === id))
      fail('game-meta-orphan', GAME_META_PATH, `meta 包含未登记的游戏 ${id}`);
  return errors;
}

export async function auditGameMeta(root, games) {
  try {
    return validateGameMeta(
      JSON.parse(await readFile(path.join(root, GAME_META_PATH), 'utf8')),
      games,
    );
  } catch (error) {
    return [
      {
        code: 'game-meta-invalid',
        path: GAME_META_PATH,
        message: `无法读取游戏 meta：${error.message}`,
      },
    ];
  }
}

function git(cwd, args) {
  return execFileSync('git', ['-c', 'core.fsmonitor=false', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
}

/** Root-owned games follow package renames; submodules use the parent's pinned revision. */
export function gameHistory(root, game) {
  const submodule = game.source.startsWith('games/submodules/');
  const cwd = submodule ? path.join(root, game.source) : root;
  if (git(cwd, ['rev-parse', '--is-shallow-repository']) === 'true')
    throw new Error(`${game.source} 的 Git 历史不完整；请先取得完整历史，再回填创建记录`);
  const revision = submodule ? git(root, ['rev-parse', `HEAD:${game.source}`]) : 'HEAD';
  const directories = new Set([game.source]);
  if (!submodule) {
    const renames = git(root, [
      'log',
      '--follow',
      '--format=',
      '--name-status',
      revision,
      '--',
      `${game.source}/package.json`,
    ]);
    for (const line of renames.split('\n')) {
      const [status, ...filenames] = line.trim().split('\t');
      // --follow also follows copied templates; those belong to a different game.
      if (status.startsWith('C')) break;
      for (const filename of filenames)
        if (filename.endsWith('/package.json')) directories.add(path.posix.dirname(filename));
    }
  }
  const history = git(cwd, [
    'log',
    '--topo-order',
    '--format=%H%x09%cI',
    revision,
    '--',
    ...(submodule ? ['.'] : [...directories]),
  ]);
  if (!history)
    throw new Error(`${game.source} 尚无已提交历史；先提交游戏，再运行 pnpm sync:game-meta`);
  const records = history.split('\n').map((line) => {
    const [commit, time] = line.trim().split('\t');
    return { commit, time };
  });
  return { source: game.source, created: records.at(-1), updated: records[0] };
}

export function generateGameMeta(root, games) {
  return {
    schemaVersion: 1,
    games: Object.fromEntries(
      [...games]
        .sort((a, b) => a.id.localeCompare(b.id, 'en'))
        .map((game) => [game.id, gameHistory(root, game)]),
    ),
  };
}

async function main(args) {
  if (args.some((arg) => !['--write', '--check-history'].includes(arg)) || args.length > 1)
    throw new Error('用法：pnpm check:game-meta [--check-history] 或 pnpm sync:game-meta');
  const { auditGameConfig } = await import('./check-game-config.mjs');
  const report = await auditGameConfig(ROOT, { meta: false });
  if (report.errors.length)
    throw new Error(
      report.errors.map((error) => `[${error.code}] ${error.path}: ${error.message}`).join('\n'),
    );
  if (args.includes('--write')) {
    const generated = generateGameMeta(ROOT, report.games);
    const errors = validateGameMeta(generated, report.games);
    if (errors.length) throw new Error(JSON.stringify(errors));
    await writeFile(path.join(ROOT, GAME_META_PATH), JSON.stringify(generated, null, 2) + '\n');
    console.log(`已从 Git 历史更新 ${report.games.length} 个游戏的 meta。`);
    return;
  }
  const errors = await auditGameMeta(ROOT, report.games);
  if (errors.length)
    throw new Error(
      errors.map((error) => `[${error.code}] ${error.path}: ${error.message}`).join('\n'),
    );
  if (args.includes('--check-history')) {
    const actual = JSON.parse(await readFile(path.join(ROOT, GAME_META_PATH), 'utf8'));
    const expected = generateGameMeta(ROOT, report.games);
    for (const game of report.games)
      if (!isDeepStrictEqual(actual.games[game.id], expected.games[game.id]))
        throw new Error(`${game.id} 的 meta 与 Git 历史不一致，请运行 pnpm sync:game-meta`);
  }
  console.log(`${report.games.length} 个游戏的 meta 检查通过。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
