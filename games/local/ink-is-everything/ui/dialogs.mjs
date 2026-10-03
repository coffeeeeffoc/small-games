import { $, esc, amount, bindPress } from './dom.mjs';
import { equipmentView, rewardView, shopView } from './equipment-view.mjs';

/** Dialogs pause simulation. Reward selection is mandatory and persisted before display. */
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
}) {
  const dialog = $('#modal');
  let kind = null,
    lastFocus = null;
  const stats = () => engine.getPlayerStats(getState());
  function open(html, nextKind) {
    cancelInput();
    setPaused(true);
    kind = nextKind;
    dialog.dataset.kind = kind;
    if (!dialog.open) lastFocus = document.activeElement;
    $('#modal-content').innerHTML = html;
    $('#modal-close').hidden = kind === 'reward';
    if (!dialog.open) dialog.showModal();
    $('#modal-title').tabIndex = -1;
    $('#modal-title').focus({ preventScroll: true });
    updateHUD();
    save();
  }
  function close() {
    if (kind === 'reward' && getState().pendingRewards.length) return;
    dialog.close();
  }
  function showPause() {
    if (getState().pendingRewards.length) {
      showRewards();
      return;
    }
    if (dialog.open) {
      close();
      return;
    }
    open(
      `<span class="modal-kicker">BETWEEN TWO STROKES</span><h2 id="modal-title">让墨，歇一会儿。</h2><p>${getState().status === 'ready' ? '纸上的世界正在等你。' : getState().status !== 'playing' ? '这一页已经写完。' : storage.available ? '敌人和时间都已暂停。生命墨汁、装备和成长已保存。' : '敌人和时间已暂停。浏览器未能保存，请保持页面打开。'}</p><button id="resume" class="primary-button" data-close>继续旅程</button><button class="secondary-button" id="modal-sound">${audio.muted ? '开启声音' : '关闭声音'}</button><button class="secondary-button" data-restart>重新落笔</button>`,
      'pause',
    );
  }
  function showHelp() {
    if (getState().pendingRewards.length) {
      showRewards();
      return;
    }
    const s = stats();
    open(
      `<span class="modal-kicker">THE TRAVELER'S HANDBOOK</span><h2 id="modal-title">每一滴，都是你。</h2><ul class="help-list"><li><b>生命就是墨汁：</b>顶部只有一个墨池。敌人命中会损失墨汁，归零即失败。施放技能也消耗生命墨汁，主动消费至少留 ${amount(s.minInkAfterSpend)} 滴。</li><li><b>施法 → 拾回：</b>墨弹每发 ${amount(s.attackCost)} 墨；Q / ${esc(getDefinition().skills.nova.name)}消耗 ${amount(s.novaCost)} 墨，对周围造成伤害。施法在身边散落墨滴，走过去可拾回部分消耗；墨滴会消散，别站着等。</li><li><b>汲墨与恢复：</b>F / ${esc(getDefinition().skills.melee.name)}按钮是免费近战，命中按伤害吸回墨汁。所有攻击都能吸取，击杀还有恢复奖励；用闪避接近，抓住敌人收招空当回墨。</li><li><b>移动与瞄准：</b>左下摇杆 / WASD / 方向键，也可点击地面自动走近。按住墨弹自动瞄准，拖动可手动瞄准；电脑可按住敌人射击。移动、攻击与闪避支持多指同时操作。</li><li><b>成长与装备：</b>击败敌人积累经验，升级时三选一；场景装备拾取也会带来选择。同种装备可升阶，强化伤害、回收、吸取或闪避。点「装备」查看当前真实技能数值。</li><li><b>探索与目标：</b>走近桥锚点，拖线连接到对岸，以墨开辟支路寻找装备和补给。当前章节需 ${getDefinition().requiredSeals} 枚钥印；目标与出口见场景提示。E 交互，空格闪避，Esc 暂停。</li></ul><button class="primary-button" data-close>握紧画笔，继续</button>`,
      'help',
    );
  }
  function askRestart() {
    if (getState().pendingRewards.length) {
      showRewards();
      return;
    }
    const initial = getDefinition().initial;
    open(
      `<span class="modal-kicker">A CLEAN PAGE</span><h2 id="modal-title">重新落笔？</h2><p>本次装备与成长会重新开始。以 ${amount(initial.ink)} / ${amount(initial.maxInk)} 点生命墨汁，进入「${esc(getDefinition().title)}」。</p><button id="confirm-restart" class="primary-button">重新开始</button><button class="secondary-button" data-close>保留这段旅程</button>`,
      'restart',
    );
  }
  function showShop() {
    open(shopView(getState(), getDefinition()), 'shop');
  }
  function showEquipment() {
    if (getState().pendingRewards.length) {
      showRewards();
      return;
    }
    open(equipmentView(getState(), getDefinition(), engine), 'equipment');
  }
  function showRewards() {
    if (!getState().pendingRewards.length) return;
    open(rewardView(getState(), engine), 'reward');
  }
  function showResult() {
    const state = getState(),
      won = state.status === 'won',
      s = state.stats,
      t = Math.floor(state.time),
      spent = s.spent;
    open(
      `<span class="modal-kicker">THE END OF THIS PAGE</span><h2 id="modal-title">${won ? '你亲手写出了归途。' : '下一笔，会更稳。'}</h2><p>${won ? `你完成了「${esc(getDefinition().title)}」。每一次施法、回收与成长，都留下了自己的笔迹。` : '生命墨汁已经耗尽。别忘了回收技能散落的墨滴；闪避后近身挥笔吸墨，击杀也能恢复。红色笔迹出现时先侧向避开。'}</p><div class="result-stats"><div><b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b><small>冒险时间</small></div><div><b>Lv.${state.progression.level}</b><small>旅人成长</small></div><div><b>${amount(state.player.ink)}</b><small>生命墨汁</small></div></div><div class="spent-summary">主动用墨：战斗 ${amount(spent.attack + spent.nova)} · 绘路 ${amount(spent.explore)} · 装备 ${amount(spent.trade)}<br>拾回 ${amount(s.reclaimed)} · 命中吸取 ${amount(s.lifeStolen)} · 击杀恢复 ${amount(s.killRestored)}<br>近战 ${s.freeAttacks} 次 · 闪避 ${s.dashes} 次 · 击散 ${s.enemiesDefeated} 个墨灵<br>探索 ${s.roomsVisited}/${getDefinition().rooms.length} 处 · 装备 ${engine.getEquipmentSummary(state).length} 种</div><button id="result-restart" class="primary-button">${won ? '换一种成长，再写一页' : '重新落笔'}</button><button class="secondary-button" data-close>看看这张地图</button>`,
      'result',
    );
  }
  dialog.addEventListener('cancel', (event) => {
    if (kind === 'reward' && getState().pendingRewards.length) event.preventDefault();
  });
  dialog.addEventListener('close', () => {
    if (getState().pendingRewards.length && getState().status === 'playing') {
      showRewards();
      return;
    }
    kind = null;
    delete dialog.dataset.kind;
    cancelInput();
    setPaused(false);
    updateHUD();
    if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
  });
  bindPress('#modal-close', close);
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
        else close();
      }
      return;
    }
    if (kind === 'reward') return;
    if (button.hasAttribute('data-close')) close();
    if (button.hasAttribute('data-restart')) askRestart();
    if (['confirm-restart', 'result-restart'].includes(button.id)) {
      close();
      start(true);
    }
    if (button.id === 'modal-sound') {
      audio.toggle();
      onSoundChange();
      button.textContent = audio.muted ? '开启声音' : '关闭声音';
    }
    if (button.dataset.buy) {
      const result = perform(
        { type: 'buy', itemId: button.dataset.buy, contractId: button.dataset.buy },
        true,
      );
      if (result.ok) showShop();
      $('#shop-message').textContent = result.message;
    }
  }
  document.addEventListener('pointerdown', (event) => {
    if (event.button === 0) handle(event);
  });
  document.addEventListener('click', (event) => {
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
    close,
    get open() {
      return dialog.open;
    },
    get kind() {
      return kind;
    },
  };
}
