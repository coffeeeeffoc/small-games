/** Canvas controllers run on a separate 2D surface; Cocos owns the display canvas. */
const DRAW_METHODS = new Set([
  'clearRect',
  'fillRect',
  'strokeRect',
  'fill',
  'stroke',
  'fillText',
  'strokeText',
  'drawImage',
  'putImageData',
  'drawFocusIfNeeded',
]);
const EVENTS = [
  'TouchStart',
  'TouchMove',
  'TouchEnd',
  'TouchCancel',
  'Hide',
  'Show',
  'WindowResize',
];

export function createSdkOverlay(sdk, overrides) {
  const bound = new Map();
  return new Proxy(Object.create(null), {
    get(_target, key) {
      if (Object.hasOwn(overrides, key)) return overrides[key];
      const value = Reflect.get(sdk, key, sdk);
      if (typeof value !== 'function') return value;
      if (bound.get(key)?.source !== value) bound.set(key, { source: value, fn: value.bind(sdk) });
      return bound.get(key).fn;
    },
    ownKeys: () => [...new Set([...Reflect.ownKeys(sdk), ...Reflect.ownKeys(overrides)])],
    getOwnPropertyDescriptor(_target, key) {
      if (Object.hasOwn(overrides, key) || key in sdk)
        return { configurable: true, enumerable: true };
    },
    has: (_target, key) => Object.hasOwn(overrides, key) || key in sdk,
    set(_target, key, value) {
      if (Object.hasOwn(overrides, key)) {
        overrides[key] = value;
        return true;
      }
      return Reflect.set(sdk, key, value, sdk);
    },
  });
}

export function mapAssetPath(path, root = '') {
  if (typeof path !== 'string' || !path || /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(path)) return path;
  return `${root ? `${root.replace(/\/$/, '')}/` : ''}${path.replace(/^\.\//, '')}`;
}

/** A large desktop preview also respects the pixel budget by reducing logical dimensions. */
export function normalizeViewport(info, maxDpr = 1.5, maxPixels = 2_000_000) {
  const width = Number(info?.windowWidth),
    height = Number(info?.windowHeight);
  if (!(width > 0 && height > 0 && Number.isFinite(width + height)))
    throw new Error('Invalid mini-game viewport');
  const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)));
  const w = Math.max(1, Math.floor(width * scale)),
    h = Math.max(1, Math.floor(height * scale));
  const ratio = Math.max(
    1,
    Math.min(maxDpr, Number(info.pixelRatio) || 1, Math.sqrt(maxPixels / (w * h))),
  );
  const safeArea =
    info.safeArea &&
    Object.fromEntries(
      Object.entries(info.safeArea).map(([key, value]) => [
        key,
        typeof value === 'number' ? value * scale : value,
      ]),
    );
  return {
    ...info,
    windowWidth: w,
    windowHeight: h,
    screenWidth: w,
    screenHeight: h,
    pixelRatio: ratio,
    safeArea,
    coordinateScale: scale,
  };
}

