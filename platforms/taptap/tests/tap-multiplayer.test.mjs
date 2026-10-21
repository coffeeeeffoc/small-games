/* global Event, EventTarget, TextEncoder */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tapMultiplayer as cops } from '../../../games/local/cops-robbers/src/tap-multiplayer.js';
import { tapMultiplayer as street } from '../../../games/local/cops-robbers-realtime/src/tap-multiplayer.js';
import { tapMultiplayer as chess } from '../../../games/submodules/xiangqi-five/tap-multiplayer.js';
import { createTapMultiplayerSession, utf8Bytes } from '../multiplayer-session.mjs';
import { createBattleHub } from './tap-multiplayer-fixture.mjs';
import { startTapMultiplayerScreen } from '../multiplayer-screen.mjs';
import { createBrowserTapSdk } from '../browser-entry.mjs';
const copy = (value) => JSON.parse(JSON.stringify(value));
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
async function pair(descriptor, options = {}) {
  const hub = createBattleHub(options),
    a = hub.sdk('owner/+='),
    b = hub.sdk('friend/+=');
  let clock = 10000;
  const make = (client) =>
    createTapMultiplayerSession({
      sdk: client.sdk,
      descriptor,
      now: () => clock,
      random: () => 0.123,
      autoPump: false,
    });
  const host = make(a),
    guest = make(b);
  await host.create(descriptor.modes[0].id);
  await guest.join(host.getSnapshot().roomId);
  await host.ready();
  await guest.ready();
  await settle();
  assert.equal(host.getSnapshot().phase, 'playing');
  assert.equal(guest.getSnapshot().phase, 'playing');
  return {
    hub,
    host,
    guest,
    a,
    b,
    async step(ms = 125) {
      clock += ms;
      await guest.pump();
      await host.pump();
    },
    async stop() {
      await Promise.all([host.stop(), guest.stop()]);
    },
  };
}

for (const descriptor of [cops, street, chess]) {
  test(`${descriptor.id}: deterministic core, atomic rejection and batched clock`, () => {
    const config = { seed: 85, mode: descriptor.modes[0].id },
      one = descriptor.initial(config),
      two = descriptor.initial(config);
    for (const tick of [1, 31, 62, 65, 240, 300]) descriptor.advance(one, tick);
    descriptor.advance(two, 300);
    assert.deepEqual(one, two);
    const action =
      descriptor === cops
        ? { type: 'move', side: 'pursuer', actor: 0, target: one.board.cops[0] }
        : descriptor === street
          ? { type: 'hold', actor: 0 }
          : { type: 'deploy-directly', to: 0 };
    descriptor.apply(one, action, 0);
    descriptor.apply(two, action, 0);
    assert.deepEqual(one, two);
    const before = copy(one);
    for (const invalid of [
      { type: 'score', score: 100 },
      { ...action, actor: -1, to: -1 },
      { ...action, score: 3 },
    ]) {
      assert.throws(() => descriptor.apply(one, invalid, 0));
      assert.deepEqual(one, before);
    }
  });
  for (const profile of ['modern', 'legacy', 'page'])
    test(`${descriptor.id}: two real sessions, ${profile}, no self echo`, async () => {
      const f = await pair(descriptor, { profile, callbackOnly: profile === 'legacy' });
      try {
        await f.step(2000);
        let state = f.host.getSnapshot().state;
        const action =
          descriptor === cops
            ? { type: 'move', side: 'pursuer', actor: 0, target: state.board.cops[0] }
            : descriptor === street
              ? { type: 'move', actor: 0, ...state.game.level.nodes[state.game.level.cops[0]] }
              : { type: 'draw' };
        assert.equal(await f.host.action(action), true);
        await f.step();
        assert.deepEqual(f.host.getSnapshot().state, f.guest.getSnapshot().state);
        assert.equal(f.host.getSnapshot().pending, false);
        if (descriptor === chess) {
          await f.host.action({ type: 'deploy', to: 0 });
          await f.step();
        }
        const other =
          descriptor === cops
            ? {
                type: 'move',
                side: 'runner',
                actor: 0,
                target: f.guest.getSnapshot().state.board.robbers[0],
              }
            : descriptor === street
              ? { type: 'hold', actor: 0 }
              : { type: 'deploy-directly', to: 89 };
        assert.equal(await f.guest.action(other), true);
        await f.step();
        assert.equal(f.guest.getSnapshot().pending, false);
        assert.deepEqual(f.host.getSnapshot().state, f.guest.getSnapshot().state);
        assert(f.hub.messages.every((message) => message.bytes <= 2048));
        const stateBefore = copy(f.host.getSnapshot().state);
        assert.equal(await f.host.action({ type: 'score', score: 3 }), false);
        assert.deepEqual(f.host.getSnapshot().state, stateBefore);
        f.guest.hide();
        await settle();
        assert.equal(f.guest.getSnapshot().phase, 'ended');
        assert.equal(f.host.getSnapshot().phase, 'ended');
      } finally {
        await f.stop();
      }
    });
}

