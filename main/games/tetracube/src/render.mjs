// Dependency-free perspective renderer. All game coordinates use Z as up.
import { DEFAULT_CONFIG } from './config.mjs';
const TAU = Math.PI * 2;
const MINT = '#67f6da';
const CYAN = '#65d9ff';
const PALETTE = {
  cyan: CYAN,
  mint: MINT,
  amber: '#ffbc6a',
  violet: '#ab92ff',
  blue: '#67a9ff',
  coral: '#ff8d9b',
};
const FACES = [
  {
    axis: 0,
    sign: -1,
    shade: 0.57,
    vertices: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
  },
  {
    axis: 0,
    sign: 1,
    shade: 0.8,
    vertices: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  },
  {
    axis: 1,
    sign: -1,
    shade: 0.67,
    vertices: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    axis: 1,
    sign: 1,
    shade: 0.6,
    vertices: [
      [0, 1, 0],
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
    ],
  },
  {
    axis: 2,
    sign: -1,
    shade: 0.48,
    vertices: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
  },
  {
    axis: 2,
    sign: 1,
    shade: 1,
    vertices: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
];
const EDGES = [
  [0, 1],
  [0, 2],
  [0, 4],
  [1, 3],
  [1, 5],
  [2, 3],
  [2, 6],
  [3, 7],
  [4, 5],
  [4, 6],
  [5, 7],
  [6, 7],
];

function dimensions(value) {
  if (Array.isArray(value)) return value;
  return [
    value?.x || value?.width || DEFAULT_CONFIG.dims[0],
    value?.y || value?.depth || DEFAULT_CONFIG.dims[1],
    value?.z || value?.height || DEFAULT_CONFIG.dims[2],
  ];
}

function position(cell) {
  return Array.isArray(cell) ? cell : [cell.x, cell.y, cell.z];
}

function color(value) {
  const raw = PALETTE[value] || value || CYAN;
  const hex = raw.replace('#', '');
  if (/^[a-f\d]{3}$/i.test(hex)) return hex.split('').map((v) => parseInt(v + v, 16));
  if (/^[a-f\d]{6}$/i.test(hex)) return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return [104, 220, 255];
}

function rgba(rgb, opacity = 1, brightness = 1) {
  return `rgba(${rgb.map((v) => Math.round(Math.min(255, v * brightness))).join(',')},${opacity})`;
}

function polygon(ctx, vertices) {
  ctx.beginPath();
  vertices.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

function resize(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width || canvas.clientWidth || 320);
  const height = Math.max(1, rect.height || canvas.clientHeight || 400);
  const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
  const physicalWidth = Math.round(width * ratio);
  const physicalHeight = Math.round(height * ratio);
  if (canvas.width !== physicalWidth || canvas.height !== physicalHeight) {
    canvas.width = physicalWidth;
    canvas.height = physicalHeight;
  }
  return { width, height, ratio };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.camera = { yaw: Math.PI / 4, pitch: 0.5 };
    this.dims = [...DEFAULT_CONFIG.dims];
    this.flip = null;
    this.orientation = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    this.width = 320;
    this.height = 400;
    this.scale = 25;
    this.distance = 24;
    this.layers = { visible: [], landing: [] };
    this.centerX = 160;
    this.centerY = 200;
    this.disposed = false;
  }

  setView(view) {
    // A slightly offset eye keeps stacked cells apart, including the center column.
    if (view === 'top') this.camera = { yaw: 0.38, pitch: 1.28 };
    else if (view === 'front') this.camera = { yaw: 0, pitch: 0.16 };
    else if (view === 'side') this.camera = { yaw: Math.PI / 2, pitch: 0.16 };
    else this.camera = { yaw: Math.PI / 4, pitch: 0.5 };
  }

  orbit(dx, dy) {
    this.camera.yaw = (this.camera.yaw + dx * 0.008) % TAU;
    // Cross the poles continuously: no direction becomes blocked at a preset or limit.
    this.camera.pitch = (this.camera.pitch + dy * 0.006) % TAU;
  }

  // Intersect screen rays with the grabbed cell's horizontal plane. Perspective
  // changes the size of a grid step with depth, so a single global scale is insufficient.
  planeDelta(dx, dy, anchor = this.dims.map((n) => n / 2)) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { x: 0, y: 0 };
    const start = this.project(anchor);
    const direction = this._direction();
    const { yaw, pitch } = this.camera;
    const right = [Math.cos(yaw), -Math.sin(yaw), 0];
    const down = [
      Math.sin(yaw) * Math.sin(pitch),
      Math.cos(yaw) * Math.sin(pitch),
      -Math.cos(pitch),
    ];
    const eye = this.dims.map((n, axis) => n / 2 + direction[axis] * this.distance);
    const intersect = (screenX, screenY) => {
      const sx = (screenX - this.centerX) / this.scale;
      const sy = (screenY - this.centerY) / this.scale;
      const ray = right.map((v, a) => v * sx + down[a] * sy - direction[a] * this.distance);
      if (Math.abs(ray[2]) < this.distance * 0.12) return null;
      const t = (anchor[2] - eye[2]) / ray[2];
      if (t <= 0 || t > 3) return null;
      return eye.map((v, a) => v + ray[a] * t);
    };
    const from = intersect(start.x, start.y);
    const to = intersect(start.x + dx, start.y + dy);
    if (from && to) return { x: to[0] - from[0], y: to[1] - from[1] };
    // A front view is nearly parallel to the XY plane. Keep a bounded drag
    // response there instead of letting a ray near the horizon jump across the board.
    const sx = (Number.isFinite(dx) ? dx : 0) / Math.max(1, this.scale);
    const sy = (Number.isFinite(dy) ? dy : 0) / Math.max(1, this.scale);
    const sin = Math.sin(pitch);
    const depth = sy / (Math.sign(sin || 1) * Math.max(0.3, Math.abs(sin)));
    const c = Math.cos(this.camera.yaw);
    const s = Math.sin(this.camera.yaw);
    return { x: c * sx + s * depth, y: -s * sx + c * depth };
  }

  _rotate([x, y, z]) {
    if (!this.flip) return [x, y, z];
    const c = Math.cos(this.flip.angle);
    const s = Math.sin(this.flip.angle);
    if (this.flip.axis === 0) return [x, y * c - z * s, y * s + z * c];
    if (this.flip.axis === 1) return [x * c + z * s, y, -x * s + z * c];
    return [x * c - y * s, x * s + y * c, z];
  }

  _normal(axis, sign) {
    const vector = [0, 0, 0];
    vector[axis] = sign;
    return this._rotate(vector);
  }

  _direction() {
    return [
      Math.sin(this.camera.yaw) * Math.cos(this.camera.pitch),
      Math.cos(this.camera.yaw) * Math.cos(this.camera.pitch),
      Math.sin(this.camera.pitch),
    ];
  }

  _raw(point) {
    // Rotate the physical geometry about its center. The camera never follows a container flip.
    const [x, y, z] = this._rotate(point.map((v, axis) => v - this.dims[axis] / 2));
    const { yaw, pitch } = this.camera;
    const depth = x * Math.sin(yaw) + y * Math.cos(yaw);
    return {
      x: x * Math.cos(yaw) - y * Math.sin(yaw),
      y: depth * Math.sin(pitch) - z * Math.cos(pitch),
      depth: depth * Math.cos(pitch) + z * Math.sin(pitch),
    };
  }

  project(point) {
    const p = this._raw(point);
    const perspective = this.distance / Math.max(1, this.distance - p.depth);
    return {
      x: this.centerX + p.x * this.scale * perspective,
      y: this.centerY + p.y * this.scale * perspective,
      depth: p.depth,
    };
  }

  _corners(origin = [0, 0, 0], size = this.dims) {
    return Array.from({ length: 8 }, (_, i) =>
      this.project(origin.map((n, axis) => n + ((i >> axis) & 1) * size[axis])),
    );
  }

  _fit() {
    this.distance = Math.hypot(...this.dims) * 1.65;
    const corners = Array.from({ length: 8 }, (_, i) =>
      this._raw(this.dims.map((n, axis) => ((i >> axis) & 1) * n)),
    ).map((p) => {
      const perspective = this.distance / (this.distance - p.depth);
      return { x: p.x * perspective, y: p.y * perspective };
    });
    const minX = Math.min(...corners.map((p) => p.x));
    const maxX = Math.max(...corners.map((p) => p.x));
    const minY = Math.min(...corners.map((p) => p.y));
    const maxY = Math.max(...corners.map((p) => p.y));
    // Fitting the transformed corners is continuous, including the remapped endpoint dimensions.
    const margin = 30;
    this.scale = Math.min(
      (this.width - margin * 2) / (maxX - minX),
      (this.height - 38) / (maxY - minY),
    );
    this.scale = Math.max(1, this.scale);
    this.centerX = this.width / 2 - ((maxX + minX) * this.scale) / 2;
    this.centerY = this.height / 2 - ((maxY + minY) * this.scale) / 2 - 1;
  }

  _line(a, b, stroke, width = 1) {
    const ctx = this.ctx;
    const p = this.project(a);
    const q = this.project(b);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  _plane(axis, coordinate) {
    const other = [0, 1, 2].filter((a) => a !== axis);
    return [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ].map((v) => {
      const p = [0, 0, 0];
      p[axis] = coordinate;
      other.forEach((a, i) => {
        p[a] = this.dims[a] * v[i];
      });
      return this.project(p);
    });
  }

  _background() {
    const ctx = this.ctx;
    const glow = ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.67,
      0,
      this.width * 0.5,
      this.height * 0.67,
      Math.max(this.width, this.height) * 0.66,
    );
    glow.addColorStop(0, 'rgba(53,81,145,.19)');
    glow.addColorStop(0.52, 'rgba(39,38,103,.08)');
    glow.addColorStop(1, 'rgba(8,13,35,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.width, this.height);
    // Fixed, sparse stars keep the chamber in a game world without a particle field to update.
    for (let i = 0; i < 29; i++) {
      const x = (((i * 61 + 17) % 101) / 101) * this.width;
      const y = (((i * 37 + 23) % 103) / 103) * this.height;
      const size = i % 9 === 0 ? 1.6 : 0.9;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(130,203,255,.4)' : 'rgba(173,181,255,.2)';
      ctx.fillRect(x, y, size, size);
    }
  }

  _reactor(plane, isLanding) {
    const ctx = this.ctx;
    const center = plane.reduce((p, v) => ({ x: p.x + v.x / 4, y: p.y + v.y / 4 }), {
      x: 0,
      y: 0,
    });
    const ring = (size) =>
      plane.map((v) => ({
        x: center.x + (v.x - center.x) * size,
        y: center.y + (v.y - center.y) * size,
      }));
    polygon(ctx, ring(0.94));
    ctx.fillStyle = isLanding ? 'rgba(35,83,117,.16)' : 'rgba(62,62,137,.03)';
    ctx.fill();
    for (const [size, opacity] of [
      [0.96, 0.5],
      [0.84, 0.17],
      [0.31, 0.39],
    ]) {
      polygon(ctx, ring(size));
      ctx.lineWidth = size < 0.4 ? 1.5 : 1;
      ctx.strokeStyle = `rgba(91,238,215,${isLanding ? opacity : opacity * 0.35})`;
      ctx.stroke();
    }
    polygon(ctx, ring(0.18));
    ctx.fillStyle = isLanding ? 'rgba(93,253,218,.12)' : 'rgba(157,138,248,.03)';
    ctx.fill();
    // Four short power conduits leave the central reactor readable under an empty chamber.
    ctx.beginPath();
    plane.forEach((v) => {
      ctx.moveTo(center.x + (v.x - center.x) * 0.36, center.y + (v.y - center.y) * 0.36);
      ctx.lineTo(center.x + (v.x - center.x) * 0.67, center.y + (v.y - center.y) * 0.67);
    });
    ctx.strokeStyle = isLanding ? 'rgba(131,255,225,.42)' : 'rgba(165,148,255,.1)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  _container(front = false) {
    const ctx = this.ctx;
    const camera = this._direction();
    const direction = [0, 1, 2].map((axis) =>
      this._normal(axis, 1).reduce((dot, value, i) => dot + value * camera[i], 0),
    );
    const originalUp = this.orientation?.[2] || [0, 0, 1];
    const markerAxis = originalUp.reduce(
      (best, value, i) => (Math.abs(value) > Math.abs(originalUp[best]) ? i : best),
      0,
    );
    const markerCoordinate = originalUp[markerAxis] >= 0 ? 0 : this.dims[markerAxis];
    for (let axis = 0; axis < 3; axis++) {
      const near = direction[axis] >= 0 ? this.dims[axis] : 0;
      const coordinate = front ? near : this.dims[axis] - near;
      const normal = this._normal(axis, coordinate === 0 ? -1 : 1);
      // Mint marks the actual world-bottom face, even when the container has been inverted.
      const isLanding = normal[2] < -0.999;
      const plane = this._plane(axis, coordinate);
      if (!front) {
        polygon(ctx, plane);
        ctx.fillStyle = isLanding ? 'rgba(38,145,145,.07)' : 'rgba(41,62,127,.055)';
        ctx.fill();
      }
      // Front walls remain open: only rear walls and the current landing face have a full grid.
      if (!front || isLanding) {
        const other = [0, 1, 2].filter((a) => a !== axis);
        for (const a of other) {
          const b = other.find((v) => v !== a);
          for (let n = 0; n <= this.dims[a]; n++) {
            const from = [0, 0, 0];
            const to = [0, 0, 0];
            from[axis] = to[axis] = coordinate;
            from[a] = to[a] = n;
            to[b] = this.dims[b];
            this._line(from, to, isLanding ? 'rgba(99,229,213,.21)' : 'rgba(112,145,216,.17)', 0.7);
          }
        }
      }
      if (isLanding) {
        this._reactor(plane, true);
        polygon(ctx, plane);
        ctx.strokeStyle = 'rgba(110,251,223,.8)';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = MINT;
        ctx.shadowBlur = 7;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      // Amber corner brackets remain attached to the original floor. They visibly travel to
      // the roof or side wall during a flip, making the container's orientation unambiguous.
      if (axis === markerAxis && coordinate === markerCoordinate) {
        if (!isLanding) this._reactor(plane, false);
        ctx.strokeStyle = 'rgba(255,195,99,.93)';
        ctx.lineWidth = 2.1;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const p = plane[i];
          for (const q of [plane[(i + 1) % 4], plane[(i + 3) % 4]]) {
            const t = Math.min(0.2, 11 / Math.max(1, Math.hypot(q.x - p.x, q.y - p.y)));
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t);
          }
        }
        ctx.stroke();
      }
    }
    const corners = this._corners();
    EDGES.forEach(([a, b]) => {
      const isNear = (corners[a].depth + corners[b].depth) / 2 > 0;
      if (isNear !== front) return;
      ctx.beginPath();
      ctx.moveTo(corners[a].x, corners[a].y);
      ctx.lineTo(corners[b].x, corners[b].y);
      const upright = Math.abs(corners[a].y - corners[b].y) > this.scale * 2;
      ctx.lineWidth = upright ? (front ? 1.3 : 1.1) : 1;
      ctx.strokeStyle = front ? 'rgba(126,240,229,.58)' : 'rgba(107,187,220,.37)';
      ctx.stroke();
    });
    corners.forEach((p) => {
      if (p.depth > 0 !== front) return;
      ctx.beginPath();
      ctx.arc(p.x, p.y, front ? 2 : 1.5, 0, TAU);
      ctx.fillStyle = front ? 'rgba(162,255,235,.8)' : 'rgba(130,191,241,.48)';
      ctx.fill();
    });
  }

  _cubeFaces(cells, type, faces) {
    const direction = this._direction();
    for (const cell of cells || []) {
      const pos = position(cell);
      if (pos.some((v) => !Number.isFinite(v))) continue;
      const rawSize = cell.scale ?? 1;
      const size = Number.isFinite(rawSize) ? Math.max(0, Math.min(1, rawSize)) : 1;
      if (size === 0) continue;
      const base = color(cell.color || (type === 'active' ? MINT : CYAN));
      const layer = Math.max(0, Math.min(this.dims[2] - 1, Math.round(pos[2])));
      // Keep the shape's hue, with alternating cool/light layers and a height gradient.
      const tint = layer % 2 ? [192, 229, 255] : [95, 207, 206];
      const rgb = type === 'board' ? base.map((v, a) => v * 0.88 + tint[a] * 0.12) : base;
      const side = (type === 'ghost' ? 0.95 : 0.972) * size;
      for (const face of FACES) {
        const normal = this._normal(face.axis, face.sign);
        const center = this._rotate(pos.map((v, a) => v + 0.5 - this.dims[a] / 2));
        const toEye = direction.map((v, a) => v * this.distance - center[a]);
        if (normal.reduce((dot, value, i) => dot + value * toEye[i], 0) < 0.001) continue;
        const vertices = face.vertices.map((vertex) =>
          this.project(pos.map((v, a) => v + 0.5 + (vertex[a] - 0.5) * side)),
        );
        faces.push({
          vertices,
          rgb,
          shade:
            (0.75 + normal[2] * 0.25 + normal[0] * 0.07 - normal[1] * 0.04) *
            (type === 'board'
              ? 0.88 + (layer / Math.max(1, this.dims[2] - 1)) * 0.22 + (layer % 2) * 0.08
              : 1),
          type,
          layer: layer + 1,
          top: face.axis === 2 && face.sign > 0,
          alpha: Math.max(0, Math.min(0.34, cell.alpha ?? cell.opacity ?? 0.15)),
          depth: vertices.reduce((sum, v) => sum + v.depth, 0) / 4,
        });
      }
    }
  }

  _drawFaces(faces, time) {
    const ctx = this.ctx;
    ctx.globalAlpha = 1;
    faces.sort((a, b) => a.depth - b.depth);
    for (const face of faces) {
      polygon(ctx, face.vertices);
      if (face.type === 'ghost') {
        // The landing preview is outline-only; solid cubes fully occlude it when in front.
        ctx.strokeStyle = `rgba(135,255,225,${0.77 + Math.sin(time * 0.003) * 0.12})`;
        ctx.lineWidth = 1.25;
        ctx.setLineDash([Math.max(2, this.scale * 0.13), Math.max(2, this.scale * 0.085)]);
        ctx.lineDashOffset = -time * 0.004;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
        continue;
      }
      if (face.type === 'trail') {
        ctx.fillStyle = rgba(face.rgb, face.alpha * 0.45, 1.05);
        ctx.fill();
        ctx.strokeStyle = rgba(face.rgb, face.alpha, 1.3);
        ctx.lineWidth = 0.8;
        ctx.stroke();
        continue;
      }
      const active = face.type === 'active';
      const y = face.vertices.map((p) => p.y);
      const gradient = ctx.createLinearGradient(0, Math.min(...y), 0, Math.max(...y) + 1);
      gradient.addColorStop(0, rgba(face.rgb, 1, face.shade * (active ? 1.12 : 1.03)));
      gradient.addColorStop(0.44, rgba(face.rgb, 1, face.shade * 0.97));
      gradient.addColorStop(1, rgba(face.rgb, 1, face.shade * 0.66));
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = rgba(face.rgb, 1, active ? 1.3 : 1.16);
      ctx.lineWidth = active ? 1.2 : 0.9;
      ctx.shadowColor = rgba(face.rgb, 1);
      ctx.shadowBlur = active ? 3 : 0;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // A small solid bevel distinguishes adjacent cells without showing the grid through them.
      if (this.scale > 11) {
        const center = face.vertices.reduce((p, v) => ({ x: p.x + v.x / 4, y: p.y + v.y / 4 }), {
          x: 0,
          y: 0,
        });
        polygon(
          ctx,
          face.vertices.map((v) => ({
            x: v.x + (center.x - v.x) * 0.13,
            y: v.y + (center.y - v.y) * 0.13,
          })),
        );
        ctx.lineWidth = 0.65;
        ctx.strokeStyle = active ? 'rgba(238,255,250,.34)' : 'rgba(240,255,255,.21)';
        ctx.stroke();
        const [a, b, , d] = face.vertices;
        ctx.beginPath();
        ctx.moveTo(a.x + (center.x - a.x) * 0.16, a.y + (center.y - a.y) * 0.16);
        ctx.lineTo(b.x + (center.x - b.x) * 0.16, b.y + (center.y - b.y) * 0.16);
        ctx.moveTo(a.x + (center.x - a.x) * 0.16, a.y + (center.y - a.y) * 0.16);
        ctx.lineTo(d.x + (center.x - d.x) * 0.16, d.y + (center.y - d.y) * 0.16);
        ctx.strokeStyle = active ? 'rgba(249,255,253,.55)' : 'rgba(249,255,253,.3)';
        ctx.stroke();
      }
      if (face.type === 'board' && face.top) {
        const span =
          Math.max(...face.vertices.map((v) => v.x)) - Math.min(...face.vertices.map((v) => v.x));
        const rise =
          Math.max(...face.vertices.map((v) => v.y)) - Math.min(...face.vertices.map((v) => v.y));
        if (span >= 14 && rise >= 8) {
          const center = face.vertices.reduce((p, v) => ({ x: p.x + v.x / 4, y: p.y + v.y / 4 }), {
            x: 0,
            y: 0,
          });
          // Explicit height remains readable without relying on color perception.
          ctx.font = `600 ${Math.min(11, Math.max(8, span * 0.27))}px system-ui`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(4,28,42,.72)';
          ctx.fillText(String(face.layer), center.x, center.y);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  _layerGuide() {
    if (this.flip) return;
    const ctx = this.ctx;
    // Label the outermost screen edge, rather than the nearest edge which often
    // projects through the middle of the solid stack.
    const corner = [
      [0, 0],
      [this.dims[0], 0],
      [0, this.dims[1]],
      [this.dims[0], this.dims[1]],
    ].sort(
      (a, b) => this.project([...b, this.dims[2] / 2]).x - this.project([...a, this.dims[2] / 2]).x,
    )[0];
    const levels = new Set([1, ...this.layers.visible, ...this.layers.landing]);
    ctx.font = '10px system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let previous = null;
    for (const layer of [...levels].sort((a, b) => a - b)) {
      const p = this.project([...corner, layer - 0.5]);
      if (previous && Math.hypot(p.x - previous.x, p.y - previous.y) < 13) continue;
      const landing = this.layers.landing.includes(layer);
      ctx.strokeStyle = landing ? MINT : 'rgba(175,212,226,.65)';
      ctx.fillStyle = landing ? MINT : '#9bbac9';
      ctx.lineWidth = landing ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(p.x + 2, p.y);
      ctx.lineTo(p.x + 7, p.y);
      ctx.stroke();
      ctx.fillText(`${layer}层`, p.x + 10, p.y);
      previous = p;
    }
  }

  _particles(particles) {
    const ctx = this.ctx;
    for (const particle of particles || []) {
      const p = this.project(position(particle));
      const opacity = particle.alpha ?? particle.life ?? 1;
      if (opacity <= 0) continue;
      ctx.globalAlpha = Math.min(1, opacity);
      ctx.fillStyle = particle.color || MINT;
      ctx.shadowBlur = 7;
      ctx.shadowColor = particle.color || MINT;
      const size = (particle.size ?? 0.055) * this.scale;
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  _impact(impact) {
    const cells = (impact?.cells || []).map(position).filter((p) => p.every(Number.isFinite));
    if (!cells.length) return;
    const t = Math.max(0, Math.min(1, Number(impact.t) || 0));
    if (t >= 1) return;
    const strength = Math.max(0, Math.min(2, impact.strength ?? 1));
    const opacity = (1 - t) * strength;
    const center = [
      cells.reduce((sum, p) => sum + p[0] + 0.5, 0) / cells.length,
      cells.reduce((sum, p) => sum + p[1] + 0.5, 0) / cells.length,
      Math.min(...cells.map((p) => p[2])) + 0.025,
    ];
    const rgb = color(impact.color || MINT);
    const ctx = this.ctx;
    // The pulse follows the landing cells; a weaker second ring reaches the reactor below.
    for (const [z, alpha, factor] of [
      [center[2], 0.66, 1],
      [0.015, 0.17, 1.3],
    ]) {
      const radius = (0.6 + t * (2.3 + strength)) * factor;
      const points = Array.from({ length: 33 }, (_, i) => {
        const angle = (i / 32) * TAU;
        return this.project([
          center[0] + Math.cos(angle) * radius,
          center[1] + Math.sin(angle) * radius,
          z,
        ]);
      });
      polygon(ctx, points);
      ctx.strokeStyle = rgba(rgb, Math.min(0.9, opacity * alpha), 1.3);
      ctx.lineWidth = Math.max(0.5, (1 - t) * 2.5);
      ctx.stroke();
    }
    if (t < 0.7) {
      ctx.strokeStyle = rgba(rgb, Math.min(0.8, opacity * 0.65), 1.6);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * TAU;
        const radius = 0.6 + t * 3.5;
        const a = this.project([
          center[0] + Math.cos(angle) * radius,
          center[1] + Math.sin(angle) * radius,
          center[2] + Math.sin(t * Math.PI) * 0.6,
        ]);
        const b = this.project([
          center[0] + Math.cos(angle) * (radius + 0.2),
          center[1] + Math.sin(angle) * (radius + 0.2),
          center[2] + Math.sin(t * Math.PI) * 0.75,
        ]);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }
  }

  draw({
    board = [],
    active = [],
    ghost = [],
    dims = DEFAULT_CONFIG.dims,
    flip = null,
    orientation = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    time = 0,
    particles = [],
    trail = [],
    impact = null,
    shake = 0,
  } = {}) {
    if (this.disposed || !this.ctx) return;
    const { width, height, ratio } = resize(this.canvas);
    this.width = width;
    this.height = height;
    this.dims = dimensions(dims);
    this.flip = flip && Number.isFinite(flip.angle) ? flip : null;
    this.orientation = orientation;
    const levels = (cells) =>
      [...new Set(cells.map((cell) => Math.round(position(cell)[2]) + 1))].sort((a, b) => a - b);
    this.layers = { visible: levels(board), landing: levels(ghost) };
    this._fit();
    const ctx = this.ctx;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    this._background();
    const shakePixels = Number.isFinite(shake) ? Math.min(8, Math.abs(shake)) : 0;
    this.centerX += Math.sin(time * 0.13) * shakePixels;
    this.centerY += Math.cos(time * 0.17) * shakePixels * 0.6;
    this._container();
    this._impact(impact);
    const faces = [];
    this._cubeFaces(trail.slice(0, 80), 'trail', faces);
    this._cubeFaces(board, 'board', faces);
    this._cubeFaces(ghost, 'ghost', faces);
    this._cubeFaces(active, 'active', faces);
    this._drawFaces(faces, time);
    this._container(true);
    this._layerGuide();
    this._particles(particles);
  }

  dispose() {
    this.disposed = true;
    if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

export function drawMini(canvas, cells = [], fill = CYAN) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height, ratio } = resize(canvas);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (!cells?.length) return;
  const points = cells.map(position);
  const raw = ([x, y, z]) => ({
    x: (x - y) * 0.866,
    y: (x + y) * 0.38 - z * 0.94,
    depth: (x + y) * 0.8 + z * 0.38,
  });
  const all = points.flatMap((pos) =>
    Array.from({ length: 8 }, (_, i) => raw(pos.map((v, a) => v + ((i >> a) & 1)))),
  );
  const minX = Math.min(...all.map((p) => p.x));
  const maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const maxY = Math.max(...all.map((p) => p.y));
  const scale = Math.min((width - 10) / (maxX - minX), (height - 8) / (maxY - minY));
  const project = (p) => {
    const v = raw(p);
    return {
      x: width / 2 + (v.x - (minX + maxX) / 2) * scale,
      y: height / 2 + (v.y - (minY + maxY) / 2) * scale,
      depth: v.depth,
    };
  };
  const faces = [];
  points.forEach((pos, i) => {
    const rgb = color(cells[i].color || fill);
    FACES.filter((face) => face.sign > 0).forEach((face) => {
      const vertices = face.vertices.map((v) => project(pos.map((n, a) => n + 0.04 + v[a] * 0.92)));
      faces.push({
        vertices,
        rgb,
        shade: face.shade,
        depth: vertices.reduce((sum, v) => sum + v.depth, 0) / 4,
      });
    });
  });
  faces
    .sort((a, b) => a.depth - b.depth)
    .forEach((face) => {
      polygon(ctx, face.vertices);
      const y = face.vertices.map((p) => p.y);
      const gradient = ctx.createLinearGradient(0, Math.min(...y), 0, Math.max(...y) + 1);
      gradient.addColorStop(0, rgba(face.rgb, 1, face.shade * 1.07));
      gradient.addColorStop(1, rgba(face.rgb, 1, face.shade * 0.7));
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = rgba(face.rgb, 1, 1.24);
      ctx.lineWidth = 0.75;
      ctx.stroke();
      const center = face.vertices.reduce((p, v) => ({ x: p.x + v.x / 4, y: p.y + v.y / 4 }), {
        x: 0,
        y: 0,
      });
      polygon(
        ctx,
        face.vertices.map((v) => ({
          x: v.x + (center.x - v.x) * 0.15,
          y: v.y + (center.y - v.y) * 0.15,
        })),
      );
      ctx.strokeStyle = 'rgba(244,255,255,.3)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });
}
