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
it('has exactly eleven implemented IDs and the same canonical digest independent of JSON key order', () => {
  const normalized = normalizeControlSnapshot(snapshot());
  expect(CONTROL_GAME_IDS).toHaveLength(11);
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
