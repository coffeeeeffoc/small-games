import { PgDialect } from 'drizzle-orm/pg-core';
import type { createCompetitionStore } from '../src/competition/store.js';
import type { CompetitionControl } from '../src/competition/control.js';
import type { GameControlPolicy, NightOperations } from '@coffeeeeffoc/service-kit';

export type TestDatabase = Parameters<typeof createCompetitionStore>[0];
export function controlDatabase(
  execute: (
    text: string,
    params: unknown[],
  ) => Record<string, unknown>[] | Promise<Record<string, unknown>[]>,
) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const db = {
    async execute(query: unknown) {
      const compiled = new PgDialect().sqlToQuery(query as never);
      queries.push(compiled);
      return execute(compiled.sql, compiled.params);
    },
    async transaction<T>(work: (tx: unknown) => Promise<T>) {
      return work(db);
    },
  };
  return { db: db as unknown as TestDatabase, queries };
}
export function gateFixture() {
  const events: string[] = [];
  let operations: NightOperations | undefined;
  let state: GameControlPolicy['state'] = 'enabled',
    epoch = 0;
  const control = {
    async lock(_tx: unknown, gameId: GameControlPolicy['gameId']) {
      events.push('control');
      return {
        gameId,
        state,
        killEpoch: epoch,
        revision: 1,
        ...(gameId === 'night-overwatch' && operations
          ? { nightOperations: structuredClone(operations) }
          : {}),
      };
    },
  } as unknown as CompetitionControl;
  return {
    control,
    events,
    operations(next?: NightOperations) {
      operations = next;
    },
    set(next: typeof state, nextEpoch = epoch) {
      state = next;
      epoch = nextEpoch;
    },
  };
}
