import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  CONTROL_GAME_IDS,
  controlPublicationSchema,
  controlSnapshotDigest,
  normalizeControlSnapshot,
} from '../src/control-config.js';

const snapshot = () => ({
  apiOrigins: ['https://z.example', 'https://a.example'],
  games: Object.fromEntries(CONTROL_GAME_IDS.map((id) => [id, 'enabled'])),
});
it('has exactly thirteen implemented IDs and the same canonical digest independent of JSON key order', () => {
  const normalized = normalizeControlSnapshot(snapshot());
  expect(CONTROL_GAME_IDS).toHaveLength(13);
  expect(CONTROL_GAME_IDS).not.toContain('tianxia-chalu');
  expect(normalized.apiOrigins).toEqual(['https://a.example', 'https://z.example']);
  const reversed = {
    ...normalized,
    games: Object.fromEntries(Object.entries(normalized.games).reverse()),
  };
  expect(controlSnapshotDigest(normalizeControlSnapshot(reversed))).toBe(
    controlSnapshotDigest(normalized),
  );
  expect(
    controlPublicationSchema.parse({
      version: 1,
      digest: controlSnapshotDigest(normalized),
      snapshot: reversed,
    }).version,
  ).toBe(1);
});
it('rejects missing/unknown game keys, origins, states, versions and digest drift', () => {
  const good = normalizeControlSnapshot(snapshot());
  for (const bad of [
    { ...good, apiOrigins: ['https://*.example'] },
    { ...good, apiOrigins: ['https://a.example', 'https://a.example'] },
    { ...good, games: { ...good.games, 'tianxia-chalu': 'enabled' } },
    { ...good, games: { ...good.games, 'carding-car': 'maintenance' } },
    { ...good, games: { 'carding-car': 'enabled' } },
    { ...good, members: [] },
  ])
    expect(() => normalizeControlSnapshot(bad)).toThrow();
  for (const version of [0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1])
    expect(() =>
      controlPublicationSchema.parse({
        version,
        snapshot: good,
        digest: controlSnapshotDigest(good),
      }),
    ).toThrow();
  expect(() =>
    controlPublicationSchema.parse({ version: 1, snapshot: good, digest: 'a'.repeat(64) }),
  ).toThrow();
});

it('verifies the original eleven-game digest before adding disabled night in memory', () => {
  const games = Object.fromEntries(
    CONTROL_GAME_IDS.filter((id) => !['night-overwatch', 'tetracube'].includes(id)).map((id) => [
      id,
      'enabled',
    ]),
  );
  const legacy = { apiOrigins: ['https://a.example'], games };
  const digest = createHash('sha256').update(JSON.stringify(legacy)).digest('hex');
  expect(controlSnapshotDigest(legacy)).toBe(digest);
  expect(controlPublicationSchema.parse({ version: 9, digest, snapshot: legacy }).snapshot).toEqual(
    legacy,
  );
  const expanded = normalizeControlSnapshot(legacy);
  expect(expanded.games['night-overwatch']).toBe('disabled');
  expect(expanded.games.tetracube).toBe('disabled');
  expect(controlSnapshotDigest(expanded)).not.toBe(digest);
  expect(() =>
    controlPublicationSchema.parse({ version: 9, digest, snapshot: expanded }),
  ).toThrow();
  expect(Object.hasOwn(legacy.games, 'night-overwatch')).toBe(false);
});

it('preserves the twelve-game digest and rejects Tetracube without Night Overwatch', () => {
  const games = Object.fromEntries(
    CONTROL_GAME_IDS.filter((id) => id !== 'tetracube').map((id) => [id, 'enabled']),
  );
  const legacy = { apiOrigins: [], games };
  const digest = createHash('sha256').update(JSON.stringify(legacy)).digest('hex');
  expect(controlSnapshotDigest(legacy)).toBe(digest);
  expect(
    controlPublicationSchema.parse({ version: 10, digest, snapshot: legacy }).snapshot,
  ).toEqual(legacy);
  const expanded = normalizeControlSnapshot(legacy);
  expect(expanded.games['night-overwatch']).toBe('enabled');
  expect(expanded.games.tetracube).toBe('disabled');
  const wrong = {
    ...snapshot(),
    games: Object.fromEntries(
      CONTROL_GAME_IDS.filter((id) => id !== 'night-overwatch').map((id) => [id, 'enabled']),
    ),
  };
  expect(() => normalizeControlSnapshot(wrong)).toThrow();
  expect(() => controlSnapshotDigest(wrong)).toThrow();
});
