import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import * as core from '../assets/scripts/core/index.ts';

const source = stripTypeScriptTypes(
  (await readFile(new URL('../assets/scripts/OrbitAtelier.ts', import.meta.url), 'utf8'))
    .replace(/^import [\s\S]*?from '[^']+';\s*/gm, '')
    .replace(/^@ccclass[^\n]*\n/gm, ''),
).replace('export class OrbitAtelier', 'class OrbitAtelier');
const freshRun = () => ({
  state: core.createState(core.NOVA_LEVELS[0]),
  moves: 0,
  hints: 0,
  rewardAlignUsed: false,
});
function harness(port) {
  const environment = { SmallGamesRewardAds: port };
  const storageWrites = [];
  const bindings = {
    ...core,
    globalThis: environment,
    Component: class {},
    _decorator: {},
    sys: {
      isBrowser: false,
      localStorage: {
        setItem(...args) {
          storageWrites.push(args);
        },
      },
    },
    input: { off() {} },
    Input: { EventType: {} },
    game: { off() {} },
    Game: {},
    KeyCode: {
      ESCAPE: 27,
      ARROW_LEFT: 37,
      ARROW_RIGHT: 39,
      ARROW_UP: 38,
      ARROW_DOWN: 40,
      KEY_Q: 81,
      KEY_E: 69,
      SPACE: 32,
      ENTER: 13,
    },
  };
  const Controller = new Function(...Object.keys(bindings), source + ';return OrbitAtelier;')(
    ...Object.values(bindings),
  );
  const c = new Controller();
  c.storageWrites = storageWrites;
  c.run = freshRun();
  c.progress = core.freshProgress();
  c.screen = 'paused';
  c.ui = {
    pulses: [],
    metalScene: { yaw: 0, pitch: 0, offset: null, contact: null },
    destroy() {},
  };
  c.render = c.draw = () => {};
  return c;
}
function deferred() {
  let resolve,
    calls = 0,
    cancelled = 0;
  return {
    available: true,
    offer() {
      calls++;
      return new Promise((r) => (resolve = r));
    },
    cancel() {
      cancelled++;
    },
    finish(status) {
      resolve({ status });
    },
    get calls() {
      return calls;
    },
    get cancelled() {
      return cancelled;
    },
  };
}
test('alignment rotates only, increments moves/hints once and survives undo and storage rebuilding', () => {
  const run = freshRun(),
    before = structuredClone(run);
  const expected = core.findHint(run.state);
  assert.deepEqual(core.alignReward(run), expected);
  assert.equal(run.state.releasedCount, 0);
  assert.equal(
    run.state.rings.some((r) => r.removed),
    false,
  );
  assert.equal(core.canRelease(run.state, expected.ringId), true);
  assert.equal(run.moves, 1);
  assert.equal(run.hints, 1);
  assert.equal(core.alignReward(run), null);
  const undo = core.restoreUndo(run, before);
  assert.equal(undo.rewardAlignUsed, true);
  assert.equal(undo.hints, 1);
  assert.equal(core.restoreUndo(before, run).rewardAlignUsed, true);
  assert.equal(core.alignReward(undo), null);
  const saved = { ...core.freshProgress(), run: undo };
  assert.equal(core.parseProgress(JSON.stringify(saved)).run.rewardAlignUsed, true);
  delete saved.run.rewardAlignUsed;
  assert.equal(core.parseProgress(JSON.stringify(saved)).run.rewardAlignUsed, false);
  saved.run.rewardAlignUsed = 'true';
  assert.equal(core.parseProgress(JSON.stringify(saved)).run, null);
});
test('completed alignment pushes undo, stays paused and hidden/blur suspension does not cancel', async () => {
  const port = deferred(),
    c = harness(port),
    before = structuredClone(c.run);
  const pending = c.requestAlignment();
  c.activate('reward-align');
  c.suspend();
  assert.equal(port.calls, 1);
  assert.equal(port.cancelled, 0);
  port.finish('completed');
  await pending;
  assert.equal(c.screen, 'paused');
  assert.equal(c.run.rewardAlignUsed, true);
  assert.deepEqual(c.history, [before]);
  assert.equal(c.run.state.releasedCount, 0);
  c.activate('resume');
  c.activate('undo');
  assert.equal(c.run.rewardAlignUsed, true);
  assert.equal(c.run.hints, 1);
  c.activate('hint');
  assert.equal(c.run.hints, 2);
  assert.equal(port.calls, 1);
});
test('only completed offers grant and all other results leave free hint available', async () => {
  for (const port of [
    undefined,
    { available: false },
    ...['dismissed', 'failed', 'unavailable'].map((status) => ({
      available: true,
      offer: async () => ({ status }),
    })),
    {
      available: true,
      offer: async () => {
        throw Error('offline');
      },
    },
  ]) {
    const c = harness(port);
    await c.requestAlignment();
    assert.equal(c.run.rewardAlignUsed, false);
    assert.equal(c.run.moves, 0);
    assert.equal(c.rewardPending, false);
    assert.equal(c.screen, 'paused');
    c.activate('resume');
    c.activate('hint');
    assert.equal(c.run.hints, 1);
  }
});
test('cancel, navigation, restart, pagehide and destruction invalidate old alignment requests', async () => {
  for (const exit of [
    (c) => c.activate('reward-cancel'),
    (c) => c.navigate('home'),
    (c) => c.activate('resume'),
    (c) => c.begin(core.NOVA_LEVELS[0].id),
    (c) => c.pageHide(),
    (c) => c.onDestroy(),
  ]) {
    const port = deferred(),
      c = harness(port),
      old = c.run;
    const pending = c.requestAlignment();
    exit(c);
    port.finish('completed');
    await pending;
    assert.equal(old.rewardAlignUsed, false);
    assert.equal(c.run.rewardAlignUsed, false);
    assert.equal(port.cancelled, 1);
  }
});

