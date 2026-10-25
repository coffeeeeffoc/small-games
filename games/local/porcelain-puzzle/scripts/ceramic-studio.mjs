import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Each cubic is an intentional potter's profile, not a fit through arbitrary width samples.
const profiles = [
  [
    [22, 12],
    [24, 12, 25, 16, 23, 20],
    [21, 23, 20, 30, 22, 36],
    [27, 48, 83, 55, 87, 88],
    [95, 141, 60, 219, 48, 273],
    [47, 279, 50, 281, 50, 286],
  ],
  [
    [37, 15],
    [36, 22, 23, 27, 21, 42],
    [15, 83, 34, 107, 65, 134],
    [110, 173, 92, 234, 49, 266],
    [42, 271, 40, 276, 43, 284],
  ],
  [
    [0, 10],
    [10, 7, 15, 16, 12, 23],
    [21, 29, 52, 25, 63, 47],
    [62, 51, 57, 53, 56, 58],
    [76, 62, 95, 78, 96, 109],
    [103, 166, 87, 244, 68, 278],
    [66, 283, 68, 285, 68, 288],
  ],
  [
    [108, 84],
    [111, 86, 110, 91, 108, 94],
    [101, 144, 72, 190, 38, 209],
    [34, 213, 35, 219, 36, 222],
  ],
  [
    [111, 128],
    [115, 130, 113, 135, 109, 137],
    [94, 143, 76, 155, 58, 158],
    [45, 159, 35, 159, 0, 159],
  ],
  [
    [85, 25],
    [89, 26, 88, 32, 86, 36],
    [81, 79, 52, 122, 24, 140],
    [13, 150, 12, 199, 15, 220],
    [16, 239, 41, 252, 61, 263],
    [66, 266, 67, 273, 62, 277],
  ],
  [
    [0, 12],
    [16, 10, 23, 20, 22, 30],
    [22, 36, 16, 40, 17, 47],
    [16, 52, 19, 56, 20, 62],
    [24, 80, 63, 83, 76, 104],
    [94, 134, 84, 240, 67, 278],
    [66, 283, 65, 286, 63, 287],
  ],
  [
    [25, 14],
    [28, 15, 29, 19, 26, 23],
    [22, 31, 22, 41, 25, 49],
    [29, 66, 69, 72, 88, 105],
    [123, 167, 96, 238, 45, 270],
    [41, 274, 44, 279, 46, 284],
  ],
  [
    [0, 32],
    [57, 32, 101, 75, 101, 128],
    [101, 183, 56, 224, 0, 224],
  ],
  [
    [29, 14],
    [32, 17, 32, 22, 29, 26],
    [24, 34, 23, 43, 25, 53],
    [31, 79, 66, 92, 84, 119],
    [109, 159, 82, 230, 56, 268],
    [51, 276, 55, 282, 55, 286],
  ],
];
const textureNames = [
  'blue-white',
  'landscape',
  'famille-rose',
  'red-fish',
  'celadon',
  'star-glass',
  'amber-glass',
  'rose-crystal',
  'silver-moon',
  'gold-flowers',
];
const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setSize(720, 900);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
const scene = new THREE.Scene();
const environment = new THREE.PMREMGenerator(renderer);
scene.environment = environment.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.85;
scene.add(new THREE.HemisphereLight(0xfffaf0, 0xa7adb4, 0.6));
const key = new THREE.DirectionalLight(0xfff4df, 1.8);
key.position.set(-220, 350, 400);
scene.add(key);
const fill = new THREE.DirectionalLight(0xddeaff, 0.3);
fill.position.set(230, 80, 150);
scene.add(fill);
const camera = new THREE.OrthographicCamera(-120, 120, 150, -150, 1, 2000);
camera.position.set(0, 150, 1000);
camera.lookAt(0, 0, 0);
const textures = new Map();

function profile(shape) {
  const [start, ...segments] = profiles[shape];
  const points = [new THREE.Vector2(start[0], 150 - start[1])];
  for (const [a, b, c, d, e, f] of segments) {
    const curve = new THREE.CubicBezierCurve(
      points.at(-1),
      new THREE.Vector2(a, 150 - b),
      new THREE.Vector2(c, 150 - d),
      new THREE.Vector2(e, 150 - f),
    );
    points.push(...curve.getPoints(32).slice(1));
  }
  return points;
}

