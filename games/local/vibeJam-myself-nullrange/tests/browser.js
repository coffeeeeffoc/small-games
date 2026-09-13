// Run on the dev page: (await import('/tests/browser.js')).runBrowserChecks()
// Exercises DOM buttons and synthesized keyboard input; native touch capture needs a device check.
export async function runBrowserChecks() {
  const flight = window.__flight;
  if (!flight) throw new Error('Open the Vite development page before running browser checks.');
  const report = window.__browserCheck = { status: 'running', checks: [], samples: [] };
  const $ = id => document.getElementById(id);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (condition, message) => { if (!condition) throw new Error(message); report.checks.push(message); };
  const held = new Set();
  function key(code, down) {
    if (held.has(code) === down) return;
    down ? held.add(code) : held.delete(code);
    (document.activeElement || document.body).dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true, cancelable: true }));
  }
  function release() { for (const code of [...held]) key(code, false); }
  try {
    if (flight.game.mode === 'running') $('pause').click();
    if (flight.game.mode === 'paused') $('back-menu').click();
    if (['won', 'lost'].includes(flight.game.mode)) $('result-menu').click();
    document.querySelector('[data-difficulty="easy"]').click();
    $('deploy').click();
    check(flight.game.mode === 'running', 'deploy starts a clean game');
    $('missile').click(); $('scan').click();
    check(flight.game.missiles === 5 && flight.game.scanTime > 0, 'missile and scan buttons execute their actions');
    $('scan').click(); check(flight.game.scanCooldown > 9, 'scan cooldown blocks repeated use');
    const start = { ...flight.game.player };
    key('KeyD', true); key('KeyW', true); key('Space', true); key('ShiftLeft', true);
    await wait(900);
    check(flight.game.player.yaw < start.yaw && flight.game.player.y > start.y, 'combined keyboard input turns and climbs');
    check(flight.game.player.speed > 120 && flight.game.player.energy < 100, 'boost consumes energy and accelerates');
    check(flight.game.heat > 0, 'held fire produces weapon heat');
    release(); check(!flight.input.state.fire && !flight.input.state.boost, 'key release clears held controls');
    $('pause').click(); const pausedTime = flight.game.time; await wait(300);
    check(flight.game.time === pausedTime && $('pause-dialog').open, 'pause freezes simulation');
    $('pause-help').click(); check($('help-dialog').open, 'help is reachable while paused');
    $('help-close').click(); $('resume').click();
    $('sound').focus(); $('sound').click(); key('KeyD', true); await wait(100);
    check(flight.input.state.x > 0, 'sound button restores game keyboard focus'); key('KeyD', false); $('sound').click();
    $('view').click(); check($('view').textContent.includes('座舱'), 'camera toggles to cockpit'); $('view').click();
    $('pause').click(); $('back-menu').click(); $('deploy').click();
    check(flight.game.kills === 0 && flight.game.missiles === 6 && flight.game.wave === 1, 'restart resets mission state');
    const rects = ['joystick', 'fire', 'boost', 'scan', 'missile'].map(id => $(id).getBoundingClientRect());
    check(rects.every(r => r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight), 'all flight controls fit viewport');
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      check(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `control areas ${i}/${j} do not overlap`);
    }
    const began = performance.now(); let frames = 0, lastFrame = began, fpsTotal = 0, fpsFrames = 0;
    while (flight.game.mode === 'running' && performance.now() - began < 150000) {
      const p = flight.game.player;
      const enemy = [...flight.game.enemies].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y, a.z - p.z) - Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z))[0];
      let turn = 0, climb = 0;
      if (enemy) {
        const dx = enemy.x - p.x, dy = enemy.y - p.y, dz = enemy.z - p.z;
        turn = ((Math.atan2(-dx, -dz) - p.yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        climb = Math.atan2(dy, Math.hypot(dx, dz)) - p.pitch;
      }
      key('KeyA', turn > .045); key('KeyD', turn < -.045);
      key('KeyW', climb > .035); key('KeyS', climb < -.035);
      key('Space', true);
      if (flight.game.missileCooldown === 0 && flight.game.missiles > 0) $('missile').click();
      if (flight.game.scanCooldown === 0) $('scan').click();
      const now = await new Promise(resolve => requestAnimationFrame(resolve));
      if (now - lastFrame < 250) { fpsTotal += now - lastFrame; fpsFrames++; }
      lastFrame = now; frames++;
      if (frames % 180 === 0) report.samples.push({ time: flight.game.time, kills: flight.game.kills, hull: p.hull, ...flight.stats() });
    }
    release(); await wait(150);
    check(flight.game.mode === 'won' && flight.game.kills === 12, 'complete 12-kill sortie using only DOM controls');
    check($('result-dialog').open && $('result-title').textContent.includes('寂静'), 'victory displays Chinese debrief');
    report.fps = Math.round(fpsFrames / (fpsTotal / 1000));
    report.score = flight.game.score; report.time = flight.game.time;
    $('restart').click(); await wait(50);
    check(flight.game.kills === 0 && flight.game.score === 0 && flight.game.player.hull === 100, 'redeploy after victory clears previous run');
    $('pause').click(); $('back-menu').click();
    report.status = 'passed'; return report;
  } catch (error) {
    release(); report.status = 'failed'; report.error = error.message;
    if (flight.game.mode === 'running') $('pause').click();
    throw error;
  }
}
