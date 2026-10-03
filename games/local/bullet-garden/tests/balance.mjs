/**
 * Reproducible five-minute balance smoke, using normal player health/resources.
 * Run: node games/local/bullet-garden/tests/balance.mjs
 *
 * The bot circles the courtyard and steers away from nearby enemies. The garden
 * policy adds thorn patches before pursuers, then places timed mushrooms nearby.
 * This is tuning evidence, not a substitute for observing real players. Cosmetic
 * and combat events share deterministic randomness, so strategies can encounter
 * different spawn/upgrade sequences despite starting from the same initial seed.
 */
import assert from 'node:assert/strict';
import {
  createGame,
  startGame,
  step,
  castSeed,
  selectSeed,
  chooseUpgrade,
} from '../src/simulation.mjs';

const REPLAY_SEEDS = [7, 42, 81];
const STEP = 1 / 60;

function replay(seed, useTerrain) {
  const state = createGame('ruins', seed);
  startGame(state);
  let frame = 0;
  while (['playing', 'upgrade'].includes(state.phase) && frame < 20000) {
    if (state.phase === 'upgrade') {
      const preferred = ['bloom-shot', 'wild-heart', 'mushroom-heart', 'thorn-heart'];
      chooseUpgrade(
        state,
        preferred.find((id) => state.upgradeChoices.includes(id)) ?? state.upgradeChoices[0],
      );
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
      (first, second) =>
        Math.hypot(first.x - state.player.x, first.y - state.player.y) -
        Math.hypot(second.x - state.player.x, second.y - state.player.y),
    )[0];

    if (nearest) {
      const dx = nearest.x - state.player.x,
        dy = nearest.y - state.player.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0 && distance < 125) {
        moveX -= (dx / distance) * 2;
        moveY -= (dy / distance) * 2;
      }
      if (useTerrain && state.seedCooldown <= 0 && distance < 480 && distance > 95) {
        const existingThorn = state.plants.some(
          (plant) =>
            plant.kind === 'thorn' && Math.hypot(plant.x - nearest.x, plant.y - nearest.y) < 170,
        );
        const kind = existingThorn ? 'mushroom' : 'thorn';
        selectSeed(state, kind);
        const lead = kind === 'thorn' ? 70 : Math.min(160, distance - 55);
        castSeed(state, {
          x: nearest.x - (dx / distance) * lead,
          y: nearest.y - (dy / distance) * lead,
        });
      }
    }

    step(state, STEP, { moveX, moveY, autoFire: true });
    assert.ok(state.plants.length <= state.plantCap, 'terrain must stay bounded during a real run');
    assert.ok(state.enemies.length <= 48, 'spawns must remain bounded');
    frame += 1;
  }

  assert.ok(['won', 'lost'].includes(state.phase), 'a replay must finish naturally');
  return {
    strategy: useTerrain ? 'plant-ahead' : 'ordinary-fire',
    seed,
    result: state.phase,
    seconds: Math.round(state.time),
    hp: state.player.hp,
    kills: state.kills,
    plants: state.stats.plantsGrown,
    terrainKills: state.stats.plantKills,
    terrainDamage: Math.round(state.stats.terrainDamage),
  };
}

const ordinary = REPLAY_SEEDS.map((seed) => replay(seed, false));
const gardening = REPLAY_SEEDS.map((seed) => replay(seed, true));
for (const run of gardening) {
  assert.equal(run.result, 'won', `placing ahead must be viable for seed ${run.seed}`);
  assert.ok(run.terrainKills >= 20, 'terrain should materially contribute to victory');
  assert.ok(run.terrainDamage >= 2000, 'planted terrain should do substantial damage');
}
assert.ok(
  gardening.filter((run) => run.result === 'won').length >
    ordinary.filter((run) => run.result === 'won').length,
  'the simple placement policy should improve these replay outcomes',
);

console.table([...ordinary, ...gardening]);
console.log(
  'Balance smoke passed: three natural-health garden victories with meaningful terrain damage.',
);
