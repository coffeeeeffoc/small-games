import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createDuelServer } from './duel-server.js';
import type { DuelMessage } from './duel-protocol.js';
const services: ReturnType<typeof createDuelServer>[] = [];
afterEach(() => {
  for (const service of services.splice(0)) service.stop();
});
async function fixture(waitSeconds = 1) {
  const service = createDuelServer({ waitSeconds, staticRoot: '.' });
  services.push(service);
  await new Promise<void>((resolve) => service.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(service.server.address() as AddressInfo).port}`;
  const post = (path: string, body: object, origin?: string) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
      body: JSON.stringify(body),
    });
  const join = async () =>
    (await (await post('/duel/join', { version: 'duel-v1', mapId: 'ravine-v1' })).json()) as {
      token: string;
    };
  async function stream(token: string) {
    const response = await fetch(`${base}/duel/events?token=${token}`),
      reader = response.body!.getReader();
    let buffer = '';
    const decoder = new TextDecoder();
    return {
      close: () => reader.cancel(),
      async next(): Promise<DuelMessage> {
        for (;;) {
          const end = buffer.indexOf('\n\n');
          if (end >= 0) {
            const line = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (line.startsWith('data: ')) return JSON.parse(line.slice(6)) as DuelMessage;
            continue;
          }
          const chunk = await reader.read();
          if (chunk.done) throw new Error('Stream ended');
          buffer += decoder.decode(chunk.value, { stream: true });
        }
      },
    };
  }
  return { service, base, post, join, stream };
}
describe('真人匹配与服务端权威', () => {
  it('两个真实 HTTP/SSE 客户端配对，序号去重且共享炮弹状态', async () => {
    const f = await fixture(),
      a = await f.join(),
      sa = await f.stream(a.token),
      b = await f.join(),
      sb = await f.stream(b.token);
    let ma = await sa.next();
    while (ma.kind !== 'state') ma = await sa.next();
    let mb = await sb.next();
    while (mb.kind !== 'state') mb = await sb.next();
    if (ma.kind !== 'state' || mb.kind !== 'state') throw new Error('Missing state');
    expect(ma.matchId).toBe(mb.matchId);
    expect(ma.mode).toBe('human');
    expect(ma.side).not.toBe(mb.side);
    await f.post('/duel/input', { token: a.token, seq: 1, command: { type: 'charge' } });
    await new Promise((r) => setTimeout(r, 120));
    const fire = { token: a.token, seq: 2, command: { type: 'fire' } };
    await f.post('/duel/input', fire);
    await f.post('/duel/input', fire);
    await f.post('/duel/input', { ...fire, seq: 1 });
    const stateA: Extract<DuelMessage, { kind: 'state' }>[] = [],
      stateB: Extract<DuelMessage, { kind: 'state' }>[] = [];
    for (let i = 0; i < 5; i++) {
      const aa = await sa.next(),
        bb = await sb.next();
      if (aa.kind === 'state') stateA.push(aa);
      if (bb.kind === 'state') stateB.push(bb);
    }
    const common = stateA.find(
      (s) => s.state.nextId === 2 && stateB.some((b) => b.state.tick === s.state.tick),
    );
    expect(common).toBeDefined();
    expect(common!.state.shells).toHaveLength(1);
    expect(stateB.find((s) => s.state.tick === common!.state.tick)!.state).toEqual(common!.state);
    expect(
      (await f.post('/duel/input', { token: a.token, seq: 3, command: { type: 'hp', hp: 999 } }))
        .status,
    ).toBe(400);
    await sa.close();
    await sb.close();
  });
  it('匹配超时只建立机器人局，取消排队不迟到开局', async () => {
    const f = await fixture(0.15),
      a = await f.join(),
      sa = await f.stream(a.token);
    let m = await sa.next();
    while (m.kind !== 'state') m = await sa.next();
    expect(m.mode).toBe('bot');
    expect(f.service.rooms.size).toBe(1);
    const b = await f.join();
    await f.post('/duel/cancel', { token: b.token });
    await new Promise((r) => setTimeout(r, 200));
    expect(f.service.rooms.size).toBe(1);
    expect((await fetch(`${f.base}/duel/events?token=${b.token}`)).status).toBe(401);
    await sa.close();
  });
  it('兼容版本、来源、请求体和会话凭证均校验', async () => {
    const f = await fixture();
    expect((await f.post('/duel/join', { version: 'old', mapId: 'ravine-v1' })).status).toBe(409);
    expect(
      (
        await f.post(
          '/duel/join',
          { version: 'duel-v1', mapId: 'ravine-v1' },
          'https://untrusted.example',
        )
      ).status,
    ).toBe(403);
    expect(
      (await f.post('/duel/input', { token: 'forged', seq: 1, command: { type: 'fire' } })).status,
    ).toBe(401);
    expect((await f.post('/duel/join', { padding: 'a'.repeat(2200) })).status).toBe(413);
    expect((await fetch(`${f.base}/play/%ZZ`)).status).toBe(404);
    expect((await fetch(`${f.base}/health`)).ok).toBe(true);
  });
  it('重连恢复同一对局，断线取消蓄力，主动退出只结算一次', async () => {
    const f = await fixture(0.1),
      a = await f.join(),
      sa = await f.stream(a.token);
    let m = await sa.next();
    while (m.kind !== 'state') m = await sa.next();
    await f.post('/duel/input', { token: a.token, seq: 1, command: { type: 'charge' } });
    await new Promise((r) => setTimeout(r, 50));
    await sa.close();
    await new Promise((r) => setTimeout(r, 50));
    await f.post('/duel/input', { token: a.token, seq: 2, command: { type: 'charge' } });
    const again = await f.stream(a.token),
      state = await again.next();
    expect(state.kind).toBe('state');
    if (state.kind !== 'state') throw new Error('Missing state');
    expect(state.matchId).toBe(m.matchId);
    expect(state.state.fighters[0].guns[0].charge).toBeNull();
    await f.post('/duel/cancel', { token: a.token });
    const room = [...f.service.rooms][0];
    expect(room.state.result).toEqual({ winner: 1, reason: 'leave' });
    expect((await f.post('/duel/cancel', { token: a.token })).status).toBe(401);
  });
});
