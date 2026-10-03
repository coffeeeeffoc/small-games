import { getSnapshot } from './engine.mjs';

export const RAIL_TOP = 150;
export const RAIL_BOTTOM = 450;
export const shaftY = (value) => RAIL_BOTTOM - 150 * value;
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const pointList = (points) => points.map((point) => point.join(',')).join(' ');
const screw = (x, y) =>
  `<g transform="translate(${x} ${y})"><circle r="8" fill="url(#brass)" stroke="#77613c" stroke-width="1.5"/><path d="M-3 3 3-3" stroke="#5b482d" stroke-width="2"/></g>`;

function gateArt(gate, side, highlight, level) {
  const ghost = gate.side !== side;
  const color = gate.side === 'front' ? '#c9a56b' : '#77a594';
  const index = level.path.findIndex(([x, y]) => x === gate.x && y === gate.y);
  const next = level.path[index + 1] || [gate.x + 10, gate.y];
  const angle = (Math.atan2(next[1] - gate.y, next[0] - gate.x) * 180) / Math.PI;
  const panelY = gate.open ? -96 : -31;
  return `<g data-gate="${escape(gate.id)}" data-open="${gate.open}" class="${highlight ? 'hint-highlight' : ''}" opacity="${ghost ? 0.5 : 1}">
    <g transform="translate(${gate.x} ${gate.y}) rotate(${angle})">
      <rect x="10" y="-30" width="16" height="60" rx="4" fill="none" stroke="${color}" stroke-dasharray="${ghost ? '4 4' : 'none'}" stroke-width="2"/>
      <rect x="18" y="${panelY}" width="16" height="62" rx="4" fill="${ghost ? 'none' : color}" stroke="${ghost ? color : '#5d6851'}" stroke-width="2" stroke-dasharray="${ghost ? '4 4' : 'none'}"/>
      ${!ghost ? `<path d="M23 ${panelY + 8}v45" stroke="#f2e4bc" opacity=".4" stroke-width="2"/>` : ''}
    </g>
    <g transform="translate(${gate.x - 69} ${gate.y + 28})"><rect x="-6" y="-12" width="${ghost ? 68 : 54}" height="23" rx="5" fill="#21382e" stroke="${color}" stroke-width="1"/><text x="${ghost ? 28 : 20}" y="4" text-anchor="middle" font-size="12" fill="${color}" class="board-label">${ghost ? '另面 ' : ''}${escape(gate.shaft)}${gate.open ? ' ✓' : ' ▪'}</text></g>
  </g>`;
}

function railArt(shaft) {
  const x = shaft.x;
  return `<g><rect x="${x - 23}" y="95" width="46" height="412" rx="14" fill="#2a3021" stroke="#aea07e" stroke-width="2"/><rect x="${x - 8}" y="103" width="16" height="396" rx="8" fill="url(#brass)"/><path d="M${x - 3} 114v374" stroke="#f6dba6" stroke-width="2" opacity=".6"/><rect x="${x - 20}" y="94" width="40" height="17" rx="5" fill="url(#brass)" stroke="#6e572e"/><rect x="${x - 20}" y="492" width="40" height="17" rx="5" fill="url(#brass)" stroke="#6e572e"/></g>`;
}

function shaftArt(shaft, side, drag, highlighted) {
  const x = shaft.x;
  const y = drag?.id === shaft.id ? drag.y : shaftY(shaft.value);
  const id = escape(shaft.id);
  const notchLabels = shaft.notches || ['低', '中', '高'];
  const notches = [0, 1, 2]
    .map((value) => {
      const ny = shaftY(value);
      return `<g class="notch-control board-control" data-notch-shaft="${id}" data-value="${value}" role="button" tabindex="-1" aria-label="${id} 轴${notchLabels[value]}位"><rect class="svg-hit" x="${x - 56}" y="${ny - 56}" width="112" height="112"/><circle cx="${x}" cy="${ny}" r="13" fill="#28362a" stroke="${shaft.color}" stroke-width="1.5"/><circle cx="${x}" cy="${ny}" r="3" fill="${shaft.color}"/><text x="${x + 25}" y="${ny + 5}" fill="#726344" font-size="15" class="rail-label">${escape(notchLabels[value])}</text></g>`;
    })
    .join('');
  return `<g class="shaft-control board-control ${highlighted ? 'hint-highlight' : ''}" data-shaft="${id}" data-value="${shaft.value}" data-locked="${shaft.locked}" tabindex="0" role="slider" aria-label="${id} 滑轴，${side === 'front' ? escape(shaft.frontRole) : escape(shaft.backRole)}" aria-valuemin="0" aria-valuemax="2" aria-valuenow="${shaft.value}" aria-valuetext="${notchLabels[shaft.value]}位${shaft.locked ? '，被锁扣固定' : ''}" aria-disabled="${shaft.locked}">
    <rect class="svg-hit" x="${x - 56}" y="94" width="112" height="412"/>
    <circle cx="${x}" cy="71" r="21" fill="#244c44" stroke="${shaft.color}" stroke-width="2"/><text x="${x}" y="79" text-anchor="middle" fill="#f1e9d6" font-size="24" font-weight="600" class="board-label">${id}</text>
    ${notches}
    <g data-shaft-handle="${id}" transform="translate(${x} ${y})"><rect class="svg-hit" x="-56" y="-56" width="112" height="112"/><rect x="-30" y="-26" width="60" height="52" rx="10" fill="url(#brass)" stroke="#6f592f" stroke-width="2"/><rect x="-22" y="-18" width="44" height="36" rx="5" fill="none" stroke="#f4d79f" stroke-width="1.5"/><path d="M-9-6h18M-9 0h18M-9 6h18" stroke="#82602f" stroke-width="2.5" stroke-linecap="round"/>${shaft.locked ? '<circle cx="21" cy="-20" r="8" fill="#a85141" stroke="#e0b687" stroke-width="1.5"/>' : ''}</g>
    <text x="${x}" y="532" text-anchor="middle" fill="#6d603f" font-size="13" class="board-label">${id} · ${shaft.locked ? '已锁定' : '可滑动'}</text>
  </g>`;
}

