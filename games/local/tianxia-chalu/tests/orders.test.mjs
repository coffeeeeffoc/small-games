import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMapInput,
  createOrderQueue,
  planOrder,
  nearestRoad,
  activeRoutes,
} from '../src/input/orders.mjs';
import { RemoteMatch } from '../remote.mjs';

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
  const entry = j(state, from);
  entry.routeIndex = to == null ? -1 : entry.exits.indexOf(to);
  entry.routeIndices = entry.routeIndex < 0 ? [] : [entry.routeIndex];
};
const applyCommand = (state, command) => {
  const entry = command.junctionId
    ? state.junctions.find((entry) => entry.id === command.junctionId)
    : j(state, command.sourceId);
  const index = command.index ?? command.routeIndex;
  const routes = new Set(activeRoutes(entry));
  if (index < 0) routes.clear();
  else if (command.enabled === false) routes.delete(index);
  else routes.add(index);
  entry.routeIndices = [...routes];
  entry.routeIndex = entry.routeIndices[0] ?? -1;
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
    for (const c of planOrder(state, intent)) applyCommand(state, c);
  };
  apply();
  assert.equal(j(state, 'A').routeIndex, 0);
  assert.equal(j(state, 'B').routeIndex, 1);
  apply();
  assert.equal(j(state, 'A').routeIndex, -1);
  assert.deepEqual(j(state, 'B').routeIndices, [1, 0]);
  route(state, 'A', 'D');
  apply();
  assert.deepEqual(j(state, 'B').routeIndices, [1]);
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
    [['B', 1]],
  );
  assert.equal(planOrder(state, intent)[0].enabled, false);
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
      applyCommand(state, command);
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
      applyCommand(state, c);
    },
  });
  for (let i = 0; i < 3; i++) queue.push({ kind: 'road', a: 'A', b: 'B' });
  await queue.idle();
  assert.deepEqual(
    sent.map((c) => [c.sourceId, c.index, c.enabled]),
    [
      ['A', 0, true],
      ['A', 0, false],
      ['B', 0, true],
      ['B', 0, false],
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
      applyCommand(state, c);
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
      applyCommand(state, c);
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
      applyCommand(state, c);
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
      applyCommand(state, c);
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

test('a second tap slipping just outside the city cancels its suspended single tap', () => {
  const h = harness();
  h.tap('A');
  h.tap('B');
  h.advance(80);
  const b = h.point('B');
  h.input.pointer('down', { x: b.x + 28, y: b.y }, 1);
  h.input.pointer('up', { x: b.x + 32, y: b.y }, 1);
  h.advance(500);
  h.tap('C');
  assert.equal(h.intents.length, 0);
});

const flushNetwork = () => new Promise((resolve) => setImmediate(resolve));
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const cooldown = () => response({ error: { code: 'cooldown', message: '冷却中' } }, 429);

// Exercise the real RemoteMatch pending/sequence implementation through the queue.
async function remoteQueue(reply, state = map()) {
  const requests = [],
    timers = new Map(),
    delays = [],
    errors = [],
    completed = [];
  let revision = 0,
    sequence = 0,
    inFlight = 0,
    maxInFlight = 0,
    queue;
  const snapshot = () => ({ matchId: 'orders', revision, lastSequence: sequence, state });
  const client = new RemoteMatch('http://localhost:43004', {
    fetch: async (url, options) => {
      if (url.endsWith('/api/matches'))
        return response({ matchId: 'orders', token: 'fixture', snapshot: snapshot() });
      if (!url.endsWith('/commands')) return response({ snapshot: snapshot() });
      const command = JSON.parse(options.body);
      requests.push(command);
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      try {
        const rejected = await reply(command, requests.length);
        if (rejected) return rejected;
        assert.equal(command.sequence, sequence + 1);
        applyCommand(state, command);
        sequence = command.sequence;
        revision++;
        return response({ accepted: true, snapshot: snapshot() });
      } finally {
        inFlight--;
      }
    },
  });
  await client.start('crossroads', 'normal');
  queue = createOrderQueue({
    read: () => ({ state: client.snapshot.state, enabled: true }),
    send: (command) => client.route(command.junctionId, command.index, command.enabled),
    schedule: (fn, ms) => {
      timers.set(fn, fn);
      delays.push(ms);
      return fn;
    },
    unschedule: (fn) => timers.delete(fn),
    completed: (intent) => completed.push(intent),
    failed: (error) => {
      errors.push(error);
      // main.mjs synchronously pauses/cancels input before reconnecting uncertain commands.
      if (!error.rejected) queue.cancel();
    },
  });
  return {
    queue,
    client,
    requests,
    timers,
    delays,
    errors,
    completed,
    get maxInFlight() {
      return maxInFlight;
    },
    async tick() {
      await flushNetwork();
      assert.equal(timers.size, 1);
      const [fn] = timers.keys();
      timers.delete(fn);
      fn();
      await flushNetwork();
    },
  };
}

test('persistent explicit cooldown releases the next city without consuming a rejected sequence', async () => {
  const h = await remoteQueue((command) => (command.junctionId === 'A-switch' ? cooldown() : null));
  const first = { kind: 'route', sourceId: 'A', targetId: 'D' };
  const next = { kind: 'route', sourceId: 'B', targetId: 'C' };
  h.queue.push(first);
  h.queue.push(next);
  for (let i = 0; i < 5; i++) await h.tick();
  await h.queue.idle();
  assert.deepEqual(
    h.requests.map((c) => [c.junctionId, c.sequence]),
    [...Array.from({ length: 6 }, () => ['A-switch', 1]), ['B-switch', 1]],
  );
  assert.deepEqual(h.delays, [220, 220, 220, 220, 220]);
  assert.equal(h.timers.size, 0);
  assert.equal(h.errors.length, 1);
  assert.equal(h.errors[0].code, 'cooldown-retry-exhausted');
  assert.equal(h.errors[0].rejected, true);
  assert.equal(h.errors[0].sourceId, 'A');
  assert.match(h.errors[0].message, /本次切换未生效/);
  assert.deepEqual(h.completed, [next]);
  assert.equal(h.client.sequence, 1);
  assert.equal(h.client.pending, null);
  assert.equal(h.maxInFlight, 1);
});

test('ordinary cooldown recovers in sequence and identical queued routes do not resend', async () => {
  const h = await remoteQueue((_command, count) => (count <= 2 ? cooldown() : null));
  const first = { kind: 'route', sourceId: 'A', targetId: 'D' };
  h.queue.push(first);
  h.queue.push(first);
  h.queue.push({ kind: 'route', sourceId: 'B', targetId: 'C' });
  await h.tick();
  await h.tick();
  await h.queue.idle();
  assert.deepEqual(
    h.requests.map((c) => [c.junctionId, c.sequence]),
    [
      ['A-switch', 1],
      ['A-switch', 1],
      ['A-switch', 1],
      ['B-switch', 2],
    ],
  );
  assert.equal(h.errors.length, 0);
  assert.equal(h.maxInFlight, 1);
});

test('a completed auxiliary stop is retained when the primary switch exhausts cooldown', async () => {
  const state = map();
  route(state, 'B', 'A');
  const h = await remoteQueue(
    (command) => (command.junctionId === 'A-switch' ? cooldown() : null),
    state,
  );
  h.queue.push({ kind: 'route', sourceId: 'A', targetId: 'B' });
  const next = { kind: 'route', sourceId: 'B', targetId: 'C' };
  h.queue.push(next);
  for (let i = 0; i < 5; i++) await h.tick();
  await h.queue.idle();
  assert.deepEqual(
    h.requests.map((c) => [c.junctionId, c.routeIndex, c.sequence]),
    [
      ['B-switch', 0, 1],
      ...Array.from({ length: 6 }, () => ['A-switch', 0, 2]),
      ['B-switch', 1, 2],
    ],
  );
  assert.deepEqual(h.completed, [next]);
  assert.equal(h.errors.length, 1);
  assert.equal(j(h.client.snapshot.state, 'A').routeIndex, -1);
  assert.equal(j(h.client.snapshot.state, 'B').routeIndex, 1);
});

test('cancel during cooldown removes timers and queued commands without late retries', async () => {
  const h = await remoteQueue(() => cooldown());
  h.queue.push({ kind: 'route', sourceId: 'A', targetId: 'D' });
  h.queue.push({ kind: 'route', sourceId: 'B', targetId: 'C' });
  await flushNetwork();
  const [lateWake] = h.timers.keys();
  h.queue.cancel();
  await h.queue.idle();
  lateWake();
  await flushNetwork();
  assert.equal(h.requests.length, 1);
  assert.equal(h.timers.size, 0);
  assert.equal(h.errors.length, 0);
  assert.equal(h.completed.length, 0);
  assert.equal(h.client.pending, null);
});

test('uncertain responses including a 503 cooldown code preserve the exact pending instruction', async (t) => {
  for (const [name, uncertain] of [
    [
      'lost acknowledgement',
      () => {
        throw new TypeError('connection reset');
      },
    ],
    ['upstream cooldown error', () => response({ error: { code: 'cooldown' } }, 503)],
  ])
    await t.test(name, async () => {
      const h = await remoteQueue((_command, count) => (count === 1 ? uncertain() : null));
      h.queue.push({ kind: 'route', sourceId: 'A', targetId: 'D' });
      h.queue.push({ kind: 'route', sourceId: 'B', targetId: 'C' });
      await h.queue.idle();
      assert.equal(h.requests.length, 1);
      assert.equal(h.delays.length, 0);
      assert.equal(h.errors[0].rejected, false);
      assert.equal(h.client.sequence, 0);
      assert.deepEqual(h.client.pending, h.requests[0]);
      assert.equal(h.completed.length, 0);
      // Reconnect first resolves the original instruction, regardless of new intent.
      await h.client.route('B-switch', 1);
      assert.deepEqual(h.requests[1], h.requests[0]);
      assert.equal(h.client.pending, null);
      await h.queue.push({ kind: 'route', sourceId: 'B', targetId: 'C' });
      assert.deepEqual(h.requests[2], {
        junctionId: 'B-switch',
        sequence: 2,
        routeIndex: 1,
        enabled: true,
      });
    });
});

test('adding and cancelling one target preserves all other targets and duplicate orders are idempotent', async () => {
  const state = map(),
    sent = [];
  const queue = createOrderQueue({
    read: () => ({ state, enabled: true }),
    send: async (command) => {
      sent.push(command);
      applyCommand(state, command);
    },
  });
  await queue.push({ kind: 'route', sourceId: 'A', targetId: 'B' });
  await queue.push({ kind: 'route', sourceId: 'A', targetId: 'D' });
  await queue.push({ kind: 'route', sourceId: 'A', targetId: 'B' });
  assert.deepEqual(j(state, 'A').routeIndices, [0, 1]);
  assert.equal(sent.length, 2);
  await queue.push({ kind: 'cancel-route', sourceId: 'A', targetId: 'B' });
  assert.deepEqual(j(state, 'A').routeIndices, [1]);
  await queue.push({ kind: 'cancel-route', sourceId: 'A', targetId: 'B' });
  assert.equal(sent.length, 3);
});

test('second matched seat can command its own cities and cannot command the first seat', () => {
  const state = map();
  state.playerFactionId = 1;
  assert.equal(planOrder(state, { kind: 'route', sourceId: 'C', targetId: 'B' })[0].enabled, true);
  assert.throws(() => planOrder(state, { kind: 'route', sourceId: 'A', targetId: 'B' }), /不属于/);
});
