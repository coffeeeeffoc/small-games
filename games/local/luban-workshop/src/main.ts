import './style.css';
import {
  createGame,
  tryMove,
  beginTransaction,
  updateTransaction,
  commitTransaction,
  cancelTransaction,
  undo,
  redo,
  getProgress,
  getHint,
  switchToReassembly,
  sweepMove,
  type Transaction,
} from './core/index.ts';
import { levels } from './levels/index.ts';
import { PuzzleScene } from './view/PuzzleScene.ts';
import { bindGestures } from './input/gestures.ts';
import { bindTouchButtons } from './input/taps.ts';
import { storage, type RunStats } from './storage.ts';

const icons: Record<string, string> = {
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  undo: '<path d="M8 5 3 10l5 5M3 10h11a6 6 0 0 1 0 12" transform="translate(0 -3)"/>',
  redo: '<path d="m16 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12" transform="translate(0 -3)"/>',
  reset: '<path d="M3 4v6h6M3 10a9 9 0 1 1 1 8"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  bulb: '<path d="M9 18h6m-5 3h4M8 15a7 7 0 1 1 8 0l-1 3H9l-1-3Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3c-1 0-1 1-1 2m0 3h.01"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  focus: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="3"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="brand-mark">${icon('layers')}</span><h1>榫间<span>鲁班锁</span></h1><span class="edition">把玩 · 解构 · 复原</span></div>
    <nav aria-label="游戏菜单"><button id="levels" class="soft">${icon('layers')}<span>机关匣</span><span class="count">${levels.length}</span></button><button id="help" class="icon-button" aria-label="操作说明">${icon('help')}</button></nav>
  </header>
  <main class="workbench">
    <div class="level-heading"><div class="eyebrow"><span id="level-index"></span><span class="line"></span><span id="level-difficulty">初识榫卯</span></div><h2 id="level-title"></h2><p id="level-subtitle"></p></div>
    <div class="progress-heading"><span id="phase-label">拆解</span><strong id="progress">0 <small>/ 3</small></strong><span id="move-count">0 次移动</span></div>
    <div id="stage" aria-label="3D 鲁班锁操作区：拖动零件移动，拖动空白旋转视角"><button id="axis-negative" class="axis-handle" data-axis-step="-1" aria-label="负方向手柄：点击微移或沿轨道拖动" hidden>−</button><button id="axis-positive" class="axis-handle" data-axis-step="1" aria-label="正方向手柄：点击微移或沿轨道拖动" hidden>+</button></div>
    <div class="view-tools" aria-label="视角工具"><button id="camera-reset" class="icon-button" aria-label="看全机关" title="看全机关">${icon('focus')}</button><button id="zoom-in" class="icon-button" aria-label="放大">${icon('plus')}</button><button id="zoom-out" class="icon-button" aria-label="缩小">${icon('minus')}</button><button id="xray" class="icon-button" aria-label="透视观察" aria-pressed="false" title="透视观察">${icon('eye')}</button></div>
    <div class="scene-caption" aria-hidden="true"><span>拖空白旋转</span><i></i><span>双指缩放</span></div>
    <div id="completion" class="completion" hidden></div>
    <div class="feedback"><span id="status-symbol">${icon('layers')}</span><p id="status" role="status" aria-live="polite">点选一根榫条，沿它的方向拖动</p></div>
  </main>
  <footer class="controls">
    <div class="pieces-section"><div class="section-label">零件<span>点选 · 拖动</span></div><div id="pieces" class="piece-list" aria-label="选择零件"></div></div>
    <div class="manipulation"><div class="selected-meta"><span id="selected-dot"></span><strong id="selected-name">选择一个零件</strong><span id="selected-axis">沿轨道移动</span></div><div class="move-buttons"><button id="nudge-negative" aria-label="沿负方向微调" disabled>${icon('minus')}<span>微移</span></button><div class="axis-indicator"><span id="axis-letter">—</span><small>滑动轴</small></div><button id="nudge-positive" aria-label="沿正方向微调" disabled>${icon('plus')}<span>微移</span></button></div></div>
    <div class="actions"><div class="history-buttons"><button id="undo" aria-label="撤销" title="撤销">${icon('undo')}</button><button id="redo" aria-label="重做" title="重做">${icon('redo')}</button><button id="restart" aria-label="重新开始" title="重新开始">${icon('reset')}</button></div><div class="hint-actions"><button id="clue" class="hint-button" aria-label="思路提示">思路</button><button id="hint" class="hint-button">${icon('bulb')}<span>下一步</span></button></div></div>
  </footer>
  <dialog id="dialog" aria-labelledby="dialog-title"><div class="dialog-top"><span class="eyebrow">榫间 / WORKSHOP</span><button id="close-dialog" class="icon-button" aria-label="关闭">${icon('close')}</button></div><div id="dialog-content"></div></dialog>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let level = levels.find((item) => item.id === storage.current()) ?? levels[0]!;
let savedState = storage.load(level);
let state = savedState ?? createGame(level);
let run: RunStats = (savedState ? storage.loadRun(level.id) : null) ?? {
  hints: savedState ? 1 : 0,
  disassemblyMoves: null,
};
let recordedCompletion = '';
let recordedDisassembly = false;
let selected: string | null = null;
let transaction: Transaction | null = null;
let blockedIds: string[] = [];
let xray = false;
let scene: PuzzleScene;
let detachGestures: (() => void) | undefined;
let lastHint: ReturnType<typeof getHint> = null;
let saveFailed = false;
let lastFeedback = '';
let cancelGesture: (() => void) | undefined;
const dialog = $<HTMLDialogElement>('dialog');
const detachTouchButtons = bindTouchButtons(app);

function status(message: string, blocked = false) {
  if (lastFeedback !== message) {
    $('status').textContent = message;
    lastFeedback = message;
  }
  $('status').parentElement!.classList.toggle('is-blocked', blocked);
}

function save() {
  const stateSaved = storage.save(state);
  const runSaved = storage.saveRun(level.id, run);
  if ((!stateSaved || !runSaved) && !saveFailed) {
    saveFailed = true;
    status('浏览器暂时无法保存进度，本次仍可正常把玩');
  }
}

function render() {
  const progress = getProgress(level, state);
  const done = state.phase === 'disassemble' ? progress.removed : progress.assembled;
  $('level-index').textContent =
    `${String(levels.indexOf(level) + 1).padStart(2, '0')} / ${String(levels.length).padStart(2, '0')}`;
  $('level-difficulty').textContent = level.difficulty;
  $('level-title').textContent = level.title;
  $('level-subtitle').textContent = level.subtitle;
  $('phase-label').textContent = state.phase === 'disassemble' ? '拆解进度' : '复原进度';
  $('progress').innerHTML = `${done} <small>/ ${progress.total}</small>`;
  $('move-count').textContent = `${state.moves} 次移动 · ${run.hints ? '借助提示' : '自主探索'}`;
  app.dataset.moves = String(state.moves);
  app.dataset.phase = state.phase;
  app.dataset.complete = String(progress.complete);
  app.dataset.level = level.id;
  $('undo').toggleAttribute('disabled', state.history.length === 0 || transaction !== null);
  $('redo').toggleAttribute('disabled', state.future.length === 0 || transaction !== null);
  $('nudge-positive').toggleAttribute('disabled', !selected || transaction !== null);
  $('nudge-negative').toggleAttribute('disabled', !selected || transaction !== null);
  for (const button of $('pieces').querySelectorAll<HTMLButtonElement>('[data-piece]')) {
    const id = button.dataset.piece!;
    const piece = level.pieces.find((p) => p.id === id)!;
    button.setAttribute('aria-pressed', String(id === selected));
    button.classList.toggle(
      'removed',
      state.phase === 'disassemble' && Math.abs(state.offsets[id]!) >= piece.removedAt - 0.001,
    );
    button.classList.toggle(
      'placed',
      state.phase === 'reassemble' && Math.abs(state.offsets[id]!) < 0.001,
    );
    button.classList.toggle('blocked', blockedIds.includes(id));
  }
  const piece = level.pieces.find((p) => p.id === selected);
  $('selected-name').textContent = piece?.name ?? '选择一个零件';
  $('selected-dot').style.background = piece?.color ?? '#526173';
  $('selected-axis').textContent = piece ? '也可直接拖动榫条' : '点选场景或下方色块';
  $('axis-letter').textContent = piece?.axis.toUpperCase() ?? '—';
  const completion = $('completion');
  completion.hidden = !progress.complete || transaction !== null;
  if (!completion.hidden) {
    if (state.phase === 'disassemble') {
      if (!recordedDisassembly) {
        storage.markDismantled(level.id);
        recordedDisassembly = true;
      }
      completion.innerHTML = `<span class="success-icon">${icon('check')}</span><div><h3>一榫一卯，解开了。</h3><p>${level.mechanic ?? '读懂阻挡，再依次让路'} · ${state.moves} 次移动</p></div><p class="completion-record">保留眼前的散件，亲手复原。选中零件可看到它的原位轮廓。</p><button id="reassemble" class="primary">开始复原</button><button id="browse-levels" class="soft full">先逛机关匣</button>`;
      $('browse-levels').onclick = openLevels;
      $('reassemble').onclick = () => {
        cancelActive();
        run.disassemblyMoves = state.moves;
        state = switchToReassembly(level, state);
        selected = null;
        blockedIds = [];
        lastHint = null;
        save();
        render();
        status('选取一根榫条，向中心推回；装配顺序也藏在槽口里');
      };
    } else {
      const recordKey = `${level.id}:${run.hints}:${run.disassemblyMoves}:${state.moves}`;
      if (recordKey !== recordedCompletion) {
        const result = storage.recordCompletion(level.id, run, state.moves);
        recordedCompletion = recordKey;
        if (!result.saved) status('本次已完成；浏览器暂时无法保存纪录');
      }
      const record = storage.record(level.id);
      const total = run.disassemblyMoves === null ? null : run.disassemblyMoves + state.moves;
      completion.innerHTML = `<span class="success-icon">${icon('check')}</span><div><h3>严丝合缝，复原完成。</h3><p>${run.hints === 0 && run.disassemblyMoves !== null ? '全程自主探索，收获独立印章。' : '已收获复原印章，下次试试独立解开。'}</p></div>${seals(level.id)}<p class="completion-record">${total === null ? `复原 ${state.moves} 次移动` : `拆解 ${run.disassemblyMoves} + 复原 ${state.moves} = ${total} 次移动`}${record.bestMoves === null ? '' : ` · 最佳 ${record.bestMoves} 次`}<br>移动次数仅作个人记录，不影响印章。</p><button id="next-level" class="primary">${levels.indexOf(level) < levels.length - 1 ? '下一件机关' : '回到机关匣'}</button><button id="replay-level" class="soft full">重玩本关</button>`;
      $('next-level').onclick = () =>
        levels.indexOf(level) < levels.length - 1
          ? loadLevel(levels.indexOf(level) + 1)
          : openLevels();
      $('replay-level').onclick = restartLevel;
    }
  } else if (!progress.complete) {
    recordedCompletion = '';
    recordedDisassembly = false;
  }
  scene?.update(
    state.offsets,
    selected,
    blockedIds,
    xray,
    lastHint?.direction ?? null,
    state.phase,
  );
  for (const direction of ['negative', 'positive']) {
    const highlighted = !!lastHint && lastHint.direction > 0 === (direction === 'positive');
    $(`nudge-${direction}`).classList.toggle('hint-direction', highlighted);
    $(`axis-${direction}`).classList.toggle('hint-direction', highlighted);
  }
  positionHandles();
}

function positionHandles() {
  const stage = $('stage');
  const endpoints = selected && scene ? scene.projectAxisEnds(selected) : null;
  const separate =
    endpoints &&
    Math.hypot(
      endpoints.positive.x - endpoints.negative.x,
      endpoints.positive.y - endpoints.negative.y,
    ) >= 64;
  const stageRect = stage.getBoundingClientRect();
  const exclusions = ['.view-tools', '.level-heading', '.progress-heading', '.feedback'].map(
    (selector) => app.querySelector(selector)!.getBoundingClientRect(),
  );
  for (const direction of ['negative', 'positive'] as const) {
    const handle = $(`axis-${direction}`);
    const point = endpoints?.[direction];
    const overlaps =
      point &&
      exclusions.some((rect) => {
        const x = point.x + stageRect.x,
          y = point.y + stageRect.y;
        return (
          x + 24 > rect.left && x - 24 < rect.right && y + 24 > rect.top && y - 24 < rect.bottom
        );
      });
    handle.hidden =
      !point ||
      !separate ||
      !!overlaps ||
      !$('completion').hidden ||
      stage.clientHeight < 280 ||
      point.x < 26 ||
      point.x > stage.clientWidth - 26 ||
      point.y < 128 ||
      point.y > stage.clientHeight - 92;
    if (endpoints) {
      handle.style.left = `${endpoints[direction].x}px`;
      handle.style.top = `${endpoints[direction].y}px`;
    }
  }
}

function select(id: string) {
  selected = id;
  blockedIds = [];
  if (lastHint?.pieceId !== id) lastHint = null;
  const piece = level.pieces.find((p) => p.id === id)!;
  status(`已选中${piece.name} · 沿发光轨道拖动，或用下方 ± 微移`);
  render();
  const button = $('pieces').querySelector<HTMLElement>(`[data-piece="${id}"]`);
  if (button)
    $('pieces').scrollTo({
      left: button.offsetLeft - $('pieces').offsetLeft - 12,
      behavior: 'smooth',
    });
}

function cancelActive() {
  cancelGesture?.();
  if (transaction) {
    state = cancelTransaction(transaction);
    transaction = null;
    render();
  }
}

function describeMove(result: { blocked: boolean; blockedBy: string[]; actualOffset: number }) {
  blockedIds = result.blockedBy;
  if (result.blocked) {
    const names = blockedIds
      .map((id) => level.pieces.find((p) => p.id === id)?.name)
      .filter(Boolean);
    status(
      names.length
        ? `被${names.join('、')}挡住了 · 先给它让出空间`
        : '已到轨道尽头 · 试试另一个方向',
      true,
    );
  } else if (selected) {
    const piece = level.pieces.find((p) => p.id === selected)!;
    status(
      Math.abs(result.actualOffset) >= piece.removedAt - 0.001
        ? `${piece.name}已完全取出`
        : Math.abs(result.actualOffset) < 0.001
          ? `${piece.name}回到装配位置`
          : `${piece.name}正在移动 · 松手后轻轻吸附`,
    );
  }
}

function moveBy(delta: number) {
  if (!selected || transaction) return;
  const previous = state;
  const result = tryMove(level, state, selected, state.offsets[selected]! + delta);
  state = result.state;
  updateHintProgress();
  describeMove(result);
  describeDiscovery(previous);
  save();
  render();
}

function updateHintProgress() {
  if (!lastHint) return;
  const remaining = lastHint.targetOffset - state.offsets[lastHint.pieceId]!;
  if (Math.abs(remaining) < 0.001 || Math.sign(remaining) !== lastHint.direction) lastHint = null;
}

/** Reward a useful partial slide, before a piece is fully extracted. */
function describeDiscovery(previous: typeof state) {
  if (previous === state || !selected || state.phase !== 'disassemble') return;
  const canMove = (offsets: typeof state.offsets, id: string) => {
    const piece = level.pieces.find((item) => item.id === id)!;
    return piece.range.some(
      (target) =>
        Math.abs(sweepMove(level, offsets, id, target).actualOffset - offsets[id]!) > 0.001,
    );
  };
  const freed = level.pieces.filter(
    (piece) =>
      piece.id !== selected &&
      !canMove(previous.offsets, piece.id) &&
      canMove(state.offsets, piece.id),
  );
  if (freed.length)
    status(
      `让出空间了 · ${freed.map((piece) => piece.name.split(' · ')[0]).join('、')}现在可以移动`,
    );
}

function mountPieces() {
  $('pieces').innerHTML = level.pieces
    .map(
      (piece, i) =>
        `<button data-piece="${piece.id}" aria-label="选择${piece.name}" aria-pressed="false" style="--piece-color:${piece.color}"><span class="piece-letter">${String.fromCharCode(65 + i)}</span><span class="piece-name">${piece.name.split(' · ')[0]}</span><span class="piece-check">${icon('check')}</span></button>`,
    )
    .join('');
  $('pieces')
    .querySelectorAll<HTMLButtonElement>('[data-piece]')
    .forEach((button) => {
      button.onclick = () => {
        cancelActive();
        select(button.dataset.piece!);
      };
    });
}

function connectInput() {
  detachGestures?.();
  const controller = bindGestures(
    {
      canvas: $('stage'),
      pick(x, y) {
        const target = document.elementFromPoint(x, y);
        return target?.closest('[data-axis-step]') && selected ? selected : scene.pick(x, y);
      },
      axisScreen: (id) => scene.axisScreen(id),
      orbit: (dx, dy) => scene.orbit(dx, dy),
      zoom: (factor) => scene.zoom(factor),
    },
    {
      select,
      begin(id) {
        transaction = beginTransaction(state, id);
        return state.offsets[id]!;
      },
      move(target) {
        if (!transaction) return;
        const result = updateTransaction(level, transaction, target);
        transaction = result.transaction;
        state = result.state;
        updateHintProgress();
        describeMove(result);
        render();
        return result;
      },
      end() {
        if (!transaction) return;
        const previous = transaction.before;
        state = commitTransaction(transaction);
        updateHintProgress();
        transaction = null;
        save();
        render();
        if (!blockedIds.length && selected) {
          const piece = level.pieces.find((item) => item.id === selected)!;
          const offset = Math.abs(state.offsets[selected]!);
          status(
            offset >= piece.removedAt
              ? `${piece.name}已完全取出`
              : offset < 0.001
                ? `${piece.name}回到装配位置`
                : `${piece.name}已移动到位 · 继续试探，或换根榫条`,
          );
        }
        describeDiscovery(previous);
      },
      cancel() {
        if (!transaction) return;
        state = cancelTransaction(transaction);
        transaction = null;
        blockedIds = [];
        status('这次拖动已取消，零件回到拖动前的位置');
        render();
      },
      cameraChanged() {
        render();
      },
      edgeOn() {
        status('这个角度不易拖动 · 转一下视角，或用下方 ± 微移');
      },
      nudge(direction) {
        moveBy(direction * 0.5);
      },
    },
  );
  detachGestures = controller;
  // Rebinding also clears any captured gesture when a dialog or command interrupts it.
  cancelGesture = () => {
    controller();
    detachGestures = undefined;
    cancelGesture = undefined;
    connectInput();
  };
}

function loadLevel(index: number) {
  cancelActive();
  save();
  level = levels[index]!;
  savedState = storage.load(level);
  state = savedState ?? createGame(level);
  run = (savedState ? storage.loadRun(level.id) : null) ?? {
    hints: savedState ? 1 : 0,
    disassemblyMoves: null,
  };
  recordedCompletion = '';
  recordedDisassembly = false;
  selected = null;
  blockedIds = [];
  transaction = null;
  xray = false;
  lastHint = null;
  $('xray').setAttribute('aria-pressed', 'false');
  scene.setLevel(level);
  mountPieces();
  render();
  save();
  dialog.close();
  status(
    state.moves > 0 ? '已接续上次的进度 · 随时可以撤销和继续尝试' : '点选一根榫条，沿它的方向拖动',
  );
}

function openDialog(content: string) {
  cancelActive();
  $('dialog-content').innerHTML = content;
  if (!dialog.open) dialog.showModal();
}
function openLevels() {
  const chapters = [...new Set(levels.map((item) => item.chapter ?? '初识榫卯'))];
  const finished = levels.filter((item) => storage.completed(item.id)).length;
  openDialog(
    `<h2 id="dialog-title">打开机关匣</h2><p class="dialog-intro">${levels.length} 关 · 已复原 ${finished} / ${levels.length}<br>从识榫到让位，按章节挑战，也可自由挑选。</p>${chapters
      .map((chapter) => {
        const entries = levels.filter((item) => (item.chapter ?? '初识榫卯') === chapter);
        return `<section class="chapter-section"><div class="chapter-heading"><h3>${chapter}</h3><span class="chapter-progress">${entries.filter((item) => storage.completed(item.id)).length} / ${entries.length}</span></div><div class="level-grid">${entries
          .map((item) => {
            const i = levels.indexOf(item);
            return `<button data-level="${i}" class="level-card ${level.id === item.id ? 'current' : ''}" aria-label="第${i + 1}关 ${item.title}"><span class="level-number">${String(i + 1).padStart(2, '0')}</span><span class="level-info"><strong>${item.title}</strong><small>${item.pieces.length} 件 · ${item.mechanic ?? item.difficulty}</small></span><span class="level-badge">${storage.completed(item.id) ? '已复原' : storage.dismantled(item.id) ? '已解开' : level.id === item.id ? '把玩中' : '可把玩'}</span>${seals(item.id)}</button>`;
          })
          .join('')}</div></section>`;
      })
      .join(
        '',
      )}<p class="dialog-footnote">每关收集「解开」「复原」「独立」三枚印章。独立印章需从开局到复原不使用思路或下一步提示，撤销与透视不影响。进度自动保存在当前浏览器。</p>`,
  );
  $('dialog-content')
    .querySelectorAll<HTMLButtonElement>('[data-level]')
    .forEach((button) => {
      button.onclick = () => loadLevel(Number(button.dataset.level));
    });
}

function seals(id: string) {
  const record = storage.record(id);
  return `<span class="level-seals"><span class="seal ${storage.dismantled(id) || record.completed ? 'earned' : ''}">解开</span><span class="seal ${record.completed ? 'earned' : ''}">复原</span><span class="seal ${record.independent ? 'earned' : ''}">独立</span></span>`;
}

function restartLevel() {
  cancelActive();
  state = createGame(level);
  run = { hints: 0, disassemblyMoves: null };
  storage.resetRun(level.id);
  recordedCompletion = '';
  recordedDisassembly = false;
  selected = null;
  blockedIds = [];
  lastHint = null;
  xray = false;
  $('xray').setAttribute('aria-pressed', 'false');
  scene.resetCamera();
  save();
  render();
  dialog.close();
  status('重新开始 · 先找找哪根榫条可以移动');
}

function openHelp() {
  openDialog(
    `<h2 id="dialog-title">让指尖读懂榫卯</h2><p class="dialog-intro">不用着急，每一次试探都算发现。</p><ol class="help-list"><li><b>01</b><div><strong>点选，再沿轨道拖动</strong><p>每根榫条一种颜色，也有字母标记。点场景或底部色块选中，发光轨道就是它能移动的方向。</p></div></li><li><b>02</b><div><strong>看不清，就转个角度</strong><p>拖动空白处转动整体，双指捏合缩放。眼睛按钮可暂时看透其他零件；「看全机关」会把抽出的散件收入视野。</p></div></li><li><b>03</b><div><strong>卡住时，看看谁挡住了它</strong><p>阻挡的榫条会变红。先移动它，或者试试反方向。下方 ± 每次微移半格，减少精细拖动的负担。</p></div></li><li><b>04</b><div><strong>拆开以后，亲手装回</strong><p>完全取出后点“开始复原”，选中零件看原位轮廓，再把榫条推回槽口。新机关可能需要先让位，再换件。</p></div></li></ol><p class="dialog-footnote">电脑也可用方向键微移，Ctrl / ⌘ + Z 撤销，Shift + Z 重做。20 关分为四章，可自由选关。「思路」只解释机制，「下一步」指出零件与方向；全程不用这两种提示完成拆装可获得独立印章。零件自身不旋转。</p><button id="help-done" class="primary full">开始把玩</button>`,
  );
  $('help-done').onclick = () => dialog.close();
}

$('levels').onclick = openLevels;
$('help').onclick = openHelp;
$('close-dialog').onclick = () => dialog.close();
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      dialog.close();
  }
});
$('nudge-positive').onclick = () => moveBy(0.5);
$('nudge-negative').onclick = () => moveBy(-0.5);
$('undo').onclick = () => {
  cancelActive();
  state = undo(state);
  blockedIds = [];
  lastHint = null;
  save();
  render();
  status('已撤销上一次移动');
};
$('redo').onclick = () => {
  cancelActive();
  state = redo(state);
  blockedIds = [];
  lastHint = null;
  save();
  render();
  status('已重做上一次移动');
};
$('restart').onclick = () => {
  openDialog(
    '<h2 id="dialog-title">重新把玩这件机关？</h2><p class="dialog-intro">本关的拆装进度会重置，其他机关的进度会保留。</p><div class="confirm-actions"><button id="keep-playing" class="soft">继续当前进度</button><button id="confirm-restart" class="primary">重新开始</button></div>',
  );
  $('keep-playing').onclick = () => dialog.close();
  $('confirm-restart').onclick = restartLevel;
};
$('clue').onclick = () => {
  cancelActive();
  if (getProgress(level, state).complete) {
    status('这一阶段已完成，继续下一步吧');
    return;
  }
  run.hints++;
  lastHint = null;
  blockedIds = [];
  save();
  render();
  status(
    state.phase === 'reassemble'
      ? '先观察选中零件的原位轮廓；通常先放回外层套榫，再把钥匙送回槽口。卡住时也可以先退让。'
      : (level.clue ?? '看一看接触处：先找到有移动余量的榫条，挪出一点空间，再试相扣的另一根。'),
  );
};
$('hint').onclick = () => {
  cancelActive();
  lastHint = getHint(level, state);
  if (lastHint) {
    run.hints++;
    selected = lastHint.pieceId;
    blockedIds = [];
    status(`${lastHint.message} 试试 ${lastHint.direction > 0 ? '＋' : '−'} 方向。`);
  } else
    status(
      getProgress(level, state).complete
        ? '已经完成了，继续下一步吧'
        : '试着撤销一步，换一个方向观察',
    );
  render();
  save();
};
$('xray').onclick = () => {
  xray = !xray;
  $('xray').setAttribute('aria-pressed', String(xray));
  status(xray ? '透视已开启 · 点底部色块可选到被遮住的榫条' : '已恢复实体观察');
  render();
};
$('camera-reset').onclick = () => {
  cancelActive();
  scene.resetCamera();
  scene.fitPieces(state.offsets);
  render();
  status('已将当前所有零件收入视野 · 拖动空白继续观察');
};
$('zoom-in').onclick = () => {
  cancelActive();
  scene.zoom(0.85);
  render();
};
$('zoom-out').onclick = () => {
  cancelActive();
  scene.zoom(1.18);
  render();
};
for (const direction of ['negative', 'positive'])
  $(`axis-${direction}`).onclick = (event) => {
    if (event.detail === 0) moveBy(direction === 'positive' ? 0.5 : -0.5);
  };
