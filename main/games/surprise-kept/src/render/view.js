import { roomArt, boxArt, characterArt, giftArt, keyArt, screenArt, teaArt, icon } from './art.js';
import { evaluateGoals } from '../core/engine.js';
export const $ = (id) => document.getElementById(id);
export const names = { blue: '小蓝', orange: '小橙', gift: '礼物', key: '钥匙' };
export const boxes = { red: '红箱', blue: '蓝箱', green: '绿箱' };
export const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const itemArt = (item) => (item === 'key' ? keyArt() : giftArt());
const boxX = { red: 22.5, blue: 44.5, green: 66.5 };
export function eventText(event) {
  if (event.type === 'move')
    return `${names[event.item]}：${boxes[event.from]} → ${boxes[event.to]}`;
  return `${names[event.character]}${{ leave: '去倒茶了', return: '回来了，记忆没有改变', screen: '面前摆好屏风' }[event.type]}`;
}
export function witnessesText(event) {
  if (event.type !== 'move')
    return event.type === 'screen'
      ? '仅挡住下一次有效搬运，任何物品都算。'
      : '没有发生搬运，不会刷新任何物品的记忆。';
  return [
    ...event.observers.map((c) => `${names[c]}看到了`),
    ...event.missed.map(
      (m) => `${names[m.character]}${m.reason === 'away' ? '在倒茶' : '被屏风挡住'}，没看到`,
    ),
  ].join('；');
}
export class GameView {
  constructor() {
    this.themeId = null;
    $('move').querySelector('.action-icon').innerHTML = giftArt();
    $('tea').querySelector('.action-icon').innerHTML = teaArt();
    $('screen').querySelector('.action-icon').innerHTML = screenArt();
    $('undo').querySelector('span').innerHTML = icon('undo');
    $('timeline').querySelector('span').innerHTML = icon('replay');
    $('objective').querySelector('.goal-flag').innerHTML = icon('flag');
    $('pause').innerHTML = icon('pause');
    $('fullscreen').innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  }
  render(game, state = game.state) {
    const level = game.level;
    if (this.themeId !== level.theme) {
      $('room-art').innerHTML = roomArt(game.catalog.themes.get(level.theme));
      this.themeId = level.theme;
    }
    $('game').dataset.ready = 'true';
    $('game').dataset.level = level.id;
    $('game').dataset.steps = state.steps;
    document.body.dataset.phase = game.phase;
    $('level-title').textContent = level.title;
    $('level-menu').textContent =
      `${String(game.index + 1).padStart(2, '0')} / ${String(game.catalog.levels.length).padStart(2, '0')}`;
    $('goal-summary').textContent = level.objective;
    $('steps').textContent = `${state.steps} 步安排 · 随时撤销`;
    $('item-picker').innerHTML =
      level.items.length > 1
        ? level.items
            .map(
              (i) =>
                `<button data-select-item="${i}" aria-pressed="${game.selected === i}">${names[i]}</button>`,
            )
            .join('')
        : '';
    for (const box of Object.keys(boxes)) {
      const target = $('box-' + box);
      target.innerHTML = boxArt(box, {
        active: state.locations[game.selected] === box,
        ghost: state.locations[game.selected] === box,
      });
      target.dataset.label = boxes[box];
      target.setAttribute('aria-label', `把${names[game.selected]}搬到${boxes[box]}`);
    }
    $('item-layer').innerHTML = level.items
      .map((i) => {
        const together = level.items.length > 1 && state.locations.gift === state.locations.key;
        const x = boxX[state.locations[i]] + (together ? (i === 'key' ? 5 : -4) : 0);
        return `<button class="item-token ${game.selected === i ? 'selected' : ''}" data-drag="${i}" data-item="${i}" id="item-${i}" style="left:${x}%" aria-label="选择或拖动${names[i]}，实际在${boxes[state.locations[i]]}">${itemArt(i)}</button>`;
      })
      .join('');
    $('truth').innerHTML =
      `<span>${level.items.map((i) => `${names[i]}实际在${boxes[state.locations[i]]}`).join(' · ')}</span>`;
    for (const c of ['blue', 'orange']) {
      const actor = state.characters[c];
      const memory = $('memory-' + c);
      memory.innerHTML =
        level.items.length === 1
          ? `<span class="memory-art">${boxArt(actor.beliefs.gift)}</span>${names[c]}记得：<strong class="${actor.beliefs.gift}-word">${boxes[actor.beliefs.gift]}</strong><small>最后目击 · ${actor.lastSeen.gift.step === 0 ? '开场前' : `第 ${actor.lastSeen.gift.step} 步`}</small>`
          : `<b>${names[c]}记得</b>${level.items.map((i) => `<span class="dual-memory">${itemArt(i)}<strong class="${actor.beliefs[i]}-word">${boxes[actor.beliefs[i]]}</strong></span>`).join('')}<small>点气泡看目击记录</small>`;
      const character = $('character-' + c);
      character.innerHTML = characterArt(c);
      character.classList.toggle('away', !actor.present);
      character.dataset.status = actor.present
        ? game.mode === 'screen'
          ? '点我遮挡'
          : level.rules.canLeave.includes(c)
            ? '点我倒茶'
            : '留在房间'
        : '点我回来';
      character.setAttribute(
        'aria-label',
        `${actor.present ? '请' : '叫'}${names[c]}${actor.present ? '去倒茶' : '回来'}`,
      );
      character.style.transform = '';
    }
    $('screen-prop').innerHTML = screenArt({ active: state.screenTarget !== null });
    $('screen-prop').dataset.target = state.screenTarget || '';
    $('screen-prop').dataset.label = state.screenTarget
      ? `挡住${names[state.screenTarget]}`
      : `屏风 × ${state.screensRemaining}`;
    $('screen-prop').disabled = state.screenTarget !== null || state.screensRemaining === 0;
    $('screen').disabled = $('screen-prop').disabled;
    $('screen-count').textContent = state.screenTarget
      ? '已摆好 · 下一次生效'
      : `剩余 ${state.screensRemaining} 次`;
    $('screen').setAttribute('aria-pressed', String(game.mode === 'screen'));
    $('tea').setAttribute('aria-pressed', String(game.mode === 'tea'));
    $('tea').disabled = level.rules.canLeave.length === 0;
    $('move').querySelector('b').textContent = `搬${names[game.selected]}`;
    $('move').querySelector('.action-icon').innerHTML = itemArt(game.selected);
    $('undo').disabled = game.history.length <= 1 || game.phase !== 'playing';
    $('reveal').disabled = game.phase !== 'playing';
    $('sound').innerHTML = icon(game.progress.sound ? 'sound' : 'muted');
    $('sound').setAttribute('aria-label', game.progress.sound ? '关闭声音' : '开启声音');
    $('celebration').innerHTML = '';
  }
  feedback(text, persistent = false) {
    clearTimeout(this.feedbackTimer);
    $('scene-feedback').textContent = text;
    $('scene-feedback').classList.add('visible');
    if (!persistent)
      this.feedbackTimer = setTimeout(() => $('scene-feedback').classList.remove('visible'), 3600);
  }
  celebrate() {
    $('celebration').innerHTML = Array.from(
      { length: 36 },
      (_, i) =>
        `<i style="--x:${(i * 37) % 100}%;--delay:${(i % 6) * 0.1}s;--color:${['#e17c70', '#f1cd60', '#8daccc', '#afbb76'][i % 4]}"></i>`,
    ).join('');
  }
  checks(level, state) {
    return `<ul class="check-list">${evaluateGoals(level, state)
      .checks.map(
        (c) =>
          `<li class="${c.pass ? 'pass' : 'fail'}">${c.pass ? '✓' : '○'} ${escape(c.label)}${!c.pass && typeof c.actual === 'string' ? `（目前：${boxes[c.actual]}）` : ''}</li>`,
      )
      .join('')}</ul>`;
  }
}
