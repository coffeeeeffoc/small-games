/** Game-owned content schema, version 1. Coordinates are X/Y horizontal and Z up. */
export const SHAPES = [
  {
    id: 'line',
    name: '长桥',
    color: '#63e7ff',
    cells: [
      [-1, 0, 0],
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ],
  },
  {
    id: 'square',
    name: '方庭',
    color: '#ffe08a',
    cells: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  },
  {
    id: 'elbow',
    name: '折角',
    color: '#ffae7a',
    cells: [
      [-1, 0, 0],
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
    ],
  },
  {
    id: 'tee',
    name: '三岔',
    color: '#c3a5ff',
    cells: [
      [-1, 0, 0],
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ],
  },
  {
    id: 'step',
    name: '阶梯',
    color: '#7cf0bf',
    cells: [
      [-1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  },
  {
    id: 'tripod',
    name: '星核',
    color: '#ff86ba',
    cells: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
  },
  {
    id: 'twist',
    name: '旋阶',
    color: '#92b5ff',
    cells: [
      [-1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [0, 1, 1],
    ],
  },
  {
    id: 'helix',
    name: '回旋',
    color: '#f9a1e3',
    cells: [
      [-1, 0, 1],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
  },
];

export const DIRECTIONS = [
  { axis: 2, sign: -1, label: '向下', short: 'Z−', vector: [0, 0, -1] },
  { axis: 2, sign: 1, label: '向上', short: 'Z+', vector: [0, 0, 1] },
  { axis: 0, sign: -1, label: '向左', short: 'X−', vector: [-1, 0, 0] },
  { axis: 0, sign: 1, label: '向右', short: 'X+', vector: [1, 0, 0] },
  { axis: 1, sign: -1, label: '向前', short: 'Y−', vector: [0, -1, 0] },
  { axis: 1, sign: 1, label: '向后', short: 'Y+', vector: [0, 1, 0] },
];

export const DEFAULT_CONFIG = {
  version: 1,
  id: 'classic',
  name: '经典无尽',
  dims: [5, 5, 10],
  shapes: SHAPES,
  previewCount: 3,
  initialGravity: { axis: 2, sign: -1 },
  fallInterval: 1600,
  minFallInterval: 400,
  speedEvery: 8,
  speedStep: 80,
  points: { cell: 5, drop: 2, plane: 250 },
};

export function validateConfig(config) {
  const errors = [];
  if (!config || config.version !== 1) return ['Unsupported tetracube configuration version.'];
  if (
    !Array.isArray(config.dims) ||
    config.dims.length !== 3 ||
    config.dims.some((v) => !Number.isInteger(v) || v < 4 || v > 20)
  )
    errors.push('Container dimensions must be three integers between 4 and 20.');
  if (!Number.isInteger(config.previewCount) || config.previewCount < 1 || config.previewCount > 5)
    errors.push('previewCount must be between 1 and 5.');
  if (
    ![0, 1, 2].includes(config.initialGravity?.axis) ||
    ![-1, 1].includes(config.initialGravity?.sign)
  )
    errors.push('Invalid initial gravity.');
  for (const field of ['fallInterval', 'minFallInterval', 'speedEvery', 'speedStep']) {
    if (!Number.isFinite(config[field]) || config[field] <= 0) errors.push(`Invalid ${field}.`);
  }
  if (config.minFallInterval > config.fallInterval)
    errors.push('Minimum interval exceeds starting interval.');
  for (const field of ['cell', 'drop', 'plane']) {
    if (!Number.isFinite(config.points?.[field]) || config.points[field] < 0)
      errors.push(`Invalid points.${field}.`);
  }
  const ids = new Set();
  if (!Array.isArray(config.shapes) || !config.shapes.length)
    errors.push('At least one shape is required.');
  else
    for (const shape of config.shapes) {
      if (typeof shape?.id !== 'string' || !shape.id || ids.has(shape.id))
        errors.push('Shape ids must be unique nonempty strings.');
      ids.add(shape?.id);
      if (typeof shape?.name !== 'string' || !/^#[a-f0-9]{6}$/i.test(shape?.color ?? ''))
        errors.push('Shapes need a name and six-digit color.');
      if (
        !Array.isArray(shape?.cells) ||
        shape.cells.length !== 4 ||
        shape.cells.some(
          (c) =>
            !Array.isArray(c) ||
            c.length !== 3 ||
            c.some((v) => !Number.isInteger(v) || Math.abs(v) > 3),
        ) ||
        new Set(shape.cells.map((c) => c.join(','))).size !== 4
      ) {
        errors.push('A tetracube must contain four distinct integer cells.');
        continue;
      }
      const connected = new Set([0]);
      for (let step = 0; step < 4; step++)
        shape.cells.forEach((cell, i) => {
          if (
            shape.cells.some(
              (other, j) =>
                connected.has(j) &&
                other.reduce((sum, v, axis) => sum + Math.abs(v - cell[axis]), 0) === 1,
            )
          )
            connected.add(i);
        });
      if (connected.size !== 4) errors.push(`Shape ${shape.id} is disconnected.`);
    }
  return errors;
}

export function migrateConfig(config) {
  // Version 1 is the first published configuration; unknown versions never silently reset.
  const errors = validateConfig(config);
  if (errors.length) throw new Error(errors.join(' '));
  return structuredClone(config);
}
