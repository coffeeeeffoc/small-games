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
  type Transaction,
} from './core/index.ts';
import { levels } from './levels/index.ts';
import { PuzzleScene } from './view/PuzzleScene.ts';
import { bindGestures } from './input/gestures.ts';
import { bindTouchButtons } from './input/taps.ts';
import { storage } from './storage.ts';

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
    <nav aria-label="游戏菜单"><button id="levels" class="soft">${icon('layers')}<span>机关匣</span><span class="count">03</span></button><button id="help" class="icon-button" aria-label="操作说明">${icon('help')}</button></nav>
  </header>
  <main class="workbench">
    <div class="level-heading"><div class="eyebrow"><span id="level-index">01 / 03</span><span class="line"></span><span id="level-difficulty">初识榫卯</span></div><h2 id="level-title"></h2><p id="level-subtitle"></p></div>
    <div class="progress-heading"><span id="phase-label">拆解</span><strong id="progress">0 <small>/ 3</small></strong><span id="move-count">0 次移动</span></div>
    <div id="stage" aria-label="3D 鲁班锁操作区：拖动零件移动，拖动空白旋转视角"><button id="axis-negative" class="axis-handle" data-axis-step="-1" aria-label="负方向手柄：点击微移或沿轨道拖动" hidden>−</button><button id="axis-positive" class="axis-handle" data-axis-step="1" aria-label="正方向手柄：点击微移或沿轨道拖动" hidden>+</button></div>
    <div class="view-tools" aria-label="视角工具"><button id="camera-reset" class="icon-button" aria-label="还原视角" title="还原视角">${icon('focus')}</button><button id="zoom-in" class="icon-button" aria-label="放大">${icon('plus')}</button><button id="zoom-out" class="icon-button" aria-label="缩小">${icon('minus')}</button><button id="xray" class="icon-button" aria-label="透视观察" aria-pressed="false" title="透视观察">${icon('eye')}</button></div>
    <div class="scene-caption" aria-hidden="true"><span>拖空白旋转</span><i></i><span>双指缩放</span></div>
    <div id="completion" class="completion" hidden></div>
    <div class="feedback"><span id="status-symbol">${icon('layers')}</span><p id="status" role="status" aria-live="polite">点选一根榫条，沿它的方向拖动</p></div>
  </main>
  <footer class="controls">
    <div class="pieces-section"><div class="section-label">零件<span>点选 · 拖动</span></div><div id="pieces" class="piece-list" aria-label="选择零件"></div></div>
    <div class="manipulation"><div class="selected-meta"><span id="selected-dot"></span><strong id="selected-name">选择一个零件</strong><span id="selected-axis">沿轨道移动</span></div><div class="move-buttons"><button id="nudge-negative" aria-label="沿负方向微调" disabled>${icon('minus')}<span>微移</span></button><div class="axis-indicator"><span id="axis-letter">—</span><small>滑动轴</small></div><button id="nudge-positive" aria-label="沿正方向微调" disabled>${icon('plus')}<span>微移</span></button></div></div>
    <div class="actions"><div class="history-buttons"><button id="undo" aria-label="撤销" title="撤销">${icon('undo')}</button><button id="redo" aria-label="重做" title="重做">${icon('redo')}</button><button id="restart" aria-label="重新开始" title="重新开始">${icon('reset')}</button></div><button id="hint" class="hint-button">${icon('bulb')}<span>一点提示</span></button></div>
  </footer>
  <dialog id="dialog" aria-labelledby="dialog-title"><div class="dialog-top"><span class="eyebrow">榫间 / WORKSHOP</span><button id="close-dialog" class="icon-button" aria-label="关闭">${icon('close')}</button></div><div id="dialog-content"></div></dialog>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let level = levels.find((item) => item.id === storage.current()) ?? levels[0]!;
let state = storage.load(level) ?? createGame(level);
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
  if (!storage.save(state) && !saveFailed) {
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
  $('move-count').textContent = `${state.moves} 次移动`;
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
    button.classList.toggle('removed', Math.abs(state.offsets[id]!) >= piece.removedAt - 0.001);
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
      completion.innerHTML = `<span class="success-icon">${icon('check')}</span><div><h3>一榫一卯，解开了。</h3><p>现在试着亲手把它们装回去。</p></div><button id="reassemble" class="primary">开始复原</button>`;
      $('reassemble').onclick = () => {
        cancelActive();
        state = switchToReassembly(level, state);
        selected = null;
        blockedIds = [];
        lastHint = null;
        save();
        render();
        status('选取一根榫条，向中心推回；装配顺序也藏在槽口里');
      };
    } else {
      storage.complete(level.id);
      completion.innerHTML = `<span class="success-icon">${icon('check')}</span><div><h3>严丝合缝，复原完成。</h3><p>你已经读懂了这件机关。</p></div><button id="next-level" class="primary">${levels.indexOf(level) < levels.length - 1 ? '下一件机关' : '回到机关匣'}</button>`;
      $('next-level').onclick = () =>
        levels.indexOf(level) < levels.length - 1
          ? loadLevel(levels.indexOf(level) + 1)
          : openLevels();
    }
  }
  scene?.update(state.offsets, selected, blockedIds, xray);
  positionHandles();
}

