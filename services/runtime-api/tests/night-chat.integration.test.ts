import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { sql } from 'drizzle-orm';
import { openDatabase } from '@coffeeeeffoc/service-kit';
import { createCompetitionStore } from '../src/competition/store.js';
import { createRankedStore } from '../src/competition/ranked-store.js';
import { registerCompetition } from '../src/competition/routes.js';
import { createNightChat } from '../src/competition/night-chat.js';
import type { CompetitionControl } from '../src/competition/control.js';
import type { Rule } from '../src/competition/types.js';

const url = process.env.COMPETITION_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'Night public chat, authenticated HTTP and isolated PostgreSQL',
  () => {
    let database: ReturnType<typeof openDatabase>,
      store: ReturnType<typeof createCompetitionStore>,
      app: ReturnType<typeof Fastify>;
    let at = Date.now(),
      ruleVersion = '';
    const internalKey = 'night-chat-test-internal-key-123456789';
    beforeAll(async () => {
      if (!url || new URL(url).pathname !== '/competition_test')
        throw Error('Only isolated competition_test');
      database = openDatabase(url, 'runtime');
      await database.db.execute(sql`delete from runtime.night_chat_reports`);
      await database.db.execute(sql`delete from runtime.night_chat_messages`);
      await database.db.execute(sql`delete from runtime.night_chat_limits`);
      const rule = (await import(new URL('../rules/night.mjs', import.meta.url).href))
        .default as Rule;
      ruleVersion = rule.version;
      store = createCompetitionStore(database.db, new Map([[rule.id, rule]]), () => at);
      app = Fastify();
      await registerCompetition(
        app,
        store,
        { COMPETITION_INTERNAL_KEY: internalKey },
        undefined,
        undefined,
        createRankedStore(database.db, new Map(), store.identityDetails, () => at),
      );
    });
    afterAll(async () => {
      await app?.close();
      await database?.close();
    });
    const guest = (game = 'night-overwatch') => store.guestSession({ game });
    const request = async (path: string, token?: string, body?: unknown) =>
      app.inject({
        method: body === undefined ? 'GET' : 'POST',
        url: '/api/competition/v1' + path,
        headers: token ? { authorization: 'Bearer ' + token } : {},
        ...(body === undefined ? {} : { payload: body }),
      });
    const chat = '/games/night-overwatch/chat';
    it('isolates identity/game, validates Unicode length and bigint boundaries, and uses server identity', async () => {
      const a = await guest(),
        other = await guest('wulong-city');
      expect((await request(chat)).statusCode).toBe(401);
      expect((await request(chat, other.token)).statusCode).toBe(403);
      for (const text of ['', ' ', '好'.repeat(121), 'hello\nworld'])
        expect((await request(chat, a.token, { requestId: randomUUID(), text })).statusCode).toBe(
          422,
        );
      expect(
        (
          await request(chat, a.token, {
            requestId: randomUUID(),
            text: '你好',
            playerId: other.playerId,
          })
        ).statusCode,
      ).toBe(422);
      expect(
        (await request(chat + '/report', a.token, { id: '9999999999999999999', reason: '测试' }))
          .statusCode,
      ).toBe(422);
      const response = await request(chat, a.token, {
        requestId: randomUUID(),
        text: '好'.repeat(120),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().messages.at(-1)).toMatchObject({
        playerId: a.playerId,
        text: '好'.repeat(120),
        at,
      });
    });
    it('serializes concurrent senders, retries once, rejects changed requests and atomic per-player bursts', async () => {
      at += 4000;
      const a = await guest(),
        b = await guest(),
        input = { requestId: randomUUID(), text: '一起出发' };
      const responses = await Promise.all([
        request(chat, a.token, input),
        request(chat, a.token, input),
        request(chat, b.token, { requestId: randomUUID(), text: '我来了' }),
      ]);
      expect(responses.every((r) => r.statusCode === 200)).toBe(true);
      const result = (await request(chat, b.token)).json();
      expect(
        result.messages.filter((m: { playerId: string }) => m.playerId === a.playerId),
      ).toHaveLength(1);
      expect(
        result.messages.filter((m: { playerId: string }) => m.playerId === b.playerId),
      ).toHaveLength(1);
      expect((await request(chat, a.token, { ...input, text: '改写' })).statusCode).toBe(409);
      expect(
        (await request(chat, a.token, { requestId: randomUUID(), text: '再发' })).statusCode,
      ).toBe(429);
      const ids = result.messages.map((m: { id: string }) => BigInt(m.id));
      expect(ids.every((id: bigint, i: number) => !i || id > ids[i - 1])).toBe(true);
      const waiting = store.nightChat.list(b.playerId, result.cursor, 1000);
      at += 4000;
      await request(chat, a.token, { requestId: randomUUID(), text: '游标之后' });
      expect((await waiting).messages.at(-1)?.text).toBe('游标之后');
    });
    it('validates public invitations and marks changed room generations or rules unavailable', async () => {
      at += 4000;
      const a = await guest(),
        b = await guest();
      const room = await store.create(a.playerId, 'night-overwatch', {
        mode: 'friend',
        visibility: 'public',
      });
      expect(
        (await request(chat, b.token, { requestId: randomUUID(), text: '', roomCode: room.code }))
          .statusCode,
      ).toBe(422);
      const result = (
        await request(chat, a.token, {
          requestId: randomUUID(),
          text: '来一局',
          roomCode: room.code,
        })
      ).json();
      const invite = result.messages.at(-1).room;
      expect(invite.canJoin).toBe(true);
      const restarted = createNightChat(
        database.db,
        () => at,
        {
          lock: async () => ({
            gameId: 'night-overwatch',
            state: 'enabled',
            killEpoch: 1,
            revision: 1,
          }),
        } as unknown as CompetitionControl,
        ruleVersion,
      );
      expect((await restarted.list(b.playerId)).messages.at(-1)?.room?.canJoin).toBe(false);
      at += 4000;
      await expect(
        restarted.send(a.playerId, {
          requestId: randomUUID(),
          text: '停服前房间',
          roomCode: room.code,
        }),
      ).rejects.toMatchObject({ code: 'INVITATION_UNAVAILABLE' });
      expect(
        (
          await request('/games/night-overwatch/rooms/join', b.token, {
            code: room.code,
            createdAt: invite.createdAt + 1,
          })
        ).statusCode,
      ).toBe(404);
      await database.db.execute(
        sql`update runtime.competition_rooms set data=jsonb_set(data,'{version}','"old-version"'::jsonb) where code=${room.code}`,
      );
      expect((await request(chat, b.token)).json().messages.at(-1).room.canJoin).toBe(false);
      at += 4000;
      expect(
        (
          await request(chat, a.token, {
            requestId: randomUUID(),
            text: '再次邀请',
            roomCode: room.code,
          })
        ).statusCode,
      ).toBe(422);
      const privateRoom = await store.create(b.playerId, 'night-overwatch', {
        mode: 'friend',
        visibility: 'private',
        password: 'safe-room',
      });
      expect(
        (
          await request(chat, b.token, {
            requestId: randomUUID(),
            text: '',
            roomCode: privateRoom.code,
          })
        ).statusCode,
      ).toBe(422);
    });
    it('keeps report evidence, propagates removals, and protects moderator operations', async () => {
      at += 4000;
      const a = await guest(),
        b = await guest();
      const result = (
          await request(chat, a.token, { requestId: randomUUID(), text: '举报证据' })
        ).json(),
        id = result.messages.at(-1).id;
      expect(
        (await request(chat + '/report', b.token, { id, reason: '垃圾信息' })).statusCode,
      ).toBe(200);
      expect(
        (await request(chat + '/report', b.token, { id, reason: '垃圾信息' })).statusCode,
      ).toBe(200);
      expect(
        (await request('/internal/night-chat/moderate', b.token, { kind: 'remove', id }))
          .statusCode,
      ).toBe(403);
      const moderate = (payload: object) =>
        app.inject({
          method: 'POST',
          url: '/api/competition/v1/internal/night-chat/moderate',
          headers: { 'x-competition-internal-key': internalKey },
          payload,
        });
      const remove = await moderate({ kind: 'remove', id });
      expect(remove.statusCode, remove.body).toBe(200);
      const next = (await request(chat + '?cursor=' + result.cursor, b.token)).json();
      expect(next.cursor).not.toBe(result.cursor);
      expect(next.messages.some((m: { id: string }) => m.id === id)).toBe(false);
      const evidence = await database.db.execute(
        sql`select evidence from runtime.night_chat_reports where reporter_id=${b.playerId} and message_seq=${id}::bigint`,
      );
      expect(evidence).toHaveLength(1);
      expect((evidence[0]!.evidence as { body: string }).body).toBe('举报证据');
      expect((await moderate({ kind: 'mute', playerId: a.playerId, minutes: 5 })).statusCode).toBe(
        200,
      );
      at += 4000;
      expect(
        (await request(chat, a.token, { requestId: randomUUID(), text: '被禁言' })).statusCode,
      ).toBe(403);
      await moderate({ kind: 'mute', playerId: a.playerId, minutes: 0 });
      expect(
        (await request(chat, a.token, { requestId: randomUUID(), text: '恢复' })).statusCode,
      ).toBe(200);
    });
    it('bounds the visible window to 100 recent messages and never replays an expired request', async () => {
      const a = await guest();
      at += 4000;
      const old = { requestId: randomUUID(), text: '过期内容' };
      await request(chat, a.token, old);
      at += 86400001;
      expect((await store.nightChat.list(a.playerId)).messages).toHaveLength(0);
      await store.nightChat.send(a.playerId, old);
      expect((await store.nightChat.list(a.playerId)).messages).toHaveLength(0);
      for (let i = 0; i < 103; i++) {
        at += 3001;
        await store.nightChat.send(a.playerId, { requestId: randomUUID(), text: '消息' + i });
      }
      const last = await store.nightChat.list(a.playerId);
      expect(last.messages).toHaveLength(100);
      expect(last.messages[0]?.text).toBe('消息3');
      expect(last.messages.at(-1)?.text).toBe('消息102');
      const started = performance.now();
      await store.nightChat.list(a.playerId, last.cursor, 5000);
      expect(performance.now() - started).toBeGreaterThanOrEqual(4900);
      expect(performance.now() - started).toBeLessThan(8000);
    }, 15000);
  },
);
