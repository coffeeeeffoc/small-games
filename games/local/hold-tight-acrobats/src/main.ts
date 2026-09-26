import Phaser from 'phaser';
import type { MatterAPI } from './physics';
import { Physics } from './physics';
import { Simulation } from './simulation';
import { Render } from './render';
import { Input } from './input';
import { Sound } from './sound';
import { TEAM, C } from './config';
import { levels, playground } from './levels';
import './style.css';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const avatar = (i: number) => `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="23" fill="${TEAM[i].hex}"/><path d="M11 47 Q12 30 24 30 Q38 30 38 47" fill="#264a49"/><circle cx="24" cy="22" r="12" fill="#ffdfb7"/><path d="M12 17 Q23 4 36 17 L36 19 L12 19Z" fill="#264a49"/><path d="M11 17 H37" stroke="${TEAM[i].hex}" stroke-width="5"/><circle cx="20" cy="23" r="1.5"/><circle cx="28" cy="23" r="1.5"/><path d="M21 28 Q24 31 27 28" fill="none" stroke="#264a49" stroke-width="1.5"/></svg>`;
$('#app').innerHTML = `
  <header class="topbar"><button id="chapters" class="brand" aria-label="关卡菜单"><span class="brand-icon">⋈</span><span>抱紧了！<small>杂技探险队</small></span></button>
    <div class="chapter"><span id="chapter-index">01 / 05</span><strong id="chapter-title">先跳过去</strong><span class="dots" aria-hidden="true">● ○ ○ ○ ○</span></div>
    <nav><button id="sound" aria-label="静音" title="静音">♪</button><button id="fullscreen" aria-label="全屏" title="全屏">⛶</button><button id="help" aria-label="操作帮助" title="操作帮助">?</button><button id="pause" aria-label="暂停" title="暂停 / Esc">Ⅱ</button><button id="retry" aria-label="重新开始" title="重试 / R">↻</button></nav>
  </header>
  <main id="stage" aria-label="物理闯关游戏场景"></main>
  <div id="toast" role="status" aria-live="polite"></div>
  <div id="edge-indicators"></div>
  <aside id="debug" hidden></aside>
  <footer class="controls">
    <div class="roster" aria-label="选择队员">${TEAM.map((t, i) => `<button class="portrait" data-who="${i}" aria-label="选择${i + 1}号${t.name}">${avatar(i)}<span>${t.name}<small>${i + 1} · ${t.badge}</small></span><i></i></button>`).join('')}</div>
    <div class="movement"><small>地面移动</small><div><button id="left" aria-label="向左移动">←<kbd>A</kbd></button><button id="right" aria-label="向右移动">→<kbd>D</kbd></button></div></div>
    <div class="hands"><button id="release-left"><kbd>Q</kbd><span>左手 <b id="left-grip">空闲</b></span><em>松开</em></button><button id="release-right"><kbd>E</kbd><span>右手 <b id="right-grip">空闲</b></span><em>松开</em></button></div>
    <div class="action"><div class="action-heading"><strong id="action-name">蓄力跳跃</strong><span id="charge-percent">0%</span></div><div class="meter" role="progressbar" aria-label="蓄力" aria-valuemin="0" aria-valuemax="100"><i></i></div><small id="reason">脚下站稳，可以起跳</small><small id="direction">方向 ↗ · 按住一秒蓄满</small></div>
    <button id="power" aria-label="按住蓄力，向目标方向拖动，松开发力"><span id="power-label">按住发力</span><small>拖向目标 · 松开出发</small><kbd>SPACE</kbd></button>
  </footer>
  <div id="rotate-tip">横屏更好玩 ↻ · 操作按钮都在下方</div>
  <dialog id="dialog"><div id="dialog-content"></div></dialog>
`;

