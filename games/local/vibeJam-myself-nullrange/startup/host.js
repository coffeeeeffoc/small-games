// Bootstrap status and host lifecycle only. All gameplay, menus and input live in Cocos.
(() => {
  const loading = document.getElementById('nullrange-loading');
  const timer = setTimeout(() => {
    if (!loading?.isConnected) return;
    loading.querySelector('span').textContent = '加载未完成，请检查网络后重试';
    loading.querySelector('button').hidden = false;
  }, 45000);
  loading?.querySelector('button').addEventListener('click', () => location.reload());
  // CSS env is measured in the physical viewport; Cocos rotates its logical canvas separately.
  const safe = document.createElement('div');
  safe.id = 'nullrange-safe-area';
  safe.setAttribute('aria-hidden', 'true');
  safe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.appendChild(safe);
  globalThis.NullRangeHost = {
    safeArea() {
      const css = getComputedStyle(safe);
      return {
        left: parseFloat(css.paddingLeft) || 0,
        top: parseFloat(css.paddingTop) || 0,
        right: parseFloat(css.paddingRight) || 0,
        bottom: parseFloat(css.paddingBottom) || 0,
        rotated: innerWidth < innerHeight,
      };
    },
    ready() {
      clearTimeout(timer);
      loading?.remove();
    },
    display(immersive) {
      if (parent !== window)
        parent.postMessage(
          {
            type: 'small-games:display-state',
            gameId: 'vibeJam-myself-nullrange',
            screen: immersive ? 'playing' : 'home',
          },
          location.origin,
        );
    },
  };
})();
