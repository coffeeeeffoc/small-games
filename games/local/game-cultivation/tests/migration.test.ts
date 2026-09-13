import { expect, it } from 'vitest';
import {
  defaultCultivationEnvelope,
  legacyCultivationEnvelope,
  normalizeCultivationContent,
} from '../src/content/index.js';
it('migrates validated legacy campaigns without changing the input or revision', () => {
  for (const version of [1, 2]) {
    const legacy = structuredClone(legacyCultivationEnvelope);
    legacy.schemaVersion = version;
    legacy.revision = 7;
    if (version === 1) delete (legacy.payload as Partial<typeof legacy.payload>).title;
    const before = structuredClone(legacy),
      result = normalizeCultivationContent(legacy);
    expect(result).toEqual({ success: true, data: { ...defaultCultivationEnvelope, revision: 7 } });
    expect(legacy).toEqual(before);
  }
});
it('validates source fields before migration and only accepts supported envelopes', () => {
  expect(normalizeCultivationContent(defaultCultivationEnvelope).success).toBe(true);
  for (const version of [1, 2]) {
    const bad = structuredClone(legacyCultivationEnvelope);
    bad.schemaVersion = version;
    bad.payload.events[0].choices[1].text = '';
    const result = normalizeCultivationContent(bad);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.issues[0].path).toEqual(['payload', 'events', 0, 'choices', 1, 'text']);
  }
  for (const changed of [{ schemaVersion: 4 }, { schemaVersion: 0 }, { gameId: 'arena' }])
    expect(normalizeCultivationContent({ ...defaultCultivationEnvelope, ...changed }).success).toBe(
      false,
    );
});
