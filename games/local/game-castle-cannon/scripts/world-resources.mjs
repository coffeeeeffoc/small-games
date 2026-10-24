import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function writeWorld(directory, world) {
  if (Object.keys(world.geometries).some((id) => !/^[a-f0-9]{20}$/.test(id)))
    throw Error('Invalid generated geometry ID');
  const geometryDir = path.join(directory, 'world-geometries');
  await rm(geometryDir, { recursive: true, force: true });
  await mkdir(geometryDir, { recursive: true });
  const geometries = {};
  for (const [id, geometry] of Object.entries(world.geometries)) {
    const json = JSON.stringify(geometry);
    if (Buffer.byteLength(json) >= 100 * 1024 ** 2)
      throw Error(`Generated geometry ${id} exceeds Git's 100 MiB limit`);
    await writeFile(path.join(geometryDir, id + '.json'), json);
    geometries[id] = 'world-geometries/' + id;
  }
  await writeFile(
    path.join(directory, 'world.json'),
    JSON.stringify({ ...world, version: 2, geometries }),
  );
}
