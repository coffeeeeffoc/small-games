import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createCompetitionStore } from '../src/competition/store.js';
import type { Room, Rule } from '../src/competition/types.js';
import { controlDatabase, gateFixture } from './control-fixture.js';

const owner = '11111111-1111-4111-8111-111111111111';
function fixture() {
  const gate = gateFixture();
  let time = 1000,
    receipt: string | undefined;
  const room: Room = {
    code: 'AABBCCDDEEFF',
    game: 'xiangqi-five',
    version: 'v1',
    status: 'playing',
    seed: 1,
    killEpoch: 0,
    createdAt: 1,
    startedAt: 1,
    deadline: 5000,
    players: [{ id: owner, seq: 0, ready: true, state: { ticks: 0 } }],
  };
  let persisted = structuredClone(room);
  const verifyRun = vi.fn(() => ({ board: 'street-board', elapsedMs: 1500 }));
  const advance = vi.fn((state: unknown) => state),
    result = vi.fn(() => ({ finished: false, eligible: false, score: 0, secondary: 0 }));
  const rule: Rule = {
    id: room.game,
    title: 'fixture',
    version: 'v1',
    durationMs: 5000,
    initial: () => ({}),
    view: (state) => state,
    action: (state) => state,
    result,
    advance,
  };
  const admissions = new Map<string, Record<string, unknown>>();
  let oldResult = false;
  const database = controlDatabase((text, params) => {
    if (text.includes('from runtime.competition_rooms')) {
      gate.events.push(text.includes('for update') ? 'room-lock' : 'preview');
      return [{ data: structuredClone(persisted) }];
    }
    if (text.startsWith('update runtime.competition_rooms')) {
      persisted = JSON.parse(String(params[0])) as Room;
      return [];
    }
    if (text.startsWith('select id,display_name,profile'))
      return [{ id: owner, display_name: '玩家甲' }];
    if (text.includes('from runtime.competition_actions'))
      return receipt ? [{ action_hash: receipt }] : [];
    if (text.startsWith('insert into runtime.competition_matches')) {
      admissions.set(String(params[0]), JSON.parse(String(params[2])) as Record<string, unknown>);
      return [];
    }
    if (text.includes('from runtime.competition_matches'))
      return admissions.has(String(params[0]))
        ? [{ data: structuredClone(admissions.get(String(params[0]))) }]
        : [];
    if (text.includes('from runtime.competition_results'))
      return oldResult ? [{ score: -1500 }] : [];
    if (text.startsWith('insert into runtime.competition_results')) return [{ player_id: owner }];
    return [];
  });
  const streetRule = {
    ...rule,
    id: 'cops-robbers-realtime',
    runBoard: () => 'street-board',
    verifyRun,
  };
  const store = createCompetitionStore(
    database.db,
    new Map([
      [rule.id, rule],
      [streetRule.id, streetRule],
    ]),
    () => time,
    gate.control,
  );
  return {
    ...database,
    gate,
    store,
    advance,
    result,
    verifyRun,
    admissions,
    time(value: number) {
      time = value;
    },
    prior() {
      oldResult = true;
    },
    receipt(action: unknown) {
      receipt = createHash('sha256').update(JSON.stringify(action)).digest('hex');
    },
  };
}
it('locks control before the room and rejects disabled or recovered old rooms before GET advance/timeout/finish', async () => {
  const f = fixture();
  f.time(10000);
  f.gate.set('disabled', 1);
  await expect(f.store.roomAction(owner, 'AABBCCDDEEFF', 'get')).rejects.toMatchObject({
    code: 'GAME_DISABLED',
  });
  expect(f.advance).not.toHaveBeenCalled();
  expect(f.result).not.toHaveBeenCalled();
  expect(f.gate.events.indexOf('control')).toBeLessThan(f.gate.events.indexOf('room-lock'));
  f.gate.set('enabled', 1);
  await expect(
    f.store.roomAction(owner, 'AABBCCDDEEFF', 'actions', { seq: 1, action: {} }),
  ).rejects.toMatchObject({ code: 'GAME_CANCELLED' });
  expect(
    f.queries.some((q) =>
      /insert into runtime.competition_(results|best|matches)|update runtime.competition_rooms/.test(
        q.sql,
      ),
    ),
  ).toBe(false);
  // Leave stays available, without running timeout/settlement first.
  await f.store.roomAction(owner, 'AABBCCDDEEFF', 'leave');
  expect(f.advance).not.toHaveBeenCalled();
});
it('draining permits playing progress but denies create/join/ready/rematch; receipts are read-only', async () => {
  const f = fixture();
  f.gate.set('draining');
  await f.store.roomAction(owner, 'AABBCCDDEEFF', 'get');
  expect(f.advance).toHaveBeenCalledTimes(1);
  for (const operation of ['join', 'ready', 'rematch'])
    await expect(f.store.roomAction(owner, 'AABBCCDDEEFF', operation)).rejects.toMatchObject({
      code: 'GAME_DRAINING',
    });
  await expect(f.store.create(owner, 'xiangqi-five')).rejects.toMatchObject({
    code: 'GAME_DRAINING',
  });
  const action = { type: 'move' };
  f.receipt(action);
  f.gate.set('disabled', 1);
  const writes = f.queries.filter((q) => /^(update|insert)/.test(q.sql)).length;
  await f.store.roomAction(owner, 'AABBCCDDEEFF', 'actions', { seq: 1, action });
  expect(f.advance).toHaveBeenCalledTimes(1);
  expect(f.queries.filter((q) => /^(update|insert)/.test(q.sql))).toHaveLength(writes);
});
it('Street admissions are server-owned and old same-owner/hash results bypass verification without rewriting scores', async () => {
  const f = fixture();
  f.gate.set('enabled', 1);
  await expect(f.store.streetRuns(owner, {}, { journal: [] })).rejects.toMatchObject({
    code: 'GAME_CANCELLED',
  });
  expect(f.verifyRun).not.toHaveBeenCalled();
  const ticket = await f.store.startStreetRun(owner, {});
  const stored = f.admissions.get(`street-admission:${ticket.admissionId}`)!;
  expect(stored).toMatchObject({ playerId: owner, game: 'cops-robbers-realtime', killEpoch: 1 });
  await expect(
    f.store.streetRuns('another-owner', {}, {}, ticket.admissionId),
  ).rejects.toMatchObject({ code: 'RUN_ADMISSION_REQUIRED' });
  f.gate.set('draining', 1);
  await f.store.streetRuns(owner, {}, { journal: [] }, ticket.admissionId);
  expect(f.verifyRun).toHaveBeenCalledTimes(1);
  f.gate.set('disabled', 2);
  f.prior();
  const writes = f.queries.filter((q) => /^(update|insert)/.test(q.sql)).length;
  await f.store.streetRuns(owner, {}, { journal: [] }, ticket.admissionId);
  expect(f.verifyRun).toHaveBeenCalledTimes(1);
  expect(f.queries.filter((q) => /^(update|insert)/.test(q.sql))).toHaveLength(writes);
});
it('Kart outbox epoch is rechecked before a new result but an existing receipt remains read-only', async () => {
  const f = fixture();
  f.gate.set('enabled', 1);
  const input = {
    matchId: 'a-match',
    board: 'carding-car-seaside-v1',
    entries: [],
    startedAt: 100,
    finishedAt: 1000,
  };
  await expect(f.store.kartResults(input)).rejects.toMatchObject({ code: 'GAME_CANCELLED' });
  expect(f.queries.some((q) => q.sql.startsWith('insert into runtime.competition_matches'))).toBe(
    false,
  );
  f.admissions.set(input.matchId, { ...input, killEpoch: 0 });
  f.gate.set('disabled', 2);
  await expect(f.store.kartResults(input)).resolves.toMatchObject({ accepted: true });
  expect(f.queries.some((q) => q.sql.startsWith('insert into runtime.competition_matches'))).toBe(
    false,
  );
});
