import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  CONTROL_GAME_IDS,
  controlSnapshotDigest,
  normalizeControlSnapshot,
} from '../src/control-config.js';
import {
  nightOperationsSchema,
  nightReleaseSchema,
  type NightOperations,
} from '../src/night-operations.js';

const operations: NightOperations = {
  announcements: [{ id: 'notice', title: '公告', body: '正文', enabled: true, startsAt: 1 }],
  compensations: [
    {
      id: 'grant',
      title: '补偿',
      body: '正文',
      enabled: true,
      startsAt: 10,
      endsAt: 20,
      eligibleCreatedBefore: 5,
      reward: { coins: 1, xp: 0, packs: 0 },
    },
  ],
};
it('preserves old digests exactly and signs normalized operations independently of JSON key/list order', () => {
  const old = {
    apiOrigins: [],
    games: Object.fromEntries(CONTROL_GAME_IDS.map((id) => [id, 'enabled'])),
  };
  expect(controlSnapshotDigest(old)).toBe(
    createHash('sha256').update(JSON.stringify(old)).digest('hex'),
  );
  expect(normalizeControlSnapshot(old)).not.toHaveProperty('nightOperations');
  const input = {
    ...old,
    nightOperations: {
      ...operations,
      announcements: [
        ...operations.announcements,
        { ...operations.announcements[0]!, id: 'another' },
      ],
    },
  };
  const before = structuredClone(input);
  const digest = controlSnapshotDigest(input);
  const reversed = {
    ...input,
    nightOperations: {
      ...input.nightOperations,
      announcements: [...input.nightOperations.announcements]
        .reverse()
        .map((a) => Object.fromEntries(Object.entries(a).reverse())),
    },
  };
  expect(controlSnapshotDigest(reversed)).toBe(digest);
  expect(input).toEqual(before);
  expect(controlSnapshotDigest(old)).not.toBe(digest);
});
it('rejects unbounded text, duplicate IDs, invalid windows/rewards/recipients and unknown fields', () => {
  const c = operations.compensations[0]!;
  for (const change of [
    { endsAt: 10 },
    { eligibleCreatedBefore: 11 },
    { body: 'x'.repeat(301) },
    { reward: { coins: 0, xp: 0, packs: 0 } },
    { reward: { coins: -1, xp: 1, packs: 0 } },
    { playerIds: [] },
    { playerIds: ['not-a-player'] },
    { path: './code' },
  ])
    expect(
      nightOperationsSchema.safeParse({ ...operations, compensations: [{ ...c, ...change }] })
        .success,
    ).toBe(false);
  expect(nightOperationsSchema.safeParse({ ...operations, compensations: [c, c] }).success).toBe(
    false,
  );
  expect(nightOperationsSchema.safeParse(operations).success).toBe(true);
});
it('allows latest to be disabled but only non-latest builds to be removed', () => {
  const config = {
    schemaVersion: 1,
    builds: [
      { buildId: 'old', channel: 'h5', ranked: 'solo-a', multiplayer: 'duel-a', removed: true },
      {
        buildId: 'new',
        channel: 'h5',
        ranked: 'solo-b',
        multiplayer: 'duel-b',
        disabled: true,
        version: '1.2.3',
        backendVersion: '2.0.0',
      },
    ],
    channels: [{ channel: 'h5', latestBuildId: 'new' }],
    allowNew: { ranked: ['solo-a', 'solo-b'], multiplayer: ['duel-a', 'duel-b'] },
    legacy: { channel: 'h5', ranked: 'solo-a', multiplayer: 'duel-a' },
    disabledBackendVersions: ['2.0.0'],
  };
  expect(nightReleaseSchema.safeParse(config).success).toBe(true);
  expect(
    nightReleaseSchema.safeParse({ ...config, channels: [{ channel: 'h5', latestBuildId: 'old' }] })
      .success,
  ).toBe(false);
});
