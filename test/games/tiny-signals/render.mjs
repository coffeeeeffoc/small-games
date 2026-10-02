/** Standalone, asset-free SVG art for Tiny Signals. Coordinates stay orthogonal. */
export const THEMES = [
  {
    name: '芽芽',
    color: '#638367',
    light: '#e7eddd',
    symbol: 'sprout',
    accent: '#9dad83',
    wallTop: '#c4d2b5',
    wallBottom: '#9dad8d',
    wallSide: '#788c6d',
    wallEdge: '#879978',
    wallHighlight: '#e1e9d5',
  },
  {
    name: '月月',
    color: '#b4873f',
    light: '#f4e9cc',
    symbol: 'moon',
    accent: '#d8b367',
    wallTop: '#ead7af',
    wallBottom: '#c9b080',
    wallSide: '#ad8f55',
    wallEdge: '#b59a67',
    wallHighlight: '#fff0ce',
  },
  {
    name: '棱棱',
    color: '#be7865',
    light: '#f5dfd4',
    symbol: 'triangle',
    accent: '#dba18b',
    wallTop: '#edcbbb',
    wallBottom: '#d3a18e',
    wallSide: '#af7b69',
    wallEdge: '#bf8e7a',
    wallHighlight: '#ffe6d8',
  },
  {
    name: '泡泡',
    color: '#648d9d',
    light: '#dfebed',
    symbol: 'bubbles',
    accent: '#94b8c4',
    wallTop: '#c8dbe2',
    wallBottom: '#9db8c3',
    wallSide: '#708f9d',
    wallEdge: '#86a4b2',
    wallHighlight: '#e8f3f6',
  },
];
let renderSequence = 0;
const DIRS = { up: [0, -1, -90], right: [1, 0, 0], down: [0, 1, 90], left: [-1, 0, 180] };
const DIRECTION_NAMES = { up: '上', right: '右', down: '下', left: '左' };
const esc = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
const includes = (list, cell) =>
  list instanceof Set ? list.has(cell) : (list ?? []).includes(cell);
const cellOf = (value) => (typeof value === 'number' ? value : (value?.cell ?? value?.pos ?? null));
const at = (value, index, cell, fallback) =>
  value instanceof Map
    ? (value.get(cell) ?? fallback)
    : Array.isArray(value)
      ? (value[index] ?? fallback)
      : (value?.[cell] ?? value?.[index] ?? fallback);

function motif(symbol, color, small = false) {
  const s = small ? 0.7 : 1;
  const paths =
    symbol === 'sprout'
      ? `<path d="M0 5V-4M0-1C-11 0-12-9-12-9S-1-11 0-1ZM0-4C1-14 12-13 12-13S14-3 0-4Z" fill="${color}" stroke="${color}" stroke-width="1.2"/>`
      : symbol === 'moon'
        ? `<path d="M7-12A12 12 0 1 0 11 4A10 10 0 0 1 7-12Z" fill="${color}" stroke="#85632f" stroke-width="1"/>`
        : symbol === 'triangle'
          ? `<path d="M0-13L12 8H-12Z" fill="none" stroke="${color}" stroke-width="5" stroke-linejoin="round"/>`
          : `<path d="M-5 8L-8-5M5 8L8-5" stroke="${color}" stroke-width="2.5"/><circle cx="-8" cy="-7" r="6" fill="${color}"/><circle cx="8" cy="-7" r="6" fill="${color}"/>`;
  return `<g transform="scale(${s})">${paths}</g>`;
}

function arrow(color, scale = 1, opacity = 1) {
  return `<path d="M-11-4H2V-10L14 0 2 10V4H-11Z" fill="${color}" opacity="${opacity}" transform="scale(${scale})"/>`;
}

