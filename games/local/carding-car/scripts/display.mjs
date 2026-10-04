import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Keep the shared H5 fullscreen controller unchanged. The kart HUD invokes its
// hidden control so same-origin embeds, errors and browser exits use one path.
function displayControls() {
  const fullscreen = document.getElementById('kart-fullscreen');
  let controls = {}, locking = false;
  const getFullscreen = () => fullscreen.getAttribute('aria-pressed') === 'true';
  async function lockLandscape() {
    if (locking || !screen.orientation?.lock) return;
    locking = true;
    try {
      await screen.orientation.lock('landscape');
    } catch {
      // Safari and non-fullscreen browsers can reject the native lock. Creator
      // still rotates its game frame AND touch coordinates into landscape.
    } finally {
      locking = false;
    }
  }
  window.KartDisplay = {
    toggleFullscreen() { fullscreen.click(); },
    getFullscreen,
    setControls(next) { controls = next || {}; },
  };
  for (const action of ['pause', 'settings'])
    document.getElementById(`kart-accessible-${action}`).addEventListener('click', () => controls[action]?.());
  // Native orientation locks usually need fullscreen and/or user activation.
  // Neither is required for Creator's CSS landscape fallback.
  document.addEventListener('game-displaychange', () => {
    if (getFullscreen()) void lockLandscape();
  });
  document.addEventListener('pointerdown', () => { void lockLandscape(); }, { once: true, capture: true });
  window.addEventListener('pageshow', () => { void lockLandscape(); });
  void lockLandscape();
}

export async function installDisplay(directory) {
  const index = path.join(directory, 'index.html');
  let html = await readFile(index, 'utf8');
  html = html.replace('</head>', `<style>
    html, body { width:100%; height:100%; margin:0; overflow:hidden; overscroll-behavior:none; }
    [hidden] { display:none !important; }
    #kart-web-controls { position:fixed; inset:0; pointer-events:none; z-index:22; }
    #kart-web-controls button { position:absolute; width:1px; height:1px; padding:0; border:0;
      overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
    #kart-web-controls button:focus-visible { width:auto; height:44px; padding:0 18px;
      top:8px; left:8px; clip-path:none; color:#fff6dc; background:#173c55;
      border:2px solid #69dfc0; border-radius:12px; pointer-events:auto; }
    @media (orientation:portrait) {
      #kart-loading, #kart-web-controls { inset:auto; top:0; left:0; width:100vh; height:100vw;
        width:100dvh; height:100dvw; transform-origin:0 0; transform:translateX(100vw) rotate(90deg); }
      #game-display-notice { top:50%; bottom:auto !important; left:32px !important;
        max-width:calc(100dvh - 28px) !important; transform:translate(-50%,-50%) rotate(90deg) !important; }
    }
  </style><script src="./competition-session.js"></script><script defer src="./fullscreen.js"></script></head>`)
    .replace('<body>', `<body><button id="kart-fullscreen" type="button" data-game-fullscreen hidden tabindex="-1" aria-label="全屏">全屏</button>
      <nav id="kart-web-controls" aria-label="游戏快捷操作">
        <button id="kart-accessible-pause" type="button" aria-label="暂停">暂停</button>
        <button id="kart-accessible-settings" type="button" aria-label="设置">设置</button>
      </nav><script>(${displayControls.toString()})();</script>`);
  await writeFile(index, html);
}