test('chess draws do not consume RNG on illegal target or repeated draw', () => {
  const state = chess.initial({ seed: 12, mode: 'xiangqi' });
  chess.apply(state, { type: 'draw' }, 0);
  const before = copy(state);
  for (const action of [
    { type: 'draw' },
    { type: 'deploy', to: 90 },
    { type: 'move', from: 0, to: 1 },
  ]) {
    assert.throws(() => chess.apply(state, action, 0));
    assert.deepEqual(state, before);
  }
});
test('cops total timeout is neutral; realtime opening seat and routes remain deterministic', () => {
  const state = cops.initial({ seed: 12, mode: 'escape' });
  cops.advance(state, cops.durationTicks);
  assert.equal(state.board.winner, null);
  assert.equal(cops.outcome(state), '本局超时结束');
  const game = street.initial({ seed: 1, mode: 'classic' }),
    before = copy(game);
  assert.throws(() => street.apply(game, { type: 'hold', actor: 0 }, 1));
  assert.deepEqual(game, before);
  street.advance(game, 240);
  street.apply(game, { type: 'hold', actor: 0 }, 1);
  assert('routePoints' in street.view(game, 1).robbers[0]);
  assert(!('routePoints' in street.view(game, 0).robbers[0]));
});
test('duplicate commits are idempotent and gaps end the session', async () => {
  const f = await pair(chess);
  try {
    await f.host.action({ type: 'deploy-directly', to: 0 });
    await f.step();
    const message = f.hub.messages.findLast((item) => item.value.k === 'commit').value,
      before = f.guest.getSnapshot();
    const listener = [...f.b.listeners][0];
    listener.onCustomMessageReceived({ playerId: 'owner/+=', msg: JSON.stringify(message) });
    assert.deepEqual(f.guest.getSnapshot(), before);
    listener.onCustomMessageReceived({
      playerId: 'owner/+=',
      msg: JSON.stringify({ ...message, n: message.n + 2 }),
    });
    assert.equal(f.guest.getSnapshot().phase, 'ended');
  } finally {
    await f.stop();
  }
});
test('unknown sender is ignored, conflicting sender aliases abort, Unicode is measured in bytes', async () => {
  assert.equal(utf8Bytes('围捕🦊'), new TextEncoder().encode('围捕🦊').length);
  const f = await pair(chess);
  try {
    const listener = [...f.b.listeners][0],
      before = f.guest.getSnapshot();
    listener.onCustomMessageReceived({ playerId: 'outsider', msg: '{}' });
    assert.deepEqual(f.guest.getSnapshot(), before);
    listener.onCustomMessageReceived({ playerId: 'owner/+=', fromPlayerId: 'outsider', msg: '{}' });
    assert.equal(f.guest.getSnapshot().phase, 'ended');
  } finally {
    await f.stop();
  }
});
test('missing data and offline events still time out on both clients', async () => {
  const f = await pair(chess);
  try {
    f.hub.drop = () => true;
    for (let i = 0; i < 42; i++) await f.step();
    assert.equal(f.host.getSnapshot().phase, 'ended');
    assert.equal(f.guest.getSnapshot().phase, 'ended');
  } finally {
    await f.stop();
  }
});
test('a forged acknowledgement without a matching local intent aborts', async () => {
  const f = await pair(street);
  try {
    await f.step(2000);
    const listener = [...f.a.listeners][0],
      s = f.host.getSnapshot();
    listener.onCustomMessageReceived({
      playerId: 'friend/+=',
      msg: JSON.stringify({
        v: 1,
        g: street.id,
        r: s.roomId,
        e: s.settings.epoch,
        k: 'intent',
        i: 1,
        a: { type: 'score', score: 3 },
      }),
    });
    await f.host.pump(); // Peer did not send this request; it must reject the forged acknowledgement.
    assert.equal(f.guest.getSnapshot().phase, 'ended');
  } finally {
    await f.stop();
  }
});
test('an intent legal at send time but rejected at commit clears pending and allows retry', async () => {
  const descriptor = {
    ...street,
    apply(state, action, seat) {
      if (seat === 1 && action.type === 'hold' && state.tick >= 255)
        throw new Error('controlled deadline');
      street.apply.call(this, state, action, seat);
    },
  };
  const f = await pair(descriptor);
  try {
    await f.step(2000);
    assert.equal(await f.guest.action({ type: 'hold', actor: 0 }), true);
    assert.equal(f.guest.getSnapshot().pending, true);
    await f.step();
    assert.equal(f.guest.getSnapshot().pending, false);
    assert.equal(f.guest.getSnapshot().phase, 'playing');
    assert.match(f.guest.getSnapshot().message, /重新选择/);
    const actor = f.guest.getSnapshot().state.game.robbers[0];
    assert.equal(await f.guest.action({ type: 'move', actor: 0, x: actor.x, y: actor.y }), true);
    await f.step();
    assert.equal(f.guest.getSnapshot().pending, false);
    assert.deepEqual(f.host.getSnapshot().state, f.guest.getSnapshot().state);
  } finally {
    await f.stop();
  }
});
test('the 8 Hz host stream and 2 Hz peer acknowledgements share bounded message budgets', async () => {
  const f = await pair(street);
  try {
    const perTick = [];
    for (let i = 0; i < 48; i++) {
      const before = f.hub.messages.length;
      await f.step();
      perTick.push(f.hub.messages.slice(before));
    }
    for (let i = 0; i + 8 <= perTick.length; i++)
      for (const sender of ['owner/+=', 'friend/+=']) {
        assert(
          perTick
            .slice(i, i + 8)
            .flat()
            .filter((message) => message.sender === sender).length <= 15,
        );
      }
  } finally {
    await f.stop();
  }
});
test('registration exceptions release ownership; member alias conflicts and oversized packets abort', async () => {
  const hub = createBattleHub(),
    client = hub.sdk('one'),
    original = client.manager.registerListener;
  client.manager.registerListener = () => {
    throw new Error('registration failure');
  };
  const broken = createTapMultiplayerSession({
    sdk: client.sdk,
    descriptor: chess,
    autoPump: false,
  });
  await assert.rejects(broken.create('xiangqi'));
  await broken.stop();
  client.manager.registerListener = original;
  const next = createTapMultiplayerSession({ sdk: client.sdk, descriptor: chess, autoPump: false });
  await next.create('xiangqi');
  await next.stop();
  for (const oversized of [true, false]) {
    const f = await pair(chess);
    try {
      const listener = [...f.b.listeners][0];
      if (oversized)
        listener.onCustomMessageReceived({ playerId: 'owner/+=', msg: '中'.repeat(700) });
      else listener.onPlayerOffline({ playerId: 'owner/+=', playerInfo: { id: 'other' } });
      assert.equal(f.guest.getSnapshot().phase, 'ended');
    } finally {
      await f.stop();
    }
  }
});

