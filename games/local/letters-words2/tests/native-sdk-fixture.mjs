// Deterministic SDK fixture for exercising native Canvas input and lifecycle contracts.
// It does not claim official platform or device compatibility.
export async function flushNative() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

export function createNativeSDKFixture(options = {}) {
  const listeners = new Map();
  const storage = new Map(options.storage || []);
  const labels = [], shapes = [], audio = [], requests = [], shares = [], clipboard = [];
  const timers = new Map();
  let dimensions = {
    windowWidth: options.width || 390,
    windowHeight: options.height || 844,
    pixelRatio: options.pixelRatio || 2,
    ...(options.safeArea ? { safeArea: options.safeArea } : {}),
  };
  let storageFails = !!options.storageFails;
  let clipboardValue = options.clipboard || '';
  let now = options.now ?? Date.parse('2026-10-06T04:00:00Z');
  let timerId = 0;
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const point = (x, y) => ({ x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5] });
  function multiply(a, b, c, d, e, f) {
    const [aa, ab, ac, ad, ae, af] = matrix;
    matrix = [aa * a + ac * b, ab * a + ad * b, aa * c + ac * d, ab * c + ad * d, aa * e + ac * f + ae, ab * e + ad * f + af];
  }
  const canvas = { width: 0, height: 0, getContext: () => context };
  function startFrame(x, y, width, height) {
    if (x === 0 && y === 0 && width >= dimensions.windowWidth && height >= dimensions.windowHeight && !stack.length) {
      labels.length = 0;
      shapes.length = 0;
    }
  }
  const context = new Proxy({
    font: '16px sans-serif', textAlign: 'left', textBaseline: 'alphabetic', globalAlpha: 1,
    setTransform(a, b, c, d, e, f) { const ratio = canvas.width / dimensions.windowWidth || 1; matrix = [a / ratio, b / ratio, c / ratio, d / ratio, e / ratio, f / ratio]; },
    resetTransform() { const ratio = canvas.width / dimensions.windowWidth || 1; matrix = [1 / ratio, 0, 0, 1 / ratio, 0, 0]; },
    save() { stack.push({ matrix: [...matrix], font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline }); },
    restore() { const saved = stack.pop(); if (saved) { matrix = saved.matrix; this.font = saved.font; this.textAlign = saved.textAlign; this.textBaseline = saved.textBaseline; } },
    translate(x, y) { multiply(1, 0, 0, 1, x, y); },
    scale(x, y) { multiply(x, 0, 0, y, 0, 0); },
    rotate(angle) { multiply(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0); },
    transform: multiply,
    clearRect: startFrame,
    fillRect(x, y, width, height) { startFrame(x, y, width, height); shapes.push({ ...point(x, y), width: width * matrix[0], height: height * matrix[3], kind: 'fillRect' }); },
    rect(x, y, width, height) { shapes.push({ ...point(x, y), width: width * matrix[0], height: height * matrix[3], kind: 'rect' }); },
    roundRect(x, y, width, height) { shapes.push({ ...point(x, y), width: width * matrix[0], height: height * matrix[3], kind: 'roundRect' }); },
    fillText(text, x, y) { labels.push({ text: String(text), ...point(x, y), font: this.font, align: this.textAlign, baseline: this.textBaseline }); },
    measureText(text) { const size = Number(this.font.match(/([\d.]+)px\b/)?.[1]) || 16; return { width: String(text).length * size * 0.56 }; },
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  const sdk = {
    createCanvas: () => canvas,
    getSystemInfoSync: () => ({ ...dimensions }),
    getMenuButtonBoundingClientRect: () => ({ top: 20, bottom: 52, left: dimensions.windowWidth - 100, right: dimensions.windowWidth - 12, width: 88, height: 32 }),
    getStorageSync(key) { if (storageFails) throw new Error('Storage unavailable'); return storage.get(key); },
    setStorageSync(key, value) { if (storageFails) throw new Error('Storage unavailable'); storage.set(key, value); },
    removeStorageSync(key) { if (storageFails) throw new Error('Storage unavailable'); storage.delete(key); },
    getLaunchOptionsSync: () => ({ query: options.launchQuery || {} }),
    createImage() {
      const image = { width: 1024, height: 1024, onload: null, onerror: null };
      Object.defineProperty(image, 'src', { get: () => image.source, set(value) { image.source = value; queueMicrotask(() => image.onload?.()); } });
      return image;
    },
    createInnerAudioContext() {
      const sound = { src: '', playing: false, destroyed: false, play() { this.playing = true; }, stop() { this.playing = false; }, pause() { this.playing = false; }, destroy() { this.destroyed = true; this.playing = false; }, onError() {}, offError() {} };
      audio.push(sound);
      return sound;
    },
    request(input) { requests.push(input); if (options.onRequest) return options.onRequest(input); input.fail?.({ errMsg: 'Network unavailable in fixture' }); },
    shareAppMessage(input) { shares.push(input); return options.onShare?.(input); },
    setClipboardData(input) { clipboardValue = input.data; clipboard.push(input.data); input.success?.(); },
    getClipboardData(input) { input.success?.({ data: clipboardValue }); },
    getFileSystemManager: options.readFile ? () => ({
      readFile(input) {
        Promise.resolve().then(() => options.readFile(input.filePath, input.encoding)).then(data => input.success?.({ data }), error => input.fail?.(error));
      },
    }) : undefined,
    showShareMenu() {}, hideShareMenu() {}, showKeyboard(input) { sdk.keyboard = input; }, hideKeyboard() { sdk.keyboard = null; },
    vibrateShort() {}, vibrateLong() {}, showToast() {},
  };
  for (const name of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'Hide', 'Show', 'WindowResize', 'KeyboardConfirm', 'KeyboardComplete', 'KeyboardInput', 'AudioInterruptionBegin', 'AudioInterruptionEnd', 'ShareAppMessage']) {
    const set = new Set(); listeners.set(name, set);
    sdk['on' + name] = fn => set.add(fn);
    sdk['off' + name] = fn => set.delete(fn);
  }
  const emit = (name, input) => { for (const callback of [...(listeners.get(name) || [])]) callback(input); };
  const touch = (name, x, y, identifier = 1, others = []) => {
    const item = { identifier, clientX: x, clientY: y, x, y };
    emit(name, { changedTouches: [item], touches: name === 'TouchEnd' || name === 'TouchCancel' ? others : [item, ...others] });
  };
  const fixture = {
    sdk, context, canvas, labels, shapes, audio, requests, shares, clipboard, listeners, storage, timers, stack,
    emit,
    touchStart: (x, y, id, others) => touch('TouchStart', x, y, id, others),
    touchMove: (x, y, id, others) => touch('TouchMove', x, y, id, others),
    touchEnd: (x, y, id, others) => touch('TouchEnd', x, y, id, others),
    touchCancel: (x, y, id, others) => touch('TouchCancel', x, y, id, others),
    tap(x, y, id = 1) { this.touchStart(x, y, id); this.touchEnd(x, y, id); },
    findLabel(text) { return labels.find(label => label.text === text) || labels.find(label => label.text.includes(text)); },
    tapLabel(text) { const label = this.findLabel(text); if (!label) throw new Error(`Missing native label ${text}: ${labels.map(item => item.text).join('|')}`); this.tap(label.x + (label.align === 'center' ? 0 : 3), label.y); },
    resize(width, height, pixelRatio = dimensions.pixelRatio, safeArea) { dimensions = { windowWidth: width, windowHeight: height, pixelRatio, ...(safeArea ? { safeArea } : {}) }; emit('WindowResize', dimensions); },
    hide() { emit('Hide'); },
    show(query) { emit('Show', query ? { query } : {}); },
    setStorageFailure(value) { storageFails = value; },
    get now() { return now; },
    async tick(ms = 16) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.due > now) continue;
        if (timer.repeat) timer.due = now + timer.delay; else timers.delete(id);
        timer.callback();
      }
      await flushNative();
    },
    installGlobals() {
      const saved = Object.fromEntries(['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, globalThis[key]]));
      class FixtureDate extends saved.Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
      globalThis.Date = FixtureDate;
      const schedule = (callback, delay = 0, repeat = false) => { const id = ++timerId; timers.set(id, { callback, delay, repeat, due: now + delay }); return id; };
      globalThis.setTimeout = (callback, delay) => schedule(callback, delay);
      globalThis.setInterval = (callback, delay) => schedule(callback, delay, true);
      globalThis.clearTimeout = globalThis.clearInterval = id => timers.delete(id);
      globalThis.requestAnimationFrame = callback => schedule(() => callback(now), 16);
      globalThis.cancelAnimationFrame = globalThis.clearTimeout;
      return () => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } };
    },
  };
  return fixture;
}
