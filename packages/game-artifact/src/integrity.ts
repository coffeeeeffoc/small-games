import { ArtifactError, type SigningKey } from './model.js';

/** Sorted object keys and preserved array order provide deterministic JSON signing bytes. */
export function canonicalBytes(value: unknown): Uint8Array<ArrayBuffer> {
  function sorted(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(sorted);
    if (input !== null && typeof input === 'object')
      return Object.fromEntries(
        Object.entries(input)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, entry]) => [key, sorted(entry)]),
      );
    return input;
  }
  return new TextEncoder().encode(JSON.stringify(sorted(value)));
}
/** Hex encoding avoids platform-specific Buffer dependencies in readers. */
export const hex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
/** Decodes a validated hex key/signature without accepting malformed suffixes. */
export function unhex(value: string): Uint8Array<ArrayBuffer> {
  if (!/^(?:[a-f0-9]{2})+$/.test(value)) throw new ArtifactError('Invalid hex encoding');
  return Uint8Array.from(value.match(/../g)!, (pair) => parseInt(pair, 16));
}
/** SHA-256 resource/address digest using the same Web Crypto API in Node and browsers. */
export async function sha256(bytes: Uint8Array) {
  return hex(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)));
}
/** Key ID is derived from the externally trusted SPKI key, never from an embedded claim. */
export async function signingKeyId(key: SigningKey) {
  return sha256(new Uint8Array(await crypto.subtle.exportKey('spki', key)));
}
