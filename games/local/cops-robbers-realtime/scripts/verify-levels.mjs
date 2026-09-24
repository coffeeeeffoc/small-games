import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { LEVELS as ALL_LEVELS } from "../src/levels.js";
import {
  createGame,
  startGame,
  commandCop,
  roadDistance,
  stepGame,
} from "../src/engine.js";

const LEVELS = ALL_LEVELS.filter(level => level.solution.length);

// Ordinary orders, a 1.2-second reaction, and at most one pursuit update a second.
// Omitted officers remain at spawn. Redeployment is part of the tested strategy.
function replay(level, mode = "solve", omitted = -1) {
  const game = createGame(level);
  startGame(game);
  let dispatched = 0,
    shifted = 0,
    commands = 0,
    target = null;
  const order = (cop, point) => {
    if (mode !== "chase" && cop === omitted) return;
    assert.ok(commandCop(game, cop, point));
    commands++;
  };
  for (let tick = 0; tick < (level.timeLimit || 180) * 10 && game.phase === "playing"; tick++) {
    if ((mode === "solve" || mode === "static") && game.time >= 1.2) {
      const next = level.solution[dispatched];
      if (next && game.time >= 1.2 + dispatched * 0.35) {
        order(next.cop, level.nodes[next.node]);
        dispatched++;
      }
      const change = level.redeploy?.[shifted];
      if (
        mode === "solve" &&
        change &&
        dispatched === level.solution.length &&
        game.time >= change.at &&
        game.robbers.filter((r) => r.caught).length >= change.after
      ) {
        order(change.cop, level.nodes[change.node]);
        shifted++;
      }
    }
    const hunter = mode === "chase" ? omitted : level.hunter;
    if (
      mode !== "idle" &&
      (mode === "chase" || hunter !== omitted) &&
      game.time >= 3.5 &&
      tick % 10 === 0
    ) {
      if (!target || target.caught)
        target = game.robbers
          .filter((r) => !r.caught)
          .sort(
            (a, b) =>
              roadDistance(game, game.cops[hunter], a) -
              roadDistance(game, game.cops[hunter], b),
          )[0];
      if (target) order(hunter, target);
    }
    stepGame(game, 0.1);
    game.events.length = 0;
  }
  return {
    phase: game.phase,
    seconds: Math.round(game.time * 10) / 10,
    commands,
    shifted,
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
  const chase = level.id <= 48 ? level.cops.map((_, cop) => replay(level, "chase", cop)) : [];
  const stationary = level.id <= 48 && level.redeploy?.length ? replay(level, "static") : null;
  if (stationary && level.id <= 48)
    assert.notEqual(
      stationary.phase,
      "won",
      `Level ${level.id}: staying at the exits should leave a live inner loop`,
    );
  const missing = level.id <= 48 ? level.cops.map((_, cop) => replay(level, "solve", cop)) : [];
  assert.ok(
    level.id > 48 || missing.every((result) => result.phase !== "won"),
    `Level ${level.id}: every officer must contribute`,
  );
  const chaseWins = chase.filter((result) => result.phase === "won").length;
  results.push({
    id: level.id,
    complexity: {nodes:level.nodes.length,edges:level.edges.length,cycles:level.edges.length-level.nodes.length+1,cops:level.cops.length,robbers:level.robbers.length},
    win,
    idle,
    stationary,
    chaseWins,
    chaseAttempts: chase.length,
    missing,
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
}
const easy = results.filter((r) => r.chaseWins > 0).map((r) => r.id);
const attempts = results.reduce((sum, r) => sum + r.chaseAttempts, 0);
const naiveWins = results.reduce((sum, r) => sum + r.chaseWins, 0);
assert.ok(results.filter(r=>r.id<=48).every(r=>r.chaseWins===0), "Authored early maps require blocking exits");
console.log(
  `Verified ${results.length} real-simulation wins with human reaction time; ${results.length} idle losses. First-48 single-officer tail-chasing failed ${attempts - naiveWins}/${attempts} attempts (${Math.round(((attempts - naiveWins) / attempts) * 100)}%); levels with any successful single pursuer: ${easy.join(", ") || "none"}.`,
);

await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/levels-report.json",
  JSON.stringify(
    {
      results,
      missingOfficerWins: results
        .flatMap((r) => r.missing)
        .filter((r) => r.phase === "won").length,
    },
    null,
    2,
  ),
);
