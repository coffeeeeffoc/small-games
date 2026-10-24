// Original perspective math shared by the Cocos view and regression tests.
const TAU = Math.PI * 2;
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
}
