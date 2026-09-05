import { z } from 'zod';
import type { webcrypto } from 'node:crypto';
import { gameManifestSchema } from '@coffeeeeffoc/game-contract';
/** Structural Web Crypto key type, usable without ambient DOM declarations in services. */
export type SigningKey = webcrypto.CryptoKey;

/** Portable, unambiguous object paths; no traversal, absolute paths or URL interpretation. */
export const artifactPathSchema = z
  .string()
  .max(240)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/)
  .refine((value) =>
    value
      .split('/')
      .every(
        (part) =>
          part !== '' &&
          !part.endsWith('.') &&
          !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
      ),
  );
const hash = z.string().regex(/^[a-f0-9]{64}$/);
/** Signed, versioned metadata binds every resource and its compatible Game identity. */
export const artifactManifestSchema = z
  .object({
    formatVersion: z.literal(1),
    game: gameManifestSchema.strict(),
    remoteEntry: artifactPathSchema,
    signingKeyId: hash,
    resources: z
      .array(
        z
          .object({
            path: artifactPathSchema,
            sha256: hash,
            size: z
              .number()
              .int()
              .min(0)
              .max(20 * 1024 * 1024),
          })
          .strict(),
      )
      .min(2)
      .max(256),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const paths = manifest.resources.map((resource) => resource.path);
    if (
      new Set(paths.map((path) => path.toLowerCase())).size !== paths.length ||
      paths.some((path) => path.toLowerCase() === 'manifest.json')
    )
      ctx.addIssue({ code: 'custom', message: 'Duplicate or reserved resource path' });
    if (
      !paths.includes(manifest.game.entry) ||
      !manifest.game.entry.endsWith('.html') ||
      !paths.includes(manifest.remoteEntry) ||
      !manifest.remoteEntry.endsWith('.js') ||
      !manifest.game.loadModes.includes('iframe')
    )
      ctx.addIssue({ code: 'custom', message: 'Missing compatible HTML or iframe entry' });
    if (manifest.resources.reduce((sum, resource) => sum + resource.size, 0) > 100 * 1024 * 1024)
      ctx.addIssue({ code: 'custom', message: 'Artifact is too large' });
  });
/** Content address and Ed25519 signature over canonical manifest bytes. */
export const signedArtifactSchema = z
  .object({
    id: hash,
    manifest: artifactManifestSchema,
    signature: z.string().regex(/^[a-f0-9]{128}$/),
  })
  .strict();
/** Untrusted descriptors must pass signature/address verification before resource fetching. */
export type SignedArtifact = z.infer<typeof signedArtifactSchema>;
/** Byte reader used by both object storage and browser-facing delivery adapters. */
export type ArtifactReader = (key: string) => Promise<Uint8Array>;
/** Conditional writes must reject a different existing value, never overwrite it. */
export interface ImmutableArtifactStore {
  get: ArtifactReader;
  putImmutable(key: string, bytes: Uint8Array): Promise<void>;
}
/** Fails closed on malformed metadata, untrusted signatures, missing or changed bytes. */
export class ArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArtifactError';
  }
}
