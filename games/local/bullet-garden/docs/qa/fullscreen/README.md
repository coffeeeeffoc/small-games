# Fullscreen and pause regression — 2026-10-05

Baseline: `f1b30abb1dd30cec64eef9f7d8228a23a6549beb`.
The failing Pages run was `37228754571`, job `111515614022`: a real
`#pause.tap()` timed out while `#fullscreen` intercepted pointer events.

## Cause and correction

The layout recomputed mobile capability from the current primary pointer. In
Chromium 140, detaching the CDP touch session used by the existing Pages test
changes `(pointer: coarse)` from true to false and `navigator.maxTouchPoints`
from 1 to 0. Locally, the unmodified game then changed `data-rotated` from true
to false at 390×844, squeezing the HUD into the physical portrait width. The CI
failure screenshot likewise showed an upright portrait UI. Font metrics and
flex minimum widths affect how far the squeezed pause target overlaps fullscreen;
the local browser reproduced the capability/layout change, not the identical
30-second timeout on every font configuration.

There was also a separate reproducible collision while fullscreen: the longer
exit label made the button 94.016px wide, but the HUD reserved only 86px. A real
hit test near the pause button's inner edge hit fullscreen instead. Increasing
z-index would leave the two touch targets overlapping.

The correction retains discovered touch capability for the page lifetime and
reserves the actual fullscreen button's logical `offsetWidth` plus 10px. This
avoids swapping width/height when the whole game rotates. ResizeObserver updates
the reservation when the label or font changes. Clockwise safe-area top/bottom
mapping is corrected, buttons cannot flex-shrink, and the stylesheet's orphaned
trailing declarations are removed. The source server now serves the existing
`dev-mode.js` runtime dependency.

## Verification

[display-summary.json](display-summary.json) contains the actual browser versions,
pointer transitions and control bounds. Chromium 140.0.7339.0 and 151.0.7922.173
each passed 11 cases against source and dist, totaling 44 cases:

- 390×844, 844×390, 320×568 and 1440×900, both standalone and offset same-origin iframe.
- Real tap/click with center/edge hit tests and disjoint 44px-or-larger touch areas.
- Native fullscreen entry, button exit, browser API exit, and host/iframe resizing.
- Paused time remains frozen, resume preserves the run, restart and home/start create new runs.
- CDP touch-session detach and an explicit coarse-to-fine input-capability fixture.
- Three minigame entry/SDK cases omit the Web fullscreen button and retain pause/resume.

At 390×844 in Chromium 151 fullscreen, pause occupies `(336,682,44,44)` and
fullscreen `(336,735.984,44,94.016)` in physical screen coordinates: about 10px apart.
The pause icon remains two separate filled SVG bars, visually inspected in
[portrait-fullscreen.png](portrait-fullscreen.png) and
[iframe-landscape-fullscreen.png](iframe-landscape-fullscreen.png).

Other completed checks:

- Bullet rule tests: 154/154. Relevant configuration, metadata, dev-mode, Pages selection/sharding and formatting-hook script tests: 88/88.
- Shell lint, root format check, explicit formatting of changed Bullet files, game configuration audit (53 games, zero issues), dev-mode sync check and five dev-mode rule tests.
- Existing home browser suite: all six checks, including 14 stages, natural first clear and saved growth, real dual touch/cancellation/skill charging, and developer/minigame configuration.
- Existing screen browser suite: four viewport sizes.
- Scoped Shell dependency build (20 tasks), TypeScript and Vite Pages build, followed by the actual Pages Bullet embedded/Pixel 7 gameplay gate, including the retained pause tap and added fullscreen/restart assertions.
- Shared developer-mode browser suite selected for Bullet: 10 checks passed, covering independent/Shell URL and storage settings plus shared gesture and iframe controls.

The full local Pages build needs Cocos Creator 3.8.8, unavailable in this cloud
workspace; only the scoped Shell build is claimed above. CI validates the full
build and deployment after the real commit is pushed. This is desktop Chromium
touch emulation, not physical Android/iOS or native minigame device certification.

To repeat the focused regression, build the game, run its server with
`node server.mjs --port 4421 --root dist`, then run
`GAME_URL=http://127.0.0.1:4421 CHROMIUM_PATH=/usr/bin/chromium pnpm test:display-browser`
from the game directory. `CHROMIUM_ARGS` optionally supplies JSON browser arguments.
