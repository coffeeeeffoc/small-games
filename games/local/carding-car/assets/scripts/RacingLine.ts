import { pointAt, type TrackData } from './TrackGenerator.ts';
export function racingTarget(track: TrackData, s: number, lookAhead: number, shortcut: boolean) {
  // Progress on the narrow branch uses the main road's distance, so ranking stays comparable.
  const ratio =
    shortcut && s >= track.shortcutStart && s < track.shortcutEnd
      ? (track.shortcutEnd - track.shortcutStart) / track.shortcutLength
      : 1;
  return pointAt(track, s + lookAhead * ratio, shortcut);
}
