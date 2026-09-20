import {
  Color,
  DirectionalLight,
  ImageAsset,
  isValid,
  Material,
  MeshRenderer,
  Node,
  primitives,
  Texture2D,
  TextureCube,
} from 'cc';
import { loadArt, MeshBatch } from './SceneArt';
import { ribbon } from './Track';
import type { TrackData } from './TrackGenerator';
import { glacierArch, glacierArches, glacierMountain, glacierRock } from './GlacierGeometry';
import { besideRoad, clearOfRoad, sceneryFits } from './ThemeScenery';

const ICE = '#76cdef',
  SNOW = '#eef6ff',
  ROCK = '#657f9d',
  ROAD = '#8fb0cf',
  ORANGE = '#f78638';

/** Shared daylight sky; glacier ice also uses it as its reflected environment. */
function daylightSky() {
  const size = 128;
  const face = (index: number) => {
    const pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const u = ((x + 0.5) / size) * 2 - 1,
          v = ((y + 0.5) / size) * 2 - 1;
        const d = [
          [u, -v, 1],
          [-u, -v, -1],
          [-1, -v, u],
          [1, -v, -u],
          [u, 1, v],
          [u, -1, -v],
        ][index];
        const l = Math.hypot(...d),
          h = d[1] / l,
          longitude = Math.atan2(d[2], d[0]);
        const t = Math.max(0, h) ** 0.48;
        let cloud = 0;
        for (let i = 0; i < 9; i++) {
          const angle = (i * Math.PI * 2) / 9,
            height = 0.22 + (i % 3) * 0.12;
          for (let puff = -1; puff <= 1; puff++) {
            const delta = longitude - angle - puff * 0.065,
              dx = Math.atan2(Math.sin(delta), Math.cos(delta)) / 0.075,
              dy = (h - height - (puff === 0 ? 0.025 : 0)) / 0.045;
            cloud = Math.max(cloud, Math.exp(-(dx * dx + dy * dy) * 1.4));
          }
        }
        cloud = Math.min(1, cloud * 1.65);
        const color = [191 - t * 46, 225 - t * 20, 246 + t * 5];
        for (let c = 0; c < 3; c++)
          pixels[(y * size + x) * 4 + c] = Math.min(
            255,
            color[c] + (255 - color[c]) * cloud,
          );
        pixels[(y * size + x) * 4 + 3] = 255;
      }
    return new ImageAsset({
      _data: pixels,
      width: size,
      height: size,
      format: Texture2D.PixelFormat.RGBA8888,
      _compressed: false,
    });
  };
  const images = Array.from({ length: 6 }, (_, i) => face(i));
  const cube = new TextureCube();
  cube.setMipFilter(Texture2D.Filter.LINEAR);
  cube.image = {
    front: images[0],
    back: images[1],
    left: images[2],
    right: images[3],
    top: images[4],
    bottom: images[5],
  };
  return { cube, images };
}

let restoreLighting: (() => void) | undefined;

/** Called synchronously on selection so an old asynchronous theme cannot change the lighting. */
export function setThemeLighting(parent: Node, glacier: boolean) {
  restoreLighting?.();
  restoreLighting = undefined;
  const globals = parent.scene!.globals;
  const previous = {
    skybox: { enabled: globals.skybox.enabled, envLightingType: globals.skybox.envLightingType, envmap: globals.skybox.envmap },
    ambient: { skyLightingColor: globals.ambient.skyLightingColor.clone(), groundLightingColor: globals.ambient.groundLightingColor.clone(), skyIllum: globals.ambient.skyIllum },
    fog: { enabled: globals.fog.enabled, type: globals.fog.type, fogColor: globals.fog.fogColor.clone(), fogStart: globals.fog.fogStart, fogEnd: globals.fog.fogEnd },
    shadows: { enabled: globals.shadows.enabled, type: globals.shadows.type, shadowMapSize: globals.shadows.shadowMapSize },
  };
  const restore = () => {
    Object.assign(globals.skybox, previous.skybox);
    Object.assign(globals.ambient, previous.ambient);
    Object.assign(globals.fog, previous.fog);
    Object.assign(globals.shadows, previous.shadows);
  };
  restoreLighting = restore;
  const { cube, images } = daylightSky();
  globals.skybox.envmap = cube;
  globals.skybox.envLightingType = glacier ? 1 : 0;
  globals.skybox.enabled = true;
  globals.ambient.skyIllum = 40000;
  parent.once(Node.EventType.NODE_DESTROYED, () => {
    if (restoreLighting === restore) {
      restore();
      restoreLighting = undefined;
    }
    cube.destroy();
    images.forEach((image) => image.destroy());
  });
  if (!glacier) return;
  globals.ambient.skyLightingColor = new Color(184, 214, 255);
  globals.ambient.groundLightingColor = new Color(109, 149, 190);
  globals.fog.type = 0;
  globals.fog.fogColor = new Color(194, 222, 245);
  globals.fog.fogStart = 100;
  globals.fog.fogEnd = 620;
  globals.fog.enabled = true;
  globals.shadows.type = 1;
  globals.shadows.shadowMapSize = 1024;
  globals.shadows.enabled = true;
  const sun = new Node('GlacierSun');
  parent.addChild(sun);
  sun.setRotationFromEuler(-53, -35, 0);
  const light = sun.addComponent(DirectionalLight);
  light.color = new Color(255, 243, 226);
  light.illuminance = 75000;
  light.shadowEnabled = true;
  light.shadowDistance = 115;
  light.csmLevel = 2;
  light.shadowPcf = 1;
  light.shadowBias = 0.0001;
  light.shadowNormalBias = 0.12;
}

