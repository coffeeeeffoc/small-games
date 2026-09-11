import { getNativeControls, drawNative } from './native.js';
export { getNativeControls } from './native.js';
import type { CanvasGameTarget, CanvasSound } from '@coffeeeeffoc/canvas-game-adapter';
import type { GameHost } from '@coffeeeeffoc/game-contract';
import { createScene, interact, stepScene, type SceneState } from './model.js';
import { createOfficeRenderer } from './render.js';
import { readOfficeRecord, saveOfficeRecord } from './save.js';

export type OfficeView = {
  state: SceneState;
  best: number;
  sound: boolean;
  saving: string;
  hostPaused: boolean;
};
export type OfficeAction = 'start' | 'pause' | 'resume' | 'retry' | 'interact' | 'crouch' | 'sound';
export function mountOfficeScene(
  target: CanvasGameTarget,
  host: GameHost,
  onView?: (view: OfficeView) => void,
  seed = 20260912,
) {
  const context = target.canvas.getContext('2d');
  if (!context) throw new Error('当前环境无法绘制办公室，请启用 Canvas 后重试。');
  const paint = createOfficeRenderer();
  let state = createScene(seed);
  let best = 0,
    sound = true,
    saving = '',
    hostPaused = false,
    disposed = false,
    lastTime = Date.now(),
    lastPublish = 0;
  let forward = 0,
    strafe = 0,
    turn = 0,
    pitch = 0;
  let settled = false;
  let run = 0;
  let pendingSave: Promise<void> | undefined;
  const sounds = new Map<string, CanvasSound>();
  let roomPlaying = false,
    lastStep = 0;
  const pointers = new Map<number, { x: number; y: number; role: 'move' | 'look' }>();
  const getView = (): OfficeView => ({ state, best, sound, saving, hostPaused });
  const clearInput = () => {
    forward = strafe = turn = pitch = 0;
    pointers.clear();
  };
  const stopAudio = () => {
    sounds.forEach((audio) => audio.stop());
    roomPlaying = false;
  };
  const play = (name: string) => {
    if (sound && !hostPaused) {
      try {
        sounds.get(name)?.play();
      } catch {
        /* Visual cues cover unavailable audio. */
      }
    }
  };
  function initializeAudio() {
    if (sounds.size || !target.createSound) return;
    for (const name of ['room', 'steps', 'contact', 'keyboard', 'relief', 'buzz']) {
      try {
        sounds.set(
          name,
          target.createSound(`office-scene/audio/${name}.wav`, {
            loop: name === 'room',
            volume: name === 'room' ? 0.2 : 0.45,
          }),
        );
      } catch {
        /* Audio is optional. */
      }
    }
  }
  function publish(force = false) {
    if (disposed) return;
    paint(context!, target.canvas.width, target.canvas.height, state);
    if (!onView) drawNative(context!, target.canvas.width, target.canvas.height, getView());
    if (force || Date.now() - lastPublish > 100) {
      lastPublish = Date.now();
      onView?.(getView());
    }
  }
  function settle() {
    if (settled || state.status !== 'won') return;
    settled = true;
    best = Math.max(best, state.score);
    saving = '正在保存成绩';
    const score = state.score;
    const resultRun = run;
    pendingSave = (pendingSave ?? Promise.resolve())
      .then(() => saveOfficeRecord(host, { version: 2, bestScore: score, cleared: true }))
      .then((value) => {
        best = Math.max(best, value.bestScore);
        if (run === resultRun) saving = '成绩已保存';
      })
      .catch(() => {
        if (run === resultRun) saving = '成绩暂未保存，可重试保存';
      })
      .finally(() => {
        publish(true);
      });
  }
  function action(id: OfficeAction) {
    if (disposed || hostPaused) return;
    if (id === 'sound') {
      sound = !sound;
      if (!sound) stopAudio();
      else initializeAudio();
    } else if (id === 'start' && state.status === 'ready') {
      state.status = 'playing';
      initializeAudio();
      lastTime = Date.now();
    } else if (id === 'pause' && state.status === 'playing') {
      state.status = 'paused';
      clearInput();
      stopAudio();
    } else if (id === 'resume' && state.status === 'paused') {
      state.status = 'playing';
      lastTime = Date.now();
    } else if (id === 'retry') {
      state = createScene(state.seed);
      run++;
      saving = '';
      lastStep = 0;
      settled = false;
      clearInput();
      stopAudio();
    } else if (id === 'crouch' && state.status === 'playing') state.crouched = !state.crouched;
    else if (id === 'interact' && state.status === 'playing') {
      const value = interact(state);
      if (value)
        play(value === 'printer' ? 'keyboard' : value === 'computer' ? 'relief' : 'contact');
      settle();
    }
    publish(true);
  }
  const findControl = (x: number, y: number) =>
    getNativeControls(getView(), target.canvas.width, target.canvas.height).find(
      (b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h,
    );
  const stopTap = onView
    ? () => {}
    : target.onTap((x, y) => {
        const button = findControl(x, y);
        if (button) action(button.id);
      });
  const stopPointer = target.onPointer?.((event) => {
    if (hostPaused || state.status !== 'playing') return;
    if (event.phase === 'down') {
      if (!onView && findControl(event.x, event.y)) return;
      const role =
        event.x < target.canvas.width * 0.36 && event.y > target.canvas.height * 0.58
          ? 'move'
          : 'look';
      if ([...pointers.values()].some((pointer) => pointer.role === role)) return;
      pointers.set(event.pointerId, { x: event.x, y: event.y, role });
    } else {
      const pointer = pointers.get(event.pointerId);
      if (!pointer) return;
      if (event.phase === 'up' || event.phase === 'cancel') {
        if (pointer.role === 'move') forward = strafe = 0;
        pointers.delete(event.pointerId);
        return;
      }
      const dx = event.x - pointer.x,
        dy = event.y - pointer.y;
      if (pointer.role === 'move') {
        const radius = Math.max(28, target.canvas.width * 0.08);
        strafe = Math.max(-1, Math.min(1, dx / radius));
        forward = Math.max(-1, Math.min(1, -dy / radius));
      } else {
        look((dx / target.canvas.width) * 2.5, (-dy / target.canvas.height) * 1.8);
        pointer.x = event.x;
        pointer.y = event.y;
      }
    }
  });
  function look(yaw: number, vertical: number) {
    if (
      disposed ||
      hostPaused ||
      state.status !== 'playing' ||
      !Number.isFinite(yaw) ||
      !Number.isFinite(vertical)
    )
      return;
    state.player.yaw = Math.atan2(
      Math.sin(state.player.yaw + yaw),
      Math.cos(state.player.yaw + yaw),
    );
    state.player.pitch = Math.max(-0.75, Math.min(0.75, state.player.pitch + vertical));
  }
  const timer = setInterval(() => {
    const now = Date.now(),
      dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    if (disposed || hostPaused || state.status !== 'playing') return;
    stepScene(state, { forward, strafe, turn, pitch, crouch: state.crouched }, dt);
    if (sound) {
      if (!roomPlaying) {
        play('room');
        roomPlaying = true;
      }
      if (state.distanceWalked - lastStep > 0.8) {
        play('steps');
        lastStep = state.distanceWalked;
      }
    }
    if (getView().state.status === 'lost') {
      clearInput();
      stopAudio();
      play('buzz');
    }
    settle();
    publish(getView().state.status !== 'playing');
  }, 1000 / 30);
  void readOfficeRecord(host)
    .then((record) => {
      if (!disposed) {
        best = Math.max(best, record.value.bestScore);
        publish(true);
      }
    })
    .catch(() => {
      if (!disposed) {
        saving = '存档暂不可用，本局仍可游玩';
        publish(true);
      }
    });
  publish(true);
  return {
    getView,
    action,
    look,
    move(nextForward: number, nextStrafe: number, nextTurn = 0, nextPitch = 0) {
      if (!hostPaused && !disposed && state.status === 'playing') {
        forward = nextForward;
        strafe = nextStrafe;
        turn = nextTurn;
        pitch = nextPitch;
      }
    },
    redraw() {
      publish(true);
    },
    newWeek(nextSeed: number) {
      if (disposed || hostPaused) return;
      state = createScene(nextSeed);
      run++;
      saving = '';
      lastStep = 0;
      settled = false;
      clearInput();
      stopAudio();
      publish(true);
    },
    async retrySave() {
      if (state.status === 'won') {
        settled = false;
        settle();
        await pendingSave;
      }
    },
    pause() {
      if (disposed) return;
      hostPaused = true;
      clearInput();
      stopAudio();
      publish(true);
    },
    resume() {
      if (disposed) return;
      hostPaused = false;
      lastTime = Date.now();
      publish(true);
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(timer);
      clearInput();
      stopTap();
      stopPointer?.();
      stopAudio();
      sounds.forEach((audio) => audio.dispose());
      sounds.clear();
      context!.clearRect(0, 0, target.canvas.width, target.canvas.height);
      await pendingSave;
    },
  };
}
export type OfficeRuntime = ReturnType<typeof mountOfficeScene>;
