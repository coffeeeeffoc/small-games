import { eyeHeight, targetInReach, type Box, type SceneState } from './model.js';
import { buildRoom, bossMesh, printerMesh, type Point, type Face } from './geometry.js';
import { partitionRoom, visibleFaces } from './visibility.js';

/** Perspective projection and near-plane clipping work on the same Canvas surface in both Shells. */
export function createOfficeRenderer() {
  let objects: Box[] | undefined;
  let contents = -1;
  let room: ReturnType<typeof partitionRoom> = null;
  return (ctx: CanvasRenderingContext2D, width: number, height: number, state: SceneState) => {
    const nextContents = Number(state.holdingFile) + Number(state.coffeeTaken) * 2;
    if (objects !== state.objects || contents !== nextContents) {
      objects = state.objects;
      contents = nextContents;
      room = partitionRoom(buildRoom(state));
    }
    const scale = Math.min(width * 0.95, height * 0.9);
    const cy = height * 0.48;
    const yaw = state.player.yaw,
      pitch = state.player.pitch;
    const sy = Math.sin(yaw),
      co = Math.cos(yaw),
      sp = Math.sin(pitch),
      cp = Math.cos(pitch);
    const cameraY =
      eyeHeight(state) +
      (state.status === 'playing' ? Math.sin(state.distanceWalked * 8) * 0.018 : 0);
    const transform = ([x, y, z]: Point): Point => {
      const dx = x - state.player.x,
        dz = z - state.player.z;
      const depth = dx * sy + dz * co,
        dy = y - cameraY;
      return [dx * co - dz * sy, dy * cp - depth * sp, dy * sp + depth * cp];
    };
    const project = ([x, y, z]: Point) => [width / 2 + (x * scale) / z, cy - (y * scale) / z];
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ced6cf';
    ctx.fillRect(0, 0, width, height);
    const queue: Array<{ face: Face; points: Point[]; depth: number }> = [];
    for (const face of visibleFaces(
      room,
      [state.player.x, cameraY, state.player.z],
      [...bossMesh(state), ...printerMesh(state)],
    )) {
      const source = face.points.map(transform);
      const points: Point[] = [];
      for (let i = 0; i < source.length; i++) {
        const a = source[i],
          b = source[(i + 1) % source.length];
        if (a[2] >= 0.08) points.push(a);
        if (a[2] >= 0.08 !== b[2] >= 0.08) {
          const t = (0.08 - a[2]) / (b[2] - a[2]);
          points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0.08]);
        }
      }
      if (points.length < 3) continue;
      const p = points.map(project);
      if (
        p.every(([x]) => x < 0) ||
        p.every(([x]) => x > width) ||
        p.every(([, y]) => y < 0) ||
        p.every(([, y]) => y > height)
      )
        continue;
      queue.push({ face, points, depth: source.reduce((sum, p) => sum + p[2], 0) / source.length });
    }
    for (const item of queue) {
      const points = item.points.map(project);
      ctx.beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.lineTo(points[0][0], points[0][1]);
      ctx.fillStyle = item.face.color;
      ctx.fill();
      if (item.face.text && item.depth > 1) {
        const anchor = transform(item.face.textAnchor ?? item.face.points[0]);
        if (anchor[2] < 0.08) continue;
        const [x, y] = project(anchor);
        ctx.font = `500 ${Math.max(8, Math.min(28, (scale * 0.12) / anchor[2]))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ede9d6';
        ctx.fillText(item.face.text, x, y);
      }
    }
    const target = targetInReach(state);
    ctx.strokeStyle = target ? '#ffe2a0' : '#ffffffaa';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(width / 2 - 5, cy);
    ctx.lineTo(width / 2 + 5, cy);
    ctx.moveTo(width / 2, cy - 5);
    ctx.lineTo(width / 2, cy + 5);
    ctx.stroke();
    if (state.holdingFile) {
      const w = Math.min(width * 0.28, 230),
        x = width * 0.6,
        y = height * 0.84;
      ctx.fillStyle = '#aa8356';
      ctx.fillRect(x, y, w, height * 0.19);
      ctx.fillStyle = '#e9e2cb';
      ctx.fillRect(x + 8, y + 8, w - 16, height * 0.19);
      ctx.fillStyle = '#899083';
      for (let i = 0; i < 5; i++) ctx.fillRect(x + 20, y + 22 + i * 12, w * 0.65, 2);
      ctx.fillStyle = '#bd9a7a';
      ctx.fillRect(x - 11, y + height * 0.08, 25, height * 0.1);
    }
    if (state.coffeeTaken) {
      const w = Math.min(width * 0.14, 74),
        x = width * 0.41;
      const y = height - w * 1.2 + Math.sin(state.distanceWalked * 8) * 2;
      ctx.strokeStyle = '#ded3ba';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.85, y + 17);
      ctx.lineTo(x + w * 1.13, y + 20);
      ctx.lineTo(x + w * 1.13, y + w * 0.65);
      ctx.lineTo(x + w * 0.85, y + w * 0.7);
      ctx.stroke();
      ctx.fillStyle = '#ece1c7';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w * 0.85, y + w * 1.1);
      ctx.lineTo(x + w * 0.15, y + w * 1.1);
      ctx.fill();
      ctx.fillStyle = '#684a33';
      ctx.fillRect(x + 5, y + 4, w - 10, 8);
      ctx.fillStyle = '#bb967a';
      ctx.fillRect(x + w * 0.75, y + w * 0.7, 25, w * 0.45);
    }
    const vignette = ctx.createRadialGradient(
      width / 2,
      height / 2,
      height * 0.15,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.7,
    );
    vignette.addColorStop(0, '#152e2300');
    vignette.addColorStop(1, '#18322966');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    if (state.suspicion > 35) {
      ctx.fillStyle = `rgba(169,63,36,${(state.suspicion - 35) / 400})`;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.textAlign = 'left';
  };
}
