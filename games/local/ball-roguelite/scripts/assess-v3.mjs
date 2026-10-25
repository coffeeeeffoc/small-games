import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, fire, update, chooseUpgrade, brickCenter, FIELD, PHYSICS } from '../core.mjs';
import { LEVELS } from '../levels.mjs';
const active = (g) => ['flight', 'recall'].includes(g.phase);
const settle = (g) => {
  for (let f = 0; active(g) && f < 27 * 30; f++) update(g, 1 / 30);
  if (active(g)) throw Error('flight did not settle');
  g.events = [];
};
const preference = ['power', 'pierce', 'extra', 'chain', 'blast', 'critical'];
function directions(game) {
  const angles = Array.from(
    { length: 25 },
    (_, i) => PHYSICS.minAngle + (i * (Math.PI - 2 * PHYSICS.minAngle)) / 24,
  );
  const list = angles.map((a) => ({ x: Math.cos(a) * 500, y: Math.sin(a) * 500 }));
  for (const b of game.bricks.filter((b) => b.kind !== 'pickup')) {
    const p = brickCenter(b);
    list.push({ x: p.x - game.launchX, y: p.y - FIELD.launchY });
  }
  return list.map((d) => {
    const scale = Math.min(
      1,
      d.x < 0
        ? (game.launchX - FIELD.left - 3) / -d.x
        : d.x > 0
          ? (FIELD.right - 3 - game.launchX) / d.x
          : 1,
    );
    return { x: d.x * scale, y: d.y * scale };
  }).filter((d) => d.y > 6);
}
function bestShot(game) {
  let best;
  for (const d of directions(game)) {
    const trial = structuredClone(game);
    trial.events = [];
    if (!fire(trial, d.x, d.y)) throw Error('invalid candidate');
    settle(trial);
    const danger = trial.bricks
      .filter((b) => b.hp > 0 && b.kind !== 'pickup')
      .reduce((s, b) => s + b.hp * (1 + b.r * b.r), 0);
    const value =
      trial.phase === 'won'
        ? 1e12
        : trial.phase === 'lost'
          ? -1e12
          : trial.score * 100 - danger + trial.count * 25;
    if (!best || value > best.value) best = { d, value };
  }
  return best?.d || { x: 0, y: 500 };
}
function direct(game) {
  const b = game.bricks
    .filter((b) => b.kind !== 'pickup')
    .sort((a, b) => b.r - a.r || a.hp - b.hp)[0];
  if (!b) return { x: 0, y: 500 };
  const p = brickCenter(b);
  return { x: p.x - game.launchX, y: p.y - FIELD.launchY };
}
const records = [],
  campaign = process.argv.includes('--campaign'),
  endless = process.argv.includes('--endless'),
  seeds = [1234, 20261006, 998811];
const start = Date.now();
for (const mode of [
  ...(campaign
    ? LEVELS.filter(
        (l) => !process.env.BALL_ASSESS_LEVEL || l.id === process.env.BALL_ASSESS_LEVEL,
      ).map((l) => l.id)
    : []),
  ...(endless ? ['endless'] : []),
])
  for (const strategy of ['fixed', 'direct', 'bank'])
    for (const seed of seeds) {
      const g = createGame(mode, { seed });
      let contacts = 0,
        absorbed = 0,
        maxRow = 0;
      const shots = [];
      while (!['won', 'lost'].includes(g.phase) && g.turn < (mode === 'endless' ? 160 : 36)) {
        if (g.phase === 'upgrade')
          chooseUpgrade(g, preference.find((id) => g.cards.includes(id)) || g.cards[0]);
        const d =
          strategy === 'bank' ? bestShot(g) : strategy === 'direct' ? direct(g) : { x: 0, y: 500 };
        shots.push({ turn: g.turn, dx: d.x, dy: d.y });
        if (!fire(g, d.x, d.y)) throw Error('invalid shot');
        settle(g);
        contacts += g.collisionCount;
        absorbed += g.absorbed;
        maxRow = Math.max(
          maxRow,
          ...g.bricks.filter((b) => b.kind !== 'pickup').map((b) => b.r),
          0,
        );
      }
      const record = {
        mode,
        strategy,
        seed,
        phase: g.phase,
        turn: g.turn,
        score: g.score,
        count: g.count,
        damage: g.damage,
        contacts,
        absorbed,
        maxRow,
        shots,
      };
      records.push(record);
      console.log(JSON.stringify({ ...record, shots: undefined }));
    }
const report = {
  rules: 'orbit-v4-gravity',
  environment:
    'Node CPU deterministic240Hz simulation; no advertisements; legal mobile angle candidates',
  seconds: (Date.now() - start) / 1000,
  seeds,
  records,
};
const output = new URL(
  campaign && endless
    ? '../docs/design/gravity-drop/balance-report.json'
    : campaign
      ? process.env.BALL_ASSESS_LEVEL
        ? '../docs/design/gravity-drop/campaign-focus-report.json'
        : '../docs/design/gravity-drop/campaign-report.json'
      : '../docs/design/gravity-drop/endless-report.json',
  import.meta.url,
);
mkdirSync(path.dirname(fileURLToPath(output)), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2));
console.log('DONE ' + report.seconds + 's');
