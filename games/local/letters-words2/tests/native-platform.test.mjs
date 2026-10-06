import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { nativeToday, readNativeIsland, nativeIslandInvitation, createNativeLibrary } from '../native-platform.js';
import { createNativeSDKFixture } from './native-sdk-fixture.mjs';
import { practiceBatches } from '../library.js';

assert.equal(nativeToday(Date.parse('2026-10-01T15:59:59.999Z')), '2026-10-01');
assert.equal(nativeToday(Date.parse('2026-10-01T16:00:00.000Z')), '2026-10-02', 'native dates follow the same Beijing midnight');
assert.deepEqual(readNativeIsland({}), {});
assert.deepEqual(readNativeIsland({ game: 'letters-words2', mini: 'dawn', v: '1', token: 'private', dev: '1' }), { mini: 'dawn' });
assert.deepEqual(readNativeIsland({ game: 'letters-words2', daily: '2026-10-01', v: '1' }), { daily: '2026-10-01' });
for (const query of [null, [], 'mini=dawn', { mini: 'unknown' }, { mini: ['dawn', 'shore'] }, { mini: 1 },
  { mini: 'dawn', daily: '2026-10-01' }, { mini: 'dawn', v: '2' }, { mini: 'dawn', v: 1 }, { mini: 'dawn', v: ['1', '1'] },
  { daily: '2026-02-29' }, { daily: '2026-10-1' }, { daily: ['2026-10-01', '2026-10-02'] },
  { mini: 'dawn', game: 'foreign-game' }, { daily: '2026-10-01', game: ['letters-words2'] }, { mini: undefined }]) {
  assert.equal(readNativeIsland(query).error, true, `invalid native invitation ${JSON.stringify(query)}`);
}
for (const state of [{ mini: 'dawn' }, { mini: 'shore' }, { mini: 'orbit' }, { daily: '2026-10-01' }]) {
  const invitation = nativeIslandInvitation({ ...state, token: 'private', dev: '1', matchId: 'ABCDEF123456', answers: 'secret' });
  const params = new URLSearchParams(invitation.query);
  assert.deepEqual([...params.keys()], ['game', state.mini ? 'mini' : 'daily', 'v']);
  assert.equal(params.get('game'), 'letters-words2');
  assert.equal(params.get('v'), '1');
  assert.deepEqual(readNativeIsland(Object.fromEntries(params)), state);
}
assert.throws(() => nativeIslandInvitation({}), /请先进入/);
assert.throws(() => nativeIslandInvitation({ daily: '2026-02-29' }), /请先进入/);

// Native textbook selection uses packaged data, with one verified full book cached for the session.
{
  const paths = [];
  const fixture = createNativeSDKFixture({ readFile: async (path, encoding) => {
    assert.equal(encoding, 'utf8'); paths.push(path);
    assert.match(path, /^assets\/english-dict\/(catalog\.json|books\/[A-Za-z0-9_-]+\.json)$/);
    return readFile(new URL('../' + path, import.meta.url), 'utf8');
  } });
  const library = createNativeLibrary(fixture.sdk);
  const catalog = await library.catalog();
  assert.ok(catalog.books.length > 0);
  assert.equal(await library.catalog(), catalog);
  assert.equal(paths.filter(path => path.endsWith('catalog.json')).length, 1);
  const book = catalog.books.find(item => item.verification);
  assert.ok(book?.units.length, 'actual packaged reviewed textbook provides learning units');
  const data = await library.book(book);
  assert.equal(data.entries.length, book.count);
  assert.equal(await library.book(book), data);
  assert.equal(paths.filter(path => path.endsWith(book.url)).length, 1);
  const unit = data.entries.filter(entry => entry.unit === book.units[0]);
  assert.ok(unit.length);
  assert.equal(practiceBatches(unit).flat().every(entry => unit.some(source => source.word.toLowerCase().replace(/[’‘]/g, "'") === entry.word)), true);
  await assert.rejects(library.book({ ...book, id: 'invalid-path', url: '../private.json' }), /词库路径无效/);
  await assert.rejects(library.book({ ...book, id: 'invalid-count', count: book.count + 1 }), /词库不完整/);
  library.clear();
  assert.notEqual(await library.catalog(), catalog, 'cache clearing reloads packaged catalog');
}

// Synchronous SDK file systems and read failures preserve a usable retry path.
{
  const catalog = JSON.stringify({ publishers: [], books: [] });
  const synchronous = createNativeLibrary({ getFileSystemManager: () => ({ readFileSync: () => catalog }) });
  assert.deepEqual(await synchronous.catalog(), { publishers: [], books: [] });
  let attempt = 0;
  const retryable = createNativeLibrary({ getFileSystemManager: () => ({ readFile(input) {
    if (attempt++ === 0) input.fail(new Error('temporarily unavailable')); else input.success({ data: catalog });
  } }) });
  await assert.rejects(retryable.catalog(), /读取失败/);
  assert.deepEqual(await retryable.catalog(), { publishers: [], books: [] });
  await assert.rejects(createNativeLibrary({}).catalog(), /主题词岛仍可玩/);
  await assert.rejects(createNativeLibrary({ getFileSystemManager: () => ({ readFileSync: () => '{' }) }).catalog(), /读取失败/);
  await assert.rejects(createNativeLibrary({ getFileSystemManager: () => ({ readFileSync: () => '{}' }) }).catalog(), /目录无效/);
}

console.log('Native platform: Beijing rollover, strict island queries, clean public shares, real packaged textbook units/cache, sync SDK files and retryable FS failures passed.');
