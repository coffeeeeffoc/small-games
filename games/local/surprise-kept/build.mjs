import { cp, mkdir, rm, stat, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadCatalog } from './src/content/loader.js';

const output = new URL('./dist/', import.meta.url);
const sourceRoot = path.resolve(fileURLToPath(new URL('./', import.meta.url)));
const outputPath = path.resolve(fileURLToPath(output));
if (path.dirname(outputPath) !== sourceRoot || path.basename(outputPath) !== 'dist')
  throw new Error('Unsafe build output path');
await loadCatalog(async (url) => ({
  ok: true,
  json: async () => JSON.parse(await readFile(url, 'utf8')),
}));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'dev-mode.js', 'styles.css', 'src', 'content']) {
  await cp(new URL(name, import.meta.url), new URL(name, output), { recursive: true });
}
await stat(new URL('src/main.js', output));
console.log('Built 惊喜别穿帮 → dist/ (relative URLs, no runtime dependencies)');
