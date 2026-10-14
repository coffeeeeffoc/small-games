/** Explicit web-preview only. No login, sharing, ads, or platform success is simulated. */
export function createBrowserSdk({ game, window: host = globalThis.window }) {
  if (!host?.document) throw new Error('Browser preview requires a document');
  const prefix = `cocos-minigame-preview:${game}:`;
  return {
    createCanvas: () => host.document.createElement('canvas'),
    createImage: () => new host.Image(),
    getSystemInfoSync: () => ({
      windowWidth: host.innerWidth,
      windowHeight: host.innerHeight,
      pixelRatio: host.devicePixelRatio || 1,
      safeArea: { left: 0, top: 0, right: host.innerWidth, bottom: host.innerHeight },
    }),
    getStorageSync: (key) => host.localStorage.getItem(prefix + key),
    setStorageSync: (key, value) =>
      host.localStorage.setItem(
        prefix + key,
        typeof value === 'string' ? value : JSON.stringify(value),
      ),
    removeStorageSync: (key) => host.localStorage.removeItem(prefix + key),
    getLaunchOptionsSync: () => ({
      query: Object.fromEntries(new URLSearchParams(host.location.search)),
    }),
    getPerformance: () => host.performance,
    getLogManager: () => host.console,
    createInnerAudioContext() {
      const element = new host.Audio();
      return {
        get src() {
          return element.src;
        },
        set src(value) {
          element.src = value;
        },
        get volume() {
          return element.volume;
        },
        set volume(value) {
          element.volume = value;
        },
        get loop() {
          return element.loop;
        },
        set loop(value) {
          element.loop = value;
        },
        play() {
          element.play().catch(() => {});
        },
        pause() {
          element.pause();
        },
        stop() {
          element.pause();
          element.currentTime = 0;
        },
        destroy() {
          element.pause();
          element.removeAttribute('src');
          element.load();
        },
        onError: (fn) => element.addEventListener('error', fn),
        offError: (fn) => element.removeEventListener('error', fn),
      };
    },
  };
}
