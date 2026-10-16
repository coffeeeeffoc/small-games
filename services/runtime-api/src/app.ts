import {
  createService,
  openDatabase,
  openControlDatabase,
  type DependencyProbe,
  type RequestSpanExporter,
} from '@coffeeeeffoc/service-kit';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { webcrypto } from 'node:crypto';
import { createReleaseStore } from './releases/store.js';
import { registerReleaseProjection } from './releases/routes.js';
import { registerCatalog } from './catalog/routes.js';
import { createCatalogStore } from './catalog/store.js';
import { createSaveStore } from './saves/store.js';
import { registerSaves } from './saves/routes.js';
import { createCompetitionStore } from './competition/store.js';
import { registerCompetition } from './competition/routes.js';
import type { Rule } from './competition/types.js';
import { createThreeChooseTwoStore } from './three-choose-two/store.js';
import type { Engine } from './three-choose-two/types.js';
import { createCarromStore } from './carrom/store.js';
import type { Engine as CarromEngine, Level as CarromLevel } from './carrom/types.js';
import { readCompetitionCors, runtimeTrustedProxy, validateRuntimeEnvironment } from './config.js';
import { createCompetitionControl } from './competition/control.js';
import { createRankedStore } from './competition/ranked-store.js';
import type { RankedRule } from './competition/ranked-types.js';

/** Creates the runtime HTTP application with only its own database identity. */
export function createRuntimeService(
  env: Record<string, string | undefined> = process.env,
  logger = true,
  telemetry?: RequestSpanExporter,
): ReturnType<typeof createService> {
  validateRuntimeEnvironment(env);
  const databaseUrl = z.url().parse(env.RUNTIME_DATABASE_URL);
  const database = openDatabase(databaseUrl, 'runtime');
  const control =
    env.COMPETITION_ENABLED === 'true' && env.COMPETITION_CONTROL_ENABLED === 'true'
      ? createCompetitionControl(
          openControlDatabase(databaseUrl),
          readCompetitionCors(env),
          Date.now,
          env.COMPETITION_CONTROL_INSTANCE_ID,
        )
      : undefined;
  const dependencies: Record<string, DependencyProbe> = {
    database,
    ...(env.COMPETITION_ENABLED === 'true'
      ? {
          competition: {
            async check() {
              await database.db.execute(
                sql`select display_name,profile from runtime.competition_players limit 0`,
              );
              await database.db.execute(sql`select 1 from runtime.competition_matches limit 0`);
              await database.db.execute(
                sql`select 1 from runtime.competition_refresh_tokens limit 0`,
              );
              await database.db.execute(
                sql`select 1 from runtime.three_choose_two_sessions limit 0`,
              );
            },
            close() {},
          },
        }
      : {}),
    ...(control
      ? {
          control: {
            async check() {
              await control.publicCors();
            },
            close: control.close,
          },
        }
      : {}),
  };
  // One private Nginx hop; never enable this on a directly exposed listener.
  const app: ReturnType<typeof createService> = createService(
    'runtime',
    dependencies,
    logger,
    telemetry,
    runtimeTrustedProxy(env),
  );
  app.register(async (instance) => {
    if (env.COMPETITION_ENABLED === 'true') {
      const rules = new Map<string, Rule>();
      for (const name of ['cops', 'letters', 'realtime', 'history', 'chess', 'carrom', 'flick']) {
        const url = new URL(`../rules/${name}.mjs`, import.meta.url).href;
        const module = (await import(url)) as { default: Rule };
        rules.set(module.default.id, module.default);
      }
      const engineName = '@coffeeeeffoc/three-choose-two/engine';
      const engine = (await import(engineName)) as Engine;
      const reviewScore = z.coerce
        .number()
        .int()
        .min(1000)
        .parse(env.THREE_CHOOSE_TWO_REVIEW_SCORE ?? 100_000);
      const ranked = createThreeChooseTwoStore(database.db, engine, Date.now, reviewScore, control);
      const carromUrl = new URL(
        '../../../games/local/carrom-club/src/friends-core.mjs',
        import.meta.url,
      ).href;
      const levelsUrl = new URL(
        '../../../games/local/carrom-club/src/friends-content.mjs',
        import.meta.url,
      ).href;
      const carromEngine = (await import(carromUrl)) as CarromEngine;
      const { FRIEND_LEVELS } = (await import(levelsUrl)) as { FRIEND_LEVELS: CarromLevel[] };
      const carrom = createCarromStore(database.db, carromEngine, FRIEND_LEVELS, Date.now, control);
      const competition = createCompetitionStore(database.db, rules, Date.now, control);
      const rankedUrl = new URL('../rules/ranked-games.mjs', import.meta.url).href;
      const { rankedRules } = (await import(rankedUrl)) as { rankedRules: RankedRule[] };
      const gameRuns = createRankedStore(
        database.db,
        new Map(rankedRules.map((rule) => [rule.id, rule])),
        competition.identityDetails,
        Date.now,
        control,
      );
      await registerCompetition(instance, competition, env, ranked, carrom, gameRuns, control);
    }
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
      await registerSaves(instance, createSaveStore(database.db), shellOrigin);
    }
  });
  return app;
}
