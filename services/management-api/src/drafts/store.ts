import { sql } from 'drizzle-orm';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { draftSchema, type DraftStore } from './model.js';

/** A single conditional UPDATE is the concurrency boundary, never a read-then-write check. */
export function createDraftStore(db: ReturnType<typeof openDatabase>['db']): DraftStore {
  return {
    async list() {
      return (
        await db.execute(
          sql`select id, name, revision, envelope from management.content_drafts order by id`,
        )
      ).map((row) => draftSchema.parse(row));
    },
    async get(id) {
      const rows = await db.execute(
        sql`select id, name, revision, envelope from management.content_drafts where id = ${id}`,
      );
      return rows[0] ? draftSchema.parse(rows[0]) : undefined;
    },
    async create(draft) {
      await db.execute(
        sql`insert into management.content_drafts (id, name, revision, envelope) values (${draft.id}, ${draft.name}, ${draft.revision}, ${JSON.stringify(draft.envelope)}::jsonb)`,
      );
      return draft;
    },
    async save(draft) {
      const rows = await db.execute(
        sql`update management.content_drafts set name = ${draft.name}, revision = revision + 1, envelope = ${JSON.stringify(draft.envelope)}::jsonb where id = ${draft.id} and revision = ${draft.revision} returning id, name, revision, envelope`,
      );
      return rows[0] ? draftSchema.parse(rows[0]) : undefined;
    },
  };
}
