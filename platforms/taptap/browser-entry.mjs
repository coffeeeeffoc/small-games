import { createTapGameServices } from './game-services.mjs';
import { startTapServiceScreen } from './service-screen.mjs';
/** DOM events become the same SDK-shaped input/lifecycle used by the native page. */
export function createBrowserTapSdk(canvas, root = globalThis) {
  const listeners = new Map(),
    touches = new Map(),
    registrations = [];
  const events = {
    TouchStart: 'pointerdown',
    TouchEnd: 'pointerup',
    TouchCancel: 'pointercancel',
    TouchMove: 'pointermove',
  };
  const handlers = Object.fromEntries(Object.keys(events).map((name) => [name, new Set()]));
  const cancelTouches = () => {
    const changedTouches = [...touches.values()];
    touches.clear();
    if (changedTouches.length)
      for (const fn of handlers.TouchCancel) fn({ touches: [], changedTouches });
  };
  const keyboard = Object.fromEntries(
    ['Input', 'Confirm', 'Complete'].map((name) => [name, new Set()]),
  );
  let keyboardForm;
  const hideKeyboard = () => {
    keyboardForm?.remove();
    keyboardForm = null;
  };
  const showKeyboard = (options) => {
    hideKeyboard();
    const form = root.document.createElement('form'),
      input = root.document.createElement('input');
    input.type = 'text';
    input.value = options.defaultValue || '';
    input.maxLength = options.maxLength || 160;
    input.setAttribute('aria-label', '好友房间号');
    input.autocomplete = 'off';
    input.autocapitalize = 'none';
    input.spellcheck = false;
    Object.assign(form.style, {
      position: 'fixed',
      left: '12px',
      right: '12px',
      bottom: 'max(12px, env(safe-area-inset-bottom))',
      zIndex: '2147483100',
      display: 'flex',
      gap: '8px',
      padding: '12px',
      background: '#fffdf4',
      borderRadius: '16px',
    });
    Object.assign(input.style, { minWidth: '0', flex: '1', height: '48px', fontSize: '16px' });
    const done = root.document.createElement('button');
    done.type = 'submit';
    done.textContent = '完成';
    Object.assign(done.style, { minWidth: '64px', minHeight: '48px', fontSize: '16px' });
    const emit = (name) => {
      for (const fn of keyboard[name]) fn({ value: input.value });
    };
    input.addEventListener('input', () => emit('Input'));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      emit('Confirm');
      emit('Complete');
      hideKeyboard();
    });
    form.append(input, done);
    root.document.body.append(form);
    keyboardForm = form;
    input.focus();
    options.success?.({});
  };
  for (const [name, type] of Object.entries(events)) {
    const listener = (event) => {
      event.preventDefault();
      const point = { identifier: event.pointerId, clientX: event.clientX, clientY: event.clientY };
      if (name === 'TouchStart') {
        touches.set(event.pointerId, point);
        canvas.setPointerCapture?.(event.pointerId);
      }
      if (name === 'TouchMove' && touches.has(event.pointerId)) touches.set(event.pointerId, point);
      if (name === 'TouchEnd' || name === 'TouchCancel') touches.delete(event.pointerId);
      for (const fn of handlers[name])
        fn({ touches: [...touches.values()], changedTouches: [point] });
    };
    canvas.addEventListener(type, listener);
    registrations.push(() => canvas.removeEventListener(type, listener));
  }
  const sdk = new Proxy(
    {},
    {
      get(_target, key) {
        const target = root.tap || {};
        if (key === 'showKeyboard') return showKeyboard;
        if (key === 'hideKeyboard')
          return (options) => {
            hideKeyboard();
            options?.success?.({});
          };
        for (const name of Object.keys(keyboard)) {
          if (key === `onKeyboard${name}`) return (fn) => keyboard[name].add(fn);
          if (key === `offKeyboard${name}`) return (fn) => keyboard[name].delete(fn);
        }
        if (key === 'getSystemInfoSync')
          return () => {
            let host = {};
            try {
              host = target.getSystemInfoSync?.() || {};
            } catch {
              /* Browser dimensions remain available. */
            }
            return {
              ...host,
              windowWidth: root.innerWidth,
              windowHeight: root.innerHeight,
              pixelRatio: root.devicePixelRatio || 1,
              ...(host.safeArea &&
              host.windowWidth === root.innerWidth &&
              host.windowHeight === root.innerHeight
                ? { safeArea: host.safeArea }
                : {
                    safeArea: { left: 0, top: 0, right: root.innerWidth, bottom: root.innerHeight },
                  }),
            };
          };
        if (key === 'getMenuButtonBoundingClientRect')
          return () => {
            try {
              return target.getMenuButtonBoundingClientRect?.() || null;
            } catch {
              return null;
            }
          };
        if (key === 'onWindowResize')
          return (fn) => {
            root.addEventListener('resize', fn);
            registrations.push(() => root.removeEventListener('resize', fn));
          };
        if (key === 'offWindowResize') return (fn) => root.removeEventListener('resize', fn);
        if (['onHide', 'onShow'].includes(key))
          return (fn) => {
            const listener = () => {
              if (root.document.hidden === (key === 'onHide')) {
                if (key === 'onHide') cancelTouches();
                fn();
              }
            };
            const offName = key === 'onHide' ? 'offHide' : 'offShow';
            const nativeListener = () => {
              if (key === 'onHide') cancelTouches();
              fn();
            };
            let nativeOff;
            if (typeof target[key] === 'function' && typeof target[offName] === 'function') {
              try {
                target[key](nativeListener);
                nativeOff = () => target[offName](nativeListener);
              } catch {
                /* DOM lifecycle remains available. */
              }
            }
            listeners.set(fn, { listener, nativeOff });
            root.document.addEventListener('visibilitychange', listener);
          };
        if (['offHide', 'offShow'].includes(key))
          return (fn) => {
            const registration = listeners.get(fn);
            root.document.removeEventListener('visibilitychange', registration?.listener);
            try {
              registration?.nativeOff?.();
            } catch {
              /* Removal remains locally complete. */
            }
            listeners.delete(fn);
          };
        for (const name of Object.keys(events)) {
          if (key === `on${name}`) return (fn) => handlers[name].add(fn);
          if (key === `off${name}`) return (fn) => handlers[name].delete(fn);
        }
        const value = target[key];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    },
  );
  return {
    sdk,
    dispose() {
      hideKeyboard();
      for (const handlers of Object.values(keyboard)) handlers.clear();
      for (const off of registrations) off();
      for (const { listener, nativeOff } of listeners.values()) {
        root.document.removeEventListener('visibilitychange', listener);
        try {
          nativeOff?.();
        } catch {
          /* Continue cleaning every subscription. */
        }
      }
      listeners.clear();
      touches.clear();
    },
  };
}
/** The standalone game exposes its validated save port without importing this workspace. */
export function mountTapBrowserServices(config, multiplayer) {
  const { document, window } = globalThis;
  if (!config.tapServices?.enabled) return;
  let mounted = false;
  const mount = (port) => {
    if (mounted || !port) return;
    mounted = true;
    const button = document.createElement('button');
    button.style.minHeight = '44px';
    button.textContent = 'TapTap 小站';
    button.id = 'taptap-services';
    button.type = 'button';
    port.container.append(button);
    button.addEventListener('click', () => {
      if (!port.canRestore()) return;
      let canvas,
        bridge,
        screen,
        paused = false;
      const leave = () => {
        screen?.stop();
        bridge?.dispose();
        canvas?.remove();
        window.removeEventListener('pagehide', leave);
        if (paused) {
          paused = false;
          port.resume();
        }
      };
      try {
        port.pause();
        paused = true;
        canvas = document.createElement('canvas');
        canvas.setAttribute('aria-label', 'TapTap 小站');
        Object.assign(canvas.style, {
          position: 'fixed',
          inset: '0',
          width: '100%',
          height: '100%',
          zIndex: '2147483000',
          touchAction: 'none',
        });
        document.body.append(canvas);
        bridge = createBrowserTapSdk(canvas);
        // Access lazily: disabled browser storage must not leave an empty paused overlay.
        const storage = {
          getItem: (key) => globalThis.localStorage.getItem(key),
          setItem: (key, value) => globalThis.localStorage.setItem(key, value),
        };
        const services = createTapGameServices({
          sdk: bridge.sdk,
          config,
          savePort: port,
          storage,
          backendSession: config.competitionEnabled
            ? () => globalThis.__competition.session()
            : undefined,
        });
        screen = startTapServiceScreen({
          sdk: bridge.sdk,
          canvas,
          services,
          savePort: port,
          config,
          multiplayer,
          onExit: leave,
        });
        window.addEventListener('pagehide', leave);
        globalThis.__tapServiceScreen = screen;
      } catch {
        leave();
        button.textContent = 'TapTap 暂不可用，点击重试';
      }
    });
  };
  globalThis.__mountTapGameServices = mount;
  mount(globalThis.__tapGamePort);
}
