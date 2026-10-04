import { getSnapshot } from './engine.mjs';

export const RAIL_TOP = 150;
export const RAIL_BOTTOM = 450;
export const shaftY = (value) => RAIL_BOTTOM - 150 * value;
const FACE_NAMES = {
  front: '正面',
  back: '背面',
  left: '左侧',
  right: '右侧',
  top: '顶面',
  bottom: '底面',
};
let boardSerial = 0;
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const pointList = (points) => points.map((point) => point.join(',')).join(' ');
const namespace = (markup, prefix) =>
  markup
    .replace(/id="([^"]+)"/g, `id="${prefix}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`);
const screw = (x, y, radius = 7) =>
  `<g transform="translate(${x} ${y})" pointer-events="none"><circle cy="2" r="${radius + 1}" fill="#211b13" opacity=".65"/><circle r="${radius}" fill="url(#steel)" stroke="#655133" stroke-width="1.5"/><circle r="${radius - 2}" fill="none" stroke="#f5daa1" stroke-opacity=".45"/><path d="M${-radius * 0.48} ${radius * 0.48} ${radius * 0.48} ${-radius * 0.48}" stroke="#443b2c" stroke-width="2.3"/><path d="M${-radius * 0.48 + 1} ${radius * 0.48 + 1} ${radius * 0.48 + 1} ${-radius * 0.48 + 1}" stroke="#fff0cb" stroke-width=".6" opacity=".7"/></g>`;
const label = (x, y, text, size = 13, color = '#caba94', extra = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" class="board-label" ${extra}>${escape(text)}</text>`;
const brassPlate = (x, y, width, text, size = 13) =>
  `<g transform="translate(${x} ${y})"><rect y="2" width="${width}" height="30" rx="3" fill="#271e12" opacity=".75"/><rect width="${width}" height="28" rx="3" fill="url(#brass)" stroke="#6b4d27"/><path d="M3 2h${width - 6}" stroke="#fff0c1" opacity=".7"/>${label(width / 2, 19, text, size, '#4e3822', 'text-anchor="middle" letter-spacing="1"')}${screw(8, 14, 3)}${screw(width - 8, 14, 3)}</g>`;
const bearing = (x, y, radius = 24) =>
  `<g transform="translate(${x} ${y})"><circle cy="3" r="${radius + 3}" fill="#161c17" opacity=".8"/><circle r="${radius}" fill="url(#brass)" stroke="#715230" stroke-width="2"/><circle r="${radius - 5}" fill="url(#dark-metal)" stroke="#f2d193" stroke-opacity=".6"/><circle r="${radius - 12}" fill="url(#steel)" stroke="#6d573d"/>${screw(0, 0, Math.max(4, radius - 17))}</g>`;

