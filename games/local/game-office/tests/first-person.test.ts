import { describe, expect, it } from 'vitest';
import {
  canBossSeePlayer,
  canOccupy,
  createScene,
  interact,
  lineBlocked,
  stepScene,
  targetInReach,
  WORLD,
  type SceneState,
} from '../src/first-person/model';

function playing(seed = 1): SceneState {
  const state = createScene(seed);
  state.status = 'playing';
  return state;
}

function walk(state: SceneState, x: number, z: number, crouch = false): void {
  for (let frame = 0; frame < 2_000; frame += 1) {
    const distance = Math.hypot(x - state.player.x, z - state.player.z);
    if (distance < 0.045 || state.status !== 'playing') return;
    state.player.yaw = Math.atan2(x - state.player.x, z - state.player.z);
    stepScene(state, { forward: 1, crouch }, Math.min(1 / 60, distance / (crouch ? 1.9 : 3.1)));
  }
  throw new Error(`Route blocked at ${state.player.x}, ${state.player.z} toward ${x}, ${z}`);
}

describe('first-person Monday arrival', () => {
  it('shares solid furniture with the renderer and cannot tunnel through furniture or walls', () => {
    const state = playing();
    expect(canOccupy(state, 4, 3.5)).toBe(false);
    expect(canOccupy(state, 0.1, 1)).toBe(false);
    expect(canOccupy(state, 0.6, 4.7)).toBe(false);
    state.player = { x: 3, z: 3.5, yaw: Math.PI / 2, pitch: 0 };
    for (let frame = 0; frame < 100; frame += 1) stepScene(state, { forward: 1 }, 100);
    expect(state.player.x).toBeLessThanOrEqual(3.35 - 0.24);
    expect(canOccupy(state, state.player.x, state.player.z)).toBe(true);
  });

  it('uses 3D cover: standing is visible above a screen; crouching hides behind it', () => {
    const state = playing();
    state.objects = [
      { id: 'cover', kind: 'screen', x: 7, z: 7, w: 3, d: 0.2, h: 1.4, color: '#777' },
    ];
    state.boss = { ...state.boss, x: 7, z: 4.4, yaw: 0 };
    state.player = { x: 7, z: 8, yaw: 0, pitch: 0 };
    expect(canBossSeePlayer(state)).toBe(true);
    state.crouched = true;
    expect(canBossSeePlayer(state)).toBe(false);
    state.objects[0]!.h = 2.25;
    state.crouched = false;
    expect(canBossSeePlayer(state)).toBe(false);
    expect(lineBlocked(state, { x: 7, z: 4.4, y: 1.7 }, { x: 7, z: 8, y: 1.65 })).toBe(true);
    state.objects = [];
    state.boss.yaw = Math.PI;
    expect(canBossSeePlayer(state)).toBe(false);
  });

  it('requires proximity, facing, and an unobstructed reach for interactions', () => {
    const state = playing();
    expect(targetInReach(state)).toBeNull();
    expect(interact(state)).toBeNull();
    state.player.yaw = Math.PI / 2;
    expect(targetInReach(state)?.id).toBe('files');
    state.player.pitch = 0.7;
    expect(interact(state)).toBeNull();
    state.player.pitch = 0;
    state.objects.push({
      id: 'barrier',
      kind: 'cabinet',
      x: 2.05,
      z: 1.5,
      w: 0.1,
      d: 2,
      h: 2.2,
      color: '#777',
    });
    expect(interact(state)).toBeNull();
    state.objects.pop();
    expect(interact(state)).toBe('files');
    expect(state.holdingFile).toBe(true);
    expect(interact(state)).toBeNull();
    state.player = { x: 11.5, z: 15.3, yaw: Math.PI, pitch: 0 };
    expect(interact(state)).toBeNull();
    state.player.yaw = 0;
    state.crouched = true;
    state.player.pitch = -0.7;
    expect(interact(state)).toBeNull();
    state.player.pitch = 0;
    expect(interact(state)).toBe('computer');
    expect(state.status).toBe('won');
  });

  it('allows a continuous covered route for every patrol starting phase', () => {
    for (let seed = 0; seed < 10; seed += 1) {
      const state = playing(seed);
      walk(state, 1.6, 15.3, true);
      walk(state, 11.5, 15.3, true);
      state.player.yaw = 0;
      expect(interact(state), `seed ${seed}`).toBe('computer');
      expect(state.status).toBe('won');
      expect(state.distanceWalked).toBeGreaterThan(23);
      expect(state.elapsed).toBeLessThan(WORLD.timeLimit);
    }
  });

  it('allows a second route using papers and a printer diversion through the central aisle', () => {
    const state = playing();
    state.player.yaw = Math.PI / 2;
    expect(interact(state)).toBe('files');
    walk(state, 1.6, 7.2);
    walk(state, 2.8, 7.2);
    state.player.yaw = Math.PI / 2;
    expect(interact(state)).toBe('printer');
    expect(state.distractionLeft).toBe(12);
    expect(interact(state)).toBeNull();
    walk(state, 2.8, 9);
    walk(state, 7.2, 9);
    walk(state, 7.2, 15.3);
    walk(state, 11.5, 15.3);
    state.player.yaw = 0;
    expect(interact(state)).toBe('computer');
    expect(state.status).toBe('won');
    expect(state.holdingFile).toBe(true);
  });

  it('draws every patrol phase toward the printer without crossing furniture, then resumes patrol', () => {
    for (let seed = 0; seed < 5; seed += 1) {
      const state = playing(seed);
      state.player = { x: 2.8, z: 7.2, yaw: Math.PI / 2, pitch: 0 };
      expect(interact(state)).toBe('printer');
      state.player = { x: 1.6, z: 1.5, yaw: 0, pitch: 0 };
      for (let frame = 0; frame < 11 * 60; frame += 1) {
        stepScene(state, {}, 1 / 60);
        expect(canOccupy(state, state.boss.x, state.boss.z, 0.22)).toBe(true);
      }
      expect(Math.hypot(state.boss.x - 5.1, state.boss.z - 7.2)).toBeLessThan(0.2);
      expect(state.boss.mode).toBe('investigate');
      for (let frame = 0; frame < 2 * 60; frame += 1) stepScene(state, {}, 1 / 60);
      expect(state.distractionLeft).toBe(0);
      expect(state.boss.mode).toBe('patrol');
    }
    const state = playing();
    state.player = { x: 10.7, z: 5.8, yaw: 0, pitch: 0 };
    expect(interact(state)).toBe('coffee');
    expect(state.score).toBe(75);
    expect(state.suspicion).toBe(12);
    expect(interact(state)).toBeNull();
  });

  it('disguise helps while walking, but a stationary player and close contact are still detected', () => {
    function exposed(file: boolean, move: boolean): number {
      const state = playing(0);
      state.objects = [];
      state.boss = { ...state.boss, x: 6.6, z: 4.4, yaw: Math.PI / 2, waypoint: 1 };
      state.player = { x: 10.5, z: 4.4, yaw: Math.PI / 2, pitch: 0 };
      state.holdingFile = file;
      for (let frame = 0; frame < 30; frame += 1)
        stepScene(state, { forward: move ? 0.2 : 0 }, 1 / 60);
      return state.suspicion;
    }
    expect(exposed(true, true)).toBeLessThan(exposed(false, true) / 2);
    expect(exposed(true, false)).toBeGreaterThan(exposed(true, true) * 2);
    const state = playing(0);
    state.objects = [];
    state.player = { x: 7.5, z: 4.4, yaw: 0, pitch: 0 };
    state.holdingFile = true;
    for (let frame = 0; frame < 150; frame += 1) stepScene(state, {}, 1 / 60);
    expect(state.status).toBe('lost');
    expect(state.suspicion).toBe(100);
  });

  it('ends on timeout, freezes inactive states, sanitizes delta/input, and creates a clean replay', () => {
    const state = playing();
    state.elapsed = WORLD.timeLimit - 0.01;
    stepScene(state, {}, 1 / 60);
    expect(state.status).toBe('lost');
    for (const status of ['ready', 'paused', 'won', 'lost'] as const) {
      state.status = status;
      const before = JSON.stringify(state);
      stepScene(state, { forward: 1, turn: 1 }, 0.1);
      expect(JSON.stringify(state)).toBe(before);
      expect(interact(state)).toBeNull();
    }
    const replay = playing();
    stepScene(replay, { forward: NaN, turn: Infinity }, NaN);
    expect(replay.elapsed).toBe(0);
    stepScene(replay, { forward: 1 }, 1_000);
    expect(replay.elapsed).toBeLessThanOrEqual(0.101);
    expect(replay.player.z).toBeLessThan(2);
    expect(createScene(1)).toEqual(createScene(1));
    expect(createScene(2).boss).not.toEqual(createScene(1).boss);
    expect(createScene().score).toBe(0);
    expect(createScene().holdingFile).toBe(false);
  });
});