export async function buildGlacier(parent: Node, track: TrackData) {
  const [ice, road, surfaceMaterial] = await Promise.all([
    loadArt('expansion/textures/glacier/texture', Texture2D),
    loadArt('glacier-sample/road/texture', Texture2D),
    loadArt('glacier-sample/surface', Material),
  ]);
  if (!isValid(parent)) return;
  for (const texture of [ice, road]) {
    texture.setWrapMode(Texture2D.WrapMode.REPEAT, Texture2D.WrapMode.REPEAT);
    texture.setMipFilter(Texture2D.Filter.LINEAR);
  }
  const materials = new Map<string, Material>();
  const getMaterial = (color: string) => {
    let material = materials.get(color);
    if (material) return material;
    material = new Material();
    const texture = color === ICE ? ice : color === ROAD ? road : undefined;
    material.initialize({
      effectAsset: surfaceMaterial.effectAsset!,
      defines: { USE_ALBEDO_MAP: !!texture },
    });
    material.setProperty(
      'mainColor',
      new Color().fromHEX(color === ICE ? '#b9edff' : color === ROAD ? '#b6b9b9' : color),
    );
    material.setProperty('roughness', color === ICE ? 0.23 : color === ROAD ? 0.28 : 0.83);
    material.setProperty('metallic', 0);
    material.setProperty('specularIntensity', color === ICE || color === ROAD ? 0.75 : 0.25);
    if (texture) material.setProperty('mainTexture', texture);
    materials.set(color, material);
    return material;
  };
  parent.once(Node.EventType.NODE_DESTROYED, () =>
    materials.forEach((material) => material.destroy()),
  );
  const root = new Node('GlacierScenery');
  parent.addChild(root);
  const build = (batch: MeshBatch, name: string) => {
    const section = batch.build(root, name, getMaterial);
    // Cliffs cast the snowbank silhouettes; road and snow need no extra shadow passes.
    for (const node of section.children)
      if (node.name !== ICE && node.name !== ROCK)
        node.getComponent(MeshRenderer)!.shadowCastingMode = 0;
  };
  let b = new MeshBatch(true);
  // Use the shared closed road samples: normals and vertices match at the lap seam.
  for (const [points, width, length] of [
    [track.main, track.width, track.length],
    [track.shortcut, track.shortcutWidth, track.shortcutLength],
  ] as const) {
    if (points.length < 2) continue;
    const surface = ribbon(points, -width / 2, width / 2, 0.025);
    const repeats = Math.max(1, Math.round(length / 15)), first = points[0].s,
      span = points[points.length - 1].s - first;
    surface.uvs = points.flatMap(p => [0, (p.s - first) / span * repeats, width / 9.4, (p.s - first) / span * repeats]);
    b.add(ROAD, surface);
    // Broad margins sit below both surfaces, including their open fork junctions.
    b.add(SNOW, ribbon(points, -width / 2 - 3.2, width / 2 + 3.2, -0.06));
  }
  for (const [index, wall] of track.barriers.entries()) {
    // The same exact footprint as collision, including bends and the lap seam.
    b.box(
      index % 4 < 2 ? SNOW : ORANGE,
      wall.x,
      wall.y + 0.4,
      wall.z,
      wall.halfWidth * 2,
      0.8,
      wall.halfLength * 2,
      wall.heading,
    );
    if (index % 6 === 0) {
      b.box('#dd762b', wall.x, wall.y + 0.92, wall.z, 0.52, 0.26, 0.5, wall.heading);
      b.ball('#fff4b5', wall.x, wall.y + 1.1, wall.z, 0.38, 0.28, 0.38);
    }
  }
  build(b, 'RoadAndRails');
  const station = Array.from({ length: 16 }, (_, i) => ({
    ...besideRoad(track, 48 + Math.floor(i / 2) * 28, (i % 2 ? -1 : 1) * (track.width / 2 + 17)),
    side: i % 2 ? -1 : 1,
  })).find(p => clearOfRoad(track, p.x, p.z, 11));
  const nearStation = (x: number, z: number, radius: number) =>
    station && Math.hypot(x - station.x, z - station.z) < radius + 13;
  // Use both branch widths and elevations, leaving their junctions and nearby bends unobstructed.
  for (const [shortcut, width, length] of [
    [false, track.width, track.length], [true, track.shortcutWidth, track.shortcutLength],
  ] as const) {
    if (shortcut && track.shortcut.length < 2) continue;
    const rows = Math.ceil(length / 11);
    for (let i = 0; i < rows; i++) {
      const s = shortcut ? track.shortcutStart + (track.shortcutEnd - track.shortcutStart) * i / rows
        : -16 + i * track.length / rows;
      if (i % 8 === 0) b = new MeshBatch(true);
      for (const side of [-1, 1]) {
        const height = 14 + Math.sin(i * 1.7 + side) * 4 + (side < 0 ? 2 : 0),
          radius = 6.5 + (Math.sin(i * 1.2) + 1) * 0.8,
          p = besideRoad(track, s, side * (width / 2 + 12 + Math.sin(i * 1.2 + side) * 2), shortcut);
        if (clearOfRoad(track, p.x, p.z, radius * 1.06) && !nearStation(p.x, p.z, radius)) {
          const base = Math.min(-0.6, p.y - 0.6);
          b.add(ICE, glacierRock(i + side * 17, radius, height + p.y - base), p.x, base, p.z, 1, 1, 1, i * 0.73);
          b.ball(SNOW, p.x, p.y + height, p.z, radius * 2, 4.4, radius * 1.8);
        }
        for (let n = 0; n < 3; n++) {
          const bank = besideRoad(track, s + n * 3.3, side * (width / 2 + 4.8 + n * 0.8), shortcut);
          if (clearOfRoad(track, bank.x, bank.z, Math.max(6, 5 + n) / 2) && !nearStation(bank.x, bank.z, 2))
            b.ball(SNOW, bank.x, bank.y - 0.25, bank.z, 5 + n, 1.3 + n * 0.6, 6);
        }
        if (i % 3 === 1) {
          const rock = besideRoad(track, s, side * (width / 2 + 7.5), shortcut);
          if (clearOfRoad(track, rock.x, rock.z, 2.4) && !nearStation(rock.x, rock.z, 2.4)) {
            b.add(ROCK, glacierRock(i * 2, 2.2, 3.3), rock.x, rock.y - 0.3, rock.z);
            b.ball(SNOW, rock.x, rock.y + 3, rock.z, 4.8, 1.2, 4.5);
          }
        }
      }
      // Small spatial batches let native frustum/shadow culling skip distant walls.
      if (i % 8 === 7 || i === rows - 1) build(b, `IceWalls-${shortcut ? 'Shortcut-' : ''}${Math.floor(i / 8)}`);
    }
  }
  for (const arch of glacierArches(track)) {
    b = new MeshBatch(true);
    b.add(ICE, glacierArch(false, arch.opening), arch.x, arch.y, arch.z, 1, 1, 1, arch.heading);
    b.add(SNOW, glacierArch(true, arch.opening), arch.x, arch.y, arch.z, 1, 1, 1, arch.heading);
    for (const side of [-1, 1]) {
      const p = besideRoad(track, arch.distance, side * (arch.opening + 3.5));
      if (clearOfRoad(track, p.x, p.z, 5.1))
        b.add(ICE, glacierRock(6 + side, 4.8, 11), p.x, p.y - 0.5, p.z, 1, 1, 1, arch.heading);
    }
    for (let i = 0; i < 19; i++) {
      const x = (-0.84 + i * 1.68 / 18) * arch.opening,
        y = arch.y + 4 + Math.sqrt(arch.opening * arch.opening - x * x),
        length = 0.6 + (Math.sin(i * 7) + 1) * 0.9;
      const p = { x: arch.x + Math.cos(arch.heading) * x - Math.sin(arch.heading) * 5.9,
        z: arch.z - Math.sin(arch.heading) * x - Math.cos(arch.heading) * 5.9 };
      if (!sceneryFits(track, p.x, y - length / 2, p.z, 0.42, length / 2)) continue;
      b.add(
        ICE,
        primitives.cylinder(0.22 + (i % 3) * 0.1, 0, length, { radialSegments: 6 }),
        p.x,
        y - length / 2,
        p.z,
      );
    }
    build(b, `IceArch-${Math.round(arch.distance)}`);
  }
  // The skyline surrounds the chosen route's bounds, including off-centre and elevated routes.
  const xs = track.main.map(p => p.x), zs = track.main.map(p => p.z),
    cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2,
    horizon = Math.max(...track.main.map(p => Math.hypot(p.x - cx, p.z - cz))) + track.width / 2 + 125,
    elevation = Math.max(...track.main.map(p => p.y));
  for (let i = 0; i < 40; i++) {
    if (i % 5 === 0) b = new MeshBatch(true);
    const angle = (i * Math.PI * 2) / 40,
      radius = horizon + (i % 3) * 35;
    const p = { x: cx + Math.cos(angle) * radius, z: cz + Math.sin(angle) * radius },
      height = 62 + elevation + Math.sin(i * 4.3) * 27,
      width = 44 + (i % 3) * 10;
    if (clearOfRoad(track, p.x, p.z, width * 1.2)) {
      b.add(ROCK, glacierMountain(i, false), p.x, -5, p.z, width, height, width * 0.8, i * 0.7);
      b.add(SNOW, glacierMountain(i, true), p.x, -5, p.z, width, height, width * 0.8, i * 0.7);
    }
    if (i % 5 === 4) build(b, `Mountains-${Math.floor(i / 5)}`);
  }
  if (!station) return;
  // A cream/orange polar station with a raised deck, stairs, railings and communications mast.
  b = new MeshBatch(true);
  const h = station.heading, front = -station.side;
  const box = (color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    b.box(color, station.x + Math.cos(h) * x + Math.sin(h) * z, station.y + y,
      station.z - Math.sin(h) * x + Math.cos(h) * z, sx, sy, sz, h);
  for (const x of [-5, 5]) for (const z of [-4, 4]) box(ROCK, x, 0.9, z, 0.5, 2.8, 0.5);
  box(ROCK, 0, 2, 0, 12, 0.4, 10);
  box('#fff1d1', 0, 4.2, 0, 8, 4, 6);
  box(ORANGE, 0, 6.2, 0, 9, 0.65, 7);
  box(ORANGE, 0, 2.45, 0, 8.2, 0.55, 6.2);
  box('#244768', front * 4.06, 4.35, -1.6, 0.12, 1.6, 1.5);
  box('#244768', front * 4.06, 4.35, 1.6, 0.12, 1.6, 1.5);
  box(ORANGE, front * 4.09, 3.85, 0, 0.16, 2.7, 1.1);
  box('#fff1d1', front * 4.19, 3.8, 0.3, 0.12, 0.12, 0.12);
  for (const z of [-4.7, 4.7]) {
    box(ORANGE, 0, 3.35, z, 12, 0.13, 0.13);
    for (const x of [-5.8, -3, 0, 3, 5.8]) box(ROCK, x, 2.8, z, 0.12, 1.4, 0.12);
  }
  for (let i = 0; i < 6; i++) box(ROCK, front * (6 + i * 0.48), 1.85 - i * 0.32, 0, 0.65, 0.24, 2);
  box(ROCK, 1.8, 9, -1.6, 0.15, 6.1, 0.15);
  box(ORANGE, 1.8, 10.2, -1.6, 0.35, 1.1, 0.35);
  box('#fff1d1', 1.8, 10.8, -1.6, 1.8, 0.15, 0.15);
  b.ball(SNOW, station.x, station.y + 6.65, station.z, 9.2, 1.1, 7.2);
  b.add('#fff1d1', primitives.sphere(0.8, { segments: 12 }),
    station.x - Math.sin(h) * 2, station.y + 7.5, station.z - Math.cos(h) * 2, 0.2, 1, 1, h);
  build(b, 'ResearchStation');
}
