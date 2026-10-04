/**
 * Assembled occupancy transcribed from the linked public solution pages.
 * A/B/C/D identify physical pieces; each string is one Z layer, with Y rows.
 * These are different interlocks, not reskins of the same cube partition.
 */
export interface AssembledModel {
  layers: readonly string[];
  /** Source voxel edge length in scene units. */
  unit: number;
}

// https://www.puzzlewillbeplayed.com/333/Min333/1/solution.html
export const min333: AssembledModel = {
  unit: 1,
  layers: ['BCC\nACA\nCCB', 'BBC\nABA\nCBB', 'BAA\nAAA\nCCB'],
};

// https://www.puzzlewillbeplayed.com/333/ThreeEasyPieces/solution.html
export const threeEasyPieces: AssembledModel = {
  unit: 1,
  layers: ['BBA\nBAA\nCAB', 'CBA\nCAB\nCCB', 'ABB\nAAB\nACC'],
};

// https://www.puzzlewillbeplayed.com/333/BasicCubeForBeginners/solution.html
export const beginnerCube: AssembledModel = {
  unit: 1,
  layers: ['BBB\nAAC\nBAC', 'BCB\nBDB\nBAC', 'ACC\nADC\nAAC'],
};

// https://www.puzzlewillbeplayed.com/333/TomsLittleBox/solution.html
export const tomsLittleBox: AssembledModel = {
  unit: 1,
  layers: ['ABA\nABA\nAAA', 'ABB\nA.C\nCCC', 'AAB\nCCB\nCBB'],
};

// https://www.puzzlewillbeplayed.com/Misc/IntricatePuzzle/solution.html
export const intricatePuzzle: AssembledModel = {
  unit: 0.5,
  layers: [
    '........\n.AAAAAA.\n.AAAAAA.\n.AAAAAA.\n.AAAAAA.\n.AAAAAA.\n.AAAAAA.\n........',
    '.AAAAAA.\nAAAAAAAA\nAAAAAAAA\nAAAAAAAA\nAAAAAAAA\nAAAAAAAA\nAAAAAAAA\n.AAAAAA.',
    '.BCCCCB.\nBBCCCCBB\nBBCCCCBB\nBBCCCCBB\nBBCCCCBB\nBBCCCCBB\nBBCCAABB\n.BCCCCB.',
    '.BCCCCB.\nBB....BB\nBB....BB\nBB....BB\nBBBBBBBB\nBBBBAABB\nBBAAAABB\n.BCCCCB.',
    '.BCCCCB.\nBB....BB\nBB....BB\nBB....BB\nBBBBBBBB\nBBBBAABB\nBBAAAABB\n.BCCCCB.',
    '.BCCCCB.\nBBCCCCBB\nBBCCCCBB\nBBCCCCBB\nBBCCCCBB\nBBAAAABB\nBBAAAABB\n.BCCCCB.',
    '.AAAAAA.\nAAAAAAAA\nAAAAAAAA\nAAAAAAAA\nAAAAAAAA\nAAAAAAAA\nAAAAAAAA\n.AAAAAA.',
    '........\n.AAAAAA.\n.AAAAAA.\n.AAAAAA.\n.AAAAAA.\n.AAAAAA.\n.AAAAAA.\n........',
  ],
};
