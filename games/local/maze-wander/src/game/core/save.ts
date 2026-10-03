import type { Save, Run, Level, Settings, MarkKind, Dir } from './model.ts';
import { MARKS } from './model.ts';
import { defaultSave, newRun } from './rules.ts';
import { geometry, isSafe } from './geometry.ts';

const object = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const number = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
const strings = (v: unknown, allowed: string[]) =>
  Array.isArray(v)
    ? [...new Set(v.filter((id): id is string => typeof id === 'string' && allowed.includes(id)))]
    : [];
export function decodeSave(raw: string | null, levels: Level[]): { save: Save; warning: string } {
  const save = defaultSave();
  if (!raw) return { save, warning: '' };
  let warning = '';
  try {
    const data = object(JSON.parse(raw)),
      settings = object(data.settings);
    save.unlocked = Math.floor(number(data.unlocked, 1, 1, levels.length));
    save.played = Array.isArray(data.played)
      ? [
          ...new Set(
            data.played.filter(
              (v): v is number => Number.isInteger(v) && levels.some((l) => l.id === v),
            ),
          ),
        ]
      : [];
    save.settings = {
      fov: number(settings.fov, 75, 60, 100),
      sensitivity: number(settings.sensitivity, 1, 0.3, 2.5),
      quality: settings.quality === 'low' ? 'low' : 'high',
      mini: settings.mini !== false,
      sound: settings.sound !== false,
    } satisfies Settings;
    for (const [key, value] of Object.entries(object(data.records))) {
      if (!levels.some((l) => key === `${l.id}:A` || key === `${l.id}:B`)) continue;
      const r = object(value);
      if (typeof r.seconds === 'number' && Number.isFinite(r.seconds) && r.seconds >= 0)
        save.records[key] = {
          seconds: r.seconds,
          rooms: number(r.rooms, 1, 1, 32),
          marks: number(r.marks, 0, 0, 1e9),
          clears: number(r.clears, 1, 1, 1e9),
        };
    }
    if (data.run && !object(data.run).finished) {
      const v = object(data.run),
        l = levels.find((l) => l.id === v.level);
      if (!l) return { save, warning: '上次关卡不存在，已保留解锁进度和设置。' };
      const run = newRun(
        l,
        v.mode === 'A' && v.viewedMap !== true ? 'A' : 'B',
        v.familiar === true,
      );
      save.run = run;
      if (data.version !== 1 || v.version !== l.version || v.seed !== l.seed)
        return { save, warning: '关卡布局已更新，已回到本关安全入口；解锁和设置已保留。' };
      const { boxes, targets } = geometry(l),
        roomIds = l.rooms.map((r) => r.id);
      run.visited = strings(v.visited, roomIds);
      if (!run.visited.includes(l.entry)) run.visited.push(l.entry);
      run.current =
        typeof v.current === 'string' && run.visited.includes(v.current) ? v.current : l.entry;
      run.walked = strings(
        v.walked,
        l.edges
          .filter((e) => run.visited.includes(e.a) && run.visited.includes(e.b))
          .map((e) => e.id),
      );
      run.candidates = strings(
        v.candidates,
        targets
          .filter(
            (t) => (t.kind === 'opening' || t.kind === 'mirror') && run.visited.includes(t.room),
          )
          .map((t) => t.id),
      );
      for (const [key, value] of Object.entries(object(v.verified)))
        if (run.candidates.includes(key) && (value === 'passage' || value === 'mirror'))
          run.verified[key] = value;
      run.found = strings(
        v.found,
        targets.filter((t) => run.visited.includes(t.room)).map((t) => t.id),
      );
      run.activated = strings(
        v.activated,
        l.switches.map((s) => s.id),
      );
      for (const [key, value] of Object.entries(object(v.marks))) {
        const m = object(value);
        if (
          targets.some(
            (t) => t.id === key && t.kind === 'anchor' && run.visited.includes(t.room),
          ) &&
          typeof m.kind === 'string' &&
          Object.hasOwn(MARKS, m.kind) &&
          [0, 1, 2, 3].includes(m.direction as number)
        )
          run.marks[key] = { kind: m.kind as MarkKind, direction: m.direction as Dir };
      }
      run.seconds = number(v.seconds, 0, 0, 1e9);
      run.placed = Math.floor(number(v.placed, 0, 0, 1e9));
      run.tutorialDismissed = v.tutorialDismissed === true;
      const finite = [v.x, v.z, v.yaw, v.pitch].every(
        (n) => typeof n === 'number' && Number.isFinite(n),
      );
      if (finite) {
        run.x = v.x as number;
        run.z = v.z as number;
        run.yaw = (v.yaw as number) % (Math.PI * 2);
        run.pitch = number(v.pitch, 0, -1.1, 1.1);
      }
      if (!finite || !isSafe(l, run, boxes)) {
        const safe = newRun(l, run.mode);
        run.x = safe.x;
        run.z = safe.z;
        run.yaw = safe.yaw;
        run.pitch = 0;
        run.current = l.entry;
        warning = '上次位置不安全，已回到本关入口；探索与标记保留。';
      }
    }
  } catch {
    warning = '存档内容损坏，已安全恢复。可以重新开始探索。';
  }
  return { save, warning };
}
