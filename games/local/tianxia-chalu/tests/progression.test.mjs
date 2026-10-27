import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCareer,
  getRank,
  applyCareerResult,
  careerWinRate,
} from '../src/core/progression.mjs';

test('all 45 military ranks have reachable exact thresholds and bounded progress', () => {
  let xp = 0;
  for (let level = 1; level <= 45; level++) {
    const rank = getRank(xp);
    assert.equal(rank.level, level);
    assert.equal(rank.division, ((level - 1) % 5) + 1);
    if (level > 1) assert.equal(getRank(xp - 1).level, level - 1);
    if (level < 45) xp += rank.nextLevelXp;
  }
  assert.equal(getRank(xp + 1000000).name, '传说 5');
  assert.equal(getRank(xp + 1000000).progress, 1);
  assert.equal(getRank(NaN).level, 1);
});
test('PVE, ranked, surrender and practice awards are separate, immutable and idempotent', () => {
  const original = normalizeCareer(null);
  const win = applyCareerResult(original, { id: 'ranked-1', mode: 'matched', outcome: 'victory' });
  assert.equal(original.xp, 0);
  assert.equal(win.gained, 100);
  assert.equal(win.promoted, true);
  assert.equal(win.rank.name, '新卒 2');
  assert.deepEqual(win.career.matched, { games: 1, wins: 1, losses: 0, draws: 0 });
  const duplicate = applyCareerResult(win.career, {
    id: 'ranked-1',
    mode: 'matched',
    outcome: 'victory',
  });
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual(duplicate.career, win.career);
  const loss = applyCareerResult(win.career, {
    id: 'ranked-2',
    mode: 'matched',
    outcome: 'defeat',
  });
  assert.equal(loss.gained, 35);
  assert.equal(careerWinRate(loss.career), 0.5);
  const surrender = applyCareerResult(loss.career, {
    id: 'ranked-3',
    mode: 'matched',
    outcome: 'defeat',
    reason: 'abandoned',
  });
  assert.equal(surrender.gained, 0);
  assert.equal(surrender.career.matched.losses, 2);
  const pve = applyCareerResult(surrender.career, { id: 'pve-1', mode: 'pve', outcome: 'victory' });
  assert.equal(pve.gained, 20);
  assert.equal(pve.career.matched.games, 3);
  const practice = applyCareerResult(pve.career, {
    id: 'test',
    mode: 'pve',
    outcome: 'victory',
    practice: true,
  });
  assert.deepEqual(practice.career, pve.career);
  assert.equal(careerWinRate(original), null);
});
test('malformed old careers migrate without fabricated games or invalid arithmetic', () => {
  const career = normalizeCareer({
    xp: Infinity,
    matched: { games: 999, wins: 3, losses: -2, draws: NaN },
    recent: {},
    settledIds: [null, 'a', 'a'],
  });
  assert.equal(career.xp, 0);
  assert.deepEqual(career.matched, { games: 3, wins: 3, losses: 0, draws: 0 });
  assert.deepEqual(career.settledIds, ['a']);
  assert.throws(() => applyCareerResult(career, { id: 'x', mode: 'unknown', outcome: 'victory' }));
});
