import { z } from 'zod';
import type { ContentDraft } from '../drafts/model.js';
import type { ContentValidationResult } from '@coffeeeeffoc/content-schema';
import type { GameManifest } from '@coffeeeeffoc/game-contract';

export const generationJobSchema = z.object({
  id: z.uuid(),
  operatorId: z.uuid(),
  gameId: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  input: z.string().min(1).max(4000),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  attempt: z.number().int().positive(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed']),
  model: z.string().optional(),
  outputHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  validationResult: z.unknown().optional(),
  disposition: z.enum(['pending', 'draft_created', 'validation_failed', 'failed']),
  draftId: z.uuid().optional(),
  error: z.string().optional(),
});
export type GenerationJob = z.infer<typeof generationJobSchema>;
export type GenerationAudit = Pick<
  GenerationJob,
  'model' | 'outputHash' | 'validationResult' | 'disposition' | 'error'
>;
export interface GenerationJobStore {
  list(): Promise<GenerationJob[]>;
  get(id: string): Promise<GenerationJob | undefined>;
  enqueue(job: GenerationJob): Promise<GenerationJob>;
  claim(): Promise<GenerationJob | undefined>;
  succeed(id: string, audit: GenerationAudit, draft: ContentDraft): Promise<GenerationJob>;
  fail(id: string, audit: GenerationAudit): Promise<GenerationJob>;
  retry(
    id: string,
    replacement: Omit<GenerationJob, 'gameId' | 'schemaVersion' | 'input' | 'inputHash'>,
  ): Promise<GenerationJob | undefined>;
}

export interface AiProvider {
  readonly model: string;
  generate(request: {
    gameId: string;
    schemaVersion: number;
    input: string;
  }): Promise<{ output: unknown }>;
}

export type GenerationTarget = {
  manifest: Pick<GameManifest, 'gameId' | 'contentSchemaVersion'>;
  validate(input: unknown): ContentValidationResult<unknown>;
};
