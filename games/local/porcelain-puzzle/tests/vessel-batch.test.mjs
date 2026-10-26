import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { vessels, outline } from '../src/content.mjs';
import {
  batchModule,
  readVesselBatch,
  copyVesselBatch,
  renderVesselBatch,
} from '../scripts/vessel-batch.mjs';
import { build } from '../build.mjs';
import { vesselContours, vesselAssetHashes } from '../src/vessel-contours.mjs';

const gameRoot = fileURLToPath(new URL('../', import.meta.url));
const original = await readVesselBatch(gameRoot, vessels);
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'porcelain-batch-test-'));
  t.after(async () => {
    assert(
      path.dirname(root) === os.tmpdir() && path.basename(root).startsWith('porcelain-batch-test-'),
    );
    await rm(root, { recursive: true, force: true });
  });
  await copyVesselBatch(original, root);
  return root;
}
const render = async (vessel) => ({
  webp: original.images.get(vessel.id).toString('base64'),
  outline: outline(vessel),
});
const validateImage = async (bytes, vessel) => {
  // Production performs decoded browser checks. Fixture reuses the exact checked-in image.
  assert.deepEqual(bytes, original.images.get(vessel.id));
};
async function unchanged(root) {
  const batch = await readVesselBatch(root, vessels);
  assert.equal(batch.text, original.text);
  for (const [id, bytes] of batch.images) assert.deepEqual(bytes, original.images.get(id));
}

test('fixed legacy and generated batch modules accept LF and CRLF as data', async () => {
  const generated = batchModule(vesselContours, original.directory, vesselAssetHashes);
  for (const text of [original.text, generated])
    for (const eol of ['\n', '\r\n']) {
      const batch = await readVesselBatch(gameRoot, vessels, text.replace(/\r?\n/g, eol));
      assert.equal(batch.directory, original.directory);
      for (const [id, bytes] of batch.images) assert.deepEqual(bytes, original.images.get(id));
    }
});

test('candidate modules reject executable statements, non-JSON and structural drift without execution', async (t) => {
  const marker = '__porcelainBatchParserExecuted';
  assert.equal(Object.hasOwn(globalThis, marker), false);
  t.after(() => delete globalThis[marker]);
  const statement = 'globalThis.' + marker + ' = true;';
  const lines = original.text.replace(/\r\n/g, '\n').trimEnd().split('\n');
  const replace = (index, text) =>
    lines.map((line, i) => (i === index ? text : line)).join('\n') + '\n';
  const bad = [
    ['extra statement', original.text + statement + '\n'],
    ['same-line statement', replace(2, lines[2] + statement)],
    [
      'expression',
      replace(2, 'export const vesselContours = (' + statement.slice(0, -1) + ', []);'),
    ],
    ['non-JSON object', replace(5, 'export const vesselAssetHashes = {unquoted: 1};')],
    ['non-JSON number', replace(2, 'export const vesselContours = [NaN];')],
    ['wrong declaration', replace(2, lines[2].replace('vesselContours', 'otherContours'))],
    ['missing export', lines.slice(0, -1).join('\n')],
    ['unknown header', replace(0, '// Another generator')],
    ['bare carriage return', replace(2, lines[2].replace(' = ', ' = \r'))],
    ['null contours', replace(2, 'export const vesselContours = null;')],
    ['null manifest', replace(5, 'export const vesselAssetHashes = null;')],
    ['array manifest', replace(5, 'export const vesselAssetHashes = [];')],
  ];
  for (const [name, text] of bad)
    await t.test(name, async () => {
      await assert.rejects(readVesselBatch(gameRoot, vessels, text), /contours|manifest/);
      assert.equal(Object.hasOwn(globalThis, marker), false);
    });
});

test('batch directories reject traversal, expressions and malformed batch identities', async (t) => {
  for (const directory of [
    '../vessels',
    'assets/vessels/../vessels',
    '/assets/vessels',
    'assets\\vessels',
    'assets/vessels\n',
    'assets/vessel-batches/.staging-12345678-1234-1234-1234-123456789abc',
    'assets/vessel-batches/batch-------------------------------------',
    ['assets/vessels'],
  ])
    await t.test(JSON.stringify(directory), async () => {
      const text = batchModule(vesselContours, directory, vesselAssetHashes);
      await assert.rejects(readVesselBatch(gameRoot, vessels, text), /Invalid vessel batch path/);
    });
  const expression = batchModule(vesselContours, original.directory, vesselAssetHashes).replace(
    /^export const vesselAssetDirectory = .*;$/m,
    'export const vesselAssetDirectory = String.fromCharCode(97) + "ssets/vessels";',
  );
  await assert.rejects(
    readVesselBatch(gameRoot, vessels, expression),
    /Invalid vessel contours JSON/,
  );
});

