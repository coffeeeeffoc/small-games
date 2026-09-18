/** Metres, seconds and radians; the same tuning applies to every driver. */
export const KartConfig = {
  acceleration: 16,
  maxSpeed: 30,
  brake: 34,
  steering: 1.75,
  highSpeedSteering: 0.82,
  grip: 9,
  lateralFriction: 4,
  driftGrip: 5.5,
  driftSteering: 1.25,
  driftAngle: 0.3,
  driftMinSpeed: 9,
  chargeThresholds: [0.45, 1.1],
  boostDurations: [0.65, 1.1],
  boostSpeed: 1.34,
  boostAcceleration: 28,
  drag: 0.017,
  collisionResponse: 0.65,
  collisionHalfWidth: 1.12,
  collisionHalfLength: 1.65,
  recoverySeconds: 1,
  cameraLag: 6,
  cameraFov: 62,
  cameraBoostFov: 70,
  cameraShake: 0.08,
  gravity: 22,
  laps: 3,
} as const;

export type KartInput = { steer: number; throttle: number; brake: boolean; drift: boolean };
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
