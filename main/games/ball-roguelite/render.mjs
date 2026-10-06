import { WIDTH, HEIGHT, FIELD, brickRect, brickCenter, aimDirection } from './core.mjs';
const palette = ['#73f5db', '#9aa5ff', '#c198ff', '#83d7ff', '#ff8eab'];
const tau = Math.PI * 2;
function text(ctx, value, x, y, size = 16, color = '#eaf5ff') {
  ctx.fillStyle = color; ctx.font = `600 ${size}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(value, x, y);
}
function bevel(ctx, x, y, w, h, cut = 7) {
  ctx.beginPath(); ctx.moveTo(x + cut, y); ctx.lineTo(x + w - cut, y); ctx.lineTo(x + w, y + cut); ctx.lineTo(x + w, y + h - cut); ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x + cut, y + h); ctx.lineTo(x, y + h - cut); ctx.lineTo(x, y + cut); ctx.closePath();
}
function orb(ctx, x, y, radius = 5) {
  ctx.save(); ctx.fillStyle = '#f7ffef'; ctx.shadowColor = '#b1fff1'; ctx.shadowBlur = 13;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, tau); ctx.fill(); ctx.restore();
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
function drawBrick(ctx, brick, hit = 0) {
  const { x, y, w, h } = brickRect(brick), point = brickCenter(brick);
  if (brick.kind === 'pickup') {
    ctx.save(); ctx.strokeStyle = '#73f5db'; ctx.shadowColor = '#73f5db'; ctx.shadowBlur = 10; ctx.fillStyle = '#143b48';
    ctx.beginPath(); ctx.arc(point.x, point.y, 13, 0, tau); ctx.fill(); ctx.stroke();
    text(ctx, '+', point.x, point.y - 1, 24, '#93ffe7'); ctx.restore(); return;
  }
  const color = brick.kind === 'bomb' ? '#ffb96e' : palette[Math.min(4, Math.floor((brick.maxHp - 1) / 3))];
  ctx.save(); ctx.translate(point.x, point.y); const s = 1 + Math.max(0, hit) * 0.12; ctx.scale(s, 1 / s); ctx.translate(-point.x, -point.y);
  const fill = ctx.createLinearGradient(x, y, x + w, y + h); fill.addColorStop(0, color + '6b'); fill.addColorStop(0.5, color + '28'); fill.addColorStop(1, color + '45');
  ctx.fillStyle = fill; ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.shadowColor = color; ctx.shadowBlur = 7;
  bevel(ctx, x, y, w, h); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.3; bevel(ctx, x + 4, y + 4, w - 8, h - 8, 5); ctx.stroke(); ctx.globalAlpha = 1;
  text(ctx, brick.hp, point.x, point.y + (brick.kind === 'bomb' ? 5 : 1), 17);
  if (brick.kind === 'bomb') text(ctx, '✦', point.x, y + 10, 10, '#ffd3a0');
  ctx.restore();
}
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let particles = [], rings = [], bolts = [], labels = [], hits = new Map(), shake = 0;
  function resize() { const dpr = Math.min(globalThis.devicePixelRatio || 1, 2); canvas.width = WIDTH * dpr; canvas.height = HEIGHT * dpr; }
  resize();
  return {
    resize,
    reset() { particles = []; rings = []; bolts = []; labels = []; hits.clear(); shake = 0; },
    consume(events) {
      for (const event of events) {
        if (event.type === 'hit') hits.set(event.id, 1);
        if (event.type === 'break') {
          const color = event.kind === 'bomb' ? '#ffb96e' : '#73f5db';
          for (let i = 0; i < (reduced ? 4 : 9); i++) { const a = i * 2.399; particles.push({ x: event.x, y: event.y, vx: Math.cos(a) * (45 + i * 12), vy: Math.sin(a) * (45 + i * 12), life: 0.55, color }); }
          shake = reduced ? 0 : 2;
        }
        if (event.type === 'blast') { rings.push({ x: event.x, y: event.y, life: 0.45 }); shake = reduced ? 0 : 4; }
        if (event.type === 'chain') bolts.push({ ...event, life: 0.2 });
        if (event.type === 'pickup' || event.type === 'critical') labels.push({ ...event, text: event.type === 'pickup' ? '+1 弹珠' : '暴击', life: 0.7 });
      }
      particles = particles.slice(-180); rings = rings.slice(-15); labels = labels.slice(-16); bolts = bolts.slice(-20);
    },
    draw(game, aim, dt, time = 0) {
      ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0); background(ctx, WIDTH, HEIGHT, reduced ? 0 : time);
      ctx.save(); if (shake > 0.1) ctx.translate(Math.sin(time * 90) * shake, Math.cos(time * 81) * shake);
      shake *= Math.exp(-dt * 16);
      ctx.strokeStyle = '#263b59'; ctx.lineWidth = 1; ctx.strokeRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.floor - FIELD.top);
      ctx.strokeStyle = '#64d9d830';
      for (const x of [FIELD.left, FIELD.right]) { ctx.beginPath(); ctx.moveTo(x, FIELD.top); ctx.lineTo(x, FIELD.floor); ctx.stroke(); }
      const lowest = game.bricks.some((b) => b.kind !== 'pickup' && b.hp > 0 && b.r >= FIELD.maxRow - 1);
      ctx.strokeStyle = lowest ? '#ff8399' : '#ff839969'; ctx.setLineDash([7, 6]); ctx.beginPath(); ctx.moveTo(FIELD.left, 557); ctx.lineTo(FIELD.right, 557); ctx.stroke(); ctx.setLineDash([]);
      text(ctx, lowest ? '危险 · 先清理底部砖块' : '警戒线', WIDTH / 2, 549, 10, lowest ? '#ff9eb0' : '#bd7e9777');
      for (const brick of game.bricks) if (brick.hp > 0) drawBrick(ctx, brick, hits.get(brick.id) || 0);
      for (const [id, value] of hits) { const next = value - dt * 7; if (next <= 0) hits.delete(id); else hits.set(id, next); }
      if (aim && game.phase === 'aim') {
        const dir = aimDirection(aim.x - game.launchX, aim.y - FIELD.floor + FIELD.radius);
        if (dir) {
          let x = game.launchX, y = FIELD.floor - FIELD.radius - 1, dx = dir.x * 12, dy = dir.y * 12;
          for (let i = 0; i < 65; i++) {
            x += dx; y += dy;
            if (x < FIELD.left + FIELD.radius) { x = 2 * (FIELD.left + FIELD.radius) - x; dx = -dx; }
            if (x > FIELD.right - FIELD.radius) { x = 2 * (FIELD.right - FIELD.radius) - x; dx = -dx; }
            if (y < FIELD.top + FIELD.radius) break;
            ctx.globalAlpha = 0.95 - i / 75; ctx.fillStyle = '#d2fff6'; ctx.beginPath(); ctx.arc(x, y, i % 3 ? 1.6 : 2.2, 0, tau); ctx.fill();
            if (game.bricks.some((b) => { const r = brickRect(b); return b.hp > 0 && b.kind !== 'pickup' && x >= r.x - FIELD.radius && x <= r.x + r.w + FIELD.radius && y >= r.y - FIELD.radius && y <= r.y + r.h + FIELD.radius; })) break;
          }
          ctx.globalAlpha = 1;
        }
      }
      if (game.phase !== 'flight' || game.nextX !== null) {
        const x = game.phase === 'flight' ? game.nextX : game.launchX;
        ctx.strokeStyle = '#73f5db45'; ctx.beginPath(); ctx.arc(x, FIELD.floor - 5, 17, Math.PI, tau); ctx.stroke(); orb(ctx, x, FIELD.floor - 6, 6);
      }
      for (const ball of game.balls) {
        if (!reduced) { ctx.strokeStyle = '#c2fff956'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(ball.x - ball.vx * 0.018, ball.y - ball.vy * 0.018); ctx.stroke(); }
        orb(ctx, ball.x, ball.y, FIELD.radius);
      }
      for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; ctx.globalAlpha = Math.max(0, p.life / 0.55); ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
      ctx.globalAlpha = 1; particles = particles.filter((p) => p.life > 0);
      for (const ring of rings) { ring.life -= dt; ctx.globalAlpha = Math.max(0, ring.life / 0.45); ctx.strokeStyle = '#ffb96e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ring.x, ring.y, 10 + (0.45 - ring.life) * 160, 0, tau); ctx.stroke(); }
      ctx.globalAlpha = 1; rings = rings.filter((r) => r.life > 0);
      for (const bolt of bolts) { bolt.life -= dt; ctx.strokeStyle = '#a5eaff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bolt.from.x, bolt.from.y); ctx.lineTo((bolt.from.x + bolt.to.x) / 2 + 9, (bolt.from.y + bolt.to.y) / 2 - 7); ctx.lineTo(bolt.to.x, bolt.to.y); ctx.stroke(); }
      bolts = bolts.filter((b) => b.life > 0);
      for (const label of labels) { label.life -= dt; label.y -= dt * 28; ctx.globalAlpha = Math.max(0, label.life / 0.7); text(ctx, label.text, label.x, label.y, 13, '#ffda94'); }
      ctx.globalAlpha = 1; labels = labels.filter((l) => l.life > 0); ctx.restore();
    },
  };
}
export function drawHero(canvas, time = 0) {
  const ctx = canvas.getContext('2d'), w = 390, h = 310;
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  ctx.save(); ctx.translate(195, 142); ctx.rotate(-0.27);
  ctx.strokeStyle = '#82dce957'; ctx.beginPath(); ctx.ellipse(0, 0, 159, 70, 0, 0, tau); ctx.stroke();
  ctx.strokeStyle = '#ac9be82c'; ctx.beginPath(); ctx.ellipse(0, 0, 177, 96, 0, 0, tau); ctx.stroke(); ctx.restore();
  for (let i = 0; i < 8; i++) {
    ctx.save(); ctx.translate(70 + (i % 4) * 65, 70 + Math.floor(i / 4) * 88 + (i % 2) * 17 + Math.sin(time * 0.6 + i) * 4); ctx.rotate((i % 2 ? 1 : -1) * 0.16);
    drawBrick(ctx, { c: 0, r: 0, kind: i === 5 ? 'bomb' : 'brick', hp: [4, 6, 8, 3][i % 4], maxHp: [4, 6, 8, 3][i % 4] }); ctx.restore();
  }
  ctx.save(); ctx.translate(195, 160); ctx.rotate(-0.27);
  ctx.strokeStyle = '#d5fff9'; ctx.lineWidth = 2.5; ctx.shadowColor = '#73f5db'; ctx.shadowBlur = 13;
  ctx.beginPath(); ctx.ellipse(0, 0, 159, 70, 0, Math.PI * 0.12, Math.PI * 0.8); ctx.stroke();
  orb(ctx, -120, 46, 11); ctx.restore();
}
