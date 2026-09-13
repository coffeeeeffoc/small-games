import test from "node:test";
import assert from "node:assert/strict";
import {
  BODY_GAP,
  CAPTURE_RADIUS,
  createGame,
  startGame,
  pauseGame,
  resumeGame,
  stepGame,
  commandCop,
  holdCop,
  routePreview,
  roadTarget,
  roadDistance,
} from "../src/engine.js";

const level = (nodes, edges, cops, robbers, extra = {}) => ({
  id: 1,
  name: "Test street",
  nodes: nodes.map(([x, y]) => ({ x, y })),
  edges,
  cops,
  robbers,
  ...extra,
});
const run = (game, seconds) => {
  for (let time = 0; time < seconds - 1e-8; time += 1 / 60)
    stepGame(game, Math.min(1 / 60, seconds - time));
};
const begin = (definition) => {
  const game = createGame(definition);
  startGame(game);
  return game;
};
const line = (extra = {}) =>
  level(
    [
      [100, 300],
      [500, 300],
      [900, 300],
    ],
    [
      [0, 1],
      [1, 2],
    ],
    [0],
    [2],
    extra,
  );

test("a robber moves in real time before the player issues a command", () => {
  const game = begin(line());
  run(game, 0.6);
  assert.ok(game.robbers[0].x < 880);
  assert.equal(game.cops[0].x, 100);
  assert.equal(game.phase, "playing");
});

test("commands and previews use exact road positions, including a continuous mid-edge reversal", () => {
  const game = begin(line());
  assert.ok(commandCop(game, 0, { x: 650, y: 312 }));
  run(game, 0.8);
  const before = game.cops[0].x;
  const preview = routePreview(game, 0, { x: 120, y: 300 });
  assert.equal(preview[0].x, before);
  assert.equal(preview.at(-1).x, 120);
  assert.ok(commandCop(game, 0, { x: 120, y: 300 }));
  assert.equal(game.cops[0].x, before);
  stepGame(game, 1 / 60);
  assert.ok(game.cops[0].x < before);
  assert.ok(before - game.cops[0].x <= game.policeSpeed / 60 + 1e-6);
  const destination = game.cops[0].destination;
  assert.equal(commandCop(game, 0, { x: 300, y: 30 }), false);
  assert.equal(commandCop(game, 0, { x: NaN, y: 300 }), false);
  assert.deepEqual(game.cops[0].destination, destination);
  assert.equal(roadTarget(game, { x: 300, y: 349 }), null);
  holdCop(game, 0);
  const held = game.cops[0].x;
  run(game, 0.2);
  assert.equal(game.cops[0].x, held);
});

test("L-shaped routes follow roads; nearby points across a wall have a long road distance", () => {
  const game = begin(
    level(
      [
        [100, 100],
        [800, 100],
        [800, 400],
        [100, 400],
      ],
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
      [0],
      [3],
    ),
  );
  const preview = routePreview(game, 0, { x: 800, y: 350 });
  assert.deepEqual(
    preview.map(({ x, y }) => [x, y]),
    [
      [100, 100],
      [800, 100],
      [800, 350],
    ],
  );
  assert.ok(roadDistance(game, game.cops[0], game.robbers[0]) > 1600);
  run(game, 2);
  assert.equal(game.robbers[0].capture, 0);
});

test("one cop can push a robber into a dead end without crossing through it", () => {
  const game = begin(line());
  commandCop(game, 0, { x: 900, y: 300 });
  for (let i = 0; i < 900 && game.phase === "playing"; i++) {
    stepGame(game, 1 / 60);
    if (!game.robbers[0].caught)
      assert.ok(game.robbers[0].x - game.cops[0].x >= BODY_GAP - 1e-4);
  }
  assert.equal(game.phase, "won");
  assert.ok(game.time > 5);
  assert.equal(
    game.events.filter((event) => event.type === "capture").length,
    1,
  );
  assert.equal(game.events.filter((event) => event.type === "win").length, 1);
  run(game, 5);
  assert.equal(game.events.filter((event) => event.type === "win").length, 1);
});

