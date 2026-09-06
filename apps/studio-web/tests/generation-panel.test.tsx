import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { defaultCultivationEnvelope } from '@coffeeeeffoc/game-cultivation/content';
import {
  GenerationPanel,
  createGenerationClient,
  type DraftClient,
  type GenerationClient,
  type GenerationJob,
} from '@coffeeeeffoc/studio-web';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let target: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
beforeEach(() => {
  target = document.createElement('div');
  document.body.append(target);
  root = createRoot(target);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  act(() => root.unmount());
  target.remove();
  vi.restoreAllMocks();
});
const failed: GenerationJob = {
  id: crypto.randomUUID(), input: '失败输入', attempt: 1, status: 'failed',
  model: 'fake-1', error: 'AI generation failed', disposition: 'failed',
};

it('uses same-origin transport and never sends a provider credential', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ ...failed, status: 'queued', disposition: 'pending' })),
  );
  await createGenerationClient(transport).create('新事件');
  expect(transport.mock.calls[0][0]).toBe('/api/generation-jobs');
  expect(transport.mock.calls[0][1]?.credentials).toBe('same-origin');
  expect(JSON.stringify(transport.mock.calls[0])).not.toMatch(/key|secret|token/i);
});

it('shows input, progress, error, retry attempt, result, and draft preview', async () => {
  const succeeded: GenerationJob = {
    ...failed, id: crypto.randomUUID(), input: '成功输入', attempt: 2,
    status: 'succeeded', disposition: 'draft_created', draftId: crypto.randomUUID(),
  };
  const api: GenerationClient = {
    list: vi.fn(async () => [failed, succeeded]),
    create: vi.fn(async (): Promise<GenerationJob> => ({ ...failed, status: 'queued', disposition: 'pending' })),
    retry: vi.fn(async (): Promise<GenerationJob> => ({ ...failed, id: crypto.randomUUID(), attempt: 2, status: 'queued', disposition: 'pending' })),
  };
  const drafts = {
    read: vi.fn(async () => ({ id: succeeded.draftId!, name: 'AI', revision: 0, envelope: defaultCultivationEnvelope })),
  } as unknown as DraftClient;
  await act(async () =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <GenerationPanel api={api} drafts={drafts} />
      </QueryClientProvider>,
    ),
  );
  await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  expect(target.textContent).toContain('失败输入');
  expect(target.textContent).toContain('第 1 次');
  expect(target.textContent).toContain('AI generation failed');
  expect(target.textContent).toContain('成功输入');
  expect(target.textContent).toContain('第 2 次');
  const retry = Array.from(target.querySelectorAll('button')).find((button) => button.textContent === '重试')!;
  await act(async () => retry.click());
  expect(api.retry).toHaveBeenCalledWith(failed.id);
  const preview = Array.from(target.querySelectorAll('button')).find((button) => button.textContent === '预览草稿')!;
  await act(async () => preview.click());
  await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  expect(target.querySelector('.cultivation')).not.toBeNull();
});
