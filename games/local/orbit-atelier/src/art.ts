import { angleDistance, type Ring, type State } from './core.ts';

export const COLORS = ['#27766e', '#de7b63', '#c99845', '#4f858f'];
const TAU = Math.PI * 2;
export const star = (x: number, y: number, size = 6, color = '#a68242') =>
  `<path d="M${x},${y - size} Q${x},${y} ${x + size},${y} Q${x},${y} ${x},${y + size} Q${x},${y} ${x - size},${y} Q${x},${y} ${x},${y - size}" fill="${color}"/>`;
function arc(r: number, start: number, end: number) {
  return `M${Math.cos(start) * r} ${Math.sin(start) * r} A${r} ${r} 0 ${end - start > Math.PI ? 1 : 0} 1 ${Math.cos(end) * r} ${Math.sin(end) * r}`;
}
export function ringArt(
  ring: Ring,
  index: number,
  selected = false,
  locked = false,
  remaining = 0,
): string {
  const color = ring.color || COLORS[index % COLORS.length];
  const a = ring.angle + ring.gap / 2,
    b = ring.angle + TAU - ring.gap / 2;
  const path = arc(ring.r, a, b);
  const marks = Array.from({ length: 30 }, (_, k) => (k * TAU) / 30)
    .filter((angle) => angleDistance(angle, ring.angle) > ring.gap / 2 + 0.08)
    .map((angle, k) => {
      const c = Math.cos(angle),
        s = Math.sin(angle),
        size = k % 5 === 0 ? 5 : 2;
      return `<path d="M${c * (ring.r - 3)} ${s * (ring.r - 3)} L${c * (ring.r - 3 - size)} ${s * (ring.r - 3 - size)}" stroke="#fff4cb" stroke-width=".7" opacity=".6"/>`;
    })
    .join('');
  const rivets = [a, b]
    .map(
      (angle) =>
        `<circle cx="${Math.cos(angle) * ring.r}" cy="${Math.sin(angle) * ring.r}" r="2.5" fill="#f4deaa" stroke="#80643a" stroke-width=".8"/>`,
    )
    .join('');
  return `<g data-ring="${ring.id}" data-ring-id="${ring.id}" data-angle="${ring.angle}" data-gap="${ring.gap}" data-radius="${ring.r}" data-x="${ring.x}" data-y="${ring.y}" transform="translate(${ring.x} ${ring.y})" class="ring ${selected ? 'selected' : ''}">
    ${selected ? `<circle r="${ring.r + 13}" fill="none" stroke="${color}" stroke-width="1.2" stroke-dasharray="3 6" opacity=".5"/>` : ''}
    <path d="${path}" fill="none" stroke="#283d38" stroke-width="16" stroke-linecap="round" transform="translate(0 2)" opacity=".22"/>
    <path d="${path}" fill="none" stroke="#3f4f42" stroke-width="15" stroke-linecap="round"/>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="13" stroke-linecap="round"/>
    <path d="${arc(ring.r + 4.5, a, b)}" fill="none" stroke="#fff2c8" stroke-width=".8" opacity=".7"/>
    <path d="${arc(ring.r - 4.5, a, b)}" fill="none" stroke="#182d2b" stroke-width=".8" opacity=".35"/>
    ${marks}${rivets}
    ${locked ? `<g class="star-lock" aria-label="星栓：再解开${remaining}个圆环"><rect x="-10" y="-4" width="20" height="16" rx="4" fill="#c99845" stroke="#f5dfad"/><path d="M-5 -4V-9A5 5 0 0 1 5 -9V-4" fill="none" stroke="#735d39" stroke-width="2"/><text x="0" y="8" text-anchor="middle" font-size="12" fill="#473d29">${remaining}</text></g>` : `<text class="ring-number" text-anchor="middle" y="5">${index + 1}</text>`}
  </g>`;
}
export function fitScene(state: State): { transform: string; scale: number } {
  // Include removed rings so the board stays in place during a puzzle.
  const left = Math.min(...state.rings.map((r) => r.x - r.r - 22));
  const right = Math.max(...state.rings.map((r) => r.x + r.r + 22));
  const top = Math.min(...state.rings.map((r) => r.y - r.r - 22));
  const bottom = Math.max(...state.rings.map((r) => r.y + r.r + 22));
  const scale = Math.min(320 / (right - left), 350 / (bottom - top), 1.3);
  return {
    transform: `translate(180 215) scale(${scale}) translate(${-(left + right) / 2} ${-(top + bottom) / 2})`,
    scale,
  };
}
export function skyArt(): string {
  return `<g fill="none" stroke="#b49357" opacity=".42" stroke-width=".65"><circle cx="180" cy="215" r="151"/><circle cx="180" cy="215" r="167" stroke-dasharray="2 6"/><path d="M180 28V402M20 215H340" stroke-dasharray="1 9"/></g>${star(180, 30, 8)}${star(180, 402, 8)}${star(27, 110, 5)}${star(322, 305, 5)}${star(45, 341, 3)}${star(318, 68, 3)}`;
}
export function heroArt(): string {
  const rings: Ring[] = [
    { id: 'hero-1', x: 145, y: 144, r: 69, gap: 1.2, angle: 0.95, color: COLORS[0] },
    { id: 'hero-2', x: 217, y: 193, r: 72, gap: 1.15, angle: 1.45, color: COLORS[1] },
    { id: 'hero-3', x: 127, y: 242, r: 68, gap: 1.05, angle: -1.25, color: COLORS[2] },
    { id: 'hero-4', x: 215, y: 293, r: 65, gap: 1.15, angle: -2.75, color: COLORS[0] },
  ];
  return `<svg viewBox="0 0 360 430" aria-hidden="true">${skyArt()}<path d="M180 52V382" stroke="#ab8543" stroke-width="1"/>${rings.map((ring, i) => ringArt(ring, i)).join('')}${star(180, 62, 13)}${star(180, 380, 10)}</svg>`;
}
