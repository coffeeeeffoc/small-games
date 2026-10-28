import { BIOMES, SEGMENT_LENGTH } from './content.mjs';
import { clamp, mix, eventX, segmentScene } from './core.mjs';
const hex = (value) =>
  value.startsWith('rgb')
    ? value
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number)
    : value.match(/\w\w/g).map((v) => parseInt(v, 16));
const color = (a, b, t) => {
  const x = hex(a),
    y = hex(b);
  return `rgb(${x.map((v, i) => Math.round(mix(v, y[i], t))).join(',')})`;
};
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let w = 844,
    h = 390;
  function resize(width, height) {
    w = width;
    h = height;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function polygon(points, fill, stroke) {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }
  function line(points, stroke, width = 1) {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  function tree(x, y, size, tint) {
    polygon(
      [
        [x - size * 0.13, y],
        [x + size * 0.13, y],
        [x + size * 0.08, y - size],
        [x - size * 0.07, y - size],
      ],
      '#5c6a57',
    );
    for (let j = 0; j < 3; j++)
      polygon(
        [
          [x, y - size * (1.7 - j * 0.34)],
          [x - size * (0.45 + j * 0.1), y - size * (0.7 - j * 0.25)],
          [x + size * (0.45 + j * 0.1), y - size * (0.7 - j * 0.25)],
        ],
        tint,
      );
  }
  function mountains(palette, t) {
    const gradient = ctx.createLinearGradient(0, 0, 0, h * 0.7);
    gradient.addColorStop(0, palette.sky);
    gradient.addColorStop(1, palette.haze);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.arc(w * 0.76, h * 0.105, h * 0.085, 0, Math.PI * 2);
    ctx.fill();
    for (let layer = 0; layer < 3; layer++) {
      const bottom = h * (0.52 + layer * 0.09),
        points = [[0, bottom]];
      for (let i = -1; i < 14; i++) {
        const x = (i * w) / 11 + Math.sin(i * 3 + layer) * w * 0.035;
        const y =
          h * (0.28 + layer * 0.045) -
          Math.abs(Math.sin(i * 1.8 + layer * 2)) * h * (0.23 - layer * 0.04);
        points.push([x, y]);
      }
      points.push([w, bottom]);
      polygon(points, color(palette.haze, palette.dark, 0.28 + layer * 0.2));
      if (layer === 0)
        for (let i = 2; i < points.length - 2; i++) {
          const [x, y] = points[i],
            prev = points[i - 1],
            next = points[i + 1];
          if (y < prev[1] && y < next[1])
            polygon(
              [
                [x, y],
                [mix(x, next[0], 0.4), mix(y, next[1], 0.4)],
                [x + 5, y + 12],
                [x - 8, y + 7],
                [mix(x, prev[0], 0.4), mix(y, prev[1], 0.4)],
              ],
              '#e5ecdc',
            );
        }
    }
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = '#effbe8';
      ctx.beginPath();
      ctx.ellipse(
        ((i * 0.19 + t * 0.001) % 1.4) * w - w * 0.2,
        h * (0.32 + (i % 3) * 0.025),
        w * 0.14,
        h * 0.02,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function draw(state, screen = 'play', reduced = false) {
    const menu =
      screen === 'home' || screen === 'routes' || screen === 'settings' || screen === 'help';
    const distance = menu ? 90 : state.distance;
    const local = distance % SEGMENT_LENGTH;
    const scene = menu ? 'snow' : state.scene;
    const source = BIOMES[scene],
      next =
        Number.isFinite(state.total) && state.total - distance < SEGMENT_LENGTH
          ? source
          : BIOMES[
              segmentScene(state.seed, Math.floor(distance / SEGMENT_LENGTH) + 1, state.routeId)
            ];
    const blend = menu ? 0 : clamp((local - 190) / 50, 0, 1);
    const palette = Object.fromEntries(
      ['sky', 'haze', 'road', 'edge', 'dark', 'accent'].map((k) => [
        k,
        color(source[k], next[k], blend),
      ]),
    );
    // color() takes hex; backgrounds use an already blended palette without recoloring RGB strings.

    mountains(palette, reduced ? 0 : distance);
    if (blend > 0) {
      ctx.globalAlpha = Math.sin(blend * Math.PI) * 0.16;
      ctx.fillStyle = next.haze;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    const px = menu ? 0.4 : state.x;
    const currentCurve = state.segments.find((s) => s.index === state.segmentIndex)?.curve ?? 0.3;
    const nextCurve =
      state.segments.find((s) => s.index === state.segmentIndex + 1)?.curve ?? currentCurve;
    const curve = mix(currentCurve, nextCurve, blend);
    const horizon = h * 0.38;
    const project = (x, d) => {
      const scale = 1 / (1 + Math.max(-7, d) * 0.035);
      return {
        x:
          w * 0.5 +
          (x - px * 0.3) * w * 0.46 * scale +
          Math.sin(d * 0.009) * curve * w * 0.16 * (1 - scale),
        y: horizon + h * 0.47 * scale,
        scale,
      };
    };
    const proj = (x, d) => {
      const p = project(x, d);
      return [p.x, p.y];
    };
    // Layered valley below the route; ocean uses horizontal foam, air gets floating clouds.
    ctx.fillStyle = palette.dark;
    ctx.fillRect(0, h * 0.54, w, h * 0.46);
    const oceanWeight =
      (source === BIOMES.ocean ? 1 - blend : 0) + (next === BIOMES.ocean ? blend : 0);
    const fallsWeight =
      (source === BIOMES.falls ? 1 - blend : 0) + (next === BIOMES.falls ? blend : 0);
    if (oceanWeight > 0) {
      ctx.globalAlpha = oceanWeight;
      for (let i = 0; i < 14; i++) {
        const y = h * 0.48 + i * i * h * 0.0025;
        line(
          [
            [0, y],
            [w * 0.3, y + Math.sin(distance * 0.025 + i) * 5],
            [w, y],
          ],
          '#65cabc',
          1 + i * 0.13,
        );
      }
    }
    ctx.globalAlpha = 1;
    if (fallsWeight > 0) {
      ctx.globalAlpha = fallsWeight;
      for (const x of [0.08, 0.18, 0.76, 0.88]) {
        const g = ctx.createLinearGradient(0, h * 0.25, 0, h);
        g.addColorStop(0, '#d9f2e9');
        g.addColorStop(1, '#61c3c9');
        ctx.fillStyle = g;
        ctx.fillRect(w * x, h * 0.3, w * 0.025, h * 0.7);
      }
    }
    ctx.globalAlpha = 1;
    for (let d = 170; d >= -12; d -= 3) {
      const absolute = distance + d;
      const biome =
        BIOMES[
          segmentScene(
            state.seed,
            Math.max(0, Math.floor(absolute / SEGMENT_LENGTH)),
            menu ? 'snowline' : state.routeId,
          )
        ];
      const a = project(-1, d),
        b = project(1, d),
        c = project(1, d + 3),
        e = project(-1, d + 3);
      const shade = Math.floor(absolute / 12) % 2;
      const road = shade ? biome.road : color(biome.road, biome.dark, 0.06);
      polygon(
        [
          [a.x, a.y],
          [b.x, b.y],
          [c.x, c.y - 1],
          [e.x, e.y - 1],
        ],
        road,
      );
      for (const side of [-1, 1])
        polygon(
          [proj(side, d), proj(side * 1.08, d), proj(side * 1.08, d + 3), proj(side, d + 3)],
          biome.edge,
        );
      if (Math.floor(absolute / 6) % 3 === 0)
        for (const side of [-0.84, 0.84])
          line(
            [proj(side, d), proj(side, d + 3)],
            biome.vehicle === 'glider' ? '#f6f4d2' : '#fdf5d7',
            Math.max(1, a.scale * 2),
          );
      if (biome.vehicle === 'glider' && Math.floor(absolute) % 24 < 3)
        line([proj(-0.65, d), proj(0, d - 2), proj(0.65, d)], '#efffdf', Math.max(1, a.scale * 2));
    }
    // Geometry beside the route shares perspective and forward motion with obstacles.
    for (let i = Math.floor((distance + 170) / 18); i >= Math.floor(distance / 18); i--) {
      const d = i * 18 - distance;
      const side = i % 2 ? 1 : -1;
      const p = project(side * (1.3 + Math.abs(Math.sin(i)) * 1.1), d);
      const s = h * 0.13 * p.scale;
      const scenery = segmentScene(
        state.seed,
        Math.floor((i * 18) / SEGMENT_LENGTH),
        menu ? 'snowline' : state.routeId,
      );
      if (scenery === 'snow' || scenery === 'forest')
        tree(p.x, p.y, s, scenery === 'forest' ? '#245951' : '#315e59');
      else if (scenery === 'ocean') {
        polygon(
          [
            [p.x - s, p.y],
            [p.x - s * 0.3, p.y - s],
            [p.x + s * 0.3, p.y - s * 0.8],
            [p.x + s, p.y],
          ],
          '#396972',
        );
      } else {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#e4f0dd';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, s * 2, s * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    const events = state.segments
      .flatMap((s) => s.events)
      .filter((e) => e.z - distance > -3 && e.z - distance < 165)
      .sort((a, b) => b.z - a.z);
    for (const event of events) {
      if (event.passed) continue;
      const d = event.z - distance;
      const x = eventX(event, distance);
      const p = project(x, d);
      const s = w * 0.46 * p.scale;
      const opacity = clamp((165 - d) / 28, 0, 1);
      ctx.globalAlpha = opacity;
      if (event.type === 'rock') {
        const r = event.radius * s;
        ctx.fillStyle = '#122d35';
        ctx.globalAlpha *= 0.23;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 3, r * 1.2, r * 0.23, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = opacity;
        polygon(
          [
            [p.x - r, p.y],
            [p.x - r * 0.7, p.y - r * 0.9],
            [p.x + r * 0.15, p.y - r * 1.3],
            [p.x + r, p.y - r * 0.6],
            [p.x + r * 0.85, p.y],
          ],
          '#cd704f',
        );
        polygon(
          [
            [p.x - r * 0.7, p.y - r * 0.9],
            [p.x + r * 0.15, p.y - r * 1.3],
            [p.x + r * 0.25, p.y - r * 0.3],
            [p.x - r, p.y],
          ],
          '#f4a46e',
        );
        polygon(
          [
            [p.x + r * 0.15, p.y - r * 1.3],
            [p.x + r, p.y - r * 0.6],
            [p.x + r * 0.85, p.y],
            [p.x + r * 0.25, p.y - r * 0.3],
          ],
          '#a95342',
        );
        if (event.moving)
          line(
            [
              [p.x - r * 1.6, p.y - r * 1.6],
              [p.x + r * 1.6, p.y - r * 1.6],
            ],
            '#ffcb77',
            2 * p.scale,
          );
      } else if (event.type === 'gate') {
        const r = event.radius * s;
        const height = s * 0.58;
        ctx.strokeStyle = '#f9bd65';
        ctx.lineWidth = Math.max(2, 5 * p.scale);
        ctx.beginPath();
        ctx.moveTo(p.x - r, p.y);
        ctx.lineTo(p.x - r, p.y - height * 0.6);
        ctx.quadraticCurveTo(p.x, p.y - height * 1.35, p.x + r, p.y - height * 0.6);
        ctx.lineTo(p.x + r, p.y);
        ctx.stroke();
        line(
          [
            [p.x - r, p.y],
            [p.x + r, p.y],
          ],
          '#f9bd65',
          3 * p.scale,
        );
        const font = Math.max(10, 22 * p.scale);
        ctx.font = `700 ${font}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff3d4';
        ctx.fillText('≤18', p.x, p.y - height * 0.75);
        if (d < 65) {
          ctx.font = `600 ${Math.max(10, 12 * p.scale)}px sans-serif`;
          ctx.fillText('对准 · 减速', p.x, p.y - height * 0.48);
        }
      } else {
        const r = Math.max(2, s * 0.045);
        polygon(
          [
            [p.x, p.y - r * 2.5],
            [p.x + r, p.y - r],
            [p.x, p.y],
            [p.x - r, p.y - r],
          ],
          '#c2ffdf',
          '#f5ffe2',
        );
      }
    }
    ctx.globalAlpha = 1;
    const p = project(px, 0),
      r = Math.max(12, h * 0.047);
    const bob = reduced ? 0 : Math.sin(distance * 0.27) * 1.5;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.rotate(clamp(state.vx, -1, 1) * 0.12);
    ctx.fillStyle = '#082f3b66';
    ctx.beginPath();
    ctx.ellipse(0, 7, r * 1.2, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!menu && state.vehicle === 'glider') {
      polygon(
        [
          [-r * 3, -r * 0.6],
          [0, -r * 1.7],
          [r * 3, -r * 0.6],
          [r * 0.3, 0],
          [-r * 0.3, 0],
        ],
        '#a4f7d5',
        '#f5f5cb',
      );
      polygon(
        [
          [0, -r * 1.7],
          [0, -r * 0.1],
          [r * 3, -r * 0.6],
        ],
        '#52b9b0',
      );
    } else {
      polygon(
        [
          [-r * 0.65, r * 0.2],
          [-r * 0.5, -r * 0.4],
          [r * 0.6, -r * 0.55],
          [r * 0.8, r * 0.2],
          [0, r * 0.5],
        ],
        '#95efcf',
        '#ecffd5',
      );
      if (!menu && state.vehicle === 'surf') {
        line(
          [
            [-r * 1.5, r * 0.5],
            [-r * 0.6, r * 0.1],
          ],
          '#e8fff5',
          3,
        );
        line(
          [
            [r * 0.9, r * 0.4],
            [r * 1.5, r * 0.7],
          ],
          '#e8fff5',
          3,
        );
      }
    }
    line(
      [
        [-r * 0.45, -r * 0.1],
        [-r * 0.2, -r * 1.2],
        [r * 0.2, -r * 1.6],
        [r * 0.55, -r * 0.1],
      ],
      '#1e353b',
      r * 0.28,
    );
    polygon(
      [
        [-r * 0.5, -r * 2],
        [r * 0.25, -r * 2.3],
        [r * 0.6, -r * 1],
        [0, -r * 0.8],
      ],
      '#ea9160',
    );
    polygon(
      [
        [r * 0.1, -r * 2.15],
        [r * 1.8, -r * 1.45],
        [r * 0.6, -r * 0.9],
        [0, -r * 1.4],
      ],
      '#f6b16c',
    );
    line(
      [
        [-r * 0.2, -r * 1.8],
        [-r * 0.9, -r * 1.2],
        [-r * 1, -r * 0.8],
      ],
      '#1b454c',
      r * 0.2,
    );
    ctx.fillStyle = '#153f4a';
    ctx.beginPath();
    ctx.arc(-r * 0.05, -r * 2.6, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    line(
      [
        [-r * 0.32, -r * 2.7],
        [r * 0.28, -r * 2.75],
      ],
      '#8bded3',
      r * 0.14,
    );
    ctx.restore();
    if (state.edgeTime > 0 && !menu) {
      ctx.strokeStyle = `rgba(255,107,84,${clamp(state.edgeTime * 4, 0, 0.8)})`;
      ctx.lineWidth = 16;
      ctx.strokeRect(0, 0, w, h);
    }
    const vignette = ctx.createLinearGradient(0, 0, 0, h);
    vignette.addColorStop(0, '#062e3e66');
    vignette.addColorStop(0.3, '#082d3600');
    vignette.addColorStop(1, '#072b3944');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }
  return { resize, draw };
}
