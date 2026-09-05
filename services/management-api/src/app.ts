import { createService, openDatabase } from '@coffeeeeffoc/service-kit';
import { z } from 'zod';
import { createObjectStore } from './object-store.js';
import { createAuthStore } from './auth/store.js';
import { registerAuthentication } from './auth/routes.js';
import { createDraftStore } from './drafts/store.js';
import { registerDrafts } from './drafts/routes.js';
import { webcrypto } from 'node:crypto';
import { createArtifactRepository } from './artifact-repository.js';
import { createPublicationStore } from './releases/store.js';
import { registerPublications } from './releases/routes.js';
import { startPublicationWorker } from './releases/worker.js';

/** Creates the management HTTP application with only its own database identity. */
export function createManagementService(
  env: Record<string, string | undefined> = process.env,
  logger = true,
): ReturnType<typeof createService> {
  const databaseUrl = z.url().parse(env.MANAGEMENT_DATABASE_URL);
  const origin = z
    .url()
    .refine((value) => new URL(value).origin === value && /^https?:/.test(value))
    .parse(env.STUDIO_ORIGIN);
  const objects = createObjectStore({
    endpoint: z.url().parse(env.S3_ENDPOINT),
    region: env.S3_REGION ?? 'us-east-1',
    bucket: z.string().min(3).parse(env.S3_BUCKET),
    accessKeyId: z.string().min(1).parse(env.S3_ACCESS_KEY_ID),
    secretAccessKey: z.string().min(1).parse(env.S3_SECRET_ACCESS_KEY),
  });
  const database = openDatabase(databaseUrl, 'management');
  const app = createService('management', { database, objects }, logger);
  app.register(async (instance) => {
    const auth = createAuthStore(database.db);
    await registerAuthentication(instance, auth, origin);
    await registerDrafts(instance, auth, createDraftStore(database.db), origin);
    const publications = createPublicationStore(database.db);
    let artifacts;
    if (
      env.RELEASE_PROJECTION_TOKEN ||
      env.ARTIFACT_TRUSTED_PUBLIC_KEY ||
      env.RUNTIME_PROJECTION_URL
    ) {
      const token = z.string().min(32).parse(env.RELEASE_PROJECTION_TOKEN);
      const url = z
        .url()
        .refine(
          (value) =>
            /^https:/.test(value) ||
            (/^http:/.test(value) &&
              ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname)),
        )
        .parse(env.RUNTIME_PROJECTION_URL);
      const publicKey = await webcrypto.subtle.importKey(
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
      );
      artifacts = createArtifactRepository(objects, publicKey);
      startPublicationWorker(instance, publications, url, token);
    }
    await registerPublications(
      instance,
      auth,
      createDraftStore(database.db),
      publications,
      origin,
      artifacts,
    );
  });
  return app;
}
