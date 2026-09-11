import { expect, it } from 'vitest';
import { cultivationContentSchema, defaultCultivationContent } from '../src/content/index.js';
it('validates bounded realtime settings and rejects non-finite or unsafe values', () => {
  expect(cultivationContentSchema.parse(defaultCultivationContent).balance.preparationSeconds).toBe(
    120,
  );
  for (const value of [0, -1, Infinity, NaN, 99999])
    expect(
      cultivationContentSchema.safeParse({
        ...defaultCultivationContent,
        balance: { ...defaultCultivationContent.balance, moveSpeed: value },
      }).success,
    ).toBe(false);
});
