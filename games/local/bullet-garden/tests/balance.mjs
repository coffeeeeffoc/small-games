/** Normal-health, movement-only replays; no manual aim, casts or state cheats.
 * Different builds consume RNG differently: compare viability, not paired causal effects.
 */
import assert from 'node:assert/strict';
import { createGame, startGame, step, chooseUpgrade } from '../src/simulation.mjs';

const REPLAY_SEEDS = [7, 42, 81];
const BUILDS = {
  weapon: [
    'multishot',
    'attack-power',
    'attack-speed',
    'burst',
    'split-shot',
    'explosive-shot',
    'wild-heart',
  ],
  'terrain-only': [
    'thorn-heart',
    'mushroom-heart',
    'seed-cycle',
    'terrain-duration',
    'ice-heart',
    'wild-heart',
    'multishot',
  ],
  garden: [
    'thorn-heart',
    'mushroom-heart',
    'seed-cycle',
    'terrain-duration',
    'ice-heart',
    'wild-heart',
    'attack-power',
  ],
  hybrid: [
    'multishot',
    'thorn-heart',
    'attack-power',
    'mushroom-heart',
    'fire-shot',
    'split-shot',
    'wild-heart',
  ],
};
function replay(seed, build) {
  const state = createGame('ruins', seed);
  startGame(state);
  let frame = 0,
    firstPlant = null,
    maxBullets = 0,
    maxPlants = 0;
  const choices = [];
  while (['playing', 'upgrade'].includes(state.phase) && frame < 19000) {
    if (state.phase === 'upgrade') {
      // Extra primary misses fuel the same six-miss rule. Keep the terrain-only
      // baseline visible, and take one spread rank for the complete garden build.
      const needsSpread = build === 'garden' && !state.upgrades.includes('multishot');
      const preferred = needsSpread ? ['multishot', ...BUILDS[build]] : BUILDS[build];
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
    }
    step(state, 1 / 60, { moveX, moveY, autoFire: true });
    if (firstPlant === null && state.stats.autoPlants > 0)
      firstPlant = Number(state.time.toFixed(1));
    maxPlants = Math.max(maxPlants, state.plants.length);
    maxBullets = Math.max(maxBullets, state.bullets.length);
    assert.ok(state.plants.length <= state.plantCap, 'terrain stays bounded');
    assert.ok(state.enemies.length <= 48, 'spawns stay bounded');
    assert.ok(state.bullets.length <= 120, 'derived bullets stay bounded');
    assert.ok(Number.isFinite(state.player.hp));
    frame += 1;
  }
  assert.ok(['won', 'lost'].includes(state.phase), 'a replay finishes naturally');
  return {
    build,
    seed,
    result: state.phase,
    seconds: Math.round(state.time),
    hp: state.player.hp,
    kills: state.kills,
    upgrades: choices.length,
    firstUpgrade: choices[0]?.time ?? null,
    firstPlant,
    plants: state.stats.autoPlants,
    misses: state.stats.misses,
    terrainKills: state.stats.plantKills,
    terrainDamage: Math.round(state.stats.terrainDamage),
    maxPlants,
    maxBullets,
    choices,
  };
}

const runs = Object.keys(BUILDS).flatMap((build) =>
  REPLAY_SEEDS.map((seed) => replay(seed, build)),
);
console.table(runs.map(({ choices, ...summary }) => summary));
if (process.env.BALANCE_DETAILS) console.log(JSON.stringify(runs, null, 2));
for (const run of runs) {
  assert.ok(run.plants > 0, `automatic terrain participates in ${run.build}/${run.seed}`);
  assert.ok(run.upgrades >= 1, `combat earns an upgrade in ${run.build}/${run.seed}`);
  assert.ok(run.terrainDamage > 0, `terrain damages enemies in ${run.build}/${run.seed}`);
}
console.log(
  'Twelve deterministic normal-health replays passed lifecycle and growth checks; results above report viability.',
);
