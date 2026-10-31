// Original perspective math shared by the Cocos view and regression tests.
const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (v) => v.map((n) => n / Math.hypot(...v));
const planes = { XY: [0, 1], XZ: [0, 2], YZ: [1, 2] };
export function rotateVector(vector, turn) {
  if (!turn) return [...vector];
  const [a, b] = planes[turn.plane],
    c = Math.cos(turn.angle),
    s = Math.sin(turn.angle);
  const out = [...vector];
  out[a] = vector[a] * c + vector[b] * s;
  out[b] = vector[b] * c - vector[a] * s;
  return out;
}

// The centroid follows the wall kick while every cube keeps its rigid distance and orientation.
export function piecePose(event, progress) {
  const t = Math.max(0, Math.min(1, progress)),
    ease = 1 - (1 - t) ** 3;
  const rotation =
    event.type === 'rotate'
      ? { plane: event.plane, angle: ((event.direction * Math.PI) / 2) * ease }
      : null;
  const center = (cells) =>
    [0, 1, 2].map((a) => cells.reduce((sum, v) => sum + v[a], 0) / cells.length);
  const from = center(event.from),
    to = center(event.to);
  return {
    rotation,
    cells: event.from.map((v) =>
      rotateVector(
        v.map((n, a) => n - from[a]),
        rotation,
      ).map((n, a) => n + from[a] + (to[a] - from[a]) * ease),
    ),
  };
}

// Shared, cached rounded-box patches: flat centers, curved edge bands, rounded corners.
const cubeCache = new Map();
export function cubeGeometry(mask = 0) {
  if (cubeCache.has(mask)) return cubeCache.get(mask);
  const cubeFaces = [];
  const stops = [-0.5, -0.45, 0.45, 0.5];
  for (let axis = 0; axis < 3; axis++)
    for (const sign of [-1, 1]) {
      const others = [0, 1, 2].filter((a) => a !== axis);
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          const vertices = [
            [i, j],
            [i + 1, j],
            [i + 1, j + 1],
            [i, j + 1],
          ].map(([u, v]) => {
            const p = [0, 0, 0];
            p[axis] = sign * 0.5;
            p[others[0]] = stops[u];
            p[others[1]] = stops[v];
            const inner = p.map((n, a) => {
              const connected = mask & (1 << (a * 2 + (n > 0 ? 1 : 0)));
              const edge = connected ? 0.5 : 0.45;
              return Math.max(-edge, Math.min(edge, n));
            });
            const delta = p.map((n, a) => n - inner[a]),
              length = Math.hypot(...delta);
            return length < 1e-10 ? p : inner.map((n, a) => n + (delta[a] / length) * 0.05);
          });
          const a = vertices[1].map((n, k) => n - vertices[0][k]);
          const b = vertices[3].map((n, k) => n - vertices[0][k]);
          const cross = [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0],
          ];
          const length = Math.hypot(...cross),
            outward = Math.sign(cross[axis]) * sign;
          if (length < 1e-10) continue;
          const normal = cross.map((n) => (n / length) * outward);
          cubeFaces.push({ axis, sign, vertices, normal, center: i === 1 && j === 1 });
        }
    }

  cubeCache.set(mask, cubeFaces);
  return cubeFaces;
}
export const cubeFaces = cubeGeometry();

export class Projection {
  constructor() {
    this.camera = { yaw: Math.PI / 4, pitch: 0.5 };
    this.dims = [8, 8, 18];
    this.flip = null;
    this.width = 320;
    this.height = 400;
    this.scale = 25;
    this.distance = 24;
    this.centerX = 160;
    this.centerY = 200;
    this.velocity = { x: 0, y: 0 };
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this._syncBasis();
  }
  _syncBasis() {
    const { yaw, pitch } = this.camera;
    const key = `${yaw},${pitch}`;
    if (this.basisKey === key) return;
    this.right = [Math.cos(yaw), -Math.sin(yaw), 0];
    this.down = [
      Math.sin(yaw) * Math.sin(pitch),
      Math.cos(yaw) * Math.sin(pitch),
      -Math.cos(pitch),
    ];
    this.eyeDirection = cross(this.right, this.down);
    this.basisKey = key;
  }
  setView(view) {
    this.stopOrbit();
    // A slightly offset eye keeps stacked cells apart, including the center column.
    if (view === 'top') this.camera = { yaw: 0.38, pitch: 1.28 };
    else if (view === 'front') this.camera = { yaw: 0, pitch: 0.16 };
    else if (view === 'side') this.camera = { yaw: Math.PI / 2, pitch: 0.16 };
    else this.camera = { yaw: Math.PI / 4, pitch: 0.5 };
    this._syncBasis();
    this.resetZoom();
  }

