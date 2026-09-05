import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';

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
