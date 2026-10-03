/** Right-handed box: +x right, +y up, +z front; face-local v points up. */
export const BOX_HALF = 260;
export const FACE_IDS = Object.freeze(['front', 'back', 'top', 'bottom', 'left', 'right']);
export const FACE_DEFS = Object.freeze({
  front: Object.freeze({ label: '前面', normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }),
  back: Object.freeze({ label: '后面', normal: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] }),
  top: Object.freeze({ label: '上面', normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] }),
  bottom: Object.freeze({ label: '下面', normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] }),
  left: Object.freeze({ label: '左面', normal: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] }),
  right: Object.freeze({ label: '右面', normal: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] }),
});

export function facePoint(face, u, v, depth = BOX_HALF) {
  const basis = FACE_DEFS[face];
  if (!basis) throw new Error(`未知观察面：${face}`);
  return basis.normal.map((normal, i) => normal * depth + basis.u[i] * u + basis.v[i] * v);
}

/** Returns [horizontal, vertical, depth]; opposite views genuinely mirror. */
export function projectFace(point, face) {
  const basis = FACE_DEFS[face];
  if (!basis) throw new Error(`未知观察面：${face}`);
  return [basis.u, basis.v, basis.normal].map((axis) =>
    axis.reduce((sum, value, i) => sum + value * point[i], 0),
  );
}
