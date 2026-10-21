import { writeFileSync } from 'node:fs';
import { createGame, fire, update, chooseUpgrade, brickCenter, FIELD } from '../core.mjs';
const settle = (g) => {
  for (let f = 0; g.phase === 'flight' && f < 16 * 30; f++) update(g, 1 / 30);
  g.events = [];
};
function candidates(game) {
  const list = Array.from({ length: 17 }, (_, i) => {
    const a = -Math.PI + 0.2 + (i * (Math.PI - 0.4)) / 16;
    return { x: Math.cos(a) * 500, y: Math.sin(a) * 500 };
  });
  list.push(
    ...game.bricks
      .filter((b) => b.kind !== 'pickup')
      .map((b) => {
        const p = brickCenter(b);
        return { x: p.x - game.launchX, y: p.y - FIELD.floor + FIELD.radius + 1 };
      }),
  );
  return list.filter((d) => {
    const extent =
      d.x < 0
        ? (game.launchX - FIELD.left - 3) / -d.x
        : d.x > 0
          ? (FIELD.right - 3 - game.launchX) / d.x
          : 1;
    const scale = Math.min(1, extent);
    return d.y * scale < -12;
  });
}
function bestShot(game) {
  let best;
  for (const d of candidates(game)) {
    const trial = structuredClone(game);
    trial.events = [];
    fire(trial, d.x, d.y);
    settle(trial);
    const danger = trial.bricks
      .filter((b) => b.hp > 0 && b.kind !== 'pickup')
      .reduce((s, b) => s + b.hp * (1 + b.r * b.r), 0);
    const value = trial.phase === 'lost' ? -1e12 : trial.score * 100 - danger + trial.count * 25;
    if (!best || value > best.value) best = { d, value };
  }
  return best?.d || { x: 0, y: -500 };
}
function simpleShot(game) {
  const b = game.bricks
    .filter((b) => b.kind !== 'pickup')
    .sort((a, b) => b.r - a.r || a.hp - b.hp)[0];
  if (!b) return { x: 0, y: -500 };
  const p = brickCenter(b);
  return { x: p.x - game.launchX, y: p.y - FIELD.floor + FIELD.radius + 1 };
}
const records = [];
for (const strategy of ['fixed', 'direct', 'search'])
  for (const seed of [1234, 20261006, 998811]) {
    const game = createGame('endless', { seed });
    let sumContacts = 0,
      maxRow = 0;
    while (!['lost', 'won'].includes(game.phase) && game.turn < 250) {
      if (game.phase === 'upgrade') {
        const preference = ['power', 'pierce', 'extra', 'chain', 'blast', 'critical'];
        chooseUpgrade(game, preference.find((id) => game.cards.includes(id)) || game.cards[0]);
      }
      const d =
        strategy === 'search'
          ? bestShot(game)
          : strategy === 'direct'
            ? simpleShot(game)
            : { x: 0, y: -500 };
      fire(game, d.x, d.y);
      settle(game);
      sumContacts += game.collisionCount;
      maxRow = Math.max(maxRow, ...game.bricks.map((b) => b.r));
      if (strategy === 'search' && game.turn % 25 === 0)
        console.log(
          JSON.stringify({
            progress: seed,
            turn: game.turn,
            count: game.count,
            damage: game.damage,
            phase: game.phase,
          }),
        );
    }
    const record = {
      strategy,
      seed,
      turn: game.turn,
      phase: game.phase,
      score: game.score,
      count: game.count,
      damage: game.damage,
      upgrades: game.upgrades,
      contacts: sumContacts,
      maxRow,
    };
    records.push(record);
    console.log(JSON.stringify(record));
  }
console.log('FINAL ' + JSON.stringify(records));

writeFileSync(
  new URL('../docs/design/cocos-crystal/balance-report.json', import.meta.url),
  JSON.stringify(
    {
      environment: 'Node deterministic fixed-step simulation; no advertisements',
      healthCurve: '.65*t + .5*max(t-30,0) + .18*max(t-40,0)^2 + 1',
      maxTurns: 250,
      records,
    },
    null,
    2,
  ),
);
