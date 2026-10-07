const TAU = Math.PI * 2;
const BALL_ANGLE = Math.PI / 2;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const wrap = (angle) => ((angle % TAU) + TAU) % TAU;

const PALETTES = {
  mint: { light: '#b6f8ee', mid: '#69d9df', dark: '#217b98', glow: '#29f4ed', edge: '#d9ffff' },
  ice: { light: '#d9f6ff', mid: '#89c9ff', dark: '#345f9b', glow: '#8fdcff', edge: '#edfbff' },
  violet: { light: '#ead5ff', mid: '#b1a0ef', dark: '#604692', glow: '#d0a7ff', edge: '#f6e9ff' },
  sunset: { light: '#ffe3bc', mid: '#ffc080', dark: '#a25e63', glow: '#ffcd91', edge: '#fff2d9' },
  amber: { light: '#fff0b3', mid: '#e9ce7d', dark: '#96773c', glow: '#ffe69e', edge: '#fff9da' },
};

function paletteFor(skin) {
  return PALETTES[typeof skin === 'string' ? skin : skin?.id] || PALETTES.mint;
}

function contains(angle, arc) {
  if (!arc || !Number.isFinite(arc.start) || !Number.isFinite(arc.end)) return false;
  if (Math.abs(arc.end - arc.start) >= TAU - 0.0001) return true;
  return wrap(angle - arc.start) < wrap(arc.end - arc.start);
}

function materialAt(layer, angle, rotation) {
  const local = wrap(angle - rotation);
  if (!layer?.finish && contains(local, layer?.gap)) return 'gap';
  if (!layer?.finish && (layer?.danger || []).some((arc) => contains(local, arc))) return 'danger';
  return layer?.finish ? 'finish' : 'safe';
}

function segmentsFor(layer, rotation) {
  const bounds = [0, Math.PI, TAU];
  for (const arc of [layer?.gap, ...(layer?.danger || [])]) {
    if (!arc) continue;
    bounds.push(wrap(arc.start + rotation), wrap(arc.end + rotation));
  }
  bounds.sort((a, b) => a - b);
  return bounds
    .slice(0, -1)
    .map((start, index) => ({
      start,
      end: bounds[index + 1],
      material: materialAt(layer, (start + bounds[index + 1]) / 2, rotation),
      front: start < Math.PI,
    }))
    .filter((part) => part.end - part.start > 0.0001 && part.material !== 'gap');
}

function annulusPath(ctx, x, y, outer, inner, squash, start, end) {
  ctx.beginPath();
  ctx.ellipse(x, y, outer, outer * squash, 0, start, end);
  ctx.lineTo(x + Math.cos(end) * inner, y + Math.sin(end) * inner * squash);
  ctx.ellipse(x, y, inner, inner * squash, 0, end, start, true);
  ctx.closePath();
}

function sidePath(ctx, x, y, radius, squash, thickness, start, end) {
  ctx.beginPath();
  ctx.ellipse(x, y, radius, radius * squash, 0, start, end);
  ctx.lineTo(x + Math.cos(end) * radius, y + Math.sin(end) * radius * squash + thickness);
  ctx.ellipse(x, y + thickness, radius, radius * squash, 0, end, start, true);
  ctx.closePath();
}

