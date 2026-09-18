import { existsSync, createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { editor, editorRoot } from './toolchain.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
function run(command, args) {
  const p = spawnSync(command, args, { stdio: 'inherit', windowsHide: true });
  if (p.status !== 0) throw new Error(`${command} failed: ${p.status}`);
}
async function archive(url, file, hash, referer) {
  if (!existsSync(file))
    run('curl.exe', [
      '--fail',
      '--location',
      '--retry',
      '2',
      ...(referer ? ['--referer', referer, '-A', 'Mozilla/5.0'] : []),
      '-o',
      file,
      url,
    ]);
  const sha = createHash('sha256');
  for await (const chunk of createReadStream(file)) sha.update(chunk);
  if (sha.digest('hex') !== hash) throw new Error(`Checksum mismatch: ${file}`);
}
if (!existsSync(editor)) {
  if (process.platform !== 'win32')
    throw new Error(
      'Install Creator 3.8.8 and set COCOS_CREATOR; automated installation currently supports Windows.',
    );
  await mkdir(editorRoot, { recursive: true });
  const zip = path.join(editorRoot, 'creator-3.8.8.zip');
  await archive(
    'https://download.cocos.com/CocosCreator/v3.8.8/CocosCreator-v3.8.8-win-121518.zip',
    zip,
    'e365030aa4f24b515f499cf093cd86fdf38a0f763b5fbcacb20e96253e0fcc0b',
  );
  run('tar', ['-xf', zip, '-C', editorRoot]);
}
if (
  process.argv.includes('--bilibili') &&
  !existsSync(path.join(root, 'extensions/biligame-builder/package.json'))
) {
  const extension = path.join(root, 'extensions/biligame-builder');
  await mkdir(extension, { recursive: true });
  const zip = path.join(editorRoot, 'biligame-builder-1.0.3.zip');
  await archive(
    'https://dl.hdslb.com/mall/smallapp/biligame-builder-1.0.3.zip',
    zip,
    '4478955bb7ca2a43415713bb04b59b1da28ab659bce372a6635f1c8e0d00cda5',
    'https://miniapp.bilibili.com/',
  );
  run('tar', [
    '-xf',
    zip,
    '-C',
    extension,
    '--exclude=__MACOSX',
    '--exclude=*.DS_Store',
    '--exclude=*/node_modules/.bin/*',
    '--exclude=node_modules/.bin/*',
  ]);
}
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(
  path.join(root, 'reports/engine.d.ts'),
  `/// <reference path="${path.join(editorRoot, 'resources/resources/3d/engine/bin/.declarations/cc.d.ts').replaceAll('\\', '/')}" />\n`,
);
console.log('Creator ready:', editor);
