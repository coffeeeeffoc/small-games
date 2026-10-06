import * as T from 'three';
import { MeshKit } from './scene-mesh.js';
import { valleyDetails, distantRidges, riverCenter, riverSurface } from './scene-valley.js';
const noise = (x: number, z: number) =>
  Math.sin(x * 0.41 + z * 0.12) * Math.cos(z * 0.27 - x * 0.2);
export function groundHeight(x: number, z: number) {
  if (x > -11 && x < 35 && z > -20 && z < 48) return -0.12;
  if (x > -29 && x < -11 && z > 10 && z < 28) return -1.5 + noise(x, z) * 0.35;
  const river = Math.exp(-(((x - riverCenter(z)) / 11) ** 2));
  const hill = Math.max(0, -x - 42) * 0.19 + Math.max(0, -z - 34) * 0.16;
  const bank = -0.15 + hill + noise(x, z) * 2.5;
  return bank - river * Math.max(8, bank - riverSurface(z) + 1.2);
}
export function terrain(k: MeshKit) {
  const g = new T.Group();
  const geo = new T.PlaneGeometry(220, 260, 65, 70);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -45);
  const vertices = geo.getAttribute('position'),
    colors = [];
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i),
      z = vertices.getZ(i),
      y = groundHeight(x, z);
    vertices.setY(i, y);
    const color = new T.Color(y < -3 ? '#75816c' : noise(x * 2, z * 2) > 0 ? '#627145' : '#7b8050');
    color.multiplyScalar(0.9 + noise(x, z) * 0.08);
    colors.push(color.r, color.g, color.b);
  }
  geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: false });
  const earth = new T.Mesh(geo, mat);
  earth.receiveShadow = true;
  g.add(earth);
  // River is a recessed, separate surface, flowing through a physically lower valley.
  for (const [front, back, y] of [
    [55, -42, -5.6],
    [-42, -145, -1.2],
  ]) {
    const z = (front! + back!) / 2;
    const water = k.box(g, riverCenter(z), y!, z, 12, 0.12, front! - back!, '#72a7b2', 0);
    water.rotation.y = -Math.atan(0.19);
    (water.material as T.MeshStandardMaterial).roughness = 0.25;
    (water.material as T.MeshStandardMaterial).metalness = 0.15;
  }
  for (let i = 0; i < 26; i++) {
    const z = -130 + i * 7;
    k.box(
      g,
      riverCenter(z) + Math.sin(i) * 4,
      riverSurface(z) + 0.1,
      z,
      3 + (i % 4),
      0.015,
      0.16,
      '#c5dce0',
      0,
    );
  }
  // Road to the gate and through its opening. Foreground stones create visible scale falloff.
  k.box(g, 11.5, -0.035, 28, 7.2, 0.06, 29, '#baa478', 0);
  const bend = k.box(g, 15.75, -0.035, 9.75, 7.2, 0.06, 12.7, '#baa478', 0);
  bend.rotation.y = -Math.PI / 4;
  k.box(g, 20, -0.035, -8, 7.2, 0.06, 27, '#baa478', 0);
  for (let i = 0; i < 130; i++) {
    const z = -12 + i * 0.42,
      x = 11.5 + Math.min(8.5, Math.max(0, 14 - z)) + Math.sin(i * 13.7) * 3.1;
    k.rock(g, x, 0.03, z, 0.06 + (i % 5) * 0.03, i % 2 ? '#aa946e' : '#d0b98d');
  }
  for (let i = 0; i < 130; i++) {
    const x = -82 + ((i * 17.13) % 107),
      z = -113 + ((i * 21.91) % 145);
    if ((x > -10 && x < 28 && z > -24) || (x > -28 && x < 28 && z > 0)) continue;
    if (Math.abs(x - riverCenter(z)) < 10) continue;
    const y = groundHeight(x, z);
    k.tree(g, x, y, z, 0.55 + (i % 7) * 0.17);
  }
  for (let i = 0; i < 80; i++) {
    const x = -17 - (i % 4) * 2.8,
      z = -24 + Math.floor(i / 4) * 3;
    const y = groundHeight(x, z);
    k.rock(g, x, y, z, 1.6 + (i % 3), i % 2 ? '#9a9480' : '#aca491');
  }
  distantRidges(g);
  valleyDetails(k, g, groundHeight);
  bridge(k, g);
  const fallX = riverCenter(-42);
  const falls = k.box(g, fallX, -3.4, -42, 12, 4.4, 0.22, '#b5d8df', 0);
  (falls.material as T.MeshStandardMaterial).roughness = 0.3;
  for (let i = 0; i < 14; i++)
    k.box(g, fallX - 5.5 + i * 0.84, -3.2, -41.85, 0.2, 4.7 - (i % 3) * 0.3, 0.03, '#e1ece9', 0);
  for (let i = 0; i < 12; i++) k.sphere(g, fallX - 5.5 + i, -5.45, -41.5, 0.4, '#c5dce0');
  // A smaller original hilltop settlement layers the left valley behind the bridge.
  for (let i = 0; i < 12; i++) {
    const x = -40 + (i % 4) * 3.2,
      z = -110 - Math.floor(i / 4) * 4.2,
      y = groundHeight(x, z);
    k.box(g, x, y + 1.5, z, 2.2, 3, 2.3, '#d4c19b', 0.05);
    const roof = k.cylinder(g, x, y + 3.4, z, 0, 1.7, 1.9, '#a06a45');
    roof.rotation.y = i * 0.7;
  }
  for (const x of [-40, -26]) {
    const z = -122,
      y = groundHeight(x, z);
    k.box(g, x, y + 7, z, 3.8, 14, 3.8, '#cbb78e', 0.05);
    for (let i = 0; i < 3; i++)
      k.box(g, x - 1.3 + i * 1.3, y + 14.5, z + 1.8, 0.8, 1, 0.8, '#d5c29c', 0);
  }
  // Mossy foreground parapet and outcrops, leaving the path clear for the advancing squad.
  for (let i = 0; i < 9; i++) {
    k.rock(g, 0 + Math.sin(i) * 2, 0.3, 24 + i * 2, 1.4 + (i % 3) * 0.5);
    k.tree(g, -2 + Math.cos(i) * 2, 0, 23 + i * 2, 0.6);
  }
  for (let i = 0; i < 18; i++)
    k.rock(g, 18 + Math.sin(i * 2) * 2, 0.25, 20 + i * 1.5, 0.55, '#b1a27f');
  k.compact(g);
  return g;
}
function bridge(k: MeshKit, parent: T.Group) {
  const g = new T.Group();
  const shape = new T.Shape();
  shape.moveTo(-11, 0);
  shape.lineTo(-11, 8);
  shape.lineTo(11, 8);
  shape.lineTo(11, 0);
  shape.lineTo(7, 0);
  shape.quadraticCurveTo(0, 12, -7, 0);
  shape.lineTo(-11, 0);
  const arch = new T.ExtrudeGeometry(shape, {
    depth: 3,
    bevelEnabled: true,
    bevelSize: 0.1,
    bevelThickness: 0.1,
    bevelSegments: 1,
    steps: 1,
  });
  k.mesh(g, arch, '#baa98a', 0, -5.5, -1.5);
  k.box(g, 0, 2.8, 0, 23, 0.55, 4, '#cbb68e');
  for (let i = 0; i < 15; i++) {
    k.box(g, -11 + i * 1.55, 3.8, -1.6, 1.45, 1.8, 0.5, '#bdad8c');
    k.box(g, -11 + i * 1.55, 3.8, 1.6, 1.45, 1.8, 0.5, '#bdad8c');
  }
  g.position.set(riverCenter(-50), 0, -50);
  parent.add(g);
}