function definitions() {
  return `<defs>
    <linearGradient id="wood" x1="0" y1="0" x2=".95" y2="1"><stop stop-color="#c79960"/><stop offset=".22" stop-color="#b17c44"/><stop offset=".52" stop-color="#c39258"/><stop offset=".83" stop-color="#9d6737"/><stop offset="1" stop-color="#83532e"/></linearGradient>
    <linearGradient id="edge" x2="0" y2="1"><stop stop-color="#916036"/><stop offset=".42" stop-color="#5b3a24"/><stop offset="1" stop-color="#322519"/></linearGradient>
    <linearGradient id="rim" x2="0" y2="1"><stop stop-color="#dfb879"/><stop offset=".04" stop-color="#9c703f"/><stop offset=".5" stop-color="#714724"/><stop offset=".96" stop-color="#9f713d"/><stop offset="1" stop-color="#e0b575"/></linearGradient>
    <linearGradient id="brass" x1="0" y1="0" x2=".85" y2="1"><stop stop-color="#f2d390"/><stop offset=".16" stop-color="#d5b270"/><stop offset=".35" stop-color="#ad8749"/><stop offset=".48" stop-color="#e8c987"/><stop offset=".58" stop-color="#b78d4b"/><stop offset=".87" stop-color="#947038"/><stop offset="1" stop-color="#deb970"/></linearGradient>
    <linearGradient id="steel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#faf0cb"/><stop offset=".28" stop-color="#bab89f"/><stop offset=".5" stop-color="#e6dbc0"/><stop offset=".7" stop-color="#807c69"/><stop offset="1" stop-color="#bcb9a2"/></linearGradient>
    <linearGradient id="dark-metal" x2=".65" y2="1"><stop stop-color="#526258"/><stop offset=".38" stop-color="#344238"/><stop offset="1" stop-color="#17251f"/></linearGradient>
    <linearGradient id="well" x2="0" y2="1"><stop stop-color="#17231d"/><stop offset=".12" stop-color="#22352b"/><stop offset="1" stop-color="#344539"/></linearGradient>
    <linearGradient id="glass" x2="1" y2="1"><stop stop-color="#eff4d2" stop-opacity=".16"/><stop offset=".4" stop-color="#adcebd" stop-opacity=".025"/><stop offset=".44" stop-color="#fff5cf" stop-opacity=".12"/><stop offset="1" stop-color="#577b69" stop-opacity=".06"/></linearGradient>
    <radialGradient id="ball-glow" cx=".3" cy=".24" r=".8"><stop stop-color="#fff4c8"/><stop offset=".2" stop-color="#f4c17a"/><stop offset=".52" stop-color="#cf813e"/><stop offset=".83" stop-color="#8e4420"/><stop offset="1" stop-color="#5b2f1b"/></radialGradient>
    <radialGradient id="vignette"><stop offset=".3" stop-color="#1c281d" stop-opacity="0"/><stop offset="1" stop-color="#111a14" stop-opacity=".55"/></radialGradient>
    <pattern id="metal-hatching" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 .5h6" stroke="#e0d4b0" opacity=".055" stroke-width=".6"/></pattern>
    <pattern id="mesh" width="17" height="17" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="2.1" fill="#0d1c16"/><circle cx="8" cy="9" r="2.1" fill="none" stroke="#b8c5a2" stroke-opacity=".1"/></pattern>
    <filter id="shadow" x="-40%" y="-50%" width="180%" height="200%"><feDropShadow dx="1" dy="5" stdDeviation="4" flood-color="#17140c" flood-opacity=".6"/></filter>
    <filter id="small-shadow" x="-30%" y="-30%" width="170%" height="180%"><feDropShadow dx="1" dy="3" stdDeviation="2" flood-color="#17140c" flood-opacity=".55"/></filter>
    <clipPath id="wood-clip"><rect x="30" y="29" width="660" height="515" rx="19"/></clipPath>
  </defs>`;
}

function woodGrain() {
  return `<g clip-path="url(#wood-clip)" pointer-events="none">${Array.from(
    { length: 66 },
    (_, i) => {
      const y = 21 + i * 8.3;
      const bend = Math.sin(i * 0.71) * 12;
      const width = i % 7 === 0 ? 1.8 : 0.7;
      return `<path d="M18 ${y} C155 ${y - 9 + bend},206 ${y + 15},343 ${y + bend} S533 ${y - 13},707 ${y + 2}" fill="none" stroke="${i % 3 ? '#53301d' : '#f2d19c'}" stroke-width="${width}" opacity="${i % 3 ? 0.12 : 0.13}"/>`;
    },
  ).join(
    '',
  )}<path d="M40 338c77-25 94 27 171 3S357 293 458 326 601 364 690 328M37 342c76-25 96 27 177 3S358 297 459 330 601 369 690 332" fill="none" stroke="#684124" stroke-width="1.3" opacity=".12"/></g>`;
}

