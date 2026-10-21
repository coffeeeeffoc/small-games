import { createService, openDatabase, type RequestSpanExporter } from '@coffeeeeffoc/service-kit';
import { z } from 'zod';
import { createObjectStore } from './object-store.js';
import { createAuthStore } from './auth/store.js';
import { registerAuthentication } from './auth/routes.js';
import { createDraftStore } from './drafts/store.js';
import { registerDrafts } from './drafts/routes.js';
import { createAdDraftStore } from './ad-drafts/store.js';
import { registerAdDrafts } from './ad-drafts/routes.js';
import { webcrypto } from 'node:crypto';
import { createArtifactRepository } from './artifact-repository.js';
import { createPublicationStore } from './releases/store.js';
import { registerPublications } from './releases/routes.js';
import { startPublicationWorker } from './releases/worker.js';
import { createPublishedArtifactReader, registerArtifactDelivery } from './artifact-delivery.js';
import { createGenerationJobStore } from './generation/store.js';
import { registerGenerationJobs } from './generation/routes.js';
import { createHttpAiProvider } from './generation/provider.js';
import { startGenerationWorker } from './generation/worker.js';
import type { AiProvider } from './generation/model.js';
import type { ContentTarget } from './content-target.js';
import { createProtectionStore, registerProtection } from './protection.js';
import { adminControlEnabled, validateManagementEnvironment } from './config.js';
import { sql } from 'drizzle-orm';
import { readAdminConfig, normalizePeer } from './admin/config.js';
import { createAdminStore } from './admin/store.js';
import { githubProvider } from './admin/github.js';
import { registerAdminAuthentication } from './admin/routes.js';
import { createControlStore } from './admin/control-store.js';
import { createControlService } from './admin/control-service.js';

/** Creates the management HTTP application with only its own database identity. */
export function createManagementService(
  env: Record<string, string | undefined> = process.env,
  logger = true,
  telemetry?: RequestSpanExporter,
  contentTarget?: ContentTarget,
): ReturnType<typeof createService> {
  validateManagementEnvironment(env);
  const databaseUrl = z.url().parse(env.MANAGEMENT_DATABASE_URL);
  const adminOnly = env.MANAGEMENT_CAPABILITIES === 'admin';
  const admin = adminOnly || env.ADMIN_ORIGIN ? readAdminConfig(env) : undefined;
  const database = openDatabase(databaseUrl, 'management');
  const control = adminControlEnabled(env)
    ? createControlService(createControlStore(database.db), admin!.origin)
    : undefined;
  const checkControl = async () => {
    if (!control) return;
    const rows = await database.db.execute(
      sql`select version from game_control.schema_version where version=2`,
    );
    if (rows.length !== 1) throw new Error('Control schema is not initialized');
    await database.db.execute(
      sql`select version,digest,snapshot from game_control.published_config limit 0`,
    );
  };
  const safeTelemetry: RequestSpanExporter = {
    exportSpan(span) {
      const safe = {
        ...span,
        route: span.route.split('?')[0]!,
      };
      if (telemetry) return telemetry.exportSpan(safe);
      if (logger) console.info(JSON.stringify({ otelSpan: safe }));
    },
  };
  const safeLogger = logger
    ? {
        serializers: {
          req: (request: { method: string; url: string; id: string }) => ({
            method: request.method,
            url: request.url.split('?')[0],
            id: request.id,
          }),
        },
      }
    : false;
  const trustProxy = admin?.trustedProxy
    ? (address: string, hop: number) => hop === 0 && normalizePeer(address) === admin.trustedProxy
    : false;
  if (adminOnly) {
    const probe = {
      async check() {
        const rows = await database.db.execute(
          sql`select version from admin_console.schema_version where version = 1`,
        );
        if (rows.length !== 1) throw new Error('Admin schema is not initialized');
        await checkControl();
      },
      close: database.close,
    };
    const app = createService(
      'management',
      { database: probe },
      safeLogger,
      safeTelemetry,
      trustProxy,
    );
    app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'NOT_FOUND' }));
    app.register(async (instance) =>
      registerAdminAuthentication(
        instance,
        createAdminStore(database.db),
        admin!,
        githubProvider(admin!.clientId, admin!.clientSecret),
        Date.now,
        control,
      ),
    );
    return app;
  }
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
  const app = createService(
    'management',
    {
      database: control
        ? {
            check: async () => {
              await database.check();
              await checkControl();
            },
            close: database.close,
          }
        : database,
      objects,
    },
    safeLogger,
    safeTelemetry,
    admin ? trustProxy : env.TRUST_PROXY === '1' ? 'uniquelocal' : false,
  );
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'NOT_FOUND' }));
  app.register(async (instance) => {
    if (admin)
      await registerAdminAuthentication(
        instance,
        createAdminStore(database.db),
        admin,
        githubProvider(admin.clientId, admin.clientSecret),
        Date.now,
        control,
      );
    const auth = createAuthStore(database.db);
    await registerAuthentication(instance, auth, origin);
    await registerDrafts(instance, auth, createDraftStore(database.db), origin, contentTarget);
    const generationJobs = createGenerationJobStore(database.db);
    await registerGenerationJobs(instance, auth, generationJobs, origin, contentTarget);
    if (contentTarget) {
      let provider: AiProvider = {
        model: env.AI_PROVIDER_MODEL ?? 'unconfigured',
        generate: async () => {
          throw new Error('AI provider is not configured');
        },
      };
      if (env.AI_PROVIDER_URL || env.AI_PROVIDER_KEY || env.AI_PROVIDER_MODEL) {
        provider = createHttpAiProvider({
          endpoint: z
            .url()
            .refine(
              (value) =>
                /^https:/.test(value) ||
                (/^http:/.test(value) &&
                  ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname)),
            )
            .parse(env.AI_PROVIDER_URL),
          apiKey: z.string().min(1).parse(env.AI_PROVIDER_KEY),
          model: z.string().min(1).parse(env.AI_PROVIDER_MODEL),
        });
      }
      const stopGenerationWorker = startGenerationWorker(generationJobs, provider, contentTarget);
      instance.addHook('onClose', () => stopGenerationWorker());
    }
    const adDrafts = createAdDraftStore(database.db);
    await registerAdDrafts(instance, auth, adDrafts, origin);
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
      if (env.SHELL_ORIGIN) {
        const shellOrigin = z
          .url()
          .refine((value) => new URL(value).origin === value && /^https?:/.test(value))
          .parse(env.SHELL_ORIGIN);
        registerArtifactDelivery(
          instance,
          createPublishedArtifactReader(database.db, artifacts),
          shellOrigin,
        );
      }
      if (contentTarget) startPublicationWorker(instance, publications, url, token);
    }
    await registerPublications(
      instance,
      auth,
      createDraftStore(database.db),
      publications,
      origin,
      artifacts,
      adDrafts,
      contentTarget,
    );
    await registerProtection(instance, auth, createProtectionStore(database.db, objects), origin);
  });
  return app;
}
