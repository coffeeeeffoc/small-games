import { describe, expect, it } from 'vitest';
import { arenaContentSchema, defaultArenaContent } from '@coffeeeeffoc/game-arena/content';
describe('arena content', () => {
  it('validates five leagues and rivals', () => {
    const content = arenaContentSchema.parse(defaultArenaContent);
    expect(content.ranks).toHaveLength(5);
    expect(content.rivals).toHaveLength(5);
    expect(content.traits).toHaveLength(6);
  });
});