  rotateScreen(dx, dy) {
    this._syncBasis();
    const omega = this.right.map((n, i) => dy * 0.006 * n - dx * 0.008 * this.down[i]);
    const angle = Math.hypot(...omega);
    if (angle < 1e-12) return;
    const axis = omega.map((n) => n / angle),
      c = Math.cos(angle),
      s = Math.sin(angle);
    const rotate = (v) => {
      const perpendicular = cross(axis, v),
        parallel = dot(axis, v);
      return v.map((n, i) => n * c + perpendicular[i] * s + axis[i] * parallel * (1 - c));
    };
    this.eyeDirection = unit(rotate(this.eyeDirection));
    this.right = unit(rotate(this.right));
    this.down = unit(cross(this.eyeDirection, this.right));
    this.right = cross(this.down, this.eyeDirection);
    this.camera = {
      yaw: Math.atan2(this.eyeDirection[0], this.eyeDirection[1]),
      pitch: Math.atan2(
        this.eyeDirection[2],
        Math.hypot(this.eyeDirection[0], this.eyeDirection[1]),
      ),
    };
    this.basisKey = `${this.camera.yaw},${this.camera.pitch}`;
  }
  orbit(dx, dy, seconds = 1 / 60) {
    this.rotateScreen(dx, dy);
    const dt = Math.max(1 / 120, seconds);
    this.velocity = {
      x: Math.max(-480, Math.min(480, dx / dt)),
      y: Math.max(-480, Math.min(480, dy / dt)),
    };
  }
  stopOrbit() {
    this.velocity = { x: 0, y: 0 };
  }
  coast(seconds) {
    const decay = Math.exp(-14 * seconds);
    this.rotateScreen((this.velocity.x * (1 - decay)) / 14, (this.velocity.y * (1 - decay)) / 14);
    this.velocity.x *= decay;
    this.velocity.y *= decay;
    if (Math.hypot(this.velocity.x, this.velocity.y) < 1) this.stopOrbit();
  }
  resetZoom() {
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.stopOrbit();
  }
  magnify(factor, from = { x: this.width / 2, y: this.height / 2 }, to = from) {
    this._fit();
    const next = Math.max(0.75, Math.min(2.5, this.zoom * factor)),
      ratio = next / this.zoom;
    const oldCenter = { x: this.centerX, y: this.centerY };
    this.zoom = next;
    this._fit();
    this.pan.x = to.x - this.fitCenterX - ratio * (from.x - oldCenter.x);
    this.pan.y = to.y - this.fitCenterY - ratio * (from.y - oldCenter.y);
    this.stopOrbit();
    this._fit();
  }
  shiftView(dx, dy) {
    this.pan.x += dx;
    this.pan.y += dy;
    this._fit();
  }

  // Intersect screen rays with the grabbed cell's horizontal plane. Perspective
  // changes the size of a grid step with depth, so a single global scale is insufficient.
  planeDelta(dx, dy, anchor = this.dims.map((n) => n / 2)) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { x: 0, y: 0 };
    const start = this.project(anchor);
    const direction = this._direction();
    const right = this.right;
    const down = this.down;
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
    const matrix = right[0] * down[1] - right[1] * down[0];
    if (Math.abs(matrix) > 0.15)
      return {
        x: (sx * down[1] - sy * right[1]) / matrix,
        y: (sy * right[0] - sx * down[0]) / matrix,
      };
    // Damped least squares preserves the visible screen direction even after
    // orbiting introduces roll. Unobservable depth movement remains bounded.
    const a = right[0] ** 2 + down[0] ** 2 + 0.04;
    const b = right[0] * right[1] + down[0] * down[1];
    const c = right[1] ** 2 + down[1] ** 2 + 0.04;
    const x = right[0] * sx + down[0] * sy,
      y = right[1] * sx + down[1] * sy;
    return { x: (c * x - b * y) / (a * c - b * b), y: (a * y - b * x) / (a * c - b * b) };
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
    this._syncBasis();
    return [...this.eyeDirection];
  }
  _raw(point) {
    this._syncBasis();
    const local = this._rotate(point.map((v, axis) => v - this.dims[axis] / 2));
    return {
      x: dot(local, this.right),
      y: dot(local, this.down),
      depth: dot(local, this.eyeDirection),
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
    this.fitScale = Math.min(
      (this.width - margin * 2) / (maxX - minX),
      (this.height - 38) / (maxY - minY),
    );
    this.fitScale = Math.max(1, this.fitScale);
    this.scale = this.fitScale * this.zoom;
    this.fitCenterX = this.width / 2 - ((maxX + minX) * this.scale) / 2;
    this.fitCenterY = this.height / 2 - ((maxY + minY) * this.scale) / 2 - 1;
    const keep = Math.min(64, this.width / 4, this.height / 4);
    this.pan.x = Math.max(
      keep - (this.fitCenterX + maxX * this.scale),
      Math.min(this.width - keep - (this.fitCenterX + minX * this.scale), this.pan.x),
    );
    this.pan.y = Math.max(
      keep - (this.fitCenterY + maxY * this.scale),
      Math.min(this.height - keep - (this.fitCenterY + minY * this.scale), this.pan.y),
    );
    this.centerX = this.fitCenterX + this.pan.x;
    this.centerY = this.fitCenterY + this.pan.y;
  }
}
