import { createRun, stepRun, chooseUpgrade, LEVELS, UPGRADES } from './core.mjs';
import { renderer, consumeRenderEvents, getCamera } from './render.mjs';
import { createLocalHost } from './host.mjs';
import { readProgress, unlockedCount, recordProgress } from './progress.mjs';
import { createAudio } from './audio.mjs';
import { setupDisplay, clientToElement } from './display.mjs';

const pad = (n) => String(n).padStart(2, '0');
const clock = (seconds) => pad(Math.floor(seconds / 60)) + ':' + pad(Math.floor(seconds % 60));
const icons = {
  scatter:
    '<path d="M8 22h24M8 22L31 9M8 22l23 13"/><path d="M27 5l8 2-4 7M28 17l7 5-7 5M31 30l4 7-8 2"/>',
  pierce: '<path d="M4 22h33M30 15l8 7-8 7M14 8v28M25 8v28"/>',
  salvage: '<path d="M15 7h13v10h10v12H28v10H15V29H5V17h10z"/>',
  rapid: '<path d="M23 3L10 24h12l-2 17 14-23H22z"/>',
  mobility: '<path d="M3 12h17M3 22h25M3 32h17M24 7l14 15-14 15"/>',
};

export async function mountAshfall(host = createLocalHost()) {
  const $ = (id) => document.getElementById(id);
  const gameElement = $('game');
  const canvas = $('game-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('当前浏览器无法创建游戏画布');
  let progress;
  try {
    progress = readProgress((await host.storage.read('progress'))?.value);
  } catch {
    progress = readProgress(null);
  }
  let run = createRun();
  let screenName = 'home';
  let helpReturn = 'home',
    inputMode;
  let trial = false,
    disposed = false,
    lastFrame = 0,
    accumulator = 0,
    visualTime = 0;
  let width = 844,
    height = 390,
    dpr = 1,
    frameId,
    toastUntil = 0;
  let mouseAim = null,
    fireGesture = null,
    jumpEdge = false,
    dashEdge = false,
    fireEdge = false,
    shotTilt = 0;
  let saveQueue = Promise.resolve(),
    storageWarning = false;
  const pointers = new Map();
  let menuPresses = new WeakMap();
  const keys = new Set();
  const controls = [...document.querySelectorAll('[data-control]')];
  const abort = new AbortController();
  const cleanups = [];
  const audio = createAudio(progress.sound);
  const reducedMotion = () =>
    progress.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  const on = (target, type, listener) =>
    target.addEventListener(type, listener, { signal: abort.signal });
  const text = (id, value) => {
    if ($(id).textContent !== value) $(id).textContent = value;
  };
  const keyMap = {
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    jump: ['Space', 'KeyW', 'ArrowUp'],
    dash: ['ShiftLeft', 'ShiftRight'],
    fire: ['KeyJ'],
    aimUp: ['KeyI'],
    aimDown: ['KeyK', 'Comma'],
  };
  const held = (action) =>
    [...pointers.values()].includes(action) || keyMap[action]?.some((key) => keys.has(key));
  function setInputMode(mode) {
    if (inputMode === mode) return;
    inputMode = mode;
    gameElement.dataset.input = mode;
    const touch = mode === 'touch';
    text('help-mode', touch ? '触屏操作' : '键盘 / 鼠标操作');
    text(
      'help-move',
      touch
        ? '左下方向键移动，右下按钮跳跃和冲刺。冲刺期间短暂无敌。'
        : 'A / D 或左右方向键移动，空格 / W / ↑ 跳跃，Shift 冲刺。',
    );
    text('help-move-detail', touch ? '左右手可同时操作' : '冲刺期间短暂无敌');
    text(
      'help-fire',
      touch
        ? '按住橙色射击键自动连射，朝目标方向拖动瞄准。左上、左下同理。'
        : '按住 I 斜上连射，J 自动瞄准连射，K 斜下连射。斜向跟随面朝方向。',
    );
    text(
      'help-fire-detail',
      touch
        ? '右上拖：向右上射\n右下拖：向右下射 · 松开停止'
        : '每个键单独开火 · 鼠标按住左键自由瞄准',
    );
    $('help-aim-demo').toggleAttribute('hidden', !touch);
    text(
      'help-pause',
      touch ? '右上暂停按钮可查看操作指南' : 'Esc 暂停 / 继续 · 回车确认 · Tab 切换',
    );
    text('help-storage', touch ? '支持多点触控 · 进度自动保存' : '进度自动保存在本机');
  }
  function syncControls() {
    for (const button of controls)
      button.setAttribute(
        'aria-pressed',
        String(
          Boolean(
            held(button.dataset.control) ||
              (button.dataset.control === 'fire' && (held('aimUp') || held('aimDown'))),
          ),
        ),
      );
  }
  function clearInput() {
    const ids = [...pointers.keys()];
    pointers.clear();
    keys.clear();
    jumpEdge = false;
    dashEdge = false;
    fireEdge = false;
    shotTilt = 0;
    mouseAim = null;
    fireGesture = null;
    $('fire-aim').setAttribute('transform', 'translate(0 0)');
    $('fire-line').setAttribute('x2', '20');
    $('fire-line').setAttribute('y2', '20');
    for (const element of [canvas, ...controls]) {
      for (const id of ids) if (element.hasPointerCapture?.(id)) element.releasePointerCapture(id);
    }
    syncControls();
  }
  function toast(message, duration = 1600) {
    text('toast', message);
    $('toast').hidden = false;
    toastUntil = performance.now() + duration;
  }
  function save() {
    const value = structuredClone(progress);
    saveQueue = saveQueue
      .catch(() => {})
      .then(() => host.storage.write('progress', value))
      .catch(() => {
        if (!disposed && !storageWarning) {
          storageWarning = true;
          toast('本机存储不可用，本次进度保留至关闭页面。', 4500);
        }
      });
  }
  function syncSettings() {
    $('sound-toggle').setAttribute('aria-pressed', String(progress.sound));
    $('sound-toggle').setAttribute('aria-label', '声音：' + (progress.sound ? '开' : '关'));
    text('sound-label', '声音 ' + (progress.sound ? '开' : '关'));
    $('motion-toggle').setAttribute('aria-pressed', String(reducedMotion()));
    text('motion-toggle', '减弱动态：' + (reducedMotion() ? '开' : '关'));
  }
  function notifyHost(next) {
    if (window.parent === window) return;
    try {
      window.parent.postMessage(
        {
          type: 'small-games:display-state',
          gameId: 'ashfall-front',
          screen: ['play', 'pause', 'upgrade', 'result'].includes(next) ? 'playing' : 'home',
        },
        document.referrer ? new URL(document.referrer).origin : location.origin,
      );
    } catch {
      /* Standalone pages do not require a Shell. */
    }
  }
  function setScreen(next) {
    clearInput();
    menuPresses = new WeakMap();
    screenName = next;
    accumulator = 0;
    gameElement.dataset.screen = next;
    document.body.dataset.screen = next;
    for (const id of ['home', 'levels', 'play', 'upgrade', 'pause', 'result', 'help']) {
      $(id + '-screen').hidden = id !== next;
    }
    $('toast').hidden = true;
    toastUntil = 0;
    $('trial-label').hidden = !trial || !['play', 'pause', 'upgrade', 'result'].includes(next);
    if (next === 'pause') audio.suspend();
    if (next === 'home') {
      text('home-progress', pad(unlockedCount(progress)) + ' / 03 战区已解锁');
      text(
        'home-record',
        progress.bestTime ? '最佳突破 ' + clock(progress.bestTime) : '一名先锋，一条出路。',
      );
    }
    if (next === 'levels') renderLevels();
    if (next === 'upgrade') renderUpgrades();
    if (next === 'result') renderResult();
    const focusSelectors = {
      home: '#start-game',
      levels: '.level-card:not(:disabled)',
      upgrade: '.upgrade-card',
      pause: '[data-action="resume"]',
      result: '[data-action="retry"]',
      help: '#help-back',
    };
    if (next === 'play') canvas.focus({ preventScroll: true });
    else {
      const page = $(next + '-screen');
      const button =
        (next === 'levels' && page.querySelector('.level-card.current:not(:disabled)')) ||
        page.querySelector(focusSelectors[next]);
      button?.focus({ preventScroll: true });
    }
    notifyHost(next);
  }
  function start(index = 0, developer = false) {
    if (!Number.isInteger(index) || index < 0 || index >= LEVELS.length) return;
    if (!developer && index >= unlockedCount(progress)) return;
    run = createRun(index);
    trial = developer;
    visualTime = 0;
    setScreen('play');
    updateHUD();
    consumeRenderEvents(run);
    void audio.unlock();
  }
  function renderLevels() {
    $('level-cards').replaceChildren();
    LEVELS.forEach((level, index) => {
      const unlocked = index < unlockedCount(progress);
      const complete = progress.completed.includes(level.id);
      const button = document.createElement('button');
      button.className = 'level-card' + (unlocked && !complete ? ' current' : '');
      button.disabled = !unlocked;
      button.dataset.level = index;
      button.setAttribute(
        'aria-label',
        pad(index + 1) + ' ' + level.name + (unlocked ? '，进入行动' : '，未解锁'),
      );
      button.innerHTML =
        '<svg class="map-art" viewBox="0 0 280 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="280" height="220" fill="' +
        ['#405046', '#4e4937', '#3b4748'][index] +
        '"/><path d="M0 115h30V55h15v60h25V84h60V29h18v86h20V73h63v40h49v110H0" fill="#15291f"/><path d="M0 162h280M13 153V118h73v35m40 0v-28h144v29" fill="none" stroke="#75806a" stroke-width="6"/><path d="M87 18v98h45M219 0v126h61" fill="none" stroke="#91a485" stroke-width="5" opacity=".2"/><rect x="' +
        (60 + index * 43) +
        '" y="125" width="28" height="22" fill="#e3b265" opacity=".6"/></svg><span class="mission-number">' +
        pad(index + 1) +
        '</span><strong>' +
        level.name +
        '</strong><small>' +
        level.subtitle +
        '</small><span class="mission-state">' +
        (complete
          ? '已突破 · 再次进入 ↗'
          : unlocked
            ? '行动就绪 · 点击进入 ↗'
            : '未解锁 · 完成上一战区') +
        '</span>';
      $('level-cards').append(button);
    });
  }
  function renderUpgrades() {
    $('upgrade-cards').replaceChildren();
    for (const id of run.choices) {
      const upgrade = UPGRADES.find((item) => item.id === id);
      if (!upgrade) continue;
      const button = document.createElement('button');
      button.className = 'upgrade-card';
      button.dataset.upgrade = id;
      button.innerHTML =
        '<span class="upgrade-icon" aria-hidden="true"><svg viewBox="0 0 44 44">' +
        (icons[upgrade.icon] || icons.rapid) +
        '</svg></span><strong>' +
        upgrade.name +
        '</strong><p>' +
        upgrade.description +
        '</p><span class="install">装配此改装 <span>↗</span></span>';
      $('upgrade-cards').append(button);
    }
  }
  function renderResult() {
    const won = run.phase === 'won';
    text('result-eyebrow', won ? 'OPERATION COMPLETE' : 'SIGNAL LOST / 行动中断');
    text('result-title', won ? (run.startIndex === 0 ? '防线突破' : '任务完成') : '火线仍在');
    text(
      'result-copy',
      won
        ? '拆解者已停机。下一次，试试另一种改装组合。'
        : run.level.name + ' · 保持移动，利用冲刺避开密集火力。',
    );
    text('result-time', clock(run.time));
    text('result-kills', pad(run.kills));
    text('result-upgrades', pad(run.upgrades.length));
  }
  function updateHUD() {
    const p = run.player;
    text('hp-label', Math.ceil(p.hp) + ' / ' + p.maxHp);
    const hp = Math.max(0, (p.hp / p.maxHp) * 100).toFixed(1) + '%';
    if ($('hp-fill').style.width !== hp) $('hp-fill').style.width = hp;
    text(
      'build-label',
      run.upgrades.length
        ? run.upgrades.map((id) => UPGRADES.find((item) => item.id === id)?.short).join(' · ')
        : '制式步枪',
    );
    text('room-title', pad(run.levelIndex + 1) + ' / ' + run.level.name);
    const alive = run.enemies.filter((enemy) => enemy.hp > 0);
    const boss = alive.find((enemy) => enemy.type === 'boss');
    text(
      'room-objective',
      boss
        ? '突破最后一道防线'
        : alive.length
          ? '清除驻守敌人 ' + alive.length + ' · ' + (run.waveIndex + 1) + '/' + run.wavesTotal
          : '下一波敌军正在接近',
    );
    [...document.querySelectorAll('.room-pips i')].forEach((item, index) =>
      item.classList.toggle('active', index <= run.levelIndex),
    );
    $('boss-hud').hidden = !boss;
    if (boss) {
      $('boss-fill').style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
      text(
        'boss-state',
        boss.state === 'recover'
          ? '核心暴露 · 集中火力'
          : boss.state === 'telegraph'
            ? boss.attack?.kind === 'charge'
              ? '冲撞预警'
              : '弹幕预警'
            : boss.phase === 2
              ? '过载阶段'
              : '重装防御',
      );
    }
    const cooling = p.dashCooldown > 0.01;
    $('dash').classList.toggle('cooling', cooling);
    text('dash-label', cooling ? p.dashCooldown.toFixed(1) + 's' : '冲刺');
    let hint = '';
    if (run.levelIndex === 0 && run.roomTime < 7)
      hint =
        inputMode === 'touch'
          ? '按住射击键 · 朝目标方向拖动'
          : 'I 斜上 · J 自动 · K 斜下，按住即连射';
    else if (run.levelIndex === 0 && run.roomTime < 13) hint = '跳跃越过火线 · 冲刺短暂无敌';
    text('tutorial', hint);
  }
  function act(action) {
    if (action === 'start') start(0);
    else if (action === 'levels') setScreen('levels');
    else if (action === 'home') setScreen('home');
    else if (action === 'help-back') setScreen(helpReturn);
    else if (action === 'help') {
      helpReturn = screenName === 'pause' ? 'pause' : 'home';
      text('help-back-label', helpReturn === 'pause' ? '返回暂停' : '返回主页');
      syncSettings();
      setScreen('help');
    } else if (action === 'pause' && screenName === 'play') setScreen('pause');
    else if (action === 'resume' && screenName === 'pause') {
      setScreen('play');
      void audio.unlock();
    } else if (action === 'retry') start(run.startIndex, trial);
  }
  on(gameElement, 'pointerdown', (event) => {
    setInputMode(event.pointerType === 'mouse' ? 'keyboard' : 'touch');
    const button = event.target.closest('button');
    if (button) menuPresses.set(button, event.pointerId);
  });
  // A finger released after a screen change must not activate the menu beneath it.
  gameElement.addEventListener(
    'click',
    (event) => {
      const button = event.target.closest('button');
      if (button && event.detail > 0 && !menuPresses.has(button)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      if (button) menuPresses.delete(button);
    },
    { capture: true, signal: abort.signal },
  );
  on(gameElement, 'click', (event) => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.action) act(button.dataset.action);
    if (button.dataset.level !== undefined && screenName === 'levels')
      start(Number(button.dataset.level));
    if (
      button.dataset.upgrade &&
      screenName === 'upgrade' &&
      chooseUpgrade(run, button.dataset.upgrade)
    ) {
      consumeRenderEvents(run);
      setScreen('play');
      updateHUD();
      void audio.unlock();
      audio.play('upgrade');
    }
  });
  on($('sound-toggle'), 'click', () => {
    progress.sound = !progress.sound;
    syncSettings();
    save();
    void audio.setEnabled(progress.sound);
    if (screenName === 'pause') audio.suspend();
  });
  on($('motion-toggle'), 'click', () => {
    progress.reducedMotion = !reducedMotion();
    syncSettings();
    save();
  });
  function press(action) {
    if (action === 'jump') jumpEdge = true;
    if (action === 'dash') dashEdge = true;
    if (['fire', 'aimUp', 'aimDown'].includes(action)) {
      fireEdge = true;
      shotTilt = action === 'aimUp' ? -1 : action === 'aimDown' ? 1 : 0;
    }
  }
  for (const button of controls) {
    on(button, 'pointerdown', (event) => {
      if (screenName !== 'play' || (event.pointerType === 'mouse' && event.button !== 0)) return;
      if (button.dataset.control === 'fire' && fireGesture) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, button.dataset.control);
      if (button.dataset.control === 'fire') {
        fireGesture = {
          id: event.pointerId,
          origin: clientToElement(gameElement, event.clientX, event.clientY),
          direction: null,
        };
      }
      press(button.dataset.control);
      syncControls();
      void audio.unlock();
    });
    on(button, 'lostpointercapture', (event) => {
      releasePointer(event);
    });
  }
  on($('fire'), 'pointermove', (event) => {
    if (event.pointerId !== fireGesture?.id) return;
    const point = clientToElement(gameElement, event.clientX, event.clientY);
    const x = point.x - fireGesture.origin.x;
    const y = point.y - fireGesture.origin.y;
    const distance = Math.hypot(x, y);
    fireGesture.direction = distance >= 10 ? { x, y } : null;
    const scale = distance >= 10 ? Math.min(distance, 24) / distance : 0;
    const dx = (x * scale * 40) / $('fire').clientWidth;
    const dy = (y * scale * 40) / $('fire').clientHeight;
    $('fire-aim').setAttribute('transform', `translate(${dx} ${dy})`);
    $('fire-line').setAttribute('x2', String(20 + dx));
    $('fire-line').setAttribute('y2', String(20 + dy));
  });
  function releasePointer(event) {
    pointers.delete(event.pointerId);
    if (fireGesture?.id === event.pointerId) {
      fireGesture = null;
      $('fire-aim').setAttribute('transform', 'translate(0 0)');
      $('fire-line').setAttribute('x2', '20');
      $('fire-line').setAttribute('y2', '20');
    }
    syncControls();
  }
  const updateAim = (event) => {
    const point = clientToElement(canvas, event.clientX, event.clientY);
    const view = getCamera(run, width, height, 'play');
    mouseAim = { x: point.x / view.scale + view.cameraX, y: point.y / view.scale };
  };
  on(canvas, 'pointerdown', (event) => {
    if (screenName !== 'play' || event.pointerType !== 'mouse' || event.button !== 0) return;
    event.preventDefault();
    updateAim(event);
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, 'mouseFire');
    press('fire');
    void audio.unlock();
  });
  on(canvas, 'pointermove', (event) => {
    if (screenName === 'play' && event.pointerType === 'mouse') updateAim(event);
  });
  on(window, 'pointerup', releasePointer);
  on(window, 'pointercancel', releasePointer);
  on(canvas, 'lostpointercapture', releasePointer);
  on(window, 'keydown', (event) => {
    setInputMode('keyboard');
    if (['Enter', 'Space'].includes(event.code) && event.repeat) {
      event.preventDefault();
      return;
    }
    if (event.code === 'Escape') {
      if (event.repeat) {
        event.preventDefault();
        return;
      }
      if (screenName === 'play') act('pause');
      else if (screenName === 'pause') act('resume');
      else if (screenName === 'help') act('help-back');
      else if (screenName === 'levels') act('home');
      event.preventDefault();
      return;
    }
    if (screenName !== 'play') return;
    const action = Object.keys(keyMap).find((name) => keyMap[name].includes(event.code));
    if (!action) return;
    event.preventDefault();
    if (!keys.has(event.code)) press(action);
    keys.add(event.code);
    syncControls();
  });
  on(window, 'keyup', (event) => {
    keys.delete(event.code);
    syncControls();
  });
  function backgroundPause() {
    clearInput();
    if (screenName === 'play') setScreen('pause');
    audio.suspend();
  }
  on(window, 'blur', backgroundPause);
  on(document, 'visibilitychange', () => {
    if (document.hidden) backgroundPause();
  });
  const display = setupDisplay(gameElement, (layout) => {
    width = layout.width;
    height = layout.height;
    dpr = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    clearInput();
  });
  function consume() {
    consumeRenderEvents(run);
    for (const event of run.events) {
      audio.play(event);
      if (event.type === 'explode' && event.chain) toast('连锁爆破 ×' + run.largestChain, 1000);
      if (event.type === 'wave' && event.waveIndex > 0) toast('增援接近 · 保持移动', 1300);
    }
  }
  function animate(timestamp) {
    if (disposed) return;
    const delta = lastFrame ? Math.min((timestamp - lastFrame) / 1000, 0.08) : 0;
    lastFrame = timestamp;
    if (screenName === 'play') {
      accumulator = Math.min(accumulator + delta, 0.1);
      while (accumulator >= 1 / 60 && screenName === 'play') {
        const manual = [...pointers.values()].includes('mouseFire');
        const move = Number(Boolean(held('right'))) - Number(Boolean(held('left')));
        // Keep a short tap's direction until its fire pulse is consumed.
        const tilt =
          held('aimUp') || held('aimDown')
            ? Number(Boolean(held('aimDown'))) - Number(Boolean(held('aimUp')))
            : shotTilt;
        stepRun(
          run,
          {
            move,
            jump: jumpEdge,
            dash: dashEdge,
            fire: Boolean(held('fire') || held('aimUp') || held('aimDown') || manual || fireEdge),
            aim: manual ? mouseAim : null,
            aimDirection:
              fireGesture?.direction || (tilt ? { x: move || run.player.facing, y: tilt } : null),
          },
          1 / 60,
        );
        jumpEdge = false;
        dashEdge = false;
        fireEdge = false;
        shotTilt = 0;
        accumulator -= 1 / 60;
        visualTime += 1 / 60;
        consume();
        if (run.phase !== 'playing') {
          if (recordProgress(progress, run, trial)) save();
          setScreen(run.phase === 'upgrade' ? 'upgrade' : 'result');
          break;
        }
      }
      updateHUD();
    } else {
      accumulator = 0;
      if (screenName === 'home' || screenName === 'levels' || screenName === 'help')
        visualTime += delta;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderer(ctx, run, {
      width,
      height,
      time: visualTime,
      screen: screenName,
      reducedMotion: reducedMotion(),
    });
    if (toastUntil && timestamp > toastUntil) {
      $('toast').hidden = true;
      toastUntil = 0;
    }
    frameId = requestAnimationFrame(animate);
  }
  const dev = globalThis.SmallGamesDev;
  const snapshot = () =>
    structuredClone({
      screen: screenName,
      phase: run.phase,
      levelIndex: run.levelIndex,
      startIndex: run.startIndex,
      time: run.time,
      player: run.player,
      enemies: run.enemies,
      bullets: run.bullets,
      shots: run.shots,
      upgrades: run.upgrades,
      choices: run.choices,
      roomsCleared: run.roomsCleared,
      trial,
      progress,
      held: [...pointers.values()],
      keys: [...keys],
    });
  if (dev?.isEnabled()) {
    globalThis.AshfallDebug = Object.freeze({ snapshot });
    cleanups.push(dev.registerSnapshot(snapshot));
    cleanups.push(
      dev.registerActions([
        {
          id: 'ashfall-refill',
          label: '补充生命（试玩）',
          run: () => {
            if (!dev.isEnabled()) return;
            trial = true;
            run.player.hp = run.player.maxHp;
            $('trial-label').hidden = false;
            updateHUD();
          },
        },
        {
          id: 'ashfall-next',
          label: '下一战区（试玩）',
          run: () => {
            if (dev.isEnabled()) start((run.levelIndex + 1) % LEVELS.length, true);
          },
        },
      ]),
    );
  }
  function dispose() {
    disposed = true;
    cancelAnimationFrame(frameId);
    clearInput();
    abort.abort();
    display.dispose();
    audio.dispose();
    cleanups.forEach((cleanup) => cleanup());
    if (globalThis.AshfallDebug?.snapshot === snapshot) delete globalThis.AshfallDebug;
  }
  on(window, 'pagehide', (event) => {
    if (event.persisted) backgroundPause();
    else dispose();
  });
  syncSettings();
  setInputMode(matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard');
  setScreen('home');
  gameElement.dataset.ready = 'true';
  frameId = requestAnimationFrame(animate);
  return { dispose, snapshot };
}

if (!new URL(import.meta.url).searchParams.has('manual')) {
  mountAshfall().catch((error) => {
    console.error(error);
    const message = document.createElement('div');
    message.className = 'centered-screen screen';
    message.textContent = '启动遇到问题，请刷新重试。';
    document.getElementById('game').append(message);
  });
}
