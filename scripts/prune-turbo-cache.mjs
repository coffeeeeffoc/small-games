import assert from 'node:assert/strict';
import { lstat, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Bound each workflow writer independently; remove only local disposable task cache files.
export async function pruneTurboCache(directory, budget = 512 * 1024 * 1024) {
  assert(Number.isSafeInteger(budget) && budget >= 0, 'Invalid cache budget');
  let entries;
  try {
    assert(!(await lstat(directory)).isSymbolicLink(), 'Cache directory must not be a symlink');
    entries = await readdir(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return { keptBytes: 0, removedBytes: 0 };
    throw error;
  }
  const groups = new Map();
  for (const name of entries) {
    const match = /^([a-f0-9]+)(?:\.tar\.zst|-(?:meta|manifest)\.json)$/.exec(name);
    if (!match) continue;
    const filename = path.join(directory, name);
    const info = await lstat(filename);
    assert(info.isFile(), 'Task cache entry must be a regular file: ' + name);
    const group = groups.get(match[1]) ?? { files: [], bytes: 0, modified: 0 };
    group.files.push(filename);
    group.bytes += info.size;
    group.modified = Math.max(group.modified, info.mtimeMs);
    groups.set(match[1], group);
  }
  let keptBytes = 0,
    removedBytes = 0;
  for (const group of [...groups.values()].sort((a, b) => b.modified - a.modified)) {
    if (keptBytes + group.bytes <= budget) keptBytes += group.bytes;
    else {
      for (const filename of group.files) await unlink(filename);
      removedBytes += group.bytes;
    }
  }
  return { keptBytes, removedBytes };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(await pruneTurboCache('.turbo/cache')));
