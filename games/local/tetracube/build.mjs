import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const source = new URL('./', import.meta.url);
const output = new URL('./dist/', import.meta.url);
const sourcePath = fileURLToPath(source);
const outputPath = fileURLToPath(output);
if (path.dirname(path.resolve(outputPath)) !== path.resolve(sourcePath)) {
  throw new Error('Build output must be the game’s dist directory');
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'style.css', 'dev-mode.js', 'fullscreen.js', 'src']) {
  await cp(new URL(name, source), new URL(name, output), { recursive: true });
}
await stat(new URL('src/app.mjs', output));
console.log('Built 重力方舱 → dist/ (relative URLs, no runtime dependencies)');
