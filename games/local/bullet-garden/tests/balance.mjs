/** Normal-health deterministic replays. All choices and casts use the public API.
 * Different loadouts consume RNG differently; these are viability smoke runs.
 */
import assert from 'node:assert/strict';
import {
  createGame,
  configureLoadout,
  startGame,
  step,
  chooseUpgrade,
  castSkill,
} from '../src/simulation.mjs';

const REPLAY_SEEDS = [7, 42, 81];
const BUILDS = {
  shrub: ['blast', 'laser'],
  trench: ['cart', 'gale'],
  frost: ['horse', 'blast'],
  poison: ['laser', 'gale'],
};

function replay(seed, boon) {
  const state = createGame('ruins', seed);
  configureLoadout(state, { boon, skills: BUILDS[boon] });
  startGame(state);
  let frame = 0,
    firstPlant = null,
    maxBullets = 0,
    maxPlants = 0,
    maxEnemies = 0,
    maxEffects = 0;
  const choices = [];
  while (['playing', 'upgrade'].includes(state.phase) && frame < 19000) {
    if (state.phase === 'upgrade') {
      const preferred = [
        'boon-shrub',
        'boon-trench',
        'boon-frost',
        'boon-poison',
        'multishot',
        'attack-power',
        'attack-speed',
        'burst',
        'wild-heart',
        'split-shot',
        'explosive-shot',
        'energy-cycle',
        'terrain-heart',
      ];
      const selected =
        preferred.find((key) => state.upgradeChoices.includes(key)) ?? state.upgradeChoices[0];
      assert.ok(chooseUpgrade(state, selected));
      choices.push({ time: Math.round(state.time), selected });
      continue;
    }
    const angle = state.time * 0.28;
    const target = { x: 720 + 470 * Math.cos(angle), y: 450 + 235 * Math.sin(angle) };
    let moveX = target.x - state.player.x,
      moveY = target.y - state.player.y;
    const length = Math.max(1, Math.hypot(moveX, moveY));
    moveX /= length;
    moveY /= length;
    const nearest = [...state.enemies].sort(
      (a, b) =>
        Math.hypot(a.x - state.player.x, a.y - state.player.y) -
        Math.hypot(b.x - state.player.x, b.y - state.player.y),
    )[0];
    if (nearest) {
      const dx = nearest.x - state.player.x,
        dy = nearest.y - state.player.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0 && distance < 125) {
        moveX -= (dx / distance) * 2;
        moveY -= (dy / distance) * 2;
      }
      if (distance > 0 && distance < 500) {
        for (let index = 0; index < state.skillSlots.length; index += 1) {
          if (state.skillSlots[index].energy < 100) continue;
          const lead = state.skillSlots[index].kind === 'blast' ? 30 : 0;
          castSkill(
            state,
            { x: nearest.x - (dx / distance) * lead, y: nearest.y - (dy / distance) * lead },
            index,
          );
        }
      }
    }
    step(state, 1 / 60, { moveX, moveY, autoFire: true });
    if (firstPlant === null && state.stats.autoPlants > 0)
      firstPlant = Number(state.time.toFixed(1));
    maxPlants = Math.max(maxPlants, state.plants.length);
    maxBullets = Math.max(maxBullets, state.bullets.length);
    maxEnemies = Math.max(maxEnemies, state.enemies.length);
    maxEffects = Math.max(maxEffects, state.skillEffects.length);
    assert.ok(state.plants.length <= state.plantCap);
    assert.ok(state.enemies.length <= 48);
    assert.ok(state.bullets.length <= 120);
    assert.ok(state.skillEffects.length <= 12);
    assert.ok(state.telegraphs.length <= 40);
    assert.ok(state.skillSlots.every((slot) => slot.energy >= 0 && slot.energy <= 100));
    assert.ok(Number.isFinite(state.player.hp));
    frame += 1;
  }
  assert.ok(['won', 'lost'].includes(state.phase), 'a replay finishes naturally');
  return {
    boon,
    skills: BUILDS[boon].join('/'),
    seed,
    result: state.phase,
    seconds: Math.round(state.time),
    hp: state.player.hp,
    kills: state.kills,
    upgrades: choices.length,
    firstUpgrade: choices[0]?.time ?? null,
    firstPlant,
    plants: state.stats.autoPlants,
    terrainKills: state.stats.plantKills,
    terrainDamage: Math.round(state.stats.terrainDamage),
    skillCasts: state.stats.skillCasts,
    skillKills: state.stats.skillKills,
    skillDamage: Math.round(state.stats.skillDamage),
    maxPlants,
    maxBullets,
    maxEnemies,
    maxEffects,
    choices,
  };
}

const runs = Object.keys(BUILDS).flatMap((build) =>
  REPLAY_SEEDS.map((seed) => replay(seed, build)),
);
console.table(runs.map(({ choices, ...summary }) => summary));
if (process.env.BALANCE_DETAILS) console.log(JSON.stringify(runs, null, 2));
for (const run of runs) {
  assert.ok(run.plants > 0);
  assert.ok(run.upgrades >= 1);
  assert.ok(run.skillCasts > 0 && run.skillDamage > 0);
  assert.equal(
    run.result,
    'won',
    `${run.boon}/${run.seed} should support a natural-health victory`,
  );
}
console.log(
  'Twelve normal-health five-minute victories cover all four boons and five manually released skills.',
);
