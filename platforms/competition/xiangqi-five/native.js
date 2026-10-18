import { openNativeTapPortal } from '../../taptap/native-portal.mjs';
import {
  validateTapProgress,
  mergeTapProgress,
  writeTapProgress,
  tapProgressScore,
  tapProgressSummary,
} from '../../../games/submodules/xiangqi-five/tap-save.js';
import {
  newGame,
  draw,
  deploy,
  deployDirectly,
  move,
  canMove,
  label,
  sideName,
} from '../../../games/submodules/xiangqi-five/game.js';
import {
  encodeGame,
  decodeGame,
  SAVE_KEY,
  canUndoComputerTurn,
} from '../../../games/submodules/xiangqi-five/local-game.js';
import {
  searchPositionAsync,
  applyComputerAction,
} from '../../../games/submodules/xiangqi-five/computer.js';
import { createComputerHints } from '../../../games/submodules/xiangqi-five/computer-hints.js';
import { createComputerUndo } from '../../../games/submodules/xiangqi-five/computer-undo.js';
import { createHintAccess } from '../../../games/submodules/xiangqi-five/rewarded-hints.js';
import { createRenderer } from '../../../games/submodules/xiangqi-five/competition-renderer.js';
import {
  CHALLENGES,
  CHALLENGE_SAVE_KEY,
  createChallengeState,
  challengeOutcome,
  challengeReply,
  decodeChallengeProgress,
} from '../../../games/submodules/xiangqi-five/challenges.js';
import { createTapTapRewardedAds } from '../../taptap/rewarded-ads.mjs';

