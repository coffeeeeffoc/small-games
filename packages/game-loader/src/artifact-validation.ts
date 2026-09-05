import { HostError, type GameManifest } from '@coffeeeeffoc/game-contract';
import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';

/** Immutable remote candidate, including the content belonging to its published snapshot. */
export type RemoteGameArtifact = Readonly<{
  entryUrl: string;
  manifest: GameManifest;
  publishedVersionId?: string;
  content?: DynamicContentEnvelope;
}>;

const fixedDirectives = new Map<string, string>([
  ['default-src', "'none'"],
  ['script-src', 'data:'],
  ['connect-src', "'none'"],
  ['base-uri', "'none'"],
  ['form-action', "'none'"],
  ['object-src', "'none'"],
]);
const optionalDirectives = new Map<string, string>([
  ['style-src', "'unsafe-inline'"],
  ['img-src', 'data:'],
  ['font-src', 'data:'],
]);

/** Rejects Artifact responses that could access ambient network or arbitrary resources. */
export function requireStrictCsp(csp: string, shellOrigin: string): void {
  const normalized = csp
    .split(';')
    .map((directive) => directive.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  const directives = new Map<string, string>();
  for (const directive of normalized) {
    const separator = directive.indexOf(' ');
    const name = separator === -1 ? directive : directive.slice(0, separator);
    const value = separator === -1 ? '' : directive.slice(separator + 1);
    if (directives.has(name)) throw invalidCsp();
    directives.set(name, value);
  }
  const permitted = new Set([
    ...fixedDirectives.keys(),
    ...optionalDirectives.keys(),
    'frame-ancestors',
  ]);
  if ([...directives.keys()].some((name) => !permitted.has(name))) throw invalidCsp();
  if (
    [...fixedDirectives].some(([name, value]) => directives.get(name) !== value) ||
    [...optionalDirectives].some(
      ([name, value]) => directives.has(name) && directives.get(name) !== value,
    ) ||
    directives.get('frame-ancestors') !== shellOrigin
  ) {
    throw invalidCsp();
  }
}

function invalidCsp(): HostError {
  return new HostError({ code: 'INVALID_INPUT', message: 'Remote Game CSP is not strict enough' });
}

/** Compares the iframe's validated manifest claim with the Catalog selection. */
export function manifestsMatch(actual: GameManifest, expected: GameManifest): boolean {
  return (
    JSON.stringify({ ...actual, integrity: undefined }) ===
    JSON.stringify({ ...expected, integrity: undefined })
  );
}
