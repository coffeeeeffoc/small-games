import { describe, expect, it } from 'vitest';

import {
  assertHostCapabilities,
  gameManifestSchema,
  hostErrorSchema,
  hostMessageSchema,
} from '@coffeeeeffoc/game-contract';

describe('Game Contract runtime schemas', () => {
  it('validates a complete manifest', () => {
    expect(
      gameManifestSchema.parse({
        gameId: 'cultivation',
        version: '1.0.0',
        gameContractVersion: 1,
        contentSchemaVersion: 1,
        capabilities: ['content', 'storage'],
        loadModes: ['in-process', 'iframe'],
        entry: 'index.html',
        integrity: 'sha256-example',
      }),
    ).toMatchObject({ gameId: 'cultivation', gameContractVersion: 1 });
  });

  it('rejects malformed iframe messages and errors', () => {
    expect(hostMessageSchema.safeParse({ kind: 'request', id: 'only-an-id' }).success).toBe(false);
    expect(
      hostMessageSchema.safeParse({
        kind: 'event',
        protocolVersion: 1,
        gameId: 'cultivation',
        sessionId: 'session',
        name: 'unsafe',
        payload: () => undefined,
      }).success,
    ).toBe(false);
    expect(hostErrorSchema.safeParse({ code: 'NOT_A_REAL_CODE', message: 'bad' }).success).toBe(
      false,
    );
  });

  it('reports a standard error when a required capability is absent', () => {
    expect(() => assertHostCapabilities(['storage'], [])).toThrowError(
      expect.objectContaining({ code: 'CAPABILITY_MISSING' }),
    );
  });
});
