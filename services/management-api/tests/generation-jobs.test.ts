import { createHash, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createService } from '@coffeeeeffoc/service-kit';
import {
  defaultCultivationEnvelope,
  normalizeCultivationContent,
} from '@coffeeeeffoc/game-cultivation/content';
import cultivationManifestJson from '@coffeeeeffoc/game-cultivation/manifest' with { type: 'json' };
import { gameManifestSchema } from '@coffeeeeffoc/game-contract';
import {
  initializeOperator,
  registerAuthentication,
  registerGenerationJobs,
  runNextGenerationJob,
  type AiProvider,
  type ContentDraft,
  type GenerationJob,
  type GenerationJobStore,
} from '@coffeeeeffoc/management-api';
import { memoryAuthStore } from './auth.fixture.js';

const origin = 'http://127.0.0.1:5174';
const target = {
  manifest: gameManifestSchema.parse(cultivationManifestJson),
  validate: normalizeCultivationContent,
};
let app: ReturnType<typeof createService>;
let headers: { origin: string; cookie: string };
let jobs: Map<string, GenerationJob>;
let drafts: Map<string, ContentDraft>;
let store: GenerationJobStore;

beforeEach(async () => {
  const auth = memoryAuthStore();
  await initializeOperator(auth, 'creator', 'generation-password');
  jobs = new Map();
  drafts = new Map();
  store = {
    list: async () => [...jobs.values()],
    get: async (id) => jobs.get(id),
    enqueue: async (job) => (jobs.set(job.id, job), job),
    claim: async () => {
      const job = [...jobs.values()].find((value) => value.status === 'queued');
      if (!job) return undefined;
      const running = { ...job, status: 'running' as const };
      jobs.set(job.id, running);
      return running;
    },
    succeed: async (id, audit, draft) => {
      drafts.set(draft.id, draft);
      const completed = {
        ...jobs.get(id)!,
        ...audit,
        status: 'succeeded' as const,
        draftId: draft.id,
      };
      jobs.set(id, completed);
      return completed;
    },
    fail: async (id, audit) => {
      const failed = { ...jobs.get(id)!, ...audit, status: 'failed' as const };
      jobs.set(id, failed);
      return failed;
    },
    retry: async (id, replacement) => {
      const previous = jobs.get(id)!;
      const retried = {
        ...replacement,
        gameId: previous.gameId,
        schemaVersion: previous.schemaVersion,
        input: previous.input,
        inputHash: previous.inputHash,
      };
      jobs.set(retried.id, retried);
      return retried;
    },
  };
  app = createService('management', {}, false);
  await registerAuthentication(app, auth, origin);
  await registerGenerationJobs(app, auth, store, origin, target);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin },
    payload: { username: 'creator', password: 'generation-password' },
  });
  headers = {
    origin,
    cookie: login.cookies.map((value) => `${value.name}=${value.value}`).join('; '),
  };
});
afterEach(async () => app.close());

it('queues, lists, and retries persisted attempts without exposing provider credentials', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/api/generation-jobs',
    headers,
    payload: { input: '生成三个修仙事件' },
  });
  expect(created.statusCode).toBe(202);
  const first = created.json<GenerationJob>();
  expect(first).toMatchObject({ status: 'queued', attempt: 1, input: '生成三个修仙事件' });
  expect(first.inputHash).toBe(createHash('sha256').update(first.input).digest('hex'));
  expect(JSON.stringify(first)).not.toContain('API_KEY');
  await store.fail(first.id, { model: 'test-model', error: 'temporary', disposition: 'failed' });
  const retry = await app.inject({
    method: 'POST',
    url: `/api/generation-jobs/${first.id}/retry`,
    headers,
  });
  expect(retry.statusCode).toBe(202);
  expect(retry.json()).toMatchObject({ status: 'queued', attempt: 2, inputHash: first.inputHash });
  expect((await app.inject({ url: '/api/generation-jobs', headers })).json()).toHaveLength(2);
});

it('validates provider output before atomically creating a previewable draft', async () => {
  const valid = structuredClone(defaultCultivationEnvelope);
  const provider: AiProvider = {
    model: 'fake-1',
    generate: vi.fn(async () => ({ output: valid })),
  };
  const job: GenerationJob = {
    id: randomUUID(),
    operatorId: randomUUID(),
    gameId: 'cultivation',
    schemaVersion: 2,
    input: '有效内容',
    inputHash: createHash('sha256').update('有效内容').digest('hex'),
    attempt: 1,
    status: 'queued',
    disposition: 'pending',
  };
  await store.enqueue(job);
  expect(await runNextGenerationJob(store, provider, target)).toBe(true);
  const completed = jobs.get(job.id)!;
  expect(completed).toMatchObject({
    status: 'succeeded',
    model: 'fake-1',
    validationResult: { success: true },
    disposition: 'draft_created',
  });
  expect(completed.outputHash).toHaveLength(64);
  expect(drafts.get(completed.draftId!)?.envelope).toEqual({ ...valid, revision: 0 });
  expect(JSON.stringify(completed)).not.toContain('published');
});

it('records invalid output and creates no draft', async () => {
  const provider: AiProvider = {
    model: 'fake-2',
    generate: async () => ({ output: { bad: true } }),
  };
  const job: GenerationJob = {
    id: randomUUID(),
    operatorId: randomUUID(),
    gameId: 'cultivation',
    schemaVersion: 2,
    input: '坏内容',
    inputHash: createHash('sha256').update('坏内容').digest('hex'),
    attempt: 1,
    status: 'queued',
    disposition: 'pending',
  };
  await store.enqueue(job);
  await runNextGenerationJob(store, provider, target);
  expect(jobs.get(job.id)).toMatchObject({
    status: 'failed',
    model: 'fake-2',
    disposition: 'validation_failed',
    validationResult: { success: false },
  });
  expect(drafts.size).toBe(0);
});
