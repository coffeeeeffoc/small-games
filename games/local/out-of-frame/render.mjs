/**
 * Original, resolution-independent Canvas artwork for the temporal field lab.
 * All drawing is in the 960 × 540 simulation coordinate system. No game state
 * is changed here; the engine is the sole authority on observation and time.
 */

const W = 960;
const H = 540;
const INK = '#102d34';
const MINT = '#a9ead5';
const CREAM = '#efe9d7';
const AMBER = '#efc789';
const CORAL = '#ef927b';
const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif';

function box(ctx, x, y, w, h, radius = 0, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), radius);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function line(ctx, points, color, width = 1) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (const point of points.slice(1)) ctx.lineTo(point[0], point[1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function polygon(ctx, points, fill) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (const point of points.slice(1)) ctx.lineTo(point[0], point[1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function circle(ctx, x, y, r, fill, stroke) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function label(ctx, text, x, y, size = 12, color = CREAM, align = 'left', weight = 500) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function diamond(ctx, x, y, size, color) {
  polygon(
    ctx,
    [
      [x, y - size],
      [x + size, y],
      [x, y + size],
      [x - size, y],
    ],
    color,
  );
}

function activeIcon(ctx, x, y, active, color, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  if (active) {
    polygon(
      ctx,
      [
        [-3, -5],
        [5, 0],
        [-3, 5],
      ],
      color,
    );
  } else {
    // Deliberately drawn rectangles, never a font-dependent pause character.
    box(ctx, -5, -5, 3, 10, 0.8, color);
    box(ctx, 2, -5, 3, 10, 0.8, color);
  }
  ctx.restore();
}

function background(ctx, level) {
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, '#12383e');
  gradient.addColorStop(0.58, '#102c33');
  gradient.addColorStop(1, '#0a1e26');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  // Subtle drafting paper and building structure stay behind all colliders.
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 24; x < W; x += 32) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
  }
  for (let y = 20; y < H; y += 32) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
  }
  ctx.strokeStyle = 'rgba(144,198,188,0.035)';
  ctx.stroke();

  ctx.save();
  ctx.lineWidth = 1;
  for (const [x, width] of [
    [54, 192],
    [277, 188],
    [498, 188],
    [717, 188],
  ]) {
    box(ctx, x, 71, width, 326, 3, 'rgba(8,26,31,0.12)', 'rgba(174,215,199,0.055)');
    line(
      ctx,
      [
        [x + 8, 86],
        [x + width - 8, 86],
      ],
      'rgba(174,215,199,0.06)',
    );
    line(
      ctx,
      [
        [x + width / 2, 89],
        [x + width / 2, 387],
      ],
      'rgba(174,215,199,0.035)',
    );
    for (let i = 0; i < 3; i++) box(ctx, x + 13 + i * 9, 80, 4, 2, 1, '#36534f');
  }

  // A large schematic dial gives the laboratory its own architectural motif.
  ctx.translate(768, 192);
  for (const radius of [67, 87, 102]) circle(ctx, 0, 0, radius, null, 'rgba(160,206,189,0.065)');
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12;
    line(
      ctx,
      [
        [Math.cos(a) * 95, Math.sin(a) * 95],
        [Math.cos(a) * 101, Math.sin(a) * 101],
      ],
      'rgba(168,212,193,0.11)',
    );
  }
  diamond(ctx, 0, 0, 25, 'rgba(165,205,186,0.035)');
  ctx.restore();

  label(
    ctx,
    `${String(level.number ?? 1).padStart(2, '0')}  /  CHAMBER`,
    31,
    30,
    10,
    '#72968f',
    'left',
    650,
  );
  line(
    ctx,
    [
      [31, 47],
      [117, 47],
    ],
    '#45645f',
  );
  label(ctx, '局部时间实验室', 929, 29, 10, '#72968f', 'right');

  // The void remains visually distinct from actual, bright-edged platforms.
  const voidGradient = ctx.createLinearGradient(0, 445, 0, H);
  voidGradient.addColorStop(0, 'rgba(7,20,27,0)');
  voidGradient.addColorStop(1, 'rgba(5,16,22,0.72)');
  ctx.fillStyle = voidGradient;
  ctx.fillRect(0, 445, W, 95);
  for (let x = 20; x < W; x += 48) {
    line(
      ctx,
      [
        [x, 523],
        [x + 10, 513],
      ],
      'rgba(130,176,165,0.08)',
      2,
    );
  }
}

