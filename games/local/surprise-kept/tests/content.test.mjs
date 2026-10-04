import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadCatalog, parseChapter } from '../src/content/loader.js';
import { createState } from '../src/core/engine.js';
import { readProgress, saveProgress } from '../src/platform/storage.js';
const fetcher = async (url) => ({
  ok: true,
  json: async () => JSON.parse(await readFile(url, 'utf8')),
});
test('the shipped catalog loads as directly runnable levels', async () => {
  const catalog = await loadCatalog(fetcher);
  assert.equal(catalog.levels.length, 8);
  for (const level of catalog.levels) assert.equal(createState(level).levelId, level.id);
});
test('unknown theme and duplicate imported level are rejected atomically', async () => {
  const catalog = await loadCatalog(fetcher);
  const level = structuredClone(catalog.levels[0]);
  assert.throws(
    () =>
      parseChapter(
        { id: 'extra', title: 'extra', levels: [level] },
        catalog.themes,
        new Set([level.id]),
      ),
    /重复/,
  );
  level.theme = 'new-theme';
  assert.throws(
    () => parseChapter({ id: 'extra', title: 'extra', levels: [level] }, catalog.themes),
    /未知主题/,
  );
  const themes = new Map(catalog.themes);
  themes.set('new-theme', { ...catalog.themes.get('birthday'), id: 'new-theme' });
  const imported = parseChapter({ id: 'extra', title: 'extra', levels: [level] }, themes);
  assert.equal(createState(imported[0]).levelId, level.id);
});
test('unavailable storage and corrupt saves do not prevent play', () => {
  const storage = {
    getItem() {
      throw Error('blocked');
    },
    setItem() {
      throw Error('quota');
    },
  };
  assert.equal(readProgress(storage).version, 1);
  assert.equal(saveProgress({}, storage), false);
  assert.deepEqual(readProgress({ getItem: () => '{bad' }).completed, {});
});
