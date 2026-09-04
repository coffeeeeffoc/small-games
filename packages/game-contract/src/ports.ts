import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';

import type { GameSessionContext, JsonValue } from './schemas.js';

/** Versioned value returned by a StoragePort. */
export type StorageRecord = Readonly<{ value: JsonValue; version: string }>;

/** A player-motivated optional reward request, without advertising implementation details. */
export type RewardOpportunity = Readonly<{
  id: string;
  reward: Readonly<Record<string, JsonValue>>;
}>;

/** Observable outcome of a Reward Opportunity. */
export type RewardOutcome = Readonly<{
  status: 'completed' | 'dismissed' | 'unavailable' | 'failed';
}>;

/** Loads the Dynamic Content fixed for the current Game Session. */
export interface ContentPort {
  load(): Promise<DynamicContentEnvelope>;
}

/** Reads and conditionally writes versioned Game save data. */
export interface StoragePort {
  read(key: string): Promise<StorageRecord | null>;
  write(key: string, value: JsonValue, expectedVersion?: string | null): Promise<StorageRecord>;
}

/** Offers rewards without exposing ad placements, SDKs, or completion callbacks. */
export interface AdvertisingPort {
  offer(opportunity: RewardOpportunity): Promise<RewardOutcome>;
}

/** Emits structured Game telemetry through its Host. */
export interface TelemetryPort {
  track(name: string, properties?: Readonly<Record<string, JsonValue>>): Promise<void>;
}

/** Requests navigation owned by the current Shell. */
export interface NavigationPort {
  navigate(destination: string): Promise<void>;
}

/** Complete, framework-neutral capability surface granted to one Game Session. */
export interface GameHost {
  readonly session: GameSessionContext;
  readonly content: ContentPort;
  readonly storage: StoragePort;
  readonly ads: AdvertisingPort;
  readonly telemetry: TelemetryPort;
  readonly navigation: NavigationPort;
}
