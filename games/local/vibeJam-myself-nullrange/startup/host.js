// Bootstrap status and host lifecycle only. All gameplay, menus and input live in Cocos.
(() => {
  const loading = document.getElementById('nullrange-loading');
  const timer = setTimeout(() => {
    if (!loading?.isConnected) return;
    loading.querySelector('span').textContent = '加载未完成，请检查网络后重试';
    loading.querySelector('button').hidden = false;
  }, 45000);
  loading?.querySelector('button').addEventListener('click', () => location.reload());
  globalThis.NullRangeHost = {
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
