import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

export async function clearOutput(directory) {
  // Keep the project root: Windows tools can hold it open during a rebuild.
  await mkdir(directory, { recursive: true });
  for (const name of await readdir(directory)) {
    await rm(path.join(directory, name), { recursive: true, force: true, maxRetries: 3 });
  }
}
