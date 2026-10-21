import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createGame, startGame, step, chooseUpgrade } from '../src/simulation.mjs';
import { createProfile } from '../src/progression.mjs';
import { LEVELS } from '../src/config.mjs';
const report = JSON.parse(
  await readFile(
    new URL(
      '../docs/design/cocos-mobile-2026-10-22/actual/campaign/balance-report.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const history = report.upgraded.find((x) => x.seed === 42).runs;
const results = [];
for (const levelId of ['meadow', 'hollow']) {
  const index = history.findIndex((x) => x.levelId === levelId || x.id === levelId);
  // Campaign replay records stable id as `level`; accept only that explicit schema below.
  const at = index >= 0 ? index : history.findIndex((x) => x.level === levelId);
  assert(at >= 0, 'recorded campaign chapter');
  const upgrades = {};
  for (const run of history.slice(0, at + 1))
    for (const buy of run.purchases) upgrades[buy.id] = buy.rank;
  const profile = createProfile({
    xp: history.slice(0, at).reduce((n, x) => n + x.reward.xp, 0),
    upgrades,
    completed: history.slice(0, at).map((x) => x.levelId || x.id || x.level),
  });
  for (const active of [false, true]) {
    const s = startGame(createGame(levelId, 42, profile)),
      bounds = LEVELS[levelId].bounds;
    let visible = 0,
      total = 0;
    for (
      let frames = 0;
      frames < (s.duration + 100) * 60 && ['playing', 'upgrade'].includes(s.phase);
      frames++
    ) {
      if (s.phase === 'upgrade') {
        const id =
          ['attack-power', 'attack-speed', 'boon-shrub', 'wild-heart'].find((x) =>
            s.upgradeChoices.includes(x),
          ) || s.upgradeChoices[0];
        chooseUpgrade(s, id);
      }
      const angle = s.time * 0.5;
      let x = (bounds.left + bounds.right) / 2 + 150 * Math.cos(angle) - s.player.x,
        y = (bounds.top + bounds.bottom) / 2 + 220 * Math.sin(angle) - s.player.y;
      const near = s.enemies
        .filter((e) => e.hp > 0)
        .sort(
          (a, b) =>
            Math.hypot(a.x - s.player.x, a.y - s.player.y) -
            Math.hypot(b.x - s.player.x, b.y - s.player.y),
        )[0];
      if (near && Math.hypot(near.x - s.player.x, near.y - s.player.y) < 100) {
        x = (s.player.x - near.x) * 4;
        y = (s.player.y - near.y) * 4;
      }
      const d = Math.max(1, Math.hypot(x, y));
      step(s, 1 / 60, { autoFire: true, moveX: active ? x / d : 0, moveY: active ? y / d : 0 });
      for (const e of s.enemies.filter((e) => e.hp > 0)) {
        total++;
        if (Math.abs(e.x - s.player.x) < 226 && Math.abs(e.y - s.player.y) < 322) visible++;
      }
    }
    results.push({
      levelId,
      seed: 42,
      profile,
      active,
      phase: s.phase,
      hp: s.player.hp,
      damageTaken: s.stats.damageTaken,
      kills: s.kills,
      time: s.time,
      enemyVisibleFraction: visible / Math.max(1, total),
    });
  }
}
await writeFile(
  new URL(
    '../docs/design/cocos-mobile-2026-10-22/actual/movement-comparison.json',
    import.meta.url,
  ),
  JSON.stringify(
    {
      policy:
        'same earned campaign save/seed/upgrade priority, no casts; only movement differs; deterministic core replay, not device input',
      results,
    },
    null,
    2,
  ),
);
console.log(results.map(({ profile, ...x }) => x));