async function glaze(vessel) {
  const name = textureNames[vessel.theme];
  if (!textures.has(name))
    textures.set(
      name,
      await new THREE.TextureLoader().loadAsync(`../docs/design/textures/${name}.png`),
    );
  const original = textures.get(name);
  const c = document.createElement('canvas');
  c.width = c.height = 1536;
  const ctx = c.getContext('2d');
  ctx.fillStyle = vessel.theme < 4 ? '#f5f2e9' : vessel.base;
  ctx.fillRect(0, 0, c.width, c.height);
  const neck = [0, 1, 6, 7, 9].includes(vessel.shape) ? 0.19 : 0;
  ctx.drawImage(original.image, 0, c.height * neck, c.width, c.height * (1 - neck));
  if (neck) {
    ctx.fillStyle = vessel.ink;
    for (const y of [0.025, 0.044, 0.15, 0.158]) ctx.fillRect(0, y * c.height, c.width, 3);
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.repeat.x = 1.5;
  map.offset.x = -0.25;
  if (vessel.shape === 4) {
    map.repeat.x = 1;
    map.offset.x = 0;
  }
  map.anisotropy = 8;
  return new THREE.MeshPhysicalMaterial({
    map,
    roughness: vessel.material === 'glass' ? 0.16 : 0.25,
    metalness: vessel.material === 'mirror' ? 0.5 : 0,
    clearcoat: 1,
    clearcoatRoughness: 0.16,
    envMapIntensity: 0.7,
  });
}

export async function renderVessel(vessel) {
  const group = new THREE.Group();
  const outer = profile(vessel.shape);
  const material = await glaze(vessel);
  const closed = [2, 6, 8].includes(vessel.shape);
  let points = [...outer].reverse();
  if (!closed) {
    const rim = outer[0];
    points.push(
      new THREE.Vector2(rim.x - 1.5, rim.y + 1),
      new THREE.Vector2(rim.x - 3.2, rim.y - 1),
    );
    const inner = outer.map((p) => new THREE.Vector2(Math.max(0, p.x - 3.2), p.y + 3));
    points.push(...inner.slice(1));
  }
  const geometry = new THREE.LatheGeometry(points, 192);
  const uv = geometry.attributes.uv,
    positions = geometry.attributes.position;
  const top = outer[0].y,
    bottom = outer.at(-1).y;
  const colors = [];
  for (let i = 0; i < uv.count; i++) {
    if (vessel.shape === 4)
      uv.setXY(i, 0.5 + positions.getX(i) / 230, 0.5 + positions.getZ(i) / 230);
    else uv.setY(i, (positions.getY(i) - bottom) / (top - bottom));
    const inside = i % points.length >= outer.length;
    const shade = inside ? Math.max(0.18, 0.85 - (top - positions.getY(i)) / 55) : 1;
    colors.push(shade, shade, shade);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  material.vertexColors = true;
  const trim = material.clone();
  trim.vertexColors = false;
  const body = new THREE.Mesh(geometry, material);
  body.rotation.y = Math.PI;
  group.add(body);
  if (vessel.shape === 7) group.scale.z = 0.48;
  if (vessel.shape === 4) group.rotation.x = 1.08;
  if (vessel.shape === 8) {
    group.scale.z = 0.09;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(10, 13, 61, 48), trim);
    handle.position.y = -101;
    group.add(handle);
    if (!textures.has('reflection'))
      textures.set(
        'reflection',
        await new THREE.TextureLoader().loadAsync('../assets/atelier.png'),
      );
    const reflection = document.createElement('canvas');
    reflection.width = reflection.height = 256;
    const reflectionContext = reflection.getContext('2d');
    reflectionContext.filter = 'blur(5px) saturate(.45)';
    const backdrop = textures.get('reflection').image;
    reflectionContext.drawImage(
      backdrop,
      backdrop.width * 0.15,
      backdrop.height * 0.18,
      backdrop.width * 0.7,
      backdrop.width * 0.7,
      0,
      0,
      256,
      256,
    );
    reflectionContext.filter = 'none';
    const gleam = reflectionContext.createLinearGradient(0, 256, 256, 0);
    gleam.addColorStop(0, '#c5d7dc88');
    gleam.addColorStop(0.44, '#f6ffff99');
    gleam.addColorStop(0.52, '#f6ffffdd');
    gleam.addColorStop(0.65, '#c5d7dc66');
    gleam.addColorStop(1, '#c5d7dcaa');
    reflectionContext.fillStyle = gleam;
    reflectionContext.fillRect(0, 0, 256, 256);
    const reflectionMap = new THREE.CanvasTexture(reflection);
    reflectionMap.colorSpace = THREE.SRGBColorSpace;
    const mirror = new THREE.Mesh(
      new THREE.CircleGeometry(82, 128),
      new THREE.MeshBasicMaterial({ map: reflectionMap, color: 0xe5f3f5 }),
    );
    mirror.position.set(0, 22, 112);
    group.add(mirror);
  }
  // A real separate foot ring gives the object a grounded, thin ceramic base.
  if (![4, 8].includes(vessel.shape)) {
    const p = outer.at(-1);
    const foot = new THREE.Mesh(new THREE.TorusGeometry(p.x - 1.3, 1.5, 12, 128), trim);
    foot.rotation.x = Math.PI / 2;
    foot.position.y = p.y;
    group.add(foot);
  }
  scene.add(group);
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  const center = bounds.getCenter(new THREE.Vector3());
  group.position.sub(center);
  renderer.render(scene, camera);
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 600;
  const ctx = c.getContext('2d');
  ctx.drawImage(renderer.domElement, 0, 0, 480, 600);
  const pixels = ctx.getImageData(0, 0, 480, 600).data;
  const left = [],
    right = [];
  for (let y = 0; y < 600; y += 2) {
    let a = -1,
      b = -1;
    for (let x = 0; x < 480; x++)
      if (pixels[(y * 480 + x) * 4 + 3] >= 80) {
        if (a < 0) a = x;
        b = x;
      }
    if (a >= 0) {
      left.push({ x: a / 2, y: y / 2 });
      right.push({ x: (b + 1) / 2, y: y / 2 });
    }
  }
  scene.remove(group);
  group.traverse((object) => {
    object.geometry?.dispose();
    if (object.material && object.material !== material && object.material !== trim) {
      object.material.map?.dispose();
      object.material.dispose();
    }
  });
  material.map.dispose();
  material.dispose();
  trim.dispose();
  return {
    webp: c.toDataURL('image/webp', 0.94).split(',')[1],
    outline: [...right, ...left.reverse()],
  };
}
