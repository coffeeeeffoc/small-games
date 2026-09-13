import { Howl } from 'howler';

export function createSoundscape(onError: () => void) {
  const wind = new Howl({
    src: [`${import.meta.env.BASE_URL}audio/river.wav`],
    loop: true,
    volume: 0.32,
    onloaderror: onError,
    onplayerror: onError,
  });
  const bell = new Howl({
    src: [`${import.meta.env.BASE_URL}audio/bell.wav`],
    volume: 0.4,
    onloaderror: onError,
  });
  let enabled = false;
  const sync = () => {
    if (enabled && !document.hidden) {
      if (!wind.playing()) wind.play();
    } else wind.pause();
  };
  document.addEventListener('visibilitychange', sync);
  return {
    enable(value: boolean) {
      enabled = value;
      sync();
    },
    stamp() {
      if (enabled && !document.hidden) bell.play();
    },
    dispose() {
      document.removeEventListener('visibilitychange', sync);
      wind.unload();
      bell.unload();
    },
  };
}
