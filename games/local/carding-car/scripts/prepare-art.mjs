import { mkdir, readFile, writeFile } from 'node:fs/promises';

export const artSource = new URL('../../../../assets/carding-car/runtime/', import.meta.url);
export const artFiles = [
  'kart.glb',
  'palm.glb',
  'broadleaf.glb',
  'lighthouse.glb',
  'coastal-rocks.glb',
  'asphalt.jpg',
  'road-profiles.json',
];

/** Copy build inputs from the reusable asset submodule, without checking in duplicates. */
export async function prepareArt() {
  const destination = new URL('../assets/resources/seaside/', import.meta.url);
  await mkdir(destination, { recursive: true });
  for (const name of artFiles) {
    const bytes = await readFile(new URL(name, artSource)).catch((error) => {
      throw new Error(
        'Missing carding-car runtime art. Run git submodule update --init --recursive assets.',
        { cause: error },
      );
    });
    const target = new URL(name, destination);
    const current = await readFile(target).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    if (!current?.equals(bytes)) await writeFile(target, bytes);
  }
}
