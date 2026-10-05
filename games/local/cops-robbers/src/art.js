import { getRoleAppearance, roleAvatarSvg } from './role-appearance.js';

const characterAsset = new URL('../assets/patrol-characters.svg', import.meta.url).href;
const gardenAsset = new URL('../assets/patrol-garden.webp', import.meta.url).href;
const propsAsset = new URL('../assets/patrol-props.webp', import.meta.url).href;

function illustratedRole(kind) {
  const appearance = getRoleAppearance(kind);
  return (
    globalThis.__CLASSIC_CHASE_ROLES__ === true && appearance.style === 'team' && !appearance.avatar
  );
}

function atlasImage(asset, width, height) {
  return `<image href="${asset}" width="${width}" height="${height}" pointer-events="none"/>`;
}

/** The same illustrated faces appear in the board, squad and home controls. */
export function gamePortrait(kind, x = 0, y = 0, size = 100) {
  if (!illustratedRole(kind)) return roleAvatarSvg(kind, x, y, size);
  return `<svg class="illustrated-portrait" x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 100 100" overflow="hidden" aria-hidden="true"><image href="${characterAsset}#${kind}-face" width="100" height="100" preserveAspectRatio="none"/></svg>`;
}

export function sceneDefinitions() {
  return `<linearGradient id="road-cream" x2="0" y2="1"><stop stop-color="#fff9e2"/><stop offset="1" stop-color="#f7e8bf"/></linearGradient>
    <linearGradient id="stone-cream" x2=".2" y2="1"><stop stop-color="#fffdf2"/><stop offset=".6" stop-color="#fff6d9"/><stop offset="1" stop-color="#f2dfaf"/></linearGradient>
    <linearGradient id="stone-mint" x2=".2" y2="1"><stop stop-color="#cefff1"/><stop offset="1" stop-color="#5edccc"/></linearGradient>
    <linearGradient id="stone-gold" x2=".2" y2="1"><stop stop-color="#fff2ab"/><stop offset="1" stop-color="#ffd34f"/></linearGradient>
    <filter id="stone-shadow" x="-35%" y="-35%" width="170%" height="180%"><feDropShadow dx="0" dy="4" stdDeviation="1.2" flood-color="#688760" flood-opacity=".5"/></filter>`;
}

/** Big heads, different uniforms, and clear team silhouettes at phone scale. */
export function character(kind, mood = 'idle', index = 0) {
  if (illustratedRole(kind)) {
    return `<svg class="character-sprite illustrated-character ${kind} mood-${mood}" x="-42" y="-110" width="84" height="110" viewBox="0 0 84 110" overflow="hidden" aria-hidden="true"><image href="${characterAsset}#${kind}" width="84" height="110" preserveAspectRatio="none"/></svg>`;
  }
  const pursuit = kind === 'cop',
    appearance = getRoleAppearance(kind),
    running = mood === 'run';
  const raised = ['caught', 'cheer'].includes(mood),
    ink = '#153c55';
  const classic = globalThis.__CLASSIC_CHASE_ROLES__ === true && appearance.style === 'team';
  const shirt = classic ? (pursuit ? '#197aba' : '#f39129') : appearance.color;
  const trousers = pursuit ? '#194d78' : '#33465b';
  const leftArm = raised
    ? 'M-16-42Q-28-49-28-61'
    : running
      ? 'M-16-42Q-26-48-30-40'
      : 'M-16-42Q-24-34-23-27';
  const rightArm = raised
    ? 'M16-42Q28-49 28-61'
    : running
      ? 'M16-42Q24-28 30-31'
      : 'M16-42Q24-34 23-27';
  const hands = raised
    ? [
        [-28, -61],
        [28, -61],
      ]
    : running
      ? [
          [-30, -40],
          [30, -31],
        ]
      : [
          [-23, -27],
          [23, -27],
        ];
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

/** Real roads remain procedural; scenery never takes a junction's hit area. */
export function scenery(level, chapter = 0) {
  const { nodes, edges } = level;
  const height = level.height || 600;
  const distanceToRoad = (x, y, a, b) => {
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)),
    );
    return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
  };
  const occupied = [];
  const clear = (x, y, radius) =>
    nodes.every((node) => Math.hypot(x - node.x, y - node.y) > radius + 48) &&
    edges.every(([a, b]) => distanceToRoad(x, y, nodes[a], nodes[b]) > radius + 24) &&
    occupied.every((item) => Math.hypot(x - item.x, y - item.y) > radius + item.radius + 14);
  const parts = [
    `<image class="garden-backdrop" href="${gardenAsset}" width="600" height="${height}" preserveAspectRatio="xMidYMid slice"/>`,
  ];
  const candidates = [
    [112, 0.25, 0],
    [480, 0.26, 1],
    [286, 0.2, 2],
    [115, 0.73, 2],
    [490, 0.73, 0],
    [298, 0.79, 1],
    [205, 0.43, 2],
    [395, 0.56, 0],
    [102, 0.52, 0],
    [500, 0.46, 2],
    [310, 0.6, 2],
    [292, 0.36, 0],
  ];
  candidates.forEach(([x, ratio, type], index) => {
    const y = ratio * height;
    // Small flowers sit inside open blocks; taller trees stay clear of roads.
    const size = type === 1 ? 64 : type === 2 ? 48 : 58;
    const radius = size * 0.45;
    if (!clear(x, y, radius)) return;
    occupied.push({ x, y, radius });
    const variant = type === 1 && chapter % 3 === 2 && index % 2 ? 3 : type;
    const box = `${(variant % 2) * 627} ${Math.floor(variant / 2) * 627} 627 627`;
    parts.push(
      `<svg x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" viewBox="${box}" overflow="hidden">${atlasImage(propsAsset, 1254, 1254)}</svg>`,
    );
  });
  return `<g class="scenery" pointer-events="none" aria-hidden="true">${parts.join('')}</g>`;
}
