import { z } from 'zod';
import {
  gameSessionContextSchema,
  gameManifestSchema,
  hostCapabilitySchema,
  releaseChannelSchema,
} from '@coffeeeeffoc/game-contract';
import { publishedVersionSchema, versionIdSchema } from './model.js';

/** Only projected, published snapshots are discoverable by players. */
export const catalogSchema = z
  .array(
    z
      .object({
        gameId: z.string(),
        channel: releaseChannelSchema,
        revision: z.number().int().positive(),
        versionId: versionIdSchema,
        manifest: gameManifestSchema,
      })
      .strict(),
  )
  .max(256);
/** Caller requests compatibility and a target; advertising authority remains server-owned. */
export const sessionRequestSchema = z
  .object({
    gameId: z.string().min(1).max(128),
    playerId: z.uuid(),
    channel: releaseChannelSchema,
    locale: z
      .string()
      .min(1)
      .max(35)
      .regex(/^[a-zA-Z0-9-]+$/),
    capabilities: z
      .array(hostCapabilitySchema)
      .max(5)
      .refine((values) => new Set(values).size === values.length),
    versionId: versionIdSchema.optional(),
  })
  .strict();
/** A validated launch request, never an authorization claim. */
export type SessionRequest = z.infer<typeof sessionRequestSchema>;
/** Session identity and immutable content are tied to the same published snapshot. */
export const publishedSessionSchema = z
  .object({ session: gameSessionContextSchema, version: publishedVersionSchema, entryUrl: z.url() })
  .strict()
  .superRefine(({ session, version }, ctx) => {
    if (
      session.gameId !== version.gameId ||
      session.gameVersion !== version.artifact.manifest.game.version ||
      session.publishedVersionId !== version.id ||
      version.artifact.manifest.game.capabilities.some(
        (capability) => !session.capabilities.includes(capability),
      )
    )
      ctx.addIssue({ code: 'custom', message: 'Session and published snapshot mismatch' });
  });
/** Frozen by the Host before it reaches a Game. */
export type PublishedSession = z.infer<typeof publishedSessionSchema>;
