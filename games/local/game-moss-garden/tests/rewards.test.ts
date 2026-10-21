import test from 'node:test';
import assert from 'node:assert/strict';
import { createMossGame } from '../src/controller.ts';
import { createHintRewards } from '../src/rewards.ts';
import { LEVELS } from '../src/content.ts';
import { createSave } from '../src/progress.ts';
import { createPuzzle } from '../src/rules.ts';

const settle = () => new Promise((resolve) => setImmediate(resolve));
async function fixture(dev = false, original = createSave()) {
  let saved = structuredClone(original);
  const requests: Array<{ request: any; resolve: (value: any) => void }> = [];
  let cancels = 0;
  const context = new Proxy(
    {
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
    },
    { get: (object, key) => (key in object ? object[key as keyof typeof object] : () => {}) },
  );
  const game = await createMossGame(
    {
      canvas: { width: 390, height: 844, getContext: () => context },
      dev,
      cancelHint: () => cancels++,
      onTap: () => () => {},
    } as never,
    {
      storage: {
        read: async () => ({ value: saved }),
        write: async (_key: string, value: typeof saved) => {
          saved = structuredClone(value);
        },
      },
      ads: {
        offer: (request: unknown) => new Promise((resolve) => requests.push({ request, resolve })),
      },
    } as never,
  );
  return { game, requests, saved: () => saved, cancels: () => cancels };
}
function openAd(game: Awaited<ReturnType<typeof createMossGame>>) {
  game.act('play:hint');
  assert.equal(game.snapshot().page, 'hint');
  game.act('hint:watch');
}

test('free hint survives undo and reload; only completed rewards apply once', async () => {
  const f = await fixture();
  try {
    f.game.act('home:start');
    f.game.act('play:hint');
    assert.equal(f.game.snapshot().puzzle.hints, 1);
    f.game.act('play:undo');
    openAd(f.game);
    f.game.act('hint:watch');
    await settle();
    assert.equal(f.requests.length, 1);
    assert.deepEqual(f.requests[0].request, {
      id: 'moss-garden.hint',
      reward: { kind: 'hint', count: 1, levelId: 'moss-01' },
    });
    assert.equal(f.game.snapshot().puzzle.hints, 1);
    f.requests[0].resolve({ status: 'completed' });
    await settle();
    assert.equal(f.game.snapshot().puzzle.hints, 2);
    f.requests[0].resolve({ status: 'completed' });
    await settle();
    assert.equal(f.game.snapshot().puzzle.hints, 2);
  } finally {
    await f.game.dispose();
  }
  const restored = await fixture(false, f.saved());
  try {
    restored.game.act('home:start');
    restored.game.act('play:hint');
    assert.equal(restored.game.snapshot().page, 'hint');
    assert.equal(restored.game.snapshot().puzzle.hints, 2);
  } finally {
    await restored.game.dispose();
  }
});

test('unavailable, failed, dismissed and cancellation never change board or reward count', async () => {
  for (const status of ['unavailable', 'failed', 'dismissed', 'cancel']) {
    const f = await fixture();
    try {
      f.game.act('home:start');
      f.game.act('play:hint');
      const before = structuredClone(f.game.snapshot().puzzle);
      openAd(f.game);
      await settle();
      if (status === 'cancel') f.game.act('hint:cancel');
      f.requests[0].resolve({ status: status === 'cancel' ? 'completed' : status });
      await settle();
      assert.deepEqual(f.game.snapshot().puzzle, before, status);
      assert.equal(f.game.snapshot().hintBusy, false);
      if (status === 'cancel') assert.equal(f.cancels(), 1);
    } finally {
      await f.game.dispose();
    }
  }
});

test('reward waits for foreground; both close/resume orders grant exactly one hint', async () => {
  for (const closeFirst of [true, false]) {
    const f = await fixture();
    try {
      f.game.act('home:start');
      f.game.act('play:hint');
      openAd(f.game);
      await settle();
      const time = f.game.snapshot().elapsedMs;
      f.game.pause();
      if (closeFirst) {
        f.requests[0].resolve({ status: 'completed' });
        await settle();
      }
      assert.equal(f.game.snapshot().puzzle.hints, 1);
      f.game.resume();
      if (!closeFirst) f.requests[0].resolve({ status: 'completed' });
      await settle();
      assert.equal(f.game.snapshot().puzzle.hints, 2);
      assert.equal(f.game.snapshot().elapsedMs, time);
    } finally {
      await f.game.dispose();
    }
  }
});

