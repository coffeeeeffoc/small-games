import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chapters, levels, getLevel, validateLevels, evaluateChallenges } from '../src/levels.mjs';
import {
  createMatch,
  shoot,
  step,
  skipTurn,
  chooseBot,
  previewAim,
  previewShot,
  outsideArena,
  physics,
} from '../src/core.mjs';
import {
  readSave,
  settleCampaign,
  isLevelUnlocked,
  nextLevel,
  totalStars,
} from '../src/progress.mjs';
function finish(state) {
  for (let frame = 0; frame < 1200 && ['moving', 'shrinking'].includes(state.phase); frame++)
    step(state);
  assert(!['moving', 'shrinking'].includes(state.phase), 'shot must stop');
}
function layout(extra = {}) {
  return {
    id: 'fixture',
    points: [
      [-90, 0],
      [0, 100],
    ],
    ...extra,
  };
}

test('20 stable levels form four reachable chapters with valid terrain and distinct milestones', () => {
  assert.equal(validateLevels(levels), levels);
  assert.equal(levels.length, 20);
  assert.deepEqual(
    chapters.map((chapter) => levels.filter((level) => level.chapter === chapter.id).length),
    [5, 5, 5, 5],
  );
  assert(levels.slice(0, 5).every((level) => level.points.length === 2));
  assert(levels.slice(5, 10).every((level) => level.points.length === 3));
  assert.equal(levels[10].obstacles.length, 1);
  assert.equal(levels[12].ice.length, 1);
  assert.equal(levels[15].gaps.length, 1);
  assert.deepEqual(
    levels.filter((level) => level.boss).map((level) => level.index),
    [5, 10, 15, 20],
  );
  assert.equal(getLevel(0), levels[0]);
  assert.equal(getLevel('summit-master'), levels[19]);
  assert.equal(getLevel('missing'), null);
  for (const change of [
    (copy) => {
      copy[1].id = copy[0].id;
    },
    (copy) => {
      copy[1].requires = copy[19].id;
    },
    (copy) => {
      copy[0].points[0] = [200, 0];
    },
    (copy) => {
      copy[0].bots[1].skill = 2;
    },
    (copy) => {
      copy[12].ice[0].friction = 0;
    },
    (copy) => {
      copy[10].obstacles[0].radius = -1;
    },
    (copy) => {
      copy[0].challenges[0].type = 'unknown';
    },
  ]) {
    const copy = structuredClone(levels);
    change(copy);
    assert.throws(() => validateLevels(copy));
  }
});

test('rounds follow rotated first actor, timeout skips, and fallen first seats do not move contraction early', () => {
  const state = createMatch(
    layout({
      points: [
        [-80, -60],
        [80, -60],
        [80, 60],
        [-80, 60],
      ],
      rules: { safeRounds: 1 },
    }),
    10,
    { order: [0, 1, 2, 3], startActor: 2 },
  );
  assert.deepEqual(state.order, [2, 3, 0, 1]);
  for (const actor of [2, 3, 0]) {
    assert.equal(state.active, actor);
    assert(skipTurn(state));
    assert.equal(state.turn, 1);
    assert.equal(state.phase, 'aim');
  }
  assert.equal(state.active, 1);
  assert(skipTurn(state));
  assert.equal(state.turn, 2);
  assert.equal(state.phase, 'shrinking');
  assert.equal(skipTurn(state), false);
  finish(state);
  assert.equal(state.active, 2);
  const eliminated = createMatch(
    layout({
      points: [
        [-80, -60],
        [80, -60],
        [0, 90],
      ],
      rules: { safeRounds: 1 },
    }),
    10,
    { startActor: 1 },
  );
  eliminated.discs[1].alive = false;
  eliminated.active = 2;
  skipTurn(eliminated);
  assert.equal(eliminated.turn, 1);
  assert.equal(eliminated.active, 0);
  skipTurn(eliminated);
  assert.equal(eliminated.phase, 'shrinking');
  finish(eliminated);
  assert.equal(eliminated.active, 2);
  assert.throws(() => createMatch(layout(), 1, { order: [0, 0] }));
  assert.throws(() => createMatch(layout(), 1, { startActor: 4 }));
});

