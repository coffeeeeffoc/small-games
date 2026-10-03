// Pointer edits use the gesture's starting geometry so boundary constraints
// preserve the requested axis instead of sliding along a wall.
const MARGIN = 0.2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function movePanel(start, pointerStart, pointer, mode, room) {
  const angle = (start.angle * Math.PI) / 180;
  const halfX = (Math.abs(Math.cos(angle)) * start.length) / 2;
  const halfY = (Math.abs(Math.sin(angle)) * start.length) / 2;
  const bounds = {
    x: [MARGIN + halfX, room.width - MARGIN - halfX],
    y: [MARGIN + halfY, room.height - MARGIN - halfY],
  };
  const delta = { x: pointer.x - pointerStart.x, y: pointer.y - pointerStart.y };
  if (mode === 'free')
    return {
      x: clamp(start.x + delta.x, ...bounds.x),
      y: clamp(start.y + delta.y, ...bounds.y),
    };
  const axis =
    mode === 'parallel'
      ? { x: Math.cos(angle), y: Math.sin(angle) }
      : { x: -Math.sin(angle), y: Math.cos(angle) };
  let lower = -Infinity;
  let upper = Infinity;
  for (const key of ['x', 'y']) {
    if (Math.abs(axis[key]) < 1e-8) continue;
    const limits = bounds[key].map((bound) => (bound - start[key]) / axis[key]);
    lower = Math.max(lower, Math.min(...limits));
    upper = Math.min(upper, Math.max(...limits));
  }
  const amount = clamp(delta.x * axis.x + delta.y * axis.y, lower, upper);
  return { x: start.x + axis.x * amount, y: start.y + axis.y * amount };
}

export function resizePanel(start, endpoint, pointer, room) {
  const angle = (start.angle * Math.PI) / 180;
  const sign = endpoint === 0 ? -1 : 1;
  const axis = { x: Math.cos(angle) * sign, y: Math.sin(angle) * sign };
  const anchor = {
    x: start.x - (axis.x * start.length) / 2,
    y: start.y - (axis.y * start.length) / 2,
  };
  let maxLength = Infinity;
  for (const key of ['x', 'y']) {
    if (Math.abs(axis[key]) < 1e-8) continue;
    const boundary = axis[key] > 0 ? room[key === 'x' ? 'width' : 'height'] - MARGIN : MARGIN;
    maxLength = Math.min(maxLength, (boundary - anchor[key]) / axis[key]);
  }
  const length = clamp(
    (pointer.x - anchor.x) * axis.x + (pointer.y - anchor.y) * axis.y,
    0.8,
    maxLength,
  );
  return {
    length,
    x: anchor.x + (axis.x * length) / 2,
    y: anchor.y + (axis.y * length) / 2,
  };
}

export function resizeRoom(start, delta, axis = 'both') {
  return {
    width: clamp(start.width + (axis === 'height' ? 0 : delta.x), 8, 120),
    height: clamp(start.height + (axis === 'width' ? 0 : delta.y), 8, 100),
  };
}

export function adjustPanelAcoustics(start, delta, pixelsPerMeter) {
  const angle = (start.angle * Math.PI) / 180;
  const along = (delta.x * Math.cos(angle) + delta.y * Math.sin(angle)) * pixelsPerMeter;
  const across = (-delta.x * Math.sin(angle) + delta.y * Math.cos(angle)) * pixelsPerMeter;
  const maxReflection = start.type === 'absorber' ? 0.2 : 0.95;
  return {
    reflection: clamp(start.reflection + (along / 120) * maxReflection, 0, maxReflection),
    scatter: clamp((start.scatter ?? 35) + (across / 120) * 90, 0, 90),
  };
}

// Handles keep finger-sized separation from the move target and each other.
// Near an edge they become callouts; drag deltas still edit the real endpoint.
export function layoutPanelHandles(center, endpoints, angle, screenScale) {
  const radians = (angle * Math.PI) / 180;
  const tangent = { x: Math.cos(radians), y: Math.sin(radians) };
  const normal = { x: -tangent.y, y: tangent.x };
  const margin = 22 / screenScale;
  const separation = 44 / screenScale;
  const halfLength = Math.max(
    separation,
    Math.hypot(endpoints[0].x - center.x, endpoints[0].y - center.y),
  );
  const targets = [
    { x: center.x - tangent.x * halfLength, y: center.y - tangent.y * halfLength },
    { x: center.x + tangent.x * halfLength, y: center.y + tangent.y * halfLength },
    { x: center.x + (normal.x * 58) / screenScale, y: center.y + (normal.y * 58) / screenScale },
    { x: center.x - (normal.x * 58) / screenScale, y: center.y - (normal.y * 58) / screenScale },
  ];
  const taken = [center];
  const grips = targets.map((target) => {
    const candidates = [
      target,
      { x: clamp(target.x, margin, 1000 - margin), y: clamp(target.y, margin, 640 - margin) },
    ];
    for (const radius of [44, 58, 76, 96, 120, 145]) {
      for (let index = 0; index < 32; index += 1) {
        const bearing = (index * Math.PI) / 16;
        candidates.push({
          x: center.x + (Math.cos(bearing) * radius) / screenScale,
          y: center.y + (Math.sin(bearing) * radius) / screenScale,
        });
      }
    }
    const available = candidates.filter(
      (point) =>
        point.x >= margin &&
        point.x <= 1000 - margin &&
        point.y >= margin &&
        point.y <= 640 - margin &&
        taken.every(
          (other) => Math.hypot(point.x - other.x, point.y - other.y) >= separation - 1e-5,
        ),
    );
    available.sort(
      (a, b) =>
        Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y),
    );
    const grip = available[0] || candidates[1];
    taken.push(grip);
    return grip;
  });
  return { endpoints: grips.slice(0, 2), rotation: grips[2], acoustics: grips[3] };
}
