// A road loop on the full map is useless if police spawns already seal it off.
// Peel dead ends after removing police nodes to locate usable escape circuits.
export function escapeCore(level) {
  const blocked = new Set(level.cops);
  const adjacent = level.nodes.map(() => []);
  for (const [a, b] of level.edges)
    if (!blocked.has(a) && !blocked.has(b)) {
      adjacent[a].push(b);
      adjacent[b].push(a);
    }
  const degrees = adjacent.map((links) => links.length);
  const removed = new Set(blocked);
  const queue = degrees.flatMap((degree, node) => (degree < 2 ? [node] : []));
  for (const node of queue) {
    if (removed.has(node)) continue;
    removed.add(node);
    for (const next of adjacent[node])
      if (!removed.has(next) && --degrees[next] < 2) queue.push(next);
  }
  return new Set(level.nodes.flatMap((_, node) => (removed.has(node) ? [] : [node])));
}
