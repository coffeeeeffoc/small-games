const EPS = 1e-7;
export const BODY_GAP = 23;
export const CAPTURE_RADIUS = 68;
export const CAPTURE_SECONDS = 0.8;
export const ESCAPE_SECONDS = 1.2;
// Movement stops a few floating-point steps before body contact.
const EXIT_GUARD_GAP = BODY_GAP + 1e-4;

const pointDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const finitePoint = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);

function buildGraph(level) {
  if (
    !Array.isArray(level.nodes) ||
    !level.nodes.length ||
    !level.nodes.every(finitePoint)
  ) {
    throw new Error("关卡需要有效的道路节点");
  }
  const nodes = level.nodes.map((p) => ({ x: p.x, y: p.y }));
  const adjacent = nodes.map(() => []);
  const edges = level.edges.map(([a, b], id) => {
    if (
      !Number.isInteger(a) ||
      !Number.isInteger(b) ||
      !nodes[a] ||
      !nodes[b] ||
      a === b
    ) {
      throw new Error("道路端点无效");
    }
    const length = pointDistance(nodes[a], nodes[b]);
    if (length < EPS) throw new Error("道路长度不能为零");
    adjacent[a].push({ node: b, edge: id, length });
    adjacent[b].push({ node: a, edge: id, length });
    return { a, b, length };
  });
  if (!edges.length || adjacent.some((links) => !links.length))
    throw new Error("道路节点必须相连");
  const distances = nodes.map((_, i) =>
    nodes.map((__, j) => (i === j ? 0 : Infinity)),
  );
  for (const { a, b, length } of edges) {
    distances[a][b] = Math.min(distances[a][b], length);
    distances[b][a] = Math.min(distances[b][a], length);
  }
  for (let k = 0; k < nodes.length; k++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = 0; j < nodes.length; j++) {
        distances[i][j] = Math.min(
          distances[i][j],
          distances[i][k] + distances[k][j],
        );
      }
    }
  }
  if (distances[0].some((d) => !Number.isFinite(d)))
    throw new Error("道路必须连通");
  return { nodes, edges, adjacent, distances };
}

function edgePoint(graph, edge, t) {
  const segment = graph.edges[edge];
  const a = graph.nodes[segment.a];
  const b = graph.nodes[segment.b];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, edge, t };
}

function nodePoint(graph, node) {
  if (!Number.isInteger(node) || !graph.nodes[node])
    throw new Error("角色出生点无效");
  const edge = graph.adjacent[node][0].edge;
  return edgePoint(graph, edge, graph.edges[edge].a === node ? 0 : 1);
}

function actorAt(graph, node, id) {
  return {
    ...nodePoint(graph, node),
    id,
    angle: 0,
    moving: false,
    blocked: false,
    routePoints: [],
    destination: null,
  };
}

export function createGame(level) {
  const graph = buildGraph(level);
  if (!level.cops?.length || !level.robbers?.length)
    throw new Error("关卡需要警察和小偷");
  if (
    level.exits !== undefined &&
    (!Array.isArray(level.exits) ||
      level.exits.some(
        (node) => !Number.isInteger(node) || !graph.nodes[node],
      ) ||
      new Set(level.exits).size !== level.exits.length)
  )
    throw new Error("逃脱出口必须是不同的有效道路节点");
  if (
    level.exitHoldSeconds !== undefined &&
    (!Number.isFinite(level.exitHoldSeconds) || level.exitHoldSeconds <= 0)
  )
    throw new Error("出口翻越时间必须大于零");
  const cops = level.cops.map((node, id) => actorAt(graph, node, id));
  const robbers = level.robbers.map((node, id) => ({
    ...actorAt(graph, node, id),
    caught: false,
    capture: 0,
    escaped: false,
    escapeProgress: 0,
    exitTarget: null,
    emotion: "smug",
    rethink: id * 0.07,
    lastTurn: -10,
  }));
  const speed = (n, fallback) =>
    Number.isFinite(n) && n > 0 && n <= 500 ? n : fallback;
  const game = {
    level,
    graph,
    cops,
    robbers,
    exits: (level.exits ?? []).map((node) => ({
      ...nodePoint(graph, node),
      node,
    })),
    exitHoldSeconds: level.exitHoldSeconds ?? ESCAPE_SECONDS,
    time: 0,
    phase: "ready",
    events: [],
    policeSpeed: speed(level.policeSpeed, 102),
    robberSpeed: speed(level.robberSpeed, 108),
    seed: Number.isInteger(level.id) ? level.id + 1 : 1,
  };
  if (
    cops.some((cop) =>
      robbers.some((robber) => roadDistance(game, cop, robber) < BODY_GAP),
    )
  ) {
    throw new Error("警察和小偷出生点过近");
  }
  return game;
}

