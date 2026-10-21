import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import type { GameDefinition, GameSessionContext, StoragePort } from '@coffeeeeffoc/game-contract';
import type { RemoteGameArtifact } from '@coffeeeeffoc/game-loader';
import type { ManagedAdConfig } from '@coffeeeeffoc/ad-config';

/** A selected Game, after its trusted local module has loaded. */
export type BuiltInGame = Readonly<{
  id: string;
  title: string;
  description: string;
  definition: GameDefinition;
  content: DynamicContentEnvelope;
  remote?: Readonly<{ target: RemoteGameArtifact }>;
  runtimeSession?: GameSessionContext;
  runtimeStorage?: StoragePort;
  managedAdPlan?: ManagedAdConfig;
  playerId?: string;
}>;

export type LazyBuiltInGame = Pick<BuiltInGame, 'id' | 'title' | 'description'> & {
  load: () => Promise<Pick<BuiltInGame, 'definition' | 'content' | 'remote'>>;
};

export async function loadBuiltInGame(game: BuiltInGame | LazyBuiltInGame): Promise<BuiltInGame> {
  if (!('load' in game)) return game;
  const { load, ...metadata } = game;
  return { ...metadata, ...(await load()) };
}

/** Remaining games use independent entries; keep the trusted mounting contract available. */
export const builtInGameRegistry: readonly LazyBuiltInGame[] = [];
