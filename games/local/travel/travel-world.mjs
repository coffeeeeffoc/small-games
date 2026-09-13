import * as THREE from './vendor/three.module.js';
import { HDRLoader } from './vendor/HDRLoader.js';

// Photographs supply surfaces and distant scenery; nearby spaces remain walkable geometry.
export function createTravelWorld(place) {
  const id = typeof place === 'string' ? place : place.id;
  const scene = new THREE.Scene(), fixed = new THREE.Group();
  scene.add(fixed);
  const colliders = [], interactions = [], animations = [], pending = [], photoOccluders = [];
  const materials = new Map(), geometries = new Set(), textures = new Set(), sources = new Map();
  let disposed = false, seed = [...id].reduce((sum, c) => sum + c.charCodeAt(0), 47);
  const rand = () => ((seed = Math.imul(1664525, seed) + 1013904223 | 0) >>> 0) / 4294967296;
  const geometry = g => (geometries.add(g), g);
  const shapes = {
    box: geometry(new THREE.BoxGeometry(1, 1, 1)), pole: geometry(new THREE.CylinderGeometry(1, 1, 1, 12)),
    tapered: geometry(new THREE.CylinderGeometry(.55, 1, 1, 12)), ball: geometry(new THREE.SphereGeometry(1, 12, 8)),
    plane: geometry(new THREE.PlaneGeometry(1, 1)), ring: geometry(new THREE.TorusGeometry(1, .07, 6, 20)),
  };
  const leaf = new THREE.Shape().moveTo(0, -.25).quadraticCurveTo(.12, -.03, 0, .25).quadraticCurveTo(-.12, -.03, 0, -.25);
  shapes.leaf = geometry(new THREE.ShapeGeometry(leaf, 3));
  const loader = new THREE.TextureLoader();
  function source(url) {
    if (!sources.has(url)) sources.set(url, loader.loadAsync(url).then(texture => {
      if (disposed) { texture.dispose(); throw new Error('Travel world closed while loading'); }
      textures.add(texture); return texture;
    }));
    return sources.get(url);
  }
  async function mappedTexture(url, repeat = [1, 1], offset = [0, 0], color = false) {
    const original = await source(url);
    if (disposed) throw new Error('Travel world closed while loading');
    const texture = original.clone();
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat); texture.offset.set(...offset);
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = 4; textures.add(texture); return texture;
  }
  function mat(color, options = {}) {
    const key = JSON.stringify([color, options]);
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: .84, ...options }));
    return materials.get(key);
  }
  function pbr(name, repeat = [1, 1], tint = '#ffffff') {
    const key = `${name}/${repeat}/${tint}`;
    if (!materials.has(key)) {
      const material = new THREE.MeshStandardMaterial({ color: tint, roughness: 1, normalScale: new THREE.Vector2(name === 'wall' ? .2 : .55, name === 'wall' ? .2 : .55) });
      materials.set(key, material);
      pending.push(Promise.all(['color', 'normal', 'rough'].map(type => mappedTexture(`./assets/pbr/${name}-${type}.jpg`, repeat, [0, 0], type === 'color'))).then(([map, normalMap, roughnessMap]) => {
        if (!disposed) Object.assign(material, { map, normalMap, roughnessMap, needsUpdate: true });
      }));
    }
    return materials.get(key);
  }
  function photo(file, size, rect, basic = false) {
    const key = `photo/${file}/${rect}/${basic}`;
    if (!materials.has(key)) {
      const material = basic ? new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, toneMapped: false }) : new THREE.MeshStandardMaterial({ roughness: .9 });
      materials.set(key, material);
      const [x, y, w, h] = rect;
      pending.push(mappedTexture(`./assets/reference/${file}.jpg`, [w / size[0], h / size[1]], [x / size[0], 1 - (y + h) / size[1]], true).then(map => {
        if (!disposed) { material.map = map; material.needsUpdate = true; }
      }));
    }
    return materials.get(key);
  }
  const surface = {
    stone: pbr('ground', [3.2, 2]), wall: pbr('wall', [5, 3]), wood: pbr('wood', [3, 1]),
    roof: pbr('roof', [3, 1.8]), bark: pbr('bark', [1, 3]), grass: pbr('grass', [4, 4]),
    dark: mat('#292c29'), bronze: mat('#786645', { metalness: .7, roughness: .48 }),
    leaf: mat('#3f5132', { side: THREE.DoubleSide }), leafLight: mat('#6b7746', { side: THREE.DoubleSide }), leafDry: mat('#938961', { side: THREE.DoubleSide }),
    door: photo('dali-shop-door', [1280, 1900], [310, 1220, 670, 500]),
    window: photo('dali-shop-door', [1280, 1900], [300, 686, 680, 217]),
    ornament: photo('dali-shop-door', [1280, 1900], [486, 300, 315, 175]),
  };
  function part(shape, material, x, y, z, sx = 1, sy = sx, sz = sx, parent = fixed, ry = 0) {
    const mesh = new THREE.Mesh(shapes[shape], typeof material === 'string' ? mat(material) : material);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.rotation.y = ry;
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  const box = (m, x, y, z, w, h, d, p = fixed, ry = 0) => part('box', m, x, y, z, w, h, d, p, ry);
  const pole = (m, x, y, z, r, h, p = fixed) => part('pole', m, x, y, z, r, h, r, p);
  function group(x, z, parent = fixed) { const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g); return g; }
  function solid(x, z, hx, hz) { colliders.push({ x, z, hx, hz }); }
  function beam(a, b, radius, material, parent = fixed) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start), mid = start.add(end).multiplyScalar(.5);
    const mesh = pole(material, mid.x, mid.y, mid.z, radius, delta.length(), parent);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return mesh;
  }
  const panel = (m, x, y, z, w, h, p = fixed) => part('plane', m, x, y, z, w, h, 1, p);
  function roof(x, y, z, w, d, parent = fixed, rise = 1.35) {
    const half = d / 2, slope = Math.hypot(half, rise);
    const clay = mat('#535752', { roughness: .95 });
    for (const side of [-1, 1]) {
      const plane = box(pbr('roof', [w / 3, slope / 3], '#929790'), x, y + rise / 2, z + side * half / 2, w, .14, slope, parent);
      plane.rotation.x = side * Math.atan2(rise, half);
      box(surface.dark, x, y - .05, z + side * half, w + .06, .13, .14, parent);
      for (let i = 0; i <= Math.floor(w / .34); i++) {
        const tileX = x - w / 2 + i * .34;
        const tile = pole(clay, tileX, y + .04, z + side * half, .075, .28, parent);
        tile.rotation.x = Math.PI / 2 - side * .16;
        beam([tileX, y + rise + .085, z], [tileX, y + .085, z + side * half], .052, clay, parent);
      }
      for (let i = 0; i <= Math.floor(w / .65); i++) beam([x - w / 2 + i * .65, y - .1, z + side * half], [x - w / 2 + i * .65, y + rise - .15, z], .055, surface.wood, parent);
    }
    pole(clay, x, y + rise + .1, z, .12, w + .14, parent).rotation.z = Math.PI / 2;
    for (const side of [-1, 1]) {
      beam([x + side * w / 2, y + rise, z], [x + side * (w / 2 + .19), y + rise + .37, z], .105, surface.roof, parent);
      for (const edge of [-1, 1]) beam([x + side * (w / 2 - .3), y + .02, z + edge * half], [x + side * (w / 2 + .16), y + .23, z + edge * half], .075, surface.roof, parent);
    }
  }
  function house(x, z, w = 7, d = 6, h = 5.8, ry = 0) {
    const g = group(x, z); g.rotation.y = ry;
    box(surface.stone, 0, .12, 0, w + .3, .24, d + .3, g);
    photoOccluders.push(box(surface.wall, 0, h / 2, 0, w, h, d, g));
    box(surface.stone, 0, .5, d / 2 + .02, w, .9, .08, g);
    const front = d / 2 + .07;
    box(surface.dark, 0, 1.6, front, w * .66, 2.75, .13, g); panel(surface.door, 0, 1.62, front + .08, w * .64, 2.66, g);
    for (const dx of [-w * .34, w * .34]) box(surface.wood, dx, 1.64, front + .15, .16, 2.9, .19, g);
    box(surface.wood, 0, 3.03, front + .15, w * .71, .18, .2, g);
    box(surface.dark, 0, 4.28, front + .025, w * .76, 1.37, .13, g); panel(surface.window, 0, 4.29, front + .11, w * .73, 1.26, g);
    for (let dx = -w * .36; dx <= w * .37; dx += w * .12) box(surface.wood, dx, 4.29, front + .14, .06, 1.4, .09, g);
    box(surface.wood, 0, 3.6, front + .12, w * .79, .12, .2, g);
    roof(0, 3.13, d / 2 + .1, w + .4, 1.05, g, .2); roof(0, h, 0, w + .8, d + .75, g, 1.25);
    const shape = new THREE.Shape().moveTo(-d / 2, 0).lineTo(d / 2, 0).lineTo(0, 1.25).closePath();
    const end = geometry(new THREE.ExtrudeGeometry(shape, { depth: .12, bevelEnabled: false }));
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(end, surface.wall); wall.rotation.y = Math.PI / 2; wall.position.set(side * w / 2, h, 0); wall.castShadow = true; g.add(wall);
    }
    panel(surface.ornament, 0, h - .33, front + .03, 1.3, .7, g);
    if (Math.abs(Math.sin(ry)) > .5) solid(x, z, d / 2 + .12, w / 2 + .12); else solid(x, z, w / 2 + .12, d / 2 + .12);
  }
  function arch(x, z, timber = false) {
    const m = timber ? surface.wood : surface.wall, w = 6.6, h = timber ? 5.8 : 5.05;
    for (const side of [-1, 1]) {
      box(surface.stone, x + side * w / 2, .18, z, .9, .36, 1.2); box(surface.stone, x + side * w / 2, .67, z, .66, 1, .78);
      box(m, x + side * w / 2, h / 2 + .3, z, .46, h, .52); box(surface.stone, x + side * w / 2, h - .1, z, .76, .2, .72);
      solid(x + side * w / 2, z, .45, .55);
    }
    box(m, x, h - .7, z, w, .9, .48); box(surface.dark, x, h - .7, z + .255, 2.25, .56, .02);
    panel(surface.ornament, x, h - .7, z + .275, 1, .48);
    if (timber) {
      roof(x, h + .2, z, w + 1.5, 2.1, fixed, .7); roof(x, h + 1.55, z, w * .62, 1.9, fixed, .6);
      for (let dx = -2.7; dx <= 2.7; dx += .6) { box(surface.wood, x + dx, h + .06, z, .12, .44, 1.25); box(surface.wood, x + dx, h + .18, z, .35, .12, 1.1); }
    } else {
      box(surface.stone, x, h + .02, z, w + .65, .16, .62);
      for (const side of [-1, 1]) beam([x, h + .8, z], [x + side * (w / 2 + .32), h + .08, z], .11, surface.stone);
    }
  }
  function trail(width = 7, end = -27) {
    const mesh = part('plane', pbr('ground', [width / 2, (20 - end) / 2]), 0, .014, (20 + end) / 2, width, 20 - end); mesh.rotation.x = -Math.PI / 2;
    for (const side of [-1, 1]) {
      box(surface.stone, side * (width / 2 + .13), .025, (20 + end) / 2, .26, .09, 20 - end);
      for (let z = end; z < 20; z += 1.25) box(surface.dark, side * (width / 2 + .15), .074, z, .2, .014, .015);
    }
  }
  function bench(x, z, ry = 0) {
    const g = group(x, z); g.rotation.y = ry;
    for (const side of [-1, 1]) { box(surface.dark, side * .75, .35, 0, .08, .7, .63, g); box(surface.dark, side * .75, .89, -.3, .07, .5, .08, g); }
    for (let i = 0; i < 4; i++) box(surface.wood, 0, .73, -.25 + i * .17, 2, .065, .135, g);
    for (let i = 0; i < 3; i++) box(surface.wood, 0, .9 + i * .15, -.32, 2, .12, .05, g);
    solid(x, z, Math.abs(Math.cos(ry)) > .5 ? 1.03 : .4, Math.abs(Math.cos(ry)) > .5 ? .4 : 1.03);
  }
  function tree(x, z, height = 7) {
    const g = group(x, z); part('tapered', surface.bark, 0, height * .34, 0, .24, height * .68, .24, g);
    for (let branch = 0; branch < 7; branch++) {
      const a = branch * 2.4, reach = 1.4 + rand() * 1.7, tip = [Math.sin(a) * reach, height * (.69 + rand() * .23), Math.cos(a) * reach];
      beam([0, height * .46, 0], tip, .055 + rand() * .035, surface.bark, g);
      for (let twig = 0; twig < 8; twig++) {
        const tx = tip[0] + (rand() - .5) * 1.8, tz = tip[2] + (rand() - .5) * 1.8, drop = .9 + rand() * 2;
        beam(tip, [tx, tip[1] - drop, tz], .012, surface.bark, g);
        for (let j = 0; j < 22; j++) {
          const t = j / 22;
          const l = part('leaf', j % 3 ? surface.leaf : surface.leafLight, tip[0] + (tx - tip[0]) * t + (rand() - .5) * 1.15, tip[1] - drop * t, tip[2] + (tz - tip[2]) * t + (rand() - .5) * 1.15, 2.8 + rand(), .9 + rand() * .6, 1, g, rand() * Math.PI);
          l.rotation.z = (rand() - .5) * 1.7; l.rotation.x = rand() * Math.PI;
        }
      }
    }
    colliders.push({ x, z, r: .32 });
  }
  function grasses(x, z, width, depth, count, rice = false) {
    for (let i = 0; i < count; i++) {
      const px = x + (rand() - .5) * width, pz = z + (rand() - .5) * depth, h = (rice ? .72 : .25) + rand() * (rice ? .45 : .5);
      for (let j = 0; j < 3; j++) {
        const l = part('leaf', rice && i % 3 === 0 ? surface.leafDry : i % 2 ? surface.leaf : surface.leafLight, px, h * .47, pz, .65, h * 2, 1, fixed, j * 2.1 + rand()); l.rotation.z = (rand() - .5) * .6;
      }
      if (rice && i % 2 === 0) part('leaf', surface.leafDry, px + .09, h, pz, .6, .75, 1, fixed, rand() * 6).rotation.z = .7;
    }
  }
  function rock(x, z, size = 1) {
    const mesh = part('ball', surface.grass, x, size * .21 - .08, z, size, size * .43, size * .72, fixed, rand() * 6); mesh.rotation.z = rand() * .3;
    if (size > .8) colliders.push({ x, z, r: size * .7 });
  }
  scene.fog = new THREE.FogExp2('#b3bdbe', .0035);
  scene.add(new THREE.HemisphereLight('#e9edef', '#776d5e', .75));
  const sun = new THREE.DirectionalLight(id === 'pier' ? '#ffe6cd' : '#fff4e5', 2.25);
  sun.position.set(-25, 42, 28); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 38, bottom: -30, near: 1, far: 130 });
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.normalBias = .022; sun.shadow.bias = -.00015; scene.add(sun);
  pending.push(new HDRLoader().loadAsync('./assets/pbr/sky.hdr').then(texture => {
    if (disposed) { texture.dispose(); throw new Error('Travel world closed while loading'); }
    textures.add(texture); texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = scene.environment = texture; scene.environmentIntensity = .55; scene.backgroundIntensity = .75;
    scene.backgroundRotation.y = scene.environmentRotation.y = .9;
  }));
  function vista(lake) {
    const m = lake ? photo('erhai-panorama', [3840, 594], [0, 0, 3840, 594], true) : photo('dali-old-town', [1920, 1281], [790, 110, 1130, 330], true);
    m.transparent = true; m.depthWrite = false;
    m.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vPhotoUv;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvPhotoUv = uv;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vPhotoUv;').replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= smoothstep(0.0,0.055,vPhotoUv.x)*smoothstep(0.0,0.055,1.0-vPhotoUv.x)*smoothstep(0.0,0.10,1.0-vPhotoUv.y);');
    };
    m.customProgramCacheKey = () => 'travel-photo-edge-v1';
    const radius = 170, arc = lake ? 2.55 : 2.2, height = radius * arc / (lake ? 3840 / 594 : 1130 / 330);
    const mesh = new THREE.Mesh(geometry(new THREE.CylinderGeometry(radius, radius, height, 96, 1, true, Math.PI - arc / 2, arc)), m);
    // Lower the cropped mountain photograph to keep its slopes behind the distant ground.
    mesh.position.y = lake ? height * .2 : height / 2 - 57; mesh.renderOrder = -2; scene.add(mesh);
  }
  vista(id === 'cafe' || id === 'pier');
  const waterMaterial = new THREE.MeshPhysicalMaterial({ color: '#647e79', roughness: .2, metalness: .12, clearcoat: .65, clearcoatRoughness: .18 });
  materials.set('water', waterMaterial);
  const waterTime = { value: 0 };
  if (id === 'cafe' || id === 'pier') {
    let lakePhoto;
    pending.push(mappedTexture('./assets/reference/erhai-panorama.jpg', [1, 1], [0, 0], true).then(texture => { lakePhoto = texture; }));
    waterMaterial.onBeforeCompile = shader => {
      shader.uniforms.waterTime = waterTime;
      shader.uniforms.lakePhoto = { value: lakePhoto };
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWaterPosition;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWaterPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWaterPosition;\nuniform float waterTime;\nuniform sampler2D lakePhoto;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec2 waterUV = fract(vWaterPosition.xz * vec2(.19, .48));
          waterUV = waterUV * vec2(600.0/3840.0, 110.0/594.0) + vec2(1100.0/3840.0, 1.0-575.0/594.0);
          diffuseColor.rgb *= mix(vec3(1.0), texture2D(lakePhoto, waterUV).rgb * 2.4, .48);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          float waveX = .15 * sin(vWaterPosition.x * 2.3 + waterTime * 1.5 + cos(vWaterPosition.z * .8));
          float waveZ = .11 * cos(vWaterPosition.z * 3.4 + waterTime * .7 + sin(vWaterPosition.x * .5));
          normal = normalize(normal + mat3(viewMatrix) * vec3(waveX, 0.0, waveZ));`);
    };
    waterMaterial.customProgramCacheKey = () => 'photographic-water-v1';
    animations.push((dt, t) => { waterTime.value = t; });
  }
  const waterGeometry = geometry(new THREE.PlaneGeometry(330, 220, 64, 48)); waterGeometry.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeometry, waterMaterial); water.position.set(0, -.3, -88); scene.add(water);
  if (id === 'cafe' || id === 'pier') {
    const positions = waterGeometry.attributes.position; let normalTick = 0;
    animations.push((dt, t) => {
      for (let i = 0; i < positions.count; i++) { const x = positions.getX(i), z = positions.getZ(i); positions.setY(i, Math.sin(x * 1.15 + t * 1.1) * .026 + Math.cos(z * .82 + t * .7) * .039 + Math.sin(x * .27 + z * .19 + t) * .06); }
      positions.needsUpdate = true; if ((normalTick += dt) > .12) { waterGeometry.computeVertexNormals(); normalTick = 0; }
    });
  } else water.visible = false;
  if (id === 'pier') box(surface.grass, 0, -.26, 16, 70, .5, 30);
  else if (id === 'cafe') box(surface.stone, 0, -.3, 1, 64, .6, 53);
  else {
    const ground = part('plane', pbr('grass', [28, 28], '#b3bea9'), 0, -.023, -3, 420, 420);
    ground.rotation.x = -Math.PI / 2;
  }

  if (id === 'oldtown') {
    trail(7, -35); arch(0, -16);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) house(side * 8.15, 9 - i * 9, 8.5, 7.2, 5.7 + (i % 2) * .35, -side * Math.PI / 2);
      tree(side * 4.35, -10, 7.3); bench(side * 4.6, 12, -side * Math.PI / 2);
      photoOccluders.push(box(surface.stone, side * 15.5, 1, -2, 1.2, 2, 44));
    }
    for (let i = 0; i < 7; i++) {
      const x = -3 + i, y = 5.45 - Math.sin(i / 6 * Math.PI) * .36;
      beam([x, y, -5], [x, y - .4, -5], .009, surface.dark);
      part('ball', mat('#8a392a', { roughness: .74 }), x, y - .64, -5, .18, .28, .18);
      pole(surface.bronze, x, y - .92, -5, .02, .16);
    }
    beam([-4, 5.5, -5], [0, 5.1, -5], .012, surface.dark); beam([0, 5.1, -5], [4, 5.5, -5], .012, surface.dark);
  } else if (id === 'pagodas') {
    trail(7, -34);
    const court = part('plane', pbr('ground', [17, 11]), 0, .016, -20, 35, 24); court.rotation.x = -Math.PI / 2;
    function pagoda(x, z, height, levels, octagonal) {
      const base = octagonal ? 2.2 : 3.7;
      box(surface.stone, x, .23, z, base + 1.2, .46, base + 1.2); solid(x, z, base / 2 + .6, base / 2 + .6);
      const body = pbr('wall', [2, 2], '#f1e7d0'), trim = pbr('wall', [2, .4], '#c5b69a');
      const detail = photo('three-pagodas', [1920, 1107], [883, 525, 159, 27]);
      const cylinder = octagonal ? geometry(new THREE.CylinderGeometry(1, 1, 1, 8)) : null;
      for (let floor = 0; floor < levels; floor++) {
        const width = base * (1 - floor / levels * .58);
        const firstHeight = octagonal ? height / levels : height * .19;
        const upperHeight = (height - firstHeight) / (levels - 1);
        const step = floor === 0 ? firstHeight : upperHeight;
        const y = .5 + (floor === 0 ? 0 : firstHeight + (floor - 1) * upperHeight);
        const addLevel = (w, h, yy, material) => {
          if (octagonal) { const mesh = new THREE.Mesh(cylinder, material); mesh.position.set(x, yy, z); mesh.scale.set(w * .54, h, w * .54); fixed.add(mesh); }
          else box(material, x, yy, z, w, h, w);
        };
        addLevel(width, step * .89, y + step * .43, body); addLevel(width + .33, .095, y + step * .88, trim); addLevel(width + .2, .09, y + step * .96, body);
        for (let face = 0; face < 4; face++) {
          const angle = face * Math.PI / 2, radius = octagonal ? width * .5 : width / 2;
          const band = panel(detail, x + Math.sin(angle) * (radius + .012), y + step * .49, z + Math.cos(angle) * (radius + .012), width * .9, width * .9 * 27 / 159);
          band.rotation.y = angle;
        }
      }
      pole(surface.bronze, x, height + 1.1, z, .065, 1.3);
      for (let i = 0; i < 4; i++) part('ring', surface.bronze, x, height + .8 + i * .15, z, .22 - i * .036, .22 - i * .036, .22 - i * .036).rotation.x = Math.PI / 2;
    }
    pagoda(0, -33, 23, 16, false); pagoda(-11, -38, 14, 10, true); pagoda(11, -38, 14, 10, true);
    for (const side of [-1, 1]) {
      for (const z of [11, -2, -15, -28]) tree(side * 18, z, 8 + rand());
      box(surface.stone, side * 8, .14, -9, 6, .28, 10); box(waterMaterial, side * 8, .3, -9, 5.6, .045, 9.6);
      solid(side * 8, -9, 3.1, 5.1); grasses(side * 11, 5, 6, 7, 140);
    }
  } else if (id === 'meadow') {
    trail(3.2, -33);
    for (const side of [-1, 1]) {
      grasses(side * 12, -6, 15, 48, 1050);
      for (let i = 0; i < 8; i++) rock(side * (7 + rand() * 17), -22 + rand() * 39, .55 + rand() * .9);
      tree(side * 18, -20, 7.8); tree(side * 15, 14, 7.1); bench(side * 5.8, -13, side * .25);
    }
    const shelter = group(0, -17);
    for (const x of [-2.2, 2.2]) for (const z of [-1.8, 1.8]) { pole(surface.wood, x, 1.6, z, .105, 3.2, shelter); colliders.push({ x, z: -17 + z, r: .2 }); }
    roof(0, 3.3, 0, 5.3, 4.6, shelter, .9);
    for (const side of [-1, 1]) beam([side * 2.2, 2.3, 1.8], [side * 1.5, 3.3, 1.8], .075, surface.wood, shelter);
  } else if (id === 'village') {
    trail(6, -35); arch(0, -17, true);
    house(-11, -26, 10, 7, 5.8); house(11, -26, 10, 7, 5.8);
    house(-16, 10, 8, 7, 6, Math.PI / 2); house(16, 10, 8, 7, 6, -Math.PI / 2);
    for (const side of [-1, 1]) {
      box(pbr('grass', [1, 1], '#978d64'), side * 11, -.02, -3, 12, .045, 20); grasses(side * 11, -3, 11.5, 19, 1200, true);
      for (let z = -13; z <= 7; z += 2.5) pole(surface.wood, side * 4.7, .42, z, .045, .84);
      box(surface.wood, side * 4.7, .58, -3, .035, .05, 20); box(surface.stone, side * 5.05, .055, -3, .35, .11, 20); tree(side * 19, 16, 7.3);
    }
  } else if (id === 'cafe') {
    const terrace = part('plane', pbr('ground', [23, 24]), 0, .012, 0, 46, 48); terrace.rotation.x = -Math.PI / 2;
    house(-14, -11, 10, 7, 5.8); roof(-14, 3.1, -6.4, 10.5, 2, fixed, .26);
    function table(x, z) {
      pole(surface.wood, x, .82, z, .62, .07); pole(surface.dark, x, .39, z, .045, .8);
      for (const side of [-1, 1]) { beam([x, .18, z], [x + side * .48, .02, z], .035, surface.dark); bench(x, z + side * 1.3, side > 0 ? 0 : Math.PI); }
      const umbrella = new THREE.Mesh(geometry(new THREE.ConeGeometry(1.75, .38, 12, 1, true)), mat('#c1b59b', { side: THREE.DoubleSide, roughness: .97 }));
      umbrella.position.set(x, 2.85, z); fixed.add(umbrella); pole(surface.dark, x, 1.45, z, .028, 2.9); solid(x, z, .66, .66);
    }
    table(-12, 3); table(10, 3); table(10, -11);
    for (let x = -23; x <= 23; x += 2.2) { pole(surface.dark, x, .57, -24, .035, 1.14); if (x < 22) for (let h = .4; h <= 1.1; h += .34) beam([x, h, -24], [x + 2.2, h, -24], .009, surface.dark); }
    solid(0, -24.4, 25, .25); tree(-21, 13, 7); tree(20, 14, 7.5);
    for (const x of [-5.5, 5.5]) { box(surface.stone, x, .35, -17, 2, .7, 1.5); grasses(x, -17, 1.8, 1.3, 75); }
  } else {
    trail(7, 1.5); box(surface.wood, 0, -.08, -11.2, 7.4, .22, 25.5);
    for (let z = -23.9; z < 1.5; z += .22) box(surface.wood, 0, .057, z, 7.4, .04, .2);
    for (const side of [-1, 1]) {
      solid(side * 14, -14, 10.1, 13);
      for (let z = -24; z < 1; z += 2.5) {
        pole(surface.wood, side * 3.55, .46, z, .075, 1.25);
        if (z < -1.5) for (const h of [.48, .85]) { beam([side * 3.55, h, z], [side * 3.55, h - .05, z + 1.25], .018, surface.wood); beam([side * 3.55, h - .05, z + 1.25], [side * 3.55, h, z + 2.5], .018, surface.wood); }
      }
      tree(side * 11, 12, 8); bench(side * 7, 13, side * .2);
      for (let i = 0; i < 9; i++) rock(side * (4.4 + i * 1.65), 1.7 + rand() * .7, .75 + rand() * .6);
    }
    const pavilion = group(0, -19.3);
    for (const x of [-2.7, 2.7]) for (const z of [-2.6, 2.6]) { pole(surface.wood, x, 1.65, z, .13, 3.3, pavilion); colliders.push({ x, z: -19.3 + z, r: .23 }); }
    roof(0, 3.45, 0, 7, 6.9, pavilion, 1.25);
    const boat = group(7.2, -13, scene);
    const hullShape = new THREE.Shape().moveTo(-.8, -1.8).lineTo(.8, -1.8).quadraticCurveTo(1.1, 0, 0, 2.1).quadraticCurveTo(-1.1, 0, -.8, -1.8);
    const hull = new THREE.Mesh(geometry(new THREE.ExtrudeGeometry(hullShape, { depth: .33, bevelEnabled: true, bevelSize: .1, bevelThickness: .08, bevelSegments: 2 })), surface.wood);
    hull.rotation.x = -Math.PI / 2; boat.add(hull);
    for (let z = -.9; z <= .9; z += .6) box(surface.wood, 0, .25, z, 1.4, .065, .23, boat);
    animations.push((dt, t) => { boat.position.y = -.15 + Math.sin(t * 1.2) * .07; boat.rotation.z = Math.sin(t * .85) * .028; });
  }

  function interactive(x, z, info, build) {
    const object = group(x, z, scene);
    interactions.push({ ...info, position: new THREE.Vector3(x, 0, z), radius: 3, object, activate: build(object) });
  }
  function hanging(object, lantern = false) {
    for (const side of [-1, 1]) pole(surface.wood, side * .55, 1.1, 0, .055, 2.2, object);
    beam([-.68, 2.18, 0], [.68, 2.18, 0], .07, surface.wood, object);
    const swing = group(0, 0, object); swing.position.y = 2.1; beam([0, 0, 0], [0, -.3, 0], .012, surface.dark, swing);
    if (lantern) {
      part('ball', mat('#853a28'), 0, -.54, 0, .23, .3, .23, swing);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        beam([Math.sin(a) * .12, -.29, Math.cos(a) * .12], [Math.sin(a) * .23, -.54, Math.cos(a) * .23], .012, surface.bronze, swing);
        beam([Math.sin(a) * .23, -.54, Math.cos(a) * .23], [Math.sin(a) * .12, -.83, Math.cos(a) * .12], .012, surface.bronze, swing);
      }
    } else {
      const bell = new THREE.Mesh(geometry(new THREE.CylinderGeometry(.16, .29, .35, 20, 1, true)), surface.bronze); bell.position.y = -.49; swing.add(bell);
      part('ring', surface.bronze, 0, -.66, 0, .28, .28, .28, swing).rotation.x = Math.PI / 2;
      pole(surface.bronze, 0, -.62, 0, .025, .4, swing);
    }
    panel(mat('#bfb18d', { side: THREE.DoubleSide }), 0, -.94, 0, .1, .34, swing);
    let energy = 0;
    animations.push((dt, t) => { energy = Math.max(0, energy - dt); swing.rotation.z = Math.sin(t * 5) * (.025 + energy * .075); });
    return () => { energy = 6; };
  }
  function counter(object, bread = false) {
    box(surface.wood, 0, .81, 0, 1.7, .12, .9, object);
    for (const x of [-.65, .65]) for (const z of [-.31, .31]) box(surface.dark, x, .39, z, .065, .78, .065, object);
    const tray = group(0, 0, object); tray.position.y = .92; box(surface.bronze, 0, 0, 0, 1.4, .07, .7, tray);
    for (let i = 0; i < 6; i++) part('ball', mat(bread ? '#b68f51' : '#d2b280', { roughness: .95 }), -.45 + (i % 3) * .44, .1, -.19 + Math.floor(i / 3) * .37, .16, .075, .15, tray);
    const cover = group(0, -.39, object); cover.position.y = .9; box(surface.wood, 0, .02, .39, 1.55, .08, .82, cover); box(surface.bronze, 0, .1, .6, .28, .065, .05, cover);
    let open = 0;
    animations.push((dt, t) => { open = Math.max(0, open - dt); cover.rotation.x += ((open ? -1.4 : 0) - cover.rotation.x) * Math.min(1, dt * 5); tray.position.y = .92 + (open ? Math.sin(t * 2) * .008 : 0); });
    return () => { open = 9; };
  }
  function wheel(object, prayer = false) {
    pole(surface.wood, 0, 1, 0, .075, 2, object);
    const rotor = group(0, 0, object); rotor.position.y = prayer ? 1.15 : 1.65;
    if (prayer) {
      pole(surface.bronze, 0, 0, 0, .32, .7, rotor);
      for (let j = 0; j < 10; j++) { const a = j * Math.PI / 5; box(surface.dark, Math.sin(a) * .322, 0, Math.cos(a) * .322, .065, .42, .025, rotor, a); }
      for (const y of [-.36, .36]) pole(surface.bronze, 0, y, 0, .36, .045, rotor);
    } else {
      part('ring', surface.wood, 0, 0, 0, .64, .64, .64, rotor);
      for (let j = 0; j < 8; j++) { const spoke = box(surface.wood, 0, 0, 0, 1.3, .065, .08, rotor); spoke.rotation.z = j * Math.PI / 4; }
      for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4; box(surface.wood, Math.cos(a) * .68, Math.sin(a) * .68, 0, .24, .4, .06, rotor).rotation.z = a; }
    }
    let fast = 0;
    animations.push(dt => { fast = Math.max(0, fast - dt); rotor.rotation[prayer ? 'y' : 'z'] += dt * (fast ? 4 : .1); });
    return () => { fast = 7; };
  }
  function butterflies(object) {
    grasses(object.position.x, object.position.z, 1.6, 1.5, 75);
    let active = 0;
    for (let i = 0; i < 5; i++) {
      const b = group(0, 0, object), wings = [];
      for (const side of [-1, 1]) { const wing = part('leaf', mat(i % 2 ? '#c3b487' : '#a57d58', { side: THREE.DoubleSide }), side * .065, 0, 0, 1.2, .55, 1, b); wing.rotation.z = side; wings.push(wing); }
      animations.push((dt, t) => { b.position.set(Math.cos(t + i) * (active ? 1.5 : .5), (active ? 1.6 : .7) + Math.sin(t * 2 + i) * .23, Math.sin(t + i) * .7); wings.forEach((wing, j) => { wing.rotation.y = Math.sin(t * 17 + i) * (j ? -.8 : .8); }); });
    }
    animations.push(dt => { active = Math.max(0, active - dt); }); return () => { active = 8; };
  }
  function coffee(object) {
    pole(surface.wood, 0, .84, 0, .7, .075, object); pole(surface.dark, 0, .4, 0, .055, .8, object);
    const ceramic = mat('#d4d1c6', { roughness: .32 });
    const cup = new THREE.Mesh(geometry(new THREE.CylinderGeometry(.13, .11, .19, 20, 1, true)), ceramic); cup.position.set(0, .99, 0); object.add(cup);
    pole('#3b261d', 0, 1.075, 0, .118, .005, object); part('ring', ceramic, .145, 1, 0, .062, .07, .065, object).rotation.y = Math.PI / 2;
    const kettle = group(.32, -.15, object); kettle.position.y = 1.08;
    part('ball', surface.bronze, 0, 0, 0, .19, .15, .17, kettle); beam([-.14, .01, 0], [-.31, .15, 0], .026, surface.bronze, kettle);
    let active = 0;
    for (let i = 0; i < 4; i++) {
      const points = Array.from({ length: 12 }, (_, j) => new THREE.Vector3(Math.sin(j * .65 + i) * .035, j * .03, 0));
      const material = new THREE.LineBasicMaterial({ color: '#e4e0d7', transparent: true, opacity: .32 }); materials.set(`steam-${i}`, material);
      const steam = new THREE.Line(geometry(new THREE.BufferGeometry().setFromPoints(points)), material); object.add(steam);
      animations.push((dt, t) => { steam.visible = active > 0; steam.position.set(Math.sin(i) * .045, 1.1 + ((t * .24 + i * .2) % 1) * .65, 0); material.opacity = active > 0 ? .4 * (1 - (t * .24 + i * .2) % 1) : 0; });
    }
    animations.push(dt => { active = Math.max(0, active - dt); kettle.rotation.z += ((active > 5 ? .7 : 0) - kettle.rotation.z) * Math.min(1, dt * 3); });
    return () => { active = 8; };
  }
  function gulls(object) {
    pole(surface.wood, 0, .53, 0, .12, 1.06, object); let active = 0;
    for (let i = 0; i < 5; i++) {
      const bird = group(0, 0, object), wings = []; part('ball', '#c5c7c2', 0, 0, 0, .075, .06, .19, bird);
      for (const side of [-1, 1]) { const wing = part('leaf', mat('#bbc0bd', { side: THREE.DoubleSide }), side * .15, 0, 0, 2.5, .75, 1, bird); wing.rotation.z = side * Math.PI / 2; wings.push(wing); }
      animations.push((dt, t) => {
        const a = t * .4 + i * 1.25, r = active ? 2.4 : 12;
        bird.position.set(Math.cos(a) * r, (active ? 2.3 : 5) + Math.sin(t + i) * .3, Math.sin(a) * r - (active ? 1 : 16));
        bird.rotation.y = -a; wings.forEach((wing, j) => { wing.rotation.y = Math.sin(t * 5 + i) * (j ? -.4 : .4); });
      });
    }
    animations.push(dt => { active = Math.max(0, active - dt); }); return () => { active = 9; };
  }
  if (id === 'oldtown') {
    interactive(-3, 4, { id: 'lantern', name: '古巷风铃', verb: '摇响风铃', description: '轻拨灯下的风铃，木架上的小灯笼随着清音摇晃。' }, g => hanging(g, true));
    interactive(3, -2, { id: 'merchant', name: '鲜花饼木匣', verb: '打开花饼木匣', description: '木盖缓缓掀起，刚烤好的花饼摆在铜盘里。' }, g => counter(g));
  } else if (id === 'pagodas') {
    interactive(-3, 4, { id: 'bell', name: '祈愿铜铃', verb: '轻敲铜铃', description: '铜铃轻轻荡开，塔影下有了悠长的回声。' }, g => hanging(g));
    interactive(3, -2, { id: 'prayer', name: '祈愿转轮', verb: '转动祈愿轮', description: '铜轮绕轴缓缓旋转，把心愿留在苍山脚下。' }, g => wheel(g, true));
  } else if (id === 'meadow') {
    interactive(-3, 4, { id: 'windmill', name: '山间木风轮', verb: '拨动木风轮', description: '木叶迎着山风转起来，石径旁响起轻轻的轴声。' }, g => wheel(g));
    interactive(3, -2, { id: 'butterflies', name: '草甸观察点', verb: '轻触草叶', description: '几只蝴蝶从草叶间飞起，在眼前的山风里盘旋。' }, g => butterflies(g));
  } else if (id === 'village') {
    interactive(-3, 4, { id: 'mill', name: '老式木风轮', verb: '转动木风轮', description: '木轮转动，稻穗旁的风有了可以看见的形状。' }, g => wheel(g));
    interactive(3, -2, { id: 'baker', name: '喜洲烤饼匣', verb: '揭开烤饼匣', description: '掀开木匣，看看刚烤好的喜洲小饼。' }, g => counter(g, true));
  } else if (id === 'cafe') {
    interactive(-3, 4, { id: 'coffee', name: '海边手冲台', verb: '冲一杯咖啡', description: '手冲壶缓缓倾下，细细的热气从杯口升起。' }, g => coffee(g));
    interactive(3, -2, { id: 'gulls', name: '海鸥歇脚台', verb: '招呼海鸥', description: '海鸥飞近露台，转过一圈后重新滑向湖面。' }, g => gulls(g));
  } else {
    interactive(-3, 4, { id: 'fishing', name: '岸边鱼竿', verb: '提起鱼竿', description: '握住竿柄轻轻扬起，一尾银鱼在细线上跃动。' }, g => {
      const rod = group(0, 0, g); rod.position.y = .9;
      beam([0, 0, 0], [.15, 2.5, -1.5], .017, surface.wood, rod); beam([.15, 2.5, -1.5], [.15, -.55, -1.5], .003, surface.dark, rod);
      const fish = part('ball', mat('#9fa9a1', { metalness: .35, roughness: .3 }), .15, -.5, -1.5, .07, .09, .22, rod); let active = 0;
      animations.push((dt, t) => { active = Math.max(0, active - dt); rod.rotation.x += ((active ? -.38 : .1) - rod.rotation.x) * Math.min(1, dt * 3); fish.rotation.z = active ? Math.sin(t * 14) * .4 : 0; });
      return () => { active = 7; };
    });
    interactive(3, -2, { id: 'boat', name: '一只纸船', verb: '放出纸船', description: '纸船落进微波，沿着木码头缓缓漂向湖面。' }, g => {
      pole(surface.wood, 0, .48, 0, .13, .96, g); const boat = group(0, 0, g); boat.position.y = 1.05;
      const paper = geometry(new THREE.BufferGeometry());
      paper.setAttribute('position', new THREE.Float32BufferAttribute([-.28,0,-.18,.28,0,-.18,0,.25,0, .28,0,-.18,.28,0,.18,0,.25,0, .28,0,.18,-.28,0,.18,0,.25,0, -.28,0,.18,-.28,0,-.18,0,.25,0], 3)); paper.computeVertexNormals();
      boat.add(new THREE.Mesh(paper, mat('#cec6b0', { side: THREE.DoubleSide }))); let released = 0;
      animations.push((dt, t) => { if (released) { released += dt; boat.position.set(Math.min(5, released * .8), Math.max(-.19, 1.05 - released * .8), -Math.min(16, released * .65)); boat.rotation.z = Math.sin(t * 2) * .08; } });
      return () => { released = .01; };
    });
  }
  // Shared static meshes become one draw call per geometry/material pair.
  fixed.updateMatrixWorld(true);
  const batches = new Map();
  fixed.traverse(mesh => {
    if (!mesh.isMesh) return;
    const key = `${mesh.geometry.uuid}/${mesh.material.uuid}`;
    if (!batches.has(key)) batches.set(key, { geometry: mesh.geometry, material: mesh.material, transforms: [] });
    batches.get(key).transforms.push(mesh.matrixWorld.clone());
  });
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.transforms.length);
    batch.transforms.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.castShadow = mesh.receiveShadow = true; mesh.computeBoundingSphere(); scene.add(mesh);
  }
  fixed.clear(); scene.remove(fixed);
  const ready = Promise.all(pending).then(() => { if (disposed) throw new Error('Travel world closed while loading'); });
  return {
    scene, colliders, interactions, ready, photoOccluders, spawn: { x: 0, z: 9 },
    landmark: new THREE.Vector3(0, id === 'pagodas' ? 10 : id === 'cafe' ? 2 : 3.5, id === 'pagodas' ? -33 : id === 'pier' ? -19 : id === 'cafe' ? -24 : -16),
    update(dt, time) { if (!disposed) for (const animate of animations) animate(dt, time); },
    dispose() {
      if (disposed) return;
      disposed = true; sun.shadow.dispose();
      scene.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
      for (const g of geometries) g.dispose();
      for (const material of materials.values()) material.dispose();
      for (const texture of textures) texture.dispose();
      scene.background = scene.environment = null; scene.clear();
    },
  };
}