test("two cops close a straight road, even when their orders would cross the robber", () => {
  const game = begin(
    level(
      [
        [100, 300],
        [500, 300],
        [900, 300],
      ],
      [
        [0, 1],
        [1, 2],
      ],
      [0, 2],
      [1],
    ),
  );
  commandCop(game, 0, { x: 900, y: 300 });
  commandCop(game, 1, { x: 100, y: 300 });
  for (let i = 0; i < 600 && game.phase === "playing"; i++) {
    stepGame(game, 1 / 60);
    if (!game.robbers[0].caught) {
      assert.ok(game.cops[0].x <= game.robbers[0].x - BODY_GAP + 1e-4);
      assert.ok(game.cops[1].x >= game.robbers[0].x + BODY_GAP - 1e-4);
    }
  }
  assert.equal(game.phase, "won");
});

test("a closed large ring still has safe space and is not captured remotely", () => {
  const game = begin(
    level(
      [
        [150, 150],
        [850, 150],
        [850, 450],
        [150, 450],
      ],
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
      ],
      [0, 1],
      [2],
    ),
  );
  run(game, 10);
  assert.equal(game.robbers[0].capture, 0);
  assert.equal(game.phase, "playing");
  assert.ok(
    roadDistance(game, game.cops[0], game.robbers[0]) >= BODY_GAP - 1e-4,
  );
});

test("a cop at a junction blocks all branches while the robber can use an unblocked alternative", () => {
  const game = begin(
    level(
      [
        [100, 300],
        [500, 300],
        [900, 300],
        [500, 100],
        [900, 100],
      ],
      [
        [0, 1],
        [1, 2],
        [1, 3],
        [3, 4],
        [4, 2],
      ],
      [1],
      [2],
    ),
  );
  let leftStart = false;
  for (let i = 0; i < 480; i++) {
    stepGame(game, 1 / 60);
    const robber = game.robbers[0];
    assert.ok(roadDistance(game, game.cops[0], robber) >= BODY_GAP - 1e-4);
    if (robber.y < 280) leftStart = true;
  }
  assert.ok(leftStart, "the robber explores the unblocked ring");
  assert.equal(game.robbers[0].capture, 0);
});

test("a cop just before a junction blocks it consistently for movement and capture", () => {
  const game = begin(
    level(
      [
        [100, 100],
        [500, 100],
        [540, 100],
        [500, 140],
        [500, 150],
      ],
      [
        [0, 1],
        [1, 2],
        [1, 3],
        [3, 4],
      ],
      [2],
      [3],
      { robberSpeed: 0.01 },
    ),
  );
  commandCop(game, 0, { x: 510, y: 100 });
  run(game, 1.2);
  assert.equal(game.cops[0].x, 510);
  assert.equal(game.phase, "won");
});

test("capture requires 0.8 seconds, withdrawal clears progress, and pause cannot issue orders", () => {
  const game = begin(
    level(
      [
        [100, 300],
        [160, 300],
        [220, 300],
        [500, 300],
      ],
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
      [0, 2],
      [1],
    ),
  );
  run(game, 0.4);
  assert.ok(game.robbers[0].capture > 0.45 && game.robbers[0].capture < 0.55);
  pauseGame(game);
  const time = game.time;
  const capture = game.robbers[0].capture;
  assert.equal(commandCop(game, 1, { x: 500, y: 300 }), false);
  assert.equal(holdCop(game, 1), false);
  run(game, 2);
  assert.equal(game.time, time);
  assert.equal(game.robbers[0].capture, capture);
  resumeGame(game);
  commandCop(game, 1, { x: 500, y: 300 });
  run(game, 0.3);
  assert.equal(game.robbers[0].capture, 0);
  assert.equal(game.phase, "playing");
  assert.ok(game.cops[1].x - game.cops[0].x > CAPTURE_RADIUS * 2);
});

