// Dependency-free, orthographic 3D renderer. All game coordinates use Z as up.
const TAU = Math.PI * 2;
const MINT = '#6df7d6';
const CYAN = '#68dcff';
const AXES = ['x', 'y', 'z'];
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
    value?.x || value?.width || 5,
    value?.y || value?.depth || 5,
    value?.z || value?.height || 10,
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

function gravityAxis(gravity) {
  if (Array.isArray(gravity)) {
    const axis = gravity.findIndex((v) => v !== 0);
    return { axis: axis < 0 ? 2 : axis, sign: gravity[axis] < 0 ? -1 : 1 };
  }
  if (gravity && typeof gravity === 'object') {
    if (gravity.axis !== undefined)
      return {
        axis:
          typeof gravity.axis === 'number' ? gravity.axis : Math.max(0, AXES.indexOf(gravity.axis)),
        sign: gravity.sign ?? gravity.direction ?? -1,
      };
    return gravityAxis([gravity.x || 0, gravity.y || 0, gravity.z || 0]);
  }
  if (typeof gravity === 'string') {
    const axis = AXES.indexOf(gravity.toLowerCase().replace(/[^xyz]/g, ''));
    return { axis: axis < 0 ? 2 : axis, sign: gravity.includes('+') ? 1 : -1 };
  }
  return { axis: 2, sign: -1 };
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
    this.camera = { yaw: Math.PI / 4, pitch: 0.36 };
    this.dims = [5, 5, 10];
    this.width = 320;
    this.height = 400;
    this.scale = 25;
    this.centerX = 160;
    this.centerY = 200;
    this.disposed = false;
  }

  setView(view) {
    if (view === 'top') this.camera = { yaw: 0, pitch: Math.PI / 2 };
    else if (view === 'front') this.camera = { yaw: 0, pitch: 0.035 };
    else if (view === 'side') this.camera = { yaw: Math.PI / 2, pitch: 0.035 };
    else this.camera = { yaw: Math.PI / 4, pitch: 0.36 };
  }

  orbit(dx, dy) {
    this.camera.yaw = (this.camera.yaw + dx * 0.008) % TAU;
    this.camera.pitch = Math.max(0.04, Math.min(Math.PI / 2, this.camera.pitch + dy * 0.006));
  }

  _raw(point) {
    const [x, y, z] = point.map((v, axis) => v - this.dims[axis] / 2);
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
    const margin = this.width < 300 ? 19 : 28;
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

  _container(gravity, front = false) {
    const ctx = this.ctx;
    const direction = [
      Math.sin(this.camera.yaw) * Math.cos(this.camera.pitch),
      Math.cos(this.camera.yaw) * Math.cos(this.camera.pitch),
      Math.sin(this.camera.pitch),
    ];
    const landing = gravityAxis(gravity);
    for (let axis = 0; axis < 3; axis++) {
      const near = direction[axis] >= 0 ? this.dims[axis] : 0;
      const coordinate = front ? near : this.dims[axis] - near;
      const isLanding =
        axis === landing.axis && coordinate === (landing.sign < 0 ? 0 : this.dims[axis]);
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
            this._line(
              from,
              to,
              isLanding ? 'rgba(98,222,197,.19)' : 'rgba(104,161,187,.15)',
              0.65,
            );
          }
        }
      }
      if (isLanding) {
        polygon(ctx, plane);
        ctx.strokeStyle = 'rgba(111,246,216,.59)';
        ctx.lineWidth = 1.2;
        ctx.shadowColor = MINT;
        ctx.shadowBlur = 7;
        ctx.stroke();
        ctx.shadowBlur = 0;
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
      ctx.strokeStyle = front ? 'rgba(164,215,227,.46)' : 'rgba(129,186,207,.33)';
      ctx.stroke();
    });
  }

  _cubeFaces(cells, type, faces) {
    const direction = [
      Math.sin(this.camera.yaw) * Math.cos(this.camera.pitch),
      Math.cos(this.camera.yaw) * Math.cos(this.camera.pitch),
      Math.sin(this.camera.pitch),
    ];
    for (const cell of cells || []) {
      const pos = position(cell);
      if (pos.some((v) => !Number.isFinite(v))) continue;
      const opacity = Number.isFinite(cell.opacity) ? Math.max(0, Math.min(1, cell.opacity)) : 1;
      if (opacity === 0) continue;
      const rgb = color(type === 'active' ? CYAN : cell.color || MINT);
      const gap = type === 'ghost' ? 0.026 : 0.035;
      for (const face of FACES) {
        if (direction[face.axis] * face.sign < 0.001) continue;
        const vertices = face.vertices.map((vertex) =>
          this.project(pos.map((v, a) => v + gap + vertex[a] * (1 - gap * 2))),
        );
        faces.push({
          vertices,
          rgb,
          opacity,
          shade: face.shade,
          type,
          depth: vertices.reduce((sum, v) => sum + v.depth, 0) / 4,
        });
      }
    }
  }

  _drawFaces(faces, time) {
    const ctx = this.ctx;
    faces.sort((a, b) => a.depth - b.depth);
    for (const face of faces) {
      ctx.globalAlpha = face.opacity;
      polygon(ctx, face.vertices);
      if (face.type === 'ghost') {
        ctx.fillStyle = 'rgba(102,247,211,.045)';
        ctx.fill();
        ctx.strokeStyle = `rgba(135,255,225,${0.58 + Math.sin(time * 0.003) * 0.12})`;
        ctx.lineWidth = 1;
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
      gradient.addColorStop(
        0,
        rgba(face.rgb, active ? 0.88 : 0.88, face.shade * (active ? 1.1 : 0.86)),
      );
      gradient.addColorStop(1, rgba(face.rgb, active ? 0.78 : 0.94, face.shade * 0.59));
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = active ? 'rgba(184,247,255,.96)' : rgba(face.rgb, 0.78, 1.22);
      ctx.lineWidth = active ? 1.05 : 0.85;
      ctx.shadowColor = active ? CYAN : rgba(face.rgb, 0.5);
      ctx.shadowBlur = active ? 7 : 0;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // A slim glass bevel keeps adjacent cells readable, even in a dense stack.
      if (this.scale > 17) {
        const center = face.vertices.reduce((p, v) => ({ x: p.x + v.x / 4, y: p.y + v.y / 4 }), {
          x: 0,
          y: 0,
        });
        polygon(
          ctx,
          face.vertices.map((v) => ({
            x: v.x + (center.x - v.x) * 0.095,
            y: v.y + (center.y - v.y) * 0.095,
          })),
        );
        ctx.lineWidth = 0.55;
        ctx.strokeStyle = active ? 'rgba(218,255,255,.25)' : 'rgba(231,255,255,.12)';
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
    gravity = [0, 0, -1],
    dims = [5, 5, 10],
    time = 0,
    particles = [],
  } = {}) {
    if (this.disposed || !this.ctx) return;
    const { width, height, ratio } = resize(this.canvas);
    this.width = width;
    this.height = height;
    this.dims = dimensions(dims);
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
    this._container(gravity);
    const faces = [];
    this._cubeFaces(board, 'board', faces);
    this._cubeFaces(ghost, 'ghost', faces);
    this._cubeFaces(active, 'active', faces);
    this._drawFaces(faces, time);
    this._container(gravity, true);
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
      ctx.fillStyle = rgba(face.rgb, 0.85, face.shade * 0.86);
      ctx.fill();
      ctx.strokeStyle = rgba(face.rgb, 0.88, 1.24);
      ctx.lineWidth = 0.75;
      ctx.stroke();
    });
}
