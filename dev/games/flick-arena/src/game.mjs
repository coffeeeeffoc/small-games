import { createMatch, shoot, step, chooseBot, seeded, physics } from './core.mjs';
import { layouts } from './layouts.mjs';
import { readSave, settle } from './progress.mjs';
import { draw, W, H, arena, names } from './render.mjs';
export function createGame(target, options = {}) {
  const ctx = target.canvas.getContext('2d');
  if (!ctx) throw new Error('当前设备不支持 Canvas 2D');
  const catalog = options.layouts ?? layouts;
  const app = {
    layouts: catalog,
    screen: 'home',
    state: null,
    time: 0,
    drag: null,
    save: readSave(options.save),
    buttons: [],
    particles: [],
    trails: [],
    toast: '',
    reason: '',
  };
  let pointer = null,
    pressed = null,
    accumulator = 0,
    botTime = 0,
    matchTime = 0,
    toastTime = 0,
    disposed = false,
    suspended = false;
  let random = seeded(Date.now()),
    frames = [],
    replayFrames = [],
    replayIndex = 0,
    resultState = null,
    practice = null;
  const sounds = {};
  for (const cue of ['shot', 'hit', 'out', 'win']) {
    try {
      sounds[cue] = target.createSound?.(`audio/${cue}.wav`, { volume: 0.4 });
    } catch {
      /* sound is optional */
    }
  }
  function sound(cue) {
    if (app.save.sound && !suspended) {
      try {
        sounds[cue]?.play();
      } catch {
        /* no audio must remain playable */
      }
    }
  }
  function cancel() {
    app.drag = null;
    pointer = null;
    pressed = null;
  }
  function screen(value) {
    if (['home', 'paused'].includes(value)) for (const s of Object.values(sounds)) s?.stop();
    cancel();
    app.screen = value;
    botTime = 0;
    accumulator = 0;
    app.toast = '';
    render();
  }
  function persist() {
    try {
      Promise.resolve(options.saveProgress?.({ ...app.save })).catch(() => {});
    } catch {
      /* ephemeral play is supported */
    }
  }
  function start(index = null) {
    practice = index;
    matchTime = 0;
    screen('matching');
  }
  function begin() {
    const layout = catalog[practice ?? Math.floor(Math.random() * catalog.length)];
    app.state = createMatch(layout);
    random = seeded(app.state.seed);
    app.reason = '';
    app.trails = [];
    app.particles = [];
    frames = [];
    replayFrames = [];
    resultState = null;
    screen('playing');
  }
  function snapshot() {
    return JSON.parse(JSON.stringify(app.state));
  }
  function fire(x, y, power) {
    frames = [snapshot()];
    return shoot(app.state, x, y, power);
  }
  function action(id) {
    if (disposed || suspended) return;
    if (id === 'start') start();
    else if (id === 'again') start(practice);
    else if (id === 'layouts' || id === 'help' || id === 'home') screen(id);
    else if (id.startsWith('layout-')) start(Number(id.slice(7)));
    else if (id === 'pause' && app.screen === 'playing') screen('paused');
    else if (id === 'resume') screen('playing');
    else if (id === 'sound') {
      app.save.sound = !app.save.sound;
      if (!app.save.sound) for (const s of Object.values(sounds)) s?.stop();
      persist();
      render();
    } else if (id === 'replay' && replayFrames.length) {
      resultState = app.state;
      replayIndex = 0;
      app.state = JSON.parse(JSON.stringify(replayFrames[0]));
      screen('replay');
    } else if (id === 'result') {
      app.state = resultState;
      screen('result');
    }
  }
  function render() {
    if (disposed) return;
    const width = target.canvas.width,
      height = target.canvas.height,
      s = Math.min(width / W, height / H),
      ox = (width - W * s) / 2,
      oy = (height - H * s) / 2;
    ctx.fillStyle = '#0d2026';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(s, s);
    app.buttons = draw(ctx, app);
    ctx.restore();
    options.onRender?.(app, { scale: s, ox, oy });
  }
  function coords(e) {
    const s = Math.min(target.canvas.width / W, target.canvas.height / H);
    return {
      x: (e.x - (target.canvas.width - W * s) / 2) / s,
      y: (e.y - (target.canvas.height - H * s) / 2) / s,
    };
  }
  function input(e) {
    if (disposed || suspended) return;
    const p = coords(e);
    if (e.phase === 'cancel') {
      if (pointer === e.pointerId) cancel();
      render();
      return;
    }
    if (e.phase === 'down') {
      if (pointer !== null) return;
      pointer = e.pointerId;
      pressed = app.buttons.find(
        (b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h,
      )?.id;
      if (
        !pressed &&
        app.screen === 'playing' &&
        app.state.phase === 'aim' &&
        app.state.active === 0
      ) {
        const d = app.state.discs[0],
          x = arena.x + d.x * arena.scale,
          y = arena.y + d.y * arena.scale;
        if (Math.hypot(p.x - x, p.y - y) <= 32)
          app.drag = { startX: p.x, startY: p.y, dx: 0, dy: 0 };
      }
    } else if (e.pointerId === pointer) {
      if (app.drag) {
        app.drag.dx = p.x - app.drag.startX;
        app.drag.dy = p.y - app.drag.startY;
      }
      if (e.phase === 'up') {
        const drag = app.drag,
          id = pressed;
        cancel();
        if (drag && Math.hypot(drag.dx, drag.dy) >= 9)
          fire(-drag.dx, -drag.dy, Math.min(1, Math.hypot(drag.dx, drag.dy) / 115));
        else if (id) {
          const b = app.buttons.find((b) => b.id === id);
          if (b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) action(id);
        }
      }
    }
    render();
  }
  const stop = target.onPointer(input);
  function tick(dt) {
    if (disposed || suspended) return;
    dt = Math.min(0.05, Math.max(0, dt));
    app.time += dt;
    if (app.screen === 'matching') {
      matchTime += dt;
      if (matchTime >= 1.15) begin();
    }
    if (app.screen === 'replay') {
      replayIndex += dt / physics.step;
      app.state = JSON.parse(
        JSON.stringify(replayFrames[Math.min(replayFrames.length - 1, Math.floor(replayIndex))]),
      );
      if (replayIndex >= replayFrames.length + 1 / physics.step) {
        app.state = resultState;
        screen('result');
      }
    }
    if (app.screen === 'playing') {
      const s = app.state;
      for (const d of s.discs) if (!d.alive) d.fall = Math.min(1, d.fall + dt * 2.2);
      app.particles = app.particles.filter((p) => (p.age += dt) < 0.45);
      toastTime -= dt;
      if (toastTime <= 0) app.toast = '';
      if (s.phase === 'aim' && s.active !== 0) {
        botTime += dt;
        if (botTime >= 1.25) {
          const move = chooseBot(s, random);
          fire(move.x, move.y, move.power);
          botTime = 0;
        }
      }
      if (s.phase === 'moving' || s.phase === 'shrinking') {
        accumulator += dt;
        while (accumulator >= physics.step) {
          step(s);
          accumulator -= physics.step;
          // Replays use the physics clock, so their speed is independent of display refresh rate.
          frames.push(snapshot());
          if (s.phase !== 'moving' && s.phase !== 'shrinking') {
            accumulator = 0;
            break;
          }
        }
        app.trails =
          s.phase === 'moving'
            ? s.discs
                .filter((d) => d.alive && Math.hypot(d.vx, d.vy) > 40)
                .map((d) => ({ id: d.id, x: d.x - d.vx * 0.045, y: d.y - d.vy * 0.045 }))
            : [];
      } else {
        accumulator = 0;
        app.trails = [];
      }
      const events = s.events.splice(0);
      for (const e of events) {
        if (e.type === 'shot') sound('shot');
        if (e.type === 'hit') {
          app.particles.push({ ...e, age: 0 });
          sound('hit');
        }
        if (e.type === 'out') {
          sound('out');
          app.toast = `${names[e.id]}，出界！`;
          toastTime = 1.6;
          if (e.id === 0)
            app.reason =
              e.reason === 'ring'
                ? '收圈时留在了外侧，下次提前向内走位'
                : s.lastShot?.actor === 0
                  ? '这一弹用力过猛，自己滑出了擂台'
                  : '被对手撞到台外，下次给落点留些余地';
        }
        if (e.type === 'end') {
          replayFrames = frames;
          app.save = settle(app.save, s.winner);
          persist();
          sound(s.winner === 0 ? 'win' : 'out');
          // Keep the fall visible before settlement; no gameplay timer continues behind a pause.
          botTime = -0.85;
        }
      }
      if (s.phase === 'over') {
        botTime += dt;
        if (botTime >= 0) screen('result');
      }
    }
    render();
  }
  render();
  return {
    app,
    tick,
    render,
    action,
    cancel,
    pause() {
      suspended = true;
      cancel();
      if (app.screen === 'playing') screen('paused');
      for (const s of Object.values(sounds)) s?.stop();
    },
    resume() {
      suspended = false;
      accumulator = 0;
      render();
    },
    dispose() {
      disposed = true;
      cancel();
      stop?.();
      for (const s of Object.values(sounds)) s?.dispose();
      ctx.clearRect(0, 0, target.canvas.width, target.canvas.height);
    },
    debug() {
      return {
        screen: app.screen,
        state: app.state ? JSON.parse(JSON.stringify(app.state)) : null,
        drag: app.drag,
        buttons: app.buttons,
      };
    },
    debugStart(index = 0) {
      practice = index;
      begin();
    },
  };
}
