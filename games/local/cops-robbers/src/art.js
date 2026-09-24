import { getRoleAppearance, roleAvatarSvg } from './role-appearance.js';

/** Team silhouettes remain distinct even with matching uploaded portraits. */
export function character(kind, mood = 'idle', index = 0) {
  const pursuit = kind === 'cop', appearance = getRoleAppearance(kind), running = mood === 'run';
  const raised = ['caught', 'cheer'].includes(mood);
  return `<g class="paper-person ${kind} mood-${mood}" stroke="#213e43" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    ${pursuit ? '<path d="M-22-48h44v32L0-3-22-16Z" fill="#e7f5ff" stroke="#1258c2" stroke-width="4"/>' : '<path d="m-14-42-24 12 16 5-13 14 24-5" fill="#ffb939" stroke="#8f4209"/><circle cy="-30" r="22" fill="#fff0cd" stroke="#be560d" stroke-width="4"/>'}
    <path d="M-9-16l${running ? '-8 12' : '-2 13'}m20-13 ${running ? '8 9' : '2 13'}" fill="none" stroke="${appearance.color}" stroke-width="10"/>
    <path d="M-16-40l-12 ${raised ? '-19' : '18'}m44-18 12 ${raised ? '-19' : '18'}" fill="none" stroke="${appearance.color}" stroke-width="9"/>
    <path d="M-14-46h28l4 27-18 8-18-8Z" fill="${appearance.color}"/>
    <text x="0" y="-24" text-anchor="middle" font-size="17" font-weight="900" fill="#fff" stroke="none">${pursuit ? '追' : '突'}</text>
    ${roleAvatarSvg(kind, -25, -91, 50)}
    <rect x="-26" y="-108" width="52" height="20" rx="${pursuit ? 3 : 10}" fill="${appearance.color}" stroke="#fff9eb" stroke-width="2"/>
    <text y="-94" text-anchor="middle" fill="#fff" stroke="none" font-size="12" font-weight="900">${pursuit ? '追' : '突'} ${index + 1}</text>
  </g>`;
}

function house(variant, color = '#ddba98') {
  const market = variant === 1;
  const tower = variant === 4;
  const dock = variant === 3;
  return `<ellipse cy="5" rx="31" ry="7" fill="#53685b" opacity=".09"/><path d="M-25-35h50V3h-50z" fill="${color}"/><path d="M25-35 33-29V0l-8 3" fill="#b4a58b"/><path d="M-28-35 0-52 28-35z" fill="${dock ? '#879ba0' : '#c2856c'}"/><path d="m-28-35 28-17 28 17" fill="none" stroke="#9d7460" stroke-width="2"/>
    ${tower ? '<path d="M-25-67h50v32h-50z" fill="#aec0bd"/><path d="M-28-70h56v5h-56z" fill="#6f8f91"/><path d="M-17-56h9v10h-9zm25 0h9v10H8z" fill="#eaf0df"/>' : '<path d="M14-44v-14h8v19" fill="#b6a087"/>'}
    <path d="M-18-26h10v11h-10zm26 0h10v11H8z" fill="#fff2d2"/><path d="M-5-14H6V3H-5z" fill="#8d9e92"/><path d="M-18-21h10m5 18h19" stroke="#a6b4a1" stroke-width="1.5"/>
    ${market ? '<path d="M-29-30h58l5 12h-68z" fill="#f8e4b9"/><path d="m-21-30-3 12h9l2-12m10 0v12h9V-30m10 0 2 12h9l-3-12" fill="#ce8069"/><path d="M-32-18v21m64-21v21" stroke="#a7896d" stroke-width="2"/><path d="M-26-3h14v8h-14zm40 0h15v8H14z" fill="#b49b70"/><circle cx="-20" cy="-5" r="4" fill="#abc08f"/><circle cx="22" cy="-5" r="4" fill="#e3a268"/>' : ''}`;
}

