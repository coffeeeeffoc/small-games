import { randomUUID, webcrypto } from 'node:crypto';
import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import { buildArtifact } from '@coffeeeeffoc/game-artifact';
import { createPublishedVersion } from '@coffeeeeffoc/release-contract';
import { registerReleaseProjection, ProjectionConflict } from '@coffeeeeffoc/runtime-api';

it('authenticates and verifies snapshots before projection, preserving conflict and failure responses', async () => {
  const keys = await webcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  if (!('privateKey' in keys)) throw new Error('Expected signing key pair');
  const artifact = await buildArtifact(
    {
      gameId: 'cultivation',
      version: '1.1.0',
      gameContractVersion: 1,
      contentSchemaVersion: 2,
      capabilities: ['content', 'storage'],
      loadModes: ['iframe'],
      entry: 'index.html',
      integrity: 'builtin:cultivation@1.1.0',
    },
    new Map([
      ['index.html', new Uint8Array([1])],
      ['remote-entry.js', new Uint8Array([2])],
    ]),
    keys.privateKey,
    keys.publicKey,
  );
  const version = await createPublishedVersion(artifact, {
    gameId: 'cultivation',
    schemaVersion: 2,
    revision: 1,
    payload: {},
  });
  const event = {
    formatVersion: 1,
    eventId: randomUUID(),
    channel: 'stable',
    revision: 1,
    version,
  };
  const receipt = { eventId: event.eventId, revision: 1, versionId: version.id };
  const apply = vi.fn().mockResolvedValue(receipt);
  const app = Fastify();
  registerReleaseProjection(app, { apply }, { token: 'fixture-token', publicKey: keys.publicKey });
  const post = (payload: unknown, authorization = 'Bearer fixture-token') =>
    app.inject({
      method: 'POST',
      url: '/internal/v1/releases',
      headers: { authorization, 'content-type': 'application/json' },
      payload: JSON.stringify(payload),
    });
  try {
    expect((await post(event, 'wrong')).statusCode).toBe(401);
    expect((await post({ ...event, formatVersion: 2 })).statusCode).toBe(400);
    expect((await post({ ...event, version: { ...version, id: '0'.repeat(64) } })).statusCode).toBe(
      422,
    );
    expect(apply).not.toHaveBeenCalled();
    expect((await post(event)).json()).toEqual(receipt);
    apply.mockRejectedValueOnce(new ProjectionConflict());
    expect((await post(event)).statusCode).toBe(409);
    apply.mockRejectedValueOnce(new Error('database down'));
    expect((await post(event)).statusCode).toBe(503);
  } finally {
    await app.close();
  }
});
