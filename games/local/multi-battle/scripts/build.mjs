import { mkdir, cp, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
await mkdir(out, { recursive: true });
await copyFile(path.join(root, 'index.html'), path.join(out, 'index.html'));
await cp(path.join(root, 'src'), path.join(out, 'src'), { recursive: true });
console.log('Static build ready: dist/index.html');
