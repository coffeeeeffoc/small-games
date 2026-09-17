import { wrapDistance, type TrackData } from './TrackGenerator.ts';

export function createProgress(s: number) {
  return {
    s,
    distance: 0,
    nextGate: 0,
    laps: 0,
    lapStarted: 0,
    lapTimes: [] as number[],
    finishedAt: 0,
  };
}
export type Progress = ReturnType<typeof createProgress>;

/** Only nearby, forward road travel can open the next ordered gate. */
export function advanceCheckpoint(
  p: Progress,
  track: TrackData,
  s: number,
  maxStep: number,
  onRoad: boolean,
) {
  s = wrapDistance(s, track.length);
  let delta = s - p.s;
  if (delta > track.length / 2) delta -= track.length;
  if (delta < -track.length / 2) delta += track.length;
  if (!onRoad || Math.abs(delta) > maxStep || p.finishedAt) return false;
  const gates = track.checkpoints;
  const before = p.s;
  p.s = s;
  p.distance += delta;
  if (delta <= 0) return false;
  const crossed = (gate: number) =>
    wrapDistance(gate - before, track.length) <= delta + 0.001 &&
    wrapDistance(gate - before, track.length) > 0;
  if (p.nextGate < gates.length && crossed(gates[p.nextGate])) p.nextGate++;
  if (s < before) {
    const complete = p.nextGate === gates.length;
    p.nextGate = 0;
    return complete;
  }
  return false;
}
