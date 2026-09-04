import { describe, expect, it } from 'vitest';

import type { GameDefinition, GameHost } from '@coffeeeeffoc/game-contract';
import { HostError } from '@coffeeeeffoc/game-contract';

import {
  assertContentCompatible,
  exerciseGameLifecycle,
  expectHostError,
} from '@coffeeeeffoc/game-contract-test';

const manifest = {
  gameId: 'contract-fixture',
  version: '1.0.0',
  gameContractVersion: 1 as const,
  contentSchemaVersion: 1,
  capabilities: [],
  loadModes: ['in-process' as const],
  entry: 'fixture',
  integrity: 'fixture',
};

describe('Game contract test kit', () => {
  it('exercises the complete lifecycle and repeated mounting', async () => {
    const events: string[] = [];
    const definition: GameDefinition = {
      manifest,
      async mount() {
        events.push('mount');
        return {
          pause: () => events.push('pause'),
          resume: () => events.push('resume'),
          dispose: async () => void events.push('dispose'),
        };
      },
    };

    await exerciseGameLifecycle(definition, {} as HTMLElement, {} as GameHost);
    expect(events).toEqual(['mount', 'pause', 'resume', 'dispose', 'mount', 'dispose']);
  });

  it('detects incompatible content and standard offline errors', async () => {
    const definition: GameDefinition = {
      manifest,
      mount: async () => ({ pause() {}, resume() {}, dispose: async () => undefined }),
    };
    expect(() => assertContentCompatible(definition, 2)).toThrowError(
      expect.objectContaining({ code: 'CONTENT_INCOMPATIBLE' }),
    );
    await expectHostError(async () => {
      throw new HostError({ code: 'OFFLINE', message: 'offline', retryable: true });
    }, 'OFFLINE');
  });
});
