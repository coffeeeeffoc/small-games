(() => {
  'use strict';
  const overlay = document.getElementById('night-startup');
  const status = document.getElementById('night-status');
  const hint = document.getElementById('night-hint');
  const retry = document.getElementById('night-retry');
  const cleanups = [];
  let state = 'loading';
  let engine;
  let sceneLaunched = false;
  let gameReady = false;
  let waitingDraw = false;
  const watchdog = setTimeout(() => fail(new Error('连接超时，请检查网络后重试。')), 60000);

  function listen(target, name, callback, capture = false) {
    target.addEventListener(name, callback, capture);
    cleanups.push(() => target.removeEventListener(name, callback, capture));
  }
  function once(target, name, callback) {
    target.once(name, callback);
    cleanups.push(() => target.off(name, callback));
  }
  function cleanup() {
    clearTimeout(watchdog);
    for (const remove of cleanups.splice(0)) remove();
  }
  function stage(text) {
    if (state === 'loading') status.textContent = text;
  }
  function fail(error) {
    if (state !== 'loading') return;
    state = 'error';
    cleanup();
    engine?.game.pause();
    overlay.dataset.state = state;
    overlay.setAttribute('aria-busy', 'false');
    status.textContent = '夜航连接未完成';
    hint.textContent = error?.message || '资源加载失败，请检查网络后重试。';
    document.getElementById('night-progress').hidden = true;
    retry.hidden = false;
    console.error('[Night Overwatch startup]', error);
    retry.focus({ preventScroll: true });
  }
  function finish() {
    if (state !== 'loading') return;
    state = 'leaving';
    cleanup();
    overlay.dataset.state = state;
    overlay.setAttribute('aria-busy', 'false');
    status.textContent = '护航已就绪';
    const remove = () => {
      if (state === 'ready') return;
      state = 'ready';
      overlay.remove();
      document.getElementById('GameDiv')?.removeAttribute('inert');
      document.getElementById('GameCanvas')?.focus({ preventScroll: true });
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) remove();
    else {
      overlay.addEventListener('transitionend', remove, { once: true });
      // Only a fade-out fallback, never a readiness timer.
      setTimeout(remove, 450);
    }
  }
  function awaitFrame() {
    if (state !== 'loading' || !sceneLaunched || !gameReady || waitingDraw) return;
    waitingDraw = true;
    stage('正在呈现护航画面…');
    once(engine.director, engine.Director.EVENT_AFTER_DRAW, finish);
  }

  listen(window, 'night-overwatch:ready', () => {
    gameReady = true;
    awaitFrame();
  });
  listen(window, 'night-overwatch:error', (event) => fail(event.detail));
  listen(window, 'error', (event) => {
    if (event.target === window || event.target?.tagName === 'SCRIPT')
      fail(event.error || new Error('启动资源加载失败，请检查网络后重试。'));
  }, true);
  listen(window, 'unhandledrejection', (event) => fail(event.reason));
  retry.addEventListener('click', () => window.location.reload());

  window.NightStartup = {
    async boot(applicationPath, target) {
      try {
        const canvas = document.getElementById('GameCanvas');
        document.getElementById('GameDiv').setAttribute('inert', '');
        listen(canvas, 'webglcontextlost', () => fail(new Error('图形连接已中断，请重试。')));
        if (target === 'web-mobile') {
          const rect = canvas.parentElement.getBoundingClientRect();
          canvas.width = rect.width;
          canvas.height = rect.height;
        }
        stage('正在连接飞行系统…');
        const { Application } = await System.import(applicationPath);
        if (state !== 'loading') return;
        engine = await System.import('cc');
        if (state !== 'loading') return;
        stage('正在初始化飞行系统…');
        once(engine.game, engine.Game.EVENT_POST_SUBSYSTEM_INIT, () => stage('正在装载护航资源…'));
        once(engine.game, engine.Game.EVENT_POST_PROJECT_INIT, () => stage('正在展开夜航场景…'));
        once(engine.director, engine.Director.EVENT_AFTER_SCENE_LAUNCH, () => {
          sceneLaunched = true;
          stage('正在准备机舱与护航界面…');
          awaitFrame();
        });
        const application = new Application();
        await application.init(engine);
        // Official hook: settings.json has loaded, but SplashScreen.init has not run.
        // Creator 3.8.8 may emit its default logo despite CLI replacement options.
        engine.game.onPostBaseInitDelegate.add(() => {
          engine.settings.overrideSettings('splashScreen', 'totalTime', 0);
          engine.settings.overrideSettings('splashScreen', 'logo', { type: 'none' });
          engine.settings.overrideSettings('splashScreen', 'background', {
            type: 'color', color: { x: 0.02, y: 0.04, z: 0.06, w: 1 },
          });
          if (engine.settings.querySettings('splashScreen', 'totalTime') !== 0
              || engine.settings.querySettings('splashScreen', 'logo')?.type !== 'none')
            throw new Error('启动画面配置未生效，请重新加载。');
        });
        if (state === 'loading') await application.start();
        if (state === 'error') engine.game.pause();
      } catch (error) {
        fail(error);
      }
    },
  };
})();