export function startGame(game) {
  if (game.phase !== "ready") return false;
  game.phase = "playing";
  return true;
}

export function pauseGame(game) {
  if (game.phase !== "playing") return false;
  game.phase = "paused";
  for (const actor of [...game.cops, ...game.robbers]) actor.moving = false;
  return true;
}

export function resumeGame(game) {
  if (game.phase !== "paused") return false;
  game.phase = "playing";
  return true;
}

export function roadTarget(game, point, maxDistance = 48) {
  if (!finitePoint(point) || !Number.isFinite(maxDistance) || maxDistance < 0)
    return null;
  let best = null;
  let distance = maxDistance;
  game.graph.edges.forEach(({ a, b }, edge) => {
    const start = game.graph.nodes[a];
    const end = game.graph.nodes[b];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - start.x) * dx + (point.y - start.y) * dy) /
          (dx * dx + dy * dy),
      ),
    );
    const candidate = edgePoint(game.graph, edge, t);
    const d = pointDistance(point, candidate);
    if (d <= distance) {
      best = candidate;
      distance = d;
    }
  });
  return best;
}

function distanceToNode(game, p, node) {
  const { a, b, length } = game.graph.edges[p.edge];
  return Math.min(
    p.t * length + game.graph.distances[a][node],
    (1 - p.t) * length + game.graph.distances[b][node],
  );
}

export function roadDistance(game, p, q) {
  const { a, b, length } = game.graph.edges[q.edge];
  let result = Math.min(
    distanceToNode(game, p, a) + q.t * length,
    distanceToNode(game, p, b) + (1 - q.t) * length,
  );
  if (p.edge === q.edge)
    result = Math.min(result, Math.abs(p.t - q.t) * length);
  return result;
}

export function isExitBlocked(game, exit) {
  const entrance = game.graph.adjacent[exit.node];
  return game.cops.some((cop) => {
    const distance = roadDistance(game, cop, exit);
    if (distance <= EXIT_GUARD_GAP) return true;
    if (entrance.length !== 1 || distanceToNode(game, cop, entrance[0].node) > EXIT_GUARD_GAP)
      return false;
    // A guard at the alley mouth cannot stop a robber who already slipped past.
    return !game.robbers.some((robber) => !robber.caught && !robber.escaped &&
      robber.edge === entrance[0].edge && roadDistance(game, robber, exit) < distance);
  });
}

