import { actorBody, route } from './renderer.js';
import { roadTarget } from './engine.js';

// Shared Canvas surface: selection is local; movement, capture and time are server snapshots.
export function createRenderer({ drawAvatar, drawBackground } = {}) {
  let selected = 0,
    hits = [],
    transform = null,
    note = '', preview = null;
  const inside = (hit, x, y) =>
    x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h;
  return {
    getSelected: () => selected,
    getLayout: () => ({ hits: hits.map(hit => ({ ...hit })), transform: transform && { ...transform } }),
    select(actor, state) {
      const own = state.role === 'runner' ? state.robbers : state.cops;
      if (!own[actor] || own[actor].caught || own[actor].escaped || state.finished) return false;
      selected = actor; return true;
    },
    hitActor(x, y) {
      return hits.filter(hit => 'local' in hit.action && inside(hit, x, y))
        .sort((a, b) => Math.hypot(x-a.x-a.w/2, y-a.y-a.h/2) - Math.hypot(x-b.x-b.w/2, y-b.y-b.h/2))[0]?.action.local;
    },
    toWorld(x, y) {
      return transform && y >= transform.top && y <= transform.bottom
        ? { x: (x-transform.x)/transform.scale, y: (y-transform.y)/transform.scale } : null;
    },
    setPreview(value) { preview = value; },
    draw(ctx, width, height, state) {
      hits = [];
      ctx.fillStyle = '#fff8eb';
      ctx.fillRect(0, 0, width, height);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const text = (value, x, y, size = 14, color = '#173a59') => {
        ctx.font = `${size}px sans-serif`;
        ctx.fillStyle = color;
        ctx.fillText(value, x, y);
      };
      if (!state?.map) {
        text('正在等待街区…', 14, 24);
        return hits;
      }
      const runner = state.role === 'runner',
        own = runner ? state.robbers : state.cops;
      selected = Math.min(selected, own.length - 1);
      if (own[selected]?.caught || own[selected]?.escaped)
        selected = Math.max(
          0,
          own.findIndex((a) => !a.caught && !a.escaped),
        );
      ctx.fillStyle = '#fffbed';
      ctx.strokeStyle = '#eddfc9';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(8, 2, width - 16, 34, 17); ctx.fill(); ctx.stroke();
      text(`${state.name} · 抓获 ${state.caught}/${state.total}`, 20, 20, 14);
      ctx.textAlign = 'right';
      text(`${(state.elapsedMs / 1000).toFixed(1)} 秒`, width - 20, 20, 16, '#2471a9');
      const nodes = state.map.nodes;
      const minX = Math.min(...nodes.map((p) => p.x)) - 55,
        minY = Math.min(...nodes.map((p) => p.y)) - 65;
      const mapW = Math.max(...nodes.map((p) => p.x)) + 55 - minX,
        mapH = Math.max(...nodes.map((p) => p.y)) + 55 - minY;
      const mapBottom = Math.max(150, height - 14);
      const scale = Math.max(0.05, Math.min((width - 16) / mapW, (mapBottom - 40) / mapH));
      const left = (width - mapW * scale) / 2,
        top = 40 + (mapBottom - 40 - mapH * scale) / 2;
      transform = {
        x: left - minX * scale,
        y: top - minY * scale,
        scale,
        top: 40,
        bottom: mapBottom,
      };
      const hit = (label, x, y, w, h, action) => hits.push({ label, x, y, w, h, action });
      ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(scale, scale);
      if (drawBackground) {
        ctx.save(); ctx.beginPath(); ctx.rect(minX, minY, mapW, mapH); ctx.clip();
        drawBackground(ctx, state.map);
        ctx.restore();
      } else {
        ctx.fillStyle = '#cce9cf';
        ctx.fillRect(minX, minY, mapW, mapH);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const [color, lineWidth] of [
          ['#9db6a3', 60],
          ['#fffae9', 50],
          ['#f5e9cf', 42],
        ]) {
          ctx.strokeStyle = color;
          ctx.lineWidth = lineWidth;
          ctx.beginPath();
          for (const [a, b] of state.map.edges) {
            ctx.moveTo(nodes[a].x, nodes[a].y);
            ctx.lineTo(nodes[b].x, nodes[b].y);
          }
          ctx.stroke();
        }
      }
      nodes.forEach((point, index) => {
        const x = transform.x + point.x * scale,
          y = transform.y + point.y * scale;
        hit(`道路 ${index + 1}`, x - 18, y - 18, 36, 36, {
          type: 'move',
          actor: selected,
          x: point.x,
          y: point.y,
        });
      });
      for (const actor of own) route(ctx, actor, actor.id === selected);
      if (preview?.length) {
        ctx.strokeStyle = '#398da0'; ctx.lineWidth = 5; ctx.setLineDash([10, 7]);
        ctx.beginPath();
        preview.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
        ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.textAlign = 'center';
      for (const exit of state.exits) {
        ctx.fillStyle = exit.blocked ? '#3a836c' : '#bb5b31';
        ctx.fillRect(exit.x - 20, exit.y - 10, 40, 20);
        text(
          `${exit.label} ${exit.blocked ? '已封' : '出口'}`,
          exit.x,
          exit.y + 31,
          17,
          exit.blocked ? '#286450' : '#9a4524',
        );
      }
      for (const robber of state.robbers) {
        if (robber.gap && !robber.caught && !robber.escaped) {
          ctx.beginPath();
          ctx.moveTo(robber.gap.from.x, robber.gap.from.y);
          ctx.lineTo(robber.gap.to.x, robber.gap.to.y);
          ctx.strokeStyle = '#ed9c36';
          ctx.lineWidth = 8;
          ctx.stroke();
        }
        actorBody(
          ctx,
          robber,
          false,
          runner && robber.id === selected,
          state.elapsedMs / 1000,
          false,
          0,
          false,
          0,
          0,
          drawAvatar,
        );
        if (runner && !robber.caught && !robber.escaped)
          hit(
            `选择 ${robber.id + 1} 号小偷`,
            transform.x + robber.x * scale - 22,
            transform.y + (robber.y - 20) * scale - 22,
            44,
            44,
            { local: robber.id },
          );
        if (robber.capture > 0 && !robber.caught) {
          ctx.beginPath();
          ctx.arc(
            robber.x,
            robber.y,
            31,
            -Math.PI / 2,
            -Math.PI / 2 + robber.capture * Math.PI * 2,
          );
          ctx.strokeStyle = '#c46327';
          ctx.lineWidth = 5;
          ctx.stroke();
        }
      }
      for (const cop of state.cops) {
        actorBody(
          ctx,
          cop,
          true,
          !runner && cop.id === selected,
          state.elapsedMs / 1000,
          false,
          0,
          state.phase === 'won',
          0,
          0,
          drawAvatar,
        );
        const x = transform.x + cop.x * scale,
          y = transform.y + (cop.y - 20) * scale;
        if (!runner) hit(`选择 ${cop.id + 1} 号保安`, x - 22, y - 22, 44, 44, { local: cop.id });
      }
      ctx.restore();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (note) text(note, width / 2, height - 14, 12);
      return hits;
    },
    tap(x, y, state) {
      if (!transform || !state?.map || state.finished) return null;
      if (state.openingRemainingMs > 0 && state.firstRole !== state.role) {
        note = '开局待命，2 秒后同时行动';
        return null;
      }
      const item = [...hits].reverse().find((hit) => inside(hit, x, y));
      if (item) {
        note = '';
        if ('local' in item.action) {
          const own = state.role === 'runner' ? state.robbers : state.cops;
          if (selected === item.action.local && own[selected]?.moving)
            return { type: 'hold', actor: selected };
          selected = item.action.local;
          return null;
        }
        return { ...item.action, actor: selected };
      }
      if (y < transform.top || y > transform.bottom) return null;
      const point = {
        x: (x - transform.x) / transform.scale,
        y: (y - transform.y) / transform.scale,
      };
      const closest = roadTarget(
        { graph: { nodes: state.map.nodes, edges: state.map.edges.map(([a, b]) => ({ a, b })) } },
        point,
      );
      if (!closest) {
        note = '这里是建筑，请点道路';
        return null;
      }
      note = '';
      return { type: 'move', actor: selected, x: closest.x, y: closest.y };
    },
  };
}