test('ice increases travel, pillars reflect motion, and terrain-aware guide matches simulation without mutations', () => {
  const normal = createMatch(layout());
  const icy = createMatch(layout({ ice: [{ x: -45, y: 0, radius: 100, friction: 0.38 }] }));
  const before = structuredClone(icy);
  const guide = previewAim(icy, 1, 0, 0.5);
  assert.deepEqual(icy, before);
  for (const state of [normal, icy]) {
    shoot(state, 1, 0, 0.5);
    finish(state);
  }
  assert(icy.discs[0].x > normal.discs[0].x + 35);
  assert(Math.abs(guide.end.x - icy.discs[0].x) < 1e-9);
  const bank = createMatch(layout({ obstacles: [{ x: 0, y: 0, radius: 18 }] }));
  const bankGuide = previewAim(bank, 1, 0, 1);
  const original = structuredClone(bank);
  const result = previewShot(bank, 0, 1);
  assert.deepEqual(bank, original);
  shoot(bank, 1, 0, 1);
  finish(bank);
  assert(bank.discs[0].x < -physics.puck - 18);
  assert.equal(bank.stats.pillar[0], 1);
  assert(bank.events.some((event) => event.kind === 'pillar'));
  assert(Math.abs(bankGuide.end.x - bank.discs[0].x) < 1e-9);
  assert.equal(result.discs[0].x, bank.discs[0].x);
});

test('clipped edges preserve partial overhang and warn when the travel guide exits', () => {
  const state = createMatch(layout({ gaps: [{ angle: 0, depth: 60 }] }));
  assert.equal(outsideArena(state, 111.99, 0), false);
  assert.equal(outsideArena(state, 112.01, 0), true);
  state.radius = 140;
  assert.equal(outsideArena(state, 94.01, 0), true);
  state.radius = 158;
  state.discs[0].x = 85;
  assert(previewAim(state, 1, 0, 0.7).out);
  shoot(state, 1, 0, 0.7);
  finish(state);
  assert.equal(state.discs[0].alive, false);
  assert.equal(state.winner, 1);
});

test('falls at different instants of one shot or contraction stay one tied elimination batch', () => {
  const state = createMatch(
    layout({
      points: [
        [0, 0],
        [170, 0],
        [-171, 0],
      ],
    }),
  );
  state.phase = 'moving';
  state.shots = 1;
  state.lastShot = { actor: 0 };
  Object.assign(state.discs[1], { vx: 220 });
  Object.assign(state.discs[2], { vx: -220 });
  step(state);
  assert.equal(state.discs[2].alive, false);
  assert.equal(state.discs[1].alive, true);
  finish(state);
  assert.equal(state.winner, 0);
  assert.deepEqual(
    state.eliminationBatches.map((batch) => [...batch.ids].sort()),
    [[1, 2]],
  );
  assert.equal(state.stats.combo[0], 2);
  const ring = createMatch(
    layout({
      points: [
        [0, 0],
        [161, 0],
        [-162, 0],
      ],
    }),
  );
  ring.phase = 'shrinking';
  ring.turn = 6;
  ring.shrink = { fromRadius: 158, targetRadius: 140, progress: 0, duration: 0.75, nextActive: 0 };
  finish(ring);
  assert.equal(ring.eliminationBatches.length, 1);
  assert.equal(ring.eliminationBatches[0].reason, 'ring');
  assert.deepEqual([...ring.eliminationBatches[0].ids].sort(), [1, 2]);
});

