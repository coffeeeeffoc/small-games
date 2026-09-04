import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import type {
  GameSessionContext,
  NavigationPort,
  RewardOpportunity,
  RewardOutcome,
  TelemetryPort,
} from '@coffeeeeffoc/game-contract';

/** Construction options fixed when a Game Host is created. */
export type GameHostOptions = {
  session?: Partial<GameSessionContext>;
  content?: DynamicContentEnvelope;
  online?: boolean;
  offer?: (opportunity: RewardOpportunity) => Promise<RewardOutcome>;
  telemetry?: TelemetryPort;
  navigation?: NavigationPort;
};

/** Minimum browser-like storage surface required by the browser adapter. */
export type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
  removeItem(key: string): unknown;
};

/** Public call recorded by the test Game Host adapter. */
export type HostObservation = Readonly<{
  port: 'content' | 'storage' | 'advertising' | 'telemetry' | 'navigation';
  operation: string;
  value?: unknown;
}>;
