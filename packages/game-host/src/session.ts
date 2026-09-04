import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import type { GameSessionContext } from '@coffeeeeffoc/game-contract';
import { gameSessionContextSchema } from '@coffeeeeffoc/game-contract';

export const defaultContent: DynamicContentEnvelope = {
  gameId: 'contract-fixture',
  schemaVersion: 1,
  revision: 0,
  payload: {},
};

const defaultSession: GameSessionContext = {
  gameId: 'contract-fixture',
  gameVersion: '1.0.0',
  releaseChannel: 'development',
  adAuthority: 'none',
  sessionId: 'local-session',
  locale: 'zh-CN',
  capabilities: ['content', 'storage', 'advertising', 'telemetry', 'navigation'],
};

/** Freezes the session and its capability collection to enforce session invariants at runtime. */
export function createSession(overrides: Partial<GameSessionContext> = {}): GameSessionContext {
  const parsed = gameSessionContextSchema.parse({ ...defaultSession, ...overrides });
  return Object.freeze({ ...parsed, capabilities: Object.freeze([...parsed.capabilities]) });
}