function robot(theme, id, { done = false, charged = false } = {}) {
  return `<g class="messenger${done ? ' is-home' : ''}" transform="translate(0 3) scale(1.12)">
    <title>${esc(theme.name)}${done ? '：已到家，棋盘已冻结' : charged ? '：下次指令顺时针偏转90度' : '：机械信使'}</title>
    <ellipse cx="0" cy="15" rx="18" ry="6" fill="#3a493d" opacity=".18"/>
    <path d="M-12 9L-14 17H-7L-5 9M6 9L7 17H14L12 9" fill="url(#${id}-brass)" stroke="#8d713e" stroke-width="1.2" stroke-linejoin="round"/>
    <rect x="-21" y="-5" width="7" height="17" rx="3" fill="url(#${id}-brass)" stroke="#9d7c45"/>
    <rect x="-20" y="-3" width="4" height="11" rx="2" fill="${theme.accent}"/>
    <path d="M-16-7Q-14-19 0-20Q15-19 17-6L17 6Q15 15 0 16Q-16 14-17 5Z" fill="url(#${id}-ceramic)" stroke="#968e72" stroke-width="1.4"/>
    <path d="M-12-8Q-5-14 5-13" fill="none" stroke="#fffef7" stroke-width="3" stroke-linecap="round"/>
    <path d="M-9-3Q0-8 11-3Q15 0 12 7Q8 12-2 11Q-12 10-12 4Z" fill="#203d35" stroke="#b38946" stroke-width="2.2"/>
    ${done ? `<path d="M-7 3L-5 1-3 3M4 3L6 1 8 3" fill="none" stroke="#fff0b4" stroke-width="2" stroke-linecap="round"/>` : `<ellipse cx="-5" cy="3" rx="2.2" ry="3.1" fill="#fff0b4"/><ellipse cx="6" cy="2" rx="2.2" ry="3.1" fill="#fff0b4"/>`}
    <circle cx="2" cy="8" r="1" fill="#ffefba" opacity=".65"/>
    <g transform="translate(0 -17) scale(.6)">${motif(theme.symbol, theme.color)}</g>
    ${charged ? `<g transform="translate(15 -14) scale(.72)"><circle r="10" fill="#faf0ce" stroke="#b4873f"/><path d="M-4 2A5 5 0 1 1 4 2M1 1L5 3 7-1" fill="none" stroke="#916a29" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></g>` : ''}
    ${done ? `<g transform="translate(16 -11) scale(.8)"><circle r="8" fill="${theme.color}" stroke="#fff9e9" stroke-width="2"/><path d="M-4 0L-1 3 4-3" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>` : ''}
  </g>`;
}

function home(theme, id, done) {
  return `<g data-piece="home" transform="translate(0 3) scale(1.08)"><title>充能巢：${esc(theme.name)}到达后留在家中</title>
    <ellipse cy="16" rx="23" ry="5" fill="${theme.color}" opacity=".17"/>
    <rect x="-21" y="7" width="42" height="12" rx="4" fill="url(#${id}-brass)" stroke="#9b7d49"/>
    <path d="M-17-8L0-21 17-8V13H-17Z" fill="url(#${id}-ceramic)" stroke="#a49a7a" stroke-width="1.5"/>
    <path d="M-21-7L0-24 21-7" fill="none" stroke="#907847" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M-21-9L0-24 21-9" fill="none" stroke="${theme.color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M-16-10L0-21 16-10" fill="none" stroke="${theme.light}" stroke-width="1" opacity=".55" stroke-linecap="round"/>
    <rect x="-8" y="0" width="16" height="14" rx="6" fill="${done ? '#f8dda0' : theme.light}" stroke="${theme.color}" stroke-width="1.4"/>
    <g transform="translate(0 -8) scale(.39)">${motif(theme.symbol, theme.color)}</g>
    <circle cx="-16" cy="14" r="1.7" fill="#ffebb4"/><circle cx="16" cy="14" r="1.7" fill="#ffebb4"/>
  </g>`;
}

function leaves(x, y, theme, mirror = false) {
  return `<g transform="translate(${x} ${y})${mirror ? ' scale(-1 1)' : ''}" aria-hidden="true" opacity=".88">
    <path d="M-17 10Q-1 5 10-10" fill="none" stroke="${theme.color}" stroke-width="1.8"/>
    <path d="M-10 7Q-25 7-23-5Q-8-7-10 7M-3 3Q-12-9-4-15Q7-7-3 3M4-3Q0-18 11-20Q17-8 4-3M-16 10Q-20 22-31 17Q-31 5-16 10" fill="${theme.color}"/>
    <path d="M-7 5Q7 8 8 18Q-6 20-7 5M1-1Q18-3 21 7Q11 15 1-1" fill="${theme.accent}"/>
    <circle cx="-16" cy="-6" r="3.2" fill="#f7f0dd"/><circle cx="-14" cy="-7" r="1" fill="#cbb26b"/>
  </g>`;
}

