import Fastify from 'fastify';
import { readAdminConfig } from '../src/admin/config.js';
import { registerAdminAuthentication } from '../src/admin/routes.js';
import type { AdminFlow, AdminSession, AdminStore } from '../src/admin/store.js';
import type { Identity } from '../src/admin/github.js';

export const origin = 'https://admin.nenggongzhiren.cn';
export async function adminFixture(
  identity: Identity = { githubId: '123', login: 'creator', emails: ['1521152077@qq.com'] },
  env: Record<string, string> = {},
) {
  let now = Date.now();
  const config = readAdminConfig({
    NODE_ENV: 'production',
    ADMIN_ORIGIN: origin,
    ADMIN_GITHUB_CLIENT_ID: 'test-client',
    ADMIN_GITHUB_CLIENT_SECRET: 'test-secret',
    MANAGEMENT_TRUSTED_PROXY_IP: '172.18.0.4',
    ...env,
  });
  const flows = new Map<string, AdminFlow>(),
    sessions = new Map<string, AdminSession>();
  const families = new Map<string, string>(),
    inactive = new Set<string>();
  const store: AdminStore = {
    async putFlow(hash, flow) {
      flows.set(hash, flow);
    },
    async takeFlow(hash, time) {
      const flow = flows.get(hash);
      flows.delete(hash);
      return flow && flow.expiresAt > time ? flow : undefined;
    },
    async putSession(hash, session) {
      sessions.set(hash, session);
      families.set(hash, hash);
    },
    async getSession(hash, time) {
      const session = sessions.get(hash);
      return session && !inactive.has(hash) && session.expiresAt > time ? session : undefined;
    },
    async getLogoutSession(hash, time) {
      const session = sessions.get(hash);
      return session && session.expiresAt > time ? session : undefined;
    },
    async rotateSession(hash, replacement, time) {
      const session = sessions.get(hash);
      if (!session || inactive.has(hash) || session.expiresAt <= time) return;
      inactive.add(hash);
      families.set(replacement, families.get(hash)!);
      sessions.set(replacement, session);
      return session;
    },
    async deleteSession(hash) {
      const family = families.get(hash);
      for (const [key, value] of families)
        if (value === family) {
          sessions.delete(key);
          inactive.delete(key);
          families.delete(key);
        }
    },
  };
  const app = Fastify({ logger: false });
  const exchanges: { code: string; verifier: string; callback: string }[] = [];
  await registerAdminAuthentication(
    app,
    store,
    config,
    {
      async identify(code, verifier, callback) {
        exchanges.push({ code, verifier, callback });
        return identity;
      },
    },
    () => now,
  );
  const headers = { host: 'admin.nenggongzhiren.cn' };
  const begin = async () => {
    const response = await app.inject({ url: '/api/auth/github', headers });
    const target = new URL(response.headers.location!);
    const state = target.searchParams.get('state')!;
    const flow = response.cookies.find((value) => value.name === '__Secure-sg_admin_flow')!;
    return { response, target, state, flow };
  };
  const login = async () => {
    const { state, flow } = await begin();
    const response = await app.inject({
      url: `/api/auth/github/callback?state=${state}&code=server-only-code`,
      headers,
      cookies: { [flow.name]: state },
    });
    const session = response.cookies.find(
      (value) => value.name === '__Secure-sg_admin_session' && value.value,
    )!;
    return { response, session, cookies: { [session.name]: session.value } };
  };
  return {
    app,
    config,
    store,
    flows,
    sessions,
    exchanges,
    begin,
    login,
    headers,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
