import { loadNightRelease, retainedRule } from './night-release.js';
import type { Rule } from './types.js';
/** Trusted in-container maintenance. Importing this module starts no HTTP server or timer. */
import { openDatabase, openControlDatabase } from '@coffeeeeffoc/service-kit';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { createRankedStore } from './ranked-store.js';
import type { RankedRule, RankedRun } from './ranked-types.js';
import { createCompetitionControl } from './control.js';
import type { CompetitionControl } from './control.js';
import { readCompetitionCors } from '../config.js';

const batch = z
  .array(
    z
      .object({
        id: z.uuid(),
        playerId: z.uuid(),
        game: z.enum(['cage-rescue', 'tower-brake', 'night-overwatch', 'tetracube']),
      })
      .strict(),
  )
  .max(100);

async function rules() {
  const module = (await import(new URL('../../rules/ranked-games.mjs', import.meta.url).href)) as {
    rankedRules: RankedRule[];
  };
  if (new Set(module.rankedRules.map((rule) => rule.id)).size !== module.rankedRules.length)
    throw Error('RETENTION_RULES');
  return new Map(module.rankedRules.map((rule) => [rule.id, rule]));
}

export async function retentionContract() {
  return {
    version: 1,
    maxAgeMs: 86400000,
    rules: Object.fromEntries([...(await rules())].map(([id, rule]) => [id, rule.version])),
  };
}

export async function retireRankedRuns(input: unknown) {
  const selected = batch.parse(input),
    registry = await rules();
  const duel = (await import(new URL('../../rules/night.mjs', import.meta.url).href)) as {
    default: Rule;
  };
  const release = await loadNightRelease(
    registry.get('night-overwatch')!,
    duel.default,
    process.env,
  );
  const url = z.url().parse(process.env.RUNTIME_DATABASE_URL);
  const database = openDatabase(url, 'runtime');
  let control: CompetitionControl | undefined;
  try {
    if (process.env.COMPETITION_CONTROL_ENABLED === 'true')
      control = createCompetitionControl(
        openControlDatabase(url),
        readCompetitionCors(process.env),
        Date.now,
        process.env.COMPETITION_CONTROL_INSTANCE_ID,
      );
    // Retiring expired input does not admit play or publish control observations.
    const store = createRankedStore(
      database.db,
      registry,
      async () => ({ authenticated: false }),
      Date.now,
      control,
      release,
    );
    const ready: string[] = [];
    for (const item of selected) {
      const row = (
        await database.db.execute(
          sql`select data from runtime.competition_matches where id=${`ranked-run:${item.id}`}`,
        )
      )[0]?.data as RankedRun | undefined;
      const rule = row ? retainedRule(registry, item.game, row.version, release.ranked) : undefined;
      // Unknown historical boards are retained before invoking any asset invalidation.
      if (
        !row ||
        !rule ||
        row.game !== item.game ||
        row.playerId !== item.playerId ||
        !rule.boards.some((board) => board.id === row.board) ||
        !new Set([
          rule.boardKey?.(row.board),
          `${row.game}:${row.board}:${rule.boardVersion ?? row.version}`,
          `${row.game}:${row.board}:${row.version}`,
        ]).has(row.boardKey)
      )
        continue;
      try {
        const result = await store.retireExpired(item.playerId, item.game, item.id);
        if (
          result.status === 'finished' &&
          (result.expiresAt <= Date.now() ||
            (item.game !== 'night-overwatch' &&
              result.version !== registry.get(item.game)?.version))
        )
          ready.push(item.id);
      } catch (error) {
        if (['RUN_NOT_FOUND', 'WRONG_GAME'].includes((error as { code?: string }).code ?? ''))
          continue;
        // Existing server invalidation may commit its refund before returning this error.
        // Confirm that exact run is terminal; never swallow unrelated maintenance failures.
        if (
          !['RULE_VERSION_CHANGED', 'GAME_DISABLED', 'GAME_CANCELLED'].includes(
            (error as { code?: string }).code ?? '',
          )
        )
          throw error;
        try {
          const confirmed = await store.retireExpired(item.playerId, item.game, item.id);
          if (confirmed.status !== 'finished') throw Error('RETENTION_NOT_RETIRED');
          if (
            confirmed.expiresAt <= Date.now() ||
            (item.game !== 'night-overwatch' &&
              confirmed.version !== registry.get(item.game)?.version)
          )
            ready.push(item.id);
        } catch (confirmation) {
          if ((confirmation as { code?: string }).code !== 'WRONG_GAME') throw confirmation;
        }
      }
    }
    return { ready, skipped: selected.length - ready.length };
  } finally {
    await control?.close();
    await database.close();
  }
}
