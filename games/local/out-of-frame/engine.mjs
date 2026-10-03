/** Deterministic, renderer-independent simulation. Coordinates are world pixels. */
export const CONSTANTS = Object.freeze({
  width: 960,
  height: 540,
  frameWidth: 340,
  frameHeight: 270,
  tick: 1 / 60,
  gravity: 1200,
  moveSpeed: 205,
  jumpSpeed: 485,
  playerWidth: 26,
  playerHeight: 38,
});
export const FRAME = Object.freeze({ w: CONSTANTS.frameWidth, h: CONSTANTS.frameHeight });
const EPSILON = 0.001;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const overlap = (a, b) =>
  a.x < b.x + b.w - EPSILON &&
  a.x + a.w > b.x + EPSILON &&
  a.y < b.y + b.h - EPSILON &&
  a.y + a.h > b.y + EPSILON;
const horizontalOverlap = (a, b) => a.x < b.x + b.w - EPSILON && a.x + a.w > b.x + EPSILON;
export const snapshot = (state) => structuredClone(state);
export function restore(state, saved) {
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, snapshot(saved));
  return state;
}
export function isObserved(state, object) {
  const x = object.x + object.w / 2;
  const y = object.y + object.h / 2;
  return (
    x >= state.frame.x &&
    x <= state.frame.x + state.frame.w &&
    y >= state.frame.y &&
    y <= state.frame.y + state.frame.h
  );
}
export function moveFrame(state, x, y) {
  state.frame.x = clamp(Number.isFinite(x) ? x : state.frame.x, 0, CONSTANTS.width - state.frame.w);
  state.frame.y = clamp(
    Number.isFinite(y) ? y : state.frame.y,
    0,
    CONSTANTS.height - state.frame.h,
  );
  for (const object of state.objects) object.active = isObserved(state, object);
  return state.frame;
}
export function createState(level) {
  const state = {
    levelId: level.id,
    status: 'playing',
    time: 0,
    ticks: 0,
    jumpHeld: false,
    frame: { x: level.frame?.x ?? 0, y: level.frame?.y ?? 220, ...FRAME },
    player: {
      x: level.spawn.x,
      y: level.spawn.y,
      w: CONSTANTS.playerWidth,
      h: CONSTANTS.playerHeight,
      vx: 0,
      vy: 0,
      grounded: false,
      supportId: null,
      facing: 1,
      coyote: 0,
      jumpBuffer: 0,
    },
    objects: level.objects.map((object) => ({
      ...structuredClone(object),
      pathIndex: 1,
      direction: 1,
      active: false,
      dx: 0,
      dy: 0,
    })),
    switches: (level.switches ?? []).map((item) => ({ ...item, pressed: false })),
    gates: (level.gates ?? []).map((item) => ({ ...item, open: false })),
  };
  moveFrame(state, state.frame.x, state.frame.y);
  updateSwitches(state);
  return state;
}
function updateSwitches(state) {
  const weights = [state.player, ...state.objects];
  for (const plate of state.switches) {
    plate.pressed = weights.some((actor) => {
      const center = actor.x + actor.w / 2;
      const feet = actor.y + actor.h;
      return (
        center >= plate.x &&
        center <= plate.x + plate.w &&
        feet >= plate.y - 2 &&
        feet <= plate.y + plate.h + 2
      );
    });
  }
  for (const gate of state.gates)
    gate.open = gate.requires.every(
      (id) => state.switches.find((plate) => plate.id === id)?.pressed,
    );
}
function advanceObject(object, dt) {
  object.dx = 0;
  object.dy = 0;
  if (!object.active || object.path.length < 2) return;
  const oldX = object.x;
  const oldY = object.y;
  let remaining = object.speed * dt;
  // A bounded loop also tolerates duplicate waypoints in future room data.
  let guard = object.path.length * 4;
  while (remaining > EPSILON && guard-- > 0) {
    const target = object.path[object.pathIndex];
    const dx = target.x - object.x;
    const dy = target.y - object.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= remaining) {
      object.x = target.x;
      object.y = target.y;
      remaining -= distance;
      if (object.pathIndex === object.path.length - 1) object.direction = -1;
      else if (object.pathIndex === 0) object.direction = 1;
      object.pathIndex += object.direction;
    } else {
      object.x += (dx / distance) * remaining;
      object.y += (dy / distance) * remaining;
      remaining = 0;
    }
  }
  object.dx = object.x - oldX;
  object.dy = object.y - oldY;
  if (object.dx) object.facing = Math.sign(object.dx);
}
function colliders(level, state) {
  return [
    ...level.solids.map((solid, index) => ({ ...solid, id: solid.id ?? `solid-${index}` })),
    ...state.gates.filter((gate) => !gate.open),
    ...state.objects,
  ];
}
/** Call at a fixed 60 Hz. A shorter dt is supported for focused physics tests. */
export function step(level, state, input = {}, dt = CONSTANTS.tick) {
  if (state.status !== 'playing') return state;
  if (!(dt > 0 && dt <= 1 / 30))
    throw new RangeError(
      'step dt must be positive and at most 1/30; use a fixed-step accumulator.',
    );
  state.time += dt;
  state.ticks += 1;
  const player = state.player;
  for (const object of state.objects) {
    object.active = isObserved(state, object);
    advanceObject(object, dt);
    object.active = isObserved(state, object);
  }
  updateSwitches(state);
  const solids = colliders(level, state);
  const support = state.objects.find((object) => object.id === player.supportId);
  const carryX = player.grounded && support ? support.dx : 0;
  const carryY = player.grounded && support ? support.dy : 0;
  const axis = Number(Boolean(input.right)) - Number(Boolean(input.left));
  player.vx = axis * CONSTANTS.moveSpeed;
  if (axis) player.facing = axis;
  if (player.grounded) player.coyote = 0.1;
  else player.coyote = Math.max(0, player.coyote - dt);
  if (input.jump && !state.jumpHeld) player.jumpBuffer = 0.1;
  else player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
  state.jumpHeld = Boolean(input.jump);
  const jumping = player.jumpBuffer > 0 && player.coyote > 0;
  if (jumping) {
    player.vy = -CONSTANTS.jumpSpeed;
    player.coyote = 0;
    player.jumpBuffer = 0;
    player.grounded = false;
    player.supportId = null;
  }
  const dx = player.vx * dt + carryX;
  const previousX = player.x;
  player.x = clamp(player.x + dx, 0, CONSTANTS.width - player.w);
  for (const solid of solids) {
    // The old support may rise into the previous feet position before a jump.
    // It remains a vertical contact, never a side wall during takeoff.
    if (solid.id === support?.id) continue;
    if (solid.kind && player.y + player.h <= solid.y - (solid.dy ?? 0) + EPSILON) continue;
    if (!overlap(player, solid)) continue;
    const oldSolidX = solid.x - (solid.dx ?? 0);
    // Resolve from the previous side, including a machine moving into a still
    // player. A gate closing around the player pushes to the nearest side.
    if (previousX + player.w <= oldSolidX + EPSILON) player.x = solid.x - player.w;
    else if (previousX >= oldSolidX + solid.w - EPSILON) player.x = solid.x + solid.w;
    else if (previousX + player.w / 2 < oldSolidX + solid.w / 2) player.x = solid.x - player.w;
    else player.x = solid.x + solid.w;
  }
  // Carry precedes gravity, preserving the same contact point on a moving lift.
  const previousBottom = player.y + player.h;
  const previousTop = player.y;
  player.y += carryY;
  player.vy += CONSTANTS.gravity * dt;
  player.y += player.vy * dt;
  player.grounded = false;
  player.supportId = null;
  for (const solid of solids) {
    if (!horizontalOverlap(player, solid)) continue;
    const solidOldY = solid.y - (solid.dy ?? 0);
    if (
      player.vy >= 0 &&
      previousBottom <= solidOldY + Math.max(0, carryY) + 2 &&
      player.y + player.h >= solid.y &&
      player.y < solid.y + solid.h
    ) {
      player.y = solid.y - player.h;
      player.vy = 0;
      player.grounded = true;
      player.supportId = solid.id;
    } else if (
      player.vy < 0 &&
      previousTop >= solidOldY + solid.h - EPSILON &&
      player.y < solid.y + solid.h &&
      player.y + player.h > solid.y
    ) {
      player.y = solid.y + solid.h;
      player.vy = 0;
    }
  }
  updateSwitches(state);
  if (
    player.y > CONSTANTS.height + 40 ||
    (level.hazards ?? []).some((hazard) => overlap(player, hazard))
  )
    state.status = 'lost';
  else if (overlap(player, level.exit) && state.gates.every((gate) => gate.open))
    state.status = 'won';
  return state;
}