const sound = new Sound();
let unlocked = 1;
try { const saved = Number(localStorage.getItem('acro-unlocked')); if (Number.isInteger(saved)) unlocked = Math.max(1, Math.min(5, saved)); sound.muted = localStorage.getItem('acro-muted') === '1'; } catch { /* Local save is optional. */ }
let sim: Simulation, painter: Render, input: Input;
let panel: 'intro' | 'pause' | 'help' | 'chapters' | 'result' | null = 'intro';
let shownStatus = ''; let lastHud = 0;
const dialog = $<HTMLDialogElement>('#dialog');
function closePanel() { dialog.close(); panel = null; input.clear(); sim.pause(false); shownStatus = ''; }
function openPanel(type: typeof panel) {
  if (!sim) return;
  panel = type; sim.pause(true); input?.clear();
  const title = type === 'intro' ? '一起出发，<br/>一个都不能少。' : type === 'help' ? '借一点力，<br/>去更远的地方。' : type === 'chapters' ? '下一站，去哪里？' : type === 'result' ? sim.status === 'won' ? '抱紧的，是默契。' : '没关系，再来一次。' : '歇口气，再出发。';
  const subtitle = type === 'intro' ? '抱紧了！杂技探险队' : sim.level.subtitle;
  let content = `<div class="eyebrow">${subtitle}</div><h1>${title}</h1>`;
  if (type === 'intro') content += `<p>三位杂技演员，一场山谷探险。<br/>选中一人，蓄力、摆荡、松手。<br/>用彼此的双手，把整支队伍送到终点。</p><div class="intro-avatars">${TEAM.map((_, i) => avatar(i)).join('')}</div><button class="primary" id="start">开始探险 <span>↗</span></button><button class="secondary" id="practice">先去物理试验场</button><small class="dialog-foot">单人游戏 · 键盘 / 鼠标 / 触屏 · 共五站</small>`;
  if (type === 'pause') content += `<p>${sim.level.tip}</p><button class="primary" id="resume">继续探险</button><div class="dialog-row"><button id="menu-help">操作说明</button><button id="menu-chapters">选择关卡</button><button id="restart-full">从头重来</button></div>`;
  if (type === 'help') content += `<div class="help-grid"><p><b>① 选中一人</b>点击人物、头像或按 1 / 2 / 3；Tab 切换。</p><p><b>② 按住，松开发力</b>空格蓄力；A / D 定左右。鼠标或触屏从发力按钮拖向目标，力度只取决于时间。</p><p><b>③ 自动抓牢，单手松开</b>金色抓点、队友空闲手都能抓。Q 松左手，E 松右手。抓握会一直保持。</p><p><b>④ 三个人都要到</b>脚站稳才能跳；连着吊环才能摆。完全腾空没有二段跳。R 重试，Esc 暂停。</p></div><p class="hint">本关路线：${sim.level.hint}</p><button class="primary" id="resume">知道了，出发</button>`;
  if (type === 'chapters') content += `<div class="level-list">${levels.map((l, i) => `<button data-level="${i}" ${i >= unlocked ? 'disabled' : ''}><span>0${l.id}</span><strong>${l.title}</strong><em>${i >= unlocked ? '未解锁' : '出发 ↗'}</em></button>`).join('')}</div><div class="dialog-row"><button id="practice">物理试验场</button><button id="resume">返回游戏</button></div>`;
  if (type === 'result') {
    const won = sim.status === 'won';
    content += `<p>${won ? '全员安全落地，三人的旅途一起完成。' : sim.message}<br/>${sim.checkpoint ? '重试将从已点亮的营地出发。' : won ? `完成了 ${sim.actions.length} 次跳跃与摆荡。` : '重试即可立即回到出发点。'}</p>`;
    if (won && sim.level.id > 0 && sim.level.id < 5) content += `<button class="primary" id="next">下一站 · ${levels[sim.level.id].title} ↗</button>`;
    else if (won) content += `<button class="primary" id="menu-chapters">${sim.level.id === 5 ? '五站完成 · 回看旅途' : '开始正式探险'}</button>`;
    else content += `<button class="primary" id="restart">再试一次 ↻</button>`;
    content += `<div class="dialog-row"><button id="restart-full">重新挑战本关</button><button id="menu-help">查看路线提示</button></div>`;
  }
  $('#dialog-content').innerHTML = content;
  if (!dialog.open) dialog.showModal();
  $('#start')?.addEventListener('click', () => { sound.unlock(); closePanel(); });
  $('#resume')?.addEventListener('click', closePanel);
  $('#practice')?.addEventListener('click', () => load(0));
  $('#restart')?.addEventListener('click', () => { sim.reset(); closePanel(); });
  $('#restart-full')?.addEventListener('click', () => { sim.reset(true); closePanel(); });
  $('#next')?.addEventListener('click', () => load(sim.level.id + 1));
  $('#menu-help')?.addEventListener('click', () => openPanel('help'));
  $('#menu-chapters')?.addEventListener('click', () => openPanel('chapters'));
  document.querySelectorAll<HTMLButtonElement>('[data-level]').forEach(b => b.addEventListener('click', () => load(Number(b.dataset.level) + 1)));
}
function load(id: number) { sound.unlock(); sim.load(id === 0 ? playground : levels[id - 1]); closePanel(); painter.camera(0, true); hud(); }
function togglePause() { if (panel) { if (panel !== 'intro' && panel !== 'result') closePanel(); } else openPanel('pause'); }
function hud() {
  if (!sim) return;
  const c = sim.actors[sim.selected], q = sim.qualification(c.id), progress = Math.round(sim.power * 100);
  $('#chapter-index').textContent = sim.level.id ? `0${sim.level.id} / 05` : '练习场';
  $('#chapter-title').textContent = sim.level.title;
  $('.dots').textContent = levels.map(l => l.id <= sim.level.id ? '●' : '○').join(' ');
  document.querySelectorAll<HTMLButtonElement>('.portrait').forEach((b, i) => { b.classList.toggle('selected', i === sim.selected); b.classList.toggle('safe', sim.safe(sim.actors[i], sim.level.goal)); b.setAttribute('aria-pressed', String(i === sim.selected)); });
  $('#left-grip').textContent = sim.grips.label(c.hands[0]); $('#right-grip').textContent = sim.grips.label(c.hands[1]);
  $('#release-left').classList.toggle('holding', !!c.hands[0].grip); $('#release-right').classList.toggle('holding', !!c.hands[1].grip);
  $('#action-name').textContent = `${TEAM[c.id].name} · ${q.action === 'jump' ? '蓄力跳跃' : q.action === 'swing' ? '蓄力摆动' : '等待支撑'}`;
  $('#charge-percent').textContent = `${progress}%`; $('.meter i').style.width = `${progress}%`; $('.meter').setAttribute('aria-valuenow', String(progress));
  $('#reason').textContent = q.reason;
  $('#direction').textContent = `方向 ${sim.aim.x < -0.2 ? '↖' : sim.aim.x > 0.2 ? '↗' : '↑'} · ${sim.charge ? '松开按钮发力' : '按住一秒蓄满'}`;
  $('#power').classList.toggle('charging', !!sim.charge); $('#power').classList.toggle('unavailable', !q.action);
  $('#power-label').textContent = sim.charge ? `${progress}% · 松开发力` : q.action ? '按住发力' : '空中无支点';
  $('#toast').textContent = sim.time < sim.messageUntil ? sim.message : sim.level.tip;
  $('#sound').textContent = sound.muted ? '♫̸' : '♪'; $('#sound').setAttribute('aria-label', sound.muted ? '开启声音' : '静音');
  const debug = $('#debug'); debug.hidden = !painter.debug;
  if (painter.debug) debug.textContent = `120 Hz · bodies ${sim.p.counts().bodies} · constraints ${sim.p.counts().constraints}\n支点 ${sim.grips.graph(c.id).anchors.map(a => a.id).join(', ') || '无'} · 蓄力 ${progress}%\n物理异常 ${sim.numericalErrors}`;
  const cam = painter.scene.cameras.main;
  $('#edge-indicators').textContent = sim.actors.filter(c => !cam.worldView.contains(c.body.position.x, c.body.position.y)).map(c => `${c.body.position.x < cam.worldView.centerX ? '←' : '→'} ${c.id + 1}号在画面外`).join('　');
}

