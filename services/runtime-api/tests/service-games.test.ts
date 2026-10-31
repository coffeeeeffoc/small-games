import { expect, it } from 'vitest';
import { CONTROL_GAME_IDS } from '@coffeeeeffoc/service-kit';
import { guestSessionSchema } from '../src/competition/identity-store.js';
import { IDENTITY_GAME_IDS } from '../src/competition/service-games.js';

it('night and tetracube are controlled while wulong remains identity-only', () => {
  expect(CONTROL_GAME_IDS).toHaveLength(13);
  expect(IDENTITY_GAME_IDS).toHaveLength(14);
  for (const game of ['wulong-city', 'night-overwatch', 'tetracube']) {
    expect(guestSessionSchema.parse({ game })).toEqual({ game });
    expect(CONTROL_GAME_IDS.includes(game as never)).toBe(game !== 'wulong-city');
  }
  for (const game of ['unknown', '__proto__', 'wulong-city/../night-overwatch']) {
    expect(guestSessionSchema.safeParse({ game }).success).toBe(false);
  }
  expect(guestSessionSchema.safeParse({ game: 'wulong-city', score: 999999 }).success).toBe(false);
});
