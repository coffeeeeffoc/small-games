import { WORLD, OBJECTS, PATROL, type Box, type InteractionId } from './world.js';
export { WORLD, OBJECTS, PATROL, type Box, type InteractionId } from './world.js';

export interface SceneState {
  seed: number;
  status: 'ready' | 'playing' | 'paused' | 'won' | 'lost';
  player: { x: number; z: number; yaw: number; pitch: number };
  objects: Box[];
  boss: {
    x: number;
    z: number;
    yaw: number;
    visible: boolean;
    mode: 'patrol' | 'investigate';
    waypoint: number;
  };
  elapsed: number;
  suspicion: number;
  crouched: boolean;
  holdingFile: boolean;
  coffeeTaken: boolean;
  printerCooldown: number;
  distractionLeft: number;
  feedback: string;
  score: number;
  distanceWalked: number;
}

export interface SceneInput {
  forward?: number;
  strafe?: number;
  turn?: number;
  pitch?: number;
  crouch?: boolean;
}

interface Point3 {
  x: number;
  z: number;
  y: number;
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const angle = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));
const finite = (value = 0) => (Number.isFinite(value) ? value : 0);

export function createScene(seed = 1): SceneState {
  const normalizedSeed = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 1;
  const start = normalizedSeed % PATROL.length;
  const position = PATROL[start]!;
  const next = PATROL[(start + 1) % PATROL.length]!;
  return {
    seed: normalizedSeed,
    status: 'ready',
    player: { x: 1.6, z: 1.5, yaw: 0, pitch: 0 },
    objects: OBJECTS.map((object) => ({ ...object })),
    boss: {
      ...position,
      yaw: Math.atan2(next.x - position.x, next.z - position.z),
      visible: false,
      mode: 'patrol',
      waypoint: (start + 1) % PATROL.length,
    },
    elapsed: 0,
    suspicion: 0,
    crouched: false,
    holdingFile: false,
    coffeeTaken: false,
    printerCooldown: 0,
    distractionLeft: 0,
    feedback: '周一 09:08。绕过老板，回到亮着绿灯的工位。',
    score: 0,
    distanceWalked: 0,
  };
}

export function eyeHeight(state: SceneState): number {
  return state.crouched ? WORLD.crouchingHeight : WORLD.standingHeight;
}

export function canOccupy(state: SceneState, x: number, z: number, radius = 0.24): boolean {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    x < radius ||
    z < radius ||
    x > WORLD.width - radius ||
    z > WORLD.depth - radius
  )
    return false;
  return !state.objects.some((box) => {
    const dx = x - clamp(x, box.x - box.w / 2, box.x + box.w / 2);
    const dz = z - clamp(z, box.z - box.d / 2, box.z + box.d / 2);
    return dx * dx + dz * dz < radius * radius;
  });
}

