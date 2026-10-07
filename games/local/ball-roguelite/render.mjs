import { WIDTH, HEIGHT, FIELD, RHYTHM, brickRect, brickCenter, aimDirection } from './core.mjs';
const palette = ['#73f5db', '#9aa5ff', '#c198ff', '#83d7ff', '#ff8eab'];
const tau = Math.PI * 2;
const marbleSprites = new Map();
function text(ctx, value, x, y, size = 16, color = '#eaf5ff') {
  ctx.fillStyle = color; ctx.font = `600 ${size}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(value, x, y);
}
function bevel(ctx, x, y, w, h, cut = 7) {
  ctx.beginPath(); ctx.moveTo(x + cut, y); ctx.lineTo(x + w - cut, y); ctx.lineTo(x + w, y + cut); ctx.lineTo(x + w, y + h - cut); ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x + cut, y + h); ctx.lineTo(x, y + h - cut); ctx.lineTo(x, y + cut); ctx.closePath();
}
function circle(ctx, x, y, radius) { ctx.beginPath(); ctx.arc(x, y, radius, 0, tau); }
function paintMarble(ctx, x, y, radius) {
  ctx.save();
  const fill = ctx.createRadialGradient(x - radius * 0.34, y - radius * 0.4, radius * 0.04, x, y, radius * 1.08);
  fill.addColorStop(0, '#ffffff'); fill.addColorStop(0.24, '#ddfff6'); fill.addColorStop(0.53, '#79eed6'); fill.addColorStop(0.8, '#2fb4ac'); fill.addColorStop(1, '#226279');
  ctx.fillStyle = fill; ctx.strokeStyle = '#ddfff3'; ctx.lineWidth = Math.max(0.75, radius * 0.055);
  ctx.shadowColor = '#8cffe2'; ctx.shadowBlur = radius * 0.62;
  circle(ctx, x, y, radius); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff'; circle(ctx, x - radius * 0.32, y - radius * 0.4, radius * 0.21); ctx.fill();
  ctx.strokeStyle = '#b2ffe38a'; ctx.lineWidth = Math.max(0.7, radius * 0.06);
  ctx.beginPath(); ctx.arc(x, y, radius * 0.72, Math.PI * 0.2, Math.PI * 0.61); ctx.stroke(); ctx.restore();
}
function orb(ctx, x, y, radius = FIELD.radius) {
  // Bake the glossy sphere once: even a 99-ball volley only blits small circular sprites.
  let sprite = marbleSprites.get(radius);
  if (!sprite) {
    const size = Math.ceil(radius * 3.6 + 4), surface = typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(size * 2, size * 2) : globalThis.document?.createElement('canvas');
    if (surface) {
      surface.width = size * 2; surface.height = size * 2;
      const context = surface.getContext('2d');
      if (context) { context.scale(2, 2); paintMarble(context, size / 2, size / 2, radius); sprite = { surface, size }; marbleSprites.set(radius, sprite); }
    }
  }
  if (sprite) ctx.drawImage(sprite.surface, x - sprite.size / 2, y - sprite.size / 2, sprite.size, sprite.size);
  else paintMarble(ctx, x, y, radius);
}
function background(ctx, width, height, time = 0) {
  const fill = ctx.createLinearGradient(0, 0, width, height); fill.addColorStop(0, '#101a35'); fill.addColorStop(0.55, '#070f25'); fill.addColorStop(1, '#172546');
  ctx.fillStyle = fill; ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 70; i++) {
    const x = ((i * 137.51) % width), y = ((i * 89.31) % height);
    ctx.globalAlpha = 0.18 + (Math.sin(time + i) + 1) * 0.15; ctx.fillStyle = i % 4 ? '#b9d4fa' : '#73f5db'; ctx.fillRect(x, y, i % 5 ? 1 : 2, i % 5 ? 1 : 2);
  }
  ctx.globalAlpha = 1; ctx.strokeStyle = '#78a9dc14'; ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(width * 0.65, height * 0.8, width * (0.5 + i * 0.15), height * 0.18, -0.5, 0, tau); ctx.stroke(); }
}
function drawBrick(ctx, brick, recoil = null, reduced = false) {
  const { x, y, w, h } = brickRect(brick), point = brickCenter(brick);
  if (brick.kind === 'pickup') {
    ctx.save(); ctx.strokeStyle = '#73f5db'; ctx.shadowColor = '#73f5db'; ctx.shadowBlur = 8; ctx.fillStyle = '#143b48';
    circle(ctx, point.x, point.y, 13); ctx.fill(); ctx.stroke();
    text(ctx, '+', point.x, point.y - 1, 24, '#93ffe7'); ctx.restore(); return;
  }
  const color = brick.kind === 'bomb' ? '#ffb96e' : palette[Math.min(4, Math.floor((brick.maxHp - 1) / 3))];
  const spring = recoil && !reduced ? Math.sin(recoil.age * 42) * Math.exp(-recoil.age * 13) : 0;
  ctx.save(); ctx.translate(point.x - spring * (recoil?.nx || 0) * 2.4, point.y - spring * (recoil?.ny || 0) * 2.4);
  ctx.scale(1 + spring * 0.055, 1 - spring * 0.055); ctx.translate(-point.x, -point.y);
  const fill = ctx.createLinearGradient(x, y, x + w, y + h); fill.addColorStop(0, color + '6b'); fill.addColorStop(0.5, color + '28'); fill.addColorStop(1, color + '45');
  ctx.fillStyle = fill; ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.shadowColor = color; ctx.shadowBlur = recoil ? 9 : 5;
  bevel(ctx, x, y, w, h); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.3; bevel(ctx, x + 4, y + 4, w - 8, h - 8, 5); ctx.stroke(); ctx.globalAlpha = 1;
  text(ctx, brick.hp, point.x, point.y + (brick.kind === 'bomb' ? 5 : 1), 17);
  if (brick.kind === 'bomb') text(ctx, '✦', point.x, y + 10, 10, '#ffd3a0');
  ctx.restore();
}
function drawTrail(ctx, points, radius, color = '#9cffe2', alpha = 1) {
  if (points.length < 2) return;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color;
  // Three tapered sections keep every collision corner, with a bounded number of strokes.
  for (let band = 0; band < 3; band++) {
    const from = Math.floor((points.length - 1) * band / 3), to = Math.floor((points.length - 1) * (band + 1) / 3);
    if (from === to) continue;
    ctx.globalAlpha = [0.08, 0.2, 0.45][band] * alpha; ctx.lineWidth = radius * [0.15, 0.28, 0.48][band];
    ctx.beginPath(); ctx.moveTo(points[from].x, points[from].y);
    for (let i = from + 1; i <= to; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }
  ctx.restore();
}
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const motion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  let particles = [], rings = [], bolts = [], labels = [], hits = new Map(), shake = 0, launchFlash = 0, launchPoint = null, comboLife = 0, lastCombo = 0, combo = 0;
  function resize() { const dpr = Math.min(globalThis.devicePixelRatio || 1, 2); canvas.width = WIDTH * dpr; canvas.height = HEIGHT * dpr; }
  function ring(x, y, color, duration, radius) { rings.push({ x, y, color, life: duration, duration, radius }); }
  resize();
  return {
    resize,
    reset() { particles = []; rings = []; bolts = []; labels = []; hits.clear(); shake = 0; launchFlash = 0; launchPoint = null; comboLife = 0; lastCombo = 0; combo = 0; },
    consume(events) {
      const reduced = motion?.matches;
      for (const event of events) {
        if (event.type === 'hit') hits.set(event.id, { age: 0, nx: event.nx || 0, ny: event.ny || 0 });
        if (event.type === 'launch' && !reduced) {
          launchPoint = event; launchFlash = event.accent ? 1 : Math.max(launchFlash, 0.5);
          if (event.accent) ring(event.x, event.y, '#a6ffe3', 0.22, 22);
        }
        if (event.type === 'bounce' && !reduced) {
          const color = event.kind === 'wall' ? '#aaacff' : '#a7ffdb';
          ring(event.x, event.y, color, 0.2, event.kind === 'wall' ? 17 : 22);
          if (event.brickId !== undefined) hits.set(event.brickId, { age: 0, nx: event.nx, ny: event.ny });
          const angle = Math.atan2(event.ny, event.nx);
          for (let i = -1; i <= 1; i++) { const a = angle + i * 0.72; particles.push({ x: event.x, y: event.y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 0.19, duration: 0.19, radius: 1.5, color }); }
        }
        if (event.type === 'break' && !reduced) {
          const color = event.kind === 'bomb' ? '#ffb96e' : '#73f5db';
          for (let i = 0; i < 7; i++) { const a = i * 2.399; particles.push({ x: event.x, y: event.y, vx: Math.cos(a) * (40 + i * 11), vy: Math.sin(a) * (40 + i * 11), life: 0.4, duration: 0.4, radius: 1.8, color }); }
          shake = Math.max(shake, 1.1);
        }
        if (event.type === 'blast' && !reduced) { ring(event.x, event.y, '#ffb96e', 0.36, 57); shake = 2.2; }
        if (event.type === 'chain') bolts.push({ ...event, life: 0.16 });
        if (event.type === 'pickup' || event.type === 'critical') labels.push({ ...event, text: event.type === 'pickup' ? '+1 弹珠' : '暴击', life: 0.7 });
      }
      particles = particles.slice(-150); rings = rings.slice(-24); labels = labels.slice(-12); bolts = bolts.slice(-16);
    },
    draw(game, aim, dt, time = 0) {
      const reduced = motion?.matches;
      dt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
      ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0); background(ctx, WIDTH, HEIGHT, reduced ? 0 : time);
      ctx.save(); if (!reduced && shake > 0.1) ctx.translate(Math.sin(time * 90) * shake, Math.cos(time * 81) * shake);
      shake *= Math.exp(-dt * 18); launchFlash *= Math.exp(-dt * 14); comboLife = Math.max(0, comboLife - dt);
      if (game.combo < lastCombo) { lastCombo = 0; comboLife = 0; }
      if (game.combo >= 4 && Math.floor(game.combo / 4) > Math.floor(lastCombo / 4)) { combo = game.combo; comboLife = 0.85; }
      lastCombo = game.combo;
      ctx.strokeStyle = '#263b59'; ctx.lineWidth = 1; ctx.strokeRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.floor - FIELD.top);
      ctx.strokeStyle = '#64d9d830';
      for (const x of [FIELD.left, FIELD.right]) { ctx.beginPath(); ctx.moveTo(x, FIELD.top); ctx.lineTo(x, FIELD.floor); ctx.stroke(); }
      if (comboLife > 0) {
        ctx.save();
        if (!reduced) { const pulse = Math.exp(-(0.85 - comboLife) * 8); ctx.strokeStyle = `rgba(146,255,223,${pulse * 0.45})`; ctx.lineWidth = 1.5; ctx.strokeRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.floor - FIELD.top); ctx.globalAlpha = Math.min(1, comboLife * 4); }
        text(ctx, `${combo} 连击`, WIDTH / 2, 18, 13, '#a6ffdf'); ctx.restore();
      }
      const lowest = game.bricks.some((b) => b.kind !== 'pickup' && b.hp > 0 && b.r >= FIELD.maxRow - 1);
      ctx.strokeStyle = lowest ? '#ff8399' : '#ff839969'; ctx.setLineDash([7, 6]); ctx.beginPath(); ctx.moveTo(FIELD.left, 557); ctx.lineTo(FIELD.right, 557); ctx.stroke(); ctx.setLineDash([]);
      text(ctx, lowest ? '危险 · 先清理底部砖块' : '警戒线', WIDTH / 2, 549, 10, lowest ? '#ff9eb0' : '#bd7e9777');
      for (const brick of game.bricks) if (brick.hp > 0) drawBrick(ctx, brick, hits.get(brick.id), reduced);
      for (const [id, recoil] of hits) { recoil.age += dt; if (recoil.age >= 0.42) hits.delete(id); }
      if (aim && game.phase === 'aim') {
        const dir = aimDirection(aim.x - game.launchX, aim.y - FIELD.floor + FIELD.radius);
        if (dir) {
          let x = game.launchX, y = FIELD.floor - FIELD.radius - 1, dx = dir.x * 12, dy = dir.y * 12;
          for (let i = 0; i < 65; i++) {
            x += dx; y += dy;
            if (x < FIELD.left + FIELD.radius) { x = 2 * (FIELD.left + FIELD.radius) - x; dx = -dx; }
            if (x > FIELD.right - FIELD.radius) { x = 2 * (FIELD.right - FIELD.radius) - x; dx = -dx; }
            if (y < FIELD.top + FIELD.radius) break;
            ctx.globalAlpha = 0.95 - i / 75; ctx.fillStyle = '#d2fff6'; circle(ctx, x, y, i % 3 ? 1.6 : 2.2); ctx.fill();
            if (game.bricks.some((b) => { const r = brickRect(b); return b.hp > 0 && b.kind !== 'pickup' && x >= r.x - FIELD.radius && x <= r.x + r.w + FIELD.radius && y >= r.y - FIELD.radius && y <= r.y + r.h + FIELD.radius; })) break;
          }
          ctx.globalAlpha = 1;
        }
      }
      if (game.phase !== 'flight' || game.nextX !== null) {
        const x = game.phase === 'flight' ? game.nextX : game.launchX;
        ctx.strokeStyle = '#73f5db45'; ctx.beginPath(); ctx.arc(x, FIELD.floor - 5, 17, Math.PI, tau); ctx.stroke(); orb(ctx, x, FIELD.floor - FIELD.radius, FIELD.radius);
      }
      // Clip sparks and trails to the play field; all history points are actual simulated positions.
      ctx.save(); ctx.beginPath(); ctx.rect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.floor - FIELD.top + 2); ctx.clip();
      if (!reduced) {
        game.balls.forEach((ball, index) => {
          const points = (ball.trail || []).slice(-RHYTHM.trailLimit);
          if (points.length && (points.at(-1).x !== ball.x || points.at(-1).y !== ball.y)) points.push(ball);
          drawTrail(ctx, points, FIELD.radius, ball.boost > 0.14 ? '#c5ffdc' : '#9cefe4', game.balls.length > 48 ? 0.8 : 1);
          if (index % (game.balls.length > 48 ? 3 : 1) === 0 && points.length > 5) {
            ctx.strokeStyle = '#adffe6'; ctx.lineWidth = 0.7;
            for (const fraction of [0.32, 0.64]) { const point = points[Math.floor((points.length - 1) * fraction)]; ctx.globalAlpha = fraction * 0.19; circle(ctx, point.x, point.y, FIELD.radius * 0.75); ctx.stroke(); }
            ctx.globalAlpha = 1;
          }
        });
        if (launchPoint && launchFlash > 0.03) {
          ctx.globalAlpha = launchFlash * 0.58; ctx.strokeStyle = '#d9ffe7'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(launchPoint.x, launchPoint.y + FIELD.radius, 11 + (1 - launchFlash) * 9, Math.PI, tau); ctx.stroke(); ctx.globalAlpha = 1;
        }
      }
      for (const ball of game.balls) orb(ctx, ball.x, ball.y, FIELD.radius);
      for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (!reduced) { ctx.globalAlpha = Math.max(0, p.life / p.duration); ctx.fillStyle = p.color; circle(ctx, p.x, p.y, p.radius); ctx.fill(); } }
      ctx.globalAlpha = 1; particles = particles.filter((p) => p.life > 0);
      for (const effect of rings) {
        effect.life -= dt;
        if (!reduced) { const progress = 1 - Math.max(0, effect.life / effect.duration); ctx.globalAlpha = (1 - progress) * 0.62; ctx.strokeStyle = effect.color; ctx.lineWidth = 1.4 * (1 - progress) + 0.4; circle(ctx, effect.x, effect.y, 3 + progress * effect.radius); ctx.stroke(); }
      }
      ctx.globalAlpha = 1; rings = rings.filter((effect) => effect.life > 0);
      for (const bolt of bolts) { bolt.life -= dt; ctx.strokeStyle = '#a5eaff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bolt.from.x, bolt.from.y); ctx.lineTo((bolt.from.x + bolt.to.x) / 2 + 9, (bolt.from.y + bolt.to.y) / 2 - 7); ctx.lineTo(bolt.to.x, bolt.to.y); ctx.stroke(); }
      bolts = bolts.filter((bolt) => bolt.life > 0);
      for (const label of labels) { label.life -= dt; if (!reduced) label.y -= dt * 22; ctx.globalAlpha = reduced ? 1 : Math.max(0, label.life / 0.7); text(ctx, label.text, label.x, label.y, 13, '#ffda94'); }
      ctx.globalAlpha = 1; labels = labels.filter((label) => label.life > 0); ctx.restore(); ctx.restore();
    },
  };
}
// Each bank shot lands on a beat or half-beat, then snaps away and settles into the next turn.
const heroRoute = [{ x: 49, y: 246 }, { x: 341, y: 126 }, { x: 136, y: 38 }, { x: 68, y: 177 }, { x: 313, y: 251 }, { x: 340, y: 54 }, { x: 78, y: 94 }];
const heroBeats = [1, 0.5, 1, 0.5, 1, 0.5, 1];
const heroEnds = heroBeats.reduce((ends, beats) => [...ends, ends.at(-1) + beats * RHYTHM.beat], [0]);
const heroDuration = heroEnds.at(-1);
function heroAt(time) {
  const local = ((time % heroDuration) + heroDuration) % heroDuration;
  const index = Math.min(heroRoute.length - 1, heroEnds.findIndex((end) => end > local) - 1);
  const progress = (local - heroEnds[index]) / (heroEnds[index + 1] - heroEnds[index]);
  const eased = 1 - (1 - progress) ** (index % 2 ? 1.65 : 2.8);
  const from = heroRoute[index], to = heroRoute[(index + 1) % heroRoute.length];
  return { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased, index, age: local - heroEnds[index] };
}
function heroTrail(time) {
  const age = 0.29, start = time - age, times = Array.from({ length: 20 }, (_, i) => start + age * i / 19);
  // Include exact turning instants so the luminous tail never takes a shortcut through a corner.
  for (let cycle = Math.floor(start / heroDuration); cycle <= Math.floor(time / heroDuration); cycle++)
    for (const end of heroEnds) { const at = cycle * heroDuration + end; if (at > start && at < time) times.push(at); }
  return times.sort((a, b) => a - b).map(heroAt);
}
export function drawHero(canvas, time = 0) {
  const ctx = canvas.getContext('2d'), w = 390, h = 310;
  const reduced = time === 0 || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const clock = reduced ? 1.66 : time, ball = heroAt(clock), beatAge = clock % RHYTHM.beat;
  ctx.save(); ctx.translate(195, 146); ctx.rotate(-0.27);
  ctx.strokeStyle = '#82dce92e'; ctx.beginPath(); ctx.ellipse(0, 0, 159, 70, 0, 0, tau); ctx.stroke();
  ctx.strokeStyle = '#ac9be820'; ctx.beginPath(); ctx.ellipse(0, 0, 177, 106, 0, 0, tau); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = '#a2eddd16'; ctx.setLineDash([2, 8]); ctx.beginPath(); ctx.moveTo(heroRoute[0].x, heroRoute[0].y);
  heroRoute.slice(1).forEach((point) => ctx.lineTo(point.x, point.y)); ctx.closePath(); ctx.stroke(); ctx.restore();
  const bricks = [{ x: 116, y: 89 }, { x: 199, y: 69 }, { x: 265, y: 107 }, { x: 117, y: 188 }, { x: 201, y: 213 }, { x: 265, y: 194 }];
  bricks.forEach((point, i) => {
    const age = (beatAge + (i % 2) * RHYTHM.beat / 2) % RHYTHM.beat;
    const spring = reduced ? 0 : Math.sin(age * 30) * Math.exp(-age * 8);
    ctx.save(); ctx.translate(point.x, point.y + (reduced ? 0 : Math.sin(clock * 2 + i) * 3) - spring * 3.4); ctx.rotate((i % 2 ? 1 : -1) * 0.12 + spring * 0.035); ctx.scale(1 + spring * 0.04, 1 - spring * 0.04);
    const brick = { c: 0, r: 0, kind: i === 4 ? 'bomb' : 'brick', hp: [4, 6, 8, 3, 5, 4][i], maxHp: [4, 6, 8, 3, 5, 4][i] }, center = brickCenter(brick);
    ctx.translate(-center.x, -center.y); drawBrick(ctx, brick); ctx.restore();
  });
  if (!reduced) {
    const points = heroTrail(clock); drawTrail(ctx, points, 17, '#a0ffde', 1.4);
    for (const lag of [0.055, 0.11, 0.19]) { const ghost = heroAt(clock - lag); ctx.globalAlpha = 0.2 * (1 - lag / 0.24); ctx.strokeStyle = '#bcffe6'; ctx.lineWidth = 1.4; circle(ctx, ghost.x, ghost.y, 17 * (1 - lag)); ctx.stroke(); }
    if (ball.age < 0.3) { const point = heroRoute[ball.index], progress = ball.age / 0.3; ctx.globalAlpha = (1 - progress) * 0.7; ctx.strokeStyle = ball.index % 2 ? '#b8a1ff' : '#a3ffe0'; ctx.lineWidth = 1.8; circle(ctx, point.x, point.y, 12 + progress * 24); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  orb(ctx, ball.x, ball.y, 17);
}
