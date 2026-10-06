import type { Group } from 'three';
import type { Battle } from './rules.js';
import type { View } from './view.js';
import { soldierPosition } from './scene-space.js';
/** Visual losses follow actual casualty events; no decorative troop deaths. */
export function animateTroops(groups: Group[], b: Battle, v: View) {
  for (const u of b.units) {
    const g = groups[u.id]!;
    const casualty = b.events.find((e) => e.type === 'casualty' && e.target === String(u.id)),
      fall = casualty ? b.time - casualty.time : 10;
    g.visible = u.hp > 0 || (v.p.motion && fall < 0.65);
    g.rotation.z = u.hp > 0 ? 0 : Math.min(1, fall / 0.5) * 1.35;
    g.position.copy(soldierPosition(u.x, u.id));
    g.position.y += Math.abs(Math.sin(b.time * 7 + u.id)) * 0.08;
    g.rotation.y = Math.PI;
  }
}
export function arrowVictim(b: Battle) {
  const recentCasualty = b.events
      .filter((e) => e.type === 'casualty' && e.time >= b.lastArrow - 0.01)
      .at(-1),
    victim = recentCasualty
      ? b.units.find((u) => String(u.id) === recentCasualty.target)
      : b.units.filter((u) => u.hp > 0 && u.x >= 410).sort((a, c) => c.x - a.x || a.id - c.id)[0];
  return victim;
}
