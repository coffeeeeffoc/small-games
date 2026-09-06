import { createHash, randomUUID } from 'node:crypto';
import type { AiProvider, GenerationJobStore, GenerationTarget } from './model.js';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Runs one durable job; valid output becomes a draft, never a publication. */
export async function runNextGenerationJob(
  store: GenerationJobStore,
  provider: AiProvider,
  target: GenerationTarget,
) {
  const job = await store.claim();
  if (!job) return false;
  try {
    const generated = await provider.generate({
      gameId: job.gameId,
      schemaVersion: job.schemaVersion,
      input: job.input,
    });
    const outputHash = hash(generated.output);
    const validationResult = target.validate(generated.output);
    if (!validationResult.success) {
      await store.fail(job.id, {
        model: provider.model,
        outputHash,
        validationResult,
        disposition: 'validation_failed',
        error: 'Generated content failed Game schema validation',
      });
      return true;
    }
    await store.succeed(
      job.id,
      {
        model: provider.model,
        outputHash,
        validationResult: { success: true },
        disposition: 'draft_created',
      },
      {
        id: randomUUID(),
        name: `AI · ${job.input.slice(0, 80)}`,
        revision: 0,
        envelope: { ...validationResult.data, revision: 0 },
      },
    );
  } catch {
    await store.fail(job.id, {
      model: provider.model,
      disposition: 'failed',
      error: 'AI generation failed',
    });
  }
  return true;
}

export function startGenerationWorker(
  store: GenerationJobStore,
  provider: AiProvider,
  target: GenerationTarget,
) {
  let working = false;
  const timer = setInterval(() => {
    if (working) return;
    working = true;
    void runNextGenerationJob(store, provider, target).finally(() => (working = false));
  }, 1_000);
  timer.unref();
  return () => clearInterval(timer);
}
