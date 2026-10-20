import { expect, it } from 'vitest';
import { CONTROL_GAME_IDS } from '@coffeeeeffoc/service-kit';
import { guestSessionSchema } from '../src/competition/identity-store.js';
import { IDENTITY_GAME_IDS } from '../src/competition/service-games.js';

it('new anonymous service identities do not alter the signed control registry', () => {
  expect(CONTROL_GAME_IDS).toHaveLength(11);
  expect(IDENTITY_GAME_IDS).toHaveLength(13);
  for (const game of ['wulong-city', 'night-overwatch']) {
    expect(guestSessionSchema.parse({ game })).toEqual({ game });
    expect(CONTROL_GAME_IDS).not.toContain(game);
  }
  for (const game of ['unknown', '__proto__', 'wulong-city/../night-overwatch']) {
    expect(guestSessionSchema.safeParse({ game }).success).toBe(false);
  }
  expect(guestSessionSchema.safeParse({ game: 'wulong-city', score: 999999 }).success).toBe(false);
});
