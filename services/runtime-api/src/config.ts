import { z } from 'zod';
import { BlockList, isIP } from 'node:net';
import { readCorsPolicy } from '@coffeeeeffoc/service-kit';

export function readCompetitionCors(env: Record<string, string | undefined>) {
  return readCorsPolicy(
    {
      ...env,
      COMPETITION_CORS_ORIGINS: env.COMPETITION_CORS_ORIGINS ?? env.COMPETITION_ORIGINS ?? '',
    },
    'COMPETITION_CORS',
    {
      origins: [],
      methods: ['GET', 'POST', 'OPTIONS'],
      headers: ['authorization', 'content-type'],
      credentials: false,
    },
  );
}

const origin = z.url().refine((value) => {
  const url = new URL(value);
  return /^https?:$/.test(url.protocol) && url.origin === value;
});
const database = z.url().refine((value) => /^postgres(?:ql)?:$/.test(new URL(value).protocol));

/** Validate before opening resources; errors name fields without echoing credentials. */
export function validateRuntimeEnvironment(env: Record<string, string | undefined>) {
  const schema = z.object({
    RUNTIME_DATABASE_URL: database,
    COMPETITION_ENABLED: z.enum(['true', 'false']).optional(),
    COMPETITION_CONTROL_ENABLED: z.enum(['true', 'false']).optional(),
    COMPETITION_CONTROL_INSTANCE_ID: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[^\p{Cc}]+$/u)
      .optional(),
    TRUST_PROXY: z.enum(['0', '1']).optional(),
    RUNTIME_TRUSTED_PROXY_IP: z
      .string()
      .refine((value) => isIP(value) !== 0)
      .optional(),
    COMPETITION_INTERNAL_KEY: z.string().min(32).optional(),
    RELEASE_PROJECTION_TOKEN: z.string().min(32).optional(),
    ARTIFACT_TRUSTED_PUBLIC_KEY: z
      .string()
      .regex(/^(?:[a-f0-9]{2})+$/)
      .optional(),
    SHELL_ORIGIN: origin.optional(),
    ARTIFACT_DELIVERY_URL: z.url().optional(),
    CANARY_PERCENT: z.coerce.number().int().min(0).max(100).optional(),
  });
  const parsed = schema.safeParse(env);
  const invalid = new Set<string>();
  if (!parsed.success) for (const issue of parsed.error.issues) invalid.add(String(issue.path[0]));
  if ((env.TRUST_PROXY === '1') !== !!env.RUNTIME_TRUSTED_PROXY_IP)
    invalid.add('RUNTIME_TRUSTED_PROXY_IP');
  if (!!env.RELEASE_PROJECTION_TOKEN !== !!env.ARTIFACT_TRUSTED_PUBLIC_KEY)
    invalid.add('RELEASE_PROJECTION_TOKEN / ARTIFACT_TRUSTED_PUBLIC_KEY');
  if (!!env.SHELL_ORIGIN !== !!env.ARTIFACT_DELIVERY_URL)
    invalid.add('SHELL_ORIGIN / ARTIFACT_DELIVERY_URL');
  let hasOrigins = false;
  try {
    hasOrigins = readCompetitionCors(env).origins.length > 0;
  } catch {
    invalid.add(
      'COMPETITION_CORS_ORIGINS / COMPETITION_CORS_METHODS / COMPETITION_CORS_HEADERS / COMPETITION_CORS_CREDENTIALS / COMPETITION_CORS_MAX_AGE / COMPETITION_ORIGINS',
    );
  }
  if (env.COMPETITION_PLATFORM_CONFIG) {
    try {
      const platforms: unknown = JSON.parse(env.COMPETITION_PLATFORM_CONFIG);
      if (!Array.isArray(platforms)) invalid.add('COMPETITION_PLATFORM_CONFIG');
    } catch {
      invalid.add('COMPETITION_PLATFORM_CONFIG');
    }
  }
  if (env.NODE_ENV === 'production' && env.COMPETITION_ENABLED === 'true') {
    if (!env.COMPETITION_INTERNAL_KEY) invalid.add('COMPETITION_INTERNAL_KEY');
    if (!hasOrigins) invalid.add('COMPETITION_CORS_ORIGINS / COMPETITION_ORIGINS');
  }
  if (invalid.size) throw new Error(`Invalid runtime configuration: ${[...invalid].join(', ')}`);
}

/** Exactly one forwarding peer, including IPv4-mapped sockets; never trust a subnet/hop count. */
export function runtimeTrustedProxy(env: Record<string, string | undefined>) {
  if (env.TRUST_PROXY !== '1') return false;
  const address = env.RUNTIME_TRUSTED_PROXY_IP;
  if (!address || !isIP(address))
    throw new Error('Invalid runtime configuration: RUNTIME_TRUSTED_PROXY_IP');
  const allowed = new BlockList();
  allowed.addAddress(address, isIP(address) === 6 ? 'ipv6' : 'ipv4');
  return (peer: string, hop: number) =>
    hop === 0 && allowed.check(peer, isIP(peer) === 6 ? 'ipv6' : 'ipv4');
}
