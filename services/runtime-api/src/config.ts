import { z } from 'zod';

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
    TRUST_PROXY: z.enum(['0', '1']).optional(),
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
  if (!!env.RELEASE_PROJECTION_TOKEN !== !!env.ARTIFACT_TRUSTED_PUBLIC_KEY)
    invalid.add('RELEASE_PROJECTION_TOKEN / ARTIFACT_TRUSTED_PUBLIC_KEY');
  if (!!env.SHELL_ORIGIN !== !!env.ARTIFACT_DELIVERY_URL)
    invalid.add('SHELL_ORIGIN / ARTIFACT_DELIVERY_URL');
  const origins = (env.COMPETITION_ORIGINS ?? '').split(',').filter(Boolean);
  if (origins.some((value) => !origin.safeParse(value).success)) invalid.add('COMPETITION_ORIGINS');
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
    if (!origins.length) invalid.add('COMPETITION_ORIGINS');
  }
  if (invalid.size) throw new Error(`Invalid runtime configuration: ${[...invalid].join(', ')}`);
}
