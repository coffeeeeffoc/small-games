import { KartConfig, angleDelta, clamp, type KartInput } from './KartConfig.ts';
import type { KartState } from './KartPhysics.ts';
import { projectOnTrack, type TrackData } from './TrackGenerator.ts';
import { racingTarget } from './RacingLine.ts';

export function aiInput(
  k: KartState,
  track: TrackData,
  shortcut = false,
  previousS?: number,
): KartInput {
  const road = projectOnTrack(track, k.x, k.z, previousS);
  const target = racingTarget(track, road.s, 7 + k.speed * 0.48, shortcut);
  const further = racingTarget(track, road.s, 17 + k.speed * 0.7, shortcut);
  const error = angleDelta(
    Math.atan2(target.x - k.x, target.z - k.z) -
      (k.drifting ? k.driftSide * KartConfig.driftAngle : 0),
    k.heading,
  );
  const curve = Math.abs(angleDelta(further.heading, road.heading));
  const steer = clamp(-error * 2.7, -1, 1);
  const targetSpeed = curve > 1.2 ? 16 : curve > 0.65 ? 22 : 30;
  const brake = k.speed > targetSpeed + 1.5;
  return {
    steer,
    throttle: 1,
    brake,
    drift: !brake && (k.drifting || Math.abs(error) > 0.2) && curve > 0.28 && k.tier < 2,
  };
}
