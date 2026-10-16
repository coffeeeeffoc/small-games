import { expect, it } from 'vitest';
import { adminFixture, origin } from './admin.fixture.js';
import { CONTROL_PERMISSIONS } from '../src/admin/control-model.js';
import { controlFixture, controlSnapshot } from './control.fixture.js';
import { createControlService } from '../src/admin/control-service.js';

it('reuses canonical GitHub sessions and host/Origin/CSRF protection, exposes only fixed permissions', async () => {
  const memory = await controlFixture();
  const f = await adminFixture(undefined, {}, undefined, memory.service);
  try {
    const { cookies } = await f.login();
    const session = (
      await f.app.inject({ url: '/api/session', headers: f.headers, cookies })
    ).json();
    expect(session.permissions).toEqual(CONTROL_PERMISSIONS);
    expect(session.roles).toEqual(['administrator']);
    const get = (url: string, headers = f.headers) => f.app.inject({ url, headers, cookies });
    for (const route of ['catalog', 'state', 'revisions', 'members', 'roles', 'audit'])
      expect((await get(`/api/control/${route}`)).statusCode).toBe(200);
    expect((await get('/api/control/state', { host: 'api.nenggongzhiren.cn' })).statusCode).toBe(
      403,
    );
    expect(
      (
        await f.app.inject({
          url: '/api/control/state',
          headers: { ...f.headers, authorization: `Bearer ${'a'.repeat(64)}` },
        })
      ).statusCode,
    ).toBe(401);
    const mutation = {
      method: 'POST' as const,
      url: '/api/control/revisions',
      cookies,
      payload: { expectedVersion: 0, snapshot: controlSnapshot(), reason: 'test' },
    };
    expect((await f.app.inject({ ...mutation, headers: f.headers })).statusCode).toBe(403);
    expect(
      (
        await f.app.inject({
          ...mutation,
          headers: { ...f.headers, origin, 'x-csrf-token': 'wrong' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await f.app.inject({
          ...mutation,
          headers: {
            ...f.headers,
            origin: 'https://evil.example',
            'x-csrf-token': session.csrfToken,
          },
        })
      ).statusCode,
    ).toBe(403);
    const headers = { ...f.headers, origin, 'x-csrf-token': session.csrfToken };
    const draft = await f.app.inject({ ...mutation, headers });
    expect(draft.statusCode).toBe(200);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: `/api/control/revisions/${draft.json().id}/publish`,
          cookies,
          headers,
          payload: { expectedVersion: 0 },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await f.app.inject({
          ...mutation,
          headers,
          payload: { ...mutation.payload, snapshot: { ...controlSnapshot(), token: 'secret' } },
        })
      ).statusCode,
    ).toBe(422);
  } finally {
    await f.app.close();
  }
});

it('revokes a disabled DB member session even while the environment allowlist still permits it', async () => {
  const memory = await controlFixture();
  await memory.service.saveRole(memory.session, 'viewer', {
    name: 'Viewer',
    permissions: ['control.read'],
    reason: 'viewer',
  });
  const member = await memory.service.saveMember(memory.session, undefined, {
    email: 'viewer@example.com',
    roleIds: ['viewer'],
    reason: 'invite',
  });
  const f = await adminFixture(
    { githubId: '99', login: 'viewer', emails: [member.email] },
    { ADMIN_ALLOWED_EMAILS: `${member.email},1521152077@qq.com` },
    undefined,
    memory.service,
  );
  try {
    const { cookies } = await f.login();
    expect(
      (await f.app.inject({ url: '/api/session', headers: f.headers, cookies })).json().permissions,
    ).toEqual(['control.read']);
    expect(
      (await f.app.inject({ url: '/api/control/members', headers: f.headers, cookies })).statusCode,
    ).toBe(403);
    await memory.service.saveMember(memory.session, member.id, {
      active: false,
      reason: 'immediate revocation',
    });
    expect(
      (await f.app.inject({ url: '/api/session', headers: f.headers, cookies })).statusCode,
    ).toBe(403);
    expect(f.sessions.size).toBe(0);
  } finally {
    await f.app.close();
  }
});

it('keeps control endpoints and permission response fields absent when not injected', async () => {
  const f = await adminFixture();
  try {
    const { cookies } = await f.login();
    const response = await f.app.inject({ url: '/api/session', headers: f.headers, cookies });
    expect(response.json()).not.toHaveProperty('permissions');
    expect(response.json()).not.toHaveProperty('roles');
    expect(f.app.hasRoute({ method: 'GET', url: '/api/control/state' })).toBe(false);
  } finally {
    await f.app.close();
  }
});

it('fails closed if the member store is unavailable without leaking errors or falling back to env', async () => {
  const control = createControlService(
    {
      transaction: async () => {
        throw new Error('private-database-canary');
      },
    },
    origin,
  );
  const f = await adminFixture(undefined, {}, undefined, control);
  try {
    const { state, flow } = await f.begin();
    const response = await f.app.inject({
      url: `/api/auth/github/callback?state=${state}&code=fixture`,
      headers: f.headers,
      cookies: { [flow.name]: state },
    });
    expect(response.headers.location).toContain('unavailable');
    expect(response.body).not.toContain('private-database-canary');
    expect(f.sessions.size).toBe(0);
  } finally {
    await f.app.close();
  }
});
