import { createHash } from 'node:crypto';
import { access, readdir, readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function sourceHash(directory = root) {
  const files = ['package.json', 'tsconfig.json', 'build.mjs', 'publishing/icon/tetracube.png'];
  for (const folder of ['assets', 'scripts', 'settings', 'startup']) {
    for (const entry of await readdir(path.join(directory, folder), {
      recursive: true,
      withFileTypes: true,
    })) {
      if (entry.isFile())
        files.push(
          path.relative(directory, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'),
        );
    }
  }
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    const bytes = await readFile(path.join(directory, file));
    hash.update(file + '\0');
    hash.update(
      /\.(ts|js|mjs|json|meta|scene|html|css)$/.test(file)
        ? bytes.toString('utf8').replaceAll('\r\n', '\n')
        : bytes,
    );
  }
  // Runtime wrappers and the actual Creator launcher participate in provenance.
  for (const file of [
    '../../carding-car/scripts/toolchain.mjs',
    '../../carding-car/scripts/native-targets.mjs',
    '../../carding-car/scripts/clear-output.mjs',
    '../../../../scripts/h5-ad-config.mjs',
    '../../bullet-garden/scripts/artifact-paths.mjs',
    '../../../../platforms/h5/game-rewards.js',
    '../../../../platforms/h5/platform-ads.js',
    '../../../../platforms/h5/interstitial.js',
  ]) {
    hash.update(file + '\0');
    hash.update((await readFile(new URL(file, import.meta.url), 'utf8')).replaceAll('\r\n', '\n'));
  }
  return hash.digest('hex');
}
export async function verifyPrebuilt(directory) {
  const dist = path.resolve(directory, 'dist');
  const info = JSON.parse(await readFile(path.join(dist, 'build-info.json'), 'utf8'));
  if (
    info.creator !== '3.8.8' ||
    info.target !== 'web-mobile' ||
    info.sourceHash !== (await sourceHash())
  )
    throw Error('Tetracube artifact does not match current sources; rebuild with Creator 3.8.8.');
  await access(path.join(dist, 'index.html'));
  await access(path.resolve(directory, 'cc.d.ts'));
  const files = info.files;
  if (
    !files ||
    typeof files !== 'object' ||
    Array.isArray(files) ||
    !Object.keys(files).some((file) => /^assets\/.+\.(js|json)$/.test(file)) ||
    !Object.keys(files).some((file) => /\.js$/.test(file)) ||
    !files['index.html']
  )
    throw Error('Incomplete Creator runtime manifest; rebuild Tetracube.');
  for (const [file, expected] of Object.entries(files)) {
    const resolved = path.resolve(dist, file);
    if (
      !resolved.startsWith(dist + path.sep) ||
      file.includes('\\') ||
      file.split('/').includes('..') ||
      !/^[a-f0-9]{64}$/.test(String(expected))
    )
      throw Error('Invalid Creator runtime manifest entry.');
    if ((await lstat(resolved)).isSymbolicLink())
      throw Error('Creator runtime cannot contain links.');
    const actual = createHash('sha256')
      .update(await readFile(resolved))
      .digest('hex');
    if (actual !== expected) throw Error(`Creator runtime integrity mismatch: ${file}`);
  }
  if (
    JSON.stringify(Object.keys(await runtimeManifest(dist)).sort()) !==
    JSON.stringify(Object.keys(files).sort())
  )
    throw Error('Creator artifact contains untracked runtime files.');
  return dist;
}

export async function runtimeManifest(dist) {
  for (const entry of await readdir(dist, { recursive: true, withFileTypes: true }))
    if (entry.isSymbolicLink()) throw Error('Creator runtime cannot contain links.');
  const files = {};
  for (const file of (await readdir(dist, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(dist, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'),
    )
    .sort()) {
    if (file !== 'build-info.json')
      files[file] = createHash('sha256')
        .update(await readFile(path.join(dist, file)))
        .digest('hex');
  }
  return files;
}
