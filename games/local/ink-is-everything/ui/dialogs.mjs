import { $, esc, amount, bindPress } from './dom.mjs';
import { icon } from '../art.mjs';
import { equipmentView, rewardView, shopView } from './equipment-view.mjs';

/** Menus stay inside the landscape root. Players choose when to pause for equipment. */
export function createDialogs({
  engine,
  getState,
  getDefinition,
  setPaused,
  cancelInput,
  updateHUD,
  save,
  start,
  perform,
  storage,
  audio,
  onSoundChange,
  onHome,
  getChapters = () => [getDefinition()],
  getSelectedChapter = () => getDefinition().id,
  selectChapter = () => {},
  getChapterState = () => getState(),
  onFullscreen = () => {},
  isFullscreen = () => false,
  isMiniGame = () => false,
}) {
  const dialog = $('#modal');
  let kind = null,
    lastFocus = null;
  const stats = () => engine.getPlayerStats(getState());
  function open(html, nextKind) {
    cancelInput();
    setPaused(true);
    if (!dialog.open) lastFocus = document.activeElement;
    kind = nextKind;
    dialog.dataset.kind = kind;
    $('#modal-content').innerHTML = html;
    $('#modal-close').hidden = false;
    // Native top-layer dialogs detach from the transformed game viewport.
    dialog.setAttribute('open', '');
    dialog.setAttribute('aria-modal', 'true');
    $('#modal-title').tabIndex = -1;
    $('#modal-title').focus({ preventScroll: true });
    updateHUD();
    save();
  }
  function finishClose() {
    kind = null;
    delete dialog.dataset.kind;
    cancelInput();
    setPaused(false);
    updateHUD();
    if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }
  function close() {
    if (!dialog.open) return;
    dialog.removeAttribute('open');
    finishClose();
  }
  function dismiss() {
    if (['won', 'lost'].includes(getState().status) && kind !== 'result') {
      showResult();
      return;
    }
    const finished = ['won', 'lost'].includes(getState().status);
    close();
    if (finished) onHome?.();
  }
  function showPause() {
    if (dialog.open) {
      close();
      return;
    }
    const state = getState(),
      finished = ['won', 'lost'].includes(state.status);
    open(
      `<div class="pause-layout"><div class="pause-verse"><div class="pause-emblem" aria-hidden="true">墨</div><span class="modal-kicker">${finished ? '这一页已写完' : '旅程已暂停'}</span><h2 id="modal-title">暂且收笔</h2><p>${storage.available ? '墨汁与成长已保存' : '暂无法保存，请保持页面打开'}</p></div><div class="pause-options"><button class="primary-button" ${finished ? 'id="result-restart"' : 'id="resume" data-close'}>${finished ? '再写一页' : '继续旅程'}</button><button class="secondary-button" data-menu="equipment">装备与技能</button><button class="secondary-button" data-menu="reward" ${state.pendingRewards.length && state.status !== 'lost' ? '' : 'disabled'}>可选装备 ${state.pendingRewards.length || ''}</button><button class="secondary-button" id="modal-sound">${audio.muted ? '开启声音' : '关闭声音'}</button>${isMiniGame() ? '' : `<button class="secondary-button" id="modal-fullscreen" aria-pressed="${isFullscreen()}">${isFullscreen() ? '退出全屏' : '全屏'}</button>`}<button class="secondary-button" data-menu="help">帮助</button><button class="secondary-button" data-restart>重新开始</button><button class="secondary-button home-return" data-home>返回主页</button></div></div>`,
      'pause',
    );
  }
  function showHelp() {
    const s = stats();
    open(
      `<span class="modal-kicker">握笔之前</span><h2 id="modal-title">每一滴，都是你</h2><ul class="help-list"><li><b>墨弹 · 远程<span class="help-cost">每发 ${amount(s.attackCost)} 墨</span></b>按住墨弹连续射击，自动瞄准；拖动按钮可手动瞄准。射出的墨汁会散落，走近墨滴拾回。</li><li><b>干笔 · 近战<span class="help-cost">免费 · 命中吸墨</span></b>走到敌人身边，按住干笔挥出笔弧。两颗按钮分别触发远程和近战，可随时交替。</li><li><b>闪避与生命</b>左手摇杆移动，右手同时攻击。红色预警出现时侧闪；顶部墨汁条就是血条，耗尽即失败。</li><li><b>探索与装备</b>走近金色刻印，主动拾取装备。升级或拾取得到的装备可点右上角选择，也可留到安全时再选。收集 ${getDefinition().requiredSeals} 枚钥印，打开墨之门。</li></ul><div class="modal-actions"><button class="primary-button" data-close>握紧画笔</button></div>`,
      'help',
    );
  }
  function askRestart() {
    open(
      `<div class="result-layout"><span class="modal-kicker">一张新纸</span><h2 id="modal-title">重新落笔？</h2><p>重新开始「${esc(getDefinition().shortTitle || getDefinition().title)}」<br>本次装备与成长会重置</p><div class="modal-actions"><button id="confirm-restart" class="primary-button">重新开始</button><button class="secondary-button" data-close>保留旅程</button></div></div>`,
      'restart',
    );
  }
  function showShop() {
    open(shopView(getState(), getDefinition()), 'shop');
  }
  function showEquipment() {
    open(equipmentView(getState(), getDefinition(), engine), 'equipment');
  }
  function showRewards() {
    if (getState().pendingRewards.length && getState().status !== 'lost')
      open(rewardView(getState(), engine), 'reward');
  }
  function showResult() {
    const state = getState(),
      won = state.status === 'won',
      t = Math.floor(state.time);
    open(
      `<div class="result-layout"><span class="modal-kicker">${won ? '章节完成' : '生命墨汁耗尽'}</span><h2 id="modal-title">${won ? '归途，已写成' : '墨尽，笔未尽'}</h2><p>${won ? esc(getDefinition().title) : '近身挥笔吸墨，走位拾回墨滴，再落一笔。'}</p><div class="result-stats"><div><b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b><small>旅程时间</small></div><div><b>Lv.${state.progression.level}</b><small>旅人成长</small></div><div><b>${state.stats.enemiesDefeated}</b><small>击散墨灵</small></div></div><div class="modal-actions"><button id="result-restart" class="primary-button">${won ? '再写一页' : '重新落笔'}</button>${won && state.pendingRewards.length ? '<button class="secondary-button" data-menu="reward">选择剩余装备</button>' : ''}<button class="secondary-button" data-home>返回主页</button></div></div>`,
      'result',
    );
  }
  function routeView(chapter, state) {
    const rooms = chapter.rooms,
      xs = rooms.map((room) => room.mapX ?? 0),
      ys = rooms.map((room) => room.mapY ?? 0);
    const minX = Math.min(...xs),
      minY = Math.min(...ys),
      spanX = Math.max(...xs) - minX || 1,
      spanY = Math.max(...ys) - minY || 1;
    const positions = Object.fromEntries(
      rooms.map((room) => [
        room.id,
        {
          x: 12 + (((room.mapX ?? 0) - minX) / spanX) * 76,
          y: 17 + (((room.mapY ?? 0) - minY) / spanY) * 58,
        },
      ]),
    );
    const pairs = new Set();
    const lines = rooms
      .flatMap((room) =>
        (room.portals || []).flatMap((portal) => {
          const target = positions[portal.target],
            from = positions[room.id];
          const key = [room.id, portal.target].sort().join('|');
          if (!target || pairs.has(key)) return [];
          pairs.add(key);
          return [
            `<line x1="${from.x * 10}" y1="${from.y * 2}" x2="${target.x * 10}" y2="${target.y * 2}"/>`,
          ];
        }),
      )
      .join('');
    return `<div class="chapter-route" aria-label="${esc(chapter.title)}探索路线"><svg class="route-lines" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${rooms
      .map((room) => {
        const visit = state?.rooms?.[room.id],
          current = (state?.roomId || chapter.start) === room.id;
        const cleared = visit?.visited && visit?.cleared,
          visited = visit?.visited;
        const label = current
          ? '所在'
          : cleared
            ? '已清散'
            : visited
              ? '已探索'
              : room.id === chapter.start
                ? '旅程起点'
                : '待探索';
        return `<div class="route-node ${current ? 'current' : ''} ${visited ? 'visited' : ''} ${cleared ? 'cleared' : ''}" style="left:${positions[room.id].x}%;top:${positions[room.id].y}%"><span class="route-seal">${icon(cleared ? 'check' : room.isFinal ? 'shield' : room.bridges?.length ? 'brush' : room.objects?.some((object) => object.kind === 'merchant') ? 'trade' : 'map')}</span><strong>${esc(room.name)}</strong><small>${label}</small></div>`;
      })
      .join('')}</div>`;
  }
  function showChapters() {
    const chapters = getChapters(),
      selected = chapters.find((chapter) => chapter.id === getSelectedChapter()) || chapters[0];
    if (!selected) return;
    const state = getChapterState(selected.id),
      continuing = state?.status === 'playing';
    const currentRoom = selected.rooms.find((room) => room.id === state?.roomId);
    open(
      `<span class="modal-kicker">章节与探索</span><h2 id="modal-title">${esc(selected.shortTitle || selected.title)}</h2><div class="chapter-tabs" aria-label="选择章节">${chapters.map((chapter) => `<button class="chapter-tab" data-chapter="${esc(chapter.id)}" aria-pressed="${chapter.id === selected.id}">${esc(chapter.title)}</button>`).join('')}</div>${routeView(selected, state)}<p class="route-caption">沿场景出口探索房间 · 金环标出当前位置</p><div class="chapter-footer"><p>${continuing ? `继续：${esc(currentRoom?.name || selected.shortTitle)} · 钥印 ${state.seals}/${selected.requiredSeals}` : `${selected.rooms.length} 处遗迹 · ${selected.requiredSeals} 枚钥印`}</p><button class="primary-button" data-play-chapter="${esc(selected.id)}">${continuing ? '继续旅程' : '进入旅程'} ${icon('arrow')}</button></div>`,
      'chapters',
    );
  }
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dismiss();
  });
  dialog.addEventListener('close', finishClose);
  document.addEventListener('keydown', (event) => {
    if (!dialog.open || event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      dismiss();
    }
    if (event.key === 'Tab') {
      const buttons = [
        ...dialog.querySelectorAll('button:not(:disabled), select, summary, [tabindex="0"]'),
      ].filter((element) => !element.hidden);
      if (!buttons.length) return;
      const first = buttons[0],
        last = buttons.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === $('#modal-title'))
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  bindPress('#modal-close', dismiss);
  function handle(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled || !button.closest('#modal') || button.id === 'modal-close')
      return;
    if (event.type === 'pointerdown') event.preventDefault();
    if (button.dataset.reward) {
      const result = perform({ type: 'chooseReward', itemId: button.dataset.reward }, true);
      if (result.ok) {
        save();
        if (getState().pendingRewards.length) showRewards();
        else if (getState().status === 'won') showResult();
        else close();
      }
      return;
    }
    if (button.hasAttribute('data-close')) {
      dismiss();
      return;
    }
    if (button.hasAttribute('data-home')) {
      close();
      onHome?.();
      return;
    }
    if (button.hasAttribute('data-restart')) {
      askRestart();
      return;
    }
    if (button.dataset.chapter) {
      selectChapter(button.dataset.chapter);
      showChapters();
      return;
    }
    if (button.dataset.playChapter) {
      selectChapter(button.dataset.playChapter);
      close();
      start();
      return;
    }
    if (['confirm-restart', 'result-restart'].includes(button.id)) {
      close();
      start(true);
      return;
    }
    if (button.dataset.menu) {
      ({ equipment: showEquipment, reward: showRewards, help: showHelp })[button.dataset.menu]?.();
      return;
    }
    if (button.id === 'modal-sound') {
      audio.toggle();
      onSoundChange();
      button.textContent = audio.muted ? '开启声音' : '关闭声音';
    }
    if (button.id === 'modal-fullscreen') onFullscreen();
    if (button.dataset.buy) {
      const result = perform(
        { type: 'buy', itemId: button.dataset.buy, contractId: button.dataset.buy },
        true,
      );
      if (result.ok) showShop();
      $('#shop-message').textContent = result.message || '当前无法购买';
    }
  }
  dialog.addEventListener('pointerdown', (event) => {
    if (event.button === 0) handle(event);
  });
  dialog.addEventListener('click', (event) => {
    if (event.detail === 0) handle(event);
  });
  return {
    showPause,
    showHelp,
    askRestart,
    showShop,
    showEquipment,
    showRewards,
    showResult,
    showChapters,
    close,
    get open() {
      return dialog.open;
    },
    get kind() {
      return kind;
    },
  };
}
