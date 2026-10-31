import { createHash } from 'node:crypto';
import { z } from 'zod';

/** Public control contract only; membership, permissions and drafts never cross this boundary. */
export const CONTROL_GAME_IDS = [
  'cops-robbers',
  'cops-robbers-realtime',
  'letters-words2',
  'vibeJam-myself-history-guess',
  'xiangqi-five',
  'flick-arena',
  'carrom-club',
  'cage-rescue',
  'tower-brake',
  'three-choose-two',
  'carding-car',
  'night-overwatch',
  'tetracube',
] as const;
export type ControlGameId = (typeof CONTROL_GAME_IDS)[number];
export const controlStateSchema = z.enum(['enabled', 'draining', 'disabled']);
export const controlVersionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const originSchema = z
  .string()
  .max(255)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        !value.includes('*') &&
        ['http:', 'https:'].includes(url.protocol) &&
        url.origin === value &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  });
const gameShape = Object.fromEntries(
  CONTROL_GAME_IDS.map((id) => [id, controlStateSchema]),
) as Record<ControlGameId, typeof controlStateSchema>;
export const controlSnapshotSchema = z
  .object({
    apiOrigins: z
      .array(originSchema)
      .max(32)
      .refine((values) => new Set(values).size === values.length),
    games: z.object(gameShape).strict(),
  })
  .strict();
export type ControlSnapshot = z.infer<typeof controlSnapshotSchema>;
// Historical catalogs are exact; Tetracube cannot precede Night Overwatch.
export const storedControlSnapshotSchema = z.union([
  controlSnapshotSchema,
  controlSnapshotSchema.extend({
    games: z.object(gameShape).omit({ tetracube: true }).strict(),
  }),
  controlSnapshotSchema.extend({
    games: z.object(gameShape).omit({ 'night-overwatch': true, tetracube: true }).strict(),
  }),
]);
export type StoredControlSnapshot = z.infer<typeof storedControlSnapshotSchema>;
export function normalizeControlSnapshot(value: unknown): ControlSnapshot {
  const parsed = storedControlSnapshotSchema.parse(value);
  const games = {
    'night-overwatch': 'disabled' as const,
    tetracube: 'disabled' as const,
    ...parsed.games,
  };
  return {
    apiOrigins: [...parsed.apiOrigins].sort(),
    games: Object.fromEntries(
      CONTROL_GAME_IDS.map((id) => [id, games[id]]),
    ) as ControlSnapshot['games'],
  };
}
export function controlSnapshotDigest(snapshot: unknown) {
  const parsed = storedControlSnapshotSchema.parse(snapshot);
  const canonical = {
    apiOrigins: [...parsed.apiOrigins].sort(),
    games: Object.fromEntries(
      CONTROL_GAME_IDS.filter((id) => Object.hasOwn(parsed.games, id)).map((id) => [
        id,
        (parsed.games as Record<string, string>)[id],
      ]),
    ),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
export const gameControlPolicySchema = z
  .object({
    gameId: z.enum(CONTROL_GAME_IDS),
    state: controlStateSchema,
    killEpoch: controlVersionSchema,
    revision: controlVersionSchema,
  })
  .strict();
export type GameControlPolicy = z.infer<typeof gameControlPolicySchema>;
export const controlPublicationSchema = z
  .object({
    version: controlVersionSchema.refine((value) => value > 0),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    snapshot: storedControlSnapshotSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.digest !== controlSnapshotDigest(value.snapshot))
      context.addIssue({ code: 'custom', message: 'Control snapshot digest mismatch' });
  });
