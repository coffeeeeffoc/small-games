import { describe, expect, it } from 'vitest';

import { defaultOfficeContent, officeContentSchema } from '@coffeeeeffoc/game-office/content';

describe('office content', () => {
  it('contains exactly five increasingly risky workdays', () => {
    expect(officeContentSchema.parse(defaultOfficeContent).days).toHaveLength(5);
    expect(defaultOfficeContent.days.map((day) => day.target)).toEqual([16, 24, 32, 40, 50]);
    expect(defaultOfficeContent.days.map((day) => day.inspectionChance)).toEqual([
      0.2, 0.27, 0.34, 0.41, 0.48,
    ]);
  });
});