function fieldLight(ctx, frame) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(frame.x, frame.y, frame.w, frame.h);
  ctx.clip();
  const light = ctx.createLinearGradient(frame.x, frame.y, frame.x + frame.w, frame.y + frame.h);
  light.addColorStop(0, 'rgba(159,220,180,0.105)');
  light.addColorStop(1, 'rgba(229,192,131,0.045)');
  ctx.fillStyle = light;
  ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
  for (let x = Math.ceil(frame.x / 32) * 32 + 24; x < frame.x + frame.w; x += 32) {
    for (let y = Math.ceil(frame.y / 32) * 32 + 20; y < frame.y + frame.h; y += 32) {
      circle(ctx, x, y, 0.65, 'rgba(223,239,205,0.17)');
    }
  }
  ctx.restore();
}

function drawWires(ctx, state) {
  for (const gate of state.gates ?? []) {
    for (const [index, required] of (gate.requires ?? []).entries()) {
      const source = (state.switches ?? []).find((item) => item.id === required);
      if (!source) continue;
      const sx = source.x + source.w / 2;
      const sy = source.y + source.h + 10;
      const gx = gate.x + gate.w / 2;
      const wireY = Math.min(H - 29, Math.max(sy + 20, gate.y + gate.h + 22) + index * 7);
      ctx.save();
      ctx.setLineDash(source.pressed ? [] : [3, 5]);
      line(
        ctx,
        [
          [sx, sy],
          [sx, wireY],
          [gx, wireY],
          [gx, gate.y + gate.h / 2],
        ],
        source.pressed ? '#659c82' : '#385552',
        1.5,
      );
      ctx.restore();
      circle(ctx, sx, sy, 2, source.pressed ? MINT : '#59766b');
      circle(ctx, gx, wireY, 2.5, source.pressed ? MINT : '#59766b');
    }
  }
}

function drawPaths(ctx, objects) {
  ctx.save();
  for (const object of objects) {
    if (!object.path || object.path.length < 2) continue;
    const color = object.active ? 'rgba(237,199,137,0.30)' : 'rgba(160,209,202,0.21)';
    const points = object.path.map((point) => [point.x + object.w / 2, point.y + object.h / 2]);
    ctx.setLineDash([3, 6]);
    line(ctx, points, color);
    ctx.setLineDash([]);
    for (const point of [points[0], points[points.length - 1]]) {
      circle(ctx, point[0], point[1], 4, '#17373c', color);
      circle(ctx, point[0], point[1], 1, color);
    }
  }
  ctx.restore();
}

function drawHazard(ctx, hazard) {
  const { x, y, w, h } = hazard;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  box(ctx, x, y, w, h, 0, 'rgba(239,146,123,0.18)');
  for (let offset = -h; offset < w; offset += 18) {
    line(
      ctx,
      [
        [x + offset, y + h],
        [x + offset + h, y],
      ],
      'rgba(239,146,123,0.45)',
      4,
    );
  }
  line(
    ctx,
    [
      [x, y + 2],
      [x + w, y + 2],
    ],
    CORAL,
    3,
  );
  ctx.restore();
}

