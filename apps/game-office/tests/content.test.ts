import { describe, expect, it } from 'vitest';
import {
  defaultOfficeContent,
  defaultOfficeEnvelope,
  officeContentSchema,
} from '@coffeeeeffoc/game-office/content';
import { officeManifest } from '../src/manifest.js';

describe('first-person office content', () => {
  it('publishes the new experience with a bounded reproducible week seed', () => {
    expect(officeContentSchema.parse(defaultOfficeContent)).toEqual(defaultOfficeContent);
    expect(defaultOfficeEnvelope.schemaVersion).toBe(2);
    expect(defaultOfficeEnvelope.schemaVersion).toBe(officeManifest.contentSchemaVersion);
    expect(officeContentSchema.parse({ experience: 'first-person-week' }).seed).toBe(
      defaultOfficeContent.seed,
    );
    for (const seed of [0, 0xffffffff])
      expect(officeContentSchema.parse({ experience: 'first-person-week', seed }).seed).toBe(seed);
    for (const seed of [-1, 0x100000000, 1.5, NaN, Infinity, '42'])
      expect(officeContentSchema.safeParse({ experience: 'first-person-week', seed }).success).toBe(
        false,
      );
    for (const experience of ['classic', 'desk-sample', undefined])
      expect(officeContentSchema.safeParse({ experience, days: [] }).success).toBe(false);
  });
});
