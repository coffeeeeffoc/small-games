import { describe, expect, it } from 'vitest';

import {
  cultivationContentSchema,
  defaultCultivationContent,
} from '@coffeeeeffoc/game-cultivation/content';

describe('cultivation content', () => {
  it('owns a valid three-chapter, eighteen-event schema', () => {
    const content = cultivationContentSchema.parse(defaultCultivationContent);
    expect(content.chapters).toHaveLength(3);
    expect(content.events).toHaveLength(18);
    expect(content.events.filter((event) => event.boss)).toHaveLength(3);
  });
});
