import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readProgress, saveProgress, recordVictory } from '../assets/scripts/core/progress.ts';
import { createRun } from '../assets/scripts/core/rules.ts';
import { MISSIONS } from '../assets/scripts/core/content.ts';
const key = 'nullrange-progress-v1';
function memory(initial) {
  const data = new Map(initial ? [[key, JSON.stringify(initial)]] : []);
  const storage = { getItem: (k) => data.get(k) || null, setItem: (k, v) => data.set(k, v) };
  return { data, storage };
}
test('two stale tabs patch only explicit preferences and score preserves latest preferences', () => {
  const { storage } = memory();
  const a = readProgress(storage),
    b = readProgress(storage);
  b.muted = true;
  assert.equal(saveProgress(storage, b, 'muted'), true);
  a.reduced = true;
  assert.equal(saveProgress(storage, a, 'reduced'), true);
  b.sensitivity = 1.3;
  assert.equal(saveProgress(storage, b, 'sensitivity'), true);
  a.best = 900;
  assert.equal(saveProgress(storage, a, 'best'), true);
  assert.deepEqual(readProgress(storage), {
    version: 2,
    selectedCraft: 'falcon',
    completed: {},
    best: 900,
    muted: true,
    reduced: true,
    sensitivity: 1.3,
  });
  b.best = 20;
  assert.equal(saveProgress(storage, b, 'best'), true);
  assert.equal(b.best, 900);
  // A deliberately toggles one setting; B's other settings and the score survive.
  a.muted = false;
  assert.equal(saveProgress(storage, a, 'muted'), true);
  assert.deepEqual(readProgress(storage), {
    version: 2,
    selectedCraft: 'falcon',
    completed: {},
    best: 900,
    muted: false,
    reduced: true,
    sensitivity: 1.3,
  });
});
test('read failure then recovery never turns default preferences into an implicit settings write', () => {
  const initial = { version: 1, best: 400, muted: true, reduced: true, sensitivity: 0.7 };
  const { data, storage } = memory(initial);
  let failing = true;
  const flaky = {
    getItem: (k) => {
      if (failing) throw Error('temporarily unavailable');
      return storage.getItem(k);
    },
    setItem: storage.setItem,
  };
  const a = readProgress(flaky);
  assert.equal(a.muted, false);
  a.best = 500;
  assert.equal(saveProgress(flaky, a, 'best'), false);
  assert.deepEqual(JSON.parse(data.get(key)), initial);
  failing = false;
  assert.equal(saveProgress(flaky, a, 'best'), true);
  assert.deepEqual(readProgress(storage), {
    ...initial,
    version: 2,
    selectedCraft: 'falcon',
    completed: {},
    best: 500,
  });
  failing = true;
  const b = readProgress(flaky);
  failing = false;
  b.reduced = false;
  assert.equal(saveProgress(flaky, b, 'reduced'), true);
  assert.deepEqual(readProgress(storage), {
    ...initial,
    version: 2,
    selectedCraft: 'falcon',
    completed: {},
    best: 500,
    reduced: false,
  });
});
test('fresh writes preserve legacy preferences and reject malformed explicit patches', () => {
  const { data, storage } = memory();
  data.set('nullrange-cn-best', '314');
  data.set('nullrange-cn-muted', 'true');
  const stale = { version: 1, best: 600, muted: false, reduced: false, sensitivity: 1 };
  assert.equal(saveProgress(storage, stale, 'best'), true);
  assert.equal(readProgress(storage).muted, true);
  const before = data.get(key);
  assert.equal(saveProgress(storage, { ...stale, muted: 'false' }, 'muted'), false);
  assert.equal(saveProgress(storage, { ...stale, sensitivity: NaN }, 'sensitivity'), false);
  assert.equal(saveProgress(storage, stale, 'version'), false);
  assert.equal(data.get(key), before);
  data.set(key, 'broken');
  assert.equal(readProgress(storage).best, 314);
  assert.equal(saveProgress(storage, stale, 'best'), false);
  assert.equal(data.get(key), 'broken');
});

test('temporary write failure preserves the unlock chain through a later win and preference write', () => {
  for (const recoverBeforeSecondWin of [false, true]) {
    const { storage } = memory();
    let failing = true;
    const flaky = {
      getItem: storage.getItem,
      setItem(k, v) {
        if (failing) throw Error('temporarily unavailable');
        storage.setItem(k, v);
      },
    };
    const p = readProgress(flaky);
    const win = (mission) => {
      const s = createRun(mission);
      Object.assign(s, { status: 'won', tick: 100, score: 500 });
      assert.ok(recordVictory(flaky, p, s, false));
    };
    win(MISSIONS[0]);
    assert.equal(storage.getItem(key), null);
    failing = !recoverBeforeSecondWin;
    win(MISSIONS[1]);
    failing = false;
    const otherTab = readProgress(storage);
    otherTab.reduced = true;
    assert.ok(saveProgress(storage, otherTab, 'reduced'));
    p.muted = true;
    assert.ok(saveProgress(flaky, p, 'muted'));
    assert.deepEqual(
      Object.keys(p.completed),
      MISSIONS.slice(0, 2).map((m) => m.id),
    );
    assert.deepEqual(readProgress(storage), p);
    assert.equal(p.muted, true);
    assert.equal(p.reduced, true);
    assert.equal(p.best, 500);
    const once = storage.getItem(key);
    assert.ok(saveProgress(flaky, p, 'muted'));
    assert.equal(storage.getItem(key), once);
    p.completed[MISSIONS[5].id] = { best: 9999, medal: 3, time: 100 };
    assert.ok(saveProgress(flaky, p, 'muted'));
    assert.equal(p.completed[MISSIONS[5].id], undefined);
  }
});