// A drag shows the exact observation point and each pressure plate's usable
// range. These marks follow the engine's core/feet rule rather than body edges.
function drawPlacementGuides(ctx, state) {
  ctx.save();
  ctx.lineWidth = 1.5;
  for (const object of state.objects) {
    const cx = object.x + object.w / 2;
    const cy = object.y + object.h / 2;
    const color = object.active ? AMBER : MINT;
    circle(ctx, cx, cy, 11, 'rgba(9,30,34,0.5)', color);
    diamond(ctx, cx, cy, 4, color);
  }
  for (const plate of state.switches) {
    const groundY = plate.y + plate.h;
    const color = plate.pressed ? MINT : 'rgba(239,199,137,0.65)';
    ctx.setLineDash([3, 5]);
    for (const edge of [plate.x, plate.x + plate.w]) {
      line(
        ctx,
        [
          [edge, groundY - 58],
          [edge, groundY - 12],
        ],
        color,
      );
    }
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawSolid(ctx, solid) {
  const { x, y, w, h } = solid;
  ctx.save();
  const fill = ctx.createLinearGradient(x, y, x, y + Math.min(h, 150));
  fill.addColorStop(0, '#355453');
  fill.addColorStop(1, '#172f35');
  box(ctx, x, y + 3, w, h - 3, 1, fill);
  box(ctx, x, y, w, Math.min(h, 5), 1, '#a5b7a6');
  box(ctx, x + 1, y + 5, Math.max(0, w - 2), Math.min(5, h - 5), 0, '#526c60');
  line(
    ctx,
    [
      [x + 0.5, y + 9],
      [x + 0.5, y + h],
    ],
    '#48645b',
  );
  line(
    ctx,
    [
      [x + w - 0.5, y + 9],
      [x + w - 0.5, y + h],
    ],
    '#0e252b',
  );
  ctx.beginPath();
  ctx.rect(x + 2, y + 10, Math.max(0, w - 4), Math.max(0, h - 11));
  ctx.clip();
  for (let i = x + 22; i < x + w; i += 56) {
    line(
      ctx,
      [
        [i, y + 12],
        [i, y + h - 7],
      ],
      'rgba(9,30,34,0.3)',
    );
    circle(ctx, i + 8, y + 16, 1.5, '#718779');
    if (h > 43) box(ctx, i + 10, y + 32, 22, 2, 1, 'rgba(113,145,126,0.12)');
  }
  // The lower inset panel is decoration, not another walkable ledge.
  if (h > 55)
    box(ctx, x + 10, y + 27, Math.max(0, w - 20), h - 38, 2, null, 'rgba(130,163,138,0.09)');
  ctx.restore();
}

function drawExit(ctx, exit, state) {
  if (!exit) return;
  const { x, y, w, h } = exit;
  const glow = ctx.createRadialGradient(x + w / 2, y + h / 2, 3, x + w / 2, y + h / 2, h * 0.8);
  glow.addColorStop(0, 'rgba(157,210,135,0.18)');
  glow.addColorStop(1, 'rgba(157,210,135,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - h / 2, y - 25, w + h, h + 50);
  box(ctx, x - 5, y - 4, w + 10, h + 5, 3, '#29483d', '#527e5d');
  box(ctx, x, y, w, h, 2, '#183e37');
  const interior = ctx.createLinearGradient(x, y, x + w, y);
  interior.addColorStop(0, '#39755b');
  interior.addColorStop(0.8, '#244d40');
  interior.addColorStop(1, '#17352f');
  box(ctx, x + 5, y + 5, w - 10, h - 8, 1, interior);
  line(
    ctx,
    [
      [x + 5, y + h - 3],
      [x + 5, y + 5],
      [x + w - 5, y + 5],
    ],
    '#a9d991',
    2,
  );
  box(ctx, x - 4, y - 21, w + 8, 15, 3, '#a9d991');
  label(ctx, 'EXIT', x + w / 2, y - 13, 9, '#224937', 'center', 800);
  const cx = x + w / 2;
  const cy = y + h * 0.5;
  line(
    ctx,
    [
      [cx - 9, cy],
      [cx + 8, cy],
      [cx + 2, cy - 6],
    ],
    '#c4e4a7',
    2,
  );
  line(
    ctx,
    [
      [cx + 8, cy],
      [cx + 2, cy + 6],
    ],
    '#c4e4a7',
    2,
  );
  box(ctx, x - 8, y + h - 3, w + 16, 4, 1, '#a7ba91');
  if (state.status === 'won') {
    ctx.save();
    ctx.globalAlpha = 0.75;
    circle(ctx, cx, cy, h * 0.65, null, MINT);
    ctx.restore();
  }
}

function drawGate(ctx, gate, switches) {
  const { x, y, w, h, open } = gate;
  const color = open ? '#9ed9ae' : '#d9a26d';
  box(ctx, x - 4, y - 7, w + 8, 8, 2, '#344f46', '#698069');
  box(ctx, x - 4, y + h - 1, w + 8, 5, 1, '#526851');
  if (open) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.setLineDash([2, 7]);
    line(
      ctx,
      [
        [x + w / 2, y + 8],
        [x + w / 2, y + h - 8],
      ],
      color,
      1,
    );
    ctx.restore();
    for (let i = 0; i < 2; i++)
      line(
        ctx,
        [
          [x + w / 2 - 5, y + 17 + i * 10],
          [x + w / 2, y + 12 + i * 10],
          [x + w / 2 + 5, y + 17 + i * 10],
        ],
        color,
        2,
      );
  } else {
    const fill = ctx.createLinearGradient(x, 0, x + w, 0);
    fill.addColorStop(0, '#9a704f');
    fill.addColorStop(0.5, '#b58a5e');
    fill.addColorStop(1, '#6a5240');
    box(ctx, x, y + 1, w, h - 2, 1, fill);
    for (let dy = 10; dy < h - 4; dy += 13) {
      line(
        ctx,
        [
          [x + 3, y + dy],
          [x + w - 3, y + dy - 4],
        ],
        '#58493d',
        3,
      );
    }
    line(
      ctx,
      [
        [x + 1, y + 1],
        [x + 1, y + h - 1],
      ],
      '#ecc796',
      1.5,
    );
  }
  const tag = (gate.requires ?? [])
    .map((id) => {
      const index = switches.findIndex((item) => item.id === id);
      return index >= 0 ? switches[index].label || String.fromCharCode(65 + index) : String(id);
    })
    .join(' + ');
  if (tag) {
    box(
      ctx,
      x + w / 2 - Math.max(12, tag.length * 4),
      y - 25,
      Math.max(24, tag.length * 8),
      15,
      3,
      '#213d37',
    );
    label(ctx, tag, x + w / 2, y - 17, 9, color, 'center', 650);
  }
  const requirements = gate.requires ?? [];
  for (const [index, required] of requirements.entries()) {
    const pressed = switches.find((item) => item.id === required)?.pressed;
    const indicatorX = x + w / 2 + (index - (requirements.length - 1) / 2) * 9;
    circle(ctx, indicatorX, y - 3, 2, pressed ? '#c8e69d' : '#cc9870');
  }
  if (!requirements.length) circle(ctx, x + w / 2, y - 3, 2, color);
}

function drawSwitch(ctx, item, index) {
  const { x, y, w, h, pressed } = item;
  const color = pressed ? '#c8e69d' : '#9eae90';
  if (pressed) {
    const glow = ctx.createRadialGradient(x + w / 2, y, 1, x + w / 2, y, w);
    glow.addColorStop(0, 'rgba(188,223,145,0.14)');
    glow.addColorStop(1, 'rgba(188,223,145,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - w / 2, y - w, w * 2, w * 2);
  }
  box(ctx, x - 2, y + 3, w + 4, Math.max(5, h - 1), 2, '#263c35', '#5a7362');
  box(ctx, x, y + (pressed ? 3 : 0), w, Math.max(3, h / 2), 2, color);
  line(
    ctx,
    [
      [x + 4, y + (pressed ? 3 : 0)],
      [x + w - 4, y + (pressed ? 3 : 0)],
    ],
    pressed ? '#e0f3bf' : '#c5cbae',
    1,
  );
  const tag = item.label || String.fromCharCode(65 + index);
  box(
    ctx,
    x + w / 2 - 10,
    y + h + 10,
    20,
    16,
    4,
    pressed ? '#aecd8a' : '#2c443b',
    pressed ? null : '#65745f',
  );
  label(ctx, tag, x + w / 2, y + h + 18, 10, pressed ? '#274535' : '#bcc7a7', 'center', 750);
}

function drawRobot(ctx, object, time, reducedMotion) {
  const { x, y, w, h, active } = object;
  const bright = active ? AMBER : MINT;
  const metal = active ? '#9c825a' : '#497f7a';
  const front = active ? '#d0a876' : '#83b6a8';
  const bounce = active && !reducedMotion ? Math.sin(time * 11) * 0.65 : 0;
  const center = { x: x + w / 2, y: y + h / 2 };
  ctx.save();
  // A truly flat top matches the engine's standable collision surface.
  box(ctx, x + 1, y, w - 2, 4, 1, bright);
  box(ctx, x + 2, y + 4, w - 4, h - 9, 4, metal, '#172f32');
  box(ctx, x + 4, y + 5 + bounce, w - 8, h - 16, 3, front);
  box(ctx, x + 6, y + 8 + bounce, w - 12, Math.max(6, h * 0.19), 2, '#223b3c');
  const eyeX = x + w * 0.5 + (object.direction === -1 ? -2 : 2);
  box(ctx, eyeX - 6, y + 10 + bounce, 3, 3, 1, bright);
  box(ctx, eyeX + 2, y + 10 + bounce, 3, 3, 1, bright);
  box(ctx, x - 2, y + h * 0.47, 4, h * 0.24, 2, metal);
  box(ctx, x + w - 2, y + h * 0.47, 4, h * 0.24, 2, metal);
  // The small, dark socket makes the exact observation point unmistakable.
  diamond(ctx, center.x, center.y, 6, '#214743');
  diamond(ctx, center.x, center.y, 3.6, bright);
  box(ctx, x + 2, y + h - 7, w - 4, 7, 3, '#102c30');
  for (let i = 0; i < 3; i++) {
    const wheelX = x + 7 + (i * (w - 14)) / 2;
    circle(ctx, wheelX, y + h - 3.5, 2.1, active ? '#a99067' : '#6faaa0');
    if (active && !reducedMotion)
      line(
        ctx,
        [
          [wheelX - Math.cos(time * 7) * 1.6, y + h - 3.5 - Math.sin(time * 7) * 1.6],
          [wheelX + Math.cos(time * 7) * 1.6, y + h - 3.5 + Math.sin(time * 7) * 1.6],
        ],
        '#24413e',
      );
  }
  box(ctx, center.x - 10, y - 23, 20, 16, 5, '#18393b', active ? '#9b8966' : '#51877c');
  activeIcon(ctx, center.x, y - 15, active, bright, 0.72);
  ctx.restore();
}

function drawPlatform(ctx, object) {
  const { x, y, w, h, active } = object;
  const bright = active ? AMBER : MINT;
  box(ctx, x, y + 1, w, Math.max(8, h - 1), 3, active ? '#7f7153' : '#4c7870', '#142e2f');
  box(ctx, x, y, w, 4, 1, bright);
  box(ctx, x + 5, y + 4, w - 10, Math.max(2, h - 7), 1, active ? '#3e493d' : '#274c48');
  for (let offset = 11; offset < w - 8; offset += 14) {
    line(
      ctx,
      [
        [x + offset, y + 5],
        [x + offset - 3, y + h - 3],
      ],
      active ? '#b4a177' : '#79a396',
      1.5,
    );
  }
  box(ctx, x + w / 2 - 9, y + h / 2 - 6, 18, 12, 3, '#24453f');
  diamond(ctx, x + w / 2, y + h / 2, 4, bright);
  box(ctx, x + w - 21, y - 20, 18, 15, 4, '#173536', active ? '#9b8966' : '#51877c');
  activeIcon(ctx, x + w - 12, y - 12.5, active, bright, 0.68);
  for (const footX of [x + 8, x + w - 16]) box(ctx, footX, y + h - 1, 8, 3, 1, '#375650');
}

function drawPlayer(ctx, player, time, reducedMotion, status) {
  if (!player) return;
  const { x, y, w, h } = player;
  const facing = player.facing === -1 ? -1 : 1;
  const walking = player.grounded && Math.abs(player.vx ?? 0) > 5 && !reducedMotion;
  const stride = walking ? Math.sin(time * 17) : 0;
  const bob = walking ? Math.abs(Math.cos(time * 17)) * 1.1 : 0;
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(facing, 1);
  if (player.grounded) {
    ctx.save();
    ctx.scale(1, 0.3);
    circle(ctx, 0, h / 2 / 0.3 + 2, 12, 'rgba(4,18,23,0.28)');
    ctx.restore();
  }
  // Boots and the split coat remain readable even at a small mobile scale.
  box(ctx, -7 - stride * 2, 8, 5, 10 - Math.max(0, stride) * 2, 2, '#283d40');
  box(ctx, 2 + stride * 2, 8, 5, 10 + Math.min(0, stride) * 2, 2, '#344747');
  box(ctx, -8 - stride * 2, h / 2 - 4 - Math.max(0, stride) * 2, 8, 4, 1, '#e5d4b2');
  box(ctx, 2 + stride * 2, h / 2 - 4 + Math.min(0, stride) * 2, 8, 4, 1, '#e5d4b2');
  polygon(
    ctx,
    [
      [-7, -7 + bob],
      [-12, 10],
      [-3, 12],
      [0, 7],
      [7, 11],
      [9, -4 + bob],
    ],
    '#b76258',
  );
  polygon(
    ctx,
    [
      [-6, -7 + bob],
      [-8, 9],
      [0, 11],
      [6, 7],
      [5, -6 + bob],
    ],
    CORAL,
  );
  box(ctx, -11, -3 + bob, 6, 11, 2, '#637d70');
  line(
    ctx,
    [
      [-8, -1 + bob],
      [-8, 5 + bob],
    ],
    '#a6b59b',
    1,
  );
  box(ctx, 5, -1 + bob, 5, 11, 2, '#cf7564');
  circle(ctx, 8, 9 + bob, 2.4, '#ead5b6');
  // Asymmetric hood, face and cream scarf give the explorer a distinct profile.
  circle(ctx, 0, -11 + bob, 10, '#e88b73');
  box(ctx, -4, -18 + bob, 13, 15, 5, '#f0ad86');
  box(ctx, 1, -15 + bob, 10, 10, 4, '#edddba');
  box(ctx, 5, -13 + bob, 2.5, 3, 0.8, '#2d4140');
  polygon(
    ctx,
    [
      [-8, -17 + bob],
      [-2, -h / 2 - 1 + bob],
      [7, -17 + bob],
      [3, -14 + bob],
      [-3, -13 + bob],
      [-4, -6 + bob],
      [-9, -7 + bob],
    ],
    '#d27260',
  );
  box(ctx, -5, -5 + bob, 12, 4, 1, '#efe1bd');
  polygon(
    ctx,
    [
      [-5, -5 + bob],
      [-15 - Math.abs(stride), -3 + bob],
      [-13, 2 + bob],
      [-4, -1 + bob],
    ],
    '#e8d9b6',
  );
  if (status === 'won') {
    circle(ctx, 2, -27, 2, MINT);
    line(
      ctx,
      [
        [-5, -25],
        [-8, -28],
      ],
      MINT,
      1.5,
    );
    line(
      ctx,
      [
        [8, -25],
        [11, -28],
      ],
      MINT,
      1.5,
    );
  }
  ctx.restore();
}

function fieldBorder(ctx, frame, dragging) {
  const { x, y, w, h } = frame;
  ctx.save();
  ctx.shadowColor = 'rgba(142,232,199,0.22)';
  ctx.shadowBlur = dragging ? 15 : 7;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 5]);
  box(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 0, null, dragging ? '#c3f7d9' : '#a8d9bb');
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  const length = 16;
  for (const [cornerX, cornerY, sx, sy] of [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ]) {
    line(
      ctx,
      [
        [cornerX, cornerY + sy * length],
        [cornerX, cornerY],
        [cornerX + sx * length, cornerY],
      ],
      '#d8f0d4',
      3,
    );
  }
  ctx.shadowBlur = 0;
  const tagWidth = 128;
  const tagX = x + (w - tagWidth) / 2;
  // Keep the drag target readable even when the field touches the canvas edge.
  const tagY = y < 22 ? y + 9 : y - 11;
  box(ctx, tagX, tagY, tagWidth, 23, 6, '#c4dec0');
  for (let row = 0; row < 2; row++)
    for (let column = 0; column < 2; column++) {
      circle(ctx, tagX + 13 + column * 4, tagY + 9 + row * 4, 1, '#486454');
    }
  label(
    ctx,
    dragging ? '正在移动观察场' : '观察场 · 拖动',
    tagX + 77,
    tagY + 11.5,
    10,
    '#264638',
    'center',
    650,
  );
  ctx.restore();
}

/** Draw one scene without mutating either the level or its simulation state. */
export function render(ctx, level, state, { dragging = false, reducedMotion = false } = {}) {
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  background(ctx, level);
  fieldLight(ctx, state.frame);
  drawPaths(ctx, state.objects ?? []);
  for (const solid of level.solids ?? []) drawSolid(ctx, solid);
  for (const hazard of level.hazards ?? []) drawHazard(ctx, hazard);
  drawWires(ctx, state);
  drawExit(ctx, level.exit, state);
  for (const gate of state.gates ?? []) drawGate(ctx, gate, state.switches ?? []);
  for (const [index, item] of (state.switches ?? []).entries()) drawSwitch(ctx, item, index);
  const time = state.time ?? 0;
  for (const object of state.objects ?? []) {
    if (object.kind === 'platform') drawPlatform(ctx, object);
    else drawRobot(ctx, object, time, reducedMotion);
  }
  drawPlayer(ctx, state.player, time, reducedMotion, state.status);
  if (dragging) drawPlacementGuides(ctx, state);
  fieldBorder(ctx, state.frame, dragging);
  ctx.restore();
}
