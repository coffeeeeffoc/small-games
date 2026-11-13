import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  openDatabase,
  nightPlayerListSchema,
  nightPlayerDetailSchema,
  nightPlayerSections,
} from '@coffeeeeffoc/service-kit';
import { createNightPlayerReader } from '../src/competition/night-players.js';

// Explicit opt-in creates and removes only its own ephemeral, loopback PostgreSQL container.
(process.env.NIGHT_PLAYERS_POSTGRES === '1' ? describe : describe.skip)(
  'night players / real isolated PostgreSQL',
  () => {
    const container = `night-players-${randomUUID()}`;
    const docker = (...args: string[]) =>
      execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const id = 'c3f58a3a-1111-4111-8111-111111111111',
      unknown = 'c3f58a3a-1111-4111-8111-222222222222',
      other = 'aaaaaaaa-1111-4111-8111-111111111111';
    const now = Date.parse('2026-11-14T12:00:00+08:00');
    let admin: ReturnType<typeof openDatabase>,
      runtime: ReturnType<typeof openDatabase>,
      reader: ReturnType<typeof createNightPlayerReader>;
    const mail = Array.from({ length: 180 }, (_, i) => ({
      id: `mail-${i}`,
      body: '完整业务正文'.repeat(1000),
    }));
    beforeAll(async () => {
      docker(
        'run',
        '--rm',
        '-d',
        '--name',
        container,
        '--label',
        'io.small-games.test=night-players',
        '-e',
        'POSTGRES_HOST_AUTH_METHOD=trust',
        '-e',
        'POSTGRES_DB=competition_test',
        '-p',
        '127.0.0.1::5432',
        'postgres:17.6-alpine',
      );
      for (let i = 0; i < 60; i++) {
        try {
          docker(
            'exec',
            container,
            'psql',
            '-h',
            '127.0.0.1',
            '-U',
            'postgres',
            '-d',
            'competition_test',
            '-c',
            'select 1',
          );
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      const migrations = [
        '010-competition',
        '011-competition-profiles',
        '013-competition-identities',
        '014-player-sessions',
        '016-night-chat',
        '017-night-presence',
        '018-night-direct-messages',
      ];
      const setup =
        'create role runtime_app login; create schema runtime; grant usage on schema runtime to runtime_app;\n' +
        migrations
          .map((file) =>
            readFileSync(new URL(`../../../infra/migrations/${file}.sql`, import.meta.url), 'utf8'),
          )
          .join('\n');
      execFileSync(
        'docker',
        [
          'exec',
          '-i',
          container,
          'psql',
          '-U',
          'postgres',
          '-d',
          'competition_test',
          '-v',
          'ON_ERROR_STOP=1',
        ],
        { input: setup, stdio: ['pipe', 'pipe', 'pipe'] },
      );
      const port = docker('port', container, '5432/tcp').split(':').at(-1);
      admin = openDatabase(`postgres://postgres@127.0.0.1:${port}/competition_test`, 'runtime');
      runtime = openDatabase(
        `postgres://runtime_app@127.0.0.1:${port}/competition_test`,
        'runtime',
      );
      reader = createNightPlayerReader(runtime.db, () => now);
      for (const player of [id, unknown, other]) {
        await admin.db.execute(
          sql`insert into runtime.competition_players(id,created_at,display_name,subject) values(${player},${now},'查询玩家',${'private-subject-canary-' + player})`,
        );
        await admin.db.execute(
          sql`insert into runtime.player_game_access(player_id,game) values(${player},${player === other ? 'other-game' : 'night-overwatch'})`,
        );
      }
      const wallet = {
        coins: 50,
        xp: 80,
        visits: {
          '2026-11-01': [now - 13 * 86400000, now - 13 * 86400000 + 1000],
          '2026-11-14': [now, now],
        },
        mail,
        legacy: { inventory: { a: 1 }, passwordHash: 'canary' },
      };
      await admin.db.execute(
        sql`update runtime.competition_players set profile=${JSON.stringify({ avatar: 'avatar.png', nickname: '平台玩家', subject: 'canary' })}::jsonb where id=${id}`,
      );
      await admin.db.execute(
        sql`insert into runtime.competition_matches(id,board,data,created_at) values(${`night-assets:${id}`},'night-overwatch:private-assets-v3',${JSON.stringify(wallet)}::jsonb,${now})`,
      );
      await admin.db.execute(
        sql`insert into runtime.competition_matches(id,board,data,created_at) values(${`night-wallet:${id}`},'night-overwatch:private-wallet',${JSON.stringify({ signed: ['2026-11-01'], coins: 3 })}::jsonb,${now - 1})`,
      );
      await admin.db.execute(
        sql`insert into runtime.night_chat_reports(reporter_id,message_seq,evidence,reason,created_at) values(${unknown},123,${JSON.stringify({ player_id: id, body: '证据' })}::jsonb,'测试',${now})`,
      );
      for (let i = 0; i < 55; i++)
        await admin.db.execute(
          sql`insert into runtime.competition_matches(id,board,data,created_at) values(${`night-assets-event:${id}:request:${i}`},'night-overwatch:private-assets-v3',${JSON.stringify({ hash: 'canary', result: { coins: i }, at: now + i })}::jsonb,${now + i})`,
        );
      await admin.db.execute(
        sql`insert into runtime.competition_results(match_id,board,player_id,score,secondary,created_at) values('night-result','night-overwatch:points:night-records-v1',${id},12,0,${now}),('other-result','other-game:points',${id},34,0,${now})`,
      );
    }, 60000);
    afterAll(async () => {
      await runtime?.close();
      await admin?.close();
      try {
        docker('rm', '-f', container);
      } catch {
        /* setup may have failed before create */
      }
    });
    it('matches retained days even when a later visit exists, excludes unobserved/other-game players, and sorts unknown last', async () => {
      const found = nightPlayerListSchema.parse(
        await reader.list({ from: '2026-11-01', to: '2026-11-01' }),
      );
      expect(found.items.map((p) => p.id)).toEqual([id]);
      expect(found.items[0]!.observedTo).toBe(now);
      expect((await reader.list({ from: '2026-11-02', to: '2026-11-02' })).total).toBe(0);
      const collision = nightPlayerListSchema.parse(await reader.list({ shortId: '#C3F58A3A' }));
      expect(collision.items.map((p) => p.id)).toEqual([id, unknown]);
      expect(collision.items[1]!.observedTo).toBeNull();
      expect((await reader.list({ nickname: '查询' })).total).toBe(2);
      expect((await reader.list({ nickname: "%' or true --" })).total).toBe(0);
      await expect(reader.detail({ id: other })).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(reader.list({ from: '2025-01-01', to: '2025-01-01' })).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    });
    it('returns the whole large wallet and all bounded pages with totals; reads never prepare or mutate wallets', async () => {
      const before = await admin.db.execute(
        sql`select data from runtime.competition_matches where id=${`night-assets:${id}`}`,
      );
      const detail = nightPlayerDetailSchema.parse(await reader.detail({ id }));
      expect((detail.items[0] as { data: { mail: unknown[] } }).data.mail).toEqual(mail);
      expect(detail.truncated).toBe(false);
      expect(detail.profile).toEqual({ avatar: 'avatar.png', nickname: '平台玩家' });
      expect((detail.items[1] as { data: { signed: string[] } }).data.signed).toEqual([
        '2026-11-01',
      ]);
      expect((await reader.detail({ id, section: 'reports' })).total).toBe(1);
      expect(JSON.stringify(detail)).not.toContain('canary');
      const pages = await Promise.all(
        [1, 2, 3].map((page) => reader.detail({ id, section: 'records', page })),
      );
      expect(pages.map((p) => [p.total, p.items.length, p.nextPage])).toEqual([
        [55, 20, 2],
        [55, 20, 3],
        [55, 15, null],
      ]);
      expect(
        new Set(pages.flatMap((p) => p.items.map((item) => (item as { id: string }).id))).size,
      ).toBe(55);
      expect(JSON.stringify(pages)).not.toContain('canary');
      for (const section of nightPlayerSections)
        nightPlayerDetailSchema.parse(await reader.detail({ id, section, pageSize: 1 }));
      expect((await reader.detail({ id, section: 'results' })).total).toBe(1);
      const after = await admin.db.execute(
        sql`select data from runtime.competition_matches where id=${`night-assets:${id}`}`,
      );
      expect(after).toEqual(before);
      await admin.db.execute(
        sql`update runtime.competition_matches set data=jsonb_set(data,'{mail}',${JSON.stringify([{ body: 'x'.repeat(4 * 1024 * 1024) }])}::jsonb) where id=${`night-assets:${id}`}`,
      );
      await expect(reader.detail({ id, pageSize: 1 })).rejects.toMatchObject({
        code: 'NIGHT_PLAYER_DATA_TOO_LARGE',
        status: 413,
      });
    });
  },
);