function cabinet(level, face) {
  return `<rect width="720" height="600" fill="#1e3129"/><rect width="720" height="600" fill="url(#vignette)"/>
    <ellipse cx="367" cy="564" rx="332" ry="23" fill="#0b1813" opacity=".7"/>
    <rect x="48" y="537" width="60" height="34" rx="8" fill="#3f2f20" stroke="#191d14"/><rect x="610" y="537" width="60" height="34" rx="8" fill="#3f2f20" stroke="#191d14"/>
    <rect x="19" y="31" width="688" height="526" rx="24" fill="url(#edge)" stroke="#1c2319" stroke-width="2"/>
    <path d="M27 535q9 17 31 17h612q22 0 31-17" fill="none" stroke="#ae7b40" stroke-opacity=".45"/>
    <rect x="18" y="17" width="684" height="530" rx="25" fill="url(#rim)" stroke="#493621" stroke-width="2"/>
    <rect x="28" y="27" width="664" height="510" rx="18" fill="url(#wood)" stroke="#e3b880" stroke-opacity=".65" stroke-width="1.4"/>
    ${woodGrain()}
    <path d="M40 40h640M40 40v482" fill="none" stroke="#f3d09a" stroke-opacity=".38" stroke-width="2"/>
    <path d="M39 529h642V42" fill="none" stroke="#56391f" stroke-opacity=".55" stroke-width="3"/>
    <path d="M60 28v18M87 28v18M113 28v18M607 28v18M633 28v18M660 28v18M60 519v17M87 519v17M633 519v17M660 519v17" stroke="#51351f" stroke-width="2" opacity=".5"/>
    ${brassPlate(47, 49, 152, `${FACE_NAMES[face]} / ${String(level.number).padStart(2, '0')}`, 16)}
    ${screw(47, 505)}${screw(675, 505)}${screw(674, 57)}
    ${label(360, 574, 'M E C H A N I C A L   C A B I N E T  ·  N º  ' + String(level.number).padStart(2, '0'), 10, '#a39672', 'text-anchor="middle"')}`;
}

function gateArt(gate, face, highlight, level) {
  const ghost = gate.side !== face;
  const color = gate.side === 'front' ? '#d6b675' : '#83a798';
  const index = level.path.findIndex(([x, y]) => x === gate.x && y === gate.y);
  const next = level.path[index + 1] || [gate.x + 10, gate.y];
  const angle = (Math.atan2(next[1] - gate.y, next[0] - gate.x) * 180) / Math.PI;
  const panelY = gate.open ? -98 : -31;
  return `<g data-gate="${escape(gate.id)}" data-open="${gate.open}" class="${highlight ? 'hint-highlight' : ''}" opacity="${ghost ? 0.42 : 1}" pointer-events="none">
    <g transform="translate(${gate.x} ${gate.y}) rotate(${angle})">
      <rect x="11" y="-102" width="24" height="145" rx="4" fill="${ghost ? 'none' : '#483b25'}" stroke="${color}" stroke-width="1" ${ghost ? 'stroke-dasharray="4 4"' : ''}/>
      <path d="M16-96v130M32-96v130" stroke="#eed6a0" stroke-opacity=".5" stroke-width="2"/>
      <g transform="translate(0 ${panelY})" filter="url(#small-shadow)"><rect x="17" width="20" height="62" rx="3" fill="${ghost ? '#557265' : 'url(#brass)'}" stroke="#594728" stroke-width="1.5"/><path d="M20 4v53M34 4v53" stroke="#ffebbc" stroke-opacity=".65"/><path d="M22 10h10M22 16h10M22 44h10M22 50h10" stroke="#75582d" stroke-width="1.5"/>${screw(27, 31, 4)}</g>
    </g>
    <g transform="translate(${gate.x - 70} ${gate.y + 30})"><rect x="-5" y="-13" width="${ghost ? 72 : 57}" height="23" rx="3" fill="#253d30" stroke="${color}"/>${label(ghost ? 31 : 24, 3, `${ghost ? '另面 ' : ''}${gate.shaft} ${gate.open ? '通' : '挡'}`, 12, '#e0d4ae', 'text-anchor="middle"')}</g>
  </g>`;
}

function railArt(shaft) {
  const x = shaft.x;
  return `<g pointer-events="none"><rect x="${x - 25}" y="98" width="50" height="408" rx="13" fill="#704927" stroke="#e5bb7c" stroke-opacity=".6"/><rect x="${x - 21}" y="99" width="42" height="401" rx="11" fill="#1a221b" stroke="#543a22" stroke-width="3"/><rect x="${x - 11}" y="106" width="22" height="390" rx="8" fill="url(#brass)" stroke="#594321"/><path d="M${x - 6} 113v372" stroke="#ffedb9" stroke-width="3" opacity=".75"/><path d="M${x + 7} 115v367" stroke="#594021" stroke-width="3" opacity=".65"/><rect x="${x - 23}" y="96" width="46" height="22" rx="5" fill="url(#dark-metal)" stroke="#aea77f"/><rect x="${x - 23}" y="486" width="46" height="22" rx="5" fill="url(#dark-metal)" stroke="#aea77f"/>${screw(x - 15, 107, 3)}${screw(x + 15, 107, 3)}${screw(x - 15, 497, 3)}${screw(x + 15, 497, 3)}</g>`;
}

