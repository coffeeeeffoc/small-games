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
function noise(x: number, z: number) {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  const blend = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const hash = (a: number, b: number) => {
    let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const u = blend(x - ix),
    v = blend(z - iz);
  const a = hash(ix, iz),
    b = hash(ix + 1, iz),
    c = hash(ix, iz + 1),
    d = hash(ix + 1, iz + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
export function terrainVertex(x: number, z: number) {
  const distance = Math.abs(x - valleyCenter(z));
  const bank = ramp(150, 370, distance);
  const foothill = ramp(350, 1700 + noise(x / 2400, z / 2400) * 1500, distance);
  // Broad massifs carry smaller spurs; folding the whole height field creates knife walls.
  const wx = x + (noise(x / 4300 + 7, z / 4300 - 3) - 0.5) * 1500;
  const wz = z + (noise(x / 5100 - 11, z / 5100 + 17) - 0.5) * 1300;
  const u = wx * 0.88 + wz * 0.47,
    v = wz * 0.88 - wx * 0.47;
  const massif = noise(u / 4300 + 3, v / 3400 - 9);
  const spurs = 1 - (noise(u / 1700 + 29, v / 1300 - 13) * 2 - 1) ** 2;
  const mountain =
    140 +
    1900 * massif ** 1.25 +
    420 * spurs ** 2 +
    (noise(x / 360, z / 360) - 0.5) * 160 +
    (noise(x / 145 + 17, z / 145 - 5) - 0.5) * 36;
  return (
    -24 +
    bank * (140 + 26 * Math.sin(z * 0.0017)) +
    foothill * mountain +
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
    }
  const vertex = (x: number, z: number) => {
    const index = positions.length / 3;
    const nx =
      (terrainVertex(x - TERRAIN_STEP, z) - terrainVertex(x + TERRAIN_STEP, z)) / TERRAIN_STEP;
    const nz =
      (terrainVertex(x, z - TERRAIN_STEP) - terrainVertex(x, z + TERRAIN_STEP)) / TERRAIN_STEP;
    const length = Math.hypot(nx, 2, nz);
    positions.push(x, terrainVertex(x, z), z);
    normals.push(nx / length, 2 / length, nz / length);
    return index;
  };
  // Join every fine boundary vertex to the coarse ring; vertical skirts created false cliffs.
  for (let z = 0; z < count; z++)
    for (let x = 0; x < count; x++) {
      const wx = left + x * step,
        wz = top + z * step;
      if (wx >= minX && wx < maxX && wz >= minZ && wz < maxZ) continue;
      const a = z * (count + 1) + x,
        b = a + count + 1;
      const corners = [a, b, b + 1, a + 1];
      const polygon: number[] = [];
      for (let k = 0; k < 4; k++) {
        const p = corners[k],
          q = corners[(k + 1) % 4];
        polygon.push(p);
        const px = positions[p * 3],
          pz = positions[p * 3 + 2];
        const qx = positions[q * 3],
          qz = positions[q * 3 + 2];
        const seam =
          px === qx
            ? (px === minX || px === maxX) && Math.min(pz, qz) >= minZ && Math.max(pz, qz) <= maxZ
            : (pz === minZ || pz === maxZ) && Math.min(px, qx) >= minX && Math.max(px, qx) <= maxX;
        if (seam)
          for (let j = TERRAIN_STEP; j < step; j += TERRAIN_STEP)
            polygon.push(vertex(px + ((qx - px) * j) / step, pz + ((qz - pz) * j) / step));
      }
      if (polygon.length === 4) indices.push(a, b, a + 1, a + 1, b, b + 1);
      else {
        const center = vertex(wx + step / 2, wz + step / 2);
        for (let k = 0; k < polygon.length; k++)
          indices.push(center, polygon[k], polygon[(k + 1) % polygon.length]);
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
  visible: boolean;
};
const sceneryCache = new Map<string, Scenery>();
// One deterministic forest/rock group per cell, shared with collision and independent of camera motion.
export function sceneryAt(cx: number, cz: number): Scenery {
  const key = `${cx}:${cz}`;
  const cached = sceneryCache.get(key);
  if (cached) return cached;
  const seed = (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) >>> 0;
  const x = cx * 120 + 30 + (seed % 55),
    z = cz * 120 + 30 + ((seed >>> 8) % 55);
  const y = terrainHeight(x, z);
  const slope =
    Math.hypot(
      terrainHeight(x + 32, z) - terrainHeight(x - 32, z),
      terrainHeight(x, z + 32) - terrainHeight(x, z - 32),
    ) / 64;
  const forest =
    Math.abs(x - valleyCenter(z)) > 340 &&
    y < 1100 &&
    slope < 0.5 &&
    noise(x / 700 + 5, z / 700 - 9) > 0.35;
  const cluster = forest && slope < 0.045;
  const scale = forest ? 1.35 + (seed % 40) / 100 : 1 + (seed % 100) / 100;
  const result = {
    model: forest
      ? cluster
        ? `forest-${(seed % 2) + 1}`
        : `pine-${(seed % 3) + 1}`
      : `rock-${(seed % 3) + 1}`,
    x,
    z,
    y: y - (forest ? 0 : 0.5),
    scale,
    rotation: seed % 360,
    radius: (forest ? (cluster ? 26.6 : 6.2) : 5.7) * scale,
    height:
      (forest ? (cluster ? [16.94666, 17.95276][seed % 2] : [18, 14, 22][seed % 3]) : 4.7) * scale,
    visible: y >= WATER_LEVEL + 2 && (forest || (seed % 3 !== 0 && noise(x / 350, z / 350) > 0.48)),
  };
  if (sceneryCache.size >= 4096) sceneryCache.clear();
  sceneryCache.set(key, result);
  return result;
}
export function obstacleHeight(x: number, z: number) {
  let height = -Infinity;
  const cx = Math.floor(x / 120),
    cz = Math.floor(z / 120);
  for (let iz = cz - 1; iz <= cz + 1; iz++)
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      const o = sceneryAt(ix, iz);
      if (!o.visible) continue;
      if (Math.hypot(x - o.x, z - o.z) < o.radius) height = Math.max(height, o.y + o.height);
    }
  return height;
}
