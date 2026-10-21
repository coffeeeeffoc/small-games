import { createHash } from 'node:crypto';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { platformConfig } from './platform-config.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function sourceHash(directory = root) {
  const files = ['package.json', 'build.mjs', 'platform-build.example.json'];
  for (const folder of ['assets', 'src', 'scripts', 'settings', 'startup']) {
    for (const entry of await readdir(path.join(directory, folder), {
      recursive: true,
      withFileTypes: true,
    })) {
      if (
        entry.isFile() &&
        !path.join(entry.parentPath, entry.name).includes(`${path.sep}generated${path.sep}`) &&
        entry.name !== 'generated.meta'
      )
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
      /\.(ts|[cm]?js|json|meta|scene|html|css)$/.test(file)
        ? bytes.toString('utf8').replaceAll('\r\n', '\n')
        : bytes,
    );
  }
  // CI computes this before pnpm install. Only Node builtins and a reviewed list
  // of shared functions actually called by these builders participate here.
  for (const file of [
    '../../carding-car/scripts/toolchain.mjs',
    '../../carding-car/scripts/cocos-branding.mjs',
    '../../../../platforms/h5/platform-ads.js',
    '../../../../apps/shell-minigame/scripts/taptap-cocos-inputs.mjs',
    '../../../../apps/shell-minigame/scripts/taptap-package.mjs',
  ]) {
    hash.update(file + '\0');
    hash.update((await readFile(new URL(file, import.meta.url), 'utf8')).replaceAll('\r\n', '\n'));
  }
  return hash.digest('hex');
}
export async function verifyPrebuilt(directory, channel) {
  channel ??= await platformConfig(process.env.BULLET_GARDEN_PLATFORM_CONFIG);
  const dist = path.resolve(directory, 'dist');
  const info = JSON.parse(await readFile(path.join(dist, 'build-info.json'), 'utf8'));
  if (
    JSON.stringify(info.channel) !== JSON.stringify(channel) ||
    info.creator !== '3.8.8' ||
    info.target !== 'web-mobile' ||
    info.sourceHash !== (await sourceHash())
  )
    throw Error(
      'Bullet Garden artifact does not match current sources; rebuild with Creator 3.8.8.',
    );
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
    throw Error('Incomplete Creator runtime manifest; rebuild Bullet Garden.');
  for (const [file, expected] of Object.entries(files)) {
    const resolved = path.resolve(dist, file);
    if (!resolved.startsWith(dist + path.sep) || !/^[a-f0-9]{64}$/.test(String(expected)))
      throw Error('Invalid Creator runtime manifest entry.');
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
