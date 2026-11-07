import test from 'node:test';
import assert from 'node:assert/strict';
import { Online } from '../assets/scripts/Online.ts';

function fixture() {
  let count = 2, calls = 0;
  const bridge = {
    ready: Promise.resolve({identity: {id: 'a'}, capabilities: {multiplayer: true, leaderboards: false, presence: true}}),
    services: {nightPresence: async () => { calls++; return {onlineCount: count}; }},
    createRecorder: () => ({start: async () => null, record() {}, finish: async () => null, invalidate() {}}),
  };
  const online = new Online({getItem: () => null, setItem() {}}, () => {});
  return {online, bridge, calls: () => calls, count: (n: number) => {count = n;}};
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('presence covers every screen, throttles, hides unavailable counts and recovers', async () => {
  const f = fixture();
  await f.online.connect(f.bridge as any);
  for (const panel of ['', 'menu', 'room', 'ranking'] as const) {
    f.online.panel = panel as any;
    await f.online.pump(performance.now() + 10000); await flush();
    assert.equal(f.online.onlineCount, 2);
  }
  const calls = f.calls();
  await f.online.pump(performance.now()); await flush();
  assert.equal(f.calls(), calls);
  for (const invalid of [NaN, -1, 1.5]) {
    f.count(invalid);
    await f.online.pump(performance.now() + 10000); await flush();
    assert.equal(f.online.onlineCount, null);
  }
  f.bridge.services.nightPresence = async () => {throw Error('offline');};
  await f.online.pump(performance.now() + 10000); await flush();
  assert.equal(f.online.onlineLabel('zh'), '在线人数暂不可用');
  f.bridge.services.nightPresence = async () => ({onlineCount: 1});
  await f.online.pump(performance.now() + 10000); await flush();
  assert.equal(f.online.onlineLabel('en'), '1 online');
  f.online.dispose();
});

test('presence rejects responses after background, disposal, identity or bridge replacement', async () => {
  for (const action of ['background', 'dispose', 'identity', 'bridge']) {
    const f = fixture(); let resolve!: (value: {onlineCount: number}) => void;
    f.bridge.services.nightPresence = () => new Promise(done => {resolve = done;});
    await f.online.connect(f.bridge as any);
    await f.online.pump(0);
    if (action === 'background') f.online.setForeground(false);
    if (action === 'dispose') f.online.dispose();
    if (action === 'identity') f.online.authenticatedId = 'b';
    if (action === 'bridge') await f.online.connect({...f.bridge} as any);
    resolve({onlineCount: 99}); await flush();
    assert.equal(f.online.onlineCount, null, action);
    if (action === 'background') {
      f.bridge.services.nightPresence = async () => ({onlineCount: 3});
      await f.online.pump(20000); await flush(); assert.equal(f.online.onlineCount, null);
      f.online.setForeground(true);
      await f.online.pump(performance.now()); await flush(); assert.equal(f.online.onlineCount, 3);
    }
    f.online.dispose();
  }
});

test('old servers and absent services do not poll or invent zero players', async () => {
  const f = fixture();
  f.bridge.ready = Promise.resolve({identity: {id: 'a'}, capabilities: {multiplayer: true, leaderboards: false, presence: false}});
  await f.online.connect(f.bridge as any);
  await f.online.pump(10000); await flush();
  assert.equal(f.calls(), 0); assert.equal(f.online.onlineCount, null);
  f.online.dispose();
});
