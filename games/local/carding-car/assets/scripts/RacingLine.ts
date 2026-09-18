import { pointAt, wrapDistance, type TrackData } from './TrackGenerator.ts';
export function racingTarget(track: TrackData, s: number, lookAhead: number, shortcut: boolean) {
  if (!shortcut) return pointAt(track, s + lookAhead);
  // Convert to travelled metres before looking ahead, including across both junctions.
  const { shortcutStart: start, shortcutEnd: end, shortcutLength } = track;
  const ratio = (end - start) / shortcutLength;
  const saved = end - start - shortcutLength;
  s = wrapDistance(s, track.length);
  const travelled = s < start ? s : s < end ? start + (s - start) / ratio : s - saved;
  const target = wrapDistance(travelled + lookAhead, track.length - saved);
  return pointAt(
    track,
    target < start
      ? target
      : target < start + shortcutLength
        ? start + (target - start) * ratio
        : target + saved,
    true,
  );
}
