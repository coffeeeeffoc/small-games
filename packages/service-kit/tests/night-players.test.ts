import { expect, it } from 'vitest';
import {
  nightPlayerQuerySchema,
  nightPlayerDetailQuerySchema,
  playerBusiness,
  hasPrivatePlayerField,
} from '../src/night-players.js';

it('requires a real bounded date range or an identity filter; short IDs are normalized', () => {
  for (const input of [
    {},
    { from: '2026-11-01' },
    { from: '2026-02-30', to: '2026-03-01' },
    { from: '2026-11-02', to: '2026-11-01' },
    { nickname: '' },
    { shortId: 'c3f58a3' },
    { nickname: 'x', page: 0 },
    { nickname: 'x', game: 'other' },
  ])
    expect(nightPlayerQuerySchema.safeParse(input).success).toBe(false);
  expect(nightPlayerQuerySchema.parse({ shortId: '#C3F58A3A' })).toEqual({
    shortId: 'c3f58a3a',
    page: 1,
  });
  expect(
    nightPlayerDetailQuerySchema.safeParse({
      id: 'c3f58a3a-1111-4111-8111-111111111111',
      section: 'sessions',
    }).success,
  ).toBe(false);
});
it('preserves large business arrays and long strings while recursively omitting credentials and internal simulation', () => {
  const mail = Array.from({ length: 250 }, (_, i) => ({
    id: String(i),
    body: '正文'.repeat(2500),
    reward: { coins: 1 },
  }));
  const value = playerBusiness({
    mail,
    legacy: { inventory: { a: 1 }, token: 'canary' },
    players: [
      {
        id: 'p',
        leaseId: 'canary',
        passwordHash: 'canary',
        state: { x: 1 },
        settlement: { points: 1 },
      },
    ],
    hash: 'canary',
    refreshToken: 'canary',
  });
  expect(value).toEqual({
    mail,
    legacy: { inventory: { a: 1 } },
    players: [{ id: 'p', settlement: { points: 1 } }],
  });
  expect(hasPrivatePlayerField(value)).toBe(false);
  expect(hasPrivatePlayerField({ data: [{ credential: 'x' }] })).toBe(true);
});
