import type { CanvasGameTarget, CanvasSound } from '@coffeeeeffoc/canvas-game-adapter';
import type { Cue } from '../domain/trial.js';
import type { Scene } from '../domain/world.js';
/** Both hosts play the same packaged audio; no SDK or network service enters gameplay. */
export function createTrialSound(createSound?: CanvasGameTarget['createSound']) {
  const sounds = new Map<string, CanvasSound>();
  let enabled = true,
    unlocked = false,
    active = false;
  let scene: Scene = 'cave';
  return {
    unlock() {
      if (!unlocked) {
        for (const name of [
          'cave',
          'forest',
          'summit',
          'sword',
          'hit',
          'stone',
          'hurt',
          'dodge',
          'qi',
          'scatter',
          'bell',
          'thunder',
          'fox',
          'win',
          'lose',
          'step',
          'water',
        ]) {
          try {
            const sound = createSound?.(`trial-audio/${name}.wav`, {
              loop: ['cave', 'forest', 'summit'].includes(name),
              volume: ['cave', 'forest', 'summit'].includes(name) ? 0.45 : 0.65,
            });
            if (sound) sounds.set(name, sound);
          } catch {
            /* Missing audio never prevents play. */
          }
        }
        unlocked = true;
      }
      if (!active && enabled) sounds.get(scene)?.play();
      active = true;
    },
    scene(next: Scene) {
      if (next === scene) return;
      sounds.get(scene)?.stop();
      scene = next;
      if (enabled && active) sounds.get(scene)?.play();
    },
    play(cue: Cue, inWater = false) {
      if (enabled && active)
        sounds.get(cue.kind === 'step' && inWater ? 'water' : cue.kind)?.play();
    },
    mute(value: boolean) {
      enabled = !value;
      if (value) sounds.forEach((sound) => sound.stop());
      else if (active) sounds.get(scene)?.play();
    },
    pause() {
      active = false;
      sounds.forEach((sound) => sound.stop());
    },
    dispose() {
      active = false;
      sounds.forEach((sound) => sound.dispose());
      sounds.clear();
    },
  };
}
