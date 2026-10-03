/** Shared six-face spatial model. Every gate opening comes from geometry.mjs. */
import { BOX_HALF, FACE_IDS, FACE_DEFS, facePoint } from './faces.mjs';
import { BALL_RADIUS, SHAFT_TRAVEL, getGateGeometry, getShaftGeometry } from './geometry.mjs';

const add = (a, b) => a.map((value, index) => value + b[index]);
const mul = (a, value) => a.map((part) => part * value);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (v) => mul(v, 1 / (Math.hypot(...v) || 1));
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const COLORS = {
  front: '#d7b573',
  back: '#7ab5a3',
  left: '#a6b987',
  right: '#d5937d',
  top: '#94b6b9',
  bottom: '#bca1ba',
};
export const STRUCTURE = Object.freeze({ half: BOX_HALF, channelCount: 1 });

/** Rail bodies stop before a moving plate; only the ball-center route continues. */
export function splitRailAtPlates(start, end, plates, railRadius = 1.8, margin = 2) {
  const delta = end.map((value, i) => value - start[i]);
  let intervals = [[0, 1]];
  for (const plate of plates) {
    const clearance = plate.thickness / 2 + railRadius + margin;
    const distance = dot(
      start.map((value, i) => value - plate.baseCenter[i]),
      plate.normal,
    );
    const change = dot(delta, plate.normal);
    if (Math.abs(change) < 1e-9) {
      if (Math.abs(distance) < clearance) return [];
      continue;
    }
    const [enter, leave] = [(-clearance - distance) / change, (clearance - distance) / change].sort(
      (a, b) => a - b,
    );
    intervals = intervals.flatMap(([from, to]) => {
      if (to <= enter || from >= leave) return [[from, to]];
      const remaining = [];
      if (from < enter) remaining.push([from, Math.min(to, enter)]);
      if (to > leave) remaining.push([Math.max(from, leave), to]);
      return remaining;
    });
  }
  return intervals
    .filter(([from, to]) => to - from > 1e-8)
    .map(([from, to]) => [add(start, mul(delta, from)), add(start, mul(delta, to))]);
}

