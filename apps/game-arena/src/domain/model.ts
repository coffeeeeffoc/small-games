import type { ArenaContent, Trait } from '../content/schema.js';

/** Combatant stats and acquired mutations used by arena rules. */
export type Creature = {
  id: string;
  species: string;
  emoji: string;
  attack: number;
  hp: number;
  speed: number;
  traits: Trait[];
};

export const cricketBuilds = [
  { attack: 13, hp: 66, speed: 1.1, style: '稳健耐斗' },
  { attack: 10, hp: 54, speed: 1.45, style: '快须灵巧' },
  { attack: 18, hp: 48, speed: 0.85, style: '重牙猛攻' },
];

/** Each selectable cricket trades bite strength, endurance and charge speed. */
export function hatch(content: ArenaContent, seed = Math.random(), now = Date.now()): Creature {
  const index = Math.floor(seed * content.species.length) % content.species.length;
  const species = content.species[index];
  const build = cricketBuilds[index % cricketBuilds.length];
  return {
    id: `${now}-${seed}`,
    species: species[0],
    emoji: species[1],
    attack: build.attack,
    hp: build.hp,
    speed: build.speed,
    traits: [],
  };
}
/** Adds a mutation with bounded combat stats. */
export function mutate(creature: Creature, trait: Trait): Creature {
  return {
    ...creature,
    attack: Math.max(1, creature.attack + trait.attack),
    hp: Math.max(1, creature.hp + trait.hp),
    speed: Math.max(0.3, +(creature.speed + trait.speed).toFixed(2)),
    traits: [...creature.traits, trait],
  };
}
/** Creates a progressively mutated rival for one of five tiers. */
export function enemyFor(content: ArenaContent, creature: Creature, tier = 0): Creature {
  const base = hatch(content, (creature.attack * 0.137 + creature.hp * 0.031 + tier * 0.11) % 1);
  const rivalSpec = content.rivals[Math.min(4, tier)];
  let rival: Creature = {
    ...base,
    species: rivalSpec[0],
    emoji: rivalSpec[1],
    attack: 9 + tier * 7,
    hp: 46 + tier * 16,
    speed: 1 + tier * 0.12,
    traits: [],
  };
  for (let index = 0; index < Math.min(3, tier); index += 1)
    rival = mutate(rival, content.traits[(tier + index + 2) % content.traits.length]);
  return rival;
}
/** Returns the three deterministic mutation choices shown for a round. */
export function mutationOptions(content: ArenaContent, seed: number): Trait[] {
  return [0, 1, 2].map((index) => content.traits[(seed + index * 2) % content.traits.length]);
}
