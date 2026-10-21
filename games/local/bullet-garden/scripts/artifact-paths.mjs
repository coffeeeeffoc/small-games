import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
const canonical = (value) =>
  process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
/** Validate physical paths before any recursive removal of a restored artifact. */
export async function guardArtifactRestore(source, destination, scope) {
  const sourcePath = await realpath(source);
  const root = await realpath(scope);
  const parent = await realpath(path.dirname(destination));
  if (canonical(parent) !== canonical(root) || path.basename(destination) !== 'dist')
    throw Error('Artifact destination escapes the game workspace.');
  let info;
  try {
    info = await lstat(destination);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (info?.isSymbolicLink())
    throw Error('Artifact destination must not be a symlink or junction.');
  const target = info ? await realpath(destination) : path.join(parent, 'dist');
  if (canonical(path.dirname(target)) !== canonical(root))
    throw Error('Physical artifact destination escapes workspace.');
  const from = canonical(sourcePath),
    to = canonical(target);
  if (from === to) return { copy: false, source: sourcePath, destination: target };
  if (from.startsWith(to + path.sep))
    throw Error('Artifact source is inside the destination to be removed.');
  return { copy: true, source: sourcePath, destination: target };
}
