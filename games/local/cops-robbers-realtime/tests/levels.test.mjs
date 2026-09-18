import assert from "node:assert/strict";
import { CHAPTERS, LEVELS } from "../src/levels.js";
import { createGame } from "../src/engine.js";
import { roadShape } from "../scripts/road-shape.mjs";

assert.equal(CHAPTERS.length, 8);
assert.equal(LEVELS.length, 48);
const fingerprints = new Set();
for (const [i, level] of LEVELS.entries()) {
  const { id, nodes, edges, cops, robbers, exits } = level;
  const fail = (detail) => `Level ${id} ${level.name}: ${detail}`;
  assert.equal(id, i + 1);
  assert.equal(level.chapter, Math.floor(i / 6));
  assert.ok(
    level.hint.length > 10 && level.briefing && level.par > 0,
    fail("missing briefing"),
  );
  assert.ok(cops.length >= 3 && cops.length <= 5, fail("police count"));
  assert.ok(robbers.length >= 1 && robbers.length <= 6, fail("robber count"));
  assert.equal(
    exits.length,
    cops.length - 1,
    fail("each guard needs a separate exit"),
  );
  assert.ok(
    edges.length - nodes.length + 1 >= 2,
    fail("at least two independent loops"),
  );
  assert.equal(new Set(exits).size, exits.length, fail("duplicate exit"));
  assert.ok(
    exits.every((n) => Number.isInteger(n) && nodes[n]),
    fail("invalid exit"),
  );
  assert.ok(
    exits.every((n) => ![...cops, ...robbers].includes(n)),
    fail("spawn on exit"),
  );
  assert.equal(
    new Set([...cops, ...robbers]).size,
    cops.length + robbers.length,
    fail("duplicate spawn"),
  );
  assert.ok(
    [...cops, ...robbers].every(
      (n) => Number.isInteger(n) && n >= 0 && n < nodes.length,
    ),
    fail("invalid spawn"),
  );
  assert.equal(
    new Set(nodes.map((n) => `${n.x},${n.y}`)).size,
    nodes.length,
    fail("duplicate node"),
  );
  assert.ok(
    nodes.every((n) => n.x >= 80 && n.x <= 920 && n.y >= 80 && n.y <= 520),
    fail("node bounds"),
  );
  const adjacency = nodes.map(() => []);
  const seenEdges = new Set();
  for (const [a, b] of edges) {
    assert.ok(nodes[a] && nodes[b] && a !== b, fail("invalid edge"));
    const key = [a, b].sort((x, y) => x - y).join(",");
    assert.ok(
      !seenEdges.has(key),
      fail(`duplicate edge ${nodes[a].label}-${nodes[b].label}`),
    );
    seenEdges.add(key);
    adjacency[a].push(b);
    adjacency[b].push(a);
    assert.ok(
      nodes[a].x === nodes[b].x || nodes[a].y === nodes[b].y,
      fail("diagonal street"),
    );
    assert.ok(
      Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y) >= 90,
      fail("short edge"),
    );
    for (const [n, p] of nodes.entries()) {
      if (n === a || n === b) continue;
      const onSegment =
        (nodes[a].x === nodes[b].x &&
          p.x === nodes[a].x &&
          p.y > Math.min(nodes[a].y, nodes[b].y) &&
          p.y < Math.max(nodes[a].y, nodes[b].y)) ||
        (nodes[a].y === nodes[b].y &&
          p.y === nodes[a].y &&
          p.x > Math.min(nodes[a].x, nodes[b].x) &&
          p.x < Math.max(nodes[a].x, nodes[b].x));
      assert.ok(
        !onSegment,
        fail(
          `junction ${p.label} not connected to edge ${nodes[a].label}-${nodes[b].label}`,
        ),
      );
    }
  }
  for (let e = 0; e < edges.length; e++)
    for (let f = e + 1; f < edges.length; f++) {
      if (edges[e].some((n) => edges[f].includes(n))) continue;
      const [a, b] = edges[e].map((n) => nodes[n]);
      const [c, d] = edges[f].map((n) => nodes[n]);
      const [h1, h2, v1, v2] = a.y === b.y ? [a, b, c, d] : [c, d, a, b];
      if (h1.y === h2.y && v1.x === v2.x) {
        assert.ok(
          !(
            v1.x > Math.min(h1.x, h2.x) &&
            v1.x < Math.max(h1.x, h2.x) &&
            h1.y > Math.min(v1.y, v2.y) &&
            h1.y < Math.max(v1.y, v2.y)
          ),
          fail("unconnected street crossing"),
        );
      }
    }
  const reached = new Set([0]),
    queue = [0];
  for (const node of queue)
    for (const neighbor of adjacency[node])
      if (!reached.has(neighbor)) {
        reached.add(neighbor);
        queue.push(neighbor);
      }
  assert.equal(reached.size, nodes.length, fail("disconnected road"));
  const game = createGame(level);
  assert.ok(
    exits.every((exit) =>
      cops.every((cop) => game.graph.distances[cop][exit] >= 90),
    ),
    fail("police start guarding an exit"),
  );
  assert.ok(
    exits.every((exit) => adjacency[exit].length === 1),
    fail("escape exits need an actual terminal alley"),
  );
  const fingerprint = roadShape(level);
  assert.ok(
    !fingerprints.has(fingerprint),
    fail("reused junction graph, including mirrored or subdivided copies"),
  );
  fingerprints.add(fingerprint);
  // A permanent guard on each listed junction must cut every cycle. This is
  // only a structural check; scripts/verify-levels.mjs also drives the engine.
  const finalGuards = level.solution.map((command) => command.node);
  for (const order of level.redeploy ?? []) finalGuards[order.cop] = order.node;
  const blocked = new Set(finalGuards);
  assert.ok(blocked.size < cops.length, fail("no free pursuit officer"));
  const visited = new Set();
  function visit(n, parent) {
    assert.ok(!visited.has(n), fail("solution leaves an unguarded cycle"));
    visited.add(n);
    for (const next of adjacency[n])
      if (next !== parent && !blocked.has(next)) visit(next, n);
  }
  for (let n = 0; n < nodes.length; n++)
    if (!blocked.has(n) && !visited.has(n)) visit(n, -1);
}
assert.deepEqual(
  LEVELS.slice(0, 3).map((l) => [l.cops.length, l.robbers.length]),
  [
    [3, 1],
    [3, 2],
    [3, 2],
  ],
);
console.log(
  "48 distinct junction graphs: no mirrored or stretched templates; roads, escapes and final blockade checked.",
);
assert.equal(
  roadShape(LEVELS[0]),
  roadShape({
    ...LEVELS[0],
    nodes: LEVELS[0].nodes.map((n) => ({ ...n, x: 1000 - n.x })),
  }),
);
const first = LEVELS[0],
  [a, b] = first.edges[0],
  midpoint = first.nodes.length;
assert.equal(
  roadShape(first),
  roadShape({
    ...first,
    nodes: [
      ...first.nodes,
      {
        x: (first.nodes[a].x + first.nodes[b].x) / 2,
        y: (first.nodes[a].y + first.nodes[b].y) / 2,
      },
    ],
    edges: [[a, midpoint], [midpoint, b], ...first.edges.slice(1)],
  }),
);
