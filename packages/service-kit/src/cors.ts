import type { FastifyInstance, FastifyRequest } from 'fastify';

export interface CorsPolicy {
  origins: readonly string[];
  methods: readonly string[];
  headers: readonly string[];
  credentials: boolean;
  maxAge: number;
}

const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const header = /^[a-z0-9!#$%&'*+.^_`|~-]+$/;
/** Separate environment prefixes keep public Bearer and management cookie policies independent. */
export function readCorsPolicy(
  env: Record<string, string | undefined>,
  prefix: string,
  defaults: Pick<CorsPolicy, 'origins' | 'methods' | 'headers' | 'credentials'>,
): CorsPolicy {
  const list = (key: string, fallback: readonly string[]) =>
    env[`${prefix}_${key}`] === undefined
      ? [...fallback]
      : env[`${prefix}_${key}`]!.split(',')
          .map((value) => value.trim())
          .filter(Boolean);
  const origins = list('ORIGINS', defaults.origins);
  const allowedMethods = list('METHODS', defaults.methods);
  const headers = list('HEADERS', defaults.headers).map((value) => value.toLowerCase());
  const credentials = env[`${prefix}_CREDENTIALS`] ?? String(defaults.credentials);
  const maxAge = Number(env[`${prefix}_MAX_AGE`] ?? '600');
  try {
    if (
      origins.some((value) => {
        const url = new URL(value);
        return (
          value.includes('*') || url.origin !== value || !['http:', 'https:'].includes(url.protocol)
        );
      })
    )
      throw new Error();
    if (!allowedMethods.length || allowedMethods.some((value) => !methods.has(value)))
      throw new Error();
    if (headers.some((value) => !header.test(value) || value === '*')) throw new Error();
    if (!['true', 'false'].includes(credentials)) throw new Error();
    if (!Number.isInteger(maxAge) || maxAge < 0 || maxAge > 86400) throw new Error();
  } catch {
    throw new Error(`Invalid ${prefix} CORS configuration`);
  }
  return { origins, methods: allowedMethods, headers, credentials: credentials === 'true', maxAge };
}

/** Call before authentication; preflight validates policy without executing business handlers. */
export function registerCors(
  app: FastifyInstance,
  policy: CorsPolicy,
  sameOrigin?: (request: FastifyRequest) => boolean,
) {
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && !sameOrigin?.(request) && !policy.origins.includes(origin))
      return reply.code(403).send({ error: 'ORIGIN_REJECTED' });
    if (origin) {
      reply.header('access-control-allow-origin', origin).header('vary', 'Origin');
      if (policy.credentials) reply.header('access-control-allow-credentials', 'true');
    }
    if (request.method === 'OPTIONS') return;
    if (origin && !policy.methods.includes(request.method))
      return reply.code(403).send({ error: 'CORS_METHOD_REJECTED' });
  });
  app.options('/*', async (request, reply) => {
    const method = request.headers['access-control-request-method'];
    const requested = request.headers['access-control-request-headers'];
    const headers =
      typeof requested === 'string' ? requested.split(',').map((v) => v.trim().toLowerCase()) : [];
    if (
      !request.headers.origin ||
      typeof method !== 'string' ||
      !policy.methods.includes(method) ||
      headers.some((value) => !header.test(value) || !policy.headers.includes(value))
    )
      return reply.code(403).send({ error: 'CORS_PREFLIGHT_REJECTED' });
    return reply
      .header('vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers')
      .header('access-control-allow-methods', policy.methods.join(','))
      .header('access-control-allow-headers', policy.headers.join(','))
      .header('access-control-max-age', policy.maxAge)
      .code(204)
      .send();
  });
}
