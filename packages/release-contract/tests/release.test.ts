import { expect, it } from 'vitest';
import { buildArtifact } from '@coffeeeeffoc/game-artifact';
import { gameManifestSchema } from '@coffeeeeffoc/game-contract';
import {
  createPublishedVersion,
  projectionSchema,
  validatePublishedVersion,
} from '@coffeeeeffoc/release-contract';

it('fixes Artifact and content in a deterministic snapshot while rejecting incompatible/replayed shapes', async () => {
  const keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const manifest = gameManifestSchema.parse({
    gameId: 'cultivation',
    version: '1.1.0',
    gameContractVersion: 1,
    contentSchemaVersion: 2,
    capabilities: ['content', 'storage'],
    loadModes: ['iframe'],
    entry: 'index.html',
    integrity: 'builtin:cultivation@1.1.0',
  });
  const resources = new Map([
    ['index.html', new Uint8Array([1])],
    ['remote-entry.js', new Uint8Array([2])],
  ]);
  const artifact = await buildArtifact(manifest, resources, keys.privateKey, keys.publicKey);
  const content = {
    gameId: 'cultivation',
    schemaVersion: 2,
    revision: 3,
    payload: { title: 'fixture' },
  };
  const first = await createPublishedVersion(artifact, content);
  expect((await createPublishedVersion(artifact, content)).id).toBe(first.id);
  expect((await createPublishedVersion(artifact, { ...content, revision: 4 })).id).not.toBe(
    first.id,
  );
  await expect(validatePublishedVersion(first, keys.publicKey)).resolves.toEqual(first);
  await expect(
    validatePublishedVersion({ ...first, id: '0'.repeat(64) }, keys.publicKey),
  ).rejects.toThrow();
  expect(
    projectionSchema.safeParse({
      formatVersion: 2,
      eventId: crypto.randomUUID(),
      channel: 'stable',
      revision: 1,
      version: first,
    }).success,
  ).toBe(false);
  await expect(
    createPublishedVersion(artifact, { ...content, gameId: 'office' }),
  ).rejects.toThrow();
  await expect(
    createPublishedVersion(artifact, { ...content, schemaVersion: 3 }),
  ).rejects.toThrow();
});
