// Rendering and collision use the same triangles, including across recycled tile seams.
export const TERRAIN_STEP = 64;
export const TILE_SIZE = 1536;
export const FLIGHT_CEILING = 6000;
export const CRUISE_ALTITUDE = 1600;
export const WATER_LEVEL = 18;
export const valleyCenter = (z: number) =>
  520 * Math.sin(z * 0.00031) + 180 * Math.sin(z * 0.00071);
const ramp = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function terrainVertex(x: number, z: number) {
  const distance = Math.abs(x - valleyCenter(z));
  const bank = ramp(150, 370, distance);
  const foothill = ramp(400, 1150, distance);
  // Fixed, independently seeded massifs. Streaming replaces meshes, never world coordinates.
  let mountain = 0;
  const cx = Math.floor(x / 2800),
    cz = Math.floor(z / 2800);
  for (let iz = cz - 1; iz <= cz + 1; iz++)
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      const seed = (Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663) ^ 0x5f3759df) >>> 0;
      const mx = ix * 2800 + 700 + (seed % 1400);
      const mz = iz * 2800 + 700 + ((seed >>> 11) % 1400);
      const dx = (x - mx) / (1100 + (seed % 550));
      const dz = (z - mz) / (1250 + ((seed >>> 6) % 750));
      const ridge = Math.max(0, 1 - Math.hypot(dx + dz * 0.32, dz));
      const erosion =
        1 + 0.12 * Math.sin(x * 0.009 + z * 0.006) + 0.06 * Math.sin(z * 0.023 - x * 0.014);
      mountain = Math.max(mountain, Math.pow(ridge, 1.3) * (950 + (seed % 1000)) * erosion);
    }
  return (
    -24 +
    bank * (140 + 26 * Math.sin(z * 0.0017)) +
    foothill * (mountain + 90 + 65 * Math.sin(x * 0.0014 - z * 0.001)) +
    bank * 8 * Math.sin(x * 0.013 + z * 0.009)
  );
}
const collisionVertices = new Map<string, number>();
function collisionVertex(x: number, z: number) {
  const key = `${x}:${z}`;
  let y = collisionVertices.get(key);
  if (y === undefined) {
    if (collisionVertices.size >= 16384) collisionVertices.clear();
    y = terrainVertex(x, z);
    collisionVertices.set(key, y);
  }
  return y;
}
export function terrainHeight(x: number, z: number) {
  const gx = Math.floor(x / TERRAIN_STEP) * TERRAIN_STEP;
  const gz = Math.floor(z / TERRAIN_STEP) * TERRAIN_STEP;
  const u = (x - gx) / TERRAIN_STEP,
    v = (z - gz) / TERRAIN_STEP;
  const a = collisionVertex(gx, gz),
    b = collisionVertex(gx + TERRAIN_STEP, gz);
  const c = collisionVertex(gx, gz + TERRAIN_STEP),
    d = collisionVertex(gx + TERRAIN_STEP, gz + TERRAIN_STEP);
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
      const nx =
        (terrainVertex(wx - TERRAIN_STEP, wz) - terrainVertex(wx + TERRAIN_STEP, wz)) /
        TERRAIN_STEP;
      const nz =
        (terrainVertex(wx, wz - TERRAIN_STEP) - terrainVertex(wx, wz + TERRAIN_STEP)) /
        TERRAIN_STEP;
      const length = Math.hypot(nx, 2, nz);
      positions.push(wx, y, wz);
      normals.push(nx / length, 2 / length, nz / length);
      uvs.push(wx / 65, wz / 65);
      const snow = Math.min(1, Math.max(0, (y - 1150) / 400)) * Math.max(0, 2 / length);
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
// The distant ring shares world heights; the detailed collision mesh replaces it before approach.
export function horizonGeometry(cx: number, cz: number) {
  const step = 256,
    count = 90;
  const left = (cx - 7) * TILE_SIZE,
    top = (cz - 7) * TILE_SIZE;
  const minX = (cx - 3) * TILE_SIZE,
    maxX = (cx + 4) * TILE_SIZE;
  const minZ = (cz - 3) * TILE_SIZE,
    maxZ = (cz + 4) * TILE_SIZE;
  const positions: number[] = [],
    normals: number[] = [],
    indices: number[] = [];
  const heights = Array.from({ length: (count + 1) ** 2 }, (_, i) =>
    terrainVertex(left + (i % (count + 1)) * step, top + Math.floor(i / (count + 1)) * step),
  );
  for (let z = 0; z <= count; z++)
    for (let x = 0; x <= count; x++) {
      const i = z * (count + 1) + x,
        wx = left + x * step,
        wz = top + z * step;
      positions.push(wx, heights[i], wz);
      const nx =
        (heights[z * (count + 1) + Math.max(0, x - 1)] -
          heights[z * (count + 1) + Math.min(count, x + 1)]) /
        step;
      const nz =
        (heights[Math.max(0, z - 1) * (count + 1) + x] -
          heights[Math.min(count, z + 1) * (count + 1) + x]) /
        step;
      const length = Math.hypot(nx, 2, nz);
      normals.push(nx / length, 2 / length, nz / length);
      if (x < count && z < count && !(wx >= minX && wx < maxX && wz >= minZ && wz < maxZ)) {
        const b = i + count + 1;
        indices.push(i, b, i + 1, i + 1, b, b + 1);
      }
    }
  // Short skirts conceal the coarse/fine edge between shared lattice vertices.
  for (const [ax, az, bx, bz] of [
    [minX, minZ, maxX, minZ],
    [maxX, minZ, maxX, maxZ],
    [maxX, maxZ, minX, maxZ],
    [minX, maxZ, minX, minZ],
  ]) {
    const segments = (7 * TILE_SIZE) / TERRAIN_STEP;
    for (let j = 0; j < segments; j++) {
      const i = positions.length / 3;
      for (const t of [j / segments, (j + 1) / segments]) {
        const x = ax + (bx - ax) * t,
          z = az + (bz - az) * t,
          y = terrainHeight(x, z);
        positions.push(x, y, z, x, y - 400, z);
        normals.push(0, 1, 0, 0, 1, 0);
      }
      indices.push(i, i + 1, i + 2, i + 2, i + 1, i + 3, i + 2, i + 1, i, i + 3, i + 1, i + 2);
    }
  }
  return { positions, normals, indices };
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
  const forest = Math.abs(x - valleyCenter(z)) > 340 && terrainHeight(x, z) < 650;
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
      if (o.y < WATER_LEVEL + 2) continue;
      if (Math.hypot(x - o.x, z - o.z) < o.radius) height = Math.max(height, o.y + o.height);
    }
  return height;
}
