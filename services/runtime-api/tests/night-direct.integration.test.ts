import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { sql } from 'drizzle-orm';
import { openDatabase } from '@coffeeeeffoc/service-kit';
import { createCompetitionStore } from '../src/competition/store.js';
import { createRankedStore } from '../src/competition/ranked-store.js';
import { registerCompetition } from '../src/competition/routes.js';
import type { Rule } from '../src/competition/types.js';

const url = process.env.COMPETITION_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'Night direct messages, authenticated HTTP and isolated PostgreSQL',
  () => {
    let database: ReturnType<typeof openDatabase>,
      store: ReturnType<typeof createCompetitionStore>,
      app: ReturnType<typeof Fastify>;
    let at = Date.now();
    const internalKey = 'night-chat-test-internal-key-123456789';
    beforeAll(async () => {
      if (!url || new URL(url).pathname !== '/competition_test')
        throw Error('Only isolated competition_test');
      database = openDatabase(url, 'runtime');
      await database.db.execute(sql`delete from runtime.night_presence`);
      await database.db.execute(sql`delete from runtime.night_chat_reports`);
      await database.db.execute(sql`delete from runtime.night_chat_messages`);
      await database.db.execute(sql`delete from runtime.night_direct_messages`);
      await database.db.execute(sql`delete from runtime.night_chat_limits`);
      const rule = (await import(new URL('../rules/night.mjs', import.meta.url).href))
        .default as Rule;
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
    it('keeps private text and invitations between two players, including retries, reports and old clients', async () => {
      const a = await guest(),
        b = await guest(),
        c = await guest(),
        other = await guest('wulong-city');
      const direct = chat + '?direct=1',
        input = { requestId: randomUUID(), text: '仅你我可见', recipientId: b.playerId };
      for (const recipientId of [a.playerId, other.playerId, randomUUID()])
        expect((await request(direct, a.token, { ...input, recipientId })).statusCode).toBe(422);
      const sent = await request(direct, a.token, input);
      expect(sent.statusCode).toBe(200);
      const message = sent.json().messages.find((m: { text: string }) => m.text === input.text);
      expect(message).toMatchObject({ playerId: a.playerId, recipientId: b.playerId });
      expect((await request(direct, a.token, input)).statusCode).toBe(200);
      expect(
        (await request(direct, a.token, { ...input, recipientId: c.playerId })).statusCode,
      ).toBe(409);
      expect((await request(direct, b.token)).json().messages).toContainEqual(message);
      expect(
        (await request(direct, c.token))
          .json()
          .messages.some((m: { id: string }) => m.id === message.id),
      ).toBe(false);
      expect(
        (await request(chat, b.token))
          .json()
          .messages.some((m: { id: string }) => m.id === message.id),
      ).toBe(false);
      expect(
        await database.db.execute(
          sql`select 1 from runtime.night_chat_messages where seq=${message.id}::bigint`,
        ),
      ).toHaveLength(0);
      expect(
        (await request(chat + '/report', c.token, { id: message.id, reason: '猜测编号' }))
          .statusCode,
      ).toBe(404);
      expect(
        (await request(chat + '/report', b.token, { id: message.id, reason: '骚扰' })).statusCode,
      ).toBe(200);
      at += 4000;
      expect(
        (
          await request(direct, b.token, {
            requestId: randomUUID(),
            recipientId: a.playerId,
            text: '收到，来一局',
          })
        ).statusCode,
      ).toBe(200);
      const room = (
        await request('/games/night-overwatch/rooms', a.token, {
          mode: 'friend',
          visibility: 'public',
        })
      ).json();
      await request('/games/night-overwatch/presence', b.token, { activity: 'available' });
      const invited = await request(direct, a.token, {
        requestId: randomUUID(),
        recipientId: b.playerId,
        text: '',
        roomCode: room.code,
      });
      expect(invited.statusCode).toBe(200);
      const invitation = (await request(direct, b.token))
        .json()
        .messages.find((m: { room?: { code: string } }) => m.room?.code === room.code);
      expect(invitation.room.canJoin).toBe(true);
      expect(
        (await request(direct, c.token))
          .json()
          .messages.some((m: { room?: { code: string } }) => m.room?.code === room.code),
      ).toBe(false);
      expect(
        (
          await request('/games/night-overwatch/rooms/join', b.token, {
            code: room.code,
            createdAt: invitation.room.createdAt,
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (await request(direct, b.token))
          .json()
          .messages.find((m: { id: string }) => m.id === invitation.id).room.canJoin,
      ).toBe(false);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/competition/v1/internal/night-chat/moderate',
            headers: { 'x-competition-internal-key': internalKey },
            payload: { kind: 'remove', id: message.id },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (await request(direct, b.token))
          .json()
          .messages.some((m: { id: string }) => m.id === message.id),
      ).toBe(false);
      await database.db.execute(
        sql`update runtime.night_direct_messages set created_at=${at - 86400001} where player_id in (${a.playerId},${b.playerId})`,
      );
      expect(
        (await request(direct, b.token))
          .json()
          .messages.filter((m: { recipientId?: string }) => m.recipientId),
      ).toHaveLength(2);
    });
    it('persists mutual friends, offline history, pagination and read cursors without exposing other conversations', async () => {
      const a = await guest(),
        b = await guest(),
        c = await guest(),
        social = '/games/night-overwatch/social';
      const act = (who: typeof a, action: string, playerId: string, throughId?: string) =>
        request(social, who.token, { action, playerId, ...(throughId ? { throughId } : {}) });
      expect((await act(a, 'request', a.playerId)).statusCode).toBe(422);
      expect((await act(a, 'request', b.playerId)).statusCode).toBe(200);
      expect((await act(a, 'request', b.playerId)).json().requests).toHaveLength(1);
      expect((await act(a, 'accept', b.playerId)).statusCode).toBe(404);
      expect((await act(c, 'accept', a.playerId)).statusCode).toBe(404);
      expect((await act(b, 'accept', a.playerId)).json().friends).toEqual([
        expect.objectContaining({ playerId: a.playerId, status: 'offline' }),
      ]);
      expect((await act(b, 'accept', a.playerId)).json().friends).toHaveLength(1);
      for (let i = 0; i < 53; i++)
        await database.db.execute(
          sql`insert into runtime.night_direct_messages(request_id,player_id,recipient_id,signature,body,created_at) values(${randomUUID()},${a.playerId},${b.playerId},'fixture',${'offline ' + i},${at - 86400001})`,
        );
      const summary = (await request(social, b.token)).json();
      expect(summary.conversations[0].unread).toBe(53);
      expect(summary.conversations[0].lastMessage).toMatchObject({
        nickname: expect.any(String),
        recipientNickname: expect.any(String),
      });
      const first = (await request(chat + '?direct=1&peer=' + a.playerId, b.token)).json();
      expect(first.messages).toHaveLength(50);
      expect(first.nextBefore).toBeTruthy();
      const earlier = (
        await request(
          chat + '?direct=1&peer=' + a.playerId + '&before=' + first.nextBefore,
          b.token,
        )
      ).json();
      expect(earlier.messages).toHaveLength(3);
      expect(earlier.nextBefore).toBeUndefined();
      expect(new Set([...earlier.messages, ...first.messages].map((m) => m.id)).size).toBe(53);
      expect((await request(chat + '?direct=1&peer=' + b.playerId, b.token)).statusCode).toBe(422);
      expect(
        (await request(chat + '?direct=1&peer=' + a.playerId, c.token)).json().messages,
      ).toEqual([]);
      expect((await act(b, 'read', c.playerId, first.messages.at(-1).id)).statusCode).toBe(404);
      expect((await act(b, 'read', a.playerId, '9223372036854775807')).statusCode).toBe(404);
      expect(
        (await act(b, 'read', a.playerId, first.messages.at(-1).id)).json().conversations[0].unread,
      ).toBe(0);
      expect(
        (await act(b, 'read', a.playerId, earlier.messages[0].id)).json().conversations[0].unread,
      ).toBe(0);
      expect(
        (
          await request(chat + '/report', b.token, {
            id: earlier.messages[0].id,
            reason: '旧私信举报',
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await request(chat + '?direct=1', a.token, {
            requestId: randomUUID(),
            recipientId: b.playerId,
            text: '离线留言',
          })
        ).statusCode,
      ).toBe(200);
      expect((await request(social, b.token)).json().conversations[0].unread).toBe(1);
      await request('/games/night-overwatch/presence', a.token, { activity: 'playing' });
      expect((await request(social, b.token)).json().friends[0].status).toBe('playing');
      await act(b, 'remove', a.playerId);
      expect((await request(social, a.token)).json().friends).toEqual([]);
      expect((await request(social, b.token)).json().conversations).toHaveLength(1);
      at += 4000;
      await act(a, 'request', b.playerId);
      await act(b, 'decline', a.playerId);
      expect((await request(social, a.token)).json().requests).toEqual([]);
      at += 4000;
      await act(a, 'request', b.playerId);
      await act(a, 'cancel', b.playerId);
      expect((await request(social, b.token)).json().requests).toEqual([]);
    }, 20000);
    it('rejects invitations to offline and playing recipients, including authoritative rooms', async () => {
      const a = await guest(),
        b = await guest(),
        c = await guest();
      const own = (
        await request('/games/night-overwatch/rooms', a.token, {
          mode: 'friend',
          visibility: 'public',
        })
      ).json();
      const invite = () =>
        request(chat + '?direct=1', a.token, {
          requestId: randomUUID(),
          recipientId: b.playerId,
          text: '约战',
          roomCode: own.code,
        });
      expect((await invite()).json().error).toBe('RECIPIENT_BUSY');
      await request('/games/night-overwatch/presence', b.token, { activity: 'playing' });
      expect((await invite()).json().error).toBe('RECIPIENT_BUSY');
      await request('/games/night-overwatch/presence', b.token, { activity: 'available' });
      const busy = (
        await request('/games/night-overwatch/rooms', b.token, {
          mode: 'friend',
          visibility: 'public',
        })
      ).json();
      await database.db.execute(
        sql`update runtime.competition_rooms set data=jsonb_set(data,'{status}','"playing"'::jsonb) where code=${busy.code}`,
      );
      expect((await invite()).json().error).toBe('RECIPIENT_BUSY');
      expect(
        (await request('/games/night-overwatch/presence', c.token, {}))
          .json()
          .players.find((p: { playerId: string }) => p.playerId === b.playerId).status,
      ).toBe('playing');
      await database.db.execute(sql`delete from runtime.competition_rooms where code=${busy.code}`);
    });
  },
);
