import { readFile, readdir, lstat, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runCommand } from './platform-process.mjs';
import { managementEnvironment } from './platform-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
// Do not expose signer material to format/lint/test/build child processes.
const suppliedPrivateKey = process.env.ARTIFACT_SIGNING_PRIVATE_KEY;
const suppliedPublicKey = process.env.ARTIFACT_TRUSTED_PUBLIC_KEY;
delete process.env.ARTIFACT_SIGNING_PRIVATE_KEY;
if (Boolean(suppliedPrivateKey) !== Boolean(suppliedPublicKey))
  throw new Error('Supply both Artifact private and public keys');
const run = (args) => runCommand(process.execPath, args, { cwd: root });
await run(['node_modules/prettier/bin/prettier.cjs', '--check', '.']);
await run(['scripts/check-workspace-dependencies.mjs']);
await run([
  '--test',
  'scripts/check-workspace-dependencies.test.mjs',
  'scripts/platform-process.test.mjs',
]);
for (const gate of [
  'lint',
  'typecheck',
  'test',
  'test:contract',
  'test:integration',
  'build',
  'smoke',
]) {
  await run(['node_modules/turbo/bin/turbo', 'run', gate, '--concurrency=2']);
}
const { buildArtifact, hex, unhex } = await import('@coffeeeeffoc/game-artifact');
const { createObjectStore, createArtifactRepository } = await import(
  '@coffeeeeffoc/management-api'
);
let encodedKeys;
if (suppliedPrivateKey)
  encodedKeys = { privateKey: suppliedPrivateKey, publicKey: suppliedPublicKey };
else {
  const directory = new URL('../.scratch/artifact-signing/', import.meta.url);
  const location = new URL('local-key.json', directory);
  await mkdir(directory, { recursive: true });
  try {
    encodedKeys = JSON.parse(await readFile(location, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const keys = {
      privateKey: hex(await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
      publicKey: hex(await crypto.subtle.exportKey('spki', pair.publicKey)),
    };
    try {
      await writeFile(location, JSON.stringify(keys), { flag: 'wx', mode: 0o600 });
      encodedKeys = keys;
    } catch (writeError) {
      if (writeError.code !== 'EEXIST') throw writeError;
      encodedKeys = JSON.parse(await readFile(location, 'utf8'));
    }
  }
}
const privateKey = await crypto.subtle.importKey(
  'pkcs8',
  unhex(encodedKeys.privateKey),
  'Ed25519',
  false,
  ['sign'],
);
const publicKey = await crypto.subtle.importKey(
  'spki',
  unhex(encodedKeys.publicKey),
  'Ed25519',
  true,
  ['verify'],
);
const resources = new Map();
async function collect(directory, prefix = '') {
  if ((await lstat(directory)).isSymbolicLink())
    throw new Error('Artifact directories cannot be symlinks');
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const location = new URL(
      encodeURIComponent(entry.name) + (entry.isDirectory() ? '/' : ''),
      directory,
    );
    if ((await lstat(location)).isSymbolicLink())
      throw new Error('Artifact resources cannot be symlinks');
    if (entry.isDirectory()) await collect(location, prefix + entry.name + '/');
    else if (entry.isFile()) resources.set(prefix + entry.name, await readResource(location));
    else throw new Error('Artifact resources must be regular files');
  }
}
async function readResource(location) {
  const info = await lstat(location);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 20 * 1024 * 1024)
    throw new Error('Invalid Artifact resource');
  return new Uint8Array(await readFile(location));
}
await collect(new URL('../apps/game-cultivation/dist/', import.meta.url));
resources.set(
  'remote-entry.js',
  await readResource(
    new URL('../apps/game-cultivation/dist-iframe/remote-entry.js', import.meta.url),
  ),
);
const manifest = JSON.parse(
  await readFile(
    fileURLToPath(import.meta.resolve('@coffeeeeffoc/game-cultivation/manifest')),
    'utf8',
  ),
);
const descriptor = await buildArtifact(manifest, resources, privateKey, publicKey);
const objects = createObjectStore({
  endpoint: managementEnvironment.S3_ENDPOINT,
  region: managementEnvironment.S3_REGION,
  bucket: managementEnvironment.S3_BUCKET,
  accessKeyId: managementEnvironment.S3_ACCESS_KEY_ID,
  secretAccessKey: managementEnvironment.S3_SECRET_ACCESS_KEY,
});
try {
  await objects.initialize();
  const repository = createArtifactRepository(objects, publicKey);
  await repository.commit(descriptor, resources);
  await repository.read(descriptor.id);
  if (!suppliedPrivateKey)
    await writeFile(
      new URL('../.scratch/artifact-signing/public-key.txt', import.meta.url),
      encodedKeys.publicKey,
      { mode: 0o600 },
    );
  console.log(
    JSON.stringify({
      artifactId: descriptor.id,
      gameVersion: manifest.version,
      signingKeyId: descriptor.manifest.signingKeyId,
      trustedPublicKey: encodedKeys.publicKey,
      resourceCount: resources.size,
    }),
  );
} finally {
  objects.close();
}
