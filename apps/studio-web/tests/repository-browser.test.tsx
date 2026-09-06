import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  RepositoryBrowser,
  createWorkspaceAgentClient,
  type RepositoryTree,
  type WorkspaceAgentClient,
} from '@coffeeeeffoc/studio-web';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let target: HTMLDivElement;
let root: Root;
beforeEach(() => {
  target = document.createElement('div');
  document.body.append(target);
  root = createRoot(target);
});
afterEach(() => {
  act(() => root.unmount());
  target.remove();
  vi.restoreAllMocks();
});

async function settle() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
}

it('pairs in memory and sends the short-lived bearer token', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'session-token' })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ games: [] })));
  const client = createWorkspaceAgentClient('http://127.0.0.1:4319', transport);
  await client.pair('123456');
  await client.tree();
  expect(transport.mock.calls[1][1]?.headers).toEqual({ Authorization: 'Bearer session-token' });
});

it('shows game-organized files safely and retains read-only source when disconnected', async () => {
  const api: WorkspaceAgentClient = {
    pair: vi.fn(async () => undefined),
    tree: vi.fn(async (): Promise<RepositoryTree> => ({
      games: [
        {
          id: 'game-cultivation',
          files: [
            {
              name: 'src',
              path: 'src',
              type: 'directory',
              children: [{ name: 'evil&name.ts', path: 'src/evil&name.ts', type: 'file' }],
            },
          ],
        },
      ],
    })),
    read: vi
      .fn()
      .mockResolvedValueOnce({ source: 'export const safe = true;' })
      .mockRejectedValueOnce(new Error('offline')),
  };
  await act(async () => root.render(<RepositoryBrowser api={api} />));
  const input = target.querySelector<HTMLInputElement>('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      '123456',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    target.querySelector<HTMLButtonElement>('button')!.click();
  });
  await settle();
  expect(target.textContent).toContain('game-cultivation');
  expect(target.querySelector('img')).toBeNull();
  const file = Array.from(target.querySelectorAll('button')).find((button) =>
    button.textContent?.includes('evil&name.ts'),
  )!;
  await act(async () => file.click());
  await settle();
  expect(target.querySelector('pre')?.textContent).toBe('export const safe = true;');
  await act(async () => file.click());
  await settle();
  expect(target.textContent).toContain('只读：Workspace Agent 已断开');
  expect(target.querySelector('pre')?.textContent).toBe('export const safe = true;');
});
