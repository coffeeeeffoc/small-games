import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { syncGameDevMode } from './sync-game-dev-mode.mjs';

const runtime = await readFile(new URL('../platforms/h5/dev-mode.js', import.meta.url), 'utf8');
function tools({ search = '', hash = '', stored = null, parent, blockedStorage = false } = {}) {
  const window = {
    location: { search, hash, pathname: '/games/example/index.html' },
    localStorage: { getItem: () => stored },
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 2,
  };
  window.parent = parent ?? window;
  if (blockedStorage)
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('SecurityError');
      },
    });
  vm.runInNewContext(runtime, { window, URLSearchParams });
  return window.SmallGamesDev;
}

test('production defaults off; URL and localStorage use the same explicit opt-in', () => {
  assert.equal(tools().isEnabled(), false);
  for (const value of ['', '1', 'true', 'on', 'yes', ' TRUE ']) {
    assert.equal(tools({ search: `?dev=${encodeURIComponent(value)}` }).isEnabled(), true, value);
    assert.equal(tools({ stored: value }).isEnabled(), true, value);
  }
  for (const value of ['0', 'false', 'off', 'no', 'undefined', 'banana']) {
    assert.equal(tools({ search: `?dev=${value}`, stored: 'true' }).isEnabled(), false, value);
    assert.equal(tools({ stored: value }).isEnabled(), false, value);
  }
  assert.equal(tools({ search: '?dev', blockedStorage: true }).isEnabled(), true);
  assert.equal(tools({ blockedStorage: true }).isEnabled(), false);
});

test('iframe URL overrides parent URL, which overrides shared storage', () => {
  const parent = { location: { search: '?dev=1', hash: '' } };
  parent.parent = parent;
  assert.equal(tools({ parent }).state().source, 'parent-url');
  assert.equal(tools({ parent }).isEnabled(), true);
  assert.equal(tools({ parent, search: '?dev=0', stored: '1' }).isEnabled(), false);
  parent.location.search = '?dev=0';
  assert.equal(tools({ parent, stored: '1' }).isEnabled(), false);
  assert.equal(tools({ parent, search: '?dev=true' }).isEnabled(), true);
  const crossOrigin = {};
  Object.defineProperty(crossOrigin, 'location', {
    get() {
      throw new Error('SecurityError');
    },
  });
  assert.equal(tools({ parent: crossOrigin, stored: 'true' }).isEnabled(), true);
  assert.equal(tools({ parent: crossOrigin }).isEnabled(), false);
  assert.equal(tools({ parent: crossOrigin, search: '?dev' }).isEnabled(), true);
});

test('Shell hash query and independently opened URLs preserve mode and challenge parameters', () => {
  const dev = tools({ search: '?dev=0', hash: '#/games/wulong-city?challenge=26&dev=true' });
  assert.equal(dev.isEnabled(), true);
  assert.equal(dev.withMode('challenge=26'), 'challenge=26&dev=1');
  assert.equal(dev.withMode('challenge=26&dev=0'), 'challenge=26&dev=0');
  assert.equal(tools({ stored: 'true' }).withMode('route=river'), 'route=river&dev=1');
  assert.equal(tools({ search: '?dev=0', stored: 'true' }).withMode(), 'dev=0');
  assert.equal(tools().withMode('seed=42'), 'seed=42');
  assert.equal(tools({ hash: '#invite?dev=1' }).isEnabled(), false);
});

test('developer snapshots report actual state and can be removed on game disposal', () => {
  const dev = tools({ search: '?dev' });
  const value = { phase: 'playing', score: 7 };
  const cleanup = dev.registerSnapshot(() => value);
  assert.equal(dev.inspect().game, value);
  cleanup();
  assert.equal(dev.inspect().game, undefined);
  const unregister = dev.registerActions([{ id: 'example', label: '示例', run() {} }]);
  unregister();
});

test('new game directories must carry the shared runtime, entry and independent build', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'game-dev-mode-'));
  async function save(relative, content) {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  try {
    await save('platforms/h5/dev-mode.js', runtime);
    await save(
      'platforms/h5/dev-mode.d.ts',
      await readFile(new URL('../platforms/h5/dev-mode.d.ts', import.meta.url)),
    );
    await save('apps/shell-web/index.html', '<script type="module" src="./dev-mode.js"></script>');
    await mkdir(path.join(root, 'games/submodules'), { recursive: true });
    await save(
      'games/local/new-game/package.json',
      JSON.stringify({ scripts: { build: 'node build.mjs' } }),
    );
    await save('games/local/new-game/index.html', '<html><head></head></html>');
    await save('games/local/new-game/build.mjs', '// build without developer runtime');
    let audit = await syncGameDevMode({ root, check: true });
    assert.equal(audit.games, 1);
    assert.ok(audit.errors.some((error) => error.includes('缺失或不同步')));
    await syncGameDevMode({ root });
    audit = await syncGameDevMode({ root, check: true });
    assert.equal(
      audit.errors.length,
      2,
      'copying helpers alone must not pass the entry/build gate',
    );
    await save('games/local/new-game/index.html', '<script src="./dev-mode.js"></script>');
    await save('games/local/new-game/build.mjs', "const files = ['index.html', 'dev-mode.js'];");
    assert.equal((await syncGameDevMode({ root, check: true })).errors.length, 0);
    await save('games/local/new-game/dev-mode.js', '// stale copy');
    assert.equal((await syncGameDevMode({ root, check: true })).errors.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
