import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const target = resolve('dist');
if (target !== resolve(process.cwd(), 'dist')) throw new Error('Invalid build target');
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp('index.html', `${target}/index.html`);
await cp('src', `${target}/src`, { recursive: true });
try { for (const file of await readdir('public')) await cp(`public/${file}`, `${target}/${file}`, { recursive: true }); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
console.log('Built static game → dist/');