function wallDetail(theme) {
  const details =
    theme.symbol === 'sprout'
      ? `<path d="M-2 5Q-9-6-2-8Q3-4-2 5M0 5Q2-8 8-6Q11 1 0 5" fill="${theme.color}"/><path d="M-1 5V9" stroke="${theme.color}" stroke-width="1.2"/>`
      : theme.symbol === 'triangle'
        ? `<path d="M-3 1V7M5 5V9" stroke="#f8e8d0" stroke-width="2.5" stroke-linecap="round"/><path d="M-10 2Q-4-12 3 2Z" fill="#bd7660"/><path d="M0 6Q5-4 10 6Z" fill="#f3debe"/><circle cx="-4" cy="-1" r="1.3" fill="#f8e8d0"/>`
        : `<circle r="5.5" fill="${theme.wallHighlight}" stroke="${theme.wallEdge}" stroke-width="1.2"/><path d="M-2.5 2.5L2.5-2.5" stroke="${theme.wallSide}" stroke-width="1.3" stroke-linecap="round"/><circle cx="9" cy="8" r="1.5" fill="${theme.wallSide}" opacity=".5"/>`;
  return `<g transform="translate(12 -7)" aria-hidden="true" opacity=".76">${details}</g>`;
}

/**
 * Each board owns its defs. options.previewState may be a rules-engine computed
 * board state; the renderer never invents a character destination.
 */