const handleObserver = new ResizeObserver(() => requestAnimationFrame(positionHandles));
handleObserver.observe($('stage'));
window.addEventListener('keydown', (event) => {
  if (
    dialog.open ||
    (event.target instanceof HTMLElement &&
      (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)))
  )
    return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    (event.shiftKey ? $('redo') : $('undo')).click();
  } else if (selected && ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(event.key)) {
    event.preventDefault();
    moveBy(['ArrowLeft', 'ArrowDown'].includes(event.key) ? -0.5 : 0.5);
  }
});

try {
  scene = new PuzzleScene($('stage'), level);
  mountPieces();
  render();
  connectInput();
  app.dataset.ready = 'true';
  if (state.moves > 0) status('已接续上次的进度 · 随时可以撤销和继续尝试');
} catch (error) {
  $('stage').innerHTML =
    `<div class="webgl-error"><h2>暂时无法打开 3D 画面</h2><p>请使用支持 WebGL 2 的新版浏览器，并开启硬件加速。</p><button id="retry" class="primary">重新尝试</button></div>`;
  $('retry').onclick = () => location.reload();
  for (const id of ['levels', 'xray', 'camera-reset', 'zoom-in', 'zoom-out', 'hint', 'restart'])
    $(id).setAttribute('disabled', '');
  status('3D 画面尚未就绪，当前进度已保留');
  console.error('Luban renderer unavailable', error);
}

// Read-only diagnostics shared by standalone and shell browser checks.
Object.assign(window, {
  lubanSnapshot: () => {
    const rect = $('stage').getBoundingClientRect();
    return {
      state: structuredClone(state),
      selected,
      hint: lastHint,
      run: { ...run },
      record: storage.record(level.id),
      levelCount: levels.length,
      progress: getProgress(level, state),
      xray,
      pieces: level.pieces.map((piece) => ({
        id: piece.id,
        axis: piece.axis,
        color: piece.color,
        offset: state.offsets[piece.id],
        screen: scene ? scene.projectPiece(piece.id) : null,
        direction: scene ? scene.axisScreen(piece.id) : null,
      })),
      stage: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  },
});
window.addEventListener('pagehide', () => {
  if (transaction) state = cancelTransaction(transaction);
  save();
});
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    detachTouchButtons();
    handleObserver.disconnect();
    detachGestures?.();
    scene?.dispose();
  });
