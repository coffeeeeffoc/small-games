export const FACTIONS = Object.freeze([
  { id: 0, name: '赤岚', shortName: '赤', color: '#b94339', style: 'aggressive' },
  { id: 1, name: '苍澜', shortName: '苍', color: '#467c9a', style: 'defensive' },
  { id: 2, name: '青岑', shortName: '青', color: '#608c65', style: 'expansionist' },
  { id: 3, name: '玄金', shortName: '金', color: '#c6943c', style: 'opportunist' },
]);

export const RULES = Object.freeze({
  width: 390,
  height: 660,
  duration: 180,
  step: 0.1,
  reserve: 0,
  capacity: 60,
  production: 1.25,
  dispatchInterval: 2,
  minDispatchInterval: 0.25,
  dispatchStrengthScale: 24,
  dispatchMomentum: 0.1,
  maxDispatchMomentum: 8,
  packetSize: 8,
  packetFraction: 0.3,
  packetMomentum: 0.05,
  packetVariation: 0.15,
  speed: 42,
  switchCooldown: 0.2,
  health: 10,
  attack: 2.5,
  interval: 1,
  defense: 0.08,
  recruitTime: 20,
  recruitCooldown: 8,
  auraRadius: 85,
  bonusCap: 1.2,
});

export const CITY_TYPES = Object.freeze({
  town: { name: '普通城', production: 1.25, capacity: 60, fortification: 0 },
  barracks: { name: '兵营城', production: 1.6875, capacity: 60, fortification: 8 },
  pass: { name: '关隘', production: 0.9, capacity: 60, fortification: 45 },
  muster: { name: '点将台', production: 1.25, capacity: 60, fortification: 12 },
});
export const ROAD_TYPES = Object.freeze({ normal: 1, fast: 1.35, slow: 0.7 });
export const TERRAINS = Object.freeze(['plain', 'forest', 'mountain', 'river']);
export const WEAPONS = Object.freeze({
  crossbow: { name: '弓弩', damage: 7, interval: 1.2, range: 85, splash: 0 },
  catapult: { name: '投石器', damage: 16, interval: 4, range: 110, splash: 32 },
  cannon: { name: '火炮', damage: 32, interval: 6, range: 95, splash: 0 },
});
export const GENERAL_TYPES = Object.freeze({
  warrior: {
    name: '猛将',
    attack: 14,
    interval: 1.2,
    defense: 0.1,
    health: 65,
    aura: 'attack',
    bonus: 0.22,
  },
  commander: {
    name: '统帅',
    attack: 8,
    interval: 1,
    defense: 0.15,
    health: 80,
    aura: 'production',
    bonus: 0.25,
  },
  guardian: {
    name: '守将',
    attack: 7,
    interval: 1.4,
    defense: 0.4,
    health: 110,
    aura: 'defense',
    bonus: 0.2,
  },
  ranger: {
    name: '疾行',
    attack: 8,
    interval: 0.8,
    defense: 0.1,
    health: 60,
    aura: 'speed',
    bonus: 0.25,
  },
  arbalist: {
    name: '弩将',
    attack: 6,
    interval: 0.55,
    defense: 0.08,
    health: 55,
    aura: 'rate',
    bonus: 0.2,
  },
  medic: {
    name: '军医',
    attack: 4,
    interval: 1.3,
    defense: 0.15,
    health: 95,
    aura: 'health',
    bonus: 0.25,
  },
});
export const LOADOUT_KINDS = Object.freeze([
  'troops',
  'production',
  'attack',
  'rate',
  'defense',
  'health',
  'speed',
  'general',
  'weapon',
  'territory',
]);

export function validateSeed(seed) {
  if (
    !(typeof seed === 'number' && Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff) &&
    !(typeof seed === 'string' && seed.length > 0 && seed.length <= 128)
  )
    throw new TypeError('Seed must be a uint32 or a nonempty string of at most 128 characters');
  return seed;
}

export function validateLoadout(loadout) {
  if (
    !Array.isArray(loadout) ||
    loadout.length > 2 ||
    loadout.some(
      (card) =>
        !card ||
        typeof card !== 'object' ||
        Array.isArray(card) ||
        Object.keys(card).some((key) => !['kind', 'tier'].includes(key)) ||
        !LOADOUT_KINDS.includes(card.kind) ||
        !Number.isInteger(card.tier) ||
        card.tier < 0 ||
        card.tier > 3,
    )
  )
    throw new TypeError('Loadout must contain at most two {kind, tier: 0..3} cards');
  return loadout.map(({ kind, tier }) => ({ kind, tier }));
}
