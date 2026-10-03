/**
 * Deterministic 2-D image-source model: direct sound and every valid finite
 * first/second-order specular reflection. Panels are opaque on both sides.
 * Floor, ceiling, diffraction, scattering, frequency response and late diffuse
 * reverb are deliberately omitted. Material values are AMPLITUDE coefficients.
 * Exactly coincident full panel segments share one acoustic surface. Its first
 * panel ID is retained and the smallest reflection coefficient wins, treating
 * an absorbing layer as covering a reflective one; editor objects stay separate.
 *
 * Gain policy is fixed, never normalized per room:
 *   sqrt(12 / (12 + distance)) * 0.68 ** order * product(reflection)
 * The square-root loss is a 2-D spreading-inspired, softened demonstration
 * model, not calibrated acoustic prediction. There are at most 145 paths, each
 * no louder than the geometric direct path. Their summed absolute gains have
 * a finite bound < 65 for the permitted inputs; an audio output limiter is
 * still appropriate when simultaneous impulses overlap. No absorption change
 * can turn up another path through a room-dependent normalization factor.
 */

const SPEED_OF_SOUND = 343;
const EPS = 1e-7;
const MARGIN = 0.2;
const BOUNCE_GAIN = 0.68;
const MAX_PANELS = 8;
export const WALL_IDS = ['wall-top', 'wall-right', 'wall-bottom', 'wall-left'];
export const WALL_NAMES = {
  'wall-top': '上墙',
  'wall-right': '右墙',
  'wall-bottom': '下墙',
  'wall-left': '左墙',
};
const RESERVED_IDS = [...WALL_IDS, 'source', 'listener', 'direct'];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a, b) => a.x * b.y - a.y * b.x;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const copyPoint = ({ x, y }) => ({ x, y });

export function cloneScene(scene) {
  return JSON.parse(JSON.stringify(scene));
}

/** Segment endpoints; panel angle is measured in degrees from screen +x. */
export function panelEndpoints(panel) {
  const angle = (panel.angle * Math.PI) / 180;
  const dx = (Math.cos(angle) * panel.length) / 2;
  const dy = (Math.sin(angle) * panel.length) / 2;
  return [
    { x: panel.x - dx, y: panel.y - dy },
    { x: panel.x + dx, y: panel.y + dy },
  ];
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} 必须是有限数字`);
  }
  return value;
}

function within(value, min, max, label) {
  finite(value, label);
  if (value < min || value > max) {
    throw new Error(`${label} 必须在 ${min}–${max} 之间`);
  }
  return value;
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} 格式不正确`);
  }
  return value;
}

/**
 * Return an independent, whitelisted scene. Invalid scalar/type values throw.
 * Coordinates are clamped into the room, panel lengths shortened if necessary,
 * and centers moved so both endpoints remain inside the room. This also makes
 * resizing a room safe. Missing reflection values receive type-aware defaults.
 */
