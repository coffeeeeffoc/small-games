const COLORS = {
  background: '#f6f3e9', ink: '#244e48', muted: '#77877b', paper: '#fffdf7',
  line: '#d5dfc7', board: '#e3ead6', tile: '#edf2d9', tileBottom: '#acc49c',
  blocked: '#a9bbab', blockedBottom: '#91a68f', selected: '#f7d58b',
  selectedBottom: '#d8b06a', coral: '#f28d58', coralBottom: '#cd7043',
};
function rounded(ctx, x, y, w, h, radius, fill, stroke = null) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
function wrap(ctx, value, x, y, width, maxLines = 2, lineHeight = 21) {
  const chars = [...String(value || '')]; let line = '', row = 0;
  for (const char of chars) {
    if (ctx.measureText(line + char).width > width && line) {
      if (row === maxLines - 1) {
        while (line && ctx.measureText(line + '…').width > width) line = line.slice(0, -1);
        ctx.fillText(line + '…', x, y + row * lineHeight); return;
      }
      ctx.fillText(line, x, y + row * lineHeight); line = ''; row++;
    }
    line += char;
  }
  ctx.fillText(line, x, y + row * lineHeight);
}
export function createRenderer() {
  let targets = [], choosing = false, choicePage = 0, boardOffset = 0;
  let boardSignature = '', lastHint = null, layout = null;
  const clamp = (value, maximum) => Math.max(0, Math.min(maximum, value));
  return {
    draw(ctx, width, height, state) {
      targets = []; ctx.fillStyle = COLORS.background; ctx.fillRect(0, 0, width, height);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineWidth = 1; ctx.font = '14px sans-serif';
      if (!state?.tiles) {
        layout = null; ctx.fillStyle = COLORS.ink; ctx.fillText('小岛准备中…', 18, 30); return;
      }
      const button = (label, x, y, w, h, action, enabled = true, primary = false) => {
        const fill = enabled ? primary ? COLORS.coral : '#eaf0df' : '#e5e8dd';
        const bottom = enabled ? primary ? COLORS.coralBottom : '#c6d3b9' : '#d2d7ca';
        rounded(ctx, x, y + 3, w, h, 14, bottom); rounded(ctx, x, y, w, h, 14, fill);
        ctx.fillStyle = enabled ? COLORS.ink : '#8b9884'; ctx.font = '600 14px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(label, x + w / 2, y + h / 2); ctx.textAlign = 'left';
        targets.push({ x, y, w, h, action: enabled ? action : null, label });
      };
      const landscape = width >= 540 && width > height * 1.35;
      const compact = landscape || height < 520, margin = width < 350 ? 12 : 18;
      const hudX = landscape ? Math.round(width * .56) + 10 : margin;
      const hudWidth = landscape ? width - hudX - margin : width - margin * 2;
      const leftWidth = landscape ? hudX - 10 - margin : hudWidth;
      const headerY = compact ? 16 : 20, goalY = compact ? 36 : 48;
      const goalHeight = landscape ? Math.min(64, Math.max(50, height - 178)) : compact ? 64 : 84;
      const boardY = landscape ? 12 : goalY + goalHeight + 10;
      const boardHeight = landscape ? height - 24 : Math.max(128, height - boardY - (compact ? 126 : 164));
      const boardArea = { x: margin, y: boardY, w: leftWidth, h: boardHeight };
      const scale = Math.max(44 / 64, Math.min(1.08, (leftWidth - 16) / state.board.width,
        (boardHeight - 60) / 128));
      const boardNeedsPages = state.board.height * scale > boardHeight - 16;
      const viewport = { x: boardArea.x + 8, y: boardArea.y + (boardNeedsPages ? 52 : 8),
        w: boardArea.w - 16, h: boardArea.h - (boardNeedsPages ? 60 : 16) };
      const maximumOffset = Math.max(0, state.board.height * scale - viewport.h);
      // Overlapping pages keep every full-sized card reachable on a short phone canvas.
      const pageStep = Math.max(1, viewport.h - 64 * scale - 8);
      const signature = `${state.board.width}:${state.board.height}:` + state.tiles.map(tile => `${tile.id}:${tile.x}:${tile.y}`).join('|');
      if (signature !== boardSignature) { boardOffset = 0; boardSignature = signature; }
      boardOffset = clamp(boardOffset, maximumOffset);
      if (state.hint && state.hint !== lastHint) {
        const hinted = state.tiles.find(tile => tile.id === state.hint);
        if (hinted) boardOffset = clamp((hinted.y + hinted.size / 2) * scale - viewport.h / 2, maximumOffset);
      }
      lastHint = state.hint; if (state.finished) choosing = false;
      layout = { boardViewport: viewport, boardOffset, maximumOffset, pageStep, tileSize: 64 * scale, landscape };
      ctx.fillStyle = COLORS.ink; ctx.font = '600 13px sans-serif';
      ctx.fillText(`独立 ${state.cleanCorrect} / ${state.total}`, hudX + 2, headerY);
      const remaining = Math.max(0, Math.ceil((state.durationMs - state.elapsedMs) / 1000));
      rounded(ctx, hudX + hudWidth - 70, headerY - 14, 70, 28, 14, remaining <= 20 ? '#fae3ce' : '#e9eddd');
      ctx.textAlign = 'center'; ctx.fillStyle = remaining <= 20 ? '#965832' : COLORS.ink;
      ctx.fillText(`${remaining} 秒`, hudX + hudWidth - 35, headerY); ctx.textAlign = 'left';
      rounded(ctx, hudX, goalY, hudWidth, goalHeight, 20, COLORS.paper, '#e0e2d3');
      ctx.font = '12px sans-serif'; ctx.fillStyle = COLORS.muted;
      const compactFeedback = compact && /不正确|已使用提示|时间到|已确认/.test(state.feedback || '');
      wrap(ctx, state.finished ? '本局已完成' : compactFeedback ? state.feedback : '这一词，怎么拼？',
        hudX + 16, goalY + 16, hudWidth - 32, 1);
      ctx.font = '800 23px sans-serif'; ctx.fillStyle = COLORS.ink;
      wrap(ctx, state.meaning, hudX + 16, goalY + (compact ? 42 : 46), hudWidth - 112, compact ? 1 : 2, 23);
      button('换词义', hudX + hudWidth - 82, goalY + (compact ? 10 : 22), 70, 44, { local: 'choose' }, !state.finished);
      rounded(ctx, boardArea.x, boardArea.y, boardArea.w, boardArea.h, 24, COLORS.board, COLORS.line);
      if (boardNeedsPages) {
        ctx.fillStyle = COLORS.muted; ctx.font = '12px sans-serif'; ctx.fillText('字母小岛', boardArea.x + 14, boardArea.y + 25);
        button('往上', boardArea.x + boardArea.w - 108, boardArea.y + 3, 44, 44, { local: 'board-up' }, boardOffset > 0);
        button('往下', boardArea.x + boardArea.w - 56, boardArea.y + 3, 44, 44, { local: 'board-down' }, boardOffset < maximumOffset);
      }
      ctx.save(); ctx.beginPath(); ctx.rect(viewport.x, viewport.y, viewport.w, viewport.h); ctx.clip();
      const boardX = viewport.x + (viewport.w - state.board.width * scale) / 2;
      for (const tile of [...state.tiles].sort((a, b) => a.z - b.z)) {
        const x = boardX + tile.x * scale, y = viewport.y + tile.y * scale - boardOffset;
        const size = tile.size * scale, selected = state.selected.includes(tile.id);
        if (y + size < viewport.y || y > viewport.y + viewport.h) continue;
        const bottom = tile.blocked ? COLORS.blockedBottom : selected ? COLORS.selectedBottom : COLORS.tileBottom;
        const face = tile.blocked ? COLORS.blocked : selected ? COLORS.selected : COLORS.tile;
        rounded(ctx, x, y + 4, size, size, 12, bottom); ctx.lineWidth = tile.id === state.hint ? 3 : 2;
        rounded(ctx, x, y, size, size, 12, face, tile.id === state.hint ? COLORS.coral : tile.blocked ? '#b6c7b4' : selected ? '#ffe5b1' : '#fbfcef');
        ctx.fillStyle = tile.blocked ? '#698270' : selected ? '#84652e' : '#315c4d';
        ctx.font = `800 ${Math.max(23, size * .5)}px sans-serif`; ctx.textAlign = 'center';
        ctx.fillText(tile.char, x + size / 2, y + size / 2); ctx.textAlign = 'left'; ctx.lineWidth = 1;
        const clipped = { x: Math.max(x, viewport.x), y: Math.max(y, viewport.y),
          w: Math.min(x + size, viewport.x + viewport.w) - Math.max(x, viewport.x),
          h: Math.min(y + size, viewport.y + viewport.h) - Math.max(y, viewport.y) };
        // Covered and clipped cards absorb taps; they never pass input to a lower card.
        const fullyVisible = clipped.w >= size - .01 && clipped.h >= size - .01;
        targets.push({ ...clipped, kind: 'tile', tileId: tile.id,
          action: tile.blocked || !fullyVisible || state.finished ? null : { type: 'select', tileId: tile.id } });
      }
      ctx.restore();
      const answerY = landscape ? goalY + goalHeight + 12 : boardArea.y + boardArea.h + (compact ? 13 : 18);
      ctx.fillStyle = COLORS.muted; ctx.font = '12px sans-serif'; ctx.fillText('把答案拼在这里', hudX + 2, answerY);
      ctx.textAlign = 'right'; ctx.fillText(`${state.selected.length} / ${state.length}`, hudX + hudWidth - 2, answerY); ctx.textAlign = 'left';
      const answer = state.selected.map(id => state.tiles.find(tile => tile.id === id)?.char || '').join('');
      const answerHeight = compact ? 40 : 47;
      if (state.length > 0 && state.length <= 12) {
        const slotGap = 5, slotWidth = (hudWidth - (state.length - 1) * slotGap) / state.length;
        for (let index = 0; index < state.length; index++) {
          const x = hudX + index * (slotWidth + slotGap), char = answer[index];
          rounded(ctx, x, answerY + 14, slotWidth, answerHeight, 10, char ? '#f8e3b3' : COLORS.paper, char ? '#e9d0a2' : '#ced7bd');
          ctx.font = '750 23px sans-serif'; ctx.fillStyle = COLORS.ink; ctx.textAlign = 'center';
          ctx.fillText(char || '', x + slotWidth / 2, answerY + 14 + answerHeight / 2); ctx.textAlign = 'left';
        }
      } else {
        rounded(ctx, hudX, answerY + 14, hudWidth, answerHeight, 13, COLORS.paper, '#ced7bd');
        ctx.font = '750 23px sans-serif'; ctx.fillStyle = COLORS.ink; wrap(ctx, answer || '·  ·  ·', hudX + 14, answerY + 34, hudWidth - 28, 1);
      }
      const controlsY = answerY + (compact ? 60 : 74), controlGap = 7, controlWidth = (hudWidth - 3 * controlGap) / 4;
      ['检查', '撤回', '重排', '提示'].forEach((label, index) => button(label,
        hudX + index * (controlWidth + controlGap), controlsY, controlWidth, 44,
        { type: ['submit', 'undo', 'shuffle', 'hint'][index] }, !state.finished &&
        (index === 0 ? state.selected.length === state.length && state.length > 0 : index === 1 ? state.selected.length > 0 : true), index === 0));
      if (controlsY + 62 < height) {
        ctx.font = '12px sans-serif'; ctx.fillStyle = COLORS.muted;
        const feedback = /同一基础词库/.test(state.feedback || '') ? '只拾取完全露出的字母牌。' : state.feedback;
        wrap(ctx, feedback || '只拾取完全露出的字母牌。', hudX + 2, controlsY + 62, hudWidth - 4, height - controlsY > 90 ? 2 : 1, 18);
      }
      if (choosing) {
        ctx.fillStyle = COLORS.background; ctx.fillRect(0, 0, width, height); targets = [];
        ctx.fillStyle = COLORS.ink; ctx.font = '800 23px sans-serif'; ctx.fillText('换一个词义', margin, 29);
        ctx.font = '13px sans-serif'; ctx.fillStyle = COLORS.muted; ctx.fillText('亮色词义，字母都已露出。', margin, 59);
        const columns = width >= 600 ? 2 : 1, rows = Math.max(1, Math.floor((height - 160) / 66));
        const pageSize = rows * columns, lastPage = Math.max(0, Math.ceil(state.words.length / pageSize) - 1);
        choicePage = clamp(choicePage, lastPage); const columnWidth = (width - margin * 2 - (columns - 1) * 10) / columns;
        state.words.slice(choicePage * pageSize, (choicePage + 1) * pageSize).forEach((word, index) => {
          const x = margin + (index % columns) * (columnWidth + 10), y = 86 + Math.floor(index / columns) * 66;
          button('', x, y, columnWidth, 56, { type: 'choose', wordId: word.id }, !word.done);
          ctx.font = '650 16px sans-serif'; ctx.fillStyle = word.done ? '#8b9884' : COLORS.ink; wrap(ctx, word.meaning, x + 14, y + 18, columnWidth - 28, 1);
          ctx.font = '12px sans-serif'; ctx.fillStyle = COLORS.muted;
          ctx.fillText(word.done ? '已拾取 ✓' : word.available ? '可以拼写' : '先拾取上层字母', x + 14, y + 40);
        });
        const footer = height - 58, third = (width - margin * 2 - 16) / 3;
        button('上一页', margin, footer, third, 44, { local: 'previous' }, choicePage > 0);
        button('返回拼写', margin + third + 8, footer, third, 44, { local: 'close' }, true, true);
        button('下一页', margin + (third + 8) * 2, footer, third, 44, { local: 'next' }, choicePage < lastPage);
      }
    },
    tap(x, y) {
      const target = [...targets].reverse().find(box => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h);
      if (!target) return null;
      if (target.action?.local) {
        const local = target.action.local;
        if (local === 'previous') choicePage--;
        else if (local === 'next') choicePage++;
        else if (local === 'board-up') boardOffset = clamp(boardOffset - layout.pageStep, layout.maximumOffset);
        else if (local === 'board-down') boardOffset = clamp(boardOffset + layout.pageStep, layout.maximumOffset);
        else { choosing = local === 'choose'; choicePage = 0; }
        return null;
      }
      if (target.action?.type === 'choose') choosing = false;
      return target.action;
    },
    // Hosts and input checks can inspect public geometry instead of guessing card positions.
    getLayout() {
      return layout ? { ...layout, boardViewport: { ...layout.boardViewport },
        targets: targets.map(target => ({ ...target, action: target.action ? { ...target.action } : null })) } : null;
    },
  };
}