/** Produces world-coordinate primitives and input targets without mutating rules. */
export function buildStructureModel(
  level,
  snapshot,
  ball,
  { xray = true, exploded = false, mode = 'structure', face = snapshot.side } = {},
) {
  const items = [];
  const controls = [];
  const state = {
    ...snapshot,
    shafts: Object.fromEntries(snapshot.shafts.map((shaft) => [shaft.id, shaft.value])),
    latches: Object.fromEntries(snapshot.latches.map((latch) => [latch.id, latch.engaged])),
  };
  const activeShafts = snapshot.shafts.filter((shaft) => mode !== 'face' || shaft.face === face);
  const shaftIds = new Set(activeShafts.map((shaft) => shaft.id));
  // Every window observes the same plates. Ownership limits controls, not optics.
  const activeGates = snapshot.gates;
  const activeLatches = snapshot.latches.filter((latch) => mode !== 'face' || latch.face === face);
  const polygon = (points, fill, options = {}) =>
    items.push({ type: 'polygon', points, fill, stroke: '#c3b68d', ...options });
  const line = (points, stroke, options = {}) =>
    items.push({ type: 'line', points, stroke, width: 1.2, ...options });
  const label = (point, text, color = '#eee4c9', options = {}) =>
    items.push({ type: 'label', points: [point], text, color, ...options });
  const sphere = (point, radius, fill, options = {}) =>
    items.push({ type: 'sphere', points: [point], radius, fill, ...options });
  function block(
    center,
    size,
    fill,
    options = {},
    basis = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
  ) {
    const vertices = [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ].map((signs) =>
      signs.reduce((point, sign, i) => add(point, mul(basis[i], (sign * size[i]) / 2)), center),
    );
    [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [3, 7, 6, 2],
      [0, 4, 7, 3],
      [1, 2, 6, 5],
    ].forEach((indices, i) =>
      polygon(
        indices.map((index) => vertices[index]),
        fill,
        { shade: [0.6, 1, 0.63, 0.94, 0.77, 0.84][i], ...options },
      ),
    );
  }
  function rod(start, end, radius, fill, options = {}) {
    const delta = end.map((value, i) => value - start[i]);
    if (Math.hypot(...delta) < 0.001) return;
    const axis = normalize(delta);
    const u = normalize(cross(axis, Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]));
    const v = cross(axis, u);
    const rings = [start, end].map((point) =>
      Array.from({ length: 8 }, (_, i) =>
        add(
          point,
          add(
            mul(u, Math.cos((i * Math.PI) / 4) * radius),
            mul(v, Math.sin((i * Math.PI) / 4) * radius),
          ),
        ),
      ),
    );
    for (let i = 0; i < 8; i++)
      polygon([rings[0][i], rings[0][(i + 1) % 8], rings[1][(i + 1) % 8], rings[1][i]], fill, {
        shade: 0.65 + Math.abs(Math.cos((i * Math.PI) / 4)) * 0.35,
        ...options,
      });
    polygon(rings[0], fill, options);
    polygon(rings[1], fill, options);
  }
  const expansion = (owner) =>
    mode === 'structure' && exploded ? mul(FACE_DEFS[owner].normal, 115) : [0, 0, 0];
  const surfacePoint = (owner, anchor, depth = BOX_HALF + 13) =>
    add(facePoint(owner, anchor[0], anchor[1], depth), expansion(owner));

  // Six opposing surfaces are actual faces of a single cube, not six diagrams.
  for (const owner of mode === 'face' ? [face] : FACE_IDS) {
    const firstExteriorItem = items.length;
    const depth = BOX_HALF + (mode === 'structure' && exploded ? 115 : 0);
    const border = BOX_HALF - 6;
    const corners = [
      [-border, -border],
      [border, -border],
      [border, border],
      [-border, border],
    ].map(([u, v]) => facePoint(owner, u, v, depth));
    polygon(corners, '#516956', {
      alpha: mode === 'face' ? 0.045 : xray ? 0.065 : 1,
      stroke: COLORS[owner],
      shell: true,
    });
    corners.forEach((point, i) =>
      rod(point, corners[(i + 1) % 4], 4, COLORS[owner], {
        alpha: mode === 'face' || !xray ? 1 : 0.65,
      }),
    );
    if (mode === 'structure') {
      label(facePoint(owner, -165, 216, depth + 8), FACE_DEFS[owner].label, COLORS[owner], {
        face: owner,
        size: 12,
        pill: true,
      });
      if (exploded)
        corners.forEach((point, i) =>
          line(
            [
              point,
              facePoint(
                owner,
                ...[
                  [-border, -border],
                  [border, -border],
                  [border, border],
                  [-border, border],
                ][i],
                BOX_HALF,
              ),
            ],
            '#a7b99b',
            { dash: [3, 6], alpha: 0.35 },
          ),
        );
    }
    for (const item of items.slice(firstExteriorItem)) item.exteriorFace = owner;
  }

  // One world-space channel. Its six views all project this exact polyline.
  const ballRadius = level.ballRadius ?? BALL_RADIUS;
  const channelRadius = ballRadius + 4;
  const plates = level.gates.map((gate) => getGateGeometry(level, state, gate));
  level.path.slice(1).forEach((end, index) => {
    const start = level.path[index];
    const axis = normalize(end.map((value, i) => value - start[i]));
    const across = normalize(cross(axis, Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]));
    const up = cross(axis, across);
    const length = Math.hypot(...end.map((value, i) => value - start[i]));
    const center = end.map((value, i) => (value + start[i]) / 2);
    // Thin open rails expose the ball from every side, unlike an opaque tube.
    for (const offset of [-channelRadius, channelRadius]) {
      const rail = mul(across, offset);
      for (const [railStart, railEnd] of splitRailAtPlates(
        add(start, rail),
        add(end, rail),
        plates,
      )) {
        rod(railStart, railEnd, 1.8, '#849b72', {
          stroke: '#acb99a',
          alpha: mode === 'face' ? 0.62 : 0.85,
          rail: true,
        });
      }
    }
    if (length > 0)
      line([add(center, mul(up, -channelRadius)), add(center, mul(up, channelRadius))], '#718b68', {
        alpha: 0.3,
      });
    line([start, end], '#d2c89c', { dash: [3, 7], width: 1, alpha: 0.35 });
  });
  sphere(level.path[0], ballRadius + 4, '#907f51', { alpha: 0.65 });
  sphere(level.path.at(-1), ballRadius + 5, '#80af87', { alpha: 0.75 });

  const shaftGeometry = new Map();
  for (const shaft of activeShafts) {
    const firstExteriorItem = items.length;
    const geometry = getShaftGeometry(level, state, shaft);
    shaftGeometry.set(shaft.id, geometry);
    const basis = FACE_DEFS[shaft.face];
    const normal = basis.normal;
    const offset = add(mul(normal, 14), expansion(shaft.face));
    const handle = add(geometry.handle, offset);
    const start = add(geometry.railStart, offset);
    const end = add(geometry.railEnd, offset);
    const color = shaft.color ?? COLORS[shaft.face];
    rod(start, end, 5, '#827546', { stroke: '#c1b083' });
    const notches = [];
    for (let value = shaft.min; value <= shaft.max; value++) {
      const point = add(add(geometry.base, mul(geometry.slideAxis, value * SHAFT_TRAVEL)), offset);
      notches.push({ value, point });
      rod(add(point, mul(basis.u, -14)), add(point, mul(basis.u, 14)), 2, color);
      label(
        add(point, mul(basis.u, 32)),
        shaft.notches?.[value - shaft.min] ??
          ['低', '中', '高'][value - shaft.min] ??
          String(value),
        '#c8c5a4',
        { face: shaft.face, size: 10 },
      );
    }
    block(add(handle, mul(normal, 6)), [38, 29, 12], color, { stroke: '#f0d49c' }, [
      basis.u,
      basis.v,
      normal,
    ]);
    for (const offsetY of [-5, 0, 5])
      line(
        [
          add(add(handle, mul(basis.u, -9)), add(mul(basis.v, offsetY), mul(normal, 13))),
          add(add(handle, mul(basis.u, 9)), add(mul(basis.v, offsetY), mul(normal, 13))),
        ],
        '#685d3f',
      );
    label(add(end, mul(geometry.slideAxis, 32)), `${shaft.id} 轴`, color, {
      face: shaft.face,
      size: 12,
      pill: true,
    });
    if (shaft.locked) sphere(add(handle, add(mul(basis.u, 20), mul(normal, 15))), 5, '#dd947a');
    for (const item of items.slice(firstExteriorItem)) item.exteriorFace = shaft.face;
    controls.push({
      type: 'shaft',
      id: shaft.id,
      face: shaft.face,
      value: shaft.value,
      min: shaft.min,
      max: shaft.max,
      locked: shaft.locked,
      handle,
      base: add(geometry.railStart, offset),
      slideAxis: [...geometry.slideAxis],
      notches,
    });
  }

  for (const gate of activeGates) {
    const geometry = getGateGeometry(level, state, gate);
    const ownerShaft = snapshot.shafts.find((shaft) => shaft.id === gate.shaft);
    const owner = ownerShaft.face;
    const associated = mode !== 'face' || shaftIds.has(gate.shaft);
    const color = associated ? (ownerShaft.color ?? COLORS[owner]) : '#7e927d';
    const normal = geometry.normal;
    const along = geometry.slideAxis;
    const halfThickness = geometry.thickness / 2;
    const across = normalize(cross(normal, along));
    const apertures =
      geometry.apertures ??
      geometry.holes.map((center) => ({ center, radius: gate.aperture.radius }));
    const holeRings = apertures.map(({ center, radius }) =>
      Array.from({ length: 24 }, (_, i) =>
        add(
          center,
          add(
            mul(along, Math.cos((i * Math.PI) / 12) * radius),
            mul(across, Math.sin((i * Math.PI) / 12) * radius),
          ),
        ),
      ),
    );
    // Both plate surfaces have actual empty holes. No boolean fake lift animation.
    for (const side of [-1, 1]) {
      const offset = mul(normal, side * halfThickness);
      polygon(
        geometry.corners.map((point) => add(point, offset)),
        color,
        {
          holes: holeRings.map((ring) => ring.map((point) => add(point, offset))),
          shade: side > 0 ? 1 : 0.75,
          stroke: '#dbcc9c',
          gate: gate.id,
        },
      );
    }
    geometry.corners.forEach((point, i) =>
      polygon(
        [
          add(point, mul(normal, -halfThickness)),
          add(geometry.corners[(i + 1) % 4], mul(normal, -halfThickness)),
          add(geometry.corners[(i + 1) % 4], mul(normal, halfThickness)),
          add(point, mul(normal, halfThickness)),
        ],
        color,
        { shade: 0.65, stroke: color },
      ),
    );
    holeRings.forEach((ring) =>
      ring.forEach((point, i) =>
        polygon(
          [
            add(point, mul(normal, -halfThickness)),
            add(ring[(i + 1) % ring.length], mul(normal, -halfThickness)),
            add(ring[(i + 1) % ring.length], mul(normal, halfThickness)),
            add(point, mul(normal, halfThickness)),
          ],
          '#53715a',
          { stroke: '#e1c892', shade: 0.75 },
        ),
      ),
    );
    const shaft = shaftGeometry.get(gate.shaft);
    if (shaft) {
      line([shaft.handle, geometry.corners[0]], color, { width: 1.8, alpha: 0.72 });
      if (exploded && mode === 'structure')
        line([shaft.handle, add(shaft.handle, expansion(owner))], color, {
          dash: [3, 5],
          alpha: 0.6,
        });
    }
    const labelPoint = add(geometry.corners[1], mul(across, 15));
    if (associated)
      label(
        labelPoint,
        mode === 'face' ? `${gate.shaft} ${geometry.open ? '孔对齐' : '错孔'}` : gate.shaft,
        geometry.open ? '#a9cea5' : '#ddb294',
        { size: 10, pill: mode === 'face' },
      );
  }

  for (const latch of activeLatches) {
    const firstExteriorItem = items.length;
    const basis = FACE_DEFS[latch.face];
    const pivot = surfacePoint(latch.face, latch.anchor, BOX_HALF + 20);
    const color = latch.engaged ? '#d99c82' : '#a0c394';
    const end = add(
      pivot,
      add(mul(basis.u, latch.engaged ? -36 : -16), mul(basis.v, latch.engaged ? 0 : 34)),
    );
    rod(pivot, end, 7, color, { stroke: '#ddc796' });
    sphere(pivot, 10, '#c7a773');
    label(add(pivot, mul(basis.v, -27)), `${latch.shaft} ${latch.engaged ? '锁' : '松'}`, color, {
      face: latch.face,
      size: 11,
      pill: true,
    });
    if (mode === 'structure') {
      const target = snapshot.shafts.find((shaft) => shaft.id === latch.shaft);
      if (target) {
        const targetGeometry = getShaftGeometry(level, state, target);
        line([pivot, add(targetGeometry.handle, expansion(target.face))], color, {
          dash: [4, 6],
          alpha: 0.65,
          logical: true,
        });
      }
      for (const condition of latch.releaseWhen ?? []) {
        const source = snapshot.shafts.find((shaft) => shaft.id === condition.shaft);
        if (!source) continue;
        const sourceGeometry = getShaftGeometry(level, state, source);
        const aligned = condition.positions.includes(source.value);
        line(
          [add(sourceGeometry.handle, expansion(source.face)), pivot],
          aligned ? '#b2d2a7' : '#c48e76',
          { dash: [2, 7], alpha: 0.6, logical: true },
        );
      }
    }
    if (latch.releaseWhen?.length) {
      sphere(
        add(pivot, add(mul(basis.u, 17), mul(basis.v, 17))),
        4.5,
        latch.canRelease ? '#a7d3a0' : '#d18c72',
      );
      const condition = latch.releaseWhen
        .map(
          (item) =>
            `${item.shaft}·${item.positions.map((value) => ['低', '中', '高'][value] ?? value).join('/')}`,
        )
        .join(' ');
      if (mode === 'face')
        label(add(pivot, mul(basis.v, -45)), condition, '#aebc9c', { face: latch.face, size: 9 });
    }
    for (const item of items.slice(firstExteriorItem))
      if (!item.logical) item.exteriorFace = latch.face;
    controls.push({
      type: 'latch',
      id: latch.id,
      face: latch.face,
      point: pivot,
      engaged: latch.engaged,
      canRelease: latch.canRelease,
    });
  }

  const ballPoint = ball ?? level.path[snapshot.ballPathIndex] ?? level.path[0];
  sphere(ballPoint, ballRadius, '#f4b564', { ball: true });
  return {
    items,
    controls,
    counts: {
      shafts: activeShafts.length,
      gates: activeGates.length,
      latches: activeLatches.length,
      channels: 1,
      closedGates: activeGates.filter((gate) => !getGateGeometry(level, state, gate).open).length,
      lockedShafts: activeShafts.filter((shaft) => shaft.locked).length,
    },
    faces: mode === 'face' ? [face] : [...FACE_IDS],
    ball: [...ballPoint],
  };
}
