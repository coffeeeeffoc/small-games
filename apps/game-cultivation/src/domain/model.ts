/** Numeric attributes that determine a cultivation run's score and realm. */
export type Stats = { body: number; spirit: number; luck: number };
/** A player decision and its pure stat/result consequences. */
export type Choice = { text: string; result: string; delta: Partial<Stats> };
/** One ordered campaign event with exactly two choices after content validation. */
export type CultivationEvent = {
  age: number;
  chapter: number;
  title: string;
  text: string;
  boss?: boolean;
  choices: Choice[];
};

/** Ordered realm labels selected from the run score. */
export const realms = ['炼气', '筑基', '金丹', '元婴', '化神', '飞升'] as const;

/** Calculates a non-negative weighted run score. */
export function score(stats: Stats): number {
  return Math.max(0, stats.body * 2 + stats.spirit * 3 + stats.luck * 2);
}

/** Maps the weighted score to its capped realm label. */
export function realm(stats: Stats): (typeof realms)[number] {
  return realms[Math.min(5, Math.floor(score(stats) / 24))];
}

/** Applies one choice without mutating the supplied stats and clamps values at zero. */
export function applyChoice(stats: Stats, choice: Choice): Stats {
  return {
    body: Math.max(0, stats.body + (choice.delta.body ?? 0)),
    spirit: Math.max(0, stats.spirit + (choice.delta.spirit ?? 0)),
    luck: Math.max(0, stats.luck + (choice.delta.luck ?? 0)),
  };
}
