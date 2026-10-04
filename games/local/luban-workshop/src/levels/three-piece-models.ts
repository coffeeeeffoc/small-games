import type { Vec3 } from '../core/types.ts';

/** Layers copied as mathematical occupancy data; artwork is not bundled. */
export interface ThreePieceModel {
  layers: readonly string[];
  permutation: Vec3;
  signs: Vec3;
  offset: Vec3;
}

export const knoxli: readonly ThreePieceModel[] = [
  {
    layers: [
      `......
......
.####.
.####.`,
      `..##..
..##..
.####.
.#..#.`,
      `..##..
....##
.#..##
......`,
      `......
....##
.##.##
......`,
    ],
    permutation: [0, 1, 2],
    signs: [-1, -1, 1],
    offset: [2, 2, -3],
  },
  {
    layers: [
      `......
..##..
..##..
..##..
..##..`,
      `......
..##..
##....
##....
..##..`,
      `.##...
.##...
##.#..
#.....
......`,
      `.##...
.##...
..##..
..#...
......`,
    ],
    permutation: [2, 1, 0],
    signs: [-1, -1, -1],
    offset: [2, 2, 2],
  },
  {
    layers: [
      `......
.####.
.####.
......
......`,
      `......
.####.
.####.
..##..
..##..`,
      `..##..
.#.##.
##.#..
####..
..##..`,
      `......
......
##....
##....
......`,
    ],
    permutation: [1, 2, 0],
    signs: [-1, 1, -1],
    offset: [1, -3, 2],
  },
];

export const crystalBall: readonly ThreePieceModel[] = [
  {
    layers: [
      `.###.
##.##
.#...`,
      `#...#
#..##
###.#`,
      `.....
#...#
.....`,
    ],
    permutation: [0, 1, 2],
    signs: [-1, -1, 1],
    offset: [2, 1, -1],
  },
  {
    layers: [
      `.....
#####
.#.#.`,
      `#..##
#.###
#...#`,
      `.....
#...#
.....`,
    ],
    permutation: [1, 0, 2],
    signs: [1, 1, -1],
    offset: [-1, -2, 1],
  },
  {
    layers: [
      `.###.
##..#
.#...`,
      `#..##
#..##
#...#`,
      `.....
#...#
.....`,
    ],
    permutation: [2, 1, 0],
    signs: [1, 1, -1],
    offset: [-1, -1, 2],
  },
];
