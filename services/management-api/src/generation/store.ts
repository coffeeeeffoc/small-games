import { sql } from 'drizzle-orm';
import type { openDatabase } from '@coffeeeeffoc/service-kit';
import { generationJobSchema, type GenerationJobStore } from './model.js';

const columns = sql`id, operator_id as "operatorId", game_id as "gameId", schema_version as "schemaVersion", input, input_hash as "inputHash", attempt, status, model, output_hash as "outputHash", validation_result as "validationResult", disposition, draft_id as "draftId", error`;

/** PostgreSQL is both queue and audit log; claiming uses row locks for multi-worker safety. */
export function createGenerationJobStore(
  db: ReturnType<typeof openDatabase>['db'],
): GenerationJobStore {
  return {
    async list() {
      return (
        await db.execute(
          sql`select ${columns} from management.generation_jobs order by created_at desc`,
        )
      ).map((row) => generationJobSchema.parse(row));
    },
    async get(id) {
      const rows = await db.execute(
        sql`select ${columns} from management.generation_jobs where id = ${id}`,
      );
      return rows[0] ? generationJobSchema.parse(rows[0]) : undefined;
    },
    async enqueue(job) {
      await db.execute(
        sql`insert into management.generation_jobs (id, operator_id, game_id, schema_version, input, input_hash, attempt, status, disposition) values (${job.id}, ${job.operatorId}, ${job.gameId}, ${job.schemaVersion}, ${job.input}, ${job.inputHash}, ${job.attempt}, ${job.status}, ${job.disposition})`,
      );
      return job;
    },
    async claim() {
      const rows = await db.execute(sql`with candidate as (
        select id from management.generation_jobs where status = 'queued' order by created_at for update skip locked limit 1
      ) update management.generation_jobs jobs set status = 'running', updated_at = now()
      from candidate where jobs.id = candidate.id returning ${columns}`);
      return rows[0] ? generationJobSchema.parse(rows[0]) : undefined;
    },
    async succeed(id, audit, draft) {
      const rows = await db.execute(sql`with saved as (
        insert into management.content_drafts (id, name, revision, envelope)
        values (${draft.id}, ${draft.name}, ${draft.revision}, ${JSON.stringify(draft.envelope)}::jsonb)
      ) update management.generation_jobs set status = 'succeeded', model = ${audit.model}, output_hash = ${audit.outputHash}, validation_result = ${JSON.stringify(audit.validationResult)}::jsonb, disposition = ${audit.disposition}, draft_id = ${draft.id}, updated_at = now() where id = ${id} returning ${columns}`);
      return generationJobSchema.parse(rows[0]);
    },
    async fail(id, audit) {
      const rows = await db.execute(
        sql`update management.generation_jobs set status = 'failed', model = ${audit.model ?? null}, output_hash = ${audit.outputHash ?? null}, validation_result = ${audit.validationResult === undefined ? null : JSON.stringify(audit.validationResult)}::jsonb, disposition = ${audit.disposition}, error = ${audit.error ?? null}, updated_at = now() where id = ${id} returning ${columns}`,
      );
      return generationJobSchema.parse(rows[0]);
    },
    async retry(id, replacement) {
      const rows =
        await db.execute(sql`insert into management.generation_jobs (id, operator_id, game_id, schema_version, input, input_hash, attempt, status, disposition)
        select ${replacement.id}, ${replacement.operatorId}, game_id, schema_version, input, input_hash, ${replacement.attempt}, 'queued', 'pending'
        from management.generation_jobs where id = ${id} and status = 'failed' returning ${columns}`);
      return rows[0] ? generationJobSchema.parse(rows[0]) : undefined;
    },
  };
}
