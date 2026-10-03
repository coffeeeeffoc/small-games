export const COLORS = ['#7acbd9', '#e7c184', '#d6a1cf', '#a4d6a0'];
export const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const localized = (item, key, locale) =>
  locale === 'zh' ? item[`${key}Zh`] || item[key] : item[key];
export const format = (value) => Number(value.toFixed(2)).toString();
export const coordinate = (x, y) => `${String.fromCharCode(65 + x)}${y + 1}`;
export function pieceIcon(piece, fixed = false) {
  const diagonal = piece.orientation === '/' ? 'M17 47 47 17' : 'M17 17 47 47';
  const mark =
    piece.type === 'mirror'
      ? `<path class="piece-mirror" d="${diagonal}"/><path d="M14 48 48 14" fill="none" stroke="#345d58" stroke-width="1" transform="${piece.orientation === '/' ? '' : 'translate(64 0) scale(-1 1)'}"/>`
      : piece.type === 'splitter'
        ? `<path class="piece-splitter" d="M7 32h12m26 0h12M32 7v12m0 26v12"/><path d="${diagonal}" stroke="#f5d997" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="32" r="5" fill="#f5d997"/>`
        : `<rect class="piece-delay" x="12" y="12" width="40" height="40" rx="10"/><path d="M3 32h9m40 0h9" stroke="#d7a6d1" stroke-width="2"/><text class="tile-badge" x="32" y="38">+${piece.delayTicks}</text>`;
  return `<svg viewBox="0 0 64 64" aria-hidden="true" class="${fixed ? 'fixed-piece' : ''}">${mark}${fixed ? '<circle class="fixed-screw" cx="53" cy="11" r="4"/>' : ''}</svg>`;
}
function portIcon(source, dir, zh) {
  if (source) {
    const rotations = { E: 0, S: 90, W: 180, N: 270 };
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><circle class="port" cx="32" cy="28" r="18"/><path class="port-fill" d="m27 19 14 9-14 9z" transform="rotate(${rotations[dir]} 32 28)"/><text class="source-name" x="32" y="57">${zh ? '声源' : 'IN'}</text></svg>`;
  }
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><circle class="port" cx="32" cy="27" r="18"/><circle class="port" cx="32" cy="27" r="10"/><circle class="port-fill" cx="32" cy="27" r="4"/><text class="receiver-name" x="32" y="57">${zh ? '接收' : 'OUT'}</text></svg>`;
}
export function renderBoard(
  board,
  level,
  state,
  { selectedPiece = null, phase = 'ready', locale = 'zh' } = {},
) {
  const zh = locale === 'zh';
  const busy = phase === 'running' || phase === 'paused';
  const focus = document.activeElement?.closest?.('.cell');
  const focused = focus ? { x: focus.dataset.x, y: focus.dataset.y } : null;
  const typeNames = zh
    ? { mirror: '反射板', splitter: '分声器', delay: '延迟器' }
    : { mirror: 'mirror', splitter: 'splitter', delay: 'delay' };
  const pieces = new Map(
    [...level.fixed, ...state.pieces.filter((p) => p.x !== null)].map((p) => [`${p.x},${p.y}`, p]),
  );
  const fixedIds = new Set(level.fixed.map((p) => p.id));
  const walls = new Set(level.walls.map((p) => `${p.x},${p.y}`));
  const absorbers = new Map(level.absorbers.map((p) => [`${p.x},${p.y}`, p]));
  let html = '';
  for (let y = 0; y < level.rows; y++)
    for (let x = 0; x < level.cols; x++) {
      const key = `${x},${y}`;
      const piece = pieces.get(key);
      const wall = walls.has(key);
      const absorber = absorbers.get(key);
      const source = level.source.x === x && level.source.y === y;
      const receiver = level.receiver.x === x && level.receiver.y === y;
      const fixed = piece && fixedIds.has(piece.id);
      const contents = piece
        ? `${fixed ? (zh ? '固定 ' : 'fixed ') : ''}${typeNames[piece.type]} ${piece.type === 'delay' ? `+${piece.delayTicks}` : piece.orientation}`
        : source
          ? zh
            ? '声源'
            : 'source'
          : receiver
            ? zh
              ? '接收器'
              : 'receiver'
            : wall
              ? zh
                ? '墙'
                : 'wall'
              : absorber
                ? zh
                  ? `吸音地格，损失${absorber.loss}能量`
                  : `absorber, costs ${absorber.loss} energy`
                : zh
                  ? '空格'
                  : 'empty';
      html += `<button type="button" class="cell ${wall ? 'wall' : ''} ${absorber ? 'absorber' : ''} ${source ? 'source' : ''} ${receiver ? 'receiver' : ''} ${piece && !fixed ? 'has-piece' : ''} ${piece?.id === selectedPiece ? 'selected' : ''}" data-x="${x}" data-y="${y}" ${piece && !fixed ? `data-piece="${piece.id}"` : ''} ${fixed ? 'data-fixed="true"' : ''} ${busy ? 'disabled' : ''} aria-label="${coordinate(x, y)} ${escapeHtml(contents)}" aria-pressed="${piece?.id === selectedPiece}"><span class="coord">${coordinate(x, y)}</span>${absorber ? `<span class="absorption-loss">−${absorber.loss}</span>` : ''}${source ? portIcon(true, level.source.dir, zh) : receiver ? portIcon(false, null, zh) : piece ? pieceIcon(piece, fixed) : ''}</button>`;
    }
  html += `<svg id="trace-layer" viewBox="0 0 ${level.cols * 64} ${level.rows * 64}" aria-hidden="true"></svg>`;
  board.style.gridTemplateColumns = `repeat(${level.cols},minmax(0,1fr))`;
  board.innerHTML = html;
  board.dataset.level = level.id;
  board.dataset.status = phase;
  if (focused)
    board
      .querySelector(`[data-x="${focused.x}"][data-y="${focused.y}"]`)
      ?.focus({ preventScroll: true });
}
export function renderInventory(
  container,
  level,
  state,
  { selectedPiece = null, phase = 'ready', locale = 'zh' } = {},
) {
  const busy = phase === 'running' || phase === 'paused';
  const zh = locale === 'zh';
  const names = zh
    ? { mirror: '反射板', splitter: '分声器', delay: '延迟器' }
    : { mirror: 'mirror', splitter: 'splitter', delay: 'delay' };
  const focused = document.activeElement?.closest?.('.tray-piece')?.dataset.piece;
  container.innerHTML = state.pieces
    .map(
      (piece, i) =>
        `<button type="button" class="tray-piece ${piece.id === selectedPiece ? 'selected' : ''} ${piece.x !== null ? 'placed' : ''}" data-piece="${piece.id}" ${busy || piece.x !== null ? 'disabled' : ''} aria-label="${names[piece.type]} ${piece.id}${piece.x !== null ? (zh ? ' 已放置' : ' placed') : ''}" aria-pressed="${piece.id === selectedPiece}">${pieceIcon(piece)}<span class="piece-id">${String(i + 1).padStart(2, '0')}</span></button>`,
    )
    .join('');
  if (focused) container.querySelector(`[data-piece="${focused}"]`)?.focus({ preventScroll: true });
}
const center = (p) => ({ x: p.x * 64 + 32, y: p.y * 64 + 32 });
export function renderTrace(board, level, report, elapsed, phase) {
  const layer = board.querySelector('#trace-layer');
  if (!layer) return;
  if (!report) {
    layer.innerHTML = '';
    return;
  }
  let paths = '';
  let pulses = '';
  for (const segment of report.segments) {
    if (segment.start > elapsed) continue;
    const from = center(segment.from),
      to = center(segment.to);
    const fraction = Math.max(
      0,
      Math.min(1, (elapsed - segment.start) / Math.max(0.001, segment.end - segment.start)),
    );
    const end = { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
    const color = COLORS[segment.colorIndex % COLORS.length];
    if (segment.kind === 'travel')
      paths += `<path class="trace-segment" d="M${from.x} ${from.y}L${end.x} ${end.y}" stroke="${color}" stroke-width="3" opacity="${phase === 'result' ? 0.6 : 0.45}"/>`;
    if (
      (phase === 'running' || phase === 'paused') &&
      elapsed >= segment.start &&
      elapsed < segment.end
    ) {
      pulses += `<circle class="pulse" data-pulse="${segment.branchId}" cx="${end.x}" cy="${end.y}" r="${segment.kind === 'hold' ? 8 : 5}" fill="${color}" style="color:${color}" opacity="${Math.max(0.3, Math.min(1, segment.energy / 45))}"/>`;
      if (segment.kind === 'hold')
        pulses += `<circle cx="${end.x}" cy="${end.y}" r="${14 + Math.sin(elapsed * 4) * 2}" stroke="${color}" fill="none" opacity=".5"/>`;
    }
  }
  for (const failure of report.failures) {
    if (failure.tick > elapsed) continue;
    const x = Math.max(0, Math.min(level.cols - 1, failure.x)) * 64 + 32,
      y = Math.max(0, Math.min(level.rows - 1, failure.y)) * 64 + 32;
    paths += `<g class="failure-marker"><circle class="trace-failure" cx="${x}" cy="${y}" r="10"/><path d="m${x - 4} ${y - 4} 8 8m0-8-8 8" stroke="#503b30" stroke-width="2"/></g>`;
  }
  layer.innerHTML = paths + pulses;
}
