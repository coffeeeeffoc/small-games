import { expect, it, vi } from 'vitest';
import { createCarromStore } from '../src/carrom/store.js';
import type { Engine, Room } from '../src/carrom/types.js';
import { controlDatabase, gateFixture } from './control-fixture.js';

function fixture() {
  const gate = gateFixture();
  let persisted: Room = {
    game: 'carrom-club',
    code: 'AABBCCDDEEFF',
    version: 1,
    hostId: 'a',
    status: 'playing',
    killEpoch: 0,
    players: ['a', 'b'].map((id) => ({ id, name: id, ready: true, lastSeen: 1000, seq: 0 })),
    settings: { mode: 'colors', board: 'ordinary', levelId: null, maxPlayers: 2 },
    revision: 1,
    readyRevision: 1,
    round: 1,
    deadline: 100000,
    turnDeadline: 999,
    state: {
      turn: 0,
      turnNumber: 1,
      phase: 'playing',
      players: [{ id: 'a' }, { id: 'b' }],
    } as Room['state'],
    series: [
      { playerId: 'a', points: 0, wins: 0 },
      { playerId: 'b', points: 0, wins: 0 },
    ],
    settledRound: 0,
    lastShot: null,
  };
  const skip = vi.fn((state) => ({
    ...state,
    phase: 'over',
    ranking: [{ playerId: 'a', rank: 1, points: 10 }],
  }));
  const engine = { multiplayerVersion: 1, skipMultiplayerTurn: skip } as unknown as Engine;
  const memory = controlDatabase((text, params) => {
    if (text.includes('from runtime.competition_rooms')) {
      gate.events.push('room-lock');
      return [{ data: structuredClone(persisted) }];
    }
    if (text.startsWith('update runtime.competition_rooms')) {
      persisted = JSON.parse(String(params[0])) as Room;
      return [];
    }
    return [];
  });
  return {
    ...memory,
    gate,
    skip,
    store: createCarromStore(memory.db, engine, [], () => 1000, gate.control),
    room: () => persisted,
  };
}
it('saves GET timeout transition to finished once, then reads the durable series without repeating points', async () => {
  const f = fixture();
  await f.store.action('a', 'AABBCCDDEEFF', 'get');
  expect(f.room().status).toBe('finished');
  expect(f.room().series[0]).toMatchObject({ points: 10, wins: 1 });
  expect(
    f.queries.filter((q) => q.sql.startsWith('update runtime.competition_rooms')),
  ).toHaveLength(1);
  await f.store.action('a', 'AABBCCDDEEFF', 'get');
  expect(f.skip).toHaveBeenCalledTimes(1);
  expect(f.room().series[0]).toMatchObject({ points: 10, wins: 1 });
  expect(
    f.queries.filter((q) => q.sql.startsWith('update runtime.competition_rooms')),
  ).toHaveLength(1);
});
it('refuses disabled/recovered old rounds before timeout scoring, while leave never advances', async () => {
  const f = fixture();
  f.gate.set('disabled', 1);
  await expect(f.store.action('a', 'AABBCCDDEEFF', 'get')).rejects.toMatchObject({
    code: 'GAME_DISABLED',
  });
  f.gate.set('enabled', 1);
  await expect(f.store.action('a', 'AABBCCDDEEFF', 'shoot', { seq: 1 })).rejects.toMatchObject({
    code: 'GAME_CANCELLED',
  });
  await f.store.action('a', 'AABBCCDDEEFF', 'leave');
  expect(f.skip).not.toHaveBeenCalled();
  expect(f.room().status).toBe('abandoned');
  expect(f.room().series[0]!.points).toBe(0);
  expect(f.gate.events.indexOf('control')).toBeLessThan(f.gate.events.indexOf('room-lock'));
});
