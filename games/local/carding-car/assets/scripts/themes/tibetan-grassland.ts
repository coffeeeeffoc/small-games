import type { ThemeDefinition, ThemeScenery } from '../ThemeDefinition.ts';
import type { TrackData } from '../TrackGenerator.ts';
import { besideRoad, clearOfRoad } from '../ThemeScenery.ts';
import {
  grasslandHill,
  grasslandSurface,
  grasslandTent,
  grasslandTriangle,
  placeGrasslandMesh,
} from '../GrasslandGeometry.ts';

function createScenery(track: TrackData): ThemeScenery {
  const shapes: NonNullable<ThemeScenery['shapes']> = [],
    meshes: NonNullable<ThemeScenery['meshes']> = [],
    models: NonNullable<ThemeScenery['models']> = [];
  const occupied: { x: number; z: number; radius: number }[] = [];
  const openMeadow = (x: number, z: number, radius: number) =>
    occupied.every((p) => Math.hypot(p.x - x, p.z - z) > p.radius + radius + 1);
  const shape = (
    kind: 'ball' | 'box',
    color: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    yaw = 0,
  ) => shapes.push({ kind, color, x, y, z, sx, sy, sz, yaw });
  const safeSpot = (distance: number, side: number, radius: number, extra = 0) => {
    for (const direction of [side, -side])
      for (let step = 0; step < 12; step++) {
        const p = besideRoad(
          track,
          distance,
          direction * (track.width / 2 + radius + 5 + extra + step * 10),
        );
        if (clearOfRoad(track, p.x, p.z, radius) && openMeadow(p.x, p.z, radius))
          return { ...p, y: Math.max(0, p.y) };
      }
    return null;
  };
  const support = (x: number, y: number, z: number, radius: number) => {
    // Elevated routes get a grassy bank down to the common ground, not floating props.
    meshes.push(
      placeGrasslandMesh(
        grasslandSurface(
          '#8cab4c',
          [
            [radius, -0.1, radius],
            [radius * 0.82, y - 0.06, radius * 0.82],
            [0, y - 0.06, 0],
          ],
          radius > 12 ? 24 : 12,
        ),
        x,
        0,
        z,
      ),
    );
  };

  // Each complete camp, including its fence, ropes and flags, fits inside the tested 17m radius.
  for (let i = 0; i < 4; i++) {
    const p = safeSpot(40 + (track.length * i) / 4, i % 2 ? -1 : 1, 17);
    if (!p) continue;
    occupied.push({ ...p, radius: 17 });
    support(p.x, p.y, p.z, 17);
    const c = Math.cos(p.heading),
      s = Math.sin(p.heading);
    const local = (x: number, z: number) => ({ x: p.x + x * c + z * s, z: p.z + z * c - x * s });
    for (const tx of [-5.4, 5.4]) {
      const t = local(tx, 0);
      for (const mesh of grasslandTent)
        meshes.push(placeGrasslandMesh(mesh, t.x, p.y, t.z, p.heading));
      const door = local(tx, -3.7);
      shape('box', '#574937', door.x, p.y + 1.1, door.z, 1.6, 2.2, 0.16, p.heading);
      shape('box', '#c4ac78', t.x, p.y + 5.65, t.z, 0.17, 0.65, 0.17);
      for (const side of [-1, 1]) {
        const rope: NonNullable<ThemeScenery['meshes']>[number] = {
          color: '#baa476',
          geometry: { positions: [], normals: [], indices: [] },
        };
        grasslandTriangle(
          rope,
          [tx + side * 3.8, 2.3, 0],
          [tx + side * 5.1, 0.05, 0.07],
          [tx + side * 5.1, 0.05, -0.07],
        );
        grasslandTriangle(
          rope,
          [tx + side * 3.8, 2.3, 0],
          [tx + side * 5.1, 0.05, -0.07],
          [tx + side * 5.1, 0.05, 0.07],
        );
        meshes.push(placeGrasslandMesh(rope, p.x, p.y, p.z, p.heading));
      }
    }
    for (let f = -12; f <= 12; f += 3) {
      const v = local(f, 7.5);
      shape('box', '#86643d', v.x, p.y + 0.8, v.z, 0.19, 1.6, 0.19);
    }
    for (const h of [0.6, 1.15])
      for (let f = -10.5; f < 12; f += 3) {
        const v = local(f, 7.5);
        shape('box', '#9a784a', v.x, p.y + h, v.z, 3, 0.17, 0.17, p.heading);
      }
    for (const sign of [-1, 1]) {
      const v = local(sign * 12, -5.8);
      shape('box', '#86643d', v.x, p.y + 2.4, v.z, 0.17, 4.8, 0.17);
    }
    for (let f = 0; f < 20; f++) {
      const x = -11.5 + f * 1.2,
        y = 4.6 - 1.1 * Math.sin((f / 19) * Math.PI),
        v = local(x, -5.8);
      shape(
        'box',
        ['#4889bd', '#eee8c9', '#c65342', '#67a25a', '#edc45c'][f % 5],
        v.x,
        p.y + y - 0.4,
        v.z,
        0.85,
        0.8,
        0.045,
        p.heading,
      );
      shape('box', '#ba9b63', v.x, p.y + y, v.z, 1.3, 0.045, 0.045, p.heading);
    }
  }

  // Shaggy bodies, low heads and curved ivory horns make the herds read as yaks.
  for (let i = 0; i < 30; i++) {
    const p = safeSpot(18 + (i * track.length) / 30, i % 2 ? 1 : -1, 5, 3 + (i % 3) * 3);
    if (!p) continue;
    occupied.push({ ...p, radius: 5 });
    support(p.x, p.y, p.z, 5);
    const c = Math.cos(p.heading),
      s = Math.sin(p.heading),
      local = (x: number, z: number) => ({ x: p.x + x * c + z * s, z: p.z + z * c - x * s });
    shape('ball', '#44382e', p.x, p.y + 1.65, p.z, 3.9, 2.5, 3.1);
    shape('ball', '#514235', p.x, p.y + 2.45, p.z, 2.8, 1.1, 2.2);
    for (const x of [-1.15, 1.15])
      for (const z of [-0.85, 0.85]) {
        const v = local(x, z);
        shape('box', '#342b25', v.x, p.y + 0.52, v.z, 0.5, 1.05, 0.5);
      }
    for (let f = 0; f < 10; f++) {
      const a = (f / 10) * Math.PI * 2,
        v = local(Math.cos(a) * 1.55, Math.sin(a) * 1.2);
      meshes.push(
        placeGrasslandMesh(
          grasslandSurface(
            '#3a3028',
            [
              [0.06, 0.65, 0.06],
              [0.32, 1.6, 0.32],
            ],
            5,
          ),
          v.x,
          p.y,
          v.z,
        ),
      );
    }
    const head = local(2.05, 0),
      muzzle = local(2.68, 0);
    shape('ball', '#342b25', head.x, p.y + 1.65, head.z, 1.55, 1.9, 1.45);
    shape('ball', '#776957', muzzle.x, p.y + 1.2, muzzle.z, 0.95, 0.7, 0.85);
    for (const side of [-1, 1]) {
      const v = local(2.15, side * 0.73),
        tip = local(2.07, side * 1.13);
      shape('ball', '#e1d6b5', v.x, p.y + 2.35, v.z, 0.32, 0.32, 1.1);
      meshes.push(
        placeGrasslandMesh(
          grasslandSurface(
            '#f3e7c4',
            [
              [0.19, 0, 0.19],
              [0.16, 0.42, 0.16],
              [0, 0.82, 0],
            ],
            7,
          ),
          tip.x,
          p.y + 2.3,
          tip.z,
        ),
      );
    }
  }

  // Short creek reaches adapt to bends independently; a nearby branch breaks the reach safely.
  const creekFootprints: typeof occupied = [];
  for (let distance = 10; distance < track.length; distance += 7) {
    if (Math.floor(distance / 95) % 3 === 2) continue;
    const p = besideRoad(track, distance, -(track.width / 2 + 16 + 3 * Math.sin(distance / 32)));
    if (!clearOfRoad(track, p.x, p.z, 7) || !openMeadow(p.x, p.z, 7)) continue;
    const y = Math.max(0, p.y);
    creekFootprints.push({ ...p, radius: 7 });
    support(p.x, y, p.z, 7);
    meshes.push(
      placeGrasslandMesh(
        grasslandSurface(
          '#3eabae',
          [
            [3.9, 0, 5.5],
            [0, 0, 0],
          ],
          16,
        ),
        p.x,
        y + 0.015,
        p.z,
        p.heading,
      ),
    );
    meshes.push(
      placeGrasslandMesh(
        grasslandSurface(
          '#78d6d3',
          [
            [2.3, 0, 4.5],
            [0, 0, 0],
          ],
          14,
        ),
        p.x,
        y + 0.025,
        p.z,
        p.heading,
      ),
    );
    if (Math.floor(distance / 7) % 3 === 0)
      for (const side of [-1, 1]) {
        const x = p.x + Math.cos(p.heading) * side * 4.9,
          z = p.z - Math.sin(p.heading) * side * 4.9;
        shape('ball', '#9c9e88', x, y + 0.6, z, 1.8, 1.3, 1.6);
      }
  }

  // Hill footprints also avoid the creek, while adjacent water reaches may overlap each other.
  occupied.push(...creekFootprints);

  // Reusable low grass hills form the middle distance; broad gentle hills close the horizon.
  for (let i = 0; i < 26; i++) {
    const scale = 2.4 + (i % 4) * 0.4,
      radius = Math.hypot(7, 5) * scale,
      p = safeSpot((i * track.length) / 26, i % 2 ? -1 : 1, radius, 13);
    if (p)
      models.push({
        asset: 'expansion/props/grass-hill',
        x: p.x,
        y: 0,
        z: p.z,
        scale,
        yaw: p.heading,
      });
  }
  const points = [...track.main, ...track.shortcut],
    minX = Math.min(...points.map((p) => p.x)),
    maxX = Math.max(...points.map((p) => p.x)),
    minZ = Math.min(...points.map((p) => p.z)),
    maxZ = Math.max(...points.map((p) => p.z));
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2,
      x = (minX + maxX) / 2 + Math.cos(a) * ((maxX - minX) / 2 + 160),
      z = (minZ + maxZ) / 2 + Math.sin(a) * ((maxZ - minZ) / 2 + 160),
      radius = 75 + (i % 3) * 12;
    if (clearOfRoad(track, x, z, radius) && openMeadow(x, z, radius))
      meshes.push(
        placeGrasslandMesh(
          grasslandHill(
            radius,
            radius * 0.8,
            20 + (i % 4) * 5,
            ['#7f9e49', '#8ba650', '#96af5b'][i % 3],
          ),
          x,
          -0.08,
          z,
          a,
        ),
      );
    if (i % 2 === 0)
      for (let j = -1; j <= 1; j++)
        shape('ball', '#f0f5ef', x + j * 18, 87 + (i % 3) * 10 + (j === 0 ? 4 : 0), z, 38, 16, 23);
  }

  // Flowers, pale stones and grass patches supply close-range scale without filling the open meadow.
  for (let i = 0; i < 230; i++) {
    const side = i % 2 ? 1 : -1,
      p = besideRoad(
        track,
        ((i + 0.35) * track.length) / 230,
        side * (track.width / 2 + 5 + (i % 7) * 1.6),
      );
    if (!clearOfRoad(track, p.x, p.z, 2.1)) continue;
    const y = Math.max(0, p.y);
    support(p.x, y, p.z, 2.1);
    if (i % 9 === 0) shape('ball', '#acaf91', p.x, y + 0.5, p.z, 1.7, 1.05, 1.3);
    else
      for (let j = 0; j < 3; j++) {
        const x = p.x + Math.cos(j * 2.1) * 0.85,
          z = p.z + Math.sin(j * 2.1) * 0.85;
        shape('box', '#6b8e3a', x, y + 0.22, z, 0.07, 0.44, 0.07);
        meshes.push(
          placeGrasslandMesh(
            grasslandSurface(
              i % 3 ? '#f4efc8' : '#efcf59',
              [
                [0.27, 0, 0.27],
                [0, 0.08, 0],
              ],
              6,
            ),
            x,
            y + 0.4,
            z,
          ),
        );
      }
  }
  return { shapes, meshes, models };
}

export const theme: ThemeDefinition = {
  id: 'tibetan-grassland',
  name: '青藏高原草原',
  tagline: '绕过毡房与牦牛牧场，沿溪流追逐草原长风',
  colors: {
    ground: '#96af57',
    road: '#62675c',
    shoulder: '#a7b970',
    rail: '#ebe8ce',
    accent: '#c4664b',
    sky: '#91c7ec',
  },
  scenery: createScenery,
};
