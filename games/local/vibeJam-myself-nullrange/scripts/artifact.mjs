import { createHash } from 'node:crypto';
import { readdir, readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function filesIn(directory) {
  const files = [];
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw Error('Artifact/source links are not accepted');
    if (entry.isFile())
      files.push(
        path.relative(directory, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'),
      );
  }
  return files.sort();
}
export async function sourceHash(directory = root) {
  const files = ['package.json', 'tsconfig.json'];
  for (const folder of ['assets', 'settings', 'scripts', 'startup'])
    for (const f of await filesIn(path.join(directory, folder))) {
      // Scene and PCM bytes are reproducible outputs of prepare; core TS remains source.
      if (
        folder === 'assets' &&
        (/^scenes\/main\.scene/.test(f) || f.startsWith('resources/audio/'))
      )
        continue;
      files.push(folder + '/' + f);
    }
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    const bytes = await readFile(path.join(directory, file));
    hash.update(file + '\0');
    hash.update(
      /\.(ts|js|mjs|json|meta|scene|mtl|html|css|svg)$/.test(file)
        ? bytes.toString('utf8').replaceAll('\r\n', '\n')
        : bytes,
    );
  }
  for (const file of ['toolchain.mjs', 'cocos-branding.mjs']) {
    hash.update(file + '\0');
    hash.update(
      (
        await readFile(new URL('../../carding-car/scripts/' + file, import.meta.url), 'utf8')
      ).replaceAll('\r\n', '\n'),
    );
  }
  return hash.digest('hex');
}
export async function runtimeManifest(dist) {
  const files = {};
  for (const file of await filesIn(dist))
    if (file !== 'build-info.json') files[file] = digest(await readFile(path.join(dist, file)));
  return files;
}
export async function verifyPrebuilt(directory) {
  const dist = path.resolve(directory, 'dist');
  if ((await lstat(dist)).isSymbolicLink()) throw Error('Artifact directory cannot be a link');
  const info = JSON.parse(await readFile(path.join(dist, 'build-info.json'), 'utf8'));
  if (
    info.creator !== '3.8.8' ||
    info.target !== 'web-mobile' ||
    info.gameId !== 'vibeJam-myself-nullrange' ||
    info.sourceHash !== (await sourceHash())
  )
    throw Error('Null Range artifact does not match current Creator 3.8.8 sources');
  const declarations = await readFile(path.resolve(directory, 'cc.d.ts'));
  if (
    info.declarationsHash !== digest(declarations) ||
    declarations.length < 100000 ||
    !declarations.toString().includes('declare module "cc"')
  )
    throw Error('Missing or mismatched real Creator declarations');
  const actual = await runtimeManifest(dist),
    expected = info.files;
  if (
    !expected ||
    Array.isArray(expected) ||
    !expected['index.html'] ||
    !Object.keys(expected).some((f) => /^cocos-js\/.+\.js$/.test(f)) ||
    !Object.keys(expected).some((f) => /^assets\/.+\.json$/.test(f)) ||
    JSON.stringify(Object.keys(actual).sort()) !== JSON.stringify(Object.keys(expected).sort())
  )
    throw Error('Incomplete Creator runtime manifest');
  for (const [file, hash] of Object.entries(expected))
    if (!/^[a-f0-9]{64}$/.test(String(hash)) || actual[file] !== hash)
      throw Error('Creator integrity mismatch: ' + file);
  const settings = Object.keys(actual).find((f) => /^src\/settings.*\.json$/.test(f));
  if (
    !settings ||
    JSON.parse(await readFile(path.join(dist, settings), 'utf8')).CocosEngine !== '3.8.8'
  )
    throw Error('Missing Creator engine settings');
  return dist;
}
