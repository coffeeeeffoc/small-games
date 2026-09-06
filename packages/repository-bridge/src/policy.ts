/** Extensions the Repository Bridge may read and write inside a Game. */
export const EDITABLE_SOURCE_EXTENSIONS: readonly string[] = [
  '.css',
  '.html',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
];

// The rejected characters are the policy; spelling them as a regex is the clearest audit surface.
// eslint-disable-next-line no-control-regex
const NON_TEXT_CODE_POINTS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]|[\uD800-\uDFFF]/;

function extensionOf(fileName: string) {
  const index = fileName.lastIndexOf('.');
  return index <= 0 ? '' : fileName.slice(index).toLowerCase();
}

/**
 * Reports whether a Game-relative path names an editable text source.
 *
 * Paths use forward slashes only; traversal segments, empty segments, absolute
 * paths, and every non-allowlisted extension are rejected before any filesystem
 * access happens.
 */
export function isEditableSourcePath(relativePath: string): boolean {
  if (relativePath === '' || relativePath.includes('\\')) return false;
  const segments = relativePath.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..'))
    return false;
  return EDITABLE_SOURCE_EXTENSIONS.includes(extensionOf(segments[segments.length - 1]!));
}

/**
 * Reports whether source content is plain text that can round-trip UTF-8.
 *
 * Binary payloads are rejected here so the Workspace Agent never writes them,
 * even when a caller claims an allowlisted extension.
 */
export function isTextContent(source: string): boolean {
  return !NON_TEXT_CODE_POINTS.test(source);
}