export function createCanvasRuntime(options) {
  const { sdk: host, start, debug = false } = options;
  const readViewport = () =>
    normalizeViewport(
      (options.getViewport || (() => host.getSystemInfoSync()))(),
      options.maxDpr ?? 1.5,
      options.maxPixels ?? 2_000_000,
    );
  let viewport = readViewport(),
    stopped = false,
    hidden = false,
    dirty = true;
  let lastUpload = -Infinity,
    uploads = 0,
    controller;
  const listeners = new Map(EVENTS.map((name) => [name, new Set()]));
  const active = new Map(),
    rawObjects = new WeakMap(),
    imageCleanups = new Set();
  const emit = (name, event) => {
    for (const listener of [...listeners.get(name)]) listener(event);
  };
  const markDirty = () => {
    if (!stopped) dirty = true;
  };
  const createCanvas =
    options.createCanvas ||
    (() =>
      typeof host.createOffscreenCanvas === 'function'
        ? host.createOffscreenCanvas({ type: '2d', width: 1, height: 1 })
        : host.createCanvas());
  const sourceCanvas = createCanvas();
  if (!sourceCanvas || sourceCanvas === options.mainCanvas)
    throw new Error(
      'A separate host 2D canvas is required; the Cocos display canvas cannot be reused',
    );
  const context = sourceCanvas.getContext('2d');
  if (!context) throw new Error('Host does not provide a separate 2D canvas');
  const contextMethods = new Map();
  let canvas;
  const contextProxy = new Proxy(context, {
    get(target, key) {
      if (key === 'canvas') return canvas;
      const value = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      if (!contextMethods.has(key))
        contextMethods.set(key, (...args) => {
          const result = value.apply(
            target,
            args.map((arg) => (arg && typeof arg === 'object' ? rawObjects.get(arg) || arg : arg)),
          );
          if (DRAW_METHODS.has(key)) markDirty();
          return result;
        });
      return contextMethods.get(key);
    },
    set: (target, key, value) => Reflect.set(target, key, value, target),
  });
  canvas = createSdkOverlay(sourceCanvas, {
    getContext: (kind) => (kind === '2d' ? contextProxy : null),
  });
  // Canvas width/height setters clear its bitmap, even when assigned the same size.
  canvas = new Proxy(canvas, {
    set(target, key, value) {
      const result = Reflect.set(target, key, value);
      if (key === 'width' || key === 'height') markDirty();
      return result;
    },
  });
  rawObjects.set(canvas, sourceCanvas);
  const mapPath = options.mapAssetPath || ((path) => mapAssetPath(path, options.assetRoot));
  function wrapSource(raw, isImage) {
    let onload = null;
    let proxy;
    const handleLoad = (event) => {
      markDirty();
      if (!stopped) onload?.call(proxy, event);
    };
    if (isImage) {
      onload = raw.onload;
      raw.onload = handleLoad;
      imageCleanups.add(() => {
        raw.onload = null;
        onload = null;
      });
    }
    proxy = createSdkOverlay(raw, {});
    proxy = new Proxy(proxy, {
      get(target, key) {
        if (isImage && key === 'onload') return onload;
        return Reflect.get(target, key);
      },
      set(target, key, value) {
        if (isImage && key === 'onload') {
          onload = value;
          return true;
        }
        return Reflect.set(target, key, key === 'src' ? mapPath(value) : value);
      },
    });
    rawObjects.set(proxy, raw);
    return proxy;
  }
  const overrides = {
    createCanvas: () => canvas,
    getSystemInfoSync: () => viewport,
    getWindowInfo: () => viewport,
  };
  if (typeof host.getMenuButtonBoundingClientRect === 'function')
    overrides.getMenuButtonBoundingClientRect = () =>
      Object.fromEntries(
        Object.entries(host.getMenuButtonBoundingClientRect()).map(([key, value]) => [
          key,
          typeof value === 'number' ? value * viewport.coordinateScale : value,
        ]),
      );
  if (typeof host.createImage === 'function' || options.createImage)
    overrides.createImage = () =>
      wrapSource((options.createImage || (() => host.createImage()))(), true);
  if (typeof host.createInnerAudioContext === 'function')
    overrides.createInnerAudioContext = () => wrapSource(host.createInnerAudioContext(), false);
  for (const event of EVENTS) {
    overrides[`on${event}`] = (fn) => {
      if (!stopped) listeners.get(event).add(fn);
    };
    overrides[`off${event}`] = (fn) => {
      if (fn) listeners.get(event).delete(fn);
      else listeners.get(event).clear();
    };
  }
  const sdk = createSdkOverlay(host, overrides);
  function dispatchTouch(type, changedTouches) {
    if (stopped || hidden) return;
    if (!['start', 'move', 'end', 'cancel'].includes(type))
      throw new Error(`Unknown touch phase: ${type}`);
    const changed = [];
    for (const point of changedTouches) {
      const id = point.identifier ?? 0,
        x = point.clientX ?? point.x,
        y = point.clientY ?? point.y;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (type !== 'start' && !active.has(id)) continue;
      if (type === 'start' && active.has(id)) continue;
      const touch = { identifier: id, x, y, clientX: x, clientY: y, pageX: x, pageY: y };
      changed.push(touch);
      if (type === 'end' || type === 'cancel') active.delete(id);
      else active.set(id, touch);
    }
    if (changed.length)
      emit(`Touch${type[0].toUpperCase()}${type.slice(1)}`, {
        touches: [...active.values()],
        changedTouches: changed,
        timeStamp: Date.now(),
      });
  }
  function cancelTouches() {
    const touches = [...active.values()];
    active.clear();
    if (touches.length)
      emit('TouchCancel', { touches: [], changedTouches: touches, timeStamp: Date.now() });
  }
  const runtime = {
    sdk,
    canvas,
    sourceCanvas,
    getViewport: () => ({ ...viewport }),
    dispatchTouch,
    hide() {
      if (stopped || hidden) return;
      cancelTouches();
      hidden = true;
      emit('Hide');
    },
    show(payload) {
      if (stopped || (!hidden && payload === undefined)) return;
      cancelTouches();
      hidden = false;
      viewport = readViewport();
      emit('WindowResize', {
        windowWidth: viewport.windowWidth,
        windowHeight: viewport.windowHeight,
      });
      emit('Show', payload);
      markDirty();
    },
    resize() {
      if (stopped) return;
      cancelTouches();
      viewport = readViewport();
      emit('WindowResize', {
        windowWidth: viewport.windowWidth,
        windowHeight: viewport.windowHeight,
      });
      markDirty();
    },
    uploadFrame(now, upload) {
      if (
        stopped ||
        hidden ||
        !dirty ||
        now - lastUpload + 0.01 < 1000 / (options.maxUploadsPerSecond || 60)
      )
        return false;
      // Clear first so a synchronous draw during upload will still be uploaded next frame.
      dirty = false;
      try {
        upload(sourceCanvas, { width: sourceCanvas.width, height: sourceCanvas.height });
      } catch (error) {
        dirty = true;
        throw error;
      }
      lastUpload = now;
      uploads++;
      return true;
    },
    stop() {
      if (stopped) return;
      cancelTouches();
      try {
        (controller?.stop || controller?.dispose)?.call(controller);
      } finally {
        stopped = true;
        for (const set of listeners.values()) set.clear();
        for (const cleanup of imageCleanups) cleanup();
        imageCleanups.clear();
      }
    },
  };
  if (debug)
    runtime.getDebugState = () => ({
      hidden,
      stopped,
      dirty,
      uploads,
      activeTouches: [...active.values()],
      viewport: { ...viewport },
      state: controller?.getState?.() ?? controller?.state,
      layout: controller?.getLayout?.(),
    });
  try {
    controller = start(sdk);
  } catch (error) {
    runtime.stop();
    throw error;
  }
  return runtime;
}
