import { z } from 'zod';

/** Reject incomplete configuration before allocating database or object-store clients. */
export function validateManagementEnvironment(env: Record<string, string | undefined>) {
  const origin = z.url().refine((value) => {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && url.origin === value;
  });
  const schema = z.object({
    MANAGEMENT_DATABASE_URL: z
      .url()
      .refine((value) => /^postgres(?:ql)?:$/.test(new URL(value).protocol)),
    STUDIO_ORIGIN: origin,
    TRUST_PROXY: z.enum(['0', '1']).optional(),
    S3_ENDPOINT: z.url().refine((value) => /^https?:$/.test(new URL(value).protocol)),
    S3_BUCKET: z.string().min(3),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    RELEASE_PROJECTION_TOKEN: z.string().min(32).optional(),
    ARTIFACT_TRUSTED_PUBLIC_KEY: z
      .string()
      .regex(/^(?:[a-f0-9]{2})+$/)
      .optional(),
    RUNTIME_PROJECTION_URL: z.url().optional(),
    SHELL_ORIGIN: origin.optional(),
  });
  const parsed = schema.safeParse(env);
  const invalid = new Set<string>();
  if (!parsed.success) for (const issue of parsed.error.issues) invalid.add(String(issue.path[0]));
  for (const group of [
    ['RELEASE_PROJECTION_TOKEN', 'ARTIFACT_TRUSTED_PUBLIC_KEY', 'RUNTIME_PROJECTION_URL'],
    ['AI_PROVIDER_URL', 'AI_PROVIDER_KEY', 'AI_PROVIDER_MODEL'],
  ]) {
    if (group.some((key) => env[key]) && !group.every((key) => env[key]))
      invalid.add(group.join(' / '));
  }
  if (env.NODE_ENV === 'production' && env.STUDIO_ORIGIN) {
    try {
      const url = new URL(env.STUDIO_ORIGIN);
      if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
        invalid.add('STUDIO_ORIGIN (HTTPS required outside loopback)');
    } catch {
      invalid.add('STUDIO_ORIGIN');
    }
  }
  if (invalid.size) throw new Error(`Invalid management configuration: ${[...invalid].join(', ')}`);
}
