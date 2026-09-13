import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROADS, STREET_AXES, COAST_ROAD, MARKET_PLAZA, ROAD_ISLANDS, BUILDINGS, DOCK } from './map-data.js';

// Original geometry and painted signs: no assets from the reference game.
export function createWorld(scene) {
  const colliders = [];
  const cameraColliders = [];
  const fixed = new THREE.Group();
  scene.add(fixed);
  scene.background = new THREE.Color('#addde0');
  scene.fog = new THREE.Fog('#addde0', 110, 265);

  const colors = {
    grass: '#b7c896', lawn: '#a5ba84', sand: '#f3ddb1', stone: '#d0ba98',
    road: '#819596', line: '#f8ebce', cream: '#fff0ce', white: '#fff8e5',
    roof: '#da7857', roofDark: '#bd604e', coral: '#e99175', yellow: '#edbd63',
    mint: '#87b9a4', teal: '#327f80', blue: '#83b9c5', wood: '#9d7150',
    trunk: '#8a694d', leaf: '#73996d', leafLight: '#9eb57b', dark: '#3b5656',
    glass: '#426a75', rubber: '#3e4746', fur: '#ae8054', muzzle: '#c29867',
    furDark: '#795438', orange: '#f29a40', box: '#d5a571', tape: '#f9d995',
  };
  const materials = Object.fromEntries(Object.entries(colors).map(([name, color]) => [name,
    new THREE.MeshStandardMaterial({ color, roughness: .88, flatShading: true })]));
  const shape = {
    box: new THREE.BoxGeometry(1, 1, 1), sphere: new THREE.SphereGeometry(1, 12, 8),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
    cone: new THREE.ConeGeometry(1, 1, 8),
    rock: new THREE.IcosahedronGeometry(1, 0),
  };
  const material = (name) => materials[name] || materials.cream;
  function part(parent, geometry, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    const mesh = new THREE.Mesh(typeof geometry === 'string' ? shape[geometry] : geometry,
      typeof mat === 'string' ? material(mat) : mat);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  const box = (p, m, x, y, z, w, h, d, ry = 0) => part(p, 'box', m, x, y, z, w, h, d, 0, ry);
  const ball = (p, m, x, y, z, w, h = w, d = w) => part(p, 'sphere', m, x, y, z, w, h, d);
  const cyl = (p, m, x, y, z, r, h, rx = 0, rz = 0) => part(p, 'cylinder', m, x, y, z, r, h, r, rx, 0, rz);
  const group = (parent, x = 0, y = 0, z = 0, ry = 0) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g); return g;
  };
  function mergeStatic(root) {
    root.updateMatrixWorld(true);
    const inverse = root.matrixWorld.clone().invert();
    const batches = new Map();
    root.traverse((child) => {
      if (!child.isMesh) return;
      const key = `${child.material.uuid}:${Boolean(child.geometry.index)}`;
      if (!batches.has(key)) batches.set(key, { material: child.material, geometries: [] });
      const geometry = child.geometry.clone();
      geometry.applyMatrix4(inverse.clone().multiply(child.matrixWorld));
      // Primitive meshes have matching position/normal/uv attributes.
      batches.get(key).geometries.push(geometry);
    });
    root.clear();
    for (const batch of batches.values()) {
      const geometry = mergeGeometries(batch.geometries, false);
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, batch.material);
      mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
      batch.geometries.forEach((g) => g.dispose());
    }
  }
  let seed = 917;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  const sky = new THREE.HemisphereLight('#fff4d7', '#547a81', 2.25);
  scene.add(sky);
  const sun = new THREE.DirectionalLight('#fff0cf', 3.2);
  sun.position.set(-28, 58, 24); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -43, right: 43, top: 43, bottom: -43, near: 1, far: 145 });
  sun.shadow.bias = -.00025; sun.shadow.normalBias = .045;
  scene.add(sun, sun.target);

  const seaMaterial = new THREE.MeshStandardMaterial({ color: '#68b9c4', roughness: .3, metalness: .08 });
  const sea = part(scene, new THREE.PlaneGeometry(1600, 1600), seaMaterial, 0, -1.05, 0, 1, 1, 1, -Math.PI / 2);
  sea.castShadow = false;
  cyl(fixed, 'stone', 0, -2.1, 0, 78, 3.2);
  cyl(fixed, 'sand', 0, -.66, 0, 78.2, .55);
  cyl(fixed, 'grass', 0, -.3, 0, 71.7, .6);
  const surf = [];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: '#e7f8e9', transparent: true, opacity: .3 - i * .07, depthWrite: false });
    const ring = part(scene, new THREE.RingGeometry(78.4 + i * 1.6, 78.8 + i * 1.6, 100), mat,
      0, -.94 + i * .01, 0, 1, 1, 1, -Math.PI / 2);
    ring.castShadow = false; surf.push(ring);
  }
  const seaGlints = new THREE.Group(); scene.add(seaGlints);
  for (let i = 0; i < 120; i++) {
    const a = random() * Math.PI * 2; const r = 84 + random() * 150;
    box(seaGlints, 'white', Math.cos(a) * r, -.96, Math.sin(a) * r, 1.5 + random() * 5, .015, .1);
  }
  mergeStatic(seaGlints);
  seaGlints.children.forEach((m) => { m.castShadow = false; });

  // The coastal loop trades distance for fewer tight turns through town.
  const { radius: coastRadius, width: coastWidth } = COAST_ROAD;
  part(fixed, new THREE.RingGeometry(coastRadius - coastWidth / 2 - .5, coastRadius + coastWidth / 2 + .5, 128), 'sand', 0, .035, 0, 1, 1, 1, -Math.PI / 2);
  part(fixed, new THREE.RingGeometry(coastRadius - coastWidth / 2, coastRadius + coastWidth / 2, 128), 'road', 0, .08, 0, 1, 1, 1, -Math.PI / 2);
  for (const road of ROADS) {
    box(fixed, 'sand', road.x, .015, road.z, road.w + 3, .07, road.d + 1);
    box(fixed, 'road', road.x, .06, road.z, road.w, .09, road.d);
  }
  for (const a of STREET_AXES) for (let v = -58; v <= 58; v += 7) {
    if (STREET_AXES.some((n) => Math.abs(v - n) < 7)) continue;
    box(fixed, 'line', a, .12, v, .12, .018, 2.7);
    box(fixed, 'line', v, .125, a, 2.7, .018, .12);
  }
  for (const x of STREET_AXES) for (const z of STREET_AXES) {
    for (let i = -3; i <= 3; i++) {
      box(fixed, 'line', x + i * 1.04, .128, z + 6.8, .57, .016, 2.3);
      box(fixed, 'line', x + 6.8, .13, z + i * 1.04, 2.3, .016, .57);
    }
  }
  function sign(parent, title, subtitle, x, y, z, width, height, background = '#fff0ce', ink = '#3b5656') {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 256;
    const context = canvas.getContext('2d');
    context.fillStyle = background; context.fillRect(0, 0, 768, 256);
    context.strokeStyle = ink; context.lineWidth = 6; context.strokeRect(14, 14, 740, 228);
    context.fillStyle = ink; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.font = 'bold 74px "Microsoft YaHei", sans-serif'; context.fillText(title, 384, subtitle ? 97 : 130, 705);
    if (subtitle) { context.font = '600 30px sans-serif'; context.fillText(subtitle, 384, 180, 680); }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, side: THREE.DoubleSide });
    const mesh = part(parent, new THREE.PlaneGeometry(width, height), mat, x, y, z);
    mesh.castShadow = false; return mesh;
  }
  function planter(parent, x, z, size = 1) {
    cyl(parent, 'roof', x, .27 * size, z, .45 * size, .54 * size);
    ball(parent, 'leaf', x, .7 * size, z, .58 * size, .53 * size);
    ball(parent, 'leafLight', x + .18 * size, .91 * size, z, .35 * size);
  }
  function tree(x, z, size = 1, palm = false) {
    const g = group(fixed, x, 0, z);
    cyl(g, 'trunk', 0, 1.65 * size, 0, .22 * size, 3.3 * size);
    if (palm) {
      for (let i = 0; i < 7; i++) {
        const a = i * Math.PI * 2 / 7;
        const leaf = ball(g, i % 2 ? 'leaf' : 'leafLight', Math.sin(a) * size, 3.3 * size, Math.cos(a) * size, .44 * size, .15 * size, 1.8 * size);
        leaf.rotation.y = a; leaf.rotation.x = .24;
      }
      ball(g, 'wood', .14 * size, 3 * size, .15 * size, .24 * size);
    } else {
      ball(g, 'leaf', 0, 3.6 * size, 0, 1.65 * size, 1.8 * size, 1.5 * size);
      ball(g, 'leafLight', -.65 * size, 4 * size, .12 * size, 1.1 * size, 1.3 * size);
      ball(g, 'leaf', .87 * size, 3.3 * size, .15 * size, 1.03 * size);
      if (random() > .45) for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3;
        ball(g, 'orange', Math.sin(a) * 1.3 * size, (3.3 + random()) * size, Math.cos(a) * 1.3 * size, .15 * size);
      }
    }
    colliders.push({ x, z, w: .6 * size, d: .6 * size });
  }
  function lamp(x, z) {
    cyl(fixed, 'dark', x, 1.8, z, .075, 3.6);
    cyl(fixed, 'dark', x, .12, z, .22, .24);
    box(fixed, 'dark', x, 3.65, z, .65, .13, .65);
    box(fixed, 'cream', x, 3.4, z, .4, .5, .4);
    part(fixed, 'cone', 'dark', x, 3.84, z, .49, .3, .49);
  }
  function bench(x, z, rotation = 0) {
    const g = group(fixed, x, 0, z, rotation);
    for (const zz of [-.25, .1, .45]) box(g, 'wood', 0, .65, zz, 2.6, .14, .25);
    for (const yy of [1.02, 1.32]) box(g, 'wood', 0, yy, .55, 2.6, .22, .14);
    for (const xx of [-.95, .95]) { box(g, 'dark', xx, .32, .1, .13, .64, .85); box(g, 'dark', xx, .96, .59, .12, .95, .12); }
    colliders.push({ x, z, w: rotation ? 1 : 2.7, d: rotation ? 2.7 : 1 });
  }
  function building(x, z, w, d, h, color, title = '', subtitle = '', rotation = 0) {
    const g = group(fixed, x, 0, z, rotation);
    box(g, 'stone', 0, .22, 0, w + .35, .44, d + .35);
    box(g, color, 0, h / 2, 0, w, h, d);
    box(g, 'cream', 0, .52, d / 2 + .07, w + .08, .22, .15);
    box(g, 'cream', 0, h - .35, d / 2 + .08, w + .25, .25, .16);
    for (const xx of [-w / 2 + .2, w / 2 - .2]) box(g, 'cream', xx, h / 2, d / 2 + .08, .25, h, .15);
    // Two pitched roof slopes with terracotta ridge and chimney.
    const slope = Math.atan2(1.5, d / 2 + .5);
    const roofLength = Math.hypot(d / 2 + .5, 1.5);
    for (const side of [-1, 1]) {
      const roof = box(g, side < 0 ? 'roofDark' : 'roof', 0, h + .8, side * (d / 4 + .25), w + 1, .25, roofLength);
      roof.rotation.x = side * slope;
      for (let r = -w / 2; r <= w / 2; r += .8) {
        const tile = box(g, 'roofDark', r, h + .94, side * (d / 4 + .25), .045, .04, roofLength);
        tile.rotation.x = side * slope;
      }
    }
    box(g, 'roofDark', 0, h + 1.58, 0, w + 1.1, .2, .25);
    box(g, 'cream', w * .28, h + 1.45, -d * .16, .9, 2.1, .9);
    box(g, 'roofDark', w * .28, h + 2.55, -d * .16, 1.1, .25, 1.1);
    const fronts = [-w * .29, w * .29];
    for (const xx of fronts) {
      box(g, 'cream', xx, 1.85, d / 2 + .12, w * .24 + .25, 2.6, .15);
      box(g, 'glass', xx, 1.85, d / 2 + .22, w * .24, 2.35, .08);
      box(g, 'cream', xx, 1.85, d / 2 + .28, .1, 2.4, .07);
      box(g, 'cream', xx, 1.83, d / 2 + .29, w * .24, .1, .07);
      if (h > 5.5) {
        box(g, 'cream', xx, h - 1.8, d / 2 + .12, 1.8, 2.1, .15);
        box(g, 'glass', xx, h - 1.8, d / 2 + .24, 1.55, 1.85, .07);
        box(g, 'cream', xx, h - 1.8, d / 2 + .3, .09, 1.85, .07);
        box(g, 'wood', xx, h - 2.8, d / 2 + .42, 2.1, .42, .6);
        for (let j = -1; j <= 1; j++) ball(g, j ? 'leaf' : 'leafLight', xx + j * .62, h - 2.48, d / 2 + .45, .43, .4, .35);
      }
    }
    box(g, 'wood', 0, 1.45, d / 2 + .12, 1.45, 2.9, .25);
    box(g, 'glass', 0, 1.8, d / 2 + .27, 1.05, 1.7, .07);
    ball(g, 'yellow', .43, 1.32, d / 2 + .36, .09);
    if (title) {
      sign(g, title, subtitle, 0, 4.25, d / 2 + .19, w - 1, 1.5);
      const awningZ = d / 2 + .95;
      for (let i = 0; i < Math.floor(w); i++) {
        const awning = box(g, i % 2 ? 'cream' : 'teal', -w / 2 + i + .5, 3.35, awningZ, 1, .13, 1.9);
        awning.rotation.x = .15;
        box(g, i % 2 ? 'cream' : 'teal', -w / 2 + i + .5, 3.03, d / 2 + 1.85, 1, .44, .12);
      }
      for (const xx of [-w / 2 + .5, w / 2 - .5]) planter(g, xx, d / 2 + .8, 1.1);
    }
    // Side windows stop the town reading as flat facades from a moving camera.
    for (const side of [-1, 1]) for (const zz of [-d * .23, d * .23]) {
      box(g, 'cream', side * (w / 2 + .055), 2.7, zz, .12, 2.15, 1.65);
      box(g, 'glass', side * (w / 2 + .13), 2.7, zz, .055, 1.85, 1.35);
      box(g, 'cream', side * (w / 2 + .17), 2.7, zz, .04, 1.85, .1);
    }
    colliders.push({ x, z, w: w + .6, d: d + .6 });
    cameraColliders.push({ x, z, w: w + 1.1, d: d + 1, h: h + 2.8 });
    return g;
  }

  for (const b of BUILDINGS) building(b.x, b.z, b.w, b.d, b.h, b.color, b.title, b.subtitle, b.rotation);

  for (const island of ROAD_ISLANDS) {
    const { x, z, w, d, name } = island;
    box(fixed, 'cream', x, .22, z, w, .44, d);
    box(fixed, 'lawn', x, .49, z, w - .3, .1, d - .3);
    planter(fixed, x, z, 1.3);
    for (const dx of [-.55, .55]) ball(fixed, 'yellow', x + dx, .86, z, .18);
    colliders.push(island);
    if (name) {
      const post = group(fixed, x, 0, z);
      cyl(post, 'wood', 0, 1.3, 0, .07, 2.6);
      sign(post, name, 'SLOW / 两侧通行', 0, 2.6, .08, 2.7, .95);
    }
  }

  // The three pickup approaches are deliberately open at (-17,-5), (-8,-5), (-12,5).
  box(fixed, 'sand', MARKET_PLAZA.x, .12, MARKET_PLAZA.z, MARKET_PLAZA.w, .12, MARKET_PLAZA.d);
  for (let x = -22; x <= -4; x += 2) for (let z = -9; z <= 9; z += 2) {
    if ((x + z + 1) % 4 === 0) box(fixed, 'cream', x, .184, z, 1.85, .015, 1.85);
  }
  function stall(x, z, title, type, rotation = 0) {
    const g = group(fixed, x, 0, z, rotation);
    box(g, 'wood', 0, .7, 0, 4.1, 1.4, 1.15);
    for (let i = -2; i <= 2; i++) box(g, 'box', i * .8, .73, .6, .64, 1.15, .05);
    box(g, 'cream', 0, 1.43, 0, 4.4, .18, 1.55);
    for (const xx of [-2, 2]) cyl(g, 'wood', xx, 1.7, -.45, .065, 3.4);
    for (let i = 0; i < 8; i++) {
      const awning = box(g, i % 2 ? 'cream' : type, -1.94 + i * .555, 3.3, .05, .56, .16, 2.25);
      awning.rotation.x = -.13;
      box(g, i % 2 ? 'cream' : type, -1.94 + i * .555, 3.09, 1.16, .56, .42, .12);
    }
    for (let i = -2; i <= 2; i++) {
      box(g, 'wood', i * .73, 1.56, 0, .67, .22, 1.1);
      if (type === 'yellow') {
        for (let j = 0; j < 3; j++) ball(g, 'orange', i * .73 + (j % 2) * .23 - .12, 1.83, -.3 + j * .24, .2, .2, .23);
      } else if (type === 'coral') {
        for (const z of [-.25, .25]) {
          ball(g, 'yellow', i * .73, 1.83, z, .3, .16, .19);
          for (const dx of [-.15, 0, .15]) box(g, 'cream', i * .73 + dx, 1.985, z, .04, .017, .19, -.4);
        }
      } else {
        for (const dx of [-.15, .15]) {
          const x = i * .73 + dx;
          cyl(g, 'white', x, 1.88, 0, .115, .4);
          ball(g, 'white', x, 2.07, 0, .115, .09, .115);
          cyl(g, 'white', x, 2.15, 0, .06, .13);
          cyl(g, 'teal', x, 2.22, 0, .073, .055);
          box(g, 'blue', x, 1.88, .116, .16, .15, .012);
        }
      }
    }
    sign(g, title, '', 0, .74, .637, 3.1, .7, '#fff0ce', '#775c42');
    colliders.push({ x, z, w: 4.3, d: 1.45 });
  }
  stall(-17, -6.7, '橘子 / ORANGES', 'yellow');
  stall(-8, -6.7, '面包 / BREAD', 'coral');
  stall(-12, 6.7, '牛奶 / MILK', 'mint', Math.PI);
  const marketGate = group(fixed, -22, 0, 0, Math.PI / 2);
  for (const xx of [-3.6, 3.6]) cyl(marketGate, 'wood', xx, 2.1, 0, .12, 4.2);
  sign(marketGate, '橘风集市', 'TANGERINE FARMERS MARKET', 0, 3.65, 0, 4.6, 1.1, '#eeb76c');
  // Bunting strung above the plaza, safely out of the rider's way.
  for (let i = 0; i < 18; i++) {
    const x = -22 + i;
    const y = 4.3 - Math.sin(i / 17 * Math.PI) * .65;
    box(fixed, 'wood', x, y + .3, 0, 1.02, .025, .025);
    const flagGeometry = new THREE.BufferGeometry();
    flagGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-.35, .3, 0, .35, .3, 0, 0, -.25, 0], 3));
    flagGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, .5, 0], 2));
    flagGeometry.setIndex([0, 1, 2, 2, 1, 0]); flagGeometry.computeVertexNormals();
    part(fixed, flagGeometry, ['coral', 'yellow', 'mint'][i % 3], x, y, 0);
  }

  // Lighthouse park: a visible landmark for the north-west delivery route.
  cyl(fixed, 'sand', -44, .08, -44, 13, .16);
  const lighthouse = group(fixed, -45, 0, -44);
  for (let i = 0; i < 5; i++) {
    const geometry = new THREE.CylinderGeometry(2.05 - i * .2, 2.25 - i * .2, 2, 16);
    part(lighthouse, geometry, i % 2 ? 'coral' : 'cream', 0, 1 + i * 2, 0);
  }
  cyl(lighthouse, 'dark', 0, 10.2, 0, 1.9, .28);
  cyl(lighthouse, 'glass', 0, 11, 0, 1.25, 1.5);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    cyl(lighthouse, 'cream', Math.sin(a) * 1.3, 11, Math.cos(a) * 1.3, .07, 1.7);
  }
  part(lighthouse, 'cone', 'coral', 0, 12.2, 0, 1.8, 1, 1.8);
  ball(lighthouse, 'yellow', 0, 12.85, 0, .17);
  box(lighthouse, 'wood', 0, 1.2, 2.2, 1.15, 2.4, .15);
  colliders.push({ x: -45, z: -44, w: 4.6, d: 4.6 });
  cameraColliders.push({ x: -45, z: -44, w: 4.6, d: 4.6, h: 13 });
  bench(-36, -39, Math.PI / 2); bench(-43, -35);
  tree(-50, -35, 1.1); tree(-36, -49, 1.1);
  const parkSign = group(fixed, -35.8, 0, -34);
  cyl(parkSign, 'wood', 0, 1.05, 0, .09, 2.1);
  sign(parkSign, '落日灯塔', 'SUNSET POINT', 0, 2.1, .08, 3.4, 1.15);

  for (const [x, z, s, p] of [
    [-57, -20, 1.3, 0], [-58, 5, 1.15, 1], [-58, 28, 1.2, 1], [-52, 53, 1.2, 1],
    [-33, 55, 1.05, 0], [-5, 54, 1.2, 0], [34, 56, 1.2, 1], [55, 34, 1.3, 1],
    [56, 3, 1.1, 0], [57, -24, 1.3, 0], [50, -53, 1.2, 0], [5, -56, 1.1, 1],
    [-24, -57, 1.25, 0], [-53, -53, 1.25, 1], [20, 20, .85, 0], [20, -20, .9, 0],
    [-20, 21, .85, 0], [-21, -21, .82, 0], [35, 21, .8, 0], [-35, 21, .86, 0],
    [21, -35, .85, 0], [-35, -21, .85, 0], [-21, 35, .8, 0], [21, 35, .8, 0],
  ]) tree(x, z, s, p);
  for (const [x, z] of [[-6.4, 17], [6.5, -17], [21.4, 9], [34.5, -18], [-34.5, 9], [-21.4, -36], [6.5, 39], [-6.5, -43], [39, 6.5], [-42, -6.5]]) lamp(x, z);
  bench(20, 8, Math.PI / 2); bench(36, -34); bench(-37, 34);
  // Cafe terrace, garden beds, mailboxes, and a few small street props.
  for (const [x, z] of [[48, -35], [48, -40]]) {
    cyl(fixed, 'cream', x, .94, z, 1.2, .12); cyl(fixed, 'dark', x, .47, z, .085, .9);
    for (const dx of [-1.8, 1.8]) { cyl(fixed, 'teal', x + dx, .53, z, .47, .13); cyl(fixed, 'dark', x + dx, .25, z, .06, .5); }
    cyl(fixed, 'wood', x, 2, z, .055, 4);
    part(fixed, 'cone', 'cream', x, 3.9, z, 2.35, .68, 2.35);
  }
  for (const [x, z] of [[-35, 35], [35, 35], [6.5, 7], [-35, -7]]) {
    cyl(fixed, 'dark', x, .65, z, .065, 1.3);
    box(fixed, 'teal', x, 1.25, z, .66, .9, .56);
    box(fixed, 'dark', x, 1.48, z + .29, .45, .05, .015);
  }
  for (let i = 0; i < 31; i++) {
    const a = i * Math.PI * 2 / 31; const r = 73 + random() * 3;
    part(fixed, 'rock', i % 3 ? 'stone' : 'cream', Math.cos(a) * r, -.1, Math.sin(a) * r,
      1 + random() * 1.8, .7 + random(), 1 + random(), random(), random(), random());
  }
  const pier = group(fixed, DOCK.x, 0, DOCK.z);
  for (let z = -DOCK.d / 2 + .4; z < DOCK.d / 2; z += .8) box(pier, 'wood', 0, .1, z, DOCK.w, .22, .68);
  for (let z = -DOCK.d / 2 + 1; z <= DOCK.d / 2; z += 5) for (const x of [-(DOCK.w / 2 - .25), DOCK.w / 2 - .25]) {
    cyl(pier, 'wood', x, -.9, z, .21, 3.8);
    cyl(pier, 'cream', x, .78, z, .24, .14);
  }
  box(fixed, 'sand', 0, .01, 65, 7, .09, 9);
  function boat(x, z, scale, rotation) {
    const g = group(scene, x, -.4, z, rotation); g.scale.setScalar(scale);
    ball(g, 'cream', 0, .3, 0, 1.2, .75, 3);
    box(g, 'wood', 0, .76, 0, 1.8, .12, 4.3);
    cyl(g, 'wood', 0, 3.2, 0, .075, 5.8);
    const sail = new THREE.BufferGeometry();
    sail.setAttribute('position', new THREE.Float32BufferAttribute([.12, 1.4, 0, .12, 6, 0, .12, 1.4, -2.8, .12, 1.4, 0, .12, 1.4, 2.3, .12, 5.3, 0], 3));
    sail.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1], 2));
    sail.computeVertexNormals();
    const sailMat = new THREE.MeshStandardMaterial({ color: '#fff3d8', side: THREE.DoubleSide, roughness: 1 });
    part(g, sail, sailMat);
    mergeStatic(g); return g;
  }
  const boats = [boat(14, 86, 1.2, -.5), boat(-91, 24, 1.4, .7), boat(90, -30, 1.9, -1.1)];
  for (let i = 0; i < 11; i++) {
    const x = -165 + i * 31;
    part(fixed, 'cone', i % 2 ? 'mint' : 'blue', x, 7 + random() * 5, -151 - random() * 22,
      20 + random() * 19, 24 + random() * 30, 20 + random() * 15);
  }
  const clouds = [];
  const cloudMat = new THREE.MeshBasicMaterial({ color: '#fff4dd', fog: true });
  for (let i = 0; i < 8; i++) {
    const g = group(scene, (random() - .5) * 230, 27 + random() * 18, (random() - .5) * 170 - 35);
    const size = 3 + random() * 3;
    for (let j = 0; j < 4; j++) ball(g, cloudMat, (j - 1.5) * size * 1.1, Math.sin(j) * size * .35, 0, size, size * .5, size * .6);
    mergeStatic(g); g.children.forEach((m) => { m.castShadow = false; }); clouds.push(g);
  }

  // A recognisable long-muzzled capybara, wearing a tiny orange riding helmet.
  const rider = group(scene);
  const suspension = group(rider);
  const scooter = group(suspension);
  box(scooter, 'teal', 0, .38, .05, .82, .17, 2.5);
  ball(scooter, 'mint', 0, .58, -.86, .46, .64, .39);
  box(scooter, 'mint', 0, .83, -.7, .78, .91, .3);
  ball(scooter, 'mint', 0, .59, .89, .51, .36, .53);
  box(scooter, 'dark', 0, .96, .55, .8, .19, 1.15);
  cyl(scooter, 'dark', 0, 1.35, -.72, .055, .69);
  box(scooter, 'dark', 0, 1.66, -.72, 1.19, .075, .09);
  for (const x of [-.55, .55]) {
    box(scooter, 'rubber', x, 1.66, -.73, .2, .11, .15);
    cyl(scooter, 'dark', x, 1.89, -.69, .023, .4);
    ball(scooter, 'cream', x, 2.1, -.69, .14, .1, .05);
  }
  ball(scooter, 'cream', 0, 1.36, -1.03, .19, .19, .07);
  box(scooter, 'orange', 0, .64, 1.31, .39, .13, .045);
  box(scooter, 'cream', 0, .43, 1.37, .37, .16, .04);
  for (const x of [-.26, .26]) ball(scooter, 'yellow', x, 1.16, -1.04, .075, .055, .045);
  for (const z of [-.98, .95]) {
    cyl(scooter, 'rubber', 0, .37, z, .37, .25, 0, Math.PI / 2);
    cyl(scooter, 'cream', 0, .37, z, .21, .28, 0, Math.PI / 2);
    cyl(scooter, 'dark', 0, .37, z, .065, .31, 0, Math.PI / 2);
  }
  mergeStatic(scooter);
  const parkedScooter = scooter.clone();
  parkedScooter.name = 'parked-scooter'; parkedScooter.visible = false;
  scene.add(parkedScooter);
  const animal = group(suspension, 0, .96, .05);
  const body = group(animal);
  ball(body, 'fur', 0, .39, .13, .42, .63, .47);
  ball(body, 'fur', 0, .85, -.12, .43, .41, .5);
  ball(body, 'muzzle', 0, .72, -.49, .37, .26, .43);
  ball(body, 'furDark', 0, .79, -.868, .2, .085, .035);
  for (const x of [-.265, .265]) {
    ball(body, 'fur', x, 1.14, -.015, .12, .17, .1);
    ball(body, 'muzzle', x, 1.16, -.087, .063, .092, .02);
    ball(body, 'dark', x * 1.29, .93, -.41, .042, .052, .038);
    ball(body, 'white', x * 1.31, .945, -.439, .012);
    ball(body, 'furDark', x * .57, .795, -.89, .018, .025, .018);
  }
  const helmet = ball(body, 'orange', 0, 1.16, -.12, .29, .17, .32);
  const leaf = ball(body, 'leaf', .08, 1.345, -.12, .13, .035, .075); leaf.rotation.z = -.3;
  cyl(body, 'wood', 0, 1.345, -.12, .026, .13);
  const strap = new THREE.TorusGeometry(.305, .018, 5, 16, Math.PI);
  part(body, strap, 'roofDark', 0, 1.03, -.12, 1, .9, 1, 0, 0, Math.PI);
  for (const x of [-.39, .39]) {
    const arm = ball(body, 'fur', x, .38, -.36, .135, .33, .13); arm.rotation.x = -.7;
    ball(body, 'furDark', x, .25, -.58, .13, .095, .12);
  }
  mergeStatic(body);
  const legs = [];
  for (const x of [-.3, .3]) {
    const leg = group(animal, x, -.01, .15);
    ball(leg, 'fur', 0, -.18, 0, .17, .3, .17);
    ball(leg, 'furDark', 0, -.43, -.055, .17, .1, .23);
    mergeStatic(leg); legs.push(leg);
  }
  const cargo = group(suspension, 0, 1.07, .9);
  const boxes = [];
  for (let i = 0; i < 3; i++) {
    const parcel = group(cargo, 0, i * .48, 0, (i - 1) * .06);
    box(parcel, 'box', 0, .22, 0, .79, .44, .71);
    box(parcel, 'tape', 0, .448, 0, .13, .018, .72);
    box(parcel, 'tape', 0, .22, .36, .13, .44, .012);
    box(parcel, 'cream', .22, .25, .369, .21, .15, .008);
    for (let j = 0; j < 3; j++) box(parcel, 'wood', .16 + j * .045, .25, .376, .016, .09, .008);
    mergeStatic(parcel); boxes.push(parcel);
  }

  const marker = group(scene);
  const markerMat = new THREE.MeshBasicMaterial({ color: '#fff3bb', transparent: true, opacity: .88, depthWrite: false });
  const markerRing = part(marker, new THREE.TorusGeometry(1.7, .085, 6, 48), markerMat, 0, .22, 0, 1, 1, 1, Math.PI / 2);
  const markerInner = part(marker, new THREE.RingGeometry(1.25, 1.46, 40), markerMat, 0, .2, 0, 1, 1, 1, -Math.PI / 2);
  const arrow = group(marker, 0, 3.5, 0);
  part(arrow, new THREE.ConeGeometry(.35, .65, 4), 'orange', 0, 0, 0, 1, 1, 1, Math.PI);
  box(arrow, 'cream', 0, .53, 0, .22, .56, .22);
  marker.children.forEach((m) => { m.castShadow = false; });
  marker.visible = false;

  function car(color, direction, lane, start) {
    const g = group(scene);
    box(g, color, 0, .62, 0, 1.85, .7, 3.25);
    box(g, color, 0, 1.24, .18, 1.6, .64, 1.75);
    box(g, 'glass', 0, 1.34, -.71, 1.39, .39, .02);
    box(g, 'glass', 0, 1.34, 1.065, 1.39, .39, .02);
    for (const x of [-.814, .814]) box(g, 'glass', x, 1.34, .2, .025, .41, 1.44);
    for (const x of [-.9, .9]) for (const z of [-1.03, 1.03]) cyl(g, 'rubber', x, .36, z, .36, .22, 0, Math.PI / 2);
    for (const x of [-.6, .6]) box(g, 'cream', x, .71, -1.638, .34, .22, .04);
    box(g, 'cream', 0, .43, -1.65, 1.75, .13, .09);
    mergeStatic(g); return { g, direction, lane, start };
  }
  const cars = [car('yellow', 0, -30.3, 18), car('coral', 1, 30.4, -39), car('mint', 0, 2.35, -44)];
  const walkers = [];
  for (const [x, z, color, direction] of [[6.4, -39, 'coral', 0], [34.6, 5, 'yellow', 0], [-38, 6.6, 'mint', 1], [18, 34.6, 'blue', 1]]) {
    const g = group(scene, x, 0, z);
    ball(g, color, 0, .94, 0, .3, .45, .25);
    ball(g, 'muzzle', 0, 1.54, 0, .25, .27, .25);
    ball(g, 'cream', 0, 1.73, 0, .32, .11, .29);
    for (const xx of [-.14, .14]) box(g, 'dark', xx, .34, 0, .16, .58, .19);
    box(g, 'wood', .42, .71, 0, .24, .3, .2);
    mergeStatic(g); walkers.push({ g, x, z, direction });
  }

  const particleGeometry = new THREE.IcosahedronGeometry(.13, 0);
  const particles = [];
  const particleMaterials = [new THREE.MeshBasicMaterial({ color: '#ffd67b' }), new THREE.MeshBasicMaterial({ color: '#fff3cf' }), new THREE.MeshBasicMaterial({ color: '#9bd2b0' })];
  for (let i = 0; i < 36; i++) {
    const mesh = new THREE.Mesh(particleGeometry, particleMaterials[i % 3]); mesh.visible = false; scene.add(mesh);
    particles.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  let particleCursor = 0;
  function burst(x, z, color) {
    for (let i = 0; i < 18; i++) {
      const p = particles[particleCursor++ % particles.length];
      p.life = .65 + random() * .55; p.mesh.visible = true; p.mesh.position.set(x, .55, z);
      p.vx = (random() - .5) * 6; p.vz = (random() - .5) * 6; p.vy = 3 + random() * 4;
      p.mesh.scale.setScalar(1);
    }
    if (color) particleMaterials[0].color.set(color);
  }
  mergeStatic(fixed);
  let exhaustClock = 0;
  function update(state, dt, time) {
    rider.position.set(state.x, state.jumpY, state.z);
    rider.rotation.y = state.phase === 'ready' ? -2.2 : -state.angle;
    const speed = Math.abs(state.speed || 0);
    const walking = state.mode === 'walk';
    scooter.visible = !walking;
    parkedScooter.visible = walking;
    if (walking) {
      parkedScooter.position.set(state.bikeX ?? state.x, 0, state.bikeZ ?? state.z);
      parkedScooter.rotation.y = -(state.bikeAngle ?? 0);
    }
    animal.position.y = walking ? .55 : .96;
    animal.position.z = walking ? 0 : .05;
    const bob = Math.sin(time * (walking ? 13 : 22)) * Math.min(speed * .004, .035);
    suspension.position.y = bob;
    suspension.rotation.z = walking ? Math.sin(time * 12) * Math.min(speed * .005, .035) : -(state.steer || 0) * Math.min(speed * .012, .17);
    legs.forEach((leg, i) => { leg.rotation.x = walking ? Math.sin(time * 13 + i * Math.PI) * Math.min(speed * .15, .7) : -.6; });
    body.rotation.x = walking ? .1 : -.08 - (state.boosting ? .1 : 0);
    cargo.position.set(walking ? 0 : 0, walking ? 1.05 : 1.07, walking ? .54 : .9);
    cargo.rotation.z = Math.sin(time * 9) * Math.min(speed * .003, .035);
    cargo.rotation.x = Math.cos(time * 10) * Math.min(speed * .002, .025);
    const count = Math.max(0, Math.min(3, Number(state.cargo) || 0));
    boxes.forEach((parcel, i) => { parcel.visible = i < count; });
    markerRing.scale.setScalar(1 + Math.sin(time * 3) * .055);
    markerInner.rotation.z = time * .25;
    arrow.position.y = 3.5 + Math.sin(time * 3) * .23;
    arrow.rotation.y = time * .8;
    surf.forEach((ring, i) => { ring.scale.setScalar(1 + Math.sin(time * .7 + i) * .006); ring.material.opacity = .19 + Math.sin(time * .7 + i) * .07; });
    seaGlints.position.x = Math.sin(time * .25) * .8;
    boats.forEach((boat, i) => { boat.position.y = -.43 + Math.sin(time * 1.2 + i * 2) * .12; boat.rotation.z = Math.sin(time + i) * .03; });
    clouds.forEach((cloud, i) => { cloud.position.x += dt * (.45 + i * .025); if (cloud.position.x > 150) cloud.position.x = -150; });
    cars.forEach(({ g, direction, lane, start }, i) => {
      const offset = ((time * (2.2 + i * .3) + start + 72) % 144) - 72;
      if (direction) { g.position.set(offset, 0, lane); g.rotation.y = -Math.PI / 2; }
      else { g.position.set(lane, 0, -offset); g.rotation.y = 0; }
      // Cosmetic traffic yields to the player instead of passing through their scooter.
      g.visible = Math.hypot(g.position.x - state.x, g.position.z - state.z) > 5;
    });
    walkers.forEach(({ g, x, z, direction }, i) => {
      const offset = Math.sin(time * .075 + i) * 8;
      g.position.set(x + (direction ? offset : 0), Math.abs(Math.sin(time * 4 + i)) * .06, z + (direction ? 0 : offset));
      g.rotation.y = direction ? Math.PI / 2 : 0;
    });
    for (const p of particles) {
      if (p.life <= 0) continue;
      p.life -= dt; p.mesh.visible = p.life > 0;
      p.mesh.position.x += p.vx * dt; p.mesh.position.z += p.vz * dt;
      p.mesh.position.y += p.vy * dt; p.vy -= 10 * dt;
      p.mesh.rotation.x += dt * 3; p.mesh.rotation.z += dt * 2;
      p.mesh.scale.setScalar(Math.min(1, Math.max(0, p.life) * 3));
    }
    exhaustClock += dt;
    if (state.boosting && speed > 1 && exhaustClock > .09) {
      exhaustClock = 0;
      const p = particles[particleCursor++ % particles.length];
      p.life = .4; p.mesh.visible = true;
      p.mesh.position.set(state.x - Math.sin(state.angle || 0) * 1.25, .28, state.z + Math.cos(state.angle || 0) * 1.25);
      p.vx = (random() - .5) * .6; p.vz = (random() - .5) * .6; p.vy = .4;
    }
    sun.position.set(state.x - 28, 58, state.z + 24);
    sun.target.position.set(state.x, 0, state.z);
  }
  return { colliders, cameraColliders, rider, cargo, marker, update, burst };
}
