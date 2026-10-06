import * as T from 'three';
import { MeshKit } from './scene-mesh.js';
import { workingCrew } from './scene-crew.js';
import { groundHeight } from './scene-terrain.js';
export function foreground(k: MeshKit) {
  const g = new T.Group();
  for (let i = 0; i < 11; i++)
    k.box(g, -20 + (i - 5) * 0.85, 0.25, 17.5, 0.81, 0.25, 11, i % 2 ? '#b17d43' : '#a36e38', 0.08);
  for (const x of [-24, -16]) k.box(g, x, -0.05, 17.5, 0.55, 0.7, 12, '#8d6236', 0.08);
  workingCrew(k, g);
  for (let i = 0; i < 6; i++)
    k.box(
      g,
      -13.5 + (i - 2.5) * 0.82,
      0.25,
      17.5,
      0.78,
      0.25,
      10.5,
      i % 2 ? '#b17d43' : '#a36e38',
      0.08,
    );
  for (const [x, z] of [
    [-23, 17],
    [-17, 17],
    [-23, 24],
    [-17, 24],
    [-13.5, 13],
    [-13.5, 22],
  ]) {
    const bottom = groundHeight(x!, z!);
    k.box(g, x!, bottom / 2, z!, 0.65, -bottom + 0.5, 0.65, '#8d6236', 0.08);
    k.rock(g, x!, bottom + 0.12, z!, 0.65, '#938b73');
  }
  k.flag(g, -26, 0.3, 18, true, 1.8);
  for (let i = 0; i < 4; i++) {
    k.box(g, -26, 0.6, 19 + i * 1.4, 1.35, 1.3, 1.3, '#bda984', 0.08);
    if (i % 2) k.box(g, -26, 1.6, 19 + i * 1.4, 1.4, 0.7, 1.1, '#d4c19b', 0.08);
  }
  k.tree(g, -27.5, groundHeight(-27.5, 16), 16, 0.7);
  for (const [x, z] of [
    [-9.8, 17],
    [-9.8, 20],
  ]) {
    k.box(g, x!, 0.7, z!, 1.8, 1.25, 1.5, '#b17d43', 0.08);
    for (const dx of [-0.7, 0.7]) k.box(g, x! + dx, 0.8, z! + 0.78, 0.16, 1.3, 0.08, '#686b61');
  }
  for (let i = 0; i < 7; i++)
    k.sphere(g, -10.2 + (i % 3) * 0.42, 1.58 + Math.floor(i / 3) * 0.22, 20, 0.24, '#3c4240', 0.65);
  k.compact(g);
  return g;
}