function shaftArt(shaft, face, drag, highlighted) {
  const x = shaft.x;
  const y = drag?.id === shaft.id ? drag.y : shaftY(shaft.value);
  const id = escape(shaft.id);
  const notchLabels = shaft.notches || ['低', '中', '高'];
  const notches = [0, 1, 2]
    .map((value) => {
      const ny = shaftY(value);
      return `<g class="notch-control board-control" data-notch-shaft="${id}" data-value="${value}" role="button" tabindex="-1" aria-label="${id} 轴${notchLabels[value]}位"><rect class="svg-hit" x="${x - 56}" y="${ny - 56}" width="112" height="112" fill="transparent"/><circle cx="${x}" cy="${ny}" r="14" fill="#1e2c22" stroke="${shaft.color}" stroke-width="1.5"/><circle cx="${x}" cy="${ny}" r="4" fill="${shaft.color}"/><path d="M${x + 21} ${ny}h7" stroke="#533820" stroke-width="2"/>${label(x + 32, ny + 5, notchLabels[value], 15, '#422d1c')}</g>`;
    })
    .join('');
  return `<g class="shaft-control board-control ${highlighted ? 'hint-highlight' : ''}" data-shaft="${id}" data-value="${shaft.value}" data-locked="${shaft.locked}" tabindex="0" role="slider" aria-label="${id} 滑轴，${escape(face === 'front' ? shaft.frontRole : shaft.backRole)}" aria-valuemin="0" aria-valuemax="2" aria-valuenow="${shaft.value}" aria-valuetext="${notchLabels[shaft.value]}位${shaft.locked ? '，被锁扣固定' : ''}" aria-disabled="${shaft.locked}">
    <rect class="svg-hit" x="${x - 56}" y="94" width="112" height="412" fill="transparent"/>
    <circle cx="${x}" cy="71" r="23" fill="#513d25"/><circle cx="${x}" cy="69" r="21" fill="url(#dark-metal)" stroke="${shaft.color}" stroke-width="2"/><circle cx="${x}" cy="69" r="17" fill="none" stroke="#d8c792" stroke-opacity=".3"/>${label(x, 77, id, 23, '#f1dfb4', 'text-anchor="middle" font-weight="600"')}
    ${notches}
    <g data-shaft-handle="${id}" transform="translate(${x} ${y})"><rect class="svg-hit" x="-56" y="-56" width="112" height="112" fill="transparent"/><g filter="url(#shadow)"><rect x="-33" y="-27" width="66" height="60" rx="10" fill="#684921" stroke="#44311c" stroke-width="2"/><rect x="-33" y="-30" width="66" height="54" rx="9" fill="url(#brass)" stroke="#f1d594" stroke-width="1.2"/><rect x="-24" y="-21" width="48" height="36" rx="6" fill="url(#dark-metal)" stroke="#846d41"/><path d="M-17-12h34M-17-6h34M-17 0h34M-17 6h34" stroke="#a9a78a" stroke-opacity=".72" stroke-width="2"/><path d="M-27-25h53" stroke="#fff0c0" stroke-opacity=".85"/>${shaft.locked ? '<circle cx="27" cy="-24" r="9" fill="#824336" stroke="#ead3a1" stroke-width="1.5"/><path d="M24-25v-3a3 3 0 0 1 6 0v3m-6 0h6v5h-6z" fill="none" stroke="#f7d8a2" stroke-width="1.5"/>' : ''}</g></g>
    ${label(x, 529, `${id} · ${shaft.locked ? '已锁定' : '可滑动'}`, 13, '#3f2d1c', 'text-anchor="middle"')}
  </g>`;
}

