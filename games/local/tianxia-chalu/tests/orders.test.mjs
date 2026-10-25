import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapInput, createOrderQueue, planOrder, nearestRoad } from '../src/input/orders.mjs';

function map() {
  const cities = [
    { id: 'A', x: 60, y: 60, owner: 0 },
    { id: 'B', x: 220, y: 60, owner: 0 },
    { id: 'C', x: 220, y: 240, owner: 1 },
    { id: 'D', x: 60, y: 240, owner: null },
  ];
  const roads = [
    { a: 'A', b: 'B' },
    { a: 'B', b: 'C' },
    { a: 'A', b: 'D' },
  ];
  return {
    cities,
    roads,
    junctions: cities.map((c) => ({
      id: c.id + '-switch',
      cityId: c.id,
      owner: c.owner,
      routeIndex: -1,
      exits: roads
        .filter((r) => r.a === c.id || r.b === c.id)
        .map((r) => (r.a === c.id ? r.b : r.a)),
    })),
  };
}
const j = (state, id) => state.junctions.find((j) => j.cityId === id);
const route = (state, from, to) => {
  j(state, from).routeIndex = to == null ? -1 : j(state, from).exits.indexOf(to);
};
function harness() {
  const state = map(),
    intents = [],
    messages = [],
    timers = new Map();
  let selected = null,
    preview = null,
    time = 0,
    nextTimer = 0,
    enabled = true;
  const input = createMapInput({
    read: () => ({ state, selected, enabled }),
    select: (id) => {
      selected = id;
    },
    preview: (p) => {
      preview = p;
    },
    submit: (intent) => {
      intents.push(intent);
    },
    notify: (message) => messages.push(message),
    now: () => time,
    schedule: (fn, ms) => {
      timers.set(++nextTimer, { fn, at: time + ms });
      return nextTimer;
    },
    unschedule: (id) => timers.delete(id),
  });
  const advance = (ms) => {
    time += ms;
    for (const [id, timer] of timers)
      if (timer.at <= time) {
        timers.delete(id);
        timer.fn();
      }
  };
  const point = (id) => state.cities.find((c) => c.id === id);
  const tapPoint = (p) => {
    input.pointer('down', p, 1);
    input.pointer('up', p, 1);
  };
  return {
    state,
    intents,
    messages,
    input,
    advance,
    point,
    tapPoint,
    tap: (id) => tapPoint(point(id)),
    get selected() {
      return selected;
    },
    get preview() {
      return preview;
    },
    disable: () => {
      enabled = false;
    },
  };
}