test('Tap keyboard options and throwing host APIs never trap touch input or leave cleanup', async () => {
  for (const throwsAt of ['showKeyboard', 'onKeyboardConfirm', null]) {
    const listeners = new Map(),
      hub = createBattleHub(),
      client = hub.sdk('keyboard'),
      ctx = new Proxy({}, { get: () => () => {} });
    let keyboardOptions, screen;
    const sdk = {
      ...client.sdk,
      getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844 }),
      showKeyboard(options) {
        keyboardOptions = options;
        if (throwsAt === 'showKeyboard') throw new Error('unavailable');
      },
      hideKeyboard() {
        throw new Error('already hidden');
      },
    };
    for (const name of [
      'TouchStart',
      'TouchMove',
      'TouchEnd',
      'TouchCancel',
      'Hide',
      'Show',
      'WindowResize',
      'KeyboardInput',
      'KeyboardConfirm',
      'KeyboardComplete',
    ]) {
      listeners.set(name, new Set());
      sdk['on' + name] = (fn) => {
        if (throwsAt === 'onKeyboardConfirm' && name === 'KeyboardConfirm')
          throw new Error('unavailable');
        listeners.get(name).add(fn);
      };
      sdk['off' + name] = (fn) => listeners.get(name).delete(fn);
    }
    screen = startTapMultiplayerScreen({
      sdk,
      canvas: { getContext: () => ctx },
      services: { connect: async () => {} },
      descriptor: chess,
    });
    const tap = (id) => {
      const hit = screen.getSnapshot().hits.find((item) => item.id === id),
        point = { identifier: 1, clientX: hit.x + hit.w / 2, clientY: hit.y + hit.h / 2 };
      for (const fn of listeners.get('TouchStart'))
        fn({ touches: [point], changedTouches: [point] });
      for (const fn of listeners.get('TouchEnd')) fn({ touches: [], changedTouches: [point] });
    };
    try {
      tap('room-input');
      if (throwsAt) assert.match(screen.getSnapshot().message, /键盘/);
      else {
        assert.deepEqual(
          Object.fromEntries(
            ['defaultValue', 'maxLength', 'multiple', 'confirmHold', 'confirmType'].map((key) => [
              key,
              keyboardOptions[key],
            ]),
          ),
          {
            defaultValue: '',
            maxLength: 160,
            multiple: false,
            confirmHold: false,
            confirmType: 'done',
          },
        );
        for (const fn of [...listeners.get('KeyboardConfirm')]) fn({ value: 'Tap-room/+=' });
        assert.equal(screen.getSnapshot().roomInput, 'Tap-room/+=');
      }
      tap('create');
      await settle();
      assert.equal(screen.getSnapshot().phase, 'waiting');
      for (const fn of listeners.get('Hide')) fn();
      assert.equal(screen.getSnapshot().phase, 'ended');
      assert(listeners.get('Show').size > 0);
      for (const fn of listeners.get('Show')) fn();
    } finally {
      screen.stop();
      await settle();
    }
    for (const values of listeners.values()) assert.equal(values.size, 0);
  }
});
test('browser raw/DOM hide clears abandoned pointer IDs and removes host subscriptions', () => {
  const canvas = new EventTarget(),
    document = new EventTarget(),
    root = new EventTarget(),
    rawHide = new Set(),
    rawShow = new Set();
  document.hidden = false;
  Object.assign(root, {
    document,
    tap: {
      onHide: (fn) => rawHide.add(fn),
      offHide: (fn) => rawHide.delete(fn),
      onShow: (fn) => rawShow.add(fn),
      offShow: (fn) => rawShow.delete(fn),
    },
  });
  const bridge = createBrowserTapSdk(canvas, root),
    lengths = [];
  bridge.sdk.onHide(() => {});
  bridge.sdk.onShow(() => {});
  bridge.sdk.onTouchStart((event) => lengths.push(event.touches.length));
  const down = (id) => {
    const event = new Event('pointerdown');
    Object.assign(event, { pointerId: id, clientX: 10, clientY: 10 });
    canvas.dispatchEvent(event);
  };
  down(1);
  for (const fn of rawHide) fn();
  for (const fn of rawShow) fn();
  down(2);
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  document.hidden = false;
  down(3);
  assert.deepEqual(lengths, [1, 1, 1]);
  bridge.dispose();
  assert.equal(rawHide.size, 0);
  assert.equal(rawShow.size, 0);
});
test('terminal delivery then immediate guest exit cannot erase the final host commit', async () => {
  const descriptor = { ...chess, durationTicks: 15 };
  const f = await pair(descriptor);
  let release;
  try {
    f.hub.delaySend = async (who, value) => {
      if (value.k === 'commit')
        await new Promise((resolve) => {
          release = resolve;
        });
    };
    const advancing = f.step();
    await settle();
    assert.equal(f.guest.getSnapshot().phase, 'finished');
    await f.guest.stop();
    assert.equal(f.host.getSnapshot().phase, 'playing');
    release();
    await advancing;
    assert.equal(f.host.getSnapshot().phase, 'finished');
    assert.deepEqual(f.host.getSnapshot().state, f.guest.getSnapshot().state);
  } finally {
    release?.();
    await f.stop();
  }
});
test('late connect completion and throwing unregistration cannot revive or lock a session', async () => {
  const hub = createBattleHub(),
    client = hub.sdk('one');
  let release;
  client.manager.connect = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const first = createTapMultiplayerSession({
    sdk: client.sdk,
    descriptor: chess,
    autoPump: false,
  });
  const opening = first.create('xiangqi');
  await settle();
  const closing = first.stop();
  release({ playerId: 'one' });
  await assert.rejects(opening);
  await closing;
  assert.equal(hub.rooms.size, 0);
  client.manager.connect = () => Promise.resolve({ playerId: 'one' });
  client.manager.unregisterListener = () => {
    throw new Error('SDK already gone');
  };
  const second = createTapMultiplayerSession({
    sdk: client.sdk,
    descriptor: chess,
    autoPump: false,
  });
  await second.create('xiangqi');
  await second.stop();
  const third = createTapMultiplayerSession({
    sdk: client.sdk,
    descriptor: chess,
    autoPump: false,
  });
  await third.create('xiangqi');
  await third.stop();
});
