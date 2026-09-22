import { levels } from './levels.js';
import { legalTargets } from './engine.js';

/** Shared native/H5 surface. Only selection is local; every move waits for the server. */
export function createRenderer() {
  let selected = 0, hits = [], note = '';
  const contains = (hit, x, y) => x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h;
  return {
    draw(ctx, width, height, state) {
      hits = [];
      const level = levels.find(item => item.id === state?.levelId);
      ctx.fillStyle = '#f5f0e5'; ctx.fillRect(0, 0, width, height);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const text = (label, x, y, size = 14, color = '#263e43') => {
        ctx.font = `${size}px sans-serif`; ctx.fillStyle = color; ctx.fillText(label, x, y);
      };
      if (!level || !state.board) { text('正在等待围捕地图…', 16, 30); return hits; }
      const board = state.board, lost = board.robbers.includes(-2), won = board.robbers.every(node => node === -1);
      const ended = lost || won || board.turn >= 200 || state.elapsedMs >= 300000;
      selected = Math.min(selected, board.cops.length - 1);
      const targets = ended ? [] : legalTargets(level, board, selected);
      const size = Math.max(100, Math.min(width - 16, height - 122, 620));
      const left = (width - size) / 2, top = 45;
      const point = node => ({ x: left + level.nodes[node].x / 600 * size, y: top + level.nodes[node].y / 600 * size });
      const circle = (x, y, r, fill, stroke = '') => {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
      };
      const hit = (label, x, y, w, h, action) => hits.push({ label, x, y, w, h, action });
      text(`第 ${level.id} 关 · ${level.name}`, 12, 18, 16);
      ctx.textAlign = 'right'; text(`${board.turn} 步 · 待捕 ${board.robbers.filter(n => n >= 0).length}`, width - 12, 18, 13);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e3e8d2'; ctx.fillRect(left, top, size, size);
      ctx.lineCap = 'round'; ctx.lineWidth = Math.max(12, size * 0.036); ctx.strokeStyle = '#fbf7e8';
      for (const [from, to] of level.edges) {
        const a = point(from), b = point(to);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      level.nodes.forEach((_, index) => {
        const p = point(index), reachable = targets.includes(index), exit = level.exits.includes(index);
        circle(p.x, p.y, 12, exit ? '#f1b998' : '#fbf7e8', reachable ? '#177c91' : '#aebea6');
        text(`${index + 1}`, p.x, p.y + 19, 12, reachable ? '#07576b' : '#566851');
        if (exit) text(board.cops.includes(index) ? '已守住' : '出口', p.x, p.y - 23, 11, '#ae4726');
        hit(`${index + 1} 号路口`, p.x - 20, p.y + 4, 40, 33, { type: 'move', cop: selected, target: index });
      });
      board.robbers.forEach(node => {
        if (node < 0) return;
        const p = point(node);
        circle(p.x, p.y - 9, 13, '#bb583b', '#fff8e8'); text('贼', p.x, p.y - 9, 13, '#fff8e8');
      });
      board.cops.forEach((node, index) => {
        const p = point(node);
        if (index === selected) circle(p.x, p.y - 12, 21, '#c6e6db', '#177c91');
        circle(p.x, p.y - 12, 15, '#177c91', '#fff8e8');
        text(String(index + 1), p.x, p.y - 12, 16, '#fff8e8');
        hit(`选择 ${index + 1} 号警察`, p.x - 22, p.y - 34, 44, 42, { local: index });
      });
      const message = ended ? won ? '全部归案 · 等待服务端结算' : lost ? '出口失守 · 本局不计入排位' : '达到本局限制 · 等待结算'
        : note || `已选 ${selected + 1} 号，点相邻路口数字移动`;
      text(message, width / 2, top + size + 18, 12, lost ? '#ae4726' : '#263e43');
      const buttonY = top + size + 35;
      const buttonWidth = Math.min(180, width - 24), buttonX = (width - buttonWidth) / 2;
      ctx.fillStyle = ended ? '#b9c4b8' : '#177c91'; ctx.fillRect(buttonX, buttonY, buttonWidth, 40);
      text(ended ? '本局结束' : '全队留守一步', width / 2, buttonY + 20, 14, '#fffdf5');
      if (!ended) hit('全队留守一步', buttonX, buttonY, buttonWidth, 40, { type: 'move', cop: selected, target: board.cops[selected] });
      return hits;
    },
    tap(x, y, state) {
      const level = levels.find(item => item.id === state?.levelId);
      if (!level || !state?.board || state.board.robbers.includes(-2) || state.board.robbers.every(node => node === -1)
        || state.board.turn >= 200 || state.elapsedMs >= 300000) return null;
      const item = [...hits].reverse().find(target => contains(target, x, y));
      if (!item) return null;
      if ('local' in item.action) { selected = item.action.local; note = ''; return null; }
      const target = item.action.target;
      if (!legalTargets(level, state.board, selected).includes(target)) { note = '只能走相邻空路口'; return null; }
      note = '';
      return { type: 'move', cop: selected, target };
    },
  };
}