test('failures at image 1, 37 and 100 preserve every old image and contour', async (t) => {
  for (const failAt of [1, 37, 100])
    await t.test('image ' + failAt, async (t) => {
      const root = await fixture(t);
      await assert.rejects(
        renderVesselBatch({
          root,
          vessels,
          validateImage,
          render: async (vessel, index) => {
            if (index + 1 === failAt) throw Error('injected render failure');
            return render(vessel);
          },
        }),
        /injected render failure/,
      );
      await unchanged(root);
    });
});
test('invalid contour, material mismatch and decoded image failure cannot activate', async (t) => {
  for (const kind of ['contour', 'material', 'decode'])
    await t.test(kind, async (t) => {
      const root = await fixture(t);
      await assert.rejects(
        renderVesselBatch({
          root,
          vessels,
          validateImage: async (bytes, vessel) => {
            if (kind === 'decode' && vessel === vessels[36]) throw Error('injected decode failure');
            await validateImage(bytes, vessel);
          },
          render: async (vessel, index) => {
            const value = structuredClone(await render(vessel));
            if (index === 36 && kind === 'contour') value.outline[0].x = NaN;
            if (index === 36 && kind === 'material') value.outline[0].x += 0.25;
            return value;
          },
        }),
        /contour|silhouette|decode/,
      );
      await unchanged(root);
    });
});
test('interruptions before activation and Windows sharing failure keep the old active batch', async (t) => {
  for (const stage of ['validated', 'before-activate', 'busy'])
    await t.test(stage, async (t) => {
      const root = await fixture(t);
      await assert.rejects(
        renderVesselBatch({
          root,
          vessels,
          render,
          validateImage,
          checkpoint: async (at) => {
            if (at === stage) throw Error('injected interruption');
          },
          ...(stage === 'busy'
            ? {
                activate: async () => {
                  throw Object.assign(Error('file in use'), { code: 'EBUSY' });
                },
              }
            : {}),
        }),
        /interruption|file in use/,
      );
      await unchanged(root);
    });
});
test('interruption after the single activation leaves a complete new batch and recoverable old bytes', async (t) => {
  const root = await fixture(t);
  await assert.rejects(
    renderVesselBatch({
      root,
      vessels,
      render,
      validateImage,
      checkpoint: async (stage) => {
        if (stage === 'after-activate') throw Error('injected interruption');
      },
    }),
    /injected interruption/,
  );
  const next = await readVesselBatch(root, vessels);
  assert.match(next.directory, /^assets\/vessel-batches\/batch-/);
  for (const [id, bytes] of original.images) {
    assert.deepEqual(next.images.get(id), bytes);
    assert.deepEqual(await readFile(path.join(root, original.directory, id + '.webp')), bytes);
  }
  // Restoring the saved module is sufficient; no former image was overwritten.
  const previous = await readFile(
    path.join(root, next.directory, 'previous-vessel-contours.mjs'),
    'utf8',
  );
  assert.equal(previous, original.text);
  await writeFile(path.join(root, 'src/vessel-contours.mjs'), previous);
  await unchanged(root);
});
test('build copies one captured batch even when activation changes the source', async (t) => {
  const root = await fixture(t);
  const snapshot = await readVesselBatch(root, vessels);
  await renderVesselBatch({ root, vessels, render, validateImage });
  assert.notEqual((await readVesselBatch(root, vessels)).text, snapshot.text);
  const output = path.join(root, 'snapshot-output');
  await copyVesselBatch(snapshot, output);
  await unchanged(output);
});
test('build rejects missing/corrupt assets and malformed contours before touching old dist', async (t) => {
  for (const failure of ['missing', 'corrupt', 'contours'])
    await t.test(failure, async (t) => {
      const root = await fixture(t);
      await mkdir(path.join(root, 'dist'));
      await writeFile(path.join(root, 'dist/old.txt'), 'previous complete build');
      const file = path.join(root, original.directory, vessels[36].id + '.webp');
      if (failure === 'missing') await rm(file);
      if (failure === 'corrupt') {
        const bytes = await readFile(file);
        bytes[bytes.length - 1] ^= 1;
        await writeFile(file, bytes);
      }
      if (failure === 'contours')
        await writeFile(
          path.join(root, 'src/vessel-contours.mjs'),
          original.text.replace(
            'export const vesselContours = ',
            'export const vesselContours = []; const unused = ',
          ),
        );
      await assert.rejects(
        build({ root: pathToFileURL(root + path.sep) }),
        /ENOENT|checksum|contours/,
      );
      assert.equal(
        await readFile(path.join(root, 'dist/old.txt'), 'utf8'),
        'previous complete build',
      );
    });
});