function latchArt(latch, highlight) {
  const condition = (latch.releaseWhen ?? [])
    .map((item) => `${item.shaft} · ${['低', '中', '高'][item.positions[0]]}`)
    .join(' / ');
  return `<g class="latch-control board-control ${highlight ? 'hint-highlight' : ''}" data-latch="${escape(latch.id)}" role="button" tabindex="0" aria-label="${escape(latch.label)}${latch.engaged ? '，点击松开' : '，点击扣紧'}${condition ? `，需 ${condition}` : ''}" aria-pressed="${latch.engaged}" transform="translate(${latch.x} ${latch.y})">
    <rect class="svg-hit" x="-56" y="-56" width="112" height="112" fill="transparent"/>
    <rect x="-61" y="-23" width="25" height="48" rx="5" fill="url(#dark-metal)" stroke="#cbb77f" pointer-events="none"/>
    <rect x="-29" y="-27" width="55" height="53" rx="8" fill="url(#brass)" stroke="#634b2b" pointer-events="none"/>${screw(-19, -17, 3)}${screw(16, 17, 3)}
    <g transform="rotate(${latch.engaged ? 0 : -65})" filter="url(#small-shadow)" pointer-events="none"><rect x="-56" y="-11" width="62" height="24" rx="6" fill="#553e25"/><rect x="-56" y="-14" width="62" height="23" rx="6" fill="url(#steel)" stroke="#615335"/><path d="M-47-9h39" stroke="#f1e7bf"/><rect x="-44" y="-6" width="23" height="9" rx="3" fill="${latch.engaged ? '#945647' : '#4f7963'}"/></g>
    ${bearing(0, 0, 17)}
    <rect x="-52" y="31" width="104" height="26" rx="3" fill="#293e31" stroke="#c5aa72"/>${label(0, 49, condition || `${latch.shaft} ${latch.engaged ? '锁住' : '松开'}`, 16, '#eee0b9', 'text-anchor="middle"')}
    ${condition ? `<circle cx="30" cy="-28" r="7" fill="${latch.canRelease ? '#8bb093' : '#9d5745'}" stroke="#f1d6a0" stroke-width="2"/>` : ''}
  </g>`;
}

function ballArt(ball, ghost = false) {
  return `<g data-ball transform="translate(${ball[0]} ${ball[1]})" filter="url(#shadow)" aria-label="小球" opacity="${ghost ? 0.5 : 1}" pointer-events="none"><circle cy="3" r="18" fill="#151b12" opacity=".35"/><circle r="17" fill="url(#ball-glow)" stroke="#dbad68" stroke-width="1"/><ellipse cx="-5" cy="-7" rx="5" ry="3" fill="#fff7d7" opacity=".88"/><path d="M-9 10q10 7 20-6" fill="none" stroke="#edba76" opacity=".32"/></g>`;
}

function trackArt(level, ghost = false) {
  const points = pointList(level.path);
  if (ghost)
    return `<polyline points="${points}" fill="none" stroke="#69472e" stroke-width="5" stroke-dasharray="5 9" stroke-linejoin="round" opacity=".38"/>`;
  return `<polyline points="${points}" fill="none" stroke="#e5c285" stroke-width="47" stroke-linejoin="round" stroke-linecap="round"/><polyline points="${points}" fill="none" stroke="#6e4e2d" stroke-width="43" stroke-linejoin="round" stroke-linecap="round"/><polyline points="${points}" fill="none" stroke="#16271f" stroke-width="35" stroke-linejoin="round" stroke-linecap="round"/><polyline points="${points}" transform="translate(0 3)" fill="none" stroke="#465a46" stroke-width="24" stroke-linejoin="round" stroke-linecap="round"/><polyline points="${points}" fill="none" stroke="#819377" stroke-opacity=".2" stroke-width="2" stroke-linejoin="round"/>`;
}

