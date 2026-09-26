import type { JsonValue } from '@coffeeeeffoc/game-contract';

export interface Progress {
  version: 2;
  unlocked: number;
  stars: number[];
  best: number[];
  assistedBest: number[];
  coins: number;
  skin: number;
  sound: boolean;
  reducedMotion: boolean;
  ownedSkins: number[];
  legacyScores?: { stars: number[]; best: number[]; assistedBest: number[] };
}
export const SKINS = ['老公房', '海边民宿', '霓虹公寓'];
export function newProgress(): Progress {
  return {
    version: 2,
    unlocked: 0,
    stars: Array(20).fill(0),
    best: Array(20).fill(0),
    assistedBest: Array(20).fill(0),
    coins: 0,
    skin: 0,
    sound: true,
    reducedMotion: false,
    ownedSkins: [0],
  };
}
export function readProgress(value: JsonValue): Progress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid save');
  const bounded = (n: unknown, max: number): n is number =>
    Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= max;
  if (
    (value.version !== 1 && value.version !== 2) ||
    !bounded(value.unlocked, 19) ||
    !bounded(value.coins, 1e9) ||
    !bounded(value.skin, 2) ||
    typeof value.sound !== 'boolean' ||
    typeof value.reducedMotion !== 'boolean' ||
    !Array.isArray(value.stars) ||
    value.stars.length !== 20 ||
    !value.stars.every((n) => bounded(n, 3)) ||
    !Array.isArray(value.best) ||
    value.best.length !== 20 ||
    !value.best.every((n) => bounded(n, 1e7)) ||
    !Array.isArray(value.ownedSkins) ||
    !value.ownedSkins.every((n) => bounded(n, 2)) ||
    !value.ownedSkins.includes(0) ||
    !value.ownedSkins.includes(value.skin)
  )
    throw new Error('Invalid save');
  if (
    value.assistedBest !== undefined &&
    (!Array.isArray(value.assistedBest) ||
      value.assistedBest.length !== 20 ||
      !value.assistedBest.every((n) => bounded(n, 1e7)))
  )
    throw new Error('Invalid assisted scores');
  if (value.legacyScores !== undefined) {
    const legacy = value.legacyScores;
    if (
      !legacy ||
      typeof legacy !== 'object' ||
      Array.isArray(legacy) ||
      !['stars', 'best', 'assistedBest'].every(
        (key) =>
          Array.isArray(legacy[key]) &&
          legacy[key].length === 20 &&
          legacy[key].every((n) => bounded(n, key === 'stars' ? 3 : 1e7)),
      )
    )
      throw new Error('Invalid legacy scores');
  }
  return {
    version: 2,
    unlocked: value.unlocked,
    stars: value.version === 1 ? Array(20).fill(0) : (value.stars as number[]),
    best: value.version === 1 ? Array(20).fill(0) : (value.best as number[]),
    assistedBest:
      value.version === 1
        ? Array(20).fill(0)
        : ((value.assistedBest as number[] | undefined) ?? Array(20).fill(0)),
    coins: value.coins,
    skin: value.skin,
    sound: value.sound,
    reducedMotion: value.reducedMotion,
    ownedSkins: value.ownedSkins as number[],
    ...(value.version === 1
      ? {
          legacyScores: {
            stars: [...value.stars] as number[],
            best: [...value.best] as number[],
            assistedBest: [...((value.assistedBest as number[] | undefined) ?? Array(20).fill(0))],
          },
        }
      : value.legacyScores
        ? { legacyScores: value.legacyScores as unknown as NonNullable<Progress['legacyScores']> }
        : {}),
  };
}
