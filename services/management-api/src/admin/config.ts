import { isIP } from 'node:net';
import type { FastifyRequest } from 'fastify';
import { readCorsPolicy } from '@coffeeeeffoc/service-kit';

export const normalizePeer = (value: string | undefined) => value?.replace(/^::ffff:/, '');
export function readAdminConfig(env: Record<string, string | undefined>) {
  const origin = env.ADMIN_ORIGIN ?? (env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:5182');
  try {
    const url = new URL(origin);
    if (
      origin.includes('*') ||
      url.origin !== origin ||
      !['http:', 'https:'].includes(url.protocol) ||
      (url.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    )
      throw new Error();
  } catch {
    throw new Error('Invalid ADMIN_ORIGIN (bare HTTPS origin required outside loopback)');
  }
  if (env.ADMIN_AUTH_MOCK || env.ADMIN_MOCK_LOGIN)
    throw new Error('Mock admin authentication is not supported');
  const allowlist = new Set(
    (env.ADMIN_ALLOWED_EMAILS ?? '1521152077@qq.com')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  if ([...allowlist].some((value) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))
    throw new Error('Invalid ADMIN_ALLOWED_EMAILS');
  const trustedProxy = env.MANAGEMENT_TRUSTED_PROXY_IP;
  if (trustedProxy) {
    const [a, b] = trustedProxy.split('.').map(Number);
    if (
      trustedProxy !== '::1' &&
      !(
        isIP(trustedProxy) === 4 &&
        (a === 127 || a === 10 || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168))
      )
    )
      throw new Error('MANAGEMENT_TRUSTED_PROXY_IP must be one exact private or loopback IP');
  }
  if (Boolean(env.ADMIN_GITHUB_CLIENT_ID) !== Boolean(env.ADMIN_GITHUB_CLIENT_SECRET))
    throw new Error('Incomplete ADMIN_GITHUB_CLIENT_ID / ADMIN_GITHUB_CLIENT_SECRET');
  return {
    origin,
    callback: `${origin}/api/auth/github/callback`,
    allowlist,
    trustedProxy,
    clientId: env.ADMIN_GITHUB_CLIENT_ID ?? '',
    clientSecret: env.ADMIN_GITHUB_CLIENT_SECRET ?? '',
    cors: readCorsPolicy(env, 'ADMIN_CORS', {
      origins: [origin],
      methods: ['GET', 'POST', 'OPTIONS'],
      headers: ['content-type', 'x-csrf-token'],
      credentials: true,
    }),
  };
}
export type AdminConfig = ReturnType<typeof readAdminConfig>;
/** The entry assertion comes only from an exact TCP peer, never forwarded IP headers. */
export function isAdminRequest(request: FastifyRequest, config: AdminConfig): boolean {
  if (request.headers.host !== new URL(config.origin).host) return false;
  const asserted = request.headers['x-management-entry'];
  if (asserted !== undefined) {
    if (
      !config.trustedProxy ||
      normalizePeer(request.socket.remoteAddress) !== config.trustedProxy ||
      asserted !== 'admin'
    )
      return false;
  }
  return true;
}
