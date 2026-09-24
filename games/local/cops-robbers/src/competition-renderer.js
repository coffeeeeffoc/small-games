import { levels } from './levels.js';
import { legalTargets } from './engine.js';
import { getDuelLevel } from './duel-levels.js';
import { legalDuelTargets } from './duel.js';
import { drawRoleAvatar } from './role-appearance.js';

/** Local selection only; authoritative moves and turn ownership come from the server. */
export function createRenderer() {
  let selected = 0, hits = [], note = '', previousRole;
  const contains = (hit, x, y) => x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h;
  const mapFor = state => state?.kind === 'cops-duel' ? getDuelLevel(state.mode, state.levelId) : levels.find(item => item.id === state?.levelId);
  const isEnded = state => state.kind === 'cops-duel' ? Boolean(state.board.winner) : state.board.robbers.includes(-2) || state.board.robbers.every(node => node < 0) || state.board.turn >= 200 || state.elapsedMs >= 300000;
  const legal = (level, state) => state.kind === 'cops-duel' ? state.role === state.board.side ? legalDuelTargets(level, state.board, selected) : [] : legalTargets(level, state.board, selected);
  return {
    draw(ctx, width, height, state) {
      hits = [];
      const level = mapFor(state), duel = state?.kind === 'cops-duel', role = duel ? state.role : 'pursuer';
      ctx.fillStyle = '#f5f0e5'; ctx.fillRect(0, 0, width, height); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const text = (label, x, y, size = 14, color = '#263e43') => { ctx.font = `${size}px sans-serif`; ctx.fillStyle = color; ctx.fillText(label, x, y); };
      if (!level || !state.board) { text('正在等待围捕地图…', 16, 30); return hits; }
      const board = state.board, ended = isEnded(state), positions = role === 'runner' ? board.robbers : board.cops;
      if (role !== previousRole) { selected = 0; previousRole = role; note = ''; }
      selected = Math.min(selected, positions.length - 1);
      if (positions[selected] < 0) selected = Math.max(0, positions.findIndex(node => node >= 0));
      const targets = ended ? [] : legal(level, state);
      const size = Math.max(100, Math.min(width - 16, height - 150, 620)), left = (width - size) / 2, top = 60;
      const point = node => ({ x: left + level.nodes[node].x / 600 * size, y: top + level.nodes[node].y / 600 * size });
      const circle = (x, y, r, fill, stroke = '') => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); } };
      const hit = (label, x, y, w, h, action) => hits.push({ label, x, y, w, h, action });
      text(`${level.name}`, 12, 16, 15);
      text(duel ? `我是${role === 'runner' ? '突围队' : '追逐队'} · ${board.side === 'runner' ? '突围队' : '追逐队'}行动` : '围堵挑战', 12, 38, 12);
      ctx.textAlign = 'right'; text(`${duel ? Math.floor(board.turn / 2) + ' 回合' : board.turn + ' 步'}`, width - 12, 16, 12);
      ctx.textAlign = 'center'; ctx.fillStyle = '#e3e8d2'; ctx.fillRect(left, top, size, size);
      ctx.lineCap = 'round'; ctx.lineWidth = Math.max(12, size * 0.032); ctx.strokeStyle = '#fbf7e8';
      for (const [from, to] of level.edges) { const a = point(from), b = point(to); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      level.nodes.forEach((_, index) => {
        const p = point(index), reachable = targets.includes(index), exit = level.exits.includes(index);
        circle(p.x, p.y, 11, exit ? '#ffd39e' : '#fbf7e8', reachable ? '#1258c2' : '#aebea6');
        text(`${index + 1}`, p.x, p.y + 18, 11, reachable ? '#1258c2' : '#566851');
        if (exit) text('出口', p.x, p.y - 25, 10, '#a44908');
        hit(`${index + 1} 号路口`, p.x - 20, p.y + 2, 40, 34, { target: index });
      });
      for (const side of ['runner', 'pursuer']) (side === 'runner' ? board.robbers : board.cops).forEach((node, index) => {
        if (node < 0) return;
        const p = point(node), mine = role === side;
        if (mine && index === selected) circle(p.x, p.y - 10, 21, '#d0e7f8', '#1258c2');
        drawRoleAvatar(ctx, side === 'pursuer' ? 'cop' : 'robber', p.x - 16, p.y - 29, 32);
        ctx.textAlign = 'center'; text(`${side === 'pursuer' ? '追' : '突'}${index + 1}`, p.x, p.y - 33, 11, side === 'pursuer' ? '#1258c2' : '#a44908');
        hit(`${side === 'pursuer' ? '追逐队' : '突围队'} ${index + 1} 号`, p.x - 22, p.y - 35, 44, 40, mine ? { local: index } : { target: node });
      });
      const message = ended ? `${duel ? board.winner === 'runner' ? '突围队获胜' : '追逐队获胜' : board.robbers.includes(-2) ? '突围成功' : '拦截成功'} · 等待结算`
        : duel && board.side !== role ? '等待对手行动' : note || `已选 ${selected + 1} 号，点相邻路口数字移动`;
      text(message, width / 2, top + size + 17, 12);
      const buttonY = top + size + 33, buttonWidth = Math.min(180, width - 24), buttonX = (width - buttonWidth) / 2, canAct = !ended && (!duel || board.side === role);
      ctx.fillStyle = canAct ? '#1258c2' : '#b9c4b8'; ctx.fillRect(buttonX, buttonY, buttonWidth, 40);
      text(ended ? '本局结束' : canAct ? '留守一步' : '对手行动中', width / 2, buttonY + 20, 14, '#fffdf5');
      if (canAct) hit('留守一步', buttonX, buttonY, buttonWidth, 40, { target: positions[selected] });
      return hits;
    },
    tap(x, y, state) {
      const level = mapFor(state);
      if (!level || !state?.board || isEnded(state)) return null;
      const duel = state.kind === 'cops-duel';
      if (duel && state.role !== state.board.side) return null;
      const item = hits.filter(target => contains(target, x, y)).sort((a, b) => Math.hypot(x-a.x-a.w/2,y-a.y-a.h/2)-Math.hypot(x-b.x-b.w/2,y-b.y-b.h/2))[0];
      if (!item) return null;
      if ('local' in item.action) { selected = item.action.local; note = ''; return null; }
      const target = item.action.target;
      if (!legal(level, state).includes(target)) { note = '只能走相邻路口'; return null; }
      note = '';
      return duel ? { type: 'move', side: state.role, actor: selected, target } : { type: 'move', cop: selected, target };
    },
  };
}
