import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { type FastifyInstance, type FastifyReply } from 'fastify';
import { operatorSchema, type AuthStore } from './model.js';
import { usernameSchema, verifyPassword } from './passwords.js';

import { accessCookie, digest, authenticatedOperator } from './access.js';
const refreshCookie = 'studio_refresh';
const accessLifetime = 15 * 60 * 1000;
const refreshLifetime = 8 * 60 * 60 * 1000;
const credentials = z
  .object({ username: usernameSchema, password: z.string().min(1).max(128) })
  .strict();

/** Registers cookie auth behind exact-Origin CSRF checks and per-IP login throttling. */
export async function registerAuthentication(
  app: FastifyInstance,
  store: AuthStore,
  origin: string,
  now: () => number = Date.now,
) {
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(
    async (auth) => {
      auth.addHook('onRequest', async (request, reply) => {
        reply.header('Cache-Control', 'no-store');
        if (request.method !== 'GET' && request.headers.origin !== origin) {
          return reply.code(403).send({ error: 'ORIGIN_REJECTED' });
        }
      });
      auth.setErrorHandler((error, _request, reply) => {
        if (error instanceof Error && 'statusCode' in error && error.statusCode === 429) {
          return reply.code(429).send({ error: 'RATE_LIMITED' });
        }
        auth.log.warn('Authentication operation failed');
        return reply.code(503).send({ error: 'AUTH_UNAVAILABLE' });
      });
      const options = {
        httpOnly: true,
        sameSite: 'strict' as const,
        secure: origin.startsWith('https://'),
      };
      function tokens(reply: FastifyReply) {
        const access = randomBytes(32).toString('base64url');
        const refresh = randomBytes(32).toString('base64url');
        return {
          accessHash: digest(access),
          refreshHash: digest(refresh),
          send() {
            reply.setCookie(accessCookie, access, {
              ...options,
              path: '/api',
              maxAge: accessLifetime / 1000,
            });
            reply.setCookie(refreshCookie, refresh, {
              ...options,
              path: '/api/auth',
              maxAge: refreshLifetime / 1000,
            });
          },
        };
      }
      auth.post(
        '/login',
        { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
        async (request, reply) => {
          const input = credentials.safeParse(request.body);
          if (!input.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
          const account = await store.findAccount(input.data.username);
          const valid = await verifyPassword(input.data.password, account?.passwordHash);
          if (!account || !valid) return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
          const issued = tokens(reply);
          const timestamp = now();
          await store.saveSession({
            accessHash: issued.accessHash,
            refreshHash: issued.refreshHash,
            accountId: account.id,
            accessExpiresAt: timestamp + accessLifetime,
            refreshExpiresAt: timestamp + refreshLifetime,
          });
          issued.send();
          return operatorSchema.parse(account);
        },
      );
      auth.get('/session', async (request, reply) => {
        const operator = await authenticatedOperator(store, request, now());
        return operator ?? reply.code(401).send({ error: 'UNAUTHENTICATED' });
      });
      auth.post(
        '/refresh',
        { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
        async (request, reply) => {
          const issued = tokens(reply);
          const operator = await store.refresh(
            digest(request.cookies[refreshCookie] ?? ''),
            { ...issued, accessExpiresAt: now() + accessLifetime },
            now(),
          );
          if (!operator) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
          issued.send();
          return operator;
        },
      );
      auth.post('/logout', async (request, reply) => {
        await store.revoke(
          digest(request.cookies[accessCookie] ?? ''),
          digest(request.cookies[refreshCookie] ?? ''),
        );
        reply.clearCookie(accessCookie, { ...options, path: '/api' });
        reply.clearCookie(refreshCookie, { ...options, path: '/api/auth' });
        return { ok: true };
      });
    },
    { prefix: '/api/auth' },
  );
}
