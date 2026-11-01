import { z } from 'zod';
import { assertGameScope, type PlayerAuth } from './auth.js';
import { CompetitionError } from './types.js';

const asset = z.string().regex(/^[a-z][a-zA-Z0-9]{0,31}$/);
export const developmentAssetCommandSchema = z
  .object({
    requestId: z.uuid(),
    deltas: z.record(asset, z.number().int().min(-1e9).max(1e9)),
  })
  .strict()
  .refine(
    (value) => {
      const values = Object.values(value.deltas);
      return values.length > 0 && values.length <= 16 && values.some((delta) => delta !== 0);
    },
    { message: 'Supply at least one nonzero asset delta' },
  );
export type DevelopmentAssetCommand = z.infer<typeof developmentAssetCommandSchema>;

export type DevelopmentAssetAdapter = {
  assets: readonly string[];
  // Each adapter rechecks session/control within its wallet transaction and atomically journals requestId.
  adjust(auth: PlayerAuth, command: DevelopmentAssetCommand): Promise<{ playerId: string }>;
};

/** Dispatch only to server-registered wallets; the request never chooses an owner or storage. */
export function createDevelopmentAssets(
  enabled: boolean,
  adapters: ReadonlyMap<string, DevelopmentAssetAdapter>,
) {
  const registered = new Map(adapters);
  for (const [game, adapter] of registered) {
    z.string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,79}$/)
      .parse(game);
    z.array(asset)
      .min(1)
      .max(16)
      .refine((keys) => new Set(keys).size === keys.length)
      .parse(adapter.assets);
  }
  return {
    developmentAssetCapabilities(game: string) {
      const adapter = registered.get(game);
      return { enabled: enabled && !!adapter, assets: adapter ? [...adapter.assets] : [] };
    },
    async adjustDevelopmentAssets(auth: PlayerAuth, game: string, input: unknown) {
      assertGameScope(auth, game);
      if (!enabled) throw new CompetitionError('DEV_TOOLS_DISABLED', 403);
      const adapter = registered.get(game);
      if (!adapter) throw new CompetitionError('DEVELOPMENT_ASSETS_UNSUPPORTED', 404);
      const command = developmentAssetCommandSchema.parse(input);
      if (Object.keys(command.deltas).some((key) => !adapter.assets.includes(key)))
        throw new CompetitionError('DEVELOPMENT_ASSET_UNSUPPORTED', 422);
      return adapter.adjust(auth, command);
    },
  };
}
