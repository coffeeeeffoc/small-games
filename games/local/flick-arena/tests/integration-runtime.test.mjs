import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.mjs';
import { createOnlineClient } from '../src/online.mjs';
import { arena } from '../src/render.mjs';
import { shoot, step, skipTurn, physics } from '../src/core.mjs';
import { levels } from '../src/levels.mjs';
import {
  createTournament,
  createTournamentMatch,
  recordTournamentRound,
  nextTournamentRound,
} from '../src/tournament.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));
const flush = () => new Promise((resolve) => setImmediate(resolve));

function roomFixture(players = 2) {
  const series = createTournament({ players, seed: 71 });
  return {
    game: 'flick-arena',
    version: 'flick-series-v1',
    code: 'ABCDEF123456',
    status: 'playing',
    seq: 0,
    you: 0,
    capacity: players,
    startedAt: 100000,
    serverNow: 100000,
    pollMs: 800,
    players: series.players.map((player) => ({ ...player, ready: true })),
    state: {
      series,
      match: createTournamentMatch(series),
      revision: 0,
      elapsedMs: 0,
      turnStartsAtMs: 0,
      turnDeadlineMs: 10000,
      nextRoundAtMs: null,
      nextReady: [],
      lastShot: null,
      lastTimeout: null,
    },
  };
}

function harness(options = {}) {
  let listener,
    clock = 100000,
    game,
    server = options.room ? clone(options.room) : null;
  const texts = [],
    calls = [];
  const context = new Proxy(
    {
      fillText(value) {
        texts.push(value);
      },
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
    },
    { get: (object, key) => (key in object ? object[key] : () => {}) },
  );
  const online = createOnlineClient({
    storage: {},
    transport: {
      request: async (path, request) => {
        calls.push({ path, body: request?.body ? JSON.parse(request.body) : null });
        if (path.endsWith('/leave')) return {};
        return clone(server);
      },
    },
    onChange: (room) => game.receiveRoom(room),
  });
  game = createGame(
    {
      canvas: { width: 390, height: 780, getContext: () => context },
      onPointer(callback) {
        listener = callback;
        return () => {
          listener = null;
        };
      },
    },
    { ...options, online, now: () => clock },
  );
  return {
    game,
    online,
    texts,
    calls,
    pointer: (phase, x, y, pointerId = 1) => listener?.({ phase, x, y, pointerId }),
    tick(seconds) {
      const count = Math.ceil(seconds * 120);
      for (let index = 0; index < count; index++) {
        clock += 1000 / 120;
        game.tick(1 / 120);
      }
    },
    async join() {
      await online.join(server.code);
    },
    async update(room) {
      server = clone(room);
      await online.refresh();
    },
  };
}

function aimPoint(game) {
  const disc = game.app.state.discs[game.app.state.active];
  return { x: arena.x + disc.x * arena.scale, y: arena.y + disc.y * arena.scale };
}

function edgeWin(h) {
  const match = h.game.app.state;
  Object.assign(match.discs[0], { x: 0, y: -95 });
  Object.assign(match.discs[1], { x: 0, y: -159 });
  const point = aimPoint(h.game);
  h.pointer('down', point.x, point.y);
  h.pointer('up', point.x, point.y + 115);
  for (let index = 0; index < 600 && h.game.app.screen === 'playing'; index++) h.tick(1 / 120);
  assert.equal(h.game.app.screen, 'result');
  assert.equal(h.game.app.state.winner, 0);
}

function endedRoom(room) {
  const result = clone(room),
    remote = result.state;
  Object.assign(remote.match.discs[0], { x: 0, y: -95 });
  Object.assign(remote.match.discs[1], { x: 0, y: -159 });
  const before = clone(remote.match);
  shoot(remote.match, 0, -1, 1);
  let frames = 0;
  while (['moving', 'shrinking'].includes(remote.match.phase)) {
    step(remote.match);
    frames++;
  }
  assert.equal(remote.match.phase, 'over');
  recordTournamentRound(remote.series, remote.match);
  remote.revision++;
  remote.lastShot = {
    revision: remote.revision,
    before,
    x: 0,
    y: -1,
    power: 1,
    animationMs: frames * physics.step * 1000,
  };
  remote.turnStartsAtMs = null;
  remote.turnDeadlineMs = null;
  remote.nextRoundAtMs = 20000;
  return result;
}

test('same-device timer, gesture cancellation and paused time carry across a handoff', () => {
  const h = harness();
  h.game.action('friends');
  h.game.action('local2');
  h.tick(9);
  assert.equal(h.game.app.remainingSeconds, 1);
  const point = aimPoint(h.game);
  h.pointer('down', point.x, point.y);
  h.pointer('move', point.x - 80, point.y);
  h.game.action('pause');
  assert.equal(h.game.app.drag, null);
  const before = clone(h.game.app.state);
  h.tick(20);
  assert.deepEqual(h.game.app.state, before);
  h.game.action('resume');
  h.tick(1.05);
  assert.equal(h.game.app.state.active, 1);
  assert.equal(h.game.app.state.shots, 1, 'the timed-out player loses exactly one turn');
  assert.equal(h.game.app.remainingSeconds, 10);
  h.pointer('up', point.x - 80, point.y);
  assert.equal(h.game.app.state.shots, 1, 'a stale release cannot fire for the next player');
  h.game.dispose();
});

