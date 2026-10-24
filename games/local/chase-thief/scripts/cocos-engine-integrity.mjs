/** Offline integrity checks shared by the builder and pure asset tests. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const VERSION = '3.8.8';
export const COMMIT = '411f98df047c25902f93440d4b22925c2fb65461';
export const ARCHIVE_SHA = 'f8cddbb7ffac468922f71391f86d5c715e2c26406c97dd421668026789138c50';
export const LOCK_SHA = '12269fb637c5987375797a2f095b015f19fe55d08b5903c403ef1abeec19dfd6';
export const CCBUILD = '2.3.16';
export const FEATURES = Object.freeze([
  'base',
  'gfx-webgl',
  'gfx-webgl2',
  '3d',
  'primitive',
  'animation',
  'skeletal-animation',
  '2d',
  'ui',
  'graphics',
  'tween',
  'audio',
  'legacy-pipeline',
]);
const root = fileURLToPath(new URL('../', import.meta.url));
const vendor = path.join(root, 'vendor/cocos');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function assert(value, message) {
  if (!value) throw new Error(message);
}
export async function verifyEngine(directory = vendor) {
  const info = JSON.parse(await readFile(path.join(directory, 'provenance.json'), 'utf8'));
  assert(
    info.engine === 'Cocos Engine' && info.version === VERSION && info.sourceCommit === COMMIT,
    'Unexpected Cocos provenance',
  );
  assert(
    info.sourceArchiveSha256 === ARCHIVE_SHA &&
      info.packageLockSha256 === LOCK_SHA &&
      info.builder === `@cocos/ccbuild@${CCBUILD}`,
    'Unpinned engine source or builder',
  );
  assert(
    info.buildKind === 'official-engine-source-web' &&
      JSON.stringify(info.features) === JSON.stringify(FEATURES),
    'Unexpected engine feature set',
  );
  for (const [file, expected] of Object.entries(info.files)) {
    assert(['cc.js', 'LICENSE'].includes(file), 'Unexpected engine manifest entry');
    const bytes = await readFile(path.join(directory, file));
    assert(
      sha(bytes) === expected.sha256 && bytes.length === expected.bytes,
      `Cocos integrity mismatch: ${file}; rebuild from pinned sources`,
    );
  }
  assert(info.files['cc.js'] && info.files.LICENSE, 'Incomplete engine manifest');
  return info;
}
