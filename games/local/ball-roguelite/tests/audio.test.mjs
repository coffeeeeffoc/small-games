import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlassAudio } from '../src/audio.mjs';

class Param {
  value = 0;
  calls = [];
  setValueAtTime(value, time) {
    this.value = value;
    this.calls.push({ type: 'set', value, time });
  }
  linearRampToValueAtTime(value, time) {
    this.calls.push({ type: 'linear', value, time });
  }
  exponentialRampToValueAtTime(value, time) {
    this.calls.push({ type: 'exponential', value, time });
  }
}
class AudioNode {
  connected = [];
  disconnected = false;
  gain = new Param();
  frequency = new Param();
  connect(node) {
    this.connected.push(node);
  }
  disconnect() {
    this.disconnected = true;
    this.connected = [];
  }
}
class Source extends AudioNode {
  starts = [];
  stops = [];
  start(at = 0) {
    this.starts.push(at);
  }
  stop(at) {
    this.stops.push(at);
  }
  end() {
    this.onended?.();
  }
}
class MockAudioContext {
  static instances = [];
  state = 'suspended';
  currentTime = 0;
  sampleRate = 48000;
  destination = new AudioNode();
  listeners = new Set();
  operations = { resume: [], suspend: [], close: [] };
  gains = [];
  sources = [];
  buffers = [];
  filters = [];
  constructor() {
    MockAudioContext.instances.push(this);
  }
  addEventListener(type, listener) {
    assert.equal(type, 'statechange');
    this.listeners.add(listener);
  }
  removeEventListener(type, listener) {
    this.listeners.delete(listener);
  }
  change(state) {
    this.state = state;
    for (const listener of [...this.listeners]) listener();
  }
  operation(kind, target) {
    let resolve, reject;
    const promise = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    this.operations[kind].push({
      succeed: () => {
        this.change(target);
        resolve();
      },
      fail: () => reject(new Error(kind + ' rejected')),
    });
    return promise;
  }
  resume() {
    return this.operation('resume', 'running');
  }
  suspend() {
    return this.operation('suspend', 'suspended');
  }
  close() {
    return this.operation('close', 'closed');
  }
  createGain() {
    const node = new AudioNode();
    this.gains.push(node);
    return node;
  }
  createOscillator() {
    const node = new Source();
    this.sources.push(node);
    return node;
  }
  createBufferSource() {
    const node = new Source();
    this.sources.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = new AudioNode();
    this.filters.push(node);
    return node;
  }
  createBuffer(channels, frames, rate) {
    const data = new Float32Array(frames),
      buffer = { getChannelData: () => data, channels, frames, rate };
    this.buffers.push(buffer);
    return buffer;
  }
}
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
function setup(t) {
  const old = globalThis.AudioContext;
  MockAudioContext.instances = [];
  globalThis.AudioContext = MockAudioContext;
  t.after(() => {
    if (old === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = old;
  });
  let sound = true;
  const audio = createGlassAudio(() => sound);
  return {
    audio,
    setSound(value) {
      sound = value;
    },
    get context() {
      return MockAudioContext.instances[0];
    },
    async start() {
      audio.setActive(true);
      const c = this.context;
      c.operations.resume[0].succeed();
      await flush();
      return c;
    },
  };
}

test('menus and disabled sound cannot unlock or allocate audio; active play can retry a gesture', async (t) => {
  const f = setup(t);
  f.audio.unlock();
  f.audio.play([{ type: 'hit' }]);
  assert.equal(f.context, undefined);
  f.setSound(false);
  f.audio.setActive(true);
  f.audio.unlock();
  assert.equal(f.context, undefined);
  f.setSound(true);
  f.audio.unlock();
  assert.equal(f.context.operations.resume.length, 1);
  f.context.operations.resume[0].fail();
  await flush();
  assert.equal(f.context.operations.resume.length, 1, 'failure does not start a retry loop');
  f.audio.unlock();
  assert.equal(f.context.operations.resume.length, 2);
  f.context.operations.resume[1].succeed();
  await flush();
  assert.equal(f.audio.state, 'running');
});

test('late resume after a completed suspension is muted and suspended again', async (t) => {
  const f = setup(t);
  f.audio.setActive(true);
  const c = f.context;
  f.audio.suspend();
  c.operations.suspend[0].succeed();
  await flush();
  c.operations.resume[0].succeed();
  await flush();
  assert.equal(f.audio.active, false);
  assert.equal(c.gains[0].gain.value, 0);
  assert.equal(c.operations.suspend.length, 2);
  f.audio.unlock();
  f.audio.play([{ type: 'recall' }]);
  assert.equal(c.operations.resume.length, 1);
  assert.equal(c.sources.length, 0);
  c.operations.suspend[1].succeed();
  await flush();
  assert.equal(f.audio.state, 'suspended');
});

test('sound change is rechecked when a pending resume resolves, even before another UI call', async (t) => {
  const f = setup(t);
  f.audio.setActive(true);
  const c = f.context;
  f.setSound(false);
  c.operations.resume[0].succeed();
  await flush();
  assert.equal(c.gains[0].gain.value, 0);
  assert.equal(f.audio.active, false);
  assert.equal(c.operations.suspend.length, 1);
  c.operations.suspend[0].succeed();
  await flush();
  assert.equal(f.audio.state, 'suspended');
});

test('a stale suspend cannot override a later explicit return to play', async (t) => {
  const f = setup(t),
    c = await f.start();
  f.audio.suspend();
  f.audio.setActive(true);
  c.operations.suspend[0].succeed();
  await flush();
  assert.equal(c.operations.resume.length, 2);
  c.operations.resume[1].succeed();
  await flush();
  assert.equal(f.audio.active, true);
  assert.equal(f.audio.state, 'running');
  assert.equal(c.gains[0].gain.value, 1);
});

test('rapid play-pause-play keeps permission current through both pending transition orders', async (t) => {
  const f = setup(t);
  f.audio.setActive(true);
  const c = f.context;
  f.audio.suspend();
  f.audio.setActive(true);
  c.operations.resume[0].succeed();
  await flush();
  c.operations.suspend[0].succeed();
  await flush();
  assert.equal(c.operations.resume.length, 2);
  c.operations.resume[1].succeed();
  await flush();
  assert.equal(f.audio.state, 'running');
  assert.equal(c.operations.suspend.length, 1);
});

test('suspend stops and disconnects current and future-scheduled voices immediately', async (t) => {
  const f = setup(t),
    c = await f.start();
  f.audio.play([{ type: 'pickup' }, { type: 'won' }]);
  assert.equal(f.audio.stats.voices, 5);
  assert(c.sources.some((source) => source.starts[0] > c.currentTime));
  f.audio.suspend();
  assert.equal(f.audio.stats.voices, 0);
  assert.equal(c.gains[0].gain.value, 0);
  assert(c.sources.every((source) => source.disconnected && source.stops.includes(undefined)));
  c.operations.suspend[0].succeed();
  await flush();
  assert.equal(c.operations.resume.length, 1);
});

test('dispose during resume never restores output or resumes a disposed game', async (t) => {
  const f = setup(t);
  f.audio.setActive(true);
  const c = f.context;
  f.audio.dispose();
  assert.equal(c.listeners.size, 0);
  assert.equal(c.gains[0].disconnected, true);
  c.operations.resume[0].succeed();
  await flush();
  assert.equal(c.operations.close.length, 1);
  assert.equal(c.gains[0].gain.value, 0);
  f.audio.setActive(true);
  f.audio.unlock();
  f.audio.play([{ type: 'break' }]);
  assert.equal(c.sources.length, 0);
  assert.equal(c.operations.resume.length, 1);
  c.operations.close[0].succeed();
  await flush();
  assert.equal(f.audio.state, 'closed');
  f.audio.dispose();
  assert.equal(c.operations.close.length, 1);
});

test('unrequested host resume while inactive is suppressed by statechange', async (t) => {
  const f = setup(t),
    c = await f.start();
  f.audio.suspend();
  c.operations.suspend[0].succeed();
  await flush();
  c.change('running');
  assert.equal(c.gains[0].gain.value, 0);
  assert.equal(c.operations.suspend.length, 2);
  c.operations.suspend[1].succeed();
  await flush();
  assert.equal(f.audio.state, 'suspended');
});

test('all sound types share a 20-source limit and glass noise is baked once', async (t) => {
  const f = setup(t),
    c = await f.start();
  for (let i = 0; i < 20; i++) {
    c.currentTime = i * 0.11;
    f.audio.play(
      [
        { type: 'break' },
        { type: 'hit' },
        { type: 'pickup' },
        { type: 'won' },
        { type: 'return' },
        { type: 'absorb' },
        { type: 'recall' },
      ],
      i,
    );
    assert(f.audio.stats.voices <= 20);
  }
  assert.equal(f.audio.stats.voices, 20);
  assert.equal(c.sources.length, 20, 'saturated effects do not allocate unplayable sources');
  assert.equal(c.buffers.length, 1);
  c.sources.forEach((source) => source.end());
  assert.equal(f.audio.stats.voices, 0);
  c.currentTime = 4;
  f.audio.play([{ type: 'break' }]);
  assert.equal(c.buffers.length, 1);
  assert.equal(c.sources.filter((source) => source.buffer).at(-1).buffer, c.buffers[0]);
});

test('return aliases coalesce and throttle to 100ms; absorb and recall are short downward sweeps', async (t) => {
  const f = setup(t),
    c = await f.start();
  f.audio.play([{ type: 'return' }, { type: 'returned' }]);
  c.currentTime = 0.099;
  f.audio.play([{ type: 'returned' }]);
  assert.equal(f.audio.stats.returns, 1);
  c.currentTime = 0.1;
  f.audio.play([{ type: 'returned' }]);
  assert.equal(f.audio.stats.returns, 2);
  f.audio.play([{ type: 'absorb' }, { type: 'recall' }]);
  assert.equal(f.audio.stats.absorbs, 1);
  assert.equal(f.audio.stats.recalls, 1);
  const sweeps = c.sources.map((source) => source.frequency.calls);
  assert(
    sweeps.some(
      (calls) =>
        calls[0].value === 220 &&
        calls[1].value === 72 &&
        Math.abs(calls[1].time - calls[0].time - 0.12) < 1e-9,
    ),
  );
  assert(
    sweeps.some(
      (calls) =>
        calls[0].value === 360 &&
        calls[1].value === 75 &&
        Math.abs(calls[1].time - calls[0].time - 0.22) < 1e-9,
    ),
  );
});

test('collision count preserves pitch progression and shatter has its own throttle', async (t) => {
  const f = setup(t),
    c = await f.start();
  f.audio.play([{ type: 'hit', collisionCount: 1 }]);
  assert.equal(f.audio.stats.lastFrequency, 587.33);
  c.currentTime = 0.05;
  f.audio.play([{ type: 'hit', collisionCount: 17 }, { type: 'break' }]);
  assert.equal(f.audio.stats.lastFrequency, 587.33 * 1.08);
  assert.equal(f.audio.stats.impacts, 2);
  assert.equal(f.audio.stats.shatters, 1);
});
