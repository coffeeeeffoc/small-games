import { createService, openDatabase } from '@coffeeeeffoc/service-kit';
import { z } from 'zod';
import { webcrypto } from 'node:crypto';
import { createReleaseStore } from './releases/store.js';
import { registerReleaseProjection } from './releases/routes.js';

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
  });
  return app;
}
