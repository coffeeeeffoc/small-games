import test from 'node:test';
import assert from 'node:assert/strict';
import { PROGRESS_KEY, readProgress, persistProgress } from '../progress.mjs';
import { createAudio } from '../audio.mjs';

const levels = [{ id: 'first' }, { id: 'second' }, { id: 'third' }];
const defaults = { version: 1, selected: 0, completed: {}, sound: false, locale: 'zh' };

function memoryStorage(initial) {
  const entries = new Map(initial === undefined ? [] : [[PROGRESS_KEY, initial]]);
  return {
    getItem(key) {
      return entries.get(key) ?? null;
    },
    setItem(key, value) {
      entries.set(key, value);
    },
  };
}

test('progress survives a reload with best-attempt scores and explicit preferences', () => {
  const storage = memoryStorage();
  const progress = {
    version: 1,
    selected: 2,
    completed: { first: { attempts: 3 }, second: { attempts: 1 } },
    sound: true,
    locale: 'en',
  };
  assert.equal(persistProgress(storage, progress), true);
  assert.deepEqual(readProgress(storage, levels), progress);
});

test('missing, malformed, old and denied storage all start a playable game', () => {
  for (const value of [
    undefined,
    '',
    '{broken',
    'null',
    '[]',
    '12',
    '{"version":2,"selected":1}',
    '{"selected":1}',
  ]) {
    assert.deepEqual(readProgress(memoryStorage(value), levels), defaults);
  }
  assert.deepEqual(readProgress(undefined, levels), defaults);
  assert.deepEqual(
    readProgress(
      {
        getItem() {
          throw new Error('Denied');
        },
      },
      levels,
    ),
    defaults,
  );
});

test('only known levels with positive safe-integer attempt scores are restored', () => {
  const storage = memoryStorage(
    JSON.stringify({
      version: 1,
      selected: 999,
      sound: 'true',
      locale: 'xx',
      completed: {
        first: { attempts: 2 },
        second: { attempts: 0 },
        third: { attempts: 1.5 },
        removed: { attempts: 1 },
      },
    }),
  );
  assert.deepEqual(readProgress(storage, levels), {
    ...defaults,
    completed: { first: { attempts: 2 } },
  });
  for (const attempts of [-1, 0, 1.1, '1', null, Number.MAX_SAFE_INTEGER + 1]) {
    storage.setItem(
      PROGRESS_KEY,
      JSON.stringify({ version: 1, completed: { first: { attempts } } }),
    );
    assert.deepEqual(readProgress(storage, levels).completed, {});
  }
});

test('malicious object keys and unexpected fields cannot pollute the stored schema', () => {
  const hostile =
    '{"version":1,"selected":1,"completed":{"__proto__":{"attempts":1,"polluted":true},"constructor":{"attempts":1},"prototype":{"attempts":1},"first":{"attempts":2,"secret":"drop"}},"token":"drop"}';
  const storage = memoryStorage(hostile);
  const result = readProgress(storage, [...levels, { id: '__proto__' }, { id: 'constructor' }]);
  assert.deepEqual(result, { ...defaults, selected: 1, completed: { first: { attempts: 2 } } });
  assert.equal({}.polluted, undefined);
  assert.equal(persistProgress(storage, JSON.parse(hostile)), true);
  assert.deepEqual(JSON.parse(storage.getItem(PROGRESS_KEY)), result);
});

test('invalid selection values and malformed completion lists are discarded', () => {
  for (const selected of [-1, 3, 1.5, '1', null]) {
    const storage = memoryStorage(JSON.stringify({ version: 1, selected, completed: [] }));
    assert.deepEqual(readProgress(storage, levels), defaults);
  }
  const storage = memoryStorage(
    '{"version":1,"selected":0,"completed":{"first":null,"second":[1],"third":2}}',
  );
  assert.deepEqual(readProgress(storage, []), defaults);
  assert.deepEqual(readProgress(storage, levels), defaults);
});

test('write failures leave in-memory progress usable and return false', () => {
  const progress = { ...defaults, completed: { first: { attempts: 1 } } };
  const before = structuredClone(progress);
  assert.equal(
    persistProgress(
      {
        setItem() {
          throw new Error('Quota exceeded');
        },
      },
      progress,
    ),
    false,
  );
  assert.equal(persistProgress(undefined, progress), false);
  assert.equal(persistProgress(memoryStorage(), null), false);
  assert.deepEqual(progress, before);
});

test('optional audio works as a silent no-op when Web Audio is absent', async () => {
  const audio = createAudio();
  assert.equal(await audio.unlock(), false);
  audio.setEnabled(true);
  assert.equal(await audio.unlock(), false);
  for (const kind of ['emit', 'tick', 'echo', 'success', 'fail', 'control']) audio.tone(kind);
  audio.suspend();
  audio.dispose();
  audio.dispose();
  audio.setEnabled(true);
  assert.equal(await audio.unlock(), false);
});

test('audio waits for activation and cancels scheduled notes when muted or disposed', async () => {
  const previous = globalThis.AudioContext;
  let instance;
  let constructions = 0;
  const parameter = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  class FakeAudioContext {
    constructor() {
      constructions += 1;
      instance = this;
      this.state = 'suspended';
      this.currentTime = 0;
      this.destination = {};
      this.oscillators = [];
      this.closeCalls = 0;
    }
    createGain() {
      return { gain: parameter(), connect() {}, disconnect() {} };
    }
    createOscillator() {
      const oscillator = {
        frequency: parameter(),
        stops: [],
        starts: [],
        disconnected: false,
        connect() {},
        disconnect() {
          this.disconnected = true;
        },
        start(time) {
          this.starts.push(time);
        },
        stop(time) {
          this.stops.push(time);
        },
      };
      this.oscillators.push(oscillator);
      return oscillator;
    }
    async resume() {
      this.state = 'running';
    }
    async suspend() {
      this.state = 'suspended';
    }
    async close() {
      this.state = 'closed';
      this.closeCalls += 1;
    }
  }
  globalThis.AudioContext = FakeAudioContext;
  try {
    const audio = createAudio();
    audio.setEnabled(true);
    audio.tone('emit');
    assert.equal(constructions, 0, 'enabling audio alone must not create a context');
    assert.equal(await audio.unlock(), true);
    assert.equal(constructions, 1);
    audio.tone('success');
    assert.equal(instance.oscillators.length, 4);
    assert.ok(instance.oscillators[3].starts[0] > 0, 'success has pending notes');
    audio.setEnabled(false);
    assert.ok(
      instance.oscillators.every(
        (oscillator) => oscillator.stops.length === 2 && oscillator.disconnected,
      ),
    );
    audio.tone('echo');
    assert.equal(instance.oscillators.length, 4, 'muted tones never schedule voices');
    audio.setEnabled(true);
    audio.suspend();
    assert.equal(instance.state, 'suspended');
    assert.equal(await audio.unlock(), true);
    audio.tone('echo', 2);
    audio.dispose();
    audio.dispose();
    assert.equal(instance.closeCalls, 1);
    assert.equal(instance.oscillators[4].disconnected, true);
    assert.equal(await audio.unlock(), false);
  } finally {
    if (previous === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previous;
  }
});
