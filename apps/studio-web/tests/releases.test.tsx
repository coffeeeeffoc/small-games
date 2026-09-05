import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { ReleasePanel, createReleaseClient } from '@coffeeeeffoc/studio-web';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it('requires impact confirmation, cancels without writes, and retains event identity on retry', async () => {
  let pending = false;
  const versionId = 'b'.repeat(64);
  const artifactId = 'a'.repeat(64);
  const versions = [
    {
      id: versionId,
      createdAt: 1,
      snapshot: {
        id: versionId,
        gameId: 'cultivation',
        content: { gameId: 'cultivation', schemaVersion: 2, revision: 1, payload: {} },
        artifact: {
          id: artifactId,
          signature: 'c'.repeat(128),
          manifest: {
            formatVersion: 1,
            signingKeyId: 'd'.repeat(64),
            remoteEntry: 'remote-entry.js',
            game: {
              gameId: 'cultivation',
              version: '1.1.0',
              gameContractVersion: 1,
              contentSchemaVersion: 2,
              capabilities: ['content'],
              loadModes: ['iframe'],
              entry: 'index.html',
              integrity: 'builtin:cultivation@1.1.0',
            },
            resources: ['index.html', 'remote-entry.js'].map((path) => ({
              path,
              size: 1,
              sha256: artifactId,
            })),
          },
        },
      },
    },
  ];
  const transport = vi.fn<typeof fetch>(
    async (url) =>
      new Response(
        JSON.stringify(
          String(url).endsWith('/drafts')
            ? [{ id: crypto.randomUUID(), name: '修仙草稿', revision: 3, envelope: {} }]
            : {
                channels: [],
                versions,
                events: pending
                  ? [
                      {
                        eventId: crypto.randomUUID(),
                        channel: 'stable',
                        revision: 1,
                        attempts: 1,
                        lastError: 'offline',
                        delivered: false,
                      },
                    ]
                  : [],
              },
        ),
      ),
  );
  const api = createReleaseClient(transport);
  const submit = vi.spyOn(api, 'submit').mockRejectedValue(new Error('offline'));
  const target = document.createElement('div');
  document.body.append(target);
  const root = createRoot(target);
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  const click = async (label: string) => {
    await act(async () => {
      Array.from(target.querySelectorAll('button'))
        .find((button) => button.textContent === label)!
        .click();
    });
    await settle();
  };
  const select = async (index: number, value: string) => {
    await act(async () => {
      const node = target.querySelectorAll('select')[index];
      node.value = value;
      node.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  try {
    await act(async () => {
      root.render(
        <QueryClientProvider client={query}>
          <ReleasePanel api={api} />
        </QueryClientProvider>,
      );
    });
    await settle();
    await select(0, 'stable');
    await select(1, target.querySelectorAll('select')[1].options[1].value);
    await act(async () => {
      const input = target.querySelector('input')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'a'.repeat(64),
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('检查发布影响');
    expect(target.textContent).toContain('影响使用 stable 渠道的新会话');
    expect(target.textContent).toContain('r3');
    await click('取消');
    expect(submit).not.toHaveBeenCalled();
    await click('检查发布影响');
    await click('确认变更');
    expect(target.querySelector('[role=alert]')?.textContent).toBe('offline');
    await click('确认变更');
    expect(submit.mock.calls[0][0]).toEqual(submit.mock.calls[1][0]);
    expect(submit.mock.calls[0][0].channel).toBe('stable');
    await click('取消');
    await select(2, versionId);
    await click('检查回滚影响');
    expect(target.textContent).toContain('确认回滚至 stable');
    expect(target.textContent).toContain('目标固定版本');
    await click('确认变更');
    expect(submit.mock.calls[2][0]).toMatchObject({
      versionId,
      channel: 'stable',
      confirmation: true,
    });
    await click('取消');
    pending = true;
    await click('刷新发布状态');
    expect(target.textContent).toContain('该渠道有待确认投影');
    expect(target.querySelectorAll('select')[0].matches(':disabled')).toBe(false);
    await select(0, 'canary');
    expect(target.textContent).not.toContain('该渠道有待确认投影');
  } finally {
    await act(async () => {
      root.unmount();
      query.clear();
    });
    target.remove();
  }
});