test("multiple robbers finish independently and only the final capture wins", () => {
  const game = begin(
    level(
      [
        [100, 300],
        [140, 300],
        [500, 300],
        [900, 300],
      ],
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
      [1],
      [0, 3],
    ),
  );
  run(game, 0.9);
  assert.ok(game.robbers[0].caught);
  assert.equal(game.robbers[1].caught, false);
  assert.equal(game.phase, "playing");
  commandCop(game, 0, { x: 900, y: 300 });
  run(game, 10);
  assert.equal(game.phase, "won");
  assert.equal(
    game.events.filter((event) => event.type === "capture").length,
    2,
  );
  assert.equal(game.events.filter((event) => event.type === "win").length, 1);
});

test("large frames and high speeds cannot tunnel through opposing actors", () => {
  const game = begin(
    level(
      [
        [100, 300],
        [500, 300],
        [900, 300],
      ],
      [
        [0, 1],
        [1, 2],
      ],
      [0, 2],
      [1],
      { policeSpeed: 500, robberSpeed: 500 },
    ),
  );
  commandCop(game, 0, { x: 900, y: 300 });
  commandCop(game, 1, { x: 100, y: 300 });
  stepGame(game, 0.7);
  assert.ok(game.cops[0].x < game.robbers[0].x);
  assert.ok(game.cops[1].x > game.robbers[0].x);
  run(game, 2);
  assert.equal(game.phase, "won");
});

test("unguarded exits attract robbers and one escape loses the level only once", () => {
  const game = begin(
    level(
      [
        [0, 0],
        [300, 0],
        [600, 0],
      ],
      [
        [0, 1],
        [1, 2],
      ],
      [0],
      [1],
      { exits: [2] },
    ),
  );
  run(game, 0.4);
  assert.equal(game.robbers[0].exitTarget, 2);
  assert.ok(
    game.robbers[0].x > 340,
    "the robber runs toward the exit without a nearby threat",
  );
  run(game, 5);
  assert.equal(game.phase, "lost");
  assert.equal(game.robbers[0].escaped, true);
  assert.equal(game.robbers[0].caught, false);
  assert.equal(game.robbers[0].escapeProgress, 1);
  assert.equal(
    game.events.filter((event) => event.type === "escape").length,
    1,
  );
  assert.equal(game.events.filter((event) => event.type === "lose").length, 1);
  assert.equal(
    game.events.some((event) => event.type === "win"),
    false,
  );
  const lostAt = game.time;
  assert.equal(commandCop(game, 0, { x: 600, y: 0 }), false);
  assert.equal(holdCop(game, 0), false);
  assert.equal(routePreview(game, 0, { x: 600, y: 0 }), null);
  assert.equal(resumeGame(game), false);
  run(game, 5);
  assert.equal(game.time, lostAt);
  assert.equal(game.events.filter((event) => event.type === "lose").length, 1);
});

test("guarding an exit in time lets another cop close the trap", () => {
  const game = begin(
    level(
      [
        [0, 0],
        [300, 0],
        [600, 0],
        [600, 150],
      ],
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
      [0, 3],
      [1],
      { exits: [2] },
    ),
  );
  commandCop(game, 1, { x: 600, y: 0 });
  commandCop(game, 0, { x: 600, y: 0 });
  for (let i = 0; i < 900 && game.phase === "playing"; i++) {
    stepGame(game, 1 / 60);
    for (const cop of game.cops)
      assert.ok(roadDistance(game, cop, game.robbers[0]) >= BODY_GAP - 1e-4);
  }
  assert.equal(game.phase, "won");
  assert.equal(game.robbers[0].escaped, false);
  assert.equal(
    game.events.some((event) => event.type === "lose"),
    false,
  );
});

test("a newly guarded exit makes the robber reverse toward another reachable exit", () => {
  const game = begin(
    level(
      [
        [0, 0],
        [300, 0],
        [600, 0],
        [0, 100],
      ],
      [
        [0, 1],
        [1, 2],
        [0, 3],
      ],
      [3],
      [1],
      { exits: [0, 2] },
    ),
  );
  run(game, 0.2);
  assert.equal(game.robbers[0].exitTarget, 0);
  commandCop(game, 0, { x: 0, y: 0 });
  run(game, 1.3);
  assert.equal(game.robbers[0].exitTarget, 2);
  const turnedAt = game.robbers[0].x;
  run(game, 0.5);
  assert.ok(game.robbers[0].x > turnedAt + 40);
  run(game, 6);
  assert.equal(game.phase, "lost");
  assert.equal(
    game.events.find((event) => event.type === "escape").exitNode,
    2,
  );
});