test('the first visible same-device turn accepts a drag before its first animation tick', () => {
  const h = harness();
  h.game.action('local2');
  const point = aimPoint(h.game);
  h.pointer('down', point.x, point.y);
  assert(h.game.app.drag);
  h.tick(1 / 120);
  assert(h.game.app.drag, 'starting the countdown cannot cancel the already-visible legal turn');
  h.pointer('up', point.x - 50, point.y);
  assert.equal(h.game.app.state.shots, 1);
  h.game.dispose();
});

test('local result/replay preserves the score and a fresh round receives a full clock', () => {
  const h = harness();
  h.game.action('local2');
  h.tick(6);
  edgeWin(h);
  assert.equal(h.game.app.series.wins['player-1'], 1);
  const receipt = clone(h.game.app.series);
  h.game.action('replay');
  assert.equal(h.game.app.screen, 'replay');
  h.tick(0.3);
  h.game.action('result');
  assert.deepEqual(h.game.app.series, receipt);
  h.game.action('next-round');
  assert.equal(h.game.app.series.round, 2);
  assert.equal(h.game.app.state.active, 1);
  assert.equal(h.game.app.remainingSeconds, 10);
  h.tick(0.1);
  assert.equal(h.game.app.state.shots, 0);
  assert.equal(h.game.app.drag, null);
  h.game.dispose();
});

test('campaign victory persists once, unlocks the next briefing and survives recreation', () => {
  const saves = [];
  const h = harness({ saveProgress: (save) => saves.push(clone(save)) });
  h.game.action(`level-${levels[1].id}`);
  assert.equal(h.game.app.screen, 'home', 'normal selection cannot open a locked level');
  h.game.action('start');
  assert.equal(h.game.app.chosenLevel.id, levels[0].id);
  h.game.action('play-level');
  edgeWin(h);
  assert.equal(saves.length, 1);
  assert(saves[0].campaign.levels[levels[0].id].stars >= 1);
  h.game.action('replay');
  h.tick(0.1);
  h.game.action('result');
  assert.equal(saves.length, 1);
  h.game.action('next-level');
  assert.equal(h.game.app.screen, 'briefing');
  assert.equal(h.game.app.chosenLevel.id, levels[1].id);
  h.game.dispose();
  const restored = harness({ save: saves[0] });
  restored.game.action('start');
  assert.equal(restored.game.app.chosenLevel.id, levels[1].id);
  restored.game.dispose();
});

test('level 20 remains a normal next-level result and only level 120 is the finale', () => {
  const save = {
    version: 1,
    played: 119,
    wins: 119,
    campaign: {
      levels: Object.fromEntries(
        levels.slice(0, 119).map((level) => [
          level.id,
          {
            stars: 1,
            goals: [],
            bestShots: 5,
          },
        ]),
      ),
    },
  };
  const h = harness({ save });
  const complete = () => {
    const state = h.game.app.state;
    state.phase = 'over';
    state.winner = 0;
    state.playerShots = 4;
    state.shots = 8;
    h.tick(1);
    assert.equal(h.game.app.screen, 'result');
  };
  h.game.action(`level-${levels[19].id}`);
  h.game.action('play-level');
  complete();
  assert(h.game.app.buttons.some((button) => button.id === 'next-level'));
  assert(!h.texts.includes('巅峰已至！'));
  h.game.action('next-level');
  assert.equal(h.game.app.chosenLevel.id, levels[20].id);
  h.game.action(`level-${levels.at(-1).id}`);
  h.game.action('play-level');
  complete();
  assert(h.texts.includes('巅峰已至！'));
  assert(h.texts.includes('120 关通关 · 回头挑战满星吧'));
  assert(!h.game.app.buttons.some((button) => button.id === 'next-level'));
  assert(h.game.app.buttons.some((button) => button.id === 'retry'));
  h.game.dispose();
});

test('online menu stays usable through room polls and leaving stops further polling', async () => {
  const h = harness({ room: roomFixture() });
  await h.join();
  h.game.action('pause');
  assert.equal(h.game.app.screen, 'paused');
  assert(h.game.app.buttons.some((button) => button.id === 'leave-room'));
  const remote = roomFixture();
  skipTurn(remote.state.match);
  remote.state.revision = 1;
  remote.state.turnStartsAtMs = 10000;
  remote.state.turnDeadlineMs = 20000;
  remote.serverNow += 10000;
  await h.update(remote);
  assert.equal(h.game.app.screen, 'paused', 'authority updates cannot dismiss the menu');
  h.game.action('resume');
  assert.equal(h.game.app.state.active, 1, 'returning to play uses the current server turn');
  h.game.action('pause');
  h.game.action('leave-room');
  await flush();
  assert.equal(h.game.app.room, null);
  assert.equal(h.game.app.screen, 'friends');
  const requests = h.calls.length;
  h.tick(3);
  await flush();
  assert.equal(h.calls.length, requests);
  h.game.action('home');
  assert.equal(h.game.app.screen, 'home');
  h.game.dispose();
});