export function renderBoard(config, state, index = 0, options = {}) {
  const theme = THEMES[((index % 4) + 4) % 4];
  const size = config.size;
  const tile = 54;
  const margin = 28;
  const span = size * tile;
  const width = span + margin * 2;
  const height = width + 12;
  const id = `ts-board-${index}-${esc(options.id ?? 'main').replace(/[^a-zA-Z0-9_-]/g, '')}-${++renderSequence}`;
  const point = (cell) => [
    margin + (cell % size) * tile + tile / 2,
    margin + Math.floor(cell / size) * tile + tile / 2,
  ];
  const xy = (cell) => {
    const [x, y] = point(cell);
    return `translate(${x} ${y})`;
  };
  const walls = config.walls ?? [];
  const boxes = state.boxes ?? config.boxes ?? [];
  const bridges = config.bridges ?? [];
  const collapsed = state.collapsed ?? [];
  const echoCell = cellOf(state.echo);
  const plateCells = [...new Set((config.shutters ?? []).map((gate) => gate.plate))];
  const platePressed = (cell) => state.pos === cell || includes(boxes, cell);
  const gateOpen = (gate, i) => Boolean(at(state.gateOpen, i, gate.cell, false));
  const echoDirection = options.echoDirection ?? null;
  const position = (cell) => `${Math.floor(cell / size) + 1}行${(cell % size) + 1}列`;
  const describeCells = (cells) => cells.map(position).join('、');
  // role=img flattens child titles, so the board description contains every
  // relevant position and mechanism state for nonvisual navigation.
  const description = [
    `${size}乘${size}棋盘，屏幕上方为上`,
    `${theme.name}位于${position(state.pos)}${state.done ? '，已到家，棋盘冻结' : state.charged ? '，下次指令顺时针偏转90度' : ''}`,
    `家位于${position(config.home)}`,
  ];
  if (walls.length) description.push(`墙位于${describeCells(walls)}`);
  if (config.voids?.length) description.push(`不可进入的水域位于${describeCells(config.voids)}`);
  if (config.compasses?.length) description.push(`罗盘位于${describeCells(config.compasses)}`);
  if (bridges.length)
    description.push(
      `折叶桥：${bridges.map((cell) => `${position(cell)}${includes(collapsed, cell) ? '已折起' : state.pos === cell || includes(boxes, cell) ? '正在承重' : '展开'}`).join('；')}`,
    );
  if (config.winds?.length)
    description.push(
      `风场：${config.winds.map((wind, i) => `${position(wind.cell)}当前向${DIRECTION_NAMES[at(state.windDirs, i, wind.cell, wind.dir)]}`).join('；')}`,
    );
  if (config.oneWays?.length)
    description.push(
      `单向门仅允许${config.oneWays.map((gate) => `${position(gate.from)}到${position(gate.to)}`).join('；')}`,
    );
  if (boxes.length) description.push(`灯箱位于${describeCells(boxes)}`);
  if (plateCells.length)
    description.push(
      `压板：${plateCells.map((cell) => `${position(cell)}${platePressed(cell) ? '已压下' : '未压下'}`).join('；')}`,
    );
  if (config.shutters?.length)
    description.push(
      `闸门：${config.shutters.map((gate, i) => `${position(gate.cell)}${gateOpen(gate, i) ? (platePressed(gate.plate) ? '已打开' : '等待占据者离开后关闭') : '关闭'}，连接${position(gate.plate)}的压板`).join('；')}`,
    );
  if (echoCell !== null)
    description.push(
      `残影位于${position(echoCell)}，${state.done ? '已冻结' : echoDirection ? `下一拍尝试向${DIRECTION_NAMES[echoDirection]}移动，遇阻会停住` : '首拍等待，不移动'}`,
    );
  if (options.previewState && !state.done)
    description.push(
      `当前方向预览：信使落点${position(options.previewState.pos)}${cellOf(options.previewState.echo) !== null ? `，残影落点${position(cellOf(options.previewState.echo))}` : ''}`,
    );
  const out = [
    `<svg class="island-svg${state.done ? ' island-home' : ''}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="${id}-title ${id}-desc" data-board="${index}" data-cell-size="${tile}" shape-rendering="geometricPrecision">
    <title id="${id}-title">${esc(theme.name)}的小岛${state.done ? '，已到家' : ''}</title>
    <desc id="${id}-desc">${esc(description.join('。'))}。</desc>
    <defs>
      <linearGradient id="${id}-ceramic" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#fffef5"/><stop offset=".55" stop-color="#f2ecd9"/><stop offset="1" stop-color="#d4ceb7"/></linearGradient>
      <linearGradient id="${id}-brass" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#e9d5a3"/><stop offset=".48" stop-color="#c6a367"/><stop offset="1" stop-color="#947342"/></linearGradient>
      <linearGradient id="${id}-edge" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${theme.accent}"/><stop offset="1" stop-color="${theme.color}"/></linearGradient>
      <linearGradient id="${id}-wall" x1="0" y1="0" x2=".9" y2="1"><stop stop-color="${theme.wallTop}"/><stop offset="1" stop-color="${theme.wallBottom}"/></linearGradient>
      <linearGradient id="${id}-water" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#bedbd4"/><stop offset="1" stop-color="#7faeb0"/></linearGradient>
      <radialGradient id="${id}-glow"><stop stop-color="#fff2b8" stop-opacity=".95"/><stop offset="1" stop-color="#fff2b8" stop-opacity="0"/></radialGradient>
      <filter id="${id}-shadow" x="-30%" y="-30%" width="160%" height="175%"><feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-color="#45503d" flood-opacity=".17"/></filter>
    </defs>
    <ellipse cx="${width / 2}" cy="${height - 26}" rx="${span / 2 - 4}" ry="15" fill="#4c5742" opacity=".09"/>
    <rect x="${margin - 7}" y="${margin - 2}" width="${span + 14}" height="${span + 19}" rx="15" fill="${theme.color}"/>
    <rect x="${margin - 7}" y="${margin - 9}" width="${span + 14}" height="${span + 19}" rx="15" fill="url(#${id}-edge)" stroke="${theme.color}" stroke-width="1.2"/>
    <rect x="${margin - 2}" y="${margin - 4}" width="${span + 4}" height="${span + 7}" rx="10" fill="#a9a78e"/>
  `,
  ];

  // All ground tiles are legible, with wall volume kept inside its own cell.
  for (let cell = 0; cell < size * size; cell++) {
    const [cx, cy] = point(cell);
    const water = includes(config.voids, cell) || includes(bridges, cell);
    const color = water
      ? `url(#${id}-water)`
      : (Math.floor(cell / size) + (cell % size)) % 2
        ? '#f1ecd9'
        : '#faf5e7';
    out.push(
      `<g data-cell="${cell}" data-terrain="${water ? 'water' : includes(walls, cell) ? 'wall' : 'floor'}"><rect x="${cx - 26}" y="${cy - 26}" width="52" height="52" rx="3" fill="${color}" stroke="${water ? '#95beb9' : '#d7d1bf'}" stroke-width=".8"/>`,
    );
    if (water)
      out.push(
        `<path d="M${cx - 17} ${cy + 13}q6-4 12 0t12 0M${cx - 13} ${cy - 10}q4-3 8 0t8 0" fill="none" stroke="#e0eeea" stroke-width="1.4" opacity=".6"/>`,
      );
    else if (!includes(walls, cell))
      out.push(
        `<path d="M${cx - 23} ${cy + 21}V${cy - 22}H${cx + 21}" fill="none" stroke="#fffef8" stroke-width="1.4" opacity=".85"/><path d="M${cx - 21} ${cy + 23}H${cx + 22}" stroke="#dcd4bd" stroke-width="1" opacity=".55"/>`,
      );
    out.push('</g>');
  }

  // Copper inlay communicates plate–door relationships without hiding tiles.
  for (const [i, gate] of (config.shutters ?? []).entries()) {
    const [gx, gy] = point(gate.cell),
      [px, py] = point(gate.plate);
    out.push(
      `<path d="M${px} ${py}H${gx}V${gy}" fill="none" stroke="${gateOpen(gate, i) ? '#b79843' : '#c3b285'}" stroke-width="2" stroke-dasharray="3 4" opacity=".65" data-piece="gate-link"/>`,
    );
  }

  for (const cell of config.compasses ?? []) {
    out.push(
      `<g transform="${xy(cell)}" data-cell="${cell}" data-piece="compass"><title>罗盘转台：进入后，下一次指令顺时针偏转90度</title><circle r="21" fill="#e1d4ae" stroke="#ad9157" stroke-width="1.6"/><circle r="17" fill="#f5edd6" stroke="#c7b178" stroke-width=".8"/><path d="M0-15V-11M15 0H11M0 15V11M-15 0H-11" stroke="#b59a61" stroke-width="1.6"/><path d="M-8 7A11 11 0 1 1 11 0M6-3L11 2 15-3" fill="none" stroke="#977236" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M-4 4L0-7 4 4 0 1Z" fill="${theme.color}"/><circle r="2" fill="#bd9656"/></g>`,
    );
  }

  for (const cell of bridges) {
    const folded = includes(collapsed, cell),
      occupied = state.pos === cell || includes(boxes, cell);
    out.push(
      `<g transform="${xy(cell)}" data-cell="${cell}" data-piece="bridge" data-state="${folded ? 'folded' : occupied ? 'occupied' : 'open'}"><title>折叶桥：${folded ? '已经折起，不可进入' : occupied ? '正在承重，离开后会折起' : '离开后永久折起，可撤销恢复'}</title>`,
    );
    if (folded)
      out.push(
        `<path d="M-23-21H-15L-20 21H-25Z M23-21H15L20 21H25Z" fill="#b59d5d" stroke="#887744"/><path d="M-10-11L10 11M10-11L-10 11" stroke="#537e7f" stroke-width="2" opacity=".55"/>`,
      );
    else
      out.push(
        `<rect x="-25" y="-20" width="50" height="41" rx="3" fill="${occupied ? '#bcbb77' : '#cbd0a0'}" stroke="#899666" stroke-width="1.5"/><path d="M-17-18V19M-6-18V19M6-18V19M17-18V19" stroke="#8f9c6d" stroke-width="1"/><path d="M-21-16H21M-21 17H21" stroke="#e6e8c7" stroke-width="2"/><path d="M0-17V18" stroke="#bb9559" stroke-width="2"/>`,
      );
    out.push(
      `<circle cx="-23" cy="-17" r="2.3" fill="#d9bb77"/><circle cx="23" cy="17" r="2.3" fill="#d9bb77"/></g>`,
    );
  }

  for (const [i, wind] of (config.winds ?? []).entries()) {
    const dir = at(state.windDirs, i, wind.cell, wind.dir);
    const angle = DIRS[dir]?.[2] ?? 0;
    out.push(
      `<g transform="${xy(wind.cell)}" data-cell="${wind.cell}" data-piece="wind" data-direction="${esc(dir)}"><title>换向风场：追加向${{ up: '上', right: '右', down: '下', left: '左' }[dir] ?? '右'}移动一格，每回合顺时针转向</title><rect x="-22" y="-22" width="44" height="44" rx="8" fill="#dce8db" stroke="#93a68f"/><circle cx="-8" cy="-8" r="9" fill="#ece5cc" stroke="#bba06b"/><g transform="translate(-8 -8) rotate(${angle})"><path d="M0-1C-11-12 6-15 2-3C14-13 18 4 4 2C17 13 0 18 0 4C-11 15-16-1-2-1Z" fill="url(#${id}-brass)" stroke="#a9894e" stroke-width=".65"/><circle r="2.5" fill="#947344"/></g><g transform="translate(8 7) rotate(${angle})">${arrow('#496e62', 0.85)}</g><path d="M-17 9A17 17 0 0 0-4 17M-7 13L-3 17-8 20" fill="none" stroke="#8ca697" stroke-width="1.4" stroke-linecap="round"/></g>`,
    );
  }

  for (const cell of plateCells) {
    const pressed = platePressed(cell);
    out.push(
      `<g transform="${xy(cell)}" data-cell="${cell}" data-piece="plate" data-state="${pressed ? 'pressed' : 'released'}"><title>配重压板：${pressed ? '已压下' : '用信使或灯箱压住，回合末打开相连的闸门'}</title><ellipse cy="3" rx="19" ry="17" fill="#ad9b6c"/><circle r="18" fill="${pressed ? '#e8d284' : '#e8dfc2'}" stroke="#b49b58" stroke-width="1.6"/><circle r="13" fill="none" stroke="#c1a969" stroke-width="1"/><path d="M-6-6H6V6H-6Z" fill="none" stroke="#927838" stroke-width="2"/><circle cx="0" cy="0" r="2.5" fill="${pressed ? '#fff7bd' : '#a59152'}"/></g>`,
    );
  }

  out.push(
    `<g transform="${xy(config.home)}" filter="url(#${id}-shadow)">${home(theme, id, state.done)}</g>`,
  );

  // Walls use a low elevation so the grid and directions never become ambiguous.
  for (const cell of walls) {
    const row = Math.floor(cell / size),
      col = cell % size;
    const decorated =
      (row === 0 && (col === 1 || col === size - 2)) || (row === size - 2 && col === 0);
    out.push(
      `<g transform="${xy(cell)}" data-cell="${cell}" data-piece="wall"><title>墙：阻挡移动，利用停顿调整四只信使的位置</title><rect x="-26" y="-21" width="52" height="48" rx="4" fill="${theme.wallSide}"/><path d="M-26 14H26V23Q26 27 22 27H-22Q-26 27-26 23Z" fill="${theme.wallSide}"/><rect x="-26" y="-26" width="52" height="44" rx="4" fill="url(#${id}-wall)" stroke="${theme.wallEdge}" stroke-width="1.4"/><path d="M-21-21H21M-21-20V12" fill="none" stroke="${theme.wallHighlight}" stroke-width="1.7" opacity=".85"/><path d="M-20 14H20" stroke="${theme.wallEdge}" stroke-width="1" opacity=".65"/><path d="M17 10L22 7M-18-13L-13-16" stroke="${theme.wallSide}" stroke-width="1.2" opacity=".38"/>${decorated ? wallDetail(theme) : ''}</g>`,
    );
  }

  for (const [i, gate] of (config.shutters ?? []).entries()) {
    const open = gateOpen(gate, i),
      waiting = open && !platePressed(gate.plate);
    out.push(
      `<g transform="${xy(gate.cell)}" data-cell="${gate.cell}" data-piece="shutter" data-state="${waiting ? 'waiting' : open ? 'open' : 'closed'}"><title>配重闸门：${waiting ? '等待占据者离开后关闭' : open ? '已打开，可以通行' : '已关闭，需压下相连的方形压板'}</title><rect x="-24" y="-22" width="48" height="45" rx="5" fill="${open ? '#d8e2cf' : '#d1c39e'}" fill-opacity="${open ? '.6' : '1'}" stroke="#ac9764" stroke-width="1.2"/><path d="M-21-23V22M21-23V22" stroke="url(#${id}-brass)" stroke-width="6" stroke-linecap="round"/><circle cx="-21" cy="-23" r="4" fill="#e2c88b"/><circle cx="21" cy="-23" r="4" fill="#e2c88b"/>`,
    );
    if (open)
      out.push(
        `<path d="M-17-19V17M17-19V17" stroke="#af975d" stroke-width="3"/><path d="M-9 13L-3 18 8 5" fill="none" stroke="${waiting ? '#b38a47' : '#789070'}" stroke-width="2.2" stroke-linecap="round"/>`,
      );
    else
      out.push(
        `<path d="M-15-20V19M-5-20V19M5-20V19M15-20V19" stroke="#a58d58" stroke-width="3"/><circle r="12" fill="#e9dbb8" stroke="#a68b51"/><rect x="-5" y="-5" width="10" height="10" rx="1" fill="none" stroke="#8d763c" stroke-width="2"/>`,
      );
    out.push('</g>');
  }

  // Direction gates live on cell edges. The arrow itself points through the edge.
  for (const gate of config.oneWays ?? []) {
    const [fx, fy] = point(gate.from),
      [tx, ty] = point(gate.to);
    const angle = (Math.atan2(ty - fy, tx - fx) * 180) / Math.PI;
    out.push(
      `<g transform="translate(${(fx + tx) / 2} ${(fy + ty) / 2}) rotate(${angle})" data-piece="one-way" data-from="${gate.from}" data-to="${gate.to}"><title>单向风门：只允许沿箭头从第${gate.from + 1}格到第${gate.to + 1}格，逆向会停住</title><path d="M0-23V-10M0 10V23" stroke="#8c7948" stroke-width="5" stroke-linecap="round"/><path d="M-3-20L-12-16-3-8M-3 20L-12 16-3 8" fill="#d8c18b" stroke="#aa905a" stroke-width="1"/><circle cy="-23" r="3" fill="#e9d6a0"/><circle cy="23" r="3" fill="#e9d6a0"/><circle r="10" fill="#f9edca" stroke="#b99858" stroke-width="1.3"/>${arrow('#8b713b', 0.6)}</g>`,
    );
  }

  for (const cell of boxes) {
    out.push(
      `<g transform="${xy(cell)}" data-cell="${cell}" data-piece="box" filter="url(#${id}-shadow)"><title>配重灯箱：可推动一格，不能连推，可压住配重压板</title><rect x="-18" y="-16" width="36" height="36" rx="5" fill="#987d47"/><rect x="-18" y="-21" width="36" height="35" rx="5" fill="url(#${id}-brass)" stroke="#95733e" stroke-width="1.2"/><rect x="-12" y="-15" width="24" height="23" rx="4" fill="#fbebb0" stroke="#b19253"/><path d="M-10-3H10M0-13V6" stroke="#c6a76a" stroke-width="2"/><circle cx="0" cy="-3" r="5" fill="#fff7cf"/><path d="M-13-17H13" stroke="#f2ddaa" stroke-width="1.5"/><circle cx="-14" cy="11" r="1.5" fill="#f6ddb0"/><circle cx="14" cy="11" r="1.5" fill="#f6ddb0"/></g>`,
    );
  }

  // The host supplies the rules engine's actual next state, including new blockers.
  if (echoCell !== null) {
    const predictedEcho = options.previewState ? cellOf(options.previewState.echo) : null;
    const next = predictedEcho ?? echoCell;
    if (next !== echoCell && !state.done) {
      const [ex, ey] = point(echoCell),
        [nx, ny] = point(next);
      out.push(
        `<g data-piece="echo-preview" aria-hidden="true"><path d="M${ex} ${ey}L${nx} ${ny}" stroke="#9b81bc" stroke-width="2" stroke-dasharray="3 4" opacity=".75"/><rect x="${nx - 16}" y="${ny - 16}" width="32" height="32" rx="11" fill="#e0d4ed" fill-opacity=".28" stroke="#a58ac1" stroke-width="1.5" stroke-dasharray="3 3"/></g>`,
      );
    }
    out.push(
      `<g transform="${xy(echoCell)}" data-cell="${echoCell}" data-piece="echo"><title>一拍残影：重复上一回合的全局指令，碰到信使则失败；${echoDirection ? `下一拍尝试向${DIRECTION_NAMES[echoDirection]}移动` : '首拍等待'}${predictedEcho === null ? '' : next === echoCell ? '；本次预览将留在原地' : `；本次预览前往${position(next)}`}</title><ellipse cy="14" rx="16" ry="5" fill="#a38dbb" opacity=".2"/><path d="M-13 8V-4Q-13-19 0-19Q13-19 13-4V8L8 5 4 10 0 6-5 10-9 5Z" fill="#e6def0" fill-opacity=".68" stroke="#9980b7" stroke-width="2" stroke-dasharray="4 2"/><path d="M-7-2H7V5H-7Z" fill="#bca9d1"/><circle cx="-3" cy="1" r="1.7" fill="#fff9ef"/><circle cx="4" cy="1" r="1.7" fill="#fff9ef"/><path d="M-5-12H5M0-21V-24" stroke="#9e87b7" stroke-width="1.5"/><circle cy="-24" r="2" fill="#b49aca"/><g transform="translate(15 -17)" data-piece="echo-direction" data-direction="${esc(echoDirection ?? 'wait')}"><circle r="8" fill="#f7f1fc" stroke="#a58abc" stroke-width="1.2"/>${echoDirection ? `<g transform="rotate(${DIRS[echoDirection]?.[2] ?? 0})">${arrow('#8568a3', 0.4)}</g>` : '<path d="M-2.5-3V3M2.5-3V3" stroke="#9980b7" stroke-width="1.8" stroke-linecap="round"/>'}</g></g>`,
    );
  }

  const preview = options.previewState;
  if (preview && !state.done && (preview.pos !== state.pos || options.previewPath?.length > 1)) {
    const [px, py] = point(preview.pos);
    const route = options.previewPath?.length ? options.previewPath : [state.pos, preview.pos];
    const path = route.map((cell, i) => `${i ? 'L' : 'M'}${point(cell).join(' ')}`).join('');
    out.push(
      `<g data-piece="move-preview" aria-hidden="true"><path d="${path}" fill="none" stroke="${theme.color}" stroke-width="3" stroke-dasharray="4 4" opacity=".6"/><circle cx="${px}" cy="${py}" r="18" fill="${theme.light}" fill-opacity=".6" stroke="${theme.color}" stroke-width="1.5" stroke-dasharray="4 3"/></g>`,
    );
  }

  out.push(
    `<g data-piece="robot" data-cell="${state.pos}"><g transform="${xy(state.pos)}" filter="url(#${id}-shadow)">${state.done ? `<circle r="26" fill="url(#${id}-glow)"/>` : ''}${robot(theme, id, state)}</g></g>`,
  );
  // Restrained foliage stays on the frame; it never covers a traversable tile.
  out.push(
    leaves(margin - 9, margin - 1, theme),
    leaves(width - margin + 10, height - margin - 11, theme, true),
  );
  out.push(
    `<g aria-hidden="true" fill="#f6e7bf" stroke="#9c834e" stroke-width=".8"><circle cx="${margin - 2}" cy="${margin - 3}" r="2.2"/><circle cx="${width - margin + 2}" cy="${margin - 3}" r="2.2"/><circle cx="${margin - 2}" cy="${width - margin + 3}" r="2.2"/><circle cx="${width - margin + 2}" cy="${width - margin + 3}" r="2.2"/></g></svg>`,
  );
  return out.join('');
}
