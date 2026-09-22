import { actorBody, route } from './renderer.js';
import { roadTarget } from './engine.js';

// Shared Canvas surface: selection is local; movement, capture and time are server snapshots.
export function createRenderer() {
  let selected = 0, hits = [], transform = null, note = '';
  const inside = (hit, x, y) => x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h;
  return {
    draw(ctx, width, height, state) {
      hits = [];
      ctx.fillStyle = '#f5f3e9'; ctx.fillRect(0, 0, width, height);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const text = (value, x, y, size = 14, color = '#29493f') => {
        ctx.font = `${size}px sans-serif`; ctx.fillStyle = color; ctx.fillText(value, x, y);
      };
      if (!state?.map) { text('正在等待街区…', 14, 24); return hits; }
      selected = Math.min(selected, state.cops.length - 1);
      text(`${state.name} · 抓获 ${state.caught}/${state.total}`, 12, 20, 15);
      ctx.textAlign = 'right'; text(`${(state.elapsedMs / 1000).toFixed(1)} / 120 秒`, width - 12, 20, 13);
      const nodes = state.map.nodes;
      const minX = Math.min(...nodes.map(p => p.x)) - 55, minY = Math.min(...nodes.map(p => p.y)) - 65;
      const mapW = Math.max(...nodes.map(p => p.x)) + 55 - minX, mapH = Math.max(...nodes.map(p => p.y)) + 55 - minY;
      const mapBottom = Math.max(150, height - 106);
      const scale = Math.max(.05, Math.min((width - 16) / mapW, (mapBottom - 40) / mapH));
      const left = (width - mapW * scale) / 2, top = 40 + (mapBottom - 40 - mapH * scale) / 2;
      transform = { x: left - minX * scale, y: top - minY * scale, scale, top: 40, bottom: mapBottom };
      const hit = (label, x, y, w, h, action) => hits.push({ label, x, y, w, h, action });
      ctx.save(); ctx.translate(transform.x, transform.y); ctx.scale(scale, scale);
      ctx.fillStyle = '#ccdec0'; ctx.fillRect(minX, minY, mapW, mapH);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const [color, lineWidth] of [['#a8b58e', 58], ['#fff4dc', 50], ['#efe4cb', 38]]) {
        ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.beginPath();
        for (const [a, b] of state.map.edges) { ctx.moveTo(nodes[a].x, nodes[a].y); ctx.lineTo(nodes[b].x, nodes[b].y); }
        ctx.stroke();
      }
      nodes.forEach((point, index) => {
        const x = transform.x + point.x * scale, y = transform.y + point.y * scale;
        hit(`道路 ${index + 1}`, x - 18, y - 18, 36, 36, { type: 'move', cop: selected, x: point.x, y: point.y });
      });
      for (const cop of state.cops) route(ctx, cop, cop.id === selected);
      ctx.textAlign = 'center';
      for (const exit of state.exits) {
        ctx.fillStyle = exit.blocked ? '#3a836c' : '#bb5b31';
        ctx.fillRect(exit.x - 20, exit.y - 10, 40, 20);
        text(`${exit.label} ${exit.blocked ? '已封' : '出口'}`, exit.x, exit.y + 31, 17, exit.blocked ? '#286450' : '#9a4524');
      }
      for (const robber of state.robbers) {
        if (robber.gap && !robber.caught && !robber.escaped) {
          ctx.beginPath(); ctx.moveTo(robber.gap.from.x, robber.gap.from.y); ctx.lineTo(robber.gap.to.x, robber.gap.to.y);
          ctx.strokeStyle = '#ed9c36'; ctx.lineWidth = 8; ctx.stroke();
        }
        actorBody(ctx, robber, false, false, state.elapsedMs / 1000, false, 0, false, 0);
        if (robber.capture > 0 && !robber.caught) {
          ctx.beginPath(); ctx.arc(robber.x, robber.y, 31, -Math.PI / 2, -Math.PI / 2 + robber.capture * Math.PI * 2);
          ctx.strokeStyle = '#c46327'; ctx.lineWidth = 5; ctx.stroke();
        }
      }
      for (const cop of state.cops) {
        actorBody(ctx, cop, true, cop.id === selected, state.elapsedMs / 1000, false, 0, state.phase === 'won', 0);
        const x = transform.x + cop.x * scale, y = transform.y + (cop.y - 20) * scale;
        hit(`选择 ${cop.id + 1} 号警察`, x - 22, y - 22, 44, 44, { local: cop.id });
      }
      ctx.restore(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const liveRobber = state.robbers.find(r => !r.caught && !r.escaped);
      const message = state.finished ? state.phase === 'won' ? '全部归案 · 已由服务端确认' : state.phase === 'lost' ? '出口失守 · 本局不计入排位' : '超时 · 本局不计入排位'
        : note || (liveRobber?.escapeProgress > 0 ? '小偷正在翻越出口！马上拦截'
          : liveRobber?.enclosed ? `双警收网 ${Math.round(liveRobber.capture * 100)}% · 保持位置`
            : `已选 ${selected + 1} 号 · 点道路封口，再合力靠近`);
      text(message, width / 2, mapBottom + 17, 12);
      const gap = 6, buttonWidth = Math.min(84, (width - 24 - gap * state.cops.length) / (state.cops.length + 1));
      const totalWidth = buttonWidth * (state.cops.length + 1) + gap * state.cops.length;
      const buttonsLeft = (width - totalWidth) / 2, buttonY = mapBottom + 34;
      for (let index = 0; index <= state.cops.length; index++) {
        const hold = index === state.cops.length, x = buttonsLeft + index * (buttonWidth + gap);
        ctx.fillStyle = state.finished ? '#bdc9b1' : hold ? '#29493f' : index === selected ? '#337fbc' : '#dbe5d4';
        ctx.fillRect(x, buttonY, buttonWidth, 44);
        text(hold ? '留守' : `${index + 1} 号`, x + buttonWidth / 2, buttonY + 22, 14,
          !state.finished && (hold || index === selected) ? '#fff9e9' : '#29493f');
        if (!state.finished) hit(hold ? '原地留守' : `选择 ${index + 1} 号警察`, x, buttonY, buttonWidth, 44,
          hold ? { type: 'hold', cop: selected } : { local: index });
      }
      text('比赛无法暂停 · 断线时已有命令继续', width / 2, buttonY + 59, 11, '#62705b');
      return hits;
    },
    tap(x, y, state) {
      if (!transform || !state?.map || state.finished) return null;
      const item = [...hits].reverse().find(hit => inside(hit, x, y));
      if (item) {
        note = '';
        if ('local' in item.action) { selected = item.action.local; return null; }
        return { ...item.action, cop: selected };
      }
      if (y < transform.top || y > transform.bottom) return null;
      const point = { x: (x - transform.x) / transform.scale, y: (y - transform.y) / transform.scale };
      const closest = roadTarget({ graph: { nodes: state.map.nodes, edges: state.map.edges.map(([a, b]) => ({ a, b })) } }, point);
      if (!closest) { note = '这里是建筑，请点道路'; return null; }
      note = '';
      return { type: 'move', cop: selected, x: closest.x, y: closest.y };
    },
  };
}