// Temporary route vertices preserve exact road positions when a command changes mid-edge.
function navigation(game, source, target, avoidCops, samples = false) {
  const { graph } = game;
  const vertices = graph.nodes.map((p) => ({ ...p }));
  const cuts = graph.edges.map(({ a, b }) => [
    { t: 0, id: a },
    { t: 1, id: b },
  ]);
  const blocked = new Set();
  const insert = (point) => {
    const list = cuts[point.edge];
    const existing = list.find((cut) => Math.abs(cut.t - point.t) < EPS);
    if (existing) return existing.id;
    const id = vertices.length;
    vertices.push({ ...point });
    list.push({ t: point.t, id });
    return id;
  };
  if (samples) {
    graph.edges.forEach(({ length }, edge) => {
      // ponytail: 70-unit AI choices; denser choices only if maps gain very short tactical alcoves.
      const count = Math.ceil(length / 70);
      for (let i = 1; i < count; i++) insert(edgePoint(graph, edge, i / count));
    });
  }
  if (avoidCops) {
    for (const cop of game.cops) {
      blocked.add(insert(cop));
      if (samples) {
        const gap = BODY_GAP / graph.edges[cop.edge].length;
        if (cop.t > gap) insert(edgePoint(graph, cop.edge, cop.t - gap));
        if (cop.t + gap < 1) insert(edgePoint(graph, cop.edge, cop.t + gap));
      }
    }
  }
  const from = insert(source);
  const to = target ? insert(target) : -1;
  if (avoidCops) {
    vertices.forEach((vertex, i) => {
      const point = vertex.edge === undefined ? nodePoint(graph, i) : vertex;
      if (nearestCop(game, point) < BODY_GAP - EPS) blocked.add(i);
    });
  }
  const adjacent = vertices.map(() => []);
  cuts.forEach((list, edge) => {
    list.sort((a, b) => a.t - b.t);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1];
      const b = list[i];
      if (blocked.has(a.id) || blocked.has(b.id)) continue;
      const length = (b.t - a.t) * graph.edges[edge].length;
      adjacent[a.id].push({ node: b.id, length, edge });
      adjacent[b.id].push({ node: a.id, length, edge });
    }
  });
  const distances = vertices.map(() => Infinity);
  const previous = vertices.map(() => null);
  const visited = new Set();
  distances[from] = 0;
  for (;;) {
    let current = -1;
    let nearest = Infinity;
    for (let i = 0; i < vertices.length; i++) {
      if (!visited.has(i) && distances[i] < nearest) {
        current = i;
        nearest = distances[i];
      }
    }
    if (current < 0 || current === to) break;
    visited.add(current);
    for (const link of adjacent[current]) {
      const d = nearest + link.length;
      if (d < distances[link.node] - EPS) {
        distances[link.node] = d;
        previous[link.node] = { node: current, edge: link.edge };
      }
    }
  }
  return { vertices, adjacent, distances, previous, from, to };
}

function pathTo(game, network, target) {
  if (!Number.isFinite(network.distances[target])) return null;
  const path = [];
  for (let current = target; current !== network.from; ) {
    const previous = network.previous[current];
    if (!previous) return null;
    const vertex = network.vertices[current];
    const { a, b } = game.graph.edges[previous.edge];
    const start = game.graph.nodes[a];
    const end = game.graph.nodes[b];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const t =
      ((vertex.x - start.x) * dx + (vertex.y - start.y) * dy) /
      (dx * dx + dy * dy);
    path.push(
      edgePoint(game.graph, previous.edge, Math.max(0, Math.min(1, t))),
    );
    current = previous.node;
  }
  return path.reverse();
}

export function routePreview(game, index, point) {
  const cop = game.cops[index];
  const target = roadTarget(game, point);
  if (!cop || !target || game.phase !== "playing") return null;
  const network = navigation(game, cop, target, false);
  const path = pathTo(game, network, network.to);
  return path ? [{ x: cop.x, y: cop.y }, ...path] : null;
}

export function commandCop(game, index, point) {
  const cop = game.cops[index];
  const target = roadTarget(game, point);
  if (!cop || !target || game.phase !== "playing") return false;
  const network = navigation(game, cop, target, false);
  const path = pathTo(game, network, network.to);
  if (!path) return false;
  cop.routePoints = path;
  cop.destination = { ...target };
  cop.moving = path.length > 0;
  cop.blocked = false;
  return true;
}

export function holdCop(game, index) {
  const cop = game.cops[index];
  if (!cop || game.phase !== "playing") return false;
  cop.routePoints = [];
  cop.destination = null;
  cop.moving = false;
  cop.blocked = false;
  return true;
}

