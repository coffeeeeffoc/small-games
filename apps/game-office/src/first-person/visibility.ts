import type { Face, Point } from './geometry.js';

type Partition = {
  axis: number;
  at: number;
  faces: Face[];
  back: Partition | null;
  front: Partition | null;
};
const epsilon = 1e-7;

/** Split world polygons at an axis-aligned room plane, preserving winding. */
function divide(faces: Face[], axis: number, at: number) {
  const back: Face[] = [],
    front: Face[] = [],
    same: Face[] = [];
  for (const face of faces) {
    const distances = face.points.map((point) => point[axis] - at);
    const below = distances.some((distance) => distance < -epsilon),
      above = distances.some((distance) => distance > epsilon);
    if (!above && !below) {
      same.push(face);
      continue;
    }
    if (!above) {
      back.push(face);
      continue;
    }
    if (!below) {
      front.push(face);
      continue;
    }
    const low: Point[] = [],
      high: Point[] = [];
    for (let i = 0; i < face.points.length; i++) {
      const a = face.points[i],
        b = face.points[(i + 1) % face.points.length],
        da = distances[i],
        db = distances[(i + 1) % face.points.length];
      if (da <= epsilon) low.push(a);
      if (da >= -epsilon) high.push(a);
      if ((da < -epsilon && db > epsilon) || (da > epsilon && db < -epsilon)) {
        const t = da / (da - db),
          point: Point = [
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t,
          ];
        low.push(point);
        high.push(point);
      }
    }
    const anchor =
      face.textAnchor ??
      (face.text
        ? (face.points[0].map(
            (_, axis) =>
              face.points.reduce((sum, point) => sum + point[axis], 0) / face.points.length,
          ) as Point)
        : undefined);
    const textOnBack = !anchor || anchor[axis] <= at;
    back.push({
      ...face,
      points: low,
      text: textOnBack ? face.text : undefined,
      textAnchor: anchor,
    });
    front.push({
      ...face,
      points: high,
      text: textOnBack ? undefined : face.text,
      textAnchor: anchor,
    });
  }
  return { back, front, same };
}

/** Static room faces are axis aligned; median surface planes keep this BSP balanced. */
export function partitionRoom(faces: Face[]): Partition | null {
  if (!faces.length) return null;
  const planes = [new Set<number>(), new Set<number>(), new Set<number>()];
  for (const face of faces)
    for (let axis = 0; axis < 3; axis++)
      if (face.points.every((point) => Math.abs(point[axis] - face.points[0][axis]) < epsilon))
        planes[axis].add(face.points[0][axis]);
  const axis = planes.reduce((best, values, i) => (values.size > planes[best].size ? i : best), 0);
  const values = [...planes[axis]].sort((a, b) => a - b),
    at = values[Math.floor(values.length / 2)];
  const { back, front, same } = divide(faces, axis, at);
  return { axis, at, faces: same, back: partitionRoom(back), front: partitionRoom(front) };
}

function facing(face: Face, eye: Point) {
  const [a, b, c] = face.points;
  const u = b.map((value, i) => value - a[i]),
    v = c.map((value, i) => value - a[i]);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return n.reduce((sum, value, i) => sum + value * (eye[i] - a[i]), 0) < -epsilon;
}

/** Traversal gives exact static occlusion; the convex boss parts are split into the same cells. */
export function visibleFaces(room: Partition | null, eye: Point, actors: Face[]): Face[] {
  const result: Face[] = [];
  function visit(node: Partition | null, moving: Face[]) {
    if (!node) {
      result.push(
        ...moving
          .filter((face) => facing(face, eye))
          .sort((a, b) => {
            const distance = (face: Face) =>
              face.points.reduce(
                (sum, p) =>
                  sum + (p[0] - eye[0]) ** 2 + (p[1] - eye[1]) ** 2 + (p[2] - eye[2]) ** 2,
                0,
              ) / face.points.length;
            return distance(b) - distance(a);
          }),
      );
      return;
    }
    const { back, front, same } = divide(moving, node.axis, node.at);
    const ahead = eye[node.axis] > node.at;
    visit(ahead ? node.back : node.front, ahead ? back : front);
    result.push(...node.faces, ...same);
    visit(ahead ? node.front : node.back, ahead ? front : back);
  }
  visit(
    room,
    actors.filter((face) => facing(face, eye)),
  );
  return result.filter((face) => facing(face, eye));
}
