(() => {
  const overlay = document.getElementById('garden-loading');
  const progress = document.getElementById('garden-progress');
  const status = document.getElementById('garden-status');
  const retry = document.getElementById('garden-retry');
  let finished = false;
  const timeout = setTimeout(() => fail('加载时间较长，请检查网络后重试'), 90000);
  function fail(message) {
    if (!finished) {
      status.textContent = message;
      retry.hidden = false;
    }
  }
  globalThis.BulletGardenLoading = {
    progress(value) {
      progress.value = value;
      status.textContent = `正在唤醒花园 ${Math.round(value * 100)}%`;
    },
    ready() {
      finished = true;
      clearTimeout(timeout);
      overlay.remove();
    },
    fail,
  };
  retry.onclick = () => location.reload();
  window.addEventListener('error', () => fail('花园加载失败，请重试'));
  window.addEventListener('unhandledrejection', () => fail('花园加载失败，请重试'));
})();