// This adapter owns presentation only. Rules and compatible saves remain in the pinned submodule.
export function startNativeXiangqiGame(sdk, config, startNativeCompetition) {
  if (!sdk) throw new Error('缺少小游戏 SDK');
  // Pinned search operates exclusively on serializable game state. Native JS engines may
  // omit browser structuredClone/performance; keep their data/clock needs explicit here.
  if (typeof globalThis.structuredClone !== 'function')
    globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
  if (!globalThis.performance || typeof globalThis.performance.now !== 'function') {
    const clock = typeof sdk.getPerformance === 'function' ? sdk.getPerformance() : null;
    globalThis.performance = {
      now: clock && typeof clock.now === 'function' ? clock.now.bind(clock) : () => Date.now(),
    };
  }
  const canvas = sdk.createCanvas(),
    ctx = canvas.getContext('2d'),
    listeners = [];
  let width,
    height,
    ratio,
    top,
    bottom,
    hits = [],
    area,
    gesture,
    selected = null;
  let state = newGame(),
    opponent = 'computer',
    difficulty = 'standard',
    mode = 'xiangqi';
  let page = 'home',
    previous = 'home',
    hidden = false,
    stopped = false,
    pk = null;
  let tapPortal = null;
  let panX = 0,
    panY = 0,
    message = '',
    soundEnabled = true,
    audio,
    computerTimer;
  let pageScroll = 0,
    maxPageScroll = 0;
  let contentBottom = 0;
  let challengeId = '',
    challengeStatus = 'playing',
    hintShown = false,
    challengeReturn = null,
    setup = null,
    setupBack = 'modes',
    restartBack = 'setup';
  const adsEnabled = config.platform === 'taptap' && Boolean(config.rewardedAdUnitId);
  const ads = createTapTapRewardedAds(sdk, config.rewardedAdUnitId);
  const hintAccess = createHintAccess(
    {
      SmallGamesPublishingConfig: { adMode: adsEnabled ? 'host' : 'off' },
      SmallGamesRewardAds: {
        offer: ({ onShown }) => ads.show({ onShown }),
        cancel: () => ads.cancel(),
      },
    },
    46_000,
  );
  const computerUndo = createComputerUndo(hintAccess);
  const computerHints = createComputerHints({
    analyze: (position, isCancelled) => searchPositionAsync(position, 'hint', { isCancelled }),
    access: hintAccess,
  });
  let computerRequest = null;
  let hintRequest = null;
  function cancelHint() {
    hintRequest = null;
    computerHints.cancel();
    computerUndo.cancel();
    hintAccess.cancel();
  }
  async function showHint() {
    if (!challengeId || page !== 'play' || hidden || stopped || hintRequest) return;
    if (hintShown || !adsEnabled) {
      hintShown = true;
      change('help', 'play');
      return;
    }
    const request = { state };
    hintRequest = request;
    gesture = null;
    message = '正在播放广告…';
    render();
    const outcome = await hintAccess.request();
    if (hintRequest !== request) return;
    hintRequest = null;
    if (stopped || hidden || page !== 'play' || state !== request.state) return;
    if (outcome.status === 'completed') {
      hintShown = true;
      message = '';
      change('help', 'play');
    } else {
      message =
        outcome.status === 'dismissed'
          ? '广告未看完，提示未成功生成'
          : '广告暂不可用，提示未成功生成';
      render();
    }
  }
  const channel = sdk.channelEntry;
  let channelMessage = '',
    channelHelpBack = 'home';
  const runChannel = (action) => {
    if (action.available === false) {
      channelMessage = '宿主暂不支持此入口';
      render();
      return;
    }
    channelMessage = '';
    Promise.resolve()
      .then(() => action.run())
      .catch((error) => {
        channelMessage = error.message;
      })
      .finally(render);
  };
  const safe = (fn) => {
    try {
      return fn();
    } catch {}
  };
  const read = (key) => safe(() => sdk.getStorageSync(key));
  const restored = decodeGame(read(SAVE_KEY));
  if (restored) {
    state = restored.state;
    opponent = restored.opponent;
    difficulty = restored.difficulty;
    mode = state.mode;
  }
  soundEnabled = read('xiangqi-five-native-sound') !== '0';
  const challengeProgress = decodeChallengeProgress(read(CHALLENGE_SAVE_KEY));
  function save() {
    if (challengeId) return;
    try {
      sdk.setStorageSync(SAVE_KEY, encodeGame(state, opponent, difficulty));
    } catch {
      message = '本机存储不可用，仍可继续本局';
    }
  }
  function subscribe(name, fn) {
    if (typeof sdk['on' + name] !== 'function') return false;
    sdk['on' + name](fn);
    listeners.push(() => sdk['off' + name]?.(fn));
    return true;
  }
  function change(next, back = 'home') {
    if (next !== page) cancelHint();
    gesture = null;
    selected = null;
    pageScroll = 0;
    clearTimeout(computerTimer);
    computerRequest = null;
    previous = back;
    page = next;
    render();
    if (page === 'play') scheduleComputer();
  }
  function resize() {
    gesture = null;
    const info = sdk.getSystemInfoSync(),
      capsule = safe(() => sdk.getMenuButtonBoundingClientRect());
    width = info.windowWidth;
    height = info.windowHeight;
    ratio = Math.min(info.pixelRatio || 1, 2);
    top = Math.max(info.safeArea?.top || 0, capsule?.bottom || 0, 12) + 8;
    bottom = Math.max(12, height - (info.safeArea?.bottom ?? height));
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    render();
  }
  function text(value, x, y, size = 17, color = '#343b31') {
    ctx.fillStyle = color;
    ctx.font = `${size}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), x, y);
  }
  function button(value, x, y, w, action, primary = false) {
    ctx.fillStyle = primary ? '#ac493b' : '#e8eddf';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, 48, 16);
    else ctx.rect(x, y, w, 48);
    ctx.fill();
    text(value, x + 12, y + 24, 17, primary ? '#fffaf0' : '#456449');
    hits.push({ x, y, w, h: 48, action, label: value });
  }
  const hasGame = () => Boolean(state.ply || state.pending);
  const unfinished = () => hasGame() && !state.result;
  function fresh(nextOpponent = setup?.opponent || opponent) {
    challengeId = '';
    challengeReturn = null;
    opponent = nextOpponent;
    mode = setup?.mode || mode;
    difficulty = setup?.difficulty || difficulty;
    state = newGame(mode);
    selected = null;
    panX = panY = 0;
    message = '';
    save();
    change('play');
  }
  function openSetup(nextOpponent, back = 'modes') {
    setup = { mode, difficulty, opponent: nextOpponent };
    setupBack = back;
    change('setup', back);
  }
  function submitSetup() {
    if (unfinished() && (setup.mode !== mode || setup.opponent !== opponent)) {
      restartBack = 'setup';
      change('restart');
    } else if (unfinished()) {
      difficulty = setup.difficulty;
      save();
      change('play');
    } else fresh();
  }
  function leaveTraining(next = 'play') {
    const saved = challengeReturn;
    if (!saved) return;
    cancelHint();
    ({ state, opponent, difficulty, mode, panX, panY, message } = saved);
    challengeId = '';
    challengeReturn = null;
    setup = null;
    change(next === 'play' && state.result ? 'result' : next);
    selected = saved.selected;
    render();
  }
  function training(id) {
    if (!challengeId)
      challengeReturn = { state, opponent, difficulty, mode, panX, panY, selected, message };
    challengeId = id;
    challengeStatus = 'playing';
    hintShown = false;
    opponent = 'local';
    state = createChallengeState(id);
    selected = null;
    panX = panY = 0;
    message = CHALLENGES.find((item) => item.id === id).description;
    change('play');
  }
  function openTap() {
    if (page !== 'home' || challengeId) {
      message = '请先返回原棋局，再管理云档';
      return;
    }
    change('tap');
    save();
    const savePort = {
      export: () =>
        validateTapProgress({
          local: encodeGame(state, opponent, difficulty),
          progress: challengeProgress,
        }),
      validate: validateTapProgress,
      summary: tapProgressSummary,
      score() {
        return tapProgressScore(this.export());
      },
      developer: () => config.developer === true,
      canRestore: () => page === 'tap',
      restore(value) {
        const merged = mergeTapProgress(this.export(), value),
          restored = merged.local ? decodeGame(merged.local) : null;
        writeTapProgress(
          {
            getItem: (key) => sdk.getStorageSync(key),
            setItem: (key, value) => sdk.setStorageSync(key, value),
            removeItem: (key) => sdk.removeStorageSync?.(key),
          },
          merged,
        );
        Object.assign(challengeProgress, merged.progress);
        if (restored) {
          ({ state, opponent, difficulty } = restored);
          mode = state.mode;
          selected = null;
        }
      },
    };
    tapPortal = openNativeTapPortal({
      sdk,
      canvas,
      config,
      multiplayer: config.tapMultiplayer,
      savePort,
      onExit: () => {
        tapPortal = null;
        change('home');
      },
    });
  }
  function header(title, back) {
    if (back) button('返回', 16, top, 76, back);
    text(title, back ? 108 : 24, top + 24, 22);
  }
  function board() {
    const advice = !challengeId && opponent === 'computer' ? computerHints.sync(state) : {};
    const undo = !challengeId && opponent === 'computer' ? computerUndo.sync(state) : {};
    const hasComputerHint = !challengeId && opponent === 'computer';
    area = {
      x: 16,
      y: top + 66,
      w: width - 32,
      h: Math.max(88, height - top - bottom - (hasComputerHint ? 250 : 194)),
    };
    const unit = 44,
      boardW = state.cols * unit,
      boardH = state.rows * unit;
    panX = Math.max(0, Math.min(panX, Math.max(0, boardW - area.w)));
    panY = Math.max(0, Math.min(panY, Math.max(0, boardH - area.h)));
    ctx.save();
    ctx.beginPath();
    ctx.rect(area.x, area.y, area.w, area.h);
    ctx.clip();
    ctx.fillStyle = '#ead9b3';
    ctx.fillRect(area.x, area.y, area.w, area.h);
    for (let index = 0; index < state.board.length; index++) {
      const x = area.x + (index % state.cols) * unit - panX,
        y = area.y + Math.floor(index / state.cols) * unit - panY;
      if (x + unit < area.x || y + unit < area.y || x > area.x + area.w || y > area.y + area.h)
        continue;
      ctx.strokeStyle = selected === index ? '#456449' : '#bd986a';
      ctx.lineWidth = selected === index ? 3 : 1;
      ctx.strokeRect(x, y, unit, unit);
      const piece = state.board[index];
      if (piece) {
        ctx.beginPath();
        ctx.arc(x + 22, y + 22, 18, 0, Math.PI * 2);
        ctx.fillStyle = piece.side === 'red' ? '#ac493b' : '#456449';
        ctx.fill();
        text(label(piece), x + 13, y + 22, 18, '#fffaf0');
      } else if (selected !== null && canMove(state.board, selected, index, state.cols)) {
        ctx.beginPath();
        ctx.arc(x + 22, y + 22, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#456449';
        ctx.fill();
      }
      if (
        hasComputerHint &&
        advice.result &&
        [advice.result.action.from, advice.result.action.to].includes(index)
      ) {
        ctx.strokeStyle = '#247353';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x + 22, y + 22, 20, 0, Math.PI * 2);
        ctx.stroke();
        text(index === advice.result.action.from ? '1' : '2', x + 2, y + 8, 12, '#164f39');
      }
      if (x >= area.x && y >= area.y && x + unit <= area.x + area.w && y + unit <= area.y + area.h)
        hits.push({ x, y, w: unit, h: unit, label: `棋格${index}`, action: () => cell(index) });
    }
    ctx.restore();
    text(
      state.pending
        ? `抽到${label(state.pending)}，点空位部署`
        : '拖动棋盘 · 点空位落子 / 点棋子移动',
      16,
      area.y + area.h + 22,
      13,
    );
    button(
      challengeId
        ? hintRequest
          ? '观看中…'
          : hintShown || !adsEnabled
            ? '本题提示'
            : '获取提示'
        : state.pending
          ? `已抽到${label(state.pending)}`
          : '抽一枚棋子',
      16,
      height - bottom - (hasComputerHint ? 154 : 98),
      width - 32,
      () => (challengeId ? void showHint() : action(() => draw(state))),
      true,
    );
    if (hasComputerHint)
      button(
        advice.phase === 'analyzing'
          ? '分析中…'
          : advice.phase === 'advertising'
            ? '观看中…'
            : advice.result
              ? '重看提示'
              : advice.earned
                ? '更新提示'
                : '获取提示',
        16,
        height - bottom - 98,
        (width - 40) / 2,
        () => {
          if (state.turn !== 'red' || state.result || advice.phase || undo.pending) return;
          computerUndo.clearMessage();
          gesture = null;
          const requestedState = state;
          void computerHints.request(state, () => {
            if (challengeId || state !== requestedState) return;
            const hint = computerHints.sync(state).result;
            if (hint && area) {
              selected = hint.action.type === 'move' ? hint.action.from : null;
              panX = (hint.action.to % state.cols) * 44 - area.w / 2 + 22;
              panY = Math.floor(hint.action.to / state.cols) * 44 - area.h / 2 + 22;
            }
            render();
          });
        },
      );
    if (hasComputerHint)
      button(
        undo.pending ? '观看中…' : state.freeUndoUsed ? '悔棋' : '悔棋·免费1次',
        width / 2 + 4,
        height - bottom - 98,
        (width - 40) / 2,
        () => {
          if (!canUndoComputerTurn(state) || advice.phase || undo.pending) return;
          computerHints.cancel();
          void computerUndo.request(
            state,
            (next) => {
              clearTimeout(computerTimer);
              computerRequest = null;
              state = next;
              selected = null;
              message = '';
              save();
            },
            render,
          );
        },
      );
    const status = hasComputerHint ? undo.message || advice.message || message : message;
    // Two short lines stay inside a narrow phone's safe area.
    const lineLength = Math.max(12, Math.floor((width - 32) / 12));
    text(status.slice(0, lineLength), 16, height - bottom - 35, 12);
    text(status.slice(lineLength), 16, height - bottom - 18, 12);
  }
  const visuals = {};
  function loadVisuals() {
    if (typeof sdk.createImage !== 'function') return;
    for (const key of ['pavilion', 'logo']) {
      const source = config.visualAssets?.[key];
      if (!source) continue;
      const image = safe(() => sdk.createImage());
      if (!image) continue;
      const entry = { image, ready: false };
      visuals[key] = entry;
      image.onload = () => {
        if (stopped) return;
        entry.ready = true;
        render();
      };
      image.onerror = () => {
        entry.ready = false;
        render();
      };
      safe(() => {
        image.src = source;
      });
    }
  }
  function background() {
    ctx.fillStyle = '#f4efdf';
    ctx.fillRect(0, 0, width, height);
    const image = visuals.pavilion?.image;
    if (visuals.pavilion?.ready && image.width && image.height) {
      const scale = Math.max(width / image.width, height / image.height);
      ctx.drawImage(
        image,
        (width - image.width * scale) / 2,
        (height - image.height * scale) / 2,
        image.width * scale,
        image.height * scale,
      );
    }
    ctx.fillStyle = page === 'home' ? 'rgba(244,239,223,.40)' : 'rgba(244,239,223,.91)';
    ctx.fillRect(0, 0, width, height);
  }
  function render() {
    if (stopped || hidden || page === 'pk' || page === 'tap' || !width) return;
    hits = [];
    area = null;
    contentBottom = 0;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    background();
    if (page !== 'play') {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top, width, Math.max(0, height - bottom - top));
      ctx.clip();
      ctx.translate(0, -pageScroll);
    }
    const w = width - 48;
    if (page === 'home') {
      text('山间棋亭 · 象棋 × 五子棋', 24, top + 24, 14, '#456449');
      text('象五子棋', width / 2 - 72, top + 84, 36);
      text('象棋走法，同色连五', width / 2 - 72, top + 122, 16);
      if (visuals.logo?.ready) ctx.drawImage(visuals.logo.image, 24, top + 58, 48, 48);
      else {
        ctx.beginPath();
        ctx.arc(48, top + 82, 23, 0, Math.PI * 2);
        ctx.fillStyle = '#ead9b3';
        ctx.fill();
        text('帅', 38, top + 82, 21, '#ac493b');
      }
      let y = Math.max(top + 180, height - bottom - (hasGame() || challengeId ? 248 : 190));
      if (hasGame() || challengeId) {
        button(
          challengeId ? '继续练习' : '继续对局',
          24,
          y,
          w,
          () =>
            change(
              state.result || (challengeId && challengeStatus !== 'playing') ? 'result' : 'play',
            ),
          true,
        );
        y += 58;
      }
      button(
        challengeId ? '返回原棋局' : '开始对弈',
        24,
        y,
        w,
        () => (challengeId ? leaveTraining() : change('modes')),
        !hasGame(),
      );
      y += 58;
      button('战术练习', 24, y, (w - 8) / 2, () => change('training'));
      button('玩法与设置', width / 2 + 4, y, (w - 8) / 2, () => change('help'));
      y += 58;
      button('设置', 24, y, config.tapServices?.enabled ? (w - 8) / 2 : w, () =>
        change('settings'),
      );
      if (config.tapServices?.enabled)
        button('TapTap 小站', width / 2 + 4, y, (w - 8) / 2, openTap);
      contentBottom = y + 62;
    } else if (page === 'modes') {
      header('选择玩法', () => change('home'));
      text('选择对手，再准备棋盘与难度。', 24, top + 88, 15);
      button('电脑对弈', 24, top + 124, w, () => openSetup('computer'), true);
      button('同屏双人', 24, top + 182, w, () => openSetup('local'));
      if (config.competitionEnabled === true && config.apiUrl)
        button('好友挑战', 24, top + 240, w, openPK);
    } else if (page === 'setup') {
      const back = previous;
      header('对弈准备', () => change(back));
      text(
        setup.opponent === 'computer' ? '单人挑战 · 你执红先行' : '双人同屏 · 红黑轮流落子',
        24,
        top + 88,
        17,
      );
      text('棋盘', 24, top + 132, 14, '#6f7162');
      button(
        '象棋盘 9×10',
        24,
        top + 156,
        w,
        () => {
          setup.mode = 'xiangqi';
          render();
        },
        setup.mode === 'xiangqi',
      );
      button(
        '五子棋盘 15×15',
        24,
        top + 214,
        w,
        () => {
          setup.mode = 'gomoku';
          render();
        },
        setup.mode === 'gomoku',
      );
      let y = top + 286;
      if (setup.opponent === 'computer') {
        text('电脑难度', 24, y, 14, '#6f7162');
        y += 24;
        const names = { practice: '简易', standard: '标准', hard: '困难' };
        Object.keys(names).forEach((level, i) =>
          button(
            names[level],
            24 + (i * (w + 8)) / 3,
            y,
            (w - 16) / 3,
            () => {
              setup.difficulty = level;
              render();
            },
            setup.difficulty === level,
          ),
        );
        y += 70;
      }
      const continuing = unfinished() && setup.mode === mode && setup.opponent === opponent;
      button(continuing ? '继续对局' : '开始对局', 24, y, w, submitSetup, true);
      text('更换棋盘或对手时，会先确认重开。', 24, y + 76, 13, '#6f7162');
      contentBottom = y + 94;
    } else if (page === 'restart') {
      header('重新开局');
      text('当前棋局尚未结束。', 24, top + 94, 20);
      text('重开后将替换本机保存的棋局。', 24, top + 136, 15);
      button(
        '取消，保留棋局',
        24,
        top + 184,
        w,
        () => change(restartBack, restartBack === 'setup' ? setupBack : 'home'),
        true,
      );
      button('确认重开', 24, top + 242, w, () => fresh());
    } else if (page === 'settings') {
      header('设置', () => change(previous));
      button(`声音：${soundEnabled ? '开启' : '关闭'}`, 24, top + 90, w, toggleSound);
    } else if (page === 'training') {
      header('战术练习', () => change('home'));
      CHALLENGES.forEach((item, i) =>
        button(
          `${String(i + 1).padStart(2, '0')} ${item.title}${challengeProgress[item.id]?.stars ? ' ★' : ''}`,
          24,
          top + 76 + i * 58,
          w,
          () => training(item.id),
        ),
      );
    } else if (page === 'play') {
      text(
        `${sideName(state.turn)}回合${opponent === 'computer' && state.turn === 'black' ? ' · 电脑思考' : ''}`,
        16,
        top + 24,
        20,
      );
      button('暂停', width - 92, top, 76, () => change('pause'));
      // The pause icon uses two equal solid bars rather than a font glyph.
      ctx.fillStyle = '#456449';
      ctx.fillRect(width - 39, top + 14, 4, 20);
      ctx.fillRect(width - 31, top + 14, 4, 20);
      board();
    } else if (page === 'pause') {
      header('暂停');
      button('继续对局', 24, top + 82, w, () => change('play'), true);
      button(challengeId ? '返回原棋局' : '重新开局', 24, top + 140, w, () => {
        if (challengeId) leaveTraining();
        else {
          setup = { mode, difficulty, opponent };
          restartBack = 'pause';
          change('restart');
        }
      });
      button('返回首页', 24, top + 198, w, () => {
        save();
        change('home');
      });
      button('玩法与设置', 24, top + 256, w, () => change('help', 'pause'));
      if (!challengeId)
        button('调整玩法与难度', 24, top + 314, w, () => openSetup(opponent, 'pause'));
    } else if (page === 'help') {
      header('玩法与设置', () => change(previous));
      [
        '同色棋子连成五枚获胜。',
        '点空位随机部署，或先抽子。',
        '点自己的棋子，再点绿点移动。',
        '走法沿用象棋；帅与兵走一格。',
        '炮吃子需要隔一枚，马不能蹩腿。',
        '拖动棋盘，完整露出的格子可落子。',
        '电脑会计算攻防，可随时暂停。',
      ].forEach((line, i) => text(line, 24, top + 88 + i * 30, 14));
      if (challengeId && (hintShown || challengeStatus === 'solved')) {
        const item = CHALLENGES.find((item) => item.id === challengeId),
          note = challengeStatus === 'solved' ? item.explanation : item.hint;
        Array.from(note)
          .reduce((lines, char, i) => {
            const row = Math.floor(i / Math.max(12, Math.floor(w / 14)));
            (lines[row] ||= []).push(char);
            return lines;
          }, [])
          .forEach((line, i) => {
            text(line.join(''), 24, top + 398 + i * 24, 14);
            contentBottom = top + 414 + i * 24;
          });
      }
      button(`声音：${soundEnabled ? '开启' : '关闭'}`, 24, top + 318, w, toggleSound);
      if (channel)
        button('B站入口', 24, top + 514, w, () => {
          channelHelpBack = previous;
          change('channel', 'help');
        });
    } else if (page === 'channel' && channel) {
      const snapshot = channel.getSnapshot();
      header('B站入口', () => change('help', channelHelpBack));
      text(`收藏签 ${snapshot.count || 0} 枚`, 24, top + 84);
      channel.menuActions.forEach((action, i) =>
        button(action.label, 24, top + 122 + i * 58, w, () => runChannel(action)),
      );
      Array.from(channelMessage || snapshot.message || '')
        .reduce((rows, char, i) => {
          (rows[Math.floor(i / Math.max(12, Math.floor(w / 14)))] ||= []).push(char);
          return rows;
        }, [])
        .forEach((line, i) => {
          text(line.join(''), 24, top + 270 + i * 24, 14);
          contentBottom = top + 286 + i * 24;
        });
    } else if (page === 'result') {
      header(
        challengeId
          ? challengeStatus === 'solved'
            ? '本题完成'
            : '再想一步'
          : state.result === 'draw'
            ? '平局'
            : state.resigned
              ? `${sideName(state.resigned)}认输，${sideName(state.result)}获胜`
              : `${sideName(state.result)}连五获胜`,
      );
      text(`完成 ${state.ply} 手`, 24, top + 90);
      button(
        '再来一局',
        24,
        top + 140,
        w,
        () => {
          setup = null;
          challengeId ? training(challengeId) : fresh(opponent);
        },
        true,
      );
      button('返回首页', 24, top + 198, w, () => change('home'));
      if (challengeId) {
        button('战术练习', 24, top + 256, w, () => change('training'));
        button('查看解法', 24, top + 314, w, () => change('help', 'result'));
        const next =
          CHALLENGES[
            (CHALLENGES.findIndex((item) => item.id === challengeId) + 1) % CHALLENGES.length
          ];
        button('下一题', 24, top + 372, w, () => training(next.id), true);
        button('返回原棋局', 24, top + 430, w, () => leaveTraining());
      }
    }
    if (page !== 'play') {
      ctx.restore();
      maxPageScroll = Math.max(
        0,
        contentBottom + bottom - height,
        ...hits.map((hit) => hit.y + hit.h + bottom - height),
      );
      hits = hits.map((hit) => ({ ...hit, y: hit.y - pageScroll }));
      const nextScroll = Math.min(pageScroll, maxPageScroll);
      if (nextScroll !== pageScroll) {
        pageScroll = nextScroll;
        render();
      }
    } else maxPageScroll = 0;
  }
  function action(fn) {
    if (
      page !== 'play' ||
      state.result ||
      (!challengeId && opponent === 'computer' && computerHints.sync(state).phase) ||
      (!challengeId && opponent === 'computer' && computerUndo.sync(state).pending) ||
      hintRequest ||
      (opponent === 'computer' && state.turn === 'black')
    )
      return;
    try {
      fn();
      selected = null;
      message = '';
      if (soundEnabled)
        safe(() => {
          audio?.stop();
          audio?.play();
        });
      save();
      if (challengeId) settleTraining();
      else if (state.result) change('result');
      else {
        render();
        scheduleComputer();
      }
    } catch (error) {
      message = error.message;
      render();
    }
  }
  function toggleSound() {
    soundEnabled = !soundEnabled;
    safe(() => sdk.setStorageSync('xiangqi-five-native-sound', soundEnabled ? '1' : '0'));
    if (!soundEnabled) safe(() => audio?.stop());
    render();
  }
  function settleTraining() {
    challengeStatus = challengeOutcome(challengeId, state);
    if (challengeStatus === 'playing' && state.turn === 'black') {
      const reply = challengeReply(challengeId, state);
      if (reply) move(state, reply.from, reply.to);
      challengeStatus = challengeOutcome(challengeId, state);
    }
    if (challengeStatus === 'playing') {
      render();
      return;
    }
    const prior = challengeProgress[challengeId] || { stars: 0, attempts: 0 };
    challengeProgress[challengeId] = {
      stars: Math.max(prior.stars, challengeStatus === 'solved' ? (hintShown ? 1 : 2) : 0),
      attempts: Math.min(10000, prior.attempts + 1),
    };
    safe(() =>
      sdk.setStorageSync(
        CHALLENGE_SAVE_KEY,
        JSON.stringify({ version: 1, progress: challengeProgress }),
      ),
    );
    change('result');
  }
  function cell(index) {
    if (
      (!challengeId && opponent === 'computer' && computerHints.sync(state).phase) ||
      (!challengeId && opponent === 'computer' && computerUndo.sync(state).pending) ||
      hintRequest ||
      (opponent === 'computer' && state.turn === 'black')
    )
      return;
    if (state.pending) action(() => deploy(state, index));
    else if (state.board[index]?.side === state.turn) {
      selected = selected === index ? null : index;
      render();
    } else if (selected !== null) action(() => move(state, selected, index));
    else action(() => deployDirectly(state, index));
  }
  function scheduleComputer() {
    clearTimeout(computerTimer);
    if (
      page !== 'play' ||
      hidden ||
      stopped ||
      opponent !== 'computer' ||
      state.turn !== 'black' ||
      state.result ||
      computerRequest
    )
      return;
    computerTimer = setTimeout(async () => {
      if (page !== 'play' || hidden || stopped) return;
      const request = { state, ply: state.ply };
      computerRequest = request;
      message = '电脑思考中…';
      render();
      const isCancelled = () =>
        computerRequest !== request ||
        page !== 'play' ||
        hidden ||
        stopped ||
        state !== request.state ||
        state.ply !== request.ply;
      try {
        const result = await searchPositionAsync(state, difficulty, { isCancelled });
        if (isCancelled()) return;
        if (!result.action) throw new Error('no action');
        applyComputerAction(state, result.action);
        selected = null;
        message = '';
        save();
        if (state.result) change('result');
        else render();
      } catch {
        if (!isCancelled()) {
          message = '电脑分析失败，可暂停后继续重试';
          render();
        }
      } finally {
        if (computerRequest === request) computerRequest = null;
      }
    }, 100);
  }
  function openPK() {
    if (
      config.competitionEnabled !== true ||
      !config.apiUrl ||
      typeof startNativeCompetition !== 'function'
    ) {
      message = '好友服务尚未配置，单机仍可继续';
      render();
      return;
    }
    change('pk');
    try {
      pk = startNativeCompetition(
        sdk,
        {
          ...config,
          canvas,
          onExit() {
            pk?.stop();
            pk = null;
            resize();
            change('home');
          },
        },
        createRenderer,
      );
    } catch {
      pk?.stop();
      pk = null;
      message = '好友服务暂不可用';
      change('home');
    }
  }
  const position = (point) => ({
    x: point.clientX ?? point.x,
    y: point.clientY ?? point.y,
    id: point.identifier ?? 0,
  });
  const contains = (box, p) =>
    box && p.x >= box.x && p.y >= box.y && p.x < box.x + box.w && p.y < box.y + box.h;
  const hasStart = subscribe('TouchStart', (event) => {
    gesture = null;
    if (
      hidden ||
      stopped ||
      hintRequest ||
      page === 'pk' ||
      page === 'tap' ||
      event.touches?.length > 1
    )
      return;
    const point = event.changedTouches?.[0];
    if (point) {
      const p = position(point);
      gesture = { ...p, page, panX, panY, pageScroll, moved: false, board: contains(area, p) };
    }
  });
  subscribe('TouchMove', (event) => {
    if (!gesture || event.touches?.length > 1) {
      gesture = null;
      return;
    }
    const point = event.changedTouches?.find((item) => (item.identifier ?? 0) === gesture.id);
    if (!point) return;
    const p = position(point);
    if (Math.hypot(p.x - gesture.x, p.y - gesture.y) > 8) gesture.moved = true;
    if (gesture.board && gesture.moved) {
      panX = gesture.panX + gesture.x - p.x;
      panY = gesture.panY + gesture.y - p.y;
      render();
    } else if (page !== 'play' && gesture.moved) {
      pageScroll = Math.max(0, Math.min(maxPageScroll, gesture.pageScroll + gesture.y - p.y));
      render();
    }
  });
  subscribe('TouchCancel', () => {
    gesture = null;
  });
  subscribe('TouchEnd', (event) => {
    const start = gesture;
    gesture = null;
    if (
      hidden ||
      stopped ||
      hintRequest ||
      page === 'pk' ||
      page === 'tap' ||
      event.touches?.length ||
      event.changedTouches?.length !== 1
    )
      return;
    const p = position(event.changedTouches[0]);
    if (p.x < 0 || p.x >= width || p.y < top || p.y >= height - bottom) return;
    if (
      hasStart &&
      (!start ||
        start.page !== page ||
        start.id !== p.id ||
        start.moved ||
        Math.hypot(p.x - start.x, p.y - start.y) > 12)
    )
      return;
    hits.find((item) => contains(item, p))?.action();
  });
  subscribe('Hide', () => {
    const advertising = hintAccess.pending;
    hintAccess.setHidden(true);
    if (!advertising) cancelHint();
    hidden = true;
    gesture = null;
    clearTimeout(computerTimer);
    computerRequest = null;
    safe(() => audio?.stop());
    if (page === 'play' && !advertising) page = 'pause';
    save();
  });
  subscribe('Show', () => {
    hidden = false;
    hintAccess.setHidden(false);
    gesture = null;
    resize();
  });
  subscribe('WindowResize', resize);
  subscribe('AudioInterruptionBegin', () => safe(() => audio?.stop()));
  if (channel?.subscribe)
    listeners.push(
      channel.subscribe(() => {
        if (page === 'channel') render();
      }),
    );
  audio = safe(() => sdk.createInnerAudioContext?.());
  if (audio) {
    audio.src = 'competition-action.wav';
    safe(() => audio.onError?.(() => {}));
  }
  loadVisuals();
  if (adsEnabled) void ads.preload();
  resize();
  return {
    canvas,
    get state() {
      return { page, game: state, opponent, difficulty, mode };
    },
    getLayout() {
      return {
        width,
        height,
        area,
        panX,
        panY,
        pageScroll,
        maxPageScroll,
        hits: hits.map(({ action, ...hit }) => hit),
      };
    },
    getTapServiceState: () => tapPortal?.getSnapshot(),
    stop() {
      tapPortal?.stop();
      stopped = true;
      cancelHint();
      ads.dispose();
      for (const { image } of Object.values(visuals)) image.onload = image.onerror = null;
      clearTimeout(computerTimer);
      computerRequest = null;
      gesture = null;
      pk?.stop();
      for (const off of listeners) safe(off);
      safe(() => audio?.stop());
      safe(() => audio?.destroy());
    },
  };
}
