import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createObjectStore, createArtifactRepository } from '@coffeeeeffoc/management-api';
import { unhex, readArtifact } from '@coffeeeeffoc/game-artifact';
import { childEnvironment } from './platform-process.mjs';
import { managementEnvironment } from './platform-config.mjs';

const build = async () => {
  const result = await promisify(execFile)(process.execPath, ['scripts/build-artifact.mjs'], {
    env: childEnvironment(),
    timeout: 300_000,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  });
  return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
};
const first = await build();
const second = await build();
assert.equal(first.artifactId, second.artifactId);
assert.equal(first.signingKeyId, second.signingKeyId);
const publicKey = await crypto.subtle.importKey(
  'spki',
  unhex(first.trustedPublicKey),
  'Ed25519',
  true,
  ['verify'],
);
const options = {
  endpoint: managementEnvironment.S3_ENDPOINT,
  region: managementEnvironment.S3_REGION,
  bucket: managementEnvironment.S3_BUCKET,
  accessKeyId: managementEnvironment.S3_ACCESS_KEY_ID,
  secretAccessKey: managementEnvironment.S3_SECRET_ACCESS_KEY,
};
const objects = createObjectStore(options);
const unavailable = createObjectStore({ ...options, endpoint: 'http://127.0.0.1:1' });
try {
  const verified = await createArtifactRepository(objects, publicKey).read(first.artifactId);
  assert(verified.resources.has('index.html'));
  assert(verified.resources.has('remote-entry.js'));
  assert(verified.resources.size >= 4);
  const remoteKey = `artifacts/${first.artifactId}/remote-entry.js`;
  const original = await objects.get(remoteKey);
  await objects.putImmutable(remoteKey, original);
  await assert.rejects(
    objects.putImmutable(remoteKey, new TextEncoder().encode('tampered')),
    /different bytes/,
  );
  assert.deepEqual(await objects.get(remoteKey), original);
  await assert.rejects(objects.put(remoteKey, original), /conditional/);
  await assert.rejects(
    readArtifact(first.artifactId, publicKey, (key) =>
      key === remoteKey ? Promise.resolve(new Uint8Array([1])) : objects.get(key),
    ),
    /integrity/,
  );
  await assert.rejects(
    readArtifact(first.artifactId, publicKey, async (key) => {
      if (key === remoteKey) throw new Error('missing');
      return objects.get(key);
    }),
    /Missing/,
  );
  await assert.rejects(createArtifactRepository(unavailable, publicKey).read(first.artifactId));
  console.log(
    `Live deterministic Artifact builds, S3 conditional-write idempotence/overwrite rejection, verified reads and storage-fault rejection passed: ${first.artifactId}`,
  );
} finally {
  objects.close();
  unavailable.close();
}