test('A→B capture, B→C, A→D use independent sources and release selection', () => {
  const h = harness();
  h.state.cities[1].owner = j(h.state, 'B').owner = null;
  h.tap('A');
  h.tap('B');
  assert.deepEqual(h.intents.pop(), { kind: 'route', sourceId: 'A', targetId: 'B' });
  assert.equal(h.selected, null);
  h.state.cities[1].owner = j(h.state, 'B').owner = 0;
  h.tap('B');
  h.tap('C');
  h.tap('A');
  h.tap('D');
  assert.deepEqual(h.intents, [
    { kind: 'route', sourceId: 'B', targetId: 'C' },
    { kind: 'route', sourceId: 'A', targetId: 'D' },
  ]);
  assert.equal(h.selected, null);
});
test('slow repeat deselects, quick double tap holds without changing inbound supply', () => {
  const h = harness();
  route(h.state, 'A', 'B');
  route(h.state, 'B', 'C');
  h.tap('B');
  assert.equal(h.selected, 'B');
  h.advance(400);
  h.tap('B');
  assert.equal(h.selected, null);
  assert.equal(h.intents.length, 0);
  h.advance(400);
  h.tap('B');
  h.advance(100);
  h.tap('B');
  const commands = planOrder(h.state, h.intents[0]);
  assert.deepEqual(
    commands.map((c) => [c.sourceId, c.index]),
    [['B', -1]],
  );
  assert.equal(j(h.state, 'A').routeIndex, 0);
});
test('double tapping a friendly target cancels the first tap dispatch from the old selection', () => {
  const h = harness();
  h.tap('A');
  h.tap('B');
  assert.equal(h.intents.length, 0);
  h.advance(100);
  h.tap('B');
  h.advance(400);
  assert.deepEqual(h.intents, [{ kind: 'hold', sourceId: 'B' }]);
});
test('friendly single target commits after double tap window or before a different gesture', () => {
  const h = harness();
  h.tap('A');
  h.tap('B');
  h.advance(300);
  assert.equal(h.intents.length, 1);
  h.tap('A');
  h.tap('B');
  h.tap('C');
  assert.equal(h.intents.length, 2);
  assert.equal(h.selected, 'C');
});
test('drag uses the pressed city even when an adjacent city was selected', () => {
  const h = harness();
  h.tap('A');
  h.input.pointer('down', h.point('B'), 1);
  h.input.pointer('move', h.point('C'), 1);
  assert.equal(h.selected, 'B');
  assert(h.preview);
  h.input.pointer('up', h.point('C'), 1);
  assert.deepEqual(h.intents, [{ kind: 'route', sourceId: 'B', targetId: 'C' }]);
  assert.equal(h.preview, null);
  assert.equal(h.selected, null);
});
test('cancel, multitouch, disabled views and off-map drops cannot submit stale orders', () => {
  for (const method of ['cancel', 'multitouch', 'disable']) {
    const h = harness();
    h.tap('A');
    h.tap('B');
    if (method === 'cancel') h.input.cancel();
    if (method === 'multitouch') {
      h.input.pointer('down', h.point('B'), 1);
      h.input.pointer('down', h.point('C'), 2);
      h.input.pointer('up', h.point('B'), 1);
    }
    if (method === 'disable') {
      h.disable();
      h.input.pointer('move', h.point('B'), 1);
    }
    h.advance(1000);
    assert.equal(h.intents.length, 0, method);
  }
  const h = harness();
  h.input.pointer('down', h.point('A'), 1);
  h.input.pointer('up', { x: 500, y: 500 }, 1);
  assert.equal(h.intents.length, 0);
});
test('failed adjacency retains a usable selection, enemy cities cannot dispatch', () => {
  const h = harness();
  h.tap('A');
  h.tap('C');
  assert.equal(h.intents.length, 0);
  assert.equal(h.messages.length, 1);
  h.tap('D');
  assert.equal(h.intents.length, 0);
});
test('road hit testing gives city priority, tolerates touch width and rejects crossings', () => {
  const state = map();
  assert.equal(nearestRoad(state, { x: 60, y: 60 }), null);
  assert.equal(nearestRoad(state, { x: 140, y: 73 }).a, 'A');
  assert.equal(nearestRoad(state, { x: 140, y: 80 }), null);
  state.roads.push({ a: 'A', b: 'C' }, { a: 'B', b: 'D' });
  assert.equal(nearestRoad(state, { x: 140, y: 150 }).ambiguous, true);
});
test('road touch emits a road intent; tapping the city does not also change its line', () => {
  const h = harness();
  h.tapPoint({ x: 140, y: 60 });
  h.tap('A');
  assert.deepEqual(h.intents, [{ kind: 'road', a: 'A', b: 'B' }]);
  assert.equal(h.selected, 'A');
});
test('friendly line cycles off→forward→reverse→off; unrelated lines survive', () => {
  const state = map(),
    intent = { kind: 'road', a: 'A', b: 'B' };
  route(state, 'B', 'C');
  const apply = () => {
    for (const c of planOrder(state, intent)) j(state, c.sourceId).routeIndex = c.index;
  };
  apply();
  assert.equal(j(state, 'A').routeIndex, 0);
  assert.equal(j(state, 'B').routeIndex, 1);
  apply();
  assert.equal(j(state, 'A').routeIndex, -1);
  assert.equal(j(state, 'B').routeIndex, 0);
  route(state, 'A', 'D');
  apply();
  assert.equal(j(state, 'B').routeIndex, -1);
  assert.equal(j(state, 'A').routeIndex, 1);
});
test('one-owned endpoint toggles outbound only and never changes enemy commands', () => {
  const state = map();
  const intent = { kind: 'road', a: 'B', b: 'C' };
  assert.deepEqual(
    planOrder(state, intent).map((c) => c.sourceId),
    ['B'],
  );
  route(state, 'B', 'C');
  assert.deepEqual(
    planOrder(state, intent).map((c) => [c.sourceId, c.index]),
    [['B', -1]],
  );
  assert.throws(() => planOrder(state, { kind: 'route', sourceId: 'C', targetId: 'B' }), /不属于/);
});
test('direct reverse cancels only the opposite friendly route; nonadjacent orders fail', () => {
  const state = map();
  route(state, 'B', 'A');
  assert.deepEqual(
    planOrder(state, { kind: 'route', sourceId: 'A', targetId: 'B' }).map((c) => c.sourceId),
    ['B', 'A'],
  );
  route(state, 'B', 'C');
  assert.equal(planOrder(state, { kind: 'route', sourceId: 'A', targetId: 'B' }).length, 1);
  assert.throws(() => planOrder(state, { kind: 'route', sourceId: 'A', targetId: 'C' }), /相邻/);
});
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
test('slow remote acknowledgements serialize independent commands without dropping them', async () => {
  const state = map(),
    sent = [];
  let release;
  const queue = createOrderQueue({
    read: () => ({ state, enabled: true }),
    send: async (command) => {
      sent.push(command);
      await new Promise((r) => {
        release = r;
      });
      j(state, command.sourceId).routeIndex = command.index;
    },
  });
  queue.push({ kind: 'route', sourceId: 'B', targetId: 'C' });
  queue.push({ kind: 'route', sourceId: 'A', targetId: 'D' });
  assert.deepEqual(
    sent.map((c) => c.sourceId),
    ['B'],
  );
  release();
  await settle();
  assert.deepEqual(
    sent.map((c) => c.sourceId),
    ['B', 'A'],
  );
  release();
  await queue.idle();
  assert.equal(j(state, 'B').routeIndex, 1);
  assert.equal(j(state, 'A').routeIndex, 1);
});
test('rapid road clicks use acknowledged state, not an old network snapshot', async () => {
  const state = map(),
    sent = [];
  const queue = createOrderQueue({
    read: () => ({ state, enabled: true }),
    send: async (c) => {
      sent.push(c);
      j(state, c.sourceId).routeIndex = c.index;
    },
  });
  for (let i = 0; i < 3; i++) queue.push({ kind: 'road', a: 'A', b: 'B' });
  await queue.idle();
  assert.deepEqual(
    sent.map((c) => [c.sourceId, c.index]),
    [
      ['A', 0],
      ['A', -1],
      ['B', 0],
      ['B', -1],
    ],
  );
});
test('cooldown is retried, identical commands are idempotent, cancellation discards queued work', async () => {
  const state = map(),
    sent = [];
  let wake;
  const queue = createOrderQueue({
    read: () => ({ state, enabled: true }),
    schedule: (fn) => {
      wake = fn;
      return 1;
    },
    unschedule: () => {},
    send: async (c) => {
      sent.push(c);
      if (sent.length === 1) return { ok: false, reason: 'cooldown' };
      j(state, c.sourceId).routeIndex = c.index;
    },
  });
  queue.push({ kind: 'route', sourceId: 'A', targetId: 'D' });
  await settle();
  wake();
  await queue.idle();
  assert.equal(sent.length, 2);
  await queue.push({ kind: 'route', sourceId: 'A', targetId: 'D' });
  assert.equal(sent.length, 2);
  let release;
  const cancelled = createOrderQueue({
    read: () => ({ state, enabled: true }),
    send: async (c) => {
      sent.push(c);
      await new Promise((r) => {
        release = r;
      });
    },
  });
  cancelled.push({ kind: 'hold', sourceId: 'A' });
  cancelled.push({ kind: 'route', sourceId: 'B', targetId: 'C' });
  cancelled.cancel();
  release();
  await cancelled.idle();
  assert.equal(sent.length, 3);
});
test('ownership changes and definitive failures do not poison later orders', async () => {
  const state = map(),
    errors = [],
    sent = [];
  const queue = createOrderQueue({
    read: () => ({ state, enabled: true }),
    failed: (e) => errors.push(e),
    send: async (c) => {
      sent.push(c);
      if (c.sourceId === 'A') throw new Error('rejected');
      j(state, c.sourceId).routeIndex = c.index;
    },
  });
  queue.push({ kind: 'route', sourceId: 'A', targetId: 'D' });
  queue.push({ kind: 'route', sourceId: 'B', targetId: 'C' });
  await queue.idle();
  assert.equal(errors.length, 1);
  assert.equal(sent.length, 2);
  state.cities[0].owner = j(state, 'A').owner = 1;
  await queue.push({ kind: 'hold', sourceId: 'A' });
  assert.equal(sent.length, 2);
  assert.equal(errors.length, 2);
});

