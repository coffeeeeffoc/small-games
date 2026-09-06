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
    tree: vi.fn(
      async (): Promise<RepositoryTree> => ({
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
      }),
    ),
    read: vi
      .fn()
      .mockResolvedValueOnce({
        gameId: 'game-cultivation',
        path: 'src/evil&name.ts',
        source: 'export const safe = true;\n',
        version: 'a'.repeat(64),
        editable: true,
      })
      .mockRejectedValueOnce(new Error('offline')),
    diff: vi.fn(),
    write: vi.fn(),
    startSourceExtension: vi.fn(),
    generateSource: vi.fn(),
    retrySource: vi.fn(),
    validateSource: vi.fn(),
    sourceDiff: vi.fn(),
    commitSource: vi.fn(),
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
  expect(target.textContent).toContain('src/evil&name.ts');
  await act(async () => file.click());
  await settle();
  expect(target.textContent).toContain('只读：Workspace Agent 已断开');
  expect(target.textContent).toContain('src/evil&name.ts');
});

it('reviews a diff and saves only after explicit confirmation', async () => {
  const version = 'a'.repeat(64);
  const nextVersion = 'b'.repeat(64);
  const api: WorkspaceAgentClient = {
    pair: vi.fn(async () => undefined),
    tree: vi.fn(
      async (): Promise<RepositoryTree> => ({
        games: [
          { id: 'game-cultivation', files: [{ name: 'a.ts', path: 'src/a.ts', type: 'file' }] },
        ],
      }),
    ),
    read: vi.fn(async () => ({
      gameId: 'game-cultivation',
      path: 'src/a.ts',
      source: 'export const a = 1;\n',
      version,
      editable: true,
    })),
    diff: vi.fn(async (request) => ({
      ...request,
      repositoryPath: 'apps/game-cultivation/src/a.ts',
      before: 'export const a = 1;\n',
      version,
      stale: false,
      hunks: [
        {
          oldStart: 1,
          oldLines: 1,
          newStart: 1,
          newLines: 1,
          lines: [
            { type: 'removed', text: 'export const a = 1;' },
            { type: 'added', text: 'export const a = 2;' },
          ],
        },
      ],
      files: [{ path: 'apps/game-cultivation/src/a.ts', added: 1, removed: 1 }],
    })),
    write: vi.fn(async (request) => ({
      ...request,
      repositoryPath: 'apps/game-cultivation/src/a.ts',
      source: request.source,
      version: nextVersion,
      format: { ok: true, issues: [] },
    })),
    startSourceExtension: vi.fn(),
    generateSource: vi.fn(),
    retrySource: vi.fn(),
    validateSource: vi.fn(),
    sourceDiff: vi.fn(),
    commitSource: vi.fn(),
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
  await act(async () => target.querySelector<HTMLButtonElement>('button')!.click());
  await settle();
  await act(async () =>
    Array.from(target.querySelectorAll('button'))
      .find((button) => button.textContent === 'a.ts')!
      .click(),
  );
  await settle();
  const textarea = target.querySelector<HTMLTextAreaElement>('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      textarea,
      'export const a = 2;\n',
    );
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    Array.from(target.querySelectorAll('button'))
      .find((button) => button.textContent === '审查 diff')!
      .click(),
  );
  await settle();
  expect(target.textContent).toContain('apps/game-cultivation/src/a.ts');
  expect(api.write).not.toHaveBeenCalled();
  await act(async () =>
    Array.from(target.querySelectorAll('button'))
      .find((button) => button.textContent === '确认保存')!
      .click(),
  );
  await settle();
  expect(api.write).toHaveBeenCalledWith(expect.objectContaining({ confirmation: true }));
  expect(target.textContent).toContain('已保存并重新读取');
});
