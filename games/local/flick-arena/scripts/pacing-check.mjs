import assert from 'node:assert/strict';
import { createMatch, shoot, step, chooseBot, shotDistance, physics } from '../src/core.mjs';
import { layouts } from '../src/layouts.mjs';
function finish(s) {
  let steps = 0;
  while (steps < 1000 && ['moving', 'shrinking'].includes(s.phase)) {
    step(s);
    steps++;
  }
  assert(!['moving', 'shrinking'].includes(s.phase));
  return steps * physics.step;
}
function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * ratio)];
}
const result = {
  matches: 0,
  wins: 0,
  draws: 0,
  openingHits: 0,
  openingOuts: 0,
  totalShots: [],
  playerShots: [],
  rounds: [],
  movingSeconds: [],
  shrinkSeconds: [],
  estimatedSeconds: [],
  power: {},
};
for (const layout of layouts)
  for (const target of [1, 2]) {
    const s = createMatch(layout, 1),
      d = s.discs[target],
      a = s.discs[0];
    shoot(s, d.x - a.x, d.y - a.y, 1);
    finish(s);
    result.openingHits += s.events.filter((e) => e.type === 'hit').length;
    result.openingOuts += s.discs.filter((d) => !d.alive).length;
  }
for (const layout of layouts)
  for (let seed = 1; seed <= 60; seed++) {
    const s = createMatch(layout, seed);
    let movingSeconds = 0,
      settlingSeconds = 0;
    for (let shot = 0; shot < 120 && s.phase !== 'over'; shot++) {
      const b = chooseBot(s);
      result.power[b.power] = (result.power[b.power] ?? 0) + 1;
      shoot(s, b.x, b.y, b.power);
      settlingSeconds += finish(s);
      movingSeconds += s.elapsed;
      s.events.length = 0;
    }
    assert.equal(s.phase, 'over', `${layout.id}:${seed}`);
    result.matches++;
    result.wins += Number(s.winner === 0);
    result.draws += Number(s.winner === -1);
    result.totalShots.push(s.shots);
    result.playerShots.push(s.playerShots);
    result.rounds.push(s.turn);
    result.movingSeconds.push(movingSeconds);
    result.shrinkSeconds.push(settlingSeconds - movingSeconds);
    // Browser waits 1.25 s before each bot shot; assume the player spends 2 s aiming.
    result.estimatedSeconds.push(
      settlingSeconds + (s.shots - s.playerShots) * 1.25 + s.playerShots * 2,
    );
  }
const summary = (values) => ({
  min: Math.min(...values),
  p10: percentile(values, 0.1),
  p50: percentile(values, 0.5),
  p90: percentile(values, 0.9),
  max: Math.max(...values),
});
console.log(
  JSON.stringify(
    {
      matches: result.matches,
      wins: result.wins,
      draws: result.draws,
      fullShotDistance: shotDistance(1),
      openingHits: result.openingHits,
      openingOuts: result.openingOuts,
      totalShots: summary(result.totalShots),
      playerShots: summary(result.playerShots),
      rounds: summary(result.rounds),
      movingSeconds: summary(result.movingSeconds),
      shrinkSeconds: summary(result.shrinkSeconds),
      estimatedGameplaySeconds: summary(result.estimatedSeconds),
      timingAssumptions: {
        botWait: 1.25,
        playerAim: 2,
        shrink: physics.shrinkDuration,
        excludes: 'matching and result transitions; browser wall time measured separately',
      },
      playersWith4To8Attempts: result.playerShots.filter((n) => n >= 4 && n <= 8).length,
      power: result.power,
    },
    null,
    2,
  ),
);
const evasions = [];
for (const layout of layouts)
  for (let seed = 1; seed <= 20; seed++) {
    const s = createMatch(layout, seed);
    for (let shot = 0; shot < 120 && s.phase !== 'over'; shot++) {
      let b;
      const a = s.discs[0],
        distance = Math.hypot(a.x, a.y);
      if (s.active === 0)
        b = {
          x: distance > 0.001 ? -a.x : 1,
          y: distance > 0.001 ? -a.y : 0,
          power: Math.max(
            0.08,
            Math.min(1, Math.sqrt(2 * physics.friction * distance) / physics.maxSpeed),
          ),
        };
      else b = chooseBot(s);
      shoot(s, b.x, b.y, b.power);
      finish(s);
      s.events.length = 0;
    }
    assert.equal(s.phase, 'over', `escape:${layout.id}:${seed}`);
    evasions.push(s.shots);
  }
console.log(
  JSON.stringify({ fleeCenterMatches: evasions.length, totalShots: summary(evasions) }, null, 2),
);
