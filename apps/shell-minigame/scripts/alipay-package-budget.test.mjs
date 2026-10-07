import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyAlipayPackageBudget } from './alipay-package-budget.mjs';

async function fixture(t, subpackages = [{ name: 'photos', root: 'photos/' }]) {
  const directory = await mkdtemp(path.join(tmpdir(), 'alipay-budget-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const expected = new Map();
  async function put(file, value) {
    await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
    await writeFile(path.join(directory, file), value);
    expected.set(file, typeof value === 'string' ? Buffer.byteLength(value) : value.byteLength);
  }
  await put('game.json', JSON.stringify({ deviceOrientation: 'portrait', subpackages }));
  await put('game.js', '// Real main entry.\n');
  return { directory, expected, put };
}
const sum = (files) => [...files.values()].reduce((total, size) => total + size, 0);

test('ordinary 5MB subpackage passes: 4MB applies only to main, with all actual bytes counted', async (t) => {
  const f = await fixture(t);
  await f.put('photos/game.js', '// Original resources only.\n');
  await f.put('photos/original-photo.bin', Buffer.alloc(5_000_001, 73));
  await f.put('artifact-manifest.json', JSON.stringify({ files: [], claimedBytes: 0 }));
  await f.put('release.json', '{}');
  await f.put('unlisted-main-file.bin', Buffer.alloc(21));
  const result = await verifyAlipayPackageBudget(f.directory);
  const photoBytes = f.expected.get('photos/game.js') + f.expected.get('photos/original-photo.bin');
  assert.equal(result.totalBytes, sum(f.expected));
  assert.equal(result.mainBytes, sum(f.expected) - photoBytes);
  assert.equal(result.subpackages[0].bytes, photoBytes);
  assert.equal(result.subpackages[0].root, 'photos');
  assert.equal(result.subpackages[0].fileCount, 2);
  assert.equal(result.fileCount, f.expected.size);
  assert.equal(result.mainBudget, 4_000_000);
  assert.equal(result.totalBudget, 20_000_000);
  assert.equal(result.reference, 'https://opendocs.alipay.com/mini-game/08uo7z');
  await rename(
    path.join(f.directory, 'photos/original-photo.bin'),
    path.join(f.directory, 'same-original-photo-in-main.bin'),
  );
  await assert.rejects(verifyAlipayPackageBudget(f.directory), { code: 'MAIN_BUDGET_EXCEEDED' });
});
test('main including provenance manifests passes exact boundary and fails one byte below', async (t) => {
  const f = await fixture(t, []);
  await f.put('artifact-manifest.json', JSON.stringify({ sourceFiles: ['原照片'], files: [] }));
  await f.put('history-assets-manifest.json', JSON.stringify({ files: ['original.webp'] }));
  const measured = sum(f.expected);
  const result = await verifyAlipayPackageBudget(f.directory, {
    mainBudget: measured,
    totalBudget: measured,
  });
  assert.equal(result.mainBytes, measured);
  assert.equal(result.totalBytes, measured);
  await assert.rejects(
    verifyAlipayPackageBudget(f.directory, { mainBudget: measured - 1, totalBudget: measured }),
    { code: 'MAIN_BUDGET_EXCEEDED' },
  );
});
test('total includes subpackage entry, resource and unlisted files and enforces exact boundary', async (t) => {
  const f = await fixture(t);
  await f.put('photos/game.js', 'module.exports = {};');
  await f.put('photos/original.bin', Buffer.alloc(64));
  await f.put('photos/unlisted.bin', Buffer.alloc(11));
  const total = sum(f.expected);
  const result = await verifyAlipayPackageBudget(f.directory, {
    mainBudget: total,
    totalBudget: total,
  });
  assert.equal(result.totalBytes, total);
  await assert.rejects(
    verifyAlipayPackageBudget(f.directory, { mainBudget: total, totalBudget: total - 1 }),
    { code: 'TOTAL_BUDGET_EXCEEDED' },
  );
});
test('default total 20MB is enforced even with a small main and an ordinary large subpackage', async (t) => {
  const f = await fixture(t);
  await f.put('photos/game.js', '');
  // A sparse real file exercises the actual byte count without allocating 20MB in the test.
  const { open } = await import('node:fs/promises');
  const file = await open(path.join(f.directory, 'photos/oversize.bin'), 'w');
  try {
    await file.truncate(20_000_001);
  } finally {
    await file.close();
  }
  await assert.rejects(verifyAlipayPackageBudget(f.directory), { code: 'TOTAL_BUDGET_EXCEEDED' });
});
test('root grouping uses directory boundaries, so photos-extra stays in main', async (t) => {
  const f = await fixture(t);
  await f.put('photos/game.js', '');
  await f.put('photos/photo.bin', Buffer.alloc(50));
  await f.put('photos-extra/bypass.bin', Buffer.alloc(60));
  const result = await verifyAlipayPackageBudget(f.directory);
  assert.equal(result.subpackages[0].bytes, 50);
  assert.equal(result.mainBytes, sum(f.expected) - 50);
  await assert.rejects(
    verifyAlipayPackageBudget(f.directory, { mainBudget: result.mainBytes - 1 }),
    { code: 'MAIN_BUDGET_EXCEEDED' },
  );
});
for (const root of [
  '/absolute',
  '../outside',
  'photos/../outside',
  './photos',
  'photos//part',
  'photos\\part',
  'C:/outside',
  'C:relative',
  'https://host/package',
  'photos//',
  '',
  'photos\u0000hidden',
  'photos%2foutside',
]) {
  test(`rejects unsafe subpackage root ${JSON.stringify(root)}`, async (t) => {
    const f = await fixture(t, [{ name: 'photos', root }]);
    await assert.rejects(verifyAlipayPackageBudget(f.directory), { code: 'INVALID_SUBPACKAGE' });
  });
}
for (const entries of [
  [
    { name: 'a', root: 'photos' },
    { name: 'b', root: 'photos/' },
  ],
  [
    { name: 'a', root: 'photos' },
    { name: 'b', root: 'photos/nested' },
  ],
  [
    { name: 'a', root: 'photos/nested' },
    { name: 'b', root: 'photos' },
  ],
  [
    { name: 'same', root: 'a' },
    { name: 'same', root: 'b' },
  ],
  [{ name: '', root: 'photos' }],
  [{ name: 'photo\u0000s', root: 'photos' }],
  [{ name: 42, root: 'photos' }],
  [{ name: 'photos', root: 42 }],
  [{ name: 'photos' }],
  [null],
  [[]],
  [{ name: 'photos', root: 'photos', independent: true }],
  { name: 'photos', root: 'photos' },
  null,
]) {
  test(`rejects invalid, duplicated or overlapping declarations ${JSON.stringify(entries)}`, async (t) => {
    const f = await fixture(t, entries);
    await assert.rejects(verifyAlipayPackageBudget(f.directory), { code: 'INVALID_SUBPACKAGE' });
  });
}
test('every configured root requires its own real game.js entry', async (t) => {
  const f = await fixture(t);
  await f.put('photos/photo.bin', Buffer.alloc(10));
  await assert.rejects(verifyAlipayPackageBudget(f.directory), { code: 'INVALID_SUBPACKAGE' });
});
test('rejects a symbolic link to an external file, directory, or package root', async (t) => {
  const f = await fixture(t, []);
  const outside = await mkdtemp(path.join(tmpdir(), 'alipay-budget-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(path.join(outside, 'secret.bin'), Buffer.alloc(12));
  for (const [target, name] of [
    [path.join(outside, 'secret.bin'), 'file-link'],
    [outside, 'directory-link'],
  ]) {
    await symlink(target, path.join(f.directory, name));
    await assert.rejects(verifyAlipayPackageBudget(f.directory), { code: 'SYMLINK' });
    await rm(path.join(f.directory, name));
  }
  const rootLink = path.join(outside, 'package-link');
  await symlink(f.directory, rootLink);
  await assert.rejects(verifyAlipayPackageBudget(rootLink), { code: 'SYMLINK' });
});
test('subpackage entry and game.json may not be symbolic links', async (t) => {
  const f = await fixture(t);
  await f.put('photos/real-entry.js', '');
  await symlink(
    path.join(f.directory, 'photos/real-entry.js'),
    path.join(f.directory, 'photos/game.js'),
  );
  await assert.rejects(verifyAlipayPackageBudget(f.directory), { code: 'SYMLINK' });
  await rm(path.join(f.directory, 'photos/game.js'));
  await f.put('real-config.json', JSON.stringify({}));
  await rm(path.join(f.directory, 'game.json'));
  await symlink(path.join(f.directory, 'real-config.json'), path.join(f.directory, 'game.json'));
  await assert.rejects(verifyAlipayPackageBudget(f.directory), { code: 'SYMLINK' });
});
test('rejects malformed JSON, missing game.json and wrong capitalization', async (t) => {
  const f = await fixture(t, []);
  await f.put('game.json', '{');
  await assert.rejects(verifyAlipayPackageBudget(f.directory), { code: 'INVALID_SUBPACKAGE' });
  await f.put('game.json', JSON.stringify({ subPackages: [] }));
  await assert.rejects(verifyAlipayPackageBudget(f.directory), { code: 'INVALID_SUBPACKAGE' });
  await rm(path.join(f.directory, 'game.json'));
  await assert.rejects(verifyAlipayPackageBudget(f.directory), { code: 'INVALID_SUBPACKAGE' });
});
test('invalid budgets cannot disable measurements', async (t) => {
  const f = await fixture(t, []);
  for (const value of [0, -1, Infinity, NaN, 1.5, '4000000', Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(verifyAlipayPackageBudget(f.directory, { mainBudget: value }), {
      code: 'INVALID_BUDGET',
    });
    await assert.rejects(verifyAlipayPackageBudget(f.directory, { totalBudget: value }), {
      code: 'INVALID_BUDGET',
    });
  }
});
