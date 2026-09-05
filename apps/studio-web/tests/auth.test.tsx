import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  StudioApp,
  createStudioRouter,
  type AuthClient,
  type Operator,
} from '@coffeeeeffoc/studio-web';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const operator: Operator = {
  id: 'operator',
  username: 'creator',
  roles: ['creator', 'reviewer', 'publisher', 'admin'],
};
let target: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  target = document.createElement('div');
  document.body.append(target);
  root = createRoot(target);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    queryClient.clear();
  });
  target.remove();
  vi.restoreAllMocks();
});
async function render(auth: AuthClient, path = '/') {
  const router = createStudioRouter(
    { auth, queryClient },
    createMemoryHistory({ initialEntries: [path] }),
  );
  await act(async () => {
    root.render(<StudioApp router={router} />);
    await router.load();
  });
  return router;
}
async function waitForText(text: string) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(target.textContent).toContain(text);
  });
}
async function input(id: string, value: string) {
  const field = target.querySelector<HTMLInputElement>(`#${id}`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it('redirects an unauthenticated deep link to the actual login form', async () => {
  await render({ session: async () => null, login: async () => operator, logout: async () => {} });
  await waitForText('登录工作区');
  expect(target.querySelector('input[type=password]')).not.toBeNull();
  expect(target.textContent).not.toContain('当前账号权限');
});
it('submits credentials, shows role grants, and clears the workspace on logout', async () => {
  let current: Operator | null = null;
  const auth: AuthClient = {
    session: async () => current,
    login: vi.fn(async () => (current = operator)),
    logout: vi.fn(async () => {
      current = null;
    }),
  };
  await render(auth, '/login');
  await waitForText('登录工作区');
  await input('username', 'creator');
  await input('password', 'test-password');
  await act(async () => {
    target
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await waitForText('当前账号权限');
  expect(auth.login).toHaveBeenCalledWith('creator', 'test-password');
  expect(target.textContent).toContain('审核');
  await act(async () => {
    target.querySelector<HTMLButtonElement>('button.logout')!.click();
  });
  await waitForText('登录工作区');
  expect(auth.logout).toHaveBeenCalledOnce();
  expect(queryClient.getQueryData(['session'])).toBeUndefined();
});
it('announces failed login and leaves the protected workspace inaccessible', async () => {
  await render(
    {
      session: async () => null,
      login: async () => {
        throw new Error('账号或密码不正确。');
      },
      logout: async () => {},
    },
    '/login',
  );
  await waitForText('登录工作区');
  await input('username', 'creator');
  await input('password', 'wrong');
  await act(async () => {
    target
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await waitForText('账号或密码不正确。');
  expect(target.querySelector('[role=alert]')).not.toBeNull();
});
it('leaves the protected view when the server reports an expired session', async () => {
  let current: Operator | null = operator;
  await render({
    session: async () => current,
    login: async () => operator,
    logout: async () => {},
  });
  await waitForText('当前账号权限');
  current = null;
  await act(async () => {
    await queryClient.invalidateQueries({ queryKey: ['session'] });
  });
  await waitForText('登录工作区');
});