test("escape progress pauses and a physical interception clears the climb", () => {
  const game = begin(
    level(
      [
        [0, 0],
        [400, 0],
        [600, 0],
        [600, 100],
      ],
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
      [0, 3],
      [1],
      { exits: [2] },
    ),
  );
  run(game, 1.9);
  const robber = game.robbers[0];
  assert.ok(robber.escapeProgress > 0 && robber.escapeProgress < 0.1);
  pauseGame(game);
  const progress = robber.escapeProgress;
  const time = game.time;
  run(game, 4);
  assert.equal(robber.escapeProgress, progress);
  assert.equal(game.time, time);
  resumeGame(game);
  commandCop(game, 1, { x: 600, y: 0 });
  run(game, 0.85);
  assert.equal(robber.escapeProgress, 0);
  assert.equal(robber.escaped, false);
  assert.equal(game.phase, "playing");
  run(game, 0.5);
  assert.ok(robber.x < 599, "the robber leaves the blocked exit");
  assert.equal(robber.escapeProgress, 0);
});

test("robbers take the longer open road to an exit instead of running through a cop", () => {
  const game = begin(
    level(
      [
        [0, 0],
        [600, 0],
        [600, 300],
        [0, 300],
        [600, 150],
      ],
      [
        [0, 1],
        [1, 4],
        [4, 2],
        [2, 3],
        [3, 0],
      ],
      [4],
      [2],
      { exits: [1] },
    ),
  );
  run(game, 0.4);
  assert.equal(game.robbers[0].exitTarget, 1);
  assert.ok(game.robbers[0].x < 560);
  assert.equal(game.robbers[0].y, 300);
  for (let i = 0; i < 1200 && game.phase === "playing"; i++) {
    stepGame(game, 1 / 60);
    assert.ok(
      roadDistance(game, game.cops[0], game.robbers[0]) >= BODY_GAP - 1e-4,
    );
  }
  assert.equal(game.phase, "lost");
  assert.equal(
    game.events.find((event) => event.type === "escape").exitNode,
    1,
  );
});

test("a capture and another robber's escape in the same slice still lose", () => {
  const game = begin(
    level(
      [
        [100, 0],
        [140, 0],
        [900, 0],
      ],
      [
        [0, 1],
        [1, 2],
      ],
      [1],
      [0, 2],
      { exits: [2], exitHoldSeconds: 0.8 },
    ),
  );
  run(game, 1);
  assert.equal(game.robbers[0].caught, true);
  assert.equal(game.robbers[1].escaped, true);
  assert.equal(game.phase, "lost");
  assert.equal(
    game.events.some((event) => event.type === "win"),
    false,
  );
  assert.equal(
    game.events.find((event) => event.type === "capture").time,
    game.events.find((event) => event.type === "escape").time,
  );
});

test("bad level boundaries are rejected", () => {
  for (const exits of [[99], [-1], [1, 1], [0.5], "exit"])
    assert.throws(() => createGame(line({ exits })));
  for (const exitHoldSeconds of [0, -1, NaN, Infinity])
    assert.throws(() => createGame(line({ exits: [1], exitHoldSeconds })));
  assert.throws(() => createGame(level([[0, 0]], [[0, 0]], [0], [0])));
  assert.throws(() =>
    createGame(
      level(
        [
          [0, 0],
          [100, 0],
        ],
        [[0, 1]],
        [0],
        [0],
      ),
    ),
  );
  assert.throws(() =>
    createGame(
      level(
        [
          [0, 0],
          [100, 0],
        ],
        [[0, 3]],
        [0],
        [1],
      ),
    ),
  );
});
