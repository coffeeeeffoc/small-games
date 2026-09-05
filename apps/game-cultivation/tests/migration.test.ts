import { expect, it } from 'vitest';
import {
  defaultCultivationEnvelope,
  normalizeCultivationContent,
} from '@coffeeeeffoc/game-cultivation/content';

it('migrates validated v1 without mutating the published input or its revision', () => {
  const { title: _title, ...payload } = structuredClone(defaultCultivationEnvelope.payload);
  expect(_title).toBe('三分钟修仙');
  const legacy = { gameId: 'cultivation', schemaVersion: 1, revision: 7, payload };
  const before = structuredClone(legacy);
  const result = normalizeCultivationContent(legacy);
  expect(result).toEqual({
    success: true,
    data: { ...legacy, schemaVersion: 2, payload: { ...payload, title: '三分钟修仙' } },
  });
  expect(legacy).toEqual(before);
});
it('accepts current content and reports the exact invalid field in either supported version', () => {
  expect(normalizeCultivationContent(defaultCultivationEnvelope).success).toBe(true);
  for (const schemaVersion of [1, 2]) {
    const bad = structuredClone(defaultCultivationEnvelope);
    bad.schemaVersion = schemaVersion;
    bad.payload.events[0].choices[1].text = '';
    const result = normalizeCultivationContent(bad);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.issues[0].path).toEqual(['payload', 'events', 0, 'choices', 1, 'text']);
  }
  for (const changed of [{ schemaVersion: 3 }, { schemaVersion: 0 }, { gameId: 'arena' }])
    expect(normalizeCultivationContent({ ...defaultCultivationEnvelope, ...changed }).success).toBe(
      false,
    );
});