test('a quick B drag after A→B keeps both the pending supply and new B→C order', () => {
  const h = harness();
  h.tap('A');
  h.tap('B');
  h.advance(80);
  h.input.pointer('down', h.point('B'), 1);
  h.input.pointer('move', h.point('C'), 1);
  h.input.pointer('up', h.point('C'), 1);
  h.advance(500);
  assert.deepEqual(h.intents, [
    { kind: 'route', sourceId: 'A', targetId: 'B' },
    { kind: 'route', sourceId: 'B', targetId: 'C' },
  ]);
});

test('a captured opposite endpoint cannot cancel a valid attack during cooldown retry', async () => {
  const state = map(),
    sent = [];
  let wake;
  route(state, 'B', 'A');
  const queue = createOrderQueue({
    read: () => ({ state, enabled: true }),
    schedule: (fn) => {
      wake = fn;
      return 1;
    },
    unschedule: () => {},
    send: async (c) => {
      sent.push(c);
      if (c.sourceId === 'B') return { ok: false, reason: 'cooldown' };
      j(state, c.sourceId).routeIndex = c.index;
    },
  });
  queue.push({ kind: 'route', sourceId: 'A', targetId: 'B' });
  await settle();
  state.cities[1].owner = j(state, 'B').owner = 1;
  wake();
  await queue.idle();
  assert.deepEqual(
    sent.map((c) => c.sourceId),
    ['B', 'A'],
  );
  assert.equal(j(state, 'A').routeIndex, 0);
});

