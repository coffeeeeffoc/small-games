import { expect, it, vi } from 'vitest';
import { adminFixture, origin } from './admin.fixture.js';
import { GithubIdentityError } from '../src/admin/github.js';

it('logs a fixed callback failure stage without OAuth inputs, provider bodies or database errors', async () => {
  for (const phase of ['identify', 'session_revoke', 'session_write'] as const) {
    for (const typed of phase === 'identify' ? [false, true] : [false]) {
      const failure = typed
        ? new GithubIdentityError('profile', 'http', 502)
        : new Error('canary-private-upstream-or-database-message');
      const f = await adminFixture(
        undefined,
        {},
        phase === 'identify'
          ? {
              async identify() {
                throw failure;
              },
            }
          : undefined,
      );
      const warn = vi.spyOn(f.app.log, 'warn');
      if (phase === 'session_write')
        f.store.putSession = async () => {
          throw failure;
        };
      if (phase === 'session_revoke')
        f.store.deleteSession = async () => {
          throw failure;
        };
      try {
        const { state, flow } = await f.begin();
        const response = await f.app.inject({
          url: `/api/auth/github/callback?state=${state}&code=canary-oauth-code`,
          headers: f.headers,
          cookies: {
            [flow.name]: state,
            __Secure_sentinel: 'canary-cookie',
            '__Secure-sg_admin_session': 'x'.repeat(43),
          },
        });
        expect(response.headers.location).toBe(`${origin}/login?error=unavailable`);
        expect(f.sessions.size).toBe(0);
        expect(warn).toHaveBeenCalledExactlyOnceWith(
          {
            code: 'ADMIN_GITHUB_CALLBACK_FAILED',
            phase,
            ...(typed ? { stage: 'profile', reason: 'http', status: 502 } : {}),
          },
          'Admin GitHub callback failed',
        );
        const logged = JSON.stringify(warn.mock.calls);
        expect(logged).not.toMatch(/canary|1521152077|creator/);
        expect(logged).not.toContain(state);
        expect(logged).not.toContain('x'.repeat(43));
      } finally {
        warn.mockRestore();
        await f.app.close();
      }
    }
  }
});
