import { LEVELS, MECHANICS } from './levels.mjs';
import { step } from './rules.mjs';
import { renderBoard } from './render.mjs';
import { PlaySession, SAVE_KEY, normalizeProgress, recordWin } from './session.mjs';

const ARROWS = { up: '↑', right: '→', down: '↓', left: '←' };
const DIRECTIONS_CN = { up: '上', right: '右', down: '下', left: '左' };
const NAMES = ['芽芽', '月月', '棱棱', '泡泡'];
const SYMBOLS = ['芽', '月', '△', '◉'];
const ICONS = ['⇥', '↻', '⌁', '✣', '▣', '♧'];
const TIPS = [
  '让墙壁留住一只信使，另外三只就有机会追上。',
  '头顶的弯箭头只作用于下一步，撞墙也会消耗。',
  '桥在离开后才会收起。先想好，还需不需要回来。',
  '先走一步，再被风吹一步。撞墙也会改变下一拍风向。',
  '压住开关后，门在这一拍结束时打开。',
  '残影会重复你的上一条指令。观察它，再决定下一步。',
];
const mounted = new WeakMap();
const escapeHTML = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

function shell() {
  return `<main class="signal-game">
    <header class="masthead">
      <a class="brand" href="#" aria-label="同频归航"><span class="brand-mark" aria-hidden="true">⌂</span><span><span class="brand-en">TINY SIGNALS</span><h1>同频归航</h1></span></a>
      <p class="brand-copy">四座小岛，一次心有灵犀。<span>把每一盏灯，送回家。</span></p>
      <div class="header-actions"><span class="edition">VOL. 01 <i></i> 六座小小谜题</span><button id="sound" class="round-button" aria-label="开启声音" aria-pressed="false">♪</button><button id="help" class="round-button" aria-label="查看玩法说明">?</button></div>
    </header>
    <div class="game-layout">
      <section class="play-area" aria-label="四棋盘游戏">
        <div class="stage-heading"><div><p class="eyebrow"><span id="chapter">CHAPTER 01</span><span class="heading-line"></span> 同步解谜</p><h2 id="level-name"></h2></div><div class="turn-counter"><span>当前步数</span><strong id="moves">00</strong><small>每一步，一起走</small></div></div>
        <div class="board-grid" id="boards">${NAMES.map((name, i) => `<section class="island island-${i}" data-board="${i}" aria-label="${name}的棋盘"><div class="island-heading"><span><i class="identity-symbol">${SYMBOLS[i]}</i><strong>${name}</strong><small>0${i + 1}</small></span><span class="island-state">归航中</span></div><div class="board-art"></div></section>`).join('')}</div>
        <div class="result-banner" id="result" hidden role="status"><span class="result-emblem" id="result-icon"></span><div><h3 id="result-title"></h3><p id="result-copy"></p></div><button id="result-action" class="primary-button"></button></div>
        <div class="shared-caption"><span class="pulse-dots"><i></i><i></i><i></i><i></i></span><span id="direction-caption">同一个方向，四种小小的可能。</span><span class="unhurried">不必着急</span></div>
      </section>
      <aside class="control-panel" aria-label="归航控制台">
        <div class="mission"><p class="eyebrow">OUR LITTLE MISSION</p><h3>一个都不能少。</h3><p>将四位信使送回亮灯的小屋。<br>到家的伙伴会留下，等你。</p><div class="home-track" id="home-track"></div><div class="mission-total"><span>已到家</span><strong id="home-count">0 <small>/ 4</small></strong></div></div>
        <div class="control-section"><div class="section-label"><span>一起往哪儿走？</span><button id="preview-toggle" class="text-button" aria-pressed="false">预览关</button></div><div class="direction-pad">${['up', 'left', 'down', 'right'].map((d) => `<button type="button" class="direction-key dir-${d}" data-dir="${d}" aria-label="向${DIRECTIONS_CN[d]}移动"><span>${ARROWS[d]}</span><kbd>${d === 'up' ? 'W' : d === 'left' ? 'A' : d === 'down' ? 'S' : 'D'}</kbd></button>`).join('')}</div><button id="commit-preview" class="commit-preview" hidden>确认这一步 →</button><p class="control-note" id="control-note">方向键 / WASD · 点击也可以</p><div class="utilities"><button id="undo" aria-label="撤销上一步"><span>↶</span> 撤销 <kbd>Z</kbd></button><button id="restart" aria-label="重新开始本关"><span>↻</span> 重来 <kbd>R</kbd></button></div></div>
        <div class="mechanic-note"><span class="mechanic-icon" id="mechanic-icon"></span><div><p class="eyebrow">这一站的小秘密</p><h4 id="mechanic-name"></h4><p id="mechanic-tip"></p></div></div>
        <div class="personal-record"><div><span>个人最佳</span><strong id="personal-best">—</strong></div><span class="record-divider"></span><div><span id="target-label">最优路线</span><strong id="optimal-score">—</strong></div></div>
        <button id="hint" class="hint-button"><span>✧</span> 看一眼路线提示 <span>↗</span></button><div class="hint-panel" id="hint-panel" hidden><strong>从起点出发的参考路线</strong><p id="hint-route"></p><small>当前游玩会标记为使用提示。可重来后按顺序尝试。</small></div>
      </aside>
    </div>
    <section class="chapter-selection" aria-label="关卡选择"><div class="chapter-section-title"><p class="eyebrow">THE JOURNEY</p><span>慢慢来，每一站都有新发现。</span><strong id="completion-count">0 / 6</strong></div><nav id="level-nav" aria-label="选择关卡"></nav></section>
    <footer class="page-footer"><span><i class="status-dot"></i><span id="save-status">本机进度 · 自动保存</span></span><span>一次方向输入，同时控制四块棋盘。</span><span>TINY SIGNALS <b>✧</b> 2026</span></footer>
    <dialog id="rules-dialog" aria-labelledby="rules-title"><div class="dialog-heading"><div><p class="eyebrow">A LITTLE FIELD GUIDE</p><h2 id="rules-title">归航手册</h2></div><button id="close-help" class="round-button" aria-label="关闭玩法说明">×</button></div><p class="rules-intro">上下左右，同时影响四位信使。撞墙的伙伴留在原地，到家的伙伴会停下来。没有时间限制，随时撤销。</p><div class="rules-grid">${MECHANICS.map((m, i) => `<article><span>${ICONS[i]}</span><h3>${escapeHTML(m.name)}</h3><p>${escapeHTML(m.description)}</p></article>`).join('')}</div><p class="rules-footer">每次方向输入都算一拍，即使全部撞墙。撤销恢复全部机关。<br>获得最优星需要在这一轮未查看路线提示，并达到已验证的最少步数。</p><button id="close-help-bottom" class="primary-button">明白了，一起出发 →</button></dialog>
  </main>`;
}

