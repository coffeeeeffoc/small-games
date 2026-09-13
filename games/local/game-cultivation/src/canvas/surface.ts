import type { CanvasGameTarget, CanvasPointerEvent } from '@coffeeeeffoc/canvas-game-adapter';
import type { GameHost } from '@coffeeeeffoc/game-contract';
import type { CultivationContent } from '../content/schema.js';
import {
  action,
  chooseRelic,
  createTrial,
  interact,
  tickTrial,
  trialScore,
} from '../domain/trial.js';
import { emptyTrialRecord, loadTrialRecord, saveTrialResult } from '../adapter/trial-save.js';
import { drawTrial } from '../view/scene.js';
import { getButtons, type TrialUi } from '../view/ui.js';
import { createTrialSound } from '../view/sound.js';
import { createTrialInput } from './input.js';
export type CultivationCanvasTarget = CanvasGameTarget;
export type CultivationSurface = ReturnType<typeof createCultivationSurface>;

/** One live simulation, renderer and input controller for both Web and native Canvas. */
export function createCultivationSurface(
  target: CultivationCanvasTarget,
  content: CultivationContent,
  host: GameHost,
) {
  const context = target.canvas.getContext('2d');
  if (!context) throw new Error('当前设备无法使用 Canvas 2D');
  let state = createTrial(content.balance),
    disposed = false,
    last = Date.now(),
    lastCue = 0,
    publishTime = 0,
    settled = false;
  let runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let changed: (() => void) | undefined;
  let pendingSave: Promise<void> | null = null;
  let completion: { id: string; won: boolean; score: number } | null = null;
  const ui: TrialUi = {
    paused: false,
    hostPaused: false,
    muted: false,
    reduced: false,
    shake: true,
    time: 0,
    record: emptyTrialRecord,
    saving: false,
    notice: '',
    tapOnly: !target.onPointer,
  };
  const sound = createTrialSound(target.createSound);
  const input = createTrialInput(() => state, ui, command);
  let inputScene = state.scene;
  let inputPending = state.pending;
  function unlockSound() {
    if (!ui.paused && !ui.hostPaused) sound.unlock();
  }
  function render() {
    if (disposed) return;
    drawTrial(context!, state, ui, target.canvas.width, target.canvas.height, content.title);
  }
  function publish() {
    changed?.();
    render();
  }
  function save() {
    if (!completion || pendingSave) return;
    ui.saving = true;
    ui.notice = '';
    pendingSave = saveTrialResult(host, completion)
      .then((record) => {
        if (!disposed) {
          ui.record = record;
          ui.notice = '本次修行已保存';
        }
      })
      .catch(() => {
        if (!disposed) ui.notice = '本次未保存，可重试；不影响继续游玩';
      })
      .finally(() => {
        pendingSave = null;
        ui.saving = false;
        if (!disposed) publish();
      });
  }
  function command(id: string) {
    if (disposed || ui.hostPaused) return;
    if (id === 'mute') {
      ui.muted = !ui.muted;
      sound.mute(ui.muted);
    } else if (id === 'pause') {
      ui.paused = !ui.paused;
      input.cancel();
      last = Date.now();
      if (ui.paused) sound.pause();
    } else if (id === 'motion') {
      ui.reduced = !ui.reduced;
    } else if (id === 'shake') {
      ui.shake = !ui.shake;
    } else if (!ui.paused) {
      if (id === 'start') action(state, 'start');
      else if (id === 'restart' && !ui.saving) {
        input.cancel();
        state = createTrial(content.balance);
        action(state, 'start');
        runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        settled = false;
        completion = null;
        lastCue = 0;
        ui.notice = '';
      } else if (id === 'save') save();
      else if (id.startsWith('relic:')) chooseRelic(state, Number(id.split(':')[1]));
      else if (id === 'sword') {
        action(state, 'charge');
        action(state, 'release');
      } else if (id === 'interact') {
        interact(state, true);
        interact(state, false);
      } else if (id === 'dodge' || id === 'shield' || id === 'wood') action(state, id);
    }
    unlockSound();
    flush();
    publish();
  }
  function flush() {
    if (inputScene !== state.scene || inputPending !== state.pending) {
      input.cancel();
      inputScene = state.scene;
      inputPending = state.pending;
    }
    sound.scene(state.phase === 'won' ? 'cave' : state.scene);
    for (const cue of state.cues)
      if (cue.id > lastCue)
        sound.play(cue, state.scene === 'forest' && state.player.y > 650 && state.player.y < 820);
    lastCue = state.sequence;
    if (!settled && (state.phase === 'won' || state.phase === 'lost')) {
      settled = true;
      input.cancel();
      completion = { id: runId, won: state.phase === 'won', score: trialScore(state) };
      save();
    }
  }
  function pointer(event: CanvasPointerEvent) {
    if (disposed || ui.hostPaused) return;
    if (event.phase === 'down') unlockSound();
    input.pointer({
      ...event,
      x: (event.x * 480) / target.canvas.width,
      y: (event.y * 800) / target.canvas.height,
    });
    flush();
    publish();
  }
  const unsubscribe = target.onPointer
    ? target.onPointer(pointer)
    : target.onTap((x, y) => {
        unlockSound();
        input.tap((x * 480) / target.canvas.width, (y * 800) / target.canvas.height);
        flush();
        publish();
      });
  void loadTrialRecord(host)
    .then((record) => {
      if (!disposed && !settled) {
        ui.record = record;
        publish();
      }
    })
    .catch(() => {
      if (!disposed) {
        ui.notice = '存档暂不可用，本局仍可游玩';
        publish();
      }
    });
  render();
  const timer = setInterval(() => {
    const now = Date.now(),
      dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (disposed || ui.paused || ui.hostPaused) return;
    ui.time += dt;
    input.update();
    tickTrial(state, dt);
    flush();
    render();
    publishTime += dt;
    if (publishTime >= 0.1) {
      publishTime = 0;
      changed?.();
    }
  }, 1000 / 30);
  return {
    get state() {
      return state;
    },
    ui,
    get buttons() {
      return getButtons(state, ui);
    },
    command,
    pointer,
    subscribe(listener: () => void) {
      changed = listener;
      listener();
      return () => {
        changed = undefined;
      };
    },
    keyboard(code: string, down: boolean) {
      if (disposed || ui.hostPaused) return false;
      if (down) unlockSound();
      const result = input.keyboard(code, down);
      flush();
      publish();
      return result;
    },
    pause() {
      ui.hostPaused = true;
      input.cancel();
      sound.pause();
      publish();
    },
    resume() {
      ui.hostPaused = false;
      last = Date.now();
      publish();
    },
    blur() {
      ui.paused = true;
      input.cancel();
      sound.pause();
      publish();
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(timer);
      input.cancel();
      unsubscribe();
      sound.dispose();
      changed = undefined;
      context.clearRect(0, 0, target.canvas.width, target.canvas.height);
      await pendingSave;
    },
  };
}