test('pagehide redraws the cancelled offer before a cached page is restored', async () => {
  const port = deferred(),
    c = harness(port);
  let renders = 0;
  c.render = () => renders++;
  const pending = c.requestAlignment(),
    before = renders;
  c.pageHide();
  assert.equal(c.rewardPending, false);
  assert.ok(renders > before);
  port.finish('completed');
  await pending;
  assert.equal(c.run.rewardAlignUsed, false);
});

test('extraction owns the pose until complete; keyboard can still pause and cancel', () => {
  const c = harness(undefined);
  c.screen = 'playing';
  c.run = { state: core.createState(core.METAL_LEVELS[0]), moves: 0, hints: 0 };
  c.selected = 'goal';
  const before = structuredClone(c.run.state);
  c.metalPull = {
    ringId: 'goal',
    before: structuredClone(c.run),
    plan: core.testExtraction(c.run.state.rings, 'goal'),
    age: 0.2,
  };
  for (const keyCode of [37, 39, 81, 69, 32]) c.keyDown({ keyCode });
  assert.deepEqual(c.run.state, before);
  assert(c.metalPull);
  c.keyDown({ keyCode: 27 });
  assert.equal(c.screen, 'paused');
  assert.equal(c.metalPull, null);
});
test('native Cocos observation touch cancellation releases a different next pointer', () => {
  const c = harness(undefined);
  c.screen = 'playing';
  c.viewDrag = { id: 7, x: 20, y: 20, yaw: 0, pitch: 0 };
  c.touchCancel({ getID: () => 7 });
  assert.equal(c.viewDrag, null);
  c.ui.hit = () => ({ id: 'pause' });
  c.down(9, 20, 20);
  assert.equal(c.press.id, 9);
});

test('entering and leaving a preview does not write an empty player save', () => {
  for (const [practice, challenge] of [
    [true, false],
    [false, true],
  ]) {
    const c = harness(undefined);
    c.run = null;
    const before = structuredClone(c.progress);
    c.begin('metal-12', practice, challenge);
    assert.equal(c.storageWrites.length, 0);
    c.navigate('home');
    assert.deepEqual(c.progress, before);
    assert.equal(c.storageWrites.length, 0);
    c.begin('metal-01');
    assert(c.storageWrites.length > 0, 'ordinary play still persists');
  }
});
