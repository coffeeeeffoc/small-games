import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  AdDraftError,
  AdEditor,
  AdPreview,
  createAdDraftClient,
  type AdDraft,
  type AdDraftClient,
} from '@coffeeeeffoc/studio-web';
import {
  defaultManagedAdConfig,
  normalizeManagedAdConfig,
  type ManagedAdConfig,
} from '@coffeeeeffoc/ad-config';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const base = {
  formatVersion: 1,
  gameId: 'cultivation',
  enabled: true,
  policy: { maxPerSession: 3 },
  creatives: [
    { id: 'spring', title: '春日礼包', body: '限时开放', ctaLabel: '查看', durationMs: 5000 },
  ],
  placements: [
    {
      opportunityId: 'cultivation.reincarnate',
      creativeId: 'spring',
      policy: { cooldownMs: 1500 },
      reward: { enabled: true, maxPerSession: 1 },
    },
  ],
};
let target: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
/** Operator fixture: an enabled plan with one creative and one placement-level cooldown. */
function planned(overrides: Record<string, unknown> = {}): ManagedAdConfig {
  const result = normalizeManagedAdConfig({ ...base, ...overrides });
  if (!result.success) throw new Error('fixture must validate');
  return result.data;
}
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

it('validates, previews, and saves Managed Ad drafts without publishing them', async () => {
  const config = planned();
  let saved: AdDraft = {
    id: crypto.randomUUID(),
    name: 'Managed Ad 草稿',
    revision: 0,
    envelope: defaultManagedAdConfig('cultivation'),
  };
  const api: AdDraftClient = {
    list: async () => [saved],
    read: vi.fn(async () => saved),
    create: vi.fn(async () => saved),
    validate: vi.fn(async () => {
      throw new AdDraftError('Managed Ad 配置校验失败。', [
        { path: ['placements', 0, 'creativeId'], message: '素材不存在' },
      ]);
    }),
    save: vi.fn(async () => {
      throw new AdDraftError('保存冲突：你的编辑仍保留。');
    }),
  };
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <AdEditor api={api} />
      </QueryClientProvider>,
    );
  });
  await settle();
  await click('新建草稿');
  expect(target.querySelector('textarea')?.value).toContain('"enabled": false');
  const dangling = JSON.stringify({
    ...base,
    placements: [{ ...base.placements[0], creativeId: 'missing' }],
  });
  await edit(dangling);
  await click('校验配置');
  expect(target.querySelector('[role=alert]')?.textContent).toContain('placements.0.creativeId');
  const text = JSON.stringify(config);
  await edit(text);
  await click('预览当前编辑');
  const preview = target.querySelector('.ad-preview')!;
  expect(preview.textContent).toContain('春日礼包 · 限时开放 · 查看 · 完整观看 5 秒');
  // Shell frequency caps the placement rule while the placement keeps its own cooldown.
  expect(preview.textContent).toContain(
    'cultivation.reincarnate → spring · 奖励开启 · 每会话 1 次 · 频控 3 次 / 冷却 1500ms',
  );
  expect(api.save).not.toHaveBeenCalled();
  await click('保存草稿');
  expect(target.querySelector('[role=alert]')?.textContent).toContain('保存冲突');
  expect(target.querySelector('textarea')?.value).toBe(text);
  api.save = vi.fn(async (draft) => (saved = { ...draft, revision: 1, envelope: config }));
  await click('保存草稿');
  expect(target.textContent).toContain('草稿已保存');
  expect(target.textContent).toContain('r1');
  await click('重新读取');
  expect(api.read).toHaveBeenCalledWith(saved.id);
});

it('previews an unpublished plan as inert and explains why nothing would be served', async () => {
  const disabled = defaultManagedAdConfig('cultivation');
  await act(async () => {
    root.render(<AdPreview config={disabled} />);
  });
  await settle();
  expect(target.querySelector('.ad-preview')?.textContent).toContain('未启用');
  expect(target.querySelector('.ad-preview')?.textContent).toContain('尚未配置投放');
  await act(async () => {
    root.render(<AdPreview config={planned({ placements: [] })} />);
  });
  await settle();
  expect(target.querySelector('.ad-preview')?.textContent).toContain('已启用');
  expect(target.querySelector('.ad-preview')?.textContent).toContain('尚未配置投放');
});

it('sends the last-read revision with same-origin cookies and maps server failures', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'CONFLICT' }), { status: 409 }))
    .mockResolvedValueOnce(
      Response.json(
        { issues: [{ path: ['creatives', 0, 'durationMs'], message: '太短' }] },
        { status: 422 },
      ),
    );
  const client = createAdDraftClient(transport);
  const draft: AdDraft = {
    id: crypto.randomUUID(),
    name: 'Managed Ad 草稿',
    revision: 4,
    envelope: planned(),
  };
  await expect(client.save(draft)).rejects.toThrow('保存冲突');
  expect(transport.mock.calls[0][1]?.credentials).toBe('same-origin');
  expect(JSON.parse(String(transport.mock.calls[0][1]?.body)).revision).toBe(4);
  await expect(client.validate(planned())).rejects.toMatchObject({
    message: 'Managed Ad 配置校验失败。',
    issues: [{ path: ['creatives', 0, 'durationMs'], message: '太短' }],
  });
  expect(transport.mock.calls[1][0]).toBe('/api/ad-drafts/validate');
});
