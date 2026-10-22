(function runtime() {
  const panel = document.getElementById('station-loading'),
    status = document.getElementById('loading-status'),
    retry = document.getElementById('loading-retry');
  let engine,
    settled = false;
  const timer = setTimeout(fail, 60000);
  function clean() {
    clearTimeout(timer);
    window.removeEventListener('homebound-ready', ready);
    window.removeEventListener('homebound-load-error', fail);
  }
  function fail() {
    if (settled) return;
    settled = true;
    clean();
    engine?.game.pause();
    panel.setAttribute('aria-busy', 'false');
    status.textContent = '车站暂未打开，请检查网络后重试';
    panel.querySelector('progress').hidden = true;
    retry.hidden = false;
  }
  function ready() {
    status.textContent = '车站就绪，欢迎接班';
    engine.director.once(engine.Director.EVENT_AFTER_DRAW, () => {
      if (settled) return;
      settled = true;
      clean();
      panel.remove();
      document.getElementById('GameDiv')?.removeAttribute('inert');
    });
  }
  retry.onclick = () => location.reload();
  window.addEventListener('homebound-ready', ready);
  window.addEventListener('homebound-load-error', fail);
  window.HomeboundStartup = {
    async boot(applicationPath) {
      document.getElementById('GameDiv')?.setAttribute('inert', '');
      try {
        const { Application } = await System.import(applicationPath);
        engine = await System.import('cc');
        if (settled) return;
        engine.game.onPostBaseInitDelegate.add(() => {
          engine.settings.overrideSettings('splashScreen', 'totalTime', 0);
          engine.settings.overrideSettings('splashScreen', 'logo', { type: 'none' });
          engine.settings.overrideSettings('screen', 'exactFitScreen', true);
        });
        status.textContent = '正在布置车站、出租车与乘客…';
        const app = new Application();
        await app.init(engine);
        await app.start();
      } catch (error) {
        fail();
        console.error('[homebound-station startup]', error);
      }
    },
  };
})();