function latchArt(latch, highlight) {
  const x = latch.x;
  const y = latch.y;
  const color = latch.engaged ? '#b76652' : '#7eaa89';
  const condition = (latch.releaseWhen ?? [])
    .map((item) => `${item.shaft} · ${['低', '中', '高'][item.positions[0]]}`)
    .join(' / ');
  return `<g class="latch-control board-control ${highlight ? 'hint-highlight' : ''}" data-latch="${escape(latch.id)}" role="button" tabindex="0" aria-label="${escape(latch.label)}${latch.engaged ? '，点击松开' : '，点击扣紧'}${condition ? `，需 ${condition}` : ''}" aria-pressed="${latch.engaged}" transform="translate(${x} ${y})">
    <rect class="svg-hit" x="-56" y="-56" width="112" height="112"/>
    <path d="M0 0h-58" stroke="#865838" stroke-width="8" stroke-linecap="round" pointer-events="none" opacity="${latch.engaged ? 1 : 0.25}"/>
    <rect x="-42" y="-19" width="60" height="38" rx="12" fill="${color}" stroke="#704f37" stroke-width="2" transform="rotate(${latch.engaged ? 0 : -60})"/>
    <circle r="16" fill="url(#brass)" stroke="#77603b" stroke-width="2"/><path d="M-5 5 5-5" stroke="#735932" stroke-width="3"/>
    <rect x="-54" y="28" width="108" height="27" rx="5" fill="#274839" stroke="${color}"/><text y="47" text-anchor="middle" fill="#f4e9d3" font-size="17" class="board-label">${condition || `${latch.shaft} ${latch.engaged ? '锁住' : '松开'}`}</text>
    ${condition ? `<circle cx="30" cy="-28" r="7" fill="${latch.canRelease ? '#80b591' : '#b06554'}" stroke="#f1d6a0" stroke-width="2"/>` : ''}
  </g>`;
}

// Keep the touched handle alive for the entire native touch sequence.
export function renderDragPreview(board, level, state, drag) {
  board
    .querySelector(`[data-shaft-handle="${drag.id}"]`)
    ?.setAttribute(
      'transform',
      `translate(${level.shafts.find((shaft) => shaft.id === drag.id).x} ${drag.y})`,
    );
  board.querySelector(`[data-shaft="${drag.id}"]`)?.classList.add('hint-highlight');
  for (const gate of getSnapshot(level, state).gates) {
    const element = board.querySelector(`[data-gate="${gate.id}"]`);
    if (element) element.outerHTML = gateArt(gate, state.side, gate.shaft === drag.id, level);
  }
}

