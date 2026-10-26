import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { vessels, outline } from '../src/content.mjs';
import { readVesselBatch, copyVesselBatch, renderVesselBatch } from '../scripts/vessel-batch.mjs';
import { build } from '../build.mjs';

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
