// Rendering and collision use the same triangles, including across recycled tile seams.
export const TERRAIN_STEP = 20;
export const TILE_SIZE = 320;
export const FLIGHT_CEILING = 360;
export const valleyCenter = (z: number) => 115 * Math.sin(z * 0.0018);
export function terrainVertex(x: number, z: number) {
  const bank = Math.min(1, Math.max(0, (Math.abs(x - valleyCenter(z)) - 90) / 360));
  const ridge = bank * bank * (3 - 2 * bank);
  return (
    12 +
    6 * Math.sin(x * 0.008) * Math.cos(z * 0.006) +
    4 * Math.sin(z * 0.016) +
    ridge *
      (148 +
        44 * Math.sin(z * 0.004 + x * 0.003) +
        36 * Math.cos(x * 0.022 - z * 0.012) +
        18 * Math.sin(x * 0.041 + z * 0.026))
  );
}
export function terrainHeight(x: number, z: number) {
  const gx = Math.floor(x / TERRAIN_STEP) * TERRAIN_STEP;
  const gz = Math.floor(z / TERRAIN_STEP) * TERRAIN_STEP;
  const u = (x - gx) / TERRAIN_STEP,
    v = (z - gz) / TERRAIN_STEP;
  const a = terrainVertex(gx, gz),
    b = terrainVertex(gx + TERRAIN_STEP, gz);
  const c = terrainVertex(gx, gz + TERRAIN_STEP),
    d = terrainVertex(gx + TERRAIN_STEP, gz + TERRAIN_STEP);
  return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
}
export function terrainGeometry(tx: number, tz: number) {
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const count = TILE_SIZE / TERRAIN_STEP;
  for (let z = 0; z <= count; z++)
    for (let x = 0; x <= count; x++) {
      const wx = tx * TILE_SIZE + x * TERRAIN_STEP,
        wz = tz * TILE_SIZE + z * TERRAIN_STEP;
      const y = terrainVertex(wx, wz);
      const nx = terrainVertex(wx - 1, wz) - terrainVertex(wx + 1, wz);
      const nz = terrainVertex(wx, wz - 1) - terrainVertex(wx, wz + 1);
      const length = Math.hypot(nx, 2, nz);
      positions.push(wx, y, wz);
      normals.push(nx / length, 2 / length, nz / length);
      uvs.push(wx / 65, wz / 65);
      const snow = Math.min(1, Math.max(0, (y - 170) / 45)) * Math.max(0, 2 / length);
      const rock = Math.min(1, Math.hypot(nx, nz) * 0.65);
      colors.push(
        0.58 + rock * 0.13 + snow * 0.29,
        0.68 - rock * 0.07 + snow * 0.32,
        0.41 + rock * 0.23 + snow * 0.36,
        1,
      );
      if (x < count && z < count) {
        const a = z * (count + 1) + x,
          b = a + count + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  return { positions, normals, uvs, colors, indices };
}
export type Scenery = {
  model: string;
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  radius: number;
  height: number;
};
// One deterministic forest/rock group per cell, shared with collision and independent of camera motion.
export function sceneryAt(cx: number, cz: number): Scenery {
  const seed = (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) >>> 0;
  const x = cx * 120 + 30 + (seed % 55),
    z = cz * 120 + 30 + ((seed >>> 8) % 55);
  const forest = Math.abs(x - valleyCenter(z)) > 65 && terrainHeight(x, z) < 150;
  const scale = forest ? 1.65 : 3;
  return {
    model: forest ? `forest-${(seed % 2) + 1}` : `rock-${(seed % 3) + 1}`,
    x,
    z,
    y: terrainHeight(x, z) - (forest ? 0 : 2),
    scale,
    rotation: seed % 360,
    radius: forest ? 50 : 17,
    height: forest ? 38 : 14,
  };
}
export function obstacleHeight(x: number, z: number) {
  let height = -Infinity;
  const cx = Math.floor(x / 120),
    cz = Math.floor(z / 120);
  for (let iz = cz - 1; iz <= cz + 1; iz++)
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      const o = sceneryAt(ix, iz);
      if (Math.hypot(x - o.x, z - o.z) < o.radius) height = Math.max(height, o.y + o.height);
    }
  return height;
}
