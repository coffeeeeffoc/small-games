import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createOnlineClient, invitationCode, normalizeRoomCode, onlineRoomKey } from '../src/online.mjs';

const memory = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
};
const fixture = (seq = 0) => ({
  game: 'flick-arena', version: 'flick-series-v1', code: 'ABCDEF123456', status: 'playing', seq,
  you: 0, players: [{ id: 'a', ready: true }, { id: 'b', ready: true }],
  state: { revision: seq, match: { tournamentRoundId: '1:1' } },
});

test('online transport remains the exact shared authentication client', async () => {
  const [shared, game] = await Promise.all([
    readFile(new URL('../../../../platforms/competition/client.js', import.meta.url), 'utf8'),
    readFile(new URL('../competition-client.js', import.meta.url), 'utf8'),
  ]);
  assert.equal(game, shared);
});

test('room code validation and public invitations exclude developer flags', async () => {
  assert.equal(normalizeRoomCode('abcd-ef12 3456'), 'ABCDEF123456');
  assert.throws(() => normalizeRoomCode('hello'));
  assert.equal(invitationCode('https://game.test/?flickRoom=ABCDEF123456'), 'ABCDEF123456');
  assert.equal(invitationCode('https://game.test/?flickRoom=invalid'), null);
  const client = createOnlineClient({ storage: memory(), transport: { request: async () => fixture() } });
  await client.join('ABCDEF123456');
  const invitation = new URL(client.invitationUrl('https://game.test/?dev=1#/play/flick-arena?dev=1'));
  assert.equal(invitation.searchParams.get('flickRoom'), 'ABCDEF123456');
  assert.equal(invitation.searchParams.has('dev'), false);
  assert.equal(invitation.hash.includes('dev='), false);
});

test('create and recover a real room through the shared request protocol', async () => {
  const calls = [], storage = memory();
  const transport = { request: async (path, options) => { calls.push({ path, body: options?.body && JSON.parse(options.body) }); return fixture(); } };
  let changes = 0;
  const client = createOnlineClient({ storage, transport, onChange: () => changes++ });
  await client.create({ players: 4, turnSeconds: 15 });
  assert.deepEqual(calls[0], { path: '/rooms', body: { game: 'flick-arena', mode: 'party4-relaxed' } });
  assert.equal(client.snapshot().code, 'ABCDEF123456');
  assert.equal(changes, 1);
  const restored = createOnlineClient({ storage, transport });
  await restored.restore();
  assert.equal(calls[1].path, '/rooms/ABCDEF123456');
  await restored.leave();
  assert.equal(storage.getItem(onlineRoomKey), undefined);
  assert.equal(restored.snapshot(), null);
});

test('lost action responses retry identical sequence and intent without shooting twice', async () => {
  const actions = [];
  let lost = true;
  const transport = { request: async (path, options) => {
    if (!path.endsWith('/actions')) return fixture();
    const body = JSON.parse(options.body);
    actions.push(body);
    if (lost) { lost = false; throw Object.assign(new Error('lost'), { code: 'SERVICE_UNAVAILABLE' }); }
    return fixture(1);
  } };
  const client = createOnlineClient({ storage: memory(), transport });
  await client.join('ABCDEF123456');
  await assert.rejects(client.shoot({ x: 1, y: 0, power: 0.5 }), /lost/);
  await client.shoot({ x: -1, y: 0, power: 1 });
  assert.deepEqual(actions[0], actions[1]);
  assert.deepEqual(actions[0], { seq: 1, action: { type: 'shoot', revision: 0, x: 1, y: 0, power: 0.5 } });
  assert.equal(client.snapshot().seq, 1);
});

test('room operations serialize and unsupported transports do not fabricate sessions', async () => {
  const client = createOnlineClient({ storage: memory(), transport: {} });
  assert.equal(client.available, false);
  await assert.rejects(client.create(), /暂未配置/);
  let active = 0, peak = 0;
  const serial = createOnlineClient({ storage: memory(), transport: { request: async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    return fixture();
  } } });
  await serial.join('ABCDEF123456');
  await Promise.all([serial.refresh(), serial.ready(), serial.refresh()]);
  assert.equal(peak, 1);
  serial.dispose();
  await assert.rejects(serial.refresh(), /房间已关闭/);
});

test('a queued gesture retains its original revision when an in-flight refresh changes turns', async () => {
  let refreshStarted, releaseRefresh;
  const started = new Promise((resolve) => { refreshStarted = resolve; });
  const gate = new Promise((resolve) => { releaseRefresh = resolve; });
  const actions = [];
  const client = createOnlineClient({ storage: memory(), transport: { request: async (path, options) => {
    if (path.endsWith('/join')) return fixture();
    if (path.endsWith('/actions')) {
      actions.push(JSON.parse(options.body));
      throw Object.assign(new Error('stale gesture'), { code: 'ILLEGAL_ACTION' });
    }
    refreshStarted();
    await gate;
    return { ...fixture(), state: { ...fixture().state, revision: 4 } };
  } } });
  await client.join('ABCDEF123456');
  const refresh = client.refresh();
  await started;
  const shot = client.shoot({ x: 1, y: 0, power: 0.5 });
  const rejection = assert.rejects(shot, /stale gesture/);
  releaseRefresh();
  await refresh;
  await rejection;
  assert.equal(client.snapshot().state.revision, 4);
  assert.equal(actions[0].action.revision, 0);
});
