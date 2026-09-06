import {
  canonicalBytes,
  sha256,
  verifyArtifactDescriptor,
  type SignedArtifact,
  type SigningKey,
} from '@coffeeeeffoc/game-artifact';
import { publishedVersionSchema, type PublishedVersion } from './model.js';
import type { ManagedAdConfig } from '@coffeeeeffoc/ad-config';

/** Snapshots content without mutating the draft, preserving repeatable publication identity. */
export async function createPublishedVersion(
  artifact: SignedArtifact,
  content: unknown,
  advertising?: ManagedAdConfig,
): Promise<PublishedVersion> {
  const candidate = publishedVersionSchema.parse({
    id: '0'.repeat(64),
    gameId: artifact.manifest.game.gameId,
    artifact,
    content,
    ...(advertising ? { advertising } : {}),
  });
  return {
    ...candidate,
    id: await sha256(
      canonicalBytes({
        artifactId: candidate.artifact.id,
        content: candidate.content,
        ...(candidate.advertising ? { advertising: candidate.advertising } : {}),
      }),
    ),
  };
}

/** Runtime validates the immutable identity and configured signer before accepting a projection. */
export async function validatePublishedVersion(
  input: unknown,
  publicKey: SigningKey,
): Promise<PublishedVersion> {
  const version = publishedVersionSchema.parse(input);
  const expected = await createPublishedVersion(
    version.artifact,
    version.content,
    version.advertising,
  );
  if (version.id !== expected.id) throw new Error('Published snapshot identity mismatch');
  await verifyArtifactDescriptor(version.artifact, version.artifact.id, publicKey);
  return version;
}
