import { z } from 'zod';

const generationJobSchema = z.object({
  id: z.uuid(),
  input: z.string(),
  attempt: z.number().int().positive(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed']),
  model: z.string().optional(),
  error: z.string().optional(),
  disposition: z.enum(['pending', 'draft_created', 'validation_failed', 'failed']),
  draftId: z.uuid().optional(),
});
export type GenerationJob = z.infer<typeof generationJobSchema>;

/** Studio sees job state only; provider credentials remain behind Management Service. */
export function createGenerationClient(transport: typeof fetch = fetch) {
  async function request(path: string, method = 'GET', body?: unknown) {
    const response = await transport(`/api/generation-jobs${path}`, {
      method,
      credentials: 'same-origin',
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error('AI 生成任务暂不可用。');
    return response.json() as Promise<unknown>;
  }
  return {
    async list() {
      return z.array(generationJobSchema).parse(await request(''));
    },
    async create(input: string) {
      return generationJobSchema.parse(await request('', 'POST', { input }));
    },
    async retry(id: string) {
      return generationJobSchema.parse(await request(`/${encodeURIComponent(id)}/retry`, 'POST'));
    },
  };
}
export type GenerationClient = ReturnType<typeof createGenerationClient>;