function nearestCop(game, point) {
  return Math.min(...game.cops.map((cop) => roadDistance(game, point, cop)));
}

function chooseEscape(game, robber) {
  const threatened = nearestCop(game, robber) < 190;
  if (
    !game.exits.length &&
    !threatened &&
    robber.routePoints.length &&
    !robber.blocked
  )
    return;
  const network = navigation(game, robber, null, true, true);
  let best = -1;
  let bestScore = -Infinity;
  let exitDistance = Infinity;
  robber.exitTarget = null;
  for (const exit of game.exits) {
    const travel = network.distances[exit.node];
    if (travel < exitDistance && nearestCop(game, exit) > EXIT_GUARD_GAP) {
      best = exit.node;
      exitDistance = travel;
    }
  }
  if (best >= 0) robber.exitTarget = best;
  game.seed = (Math.imul(game.seed, 1664525) + 1013904223) >>> 0;
  for (
    let i = 0;
    robber.exitTarget === null && i < network.vertices.length;
    i++
  ) {
    const travel = network.distances[i];
    if (!Number.isFinite(travel) || travel < 24) continue;
    const raw = network.vertices[i];
    const point = raw.edge === undefined ? nodePoint(game.graph, i) : raw;
    const safety = nearestCop(game, point);
    if (safety < BODY_GAP - EPS) continue;
    let score;
    if (threatened) {
      score = Math.min(safety, 320) * 1.3 - travel * 0.24;
      if (i < game.graph.nodes.length)
        score += Math.min(game.graph.adjacent[i].length, 3) * 5;
      const dx = point.x - robber.x;
      const dy = point.y - robber.y;
      score +=
        ((Math.cos(robber.angle) * dx + Math.sin(robber.angle) * dy) /
          Math.max(1, Math.hypot(dx, dy))) *
        9;
    } else {
      if (i >= game.graph.nodes.length || travel < 75) continue;
      const random =
        ((Math.imul(i + 1, 2654435761) ^ game.seed) >>> 0) / 4294967296;
      score =
        random * 100 -
        Math.abs(travel - 240) * 0.12 +
        Math.min(safety, 320) * 0.1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best < 0) {
    robber.routePoints = [];
    robber.moving = false;
    return;
  }
  const path = pathTo(game, network, best);
  if (!path) return;
  const angle = path.length
    ? Math.atan2(path[0].y - robber.y, path[0].x - robber.x)
    : robber.angle;
  const turn = Math.abs(
    Math.atan2(Math.sin(angle - robber.angle), Math.cos(angle - robber.angle)),
  );
  if (robber.moving && turn > 2 && game.time - robber.lastTurn > 0.7) {
    robber.lastTurn = game.time;
    game.events.push({
      type: "turn",
      id: robber.id,
      robberId: robber.id,
      x: robber.x,
      y: robber.y,
      time: game.time,
    });
  }
  robber.routePoints = path;
  robber.destination = path.length ? { ...path.at(-1) } : null;
}

function moveActor(game, actor, distance, opponents) {
  actor.moving = false;
  actor.blocked = false;
  while (distance > EPS && actor.routePoints.length) {
    const target = actor.routePoints[0];
    const remaining = pointDistance(actor, target);
    if (remaining < EPS) {
      Object.assign(actor, {
        x: target.x,
        y: target.y,
        edge: target.edge,
        t: target.t,
      });
      actor.routePoints.shift();
      continue;
    }
    const amount = Math.min(distance, remaining);
    const { a, b } = game.graph.edges[target.edge];
    const start = game.graph.nodes[a];
    const end = game.graph.nodes[b];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const initialT =
      ((actor.x - start.x) * dx + (actor.y - start.y) * dy) /
      (dx * dx + dy * dy);
    const candidateAt = (fraction) =>
      edgePoint(
        game.graph,
        target.edge,
        initialT + (((target.t - initialT) * amount) / remaining) * fraction,
      );
    const limits = opponents.map((opponent) =>
      Math.min(BODY_GAP, roadDistance(game, actor, opponent)),
    );
    const valid = (candidate) =>
      opponents.every(
        (opponent, i) =>
          roadDistance(game, candidate, opponent) >= limits[i] - EPS,
      );
    let fraction = 1;
    if (!valid(candidateAt(1))) {
      let low = 0;
      let high = 1;
      for (let i = 0; i < 20; i++) {
        const middle = (low + high) / 2;
        if (valid(candidateAt(middle))) low = middle;
        else high = middle;
      }
      fraction = low;
      actor.blocked = true;
    }
    const moved = amount * fraction;
    if (moved > EPS) {
      actor.angle = Math.atan2(target.y - actor.y, target.x - actor.x);
      Object.assign(actor, candidateAt(fraction));
      actor.moving = true;
    }
    distance -= moved;
    if (fraction < 1) break;
    if (amount >= remaining - EPS) actor.routePoints.shift();
  }
  if (!actor.routePoints.length) actor.destination = null;
}

function captureGeometry(game) {
  const { graph } = game;
  const blockedNodes = new Set();
  graph.nodes.forEach((_, node) => {
    if (
      game.cops.some((cop) => distanceToNode(game, cop, node) < BODY_GAP - EPS)
    )
      blockedNodes.add(node);
  });
  const uncovered = (radius) =>
    graph.edges.map(({ a, b, length }, id) => {
      const covered = [];
      for (const cop of game.cops) {
        const fromA = radius - distanceToNode(game, cop, a);
        const fromB = radius - distanceToNode(game, cop, b);
        if (fromA >= 0) covered.push([0, Math.min(length, fromA)]);
        if (fromB >= 0) covered.push([Math.max(0, length - fromB), length]);
        if (cop.edge === id)
          covered.push([
            Math.max(0, cop.t * length - radius),
            Math.min(length, cop.t * length + radius),
          ]);
      }
      covered.sort((x, y) => x[0] - y[0]);
      const intervals = [];
      let end = 0;
      for (const [a, b] of covered) {
        if (a > end + EPS) intervals.push([end, a]);
        end = Math.max(end, b);
      }
      if (end < length - EPS) intervals.push([end, length]);
      return intervals;
    });
  // Collision and reachability use the same body radius, including cops just before a junction.
  return {
    free: uncovered(BODY_GAP),
    blockedNodes,
    safe: uncovered(CAPTURE_RADIUS),
  };
}

// The HUD and simulation share this diagnosis, so a hint never invents another capture rule.
export function captureStatus(game, robber, geometry = captureGeometry(game)) {
  // One officer can block a lane, but an arrest needs a nearby partner.
  // Two capture ranges can meet up to 2 * CAPTURE_RADIUS along the road.
  const nearby = game.cops.filter((cop) => roadDistance(game, cop, robber) <= CAPTURE_RADIUS * 2).length;
  if (nearby < 2) return { nearby, enclosed: false, gap: null };
  const { free, blockedNodes, safe } = geometry;
  const queue = [];
  const visited = new Set();
  const inspect = (edgeId, position) => {
    const edge = game.graph.edges[edgeId];
    const [lo, hi] = free[edgeId].find(
      ([a, b]) => position >= a - EPS && position <= b + EPS,
    ) ?? [position, position];
    const gap = safe[edgeId].find(([a, b]) => Math.min(b, hi) - Math.max(a, lo) > EPS);
    if (gap) return {
      from: edgePoint(game.graph, edgeId, Math.max(gap[0], lo) / edge.length),
      to: edgePoint(game.graph, edgeId, Math.min(gap[1], hi) / edge.length),
    };
    if (lo < EPS && !blockedNodes.has(edge.a) && !visited.has(edge.a)) {
      visited.add(edge.a);
      queue.push(edge.a);
    }
    if (
      hi > edge.length - EPS &&
      !blockedNodes.has(edge.b) &&
      !visited.has(edge.b)
    ) {
      visited.add(edge.b);
      queue.push(edge.b);
    }
    return null;
  };
  const edge = game.graph.edges[robber.edge];
  let gap = inspect(robber.edge, robber.t * edge.length);
  if (gap) return { nearby, enclosed: false, gap };
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    for (const link of game.graph.adjacent[node]) {
      const edge = game.graph.edges[link.edge];
      gap = inspect(link.edge, edge.a === node ? 0 : edge.length);
      if (gap) return { nearby, enclosed: false, gap };
    }
  }
  return { nearby, enclosed: true, gap: null };
}

