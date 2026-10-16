import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { registerCors } from '@coffeeeeffoc/service-kit';
import { isAdminRequest, type AdminConfig } from './config.js';
import type { AdminSession, AdminStore } from './store.js';
import { GithubIdentityError, type GithubProvider } from './github.js';

const random = () => randomBytes(32).toString('base64url');
export const adminHash = (value: string) => createHash('sha256').update(value).digest('hex');
const tokenPattern = /^[\w-]{43}$/;
const equal = (a: string, b: string) =>
  Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const csrf = (token: string) =>
  createHmac('sha256', token).update('admin-csrf').digest('base64url');

/** The single admin host receives an independently authenticated management session. */
export async function registerAdminAuthentication(
  app: FastifyInstance,
  store: AdminStore,
  config: AdminConfig,
  github: GithubProvider,
  now = Date.now,
) {
  await app.register(
    async (routes) => {
      await routes.register(cookie);
      await routes.register(rateLimit, { global: false });
      registerCors(routes, config.cors, (request) => {
        return isAdminRequest(request, config) && request.headers.origin === config.origin;
      });
      const sessions = new WeakMap<FastifyRequest, { session: AdminSession; token: string }>();
      const secure = new URL(config.origin).protocol === 'https:';
      const sessionCookie = secure ? '__Secure-sg_admin_session' : 'sg_admin_session';
      const flowCookie = secure ? '__Secure-sg_admin_flow' : 'sg_admin_flow';
      const options = { path: '/api/', httpOnly: true, secure, sameSite: 'lax' as const };
      const callback = config.callback;
      const landing = (path: string) => `${config.origin}${path}`;
      routes.addHook('onSend', async (_request, reply) => {
        reply
          .header('cache-control', 'no-store')
          .header('referrer-policy', 'no-referrer')
          .header('x-content-type-options', 'nosniff')
          .header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
      });
      routes.setErrorHandler((error, _request, reply) => {
        const limited = error instanceof Error && 'statusCode' in error && error.statusCode === 429;
        routes.log.warn(
          { code: limited ? 'ADMIN_RATE_LIMITED' : 'ADMIN_UNAVAILABLE' },
          'Admin operation failed',
        );
        return reply
          .code(limited ? 429 : 503)
          .send({ error: limited ? 'rate_limited' : 'temporarily_unavailable' });
      });
      routes.addHook('onRequest', async (request, reply) => {
        if (!isAdminRequest(request, config))
          return reply.code(403).send({ error: 'invalid_entry' });
        if (request.method === 'OPTIONS') return;
        if (
          request.routeOptions.url === '/api/auth/github' ||
          request.routeOptions.url === '/api/auth/github/callback'
        )
          return;
        const token = request.cookies[sessionCookie];
        const session =
          token && tokenPattern.test(token)
            ? await (request.method === 'POST' && request.routeOptions.url === '/api/logout'
                ? store.getLogoutSession(adminHash(token), now())
                : store.getSession(adminHash(token), now()))
            : undefined;
        if (!session || Number(session.expiresAt) <= now())
          return reply.code(401).send({ error: 'authentication_required' });
        if (!config.allowlist.has(session.email)) {
          await store.deleteSession(adminHash(token!));
          reply.clearCookie(sessionCookie, options);
          return reply.code(403).send({ error: 'forbidden' });
        }
        if (!['GET', 'HEAD'].includes(request.method)) {
          // CORS is an independent browser policy; every cookie write also needs Origin and CSRF.
          if (request.headers.origin !== config.origin)
            return reply.code(403).send({ error: 'invalid_origin' });
          const supplied = request.headers['x-csrf-token'];
          if (typeof supplied !== 'string' || !equal(supplied, csrf(token!)))
            return reply.code(403).send({ error: 'invalid_csrf' });
        }
        sessions.set(request, { session, token: token! });
      });
      routes.get(
        '/auth/github',
        { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
        async (request, reply) => {
          if (!config.clientId || !config.clientSecret || !config.allowlist.size)
            return reply.redirect(landing('/login?error=unavailable'));
          const state = random(),
            verifier = random();
          await store.putFlow(adminHash(state), {
            verifier,
            callback,
            expiresAt: now() + 600_000,
          });
          reply.setCookie(flowCookie, state, { ...options, maxAge: 600 });
          const target = new URL('https://github.com/login/oauth/authorize');
          target.search = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: callback,
            scope: 'user:email',
            state,
            code_challenge: createHash('sha256').update(verifier).digest('base64url'),
            code_challenge_method: 'S256',
            prompt: 'select_account',
          }).toString();
          return reply.redirect(target.href);
        },
      );
      routes.get(
        '/auth/github/callback',
        { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } },
        async (request, reply) => {
          reply.clearCookie(flowCookie, options);
          const query = request.query as Record<string, unknown>;
          const state = query.state,
            browser = request.cookies[flowCookie];
          if (
            typeof state !== 'string' ||
            !tokenPattern.test(state) ||
            !browser ||
            !tokenPattern.test(browser) ||
            !equal(state, browser)
          )
            return reply.redirect(landing('/login?error=expired'));
          const flow = await store.takeFlow(adminHash(state), now());
          if (
            !flow ||
            flow.callback !== callback ||
            Number(flow.expiresAt) <= now() ||
            typeof query.code !== 'string' ||
            !query.code.length ||
            query.code.length > 512 ||
            query.error ||
            !config.clientId ||
            !config.clientSecret
          )
            return reply.redirect(landing('/login?error=expired'));
          let phase: 'identify' | 'session_revoke' | 'session_write' | 'session_cookie' =
            'identify';
          try {
            const identity = await github.identify(query.code, flow.verifier, callback);
            phase = 'session_revoke';
            reply.clearCookie(sessionCookie, options);
            const old = request.cookies[sessionCookie];
            if (old && tokenPattern.test(old)) await store.deleteSession(adminHash(old));
            const email = identity.emails.find((value) => config.allowlist.has(value));
            if (!email) return reply.redirect(landing('/forbidden'));
            const token = random();
            phase = 'session_write';
            await store.putSession(adminHash(token), {
              githubId: identity.githubId,
              login: identity.login,
              email,
              expiresAt: now() + 8 * 3600_000,
            });
            phase = 'session_cookie';
            reply.setCookie(sessionCookie, token, { ...options, maxAge: 8 * 3600 });
            return reply.redirect(landing('/'));
          } catch (error) {
            routes.log.warn(
              {
                code: 'ADMIN_GITHUB_CALLBACK_FAILED',
                phase,
                ...(error instanceof GithubIdentityError && phase === 'identify'
                  ? { stage: error.stage, reason: error.reason, status: error.status }
                  : {}),
              },
              'Admin GitHub callback failed',
            );
            return reply.redirect(landing('/login?error=unavailable'));
          }
        },
      );
      routes.get('/session', async (request) => {
        const { session, token } = sessions.get(request)!;
        return {
          user: { login: session.login },
          csrfToken: csrf(token),
          expiresAt: Number(session.expiresAt),
        };
      });
      routes.post(
        '/refresh',
        { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
        async (request, reply) => {
          const { token } = sessions.get(request)!;
          const replacement = random();
          const rotated = await store.rotateSession(
            adminHash(token),
            adminHash(replacement),
            now(),
          );
          if (!rotated) return reply.code(401).send({ error: 'authentication_required' });
          reply.setCookie(sessionCookie, replacement, {
            ...options,
            maxAge: Math.max(0, Math.floor((Number(rotated.expiresAt) - now()) / 1000)),
          });
          return {
            user: { login: rotated.login },
            csrfToken: csrf(replacement),
            expiresAt: Number(rotated.expiresAt),
          };
        },
      );
      routes.post('/logout', async (request, reply) => {
        const { token } = sessions.get(request)!;
        await store.deleteSession(adminHash(token));
        reply.clearCookie(sessionCookie, options);
        return { ok: true };
      });
    },
    { prefix: '/api' },
  );
}
