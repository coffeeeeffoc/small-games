import { mkdir, readFile, writeFile } from 'node:fs/promises';

export const artSource = new URL('../../../../assets/carding-car/runtime/', import.meta.url);
export const expansionSource = new URL('../../../../assets/carding-car/runtime-expansion/', import.meta.url);
export const artFiles = [
  'kart.glb',
  'palm.glb',
  'broadleaf.glb',
  'lighthouse.glb',
  'coastal-rocks.glb',
  'asphalt.jpg',
  'road-profiles.json',
];

export async function expansionFiles() {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', expansionSource), 'utf8'));
  const files = [...manifest.models, ...manifest.textures].map((entry) => entry.file);
  if (files.some((file) => !/^(scenes|vehicles|drivers|items|props|textures)\/[a-z0-9-]+\.(glb|jpg)$/.test(file)))
    throw new Error('Invalid expansion asset path in runtime manifest.');
  return ['manifest.json', ...files.sort()];
}

/** Copy build inputs from the reusable asset submodule, without checking in duplicates. */
export async function prepareArt() {
  for (const [folder, source, files] of [
    ['seaside', artSource, artFiles],
    ['expansion', expansionSource, await expansionFiles()],
  ]) {
    const destination = new URL(`../assets/resources/${folder}/`, import.meta.url);
    for (const name of files) {
      const bytes = await readFile(new URL(name, source)).catch((error) => {
        throw new Error(
          'Missing carding-car runtime art. Run git submodule update --init --recursive assets.',
          { cause: error },
        );
      });
      const target = new URL(name, destination);
      await mkdir(new URL('./', target), { recursive: true });
      const current = await readFile(target).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
      if (!current?.equals(bytes)) await writeFile(target, bytes);
    }
  }
}