function positionHandles() {
  const stage = $('stage');
  const endpoints = selected && scene ? scene.projectAxisEnds(selected) : null;
  for (const direction of ['negative', 'positive'] as const) {
    const handle = $(`axis-${direction}`);
    handle.hidden = !endpoints || !scene || !selected || stage.clientHeight < 280;
    if (endpoints) {
      handle.style.left = `${Math.max(26, Math.min(stage.clientWidth - 66, endpoints[direction].x))}px`;
      handle.style.top = `${Math.max(128, Math.min(stage.clientHeight - 92, endpoints[direction].y))}px`;
    }
  }
}

function select(id: string) {
  selected = id;
  blockedIds = [];
  lastHint = null;
  const piece = level.pieces.find((p) => p.id === id)!;
  status(`已选中${piece.name} · 沿发光轨道拖动，或用下方 ± 微移`);
  render();
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
  const result = tryMove(level, state, selected, state.offsets[selected]! + delta);
  state = result.state;
  lastHint = null;
  describeMove(result);
  save();
  render();
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
        describeMove(result);
        render();
        return result;
      },
      end() {
        if (!transaction) return;
        state = commitTransaction(transaction);
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
  state = storage.load(level) ?? createGame(level);
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
  openDialog(
    `<h2 id="dialog-title">打开机关匣</h2><p class="dialog-intro">三件小机关，从一根榫条开始。</p><div class="level-list">${levels.map((item, i) => `<button data-level="${i}" class="level-card ${level.id === item.id ? 'current' : ''}"><span class="level-number">0${i + 1}</span><span class="level-info"><strong>${item.title}</strong><span>${item.description}</span><small>${item.pieces.length} 件 · ${item.difficulty} · ${item.estimatedMinutes}</small></span><span class="level-badge">${storage.completed(item.id) ? '已复原' : level.id === item.id ? '把玩中' : '可把玩'}</span></button>`).join('')}</div><p class="dialog-footnote">进度自动保存在当前浏览器。每件机关都可以拆开，再亲手装回。</p>`,
  );
  $('dialog-content')
    .querySelectorAll<HTMLButtonElement>('[data-level]')
    .forEach((button) => {
      button.onclick = () => loadLevel(Number(button.dataset.level));
    });
}

function openHelp() {
  openDialog(
    `<h2 id="dialog-title">让指尖读懂榫卯</h2><p class="dialog-intro">不用着急，每一次试探都算发现。</p><ol class="help-list"><li><b>01</b><div><strong>点选，再沿轨道拖动</strong><p>每根榫条一种颜色，也有字母标记。点场景或底部色块选中，发光轨道就是它能移动的方向。</p></div></li><li><b>02</b><div><strong>看不清，就转个角度</strong><p>拖动空白处转动整体，双指捏合缩放。眼睛按钮可暂时看透其他零件，选中后仍能拖动。</p></div></li><li><b>03</b><div><strong>卡住时，看看谁挡住了它</strong><p>阻挡的榫条会变红。先移动它，或者试试反方向。下方 ± 每次微移半格，减少精细拖动的负担。</p></div></li><li><b>04</b><div><strong>拆开以后，亲手装回</strong><p>完全取出后点“开始复原”，依次把榫条推回中心。撤销、重做和提示始终可以使用。</p></div></li></ol><p class="dialog-footnote">电脑也可用方向键微移，Ctrl / ⌘ + Z 撤销，Shift + Z 重做。首版为轴向榫锁，零件自身不旋转。</p><button id="help-done" class="primary full">开始把玩</button>`,
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
  $('confirm-restart').onclick = () => {
    state = createGame(level);
    selected = null;
    blockedIds = [];
    lastHint = null;
    scene.resetCamera();
    save();
    render();
    dialog.close();
    status('重新开始 · 先找找哪根榫条可以移动');
  };
};
$('hint').onclick = () => {
  cancelActive();
  lastHint = getHint(level, state);
  if (lastHint) {
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
  render();
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
