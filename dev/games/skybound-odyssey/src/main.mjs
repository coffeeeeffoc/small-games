import { ROUTES, BIOMES, VEHICLES, SEGMENT_LENGTH } from './content.mjs';
import { createRun, step, score, snapshot, clamp, segmentScene } from './core.mjs';
import { cleanProgress, isUnlocked, settle } from './progress.mjs';
import { createLocalHost } from './host.mjs';
import { setupDisplay, clientToElement } from './display.mjs';
import { createRenderer } from './render.mjs';

export async function mountSkybound(host = createLocalHost()) {
  const game = document.querySelector('#game');
  const $ = (id) => document.getElementById(id);
  const controller = new AbortController();
  const on = (target, event, callback, options = {}) =>
    target.addEventListener(event, callback, { ...options, signal: controller.signal });
  let persistAllowed = true;
  let progress = cleanProgress(),
    screen = 'home',
    run = createRun({ seed: 419 }),
    selected = 'snowline',
    settled = false;
  let raf = 0,
    last = 0,
    accumulator = 0,
    disposed = false,
    noticeTimer = 0,
    saveQueue = Promise.resolve();
  let audio,
    motionEnabled = false,
    motionZero = null,
    motionRaw = null,
    motionSteer = 0,
    motionLast = 0,
    motionTimer = 0,
    gyroRequested = false;
  let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pressed = new Map(),
    keys = new Set();
  const renderer = createRenderer($('scene'));
  let displayKey = '';
  const display = setupDisplay(game, ({ width, height, rotated }) => {
    renderer.resize(width, height);
    const key = [width, height, rotated, window.screen?.orientation?.angle].join(':');
    if (displayKey && displayKey !== key) {
      clearInput();
      pause();
    }
    displayKey = key;
  });
  try {
    progress = cleanProgress((await host.storage.read('progress'))?.value);
  } catch {
    persistAllowed = false;
    notice('存档暂不可读，本次仅保留会话进度');
  }
  function notice(message) {
    clearTimeout(noticeTimer);
    $('notice').textContent = message;
    $('notice').hidden = false;
    noticeTimer = setTimeout(() => ($('notice').hidden = true), 3500);
  }
  function save() {
    if (!persistAllowed) return;
    const value = structuredClone(progress);
    saveQueue = saveQueue
      .then(() => host.storage.write('progress', value))
      .catch(() => notice('本机存储不可用，进度保留至关闭页面'));
  }
  function sound(type) {
    if (!progress.sound || disposed) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') void audio.resume();
      const osc = audio.createOscillator(),
        gain = audio.createGain();
      osc.type = 'sine';
      const now = audio.currentTime;
      osc.frequency.setValueAtTime(type === 'fail' ? 140 : type === 'star' ? 720 : 440, now);
      osc.frequency.exponentialRampToValueAtTime(
        type === 'fail' ? 55 : type === 'star' ? 1060 : 660,
        now + 0.16,
      );
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain).connect(audio.destination);
      osc.start();
      osc.stop(now + 0.21);
    } catch {
      /* Audio is optional. */
    }
  }
  function clearInput() {
    pressed.clear();
    keys.clear();
    motionSteer = 0;
    motionZero = null;
    $('brake').dataset.active = 'false';
    $('steering-pad').dataset.active = '';
  }
  function switchScreen(next) {
    screen = next;
    game.dataset.screen = next;
    for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== next + '-screen';
    clearInput();
    accumulator = 0;
    last = 0;
    if (next !== 'play') void audio?.suspend();
    if (window.parent !== window)
      window.parent.postMessage(
        {
          type: 'small-games:display-state',
          gameId: 'skybound-odyssey',
          screen: ['play', 'pause', 'result'].includes(next) ? 'playing' : 'home',
        },
        location.origin,
      );
    const focus = {
      home: 'start-game',
      routes: 'route-list',
      pause: 'resume-game',
      result: run.status === 'complete' && !$('next-route').hidden ? 'next-route' : 'retry-game',
      settings: 'motion-toggle',
      help: 'help-screen',
    }[next];
    if (focus)
      requestAnimationFrame(
        () =>
          $(focus)?.querySelector?.('button:not(:disabled)')?.focus() ||
          $(focus)?.focus({ preventScroll: true }),
      );
  }
  function renderHome() {
    const route = ROUTES.find((r) => r.id === selected);
    $('home-route').textContent = `0${ROUTES.indexOf(route) + 1} / ${route.name}`;
    $('best-label').textContent = `最远 ${progress.bestDistance} m`;
    $('route-list').replaceChildren(
      ...ROUTES.map((r, i) => {
        const b = document.createElement('button');
        const unlocked = isUnlocked(progress, r);
        b.className = 'route-card' + (r.id === selected ? ' current' : '');
        b.disabled = !unlocked;
        b.dataset.route = r.id;
        const number = document.createElement('span');
        number.className = 'route-num';
        number.textContent = unlocked
          ? progress.completed.includes(r.id)
            ? '已通过'
            : `0${i + 1}`
          : '未解锁';
        const title = document.createElement('b');
        title.textContent = r.name;
        const desc = document.createElement('small');
        desc.textContent = unlocked ? r.caption : `通过${ROUTES[i - 1].name}后开启`;
        b.append(number, title, desc);
        b.addEventListener(
          'click',
          () => {
            selected = r.id;
            start(selected);
          },
          { signal: controller.signal },
        );
        return b;
      }),
    );
    $('sound-toggle').textContent = '音效：' + (progress.sound ? '开' : '关');
    $('motion-effects').textContent = '动态效果：' + (reduced ? '减弱' : '标准');
  }
  function freshSeed() {
    const a = new Uint32Array(1);
    if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(a);
    else a[0] = Date.now() ^ (Math.random() * 0xffffffff);
    return a[0];
  }
  function start(routeId = selected, seed = freshSeed(), practice = false) {
    const route = ROUTES.find((r) => r.id === routeId);
    if (route && !isUnlocked(progress, route) && !practice) return;
    run = createRun({ routeId, seed, practice });
    settled = false;
    switchScreen('play');
    void audio?.resume();
    sound('start');
    updateHUD();
  }
  function retry() {
    start(run.routeId, run.seed, run.practice);
  }
  function pause() {
    if (screen !== 'play') return;
    switchScreen('pause');
    $('pause-caption').textContent =
      `${BIOMES[run.scene].name} · 已行进 ${Math.floor(run.distance)} m`;
  }
  function finish() {
    if (settled) return;
    settled = true;
    const wasComplete = progress.completed.length;
    progress = settle(progress, run, score(run));
    save();
    renderHome();
    $('result-title').textContent = run.status === 'complete' ? '越过新的天际' : run.reason;
    $('result-eyebrow').textContent = run.practice
      ? 'PRACTICE / 试玩不计进度'
      : run.status === 'complete'
        ? 'CROSSING COMPLETE'
        : 'ONE MORE TRY';
    $('result-tip').textContent =
      run.status === 'complete'
        ? '下一段风景，等你出发。'
        : run.reason.includes('快')
          ? '金色门前提前按住减速，让速度降到18以下。'
          : run.reason.includes('门')
            ? '看清金色门的位置，先对准，再通过。'
            : run.reason.includes('航道')
              ? '松开方向会逐渐回稳，别把弯压得太久。'
              : '提前看橙色障碍，往空出来的一侧绕行。';
    $('result-distance').textContent = Math.floor(run.distance);
    $('result-score').textContent = score(run);
    $('unlock-note').textContent =
      progress.completed.length > wasComplete
        ? progress.completed.length === ROUTES.length
          ? '全部航线已通过，继续无尽远征'
          : '新航线已解锁'
        : run.practice
          ? '本次为开发试玩，不写入纪录。'
          : '';
    const index = ROUTES.findIndex((r) => r.id === run.routeId);
    $('next-route').hidden =
      run.status !== 'complete' || run.practice || index < 0 || index >= ROUTES.length - 1;
    $('retry-game').hidden = !$('next-route').hidden;
    switchScreen('result');
    sound(run.status === 'failed' ? 'fail' : 'start');
  }
  function updateHUD() {
    game.dataset.distance = run.distance.toFixed(2);
    game.dataset.x = run.x.toFixed(3);
    game.dataset.seed = String(run.seed);
    game.dataset.vehicle = run.vehicle;
    game.dataset.status = run.status;
    $('scene-name').textContent = BIOMES[run.scene].name;
    $('vehicle-name').textContent = VEHICLES[run.vehicle].name;
    $('distance').textContent = Math.floor(run.distance);
    $('star-count').textContent = run.stars;
    $('speed-value').textContent = Math.round(run.speed);
    $('progress-fill').style.width =
      (Number.isFinite(run.total)
        ? run.distance / run.total
        : (run.distance % SEGMENT_LENGTH) / SEGMENT_LENGTH) *
        100 +
      '%';
    const local = run.distance % SEGMENT_LENGTH;
    $('transition-label').textContent =
      local > 185 && run.total - run.distance < 55
        ? '终点就在前方'
        : local > 185
          ? segmentScene(run.seed, run.segmentIndex + 1, run.routeId) === run.scene
            ? '前方航道延续'
            : BIOMES[run.scene].transition
          : local < 35 && run.segmentIndex > 0
            ? `${BIOMES[run.scene].name} · ${VEHICLES[run.vehicle].name}`
            : '';
    $('feedback').textContent = run.feedbackTime > 0 ? run.feedback : '';
    $('tutorial').hidden = run.distance > 210;
    $('tutorial').textContent =
      run.distance < 95
        ? '左右转向避开橙色障碍'
        : run.distance < 145
          ? '星屑加分，不必全部收集'
          : '金色门：对准中心，按住减速至18以下';
  }
  function input() {
    let steer = 0,
      brake = false;
    for (const p of pressed.values()) {
      if (p.kind === 'brake') brake = true;
      else steer += p.value;
    }
    if (keys.has('ArrowLeft') || keys.has('a')) steer--;
    if (keys.has('ArrowRight') || keys.has('d')) steer++;
    brake ||= keys.has(' ');
    const touchSteering = [...pressed.values()].some((p) => p.kind === 'steer');
    if (!touchSteering && !keys.size && motionEnabled && performance.now() - motionLast < 800)
      steer = motionSteer;
    return { steer: clamp(steer, -1, 1), brake };
  }
  function held(element, kind, value) {
    on(element, 'pointerdown', (e) => {
      if (screen !== 'play') return;
      e.preventDefault();
      e.stopPropagation();
      element.setPointerCapture(e.pointerId);
      pressed.set(e.pointerId, { kind, value });
    });
  }
  held($('steer-left'), 'steer', -1);
  held($('steer-right'), 'steer', 1);
  held($('brake'), 'brake', 0);
  on($('steering-pad'), 'pointerdown', (e) => {
    if (screen !== 'play' || e.target.closest('button')) return;
    e.preventDefault();
    $('steering-pad').setPointerCapture(e.pointerId);
    const p = clientToElement($('steering-pad'), e.clientX, e.clientY);
    pressed.set(e.pointerId, {
      kind: 'steer',
      value: clamp((p.x / $('steering-pad').clientWidth - 0.5) * 2, -1, 1),
      drag: true,
    });
  });
  on(game, 'pointermove', (e) => {
    const entry = pressed.get(e.pointerId);
    if (!entry?.drag) return;
    const p = clientToElement($('steering-pad'), e.clientX, e.clientY);
    entry.value = clamp((p.x / $('steering-pad').clientWidth - 0.5) * 2, -1, 1);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    on(window, type, (e) => pressed.delete(e.pointerId));
  on(window, 'keydown', (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === 'Escape') {
      if (screen === 'play') pause();
      else if (screen === 'pause') switchScreen('play');
      return;
    }
    if (screen === 'play' && ['a', 'd', 'ArrowLeft', 'ArrowRight', ' '].includes(key)) {
      e.preventDefault();
      keys.add(key);
    }
  });
  on(window, 'keyup', (e) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  on(window, 'blur', pause);
  on(document, 'visibilitychange', () => {
    if (document.hidden) pause();
  });
  on($('start-game'), 'click', () => start());
  on($('choose-route'), 'click', () => {
    renderHome();
    switchScreen('routes');
  });
  on($('endless-game'), 'click', () => start('endless'));
  on($('pause-button'), 'click', pause);
  on($('resume-game'), 'click', () => {
    switchScreen('play');
    void audio?.resume();
  });
  on($('pause-retry'), 'click', retry);
  on($('retry-game'), 'click', retry);
  on($('new-run'), 'click', () => start(run.routeId));
  on($('next-route'), 'click', () => {
    selected = ROUTES[ROUTES.findIndex((r) => r.id === run.routeId) + 1].id;
    start();
  });
  for (const button of document.querySelectorAll('[data-home]'))
    on(button, 'click', () => {
      renderHome();
      switchScreen('home');
    });
  on($('settings-button'), 'click', () => switchScreen('settings'));
  on($('help-button'), 'click', () => switchScreen('help'));
  on($('sound-toggle'), 'click', () => {
    progress.sound = !progress.sound;
    renderHome();
    save();
  });
  on($('motion-effects'), 'click', () => {
    reduced = !reduced;
    renderHome();
  });
  function disableMotion(message = '当前使用触屏控制') {
    motionEnabled = false;
    motionZero = null;
    motionSteer = 0;
    clearTimeout(motionTimer);
    $('motion-toggle').textContent = '开启倾斜控制';
    $('motion-status').textContent = message;
  }
  on($('motion-toggle'), 'click', async () => {
    if (motionEnabled) {
      disableMotion();
      return;
    }
    if (gyroRequested) return;
    gyroRequested = true;
    try {
      if (typeof DeviceOrientationEvent === 'undefined') {
        disableMotion('设备不支持倾斜控制，可继续触屏');
        return;
      }
      if (
        typeof DeviceOrientationEvent.requestPermission === 'function' &&
        (await DeviceOrientationEvent.requestPermission()) !== 'granted'
      ) {
        disableMotion('未获得权限，可继续触屏控制');
        return;
      }
      motionEnabled = true;
      motionZero = null;
      motionLast = 0;
      $('motion-toggle').textContent = '关闭倾斜控制';
      $('motion-status').textContent = '自然握持，正在等待传感器…';
      clearTimeout(motionTimer);
      motionTimer = setTimeout(() => {
        if (motionEnabled && !motionLast) disableMotion('没有收到传感器数据，可继续触屏');
      }, 2500);
    } catch {
      disableMotion('倾斜权限不可用，可继续触屏');
    } finally {
      gyroRequested = false;
    }
  });
  on($('calibrate'), 'click', () => {
    motionZero = motionRaw;
    motionSteer = 0;
    $('motion-status').textContent = motionEnabled
      ? '已以当前握姿校准'
      : '先开启倾斜控制，或继续触屏';
  });
  on(window, 'deviceorientation', (e) => {
    if (!motionEnabled || !Number.isFinite(e.beta) || !Number.isFinite(e.gamma)) return;
    const angle = Number(screenOrientationAngle());
    const screenX = angle === 90 ? e.beta : angle === 270 || angle === -90 ? -e.beta : e.gamma;
    const raw = game.dataset.rotated === 'true' ? e.beta : screenX;
    motionRaw = raw;
    if (motionZero === null) motionZero = raw;
    const delta = raw - motionZero;
    motionSteer = Math.abs(delta) < 2 ? 0 : clamp(delta / 18, -1, 1);
    motionLast = performance.now();
    $('motion-status').textContent = '倾斜已开启 · 小幅左右倾斜转向';
  });
  function screenOrientationAngle() {
    return window.screen?.orientation?.angle ?? window.orientation ?? 0;
  }
  const cleanups = [];
  const dev = window.SmallGamesDev;
  if (dev?.isEnabled()) {
    cleanups.push(
      dev.registerSnapshot(() => ({
        screen,
        run: snapshot(run),
        progress: structuredClone(progress),
        input: input(),
        motion: { enabled: motionEnabled, steer: motionSteer },
        rotated: game.dataset.rotated,
      })),
    );
    cleanups.push(
      dev.registerActions(
        ROUTES.map((r) => ({
          id: 'preview-' + r.id,
          label: '试玩：' + r.name,
          run: () => start(r.id, 419, true),
        })),
      ),
    );
  }
  function tick(time) {
    if (disposed) return;
    const delta = last ? Math.min(0.1, (time - last) / 1000) : 0;
    last = time;
    if (screen === 'play') {
      accumulator += delta;
      const controls = input();
      $('brake').dataset.active = String(controls.brake);
      $('steering-pad').dataset.active =
        controls.steer < -0.1 ? 'left' : controls.steer > 0.1 ? 'right' : '';
      const stars = run.stars;
      while (accumulator >= 1 / 120 && run.status === 'playing') {
        step(run, controls, 1 / 120);
        accumulator -= 1 / 120;
      }
      if (run.stars > stars) sound('star');
      updateHUD();
      if (run.status !== 'playing') finish();
    }
    renderer.draw(run, screen, reduced);
    raf = requestAnimationFrame(tick);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    controller.abort();
    display.dispose();
    cancelAnimationFrame(raf);
    clearTimeout(noticeTimer);
    clearTimeout(motionTimer);
    clearInput();
    cleanups.forEach((fn) => fn?.());
    void audio?.close();
  }
  on(window, 'pagehide', (event) => {
    if (event.persisted) pause();
    else dispose();
  });
  renderHome();
  switchScreen('home');
  game.dataset.ready = 'true';
  raf = requestAnimationFrame(tick);
  return { dispose };
}
void mountSkybound();
