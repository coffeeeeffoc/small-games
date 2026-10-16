import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { adminFixture, origin } from './admin.fixture.js';
import { adminHash } from '../src/admin/routes.js';

it('uses a browser-bound one-use state, PKCE, one canonical callback and opaque least-scope session', async () => {
  const f = await adminFixture();
  try {
    const { response, target, state, flow } = await f.begin();
    expect(target.origin).toBe('https://github.com');
    expect(target.searchParams.get('scope')).toBe('user:email');
    expect(target.searchParams.get('redirect_uri')).toBe(`${origin}/api/auth/github/callback`);
    expect(target.searchParams.get('code_challenge_method')).toBe('S256');
    expect(flow).toMatchObject({ httpOnly: true, secure: true, path: '/api/', sameSite: 'Lax' });
    expect(response.headers['set-cookie']).not.toContain('Domain=');
    const url = `/api/auth/github/callback?state=${state}&code=secret-code`;
    expect((await f.app.inject({ url, headers: f.headers })).headers.location).toContain('expired');
    expect(f.flows.has(adminHash(state))).toBe(true);
    const authenticated = await f.app.inject({
      url,
      headers: f.headers,
      cookies: { [flow.name]: state },
    });
    expect(authenticated.headers.location).toBe(`${origin}/`);
    expect(f.exchanges).toHaveLength(1);
    expect(target.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(f.exchanges[0]!.verifier).digest('base64url'),
    );
    expect(f.exchanges[0]!.callback).toBe(`${origin}/api/auth/github/callback`);
    expect(f.flows.size).toBe(0);
    const session = authenticated.cookies.find(
      (value) => value.name === '__Secure-sg_admin_session' && value.value,
    )!;
    expect(session).toMatchObject({
      path: '/api/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 28800,
    });
    expect(f.sessions.has(session.value)).toBe(false);
    expect(f.sessions.has(adminHash(session.value))).toBe(true);
    expect(
      (await f.app.inject({ url, headers: f.headers, cookies: { [flow.name]: state } })).headers
        .location,
    ).toContain('expired');
    expect(f.exchanges).toHaveLength(1);
    expect(authenticated.body).not.toContain('secret-code');
  } finally {
    await f.app.close();
  }
});

