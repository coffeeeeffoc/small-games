import { sql } from 'drizzle-orm';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { draftSchema, type DraftStore } from './model.js';

/** A single conditional UPDATE is the concurrency boundary, never a read-then-write check. */
export function createDraftStore(db: ReturnType<typeof openDatabase>['db']): DraftStore {
  const columns = sql`id, name, revision, envelope, trashed_at as "trashedAt", purge_after as "purgeAfter"`;
  return {
    async list() {
      return (
        await db.execute(
          sql`select ${columns} from management.content_drafts where trashed_at is null order by id`,
        )
      ).map((row) => draftSchema.parse(row));
    },
    async listTrash() {
      return (
        await db.execute(
          sql`select ${columns} from management.content_drafts where purge_after > ${Date.now()} order by trashed_at desc`,
        )
      ).map((row) => draftSchema.parse(row));
    },
    async get(id) {
      const rows = await db.execute(
        sql`select ${columns} from management.content_drafts where id = ${id} and trashed_at is null`,
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
        sql`update management.content_drafts set name = ${draft.name}, revision = revision + 1, envelope = ${JSON.stringify(draft.envelope)}::jsonb where id = ${draft.id} and revision = ${draft.revision} and trashed_at is null returning ${columns}`,
      );
      return rows[0] ? draftSchema.parse(rows[0]) : undefined;
    },
    async trash(id, actorId, now) {
      return db.transaction(async (tx) => {
        const rows = await tx.execute(
          sql`update management.content_drafts set trashed_at = ${now}, purge_after = ${now + 30 * 24 * 60 * 60 * 1000} where id = ${id} and trashed_at is null returning ${columns}`,
        );
        await tx.execute(
          sql`insert into management.audit_log (id, actor_id, action, details, created_at) values (gen_random_uuid(), ${actorId}, ${rows[0] ? 'draft.trash' : 'draft.trash-rejected'}, ${JSON.stringify({ draftId: id })}::jsonb, ${now})`,
        );
        return rows[0] ? draftSchema.parse(rows[0]) : undefined;
      });
    },
    async restore(id, actorId) {
      return db.transaction(async (tx) => {
        const now = Date.now();
        const rows = await tx.execute(
          sql`update management.content_drafts set trashed_at = null, purge_after = null where id = ${id} and purge_after > ${now} returning ${columns}`,
        );
        await tx.execute(
          sql`insert into management.audit_log (id, actor_id, action, details, created_at) values (gen_random_uuid(), ${actorId}, ${rows[0] ? 'draft.restore' : 'draft.restore-rejected'}, ${JSON.stringify({ draftId: id })}::jsonb, ${now})`,
        );
        return rows[0] ? draftSchema.parse(rows[0]) : undefined;
      });
    },
  };
}
