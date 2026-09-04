import {
  assertHostCapabilities,
  type GameHost,
  type GameSessionContext,
  type RewardOpportunity,
  type RewardOutcome,
} from '@coffeeeeffoc/game-contract';

import { expectHostError, expectSynchronousHostError, invariant } from './assertions.js';

/** Portable construction options used by shared Game Host behavior vectors. */
export type HostAdapterContractOptions = {
  online?: boolean;
  session?: Partial<GameSessionContext>;
  offer?: (opportunity: RewardOpportunity) => Promise<RewardOutcome>;
};

/** Factory implemented by Browser, in-memory, test, and future Game Host adapters. */
export type HostAdapterContractFactory = (options?: HostAdapterContractOptions) => GameHost;

/** One reusable, framework-neutral Game Host behavior vector. */
export type HostAdapterContractCase = {
  name: string;
  run(createHost: HostAdapterContractFactory): Promise<void>;
};

/** Shared behavior vectors for every Game Host adapter. */
export const hostAdapterContractCases: readonly HostAdapterContractCase[] = [
  {
    name: 'exposes an immutable Game Session',
    async run(createHost) {
      invariant(Object.isFrozen(createHost().session), 'Game Session must be frozen');
    },
  },
  {
    name: 'reports a missing optional capability with a standard error',
    async run(createHost) {
      const host = createHost({ session: { capabilities: [] } });
      expectSynchronousHostError(
        () => assertHostCapabilities(['storage'], host.session.capabilities),
        'CAPABILITY_MISSING',
      );
    },
  },
  {
    name: 'round-trips versioned storage and rejects stale writes',
    async run(createHost) {
      const host = createHost();
      const first = await host.storage.write('save', { chapter: 1 }, null);
      const loaded = await host.storage.read('save');
      invariant(JSON.stringify(loaded) === JSON.stringify(first), 'Storage did not round-trip');
      await expectHostError(
        () => host.storage.write('save', { chapter: 2 }, 'stale-version'),
        'CONFLICT',
      );
    },
  },
  {
    name: 'reports local save failure while offline',
    async run(createHost) {
      const host = createHost({ online: false });
      await expectHostError(() => host.storage.write('save', { chapter: 1 }), 'OFFLINE');
    },
  },
  {
    name: 'returns compatible Dynamic Content',
    async run(createHost) {
      const content = await createHost().content.load();
      invariant(content.schemaVersion > 0 && content.gameId.length > 0, 'Content is invalid');
    },
  },
  {
    name: 'prevents none Ad Authority from invoking an ad provider',
    async run(createHost) {
      let providerCalls = 0;
      const host = createHost({
        session: { adAuthority: 'none' },
        offer: async () => {
          providerCalls += 1;
          return { status: 'completed' };
        },
      });
      const outcome = await host.ads.offer({ id: 'continue', reward: { lives: 1 } });
      invariant(outcome.status === 'unavailable', 'none authority must be unavailable');
      invariant(providerCalls === 0, 'none authority invoked an ad provider');
    },
  },
  {
    name: 'delegates a Host Ad without exposing provider details',
    async run(createHost) {
      const host = createHost({
        session: { adAuthority: 'host' },
        offer: async () => ({ status: 'completed' }),
      });
      const outcome = await host.ads.offer({ id: 'continue', reward: { lives: 1 } });
      invariant(outcome.status === 'completed', 'Host Ad provider outcome was not preserved');
    },
  },
];
