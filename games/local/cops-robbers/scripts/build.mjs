import { copyFile, lstat, mkdir, readdir, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const output = resolve(root, 'dist');
const rel = relative(root, output);
if (isAbsolute(rel) || rel !== 'dist') throw new Error('构建输出必须为项目内的 dist 目录。');
await mkdir(output, { recursive: true });
if (await realpath(output) !== output) throw new Error('不向符号链接 dist 写入构建产物。');
const extensions = new Set(['.html', '.js', '.css', '.svg', '.json', '.png', '.webp', '.jpg', '.jpeg', '.ico', '.woff2', '.mp3', '.wav']);
let copied = 0;
async function copy(source, destination) {
  const info = await lstat(source);
  if (info.isSymbolicLink()) throw new Error(`构建不接受符号链接：${source}`);
  try {
    if ((await lstat(destination)).isSymbolicLink()) throw new Error(`输出目标不能是符号链接：${destination}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const target = relative(output, destination);
  if (isAbsolute(target) || target === '..' || target.startsWith(`..${sep}`)) throw new Error('构建输出越界。');
  if (info.isDirectory()) {
    await mkdir(destination, { recursive: true });
    for (const name of await readdir(source)) {
      if (!name.startsWith('.')) await copy(resolve(source, name), resolve(destination, name));
    }
  } else if (info.isFile() && extensions.has(extname(source).toLowerCase())) {
    await copyFile(source, destination);
    copied++;
  }
}
await copy(resolve(root, 'index.html'), resolve(output, 'index.html'));
await copy(resolve(root, 'src'), resolve(output, 'src'));
for (const name of ['assets', 'favicon.svg', 'favicon.ico', 'favicon.png']) {
  try { await lstat(resolve(root, name)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  await copy(resolve(root, name), resolve(output, name));
}
console.log(`已复制 ${copied} 个游戏文件到 ${output}；现有其他文件保留。`);
