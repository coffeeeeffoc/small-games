import type { Vec3 } from '../core/types.ts';

/** Half-open cutting intervals in the manufacturing drawing's smallest unit. */
export interface BurrModel {
  length: number;
  cuts: readonly (readonly (readonly [Vec3, Vec3])[])[];
  placements: readonly { slot: number; permutation: Vec3; signs: Vec3 }[];
}

export const interlockBurr: BurrModel = {
  length: 12,
  cuts: [
    [
      [
        [4, 0, 1],
        [8, 2, 2],
      ],
    ],
    [
      [
        [4, 0, 1],
        [8, 2, 2],
      ],
    ],
    [
      [
        [4, 0, 1],
        [8, 2, 2],
      ],
      [
        [5, 0, 0],
        [7, 1, 1],
      ],
    ],
    [
      [
        [4, 0, 1],
        [8, 2, 2],
      ],
      [
        [5, 0, 0],
        [7, 1, 1],
      ],
    ],
    [
      [
        [4, 0, 1],
        [5, 2, 2],
      ],
      [
        [7, 0, 1],
        [8, 2, 2],
      ],
    ],
    [],
  ],
  placements: [
    { slot: 2, permutation: [1, 0, 2], signs: [1, -1, 1] },
    { slot: 3, permutation: [1, 0, 2], signs: [1, 1, -1] },
    { slot: 4, permutation: [2, 1, 0], signs: [1, 1, -1] },
    { slot: 5, permutation: [2, 1, 0], signs: [-1, 1, 1] },
    { slot: 1, permutation: [0, 2, 1], signs: [1, -1, 1] },
    { slot: 0, permutation: [0, 2, 1], signs: [1, 1, -1] },
  ],
};

export const solidBurr: BurrModel = {
  length: 12,
  cuts: [
    [
      [
        [5, 0, 0],
        [8, 1, 2],
      ],
      [
        [5, 1, 0],
        [7, 2, 1],
      ],
    ],
    [
      [
        [5, 0, 1],
        [7, 2, 2],
      ],
      [
        [7, 0, 0],
        [8, 1, 2],
      ],
    ],
    [
      [
        [4, 0, 1],
        [8, 2, 2],
      ],
      [
        [5, 0, 0],
        [7, 1, 1],
      ],
    ],
    [
      [
        [4, 0, 1],
        [8, 2, 2],
      ],
    ],
    [
      [
        [4, 0, 1],
        [5, 2, 2],
      ],
      [
        [7, 0, 1],
        [8, 2, 2],
      ],
      [
        [5, 0, 0],
        [7, 1, 2],
      ],
    ],
    [],
  ],
  placements: [
    { slot: 3, permutation: [2, 0, 1], signs: [-1, -1, 1] },
    { slot: 5, permutation: [1, 2, 0], signs: [1, -1, -1] },
    { slot: 1, permutation: [0, 2, 1], signs: [-1, -1, -1] },
    { slot: 2, permutation: [1, 0, 2], signs: [1, -1, 1] },
    { slot: 4, permutation: [2, 1, 0], signs: [1, 1, -1] },
    { slot: 0, permutation: [0, 2, 1], signs: [1, 1, -1] },
  ],
};

export const simpleBurr: BurrModel = {
  length: 6,
  cuts: [
    [
      [
        [1, 0, 1],
        [3, 2, 2],
      ],
      [
        [4, 0, 1],
        [5, 2, 2],
      ],
    ],
    [
      [
        [1, 0, 1],
        [5, 2, 2],
      ],
      [
        [3, 0, 0],
        [4, 1, 1],
      ],
    ],
    [
      [
        [2, 0, 1],
        [4, 2, 2],
      ],
      [
        [3, 0, 0],
        [5, 1, 2],
      ],
    ],
    [
      [
        [3, 0, 1],
        [5, 2, 2],
      ],
      [
        [1, 0, 1],
        [4, 1, 2],
      ],
      [
        [2, 0, 0],
        [4, 1, 1],
      ],
    ],
    [
      [
        [1, 0, 1],
        [5, 2, 2],
      ],
      [
        [2, 0, 0],
        [4, 1, 1],
      ],
    ],
    [],
  ],
  placements: [
    { slot: 2, permutation: [1, 0, 2], signs: [-1, 1, 1] },
    { slot: 1, permutation: [0, 2, 1], signs: [-1, -1, -1] },
    { slot: 5, permutation: [1, 2, 0], signs: [1, -1, -1] },
    { slot: 3, permutation: [1, 0, 2], signs: [-1, -1, -1] },
    { slot: 4, permutation: [2, 1, 0], signs: [1, 1, -1] },
    { slot: 0, permutation: [0, 2, 1], signs: [1, 1, -1] },
  ],
};
