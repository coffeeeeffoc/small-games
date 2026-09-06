import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  DraftEditor,
  DraftPreview,
  DraftError,
  createDraftClient,
  createDraftPreviewHost,
  type DraftClient,
  type Draft,
} from '@coffeeeeffoc/studio-web';
import { defaultCultivationEnvelope } from '@coffeeeeffoc/game-cultivation/content';

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
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
    queryClient.clear();
  });
  target.remove();
  vi.restoreAllMocks();
  localStorage.clear();
});
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
async function click(label: string) {
  await act(async () => {
    Array.from(target.querySelectorAll('button'))
      .find((button) => button.textContent === label)!
      .click();
  });
  await settle();
}
async function edit(value: string) {
  await act(async () => {
    const field = target.querySelector('textarea')!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      field,
      value,
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it('creates and edits drafts, displays field errors, previews unsaved text, and retains conflicting edits', async () => {
  let saved: Draft = {
    id: crypto.randomUUID(),
    name: '修仙内容草稿',
    revision: 0,
    envelope: structuredClone(defaultCultivationEnvelope),
  };
  const api: DraftClient = {
    list: async () => [saved],
    listTrash: async () => [],
    read: vi.fn(async () => saved),
    create: vi.fn(async () => saved),
    validate: vi.fn(async () => {
      throw new DraftError('内容校验失败。', [
        { path: ['payload', 'title'], message: '标题不能为空' },
      ]);
    }),
    save: vi.fn(async () => {
      throw new DraftError('保存冲突：你的编辑仍保留。');
    }),
    trash: vi.fn(async () => saved),
    restore: vi.fn(async () => saved),
  };
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <DraftEditor api={api} />
      </QueryClientProvider>,
    );
  });
  await settle();
  await click('新建草稿');
  const changed = structuredClone(defaultCultivationEnvelope);
  changed.payload.title = '只在预览中';
  const text = JSON.stringify(changed);
  await edit(text);
  await click('校验内容');
  expect(target.querySelector('[role=alert]')?.textContent).toContain('payload.title');
  await click('预览当前编辑');
  expect(target.querySelector('.cultivation h1')?.textContent).toBe('只在预览中');
  expect(api.save).not.toHaveBeenCalled();
  await click('保存草稿');
  expect(target.querySelector('[role=alert]')?.textContent).toContain('保存冲突');
  expect(target.querySelector('textarea')?.value).toBe(text);
  api.save = vi.fn(async (draft) => (saved = { ...draft, revision: 1 }));
  await click('保存草稿');
  expect(target.textContent).toContain('草稿已保存');
  expect(target.textContent).toContain('r1');
  await click('重新读取');
  expect(api.read).toHaveBeenCalledWith(saved.id);
});
it('runs the actual Game with disposable storage and no real player writes or ads', async () => {
  localStorage.setItem('bili-pocket-arcade:v1', 'player-save-sentinel');
  const original = structuredClone(defaultCultivationEnvelope);
  const first = createDraftPreviewHost(original);
  const second = createDraftPreviewHost(original);
  expect(first.session.adAuthority).toBe('none');
  expect(first.session.capabilities).toEqual(['content', 'storage']);
  expect(first.session.sessionId).not.toBe(second.session.sessionId);
  await first.storage.write('probe', { value: 1 }, null);
  expect(await second.storage.read('probe')).toBeNull();
  await act(async () => {
    root.render(<DraftPreview envelope={original} />);
  });
  await settle();
  expect(target.querySelector('.cultivation')).not.toBeNull();
  await act(async () => {
    target.querySelector<HTMLButtonElement>('.choices button')!.click();
  });
  await settle();
  expect(target.querySelector('.event h2')?.textContent).toBe(original.payload.events[1].title);
  expect(localStorage.getItem('bili-pocket-arcade:v1')).toBe('player-save-sentinel');
  expect(original).toEqual(defaultCultivationEnvelope);
});
it('preserves structured server errors and sends the original revision with cookies', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify({ error: 'CONFLICT' }), { status: 409 }));
  const client = createDraftClient(transport);
  const draft = {
    id: crypto.randomUUID(),
    name: 'test',
    revision: 4,
    envelope: defaultCultivationEnvelope,
  };
  await expect(client.save(draft)).rejects.toThrow('保存冲突');
  expect(transport.mock.calls[0][1]?.credentials).toBe('same-origin');
  expect(JSON.parse(String(transport.mock.calls[0][1]?.body)).revision).toBe(4);
});
