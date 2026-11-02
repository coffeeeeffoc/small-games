import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '@coffeeeeffoc/service-kit';
import { sql } from 'drizzle-orm';
import { createCompetitionStore } from '../src/competition/store.js';
import { createRankedStore } from '../src/competition/ranked-store.js';
import { retireRankedRuns, retentionContract } from '../src/competition/ranked-maintenance.js';
import type { Rule } from '../src/competition/types.js';
import type { RankedRule, RankedRun } from '../src/competition/ranked-types.js';

const url = process.env.COMPETITION_TEST_DATABASE_URL;
(url ? describe : describe.skip)('trusted ranked maintenance on isolated PostgreSQL', () => {
  let database: ReturnType<typeof openDatabase>;
  const previous = {
    url: process.env.RUNTIME_DATABASE_URL,
    control: process.env.COMPETITION_CONTROL_ENABLED,
  };
  beforeAll(() => {
    if (!url || new URL(url).pathname !== '/competition_test')
      throw Error('Use isolated competition_test');
    database = openDatabase(url, 'runtime');
    process.env.RUNTIME_DATABASE_URL = url;
    process.env.COMPETITION_CONTROL_ENABLED = 'false';
  });
  afterAll(async () => {
    if (previous.url === undefined) delete process.env.RUNTIME_DATABASE_URL;
    else process.env.RUNTIME_DATABASE_URL = previous.url;
    if (previous.control === undefined) delete process.env.COMPETITION_CONTROL_ENABLED;
    else process.env.COMPETITION_CONTROL_ENABLED = previous.control;
    await database?.close();
  });
  it('loads the actual registry, retires obsolete rules immediately and retains unknown boards untouched', async () => {
    const at = Date.now();
    const duel = (await import(new URL('../rules/night.mjs', import.meta.url).href))
      .default as Rule;
    const rule = (await import(new URL('../rules/night-ranked.mjs', import.meta.url).href))
      .default as RankedRule;
    const competition = createCompetitionStore(database.db, new Map([[duel.id, duel]]), () => at);
    const owner = (await competition.guestSession({ game: rule.id })).playerId;
    const store = createRankedStore(
      database.db,
      new Map([[rule.id, rule]]),
      competition.identityDetails,
      () => at,
    );
    const run = await store.create(
      owner,
      rule.id,
      'level-corridor-01',
      'corridor-01',
      rule.version,
      randomUUID(),
    );
    const read = async (id: string) =>
      (
        await database.db.execute(
          sql`select data from runtime.competition_matches where id=${`ranked-run:${id}`}`,
        )
      )[0]?.data as RankedRun;
    const obsolete = { ...(await read(run.id)), version: 'night-input-replay-v8' };
    await database.db.execute(
      sql`update runtime.competition_matches set data=${JSON.stringify(obsolete)}::jsonb where id=${`ranked-run:${run.id}`}`,
    );
    const unknown = {
      ...obsolete,
      id: randomUUID(),
      board: 'deleted-board',
      boardKey: 'deleted-board',
      state: { keep: 'unknown' },
    };
    await database.db.execute(
      sql`insert into runtime.competition_matches values(${`ranked-run:${unknown.id}`},${unknown.boardKey},${JSON.stringify(unknown)}::jsonb,${at})`,
    );
    const contract = await retentionContract();
    expect(contract).toMatchObject({
      version: 1,
      maxAgeMs: 86400000,
      rules: { 'night-overwatch': rule.version },
    });
    const selected = [obsolete, unknown].map(({ id, game, playerId }) => ({ id, game, playerId }));
    const first = await retireRankedRuns(selected);
    expect(first).toEqual({ ready: [run.id], skipped: 1 });
    expect((await read(run.id)).status).toBe('finished');
    expect(await read(unknown.id)).toEqual(unknown);
    expect(await retireRankedRuns(selected)).toEqual(first);
    const wallet = (
      await database.db.execute(
        sql`select data from runtime.competition_matches where id=${`night-assets:${owner}`}`,
      )
    )[0]!.data as { reservations: Record<string, { status: string }> };
    expect(wallet.reservations[`run:${run.id}`]!.status).toBe('refunded');
  });
});