class GameScene extends Phaser.Scene {
  constructor() { super('expedition'); }
  create() {
    this.matter.world.autoUpdate = false;
    sim = new Simulation(new Physics((Phaser.Physics.Matter as unknown as { Matter: MatterAPI }).Matter, this.matter.world.engine), levels[0]);
    sim.onSound = kind => sound.play(kind);
    painter = new Render(this, sim);
    input = new Input(sim, () => sound.unlock(), forced => { if (!panel && sim.status === 'playing') openPanel('pause'); else if (!forced && (panel === 'pause' || panel === 'help')) closePanel(); }, () => { painter.debug = !painter.debug; }, () => { sim.reset(); if (panel) closePanel(); });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (panel || sim.status !== 'playing') return; sound.unlock();
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const c = [...sim.actors].sort((a, b) => Phaser.Math.Distance.BetweenPoints(a.body.position, world) - Phaser.Math.Distance.BetweenPoints(b.body.position, world))[0];
      if (Phaser.Math.Distance.BetweenPoints(c.body.position, world) < 55) sim.select(c.id);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!sim.charge || sim.charge.source !== 'keyboard') return;
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y), body = sim.actors[sim.selected].body.position;
      sim.setAim({ x: world.x - body.x, y: world.y - body.y });
    });
    document.querySelectorAll<HTMLButtonElement>('.portrait').forEach((b, i) => b.addEventListener('click', () => { sound.unlock(); sim.select(i); hud(); }));
    $('#release-left').addEventListener('click', () => sim.releaseHand(0)); $('#release-right').addEventListener('click', () => sim.releaseHand(1));
    $('#pause').addEventListener('click', togglePause); $('#help').addEventListener('click', () => openPanel('help')); $('#chapters').addEventListener('click', () => openPanel('chapters'));
    $('#retry').addEventListener('click', () => { input.clear(); sim.reset(); if (panel) closePanel(); });
    $('#sound').addEventListener('click', () => { sound.unlock(); sound.muted = !sound.muted; try { localStorage.setItem('acro-muted', sound.muted ? '1' : '0'); } catch {} hud(); });
    $('#fullscreen').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { sim.tell('当前浏览器暂不支持全屏'); } });
    dialog.addEventListener('cancel', e => { e.preventDefault(); if (panel !== 'intro' && panel !== 'result') closePanel(); });
    Object.defineProperty(window, '__acroSnapshot', { configurable: true, get: () => ({ ...sim.snapshot(), panel, view: { x: this.cameras.main.worldView.x, y: this.cameras.main.worldView.y, zoom: this.cameras.main.zoom, width: this.scale.width, height: this.scale.height } }) });
    if (import.meta.env.DEV) Object.defineProperty(window, '__acroDev', { configurable: true, value: { load, sim, painter } });
    painter.camera(0, true); openPanel('intro'); hud();
  }
  update(_time: number, delta: number) {
    if (!sim) return;
    const grounded = sim.actors.map(c => c.groundedMs >= C.supportMs);
    sim.advance(delta);
    sim.actors.forEach((c, i) => { if (!grounded[i] && c.groundedMs >= C.supportMs && sim.time > 500) sound.play('land'); });
    painter.draw(delta);
    if (sim.status !== 'playing' && shownStatus !== sim.status) {
      shownStatus = sim.status;
      if (sim.status === 'won' && sim.level.id) { unlocked = Math.max(unlocked, Math.min(5, sim.level.id + 1)); try { localStorage.setItem('acro-unlocked', String(unlocked)); } catch {} }
      openPanel('result');
    }
    if (_time - lastHud > 65) { lastHud = _time; hud(); }
  }
}
const game = new Phaser.Game({ type: Phaser.AUTO, parent: 'stage', backgroundColor: '#e9f3e2', antialias: true,
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  physics: { default: 'matter', matter: { gravity: { x: 0, y: C.gravity }, autoUpdate: false, enableSleeping: false } },
  scene: GameScene, audio: { noAudio: true }, render: { pixelArt: false }, input: { activePointers: 4 }, fps: { smoothStep: false } });
new ResizeObserver(([entry]) => { const {width,height}=entry.contentRect; if(width>0&&height>0)game.scale.resize(width,height); }).observe($('#stage'));
