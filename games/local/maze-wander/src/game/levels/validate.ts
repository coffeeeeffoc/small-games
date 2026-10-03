import { sideOf } from '../core/model.ts';
import type { Level } from '../core/model.ts';

export function solve(level: Level) {
  const bit = (id: string) => 1 << level.switches.findIndex((s) => s.id === id);
  const initial = { room: level.entry, mask: 0, path: [level.entry] };
  const queue = [initial],
    seen = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const state = queue[i];
    for (const s of level.switches) if (s.room === state.room) state.mask |= bit(s.id);
    const key = `${state.room}:${state.mask}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (state.room === level.exit.room && level.required.every((id) => state.mask & bit(id)))
      return { path: state.path, exploredStates: seen.size };
    for (const e of level.edges) {
      if (e.gate && !(state.mask & bit(e.gate))) continue;
      const next = e.a === state.room ? e.b : e.b === state.room ? e.a : undefined;
      if (next) queue.push({ room: next, mask: state.mask, path: [...state.path, next] });
    }
  }
  return null;
}
export function distance(level: Level, from: string, to: string, excluded?: string) {
  const queue = [{ node: from, distance: 0 }],
    seen = new Set([from]);
  for (let i = 0; i < queue.length; i++) {
    const s = queue[i];
    if (s.node === to) return s.distance;
    for (const e of level.edges.filter((e) => e.id !== excluded)) {
      const next = e.a === s.node ? e.b : e.b === s.node ? e.a : undefined;
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push({ node: next, distance: s.distance + 1 });
      }
    }
  }
  return Infinity;
}
export function validateLevel(level: Level) {
  const errors: string[] = [],
    roomIds = new Set(level.rooms.map((r) => r.id));
  if (roomIds.size !== level.rooms.length) errors.push('duplicate room');
  if (new Set(level.rooms.map((r) => `${r.x}:${r.z}`)).size !== level.rooms.length)
    errors.push('overlapping room');
  if (!roomIds.has(level.entry) || !roomIds.has(level.exit.room)) errors.push('invalid entry/exit');
  const pairs = new Set<string>();
  for (const e of level.edges) {
    const a = level.rooms.find((r) => r.id === e.a),
      b = level.rooms.find((r) => r.id === e.b);
    if (!a || !b || a === b) {
      errors.push(`invalid edge ${e.id}`);
      continue;
    }
    if (Math.abs(a.x - b.x) + Math.abs(a.z - b.z) !== 1) errors.push(`non-grid edge ${e.id}`);
    const pair = [e.a, e.b].sort().join(':');
    if (pairs.has(pair)) errors.push(`duplicate edge ${e.id}`);
    pairs.add(pair);
    if (e.gate && !level.switches.some((s) => s.id === e.gate))
      errors.push(`missing gate switch ${e.id}`);
    if (e.gate && distance(level, e.a, e.b, e.id) <= 1) errors.push(`ineffective shortcut ${e.id}`);
  }
  const surfaces = [level.exit, ...level.switches, ...level.mirrors];
  if (new Set(surfaces.map((s) => `${s.room}:${s.dir}`)).size !== surfaces.length)
    errors.push('overlapping surface objects');
  for (const s of surfaces) {
    const a = level.rooms.find((r) => r.id === s.room);
    if (!a || ![0, 1, 2, 3].includes(s.dir)) {
      errors.push('invalid surface');
      continue;
    }
    if (
      level.edges.some((e) => {
        const b = e.a === s.room ? e.b : e.b === s.room ? e.a : null;
        return b && sideOf(a, level.rooms.find((r) => r.id === b)!) === s.dir;
      })
    )
      errors.push(`surface obstructs opening ${s.room}:${s.dir}`);
  }
  if (new Set(level.switches.map((s) => s.id)).size !== level.switches.length)
    errors.push('duplicate switch');
  if (level.required.some((id) => !level.switches.some((s) => s.id === id)))
    errors.push('unknown required switch');
  if (
    level.rooms.some(
      (r) =>
        !Number.isInteger(r.x) ||
        !Number.isInteger(r.z) ||
        !Number.isFinite(distance(level, level.entry, r.id)),
    )
  )
    errors.push('unreachable room / invalid coordinate');
  const loops = level.edges.length - level.rooms.length + 1;
  if (loops < level.minLoops) errors.push(`expected ${level.minLoops} loops, found ${loops}`);
  if (!solve(level)) errors.push('unsolvable mechanism state graph');
  if (!level.design || !Number.isInteger(level.seed) || level.version < 1)
    errors.push('missing design/version/seed');
  return errors;
}
