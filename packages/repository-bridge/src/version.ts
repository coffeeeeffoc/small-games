/** Lowercase hex SHA-256, the version format both bridge sides compare. */
export const CONTENT_VERSION_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Derives the content version used for optimistic concurrency.
 *
 * Uses WebCrypto so the Workspace Agent and Creator Studio compute identical
 * versions from identical bytes without sharing a secret.
 */
export async function contentVersion(source: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
