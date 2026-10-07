import { readFile, mkdir, cp, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Preserve original panoramas and the five server-selected competition copies.
// Small resource-only packages keep every channel below its single-package budget.
export async function prepareHistoryPackages(gameRoot, output, budget = 2_500_000) {
  const sources = execFileSync(
    'git',
    ['ls-files', '--', 'public/assets/*.webp', 'public/assets/**/*.webp'],
    {
      cwd: gameRoot,
      encoding: 'utf8',
    },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .sort();
  if (sources.length !== 33)
    throw new Error(
      'History resource scope changed: review all 28 panoramas and 5 competition copies.',
    );
  const assetPackages = {},
    packages = [],
    files = [];
  let index = -1,
    size = budget;
  for (const source of sources) {
    const fullPath = path.join(gameRoot, source);
    const bytes = await readFile(fullPath);
    if (bytes.length + 128 > budget)
      throw new Error('History image exceeds the reviewed single-package budget.');
    if (size + bytes.length > budget) {
      index++;
      size = 128;
      const name = `history-images-${index}`;
      packages.push({ name, root: name });
      await mkdir(path.join(output, name), { recursive: true });
      await writeFile(
        path.join(output, name, 'game.js'),
        '// Original scene resources; loaded through the real host loadSubpackage API.\n',
      );
    }
    const name = `history-images-${index}`,
      relative = source.slice('public/'.length);
    const target = `${name}/${relative}`;
    await mkdir(path.dirname(path.join(output, target)), { recursive: true });
    await cp(fullPath, path.join(output, target));
    size += bytes.length;
    assetPackages[relative] = { name, path: target };
    files.push({
      source: relative,
      path: target,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  const manifest = {
    schemaVersion: 1,
    delivery: 'native-subpackages',
    unchangedOriginalBytes: true,
    budget,
    packages,
    files,
  };
  await writeFile(
    path.join(output, 'history-assets-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  return {
    assetPackages,
    packages,
    sourceInputs: sources.map((source) => path.join(gameRoot, source)),
    manifest,
  };
}