test('an unchanged poll preserves aiming, but a missed cycle returning to the same player cancels it', async () => {
  const room = roomFixture();
  const h = harness({ room });
  await h.join();
  const point = aimPoint(h.game);
  h.pointer('down', point.x, point.y);
  h.pointer('move', point.x + 60, point.y);
  assert(h.game.app.drag);
  await h.update(room);
  assert(h.game.app.drag, 'routine polls must not interrupt a valid gesture');
  const advanced = clone(room);
  skipTurn(advanced.state.match);
  skipTurn(advanced.state.match);
  advanced.state.revision = 2;
  advanced.state.turnStartsAtMs = 20000;
  advanced.state.turnDeadlineMs = 30000;
  advanced.serverNow += 20000;
  await h.update(advanced);
  assert.equal(h.game.app.state.active, 0);
  assert.equal(
    h.game.app.drag,
    null,
    'a new turn must require a new gesture even for the same player',
  );
  h.pointer('up', point.x + 60, point.y);
  await flush();
  assert(!h.calls.some(({ path }) => path.endsWith('/actions')));
  h.game.dispose();
});

test('returning from a suspended replay after the server opens a round cannot read stale frames', async () => {
  const initial = roomFixture();
  const h = harness({ room: initial });
  await h.join();
  const ended = endedRoom(initial);
  await h.update(ended);
  h.tick(2);
  assert.equal(h.game.app.screen, 'result');
  h.game.action('replay');
  assert.equal(h.game.app.screen, 'replay');
  h.game.pause();
  const next = clone(ended);
  nextTournamentRound(next.state.series);
  next.state.match = createTournamentMatch(next.state.series);
  next.state.revision++;
  next.state.lastShot = null;
  next.state.nextRoundAtMs = null;
  next.state.turnStartsAtMs = 20000;
  next.state.turnDeadlineMs = 30000;
  next.serverNow += 20000;
  await h.update(next);
  h.game.resume();
  assert.doesNotThrow(() => h.tick(0.02));
  assert.equal(h.game.app.screen, 'playing');
  assert.equal(h.game.app.state.tournamentRoundId, next.state.match.tournamentRoundId);
  assert.equal(h.game.app.series.round, 2);
  assert.equal(h.game.app.drag, null);
  h.game.dispose();
});

test('recovering a result without a captured shot disables the replay control', async () => {
  const ended = endedRoom(roomFixture());
  ended.state.lastShot = null;
  const h = harness({ room: ended });
  await h.join();
  assert.equal(h.game.app.screen, 'result');
  const replay = h.game.app.buttons.find((button) => button.id === 'replay');
  assert.equal(replay.disabled, true);
  h.game.action('replay');
  assert.equal(h.game.app.screen, 'result');
  h.game.dispose();
});

test('disposed online games ignore late response callbacks and pointer releases', async () => {
  const h = harness({ room: roomFixture() });
  await h.join();
  const point = aimPoint(h.game);
  h.pointer('down', point.x, point.y);
  h.game.dispose();
  const screen = h.game.app.screen;
  h.game.receiveRoom(endedRoom(roomFixture()));
  h.pointer('up', point.x - 115, point.y);
  h.tick(1);
  assert.equal(h.game.app.screen, screen);
  assert.equal(h.game.app.drag, null);
  assert.equal(h.game.app.state.shots, 0);
});

test('expired server series shows an ended result even when the last board was aiming', async () => {
  const room = roomFixture();
  room.state.series.phase = 'finished';
  room.state.series.winnerId = null;
  room.state.reason = 'time-limit';
  room.state.turnDeadlineMs = null;
  const h = harness({ room });
  await h.join();
  assert.equal(h.game.app.screen, 'result');
  assert.equal(h.game.app.canAim, false);
  assert(h.texts.includes('本场已结束'));
  assert(!h.texts.includes('擂主诞生！'));
  h.game.dispose();
});

test('low display frame rates do not stretch the online polling clock', async () => {
  const h = harness({ room: roomFixture() });
  await h.join();
  const before = h.calls.length;
  h.game.tick(0.9);
  await flush();
  assert(h.calls.length > before, '900ms of elapsed time polls regardless of simulation clamp');
  h.game.dispose();
});

test('late join skips an already-finished shot animation and retains its replay', async () => {
  const ended = endedRoom(roomFixture());
  ended.state.lastShot.at = 0;
  ended.serverNow = ended.startedAt + 5000;
  const h = harness({ room: ended });
  await h.join();
  assert.equal(h.game.app.screen, 'result');
  assert.equal(h.game.app.state.phase, 'over');
  assert.equal(h.game.app.buttons.find((button) => button.id === 'replay').disabled, false);
  h.game.dispose();
});
