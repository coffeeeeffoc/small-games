import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sourceHash } from '../scripts/artifact.mjs';

test('SVG checkout line endings are normalized while source and binary changes invalidate artifacts', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ashfall-artifact-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const folder of ['assets', 'scripts', 'settings', 'startup', 'src'])
    await mkdir(path.join(directory, folder));
  for (const file of [
    'package.json',
    'tsconfig.json',
    'src/core.mjs',
    'src/levels.mjs',
    'src/progress.mjs',
    'src/host.mjs',
    'src/rewards.mjs',
    'src/weapons.mjs',
    'src/render.mjs',
  ])
    await writeFile(path.join(directory, file), '{}\n');

  const svg = path.join(directory, 'assets/emblem.svg');
  await writeFile(svg, '<svg>\n</svg>\n');
  const lfHash = await sourceHash(directory);
  await writeFile(svg, '<svg>\r\n</svg>\r\n');
  assert.equal(await sourceHash(directory), lfHash);
  await writeFile(svg, '<svg width="10">\n</svg>\n');
  assert.notEqual(await sourceHash(directory), lfHash);

  const binary = path.join(directory, 'assets/sample.bin');
  await writeFile(binary, Buffer.from([13, 10]));
  const binaryHash = await sourceHash(directory);
  await writeFile(binary, Buffer.from([10]));
  assert.notEqual(await sourceHash(directory), binaryHash);
});
