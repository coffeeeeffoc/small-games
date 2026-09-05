import { z } from 'zod';
import { dynamicContentEnvelopeSchema } from '@coffeeeeffoc/content-schema';
import { jsonValueSchema, releaseChannelSchema } from '@coffeeeeffoc/game-contract';
import { signedArtifactSchema } from '@coffeeeeffoc/game-artifact';

/** IDs identify immutable published snapshots, separately from executable build versions. */
export const versionIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
/** Wire shape contains only published data; it has no Management draft/account fields. */
export const publishedVersionSchema = z
  .object({
    id: versionIdSchema,
    gameId: z.string().min(1),
    artifact: signedArtifactSchema,
    content: dynamicContentEnvelopeSchema.extend({ payload: jsonValueSchema }).strict(),
  })
  .strict()
  .superRefine((version, ctx) => {
    if (
      version.gameId !== version.artifact.manifest.game.gameId ||
      version.content.gameId !== version.gameId ||
      version.content.schemaVersion > version.artifact.manifest.game.contentSchemaVersion
    )
      ctx.addIssue({ code: 'custom', message: 'Published content and Artifact are incompatible' });
  });
/** Immutable Artifact/content snapshot selected by Channel or explicit ID. */
export type PublishedVersion = z.infer<typeof publishedVersionSchema>;
/** A monotonically sequenced, replayable Channel transition between services. */
export const projectionSchema = z
  .object({
    formatVersion: z.literal(1),
    eventId: z.uuid(),
    channel: releaseChannelSchema,
    revision: z.number().int().min(1).max(2147483647),
    version: publishedVersionSchema,
  })
  .strict();
/** No service implementation crosses this transport boundary. */
export type ReleaseProjection = z.infer<typeof projectionSchema>;
/** A matching receipt is required before Management acknowledges its pointer. */
export const projectionReceiptSchema = z
  .object({ eventId: z.uuid(), revision: z.number().int().positive(), versionId: versionIdSchema })
  .strict();
/** Stable receipt returned again for an identical event replay. */
export type ProjectionReceipt = z.infer<typeof projectionReceiptSchema>;
/** Observed Channel state used for optimistic publication/rollback requests. */
export const channelSchema = z.object({
  gameId: z.string(),
  channel: releaseChannelSchema,
  revision: z.number().int().nonnegative(),
  versionId: versionIdSchema.nullable(),
});
/** Confirmed pointer; pending publication does not change this shape. */
export type ReleaseChannelState = z.infer<typeof channelSchema>;
