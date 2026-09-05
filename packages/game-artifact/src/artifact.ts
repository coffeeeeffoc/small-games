import type { GameManifest } from '@coffeeeeffoc/game-contract';
import {
  ArtifactError,
  artifactManifestSchema,
  signedArtifactSchema,
  type SignedArtifact,
  type ArtifactReader,
  type ImmutableArtifactStore,
  type SigningKey,
} from './model.js';
import { canonicalBytes, sha256, signingKeyId, hex, unhex } from './integrity.js';

/** Builds identical descriptors for identical inputs and signing identity, regardless of map order. */
export async function buildArtifact(
  game: GameManifest,
  resources: ReadonlyMap<string, Uint8Array>,
  privateKey: SigningKey,
  publicKey: SigningKey,
  remoteEntry = 'remote-entry.js',
): Promise<SignedArtifact> {
  const entries = await Promise.all(
    [...resources].map(async ([path, bytes]) => ({
      path,
      size: bytes.byteLength,
      sha256: await sha256(bytes),
    })),
  );
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const manifest = artifactManifestSchema.parse({
    formatVersion: 1,
    game,
    remoteEntry,
    signingKeyId: await signingKeyId(publicKey),
    resources: entries,
  });
  const bytes = canonicalBytes(manifest);
  const result = {
    id: await sha256(bytes),
    manifest,
    signature: hex(await crypto.subtle.sign('Ed25519', privateKey, bytes)),
  };
  await verifyArtifactDescriptor(result, result.id, publicKey);
  return result;
}

/** Checks the expected address, manifest compatibility and independently configured signer. */
export async function verifyArtifactDescriptor(
  input: unknown,
  expectedId: string,
  publicKey: SigningKey,
): Promise<SignedArtifact> {
  const parsed = signedArtifactSchema.safeParse(input);
  if (!parsed.success) throw new ArtifactError('Incompatible Artifact manifest');
  const artifact = parsed.data;
  const bytes = canonicalBytes(artifact.manifest);
  if (artifact.id !== expectedId || (await sha256(bytes)) !== expectedId)
    throw new ArtifactError('Artifact address mismatch');
  if (
    (await signingKeyId(publicKey)) !== artifact.manifest.signingKeyId ||
    !(await crypto.subtle.verify('Ed25519', publicKey, unhex(artifact.signature), bytes))
  )
    throw new ArtifactError('Untrusted Artifact signature');
  return artifact;
}

/** Verifies all signed resources and returns copies; no caller receives unchecked executable bytes. */
export async function verifyArtifactResources(
  artifact: SignedArtifact,
  read: ArtifactReader,
): Promise<Map<string, Uint8Array>> {
  const resources = new Map<string, Uint8Array>();
  for (const resource of artifact.manifest.resources) {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await read(resource.path));
    } catch {
      throw new ArtifactError(`Missing Artifact resource: ${resource.path}`);
    }
    if (bytes.byteLength !== resource.size || (await sha256(bytes)) !== resource.sha256)
      throw new ArtifactError(`Artifact resource integrity mismatch: ${resource.path}`);
    resources.set(resource.path, bytes);
  }
  return resources;
}

/** Resources are checked and conditionally written before the final visibility marker. */
export async function storeArtifact(
  input: unknown,
  resources: ReadonlyMap<string, Uint8Array>,
  publicKey: SigningKey,
  store: ImmutableArtifactStore,
): Promise<SignedArtifact> {
  const parsed = signedArtifactSchema.parse(input);
  const artifact = await verifyArtifactDescriptor(parsed, parsed.id, publicKey);
  const verified = await verifyArtifactResources(artifact, async (path) => {
    const value = resources.get(path);
    if (!value) throw new ArtifactError('Missing resource');
    return value;
  });
  for (const [path, bytes] of verified)
    await store.putImmutable(`artifacts/${artifact.id}/${path}`, bytes);
  await store.putImmutable(`artifacts/${artifact.id}/manifest.json`, canonicalBytes(artifact));
  return artifact;
}

/** Fetches a committed descriptor then verifies every referenced resource before returning. */
export async function readArtifact(id: string, publicKey: SigningKey, read: ArtifactReader) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new ArtifactError('Invalid Artifact address');
  const bytes = await read(`artifacts/${id}/manifest.json`);
  if (bytes.byteLength > 256 * 1024) throw new ArtifactError('Artifact manifest is too large');
  const descriptor = await verifyArtifactDescriptor(
    JSON.parse(new TextDecoder().decode(bytes)),
    id,
    publicKey,
  );
  const resources = await verifyArtifactResources(descriptor, (path) =>
    read(`artifacts/${id}/${path}`),
  );
  return { descriptor, resources };
}
