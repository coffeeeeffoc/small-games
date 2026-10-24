import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { harness, output, point, root, snapshot, tap } from './cocos-harness.mjs';
import { runtimeManifest, sourceHash } from '../scripts/artifact.mjs';

// Observe the production engine's native audio calls. Every wrapped operation
// still calls the browser implementation; no fake AudioSource/player is used.
function observeAudio() {
  const errorStacks = [];
  addEventListener('error', (event) => {
    if (errorStacks.length < 5) errorStacks.push(event.error?.stack || event.message);
  });
  const nodes = [],
    contexts = new Set(),
    gains = new WeakMap(),
    events = [];
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (...args) {
    const result = Reflect.apply(connect, this, args);
    if (this instanceof AudioBufferSourceNode && args[0] instanceof GainNode)
      gains.set(this, args[0]);
    return result;
  };
  const disconnect = AudioNode.prototype.disconnect;
  AudioNode.prototype.disconnect = function (...args) {
    const result = Reflect.apply(disconnect, this, args);
    const entry = nodes.find(({ source }) => source === this);
    if (entry) entry.record.disconnected = true;
    return result;
  };
  const createGain = BaseAudioContext.prototype.createGain;
  BaseAudioContext.prototype.createGain = function (...args) {
    contexts.add(this);
    return Reflect.apply(createGain, this, args);
  };
  let decoded = 0;
  const decode = BaseAudioContext.prototype.decodeAudioData;
  BaseAudioContext.prototype.decodeAudioData = function (...args) {
    const result = Reflect.apply(decode, this, args);
    result.then(
      () => {
        decoded++;
      },
      () => {},
    );
    return result;
  };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    const result = Reflect.apply(start, this, args);
    // Ignore any single-sample silent unlock buffer created by the engine.
    if (this.buffer?.duration > 0.01) {
      const samples = this.buffer.getChannelData(0);
      const record = {
        id: nodes.length,
        at: performance.now(),
        duration: this.buffer.duration,
        contextState: this.context.state,
        gain: gains.get(this)?.gain.value,
        samplePeak: samples.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0),
        offset: args[1] || 0,
        stopped: false,
        ended: false,
      };
      nodes.push({ source: this, record });
      events.push({ type: 'start', id: record.id, at: record.at });
      this.addEventListener(
        'ended',
        () => {
          record.ended = true;
          events.push({ type: 'ended', id: record.id, at: performance.now() });
        },
        { once: true },
      );
    }
    return result;
  };
  const stop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.stop = function (...args) {
    const result = Reflect.apply(stop, this, args);
    const entry = nodes.find(({ source }) => source === this);
    if (entry) {
      entry.record.stopped = true;
      entry.record.stopAt ??= performance.now();
      events.push({ type: 'stop', id: entry.record.id, at: performance.now() });
    }
    return result;
  };
  const resume = AudioContext.prototype.resume;
  let holdResume = false;
  const pendingResumes = [];
  AudioContext.prototype.resume = function (...args) {
    if (!holdResume) return Reflect.apply(resume, this, args);
    // Fault injection delays a native operation, then executes that same native
    // operation. It does not fake context state or any playback result.
    return new Promise((resolve, reject) => {
      pendingResumes.push(() => Reflect.apply(resume, this, args).then(resolve, reject));
    });
  };
  window.__audioAudit = {
    snapshot: () => ({
      errorStacks,
      nodes: nodes.map(({ record, source }) => ({
        ...record,
        currentGain: gains.get(source)?.gain.value,
      })),
      events: [...events],
      contexts: [...contexts].map((context) => context.state),
      decoded,
      pendingResumes: pendingResumes.length,
    }),
    holdResume: async () => {
      holdResume = true;
      await Promise.all([...contexts].map((context) => context.suspend()));
    },
    releaseResume: async () => {
      holdResume = false;
      await Promise.all(pendingResumes.splice(0).map((run) => run()));
    },
  };
}

assert(!process.env.GAME_URL, 'Audio provenance requires the locally verified dist');
const info = JSON.parse(await readFile(path.join(root, 'dist/build-info.json'), 'utf8'));
assert.equal(info.creator, '3.8.8');
assert.equal(info.target, 'web-mobile');
assert.equal(info.sourceHash, await sourceHash(), 'Build current sources with Creator first');
assert.deepEqual(
  info.files,
  await runtimeManifest(path.join(root, 'dist')),
  'Unmodified Creator dist',
);
const h = await harness();
const report = {
  runtime: 'Cocos Creator 3.8.8 production web-mobile; desktop Chromium touch emulation',
  sourceHash: info.sourceHash,
  observed: 'Native WebAudio start/stop/ended, running context, gain and nonzero decoded samples',
  limitations:
    'No acoustic/physical-speaker measurement or phone/mini-game host acceptance. Browser blur and Creator lifecycle events are explicit desktop fixtures; delayed load/resume are fault injection.',
  checks: [],
  errors: h.errors,
};
const audit = (page) => page.evaluate(() => window.__audioAudit.snapshot());
const installComponent = (page) =>
  page.evaluate(async () => {
    const cc = await globalThis.System.import('cc');
    window.__audioTestGarden = cc.director
      .getScene()
      .getChildByName('BulletGarden')
      .getComponent('BulletGarden');
  });
