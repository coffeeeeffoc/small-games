import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql, type SQLWrapper } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

/** Owns one bounded PostgreSQL pool. Callers supply only their service credential. */
export function openDatabase(url: string, schema: 'management' | 'runtime') {
  const client = postgres(url, { max: 5, connect_timeout: 3, idle_timeout: 20 });
  const db = drizzle(client);
  return {
    db,
    async check() {
      // The identifier is a closed, caller-selected ownership boundary, never user input.
      const rows = await db.execute(
        sql`select version from ${sql.identifier(schema)}.schema_version where version = 1`,
      );
      if (rows.length !== 1) throw new Error('Database schema is not initialized');
    },
    close: () => client.end({ timeout: 3 }),
  };
}

/** One control connection and a finite, cancellable application queue within one absolute budget. */
export type ControlDatabaseExecutor = {
  execute(query: SQLWrapper | string): Promise<Record<string, unknown>[]>;
};
export function openControlDatabase(url: string, now = Date.now) {
  let client: ReturnType<typeof postgres> | undefined;
  let closed = false;
  let active: { start(): void; expire(): void } | undefined;
  const queue: { start(): void; expire(): void }[] = [];
  const discarded = new WeakMap<ReturnType<typeof postgres>, Promise<void>>();
  const dialect = new PgDialect();
  function discard(owned: ReturnType<typeof postgres>) {
    const previous = discarded.get(owned);
    if (previous) return previous;
    if (client === owned) client = undefined;
    // postgres-js end(timeout:0) terminates active requests and rejects its queue. Never wait on
    // graceful connection shutdown in a request's budget; this pool is separate from business SQL.
    const cleanup = owned.end({ timeout: 0 }).catch(() => {});
    discarded.set(owned, cleanup);
    return cleanup;
  }
  return {
    transaction<T>(
      work: (db: ControlDatabaseExecutor, remaining: () => number) => Promise<T>,
    ): Promise<T> {
      if (closed || (active && queue.length >= 5))
        return Promise.reject(new Error('CONTROL_UNAVAILABLE'));
      const deadline = now() + 2000;
      return new Promise<T>((resolve, reject) => {
        let expired = false,
          owned: ReturnType<typeof postgres> | undefined;
        const remaining = () => {
          const ms = Math.floor(deadline - now());
          if (expired || closed || ms <= 0) throw new Error('CONTROL_UNAVAILABLE');
          return ms;
        };
        const task = {
          expire() {
            clearTimeout(watchdog);
            expired = true;
            reject(new Error('CONTROL_UNAVAILABLE'));
            if (owned) void discard(owned).then(release);
            else {
              const index = queue.indexOf(task);
              if (index >= 0) queue.splice(index, 1);
            }
          },
          start() {
            active = task;
            void (async () => {
              try {
                remaining();
                owned = client ??= postgres(url, {
                  max: 1,
                  connect_timeout: 2,
                  idle_timeout: 20,
                  connection: {
                    statement_timeout: 2000,
                    idle_in_transaction_session_timeout: 2000,
                  },
                });
                // Driver BEGIN binds its callback to one physical connection and rejects onclose.
                // drizzle(pool) after raw BEGIN could silently reconnect in autocommit mode.
                const result = await owned.begin(async (transaction) => {
                  remaining();
                  const executor: ControlDatabaseExecutor = {
                    async execute(query) {
                      remaining();
                      const compiled = dialect.sqlToQuery(
                        typeof query === 'string' ? sql.raw(query) : query.getSQL(),
                      );
                      const params = compiled.params.map((value: unknown) => {
                        if (
                          value === null ||
                          ['string', 'number', 'boolean'].includes(typeof value)
                        )
                          return value as string | number | boolean | null;
                        throw new Error('CONTROL_UNAVAILABLE');
                      });
                      const rows = await transaction.unsafe(compiled.sql, params);
                      remaining();
                      return rows;
                    },
                  };
                  const value = await work(executor, remaining);
                  await transaction.unsafe(`set local statement_timeout = '${remaining()}ms'`);
                  remaining();
                  return value;
                });
                remaining();
                resolve(result as T);
              } catch (error) {
                expired = true;
                reject(error);
                if (owned) void discard(owned).then(release);
                else release();
              } finally {
                clearTimeout(watchdog);
                if (!expired) {
                  expired = true;
                  release();
                }
              }
            })();
          },
        };
        function release() {
          if (active !== task) return;
          active = undefined;
          if (!closed) queue.shift()?.start();
        }
        const watchdog = setTimeout(task.expire, Math.max(0, deadline - now()));
        if (active) queue.push(task);
        else task.start();
      });
    },
    close() {
      closed = true;
      for (const task of [...queue]) task.expire();
      active?.expire();
      if (client) void discard(client);
    },
  };
}
