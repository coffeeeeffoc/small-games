import { GENERAL_TYPES, LOADOUT_KINDS, RULES } from '../content/rules.mjs';

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const point = (entry) => ({ x: entry.x, y: entry.y });

export function positionOfPacket(state, packet) {
  if (packet.phase === 'stationed' || packet.phase === 'siege') {
    const city = state.cities.find((c) => c.id === packet.targetCityId);
    return point(city);
  }
  const t = Math.max(0, Math.min(1, packet.progress));
  return {
    x: packet.from.x + (packet.to.x - packet.from.x) * t,
    y: packet.from.y + (packet.to.y - packet.from.y) * t,
  };
}

export function positionOfGeneral(state, general) {
  const packet = state.packets.find((p) => p.id === general.packetId);
  if (packet) return positionOfPacket(state, packet);
  const city = state.cities.find((c) => c.id === general.cityId);
  return city ? point(city) : null;
}

/** Only live sources are returned. Consumers must re-query after movement/ownership changes. */
export function effectSources(state) {
  const sources = [];
  for (const source of state.sources) {
    const city = state.cities.find((c) => c.id === source.cityId);
    if (city?.owner === source.factionId)
      sources.push({ ...source, position: point(city), remaining: null });
  }
  for (const general of state.generals) {
    if (
      general.health <= 0 ||
      state.cities.find((c) => c.id === general.originCityId)?.owner !== general.owner
    )
      continue;
    const position = positionOfGeneral(state, general);
    if (position)
      sources.push({
        id: `general-${general.id}`,
        sourceType: 'general',
        factionId: general.owner,
        generalId: general.id,
        cityId: general.originCityId,
        kind: GENERAL_TYPES[general.kind].aura,
        value: GENERAL_TYPES[general.kind].bonus,
        radius: RULES.auraRadius,
        position,
        remaining: null,
        scope: 'allied-local',
      });
  }
  return sources;
}

export function modifiersAt(state, factionId, position, sources = effectSources(state)) {
  const bonuses = Object.fromEntries(LOADOUT_KINDS.map((kind) => [kind, 0]));
  for (const s of sources) {
    if (
      s.factionId !== factionId ||
      s.kind === 'troops' ||
      distance(s.position, position) > s.radius + 1e-9
    )
      continue;
    bonuses[s.kind] = Math.max(
      bonuses[s.kind],
      Math.min(s.kind === 'defense' ? 0.4 : 0.5, s.value),
    );
  }
  const total = Object.values(bonuses).reduce((a, b) => a + b, 0);
  if (total > RULES.bonusCap)
    for (const kind of LOADOUT_KINDS) bonuses[kind] *= RULES.bonusCap / total;
  return bonuses;
}