const readyAudio = (page) => page.waitForFunction(() => !!window.__audioTestGarden.soundClip);
async function freshSound(page, id) {
  const count = (await audit(page)).nodes.length;
  const p = await point(page, id);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForFunction((count) => {
    const observed = window.__audioAudit.snapshot();
    return (
      observed.nodes.length > count &&
      observed.contexts.includes('running') &&
      observed.nodes.at(-1).currentGain === 0.25
    );
  }, count);
  const started = (await audit(page)).nodes.at(-1);
  assert(started.samplePeak > 0, 'Real decoded confirm clip contains sound');
  assert.equal(started.offset, 0, 'A new gesture starts a fresh clip');
  assert(!started.ended, 'Exercise lifecycle while real sound is still active');
  return started.id;
}
async function stopped(page, id, reason) {
  await page.waitForFunction((id) => window.__audioAudit.snapshot().nodes[id].ended, id);
  const node = (await audit(page)).nodes[id];
  assert(node.stopped, `${reason} calls native stop, rather than waiting for natural completion`);
  assert(node.stopAt - node.at < node.duration * 1000 - 20, `${reason} stops before natural end`);
  assert.equal(node.disconnected, true, `${reason} disconnects the stopped native source`);
}
async function staysQuiet(page, label) {
  const initial = await audit(page),
    before = initial.nodes.length;
  await page.waitForTimeout(
    Math.max(0.65, ...initial.nodes.map((node) => node.duration)) * 1000 + 100,
  );
  const after = await audit(page);
  assert.equal(after.nodes.length, before, `${label}: no replay of an earlier gesture`);
  assert(
    after.nodes.every((node) => node.ended),
    `${label}: no live audio nodes`,
  );
}
async function hide(page) {
  await page.evaluate(async () => {
    const cc = await globalThis.System.import('cc');
    window.dispatchEvent(new Event('blur'));
    cc.game.emit(cc.Game.EVENT_HIDE);
    cc.game.emit(cc.Game.EVENT_PAUSE);
  });
}
async function show(page) {
  await page.evaluate(async () => {
    const cc = await globalThis.System.import('cc');
    cc.game.emit(cc.Game.EVENT_RESUME);
    cc.game.emit(cc.Game.EVENT_SHOW);
    window.dispatchEvent(new Event('focus'));
  });
}
async function destroy(page) {
  await page.evaluate(() => window.__audioTestGarden.node.destroy());
  await page.waitForFunction(() => !window.__bulletGarden);
}
async function record(page, check) {
  report.checks.push({ check, ...(await audit(page)) });
}
async function heldAudio() {
  const context = await h.browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await context.addInitScript(observeAudio);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let requested = false;
  await context.route(/\.wav(?:\?|$)/, async (route) => {
    requested = true;
    await gate;
    await route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => h.errors.push(error.message));
  await page.goto(h.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__bulletGarden?.snapshot().art.ready, null, { timeout: 60000 });
  await installComponent(page);
  assert(requested, 'Actually intercept the production audio request');
  assert.equal(await page.evaluate(() => !!window.__audioTestGarden.soundClip), false);
  return { page, context, release };
}

try {
  const s = await h.open({ sdk: observeAudio }),
    p = s.page;
  await installComponent(p);
  await readyAudio(p);
  await staysQuiet(p, 'Initial load before first gesture');
  const first = await freshSound(p, 'settings');
  await record(p, 'First real touch starts native playback');
  await tap(p, 'setting:sound');
  await stopped(p, first, 'Mute');
  const mutedCount = (await audit(p)).nodes.length;
  await tap(p, 'back');
  await tap(p, 'help');
  await tap(p, 'back');
  await tap(p, 'settings');
  assert.equal((await audit(p)).nodes.length, mutedCount, 'Muted menu gestures stay silent');
  assert.equal(
    await p.evaluate(() => JSON.parse(localStorage.getItem('bullet-garden.settings.v1')).sound),
    false,
  );
  await freshSound(p, 'setting:sound');
  await record(p, 'Mute stops live sound, persists, and enabling plays only the new gesture');

  const background = await freshSound(p, 'back');
  await hide(p);
  await stopped(p, background, 'Background');
  await show(p);
  await staysQuiet(p, 'Foreground restore');
  await record(p, 'Background stops real source and foreground cannot revive it');

  await freshSound(p, 'start');
  await freshSound(p, 'pause');
  const paused = await snapshot(p);
  assert.equal(paused.screen, 'paused');
  await staysQuiet(p, 'Manual pause confirmation finishes normally');
  assert.equal(
    (await snapshot(p)).state.time,
    paused.state.time,
    'Audio does not resume simulation',
  );
  await freshSound(p, 'resume');
  assert.equal((await snapshot(p)).screen, 'playing');
  await freshSound(p, 'pause');
  await freshSound(p, 'abandon');
  await record(p, 'Manual pause/resume and paused-menu touch feedback remain available');

  await freshSound(p, 'settings');
  await staysQuiet(p, 'Before delayed context unlock');
  await p.evaluate(() => window.__audioAudit.holdResume());
  const beforePending = (await audit(p)).nodes.length;
  await tap(p, 'setting:vibration');
  assert((await audit(p)).pendingResumes > 0, 'Actual engine is waiting on context resume');
  await tap(p, 'setting:sound');
  await p.evaluate(() => window.__audioAudit.releaseResume());
  assert.equal((await audit(p)).nodes.length, beforePending, 'Muted pending gesture never starts');
  await staysQuiet(p, 'Context unlock after mute');
  await freshSound(p, 'setting:sound');
  await record(p, 'Pending context unlock is cancelled by mute; fresh gesture still works');

  const disposed = await freshSound(p, 'back');
  await destroy(p);
  await stopped(p, disposed, 'Destroy');
  await show(p);
  await staysQuiet(p, 'Destroyed scene after foreground events');
  await record(p, 'Scene destruction stops actual playback and unregisters resume');
  await s.close();

  const race = await h.open({ sdk: observeAudio }),
    r = race.page;
  await installComponent(r);
  await readyAudio(r);
  await freshSound(r, 'settings');
  await staysQuiet(r, 'Before late player load');
  await r.evaluate(() => {
    const app = window.__audioTestGarden;
    const Player = app.audio._player.constructor;
    const originalLoad = Player.load;
    const race = (window.__audioLoadRace = { pending: false, released: false });
    let first = true;
    Player.load = function (...args) {
      const actual = Reflect.apply(originalLoad, this, args);
      if (!first) return actual;
      first = false;
      // Hold delivery of the actual engine-created player, not a mock player.
      return actual.then(
        (player) =>
          new Promise((resolve) => {
            race.pending = true;
            race.release = () => {
              resolve(player);
              Player.load = originalLoad;
              race.released = true;
            };
          }),
      );
    };
  });
  await tap(r, 'setting:sound');
  await tap(r, 'setting:sound');
  await r.waitForFunction(() => window.__audioLoadRace.pending);
  await r.evaluate(() => {
    window.__audioLoadRace.cancelledSource = window.__audioTestGarden.audio;
  });
  await tap(r, 'setting:sound');
  await freshSound(r, 'setting:sound');
  const liveCount = (await audit(r)).nodes.length;
  await r.evaluate(() => {
    const app = window.__audioTestGarden,
      race = window.__audioLoadRace;
    race.currentSource = app.audio;
    race.currentPlayer = app.audio._player;
    race.release();
  });
  await staysQuiet(r, 'Old player load after a fresh gesture');
  assert.equal((await audit(r)).nodes.length, liveCount, 'Old load does not start another sound');
  assert(
    await r.evaluate(() => {
      const app = window.__audioTestGarden,
        race = window.__audioLoadRace;
      return (
        app.audio !== race.cancelledSource &&
        app.audio === race.currentSource &&
        app.audio._player === race.currentPlayer
      );
    }),
    'Old load cannot replace the current playable source',
  );
  await freshSound(r, 'back');
  await record(r, 'Cancelled player load cannot replace a fresh source for the same clip');
  await destroy(r);
  await race.close();

  for (const action of ['background', 'destroy']) {
    const late = await heldAudio(),
      q = late.page;
    await tap(q, 'settings');
    assert.equal((await audit(q)).nodes.length, 0, 'No clip means no queued confirmation');
    if (action === 'destroy') await destroy(q);
    else await hide(q);
    const loaded = q.waitForResponse((response) => /\.wav(?:\?|$)/.test(response.url()));
    late.release();
    await loaded;
    await q.waitForFunction(() => window.__audioAudit.snapshot().decoded > 0);
    if (action === 'background') {
      await readyAudio(q);
      await show(q);
    }
    await staysQuiet(q, `Late load after ${action}`);
    if (action === 'background') await freshSound(q, 'back');
    else assert.equal(await q.evaluate(() => !!window.__audioTestGarden.soundClip), false);
    await record(q, `Late production audio response after ${action} cannot replay stale input`);
    await late.context.close();
  }
  assert.deepEqual(h.errors, []);
  report.passed = true;
} catch (error) {
  report.failure = error.stack;
  throw error;
} finally {
  await writeFile(
    path.join(output, 'audio-lifecycle.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await h.close();
}
console.log('Creator native audio lifecycle acceptance passed.');