it('requires both entry Origin and CSRF, rotates once without extending expiry, and invalidates logout', async () => {
  const f = await adminFixture();
  try {
    const { cookies } = await f.login();
    const me = await f.app.inject({ url: '/api/session', headers: f.headers, cookies });
    const data = me.json();
    expect(data.user).toEqual({ login: 'creator' });
    expect(data.csrfToken).toMatch(/^[\w-]{43}$/);
    expect(JSON.stringify(data)).not.toMatch(/1521152077|githubId|server-only/);
    const post = (url: string, headers: Record<string, string>, jar = cookies) =>
      f.app.inject({ method: 'POST', url, headers: { ...f.headers, ...headers }, cookies: jar });
    expect((await post('/api/logout', { origin })).statusCode).toBe(403);
    expect(
      (
        await post('/api/logout', {
          origin: 'https://evil.example',
          'x-csrf-token': data.csrfToken,
        })
      ).statusCode,
    ).toBe(403);
    expect((await post('/api/logout', { origin, 'x-csrf-token': 'wrong' })).statusCode).toBe(403);
    f.advance(1000);
    const [a, b] = await Promise.all([
      post('/api/refresh', { origin, 'x-csrf-token': data.csrfToken }),
      post('/api/refresh', { origin, 'x-csrf-token': data.csrfToken }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 401]);
    const refreshed = a.statusCode === 200 ? a : b;
    expect(refreshed.json().expiresAt).toBe(data.expiresAt);
    const token = refreshed.cookies.find((value) => value.name === '__Secure-sg_admin_session')!;
    expect(token.maxAge).toBe(28799);
    expect(refreshed.json().csrfToken).not.toBe(data.csrfToken);
    expect(
      (await f.app.inject({ url: '/api/session', headers: f.headers, cookies })).statusCode,
    ).toBe(401);
    const jar = { [token.name]: token.value };
    expect(
      (await post('/api/logout', { origin, 'x-csrf-token': refreshed.json().csrfToken }, jar))
        .cookies[0],
    ).toMatchObject({ path: '/api/', maxAge: 0 });
    expect(
      (await f.app.inject({ url: '/api/session', headers: f.headers, cookies: jar })).statusCode,
    ).toBe(401);
  } finally {
    await f.app.close();
  }
});

it('fails closed on expiry, revoked whitelist, nonmember, absent config and expired state', async () => {
  const f = await adminFixture();
  try {
    const first = await f.login();
    f.config.allowlist.clear();
    expect(
      (await f.app.inject({ url: '/api/session', headers: f.headers, cookies: first.cookies }))
        .statusCode,
    ).toBe(403);
    expect(f.sessions.size).toBe(0);
    f.config.allowlist.add('1521152077@qq.com');
    const next = await f.login();
    f.advance(8 * 3600_000);
    expect(
      (await f.app.inject({ url: '/api/session', headers: f.headers, cookies: next.cookies }))
        .statusCode,
    ).toBe(401);
    const { state, flow } = await f.begin();
    f.advance(600_000);
    expect(
      (
        await f.app.inject({
          url: `/api/auth/github/callback?state=${state}&code=x`,
          headers: f.headers,
          cookies: { [flow.name]: state },
        })
      ).headers.location,
    ).toContain('expired');
  } finally {
    await f.app.close();
  }
  const denied = await adminFixture({
    githubId: '1',
    login: 'visitor',
    emails: ['other@example.com'],
  });
  try {
    const { state, flow } = await denied.begin();
    const result = await denied.app.inject({
      url: `/api/auth/github/callback?state=${state}&code=x&email=1521152077@qq.com`,
      headers: denied.headers,
      cookies: { [flow.name]: state },
    });
    expect(result.headers.location).toBe(`${origin}/forbidden`);
    expect(denied.sessions.size).toBe(0);
  } finally {
    await denied.app.close();
  }
  const disabled = await adminFixture(undefined, {
    ADMIN_GITHUB_CLIENT_ID: '',
    ADMIN_GITHUB_CLIENT_SECRET: '',
  });
  try {
    expect(
      (await disabled.app.inject({ url: '/api/auth/github', headers: disabled.headers })).headers
        .location,
    ).toContain('unavailable');
    expect(disabled.flows.size).toBe(0);
  } finally {
    await disabled.app.close();
  }
});

it('trusts only exact TCP peer and primary host, rejects all alias hosts and injected entry headers', async () => {
  const f = await adminFixture();
  try {
    const { cookies } = await f.login();
    for (const [entry, host] of [
      ['api', 'api.nenggongzhiren.cn'],
      ['main', 'nenggongzhiren.cn'],
    ] as const) {
      const headers = { host, 'x-management-entry': entry };
      expect(
        (await f.app.inject({ url: '/api/session', remoteAddress: '172.18.0.4', headers }))
          .statusCode,
      ).toBe(403);
      expect(
        (await f.app.inject({ url: '/api/session', remoteAddress: '172.18.0.4', headers, cookies }))
          .statusCode,
      ).toBe(403);
      expect(
        (await f.app.inject({ url: '/api/session', headers: { host }, cookies })).statusCode,
      ).toBe(403);
      for (const url of ['/api/auth/github', '/api/auth/github/callback?code=x&state=x'])
        expect((await f.app.inject({ url, remoteAddress: '172.18.0.4', headers })).statusCode).toBe(
          403,
        );
      expect(
        (
          await f.app.inject({
            url: '/api/session',
            headers: { ...headers, 'x-forwarded-for': '172.18.0.4' },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (await f.app.inject({ url: '/api/session', remoteAddress: '172.18.0.5', headers }))
          .statusCode,
      ).toBe(403);
    }
    expect(
      (
        await f.app.inject({
          url: '/api/session',
          remoteAddress: '172.18.0.4',
          headers: { ...f.headers, 'x-management-entry': 'api' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await f.app.inject({ url: '/api/session', headers: { host: 'evil.example' }, cookies }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await f.app.inject({
          url: '/api/session',
          remoteAddress: '::ffff:172.18.0.4',
          headers: { ...f.headers, 'x-management-entry': 'admin' },
          cookies,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await f.app.inject({
          url: '/api/session',
          headers: { ...f.headers, authorization: 'Bearer ' + 'a'.repeat(64) },
          cookies: { studio_access: 'studio' },
        })
      ).statusCode,
    ).toBe(401);
  } finally {
    await f.app.close();
  }
});

it('serves management preflight without session, rejects disallowed headers/origins and preserves independent policies', async () => {
  const f = await adminFixture();
  try {
    const headers = {
      ...f.headers,
      origin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'x-csrf-token,content-type',
    };
    const options = (extra: Record<string, string>) =>
      f.app.inject({ url: '/api/logout', method: 'OPTIONS', headers: { ...headers, ...extra } });
    expect((await options({})).statusCode).toBe(204);
    expect((await options({})).headers['access-control-allow-credentials']).toBe('true');
    expect((await options({ origin: 'http://localhost:8080' })).statusCode).toBe(403);
    expect(
      (await options({ 'access-control-request-headers': 'x-competition-internal-key' }))
        .statusCode,
    ).toBe(403);
    expect((await options({ host: 'api.nenggongzhiren.cn' })).statusCode).toBe(403);
    expect(f.sessions.size).toBe(0);
  } finally {
    await f.app.close();
  }
});
