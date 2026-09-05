import {
  readArtifact,
  storeArtifact,
  type ImmutableArtifactStore,
  type SigningKey,
} from '@coffeeeeffoc/game-artifact';

/** Management's verified immutable storage adapter; its public key is configured out-of-band. */
export function createArtifactRepository(objects: ImmutableArtifactStore, publicKey: SigningKey) {
  return {
    commit: (descriptor: unknown, resources: ReadonlyMap<string, Uint8Array>) =>
      storeArtifact(descriptor, resources, publicKey, objects),
    read: (id: string) => readArtifact(id, publicKey, objects.get),
  };
}
