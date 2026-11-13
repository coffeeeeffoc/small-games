import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { freezeNightRules, verifyNightRules, baselineDirectory } from './night-release-rules.mjs';

test('Night freezes an independently executable closure and rejects edits or replacement', async () => {
  await verifyNightRules(baselineDirectory);
  await verifyNightRules(join(baselineDirectory, '../night-v17-v10'));
  await verifyNightRules(join(baselineDirectory, '../night-v18-v11'));
  const root = await mkdtemp(join(tmpdir(), 'night-rules-')),
    destination = join(root, 'frozen');
  try {
    const manifest = await freezeNightRules(destination);
    assert.deepEqual(await verifyNightRules(destination), manifest);
    assert(manifest.files.some((file) => file.file === 'Simulation.mjs'));
    const { default: ranked } = await import(
      pathToFileURL(join(destination, 'night-ranked.mjs')).href
    );
    const { default: duel } = await import(pathToFileURL(join(destination, 'night.mjs')).href);
    assert.equal(ranked.version, manifest.ranked);
    assert.equal(duel.version, manifest.multiplayer);
    const board = ranked.boards.find((board) => board.id.startsWith('level-'));
    assert(ranked.create(board.id, 7, board.id.slice(6)).simulation);
    assert.equal(duel.view(duel.initial(7, 'bot'), 0).bot, true);
    await assert.rejects(freezeNightRules(destination), { code: 'EEXIST' });
    for (const invalid of [
      { ...manifest, files: [] },
      { ...manifest, files: [...manifest.files, manifest.files[0]] },
      { ...manifest, files: manifest.files.filter((file) => file.file !== 'night.mjs') },
      { ...manifest, ranked: 'wrong-version' },
    ]) {
      await writeFile(join(destination, 'manifest.json'), JSON.stringify(invalid));
      await assert.rejects(
        verifyNightRules(destination),
        /Invalid frozen manifest|identity mismatch/,
      );
    }
    await writeFile(join(destination, 'manifest.json'), JSON.stringify(manifest));
    const file = join(destination, 'Simulation.mjs');
    await writeFile(file, (await readFile(file, 'utf8')) + '\n// tampered');
    await assert.rejects(verifyNightRules(destination), /Frozen rule changed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
