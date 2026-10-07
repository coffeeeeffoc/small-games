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
} from '../../../games/submodules/xiangqi-five/local-game.js';
import {
  searchPosition,
  applyComputerAction,
} from '../../../games/submodules/xiangqi-five/computer.js';
import { createRenderer } from '../../../games/submodules/xiangqi-five/competition-renderer.js';
import {
  CHALLENGES,
  CHALLENGE_SAVE_KEY,
  createChallengeState,
  challengeOutcome,
  challengeReply,
  decodeChallengeProgress,
} from '../../../games/submodules/xiangqi-five/challenges.js';

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
    difficulty = 'practice',
    mode = 'xiangqi';
  let page = 'home',
    previous = 'home',
    hidden = false,
    stopped = false,
    pk = null;
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
    hintShown = false;
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
    gesture = null;
    selected = null;
    pageScroll = 0;
    clearTimeout(computerTimer);
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
  function text(value, x, y, size = 17, color = '#573626') {
    ctx.fillStyle = color;
    ctx.font = `${size}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), x, y);
  }
  function button(value, x, y, w, action, primary = false) {
    ctx.fillStyle = primary ? '#ef795f' : '#dce9bf';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, 48, 16);
    else ctx.rect(x, y, w, 48);
    ctx.fill();
    text(value, x + 12, y + 24, 17, primary ? '#fff8e8' : '#365f45');
    hits.push({ x, y, w, h: 48, action, label: value });
  }
  function fresh(nextOpponent) {
    challengeId = '';
    opponent = nextOpponent;
    state = newGame(mode);
    selected = null;
    panX = panY = 0;
    message = '';
    save();
    change('play');
  }
  function training(id) {
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
  function header(title, back) {
    if (back) button('返回', 16, top, 76, back);
    text(title, back ? 108 : 24, top + 24, 22);
  }
  function board() {
    area = { x: 16, y: top + 66, w: width - 32, h: Math.max(88, height - top - bottom - 194) };
    const unit = 44,
      boardW = state.cols * unit,
      boardH = state.rows * unit;
    panX = Math.max(0, Math.min(panX, Math.max(0, boardW - area.w)));
    panY = Math.max(0, Math.min(panY, Math.max(0, boardH - area.h)));
    ctx.save();
    ctx.beginPath();
    ctx.rect(area.x, area.y, area.w, area.h);
    ctx.clip();
    ctx.fillStyle = '#f7dcaa';
    ctx.fillRect(area.x, area.y, area.w, area.h);
    for (let index = 0; index < state.board.length; index++) {
      const x = area.x + (index % state.cols) * unit - panX,
        y = area.y + Math.floor(index / state.cols) * unit - panY;
      if (x + unit < area.x || y + unit < area.y || x > area.x + area.w || y > area.y + area.h)
        continue;
      ctx.strokeStyle = selected === index ? '#365f45' : '#bd986a';
      ctx.lineWidth = selected === index ? 3 : 1;
      ctx.strokeRect(x, y, unit, unit);
      const piece = state.board[index];
      if (piece) {
        ctx.beginPath();
        ctx.arc(x + 22, y + 22, 18, 0, Math.PI * 2);
        ctx.fillStyle = piece.side === 'red' ? '#ef795f' : '#88a879';
        ctx.fill();
        text(label(piece), x + 13, y + 22, 18, '#fff8e8');
      } else if (selected !== null && canMove(state.board, selected, index, state.cols)) {
        ctx.beginPath();
        ctx.arc(x + 22, y + 22, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#365f45';
        ctx.fill();
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
      challengeId ? '本题提示' : state.pending ? `已抽到${label(state.pending)}` : '抽一枚棋子',
      16,
      height - bottom - 98,
      width - 32,
      () =>
        challengeId ? ((hintShown = true), change('help', 'pause')) : action(() => draw(state)),
      true,
    );
    text(message, 16, height - bottom - 24, 12);
  }
  function render() {
    if (stopped || hidden || page === 'pk' || !width) return;
    hits = [];
    area = null;
    contentBottom = 0;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#fff8e8';
    ctx.fillRect(0, 0, width, height);
    if (page !== 'play') {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top, width, Math.max(0, height - bottom - top));
      ctx.clip();
      ctx.translate(0, -pageScroll);
    }
    const w = width - 48;
    if (page === 'home') {
      text('象五子棋', 24, top + 48, 36);
      text('象棋走法，连五获胜。', 24, top + 94, 17);
      let y = top + 130;
      if (state.ply || state.pending) {
        button('继续对局', 24, y, w, () => change(state.result ? 'result' : 'play'), true);
        y += 58;
      }
      button('电脑对弈', 24, y, w, () => fresh('computer'), true);
      y += 58;
      button('同屏双人', 24, y, w, () => fresh('local'));
      y += 58;
      button(`棋盘：${mode === 'xiangqi' ? '象棋盘' : '五子棋盘'}`, 24, y, w, () => {
        mode = mode === 'xiangqi' ? 'gomoku' : 'xiangqi';
        render();
      });
      y += 58;
      button(
        `电脑：${{ practice: '练习', standard: '标准', hard: '挑战' }[difficulty]}`,
        24,
        y,
        w,
        () => {
          difficulty = ['practice', 'standard', 'hard'][
            (['practice', 'standard', 'hard'].indexOf(difficulty) + 1) % 3
          ];
          render();
        },
      );
      y += 58;
      button('好友挑战', 24, y, w, openPK);
      y += 58;
      button('战术练习', 24, y, w, () => change('training'));
      y += 58;
      button('玩法与设置', 24, y, w, () => change('help'));
      text(message, 24, height - bottom - 20, 12);
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
      ctx.fillStyle = '#365f45';
      ctx.fillRect(width - 39, top + 14, 4, 20);
      ctx.fillRect(width - 31, top + 14, 4, 20);
      board();
    } else if (page === 'pause') {
      header('暂停');
      button('继续对局', 24, top + 82, w, () => change('play'), true);
      button('返回首页', 24, top + 140, w, () => {
        save();
        change('home');
      });
      button('玩法与设置', 24, top + 198, w, () => change('help', 'pause'));
    } else if (page === 'help') {
      header('玩法与设置', () => change(previous));
      [
        '同色棋子连成五枚获胜。',
        '点空位随机部署，或先抽子。',
        '点自己的棋子，再点绿点移动。',
        '走法沿用象棋；帅与兵走一格。',
        '炮吃子需要隔一枚，马不能蹩腿。',
        '拖动棋盘，完整露出的格子可落子。',
        '电脑搜索限制200ms，难度为预算内选择。',
      ].forEach((line, i) => text(line, 24, top + 88 + i * 30, 14));
      if (challengeId) {
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
      button(`声音：${soundEnabled ? '开启' : '关闭'}`, 24, top + 318, w, () => {
        soundEnabled = !soundEnabled;
        safe(() => sdk.setStorageSync('xiangqi-five-native-sound', soundEnabled ? '1' : '0'));
        if (!soundEnabled) safe(() => audio?.stop());
        render();
      });
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
            : `${sideName(state.result)}连五获胜`,
      );
      text(`完成 ${state.ply} 手`, 24, top + 90);
      button(
        '再来一局',
        24,
        top + 140,
        w,
        () => (challengeId ? training(challengeId) : fresh(opponent)),
        true,
      );
      button('返回首页', 24, top + 198, w, () => change('home'));
      if (challengeId) {
        button('战术练习', 24, top + 256, w, () => change('training'));
        button('查看解法', 24, top + 314, w, () => change('help', 'result'));
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
    if (page !== 'play' || state.result || (opponent === 'computer' && state.turn === 'black'))
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
    if (opponent === 'computer' && state.turn === 'black') return;
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
      state.result
    )
      return;
    computerTimer = setTimeout(() => {
      if (page !== 'play' || hidden || stopped) return;
      const result = searchPosition(state, difficulty, { timeMs: 200, nodes: 4000 });
      applyComputerAction(state, result.action);
      selected = null;
      save();
      if (state.result) change('result');
      else render();
    }, 100);
  }
  function openPK() {
    if (!config.apiUrl || typeof startNativeCompetition !== 'function') {
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
    if (hidden || stopped || page === 'pk' || event.touches?.length > 1) return;
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
      page === 'pk' ||
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
    hidden = true;
    gesture = null;
    clearTimeout(computerTimer);
    safe(() => audio?.stop());
    if (page === 'play') page = 'pause';
    save();
  });
  subscribe('Show', () => {
    hidden = false;
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
    stop() {
      stopped = true;
      clearTimeout(computerTimer);
      gesture = null;
      pk?.stop();
      for (const off of listeners) safe(off);
      safe(() => audio?.stop());
      safe(() => audio?.destroy());
    },
  };
}
