import { createH5Publishing } from '../publishing.js';
import {
  createGame,
  createEndlessGame,
  FIXED_STEP,
  RANKED_RULE_VERSION,
  stepGame,
  launchBall,
  setPaused,
  reviveGame,
  canRevive,
} from './core.mjs';
import { LEVELS } from './levels.mjs';
import { drawGame, drawHome, drawLevel, releaseRenderCache } from './render.mjs';
import { createLocalHost } from './host.mjs';
import { readProgress, completeLevel, unlockedCount, THEMES } from './progress.mjs';
import { createAudio } from './audio.mjs';
import { createLeaderboard } from '../leaderboard.mjs';

export async function mountCageRescue(host) {
  const local = !host;
  host ??= createLocalHost();
  const $ = (id) => document.getElementById(id);
  const canvas = $('scene'),
    ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const abort = new AbortController();
  const on = (target, event, callback, options = {}) =>
    target.addEventListener(event, callback, { ...options, signal: abort.signal });
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
  let challenge = false;
  let starting = false,
    startSequence = 0,
    frameAccumulator = 0;
  const offline = globalThis.__COMPETITION_CONFIG__?.enabled === false;
  $('leaderboard').hidden = offline;
  let competitionStatus = '本地挑战';
  const competition = createLeaderboard({
    gameId: 'cage-rescue',
    ruleVersion: RANKED_RULE_VERSION,
    moduleUrl: new URL('../game-services.js', import.meta.url).href,
    onStatus: (text, status) => {
      competitionStatus = text;
      $('ranking-note').textContent = text;
      if (status === 'update-required') toast(text, 5000);
    },
  });
  const incoming = new URL(location.href).searchParams;
  const boundedTarget = (key, max) => {
    const value = Number(incoming.get(key));
    return incoming.has(key) && Number.isInteger(value) && value >= 0 && value <= max
      ? value
      : null;
  };
  const targetRescued = boundedTarget('targetRescued', 6),
    targetCombo = boundedTarget('targetCombo', 6);
  const challengeIndex =
    incoming.get('challenge') === 'rescue-v1'
      ? LEVELS.findIndex((level) => level.id === incoming.get('level'))
      : -1;
  const publishing = createH5Publishing({
    gameId: 'cage-rescue',
    title: '打破笼子接住人',
    adMode: globalThis.SmallGamesPublishingConfig?.adMode ?? 'off',
    provider: globalThis.SmallGamesPublishingConfig?.provider,
    publicUrl: globalThis.SmallGamesPublishingConfig?.publicUrl,
    pause: () => {
      pause();
      return () => {};
    },
  });
  let trial = false,
    lastTime = 0,
    visualTime = 0,
    animationId = null,
    needsPaint = true,
    toastTimer,
    pageActive = true,
    saveQueue = Promise.resolve(),
    disposed = false;
  let rewardEpoch = 0, activeReward;
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
  let touchAction = null,
    lastTouchActivation = -Infinity;
  // Chromium/WebViews can omit the compatibility click after a captured canvas drag.
  // Activate a matched touch release directly; suppress only its later native click,
  // which may otherwise hit a control on the newly displayed screen or ad overlay.
  on(
    document,
    'pointerdown',
    (event) => {
      if (!event.isPrimary) return;
      lastTouchActivation = -Infinity;
      touchAction = null;
      if (event.pointerType !== 'touch') return;
      const button = event.target.closest('button');
      touchAction =
        button &&
        $('game').contains(button) &&
        !button.disabled &&
        !button.hasAttribute('data-game-fullscreen')
          ? { button, id: event.pointerId, x: event.clientX, y: event.clientY }
          : null;
    },
    { capture: true },
  );
  on(
    document,
    'pointermove',
    (event) => {
      if (
        touchAction?.id === event.pointerId &&
        Math.hypot(event.clientX - touchAction.x, event.clientY - touchAction.y) > 12
      )
        touchAction.cancelled = true;
    },
    { capture: true },
  );
  on(
    document,
    'pointercancel',
    (event) => {
      if (touchAction?.id === event.pointerId) touchAction = null;
    },
    { capture: true },
  );
  on(document, 'pointerup', (event) => {
    if (touchAction?.id !== event.pointerId) return;
    const { button, cancelled } = touchAction;
    touchAction = null;
    event.preventDefault();
    lastTouchActivation = performance.now();
    const bounds = button.getBoundingClientRect();
    if (
      cancelled ||
      button.disabled ||
      !button.isConnected ||
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      return;
    button.click();
  });
  on(
    document,
    'click',
    (event) => {
      if (
        event.isTrusted &&
        event.detail > 0 &&
        performance.now() - lastTouchActivation < 700 &&
        !event.target.closest('[data-game-fullscreen]')
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    { capture: true },
  );

  function toast(message, duration = 2600) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (!disposed) $('toast').hidden = true;
    }, duration);
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
    // Keep a cancelled button press until release: a later compatibility click
    // must stay suppressed even if focus was lost during a long press.
    if (touchAction) touchAction.cancelled = true;
    const id = activePointer;
    activePointer = null;
    keys.clear();
    targetX = game.paddle.x;
    if (id !== null && canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
  }
  function cancelReward() {
    rewardEpoch++;
    rewardBusy = false;
    try { activeReward?.cancel?.(); } catch { /* Navigation remains available. */ }
    activeReward = undefined;
    $('revive').disabled = false;
  }
  function changeScreen(next) {
    if (next !== screen) cancelReward();
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
    for (const name of [
      'home',
      'levels',
      'play',
      'pause',
      'result',
      'settings',
      'help',
      'outfits',
      'leaderboard',
    ])
      $(name + '-screen').hidden = name !== next;
    $('toast').hidden = true;
    clearTimeout(toastTimer);
    if (next === 'home') updateHome();
    if (next === 'levels') renderLevels();
    if (next === 'leaderboard') void competition.show();
    else competition.close();
    if (next === 'outfits') renderThemes();
    if (next === 'settings') $('sound').setAttribute('aria-checked', String(progress.sound));
    lastTime = 0;
    invalidateScene();
  }
  function updateHome() {
    const count = Object.keys(progress.completed).length;
    const nextIndex = Math.min(count, LEVELS.length - 1);
    $('home-progress').textContent =
      count === LEVELS.length
        ? `${LEVELS.length} 次行动已完成 · 试试无尽救援`
        : `第 ${String(nextIndex + 1).padStart(2, '0')} / ${LEVELS.length} 关 · ${LEVELS[nextIndex].name}`;
    $('start').querySelector('span').textContent = count ? '继续救援' : '开始救援';
    $('endless-best').textContent = `最佳 ${progress.endlessBest} 人`;
  }
  async function startLevel(index, practice = false, isChallenge = false, endless = false) {
    if (!endless && !LEVELS[index]) return;
    if (!endless && !practice && !isChallenge && index >= unlockedCount(progress)) return;
    const attempt = ++startSequence;
    starting = true;
    frameAccumulator = 0;
    competition.invalidate('new run');
    clearInput();
    game = endless ? createEndlessGame() : createGame(index);
    targetX = game.paddle.x;
    trial = practice;
    challenge = isChallenge;
    trails.length = 0;
    particles.length = 0;
    lastHud = '';
    feedback = game.level.hint;
    feedbackUntil = performance.now() + 5000;
    rewardBusy = false;
    $('reward-message').textContent = '';
    changeScreen('play');
    audio.unlock();
    syncHud();
    const online = await competition.start({
      mode: endless ? 'endless' : 'campaign',
      levelId: endless ? undefined : LEVELS[index].id,
      practice: practice || isChallenge || !!dev?.isEnabled(),
    });
    if (attempt !== startSequence || disposed) return;
    if (endless) game = createEndlessGame(online?.seed ?? 0);
    if (screen === 'pause' || document.hidden) setPaused(game, true);
    starting = false;
    lastTime = 0;
    syncHud();
  }
  function renderLevels() {
    const count = Object.keys(progress.completed).length,
      unlocked = unlockedCount(progress);
    $('level-progress').textContent = `${count} / ${LEVELS.length}`;
    $('level-list').replaceChildren(
      ...LEVELS.map((level, i) => {
        const button = document.createElement('button');
        button.className =
          'level-card' + (i === Math.min(count, LEVELS.length - 1) ? ' current' : '');
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
        const miniature = document.createElement('canvas');
        miniature.className = 'level-preview';
        miniature.width = 320;
        miniature.height = 144;
        miniature.setAttribute('aria-hidden', 'true');
        const preview = miniature.getContext('2d');
        if (preview) {
          preview.scale(2, 2);
          drawLevel(preview, level, { locked: button.disabled, theme: progress.theme });
        }
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
          invalidateScene();
        };
        return button;
      }),
    );
  }
  function syncHud() {
    const signature = `${starting}:${game.endlessWave}:${game.totalRescued}:${game.levelIndex}:${game.rescued}:${game.lives}:${game.phase}:${game.slowMotion}:${game.rescueCombo}:${game.realTime < game.wideUntil}:${game.people.map((person) => person.status).join(',')}:${trial}`;
    if (signature !== lastHud) {
      lastHud = signature;
      $('level-number').textContent =
        game.mode === 'endless' ? '∞' : String(game.levelIndex + 1).padStart(2, '0');
      $('level-name').textContent = game.level.name + (challenge ? ' · 好友挑战' : '');
      $('launch').disabled = starting;
      $('launch').textContent = starting ? '准备挑战…' : '点击发球';
      $('rescue-count').replaceChildren(
        document.createTextNode(String(game.rescued)),
        Object.assign(document.createElement('span'), { textContent: `/${game.target}` }),
      );
      $('rescue-count').setAttribute(
        'aria-label',
        `已救回 ${game.rescued} 位，共 ${game.target} 位队友`,
      );
      $('crew-progress').replaceChildren(
        ...game.cages.map((cage) => {
          const marker = document.createElement('i');
          marker.dataset.status =
            game.people.find((person) => person.cageId === cage.id)?.status || 'captive';
          return marker;
        }),
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
    $('play-tip').hidden = game.phase === 'ready';
    const tip =
      game.mode === 'endless' && performance.now() >= feedbackUntil
        ? `累计救回 ${game.totalRescued} 人 · 本波 ${game.rescued}/${game.target}${game.extraBalls.length ? ` · ${1 + game.extraBalls.length} 球` : ''}`
        : performance.now() < feedbackUntil
          ? feedback
          : game.extraBalls.length
            ? `场上 ${1 + game.extraBalls.length} 球 · 全部掉落才扣机会`
            : game.realTime < game.wideUntil
              ? `${game.rescueCombo} 连救 · 宽板救援中`
              : game.people.some((p) => p.status === 'falling' || p.status === 'waiting')
                ? '先接球，再移到队友下方'
                : game.rescued
                  ? '打破下一个笼子，接队友回家'
                  : `拖动挡板 · 救回全部 ${game.target} 位队友`;
    if (tip !== lastTip) {
      $('play-tip').textContent = tip;
      lastTip = tip;
    }
  }
  function showResult() {
    const won = game.phase === 'won';
    if (game.mode === 'endless' && !trial && !challenge && !dev?.isEnabled()) {
      progress.endlessBest = Math.max(progress.endlessBest, game.totalRescued);
      save();
    }
    if (won && completeLevel(progress, game, trial || challenge)) save();
    $('ranking-note').textContent = competitionStatus;
    void competition.finish();
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
      ? game.levelIndex === LEVELS.length - 1
        ? '小队，平安归来！'
        : '接得漂亮！'
      : '差一点，再来一次';
    $('result-message').textContent = won
      ? `全部 ${game.target} 位队友已安全归队！`
      : game.lossReason === 'not-enough-people'
        ? '有队友落入安全网，未能归队。\n全员救回才算通关，再试一次吧！'
        : '剩余球机会已用完。\n试试先接球，再移动到队友下方。';
    $('result-rescued').textContent = game.rescued;
    $('result-lives').textContent = game.lives;
    $('result-chain').textContent =
      `最高 ${game.bestRescueCombo} 连救 · ${game.realTime.toFixed(1)} 秒${game.usedRevive ? ' · 已补球' : ''}`;
    $('share-rescue').hidden = trial || game.mode === 'endless';
    $('result-unlock').textContent = challenge
      ? targetRescued === null
        ? '好友同关体验 · 不改变进度'
        : `好友自报 ${targetRescued} 人 / ${targetCombo ?? 0} 连救 · ${game.rescued >= targetRescued && game.bestRescueCombo >= (targetCombo ?? 0) ? '已达成！' : '再挑战一次'} · 不改变进度`
      : trial
        ? '试玩不解锁关卡，也不写入通关记录'
        : won
          ? game.levelIndex === LEVELS.length - 1
            ? `${LEVELS.length} 关全部完成，继续挑战无尽救援吧。`
            : [1, 3].includes(game.levelIndex)
              ? '下一关与新小队装扮已解锁'
              : `下一关 · ${LEVELS[game.levelIndex + 1].name} 已解锁`
          : game.level.hint;
    $('next').hidden = !won || challenge;
    $('next').textContent = game.levelIndex === LEVELS.length - 1 ? '返回关卡' : '下一关';
    $('retry').textContent = won ? '再玩本关' : '免费重试';
    if (game.mode === 'endless') {
      $('result-eyebrow').textContent = 'ENDLESS RESCUE';
      $('result-title').textContent = `救回 ${game.totalRescued} 位队友`;
      $('result-rescued').textContent = game.totalRescued;
      $('result-unlock').textContent =
        `坚持到第 ${game.endlessWave} 波 · 本机最佳 ${progress.endlessBest} 人`;
      $('next').hidden = true;
    }
    $('revive').hidden = !canRevive(game) || trial || (local && !globalThis.SmallGamesRewardAds?.available);
    $('revive').disabled = false;
    $('reward-message').textContent =
      canRevive(game) && !trial && !local && host.session.adAuthority === 'none'
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
    ++startSequence;
    starting = false;
    competition.invalidate('returned home');
    setPaused(game, true);
    audio.suspend();
    changeScreen('home');
  }
  function launch() {
    if (screen !== 'play' || starting) return;
    audio.unlock();
    if (launchBall(game)) {
      competition.record({ launch: true, targetX }, 0);
      audio.play('bounce');
      syncHud();
    }
  }

  on($('start'), 'click', () =>
    startLevel(Math.min(Object.keys(progress.completed).length, LEVELS.length - 1)),
  );
  for (const page of ['levels', 'settings', 'help', 'outfits', 'leaderboard'])
    on($(page), 'click', () => changeScreen(page));
  document.querySelectorAll('[data-back]').forEach((button) => on(button, 'click', goHome));
  on($('endless'), 'click', () => startLevel(0, false, false, true));
  on($('leaderboard-retry'), 'click', () => void competition.show());
  document
    .querySelectorAll('[data-board]')
    .forEach((button) => on(button, 'click', () => void competition.show(button.dataset.board)));
  on($('launch'), 'click', launch);
  on($('pause'), 'click', pause);
  on($('resume'), 'click', resume);
  on($('restart'), 'click', () =>
    startLevel(game.levelIndex, trial, challenge, game.mode === 'endless'),
  );
  on($('home'), 'click', goHome);
  on($('result-home'), 'click', goHome);
  on($('retry'), 'click', () =>
    startLevel(game.levelIndex, trial, challenge, game.mode === 'endless'),
  );
  on($('next'), 'click', () =>
    game.levelIndex === LEVELS.length - 1
      ? changeScreen('levels')
      : startLevel(game.levelIndex + 1, trial),
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
  on($('challenge-rescue'), 'click', () => startLevel(challengeIndex, false, true));
  on($('share-rescue'), 'click', async () => {
    const outcome = await publishing.share({
      text: `${game.level.name}：救回 ${game.rescued} 人，最高 ${game.bestRescueCombo} 连救，${game.realTime.toFixed(1)} 秒${game.usedRevive ? '（补球）' : ''}。来接住同一支小队！`,
      params: {
        challenge: 'rescue-v1',
        level: game.levelId,
        targetRescued: game.rescued,
        targetCombo: game.bestRescueCombo,
      },
    });
    $('reward-message').textContent =
      outcome.status === 'copied'
        ? '同关挑战链接已复制'
        : outcome.status === 'shared'
          ? '已打开系统分享'
          : outcome.status === 'cancelled'
            ? '已取消分享'
            : '暂时无法分享，请稍后重试';
  });
  on($('revive'), 'click', async () => {
    if (rewardBusy || !canRevive(game) || trial) return;
    const attempt = game, token = ++rewardEpoch;
    activeReward = local ? globalThis.SmallGamesRewardAds : host.ads;
    rewardBusy = true;
    $('revive').disabled = true;
    $('reward-message').textContent = '正在请求补球机会…';
    let outcome;
    try {
      outcome = await activeReward?.offer({
        id: 'cage-rescue.revive',
        reward: { ballLives: 1, levelId: game.levelId },
      }) ?? { status: 'unavailable' };
    } catch {
      outcome = { status: 'failed' };
    }
    if (disposed || token !== rewardEpoch || game !== attempt || screen !== 'result') return;
    activeReward = undefined;
    rewardBusy = false;
    $('revive').disabled = false;
    if (outcome?.status === 'completed' && (competition.invalidate('revived'), reviveGame(game))) {
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
      stopFrames();
    } else {
      invalidateScene();
    }
  });
  on(window, 'pagehide', () => {
    cancelReward();
    pageActive = false;
    clearInput();
    pause();
    audio.suspend();
    stopFrames();
  });
  on(window, 'pageshow', () => {
    pageActive = true;
    invalidateScene();
  });
  function resize() {
    const rect = canvas.getBoundingClientRect(),
      ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    ctx.setTransform(canvas.width / 390, 0, 0, canvas.height / 700, 0, 0);
    invalidateScene();
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
            game.rescued = game.target;
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
      if (event.type === 'wave') {
        trails.length = 0;
        particles.length = 0;
        feedback = game.level.hint;
        feedbackUntil = performance.now() + 3200;
      }
      if (event.type === 'bounce') audio.play('bounce');
      if (event.type === 'hit') audio.play('brick');
      if (event.type === 'release') {
        audio.play('cage');
        feedback = game.level.wind
          ? '队友会随风漂移，看准下方落点标记'
          : '笼子破了！记住队友的落点';
        feedbackUntil = performance.now() + 2800;
      }
      if (event.type === 'rescue-chain') {
        feedback = `${event.combo} 连救 · 宽挡板支援`;
        feedbackUntil = performance.now() + 3000;
      }
      if (event.type === 'rescue') {
        audio.play('rescue');
        feedback =
          game.realTime < game.wideUntil
            ? `${game.rescueCombo} 连救！挡板加宽 5 秒`
            : `接住了！已救回 ${game.rescued} / ${game.target} 位`;
        feedbackUntil = performance.now() + 2300;
      }
      if (event.type === 'engineer' || event.type === 'medic') {
        audio.play('rescue');
        feedback =
          event.type === 'engineer'
            ? '工程师支援！宽挡板 8 秒'
            : event.gained
              ? '医疗员支援！补回 1 次球机会'
              : '医疗员安全归队 · 球机会已满';
        feedbackUntil = performance.now() + 3000;
      }
      if (event.type === 'metal' && performance.now() >= feedbackUntil) {
        audio.play('brick');
        feedback = event.gate ? '带字母的闸门要用钥匙机关打开' : '钢墙无法打碎，寻找缺口再调整角度';
        feedbackUntil = performance.now() + 1800;
      }
      if (event.type === 'mechanism') {
        audio.play('cage');
        feedback =
          event.kind === 'splitter'
            ? `分球启动！场上 ${event.balls} 球 · 全部掉落才扣机会`
            : event.kind === 'switch'
              ? '闸门已开启！新的救援路线打通了'
              : '爆破启动！附近装甲削弱两层';
        feedbackUntil = performance.now() + 3200;
      }
      if (
        event.type === 'hit' &&
        event.kind === 'brick' &&
        event.maxHp > 2 &&
        event.hp > 0 &&
        performance.now() >= feedbackUntil
      ) {
        feedback = `装甲裂开了 · 还需 ${event.hp} 次撞击`;
        feedbackUntil = performance.now() + 1600;
      }
      if (event.type === 'miss') {
        audio.play('miss');
        feedback = '队友落入安全网，未计入救援';
        feedbackUntil = performance.now() + 2500;
      }
      if (event.type === 'ball-lost') audio.play('miss');
      const impact = event.type === 'hit' && event.hp > 0;
      if (
        (['break', 'rescue', 'miss', 'bounce', 'mechanism'].includes(event.type) || impact) &&
        !reducedMotion
      ) {
        const color =
          event.type === 'mechanism'
            ? '#c5abff'
            : event.type === 'miss'
              ? '#8fa8bd'
              : event.type === 'rescue'
                ? '#5fe1c6'
                : '#ffc44e';
        particles.push({
          type: 'ring',
          x: event.x,
          y: event.y,
          vx: 0,
          vy: 0,
          life: event.type === 'mechanism' ? 0.55 : 0.32,
          maxLife: event.type === 'mechanism' ? 0.55 : 0.32,
          growth: event.kind === 'pulse' ? event.radius / 0.55 : 95,
          color,
          size: 4,
        });
        if (event.type === 'rescue')
          particles.push({
            type: 'label',
            label: '+1',
            x: event.x,
            y: event.y - 23,
            vx: 0,
            vy: -44,
            life: 0.65,
            maxLife: 0.65,
            color: '#b7fff0',
            size: 1,
          });
        const count = event.type === 'bounce' ? 3 : impact ? 5 : 9;
        for (let i = 0; i < count; i++)
          particles.push({
            type: i % 3 === 0 ? 'star' : 'spark',
            x: event.x,
            y: event.y,
            vx: Math.cos(i * 2.4) * (35 + i * 8),
            vy: Math.sin(i * 2.4) * 70,
            life: 0.65,
            maxLife: 0.65,
            color,
            size: 3 + (i % 4),
          });
      }
    }
  }
  function requestFrame() {
    if (animationId === null && !disposed && pageActive && !document.hidden)
      animationId = requestAnimationFrame(frame);
  }
  function stopFrames() {
    if (animationId !== null) cancelAnimationFrame(animationId);
    animationId = null;
    lastTime = 0;
  }
  function invalidateScene() {
    needsPaint = true;
    requestFrame();
  }
  function frame(now) {
    animationId = null;
    if (disposed || !pageActive || document.hidden) return;
    const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
    lastTime = now;
    const animatedHome = screen === 'home' && !reducedMotion;
    if (screen === 'play' || animatedHome) visualTime += dt;
    if (screen === 'play') {
      const direction =
        Number(keys.has('ArrowRight') || keys.has('d')) -
        Number(keys.has('ArrowLeft') || keys.has('a'));
      if (direction) targetX = game.paddle.x + direction * 760 * dt;
      if (!starting) frameAccumulator += dt;
      while (frameAccumulator + 1e-9 >= FIXED_STEP && ['ready', 'playing'].includes(game.phase)) {
        frameAccumulator -= FIXED_STEP;
        competition.record({ targetX }, 1);
        stepGame(game, FIXED_STEP, { targetX });
        handleEvents();
      }
      if (game.phase === 'won' || game.phase === 'lost') showResult();
      else syncHud();
      if (!reducedMotion && game.ball.active) {
        for (const ball of [game.ball, ...game.extraBalls])
          if (ball.active) trails.push({ id: ball.id, x: ball.x, y: ball.y, life: 0.15 });
        while (trails.length > 36) trails.shift();
      }
    }
    if (screen === 'play') {
      for (const particle of particles) {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        if (particle.type === 'ring') particle.size += (particle.growth || 95) * dt;
        else if (particle.type !== 'label') particle.vy += 120 * dt;
        particle.life -= dt;
      }
      for (const point of trails) point.life -= dt;
      for (let i = particles.length - 1; i >= 0; i--)
        if (particles[i].life <= 0) particles.splice(i, 1);
      for (let i = trails.length - 1; i >= 0; i--) if (trails[i].life <= 0) trails.splice(i, 1);
    }
    if (needsPaint || screen === 'play' || animatedHome) {
      const options = {
        time: reducedMotion ? 0 : visualTime,
        theme: progress.theme,
        reducedMotion,
        particles,
        trails,
      };
      if (['play', 'pause', 'result'].includes(screen)) drawGame(ctx, game, options);
      else drawHome(ctx, options);
      needsPaint = false;
    }
    if (screen === 'play' || animatedHome) requestFrame();
    else lastTime = 0;
  }
  $('challenge-rescue').hidden = challengeIndex < 0;
  if (challengeIndex >= 0)
    $('challenge-rescue').textContent =
      `好友挑战 · ${targetRescued === null ? LEVELS[challengeIndex].name : `自报 ${targetRescued} 人 / ${targetCombo ?? 0} 连救`}`;
  changeScreen('home');
  return {
    snapshot,
    pause,
    resume,
    async dispose() {
      cancelReward();
      if (disposed) return;
      disposed = true;
      ++startSequence;
      competition.invalidate('disposed');
      competition.close();
      clearInput();
      stopFrames();
      clearTimeout(toastTimer);
      releaseRenderCache(ctx);
      publishing.dispose();
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