function controlFace(level, snapshot, face, ball, drag, highlighted) {
  const back = face === 'back';
  return `${back ? `<rect x="54" y="106" width="129" height="355" rx="9" fill="url(#well)" stroke="#d6b07a" stroke-width="3"/><rect x="65" y="116" width="106" height="335" rx="4" fill="url(#mesh)"/><path d="M94 133v295M145 133v295" stroke="#89713f" stroke-width="7"/><path d="M94 135v291M145 135v291" stroke="#e2ca8f" stroke-opacity=".65" stroke-width="2"/>${bearing(119, 207, 32)}${bearing(119, 358, 32)}<path d="M119 207v151" stroke="#1a261d" stroke-width="18"/><path d="M119 207v151" stroke="#bd9b5c" stroke-width="12"/>${screw(119, 207, 7)}${screw(119, 358, 7)}${label(119, 286, '同轴联动', 13, '#dbc79b', 'text-anchor="middle"')}` : ''}
    ${snapshot.shafts.map(railArt).join('')}${trackArt(level, back)}
    <rect x="588" y="493" width="69" height="39" rx="7" fill="#59452a" stroke="#d7b275" stroke-width="2"/><rect x="594" y="498" width="56" height="27" rx="5" fill="${back ? '#777b56' : '#355b43'}" stroke="#9fbd86" stroke-opacity=".5"/><path d="M619 504v17m0-17 16 4-16 5" fill="#d5dfad" stroke="#d5dfad" stroke-width="1.5"/>
    ${snapshot.gates.map((gate) => gateArt(gate, face, highlighted === gate.shaft, level)).join('')}
    ${snapshot.shafts.map((shaft) => shaftArt(shaft, face, drag, highlighted === shaft.id)).join('')}
    ${snapshot.latches
      .filter((latch) => latch.side === face)
      .map((latch) => latchArt(latch, highlighted === latch.shaft))
      .join('')}
    ${!back ? ballArt(ball) : ''}
    ${label(106, 496, 'BRASS ATELIER', 9, '#48331e', 'text-anchor="middle" letter-spacing="1"')}${label(106, 513, '手作机关 · 壹', 11, '#48331e', 'text-anchor="middle"')}`;
}

const shaftValue = (shaft, drag) =>
  drag?.id === shaft.id ? (RAIL_BOTTOM - drag.y) / 150 : shaft.value;