export function stepGame(game, dt) {
  if (game.phase !== "playing" || !Number.isFinite(dt) || dt <= 0) return;
  // A suspended tab never receives a long catch-up simulation; the UI also pauses on visibility changes.
  let remaining = Math.min(dt, 1);
  while (remaining > EPS && game.phase === "playing") {
    const slice = Math.min(remaining, 1 / 120);
    remaining -= slice;
    game.time += slice;
    const active = game.robbers.filter(
      (robber) => !robber.caught && !robber.escaped,
    );
    for (const robber of active) {
      robber.rethink -= slice;
      if (robber.capture === 0 && robber.rethink <= 0) {
        chooseEscape(game, robber);
        robber.rethink = 0.32;
      }
      if (robber.capture === 0)
        moveActor(game, robber, game.robberSpeed * slice, game.cops);
      else robber.moving = false;
    }
    for (const cop of game.cops)
      moveActor(game, cop, game.policeSpeed * slice, active);
    const geometry = captureGeometry(game);
    for (const robber of active) {
      const { enclosed } = captureStatus(game, robber, geometry);
      robber.capture = enclosed
        ? Math.min(1, robber.capture + slice / CAPTURE_SECONDS)
        : 0;
      const exit = game.exits.find(
        (candidate) => roadDistance(game, robber, candidate) < EPS,
      );
      robber.escapeProgress =
        exit && !enclosed && nearestCop(game, exit) > EXIT_GUARD_GAP
          ? Math.min(1, robber.escapeProgress + slice / game.exitHoldSeconds)
          : 0;
      robber.emotion = enclosed
        ? "panic"
        : nearestCop(game, robber) < 150
          ? "alert"
          : game.exits.some(
                (candidate) => roadDistance(game, robber, candidate) < 90,
              )
            ? "escaping"
            : "smug";
      if (robber.capture >= 1 - EPS) {
        robber.capture = 1;
        robber.caught = true;
        robber.escapeProgress = 0;
        robber.exitTarget = null;
        robber.emotion = "caught";
        robber.moving = false;
        robber.routePoints = [];
        robber.destination = null;
        game.events.push({
          type: "capture",
          id: robber.id,
          robberId: robber.id,
          x: robber.x,
          y: robber.y,
          time: game.time,
        });
      } else if (robber.escapeProgress >= 1 - EPS) {
        robber.escapeProgress = 1;
        robber.escaped = true;
        robber.emotion = "escaped";
        robber.routePoints = [];
        robber.destination = null;
        game.phase = "lost";
        for (const actor of [...game.cops, ...game.robbers])
          actor.moving = false;
        game.events.push(
          {
            type: "escape",
            id: robber.id,
            robberId: robber.id,
            exitNode: exit.node,
            x: robber.x,
            y: robber.y,
            time: game.time,
          },
          {
            type: "lose",
            robberId: robber.id,
            exitNode: exit.node,
            time: game.time,
          },
        );
        break;
      }
    }
    if (
      game.phase === "playing" &&
      game.robbers.every((robber) => robber.caught)
    ) {
      game.phase = "won";
      for (const cop of game.cops) cop.moving = false;
      game.events.push({ type: "win", time: game.time });
    }
  }
}
