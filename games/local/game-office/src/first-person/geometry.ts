import { WORLD, type Box, type SceneState } from './model.js';

export type Point = [number, number, number];
export type Face = { points: Point[]; color: string; text?: string; textAnchor?: Point };
const shade = (hex: string, amount: number) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${[16, 8, 0].map((shift) => Math.min(255, Math.round(((value >> shift) & 255) * amount))).join(',')})`;
};

function cuboid(
  faces: Face[],
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color: string,
) {
  const a = x - w / 2,
    b = x + w / 2,
    c = z - d / 2,
    e = z + d / 2;
  const top = y + h;
  faces.push(
    {
      points: [
        [a, y, e],
        [b, y, e],
        [b, y, c],
        [a, y, c],
      ],
      color: shade(color, 0.82),
    },
    {
      points: [
        [a, y, c],
        [b, y, c],
        [b, top, c],
        [a, top, c],
      ],
      color: shade(color, 0.89),
    },
    {
      points: [
        [b, y, e],
        [a, y, e],
        [a, top, e],
        [b, top, e],
      ],
      color: shade(color, 0.77),
    },
    {
      points: [
        [a, y, e],
        [a, y, c],
        [a, top, c],
        [a, top, e],
      ],
      color: shade(color, 0.73),
    },
    {
      points: [
        [b, y, c],
        [b, y, e],
        [b, top, e],
        [b, top, c],
      ],
      color: shade(color, 0.96),
    },
    {
      points: [
        [a, top, c],
        [b, top, c],
        [b, top, e],
        [a, top, e],
      ],
      color: shade(color, 1.1),
    },
  );
}

function plant(faces: Face[], x: number, z: number) {
  cuboid(faces, x, 0, z, 0.46, 0.5, 0.46, '#ab9d87');
  cuboid(faces, x, 0.5, z, 0.08, 0.9, 0.08, '#625b43');
  for (let i = 0; i < 5; i++) {
    const angle = i * 2.4;
    cuboid(
      faces,
      x + Math.sin(angle) * 0.21,
      0.85 + i * 0.11,
      z + Math.cos(angle) * 0.21,
      0.38,
      0.12,
      0.3,
      i % 2 ? '#5b795d' : '#7b9871',
    );
  }
}

function furniture(faces: Face[], box: Box, state: SceneState) {
  const { x, z, w, d, h, kind } = box;
  if (kind === 'desk' || kind === 'computer') {
    cuboid(faces, x, 0, z, w, h - 0.1, d, '#7e8b7e');
    cuboid(faces, x, h - 0.1, z, w, 0.1, d, '#c6b69c');
    for (const side of [-1, 1])
      cuboid(faces, x + side * (w / 2 - 0.1), 0, z, 0.08, h - 0.1, d * 0.75, '#626e6d');
    cuboid(faces, x, h, z + d * 0.24, 0.09, 0.18, 0.09, '#293939');
    cuboid(faces, x, h + 0.15, z + d * 0.24, 0.73, 0.43, 0.07, '#273737');
    cuboid(
      faces,
      x,
      h + 0.19,
      z + d * 0.24 - 0.041,
      0.64,
      0.34,
      0.012,
      kind === 'computer' ? '#80bfb7' : '#758e94',
    );
    for (let i = 0; i < 4; i++)
      cuboid(
        faces,
        x - 0.12,
        h + 0.24 + i * 0.055,
        z + d * 0.24 - 0.05,
        0.32 + i * 0.03,
        0.012,
        0.01,
        '#c8d8cf',
      );
    cuboid(faces, x, h + 0.01, z - 0.17, 0.5, 0.025, 0.18, '#485451');
    cuboid(faces, x + 0.39, h, z - 0.08, 0.1, 0.15, 0.1, '#e8e0ce');
  } else if (kind === 'plant') {
    plant(faces, x, z);
  } else if (kind === 'screen') {
    cuboid(faces, x, 0, z, w, h, d, '#708c8a');
    cuboid(faces, x, h, z, w + 0.025, 0.035, d + 0.025, '#a8b6aa');
  } else if (kind === 'printer') {
    cuboid(faces, x, 0, z, w, h * 0.68, d, '#b6bdb6');
    cuboid(faces, x, h * 0.68, z, w * 0.92, h * 0.32, d * 0.92, '#d9dfd5');
    cuboid(faces, x, h * 0.78, z - d * 0.51, w * 0.65, 0.06, 0.07, '#263837');
    cuboid(faces, x, h + 0.02, z - 0.05, w * 0.6, 0.035, d * 0.56, '#f0ecd9');
    cuboid(faces, x + w * 0.29, h - 0.09, z - d * 0.49, 0.15, 0.065, 0.02, '#8acac0');
  } else if (kind === 'coffee') {
    cuboid(faces, x, 0, z, w, h - 0.25, d, '#a49d8e');
    cuboid(faces, x, h - 0.25, z, w * 0.7, 0.25, d * 0.7, '#314340');
    if (!state.coffeeTaken) cuboid(faces, x, h, z - 0.12, 0.13, 0.2, 0.13, '#efe7d2');
  } else {
    cuboid(faces, x, 0, z, w, h, d, kind === 'files' ? '#9a9c89' : '#829189');
    for (let i = 0.35; i < h; i += 0.4) {
      cuboid(faces, x, i, z - d / 2 - 0.008, w * 0.94, 0.018, 0.012, '#546760');
      cuboid(faces, x + 0.14, i - 0.15, z - d / 2 - 0.025, 0.2, 0.025, 0.03, '#c5cbba');
    }
    if (kind === 'files' && !state.holdingFile) {
      cuboid(faces, x, h, z, 0.5, 0.055, 0.36, '#eee7d4');
      cuboid(faces, x, h + 0.06, z, 0.5, 0.025, 0.36, '#bd7f48');
    }
  }
}

export function buildRoom(state: SceneState): Face[] {
  const faces: Face[] = [];
  for (let x = 0; x < WORLD.width; x += 1)
    for (let z = 0; z < WORLD.depth; z += 1) {
      faces.push({
        points: [
          [x, 0, z],
          [x + 1, 0, z],
          [x + 1, 0, z + 1],
          [x, 0, z + 1],
        ],
        color: (x + z) % 2 ? '#929d99' : '#98a29c',
      });
      if (x % 2 === 0 && z % 2 === 0)
        faces.push({
          points: [
            [x, 3.2, z],
            [x, 3.2, z + 2],
            [x + 2, 3.2, z + 2],
            [x + 2, 3.2, z],
          ],
          color: '#d5d8cd',
        });
    }
  for (let z = 0; z < 18; z += 2) {
    cuboid(faces, -0.06, 0, z + 1, 0.12, 3.2, 2, '#c4cbbc');
    cuboid(faces, 14.06, 0, z + 1, 0.12, 3.2, 2, '#d9dcd0');
    cuboid(faces, 13.97, 0.82, z + 1, 0.025, 1.92, 1.65, '#a3c4c6');
    cuboid(faces, 13.94, 0.8, z + 1, 0.055, 0.05, 1.8, '#edf0df');
    cuboid(faces, 13.93, 0.82, z + 1, 0.055, 1.92, 0.04, '#e1e6d9');
    // Distant city silhouettes remain behind the window frame.
    for (let i = 0; i < 3; i++)
      cuboid(faces, 13.95, 0.84, z + 0.42 + i * 0.48, 0.01, 0.44 + (i % 2) * 0.2, 0.3, '#8eabab');
    for (let x = 2; x < 14; x += 4) cuboid(faces, x, 3.1, z + 1, 1.3, 0.035, 0.22, '#f6f0d3');
  }
  for (let x = 0; x < 14; x += 2) {
    cuboid(faces, x + 1, 0, 18.06, 2, 3.2, 0.12, '#bcc6b8');
    cuboid(faces, x + 1, 0, -0.06, 2, 3.2, 0.12, '#aab9ad');
  }
  cuboid(faces, 1.5, 0, 0.025, 1.1, 2.45, 0.04, '#50645c');
  cuboid(faces, 1.5, 2.5, 0.06, 0.8, 0.22, 0.03, '#a6cab6');
  for (const box of state.objects) furniture(faces, box, state);
  // A few restrained architectural signs, in world space rather than pasted onto the camera.
  faces.push({
    points: [
      [8, 2.38, 17.97],
      [11, 2.38, 17.97],
      [11, 2.8, 17.97],
      [8, 2.8, 17.97],
    ],
    color: '#506961',
    text: 'WORK / 慢一点，也没关系',
    textAnchor: [9.5, 2.59, 17.97],
  });
  faces.push({
    points: [
      [0.031, 1.9, 4],
      [0.031, 1.9, 6],
      [0.031, 2.3, 6],
      [0.031, 2.3, 4],
    ],
    color: '#9a7350',
    text: '茶水间  →',
    textAnchor: [0.031, 2.1, 5],
  });
  const computer = state.objects.find((box) => box.kind === 'computer')!;
  cuboid(faces, computer.x, 0, computer.z - 0.8, 0.6, 0.008, 0.45, '#d5b178');
  return faces;
}

export function printerMesh(state: SceneState): Face[] {
  const printer = state.objects.find((box) => box.kind === 'printer');
  if (!printer || state.distractionLeft <= 0) return [];
  const faces: Face[] = [];
  for (const offset of [0, 0.8]) {
    const progress = ((12 - state.distractionLeft + offset) % 1.6) / 1.6;
    const y = printer.h * 0.8 - progress * 0.14;
    const z = printer.z - printer.d * 0.38 - progress * 0.6;
    cuboid(faces, printer.x, y, z, 0.48, 0.008, 0.4, '#f4edd6');
    for (const line of [-0.07, 0.02])
      cuboid(faces, printer.x, y + 0.008, z + line, 0.3, 0.002, 0.015, '#657970');
  }
  return faces;
}

export function bossMesh(state: SceneState): Face[] {
  const faces: Face[] = [];
  const stride = Math.sin(state.elapsed * 5) * 0.11;
  cuboid(faces, -0.14, 0, stride, 0.18, 0.85, 0.22, '#35494a');
  cuboid(faces, 0.14, 0, -stride, 0.18, 0.85, 0.22, '#35494a');
  cuboid(faces, 0, 0.8, 0, 0.56, 0.62, 0.3, '#64716d');
  cuboid(faces, 0, 1.42, 0, 0.13, 0.1, 0.12, '#c7a284');
  cuboid(faces, 0, 1.5, 0, 0.28, 0.29, 0.27, '#c6a589');
  cuboid(faces, 0, 1.73, -0.035, 0.3, 0.09, 0.23, '#424a42');
  cuboid(faces, 0, 1.63, 0.14, 0.3, 0.035, 0.025, '#374d48');
  for (const side of [-1, 1]) {
    cuboid(faces, side * 0.36, 0.85, side * stride, 0.13, 0.48, 0.16, '#64716d');
    cuboid(faces, side * 0.36, 0.75, side * stride, 0.12, 0.14, 0.13, '#c6a589');
  }
  cuboid(faces, 0, 1.12, 0.16, 0.055, 0.23, 0.016, '#b78d61');
  const sin = Math.sin(state.boss.yaw),
    cos = Math.cos(state.boss.yaw);
  for (const face of faces)
    face.points = face.points.map(([x, y, z]) => [
      state.boss.x + x * cos + z * sin,
      y,
      state.boss.z - x * sin + z * cos,
    ]);
  return faces;
}