export const gameDefinition = {
  manifest: {
    gameId: 'tiny-signals',
    version: '0.1.0',
    gameContractVersion: 1,
    contentSchemaVersion: 1,
    capabilities: ['storage'],
    loadModes: ['in-process', 'iframe'],
    entry: './game.mjs',
    integrity: 'local-development',
  },
  async mount(target, host) {
    if (!target || typeof target.querySelector !== 'function')
      throw new TypeError('需要游戏挂载元素');
    if (mounted.has(target)) await mounted.get(target).dispose();
    let progress = normalizeProgress(null, LEVELS);
    let saveError = false;
    const canSave = host?.session?.capabilities?.includes('storage') && host?.storage;
    if (canSave) {
      try {
        progress = normalizeProgress((await host.storage.read(SAVE_KEY))?.value, LEVELS);
      } catch {
        saveError = true;
      }
    } else saveError = true;
    let levelIndex = progress.lastLevel;
    let session = new PlaySession(LEVELS[levelIndex]);
    let paused = false;
    let disposed = false;
    let busy = false;
    let pendingDirection = null;
    let timer = null;
    let previewMode = false;
    let previewDirection = null;
    let swipe = null;
    let showHint = false;
    let sound = false;
    let audioContext = null;
    let saveQueue = Promise.resolve();
    const abort = new AbortController();
    const reducedMotion =
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    target.innerHTML = shell();
    const $ = (selector) => target.querySelector(selector);
    const $$ = (selector) => [...target.querySelectorAll(selector)];
    const on = (element, event, listener, options = {}) =>
      element.addEventListener(event, listener, { ...options, signal: abort.signal });

    function persist() {
      if (!canSave) return;
      const snapshot = structuredClone(progress);
      saveQueue = saveQueue.then(async () => {
        try {
          await host.storage.write(SAVE_KEY, snapshot);
          saveError = false;
        } catch {
          saveError = true;
        }
        if (!disposed) renderSaveStatus();
      });
    }
    function renderSaveStatus() {
      $('#save-status').textContent = saveError
        ? '存储暂不可用 · 本次仍可游玩'
        : '进度已在本机保存';
      if (!saveError && host?.session?.releaseChannel !== 'development')
        $('#save-status').textContent = '进度已保存';
    }
    function tone(won = false) {
      if (!sound) return;
      try {
        audioContext ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
        void audioContext.resume();
        const t = audioContext.currentTime;
        (won ? [523, 659, 784] : [440]).forEach((frequency, i) => {
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          osc.type = 'sine';
          osc.frequency.value = frequency;
          gain.gain.setValueAtTime(0, t + i * 0.09);
          gain.gain.linearRampToValueAtTime(0.045, t + i * 0.09 + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.22);
          osc.connect(gain);
          gain.connect(audioContext.destination);
          osc.start(t + i * 0.09);
          osc.stop(t + i * 0.09 + 0.24);
        });
      } catch {
        /* Audio is optional; no game logic depends on it. */
      }
    }
    function renderBoards(previous) {
      const preview =
        previewDirection && session.state.status === 'playing'
          ? step(session.level, session.state, previewDirection)
          : null;
      session.level.boards.forEach((board, i) => {
        const state = session.state.boards[i];
        const section = $(`[data-board="${i}"]`);
        section.classList.toggle('is-home', state.done);
        section.classList.toggle('is-failed', session.state.failedBoard === i);
        section.querySelector('.island-state').textContent = state.done
          ? '已到家 ✓'
          : state.charged
            ? '下一步 ↻ 90°'
            : session.state.failedBoard === i
              ? '遇到残影'
              : '归航中';
        const art = section.querySelector('.board-art');
        const previewPath = preview
          ? [
              state.pos,
              ...preview.events
                .filter((e) => e.board === i && (e.kind === 'move' || e.kind === 'wind'))
                .map((e) => e.to),
            ]
          : null;
        art.innerHTML = renderBoard(board, state, i, {
          previousInput: session.state.previousInput,
          echoDirection: session.state.previousInput,
          previewState: preview?.boards[i],
          previewPath,
          reducedMotion,
        });
        if (previous && !reducedMotion) {
          const from = previous.boards[i].pos;
          const to = state.pos;
          const svg = art.querySelector('svg');
          const robot = art.querySelector('[data-piece="robot"]');
          const cell = Number(svg?.dataset.cellSize || 48);
          const path = [
            from,
            ...session.state.events
              .filter((e) => e.board === i && (e.kind === 'move' || e.kind === 'wind'))
              .map((e) => e.to),
          ];
          if (robot && path.length > 1 && typeof robot.animate === 'function') {
            const keyframes = path.map((position, j) => ({
              transform: `translate(${((position % board.size) - (to % board.size)) * cell}px,${(Math.floor(position / board.size) - Math.floor(to / board.size)) * cell}px)`,
              offset: j / (path.length - 1),
            }));
            robot.animate(keyframes, { duration: 210, easing: 'linear' });
          }
        }
      });
      const caption = $('#direction-caption');
      if (preview) {
        const moved = preview.boards.filter((b, i) => b.pos !== session.state.boards[i].pos).length;
        caption.textContent =
          preview.status === 'lost'
            ? `向${DIRECTIONS_CN[previewDirection]}：第 ${preview.failedBoard + 1} 块棋盘会遇到残影`
            : `向${DIRECTIONS_CN[previewDirection]}：${moved} 位移动，${4 - moved} 位停留`;
        caption.classList.toggle('danger-text', preview.status === 'lost');
      } else {
        caption.textContent =
          session.state.status === 'won'
            ? '每一盏灯，都回到了家。'
            : '同一个方向，四种小小的可能。';
        caption.classList.remove('danger-text');
      }
    }
    function render(previous) {
      target.dataset.status = session.state.status;
      target.dataset.level = String(levelIndex);
      target.dataset.busy = String(busy);
      target.dataset.paused = String(paused);
      $('#moves').textContent = String(session.state.turn).padStart(2, '0');
      $('#chapter').textContent = `CHAPTER ${String(levelIndex + 1).padStart(2, '0')}`;
      $('#level-name').textContent = session.level.name;
      $('#home-track').innerHTML = session.state.boards
        .map(
          (b, i) =>
            `<span class="home-token token-${i} ${b.done ? 'arrived' : ''}" aria-label="${NAMES[i]}${b.done ? '已到家' : '未到家'}">${b.done ? '⌂' : SYMBOLS[i]}</span>`,
        )
        .join('<i class="track-link"></i>');
      $('#home-count').innerHTML =
        `${session.state.boards.filter((b) => b.done).length} <small>/ 4</small>`;
      $('#mechanic-icon').textContent = ICONS[levelIndex];
      $('#mechanic-name').textContent = MECHANICS[levelIndex]?.name || session.level.name;
      $('#mechanic-tip').textContent = TIPS[levelIndex];
      const record = progress.levels[session.level.id];
      $('#personal-best').innerHTML = record ? `${record.best}<small> 步</small>` : '—';
      $('#target-label').textContent = Number.isInteger(session.level.optimalMoves)
        ? '最优路线'
        : '参考路线';
      const targetMoves = session.level.optimalMoves ?? session.level.solution?.length;
      $('#optimal-score').innerHTML =
        targetMoves !== undefined ? `${targetMoves}<small> 步</small>` : '待探索';
      $('#undo').disabled = !session.history.length || paused;
      $('#restart').disabled = paused;
      for (const button of $$('[data-dir]')) {
        button.disabled = paused || session.state.status !== 'playing';
        button.classList.toggle('previewing', previewDirection === button.dataset.dir);
      }
      $('#preview-toggle').setAttribute('aria-pressed', String(previewMode));
      $('#preview-toggle').textContent = previewMode ? '预览开' : '预览关';
      $('#commit-preview').hidden =
        !previewMode || !previewDirection || session.state.status !== 'playing';
      $('#commit-preview').textContent = previewDirection
        ? `确认向${DIRECTIONS_CN[previewDirection]}移动 ${ARROWS[previewDirection]}`
        : '确认这一步';
      $('#control-note').textContent = paused
        ? '已暂停'
        : previewMode
          ? '先选方向，观察四盘，再确认'
          : globalThis.matchMedia?.('(pointer: coarse)').matches
            ? '任意位置滑动一步 · 双指滚动页面'
            : '方向键 / WASD · 点击也可以';
      $('#hint-panel').hidden = !showHint;
      $('#hint').setAttribute('aria-expanded', String(showHint));
      $('#hint-route').textContent = (session.level.solution || [])
        .map((d) => ARROWS[d])
        .join('  ');
      $('#completion-count').textContent =
        `${Object.keys(progress.levels).length} / ${LEVELS.length}`;
      const nav = $('#level-nav');
      if (!nav.children.length) {
        nav.innerHTML = LEVELS.map(
          (l, i) =>
            `<button data-level="${i}" class="level-card"><span class="level-number">${String(i + 1).padStart(2, '0')}</span><span class="level-card-body"><strong>${escapeHTML(l.name)}</strong><small>${escapeHTML(MECHANICS[i]?.name || '')}</small></span><span class="level-award" aria-hidden="true"></span></button>`,
        ).join('');
      }
      $$('[data-level]').forEach((button) => {
        const i = Number(button.dataset.level),
          level = LEVELS[i],
          result = progress.levels[level.id];
        const star =
          result?.bestUnaided != null &&
          Number.isInteger(level.optimalMoves) &&
          result.bestUnaided <= level.optimalMoves;
        button.classList.toggle('selected', i === levelIndex);
        button.classList.toggle('completed', !!result);
        button.setAttribute('aria-current', i === levelIndex ? 'step' : 'false');
        button.querySelector('.level-award').textContent = star ? '★' : result ? '✓' : '·';
      });
      const result = $('#result');
      result.hidden = session.state.status === 'playing';
      if (!result.hidden) {
        const won = session.state.status === 'won';
        result.classList.toggle('lost', !won);
        $('#result-icon').textContent = won ? '✧' : '↶';
        $('#result-title').textContent = won ? '四盏灯，都到家了。' : '有一位伙伴遇到了残影。';
        $('#result-copy').textContent = won
          ? `${session.state.turn} 步完成${session.assisted ? ' · 使用了路线提示' : session.state.turn === session.level.optimalMoves ? ' · 获得最优星 ★' : ' · 再试一次，也许能更少'}。`
          : '这一步可以撤销，所有机关也会一起回到上一拍。';
        $('#result-action').textContent = won
          ? levelIndex < LEVELS.length - 1
            ? '下一站 →'
            : '回到第一站 ↻'
          : '撤销这一步 ↶';
      }
      renderSaveStatus();
      renderBoards(previous);
    }
    function cancelAnimation() {
      swipe = null;
      clearTimeout(timer);
      timer = null;
      busy = false;
      pendingDirection = null;
    }
    function move(direction) {
      if (paused || disposed || $('#rules-dialog').open || session.state.status !== 'playing')
        return;
      if (busy) {
        pendingDirection = direction;
        return;
      }
      const previous = session.state;
      previewDirection = null;
      if (!session.move(direction)) return;
      busy = !reducedMotion;
      if (session.state.status === 'won') {
        progress = recordWin(progress, session);
        persist();
      }
      render(previous);
      tone(session.state.status === 'won');
      if (busy)
        timer = setTimeout(() => {
          busy = false;
          target.dataset.busy = 'false';
          const next = pendingDirection;
          pendingDirection = null;
          if (next) move(next);
        }, 220);
    }
    function selectLevel(index) {
      if (paused || index < 0 || index >= LEVELS.length) return;
      cancelAnimation();
      levelIndex = index;
      session = new PlaySession(LEVELS[index]);
      previewDirection = null;
      showHint = false;
      progress = { ...progress, lastLevel: index };
      persist();
      render();
    }
    function undo() {
      if (paused) return;
      cancelAnimation();
      previewDirection = null;
      if (session.undo()) render();
    }
    function restart() {
      if (paused) return;
      cancelAnimation();
      previewDirection = null;
      session.restart();
      render();
    }
    function chooseDirection(direction) {
      if (paused || disposed || $('#rules-dialog').open || session.state.status !== 'playing')
        return;
      if (previewMode) {
        previewDirection = direction;
        render();
      } else move(direction);
    }
    on(
      target,
      'touchstart',
      (event) => {
        swipe = null;
        if (event.touches.length !== 1 || paused || $('#rules-dialog').open) return;
        const touch = event.touches[0];
        swipe = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
      },
      { passive: true },
    );
    on(
      target.ownerDocument,
      'touchmove',
      (event) => {
        if (event.touches.length !== 1) swipe = null;
        // Keep one-finger swipes from scrolling; two fingers retain native page scrolling.
        if (swipe && event.cancelable) event.preventDefault();
      },
      { passive: false },
    );
    on(
      target.ownerDocument,
      'touchend',
      (event) => {
        const start = swipe;
        swipe = null;
        if (!start) return;
        const touch = [...event.changedTouches].find((point) => point.identifier === start.id);
        if (!touch) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
        if (event.cancelable) event.preventDefault();
        chooseDirection(
          Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up',
        );
      },
      { passive: false },
    );
    on(target.ownerDocument, 'touchcancel', () => {
      swipe = null;
    });
    on(target.ownerDocument.defaultView, 'blur', () => {
      swipe = null;
    });
    on(target, 'click', (event) => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.dataset.dir) chooseDirection(button.dataset.dir);
      if (button.dataset.level !== undefined) selectLevel(Number(button.dataset.level));
    });
    $$('[data-dir]').forEach((button) => {
      on(button, 'pointerenter', (event) => {
        if (event.pointerType === 'mouse' && !previewMode && !busy && !paused) {
          previewDirection = button.dataset.dir;
          renderBoards();
        }
      });
      on(button, 'pointerleave', () => {
        if (!previewMode) {
          previewDirection = null;
          renderBoards();
        }
      });
    });
    on($('#undo'), 'click', undo);
    on($('#restart'), 'click', restart);
    on($('#commit-preview'), 'click', () => {
      if (previewDirection) move(previewDirection);
    });
    on($('#preview-toggle'), 'click', () => {
      cancelAnimation();
      previewMode = !previewMode;
      previewDirection = null;
      render();
    });
    on($('#hint'), 'click', () => {
      showHint = !showHint;
      if (showHint) session.assisted = true;
      render();
    });
    on($('#sound'), 'click', () => {
      sound = !sound;
      $('#sound').setAttribute('aria-pressed', String(sound));
      $('#sound').setAttribute('aria-label', sound ? '关闭声音' : '开启声音');
      tone();
    });
    on($('#result-action'), 'click', () => {
      if (session.state.status === 'lost') undo();
      else selectLevel((levelIndex + 1) % LEVELS.length);
    });
    on($('.brand'), 'click', (event) => {
      event.preventDefault();
      selectLevel(0);
    });
    on($('#help'), 'click', () => {
      cancelAnimation();
      previewDirection = null;
      render();
      $('#rules-dialog').showModal();
    });
    on($('#close-help'), 'click', () => $('#rules-dialog').close());
    on($('#close-help-bottom'), 'click', () => $('#rules-dialog').close());
    const keyMap = {
      ArrowUp: 'up',
      ArrowRight: 'right',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      w: 'up',
      d: 'right',
      s: 'down',
      a: 'left',
    };
    on(target.ownerDocument, 'keydown', (event) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.repeat ||
        $('#rules-dialog').open ||
        paused
      )
        return;
      if (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) ||
        event.target.isContentEditable
      )
        return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (keyMap[key]) {
        event.preventDefault();
        chooseDirection(keyMap[key]);
      } else if (key === 'z') {
        event.preventDefault();
        undo();
      } else if (key === 'r') {
        event.preventDefault();
        restart();
      }
    });
    const instance = {
      pause() {
        if (disposed) return;
        paused = true;
        cancelAnimation();
        render();
        void audioContext?.suspend();
      },
      resume() {
        if (disposed) return;
        paused = false;
        render();
      },
      async dispose() {
        if (disposed) return;
        disposed = true;
        cancelAnimation();
        abort.abort();
        if ($('#rules-dialog').open) $('#rules-dialog').close();
        if (audioContext) await audioContext.close().catch(() => {});
        // A replacement instance must read after this instance's writes settle.
        await saveQueue;
        target.replaceChildren();
        mounted.delete(target);
      },
    };
    mounted.set(target, instance);
    render();
    return instance;
  },
};

export default gameDefinition;
