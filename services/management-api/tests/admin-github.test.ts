import { afterEach, expect, it, vi } from 'vitest';
import { GithubIdentityError, githubProvider } from '../src/admin/github.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
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

it('reports only fixed provider stages and reasons without retaining upstream secrets', async () => {
  const token = { access_token: 'canary-token', token_type: 'bearer', scope: 'user:email' };
  for (const stage of ['exchange', 'profile', 'emails'] as const) {
    for (const reason of ['network', 'http', 'json', 'payload'] as const) {
      vi.stubGlobal('fetch', async (url: string) => {
        const current = url.includes('access_token')
          ? 'exchange'
          : url.endsWith('/user')
            ? 'profile'
            : 'emails';
        if (current === stage) {
          if (reason === 'network') throw new Error('canary-network-secret');
          if (reason === 'http') return new Response('canary-upstream-secret', { status: 502 });
          if (reason === 'json') return new Response('canary-invalid-json');
          return Response.json(null);
        }
        return Response.json(current === 'exchange' ? token : { id: 1, login: 'creator' });
      });
      let failure: unknown;
      try {
        await githubProvider('canary-client', 'canary-client-secret').identify(
          'canary-code',
          'canary-verifier',
          'https://admin.example/api/auth/github/callback',
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(GithubIdentityError);
      expect(failure).toMatchObject({ stage, reason });
      expect((failure as GithubIdentityError).status).toBe(reason === 'http' ? 502 : undefined);
      expect(JSON.stringify(failure) + String(failure)).not.toContain('canary');
      expect(failure).not.toHaveProperty('cause');
    }
  }
});

it('distinguishes deadline expiry and never replays an OAuth exchange', async () => {
  const controller = new AbortController();
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
  const fetch = vi.fn(async () => {
    controller.abort();
    throw new Error('canary-timeout-secret');
  });
  vi.stubGlobal('fetch', fetch);
  await expect(
    githubProvider('a', 'b').identify('c', 'v', 'https://admin.example/callback'),
  ).rejects.toMatchObject({ stage: 'exchange', reason: 'timeout' });
  expect(fetch).toHaveBeenCalledTimes(1);
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
