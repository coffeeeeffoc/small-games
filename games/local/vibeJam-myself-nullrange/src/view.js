import * as THREE from 'three';
import { terrainHeight } from './sim.js';

export function createView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setClearColor(0x09171e);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x10252c, 0.00115);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 2600);
  scene.add(new THREE.HemisphereLight(0xbbdfd4, 0x122c30, 2.7));
  const sun = new THREE.DirectionalLight(0xffc77a, 3.4);
  sun.position.set(-300, 300, -500);
  scene.add(sun);
  const amber = new THREE.MeshBasicMaterial({ color: 0xffb34c });
  const blue = new THREE.MeshBasicMaterial({ color: 0x8bf5df });
  const red = new THREE.MeshBasicMaterial({ color: 0xff6554 });
  const hullMaterial = new THREE.MeshStandardMaterial({ color: 0x526d68, metalness: 0.7, roughness: 0.47, flatShading: true });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x11232c, metalness: 0.55, roughness: 0.34 });

  // One recentered grid keeps terrain cost fixed even on long flights.
  const size = 2520, segments = 140, step = size / segments;
  const groundGeometry = new THREE.PlaneGeometry(size, size, segments, segments);
  groundGeometry.rotateX(-Math.PI / 2);
  const base = groundGeometry.attributes.position.array.slice();
  const ground = new THREE.Mesh(groundGeometry, new THREE.MeshBasicMaterial({ color: 0x10282e }));
  const wire = new THREE.Mesh(groundGeometry, new THREE.MeshBasicMaterial({ color: 0x39716c, wireframe: true, transparent: true, opacity: 0.48 }));
  wire.position.y = 0.12;
  scene.add(ground, wire);
  let gridX = Infinity, gridZ = Infinity;
  function terrain(x, z) {
    const gx = Math.round(x / step) * step, gz = Math.round(z / step) * step;
    if (gridX === gx && gridZ === gz) return;
    gridX = gx; gridZ = gz;
    const positions = groundGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++) positions.setY(i, terrainHeight(base[i * 3] + gx, base[i * 3 + 2] + gz));
    positions.needsUpdate = true;
    groundGeometry.computeBoundingSphere();
    ground.position.set(gx, 0, gz); wire.position.set(gx, 0.12, gz);
  }

  const skyGeometry = new THREE.SphereGeometry(2200, 24, 18);
  const sky = new THREE.Mesh(skyGeometry, new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec3 vPos; void main(){float h=normalize(vPos).y; vec3 c=mix(vec3(.11,.25,.27),vec3(.015,.043,.068),smoothstep(0.,.42,h));float glow=pow(max(0.,dot(normalize(vPos),normalize(vec3(-.45,.11,-.9)))),35.);c+=vec3(.36,.26,.13)*glow;gl_FragColor=vec4(c,1.);}',
  }));
  scene.add(sky);
  const starsArray = [];
  for (let i = 0; i < 360; i++) {
    const a = i * 2.39996, h = 0.13 + ((i * 37) % 100) / 120;
    starsArray.push(Math.cos(a) * 1800 * Math.sqrt(1 - h * h), h * 1800, Math.sin(a) * 1800 * Math.sqrt(1 - h * h));
  }
  const starsGeometry = new THREE.BufferGeometry();
  starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsArray, 3));
  const stars = new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color: 0xc0dbcd, size: 1.2, transparent: true, opacity: 0.64, fog: false }));
  scene.add(stars);
  const planet = new THREE.Mesh(new THREE.SphereGeometry(52, 32, 24), new THREE.MeshBasicMaterial({ color: 0xc0bc8c, fog: false }));
  scene.add(planet);
  const planetRing = new THREE.Mesh(new THREE.RingGeometry(56, 57, 64), new THREE.MeshBasicMaterial({ color: 0xaacac2, side: THREE.DoubleSide, transparent: true, opacity: 0.23, fog: false }));
  scene.add(planetRing);

  function ship(enemy = false) {
    const g = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    const vertices = [0,0,-13, -3,-1,5, 3,-1,5, 0,2,1, -15,-1,7, 15,-1,7, -4,0,1, 4,0,1, 0,-2,4];
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex([0,3,6,0,7,3,0,6,1,0,2,7,6,4,1,7,2,5,3,1,6,3,7,2,3,2,1,0,1,8,0,8,2,1,2,8]);
    geometry.computeVertexNormals();
    g.add(new THREE.Mesh(geometry, enemy ? darkMaterial : hullMaterial));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: enemy ? 0xff7763 : 0xd9b568, transparent: true, opacity: 0.8 })));
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.5, 6, 4), darkMaterial);
    canopy.rotation.x = -Math.PI / 2; canopy.position.set(0, 1.3, -3); g.add(canopy);
    const engine = new THREE.Group();
    for (const x of [-2, 2]) {
      const exhaust = new THREE.Mesh(new THREE.ConeGeometry(0.7, 8, 6), enemy ? red : blue);
      exhaust.rotation.x = Math.PI / 2; exhaust.position.set(x, 0, 8); engine.add(exhaust);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 7), enemy ? red : amber);
      stripe.position.set(x * 3.2, 0, 3); g.add(stripe);
    }
    g.add(engine); g.userData.engine = engine;
    if (enemy) g.scale.setScalar(0.78);
    return g;
  }
  const playerShip = ship(); scene.add(playerShip);
  const enemyMeshes = new Map(), shotMeshes = new Map(), pickupMeshes = new Map(), effectMeshes = new Map();
  const shotGeometry = new THREE.CylinderGeometry(0.45, 0.45, 10, 4);
  const missileGeometry = new THREE.ConeGeometry(0.9, 7, 5);
  const pickupGeometry = new THREE.OctahedronGeometry(3.1);
  const blastGeometry = new THREE.IcosahedronGeometry(1, 1);
  const beamAxis = new THREE.Vector3(0, 1, 0), velocity = new THREE.Vector3();
  const scanner = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 80), new THREE.MeshBasicMaterial({ color: 0x85e6d6, side: THREE.DoubleSide, transparent: true, opacity: 0.4, depthWrite: false }));
  scanner.rotation.x = -Math.PI / 2; scanner.visible = false; scene.add(scanner);
  let scanOrigin = new THREE.Vector3(), previousScan = 0;
  const markers = new THREE.Group();
  for (let i = 0; i < 18; i++) {
    const tower = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.7, 38, 4), new THREE.MeshBasicMaterial({ color: 0x386360 }));
    mast.position.y = 19; tower.add(mast);
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(1.6), amber); beacon.position.y = 40; tower.add(beacon);
    const ring = new THREE.Mesh(new THREE.RingGeometry(10, 10.5, 24), new THREE.MeshBasicMaterial({ color: 0x568175, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; tower.add(ring);
    tower.userData.offset = { x: Math.sin(i * 9.3) * 1100, z: Math.cos(i * 4.7) * 1100 };
    markers.add(tower);
  }
  scene.add(markers);

  function sync(map, items, make, update) {
    const ids = new Set();
    for (const item of items) {
      ids.add(item.id);
      let mesh = map.get(item.id);
      if (!mesh) { mesh = make(item); map.set(item.id, mesh); scene.add(mesh); }
      mesh.position.set(item.x, item.y, item.z); update(mesh, item);
    }
    for (const [id, mesh] of map) if (!ids.has(id)) {
      scene.remove(mesh); map.delete(id);
      if (mesh.userData.disposable) mesh.material.dispose();
      if (mesh.userData.engine) mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.isLineSegments) child.material.dispose();
      });
    }
  }
  let width = 0, height = 0, cockpit = false;
  function resize() {
    width = innerWidth; height = innerHeight;
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();
  const forward = new THREE.Vector3(), playerPosition = new THREE.Vector3(), desiredCamera = new THREE.Vector3(), look = new THREE.Vector3();
  function render(s, dt, elapsed) {
    const p = s.player, menu = s.mode === 'menu';
    terrain(p.x, p.z);
    playerPosition.set(p.x, p.y, p.z);
    forward.set(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch));
    playerShip.position.copy(playerPosition); playerShip.rotation.set(p.pitch, p.yaw, p.roll, 'YXZ');
    playerShip.visible = menu || !cockpit;
    playerShip.userData.engine.scale.z = (s._boosting ? 2.6 : 1) * (1 + Math.sin(elapsed * 43) * 0.13);
    if (menu) {
      playerShip.position.y += Math.sin(elapsed * 0.7) * 1.3;
      playerShip.rotation.set(0.05, -0.35 + Math.sin(elapsed * 0.1) * 0.1, -0.09);
      const portrait = width < height;
      desiredCamera.set(p.x + (portrait ? 34 : 34), p.y + (portrait ? 17 : 15), p.z + (portrait ? 54 : 46));
      look.set(p.x + (portrait ? 0 : -12), p.y + (portrait ? -12 : 1), p.z - 4);
      camera.position.copy(desiredCamera); camera.lookAt(look);
    } else {
      desiredCamera.copy(playerPosition).addScaledVector(forward, cockpit ? 3 : width < height ? -65 : -29);
      desiredCamera.y += cockpit ? 2 : width < height ? 14 : 8;
      camera.position.lerp(desiredCamera, Math.min(1, dt * 12));
      look.copy(playerPosition).addScaledVector(forward, 200);
      look.y += cockpit ? 2 : 1;
      camera.lookAt(look); camera.rotateZ(p.roll * (cockpit ? 0.34 : 0.11));
    }
    const fov = s._boosting ? 72 : 62;
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();
    sky.position.copy(camera.position); stars.position.copy(camera.position);
    planet.position.copy(camera.position).add(new THREE.Vector3(-770, 240, -1750));
    planetRing.position.copy(planet.position); planetRing.lookAt(camera.position);
    for (const marker of markers.children) {
      const { x, z } = marker.userData.offset;
      const wx = Math.floor(p.x / 1800) * 1800 + x, wz = Math.floor(p.z / 1800) * 1800 + z;
      marker.position.set(wx, terrainHeight(wx, wz), wz);
    }
    sync(enemyMeshes, menu ? [] : s.enemies, () => ship(true), (mesh, e) => { mesh.rotation.set(0, e.yaw, Math.sin(elapsed + e.id) * 0.15); });
    sync(shotMeshes, s.shots, b => new THREE.Mesh(b.kind === 'missile' ? missileGeometry : shotGeometry, b.owner === 'enemy' ? red : b.kind === 'missile' ? amber : blue), (mesh, b) => { velocity.set(b.vx, b.vy, b.vz).normalize(); mesh.quaternion.setFromUnitVectors(beamAxis, velocity); });
    sync(pickupMeshes, s.pickups, () => new THREE.Mesh(pickupGeometry, blue), mesh => { mesh.rotation.set(elapsed, elapsed * 0.4, elapsed); });
    sync(effectMeshes, s.effects, e => {
      const mesh = new THREE.Mesh(blastGeometry, new THREE.MeshBasicMaterial({ color: e.kind === 'pickup' ? 0x8bf5df : 0xffaa51, transparent: true, wireframe: true, depthWrite: false }));
      mesh.userData.disposable = true; return mesh;
    }, (mesh, e) => { const t = 1 - e.life / e.maxLife; mesh.scale.setScalar((e.kind === 'explosion' ? 40 : 16) * t + 1); mesh.rotation.set(t * 3, t * 4, t); mesh.material.opacity = 1 - t; });
    if (s.scanTime > previousScan) scanOrigin.copy(playerPosition);
    previousScan = s.scanTime;
    scanner.visible = s.scanTime > 0;
    if (scanner.visible) { scanner.position.copy(scanOrigin); scanner.position.y = terrainHeight(scanOrigin.x, scanOrigin.z) + 2; scanner.scale.setScalar((6 - s.scanTime) * 180 + 10); scanner.material.opacity = s.scanTime / 12; }
    renderer.render(scene, camera);
  }
  function project(point) {
    const v = new THREE.Vector3(point.x, point.y, point.z).project(camera);
    return { x: (v.x * 0.5 + 0.5) * width, y: (-v.y * 0.5 + 0.5) * height, visible: v.z > -1 && v.z < 1 && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.88 };
  }
  return { render, project, toggleCamera() { cockpit = !cockpit; return cockpit; }, getStats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries }) };
}
