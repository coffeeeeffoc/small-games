import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { selectPagesGames, verifyPagesArtifacts } from './pages-validation.mjs';
import { monitorPagesPage } from './pages-browser-monitor.mjs';

const games = [{ id: 'merge-front' }, { id: 'heavy-game' }];

test('game selection preserves all/default and shell-only modes, rejects invalid IDs', () => {
  assert.deepEqual(selectPagesGames(games, undefined), games);
  assert.deepEqual(selectPagesGames(games, ''), games);
  assert.deepEqual(selectPagesGames(games, '[]'), []);
  assert.deepEqual(selectPagesGames(games, '["heavy-game", "heavy-game"]'), [games[1]]);
  for (const input of ['oops', '{}', '[null]', '["missing"]'])
    assert.throws(() => selectPagesGames(games, input), /PAGES_GAME_IDS/);
});

async function artifactFixture(t, files) {
  const dist = await mkdtemp(path.join(tmpdir(), 'pages-validation-'));
  t.after(() => rm(dist, { recursive: true, force: true }));
  for (const [file, contents] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dist, file)), { recursive: true });
    await writeFile(path.join(dist, file), contents);
  }
  return dist;
}

test('checks all standalone indexes, lazy built-ins and recursive local module/CSS assets', async (t) => {
  const dist = await artifactFixture(t, {
    'index.html': '<script type="module" src="/small-games/dev/assets/lobby.js"></script>',
    '.vite/manifest.json': '{"built-in": {"file":"assets/lazy.js"}}',
    'assets/lobby.js': 'import "./styles.css"; import("./lazy.js");',
    'assets/lazy.js': 'export { start } from "./core.js";',
    'assets/core.js': 'export const start = new URL("tile.svg", import.meta.url);',
    'assets/styles.css': '@import "./theme.css"; main {background: url("./tile.svg?v=1");}',
    'assets/theme.css': 'body {color: #fff;}',
    'assets/tile.svg': '<svg/>',
    'games/merge-front/index.html':
      '<!-- <script src="missing.js"></script> --><script src="./game.js"></script>',
    'games/merge-front/game.js': 'import "https://cdn.example.com/library.js";',
  });
  const verify = () =>
    verifyPagesArtifacts({ dist, games: [games[0]], basePath: '/small-games/dev/' });
  assert.deepEqual(await verify(), { games: 1, files: 9 });
  await rm(path.join(dist, 'assets/core.js'));
  await assert.rejects(verify(), /Missing Pages artifact: assets\/core.js/);
});

test('rejects assets outside deployment base and missing unvisited game indexes', async (t) => {
  const dist = await artifactFixture(t, {
    'index.html': '<link rel="stylesheet" href="/assets/root.css">',
    '.vite/manifest.json': '{}',
  });
  await assert.rejects(verifyPagesArtifacts({ dist, games: [] }), /escapes Pages base/);
  await writeFile(path.join(dist, 'index.html'), '<h1>Lobby</h1>');
  await assert.rejects(verifyPagesArtifacts({ dist, games }), /games\/merge-front\/index.html/);
});

test('browser monitor scopes browser resource errors and preserves actionable console errors', () => {
  const page = new EventEmitter();
  const failures = [];
  const base = 'http://127.0.0.1:43000/small-games/';
  monitorPagesPage(page, base, failures);
  const consoleError = (text, url) =>
    page.emit('console', {
      type: () => 'error',
      text: () => text,
      location: () => ({ url, lineNumber: 2, columnNumber: 4 }),
    });
  consoleError(
    'Failed to load resource: the server responded with a status of 404 (Not Found)',
    'http://127.0.0.1:43000/favicon.ico',
  );
  assert.deepEqual(failures, []);
  consoleError('Game startup failed', 'https://cdn.example.com/game.js');
  assert.match(failures.pop(), /Game startup failed.*cdn\.example\.com\/game\.js:3:5/);
  consoleError('Failed to load resource: net::ERR_FAILED', `${base}games/merge-front/game.js`);
  assert.match(failures.pop(), /ERR_FAILED.*small-games\/games\/merge-front\/game\.js/);
  page.emit('response', { url: () => `${base}assets/missing.js`, status: () => 404 });
  assert.match(failures.pop(), /404.*assets\/missing\.js/);
  page.emit('request', { url: () => 'http://localhost:43002/catalog' });
  assert.match(failures.pop(), /local Runtime/);
});
