import { FIELD, triangleVertices } from './core.mjs';

const WIDTH = 390;
const PLAY_HEIGHT = 600;
const HOME_HEIGHT = 330;
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const palette = {
  orb: { edge: '#9feeff', light: '#d5fbff', body: '#246a8b', glow: '#49cff3' },
  prism: { edge: '#d7a1ff', light: '#f6e8ff', body: '#68579c', glow: '#b579fc' },
  burst: { edge: '#ffb391', light: '#fff1ce', body: '#a83f4b', glow: '#ff774f' },
  pickup: { edge: '#ffd999', light: '#fff7d2', body: '#b77428', glow: '#ffbc56' },
};

function circle(ctx, x, y, radius) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
}

function polygon(ctx, vertices) {
  ctx.beginPath();
  vertices.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
}

function regularVertices(radius, count, rotation = 0) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * TAU + rotation;
    const distance = radius * (index % 2 ? 0.966 : 1);
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
  });
}

function glow(ctx, x, y, radius, color, opacity = 1) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.35, color);
  gradient.addColorStop(1, 'transparent');
  ctx.save();
  ctx.globalAlpha *= opacity;
  ctx.fillStyle = gradient;
  circle(ctx, x, y, radius);
  ctx.fill();
  ctx.restore();
}

function star(ctx, x, y, radius, rotation = 0, points = 4) {
  ctx.beginPath();
  for (let index = 0; index < points * 2; index += 1) {
    const angle = (index / (points * 2)) * TAU + rotation;
    const distance = index % 2 ? radius * 0.23 : radius;
    const px = x + Math.cos(angle) * distance;
    const py = y + Math.sin(angle) * distance;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function healthText(ctx, target, radius, color) {
  const value = String(Math.max(0, Math.ceil(target.hp ?? 1)));
  const scale = value.length > 2 ? 0.66 : 0.86;
  ctx.font = `500 ${Math.round(radius * scale)}px Georgia, "Noto Serif SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 5;
  ctx.fillStyle = '#f3fcff';
  ctx.fillText(value, 0, 1.5);
  ctx.shadowBlur = 0;
}

function drawOrb(ctx, target, radius, time, colors) {
  const vertices = regularVertices(radius, 12, target.rotation || 0);
  const glass = ctx.createRadialGradient(-radius * 0.34, -radius * 0.38, 1, 0, 0, radius);
  glass.addColorStop(0, 'rgba(156, 235, 255, .26)');
  glass.addColorStop(0.48, 'rgba(31, 103, 143, .55)');
  glass.addColorStop(0.8, 'rgba(12, 52, 83, .72)');
  glass.addColorStop(1, 'rgba(104, 218, 255, .51)');

  ctx.save();
  ctx.shadowColor = colors.glow;
  ctx.shadowBlur = 11;
  polygon(ctx, vertices);
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.strokeStyle = colors.edge;
  ctx.lineWidth = 1.25;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.clip();

  // Glass facets are intentionally quiet through the centre so the count stays readable.
  for (let index = 0; index < vertices.length; index += 1) {
    const a = vertices[index];
    const b = vertices[(index + 1) % vertices.length];
    const c = vertices[(index + 3) % vertices.length];
    polygon(ctx, [a, b, { x: c.x * 0.67, y: c.y * 0.67 }]);
    ctx.fillStyle = index % 3 === 0 ? 'rgba(177, 246, 255, .18)' : 'rgba(60, 177, 213, .06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(155, 236, 255, .19)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(206, 252, 255, .63)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.86, -2.65, -1.0);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(192, 248, 255, .36)';
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.91, 0.44, 1.8);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#e7fcff';
  const glintAngle = -2.05 + Math.sin(time * 0.65 + target.x * 0.01) * 0.17;
  star(ctx, Math.cos(glintAngle) * radius * 0.8, Math.sin(glintAngle) * radius * 0.8, 3.2);
  ctx.restore();
  healthText(ctx, target, radius, colors.glow);
}

function drawPrism(ctx, target, radius, colors) {
  const vertices = triangleVertices(target).map((point) => ({
    x: point.x - target.x,
    y: point.y - target.y,
  }));
  const gradient = ctx.createLinearGradient(0, -radius, radius * 0.7, radius);
  gradient.addColorStop(0, 'rgba(184, 111, 254, .39)');
  gradient.addColorStop(0.55, 'rgba(67, 43, 112, .70)');
  gradient.addColorStop(1, 'rgba(161, 107, 239, .49)');
  ctx.shadowColor = colors.glow;
  ctx.shadowBlur = 11;
  polygon(ctx, vertices);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = colors.edge;
  ctx.lineWidth = 1.9;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.shadowBlur = 0;
  const inset = vertices.map((point) => ({ x: point.x * 0.78, y: point.y * 0.78 }));
  polygon(ctx, inset);
  ctx.strokeStyle = 'rgba(235, 199, 255, .35)';
  ctx.lineWidth = 0.65;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(184, 125, 234, .28)';
  ctx.beginPath();
  vertices.forEach((point) => {
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(0, 0);
  });
  ctx.stroke();
  ctx.fillStyle = '#f4dbff';
  vertices.forEach((point) => {
    circle(ctx, point.x * 0.95, point.y * 0.95, 1.5);
    ctx.fill();
  });
  healthText(ctx, target, radius * 0.82, colors.glow);
}

function drawBurst(ctx, target, radius, time, colors) {
  const gradient = ctx.createRadialGradient(-radius * 0.22, -radius * 0.32, 1, 0, 0, radius);
  gradient.addColorStop(0, 'rgba(255, 173, 125, .27)');
  gradient.addColorStop(0.65, 'rgba(161, 43, 48, .58)');
  gradient.addColorStop(1, 'rgba(255, 123, 85, .62)');
  ctx.shadowColor = colors.glow;
  ctx.shadowBlur = 13;
  circle(ctx, 0, 0, radius);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = colors.edge;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.shadowBlur = 0;
  polygon(ctx, regularVertices(radius * 0.9, 6, time * 0.12));
  ctx.strokeStyle = 'rgba(255, 177, 135, .52)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  polygon(ctx, regularVertices(radius * 0.9, 6, -time * 0.12 + 0.35));
  ctx.strokeStyle = 'rgba(255, 177, 135, .27)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 199, 140, .25)';
  star(ctx, 0, 0, radius * 0.7, -time * 0.3, 8);
  healthText(ctx, target, radius * 0.89, colors.glow);
}

function drawPickup(ctx, radius, time, colors) {
  glow(ctx, 0, 0, radius * 2, colors.glow, 0.12);
  ctx.rotate(Math.sin(time * 1.6) * 0.09);
  polygon(ctx, regularVertices(radius, 6, -Math.PI / 2));
  const gradient = ctx.createLinearGradient(0, -radius, 0, radius);
  gradient.addColorStop(0, 'rgba(255, 232, 170, .52)');
  gradient.addColorStop(1, 'rgba(158, 91, 22, .45)');
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = colors.edge;
  ctx.lineWidth = 1.3;
  ctx.shadowColor = colors.glow;
  ctx.shadowBlur = 9;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = colors.light;
  ctx.fillRect(-5, -1, 10, 2);
  ctx.fillRect(-1, -5, 2, 10);
}

function drawTarget(ctx, target, time, hit = null, reducedMotion = false) {
  const kind = target.kind || 'orb';
  const colors = palette[kind] || palette.orb;
  const radius = target.r || (kind === 'pickup' ? 13 : 25);
  ctx.save();
  ctx.translate(target.x, target.y);
  if (hit) {
    const pulse = Math.sin((hit.remaining / hit.duration) * Math.PI);
    const squash = reducedMotion ? 0.025 : 0.105;
    ctx.scale(1 + pulse * squash, 1 - pulse * squash * 0.6);
  }
  if (kind === 'prism') drawPrism(ctx, target, radius, colors);
  else if (kind === 'burst') drawBurst(ctx, target, radius, time, colors);
  else if (kind === 'pickup') drawPickup(ctx, radius, time, colors);
  else drawOrb(ctx, target, radius, time, colors);
  if (hit) {
    ctx.globalAlpha = (hit.remaining / hit.duration) * 0.27;
    ctx.fillStyle = '#fff7da';
    if (kind === 'prism') {
      polygon(
        ctx,
        triangleVertices(target).map((point) => ({ x: point.x - target.x, y: point.y - target.y })),
      );
    } else circle(ctx, 0, 0, radius);
    ctx.fill();
  }
  ctx.restore();
}

function drawPortal(
  ctx,
  x,
  y,
  time,
  { small = false, active = false, reducedMotion = false } = {},
) {
  const radius = small ? 26 : 35;
  const pulse = reducedMotion ? 1 : 0.95 + Math.sin(time * 2.8) * 0.05;
  glow(ctx, x, y, radius * 1.8, '#ffb94f', active ? 0.16 : 0.1);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pulse, pulse);
  const ellipse = ctx.createRadialGradient(0, 0, 1, 0, 0, radius);
  ellipse.addColorStop(0, 'rgba(255, 193, 81, .12)');
  ellipse.addColorStop(0.7, 'rgba(255, 184, 67, .03)');
  ellipse.addColorStop(1, 'rgba(255, 217, 131, .25)');
  ctx.beginPath();
  ctx.ellipse(0, 0, radius, radius * 0.39, 0, 0, TAU);
  ctx.fillStyle = ellipse;
  ctx.fill();
  ctx.shadowColor = '#ffb950';
  ctx.shadowBlur = active ? 17 : 11;
  ctx.strokeStyle = '#ffd78f';
  ctx.lineWidth = 1.75;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255, 181, 71, .60)';
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.16, radius * 0.55, -0.03, 0.17, 2.76);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.16, radius * 0.55, -0.03, 3.38, 6.04);
  ctx.stroke();
  for (let index = 0; index < 3; index += 1) {
    const angle = (reducedMotion ? 0 : time * 0.48) + (index / 3) * TAU;
    const px = Math.cos(angle) * radius * 1.16;
    const py = Math.sin(angle) * radius * 0.55;
    ctx.fillStyle = index === 0 ? '#fff4ce' : '#ffc776';
    star(ctx, px, py, index === 0 ? 3.3 : 2.1);
  }
  if (active) {
    const flame = ctx.createLinearGradient(0, -16, 0, 19);
    flame.addColorStop(0, 'rgba(255, 176, 62, 0)');
    flame.addColorStop(0.55, 'rgba(255, 187, 61, .7)');
    flame.addColorStop(1, 'rgba(255, 246, 203, 0)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-6, 6);
    ctx.quadraticCurveTo(-7, -3, -2, -15);
    ctx.quadraticCurveTo(2, -5, 3, -2);
    ctx.quadraticCurveTo(7, -7, 7, 8);
    ctx.quadraticCurveTo(2, 19, -6, 6);
    ctx.fill();
  }
  ctx.restore();
}

function drawBall(ctx, x, y, radius = 4, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  glow(ctx, x, y, radius * 3.2, '#ffd379', 0.24);
  const gradient = ctx.createRadialGradient(x - radius * 0.25, y - radius * 0.3, 0, x, y, radius);
  gradient.addColorStop(0, '#fffef0');
  gradient.addColorStop(0.38, '#fff4c0');
  gradient.addColorStop(1, '#ffc251');
  circle(ctx, x, y, radius);
  ctx.fillStyle = gradient;
  ctx.shadowColor = '#ffc96c';
  ctx.shadowBlur = radius * 1.7;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255, 250, 217, .8)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.restore();
}

function drawRails(ctx, height) {
  const top = FIELD.deadline;
  const bottom = FIELD.bottom;
  const gradient = ctx.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, 'rgba(255, 206, 133, .64)');
  gradient.addColorStop(0.08, 'rgba(220, 163, 89, .33)');
  gradient.addColorStop(0.8, 'rgba(220, 163, 89, .27)');
  gradient.addColorStop(1, 'rgba(255, 206, 133, .58)');
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(FIELD.left, top + 3);
  ctx.lineTo(FIELD.left, bottom);
  ctx.moveTo(FIELD.right, top + 3);
  ctx.lineTo(FIELD.right, bottom);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(182, 128, 69, .15)';
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.save();
  ctx.setLineDash([7, 9]);
  ctx.strokeStyle = 'rgba(241, 193, 121, .35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(FIELD.left + 5, FIELD.deadline);
  ctx.lineTo(FIELD.right - 5, FIELD.deadline);
  ctx.stroke();
  ctx.restore();

  const floor = ctx.createLinearGradient(FIELD.left, 0, FIELD.right, 0);
  floor.addColorStop(0, 'rgba(225, 162, 83, .2)');
  floor.addColorStop(0.5, 'rgba(255, 208, 118, .75)');
  floor.addColorStop(1, 'rgba(225, 162, 83, .2)');
  ctx.strokeStyle = floor;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(FIELD.left, bottom + 4);
  ctx.quadraticCurveTo(WIDTH / 2, bottom + 11, FIELD.right, bottom + 4);
  ctx.stroke();
  const shade = ctx.createLinearGradient(0, bottom + 12, 0, height);
  shade.addColorStop(0, 'rgba(8, 15, 31, 0)');
  shade.addColorStop(1, 'rgba(8, 15, 31, .68)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, bottom + 12, WIDTH, Math.max(0, height - bottom - 12));
}

function drawAim(ctx, aim, time, reducedMotion) {
  const points = Array.isArray(aim) ? aim : aim?.points;
  if (!points || points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 230, 176, .72)';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.setLineDash([2.2, 8.5]);
  ctx.lineDashOffset = reducedMotion ? 0 : -time * 12;
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
  points
    .filter((point) => point.bounce)
    .forEach((point) => {
      ctx.fillStyle = '#ffedba';
      star(ctx, point.x, point.y, 4.5, Math.PI / 4);
    });
  const end = points[points.length - 1];
  circle(ctx, end.x, end.y, 5.5);
  ctx.strokeStyle = 'rgba(255, 226, 173, .6)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

const homeTargets = [
  { id: 'home-a', x: 73, y: 104, r: 28, hp: 3, kind: 'orb' },
  { id: 'home-b', x: 307, y: 132, r: 28, hp: 1, kind: 'orb' },
  { id: 'home-c', x: 187, y: 197, r: 34, hp: 5, kind: 'orb' },
  { id: 'home-d', x: 85, y: 250, r: 27, hp: 2, kind: 'prism', rotation: 0 },
  { id: 'home-e', x: 298, y: 277, r: 29, hp: 4, kind: 'orb' },
];

function drawHome(ctx, time, reducedMotion) {
  ctx.save();
  const motion = reducedMotion ? 0 : Math.sin(time * 0.7) * 2;
  const gold = ctx.createLinearGradient(100, 210, 282, 48);
  gold.addColorStop(0, 'rgba(255, 172, 60, .03)');
  gold.addColorStop(0.65, 'rgba(255, 213, 134, .66)');
  gold.addColorStop(1, 'rgba(255, 244, 205, .97)');
  for (let offset = 0; offset < 3; offset += 1) {
    ctx.beginPath();
    ctx.moveTo(171 - offset * 2, 190);
    ctx.bezierCurveTo(190, 80 - offset * 7, 252, 65 - offset * 8, 265 + offset * 2, 60 + motion);
    ctx.strokeStyle = gold;
    ctx.lineWidth = offset === 0 ? 2.5 : 0.65;
    ctx.shadowColor = '#ffbd58';
    ctx.shadowBlur = offset === 0 ? 11 : 2;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255, 216, 150, .56)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(83, 113);
  ctx.lineTo(171, 184);
  ctx.lineTo(298, 277);
  ctx.moveTo(171, 184);
  ctx.bezierCurveTo(232, 151, 266, 177, 302, 131);
  ctx.moveTo(96, 243);
  ctx.lineTo(177, 202);
  ctx.stroke();
  homeTargets.forEach((target, index) => {
    const bob = reducedMotion ? 0 : Math.sin(time * 0.75 + index * 1.7) * 2;
    drawTarget(ctx, { ...target, y: target.y + bob }, time);
  });
  drawBall(ctx, 265, 60 + motion, 10);
  glow(ctx, 172, 185, 37, '#ffbd5e', 0.18);
  ctx.fillStyle = '#fff0c1';
  ctx.shadowColor = '#ffa945';
  ctx.shadowBlur = 15;
  star(ctx, 172, 185, 14, time * 0.1, 8);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffe5b0';
  star(ctx, 85, 115, 5, Math.PI / 4);
  star(ctx, 302, 134, 5, Math.PI / 4);
  star(ctx, 97, 243, 4, Math.PI / 4);
  for (let index = 0; index < 9; index += 1) {
    const angle = index * 2.399;
    const radius = 40 + (index % 3) * 12;
    const x = 187 + Math.cos(angle) * radius;
    const y = 197 + Math.sin(angle) * radius;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + time * (reducedMotion ? 0 : 0.06));
    polygon(ctx, [
      { x: -3, y: -4 },
      { x: 3, y: -2 },
      { x: 2, y: 4 },
      { x: -2, y: 2 },
    ]);
    ctx.fillStyle = 'rgba(117, 228, 255, .20)';
    ctx.strokeStyle = 'rgba(177, 242, 255, .58)';
    ctx.lineWidth = 0.6;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/** The renderer owns presentation only; every collision and number comes from core.mjs. */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('当前浏览器无法创建游戏画布');
  let dpr = 1;
  let height = canvas.dataset.scene === 'home' ? HOME_HEIGHT : PLAY_HEIGHT;
  let disposed = false;
  let reducedMotion = false;
  let shake = 0;
  let elapsed = 0;
  const particles = [];
  const effects = [];
  const hits = new Map();
  const trails = new Map();
  const dust = Array.from({ length: 26 }, (_, index) => ({
    x: 27 + ((index * 137.53) % 336),
    y: 28 + ((index * 83.71) % 527),
    size: index % 4 === 0 ? 1.15 : 0.65,
    phase: index * 0.83,
  }));

  function resize(scene = canvas.dataset.scene) {
    if (disposed) return;
    height = scene === 'home' ? HOME_HEIGHT : PLAY_HEIGHT;
    dpr = clamp(globalThis.devicePixelRatio || 1, 1, 2);
    const nextWidth = Math.round(WIDTH * dpr);
    const nextHeight = Math.round(height * dpr);
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function addParticles(x, y, kind, count, force = 1) {
    const colors = palette[kind] || palette.orb;
    const amount = Math.min(reducedMotion ? Math.ceil(count / 3) : count, 180 - particles.length);
    for (let index = 0; index < amount; index += 1) {
      const angle = Math.random() * TAU;
      const speed = (25 + Math.random() * 120) * force;
      const lifetime = 0.3 + Math.random() * 0.45;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        remaining: lifetime,
        duration: lifetime,
        size: 0.7 + Math.random() * 2.4,
        rotation: angle,
        spin: (Math.random() - 0.5) * 5,
        shard: kind !== 'pickup' && index % 3 === 0,
        color: colors.edge,
      });
    }
  }

  function addEffect(effect) {
    if (effects.length >= 40) effects.shift();
    effects.push(effect);
  }

  function consume(events) {
    if (disposed || !events) return;
    const list = Array.isArray(events) ? events : [events];
    for (const event of list) {
      const type = event.type;
      const x = Number.isFinite(event.x) ? event.x : WIDTH / 2;
      const y = Number.isFinite(event.y) ? event.y : FIELD.launchY;
      const kind = event.kind || event.target?.kind || 'orb';
      const color = (palette[kind] || palette.orb).edge;
      if (type === 'hit' || type === 'collision') {
        const targetId = event.targetId ?? event.id ?? event.target?.id;
        if (targetId !== undefined) {
          if (hits.size >= 60) hits.delete(hits.keys().next().value);
          hits.set(targetId, { remaining: 0.21, duration: 0.21 });
        }
        addParticles(x, y, kind, 4, 0.7);
        addEffect({
          type: 'ring',
          x,
          y,
          color,
          remaining: 0.34,
          duration: 0.34,
          radius: event.r || 16,
        });
      } else if (type === 'break' || type === 'destroy') {
        addParticles(x, y, kind, kind === 'burst' ? 23 : 16, kind === 'burst' ? 1.3 : 1);
        addEffect({
          type: 'ring',
          x,
          y,
          color,
          remaining: 0.48,
          duration: 0.48,
          radius: event.r || 24,
        });
        addEffect({
          type: 'flash',
          x,
          y,
          color,
          remaining: 0.15,
          duration: 0.15,
          radius: kind === 'burst' ? 64 : 38,
        });
        shake = Math.max(shake, kind === 'burst' ? 0.14 : 0.07);
      } else if (type === 'pickup') {
        addParticles(x, y, 'pickup', 15);
        addEffect({
          type: 'label',
          x,
          y,
          color: '#ffdfa4',
          remaining: 0.9,
          duration: 0.9,
          text: `+${event.value || 1}`,
        });
        addEffect({
          type: 'ring',
          x,
          y,
          color: '#ffd596',
          remaining: 0.45,
          duration: 0.45,
          radius: 13,
        });
      } else if (type === 'collect') {
        addParticles(x, y, 'pickup', 3, 0.35);
        addEffect({
          type: 'ring',
          x,
          y,
          color: '#ffe0a2',
          remaining: 0.22,
          duration: 0.22,
          radius: 6,
        });
      } else if (type === 'blast') {
        addEffect({
          type: 'ring',
          x,
          y,
          color: '#ffb892',
          remaining: 0.45,
          duration: 0.45,
          radius: 12,
          endRadius: event.radius || 92,
        });
        addParticles(x, y, 'burst', 12, 1.4);
        shake = Math.max(shake, 0.14);
      } else if (type === 'wall') {
        addEffect({
          type: 'flash',
          x,
          y,
          color: '#ffe1a4',
          remaining: 0.15,
          duration: 0.15,
          radius: 22,
        });
        addParticles(x, y, 'pickup', 3, 0.4);
      } else if (type === 'win') {
        addParticles(WIDTH / 2, FIELD.bottom - 75, 'pickup', 48, 1.5);
        addEffect({
          type: 'ring',
          x: WIDTH / 2,
          y: FIELD.bottom - 75,
          color: '#ffd596',
          remaining: 1.0,
          duration: 1.0,
          radius: 50,
        });
      } else if (type === 'turn') {
        trails.clear();
      } else if (type === 'loss' || type === 'lose') {
        shake = 0.13;
      }
    }
  }

  function update(dt) {
    for (const [id, hit] of hits) {
      hit.remaining -= dt;
      if (hit.remaining <= 0) hits.delete(id);
    }
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.remaining -= dt;
      if (particle.remaining <= 0) {
        particles.splice(index, 1);
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.exp(-dt * 1.5);
      particle.vy += 48 * dt;
      particle.rotation += particle.spin * dt;
    }
    for (let index = effects.length - 1; index >= 0; index -= 1) {
      effects[index].remaining -= dt;
      if (effects[index].remaining <= 0) effects.splice(index, 1);
    }
    shake = Math.max(0, shake - dt);
  }

  function drawEffects() {
    for (const effect of effects) {
      const progress = 1 - effect.remaining / effect.duration;
      ctx.save();
      ctx.globalAlpha = (1 - progress) ** 1.5;
      if (effect.type === 'ring') {
        const radius = effect.endRadius
          ? effect.radius + (effect.endRadius - effect.radius) * progress
          : effect.radius + progress * (reducedMotion ? 8 : 26);
        circle(ctx, effect.x, effect.y, radius);
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 1.2 * (1 - progress) + 0.2;
        ctx.stroke();
      } else if (effect.type === 'flash') {
        glow(ctx, effect.x, effect.y, effect.radius, effect.color, 0.23);
        ctx.fillStyle = '#fff7da';
        star(ctx, effect.x, effect.y, 10 * (1 - progress), 0.7, 8);
      } else if (effect.type === 'label') {
        ctx.fillStyle = effect.color;
        ctx.font = '600 19px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(effect.text, effect.x, effect.y - 16 - progress * (reducedMotion ? 8 : 27));
      }
      ctx.restore();
    }
    for (const particle of particles) {
      const alpha = particle.remaining / particle.duration;
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.fillStyle = particle.color;
      if (particle.shard) {
        polygon(ctx, [
          { x: -particle.size, y: -particle.size * 1.6 },
          { x: particle.size, y: 0 },
          { x: -particle.size * 0.4, y: particle.size * 1.6 },
        ]);
        ctx.fillStyle = 'rgba(81, 195, 232, .35)';
        ctx.fill();
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 0.65;
        ctx.stroke();
      } else {
        circle(ctx, 0, 0, particle.size * (0.6 + alpha * 0.4));
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawBalls(balls, dt) {
    const activeIds = new Set();
    for (const ball of balls) {
      const id = ball.id;
      activeIds.add(id);
      let history = trails.get(id);
      if (!history) {
        if (trails.size >= 128) trails.delete(trails.keys().next().value);
        history = [];
        trails.set(id, history);
      }
      const previous = history[history.length - 1];
      if (dt > 0 && (!previous || Math.hypot(ball.x - previous.x, ball.y - previous.y) > 0.8)) {
        history.push({ x: ball.x, y: ball.y });
        if (history.length > (reducedMotion ? 2 : 6)) history.shift();
      }
      if (history.length > 1) {
        ctx.save();
        ctx.lineCap = 'round';
        for (let index = 1; index < history.length; index += 1) {
          const previousPoint = history[index - 1];
          const point = history[index];
          // A return/teleport must never draw a streak across the field.
          if (Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) > 90) continue;
          ctx.strokeStyle = `rgba(255, 208, 124, ${(index / history.length) * (reducedMotion ? 0.14 : 0.36)})`;
          ctx.lineWidth = 0.65 + (index / history.length) * 2;
          ctx.beginPath();
          ctx.moveTo(previousPoint.x, previousPoint.y);
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
        }
        ctx.restore();
      }
      drawBall(ctx, ball.x, ball.y, FIELD.ballRadius || 4);
    }
    for (const id of trails.keys()) if (!activeIds.has(id)) trails.delete(id);
  }

  function render(game, options = {}) {
    if (disposed) return;
    reducedMotion = Boolean(options.reducedMotion);
    const dt = clamp(Number.isFinite(options.dt) ? options.dt : 0, 0, 0.05);
    elapsed += dt;
    const time = Number.isFinite(options.time) ? options.time : elapsed;
    const home = Boolean(options.home) || canvas.dataset.scene === 'home';
    const expectedHeight = home ? HOME_HEIGHT : PLAY_HEIGHT;
    if (height !== expectedHeight || dpr !== clamp(globalThis.devicePixelRatio || 1, 1, 2))
      resize(home ? 'home' : 'play');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, WIDTH, height);
    update(dt);
    ctx.save();
    if (shake > 0 && !reducedMotion && !home) {
      const amount = shake * 17;
      ctx.translate(Math.sin(time * 117) * amount, Math.cos(time * 91) * amount * 0.5);
    }

    // Ambient embers supplement the shared cave artwork without masking it.
    for (const mote of dust) {
      const flicker = reducedMotion ? 0.14 : 0.11 + (Math.sin(time * 0.8 + mote.phase) + 1) * 0.07;
      const drift = mote.y - (reducedMotion ? 0 : time * (1 + mote.size));
      const y = ((drift % height) + height) % height;
      ctx.fillStyle = `rgba(244, 202, 138, ${flicker})`;
      circle(ctx, mote.x, y, mote.size);
      ctx.fill();
    }
    if (home) {
      drawHome(ctx, time, reducedMotion);
    } else if (game) {
      drawRails(ctx, height);
      const launch = game.launch || { x: WIDTH / 2, y: FIELD.launchY };
      drawPortal(ctx, WIDTH / 2, FIELD.bottom + 18, time, { reducedMotion });
      drawPortal(ctx, launch.x, launch.y, time, {
        small: true,
        active: game.phase === 'flight' || game.phase === 'aim',
        reducedMotion,
      });
      if (game.phase === 'aim') drawBall(ctx, launch.x, launch.y + 12, 5);
      if (options.aim && game.phase === 'aim') drawAim(ctx, options.aim, time, reducedMotion);
      (game.targets || [])
        .filter((target) => target.hp > 0)
        .forEach((target) => drawTarget(ctx, target, time, hits.get(target.id), reducedMotion));
      drawBalls(game.balls || [], dt);
      drawEffects();
    }
    ctx.restore();
  }

  function reset() {
    particles.length = 0;
    effects.length = 0;
    hits.clear();
    trails.clear();
    shake = 0;
    elapsed = 0;
  }

  function dispose() {
    reset();
    disposed = true;
    ctx.clearRect(0, 0, WIDTH, height);
  }

  resize();
  return { resize, render, consume, reset, dispose };
}
