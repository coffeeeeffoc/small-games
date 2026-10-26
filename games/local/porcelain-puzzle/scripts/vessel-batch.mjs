import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const modulePath = 'src/vessel-contours.mjs';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function validateContour(contour) {
  assert(
    Array.isArray(contour) && contour.length > 200 && contour.length % 2 === 0,
    'Invalid vessel contour',
  );
  const half = contour.length / 2;
  for (let i = 0; i < half; i++) {
    const right = contour[i],
      left = contour.at(-1 - i);
    assert(
      Number.isFinite(right.x) && Number.isFinite(right.y) && Number.isFinite(left.x),
      'Non-finite vessel contour',
    );
    assert(
      left.y === right.y &&
        left.x > 0 &&
        left.x < right.x &&
        right.x < 240 &&
        right.y > 0 &&
        right.y < 300,
      'Vessel contour outside canvas',
    );
    if (i) assert(right.y > contour[i - 1].y, 'Unordered vessel contour');
  }
}
export function validateWebp(bytes) {
  assert(
    bytes.length > 750 &&
      bytes.subarray(0, 4).toString() === 'RIFF' &&
      bytes.subarray(8, 12).toString() === 'WEBP',
    'Invalid vessel WebP',
  );
  assert(bytes.readUInt32LE(4) + 8 === bytes.length, 'Truncated vessel WebP');
}
export function batchModule(outlines, directory, hashes) {
  return (
    '// Alpha contours and immutable artwork batch; regenerate with pnpm art:render.\n' +
    '// prettier-ignore\nexport const vesselContours = ' +
    JSON.stringify(outlines) +
    ';\n' +
    'export const vesselAssetDirectory = ' +
    JSON.stringify(directory) +
    ';\n' +
    '// prettier-ignore\nexport const vesselAssetHashes = ' +
    JSON.stringify(hashes) +
    ';\n'
  );
}
function decodeModule(text) {
  // This module is also consumed by the browser, but build validation treats it
  // only as data. Never execute a candidate module to discover its batch.
  const lines = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  assert(
    lines.length === 6 &&
      lines.every((line) => !line.includes('\r')) &&
      [
        '// Alpha contours of the baked studio artwork; regenerate with pnpm art:render.',
        '// Alpha contours and immutable artwork batch; regenerate with pnpm art:render.',
      ].includes(lines[0]) &&
      lines[1] === '// prettier-ignore' &&
      lines[4] === '// prettier-ignore',
    'Invalid vessel contours module structure',
  );
  function value(line, name) {
    const prefix = 'export const ' + name + ' = ';
    assert(
      line.startsWith(prefix) && line.endsWith(';'),
      'Invalid vessel contours declaration: ' + name,
    );
    let literal = line.slice(prefix.length, -1);
    // The checked-in legacy directory is the only supported non-JSON literal.
    if (name === 'vesselAssetDirectory' && literal === "'assets/vessels'")
      literal = '"assets/vessels"';
    try {
      return JSON.parse(literal);
    } catch {
      throw new Error('Invalid vessel contours JSON: ' + name);
    }
  }
  return {
    vesselContours: value(lines[2], 'vesselContours'),
    vesselAssetDirectory: value(lines[3], 'vesselAssetDirectory'),
    vesselAssetHashes: value(lines[5], 'vesselAssetHashes'),
  };
}
export async function readVesselBatch(root, vessels, text = undefined) {
  text ??= await readFile(join(root, modulePath), 'utf8');
  const { vesselContours, vesselAssetDirectory, vesselAssetHashes } = decodeModule(text);
  assert(
    typeof vesselAssetDirectory === 'string' &&
      /^assets\/(?:vessels|vessel-batches\/batch-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/.test(
        vesselAssetDirectory,
      ),
    'Invalid vessel batch path',
  );
  assert(
    Array.isArray(vesselContours) && vesselContours.length === 10,
    'Incomplete vessel contours',
  );
  assert(
    vesselAssetHashes !== null &&
      typeof vesselAssetHashes === 'object' &&
      !Array.isArray(vesselAssetHashes),
    'Invalid vessel batch manifest',
  );
  vesselContours.forEach(validateContour);
  assert(
    vessels.length === 100 && new Set(vessels.map((v) => v.id)).size === 100,
    'Incomplete vessel catalog',
  );
  assert.deepEqual(
    Object.keys(vesselAssetHashes).sort(),
    vessels.map((v) => v.id).sort(),
    'Incomplete vessel batch manifest',
  );
  const images = new Map();
  for (const vessel of vessels) {
    const bytes = await readFile(join(root, vesselAssetDirectory, vessel.id + '.webp'));
    validateWebp(bytes);
    assert(
      sha(bytes) === vesselAssetHashes[vessel.id],
      'Vessel batch checksum mismatch: ' + vessel.id,
    );
    images.set(vessel.id, bytes);
  }
  assert(
    new Set(Object.values(vesselAssetHashes)).size === vessels.length,
    'Duplicate vessel artwork',
  );
  return { text, directory: vesselAssetDirectory, images };
}
// Copy the verified bytes, never re-read the moving active module or source images.
export async function copyVesselBatch(snapshot, destination) {
  await mkdir(join(destination, snapshot.directory), { recursive: true });
  await mkdir(join(destination, 'src'), { recursive: true });
  for (const [id, bytes] of snapshot.images)
    await writeFile(join(destination, snapshot.directory, id + '.webp'), bytes);
  await writeFile(join(destination, modulePath), snapshot.text);
}
export async function renderVesselBatch({
  root,
  vessels,
  render,
  validateImage,
  checkpoint = async () => {},
  activate = rename,
}) {
  assert.equal(typeof validateImage, 'function', 'Decoded image validation is required');
  const id = randomUUID(),
    directory = 'assets/vessel-batches/batch-' + id;
  const staging = join(root, 'assets/vessel-batches/.staging-' + id);
  await mkdir(staging, { recursive: true });
  const outlines = [],
    hashes = {};
  for (const [index, vessel] of vessels.entries()) {
    const result = await render(vessel, index);
    validateContour(result.outline);
    assert(
      typeof result.webp === 'string' && result.webp.length > 1000,
      'Empty artwork: ' + vessel.id,
    );
    const bytes = Buffer.from(result.webp, 'base64');
    validateWebp(bytes);
    await validateImage(bytes, vessel);
    if (vessel.theme === 0) outlines.push(result.outline);
    else
      assert.deepEqual(
        result.outline,
        outlines[vessel.shape],
        'Material changed silhouette: ' + vessel.id,
      );
    await writeFile(join(staging, vessel.id + '.webp'), bytes);
    hashes[vessel.id] = sha(bytes);
    await checkpoint('image', index + 1);
  }
  assert(
    outlines.length === 10 &&
      Object.keys(hashes).length === 100 &&
      new Set(Object.values(hashes)).size === 100,
    'Incomplete rendered batch',
  );
  const text = batchModule(outlines, directory, hashes);
  await writeFile(join(staging, 'vessel-contours.mjs'), text);
  await writeFile(
    join(staging, 'previous-vessel-contours.mjs'),
    await readFile(join(root, modulePath)),
  );
  // The directory rename is on the same filesystem. No current file has been changed.
  await checkpoint('validated');
  await rename(staging, join(root, directory));
  await readVesselBatch(root, vessels, text);
  const temporaryModule = join(root, 'src/.vessel-contours-' + id + '.mjs');
  await writeFile(temporaryModule, text, { flag: 'wx' });
  await checkpoint('before-activate');
  // This single replacement publishes BOTH contours and image paths. In particular,
  // do not unlink the destination first on Windows: EPERM/EBUSY leaves the old batch active.
  await activate(temporaryModule, join(root, modulePath));
  await checkpoint('after-activate');
  return directory;
}
