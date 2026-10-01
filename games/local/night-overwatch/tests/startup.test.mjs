import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installStartup } from '../startup/install.mjs';
import { sourceHash } from '../scripts/artifact.mjs';

const runtime = await readFile(new URL('../startup/runtime.js', import.meta.url), 'utf8');
function harness({ reduced = true, importError, startError, stalled = false } = {}) {
  class Element extends EventTarget {
    dataset = {};
    attrs = new Map();
    hidden = false;
    removed = false;
    textContent = '';
    parentElement = { getBoundingClientRect: () => ({ width: 390, height: 844 }) };
    setAttribute(key, value) { this.attrs.set(key, value); }
    removeAttribute(key) { this.attrs.delete(key); }
    focus() { this.focused = true; }
    remove() { this.removed = true; }
  }
  const nodes = Object.fromEntries(['night-startup', 'night-status', 'night-hint', 'night-retry',
    'night-progress', 'GameDiv', 'GameCanvas'].map((id) => [id, new Element()]));
  const timers = new Map();
  const window = new EventTarget();
  let reloads = 0;
  window.location = { reload: () => reloads++ };
  const game = new EventEmitter();
  game.pause = () => { game.paused = true; };
  const baseHooks = [];
  game.onPostBaseInitDelegate = { add: (hook) => baseHooks.push(hook) };
  const splash = { totalTime: 2000, logo: { type: 'default', base64: 'default-logo' } };
  const director = new EventEmitter();
  const engine = { game, director,
    settings: {
      overrideSettings(category, key, value) { assert.equal(category, 'splashScreen'); splash[key] = value; },
      querySettings(category, key) { assert.equal(category, 'splashScreen'); return splash[key]; },
    },
    Game: { EVENT_POST_SUBSYSTEM_INIT: 'subsystem', EVENT_POST_PROJECT_INIT: 'project' },
    Director: { EVENT_AFTER_SCENE_LAUNCH: 'scene', EVENT_AFTER_DRAW: 'draw' } };
  class Application {
    init() {}
    async start() {
      if (startError) throw startError;
      for (const hook of baseHooks) await hook();
      assert.equal(splash.totalTime, 0, 'Disable the actual splash before subsystem/project init');
      assert.equal(splash.logo.type, 'none');
      assert.equal(splash.logo.base64, undefined);
      game.emit('subsystem');
      if (stalled) return;
      game.emit('project');
      director.emit('scene');
    }
  }
  vm.runInNewContext(runtime, { window, document: { getElementById: (id) => nodes[id] },
    matchMedia: () => ({ matches: reduced }), console: { error() {} },
    setTimeout(fn, ms) { const id = {}; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => timers.delete(id),
    System: { async import(name) {
      if (importError) throw importError;
      return name === 'cc' ? engine : { Application };
    } },
  });
  const emit = (name, detail) => {
    const event = new Event(name);
    Object.defineProperty(event, 'detail', { value: detail });
    window.dispatchEvent(event);
  };
  return { nodes, timers, game, director, window, emit, reloads: () => reloads,
    boot: () => window.NightStartup.boot('./application.js', 'web-mobile') };
}

test('ready requires the game signal AND a subsequent scene draw, then cleans up', async () => {
  const h = harness();
  await h.boot();
  assert.equal(h.nodes.GameCanvas.width, 390);
  assert.equal(h.nodes.GameDiv.attrs.has('inert'), true);
  h.director.emit('draw');
  assert.equal(h.nodes['night-startup'].removed, false, 'A scene frame alone is not game readiness');
  h.emit('night-overwatch:ready');
  assert.equal(h.nodes['night-startup'].removed, false, 'Wait for a frame after async models settle');
  h.director.emit('draw');
  assert.equal(h.nodes['night-startup'].removed, true);
  assert.equal(h.nodes.GameDiv.attrs.has('inert'), false);
  assert.equal(h.nodes.GameCanvas.focused, true);
  assert.equal(h.timers.size, 0);
  assert.equal(h.director.eventNames().length, 0);
  h.emit('night-overwatch:error', { message: 'late runtime error' });
  assert.notEqual(h.nodes['night-startup'].dataset.state, 'error');
});

test('an early game signal is retained but cannot bypass scene launch', async () => {
  const h = harness({ stalled: true });
  h.emit('night-overwatch:ready');
  await h.boot();
  h.director.emit('draw');
  assert.equal(h.nodes['night-startup'].removed, false);
  h.director.emit('scene');
  h.director.emit('draw');
  assert.equal(h.nodes['night-startup'].removed, true);
});

test('engine import and initialization failures expose a real reload action', async () => {
  for (const options of [{ importError: Error('offline') }, { startError: Error('WebGL unavailable') }]) {
    const h = harness(options);
    await h.boot();
    assert.equal(h.nodes['night-startup'].dataset.state, 'error');
    assert.equal(h.nodes['night-retry'].hidden, false);
    assert.equal(h.nodes['night-retry'].focused, true);
    assert.equal(h.timers.size, 0);
    h.nodes['night-retry'].dispatchEvent(new Event('click'));
    assert.equal(h.reloads(), 1);
  }
});

test('game errors and a missing ready signal fail closed; late ready never hides an error', async () => {
  for (const timeout of [false, true]) {
    const h = harness();
    await h.boot();
    if (timeout) [...h.timers.values()].find((timer) => timer.ms === 60000).fn();
    else h.emit('night-overwatch:error', { message: '机舱模型载入失败' });
    assert.equal(h.nodes['night-startup'].dataset.state, 'error');
    assert.equal(h.game.paused, true);
    h.emit('night-overwatch:ready');
    h.director.emit('draw');
    assert.equal(h.nodes['night-startup'].removed, false);
    assert.equal(h.timers.size, 0);
  }
});

test('global exceptions, rejected promises, script failures and context loss are terminal', async () => {
  for (const type of ['error', 'unhandledrejection', 'script', 'webglcontextlost']) {
    const h = harness();
    await h.boot();
    if (type === 'webglcontextlost') h.nodes.GameCanvas.dispatchEvent(new Event(type));
    else {
      const event = new Event(type === 'script' ? 'error' : type);
      if (type === 'script') Object.defineProperty(event, 'target', { value: { tagName: 'SCRIPT' } });
      h.window.dispatchEvent(event);
    }
    assert.equal(h.nodes['night-startup'].dataset.state, 'error', type);
  }
});

test('fade-out is presentation only and has a bounded removal fallback', async () => {
  const h = harness({ reduced: false });
  await h.boot();
  assert.equal([...h.timers.values()].some((timer) => timer.ms === 450), false);
  h.emit('night-overwatch:ready');
  h.director.emit('draw');
  assert.equal(h.nodes['night-startup'].dataset.state, 'leaving');
  assert.equal(h.nodes['night-startup'].removed, false);
  [...h.timers.values()].find((timer) => timer.ms === 450).fn();
  assert.equal(h.nodes['night-startup'].removed, true);
});

test('both Creator entries are repeatable, preserve hashed files and tolerate Builder ignoring splash options', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'night-startup-'));
  try {
    for (const target of ['web-mobile', 'web-desktop']) {
      const out = path.join(temp, target);
      await mkdir(path.join(out, 'src'), { recursive: true });
      const index = 'System.register(["./application.abc12.js"], function () {});';
      const app = "this.settingsPath = 'src/settings.123ab.json';";
      const html = '<html>\n<head>\n  </head>\n<body>\n  <div id="GameDiv"><canvas id="GameCanvas"></canvas></div><script>System.import(\'./index.a12b3.js\').catch(function(err) { console.error(err); })</script></body></html>';
      const settings = { CocosEngine: '3.8.8', splashScreen: { totalTime: 0, logo: { type: 'none' } } };
      const settingsFile = path.join(out, 'src/settings.123ab.json');
      await writeFile(path.join(out, 'index.html'), html);
      await writeFile(path.join(out, 'index.a12b3.js'), index);
      await writeFile(path.join(out, 'application.abc12.js'), app);
      await writeFile(settingsFile, JSON.stringify(settings));
      await installStartup(out, target);
      const first = await readFile(path.join(out, 'index.html'), 'utf8');
      await installStartup(out, target);
      assert.equal(await readFile(path.join(out, 'index.html'), 'utf8'), first);
      assert.equal(await readFile(path.join(out, 'index.a12b3.js'), 'utf8'), index);
      assert.equal(await readFile(path.join(out, 'application.abc12.js'), 'utf8'), app);
      assert.equal(await readFile(settingsFile, 'utf8'), JSON.stringify(settings));
      assert.match(first, /startup\/background\.[a-f0-9]{12}\.webp/);
      assert.equal((first.match(/id="night-startup"/g) || []).length, 1);
      assert.equal((first.match(/NightStartup\.boot\(/g) || []).length, 1);
      assert.ok(first.indexOf('id="night-startup"') < first.indexOf('id="GameCanvas"'));
      assert.doesNotMatch(first, /System\.import\(['"]\.\/index/);
      for (const splashScreen of [{ totalTime: 2000, logo: { type: 'default' } },
        { totalTime: 0, logo: { type: 'default' } }, { totalTime: 0, logo: { base64: 'old-logo' } }]) {
        await writeFile(settingsFile, JSON.stringify({ ...settings, splashScreen }));
        await installStartup(out, target);
        assert.equal(await readFile(path.join(out, 'index.html'), 'utf8'), first);
        assert.equal(await readFile(settingsFile, 'utf8'), JSON.stringify({ ...settings, splashScreen }));
      }
      await writeFile(settingsFile, JSON.stringify({ ...settings, CocosEngine: '3.9.0' }));
      await assert.rejects(installStartup(out, target), /Creator 3.8.8/);
      await writeFile(path.join(out, 'index.html'), '<html>Unknown template</html>');
      await assert.rejects(installStartup(out, target), /Unknown Creator/);
    }
  } finally {
    assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('night-startup-'));
    await rm(temp, { recursive: true, force: true });
  }
});

test('startup templates normalize line endings while content and binary changes invalidate artifacts', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'night-startup-hash-'));
  try {
    for (const dir of ['assets', 'scripts', 'startup', 'tests', 'settings/v2/packages'])
      await mkdir(path.join(temp, dir), { recursive: true });
    for (const name of ['package.json', 'settings/v2/packages/engine.json', 'settings/v2/packages/project.json'])
      await writeFile(path.join(temp, name), '{}');
    for (const name of ['overlay.html', 'overlay.css', 'runtime.js', 'background.webp'])
      await cp(new URL(`../startup/${name}`, import.meta.url), path.join(temp, 'startup', name));
    const hash = await sourceHash(temp);
    const testFile = path.join(temp, 'tests/startup.test.mjs');
    await writeFile(testFile, '// startup test\n');
    assert.equal(await sourceHash(temp), hash, 'Adding tests must not invalidate the artifact');
    await writeFile(testFile, '// changed startup test\n');
    assert.equal(await sourceHash(temp), hash, 'Editing tests must not invalidate the artifact');
    for (const name of ['overlay.html', 'overlay.css', 'runtime.js']) {
      const file = path.join(temp, 'startup', name);
      const original = (await readFile(file, 'utf8')).replaceAll('\r\n', '\n');
      await writeFile(file, original.replaceAll('\n', '\r\n'));
      assert.equal(await sourceHash(temp), hash);
      await writeFile(file, original + '\nchanged');
      assert.notEqual(await sourceHash(temp), hash);
      await writeFile(file, original);
    }
    await writeFile(path.join(temp, 'startup/background.webp'), Buffer.from([1, 2, 3]));
    assert.notEqual(await sourceHash(temp), hash);
  } finally {
    assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('night-startup-hash-'));
    await rm(temp, { recursive: true, force: true });
  }
});
