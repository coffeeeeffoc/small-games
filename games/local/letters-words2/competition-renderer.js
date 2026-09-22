export function createRenderer() {
  let targets = [], choosing = false, choicePage = 0;
  const wrap = (ctx, text, x, y, width, maxLines = 2) => {
    let line = '', row = 0;
    for (const char of text) {
      if (ctx.measureText(line + char).width > width && line) {
        ctx.fillText(line, x, y + row * 22); line = ''; row++;
        if (row === maxLines) return;
      }
      line += char;
    }
    ctx.fillText(line, x, y + row * 22);
  };
  return {
    draw(ctx, width, height, state) {
      targets = [];
      ctx.fillStyle = '#f5f3eb'; ctx.fillRect(0, 0, width, height);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = '14px sans-serif';
      if (!state?.tiles) { ctx.fillStyle = '#375640'; ctx.fillText('等待比赛开始…', 16, 30); return; }
      const button = (label, x, y, w, h, action, enabled = true) => {
        ctx.fillStyle = enabled ? '#dfe8c5' : '#e4e6dc'; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = enabled ? '#284b35' : '#7b8573'; ctx.font = '14px sans-serif';
        ctx.textAlign = 'center'; ctx.fillText(label, x + w / 2, y + h / 2); ctx.textAlign = 'left';
        if (enabled) targets.push({ x, y, w, h, action });
      };
      ctx.fillStyle = '#284b35'; ctx.font = '14px sans-serif';
      ctx.fillText(`有效 ${state.cleanCorrect}/${state.total} · 提交 ${state.attempts} · ${Math.max(0, Math.ceil((state.durationMs - state.elapsedMs) / 1000))}秒`, 12, 20);
      button('换词义', width - 84, 37, 72, 44, { local: 'choose' });
      ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#284b35';
      wrap(ctx, state.meaning, 12, 51, width - 108, 2);
      const landscape = width > 620 && height < 540;
      const boardWidth = landscape ? width * .52 : width;
      const boardTop = landscape ? 12 : 95;
      const scale = Math.min((boardWidth - 20) / state.board.width, (height - (landscape ? 24 : 226)) / state.board.height);
      const boardX = (boardWidth - state.board.width * scale) / 2;
      const hudX = landscape ? boardWidth + 10 : 12;
      const hudWidth = landscape ? width - boardWidth - 22 : width - 24;
      if (landscape) {
        ctx.fillStyle = '#f5f3eb'; ctx.fillRect(0, 0, width, 94);
        ctx.fillStyle = '#284b35'; ctx.font = 'bold 20px sans-serif'; wrap(ctx, state.meaning, hudX, 28, hudWidth, 2);
        button('换词义', hudX, 68, hudWidth, 44, { local: 'choose' });
        // Remove the portrait header target, which is covered in landscape.
        targets.shift();
        ctx.font = '12px sans-serif'; ctx.fillStyle = '#284b35';
        ctx.fillText(`有效 ${state.cleanCorrect}/${state.total} · 提交 ${state.attempts}`, hudX, height - 12);
      }
      ctx.fillStyle = '#e8ecd9'; ctx.fillRect(boardX, boardTop, state.board.width * scale, state.board.height * scale);
      for (const tile of [...state.tiles].sort((a, b) => a.z - b.z)) {
        const x = boardX + tile.x * scale, y = boardTop + tile.y * scale, size = tile.size * scale;
        const selected = state.selected.includes(tile.id);
        ctx.fillStyle = tile.blocked ? '#b9c4a4' : selected ? '#32664f' : '#fffcdf'; ctx.fillRect(x, y, size, size);
        ctx.strokeStyle = tile.id === state.hint ? '#c58c26' : '#899475'; ctx.lineWidth = tile.id === state.hint ? 3 : 1; ctx.strokeRect(x, y, size, size);
        ctx.fillStyle = selected ? '#fffdec' : tile.blocked ? '#69765b' : '#294b34'; ctx.font = `bold ${Math.max(18, size * .48)}px serif`;
        ctx.textAlign = 'center'; ctx.fillText(tile.char, x + size / 2, y + size / 2); ctx.textAlign = 'left';
        // Blocked cards still absorb taps, so no covered tile receives a move through them.
        targets.push({ x, y, w: size, h: size, action: tile.blocked ? null : { type: 'select', tileId: tile.id } });
      }
      const answerY = landscape ? 138 : boardTop + state.board.height * scale + 20;
      const answer = state.selected.map(id => state.tiles.find(tile => tile.id === id)?.char || '').join('');
      ctx.fillStyle = '#284b35'; ctx.font = 'bold 21px sans-serif';
      wrap(ctx, `${answer || '点字母拼写'}  ${state.selected.length}/${state.length}`, hudX, answerY, hudWidth, 2);
      const gap = 4, size = (hudWidth - 3 * gap) / 4, controlsY = answerY + 28;
      ['检查', '撤回', '重排', '提示'].forEach((label, index) => button(label, hudX + index * (size + gap), controlsY, size, 44,
        { type: ['submit', 'undo', 'shuffle', 'hint'][index] }, !state.finished && (index === 0 ? state.selected.length === state.length : index === 1 ? state.selected.length > 0 : true)));
      ctx.font = '12px sans-serif'; ctx.fillStyle = '#486043'; wrap(ctx, state.feedback || '提示词不计排位正确量；拼出不等于掌握。', hudX, controlsY + 62, hudWidth, 2);
      if (choosing) {
        ctx.fillStyle = '#183024ee'; ctx.fillRect(0, 0, width, height); targets = [];
        ctx.fillStyle = '#fff'; ctx.font = '18px sans-serif'; ctx.fillText('选择中文词义', 16, 26);
        const columns = width >= 600 ? 2 : 1, rows = Math.max(1, Math.floor((height - 110) / 56));
        const pageSize = rows * columns, lastPage = Math.max(0, Math.ceil(state.words.length / pageSize) - 1);
        choicePage = Math.min(choicePage, lastPage);
        const columnWidth = (width - 24 - (columns - 1) * 8) / columns;
        state.words.slice(choicePage * pageSize, (choicePage + 1) * pageSize).forEach((word, index) => button(`${word.meaning} · ${word.done ? '完成' : word.available ? '可拼' : '待解锁'}`, 12 + (index % columns) * (columnWidth + 8), 48 + Math.floor(index / columns) * 56, columnWidth, 48,
          { type: 'choose', wordId: word.id }, !word.done));
        const footer = height - 50, third = (width - 32) / 3;
        button('上一页', 12, footer, third, 44, { local: 'previous' }, choicePage > 0);
        button('返回拼写', 16 + third, footer, third, 44, { local: 'close' });
        button('下一页', 20 + third * 2, footer, third, 44, { local: 'next' }, choicePage < lastPage);
      }
    },
    tap(x, y) {
      const target = [...targets].reverse().find(box => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h);
      if (!target) return null;
      if (target.action?.local) {
        if (target.action.local === 'previous') choicePage--;
        else if (target.action.local === 'next') choicePage++;
        else { choosing = target.action.local === 'choose'; choicePage = 0; }
        return null;
      }
      if (target.action?.type === 'choose') choosing = false;
      return target.action;
    },
  };
}
