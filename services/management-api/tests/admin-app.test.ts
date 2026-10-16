import { expect, it } from 'vitest';
import { readAdminConfig } from '../src/admin/config.js';
import { createManagementService } from '../src/app.js';
import { origin } from './admin.fixture.js';

it('starts admin-only without S3/Studio resources, probes only its ledger and redacts unknown query telemetry', async () => {
  const spans: { route: string }[] = [];
  const app = createManagementService(
    {
      MANAGEMENT_CAPABILITIES: 'admin',
      MANAGEMENT_DATABASE_URL: 'postgres://management_app:fixture@127.0.0.1:1/unavailable',
      ADMIN_ORIGIN: origin,
    },
    false,
    {
      exportSpan(span) {
        spans.push(span);
      },
    },
  );
  try {
    expect((await app.inject('/health/live')).statusCode).toBe(200);
    expect(
      (await app.inject({ url: '/api/auth/github', headers: { host: 'admin.nenggongzhiren.cn' } }))
        .headers.location,
    ).toContain('unavailable');
    const unknown = await app.inject({
      url: '/not-found?code=secret-code&state=secret-state',
      headers: { 'x-game-session-id': 'fixture-session-123' },
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.body).not.toContain('secret');
    expect(JSON.stringify(spans)).not.toContain('secret');
    expect(
      spans.some((span) => 'gameSessionId' in span && span.gameSessionId === 'fixture-session-123'),
    ).toBe(true);
    expect(app.hasRoute({ method: 'POST', url: '/api/auth/login' })).toBe(false);
    expect(app.hasRoute({ method: 'GET', url: '/api/drafts' })).toBe(false);
  } finally {
    await app.close();
  }
  for (const env of [
    { ADMIN_AUTH_MOCK: '1' },
    { ADMIN_ORIGIN: '*' },
    { MANAGEMENT_TRUSTED_PROXY_IP: '172.18.0.0/16' },
    { ADMIN_GITHUB_CLIENT_ID: 'partial' },
  ])
    expect(() => readAdminConfig({ ADMIN_ORIGIN: origin, ...env })).toThrow();
});