test('legacy saves migrate without lost settings; wins unlock all levels sequentially and settle once', () => {
  let save = readSave({ version: 1, played: 9, wins: 4, sound: false });
  assert.equal(save.played, 9);
  assert.equal(save.wins, 4);
  assert.equal(save.sound, false);
  assert.equal(readSave({ ...save, theme: 'moon' }).theme, 'moon');
  assert.equal(readSave({ ...save, theme: 'unknown' }).theme, 'wood');
  assert.equal(Object.hasOwn(save, 'theme'), false);
  assert.equal(nextLevel(save).id, levels[0].id);
  assert.equal(isLevelUnlocked(save, levels[1].id), false);
  for (const level of levels) {
    assert(isLevelUnlocked(save, level.id));
    const state = createMatch(level, 100 + level.index);
    state.phase = 'over';
    state.winner = 0;
    state.playerShots = 3;
    state.shots = 7;
    Object.assign(state.discs[0], { x: 0, y: 0 });
    state.stats.hits[0] = 5;
    state.stats.pillar[0] = 1;
    state.stats.combo[0] = 2;
    assert.equal(evaluateChallenges(level, state).stars, 3);
    save = settleCampaign(save, level, state);
    const again = settleCampaign(save, level, structuredClone(state));
    assert.equal(again, save);
    save = readSave(JSON.parse(JSON.stringify(save)));
  }
  assert.equal(save.played, 29);
  assert.equal(save.wins, 24);
  assert.equal(totalStars(save), 60);
  assert.equal(nextLevel(save).id, levels[19].id);
});

test('challenge stars accumulate independently across victories; losses and unfinished matches cannot unlock', () => {
  let save = readSave(null);
  const level = levels[0],
    first = createMatch(level, 1);
  assert.equal(settleCampaign(save, level, first), save);
  first.phase = 'over';
  first.winner = 1;
  first.shots = 8;
  save = settleCampaign(save, level, first);
  assert.equal(totalStars(save), 0);
  assert.equal(isLevelUnlocked(save, 1), false);
  const fast = createMatch(level, 2);
  fast.phase = 'over';
  fast.winner = 0;
  fast.playerShots = 2;
  fast.shots = 4;
  save = settleCampaign(save, level, fast);
  assert.equal(totalStars(save), 2);
  const contact = createMatch(level, 3);
  contact.phase = 'over';
  contact.winner = 0;
  contact.playerShots = 15;
  contact.shots = 30;
  contact.stats.hits[0] = 2;
  save = settleCampaign(save, level, contact);
  assert.equal(totalStars(save), 3);
  assert.equal(save.campaign.levels[level.id].bestShots, 2);
  assert.equal(save.played, 3);
  const corrupt = readSave({
    ...save,
    campaign: {
      levels: {
        ...save.campaign.levels,
        bogus: { stars: 999 },
        [level.id]: { stars: 999, goals: ['swift', 'swift', 'bogus'], bestShots: -1 },
      },
      settled: [null],
    },
  });
  assert.equal(totalStars(corrupt), 2);
  assert.equal(corrupt.campaign.levels[level.id].bestShots, null);
});

test('every campaign level completes through shared bot physics across deterministic seeds', () => {
  const summary = [];
  for (const level of levels) {
    let wins = 0,
      maxShots = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const state = createMatch(level, seed);
      for (let turn = 0; turn < 100 && state.phase !== 'over'; turn++) {
        const command = chooseBot(state);
        assert(command);
        shoot(state, command.x, command.y, command.power);
        finish(state);
        state.events.length = 0;
      }
      assert.equal(state.phase, 'over', `${level.id}:${seed} stalled`);
      assert(state.shots > 1);
      maxShots = Math.max(maxShots, state.shots);
      if (state.winner === 0) wins++;
    }
    summary.push({ id: level.id, wins, maxShots });
    assert(wins > 0, `${level.id} must be winnable in sampled expert play`);
  }
  console.log('campaign simulation (12 seeds per level):', JSON.stringify(summary));
});
