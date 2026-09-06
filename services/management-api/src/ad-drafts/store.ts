import { sql } from 'drizzle-orm';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { adDraftSchema, type AdDraftStore } from './model.js';

/** A single conditional UPDATE is the concurrency boundary, never a read-then-write check. */
export function createAdDraftStore(db: ReturnType<typeof openDatabase>['db']): AdDraftStore {
  return {
    async list() {
      return (
        await db.execute(
          sql`select id, name, revision, envelope from management.ad_drafts order by id`,
        )
      ).map((row) => adDraftSchema.parse(row));
    },
    async get(id) {
      const rows = await db.execute(
        sql`select id, name, revision, envelope from management.ad_drafts where id = ${id}`,
      );
      return rows[0] ? adDraftSchema.parse(rows[0]) : undefined;
    },
    async create(draft) {
      await db.execute(
        sql`insert into management.ad_drafts (id, name, revision, envelope) values (${draft.id}, ${draft.name}, ${draft.revision}, ${JSON.stringify(draft.envelope)}::jsonb)`,
      );
      return draft;
    },
    async save(draft) {
      const rows = await db.execute(
        sql`update management.ad_drafts set name = ${draft.name}, revision = revision + 1, envelope = ${JSON.stringify(draft.envelope)}::jsonb where id = ${draft.id} and revision = ${draft.revision} returning id, name, revision, envelope`,
      );
      return rows[0] ? adDraftSchema.parse(rows[0]) : undefined;
    },
  };
}
