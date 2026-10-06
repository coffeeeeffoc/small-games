import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
/** Forty-four triangles per chamfered block, with true edges that catch the sun. */
export function chamferedBox(w: number, h: number, d: number, bevel: number) {
  const half = [w / 2, h / 2, d / 2],
    r = Math.min(bevel, ...half.map((n) => n * 0.4));
  const inner = half.map((n) => n - r),
    positions: number[] = [],
    uv: number[] = [];
  const vertex = (values: number[]) => new Vector3(values[0], values[1], values[2]);
  const polygon = (points: number[][]) => {
    let p = points.map(vertex);
    const normal = p[1]!.clone().sub(p[0]!).cross(p[2]!.clone().sub(p[0]!));
    const center = p.reduce((sum, q) => sum.add(q), new Vector3()).divideScalar(p.length);
    if (normal.dot(center) < 0) p = p.reverse();
    for (let i = 1; i < p.length - 1; i++)
      for (const q of [p[0]!, p[i]!, p[i + 1]!]) {
        positions.push(q.x, q.y, q.z);
        const n = normal.clone().normalize();
        if (Math.abs(n.y) > 0.7) uv.push(q.x / w + 0.5, q.z / d + 0.5);
        else uv.push((Math.abs(n.x) > 0.7 ? q.z / d : q.x / w) + 0.5, q.y / h + 0.5);
      }
  };
  for (let axis = 0; axis < 3; axis++) {
    const a = (axis + 1) % 3,
      b = (axis + 2) % 3;
    for (const sign of [-1, 1])
      polygon(
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([u, v]) => {
          const p = [0, 0, 0];
          p[axis] = sign * half[axis]!;
          p[a] = u! * inner[a]!;
          p[b] = v! * inner[b]!;
          return p;
        }),
      );
    for (const sa of [-1, 1])
      for (const sb of [-1, 1]) {
        const points: number[][] = [];
        for (const [along, side] of [
          [-1, 0],
          [1, 0],
          [1, 1],
          [-1, 1],
        ]) {
          const p = [0, 0, 0];
          p[axis] = along! * inner[axis]!;
          p[a] = sa * (side ? inner[a]! : half[a]!);
          p[b] = sb * (side ? half[b]! : inner[b]!);
          points.push(p);
        }
        polygon(points);
      }
  }
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1])
        polygon([
          [sx * half[0]!, sy * inner[1]!, sz * inner[2]!],
          [sx * inner[0]!, sy * half[1]!, sz * inner[2]!],
          [sx * inner[0]!, sy * inner[1]!, sz * half[2]!],
        ]);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
