/** Normal-resource campaign replay: no state edits, debug APIs or fabricated wins.
 * Optional CAMPAIGN_SEEDS=7,42,81 and QA_OUTPUT=/tmp/bullet-garden-campaign.
 * Strategies follow identical movement/plant rules, with or without purchases.
 * The no-purchase comparison is diagnostic; the intended upgrade strategy must
 * complete the chapter. This bot is tuning evidence, not a human playtest.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { LEVELS, BOONS, SKILLS } from '../src/config.mjs';
import {
  createProfile,
  profileStats,
  purchaseUpgrade,
  settleLevel,
  isLevelUnlocked,
} from '../src/progression.mjs';
import {
  createGame,
  startGame,
  step,
  configureLoadout,
  castSkill,
  chooseUpgrade,
} from '../src/simulation.mjs';
import { terrainPointBlocked } from '../src/world.mjs';

const campaign = Object.values(LEVELS).sort((a, b) => a.order - b.order);
const seeds = (process.env.CAMPAIGN_SEEDS ?? '7,42,81').split(',').map(Number);
assert.ok(seeds.length && seeds.every(Number.isFinite), 'finite replay seeds');
const delta = 1 / 60;

function shop(profile) {
  // Balanced inexpensive progression. Locked routes naturally become available
  // through experience earned by real clears, without changing the profile XP.
  const priority = [
    'health',
    'attack',
    'fireRate',
    'seedMastery',
    'armor',
    'weaponDamage',
    'weaponRate',
    'pet',
    'weaponPierce',
  ];
  const purchases = [];
  for (let attempt = 0; attempt < 200; attempt += 1) {
    let bought = false;
    for (const id of priority) {
      const preferredLimit = {
        health: 6,
        attack: 10,
        fireRate: 8,
        seedMastery: 6,
        armor: 8,
        weaponDamage: 4,
        weaponRate: 3,
        pet: 3,
        weaponPierce: 1,
      }[id];
      if (profile.upgrades[id] >= preferredLimit) continue;
      const result = purchaseUpgrade(profile, id);
      if (result.ok) {
        purchases.push({ id, rank: result.rank, cost: result.cost });
        bought = true;
      }
    }
    if (!bought) break;
  }
  return purchases;
}

function steering(state, elapsed) {
  const level = LEVELS[state.levelId];
  const bounds = level.bounds;
  const angle = elapsed * 0.28;
  const target = {
    x: (bounds.left + bounds.right) / 2 + (bounds.right - bounds.left) * 0.379 * Math.cos(angle),
    y: (bounds.top + bounds.bottom) / 2 + (bounds.bottom - bounds.top) * 0.392 * Math.sin(angle),
  };
  let moveX = target.x - state.player.x;
  let moveY = target.y - state.player.y;
  const magnitude = Math.max(1, Math.hypot(moveX, moveY));
  moveX /= magnitude;
  moveY /= magnitude;
  const nearest = state.enemies
    .filter((entry) => entry.hp > 0)
    .reduce(
      (best, entry) =>
        !best ||
        Math.hypot(entry.x - state.player.x, entry.y - state.player.y) <
          Math.hypot(best.x - state.player.x, best.y - state.player.y)
          ? entry
          : best,
      null,
    );
  if (nearest) {
    const dx = nearest.x - state.player.x,
      dy = nearest.y - state.player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 0 && distance < 125) {
      moveX -= (dx / distance) * 2;
      moveY -= (dy / distance) * 2;
    }
    if (state.skillCooldown <= 0 && distance > 0) {
      for (let index = 0; index < state.skillSlots.length; index += 1) {
        const slot = state.skillSlots[index],
          definition = SKILLS[slot.kind];
        if (slot.energy < definition.energyMax || distance > definition.range) continue;
        const lead = slot.kind === 'blast' ? 30 : 0;
        castSkill(
          state,
          { x: nearest.x - (dx / distance) * lead, y: nearest.y - (dy / distance) * lead },
          index,
        );
      }
    }
  }
  const heading = Math.atan2(moveY, moveX);
  // Inspect the actual map to detour. This uses observations only and does not
  // move entities or alter collision state to help the bot through walls.
  for (const offset of [0, 0.4, -0.4, 0.8, -0.8, 1.25, -1.25, 1.7, -1.7, Math.PI]) {
    const x = Math.cos(heading + offset),
      y = Math.sin(heading + offset);
    const forecastX = state.player.x + x * 65,
      forecastY = state.player.y + y * 65;
    if (
      forecastX < bounds.left + state.player.radius ||
      forecastX > bounds.right - state.player.radius ||
      forecastY < bounds.top + state.player.radius ||
      forecastY > bounds.bottom - state.player.radius
    )
      continue;
    if (!terrainPointBlocked(state, forecastX, forecastY, state.player.radius))
      return { moveX: x, moveY: y, autoFire: true };
  }
  return { moveX, moveY, autoFire: true };
}

function challenge(seed, spendCoins) {
  const profile = createProfile();
  const runs = [];
  for (const level of campaign) {
    assert.equal(
      isLevelUnlocked(profile, level.id),
      true,
      `${level.id} unlocks through preceding clears`,
    );
    const purchases = spendCoins ? shop(profile) : [];
    const stats = profileStats(profile);
    const state = createGame(level.id, seed, profile);
    configureLoadout(state, { skills: ['blast', 'laser'] });
    state.runId = `campaign-${seed}-${spendCoins ? 'growth' : 'base'}-${level.id}`;
    startGame(state);
    let frames = 0,
      maxEnemies = 0,
      maxPlants = 0,
      maxBullets = 0;
    while (
      ['playing', 'upgrade'].includes(state.phase) &&
      frames < (level.duration + 150) / delta
    ) {
      if (state.phase === 'upgrade') {
        const preferred = [
          ...(state.player.hp < state.player.maxHp * 0.55 ? ['wild-heart', 'boon-sunflower'] : []),
          'boon-shrub',
          'boon-stormreed',
          'boon-poison',
          'boon-frost',
          'boon-trench',
          'multishot',
          'attack-power',
          'attack-speed',
          'burst',
          'boon-bloomturret',
          'wild-heart',
          'split-shot',
          'explosive-shot',
          'energy-cycle',
          'terrain-heart',
        ];
        const choice =
          preferred.find((id) => state.upgradeChoices.includes(id)) ?? state.upgradeChoices[0];
        assert.equal(chooseUpgrade(state, choice), true);
        continue;
      }
      step(state, delta, steering(state, frames * delta));
      maxEnemies = Math.max(maxEnemies, state.enemies.length);
      maxPlants = Math.max(maxPlants, state.plants.length);
      maxBullets = Math.max(maxBullets, state.bullets.length);
      assert.ok(state.enemies.length <= level.spawn.maxEnemies, `${level.id} enemies stay bounded`);
      assert.ok(state.plants.length <= state.plantCap, `${level.id} plants stay bounded`);
      assert.ok(state.bullets.length <= 120, `${level.id} projectiles stay bounded`);
      assert.ok(state.skillEffects.length <= 12, `${level.id} skills stay bounded`);
      assert.ok(state.skillSlots.every((slot) => slot.energy >= 0 && slot.energy <= 100));
      assert.ok(
        state.plants.every((plant) => state.boons.some((id) => BOONS[id].kind === plant.kind)),
        'terrain requires a selected XP boon',
      );
      assert.ok(
        Number.isFinite(state.player.hp) &&
          Number.isFinite(state.player.x) &&
          Number.isFinite(state.player.y),
      );
      frames += 1;
    }
    const settlement = ['won', 'lost'].includes(state.phase) ? settleLevel(profile, state) : null;
    if (settlement) assert.equal(settlement.ok, true);
    const run = {
      strategy: spendCoins ? 'earned-growth' : 'no-permanent-purchases',
      seed,
      level: level.id,
      order: level.order,
      result: state.phase,
      seconds: Math.round(frames * delta),
      hp: Math.round(state.player.hp),
      kills: state.kills,
      plants: state.stats.autoPlants,
      plantKills: state.stats.plantKills,
      petKills: state.stats.petKills,
      skillCasts: state.stats.skillCasts,
      skillDamage: Math.round(state.stats.skillDamage),
      encounter: state.encounter,
      maxEnemies,
      maxPlants,
      maxBullets,
      purchases,
      startingStats: stats,
      reward: settlement?.reward,
      walletAfter: profile.coins,
      playerLevelAfter: profileStats(profile).level,
    };
    runs.push(run);
    console.log(
      `${run.strategy} seed=${seed} ${level.id}: ${run.result}, ${run.seconds}s, hp=${run.hp}, kills=${run.kills}`,
    );
    if (state.phase !== 'won') break;
  }
  return {
    seed,
    strategy: spendCoins ? 'earned-growth' : 'no-permanent-purchases',
    completed: profile.completed.length,
    finalProfile: profile,
    runs,
  };
}

const comparisons = seeds.map((seed) => challenge(seed, false));
const upgraded = seeds.map((seed) => challenge(seed, true));
const report = {
  date: new Date().toISOString(),
  policy:
    'normal player HP, resources, timing and enemies; only public game/progression actions; fixed-seed observed-map steering',
  contentCount: campaign.length,
  seeds,
  comparisons,
  upgraded,
};
const output = process.env.QA_OUTPUT ?? '/tmp/bullet-garden-campaign';
await mkdir(output, { recursive: true });
await writeFile(`${output}/balance-report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Evidence: ${output}/balance-report.json`);
for (const replay of upgraded)
  assert.equal(
    replay.completed,
    campaign.length,
    `earned growth should complete all ${campaign.length} levels for seed ${replay.seed}`,
  );
