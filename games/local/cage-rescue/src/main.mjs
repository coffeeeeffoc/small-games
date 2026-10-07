import { createGame, stepGame, launchBall, setPaused, reviveGame, canRevive } from './core.mjs';
import { LEVELS } from './levels.mjs';
import { drawGame, drawHome } from './render.mjs';
import { createLocalHost } from './host.mjs';
import { readProgress, completeLevel, unlockedCount, THEMES } from './progress.mjs';
import { createAudio } from './audio.mjs';

export async function mountCageRescue(host = createLocalHost()) {
  const $ = (id) => document.getElementById(id);
  const canvas = $('scene'),
    ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const abort = new AbortController();
  const on = (target, event, callback) =>
    target.addEventListener(event, callback, { signal: abort.signal });
  let progress;
  try {
    progress = readProgress((await host.storage.read('progress'))?.value);
  } catch {
    progress = readProgress(null);
  }
  let game = createGame(0),
    screen = 'home',
    activePointer = null,
    targetX = 195,
    grabOffset = 0;
  let trial = false,
    lastTime = 0,
    animationId,
    toastUntil = 0,
    saveQueue = Promise.resolve(),
    disposed = false;
  let rewardBusy = false,
    lastHud = '',
    lastTip = '',
    feedback = '',
    feedbackUntil = 0;
  const keys = new Set(),
    trails = [],
    particles = [];
  const audio = createAudio(progress.sound);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dev = globalThis.SmallGamesDev;
  const cleanups = [];

  function toast(message, duration = 2600) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    toastUntil = performance.now() + duration;
  }
  function save() {
    const value = structuredClone(progress);
    saveQueue = saveQueue
      .catch(() => {})
      .then(() => host.storage.write('progress', value))
      .catch(() => {
        if (!disposed) toast('本机存储不可用，进度仅保留至关闭页面。', 3500);
      });
  }
  function clearInput() {
    const id = activePointer;
    activePointer = null;
    keys.clear();
    targetX = game.paddle.x;
    if (id !== null && canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
  }
  function changeScreen(next) {
    clearInput();
    screen = next;
    document.body.dataset.screen = next;
    if (window.parent !== window) {
      try {
        window.parent.postMessage(
          {
            type: 'small-games:display-state',
            gameId: 'cage-rescue',
            screen: ['play', 'pause', 'result'].includes(next) ? 'playing' : 'home',
          },
          new URL(document.referrer).origin,
        );
      } catch {
        /* Standalone hosts without a referrer do not need the Shell bridge. */
      }
    }
    for (const name of ['home', 'levels', 'play', 'pause', 'result', 'settings', 'help', 'outfits'])
      $(name + '-screen').hidden = name !== next;
    $('toast').hidden = true;
    toastUntil = 0;
    if (next === 'home') updateHome();
    if (next === 'levels') renderLevels();
    if (next === 'outfits') renderThemes();
    if (next === 'settings') $('sound').setAttribute('aria-checked', String(progress.sound));
    lastTime = 0;
  }
  function updateHome() {
    const count = Object.keys(progress.completed).length;
    const nextIndex = Math.min(count, LEVELS.length - 1);
    $('home-progress').textContent =
      count === LEVELS.length
        ? '六次行动已完成 · 所有人都值得被接住'
        : `第 ${String(nextIndex + 1).padStart(2, '0')} / 06 关 · ${LEVELS[nextIndex].name}`;
    $('start').querySelector('span').textContent = count ? '继续救援' : '开始救援';
  }
  function startLevel(index, practice = false) {
    if (!practice && index >= unlockedCount(progress)) return;
    clearInput();
    game = createGame(index);
    targetX = game.paddle.x;
    trial = practice;
    trails.length = 0;
    particles.length = 0;
    lastHud = '';
    feedback = '';
    rewardBusy = false;
    $('reward-message').textContent = '';
    changeScreen('play');
    audio.unlock();
    syncHud();
  }
  function renderLevels() {
    const count = Object.keys(progress.completed).length,
      unlocked = unlockedCount(progress);
    $('level-progress').textContent = `${count} / 6`;
    $('level-list').replaceChildren(
      ...LEVELS.map((level, i) => {
        const button = document.createElement('button');
        button.className = 'level-card' + (i === Math.min(count, 5) ? ' current' : '');
        button.dataset.level = i;
        button.disabled = i >= unlocked;
        const status = progress.completed[level.id]
          ? '已完成'
          : button.disabled
            ? '未解锁'
            : '待救援';
        button.setAttribute('aria-label', `第${i + 1}关 ${level.name}，${status}`);
        const number = document.createElement('strong');
        number.textContent = String(i + 1).padStart(2, '0');
        const label = document.createElement('span');
        label.className = 'level-status';
        label.textContent = status;
        const miniature = document.createElement('span');
        miniature.className = 'mini-grid';
        miniature.setAttribute('aria-hidden', 'true');
        for (let n = 0; n < 6; n++) miniature.append(document.createElement('i'));
        const title = document.createElement('h3');
        title.textContent = level.name;
        const subtitle = document.createElement('p');
        subtitle.textContent = button.disabled ? `完成第 ${i} 关解锁` : level.subtitle;
        button.append(number, label, miniature, title, subtitle);
        button.onclick = () => startLevel(i);
        return button;
      }),
    );
  }
  function renderThemes() {
    const completed = Object.keys(progress.completed).length;
    $('theme-list').replaceChildren(
      ...THEMES.map((theme, i) => {
        const button = document.createElement('button');
        button.className = 'theme-card';
        button.dataset.theme = theme.id;
        button.disabled = completed < theme.required;
        button.setAttribute('aria-pressed', String(theme.id === progress.theme));
        const swatch = document.createElement('span');
        swatch.className = 'theme-swatch';
        swatch.style.setProperty('--swatch', ['#ffc34b', '#62ebcf', '#ff949d'][i]);
        swatch.setAttribute('aria-hidden', 'true');
        swatch.append(document.createElement('i'), document.createElement('i'));
        const text = document.createElement('div'),
          title = document.createElement('h3'),
          subtitle = document.createElement('p'),
          state = document.createElement('small');
        title.textContent = theme.title;
        subtitle.textContent = theme.subtitle;
        state.textContent = button.disabled
          ? `完成 ${theme.required} 关解锁`
          : theme.id === progress.theme
            ? '已装备'
            : '点击装备';
        text.append(title, subtitle, state);
        button.append(swatch, text);
        button.onclick = () => {
          progress.theme = theme.id;
          save();
          renderThemes();
        };
        return button;
      }),
    );
  }
  function syncHud() {
    const signature = `${game.levelIndex}:${game.rescued}:${game.lives}:${game.phase}:${game.slowMotion}:${trial}`;
    if (signature !== lastHud) {
      lastHud = signature;
      $('level-number').textContent = String(game.levelIndex + 1).padStart(2, '0');
      $('level-name').textContent = game.level.name;
      $('rescue-count').replaceChildren(
        document.createTextNode(String(game.rescued)),
        Object.assign(document.createElement('span'), { textContent: '/4' }),
      );
      $('lives').setAttribute('aria-label', `剩余${game.lives}次球机会`);
      [...$('lives').children].forEach((node, i) =>
        node.classList.toggle('empty', i >= game.lives),
      );
      $('launch-area').hidden = game.phase !== 'ready';
      $('slow-badge').hidden = !game.slowMotion;
      $('trial-badge').hidden = !trial;
      $('launch-hint').textContent =
        game.lives < 3
          ? `还有 ${game.lives} 次球机会\n队友仍在下落，先接稳再发球`
          : game.levelIndex === 0
            ? '左右拖动挡板，接球也接人'
            : game.level.hint;
    }
    const tip =
      performance.now() < feedbackUntil
        ? feedback
        : game.people.some((p) => p.status === 'falling' || p.status === 'waiting')
          ? '先接球，再移到队友下方'
          : game.rescued
            ? '打破下一个笼子，接队友回家'
            : '拖动挡板 · 救回 4 位队友';
    if (tip !== lastTip) {
      $('play-tip').textContent = tip;
      lastTip = tip;
    }
  }
  function showResult() {
    const won = game.phase === 'won';
    if (won && completeLevel(progress, game, trial)) save();
    changeScreen('result');
    audio.play(won ? 'win' : 'miss');
    $('result-screen').dataset.won = won;
    $('result-eyebrow').textContent = trial
      ? 'PRACTICE · 开发试玩'
      : won
        ? 'MISSION COMPLETE'
        : 'WE CAN TRY AGAIN';
    $('result-symbol').textContent = won ? '✦' : '↻';
    $('result-title').textContent = won
      ? game.levelIndex === 5
        ? '小队，平安归来！'
        : '接得漂亮！'
      : '差一点，再来一次';
    $('result-message').textContent = won
      ? '四位队友已安全归队。'
      : game.lossReason === 'not-enough-people'
        ? '已有 3 位队友落入安全网，\n本关已无法达到 4 人救援目标。'
        : '三次球机会已用完。\n试试先接球，再移动到队友下方。';
    $('result-rescued').textContent = game.rescued;
    $('result-lives').textContent = game.lives;
    $('result-unlock').textContent = trial
      ? '试玩不解锁关卡，也不写入通关记录'
      : won
        ? game.levelIndex === 5
          ? '六关全部完成，感谢你的每一次接住。'
          : [1, 3].includes(game.levelIndex)
            ? '下一关与新小队装扮已解锁'
            : `下一关 · ${LEVELS[game.levelIndex + 1].name} 已解锁`
        : game.level.hint;
    $('next').hidden = !won;
    $('next').textContent = game.levelIndex === 5 ? '返回关卡' : '下一关';
    $('retry').textContent = won ? '再玩本关' : '免费重试';
    $('revive').hidden = !canRevive(game) || trial;
    $('revive').disabled = false;
    $('reward-message').textContent =
      canRevive(game) && !trial && host.session.adAuthority === 'none'
        ? '当前为离线试玩，暂无广告可用。'
        : '';
  }
  function pause() {
    if (screen !== 'play' || !setPaused(game, true)) return;
    audio.suspend();
    changeScreen('pause');
  }
  function resume() {
    if (screen === 'pause' && setPaused(game, false)) {
      changeScreen('play');
      audio.unlock();
      syncHud();
    }
  }
  function goHome() {
    setPaused(game, true);
    audio.suspend();
    changeScreen('home');
  }
  function launch() {
    if (screen !== 'play') return;
    audio.unlock();
    if (launchBall(game)) {
      audio.play('bounce');
      syncHud();
    }
  }

  on($('start'), 'click', () => startLevel(Math.min(Object.keys(progress.completed).length, 5)));
  for (const page of ['levels', 'settings', 'help', 'outfits'])
    on($(page), 'click', () => changeScreen(page));
  document.querySelectorAll('[data-back]').forEach((button) => on(button, 'click', goHome));
  on($('launch'), 'click', launch);
  on($('pause'), 'click', pause);
  on($('resume'), 'click', resume);
  on($('restart'), 'click', () => startLevel(game.levelIndex, trial));
  on($('home'), 'click', goHome);
  on($('result-home'), 'click', goHome);
  on($('retry'), 'click', () => startLevel(game.levelIndex, trial));
  on($('next'), 'click', () =>
    game.levelIndex === 5 ? changeScreen('levels') : startLevel(game.levelIndex + 1, trial),
  );
  on($('sound'), 'click', () => {
    progress.sound = !progress.sound;
    audio.enable(progress.sound);
    if (progress.sound) {
      audio.unlock();
      audio.play('rescue');
    }
    save();
    $('sound').setAttribute('aria-checked', String(progress.sound));
  });
  on($('revive'), 'click', async () => {
    if (rewardBusy || !canRevive(game) || trial) return;
    const attempt = game;
    rewardBusy = true;
    $('revive').disabled = true;
    $('reward-message').textContent = '正在请求补球机会…';
    let outcome;
    try {
      outcome = await host.ads.offer({
        id: 'cage-rescue.revive',
        reward: { ballLives: 1, levelId: game.levelId },
      });
    } catch {
      outcome = { status: 'failed' };
    }
    if (disposed || game !== attempt || screen !== 'result') return;
    rewardBusy = false;
    $('revive').disabled = false;
    if (outcome?.status === 'completed' && reviveGame(game)) {
      changeScreen('play');
      syncHud();
      toast('已补充 1 次球机会，准备好再发球。');
    } else
      $('reward-message').textContent =
        outcome?.status === 'dismissed'
          ? '未完整观看，没有扣除或增加机会。可以免费重试。'
          : outcome?.status === 'unavailable'
            ? '当前暂无广告可用，请免费重试。'
            : '广告未完成，请稍后再试或免费重开。';
  });
  function pointerX(event) {
    const rect = canvas.getBoundingClientRect();
    return ((event.clientX - rect.left) * 390) / rect.width;
  }
  on(canvas, 'pointerdown', (event) => {
    if (screen !== 'play' || activePointer !== null || !event.isPrimary || event.button > 0) return;
    event.preventDefault();
    audio.unlock();
    activePointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    const x = pointerX(event);
    grabOffset = Math.abs(x - game.paddle.x) < game.paddle.w / 2 ? game.paddle.x - x : 0;
    targetX = x + grabOffset;
  });
  on(canvas, 'pointermove', (event) => {
    if (event.pointerId === activePointer) {
      event.preventDefault();
      targetX = pointerX(event) + grabOffset;
    }
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    on(canvas, name, (event) => {
      if (event.pointerId === activePointer) clearInput();
    });
  on(window, 'keydown', (event) => {
    if (event.key === 'Escape') {
      if (screen === 'play') pause();
      else if (screen === 'pause') resume();
      return;
    }
    if (screen !== 'play' || /^(BUTTON|INPUT|SELECT)$/.test(event.target?.tagName)) return;
    if (['ArrowLeft', 'ArrowRight', 'a', 'd', ' '].includes(event.key)) {
      event.preventDefault();
      if (event.key === ' ' && !event.repeat) launch();
      else keys.add(event.key);
    }
  });
  on(window, 'keyup', (event) => keys.delete(event.key));
  on(window, 'blur', () => {
    clearInput();
    pause();
    audio.suspend();
  });
  on(document, 'visibilitychange', () => {
    if (document.hidden) {
      clearInput();
      pause();
      audio.suspend();
    }
    lastTime = 0;
  });
  on(window, 'pagehide', () => {
    clearInput();
    pause();
    audio.suspend();
  });
  function resize() {
    const rect = canvas.getBoundingClientRect(),
      ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    ctx.setTransform(canvas.width / 390, 0, 0, canvas.height / 700, 0, 0);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  const snapshot = () => structuredClone({ screen, game, progress, activePointer, trial });
  const diagnostics = Object.freeze({ snapshot });
  globalThis.__cageRescue = diagnostics;
  if (dev?.isEnabled()) {
    cleanups.push(dev.registerSnapshot(snapshot));
    cleanups.push(
      dev.registerActions([
        ...LEVELS.map((level, i) => ({
          id: `cage-level-${i + 1}`,
          label: `试玩第 ${i + 1} 关 · ${level.name}`,
          run: () => startLevel(i, true),
        })),
        {
          id: 'cage-win',
          label: '试玩本关通关',
          run: () => {
            if (screen !== 'play') startLevel(game.levelIndex, true);
            trial = true;
            game.rescued = 4;
            stepGame(game, 1 / 60);
            showResult();
          },
        },
        {
          id: 'cage-lose',
          label: '试玩球机会耗尽',
          run: () => {
            startLevel(game.levelIndex, true);
            game.lives = 1;
            launchBall(game);
            game.ball.y = 720;
            stepGame(game, 1 / 60);
            showResult();
          },
        },
      ]),
    );
  }
  function handleEvents() {
    for (const event of game.events) {
      if (event.type === 'bounce') audio.play('bounce');
      if (event.type === 'hit') audio.play('brick');
      if (event.type === 'release') {
        audio.play('cage');
        feedback = '笼子破了！记住队友的落点';
        feedbackUntil = performance.now() + 2800;
      }
      if (event.type === 'rescue') {
        audio.play('rescue');
        feedback = `接住了！已救回 ${game.rescued} / 4 位`;
        feedbackUntil = performance.now() + 2300;
      }
      if (event.type === 'miss') {
        audio.play('miss');
        feedback = '队友落入安全网，未计入救援';
        feedbackUntil = performance.now() + 2500;
      }
      if (event.type === 'ball-lost') audio.play('miss');
      if (['break', 'rescue', 'miss'].includes(event.type) && !reducedMotion) {
        for (let i = 0; i < 9; i++)
          particles.push({
            x: event.x,
            y: event.y,
            vx: Math.cos(i * 2.4) * (35 + i * 8),
            vy: Math.sin(i * 2.4) * 70,
            life: 0.65,
            maxLife: 0.65,
            color:
              event.type === 'miss' ? '#8fa8bd' : event.type === 'rescue' ? '#5fe1c6' : '#ffc44e',
            size: 2 + (i % 3),
          });
      }
    }
  }
  function frame(now) {
    if (disposed) return;
    const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
    lastTime = now;
    if (!document.hidden && screen === 'play') {
      const direction =
        Number(keys.has('ArrowRight') || keys.has('d')) -
        Number(keys.has('ArrowLeft') || keys.has('a'));
      if (direction) targetX = game.paddle.x + direction * 760 * dt;
      stepGame(game, dt, { targetX });
      handleEvents();
      if (game.phase === 'won' || game.phase === 'lost') showResult();
      else syncHud();
      if (!reducedMotion && game.ball.active) {
        trails.push({ x: game.ball.x, y: game.ball.y, life: 0.15 });
        if (trails.length > 12) trails.shift();
      }
    }
    if (screen === 'play') {
      for (const particle of particles) {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 120 * dt;
        particle.life -= dt;
      }
      for (const point of trails) point.life -= dt;
      for (let i = particles.length - 1; i >= 0; i--)
        if (particles[i].life <= 0) particles.splice(i, 1);
      for (let i = trails.length - 1; i >= 0; i--) if (trails[i].life <= 0) trails.splice(i, 1);
    }
    const options = {
      time: reducedMotion ? 0 : now / 1000,
      theme: progress.theme,
      reducedMotion,
      particles,
      trails,
    };
    if (['play', 'pause', 'result'].includes(screen)) drawGame(ctx, game, options);
    else drawHome(ctx, options);
    if (toastUntil && now > toastUntil) {
      $('toast').hidden = true;
      toastUntil = 0;
    }
    animationId = requestAnimationFrame(frame);
  }
  changeScreen('home');
  animationId = requestAnimationFrame(frame);
  return {
    snapshot,
    pause,
    resume,
    async dispose() {
      if (disposed) return;
      disposed = true;
      clearInput();
      cancelAnimationFrame(animationId);
      abort.abort();
      observer.disconnect();
      audio.dispose();
      cleanups.forEach((cleanup) => cleanup?.());
      if (globalThis.__cageRescue === diagnostics) delete globalThis.__cageRescue;
      await saveQueue;
    },
  };
}

// Importing with ?manual permits a real host to mount this same UI in integration tests.
if (!new URL(import.meta.url).searchParams.has('manual')) {
  mountCageRescue().catch((error) => {
    console.error(error);
    document.getElementById('loading-error').hidden = false;
  });
}