const inset = (x, y, w, h) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="#4c361f" stroke="#e2bd82" stroke-opacity=".7" stroke-width="2"/><rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="6" fill="url(#well)" stroke="#302719" stroke-width="3"/><rect x="${x + 8}" y="${y + 8}" width="${w - 16}" height="${h - 16}" rx="4" fill="url(#metal-hatching)"/>`;

function leftFace(snapshot, drag) {
  const count = snapshot.shafts.length;
  return `${inset(61, 113, 596, 354)}${label(620, 76, '侧传动检视窗', 15, '#3f2d1c', 'text-anchor="end"')}
    ${snapshot.shafts
      .map((shaft, i) => {
        const y = count === 1 ? 285 : 175 + i * (220 / Math.max(1, count - 1));
        const value = shaftValue(shaft, drag);
        const cx = 459 + value * 40;
        const locked = shaft.locked;
        return `<g data-linkage="${shaft.id}">${label(87, y + 5, shaft.id, 22, shaft.color)}<rect x="129" y="${y - 33}" width="449" height="66" rx="8" fill="#15251d" stroke="#536452"/><path d="M142 ${y + 6}H581" stroke="#0b1912" stroke-width="16"/><path d="M142 ${y}H581" stroke="#b9b9a0" stroke-width="13"/><path d="M147 ${y - 4}H575" stroke="#f9ebbd" stroke-width="1.5"/>${bearing(169, y, 29)}<g data-shaft-link="${shaft.id}" transform="translate(${cx} ${y})"><rect x="-105" y="-11" width="105" height="22" rx="4" fill="url(#brass)" stroke="#6c542f"/><path d="M-98-6h81" stroke="#f8df9f"/>${bearing(0, 0, 34)}<g transform="rotate(${-30 + value * 45})"><path d="M0 0h-55" stroke="#181c13" stroke-width="20"/><path d="M0-2h-55" stroke="#bd9b5c" stroke-width="15"/>${screw(-55, -2, 6)}${screw(0, -2, 6)}</g></g><rect x="216" y="${y - 36}" width="45" height="75" rx="6" fill="url(#dark-metal)" stroke="#b3a577"/>${screw(226, y - 24, 4)}${screw(250, y + 26, 4)}<rect x="227" y="${y - (locked ? 21 : 44)}" width="24" height="38" rx="4" fill="url(#brass)" stroke="#514226"/><circle cx="239" cy="${y - (locked ? 9 : 32)}" r="5" fill="${locked ? '#b76d51' : '#7caa87'}"/>${label(611, y + 5, ['低', '中', '高'][shaft.value], 16, '#ddcfaa', 'text-anchor="middle"')}</g>`;
      })
      .join('')}
    ${brassPlate(204, 482, 312, `贯穿轴 · ${snapshot.lockedShafts.length ? `${snapshot.lockedShafts.join(' / ')} 被锁扣固定` : '锁扣已松开'}`, 14)}`;
}

function rightFace(level, snapshot) {
  const gates = snapshot.gates;
  const spacing = 538 / Math.max(gates.length, 3);
  const start = 360 - ((gates.length - 1) * spacing) / 2;
  return `${inset(62, 114, 594, 354)}${label(620, 76, '挡板行程检视窗', 15, '#3f2d1c', 'text-anchor="end"')}
    <path d="M92 354h535" stroke="#0c1b14" stroke-width="49"/><path d="M92 377h535" stroke="#ac8a52" stroke-width="6"/><path d="M92 333h535" stroke="#b8a477" stroke-width="3"/>
    ${gates
      .map((gate, i) => {
        const x = start + i * spacing;
        const y = gate.open ? 214 : 307;
        return `<g data-gate="${escape(gate.id)}" data-open="${gate.open}"><path d="M${x - 24} 176v243M${x + 24} 176v243" stroke="#17251d" stroke-width="9"/><path d="M${x - 24} 176v243M${x + 24} 176v243" stroke="#b9b9a0" stroke-width="5"/><path d="M${x} 164v${y - 167}" stroke="#bd9b5c" stroke-width="14"/>${bearing(x, 173, 19)}<g transform="translate(${x} ${y})" filter="url(#small-shadow)"><rect x="-26" width="52" height="64" rx="4" fill="url(#brass)" stroke="#684e2a" stroke-width="2"/><path d="M-21 4v54M21 4v54" stroke="#f5dba0"/><path d="M-16 19h32M-16 26h32M-16 33h32M-16 40h32" stroke="#755933" stroke-width="2"/>${screw(0, 9, 4)}</g><circle cx="${x}" cy="407" r="5" fill="${gate.open ? '#92b394' : '#c7845b'}"/>${label(x, 442, `${gate.shaft} · ${gate.side === 'front' ? '前' : '后'}`, 14, '#d9cba5', 'text-anchor="middle"')}</g>`;
      })
      .join('')}
    ${brassPlate(211, 484, 298, `${gates.filter((gate) => gate.open).length} / ${gates.length} 挡板抬起 · 共用球道`, 14)}`;
}

function topFace(level, snapshot, ball, drag) {
  return `${label(620, 76, '玻璃上盖 · 球道全览', 15, '#3f2d1c', 'text-anchor="end"')}${inset(59, 104, 600, 358)}
    <g transform="translate(39 97) scale(.9 .65)">${trackArt(level)}${snapshot.gates.map((gate) => gateArt(gate, gate.side, false, level)).join('')}${ballArt(ball)}</g>
    <path d="M87 123h547v317H87z" fill="url(#glass)" stroke="#c4d1b1" stroke-opacity=".5" stroke-width="2"/>
    <path d="M95 132h245L124 429H95zM436 132h34L242 429h-34z" fill="#f0e8c3" opacity=".05"/>
    ${snapshot.shafts
      .map((shaft, i) => {
        const x = 244 + i * 108;
        return `<g data-shaft-link="${shaft.id}" transform="translate(${x} 487)">${bearing(0, 0, 22)}<g transform="rotate(${shaftValue(shaft, drag) * 60 - 60})"><path d="M0 0v-15" stroke="#e6ce96" stroke-width="4" stroke-linecap="round"/></g>${label(35, 5, shaft.id, 14, '#402e1b')}</g>`;
      })
      .join('')}${screw(76, 121, 5)}${screw(643, 121, 5)}${screw(76, 445, 5)}${screw(643, 445, 5)}`;
}

function bottomFace(level, snapshot, ball) {
  const gates = snapshot.gates;
  const spacing = 504 / Math.max(3, gates.length);
  const start = 360 - ((gates.length - 1) * spacing) / 2;
  return `${label(620, 76, '底部回路 · 连杆与球槽', 15, '#3f2d1c', 'text-anchor="end"')}${inset(62, 109, 594, 354)}
    <rect x="76" y="123" width="566" height="326" rx="5" fill="url(#mesh)"/>
    <g transform="translate(52 147) scale(.85 .42)">${trackArt(level)}${ballArt(ball)}</g>
    ${gates
      .map((gate, i) => {
        const x = start + i * spacing;
        const gateIndex = level.path.findIndex(([px, py]) => px === gate.x && py === gate.y);
        const checkpointIndex = level.checkpoints.findIndex(
          (checkpoint) => checkpoint.pathIndex === gateIndex,
        );
        const passed = snapshot.checkpoint > checkpointIndex;
        return `<g data-gate="${escape(gate.id)}" data-open="${gate.open}"><path d="M${x} 394V${225 + (i % 2) * 26}" stroke="#122018" stroke-width="11"/><path d="M${x} 394V${225 + (i % 2) * 26}" stroke="#b9b9a0" stroke-width="7"/><g transform="translate(${x} 395)">${bearing(0, 0, 22)}<g transform="rotate(${gate.open ? -58 : 10})"><rect x="-5" y="-8" width="45" height="16" rx="5" fill="url(#brass)" stroke="#6d502d"/>${screw(32, 0, 4)}</g><circle r="5" fill="${passed ? '#8eae86' : gate.open ? '#c4b575' : '#a5674b'}"/>${label(0, 40, `${gate.shaft} ${gate.open ? '通' : '挡'}`, 13, '#d2c5a0', 'text-anchor="middle"')}</g></g>`;
      })
      .join('')}
    <path d="M84 135h548M84 444h548" stroke="#ada075" stroke-width="3"/>${screw(91, 135, 5)}${screw(627, 135, 5)}${screw(91, 444, 5)}${screw(627, 444, 5)}
    ${brassPlate(224, 483, 272, snapshot.completed ? '终点槽 · 小球已送达' : `球道进度 · ${snapshot.checkpoint} / ${level.checkpoints.length}`, 14)}`;
}

function observationArt(face, level, snapshot, ball, drag) {
  if (face === 'left') return leftFace(snapshot, drag);
  if (face === 'right') return rightFace(level, snapshot);
  if (face === 'top') return topFace(level, snapshot, ball, drag);
  return bottomFace(level, snapshot, ball);
}

// Keep the touched controls alive for the entire native touch sequence.
export function renderDragPreview(board, level, state, drag) {
  const face = board.dataset.face || state.side;
  const prefix = board.dataset.svgPrefix;
  const snapshot = getSnapshot(level, state);
  const observation = board.querySelector('[data-observation]');
  if (observation) {
    // Observation panels have no gesture targets; only these contents are replaced.
    const ballTransform = observation.querySelector('[data-ball]')?.getAttribute('transform');
    observation.innerHTML = namespace(
      observationArt(face, level, snapshot, level.path[0], drag),
      prefix,
    );
    if (ballTransform)
      observation.querySelector('[data-ball]')?.setAttribute('transform', ballTransform);
    return;
  }
  board
    .querySelector(`[data-shaft-handle="${drag.id}"]`)
    ?.setAttribute(
      'transform',
      `translate(${level.shafts.find((shaft) => shaft.id === drag.id).x} ${drag.y})`,
    );
  board.querySelector(`[data-shaft="${drag.id}"]`)?.classList.add('hint-highlight');
  for (const gate of snapshot.gates) {
    const element = board.querySelector(`[data-gate="${gate.id}"]`);
    if (element)
      element.outerHTML = namespace(gateArt(gate, face, gate.shaft === drag.id, level), prefix);
  }
}

export function renderBoard(
  board,
  level,
  state,
  { face = 'front', ball = level.path[0], drag = null, highlighted = null } = {},
) {
  const snapshot = getSnapshot(level, state);
  if (!FACE_NAMES[face]) face = 'front';
  const prefix = board.dataset.svgPrefix || `cabinet-${++boardSerial}`;
  board.dataset.svgPrefix = prefix;
  board.dataset.level = String(level.number);
  board.dataset.face = face;
  board.dataset.side = face;
  board.dataset.status = state.completed ? 'won' : 'playing';
  board.setAttribute(
    'aria-label',
    `第 ${level.number} 盒，${FACE_NAMES[face]}${face === 'front' || face === 'back' ? '，可直接操作滑轴与锁扣' : '，机关实时检视窗'}`,
  );
  board.innerHTML = namespace(
    `${definitions()}${cabinet(level, face)}${face === 'front' || face === 'back' ? controlFace(level, snapshot, face, ball, drag, highlighted) : `<g data-observation>${observationArt(face, level, snapshot, ball, drag)}</g>`}`,
    prefix,
  );
}
