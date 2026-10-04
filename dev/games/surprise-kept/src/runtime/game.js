import { createState, applyAction, evaluateGoals } from '../core/engine.js';
import { parseChapter } from '../content/loader.js';
import {
  GameView,
  $,
  names,
  boxes,
  escape,
  itemArt,
  eventText,
  witnessesText,
} from '../render/view.js';
import { characterArt } from '../render/art.js';
import { readProgress, saveProgress } from '../platform/storage.js';
import { GameAudio } from '../platform/audio.js';
import { bindPointers } from '../input/pointers.js';

export class SurpriseGame {
  constructor(catalog) {
    this.catalog = catalog;
    this.progress = readProgress();
    this.view = new GameView();
    this.audio = new GameAudio(this.progress.sound);
    this.mode = 'move';
    this.phase = 'playing';
    this.epoch = 0;
    this.hintIndex = 0;
    this.cancelGesture = bindPointers(this);
    this.bind();
    const requested = new URLSearchParams(location.search).get('level');
    let index = requested
      ? catalog.levels.findIndex((l) => l.id === requested)
      : catalog.levels.findIndex((l) => l.id === this.progress.lastLevel);
    if (requested && /^\d+$/.test(requested)) index = Number(requested) - 1;
    if (index < 0 || index >= catalog.levels.length) index = 0;
    const saved = this.progress.run;
    this.openLevel(index, false);
    if (!requested && saved?.levelId === this.level.id) {
      try {
        for (const action of saved.actions) {
          const result = applyAction(this.level, this.state, action);
          if (!result.ok) throw Error();
          this.history.push(result.state);
          this.actions.push(action);
          this.state = result.state;
        }
        this.view.render(this);
        if (this.actions.length) this.view.feedback('接着上次的安排，惊喜还在等你。');
      } catch {
        this.openLevel(index, false);
        this.view.feedback('上次的记录无法恢复，已重新布置本关。');
      }
    }
    this.persist();
  }
  get level() {
    return this.catalog.levels[this.index];
  }
  openLevel(index, persist = true) {
    this.stopPlayback();
    this.closeModal();
    this.index = index;
    this.state = createState(this.level);
    this.history = [this.state];
    this.actions = [];
    this.selected = this.level.items[0];
    this.mode = 'move';
    this.phase = 'playing';
    this.hintIndex = 0;
    this.view.render(this);
    this.view.feedback(
      this.index === 0 ? '试着把礼物拖到蓝箱，也可以直接点蓝箱。' : this.level.objective,
    );
    if (persist) this.persist();
  }
  persist() {
    this.progress.lastLevel = this.level.id;
    this.progress.run = { levelId: this.level.id, actions: this.actions };
    const ok = saveProgress(this.progress);
    if (!ok && !this.storageWarning) {
      this.storageWarning = true;
      this.view.feedback('当前浏览器无法保存进度，仍可继续游玩。');
    }
  }
  bind() {
    $('game').addEventListener('click', (e) => {
      this.audio.unlock();
      const button = e.target.closest('button');
      if (!button || button.disabled) return;
      if (button.id === 'pause') {
        this.pause();
        return;
      }
      if (button.id === 'sound') {
        this.progress.sound = !this.progress.sound;
        this.audio.enabled = this.progress.sound;
        this.audio.unlock();
        this.view.render(this);
        this.persist();
        return;
      }
      if (button.id === 'fullscreen') {
        this.fullscreen();
        return;
      }
      if (button.id === 'level-menu') {
        this.levelMenu();
        return;
      }
      if (this.phase !== 'playing') return;
      if (button.dataset.selectItem || button.dataset.item) {
        this.selected = button.dataset.selectItem || button.dataset.item;
        this.mode = 'move';
        this.view.render(this);
        this.view.feedback(`已选${names[this.selected]}，点另一个箱子搬过去。`);
        return;
      }
      if (button.dataset.box) {
        this.act({ type: 'move', item: this.selected, to: button.dataset.box });
        return;
      }
      if (button.dataset.character) {
        const character = button.dataset.character;
        this.act(
          this.mode === 'screen'
            ? { type: 'screen', character }
            : { type: this.state.characters[character].present ? 'leave' : 'return', character },
        );
        return;
      }
      const commands = {
        move: () => {
          this.mode = 'move';
          this.view.render(this);
          this.view.feedback(`拖动${names[this.selected]}，或直接点目的箱。`);
        },
        tea: () => {
          this.mode = 'tea';
          this.view.render(this);
          this.view.feedback('点一位伙伴请他倒茶；再点他就能叫回来。');
        },
        screen: () => this.chooseScreen(),
        'screen-prop': () => this.chooseScreen(),
        'tea-zone': () => this.teaZone(),
        undo: () => this.undo(),
        timeline: () => this.timeline(),
        hint: () => this.hint(),
        reveal: () => this.reveal(),
        objective: () => this.objectives(),
        'memory-blue': () => this.memory('blue'),
        'memory-orange': () => this.memory('orange'),
      };
      commands[button.id]?.();
    });
    $('modal-close').onclick = () => this.closeModal();
    $('modal').addEventListener('cancel', (e) => {
      e.preventDefault();
      this.closeModal();
    });
    $('modal-body').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.audio.unlock();
      if (b.dataset.level !== undefined) {
        this.openLevel(Number(b.dataset.level));
        return;
      }
      const action = b.dataset.action;
      if (action === 'close') this.closeModal();
      if (action === 'restart') this.openLevel(this.index);
      if (action === 'levels') this.levelMenu();
      if (action === 'replay') {
        this.closeModal();
        void this.replay();
      }
      if (action === 'hint-more') {
        this.hintIndex = Math.min(this.hintIndex + 1, this.level.hints.length - 1);
        this.hint();
      }
      if (action === 'next') this.openLevel(this.index + 1);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
        this.audio.suspend();
      }
    });
    window.addEventListener('pagehide', () => {
      this.cancelGesture();
      this.stopPlayback();
      this.persist();
      this.audio.suspend();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('modal').open) {
        e.preventDefault();
        this.pause();
      }
    });
  }
  chooseScreen() {
    this.mode = this.mode === 'screen' ? 'move' : 'screen';
    this.view.render(this);
    this.view.feedback(
      this.mode === 'screen'
        ? '点要挡住的伙伴，也可以把屏风直接拖到他面前。'
        : '已收起选择，继续安排。',
    );
  }
  teaZone() {
    const away = ['blue', 'orange'].filter((c) => !this.state.characters[c].present);
    if (away.length === 1) this.act({ type: 'return', character: away[0] });
    else {
      this.mode = 'tea';
      this.view.render(this);
      this.view.feedback('点伙伴，请他离开或叫他回来。');
    }
  }
  act(action) {
    if (this.phase !== 'playing' || $('modal').open) return false;
    this.audio.unlock();
    const result = applyAction(this.level, this.state, action);
    if (!result.ok) {
      this.audio.play('miss');
      this.view.feedback(result.message);
      return false;
    }
    this.state = result.state;
    this.history.push(this.state);
    this.actions.push({ ...action });
    this.mode = 'move';
    if (action.item) this.selected = action.item;
    this.view.render(this);
    this.audio.play(action.type);
    this.persist();
    this.view.feedback(
      eventText(result.event) + '。' + (action.type === 'move' ? witnessesText(result.event) : ''),
    );
    for (const c of result.event.observers) {
      const el = $('memory-' + c);
      el.classList.remove('seen');
      void el.offsetWidth;
      el.classList.add('seen');
    }
    return true;
  }
  undo() {
    if (this.history.length <= 1) return;
    this.history.pop();
    this.actions.pop();
    this.state = this.history.at(-1);
    this.mode = 'move';
    this.view.render(this);
    this.audio.play('undo');
    this.persist();
    this.view.feedback('已撤销：位置、记忆和屏风一起恢复。');
  }
  modal(title, html) {
    this.cancelGesture();
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = html;
    if (!$('modal').open) $('modal').showModal();
  }
  closeModal() {
    if ($('modal').open) $('modal').close();
    if (['paused', 'success', 'failure'].includes(this.phase)) {
      this.phase = 'playing';
      this.view.render(this);
    }
  }
  pause() {
    if (this.index === undefined) return;
    this.stopPlayback();
    this.phase = 'paused';
    this.view.render(this);
    this.modal(
      '惊喜先等一等',
      `<p>没有倒计时，慢慢安排就好。</p><button class="primary" data-action="close" id="resume">继续安排</button><button class="secondary" data-action="restart">重新开始本关</button><button class="secondary" data-action="levels">返回选关</button>`,
    );
  }
  async fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen)
        await document.documentElement.requestFullscreen();
      else this.view.feedback('此浏览器不支持全屏，可用浏览器菜单添加到主屏幕。');
    } catch {
      this.view.feedback('浏览器暂未允许全屏，当前画面可继续游玩。');
    }
  }
  objectives() {
    this.modal(
      '这一关的小心愿',
      `<p>${escape(this.level.intro)}</p>${this.view.checks(this.level, this.state)}<p>人物只会记住自己看见的搬运。回来、查看气泡都不会刷新记忆。</p><button class="primary" data-action="close">明白了，继续安排</button>`,
    );
  }
  hint() {
    this.modal(
      '一点点目击线索',
      `<span class="step-badge">线索 ${this.hintIndex + 1} / ${this.level.hints.length} · 永远免费</span>${this.level.hints
        .slice(0, this.hintIndex + 1)
        .map((h) => `<p>${escape(h)}</p>`)
        .join(
          '',
        )}<button class="secondary" data-action="hint-more" ${this.hintIndex >= this.level.hints.length - 1 ? 'disabled' : ''}>再看一条线索</button><button class="primary" data-action="close">回房间试试</button>`,
    );
  }
  memory(c) {
    const actor = this.state.characters[c];
    this.modal(
      `${names[c]}的目击记录`,
      `${this.level.items
        .map((i) => {
          const seen = actor.lastSeen[i];
          return `<div class="memory-card"><strong>${names[i]}：记得在${boxes[actor.beliefs[i]]}</strong><p>${seen.step === 0 ? `开场前最后见过${names[i]}在${boxes[seen.to]}。` : `第 ${seen.step} 步，亲眼看到${names[i]}从${boxes[seen.from]}搬到${boxes[seen.to]}。`}</p></div>`;
        })
        .join(
          '',
        )}<p>${actor.present ? '现在在房间里。' : '现在正在倒茶，看不到搬运。'}${this.state.screenTarget === c ? '屏风会挡住下一次搬运。' : ''}</p><button class="primary" data-action="close">收好记录</button>`,
    );
  }
  timeline() {
    this.modal(
      '谁看见了哪一步',
      `<p>开场记录：${['blue', 'orange'].map((c) => `${names[c]}记得${this.level.items.map((i) => `${names[i]}在${boxes[this.level.initial.characters[c].beliefs[i]]}`).join('、')}`).join('；')}。</p>${this.state.events.length ? `<ol class="timeline-list">${this.state.events.map((ev) => `<li><b>${escape(eventText(ev))}</b><small>${escape(witnessesText(ev))}</small></li>`).join('')}</ol>` : '<p>还没开始搬运，一切都从这里出发。</p>'}<button class="primary" data-action="replay" ${this.state.events.length ? '' : 'disabled'}>播放这次安排</button><button class="secondary" data-action="close">继续安排</button>`,
    );
  }
  levelMenu() {
    this.stopPlayback();
    this.phase = 'playing';
    this.view.render(this);
    this.modal(
      '生日惊喜 · 选关',
      `<p>八幕小故事，慢慢学会看见「别人知道什么」。已完成 ${Object.keys(this.progress.completed).filter((id) => this.catalog.levels.some((l) => l.id === id)).length} / ${this.catalog.levels.length}</p><div class="level-grid">${this.catalog.levels.map((l, i) => `<button class="level-card ${this.progress.completed[l.id] ? 'done' : ''}" data-level="${i}"><strong>${String(i + 1).padStart(2, '0')}</strong><b>${escape(l.title)}</b><small>${this.progress.completed[l.id] ? `✓ 已完成 · 最好 ${this.progress.completed[l.id].steps} 步` : `${l.items.length === 2 ? '双物品' : '礼物篇'} · ${escape(this.catalog.themes.get(l.theme).name)}`}</small></button>`).join('')}</div><details class="import-label"><summary>导入自己的故事章节</summary><p>选择符合章节格式的 JSON，校验通过后加入本次目录。导入内容只保留在当前会话。</p><input id="chapter-file" type="file" accept=".json,application/json" aria-label="导入章节 JSON"/><p id="import-message" role="status"></p></details><button class="secondary" data-action="close">回到房间</button>`,
    );
    $('chapter-file').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const message = $('import-message');
      try {
        if (file.size > 2 * 1024 * 1024) throw Error('章节文件不能超过 2 MB。');
        const raw = JSON.parse(await file.text());
        const levels = parseChapter(
          raw,
          this.catalog.themes,
          new Set(this.catalog.levels.map((l) => l.id)),
        );
        this.catalog.levels.push(...levels);
        this.levelMenu();
        $('import-message').textContent = `已加入 ${levels.length} 关。`;
      } catch (error) {
        message.className = 'import-error';
        message.textContent = error.message;
      }
    };
  }
  stopPlayback() {
    this.epoch += 1;
    this.cancelGesture?.();
    if (this.phase === 'replaying' || this.phase === 'revealing') {
      this.phase = 'playing';
      this.view.render(this);
    }
  }
  async wait(ms, epoch) {
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches
      ? Math.min(ms, 100)
      : ms;
    await new Promise((resolve) => setTimeout(resolve, duration));
    return this.epoch === epoch;
  }
  async replay() {
    this.stopPlayback();
    const epoch = this.epoch;
    this.phase = 'replaying';
    const frames = [...this.history];
    for (let i = 0; i < frames.length; i++) {
      if (this.epoch !== epoch) return;
      this.view.render(this, frames[i]);
      this.view.feedback(
        i
          ? `第 ${i} 步 · ${eventText(frames[i].events.at(-1))}。${witnessesText(frames[i].events.at(-1))}`
          : '开场前：每个人带着自己的最后目击记录。',
        true,
      );
      if (!(await this.wait(i ? 1350 : 700, epoch))) return;
    }
    this.phase = 'playing';
    this.view.render(this);
    this.view.feedback('回放结束，已回到你刚才的安排。');
  }
  async reveal() {
    const result = evaluateGoals(this.level, this.state);
    if (!result.ready) {
      this.view.feedback('先把倒茶的伙伴叫回来，大家一起揭开惊喜。');
      return;
    }
    this.stopPlayback();
    const epoch = this.epoch;
    this.phase = 'revealing';
    this.mode = 'move';
    this.view.render(this);
    for (const item of this.level.items) {
      for (const visit of result.visits.filter((v) => v.item === item)) {
        const el = $('character-' + visit.character),
          destination = $('box-' + visit.to),
          scene = el.parentElement;
        const a = el.getBoundingClientRect(),
          b = destination.getBoundingClientRect();
        el.innerHTML = characterArt(visit.character, 'walking');
        el.dataset.status = `先去${boxes[visit.to]}`;
        // Relative translation scales with the scene; the two arrivals remain separately visible.
        const dx =
          b.left + b.width / 2 - (a.left + a.width / 2) + (visit.character === 'blue' ? -12 : 12);
        const dy = b.bottom + scene.clientHeight * 0.07 - a.bottom;
        el.style.transform = `translate(${dx}px,${dy}px) scale(.78)`;
        this.view.feedback(
          `${names[visit.character]}先去${boxes[visit.to]}找${names[item]}：他最后看到的就是这里。`,
          true,
        );
        this.audio.play('move');
        if (!(await this.wait(800, epoch))) return;
      }
      if (!(await this.wait(600, epoch))) return;
    }
    this.phase = result.success ? 'success' : 'failure';
    document.body.dataset.phase = this.phase;
    if (result.success) {
      const previous = this.progress.completed[this.level.id];
      if (!previous || previous.steps > this.state.steps)
        this.progress.completed[this.level.id] = { steps: this.state.steps };
      this.persist();
      this.audio.play('success');
      this.view.celebrate();
      for (const c of ['blue', 'orange']) $('character-' + c).innerHTML = characterArt(c, 'happy');
      if (!(await this.wait(700, epoch))) return;
    } else this.audio.play('miss');
    this.modal(
      result.success ? '惊喜，藏得刚刚好！' : '还差一点点',
      `<div class="result-art">${itemArt('gift')}</div><p class="result-lead">${result.success ? '生日快乐！大家都按你安排的记录出发了。' : '他们按自己的记忆出发了，看看哪条记录还要安排。'}</p>${this.view.checks(this.level, this.state)}<span class="step-badge">本次 ${this.state.steps} 步 · 参考 ${this.level.recommendedSteps ?? '—'} 步 · 不限制步数</span>${result.success && this.index < this.catalog.levels.length - 1 ? '<button id="next-level" class="primary" data-action="next">下一幕惊喜 →</button>' : ''}<button class="secondary" data-action="replay">回看谁看到了哪一步</button><div class="button-pair"><button class="secondary" data-action="close">回去调整</button><button class="secondary" data-action="levels">${this.index === this.catalog.levels.length - 1 && result.success ? '全章完成 · 返回选关' : '返回选关'}</button></div>`,
    );
  }
}
