import assert from 'node:assert/strict';
import test from 'node:test';
import chapterOne from '../content/chapters/chapter-1.mjs';
import { resolveChapter } from '../content/chapters/index.mjs';
import { createGame, getPlayerStats, command, step } from '../engine.mjs';

test('chapter skill overrides change actual casting without editing the core or shared catalog', () => {
  const definition = resolveChapter({
    ...chapterOne,
    skills: { shot: { cost: 9, damage: 11 }, nova: { name: '新章溅墨' } },
  });
  const state = createGame(definition);
  command(state, { type: 'start' });
  step(state, { shoot: true, aimX: 300, aimY: 380 }, 1 / 60);
  assert.equal(state.player.ink, 81);
  assert.equal(state.projectiles[0].damage, 11);
  assert.equal(definition.skills.nova.name, '新章溅墨');
  assert.equal(getPlayerStats(state).novaDamage, 14);
  assert.equal(getPlayerStats(createGame()).attackCost, 6);
});

test('chapter template overrides keep enemy behavior and equipment effects and update shop prices', () => {
  const definition = resolveChapter({
    ...chapterOne,
    enemyTypes: { guard: { hp: 80 } },
    equipment: { 'fine-nib': { price: 23, modifiers: { attackDamage: 4 } } },
  });
  assert.equal(definition.enemyTypes.guard.hp, 80);
  assert.equal(definition.enemyTypes.guard.behavior, 'charger');
  assert.equal(definition.enemyTypes.guard.r, 28);
  assert.deepEqual(definition.equipment['fine-nib'].modifiers, { attackDamage: 4, meleeDamage: 1 });
  assert.equal(definition.equipment['fine-nib'].maxRank, 3);
  assert.equal(definition.shopItems.find((offer) => offer.itemId === 'fine-nib').price, 23);
  assert.equal(resolveChapter(chapterOne).equipment['fine-nib'].price, 18);
});

test('explicit chapter rule and shop overrides take precedence over template-derived defaults', () => {
  const definition = resolveChapter({
    ...chapterOne,
    skills: { shot: { cost: 9 } },
    rules: { attackCost: 7 },
    shopItems: [{ itemId: 'fine-nib', price: 12 }],
  });
  assert.equal(getPlayerStats(createGame(definition)).attackCost, 7);
  assert.equal(definition.shopItems[0].price, 12);
});
