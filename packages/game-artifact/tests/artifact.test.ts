import { beforeEach, expect, it } from 'vitest';
import { gameManifestSchema } from '@coffeeeeffoc/game-contract';
import {
  buildArtifact,
  readArtifact,
  storeArtifact,
  verifyArtifactDescriptor,
  canonicalBytes,
  sha256,
  type ImmutableArtifactStore,
  type SigningKey,
} from '@coffeeeeffoc/game-artifact';

const game = gameManifestSchema.parse({
  gameId: 'cultivation',
  version: '1.1.0',
  gameContractVersion: 1,
  contentSchemaVersion: 2,
  capabilities: ['content', 'storage'],
  loadModes: ['iframe'],
  entry: 'index.html',
  integrity: 'builtin:cultivation@1.1.0',
});
const encode = (text: string) => new TextEncoder().encode(text);
let keys: { privateKey: SigningKey; publicKey: SigningKey };
let resources: Map<string, Uint8Array>;
let objects: Map<string, Uint8Array>;
let store: ImmutableArtifactStore;
beforeEach(async () => {
  keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  resources = new Map([
    ['index.html', encode('<script type="module" src="./remote-entry.js"></script>')],
    ['remote-entry.js', encode('export const ready = true;')],
  ]);
  objects = new Map();
  store = {
    get: async (key) => {
      const result = objects.get(key);
      if (!result) throw new Error('missing');
      return result;
    },
    putImmutable: async (key, bytes) => {
      const old = objects.get(key);
      if (old && (await sha256(old)) !== (await sha256(bytes))) throw new Error('conflict');
      objects.set(key, new Uint8Array(bytes));
    },
  };
});
const build = () => buildArtifact(game, resources, keys.privateKey, keys.publicKey);
it('builds deterministically across input ordering and commits idempotently with a final marker', async () => {
  const first = await build();
  const second = await buildArtifact(
    game,
    new Map([...resources].reverse()),
    keys.privateKey,
    keys.publicKey,
  );
  expect(second).toEqual(first);
  await storeArtifact(first, resources, keys.publicKey, store);
  await storeArtifact(second, resources, keys.publicKey, store);
  expect(objects.size).toBe(3);
  expect([...objects.keys()].at(-1)).toBe(`artifacts/${first.id}/manifest.json`);
  const verified = await readArtifact(first.id, keys.publicKey, store.get);
  expect(verified.resources).toEqual(resources);
});
it('rejects resource tampering, missing files, untrusted keys and changed signatures', async () => {
  const artifact = await build();
  await storeArtifact(artifact, resources, keys.publicKey, store);
  const key = `artifacts/${artifact.id}/remote-entry.js`;
  objects.set(key, encode('tampered'));
  await expect(readArtifact(artifact.id, keys.publicKey, store.get)).rejects.toThrow('integrity');
  objects.delete(key);
  await expect(readArtifact(artifact.id, keys.publicKey, store.get)).rejects.toThrow('Missing');
  const other = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  await expect(verifyArtifactDescriptor(artifact, artifact.id, other.publicKey)).rejects.toThrow(
    'signature',
  );
  await expect(
    verifyArtifactDescriptor(
      { ...artifact, signature: '0'.repeat(128) },
      artifact.id,
      keys.publicKey,
    ),
  ).rejects.toThrow('signature');
});
it('rejects incompatible metadata, address swaps, traversal and missing required resources', async () => {
  const artifact = await build();
  const bad = structuredClone(artifact);
  bad.manifest.game.gameContractVersion = 2 as 1;
  await expect(verifyArtifactDescriptor(bad, artifact.id, keys.publicKey)).rejects.toThrow(
    'Incompatible',
  );
  await expect(verifyArtifactDescriptor(artifact, '0'.repeat(64), keys.publicKey)).rejects.toThrow(
    'address',
  );
  resources.set('../escape.js', encode('bad'));
  await expect(build()).rejects.toThrow();
  resources.delete('../escape.js');
  resources.delete('remote-entry.js');
  await expect(build()).rejects.toThrow();
});
it('does not expose a completion marker when object storage fails and safely retries', async () => {
  const artifact = await build();
  let count = 0;
  const faulty = {
    ...store,
    putImmutable: async (key: string, bytes: Uint8Array) => {
      if (++count === 2) throw new Error('storage offline');
      await store.putImmutable(key, bytes);
    },
  };
  await expect(storeArtifact(artifact, resources, keys.publicKey, faulty)).rejects.toThrow(
    'storage offline',
  );
  expect(objects.has(`artifacts/${artifact.id}/manifest.json`)).toBe(false);
  await storeArtifact(artifact, resources, keys.publicKey, store);
  expect((await readArtifact(artifact.id, keys.publicKey, store.get)).descriptor).toEqual(artifact);
});
it('refuses conflicting bytes at an existing immutable address', async () => {
  const artifact = await build();
  const key = `artifacts/${artifact.id}/remote-entry.js`;
  objects.set(key, encode('old value'));
  await expect(storeArtifact(artifact, resources, keys.publicKey, store)).rejects.toThrow(
    'conflict',
  );
  expect(objects.get(key)).toEqual(encode('old value'));
  expect(objects.has(`artifacts/${artifact.id}/manifest.json`)).toBe(false);
  const changed = {
    ...artifact,
    manifest: { ...artifact.manifest, game: { ...game, version: 'evil' } },
  };
  changed.id = await sha256(canonicalBytes(changed.manifest));
  await expect(verifyArtifactDescriptor(changed, changed.id, keys.publicKey)).rejects.toThrow(
    'signature',
  );
});

it('rejects Windows reserved and normalizing names and case-insensitive marker collisions', async () => {
  for (const path of [
    'CON',
    'nul.js',
    'assets/Lpt9.css',
    'assets/foo.',
    'Manifest.json',
    'assets/../escape',
    'assets//file',
  ]) {
    const unsafe = new Map(resources);
    unsafe.set(path, encode('bad'));
    await expect(buildArtifact(game, unsafe, keys.privateKey, keys.publicKey)).rejects.toThrow();
  }
  const duplicate = new Map(resources);
  duplicate.set('INDEX.HTML', encode('bad'));
  await expect(buildArtifact(game, duplicate, keys.privateKey, keys.publicKey)).rejects.toThrow();
});
