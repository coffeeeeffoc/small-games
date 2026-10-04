// The viewing permissions are separate from the mechanism state: opening a
// window never moves a shaft, releases the ball, or changes a puzzle solution.
export const FACES = Object.freeze([
  Object.freeze({ id: 'front', label: '正面', caption: '拨动黄铜轴，观察挡板联动' }),
  Object.freeze({ id: 'back', label: '背面', caption: '沿着球道，检查锁扣与出口' }),
  Object.freeze({ id: 'left', label: '左面', caption: '从侧面观察轴杆的高低' }),
  Object.freeze({ id: 'right', label: '右面', caption: '透过侧窗检查挡板位置' }),
  Object.freeze({ id: 'top', label: '顶面', caption: '俯看轴杆与球道的对应' }),
  Object.freeze({ id: 'bottom', label: '底面', caption: '查看底部传动与出口状态' }),
]);

export function faceById(id) {
  return FACES.find((face) => face.id === id) ?? null;
}

export function createFaceAccess(random = Math.random) {
  const remaining = FACES.map((face) => face.id);
  const visibleFaces = [];
  for (let index = 0; index < 2; index += 1) {
    const sample = Number(random());
    const selected = Number.isFinite(sample)
      ? Math.max(0, Math.min(remaining.length - 1, Math.floor(sample * remaining.length)))
      : 0;
    visibleFaces.push(...remaining.splice(selected, 1));
  }
  return { visibleFaces };
}

export function hiddenFaces(access) {
  return FACES.filter((face) => !access.visibleFaces.includes(face.id));
}

// Reveal the playable front/back windows first unless a hidden face was
// explicitly requested. Repeated free hints can therefore always expose the
// controls, even when the initial pair contains only observation windows.
export function revealFace(access, requestedId) {
  const hidden = hiddenFaces(access);
  const next = hidden.find((face) => face.id === requestedId) ?? hidden[0];
  return next ? { ...access, visibleFaces: [...access.visibleFaces, next.id] } : access;
}