function stripeFill(ctx, x, y, radius, squash, color = '#9b3131', spacing = 13) {
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  const height = radius * squash * 2 + 8;
  for (let offset = -radius - height; offset < radius + height; offset += spacing) {
    ctx.beginPath();
    ctx.moveTo(x + offset, y - radius * squash - 4);
    ctx.lineTo(x + offset + height, y + radius * squash + 4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRingHalf(ctx, ring, front, colors) {
  const { x, y, radius, inner, squash, thickness, segments, alpha } = ring;
  ctx.save();
  ctx.globalAlpha = alpha;
  const normalTop = ctx.createLinearGradient(
    x - radius * 0.65,
    y - radius * squash,
    x + radius,
    y + radius * squash,
  );
  normalTop.addColorStop(0, colors.light);
  normalTop.addColorStop(0.42, colors.mid);
  normalTop.addColorStop(1, '#46adc1');
  const normalSide = ctx.createLinearGradient(x - radius, y, x + radius, y + thickness);
  normalSide.addColorStop(0, '#1b5676');
  normalSide.addColorStop(0.48, colors.dark);
  normalSide.addColorStop(0.74, '#339db2');
  normalSide.addColorStop(1, '#17475f');
  const goldTop = ctx.createLinearGradient(x, y - radius * squash, x, y + radius * squash);
  goldTop.addColorStop(0, '#fff1c4');
  goldTop.addColorStop(1, '#c8d891');
  const dangerTop = ctx.createLinearGradient(x, y - radius * squash, x, y + radius * squash);
  dangerTop.addColorStop(0, '#ff9b6d');
  dangerTop.addColorStop(1, '#f06752');
  for (const segment of segments) {
    if (segment.front !== front) continue;
    const { start, end, material } = segment;
    // A visible inner wall gives even the far half its physical thickness.
    if (!front) {
      sidePath(ctx, x, y, inner, squash, thickness, start, end);
      ctx.fillStyle =
        material === 'danger' ? '#963e3d' : material === 'finish' ? '#798952' : '#24576a';
      ctx.fill();
    }
    annulusPath(ctx, x, y, radius, inner, squash, start, end);
    ctx.fillStyle = material === 'danger' ? dangerTop : material === 'finish' ? goldTop : normalTop;
    ctx.fill();
    if (material === 'danger') stripeFill(ctx, x, y, radius, squash);
    if (front) {
      sidePath(ctx, x, y, radius, squash, thickness, start, end);
      ctx.fillStyle =
        material === 'danger' ? '#a6403e' : material === 'finish' ? '#7c9866' : normalSide;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x, y + thickness, radius, radius * squash, 0, start, end);
      ctx.strokeStyle = 'rgba(6, 29, 44, .52)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * squash, 0, start, end);
    ctx.strokeStyle =
      material === 'danger' ? 'rgba(255, 190, 141, .75)' : 'rgba(211, 255, 253, .64)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x, y, inner, inner * squash, 0, start, end);
    ctx.strokeStyle = 'rgba(3, 41, 59, .4)';
    ctx.stroke();
  }
  // Vertical cut faces make the gap readable, regardless of its current angle.
  if (ring.gap && !ring.finish) {
    for (const edge of [ring.gap.start, ring.gap.end]) {
      const angle = wrap(edge + ring.rotation);
      if (angle < Math.PI !== front) continue;
      const cos = Math.cos(angle),
        sin = Math.sin(angle) * squash;
      ctx.beginPath();
      ctx.moveTo(x + inner * cos, y + inner * sin);
      ctx.lineTo(x + radius * cos, y + radius * sin);
      ctx.lineTo(x + radius * cos, y + radius * sin + thickness);
      ctx.lineTo(x + inner * cos, y + inner * sin + thickness);
      ctx.closePath();
      const adjacent =
        materialAt(ring.layer, angle + 0.003, ring.rotation) === 'gap'
          ? materialAt(ring.layer, angle - 0.003, ring.rotation)
          : materialAt(ring.layer, angle + 0.003, ring.rotation);
      ctx.fillStyle = adjacent === 'danger' ? '#9e4445' : colors.dark;
      ctx.fill();
      ctx.strokeStyle = 'rgba(200, 255, 255, .33)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function sizeCanvas(canvas, fallbackWidth, fallbackHeight) {
  const rect = canvas.getBoundingClientRect?.();
  const width = Math.max(1, rect?.width || canvas.clientWidth || fallbackWidth);
  const height = Math.max(1, rect?.height || canvas.clientHeight || fallbackHeight);
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
  if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
  return { width, height, dpr };
}

export class TowerRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cameraY = null;
    this.lastMode = null;
    this.lastTime = 0;
    this.resize();
  }

  resize() {
    Object.assign(this, sizeCanvas(this.canvas, 390, 844));
    this.ctx?.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  draw(state, { mode = 'play', time = 0, skin = 'mint' } = {}) {
    if (!this.ctx || !state?.level?.layers) return;
    const ctx = this.ctx,
      w = this.width,
      h = this.height;
    const colors = paletteFor(skin),
      home = mode === 'home',
      landscape = h < 500 && w > h;
    const seconds = time / 1000;
    const radius = landscape ? Math.min(h * 0.27, 100) : Math.min(w * 0.33, 155),
      inner = radius * 0.46;
    const centerX = w * (landscape ? 0.52 : 0.5);
    const squash = 0.3,
      thickness = 15,
      ballRadius = 11.5;
    const depth = radius * 0.74 * squash;
    const sceneTop = landscape ? 42 : home ? Math.min(240, h * 0.31) : 146;
    const sceneBottom = landscape ? h - 26 : home ? h - 220 : h - 185;
    const anchor = landscape ? h * 0.32 : clamp(h * 0.31, 220, 280);
    const physicalY = Number.isFinite(state.y) ? state.y : 20;
    const rotation = (state.rotation || 0) + (home ? seconds * 0.13 : 0);
    if (this.cameraY === null || this.lastMode !== mode || Math.abs(physicalY - this.cameraY) > 420)
      this.cameraY = physicalY;
    const elapsed = clamp((time - this.lastTime) / 1000 || 1 / 60, 0, 0.05);
    this.cameraY += (physicalY - this.cameraY) * (1 - Math.exp(-elapsed * 9));
    this.lastMode = mode;
    this.lastTime = time;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Sparse motes give the tower a quiet sense of height without obscuring play.
    for (let i = 0; i < 17; i++) {
      const x = w * (0.09 + ((i * 0.371) % 0.82));
      const y =
        sceneTop + ((i * 43.7 + seconds * (4 + (i % 3))) % Math.max(1, sceneBottom - sceneTop));
      ctx.globalAlpha = 0.07 + (i % 4) * 0.045;
      ctx.fillStyle = colors.glow;
      ctx.beginPath();
      ctx.arc(x, y, i % 5 === 0 ? 1.4 : 0.7, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, sceneTop, w, Math.max(1, sceneBottom - sceneTop));
    ctx.clip();

    const homeTop = h * (landscape ? 0.25 : 0.37);
    const homeStep = Math.min(85, (sceneBottom - homeTop - radius * squash - thickness) / 3);
    const displayLayers = home ? state.level.layers.slice(0, 4) : state.level.layers;
    const rings = displayLayers
      .map((layer, index) => {
        const delta = layer.y - physicalY;
        const y = home
          ? homeTop + index * homeStep
          : anchor + (layer.y - this.cameraY) * 0.82 - depth;
        const alpha = home ? 1 : delta < -18 ? clamp(1 - (-delta - 18) / 55, 0, 0.28) : 1;
        return {
          x: centerX,
          y,
          radius,
          inner,
          squash,
          thickness,
          alpha,
          layer,
          gap: layer.gap,
          finish: layer.finish,
          rotation,
          segments: segmentsFor(layer, rotation),
        };
      })
      .filter(
        (ring) =>
          ring.alpha > 0.01 &&
          ring.y > sceneTop - radius * squash - thickness &&
          ring.y < sceneBottom + radius * squash,
      );
    rings.sort((a, b) => b.y - a.y);

    const halo = ctx.createRadialGradient(
      centerX,
      anchor + 80,
      15,
      centerX,
      anchor + 80,
      radius * 1.8,
    );
    halo.addColorStop(0, 'rgba(35, 158, 182, .10)');
    halo.addColorStop(1, 'rgba(35, 158, 182, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, sceneTop, w, sceneBottom - sceneTop);
    for (const ring of rings) drawRingHalf(ctx, ring, false, colors);

    const shaftWidth = inner * 1.82;
    const shaft = ctx.createLinearGradient(
      centerX - shaftWidth / 2,
      0,
      centerX + shaftWidth / 2,
      0,
    );
    shaft.addColorStop(0, '#0a2a40');
    shaft.addColorStop(0.23, '#123d52');
    shaft.addColorStop(0.48, '#102f42');
    shaft.addColorStop(0.8, '#081a2d');
    shaft.addColorStop(1, '#174455');
    ctx.fillStyle = shaft;
    const shaftTop = home ? homeTop - 64 : sceneTop - 20;
    ctx.fillRect(centerX - shaftWidth / 2, shaftTop, shaftWidth, sceneBottom - shaftTop + 30);
    ctx.fillStyle = 'rgba(128, 227, 240, .11)';
    ctx.fillRect(centerX + shaftWidth / 2 - 1, shaftTop, 1, sceneBottom - shaftTop + 30);
    for (const ring of rings) drawRingHalf(ctx, ring, true, colors);

    const ballY = home
      ? homeTop + depth - ballRadius - 5 - Math.abs(Math.sin(seconds * 2.8)) * 13
      : anchor + (physicalY - this.cameraY) * 0.82 + 12 * 0.82 - ballRadius;
    const ballX = centerX;
    const nextIndex =
      typeof state.nextLayer === 'number' ? state.nextLayer : state.nextLayer?.index;
    const next =
      state.level.layers[nextIndex] || state.level.layers.find((layer) => layer.y >= physicalY - 2);
    if (!home && next) {
      const targetY = anchor + (next.y - this.cameraY) * 0.82;
      const material = materialAt(next, BALL_ANGLE, rotation);
      const targetColor = material === 'danger' ? '#ffaf85' : colors.glow;
      ctx.save();
      ctx.strokeStyle = targetColor;
      ctx.globalAlpha = 0.67;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.moveTo(ballX, ballY + ballRadius + 6);
      ctx.lineTo(ballX, Math.max(ballY + ballRadius + 9, targetY - 5));
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(ballX, targetY - 1, 10, 3.2, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.17;
      ctx.fillStyle = targetColor;
      ctx.beginPath();
      ctx.ellipse(ballX, targetY - 1, 8, 2.5, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    if (!home && state.v > 100 && state.brakeLeft <= 0) {
      const trail = ctx.createLinearGradient(ballX, ballY - 45, ballX, ballY);
      trail.addColorStop(0, 'rgba(241, 255, 244, 0)');
      trail.addColorStop(1, 'rgba(241, 255, 244, .25)');
      ctx.strokeStyle = trail;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ballX, ballY - 40);
      ctx.lineTo(ballX, ballY - 13);
      ctx.stroke();
    }
    const brake = !home && state.brakeLeft > 0;
    if (brake) {
      ctx.save();
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = 14;
      const pulse = Math.sin(seconds * 14) * 2;
      ctx.strokeStyle = colors.glow;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(ballX, ballY + 5, 28 + pulse, 10, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.36;
      ctx.beginPath();
      ctx.ellipse(ballX, ballY + 5, 36 + pulse, 15, 0, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const offset = (seconds * 18 + i * 10) % 28;
        ctx.globalAlpha = 0.35 * (1 - offset / 28);
        ctx.beginPath();
        ctx.moveTo(ballX - 43, ballY + 14 - offset);
        ctx.lineTo(ballX + 43, ballY + 14 - offset);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#aafff8';
      ctx.fillText(
        `${Math.max(0, state.brakeLeft > 10 ? state.brakeLeft / 1000 : state.brakeLeft).toFixed(1)}s`,
        ballX + 22,
        ballY - 22,
      );
      ctx.restore();
    }

    ctx.save();
    const failed = ['failed', 'lost', 'dead'].includes(state.status);
    ctx.shadowColor = failed ? '#ff765f' : '#cffff2';
    ctx.shadowBlur = brake ? 28 : 17;
    const ballFill = ctx.createRadialGradient(
      ballX - 4,
      ballY - 5,
      1,
      ballX + 2,
      ballY + 3,
      ballRadius + 3,
    );
    ballFill.addColorStop(0, '#ffffff');
    ballFill.addColorStop(0.65, failed ? '#ffc2a4' : '#f5fae9');
    ballFill.addColorStop(1, failed ? '#f67e65' : '#a5cfc2');
    ctx.fillStyle = ballFill;
    ctx.beginPath();
    ctx.arc(ballX, ballY, ballRadius, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  dispose() {
    this.ctx?.clearRect(0, 0, this.width, this.height);
    this.ctx = null;
  }
}

export function drawRadar(canvas, landing, rotation = 0, skin = 'mint') {
  const { width: w, height: h, dpr } = sizeCanvas(canvas, 100, 82);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const layer = landing?.layer || landing;
  if (!layer) return;
  const colors = paletteFor(skin),
    x = w / 2,
    y = h / 2;
  const radius = Math.min(w * 0.43, h * 0.43),
    inner = radius * 0.57;
  const segments = segmentsFor(layer, rotation);
  // The dashed continuation makes the empty gap legible without relying on hue.
  ctx.save();
  ctx.strokeStyle = 'rgba(141, 202, 215, .38)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.arc(x, y, (radius + inner) / 2, 0, TAU);
  ctx.stroke();
  ctx.restore();
  for (const { start, end, material } of segments) {
    annulusPath(ctx, x, y, radius, inner, 1, start, end);
    ctx.fillStyle =
      material === 'danger' ? '#f68167' : material === 'finish' ? '#e8dea0' : colors.mid;
    ctx.fill();
    if (material === 'danger') stripeFill(ctx, x, y, radius, 1, '#963d40', 8);
    ctx.beginPath();
    ctx.arc(x, y, radius, start, end);
    ctx.strokeStyle = material === 'danger' ? '#ffb590' : colors.edge;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  const markerY = y + (radius + inner) / 2;
  ctx.save();
  ctx.strokeStyle = 'rgba(240, 255, 249, .25)';
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(x, y + inner - 5);
  ctx.lineTo(x, y + radius + 5);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowColor = '#effff5';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#fffef0';
  ctx.beginPath();
  ctx.arc(x, markerY, 4.5, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#0b3144';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}
