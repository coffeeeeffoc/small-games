import type { CanvasGameTarget, CanvasSound } from '@coffeeeeffoc/canvas-game-adapter';
import type { OfficeSampleState } from './model.js';
import { sceneManifest } from './scene.js';

/** Foley follows pose contact events; muting never changes the simulation. */
export function sampleAudio(target: CanvasGameTarget) {
  const sounds = new Map<string, CanvasSound>();
  const loops = new Set<string>();
  let footfall = -1;
  const stop = () => {
    sounds.forEach((item) => item.stop());
    loops.clear();
    footfall = -1;
  };
  function play(name: string) {
    try {
      sounds.get(name)?.play();
    } catch {
      /* Captions remain available without sound. */
    }
  }
  function initialize() {
    if (sounds.size || !target.createSound) return;
    for (const name of [
      'room',
      'steps',
      'keyboard',
      'mouse',
      'phone',
      'contact',
      'chair',
      'buzz',
      'ring',
      'breath',
      'tension',
      'relief',
    ]) {
      try {
        sounds.set(
          name,
          target.createSound(`office-scene/audio/${name}.wav`, {
            loop: ['room', 'keyboard', 'tension'].includes(name),
            volume: name === 'tension' ? 0.3 : name === 'room' ? 0.7 : 0.55,
          }),
        );
      } catch {
        /* Audio capability is optional on both shells. */
      }
    }
  }
  function sync(
    previous: OfficeSampleState,
    state: OfficeSampleState,
    enabled: boolean,
    phaseTime: number,
  ) {
    if (!enabled || state.status === 'paused') return stop();
    const active = state.status === 'playing';
    const enabledLoops: Record<string, boolean> = {
      room: active,
      keyboard: active && state.pc === 'work' && state.phone === 'working' && state.boss === 'safe',
      tension: active && ['warning', 'approach', 'inspect', 'question'].includes(state.boss),
    };
    for (const [name, on] of Object.entries(enabledLoops)) {
      if (on && !loops.has(name)) {
        play(name);
        loops.add(name);
      } else if (!on && loops.delete(name)) sounds.get(name)?.stop();
    }
    if (previous.status !== state.status && state.status === 'won') play('relief');
    if (!active) return;
    if (previous.boss !== state.boss) {
      footfall = -1;
      if (state.boss === 'warning') play('chair');
      if (state.boss === 'leave') play('breath');
    }
    if (state.boss === 'approach' || (state.boss === 'leave' && phaseTime < 4)) {
      const clip = sceneManifest.clips?.[state.boss === 'approach' ? 'boss-near' : 'boss-leave'];
      const duration = clip?.duration ?? 1;
      const events =
        clip?.events?.filter((event) => event.name === 'footfall').map((event) => event.at) ?? [];
      const contacts = events.length ? events : [0, duration / 2];
      const cycle = Math.floor(phaseTime / duration);
      const beat =
        cycle * contacts.length + contacts.filter((at) => at <= phaseTime % duration).length;
      if (beat !== footfall) {
        footfall = beat;
        sounds
          .get('steps')
          ?.setVolume?.(
            state.boss === 'leave'
              ? 0.45 - Math.min(1, phaseTime / 4) * 0.3
              : 0.25 + Math.min(1, phaseTime / 2) * 0.45,
          );
        play('steps');
      }
    }
    if (previous.pc !== state.pc) play('mouse');
    if (previous.phone !== state.phone && ['pickup', 'stowing'].includes(state.phone))
      play('phone');
    const clipName = state.phoneStowFast ? 'stow-fast' : 'stow';
    const clip = sceneManifest.clips?.[clipName];
    const event = clip?.events?.find((item) => item.name === 'phone-screen-off');
    const contact = event && clip ? 1 - event.at / clip.duration : 0.32;
    if (
      previous.phone === 'stowing' &&
      previous.phoneProgress > contact &&
      state.phoneProgress <= contact
    )
      play('contact');
    if (previous.eventId !== state.eventId) {
      if (state.phoneNotice === 'vibrating' && previous.phoneNotice !== 'vibrating') play('buzz');
      if (state.phoneNotice === 'silenced') sounds.get('buzz')?.stop();
      if (state.phoneNotice === 'sounded' && previous.phoneNotice !== 'sounded') play('ring');
      if (state.event === 'answered') play('breath');
    }
  }
  return {
    initialize,
    sync,
    stop,
    dispose() {
      stop();
      sounds.forEach((item) => item.dispose());
      sounds.clear();
    },
  };
}