export function renderBoard(
  board,
  level,
  state,
  { ball = level.path[0], drag = null, highlighted = null } = {},
) {
  const snapshot = getSnapshot(level, state);
  const back = state.side === 'back';
  board.dataset.level = String(level.number);
  board.dataset.side = state.side;
  board.dataset.status = state.completed ? 'won' : 'playing';
  board.setAttribute(
    'aria-label',
    `第 ${level.number} 盒，${back ? '背面锁扣与挡板' : '正面球道与挡门'}`,
  );
  board.innerHTML = `<defs>
    <linearGradient id="case" x2=".7" y2="1"><stop stop-color="#ede3cd"/><stop offset="1" stop-color="#c8b998"/></linearGradient>
    <linearGradient id="brass" x2="1" y2=".5"><stop stop-color="#8f6c36"/><stop offset=".35" stop-color="#efd09a"/><stop offset=".65" stop-color="#d5ac67"/><stop offset="1" stop-color="#8c6b39"/></linearGradient>
    <radialGradient id="ball-glow" cx=".32" cy=".25"><stop stop-color="#ffdca0"/><stop offset=".4" stop-color="#efa259"/><stop offset="1" stop-color="#c86e34"/></radialGradient>
    <pattern id="grain" width="38" height="38" patternUnits="userSpaceOnUse"><path d="M0 19h38M19 0v38" stroke="#f3e2ba" opacity=".025"/></pattern>
    <filter id="shadow"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-opacity=".3"/></filter>
  </defs>
  <rect width="720" height="600" fill="#243c32"/><rect width="720" height="600" fill="url(#grain)"/>
  <ellipse cx="360" cy="574" rx="315" ry="18" fill="#12251f" opacity=".5"/>
  <rect x="54" y="541" width="61" height="33" rx="7" fill="url(#brass)"/><rect x="605" y="541" width="61" height="33" rx="7" fill="url(#brass)"/>
  <rect x="17" y="23" width="686" height="530" rx="31" fill="#1c2b22"/>
  <rect x="18" y="18" width="684" height="531" rx="27" fill="url(#case)" stroke="#ad9d7e" stroke-width="2"/>
  <rect x="30" y="30" width="660" height="507" rx="19" fill="none" stroke="#fff4db" stroke-width="2" opacity=".7"/>
  <rect x="44" y="47" width="158" height="42" rx="8" fill="#293d31" stroke="#a8956f" stroke-width="2"/><text x="123" y="74" fill="#f3e8cc" font-size="19" letter-spacing="4" text-anchor="middle" class="board-label">${back ? '背 面' : '正 面'} / ${String(level.number).padStart(2, '0')}</text>
  ${back ? `<rect x="55" y="107" width="131" height="356" rx="18" fill="#c8bb9e" stroke="#ae9c79" stroke-width="2"/><path d="M71 147h98M71 179h75M71 411h98" stroke="#b7a784" stroke-width="2"/><text x="120" y="290" text-anchor="middle" fill="#8c7b57" font-size="12" letter-spacing="3" class="board-label">共 享 轴</text><text x="120" y="313" text-anchor="middle" fill="#8c7b57" font-size="10" letter-spacing="2" class="board-label">同 轴 联 动</text>` : ''}
  ${snapshot.shafts.map(railArt).join('')}
  <polyline points="${pointList(level.path)}" fill="none" stroke="${back ? '#b4a885' : '#a19475'}" stroke-width="${back ? 5 : 47}" stroke-linejoin="round" stroke-linecap="round" ${back ? 'stroke-dasharray="5 8" opacity=".5"' : ''}/>
  ${!back ? `<polyline points="${pointList(level.path)}" fill="none" stroke="#293e30" stroke-width="34" stroke-linejoin="round" stroke-linecap="round"/><polyline points="${pointList(level.path)}" fill="none" stroke="#52604a" stroke-width="2" stroke-dasharray="3 11" stroke-linejoin="round"/>` : ''}
  <rect x="582" y="491" width="75" height="42" rx="9" fill="${back ? '#b7b698' : '#408469'}" stroke="#7baf8d" stroke-width="3"/><path d="M618 505v18m0-18 16 4-16 5" stroke="${back ? '#838b64' : '#c3e2b9'}" fill="${back ? '#838b64' : '#c3e2b9'}" stroke-width="2"/>
  ${snapshot.gates.map((gate) => gateArt(gate, state.side, highlighted === gate.shaft, level)).join('')}
  ${snapshot.shafts.map((shaft) => shaftArt(shaft, state.side, drag, highlighted === shaft.id)).join('')}
  ${snapshot.latches
    .filter((latch) => latch.side === state.side)
    .map((latch) => latchArt(latch, highlighted === latch.shaft))
    .join('')}
  ${!back ? `<g id="ball" transform="translate(${ball[0]} ${ball[1]})" filter="url(#shadow)" aria-label="小球"><circle r="17" fill="url(#ball-glow)" stroke="#f7c788" stroke-width="1.5"/><ellipse cx="-5" cy="-7" rx="5" ry="3" fill="#fff2d5" opacity=".8"/></g>` : ''}
  ${[screw(49, 516), screw(674, 515), screw(674, 57)].join('')}
  <text x="84" y="503" text-anchor="middle" font-size="9" fill="#827657" letter-spacing="2" class="board-label">BRASS ATELIER</text><text x="84" y="520" text-anchor="middle" font-size="11" fill="#827657" letter-spacing="2" class="board-label">VOL. 01</text>`;
}
