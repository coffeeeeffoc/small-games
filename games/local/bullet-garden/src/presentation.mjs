import { normalAimTarget } from './simulation.mjs';

// Source rectangles measured on hero-motion.png; the painted sheet has uneven gutters.
export const HERO_FRAMES = [
  [45,63,184,171], [280,64,168,170], [496,57,141,181], [686,63,164,172], [896,63,174,171], [1125,63,165,172], [1357,60,158,176], [1580,62,172,172],
  [49,267,181,178], [278,266,171,177], [493,260,145,186], [688,266,162,179], [895,267,175,178], [1123,266,169,179], [1357,264,157,182], [1580,266,173,179],
  [46,477,185,173], [278,476,169,176], [491,466,149,188], [685,475,166,177], [896,476,176,176], [1123,473,171,177], [1356,471,162,182], [1580,475,173,176],
  [47,676,182,180], [278,677,170,178], [492,671,148,185], [689,674,162,182], [895,676,176,180], [1123,676,170,180], [1358,673,158,183], [1579,677,174,179],
];

export function gardenCamera(bounds, battle) {
  const zoom = Math.min((battle.w - 48) / (bounds.right - bounds.left), (battle.h - 64) / (bounds.bottom - bounds.top));
  return { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 - 16 / zoom, zoom };
}

export function createHeroMotion(state) {
  return { x: state.player.x, y: state.player.y, time: state.time, shots: state.stats.shots,
    angle: state.player.angle, shotAngle: state.player.angle, shotAt: -1, stride: 0,
    direction: 0, frame: 1, moving: false, recoil: 0, flash: false, lean: 0 };
}

export function advanceHeroMotion(motion, state) {
  const dt = Math.max(0, Math.min(0.1, state.time - motion.time));
  if (dt === 0) return motion;
  const dx = state.player.x - motion.x, dy = state.player.y - motion.y;
  const distance = Math.hypot(dx, dy);
  const target = normalAimTarget(state);
  let angle = target ? Math.atan2(target.y - state.player.y, target.x - state.player.x) : state.player.angle;
  const fired = state.stats.shots > motion.shots;
  if (fired) {
    motion.shotAt = state.time;
    motion.shotAngle = state.lastShot?.angle ?? state.player.angle;
    angle = motion.shotAngle;
  }
  const turn = Math.atan2(Math.sin(angle - motion.angle), Math.cos(angle - motion.angle));
  // Anticipate the target between shots; at discharge the pose must match the actual barrel direction.
  motion.angle += fired ? turn : Math.max(-dt * 14, Math.min(dt * 14, turn));
  motion.direction = (Math.round(motion.angle / (Math.PI / 4)) % 8 + 8) % 8;
  motion.moving = distance > 0.05;
  if (motion.moving) {
    const backwards = dx * Math.cos(motion.angle) + dy * Math.sin(motion.angle) < 0;
    motion.stride += distance * (backwards ? -1 : 1);
  }
  motion.frame = motion.moving ? (Math.floor(motion.stride / 22) % 4 + 4) % 4 : 1;
  motion.lean += ((motion.moving ? Math.max(-3, Math.min(3, -dx / dt / 80)) : 0) - motion.lean) * Math.min(1, dt * 16);
  const age = state.time - motion.shotAt;
  motion.recoil = motion.shotAt >= 0 && age < 0.18 ? 2.5 * Math.exp(-age * 24) : 0;
  motion.flash = motion.shotAt >= 0 && age < 0.065;
  Object.assign(motion, { x: state.player.x, y: state.player.y, time: state.time, shots: state.stats.shots });
  return motion;
}
