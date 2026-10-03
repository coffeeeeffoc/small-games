import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { auditGameMeta, gameHistory, validateGameMeta } from './game-meta.mjs';

const game = { id: 'mini', source: 'games/local/mini' };
const record = { commit: 'a'.repeat(40), time: '2026-09-01T08:00:00+08:00' };
const validMeta = () => ({
  schemaVersion: 1,
  games: { mini: { source: game.source, created: { ...record }, updated: { ...record } } },
});

test('requires coverage, matching sources, full SHAs and valid zoned times', () => {
  assert.deepEqual(validateGameMeta(validMeta(), [game]), []);
  for (const broken of [null, {}, { schemaVersion: 2, games: {} }, { schemaVersion: 1, games: [] }])
    assert.equal(validateGameMeta(broken, [game])[0].code, 'game-meta-invalid');
  const missing = validMeta();
  delete missing.games.mini;
  assert.equal(validateGameMeta(missing, [game])[0].code, 'game-meta-missing');
  const moved = validMeta();
  moved.games.mini.source = 'games/local/other';
  assert.equal(validateGameMeta(moved, [game])[0].code, 'game-meta-source');
  for (const kind of ['created', 'updated']) {
    for (const change of [
      { commit: 'a1234567' },
      { time: 'yesterday' },
      { time: '2026-09-01T08:00:00' },
      { time: '2026-13-01T08:00:00Z' },
      { time: '2026-02-30T08:00:00Z' },
    ]) {
      const meta = validMeta();
      Object.assign(meta.games.mini[kind], change);
      assert(validateGameMeta(meta, [game]).some((error) => error.code === 'game-meta-invalid'));
    }
  }
  assert.equal(validateGameMeta(validMeta(), [])[0].code, 'game-meta-orphan');
});

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'small-games-meta-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  function git(cwd, args, date = '2026-09-01T08:00:00+08:00') {
    return execFileSync(
      'git',
      [
        '-c',
        'core.fsmonitor=false',
        '-c',
        'core.hooksPath=',
        '-c',
        'user.name=Meta test',
        '-c',
        'user.email=meta@example.test',
        ...args,
      ],
      {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      },
    ).trim();
  }
  const write = async (file, value) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), value);
  };
  const commit = (cwd, message, date) => {
    git(cwd, ['add', '.']);
    git(cwd, ['commit', '--quiet', '-m', message], date);
    return git(cwd, ['rev-parse', 'HEAD']);
  };
  git(root, ['init', '--quiet']);
  return { root, git, write, commit };
}

test('follows a directory migration and includes code changes before package creation', async (t) => {
  const f = await fixture(t);
  await f.write('apps/mini/play.js', 'first game');
  const created = f.commit(f.root, 'first game');
  await f.write('apps/mini/package.json', '{"name":"mini"}');
  f.commit(f.root, 'package added', '2026-09-02T09:00:00+08:00');
  await mkdir(path.join(f.root, 'games/local'), { recursive: true });
  f.git(f.root, ['mv', 'apps/mini', game.source]);
  f.commit(f.root, 'move game', '2026-09-03T10:00:00+08:00');
  await f.write(`${game.source}/play.js`, 'game changed without package change');
  const updated = f.commit(f.root, 'game updated', '2026-09-04T11:00:00+08:00');
  await f.write('README.md', 'unrelated');
  f.commit(f.root, 'unrelated', '2026-09-05T12:00:00+08:00');
  assert.deepEqual(gameHistory(f.root, game), {
    source: game.source,
    created: { commit: created, time: '2026-09-01T08:00:00+08:00' },
    updated: { commit: updated, time: '2026-09-04T11:00:00+08:00' },
  });
});

test('uses the pinned submodule history rather than an unpinned checkout update', async (t) => {
  const f = await fixture(t);
  const source = 'games/submodules/mini';
  await f.write(`${source}/play.js`, 'first');
  const child = path.join(f.root, source);
  f.git(child, ['init', '--quiet']);
  const created = f.commit(child, 'first');
  await f.write(`${source}/play.js`, 'pinned');
  const updated = f.commit(child, 'pinned', '2026-09-02T09:00:00+08:00');
  f.git(f.root, ['update-index', '--add', '--cacheinfo', `160000,${updated},${source}`]);
  f.git(f.root, ['commit', '--quiet', '-m', 'pin game']);
  await f.write(`${source}/play.js`, 'not pinned');
  f.commit(child, 'not pinned', '2026-09-03T10:00:00+08:00');
  assert.deepEqual(gameHistory(f.root, { id: 'mini', source }), {
    source,
    created: { commit: created, time: '2026-09-01T08:00:00+08:00' },
    updated: { commit: updated, time: '2026-09-02T09:00:00+08:00' },
  });
});

test('does not inherit a template game creation commit when package.json was copied', async (t) => {
  const f = await fixture(t);
  const pkg = JSON.stringify({
    name: 'mini',
    version: '1.0.0',
    private: true,
    scripts: { build: 'vite build', test: 'node --test' },
  });
  await f.write('games/local/template/package.json', pkg);
  await f.write('games/local/template/play.js', 'template game');
  f.commit(f.root, 'template game');
  await f.write(`${game.source}/package.json`, pkg);
  await f.write(`${game.source}/play.js`, 'a new game');
  const created = f.commit(f.root, 'create new game from template', '2026-09-02T09:00:00+08:00');
  assert.equal(gameHistory(f.root, game).created.commit, created);
});

test('refuses to invent creation history in a shallow clone or for an uncommitted game', async (t) => {
  const f = await fixture(t);
  await f.write('README.md', 'root');
  const head = f.commit(f.root, 'root');
  await f.write(`${game.source}/package.json`, '{}');
  assert.throws(() => gameHistory(f.root, game), /尚无已提交历史/);
  await f.write('.git/shallow', head + '\n');
  assert.throws(() => gameHistory(f.root, game), /历史不完整/);
  assert.deepEqual(validateGameMeta(validMeta(), [game]), []);
  assert.equal((await auditGameMeta(f.root, [game]))[0].code, 'game-meta-invalid');
});
