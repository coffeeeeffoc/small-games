import { random, CLAMP, TAU } from './palette.mjs';
import { SPRITES, makeSprite } from './assets.mjs';
import { createPainter, inkBlot } from './primitives.mjs';
import { createFloor } from './floor.mjs';
import { createScenePainter } from './scene.mjs';
import { createEntityPainter } from './entities.mjs';
import { createPickupPainter } from './pickups.mjs';
import { createEffectPainter } from './effects.mjs';

const PHONE_VIEW_WIDTH = 540;

/** Render supplied state. Room geometry and chapter identity come from its definition. */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const sprites = Object.fromEntries(
    Object.entries(SPRITES).map(([name, spec]) => [name, makeSprite(spec)]),
  );
  const backgrounds = new Map();
  const paperTile = document.createElement('canvas');
  paperTile.width = paperTile.height = 128;
  const paperContext = paperTile.getContext('2d');
  paperContext.fillStyle = '#ded0b0';
  paperContext.fillRect(0, 0, 128, 128);
  const paperRandom = random('live-page-border');
  for (let i = 0; i < 650; i++) {
    paperContext.fillStyle = `rgba(88,70,39,${0.02 + paperRandom() * 0.08})`;
    paperContext.fillRect(
      paperRandom() * 128,
      paperRandom() * 128,
      0.6 + paperRandom(),
      0.4 + paperRandom() * 2,
    );
  }
  const pagePaper = ctx.createPattern(paperTile, 'repeat');
  let worldWidth = 960,
    worldHeight = 600;
  let width = 960,
    height = 600,
    pixelRatio = 1,
    scale = 1,
    offsetX = 0,
    offsetY = 0;
  let cameraX = 0,
    cameraY = 0,
    lastState = null,
    destroyed = false;
  let lastPlayerX = null,
    lastPlayerY = null,
    lastDamageId = null,
    walking = false,
    hurtUntil = 0;
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  observer?.observe(canvas);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width || canvas.clientWidth || 960);
    height = Math.max(1, rect.height || canvas.clientHeight || 600);
    pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    updateCamera(lastState?.player);
  }

  function updateCamera(player) {
    const portrait = width / height < 1.12;
    if (portrait) {
      // A fixed horizontal field of view keeps enemies and bridge anchors in
      // sight on tall phones. Follow vertically inside the space between the
      // heading and thumb controls instead of letting feet disappear below UI.
      const viewW = Math.min(PHONE_VIEW_WIDTH, worldWidth);
      scale = width / viewW;
      const safeTop = Math.min(95, height * 0.22);
      const safeBottom = Math.min(135, height * 0.25);
      const safeHeight = Math.max(100, height - safeTop - safeBottom);
      const viewH = safeHeight / scale;
      cameraX = CLAMP(
        (player?.x ?? worldWidth / 2) - viewW / 2,
        0,
        Math.max(0, worldWidth - viewW),
      );
      cameraY =
        viewH < worldHeight
          ? CLAMP((player?.y ?? worldHeight / 2) - viewH * 0.52, 0, worldHeight - viewH)
          : 0;
      offsetX = 0;
      offsetY = safeTop + Math.max(0, (safeHeight - worldHeight * scale) / 2);
      return;
    }
    scale = Math.min(width / worldWidth, height / worldHeight);
    cameraX = 0;
    cameraY = 0;
    offsetX = Math.max(0, (width - worldWidth * scale) / 2);
    offsetY = Math.max(0, (height - worldHeight * scale) / 2);
  }

  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - offsetX) / scale + cameraX,
      y: (clientY - rect.top - offsetY) / scale + cameraY,
    };
  }

  function worldToScreen(x, y) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + offsetX + (x - cameraX) * scale,
      y: rect.top + offsetY + (y - cameraY) * scale,
    };
  }

  const getView = () => ({ cameraX, cameraY, width, height, scale, offsetX, offsetY, pixelRatio });
  const painter = createPainter(ctx, sprites, getView);
  const { drawDoor, drawBridge, drawObject } = createScenePainter(painter, getView);
  const { drawWarning, drawEnemy, drawPlayer, drawProjectile } = createEntityPainter(
    painter,
    () => lastState,
    () => walking,
  );
  const { drawPickup } = createPickupPainter(painter, () => lastState);
  const { drawEffect } = createEffectPainter(painter, () => lastState);

  function render(state, { time = 0, drawStroke = null, aimPoint = null, paused = false } = {}) {
    if (destroyed || !state) return;
    if (lastState !== state) {
      lastDamageId = null;
      hurtUntil = 0;
      lastPlayerX = null;
      lastPlayerY = null;
    }
    lastState = state;
    const player = state.player;
    const room = state.rooms[state.roomId];
    worldWidth = room.width || 960;
    worldHeight = room.height || 600;
    walking =
      lastPlayerX !== null && Math.hypot(player.x - lastPlayerX, player.y - lastPlayerY) > 0.1;
    const damage = state.effects?.findLast(
      (effect) => effect.type === 'hit' && effect.source === 'damage',
    );
    if (damage && damage.id !== lastDamageId) {
      hurtUntil = time + 0.22;
      lastDamageId = damage.id;
    }
    lastPlayerX = player.x;
    lastPlayerY = player.y;
    updateCamera(player);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.fillStyle = pagePaper || '#ded0b0';
    ctx.fillRect(0, 0, width, height);
    ctx.translate(offsetX - cameraX * scale, offsetY - cameraY * scale);
    ctx.scale(scale, scale);
    const key = `${state.definition?.id || state.levelId}/${room.id}/${worldWidth}x${worldHeight}`;
    if (!backgrounds.has(key)) {
      backgrounds.set(key, createFloor(room));
      // Bound decoded background memory across long campaigns.
      if (backgrounds.size > 6) backgrounds.delete(backgrounds.keys().next().value);
    }
    ctx.drawImage(backgrounds.get(key), 0, 0, worldWidth, worldHeight);
    for (const door of room.portals || []) drawDoor(door, room, state, time);
    const bridges = room.bridges || [];
    for (const bridge of bridges) drawBridge(bridge, room, time);
    // Telegraphs stay beneath characters: red is always a real incoming attack.
    const enemies = state.enemies || [];
    for (const enemy of enemies) if (enemy.hp > 0) drawWarning(enemy, time);
    for (const dead of state.corpses || []) inkBlot(ctx, dead.x, dead.y, 22, dead.id, 0.7);
    const objects = room.objects || [];
    const drawables = objects.map((object) => ({
      y: object.y,
      draw: () => drawObject(object, state, time),
    }));
    for (const pickup of state.pickups || []) drawPickup(pickup, time);
    for (const enemy of enemies) drawables.push({ y: enemy.y, draw: () => drawEnemy(enemy, time) });
    drawables.push({ y: player.y, draw: () => drawPlayer(player, time) });
    drawables.sort((a, b) => a.y - b.y);
    for (const drawable of drawables) drawable.draw();
    for (const projectile of state.projectiles || []) drawProjectile(projectile);
    for (const effect of state.effects || []) drawEffect(effect, time);
    if (drawStroke?.length) {
      ctx.strokeStyle = '#23291f';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      drawStroke.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      const end = drawStroke[drawStroke.length - 1];
      inkBlot(ctx, end.x, end.y, 7, 'stroke-end');
    }
    if (aimPoint && !paused) {
      ctx.strokeStyle = 'rgba(112,61,44,.65)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(aimPoint.x, aimPoint.y, 12, 0, TAU);
      ctx.moveTo(aimPoint.x - 18, aimPoint.y);
      ctx.lineTo(aimPoint.x - 8, aimPoint.y);
      ctx.moveTo(aimPoint.x + 8, aimPoint.y);
      ctx.lineTo(aimPoint.x + 18, aimPoint.y);
      ctx.moveTo(aimPoint.x, aimPoint.y - 18);
      ctx.lineTo(aimPoint.x, aimPoint.y - 8);
      ctx.moveTo(aimPoint.x, aimPoint.y + 8);
      ctx.lineTo(aimPoint.x, aimPoint.y + 18);
      ctx.stroke();
    }
    // Vignette is screen-space and never changes input coordinates.
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const vignette = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.3,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.72,
    );
    vignette.addColorStop(0, 'rgba(36,33,21,0)');
    vignette.addColorStop(1, 'rgba(36,33,21,.26)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    const lowInk = player.ink / (player.maxInk || 100) <= 0.25;
    if (hurtUntil > time || lowInk) {
      const hurt = ctx.createRadialGradient(
        width / 2,
        height / 2,
        Math.min(width, height) * 0.15,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.6,
      );
      hurt.addColorStop(0, 'rgba(154,39,26,0)');
      hurt.addColorStop(
        1,
        `rgba(154,39,26,${Math.max(lowInk ? 0.1 + Math.sin(time * 4) * 0.025 : 0, Math.min(0.3, Math.max(0, hurtUntil - time) * 1.5))})`,
      );
      ctx.fillStyle = hurt;
      ctx.fillRect(0, 0, width, height);
    }
  }
  resize();
  return {
    render,
    resize,
    screenToWorld,
    worldToScreen,
    destroy() {
      destroyed = true;
      observer?.disconnect();
      backgrounds.clear();
    },
  };
}