function intersectsBox(from: Point3, to: Point3, box: Box): boolean {
  let entry = 0;
  let exit = 1;
  const axes = [
    [from.x, to.x - from.x, box.x - box.w / 2, box.x + box.w / 2],
    [from.z, to.z - from.z, box.z - box.d / 2, box.z + box.d / 2],
    [from.y, to.y - from.y, 0, box.h],
  ];
  for (const [origin = 0, direction = 0, low = 0, high = 0] of axes) {
    if (Math.abs(direction) < 1e-8) {
      if (origin < low || origin > high) return false;
    } else {
      const a = (low - origin) / direction;
      const b = (high - origin) / direction;
      entry = Math.max(entry, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
      if (entry > exit) return false;
    }
  }
  return entry < 0.999 && exit > 0.001;
}

export function lineBlocked(state: SceneState, from: Point3, to: Point3): boolean {
  return state.objects.some((box) => intersectsBox(from, to, box));
}

export function canBossSeePlayer(state: SceneState): boolean {
  const { boss, player } = state;
  const dx = player.x - boss.x;
  const dz = player.z - boss.z;
  const distance = Math.hypot(dx, dz);
  if (distance > 9.5) return false;
  if (distance > 1.3 && Math.abs(angle(Math.atan2(dx, dz) - boss.yaw)) > 0.7) return false;
  return !lineBlocked(state, { ...boss, y: 1.72 }, { ...player, y: eyeHeight(state) });
}

export function targetInReach(state: SceneState): Box | null {
  if (state.status !== 'playing') return null;
  const { player } = state;
  const eye = { ...player, y: eyeHeight(state) };
  return (
    state.objects
      .filter(
        (box) =>
          box.interaction &&
          !(box.interaction === 'files' && state.holdingFile) &&
          !(box.interaction === 'coffee' && state.coffeeTaken),
      )
      .map((box) => ({ box, distance: Math.hypot(box.x - player.x, box.z - player.z) }))
      .sort((a, b) => a.distance - b.distance)
      .find(({ box, distance }) => {
        if (
          distance > 1.85 ||
          Math.abs(angle(Math.atan2(box.x - player.x, box.z - player.z) - player.yaw)) > 0.64
        )
          return false;
        const target = { x: box.x, z: box.z, y: box.h + 0.12 };
        if (Math.abs(Math.atan2(target.y - eye.y, distance) - player.pitch) > 0.65) return false;
        return !state.objects.some(
          (obstacle) => obstacle !== box && intersectsBox(eye, target, obstacle),
        );
      })?.box ?? null
  );
}

export function interact(state: SceneState): InteractionId | null {
  const target = targetInReach(state);
  if (!target?.interaction) return null;
  switch (target.interaction) {
    case 'files':
      state.holdingFile = true;
      state.feedback = '拿好文件。走动时更像在办事，靠老板太近仍会被识破。';
      break;
    case 'printer':
      if (state.printerCooldown > 0) {
        state.feedback = `打印机还在冷却，${Math.ceil(state.printerCooldown)} 秒后再试。`;
        return null;
      }
      state.distractionLeft = 12;
      state.printerCooldown = 25;
      state.boss.mode = 'investigate';
      state.feedback = '打印机开始吐纸！老板会被吸引 12 秒，趁现在绕过去。';
      break;
    case 'coffee':
      state.coffeeTaken = true;
      state.score += 75;
      state.suspicion = Math.min(99, state.suspicion + 12);
      state.feedback = '迟到也要带薪喝咖啡：+75 分。杯子碰出了声，快离开。';
      break;
    case 'computer':
      state.status = 'won';
      state.score += Math.round(
        200 + (WORLD.timeLimit - state.elapsed) * 3 + (100 - state.suspicion),
      );
      state.feedback = '成功混进工位！电脑亮起，老板以为你早就到了。';
      break;
  }
  return target.interaction;
}

function moveBoss(state: SceneState, dt: number): void {
  const { boss } = state;
  let target: { x: number; z: number };
  if (state.distractionLeft > 0) {
    boss.mode = 'investigate';
    // ponytail: one fixed printer route; add pathfinding when scenes gain movable furniture.
    target =
      boss.x > 7.25
        ? boss.z > 5.9 && boss.z < 8.6
          ? { x: 12, z: 9 }
          : { x: 7.2, z: boss.z }
        : Math.abs(boss.z - 7.2) > 0.08
          ? { x: 7.2, z: 7.2 }
          : { x: 5.1, z: 7.2 };
  } else {
    if (boss.mode === 'investigate') {
      boss.waypoint = 3;
      boss.mode = 'patrol';
    }
    target = PATROL[boss.waypoint]!;
  }
  const dx = target.x - boss.x;
  const dz = target.z - boss.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.06) {
    if (boss.mode === 'patrol') boss.waypoint = (boss.waypoint + 1) % PATROL.length;
    else boss.yaw += clamp(angle(-Math.PI / 2 - boss.yaw), -dt * 2, dt * 2);
    return;
  }
  boss.yaw += clamp(angle(Math.atan2(dx, dz) - boss.yaw), -dt * 2.6, dt * 2.6);
  const travel = Math.min(distance, (boss.mode === 'investigate' ? 1.8 : 1.2) * dt);
  const x = boss.x + (dx / distance) * travel;
  const z = boss.z + (dz / distance) * travel;
  if (canOccupy(state, x, boss.z, 0.22)) boss.x = x;
  if (canOccupy(state, boss.x, z, 0.22)) boss.z = z;
}

export function stepScene(state: SceneState, input: SceneInput, dt: number): void {
  if (state.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
  const duration = Math.min(dt, 0.1);
  const steps = Math.ceil(duration / (1 / 60));
  const tick = duration / steps;
  state.crouched = input.crouch ?? state.crouched;
  for (let index = 0; index < steps && state.status === 'playing'; index += 1) {
    const { player } = state;
    player.yaw = angle(player.yaw + finite(input.turn) * tick);
    player.pitch = clamp(player.pitch + finite(input.pitch) * tick, -0.7, 0.7);
    const forward = clamp(finite(input.forward), -1, 1);
    const strafe = clamp(finite(input.strafe), -1, 1);
    const scale = Math.max(1, Math.hypot(forward, strafe));
    const speed = ((state.crouched ? 1.9 : 3.1) * tick) / scale;
    const x = player.x + (Math.sin(player.yaw) * forward + Math.cos(player.yaw) * strafe) * speed;
    const z = player.z + (Math.cos(player.yaw) * forward - Math.sin(player.yaw) * strafe) * speed;
    const previousX = player.x;
    const previousZ = player.z;
    if (canOccupy(state, x, player.z)) player.x = x;
    if (canOccupy(state, player.x, z)) player.z = z;
    const movement = Math.hypot(player.x - previousX, player.z - previousZ);
    state.distanceWalked += movement;
    state.elapsed += tick;
    state.printerCooldown = Math.max(0, state.printerCooldown - tick);
    state.distractionLeft = Math.max(0, state.distractionLeft - tick);
    moveBoss(state, tick);
    state.boss.visible = canBossSeePlayer(state);
    if (state.boss.visible) {
      const nearby = Math.hypot(player.x - state.boss.x, player.z - state.boss.z) < 2.4;
      const disguise = state.holdingFile && movement > 0.001 && !nearby ? 0.24 : 1;
      state.suspicion = clamp(
        state.suspicion + (nearby ? 65 : 28) * disguise * (state.crouched ? 0.68 : 1) * tick,
        0,
        100,
      );
    } else {
      state.suspicion = Math.max(0, state.suspicion - tick * 12);
    }
    if (state.suspicion >= 100 || state.elapsed >= WORLD.timeLimit) {
      state.status = 'lost';
      state.feedback =
        state.suspicion >= 100
          ? '老板叫住了你：“怎么现在才来？” 换条路线再试一次。'
          : '早会开始了，你还没到工位。重新规划路线吧。';
    }
  }
}
