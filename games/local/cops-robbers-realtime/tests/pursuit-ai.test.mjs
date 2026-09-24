import test from "node:test";
import assert from "node:assert/strict";
import { getLevels } from "../src/levels.js";
import { createGame, startGame, stepGame, commandRobber, roadDistance } from "../src/engine.js";

function play(level, move = false) {
  const game = createGame(level, { playerRole: "robber", firstRole: "robber" });
  startGame(game);
  for (let tick = 0; tick < 1201 && game.phase === "playing"; tick++) {
    if (move && tick % 5 === 0) for (const actor of game.robbers.filter(actor => !actor.caught && !actor.escaped)) {
      const exits = [...game.exits].sort((a, b) => roadDistance(game, actor, a) - roadDistance(game, actor, b));
      for (const exit of exits) if (commandRobber(game, actor.id, exit)) break;
    }
    stepGame(game, 0.1);
    game.events.length = 0;
  }
  return game;
}

test("coordinated pursuit catches idle runners on all 200 free maps, while movement can still win", () => {
  const failures = [];
  for (const mode of ["classic", "escape"]) for (const level of getLevels(mode)) {
    const game = play(level);
    if (game.phase !== "won") failures.push(`${mode}/${level.id}: ${game.robbers.filter(actor => actor.caught).length}/${game.robbers.length}`);
  }
  assert.deepEqual(failures, [], "Standing still must not guarantee a runner victory, even with the 2-second head start");
  assert(getLevels("escape").some(level => play(level, true).robbers.some(actor => actor.escaped)), "An ordinary legal exit route can still beat the AI");
});
