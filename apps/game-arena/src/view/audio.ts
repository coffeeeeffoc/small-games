import type { CanvasGameTarget } from '@coffeeeeffoc/canvas-game-adapter';
import type { Duel } from '../domain/duel.js';

export function createArenaAudio(createSound?: CanvasGameTarget['createSound']) {
  const sounds = new Map<string, ReturnType<NonNullable<typeof createSound>>>();
  let enabled = true;
  let unlocked = false;
  return {
    unlock() {
      if (!unlocked)
        for (const name of ['night', 'rustle', 'hit', 'hurt', 'dodge', 'win', 'lose']) {
          const sound = createSound?.(`arena-audio/${name}.wav`, {
            loop: name === 'night',
            volume: name === 'night' ? 0.5 : 0.65,
          });
          if (sound) sounds.set(name, sound);
        }
      unlocked = true;
      if (enabled) sounds.get('night')?.play();
    },
    play(cue: Duel['cue']) {
      if (enabled && unlocked) sounds.get(cue)?.play();
    },
    mute(value: boolean) {
      enabled = !value;
      if (value) sounds.forEach((sound) => sound.stop());
      else if (unlocked) sounds.get('night')?.play();
    },
    dispose() {
      sounds.forEach((sound) => sound.dispose());
      sounds.clear();
    },
  };
}
