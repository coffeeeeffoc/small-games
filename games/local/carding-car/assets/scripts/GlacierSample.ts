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
import { pointAt, type TrackData } from './TrackGenerator';
import { glacierArch, glacierArchDistances, glacierMountain, glacierRock } from './GlacierGeometry';

const ICE = '#76cdef',
  SNOW = '#eef6ff',
  ROCK = '#657f9d',
  ROAD = '#8fb0cf',
  ORANGE = '#f78638';

/** A tiny generated cubemap supplies both the sky and the ice's reflected environment. */
function glacierSky() {
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
        const cloud =
          Math.max(
            0,
            Math.sin(longitude * 8 + h * 16) + Math.sin(longitude * 15 - h * 23) * 0.4 - 0.2,
          ) *
          Math.exp(-(((h - 0.22) / 0.16) ** 2)) *
          0.62;
        const color = h < 0 ? [179, 203, 222] : [166 - t * 130, 213 - t * 85, 255 - t * 15];
        const sun = Math.max(0, (d[0] * 0.35 + d[1] * 0.78 + d[2] * 0.52) / l) ** 180;
        for (let c = 0; c < 3; c++)
          pixels[(y * size + x) * 4 + c] = Math.min(
            255,
            color[c] + (255 - color[c]) * Math.min(1, cloud + sun),
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

/** Called synchronously on selection so an old asynchronous world cannot change the lighting. */
export function setGlacierLighting(parent: Node, enabled: boolean) {
  const globals = parent.scene!.globals;
  globals.skybox.enabled = false;
  globals.skybox.envLightingType = 0;
  globals.skybox.envmap = null;
  globals.fog.enabled = false;
  globals.shadows.enabled = false;
  if (!enabled) return;
  const { cube, images } = glacierSky();
  globals.skybox.envmap = cube;
  globals.skybox.envLightingType = 1;
  globals.skybox.enabled = true;
  globals.ambient.skyLightingColor = new Color(184, 214, 255);
  globals.ambient.groundLightingColor = new Color(109, 149, 190);
  globals.ambient.skyIllum = 18000;
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
  parent.once(Node.EventType.NODE_DESTROYED, () => {
    cube.destroy();
    images.forEach((image) => image.destroy());
  });
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
  const at = (s: number, offset: number) => {
    const p = pointAt(track, s);
    return { ...p, x: p.x + Math.cos(p.heading) * offset, z: p.z - Math.sin(p.heading) * offset };
  };
  // Use the shared closed road samples: normals and vertices match at the lap seam.
  const points = track.main;
  const surface = ribbon(points, -track.width / 2, track.width / 2, 0.025);
  const repeats = Math.round(track.length / 15);
  surface.uvs = points.flatMap((p) => [
    0,
    (p.s / track.length) * repeats,
    1.7,
    (p.s / track.length) * repeats,
  ]);
  b.add(ROAD, surface);
  // Snow gathers on the road margins; the drivable surface stays level with physics.
  for (const side of [-1, 1]) {
    b.add(SNOW, ribbon(points, side * 8 - 0.22, side * 8 + 0.22, 0.035));
    b.add(SNOW, ribbon(points, side * 10 - 1.2, side * 10 + 1.2, -0.06));
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
  // Asymmetric continuous walls: varied silhouettes, overlapping bases and thick snow cornices.
  const rows = Math.ceil(track.length / 11);
  for (let i = 0; i < rows; i++) {
    const s = -16 + (i * track.length) / rows;
    if (i % 8 === 0) b = new MeshBatch(true);
    for (const side of [-1, 1]) {
      const height =
        side < 0 && s > 20 && s < 61 ? 3.5 : 14 + Math.sin(i * 1.7 + side) * 4 + (side < 0 ? 2 : 0);
      const offset = side * (20 + Math.sin(i * 1.2 + side) * 2),
        p = at(s, offset);
      b.add(ICE, glacierRock(i + side * 17, 7.6, height), p.x, -0.6, p.z, 1, 1, 1, i * 0.73);
      b.ball(SNOW, p.x, height - 0.5, p.z, 15, 4.4, 14);
      for (let n = 0; n < 3; n++) {
        const bank = at(s + n * 3.3, side * (12.6 + n * 0.8));
        b.ball(SNOW, bank.x, -0.25, bank.z, 5 + n, 1.3 + n * 0.6, 6);
      }
      if (i % 3 === 1) {
        const p = at(s, side * 15.5);
        b.add(ROCK, glacierRock(i * 2, 2.2, 3.3), p.x, -0.3, p.z);
        b.ball(SNOW, p.x, 3, p.z, 4.8, 1.2, 4.5);
      }
    }
    // Small spatial batches let native frustum/shadow culling skip distant walls.
    if (i % 8 === 7 || i === rows - 1) build(b, `IceWalls-${Math.floor(i / 8)}`);
  }
  for (const glacierArchDistance of glacierArchDistances(track.length)) {
    b = new MeshBatch(true);
    const arch = pointAt(track, glacierArchDistance);
    b.add(ICE, glacierArch(), arch.x, arch.y, arch.z, 1, 1, 1, arch.heading);
    b.add(SNOW, glacierArch(true), arch.x, arch.y, arch.z, 1, 1, 1, arch.heading);
    for (const side of [-1, 1]) {
      const p = at(glacierArchDistance, side * 16.5);
      b.add(ICE, glacierRock(6 + side, 4.8, 11), p.x, -0.5, p.z, 1, 1, 1.9, arch.heading);
    }
    for (let i = 0; i < 19; i++) {
      const x = -11 + i * 1.22,
        y = 4 + Math.sqrt(13 * 13 - x * x),
        length = 0.6 + (Math.sin(i * 7) + 1) * 0.9;
      const p = at(glacierArchDistance - 5.9, x);
      b.add(
        ICE,
        primitives.cylinder(0.22 + (i % 3) * 0.1, 0, length, { radialSegments: 6 }),
        p.x,
        y - length / 2,
        p.z,
      );
    }
    build(b, `IceArch-${Math.round(glacierArchDistance)}`);
  }
  // Snow peaks beyond the portal form a layered skyline instead of a flat blue backdrop.
  for (let i = 0; i < 40; i++) {
    if (i % 5 === 0) b = new MeshBatch(true);
    const angle = (i * Math.PI * 2) / 40,
      radius = 390 + (i % 3) * 35;
    const p = { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius },
      height = 62 + Math.sin(i * 4.3) * 27;
    const width = 31 + (i % 3) * 8;
    b.add(ROCK, glacierMountain(i, false), p.x, -5, p.z, width, height, width * 0.8, i * 0.7);
    b.add(SNOW, glacierMountain(i, true), p.x, -5, p.z, width, height, width * 0.8, i * 0.7);
    if (i % 5 === 4) build(b, `Mountains-${Math.floor(i / 5)}`);
  }
  // Compact orange research shelter on the left bank, composed of shared primitives.
  b = new MeshBatch(true);
  const station = at(48, -27),
    h = station.heading;
  b.box(ROCK, station.x, 3, station.z, 10, 5, 8, h);
  b.box(ORANGE, station.x, 6.1, station.z, 8, 3.3, 6, h);
  b.ball(SNOW, station.x, 8, station.z, 10, 1.3, 8);
  const window = at(48, -22.96);
  b.box('#244768', window.x, 6.3, window.z, 0.08, 1.55, 4.8, h);
  b.box(ROCK, station.x, 11, station.z, 0.15, 6, 0.15);
  b.ball('#f5c663', station.x, 14, station.z, 0.4);
  build(b, 'ResearchStation');
}
