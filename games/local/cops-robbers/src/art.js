import { getRoleAppearance, roleAvatarSvg } from './role-appearance.js';

/** Big heads, different uniforms, and clear team silhouettes at phone scale. */
export function character(kind, mood = 'idle', index = 0) {
  const pursuit = kind === 'cop', appearance = getRoleAppearance(kind), running = mood === 'run';
  const raised = ['caught', 'cheer'].includes(mood), ink = '#153c55';
  const classic = globalThis.__CLASSIC_CHASE_ROLES__ === true && appearance.style === 'team';
  const shirt = classic ? pursuit ? '#197aba' : '#f39129' : appearance.color;
  const trousers = pursuit ? '#194d78' : '#33465b';
  const leftArm = raised ? 'M-16-42Q-28-49-28-61' : running ? 'M-16-42Q-26-48-30-40' : 'M-16-42Q-24-34-23-27';
  const rightArm = raised ? 'M16-42Q28-49 28-61' : running ? 'M16-42Q24-28 30-31' : 'M16-42Q24-34 23-27';
  const hands = raised ? [[-28, -61], [28, -61]] : running ? [[-30, -40], [30, -31]] : [[-23, -27], [23, -27]];
  return `<g class="paper-person ${kind} mood-${mood}" stroke="${ink}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    ${pursuit ? '' : '<path d="M19-54Q40-61 43-37Q44-20 24-18L17-34Z" fill="#eccc86"/><path d="m24-52 10 1m-7-6 3 6" fill="none" stroke="#b68d48"/><path d="M27-43q-8 0-4 5l7 3q4 5-5 5m2-15-2 17" fill="none" stroke="#9d7846" stroke-width="2.8"/>'}
    <path d="M-10-19 ${running ? 'l-8 16' : 'l-2 15'}M10-19 ${running ? 'l13 13' : 'l3 15'}" fill="none" stroke="${ink}" stroke-width="13"/>
    <path d="M-10-19 ${running ? 'l-8 14' : 'l-2 13'}M10-19 ${running ? 'l12 11' : 'l3 13'}" fill="none" stroke="${trousers}" stroke-width="9"/>
    <path d="${running ? 'M-24-6q-2 8 8 8h5V-5ZM17-8q1 10 13 8l-3-8Z' : 'M-18-7q-5 10 4 10h9V-6ZM7-7v10h13q6-6-1-9Z'}" fill="#203346"/>
    <path d="M-15-47Q0-56 15-47L19-25Q18-14 0-14T-19-25Z" fill="${shirt}"/>
    <path d="M-8-45 0-39 8-45M0-39v15" fill="none" stroke="${pursuit ? '#bce9ff' : '#ffe2b0'}" stroke-width="2.7"/>
    <path d="${leftArm}${rightArm}" fill="none" stroke="${ink}" stroke-width="12"/>
    <path d="${leftArm}${rightArm}" fill="none" stroke="${shirt}" stroke-width="8"/>
    ${hands.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5.5" fill="#ffcf9d"/>`).join('')}
    ${pursuit ? '<path d="M-18-24h36v6h-36Z" fill="#203346"/><path d="M-4-25h8v8h-8Z" fill="#ffdc60"/><path d="M7-42h7v7l-3.5 3L7-35Z" fill="#ffdc60" stroke-width="1.3"/><path d="M-13-40h6v7h-6Z" fill="#136093" stroke-width="1.3"/>' : '<path d="M-15-23q15 7 30 0" fill="none" stroke="#dc7124" stroke-width="3"/><path d="m-8-39 1 8m15-8-1 8" fill="none" stroke="#fff0cf" stroke-width="2"/>'}
    <text y="-25" text-anchor="middle" font-size="9" font-weight="900" fill="#fff8dd" stroke="none">${index + 1}</text>
    ${roleAvatarSvg(kind, -29, -101, 58)}
  </g>`;
}

function house(variant, alternate = false) {
  const market = variant === 1, tower = variant === 4, dock = variant === 3;
  const roof = alternate ? '#f58b5c' : '#3a9ace', wall = alternate ? '#ffdda0' : '#fff0bf';
  return `<g stroke="#30665f" stroke-width="1.8" stroke-linejoin="round">
    <ellipse cy="5" rx="32" ry="9" fill="#39896b" opacity=".18" stroke="none"/>
    <path d="M-26-34h52V2Q0 9-26 2Z" fill="${wall}"/>
    <path d="M26-34 34-27V0l-8 2Z" fill="#e7bb80"/>
    <path d="M-29-34Q-4-55 0-55T29-34l-5 6H-24Z" fill="${dock ? '#52b6bc' : roof}"/>
    <path d="m-22-36 23-14 22 15M-8-44l7 12M7-44l7 12" fill="none" stroke="${alternate ? '#ffb174' : '#68bcec'}"/>
    ${tower ? '<path d="M-22-65h44v27h-44Z" fill="#ffedb8"/><path d="M-26-67h52v7h-52Z" fill="#45a5be"/><path d="M-13-55h8v9h-8Zm18 0h8v9H5Z" fill="#95d9e2"/>' : '<path d="M14-46v-13h8v17" fill="#ffecbf"/>'}
    <path d="M-19-25h11v13h-11Zm27 0h11v13H8Z" fill="#98dce5"/>
    <path d="M-19-19h11M13-25v13M-13-25v13M8-19h11" stroke="#fffcdf"/>
    <path d="M-5-12q5-5 11 0V4H-5Z" fill="#cb9364"/>
    <circle cx="3" cy="-2" r="1.2" fill="#fff1be" stroke="none"/>
    ${market ? '<path d="M-30-29h60l5 13h-70Z" fill="#fff6cf"/><path d="m-23-29-3 13h9l2-13m10 0v13h10V-29m10 0 2 13h9l-3-13" fill="#f4926e" stroke="none"/><path d="M-32-16V4m64-20V4"/><path d="M-25-4h14v8h-14Zm38 0h15v8H13Z" fill="#d9ac6a"/><circle cx="-19" cy="-6" r="4" fill="#87c965" stroke="none"/><circle cx="21" cy="-6" r="4" fill="#ffb552" stroke="none"/>' : ''}
    <path d="M-31 3h8V-5l4-4 4 4v8h8V-5l4-4 4 4v8" fill="none" stroke="#fff8d9" stroke-width="4"/>
  </g>`;
}

function tree(variant) {
  const round = variant % 2 === 0;
  return `<ellipse cy="4" rx="21" ry="7" fill="#39896b" opacity=".15"/>
    <path d="M0-23V3m0-17 8-7" stroke="#a47d50" stroke-width="6" stroke-linecap="round"/>
    <g stroke="#448668" stroke-width="1.7">
    ${round ? '<circle cx="-10" cy="-28" r="16" fill="#65b981"/><circle cx="11" cy="-31" r="16" fill="#54ad7c"/><circle cy="-42" r="17" fill="#7bcc89"/>' : '<path d="M0-57Q-21-45-23-24-22-10 0-10T23-24Q21-45 0-57Z" fill="#68c089"/><path d="M-13-30q0-14 13-18 13 4 13 18" fill="#80d390" stroke="none"/>'}
    </g><path d="M-10-43q-5 2-5 7m20-8 5 2" fill="none" stroke="#b4e9a0" stroke-width="3" stroke-linecap="round"/>`;
}

function bench() {
  return '<ellipse cy="5" rx="27" ry="7" fill="#39896b" opacity=".13"/><path d="M-19-20V5m38-25V5" stroke="#477764" stroke-width="4"/><g fill="#e7af6b" stroke="#a1774c" stroke-width="1.8" stroke-linejoin="round"><path d="M-23-23h46v6h-46Zm0 10h46v6h-46Zm-2 8h50v6h-50Z"/></g>';
}

function pond() {
  return '<ellipse cy="-9" rx="41" ry="25" fill="#e9e5b7" stroke="#90ba91" stroke-width="2"/><ellipse cy="-11" rx="34" ry="18" fill="#72cdd5"/><path d="M-22-15h14m7 8h17m-5-13h12" stroke="#c8fbef" stroke-width="3" stroke-linecap="round"/><path d="M-31-7q-6-9-1-15m-1 11-6-6" fill="none" stroke="#72ad71" stroke-width="3"/><path d="M13-2q7-9 15-1-8 5-15 1" fill="#68b99d"/>';
}

function dockProps() {
  return '<ellipse cy="3" rx="30" ry="8" fill="#39896b" opacity=".13"/><g stroke="#a07f48" stroke-width="2" stroke-linejoin="round"><path d="M-27-18h23V1h-23Z" fill="#e3bd7d"/><path d="m-25-16 19 15m-19 0 19-15" fill="none"/><path d="M6-12h21V4H6Z" fill="#f1d193"/><path d="M8-10h17M17-10V2" fill="none"/><path d="M-9-23h23v12H-9Z" fill="#ffdf9b"/></g>';
}

function flowers(x, y, variant) {
  return `<g transform="translate(${x} ${y})"><path d="m-6 4 2-7m6 8V-3m5 7 3-6" stroke="#6bba77" stroke-width="2.5" stroke-linecap="round"/><g fill="${variant ? '#ffe57e' : '#fff9dc'}"><circle cx="-3" cy="-5" r="2.6"/><circle cx="1" cy="-5" r="2.6"/><circle cx="-1" cy="-8" r="2.6"/><circle cx="-1" cy="-2" r="2.6"/></g><circle cx="-1" cy="-5" r="2" fill="#f4b84d"/></g>`;
}

/** Decorations stay away from road geometry and every touchable junction. */
export function scenery(level, chapter = 0) {
  const { nodes, edges } = level;
  const chapterIndex = Math.max(0, Math.min(6, chapter)), theme = chapterIndex % 5;
  const distanceToRoad = (x, y, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
  };
  const occupied = [];
  const clear = (x, y, radius) => nodes.every(node => Math.hypot(x - node.x, y - node.y) > radius + 37)
    && edges.every(([a, b]) => distanceToRoad(x, y, nodes[a], nodes[b]) > radius + 20)
    && occupied.every(item => Math.hypot(x - item.x, y - item.y) > radius + item.radius + 9);
  const candidates = [[65, 90], [535, 85], [66, 530], [531, 527], [285, 62], [305, 549], [53, 295], [549, 303], [160, 74], [425, 77], [152, 541], [435, 538], [73, 188], [534, 424]];
  const ground = ['#bce8ad', '#c8eab7', '#b4e5b9', '#b7e5ce', '#c2e5c2', '#b5e5d7', '#c8e2bd'][chapterIndex];
  const parts = [`<rect width="600" height="600" fill="${ground}"/>`];
  // A quiet grass grid gives the tiny neighborhood a toy-board surface.
  for (let n = 48; n < 600; n += 68) parts.push(`<path d="M${n} 0V600M0 ${n}H600" fill="none" stroke="#89c38d" stroke-width="1" opacity=".17"/>`);
  candidates.forEach(([x, y], i) => {
    const featured = i < 4, radius = featured ? 39 : 23;
    if (!clear(x, y - 20, radius)) return;
    occupied.push({ x, y: y - 20, radius });
    const decoration = featured
      ? theme === 2 ? (i % 2 ? bench() : pond()) : house(theme, i % 2 === 0)
      : theme === 3 && i % 3 === 0 ? dockProps() : theme === 4 && i % 3 === 0 ? bench() : tree(i);
    parts.push(`<g transform="translate(${x} ${y})">${decoration}</g>`);
  });
  [[114, 354], [475, 198], [226, 497], [374, 112], [52, 425], [548, 165], [214, 39], [387, 567]].forEach(([x, y], i) => {
    if (clear(x, y, 7)) parts.push(flowers(x, y, i % 2));
  });
  return `<g class="scenery" pointer-events="none" aria-hidden="true">${parts.join('')}</g>`;
}
