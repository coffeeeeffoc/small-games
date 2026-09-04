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

/** Hatches the same deterministic base creature as the legacy arena. */
export function hatch(content: ArenaContent, seed = Math.random(), now = Date.now()): Creature {
  const species =
    content.species[Math.floor(seed * content.species.length) % content.species.length];
  return {
    id: `${now}-${seed}`,
    species: species[0],
    emoji: species[1],
    attack: 10 + Math.floor(seed * 8),
    hp: 48 + Math.floor(seed * 20),
    speed: 1 + Math.round(seed * 4) / 10,
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
/** Calculates the legacy aggregate combat power. */
export function power(creature: Creature): number {
  return Math.round(
    creature.attack * creature.speed * 2 + creature.hp + creature.traits.length * 5,
  );
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
/** Resolves the automatic battle using the legacy 0.94 power threshold. */
export function winsBattle(creature: Creature, enemy: Creature): boolean {
  return power(creature) / power(enemy) >= 0.94;
}
