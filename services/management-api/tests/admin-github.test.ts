import { afterEach, expect, it, vi } from 'vitest';
import { githubProvider } from '../src/admin/github.js';

afterEach(() => vi.unstubAllGlobals());
it('exchanges only server-side code/PKCE and returns only verified paginated emails', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.includes('access_token'))
      return Response.json({
        access_token: 'server-only-token',
        token_type: 'bearer',
        scope: 'user:email',
      });
    if (url.endsWith('/user')) return Response.json({ id: 123, login: 'creator' });
    if (new URL(url).searchParams.get('page') === '1')
      return Response.json(
        Array.from({ length: 100 }, () => ({ email: 'unverified@example.com', verified: false })),
      );
    return Response.json([
      { email: '1521152077@QQ.COM', verified: true },
      { email: 'bad@example.com', verified: false },
    ]);
  });
  const callback = 'https://admin.nenggongzhiren.cn/api/auth/github/callback';
  const identity = await githubProvider('client', 'server-only-secret').identify(
    'code',
    'verifier',
    callback,
  );
  expect(identity).toEqual({ githubId: '123', login: 'creator', emails: ['1521152077@qq.com'] });
  expect(calls).toHaveLength(4);
  const body = calls[0]!.init.body as URLSearchParams;
  expect(body.get('redirect_uri')).toBe(callback);
  expect(body.get('code_verifier')).toBe('verifier');
  for (const call of calls) {
    expect(call.init.redirect).toBe('error');
    expect(call.init.signal).toBeInstanceOf(AbortSignal);
  }
  expect(JSON.stringify(identity)).not.toMatch(/token|secret|code|verifier/);
});
it('fails closed on expanded permissions, malformed identities, HTTP errors and provider failure', async () => {
  for (const token of [
    { access_token: 'x', token_type: 'bearer', scope: 'repo,user:email' },
    { access_token: 'x', token_type: 'bearer' },
    { access_token: '', token_type: 'bearer', scope: 'user:email' },
  ]) {
    vi.stubGlobal('fetch', async () => Response.json(token));
    await expect(
      githubProvider('a', 'b').identify(
        'c',
        'v',
        'https://admin.nenggongzhiren.cn/api/auth/github/callback',
      ),
    ).rejects.toThrow();
  }
  for (const user of [
    { id: -1, login: 'valid' },
    { id: '123', login: 'valid' },
    { id: 1, login: '<script>' },
  ]) {
    vi.stubGlobal('fetch', async (url: string) =>
      Response.json(
        url.includes('access_token')
          ? { access_token: 'x', token_type: 'bearer', scope: 'user:email' }
          : user,
      ),
    );
    await expect(
      githubProvider('a', 'b').identify(
        'c',
        'v',
        'https://admin.nenggongzhiren.cn/api/auth/github/callback',
      ),
    ).rejects.toThrow();
  }
  vi.stubGlobal('fetch', async () => {
    throw new Error('provider unavailable');
  });
  await expect(
    githubProvider('a', 'b').identify(
      'c',
      'v',
      'https://admin.nenggongzhiren.cn/api/auth/github/callback',
    ),
  ).rejects.toThrow();
});
