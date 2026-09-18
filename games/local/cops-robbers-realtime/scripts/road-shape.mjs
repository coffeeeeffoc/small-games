// Label refinement after suppressing bends. Equal keys are conservatively rejected:
// mirrors, rotated copies and longer versions of the same junction graph do not count as new maps.
export function roadShape(level) {
  const adj = level.nodes.map((_, n) =>
    level.edges.flatMap(([a, b]) => (a === n ? [b] : b === n ? [a] : [])),
  );
  const junctions = adj
    .map((a, i) => (a.length !== 2 ? i : -1))
    .filter((i) => i >= 0);
  const links = junctions.map((n) =>
    adj[n].map((next) => {
      let prev = n;
      while (adj[next].length === 2) {
        const after = adj[next].find((x) => x !== prev);
        prev = next;
        next = after;
      }
      return junctions.indexOf(next);
    }),
  );
  let colors = links.map((a) => String(a.length));
  for (let round = 0; round < junctions.length; round++) {
    const codes = links.map(
      (a, i) =>
        colors[i] +
        ":" +
        a
          .map((n) => colors[n])
          .sort()
          .join(","),
    );
    const table = [...new Set(codes)].sort();
    colors = codes.map((c) => String(table.indexOf(c)));
  }
  return JSON.stringify([
    level.edges.length - level.nodes.length + 1,
    links.map((a, i) => [colors[i], a.map((n) => colors[n]).sort()]).sort(),
  ]);
}