export function validateScene(input) {
  object(input, '布局');
  const width = within(input.width, 8, 120, '房间宽度');
  const height = within(input.height, 8, 100, '房间深度');
  const wallReflection = within(input.wallReflection ?? 0.12, 0, 0.95, '墙面反射');
  const overrides = object(input.wallReflections ?? {}, '独立墙面反射');
  const wallReflections = {};
  for (const id of WALL_IDS) {
    if (overrides[id] != null)
      wallReflections[id] = within(overrides[id], 0, 0.95, `${WALL_NAMES[id]}反射`);
  }
  const delayScale = input.delayScale ?? 1;
  if (delayScale !== 1 && delayScale !== 4) {
    throw new Error('回声延迟倍率只能是 1 或 4');
  }
  function point(value, label) {
    object(value, label);
    return {
      x: clamp(finite(value.x, `${label} x`), MARGIN, width - MARGIN),
      y: clamp(finite(value.y, `${label} y`), MARGIN, height - MARGIN),
    };
  }
  const source = point(input.source, '声源');
  const listener = point(input.listener, '收音点');
  const rawPanels = input.panels ?? [];
  if (!Array.isArray(rawPanels) || rawPanels.length > MAX_PANELS) {
    throw new Error(`装置列表必须是数组，且最多 ${MAX_PANELS} 个`);
  }
  const ids = new Set(RESERVED_IDS);
  const panels = rawPanels.map((raw, index) => {
    object(raw, `装置 ${index + 1}`);
    if (raw.type !== 'reflector' && raw.type !== 'absorber') {
      throw new Error(`装置 ${index + 1} 类型无效`);
    }
    const id = raw.id ?? `panel-${index + 1}`;
    if (typeof id !== 'string' || !id.length || id.length > 80 || ids.has(id)) {
      throw new Error(`装置 ${index + 1} 的 ID 无效或重复`);
    }
    ids.add(id);
    const angle = ((finite(raw.angle, '装置角度') % 360) + 360) % 360;
    const radians = (angle * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const maxLength = Math.min(
      cos > EPS ? (width - MARGIN * 2) / cos : Infinity,
      sin > EPS ? (height - MARGIN * 2) / sin : Infinity,
    );
    const inputLength = finite(raw.length, '装置长度');
    if (inputLength <= 0) throw new Error('装置长度必须大于 0');
    const length = clamp(inputLength, 0.8, maxLength);
    const halfWidth = (length * cos) / 2;
    const halfHeight = (length * sin) / 2;
    const maxReflection = raw.type === 'absorber' ? 0.2 : 0.95;
    const reflection = within(
      raw.reflection ?? (raw.type === 'absorber' ? 0.08 : 0.9),
      0,
      maxReflection,
      '装置反射',
    );
    return {
      id,
      type: raw.type,
      x: clamp(finite(raw.x, '装置 x'), MARGIN + halfWidth, width - MARGIN - halfWidth),
      y: clamp(finite(raw.y, '装置 y'), MARGIN + halfHeight, height - MARGIN - halfHeight),
      length,
      angle,
      reflection,
    };
  });
  return { width, height, source, listener, wallReflection, wallReflections, delayScale, panels };
}

export function wallReflectionFor(scene, id) {
  return scene.wallReflections?.[id] ?? scene.wallReflection;
}

function surfacesFor(scene) {
  const corners = [
    { x: 0, y: 0 },
    { x: scene.width, y: 0 },
    { x: scene.width, y: scene.height },
    { x: 0, y: scene.height },
  ];
  const walls = corners.map((a, index) => ({
    id: WALL_IDS[index],
    a,
    b: corners[(index + 1) % 4],
    reflection: wallReflectionFor(scene, WALL_IDS[index]),
    isPanel: false,
  }));
  const panels = [];
  for (const panel of scene.panels) {
    const [a, b] = panelEndpoints(panel);
    const existing = panels.find(
      (surface) =>
        (distance(a, surface.a) <= EPS && distance(b, surface.b) <= EPS) ||
        (distance(a, surface.b) <= EPS && distance(b, surface.a) <= EPS),
    );
    if (existing) {
      // One physical sheet cannot emit the same reflection once per editor
      // object. Keep its identity stable and let a coincident absorbing layer
      // determine the resulting surface coefficient.
      existing.reflection = Math.min(existing.reflection, panel.reflection);
    } else {
      panels.push({ id: panel.id, a, b, reflection: panel.reflection, isPanel: true });
    }
  }
  return [...walls, ...panels];
}

function mirror(point, surface) {
  const edge = sub(surface.b, surface.a);
  const offset = sub(point, surface.a);
  const t = (offset.x * edge.x + offset.y * edge.y) / (edge.x ** 2 + edge.y ** 2);
  return {
    x: 2 * (surface.a.x + t * edge.x) - point.x,
    y: 2 * (surface.a.y + t * edge.y) - point.y,
  };
}

/** Intersection parameters of the two infinite lines (null when parallel). */
function intersection(a, b, c, d) {
  const r = sub(b, a);
  const s = sub(d, c);
  const determinant = cross(r, s);
  if (Math.abs(determinant) < EPS) return null;
  const offset = sub(c, a);
  const t = cross(offset, s) / determinant;
  const u = cross(offset, r) / determinant;
  return { t, u, point: { x: a.x + t * r.x, y: a.y + t * r.y } };
}

function blockedSegment(a, b, panels) {
  if (distance(a, b) < EPS) return false;
  for (const panel of panels) {
    const hit = intersection(a, b, panel.a, panel.b);
    if (hit) {
      // Contacts at this path segment's ends are its intended bounces. The
      // interior cannot cross any opaque panel, including an absorbing one.
      if (hit.t > EPS && hit.t < 1 - EPS && hit.u >= -EPS && hit.u <= 1 + EPS) {
        return true;
      }
    } else {
      const ray = sub(b, a);
      if (Math.abs(cross(sub(panel.a, a), ray)) > EPS) continue;
      const denom = ray.x ** 2 + ray.y ** 2;
      const parameter = (point) => {
        const offset = sub(point, a);
        return (offset.x * ray.x + offset.y * ray.y) / denom;
      };
      const t1 = parameter(panel.a);
      const t2 = parameter(panel.b);
      if (Math.min(1 - EPS, Math.max(t1, t2)) > Math.max(EPS, Math.min(t1, t2))) {
        return true;
      }
    }
  }
  return false;
}

function reflectedPoints(source, listener, sequence) {
  const images = [source];
  for (const surface of sequence) images.push(mirror(images.at(-1), surface));
  const reversed = [listener];
  let current = listener;
  for (let i = sequence.length - 1; i >= 0; i -= 1) {
    const surface = sequence[i];
    const hit = intersection(current, images[i + 1], surface.a, surface.b);
    // Corner/edge grazing paths are excluded: a geometric ray hitting exactly
    // an edge has no unique specular surface and needs diffraction modelling.
    if (!hit || hit.t <= EPS || hit.t >= 1 - EPS || hit.u <= EPS || hit.u >= 1 - EPS) {
      return null;
    }
    current = hit.point;
    reversed.push(current);
  }
  const points = [source, ...reversed.reverse()];
  for (let i = 0; i < sequence.length; i += 1) {
    const surface = sequence[i];
    const edge = sub(surface.b, surface.a);
    const before = cross(edge, sub(points[i], surface.a));
    const after = cross(edge, sub(points[i + 2], surface.a));
    // A reflection stays on the same side; otherwise it would transmit through.
    if (before * after <= EPS) return null;
  }
  return points;
}

export function computePaths(input) {
  const scene = validateScene(input);
  const surfaces = surfacesFor(scene);
  const panels = surfaces.filter((surface) => surface.isPanel);
  const directDistance = distance(scene.source, scene.listener);
  const secondsPerMeter = scene.delayScale / SPEED_OF_SOUND;
  const directDelay = directDistance * secondsPerMeter;
  const blocked = blockedSegment(scene.source, scene.listener, panels);
  const paths = [];

  function addPath(points, sequence) {
    if (!points) return;
    for (let i = 1; i < points.length; i += 1) {
      if (blockedSegment(points[i - 1], points[i], panels)) return;
    }
    const totalDistance = points
      .slice(1)
      .reduce((sum, point, index) => sum + distance(points[index], point), 0);
    const reflection = sequence.reduce((gain, surface) => gain * surface.reflection, 1);
    const gain = Math.sqrt(12 / (12 + totalDistance)) * BOUNCE_GAIN ** sequence.length * reflection;
    const arrival = sub(points.at(-2), scene.listener);
    const arrivalLength = Math.hypot(arrival.x, arrival.y);
    paths.push({
      id: sequence.length ? sequence.map((surface) => surface.id).join('>') : 'direct',
      points: points.map(copyPoint),
      distance: totalDistance,
      delay: totalDistance * secondsPerMeter,
      relativeDelay: Math.max(0, totalDistance - directDistance) * secondsPerMeter,
      gain,
      pan: arrivalLength > EPS ? clamp(arrival.x / arrivalLength, -1, 1) : 0,
      order: sequence.length,
      surfaces: sequence.map((surface) => surface.id),
    });
  }

  if (!blocked) addPath([scene.source, scene.listener], []);
  for (const first of surfaces) {
    // Zero-reflection surfaces still block propagation but contribute no sound.
    if (first.reflection <= 0) continue;
    addPath(reflectedPoints(scene.source, scene.listener, [first]), [first]);
    for (const second of surfaces) {
      if (second.id === first.id || second.reflection <= 0) continue;
      addPath(reflectedPoints(scene.source, scene.listener, [first, second]), [first, second]);
    }
  }
  paths.sort((a, b) => a.delay - b.delay || a.order - b.order || a.id.localeCompare(b.id));
  return { paths, directDistance, directDelay, blocked };
}

/** Ready-to-edit scenes; always clone before modifying a preset. */
export const presets = {
  first: {
    width: 72,
    height: 40,
    source: { x: 10, y: 18 },
    listener: { x: 10, y: 22 },
    wallReflection: 0.08,
    delayScale: 1,
    panels: [
      {
        id: 'reflector-1',
        type: 'reflector',
        x: 45,
        y: 20,
        length: 24,
        angle: 90,
        reflection: 0.9,
      },
    ],
  },
  hall: {
    width: 100,
    height: 64,
    source: { x: 30, y: 26 },
    listener: { x: 38, y: 34 },
    wallReflection: 0.8,
    delayScale: 1,
    panels: [
      {
        id: 'reflector-1',
        type: 'reflector',
        x: 77,
        y: 29,
        length: 34,
        angle: 90,
        reflection: 0.9,
      },
      { id: 'reflector-2', type: 'reflector', x: 29, y: 53, length: 24, angle: 5, reflection: 0.9 },
    ],
  },
  dry: {
    width: 24,
    height: 18,
    source: { x: 7, y: 7 },
    listener: { x: 10, y: 10 },
    wallReflection: 0.06,
    delayScale: 1,
    panels: [
      { id: 'absorber-1', type: 'absorber', x: 19, y: 9, length: 12, angle: 90, reflection: 0.08 },
      { id: 'absorber-2', type: 'absorber', x: 10, y: 15, length: 14, angle: 0, reflection: 0.08 },
    ],
  },
};
