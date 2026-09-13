import assert from "node:assert/strict";
import { LEVELS } from "../src/levels.js";
import {
  createGame,
  startGame,
  commandCop,
  roadDistance,
  stepGame,
} from "../src/engine.js";

// Ordinary commands only: leave time to read the board, click each guard in
// sequence, then update pursuit at most once a second. Never edit actor state.
function replay(level, mode = "solve", singleCop = 0) {
  const game = createGame(level);
  startGame(game);
  const opening = level.id <= 6 ? 2.5 : 1.5;
  const assigned = new Map();
  const fixed = mode === "solve" ? level.tutorialRoute : null;
  let commandCount = 0;
  let dispatched = 0;
  const order = (cop, point) => {
    assert.ok(commandCop(game, cop, point));
    commandCount++;
  };
  for (let tick = 0; tick < 1200 && game.phase === "playing"; tick++) {
    if (mode === "solve" && game.time >= opening) {
      if (fixed) {
        const next = fixed[dispatched];
        if (
          next &&
          game.time >= opening + dispatched * 0.35 &&
          (dispatched < 2 || !game.cops[next.cop].routePoints.length)
        ) {
          order(next.cop, level.nodes[next.node]);
          dispatched++;
        }
      } else {
        const next = level.solution[dispatched];
        if (next && game.time >= opening + dispatched * 0.35) {
          order(next.cop, level.nodes[next.node]);
          dispatched++;
        }
        if (tick % 10 === 0) {
          const reserved = new Set(
            [...assigned.values()].filter((r) => !r.caught),
          );
          for (let cop = level.hunter; cop < game.cops.length; cop++) {
            let target = assigned.get(cop);
            if (!target || target.caught || game.cops[cop].blocked) {
              const active = game.robbers.filter((r) => !r.caught);
              const free = active.filter((r) => !reserved.has(r));
              target = (
                game.cops[cop].blocked ? active : free.length ? free : active
              ).sort(
                (a, b) =>
                  roadDistance(game, game.cops[cop], a) -
                  roadDistance(game, game.cops[cop], b),
              )[0];
              if (target) {
                assigned.set(cop, target);
                reserved.add(target);
              }
            }
            if (target) order(cop, target);
          }
        }
      }
    } else if (mode === "chase" && tick % 5 === 0) {
      // Give mindless tail-chasing a generous advantage: no reaction delay and
      // twice the command frequency. Every other officer stays at spawn.
      const target = game.robbers
        .filter((r) => !r.caught)
        .sort(
          (a, b) =>
            roadDistance(game, game.cops[singleCop], a) -
            roadDistance(game, game.cops[singleCop], b),
        )[0];
      if (target) order(singleCop, target);
    }
    stepGame(game, 0.1);
    game.events.length = 0;
  }
  return {
    phase: game.phase,
    seconds: Math.round(game.time * 10) / 10,
    commands: commandCount,
    captured: game.robbers.filter((r) => r.caught).length,
  };
}

const requested = process.argv.slice(2).map(Number);
const selected = LEVELS.filter(
  (level) => !requested.length || requested.includes(level.id),
);
const results = [];
for (const level of selected) {
  const win = replay(level);
  const idle = replay(level, "idle");
  const chase = level.cops.map((_, cop) => replay(level, "chase", cop));
  const chaseWins = chase.filter((result) => result.phase === "won").length;
  results.push({
    id: level.id,
    win,
    idle,
    chaseWins,
    chaseAttempts: chase.length,
  });
  console.log(
    `${String(level.id).padStart(2, "0")} ${level.name}: ${win.phase}, ${win.captured}/${level.robbers.length}, ${win.seconds}s, ${win.commands} orders; idle ${idle.phase} ${idle.seconds}s; single pursuer wins ${chaseWins}/${chase.length}`,
  );
  assert.equal(
    win.phase,
    "won",
    `Level ${level.id}: delayed, ordinary player strategy must win`,
  );
  assert.equal(
    idle.phase,
    "lost",
    `Level ${level.id}: doing nothing must allow an escape`,
  );
  if (level.id <= 3)
    assert.ok(win.commands <= 3, "tutorial requires too many clicks");
}
const easy = results.filter((r) => r.chaseWins > 0).map((r) => r.id);
const attempts = results.reduce((sum, r) => sum + r.chaseAttempts, 0);
const naiveWins = results.reduce((sum, r) => sum + r.chaseWins, 0);
assert.ok(
  naiveWins <= attempts * 0.25,
  "Tail-chasing should not replace blocking exits",
);
console.log(
  `Verified ${results.length} real-simulation wins with human reaction time; ${results.length} idle losses. Single-officer tail-chasing failed ${attempts - naiveWins}/${attempts} attempts (${Math.round(((attempts - naiveWins) / attempts) * 100)}%); levels with any successful single pursuer: ${easy.join(", ") || "none"}.`,
);
