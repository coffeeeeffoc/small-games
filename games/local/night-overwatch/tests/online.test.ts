import test from 'node:test';
import assert from 'node:assert/strict';
import { Online, playerId, playerLabel, invitation, roomLink } from '../assets/scripts/Online.ts';
import { createDuel, viewDuel } from '../assets/scripts/core/Duel.ts';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
const storage = () => { const map = new Map<string, string>(); return { getItem: (key: string) => map.get(key) || null, setItem: (key: string, value: string) => { map.set(key, value); } }; };
const room = () => ({ code: 'A12BCD456789', status: 'waiting', mode: 'match', you: 0, seq: 0, players: [], state: null as ReturnType<typeof viewDuel> | null });
function fixture() {
  const received: any[] = []; let calls = 0, fail = false;
  const current = room();
  const services = { match: async () => { calls++; return current; }, createRoom: async () => current, joinRoom: async () => current,
    getRoom: async () => current, roomAction: async (input: any) => { received.push(structuredClone(input)); if (fail) { fail = false; throw Error('network'); } current.seq = input.body?.seq || current.seq; return current; },
    leaderboard: async () => ({ top: [], me: null }) };
  const bridge = { services, ready: Promise.resolve({ identity: { id: 'a', name: '飞行员' }, capabilities: { multiplayer: true, leaderboards: true } }),
    createRecorder: () => ({ start: async () => null, record() {}, finish: async () => null, invalidate() {} }) };
  return { current, bridge, received, count: () => calls, fail: () => { fail = true; } };
}
test('persistent local pilots have UUIDs, distinct display suffixes and sanitized room links', () => {
  const store = storage(), a = new Online(store, () => {}), b = new Online(store, () => {}), c = new Online(storage(), () => {});
  assert.equal(playerId(a.identity), playerId(b.identity)); assert.notEqual(playerId(a.identity), playerId(c.identity));
  assert.match(playerLabel(a.identity), /#[A-F0-9]{8}$/);
  assert.equal(invitation('?room=A12BCD456789'), 'A12BCD456789'); assert.equal(invitation('?room=bad'), undefined);
  assert.equal(invitation('?room=A12BCD456789&room=A12BCD456789'), undefined);
  assert.equal(roomLink('https://user:password@example.com/game?dev=1&token=secret#account', 'A12BCD456789'), 'https://example.com/game?room=A12BCD456789');
});

test('late connection and ready failure cannot rejoin or alter a cancelled room', async () => {
  const f = fixture(); let resolve!: (value: any) => void;
  f.bridge.ready = new Promise(r => { resolve = r; });
  const online = new Online(storage(), () => {});
  const connecting = online.connect(f.bridge, '?room=A12BCD456789'); assert(online.recorder, 'ranked start is available before metadata'); online.leave();
  resolve({ identity: { id: 'a', name: '飞行员' }, capabilities: { multiplayer: true, leaderboards: true } });
  await connecting; assert.equal(online.room, undefined); assert.equal(online.panel, ''); assert(online.available);
  await online.open('friend');
  let reject!: (reason: Error) => void;
  f.bridge.services.roomAction = () => new Promise((_r, r) => { reject = r; });
  const ready = online.ready(), failReady = reject;
  online.leave(); failReady(Error('late')); await ready;
  assert.equal(online.message, ''); assert.equal(online.panel, '');
});

test('leaderboard refresh recovers metadata after an initial network failure', async () => {
  const f = fixture();
  const online = new Online(storage(), () => {});
  await online.connect({ ...f.bridge, ready: Promise.resolve(undefined), refresh: async () => f.bridge.ready });
  assert(!online.ranked); await online.loadRanking(); assert(online.ranked); assert(online.ranking);
});

test('paused and modal controls cannot fire, while release always reaches the duel', () => {
  const online = new Online(storage(), () => {}); online.startBot(0);
  const sim = Simulation.restore(online.view!.simulation); let modal = false;
  online.bind(sim, () => sim.paused || modal);
  sim.pause('settings', true); sim.setFire('space', true); sim.fire();
  assert.equal(online.bot!.simulation.fired, 0);
  sim.pause('settings', false); modal = true; sim.setFire('mouse', true); sim.fire();
  assert.equal(online.bot!.simulation.fired, 0);
  sim.clearInput(); modal = false; sim.setFire('space', true);
  assert.equal(online.bot!.pilots[0].held.length, 1);
  modal = true; sim.setFire('space', false); assert.deepEqual(online.bot!.pilots[0].held, []);
});
test('match waiting polls the matchmaking endpoint so the server can select a bot', async () => {
  const f = fixture(), online = new Online(storage(), () => {}); await online.connect(f.bridge); await online.open('match');
  await online.pump(100); assert.equal(f.count(), 2);
  f.current.status = 'playing'; f.current.state = viewDuel(createDuel(41, true));
  await online.pump(9000); assert(online.active); assert(online.view!.bot);
});
test('retry sends the exact same input sequence and leaving discards queued firing', async () => {
  const f = fixture(), online = new Online(storage(), () => {}); await online.connect(f.bridge); await online.open('match');
  f.current.status = 'playing'; f.current.state = viewDuel(createDuel(41)); await online.pump(1);
  online.control({ command: 'setFire', args: ['mouse', true] }); f.fail(); await online.pump(301);
  await online.pump(1400); assert.deepEqual(f.received.at(-1), f.received.at(-2));
  online.leave(); assert(!online.active); assert.equal(online.room, undefined);
});
test('cancelled room creation cannot reopen the room after its response arrives', async () => {
  const f = fixture(); let resolve!: (r: ReturnType<typeof room>) => void;
  f.bridge.services.createRoom = () => new Promise(r => { resolve = r; });
  const online = new Online(storage(), () => {}); await online.connect(f.bridge);
  const pending = online.open('friend'); online.leave(); resolve(room()); await pending;
  assert.equal(online.room, undefined); assert.equal(online.panel, ''); assert.equal(f.received.at(-1).operation, 'leave');
});

test('an opponent leaving or server finishing resolves the terminal snapshot instead of retrying actions', async () => {
  for (const code of ['MATCH_CLOSED', 'PLAYER_FINISHED']) {
    const f = fixture(), online = new Online(storage(), () => {}); await online.connect(f.bridge); await online.open('match');
    f.current.status = 'playing'; f.current.state = viewDuel(createDuel(41)); await online.pump(1);
    f.bridge.services.roomAction = async () => { throw Object.assign(Error(code), { code }); };
    f.bridge.services.getRoom = async () => ({ ...f.current, status: 'abandoned' });
    await online.pump(301); assert.equal(online.room!.status, 'abandoned'); assert(online.view!.finished);
    assert.match(online.message, /已离开/);
  }
});

test('a room abandoned before readiness stops polling and refuses another ready action', async () => {
  const f = fixture(), online = new Online(storage(), () => {}); await online.connect(f.bridge); await online.open('match');
  f.current.status = 'abandoned'; await online.pump(301); await online.pump(1301); await online.ready();
  assert.equal(f.count(), 1); assert.equal(f.received.length, 0); assert(!online.active);
});