function tree(variant) {
  return `<ellipse cy="4" rx="17" ry="5" fill="#53685b" opacity=".09"/><path d="M0-21V2m0-13 8-7" stroke="#a58e6d" stroke-width="5" stroke-linecap="round"/>
    ${variant % 2 ? '<path d="M0-53q-18 16-17 30 0 12 17 12t17-12Q18-37 0-53" fill="#a5bb90"/><path d="M0-43v24" stroke="#91aa7e" stroke-width="2"/>' : '<circle cx="-8" cy="-28" r="14" fill="#b9cba2"/><circle cx="8" cy="-31" r="15" fill="#a8c193"/><circle cy="-42" r="13" fill="#bdd0a9"/><path d="M-9-35q-4-5 1-10" fill="none" stroke="#d2dec0" stroke-width="3" stroke-linecap="round"/>'}`;
}

function bench() {
  return '<ellipse cy="5" rx="24" ry="5" fill="#53685b" opacity=".08"/><path d="M-18-20v24m36-24v24" stroke="#7b9087" stroke-width="3"/><path d="M-22-22h44v5h-44zm0 8h44v5h-44zm-2 9h48v5h-48z" fill="#c4ab7c"/>';
}

function pond() {
  return '<ellipse cy="-9" rx="39" ry="22" fill="#cbd8b7"/><ellipse cy="-11" rx="33" ry="17" fill="#b4d3cf"/><path d="M-22-15h12m7 8h16m-4-12h13" stroke="#e3ece1" stroke-width="2.5" stroke-linecap="round"/><path d="M-31-7q-6-9-1-15m-1 11-6-6" fill="none" stroke="#9bb181" stroke-width="2"/><path d="M15-2q5-8 12-2-6 5-12 0" fill="#94b29c"/>';
}

function dockProps() {
  return '<ellipse cy="3" rx="29" ry="6" fill="#53685b" opacity=".08"/><path d="M-27-18h23V1h-23z" fill="#baa67c"/><path d="m-25-16 19 15m-19 0 19-15" stroke="#998864" stroke-width="2"/><path d="M6-12h21V4H6z" fill="#cbb98f"/><path d="M8-10h17M17-10V2" stroke="#a79772" stroke-width="2"/><path d="M-9-23h23v12H-9z" fill="#d4c49d"/><path d="M-6-21h17" stroke="#b09d77" stroke-width="2"/>';
}

/** Decorations use the same road geometry as the game, leaving every junction clear. */
export function scenery(level, chapter = 0) {
  const { nodes, edges } = level;
  const chapterIndex = Math.max(0, Math.min(4, chapter));
  const distanceToRoad = (x, y, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
  };
  const occupied = [];
  const clear = (x, y, radius) => nodes.every(node => Math.hypot(x - node.x, y - node.y) > radius + 37)
    && edges.every(([a, b]) => distanceToRoad(x, y, nodes[a], nodes[b]) > radius + 20)
    && occupied.every(item => Math.hypot(x - item.x, y - item.y) > radius + item.radius + 9);
  const candidates = [[65, 90], [535, 85], [66, 530], [531, 527], [285, 62], [305, 549], [53, 295], [549, 303], [160, 74], [425, 77], [152, 541], [435, 538], [73, 188], [534, 424]];
  const parts = [];
  const tones = ['#dfc7a9', '#e0c4a0', '#d4c7a5', '#b9c4bd', '#b9c9c1'];
  candidates.forEach(([x, y], i) => {
    const featured = i < 4;
    const radius = featured ? 36 : 19;
    if (!clear(x, y - 20, radius)) return;
    occupied.push({ x, y: y - 20, radius });
    const decoration = featured
      ? chapterIndex === 2 ? (i % 2 ? bench() : pond()) : house(chapterIndex, tones[chapterIndex])
      : chapterIndex === 3 && i % 3 === 0 ? dockProps() : chapterIndex === 4 && i % 3 === 0 ? bench() : tree(i);
    parts.push(`<g transform="translate(${x} ${y})" opacity=".84">${decoration}</g>`);
  });
  for (const [x, y] of [[114, 354], [475, 198], [226, 497], [374, 112], [52, 425], [548, 165], [214, 39], [387, 567]]) {
    if (clear(x, y, 7)) parts.push(`<path d="m${x - 5} ${y + 3} 2-7m3 8v-10m4 9 3-6" fill="none" stroke="${chapterIndex === 3 ? '#a6bcb0' : '#b2bf95'}" stroke-width="2.5" stroke-linecap="round"/>`);
  }
  return `<g class="scenery" pointer-events="none" aria-hidden="true">${parts.join('')}</g>`;
}
