import { INK, RED, TAU, CLAMP } from './palette.mjs';

/** In-world portals, bridges and interactive scenery. */
export function createScenePainter(painter, getView) {
  const { ctx, label, sprite, ring } = painter;
  function drawDoor(door, room, state, time) {
    const { cameraX, width, offsetX, scale } = getView();
    const x = door.x,
      y = door.y;
    const destination = state.rooms?.[door.target || door.to] || {};
    const bridge = room.bridges?.find((b) => b.id === door.bridgeId);
    const locked =
      Boolean(door.requiresClear && !room.cleared) ||
      Boolean(door.requiresSeals && (state.seals || 0) < door.requiresSeals) ||
      Boolean(bridge && !bridge.drawn);
    const boss =
      door.kind === 'boss' ||
      destination.kind === 'boss' ||
      destination.enemySpawns?.some(
        (enemy) =>
          (enemy.behavior || state.definition?.enemyTypes?.[enemy.type]?.behavior) === 'boss',
      );
    const direction =
      door.side ||
      door.direction ||
      (x < 100 ? 'left' : x > (room.width || 960) - 100 ? 'right' : y < 100 ? 'up' : 'down');
    const vertical =
      direction === 'left' || direction === 'right' || direction === 'west' || direction === 'east';
    ctx.save();
    ctx.fillStyle = '#353b2e';
    if (vertical) ctx.fillRect(x - 22, y - 40, 44, 80);
    else ctx.fillRect(x - 43, y - 22, 86, 44);
    ctx.fillStyle = locked ? 'rgba(153,69,50,.2)' : 'rgba(231,216,170,.36)';
    ctx.fillRect(x - 18, y - 18, 36, 36);
    ctx.strokeStyle = locked ? '#993f31' : '#dbcead';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 5]);
    ctx.strokeRect(x - 17, y - 20, 34, 40);
    ctx.setLineDash([]);
    if (boss) sprite('gate', x, y + 32, { size: 0.65 });
    if (!locked) {
      const pulse = 3 * Math.sin(time * 3);
      ctx.strokeStyle = '#ead9ac';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      if (vertical) {
        const s = x < 100 ? -1 : 1;
        ctx.moveTo(x - s * (8 + pulse), y - 7);
        ctx.lineTo(x + s * (pulse + 1), y);
        ctx.lineTo(x - s * (8 + pulse), y + 7);
      } else {
        const s = y < 100 ? -1 : 1;
        ctx.moveTo(x - 7, y - s * (8 + pulse));
        ctx.lineTo(x, y + s * (pulse + 1));
        ctx.lineTo(x + 7, y - s * (8 + pulse));
      }
      ctx.stroke();
    }
    const bridgeAtDoor = room.bridges?.some(
      (item) => Math.hypot(item.to.x - x, item.to.y - y) < 85,
    );
    const bridgeLabelSide = x + 240 > cameraX + (width - offsetX) / scale ? -1 : 1;
    const labelX = vertical
      ? x + (x < 100 ? 63 : -63)
      : x + (bridgeAtDoor ? 130 * bridgeLabelSide : 0);
    const labelY = vertical ? y - 44 : y + (y < 100 ? 40 : -39);
    const lockLabel =
      door.requiresSeals && (state.seals || 0) < door.requiresSeals
        ? `需 ${door.requiresSeals} 钥印 · `
        : bridge && !bridge.drawn
          ? '绘桥后 · '
          : '清场后 · ';
    label(
      ctx,
      `${locked ? lockLabel : ''}${door.label || door.name || destination.name || '下一页'}`,
      labelX,
      labelY,
      { size: 13, color: locked ? RED : INK },
    );
    ctx.restore();
  }

  function drawBridge(bridge, room, time) {
    const { cameraX, width, offsetX, scale } = getView();
    const a = bridge.from || bridge.start || bridge.a || { x: bridge.x ?? 425, y: bridge.y ?? 300 };
    const b = bridge.to || bridge.end || bridge.b || { x: a.x + 150, y: a.y };
    const built = bridge.built || bridge.drawn || room.bridgeBuilt;
    ctx.save();
    if (built) {
      ctx.strokeStyle = INK;
      ctx.lineWidth =
        bridge.width ||
        (bridge.rect
          ? Math.abs(b.y - a.y) > Math.abs(b.x - a.x)
            ? bridge.rect.w
            : bridge.rect.h
          : 66);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = '#c7ba94';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([17, 8]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = '#8e4936';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const p of [a, b]) {
        ctx.fillStyle = '#e8d9b6';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 17, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = RED;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 24 + Math.sin(time * 3) * 3, 0, TAU);
        ctx.strokeStyle = 'rgba(154,68,49,.3)';
        ctx.stroke();
      }
      const vertical = Math.abs(b.y - a.y) > Math.abs(b.x - a.x);
      const instructionX = CLAMP(
        vertical ? a.x : (a.x + b.x) / 2,
        cameraX + 125,
        cameraX + (width - offsetX) / scale - 125,
      );
      label(
        ctx,
        `拖墨连起两点 · ${bridge.cost || 8} 墨`,
        instructionX,
        vertical ? a.y + (a.y > b.y ? 42 : -42) : Math.min(a.y, b.y) - 38,
        { size: 14, color: RED, accent: true },
      );
      ctx.fillStyle = RED;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 5, 0, TAU);
      ctx.fill();
      label(ctx, '起笔', a.x - 46, a.y, { size: 12 });
    }
    ctx.restore();
  }

  function drawObject(object, state, time) {
    const kind = object.kind || object.type;
    const used = object.claimed || object.used || object.opened || object.collected;
    const near = Math.hypot(object.x - state.player.x, object.y - state.player.y) < 95;
    const pulse = 0.45 + 0.17 * Math.sin(time * 3);
    const names = {
      chest: '墨匣',
      cache: '墨匣',
      spring: '洗笔泉',
      merchant: '契约师',
      seal: '钥印',
      gate: '墨之门',
      bottle: '旧墨瓶',
      lore: '残页',
    };
    const action = {
      chest: '开启',
      cache: '开启',
      spring: '回复墨水',
      merchant: '签约',
      seal: '拾取',
      gate: '开启',
      bottle: '拾取',
      lore: '阅读',
    };
    if (!used) {
      const halo = ctx.createRadialGradient(object.x, object.y, 2, object.x, object.y, 58);
      halo.addColorStop(0, `rgba(185,149,74,${pulse * 0.5})`);
      halo.addColorStop(1, 'rgba(185,149,74,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.ellipse(object.x, object.y, 58, 30, 0, 0, TAU);
      ctx.fill();
      ring(
        object.x,
        object.y + 4,
        near ? 38 : 28,
        near ? '#8f4b35' : '#827147',
        pulse,
        near ? 2 : 1,
      );
    }
    if (kind === 'seal') {
      ctx.save();
      ctx.translate(object.x, object.y - 20 + Math.sin(time * 2) * 3);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#c7ac70';
      ctx.strokeStyle = '#54452e';
      ctx.lineWidth = 2;
      ctx.fillRect(-13, -13, 26, 26);
      ctx.strokeRect(-13, -13, 26, 26);
      ctx.strokeStyle = '#e5d6ad';
      ctx.strokeRect(-8, -8, 16, 16);
      ctx.restore();
    } else if (kind === 'lore') {
      ctx.save();
      ctx.translate(object.x - 25, object.y - 42);
      ctx.rotate(-0.12);
      ctx.fillStyle = '#efdfb9';
      ctx.strokeStyle = INK;
      ctx.fillRect(0, 0, 48, 38);
      ctx.strokeRect(0, 0, 48, 38);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        ctx.moveTo(7, 8 + i * 7);
        ctx.lineTo(37 - i * 3, 8 + i * 7);
      }
      ctx.stroke();
      ctx.restore();
    } else
      sprite(kind === 'cache' ? 'chest' : kind === 'shrine' ? 'spring' : kind, object.x, object.y, {
        alpha: used ? 0.52 : 1,
      });
    if (used && (kind === 'chest' || kind === 'cache'))
      label(ctx, '已取墨', object.x, object.y + 18, { color: '#716c55', size: 12 });
    else if (!used) {
      const unavailable = object.requiresClear && !state.rooms[state.roomId].cleared;
      const title = near
        ? unavailable
          ? '清场后开启'
          : `点击${action[kind] || '交互'}`
        : object.label || object.name || names[kind];
      label(ctx, title, object.x, object.y + (kind === 'merchant' ? 34 : 24), {
        size: near ? 14 : 12,
        color: near ? '#914632' : '#625536',
        accent: near,
      });
    }
  }

  return { drawDoor, drawBridge, drawObject };
}