test('exit/dispose invalidate pending completion, and cancelled old requests cannot affect a new request', async () => {
  for (const dispose of [false, true]) {
    const f = await fixture();
    f.game.act('home:start');
    f.game.act('play:hint');
    openAd(f.game);
    await settle();
    if (dispose) await f.game.dispose();
    else {
      f.game.cancelPendingHint();
      openAd(f.game);
      await settle();
    }
    f.requests[0].resolve({ status: 'completed' });
    await settle();
    assert.equal(f.game.snapshot().puzzle.hints, 1);
    if (!dispose) {
      assert.equal(f.game.snapshot().hintBusy, true);
      f.requests[1].resolve({ status: 'completed' });
      await settle();
      assert.equal(f.game.snapshot().puzzle.hints, 2);
      await f.game.dispose();
    }
  }
});

test('developer direct entry supports 1, 30, 1000 and preserves the ordinary active save', async () => {
  const original = {
    ...createSave(),
    active: { levelId: 'moss-01', puzzle: createPuzzle(LEVELS[0]), elapsedMs: 1234 },
  };
  const f = await fixture(true, original);
  try {
    for (const number of [1, 30, 1000]) {
      f.game.act('dev:select');
      for (const digit of String(number)) f.game.act(`jump:${digit}`);
      f.game.act('jump:start');
      assert.equal(f.game.snapshot().levelId, `moss-${String(number).padStart(2, '0')}`);
      assert.equal(f.game.snapshot().practice, true);
      f.game.act('play:hint');
      f.game.act('play:hint');
      assert.equal(f.game.snapshot().puzzle.hints, 2);
      f.game.act('dev:solve');
      f.game.act('result:levels');
    }
    f.game.act('dev:select');
    for (const digit of '1001') f.game.act(`jump:${digit}`);
    f.game.act('jump:start');
    assert.equal(f.game.snapshot().page, 'dev-levels');
  } finally {
    await f.game.dispose();
  }
  assert.deepEqual(f.saved(), original);
  assert.equal(f.requests.length, 0);
  const normal = await fixture();
  try {
    normal.game.act('dev:select');
    assert.equal(normal.game.snapshot().page, 'home');
    normal.game.act('home:levels');
    normal.game.act('level:moss-1000');
    assert.equal(normal.game.snapshot().page, 'levels');
  } finally {
    await normal.game.dispose();
  }
});

test('web reward bridge resolves late hosts, keeps receiver, and cancels stale callbacks', async () => {
  const environment: any = {};
  const rewards = createHintRewards(environment);
  const request = { id: 'moss-garden.hint', reward: { count: 1 } };
  assert.deepEqual(await rewards.offer(request), { status: 'unavailable' });
  let resolve: (value: any) => void = () => {};
  let cancelled = 0;
  const host = {
    offer() {
      assert.equal(this, host);
      return new Promise((done) => {
        resolve = done;
      });
    },
    cancel() {
      cancelled++;
    },
  };
  environment.SmallGamesRewardAds = host;
  const pending = rewards.offer(request);
  assert.deepEqual(await rewards.offer(request), { status: 'unavailable' });
  rewards.cancel();
  resolve({ status: 'completed' });
  assert.deepEqual(await pending, { status: 'dismissed' });
  assert.equal(cancelled, 1);
});

test('leaving a hint screen never adds its waiting time to the puzzle clock', async () => {
  const f = await fixture();
  const now = Date.now;
  let time = now();
  Date.now = () => time;
  try {
    f.game.act('home:start');
    f.game.act('play:hint');
    f.game.act('play:hint');
    const elapsed = f.game.snapshot().elapsedMs;
    time += 60000;
    f.game.cancelPendingHint();
    f.game.pause();
    assert.equal(f.game.snapshot().elapsedMs, elapsed);
  } finally {
    Date.now = now;
    await f.game.dispose();
  }
});
