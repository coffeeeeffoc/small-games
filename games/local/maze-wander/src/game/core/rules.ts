import type { Level, Mode, Run, Save, Target, Box, MarkKind, Dir } from './model.ts';
import { HALF, roomPosition, MARKS, sideOf } from './model.ts';
import { visible, focus, move } from './geometry.ts';

export const defaultSave = (): Save => ({
  version: 1,
  unlocked: 1,
  played: [],
  records: {},
  settings: { fov: 75, sensitivity: 1, quality: 'high', mini: true, sound: true },
});
export function newRun(level: Level, mode: Mode, familiar = false): Run {
  const p = roomPosition(level.rooms.find((r) => r.id === level.entry)!);
  const edge = level.edges.find((e) => e.a === level.entry || e.b === level.entry)!;
  const other = roomPosition(
    level.rooms.find((r) => r.id === (edge.a === level.entry ? edge.b : edge.a))!,
  );
  return {
    level: level.id,
    version: level.version,
    seed: level.seed,
    mode,
    viewedMap: mode === 'B',
    ...p,
    yaw: Math.atan2(-(other.x - p.x), -(other.z - p.z)),
    pitch: 0,
    current: level.entry,
    visited: [level.entry],
    candidates: [],
    verified: {},
    walked: [],
    found: [],
    marks: {},
    activated: [],
    seconds: 0,
    placed: 0,
    finished: false,
    familiar,
    tutorialDismissed: false,
  };
}
const add = (array: string[], value: string) => {
  if (!array.includes(value)) array.push(value);
};
export function observe(level: Level, run: Run, targets: Target[], boxes: Box[]) {
  const room = level.rooms.find((r) => {
    const p = roomPosition(r);
    return Math.abs(run.x - p.x) < HALF - 0.1 && Math.abs(run.z - p.z) < HALF - 0.1;
  });
  if (room) {
    if (room.id !== run.current) {
      const e = level.edges.find(
        (e) => (e.a === room.id && e.b === run.current) || (e.b === room.id && e.a === run.current),
      );
      if (e) {
        add(run.walked, e.id);
        for (const t of targets.filter(
          (t) => t.kind === 'opening' && (t.room === room.id || t.room === run.current),
        )) {
          const other = level.rooms.find(
            (r) => r.id === (t.room === room.id ? run.current : room.id),
          )!;
          const r = level.rooms.find((r) => r.id === t.room)!;
          const d = other.x > r.x ? 1 : other.x < r.x ? 3 : other.z > r.z ? 2 : 0;
          if (t.dir === d) {
            run.verified[t.id] = 'passage';
            add(run.candidates, t.id);
          }
        }
      }
    }
    add(run.visited, room.id);
    run.current = room.id;
    for (const t of targets.filter((t) => t.room === room.id && visible(run, t, boxes, 6, 0.55))) {
      if (t.kind === 'opening' || t.kind === 'mirror') add(run.candidates, t.id);
      if (t.kind === 'switch' || t.kind === 'exit') add(run.found, t.id);
    }
  }
}
export function step(
  level: Level,
  run: Run,
  input: { forward: number; right: number },
  dt: number,
  boxes: Box[],
  targets: Target[],
  active: boolean,
) {
  if (!active || run.finished) return;
  const elapsed = Math.max(0, Math.min(dt, 0.25)),
    norm = Math.max(1, Math.hypot(input.forward, input.right));
  const f = (input.forward / norm) * elapsed * 3.3,
    r = (input.right / norm) * elapsed * 3.3;
  move(
    run,
    -Math.sin(run.yaw) * f + Math.cos(run.yaw) * r,
    -Math.cos(run.yaw) * f - Math.sin(run.yaw) * r,
    boxes,
  );
  run.seconds += elapsed;
  observe(level, run, targets, boxes);
}
export function useMap(run: Run) {
  run.mode = 'B';
  run.viewedMap = true;
}
export function interact(level: Level, run: Run, targets: Target[], boxes: Box[]) {
  const t = focus(run, targets, boxes);
  if (!t) return '靠近并对准门洞、表面或装置进行检查。';
  add(run.found, t.id);
  if (t.kind === 'opening' || t.kind === 'mirror') {
    run.verified[t.id] = t.kind === 'mirror' ? 'mirror' : 'passage';
    add(run.candidates, t.id);
    const blocked = level.edges.find(
      (e) =>
        e.gate &&
        !run.activated.includes(e.gate) &&
        (e.a === t.room || e.b === t.room) &&
        sideOf(
          level.rooms.find((r) => r.id === t.room)!,
          level.rooms.find((r) => r.id === (e.a === t.room ? e.b : e.a))!,
        ) === t.dir,
    );
    if (t.kind === 'opening' && blocked)
      return '这扇侧门暂时关闭。找到另一侧的控制牌后，它会永久开启。';
    return t.kind === 'mirror'
      ? '这是一面实体镜。倒影不是新的通道。'
      : '这是实际门洞；另一侧仍需亲自探索。';
  }
  if (t.kind === 'switch') {
    add(run.activated, t.switchId!);
    return `${t.label}已启动，将一直保持开启。`;
  }
  if (t.kind === 'exit') {
    if (level.required.some((id) => !run.activated.includes(id)))
      return `归途之门需要 ${level.required.length} 个控制点。已启动 ${level.required.filter((id) => run.activated.includes(id)).length} 个；找到后再回来。`;
    run.finished = true;
    return '你找到了归途。';
  }
  return '';
}
export function placeMark(
  run: Run,
  targets: Target[],
  boxes: Box[],
  anchorId: string,
  kind: MarkKind | null,
  direction: Dir,
) {
  const t = focus(run, targets, boxes, true);
  if (!t || t.id !== anchorId) return false;
  if (kind === null) delete run.marks[t.id];
  else if (MARKS[kind]) {
    run.marks[t.id] = { kind, direction };
    run.placed++;
  }
  return true;
}
export function finish(save: Save, run: Run, levelCount: number) {
  if (!run.finished) return;
  save.unlocked = Math.max(save.unlocked, Math.min(levelCount, run.level + 1));
  const mode = run.viewedMap ? 'B' : run.mode,
    key = `${run.level}:${mode}`,
    old = save.records[key];
  save.records[key] = {
    seconds: Math.min(old?.seconds ?? Infinity, run.seconds),
    rooms: run.visited.length,
    marks: run.placed,
    clears: (old?.clears ?? 0) + 1,
  };
  save.run = undefined;
}
// The map gets a projection of acquired information, never the full level bounds.
export function mapData(level: Level, run: Run, targets: Target[]) {
  if (run.mode === 'A' && !run.viewedMap) return null;
  const rooms = level.rooms.filter((r) => run.visited.includes(r.id));
  return {
    rooms,
    edges: level.edges.filter(
      (e) => run.walked.includes(e.id) && run.visited.includes(e.a) && run.visited.includes(e.b),
    ),
    openings: targets
      .filter((t) => run.candidates.includes(t.id) && run.visited.includes(t.room))
      .map((t) => ({ room: t.room, dir: t.dir, status: run.verified[t.id] ?? 'unknown' })),
    points: targets.filter(
      (t) =>
        run.found.includes(t.id) &&
        run.visited.includes(t.room) &&
        (t.kind === 'exit' || t.kind === 'switch'),
    ),
    marks: targets
      .filter((t) => run.marks[t.id] && run.visited.includes(t.room))
      .map((t) => ({ ...t, mark: run.marks[t.id] })),
  };
}
