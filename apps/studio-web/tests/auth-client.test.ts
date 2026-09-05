import { afterEach, expect, it, vi } from 'vitest';
import { createAuthClient } from '@coffeeeeffoc/studio-web';

const operator = { id: 'operator', username: 'creator', roles: ['creator'] };
afterEach(() => vi.unstubAllGlobals());
it('renews expired access through cookies without exposing token material', async () => {
  const transport = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 401 }))
    .mockResolvedValueOnce(Response.json(operator))
    .mockResolvedValueOnce(Response.json(operator));
  vi.stubGlobal('fetch', transport);
  expect(await createAuthClient().session()).toEqual(operator);
  expect(transport.mock.calls.map(([url]) => url)).toEqual([
    '/api/auth/session',
    '/api/auth/refresh',
    '/api/auth/session',
  ]);
  expect(transport.mock.calls[1][1]).toMatchObject({
    method: 'POST',
    credentials: 'same-origin',
    body: '{}',
  });
});
it('returns signed-out state for an expired refresh and does not retry indefinitely', async () => {
  const transport = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
  vi.stubGlobal('fetch', transport);
  expect(await createAuthClient().session()).toBeNull();
  expect(transport).toHaveBeenCalledTimes(2);
});
it('distinguishes throttling from service failure and never accepts malformed identity', async () => {
  const transport = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 429 }))
    .mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(Response.json({ ...operator, roles: ['owner'] }));
  vi.stubGlobal('fetch', transport);
  const client = createAuthClient();
  await expect(client.login('creator', 'password')).rejects.toThrow('尝试次数过多');
  await expect(client.logout()).rejects.toThrow('退出失败');
  await expect(client.session()).rejects.toThrow();
});
