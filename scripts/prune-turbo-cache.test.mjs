import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, utimes, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';
import { pruneTurboCache } from './prune-turbo-cache.mjs';
test('cache budget preserves newest complete task groups and skips oversized groups', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'turbo-budget-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [id, size, stamp] of [
    ['aa', 4, 10],
    ['bb', 6, 20],
    ['cc', 20, 30],
  ])
    for (const suffix of ['.tar.zst', '-meta.json']) {
      const file = path.join(directory, id + suffix);
      await writeFile(file, 'x'.repeat(size));
      await utimes(file, stamp, stamp);
    }
  await writeFile(path.join(directory, 'unrelated.txt'), 'keep');
  assert.deepEqual(await pruneTurboCache(directory, 15), { keptBytes: 12, removedBytes: 48 });
  assert.deepEqual((await readdir(directory)).sort(), [
    'bb-meta.json',
    'bb.tar.zst',
    'unrelated.txt',
  ]);
  assert.deepEqual(await pruneTurboCache(directory, 15), { keptBytes: 12, removedBytes: 0 });
});
test('missing local cache is harmless and invalid budgets fail', async () => {
  assert.deepEqual(await pruneTurboCache('not-an-existing-cache-directory'), {
    keptBytes: 0,
    removedBytes: 0,
  });
  await assert.rejects(pruneTurboCache('.', -1));
});
test('every Turbo writer saves only bounded task entries after a successful prune', async () => {
  for (const name of ['ci.yml', 'pages-validate.yml']) {
    const workflow = yaml.load(
      await readFile(new URL('../.github/workflows/' + name, import.meta.url), 'utf8'),
    );
    for (const job of Object.values(workflow.jobs)) {
      const steps = job.steps ?? [];
      const restore = steps.find((step) => step.name === 'Restore Turborepo cache');
      if (!restore) continue;
      assert.equal(restore.uses, 'actions/cache/restore@v5');
      assert(restore.with.key.startsWith('turbo-bounded-v1-'));
      const prune = steps.findIndex((step) => step.run === 'node scripts/prune-turbo-cache.mjs');
      const save = steps.findIndex((step) => step.name === 'Save bounded Turborepo cache');
      assert(prune >= 0 && save > prune);
      assert.equal(steps[save].uses, 'actions/cache/save@v5');
      assert.equal(steps[save].if, "steps.turbo.outputs.cache-hit != 'true'");
      assert(!steps[save].with.path.includes('cookies'));
      assert(steps[save].with.path.includes('.turbo/cache/*.tar.zst'));
    }
  }
});
