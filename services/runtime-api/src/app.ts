import { createService, openDatabase } from '@coffeeeeffoc/service-kit';
import { z } from 'zod';
import { webcrypto } from 'node:crypto';
import { createReleaseStore } from './releases/store.js';
import { registerReleaseProjection } from './releases/routes.js';
import { registerCatalog } from './catalog/routes.js';
import { createCatalogStore } from './catalog/store.js';

/** Creates the runtime HTTP application with only its own database identity. */
export function createRuntimeService(
  env: Record<string, string | undefined> = process.env,
  logger = true,
): ReturnType<typeof createService> {
  const databaseUrl = z.url().parse(env.RUNTIME_DATABASE_URL);
  const database = openDatabase(databaseUrl, 'runtime');
  const app = createService('runtime', { database }, logger);
  app.register(async (instance) => {
    const configured = env.RELEASE_PROJECTION_TOKEN || env.ARTIFACT_TRUSTED_PUBLIC_KEY;
    const configuration = configured
      ? {
          token: z.string().min(32).parse(env.RELEASE_PROJECTION_TOKEN),
          publicKey: await webcrypto.subtle.importKey(
            'spki',
            Buffer.from(
              z
                .string()
                .regex(/^(?:[a-f0-9]{2})+$/)
                .parse(env.ARTIFACT_TRUSTED_PUBLIC_KEY),
              'hex',
            ),
            'Ed25519',
            true,
            ['verify'],
          ),
        }
      : undefined;
    registerReleaseProjection(instance, createReleaseStore(database.db), configuration);
    if (env.SHELL_ORIGIN || env.ARTIFACT_DELIVERY_URL) {
      const shellOrigin = z
        .url()
        .refine((value) => new URL(value).origin === value && /^https?:/.test(value))
        .parse(env.SHELL_ORIGIN);
      const deliveryUrl = z
        .url()
        .refine(
          (value) =>
            /^https:/.test(value) ||
            (/^http:/.test(value) &&
              ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname)),
        )
        .parse(env.ARTIFACT_DELIVERY_URL);
      const canaryPercent = z.coerce
        .number()
        .int()
        .min(0)
        .max(100)
        .parse(env.CANARY_PERCENT ?? 10);
      await registerCatalog(instance, createCatalogStore(database.db), {
        shellOrigin,
        deliveryUrl,
        canaryPercent,
      });
    }
  });
  return app;
}
