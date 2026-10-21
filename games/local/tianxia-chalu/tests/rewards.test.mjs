import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  normalizeArmory,
  drawCard,
  upgradeCard,
  equipCard,
  consumeCards,
  equippedCards,
  currentCards,
  PROBABILITIES,
  rewardBand,
  cardDescription,
} from '../rewards.mjs';
import { createH5Publishing } from '../publishing.js';
const result = (rank = 1, count = 4) => ({
  completed: true,
  rewardEligible: true,
  reason: 'timeout',
  rankings: Array.from({ length: count }, (_, i) => ({
    factionId: i,
    rank: i === 0 ? rank : i + 1,
  })),
});
const now = Date.parse('2026-10-22T08:00:00Z');
test('rank bands and all probability intervals produce exactly the declared four tiers', () => {
  for (const [rank, count] of [
    [1, 4],
    [2, 4],
    [4, 4],
    [1, 2],
    [2, 2],
  ]) {
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 100; i++) {
      const a = normalizeArmory();
      let index = 0;
      const c = drawCard(
        a,
        result(rank, count),
        'm' + i,
        () => (index++ ? 0.5 : (i + 0.5) / 100),
        now,
      );
      counts[c.tier]++;
    }
    assert.deepEqual(counts, PROBABILITIES[rewardBand(rank, count)]);
  }
  assert.equal(rewardBand(1, 4), 'leading', 'tied first uses first-place distribution');
});
test('natural result grants once across reload; abandonment and invalid rank cannot mint a card', () => {
  let a = normalizeArmory();
  const first = drawCard(a, result(), 'match', () => 0.4, now);
  a = normalizeArmory(JSON.parse(JSON.stringify(a)));
  assert.deepEqual(
    drawCard(
      a,
      result(),
      'match',
      () => {
        throw Error('must not reroll');
      },
      now,
    ),
    first,
  );
  assert.equal(a.cards.length, 1);
  for (const r of [
    { ...result(), completed: false },
    { ...result(), reason: 'abandoned' },
    result(7, 4),
  ])
    assert.equal(drawCard(a, r, 'invalid'), null);
  assert.throws(() => drawCard(a, result(), 'bad', () => 1), RangeError);
  assert.match(cardDescription(first), /95步/);
});
test('daily and single slots, midnight expiry, prepare versus start consumption', () => {
  const a = normalizeArmory();
  for (const [id, duration] of [
    ['day', 'daily'],
    ['battle', 'single'],
    ['second-day', 'daily'],
  ])
    a.cards.push({ id, kind: 'production', tier: 1, duration, expiresAt: now + 1000 });
  equipCard(a, 'day', now);
  equipCard(a, 'battle', now);
  equipCard(a, 'second-day', now);
  assert.deepEqual(a.equipped, ['battle', 'second-day']);
  const preview = equippedCards(a, now);
  assert.equal(preview.length, 2);
  assert.equal(a.cards.length, 3);
  consumeCards(
    a,
    preview.map((c) => c.id),
  );
  assert.equal(a.cards.length, 2);
  assert.equal(currentCards(a, now + 1001).length, 0);
  const daily = drawCard(a, result(), 'day-reward', () => 0, now);
  assert.equal(daily.duration, 'daily');
  assert.equal(daily.expiresAt, Date.parse('2026-10-22T16:00:00Z'));
  const active = equippedCards(a, now);
  assert.equal(active.length, 1, 'consuming single does not unequip daily');
});
test('ad completion replaces same-purpose card by exactly one tier; cancellation, failure and duplicates preserve inventory', async () => {
  for (const status of ['dismissed', 'unavailable', 'failed', 'completed']) {
    const a = normalizeArmory();
    drawCard(a, result(), 'match', () => 0.4, now);
    const before = { ...a.cards[0] };
    const publishing = createH5Publishing({
      gameId: 'test',
      adMode: 'host',
      provider: { show: async () => ({ status }) },
    });
    const response = await publishing.rewarded({ placement: 'card-upgrade' });
    assert.equal(upgradeCard(a, 'match', response.status), status === 'completed');
    assert.equal(a.cards.length, 1);
    assert.equal(a.cards[0].kind, before.kind);
    assert.equal(a.cards[0].tier, before.tier + (status === 'completed' ? 1 : 0));
    if (status === 'completed') assert.equal(upgradeCard(a, 'match', 'completed'), false);
    publishing.dispose();
  }
  const a = normalizeArmory();
  drawCard(a, result(), 'epic', () => 0.99, now);
  assert.equal(a.cards[0].tier, 3);
  assert.equal(upgradeCard(a, 'epic', 'completed'), false);
});
test('thrown host and duplicate asynchronous completion cannot manufacture an upgrade', async () => {
  const a = normalizeArmory();
  drawCard(a, result(), 'a', () => 0.3, now);
  const p = createH5Publishing({
    gameId: 'test',
    adMode: 'host',
    provider: {
      show: () => {
        throw Error('SDK failure');
      },
    },
  });
  const answer = await p.rewarded({ placement: 'result' });
  assert.equal(answer.status, 'failed');
  assert.equal(upgradeCard(a, 'a', answer.status), false);
  p.dispose();
  let complete;
  const pending = createH5Publishing({
    gameId: 'test',
    adMode: 'host',
    provider: { show: () => new Promise((resolve) => (complete = resolve)) },
  });
  const request = pending.rewarded({ placement: 'result' });
  assert.equal((await pending.rewarded({ placement: 'result' })).status, 'unavailable');
  pending.dispose();
  complete({ status: 'completed' });
  assert.equal((await request).status, 'dismissed');
  assert.equal(a.cards[0].tier, 1);
});
test('corrupt inventory cannot create invalid cards or two cards in one slot; copied publisher stays canonical', async () => {
  const a = normalizeArmory({
    cards: [null, { id: 'bad', tier: 999 }],
    equipped: ['missing'],
    receipts: { broken: { card: {} } },
  });
  assert.deepEqual(a, { cards: [], equipped: [], receipts: {} });
  const normalize = (s) => s.replaceAll('\r\n', '\n');
  assert.equal(
    normalize(await readFile(new URL('../publishing.js', import.meta.url), 'utf8')),
    normalize(
      await readFile(new URL('../../../../platforms/h5/publishing.js', import.meta.url), 'utf8'),
    ),
  );
});