test('a server ownership rejection for auxiliary stop still allows the primary attack', async () => {
  const state = map(),
    sent = [],
    errors = [];
  route(state, 'B', 'A');
  const queue = createOrderQueue({
    read: () => ({ state, enabled: true }),
    failed: (e) => errors.push(e),
    send: async (c) => {
      sent.push(c);
      if (c.sourceId === 'B')
        throw Object.assign(new Error('not owner'), { code: 'not-owner', rejected: true });
      j(state, c.sourceId).routeIndex = c.index;
    },
  });
  await queue.push({ kind: 'route', sourceId: 'A', targetId: 'B' });
  assert.deepEqual(
    sent.map((c) => c.sourceId),
    ['B', 'A'],
  );
  assert.equal(errors.length, 0);
});

test('ownership lost during the second tap cannot leave a deferred ghost dispatch', () => {
  const h = harness();
  h.tap('A');
  h.tap('B');
  h.advance(80);
  h.input.pointer('down', h.point('B'), 1);
  h.state.cities[1].owner = j(h.state, 'B').owner = 1;
  h.input.pointer('up', h.point('B'), 1);
  h.tap('C');
  h.advance(500);
  assert.equal(h.intents.length, 0);
  assert(h.messages.some((m) => m.includes('易主')));
});
