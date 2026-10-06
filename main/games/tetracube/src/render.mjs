// Dependency-free, orthographic 3D renderer. All game coordinates use Z as up.
const TAU = Math.PI * 2;
const MINT = '#6df7d6';
const CYAN = '#68dcff';
const PALETTE = {
  cyan: CYAN,
  mint: MINT,
  amber: '#ffc96b',
  violet: '#bca5f6',
  blue: '#81acdf',
  coral: '#ff998d',
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
    value?.x || value?.width || 6,
    value?.y || value?.depth || 6,
    value?.z || value?.height || 12,
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
    this.dims = [6, 6, 12];
    this.flip = null;
    this.orientation = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    this.width = 320;
    this.height = 400;
    this.scale = 25;
    this.centerX = 160;
    this.centerY = 200;
    this.disposed = false;
  }

  setView(view) {
    if (view === 'top') this.camera = { yaw: 0, pitch: Math.PI / 2 };
    else if (view === 'front') this.camera = { yaw: 0, pitch: 0.16 };
    else if (view === 'side') this.camera = { yaw: Math.PI / 2, pitch: 0.16 };
    else this.camera = { yaw: Math.PI / 4, pitch: 0.5 };
  }

  orbit(dx, dy) {
    this.camera.yaw = (this.camera.yaw + dx * 0.008) % TAU;
    this.camera.pitch = Math.max(0.16, Math.min(Math.PI / 2, this.camera.pitch + dy * 0.006));
  }

  // Screen-space dragging maps to the current horizontal plane, independently of camera yaw.
  planeDelta(dx, dy) {
    const sx = (Number.isFinite(dx) ? dx : 0) / Math.max(1, this.scale);
    const sy = (Number.isFinite(dy) ? dy : 0) / Math.max(1, this.scale);
    const depth = sy / Math.max(0.12, Math.sin(this.camera.pitch));
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
    return {
      x: this.centerX + p.x * this.scale,
      y: this.centerY + p.y * this.scale,
      depth: p.depth,
    };
  }

  _corners(origin = [0, 0, 0], size = this.dims) {
    return Array.from({ length: 8 }, (_, i) =>
      this.project(origin.map((n, axis) => n + ((i >> axis) & 1) * size[axis])),
    );
  }

  _fit() {
    const corners = Array.from({ length: 8 }, (_, i) =>
      this._raw(this.dims.map((n, axis) => ((i >> axis) & 1) * n)),
    );
    const minX = Math.min(...corners.map((p) => p.x));
    const maxX = Math.max(...corners.map((p) => p.x));
    const minY = Math.min(...corners.map((p) => p.y));
    const maxY = Math.max(...corners.map((p) => p.y));
    // Fitting the transformed corners is continuous, including the remapped endpoint dimensions.
    const margin = 10;
    this.scale = Math.min(
      (this.width - margin * 2) / (maxX - minX),
      (this.height - 24) / (maxY - minY),
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
        ctx.fillStyle = isLanding ? 'rgba(55,177,158,.055)' : 'rgba(41,94,119,.035)';
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
            this._line(from, to, isLanding ? 'rgba(98,222,197,.25)' : 'rgba(117,175,194,.22)', 0.7);
          }
        }
      }
      if (isLanding) {
        polygon(ctx, plane);
        ctx.strokeStyle = 'rgba(111,246,216,.76)';
        ctx.lineWidth = 1.2;
        ctx.shadowColor = MINT;
        ctx.shadowBlur = 7;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      // Amber corner brackets remain attached to the original floor. They visibly travel to
      // the roof or side wall during a flip, making the container's orientation unambiguous.
      if (axis === markerAxis && coordinate === markerCoordinate) {
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
    ctx.lineWidth = 0.8;
    EDGES.forEach(([a, b]) => {
      const isNear = (corners[a].depth + corners[b].depth) / 2 > 0;
      if (isNear !== front) return;
      ctx.beginPath();
      ctx.moveTo(corners[a].x, corners[a].y);
      ctx.lineTo(corners[b].x, corners[b].y);
      ctx.strokeStyle = front ? 'rgba(170,228,240,.64)' : 'rgba(141,199,216,.46)';
      ctx.stroke();
    });
  }

  _cubeFaces(cells, type, faces) {
    const direction = this._direction();
    for (const cell of cells || []) {
      const pos = position(cell);
      if (pos.some((v) => !Number.isFinite(v))) continue;
      const rawSize = cell.scale ?? cell.opacity ?? 1;
      const size = Number.isFinite(rawSize) ? Math.max(0, Math.min(1, rawSize)) : 1;
      if (size === 0) continue;
      const rgb = color(cell.color || (type === 'active' ? MINT : CYAN));
      const side = (type === 'ghost' ? 0.95 : 0.972) * size;
      for (const face of FACES) {
        const normal = this._normal(face.axis, face.sign);
        if (normal.reduce((dot, value, i) => dot + value * direction[i], 0) < 0.001) continue;
        const vertices = face.vertices.map((vertex) =>
          this.project(pos.map((v, a) => v + 0.5 + (vertex[a] - 0.5) * side)),
        );
        faces.push({
          vertices,
          rgb,
          shade: 0.75 + normal[2] * 0.25 + normal[0] * 0.07 - normal[1] * 0.04,
          type,
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
      const active = face.type === 'active';
      const y = face.vertices.map((p) => p.y);
      const gradient = ctx.createLinearGradient(0, Math.min(...y), 0, Math.max(...y) + 1);
      gradient.addColorStop(0, rgba(face.rgb, 1, face.shade * (active ? 1.12 : 1.04)));
      gradient.addColorStop(1, rgba(face.rgb, 1, face.shade * 0.88));
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = rgba(face.rgb, 1, active ? 1.3 : 1.16);
      ctx.lineWidth = active ? 1.05 : 0.8;
      ctx.shadowColor = rgba(face.rgb, 1);
      ctx.shadowBlur = active ? 2.5 : 0;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // A small solid bevel distinguishes adjacent cells without showing the grid through them.
      if (this.scale > 17) {
        const center = face.vertices.reduce((p, v) => ({ x: p.x + v.x / 4, y: p.y + v.y / 4 }), {
          x: 0,
          y: 0,
        });
        polygon(
          ctx,
          face.vertices.map((v) => ({
            x: v.x + (center.x - v.x) * 0.045,
            y: v.y + (center.y - v.y) * 0.045,
          })),
        );
        ctx.lineWidth = 0.55;
        ctx.strokeStyle = active ? 'rgba(238,255,250,.23)' : 'rgba(240,255,255,.13)';
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
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

  draw({
    board = [],
    active = [],
    ghost = [],
    dims = [6, 6, 12],
    flip = null,
    orientation = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    time = 0,
    particles = [],
  } = {}) {
    if (this.disposed || !this.ctx) return;
    const { width, height, ratio } = resize(this.canvas);
    this.width = width;
    this.height = height;
    this.dims = dimensions(dims);
    this.flip = flip && Number.isFinite(flip.angle) ? flip : null;
    this.orientation = orientation;
    this._fit();
    const ctx = this.ctx;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(
      width * 0.5,
      height * 0.66,
      0,
      width * 0.5,
      height * 0.66,
      Math.max(width, height) * 0.56,
    );
    glow.addColorStop(0, 'rgba(27,117,133,.085)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    this._container();
    const faces = [];
    this._cubeFaces(board, 'board', faces);
    this._cubeFaces(ghost, 'ghost', faces);
    this._cubeFaces(active, 'active', faces);
    this._drawFaces(faces, time);
    this._container(true);
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
      ctx.fillStyle = rgba(face.rgb, 1, face.shade);
      ctx.fill();
      ctx.strokeStyle = rgba(face.rgb, 1, 1.24);
      ctx.lineWidth = 0.75;
      ctx.stroke();
    });
}
