import './client.js';
import styles from './h5.css?inline';
import { scoreText, gapText, playerName } from './format.js';
import { mountStreetCompetition } from './street-pages.js';

const titles = {
  'cops-robbers': '围捕小队',
  'cops-robbers-realtime': '街区追捕',
  'letters-words2': '词屿 · 字母叠叠乐',
  'vibeJam-myself-history-guess': '此时·此地',
  'xiangqi-five': '象五子棋',
};
// Xiangqi shares the service protocol, but uses the game's mobile page navigation.
const xiangqiCompetitionStyles = `
body.competition-active { background:#fff8e8; overflow:hidden; }
body.competition-active [data-screen], body.competition-active > .page, body.competition-active > .app-shell { display:none!important; }
body.competition-active #mode-online { position:static; }
[data-xiangqi-competition][hidden] { display:none!important; }
[data-xiangqi-competition].competition-dialog {
  --pk-ink:#573626; --pk-muted:#94785d; --pk-line:#ddc8a9; --pk-accent:#ef795f;
  position:relative; inset:auto; width:100%; max-width:600px; height:100dvh;
  margin:0 auto; border:0; border-radius:0; background:#fff8e8; box-shadow:none;
  font-family:'PingFang SC','Microsoft YaHei',sans-serif;
}
[data-xiangqi-competition] .pk-shell { padding: max(14px,env(safe-area-inset-top)) 18px max(14px,env(safe-area-inset-bottom)); }
[data-xiangqi-competition] .pk-header { border:0; padding-bottom:8px; }
[data-xiangqi-competition] .pk-back { padding:0; width:44px; min-width:44px; border:0; background:transparent; font-size:28px; }
[data-xiangqi-competition] .pk-brand { justify-content:center; }
[data-xiangqi-competition] .pk-brand strong { font-size:23px; font-weight:900; }
[data-xiangqi-competition] .pk-brand-mark,
[data-xiangqi-competition] .pk-brand small,
[data-xiangqi-competition] .pk-profile-copy small,
[data-xiangqi-competition] .pk-room-note,
[data-xiangqi-competition] .pk-footer p,
[data-xiangqi-competition] .pk-hero .pk-eyebrow,
[data-xiangqi-competition] .pk-hero p { display:none; }
[data-xiangqi-competition] .pk-status { font-size:12px; justify-content:center; min-height:20px; margin:3px 0 12px!important; }
[data-xiangqi-competition] .pk-hero { padding:10px 0 18px; background:none; border:0; }
[data-xiangqi-competition] .pk-hero h2 { font-size:27px; font-weight:900; }
[data-xiangqi-competition] .pk-profile { padding:12px 14px; border:2px solid #d6c29e; border-radius:20px; background:#edf3dc; margin-bottom:18px; }
[data-xiangqi-competition] .pk-avatar { background:#b8d0a9; color:#365f45; border:2px solid #668360; box-shadow:0 3px 0 #7fa578; }
[data-xiangqi-competition] .pk-options { grid-template-columns:1fr; gap:16px; }
[data-xiangqi-competition] .pk-option { padding:18px; border:2px solid #d6b38c; border-radius:24px; background:#fff0da; box-shadow:0 4px 0 #ead5b8; }
[data-xiangqi-competition] .pk-option h3 { font-size:20px; font-weight:900; }
[data-xiangqi-competition] .pk-option p { margin:5px 0 14px!important; font-size:13px; }
[data-xiangqi-competition] button { border:2px solid #ba9b77; border-radius:16px; background:#fff5df; min-height:48px; font-size:15px; font-weight:800; box-shadow:0 3px 0 #dfc7a9; }
[data-xiangqi-competition] button:active { transform:translateY(2px); }
[data-xiangqi-competition] button.pk-primary { border-color:#b25843; background:#ef795f; color:#fffaf0; box-shadow:0 4px 0 #be5c42; }
[data-xiangqi-competition] button.pk-quiet { border-color:transparent; background:transparent; box-shadow:none; padding:8px; min-height:44px; }
[data-xiangqi-competition] input { min-width:0; border:2px solid #d6b38c; border-radius:14px; background:#fffcf2; color:#573626; min-height:48px; }
[data-xiangqi-competition] .pk-join { gap:10px; }
[data-xiangqi-competition] .pk-footer { border:0; padding-top:18px; justify-content:center; }
[data-xiangqi-competition] .pk-footer button { width:100%; background:#dce9cb; }
[data-xiangqi-competition] .pk-room-code { background:#fff0d5; border:2px dashed #d3ad78; color:#715137; border-radius:15px; }
[data-xiangqi-competition] .pk-room-intro { padding:14px 0; }
[data-xiangqi-competition] .pk-player { border-radius:20px; border:2px solid #d6c29e; background:#f0f4df; }
[data-xiangqi-competition] .pk-room-actions { gap:12px; flex-wrap:wrap; }
[data-xiangqi-competition] .pk-room-actions > button { flex:1; min-width:120px; }
[data-xiangqi-competition][data-playing] .pk-shell { padding: max(8px,env(safe-area-inset-top)) 10px max(6px,env(safe-area-inset-bottom)); }
[data-xiangqi-competition][data-playing] .pk-header { min-height:44px; padding:0; }
[data-xiangqi-competition][data-playing] .pk-brand strong { font-size:18px; }
[data-xiangqi-competition][data-playing] .pk-status { display:none; }
[data-xiangqi-competition] canvas[data-play] { background:#fff8e8; border-radius:0; }
[data-xiangqi-competition]:has([data-details]:not([hidden])) .pk-shell { display:none; }
[data-xiangqi-competition] .pk-detail-page {
  position:static; inset:auto; display:block; height:100%; background:#fff8e8;
  backdrop-filter:none; padding:max(20px,env(safe-area-inset-top)) 18px max(20px,env(safe-area-inset-bottom));
}
[data-xiangqi-competition] .pk-sheet { height:100%; max-width:none; border:0; border-radius:0; background:transparent; box-shadow:none; padding:0; display:flex; flex-direction:column; }
[data-xiangqi-competition] .pk-sheet-head { flex:none; }
[data-xiangqi-competition] .pk-sheet-head h2 { font-size:26px; font-weight:900; }
[data-xiangqi-competition] .pk-sheet-content { flex:1; overflow:auto; padding:2px 0 14px; }
[data-xiangqi-competition] .pk-sheet-actions { flex:none; padding-top:14px; }
[data-xiangqi-competition] .pk-sheet-actions button { width:100%; background:#dce9cb; }
[data-xiangqi-competition] .pk-result { border:2px solid #d6c29e; border-radius:22px; background:#edf3dc; }
@media (orientation:landscape) and (max-height:500px) {
  [data-xiangqi-competition].competition-dialog { max-width:none; }
  [data-xiangqi-competition] .pk-options { grid-template-columns:1fr 1fr; }
  [data-xiangqi-competition] .pk-shell { padding:8px 18px; }
  [data-xiangqi-competition][data-playing] .pk-header { min-height:44px; }
}
`;
export function mountCompetition(game, createRenderer) {
  if (game === 'cops-robbers-realtime') return mountStreetCompetition(game, createRenderer);
  const street = game === 'cops-robbers-realtime';
  const xiangqi = game === 'xiangqi-five';
  const roleNames = street
    ? { pursuer: '警察', runner: '小偷' }
    : { pursuer: '追逐队', runner: '突围队' };
  if (document.querySelector('[data-competition-launch]')) return;
  globalThis.__installCompetition();
  const client = globalThis.__competition,
    renderer = createRenderer({
      createImage: () => new Image(),
      assetBase: new URL('./', location.href).href,
    });
  const modeEntry = xiangqi && document.getElementById('mode-online');
  const launch = modeEntry || document.createElement('button');
  if (!modeEntry) launch.textContent = '好友 PK · 全站榜';
  if (modeEntry) modeEntry.hidden = false;
  launch.dataset.competitionLaunch = '';
  const style = document.createElement('style');
  style.textContent = xiangqi
    ? styles.replaceAll(
        '[data-competition-launch]',
        '[data-competition-launch]:not(#mode-online)',
      ) + xiangqiCompetitionStyles
    : styles;
  document.head.append(style);
  const dialog = document.createElement(xiangqi ? 'section' : 'dialog');
  dialog.className = 'competition-dialog';
  if (xiangqi) {
    dialog.dataset.xiangqiCompetition = '';
    dialog.hidden = true;
  }
  dialog.setAttribute('aria-label', `${titles[game]} · 好友对决`);
  dialog.innerHTML = `<div class="pk-shell">
    <header class="pk-header"><div class="pk-brand"><span class="pk-brand-mark" aria-hidden="true">PK</span><div><strong>${titles[game]}</strong><small>好友对决 · 同场较量</small></div></div>
      <nav class="pk-tools" aria-label="游玩工具"><button class="pk-quiet" data-rules>玩法</button></nav></header>
    <p class="pk-status" role="status" data-status>同一规则，和好友认真比一局。</p>
    <main class="pk-content">
      <section data-lobby><div class="pk-hero"><span class="pk-eyebrow">一起玩，更有意思</span><h2>叫上好友，比一局。</h2><p>同样的起点，各自的本事。邀请一位好友，完成挑战，看看谁更胜一筹。</p></div>
        <div class="pk-profile"><span class="pk-avatar" data-avatar aria-hidden="true">你</span><div class="pk-profile-copy"><strong data-profile-name>正在读取昵称…</strong><small>你的名字会出现在房间和排行榜中</small></div><button class="pk-quiet" data-profile>修改昵称</button></div>
        <div class="pk-options"><section class="pk-option"><h3>我来开一局</h3><p>创建房间，把邀请发给好友。双方准备后开始。</p><div class="pk-match-options" data-match-options hidden><label>对战模式<select data-match-mode></select></label><label>我的角色<select data-match-role><option value="pursuer">追逐队</option><option value="runner">突围队</option></select></label><label>开局顺序<select data-match-initiative><option value="random">系统分配先手</option><option value="pursuer">追逐队先手</option><option value="runner">突围队先手</option></select></label><small>双方独立操控不同队伍，胜负取决于操作。地图从本模式 100 关中抽取。</small></div><button class="pk-primary" data-create>创建好友挑战 <span aria-hidden="true">↗</span></button></section>
          <section class="pk-option"><h3>好友在等我</h3><p>收到邀请链接可直接加入，也可以输入房间码。</p><div class="pk-join"><label>房间码<input data-code maxlength="12" autocomplete="off" spellcheck="false" placeholder="12 位房间码"></label><button data-join>加入</button></div></section></div>
      </section>
      <section data-room hidden><div class="pk-room-intro"><span class="pk-eyebrow">好友房间</span><h2 data-room-title>等好友就位</h2><span class="pk-room-code" data-room-code></span><p data-room-hint>把邀请发给好友，双方准备后开始。</p></div><div class="pk-matchup" data-players></div>
        <div class="pk-role-actions" data-role-options hidden><span>我的角色</span><button data-role="pursuer">追逐队</button><button data-role="runner">突围队</button><small>切换后交换双方角色，请两人重新准备。</small><label>开局顺序<select data-room-initiative><option value="random">系统分配先手</option><option value="pursuer">追逐队先手</option><option value="runner">突围队先手</option></select></label><small data-initiative-note></small></div><div class="pk-room-actions"><button data-share>复制邀请</button><button class="pk-primary" data-ready>准备</button><button class="pk-primary" data-rematch hidden>再来一局</button><button data-result hidden>查看结果</button></div><p class="pk-room-note">相同规则 · 独立操作 · 服务端确认结果</p></section>
      <canvas data-play hidden aria-label="好友挑战操作区"></canvas>
    </main>
    <footer class="pk-footer"><p>昵称可以重名，成绩跟随账号。游客身份保存在当前浏览器。</p><button data-board>全站榜 <span aria-hidden="true">↗</span></button></footer>
    <div class="pk-exit"><button data-close aria-label="退出 PK">退出 PK</button></div>
  </div><section class="pk-overlay" data-details hidden aria-label="比赛详情"></section>`;
  if (!modeEntry) document.body.append(launch);
  document.body.append(dialog);
  if (xiangqi) {
    const back = dialog.querySelector('[data-close]');
    back.textContent = '←';
    back.setAttribute('aria-label', '返回玩法选择');
    back.className = 'pk-back';
    dialog.querySelector('.pk-header').prepend(back);
    dialog.querySelector('.pk-exit').remove();
    dialog.querySelector('.pk-brand strong').textContent = '好友对弈';
    dialog.querySelector('.pk-brand-mark').textContent = '五';
    dialog.querySelector('.pk-hero h2').textContent = '叫上好友，下一局！';
    dialog.querySelector('[data-create]').textContent = '创建房间';
    dialog.querySelector('[data-board]').textContent = '看看排行榜 →';
    dialog.querySelector('.pk-overlay').classList.add('pk-detail-page');
  }
  if (street) {
    globalThis.__CLASSIC_CHASE_ROLES__ = true;
    dialog.dataset.streetCompetition = '';
    const walker = document.createTreeWalker(dialog, NodeFilter.SHOW_TEXT);
    while (walker.nextNode())
      walker.currentNode.textContent = walker.currentNode.textContent
        .replaceAll('追逐队', '警察')
        .replaceAll('突围队', '小偷');
  }
  const select = (q) => dialog.querySelector(q),
    status = select('[data-status]'),
    canvas = select('canvas'),
    ctx = canvas.getContext('2d'),
    details = select('[data-details]');
  let room = null,
    profile = null,
    poll = null,
    busy = false,
    exiting = false,
    pending = null,
    frame = 0,
    lastPoll = 0,
    resultShown = null,
    returnFocus = null,
    modes = [];
  const isOpen = () => (xiangqi ? !dialog.hidden : dialog.open);
  let screenStates = [];
  function closeCompetition() {
    if (!xiangqi) {
      dialog.close();
      return;
    }
    dialog.hidden = true;
    dialog.removeAttribute('open');
    document.body.classList.remove('competition-active');
    for (const [screen, inert] of screenStates) screen.inert = inert;
    screenStates = [];
    if (history.state?.xqOnline) {
      const nextState = { ...history.state };
      delete nextState.xqOnline;
      history.replaceState(nextState, '', location.href);
    }
    dialog.dispatchEvent(new Event('close'));
    window.dispatchEvent(new CustomEvent('xiangqi-online-close', { detail: { open: false } }));
    if (launch.isConnected && !launch.closest('[hidden]')) launch.focus();
  }
  function text(tag, value, className = '') {
    const node = document.createElement(tag);
    node.textContent = value;
    if (className) node.className = className;
    return node;
  }
  function action(label, handler, className = '') {
    const button = text('button', label, className);
    button.type = 'button';
    button.onclick = handler;
    return button;
  }
  function dismiss() {
    details.hidden = true;
    select('.pk-content').inert = false;
    select('.pk-footer').inert = false;
    if (!xiangqi) select('.pk-exit').inert = false;
    if (returnFocus?.isConnected && !returnFocus.closest('[hidden]')) returnFocus.focus();
    else select('[data-rules]').focus();
  }
  function detailPanel(title, subtitle, kind) {
    if (details.hidden) returnFocus = document.activeElement;
    details.hidden = false;
    details.replaceChildren();
    select('.pk-content').inert = true;
    select('.pk-footer').inert = true;
    if (!xiangqi) select('.pk-exit').inert = true;
    const sheet = text('div', '', 'pk-sheet');
    sheet.dataset.kind = kind;
    const head = text('div', '', 'pk-sheet-head'),
      label = document.createElement('div');
    label.append(text('h2', title), text('small', subtitle));
    const close = action('返回游戏', dismiss);
    const actions = text('div', '', 'pk-sheet-actions');
    const content = text('div', '', 'pk-sheet-content');
    close.dataset.dismiss = '';
    close.setAttribute('aria-label', '返回游戏');
    close.title = '返回游戏';
    head.append(label);
    actions.append(close);
    sheet.append(head, content, actions);
    details.append(sheet);
    close.focus();
    return content;
  }
  function feedback(error) {
    status.textContent = error instanceof Error ? error.message : String(error);
    status.toggleAttribute('data-error', error instanceof Error);
  }
  function updateProfile(value) {
    profile = value;
    select('[data-profile-name]').textContent = value.name;
    select('[data-avatar]').textContent = Array.from(value.name)[0] || '你';
  }
  async function showProfile() {
    updateProfile(await client.request('/me'));
    const sheet = detailPanel('让好友认出你', '昵称可修改，成绩和身份不会改变。', 'profile');
    const form = document.createElement('form');
    form.className = 'pk-profile-form';
    const label = text('label', '你的昵称'),
      input = document.createElement('input');
    input.name = 'name';
    input.value = profile.name;
    input.maxLength = 32;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.required = true;
    input.setAttribute('aria-label', '你的昵称');
    label.append(input);
    form.append(
      label,
      text('small', '2–16 个中英文字、数字、空格或 · _ -。允许重名；同名时会显示短编号。'),
    );
    const message = text('p', '', 'pk-form-message');
    message.setAttribute('role', 'status');
    const save = text('button', '保存昵称', 'pk-primary');
    save.type = 'submit';
    form.append(message, save);
    sheet.append(form);
    const identity = document.createElement('details');
    identity.className = 'pk-profile-id';
    identity.append(
      text('summary', '查看我的玩家 ID'),
      text('code', profile.playerId),
      text('p', '系统自动生成，只用于识别账号。昵称和短编号不能用来登录或找回游客身份。'),
    );
    sheet.append(identity);
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (save.disabled) return;
      save.disabled = true;
      message.textContent = '正在保存…';
      try {
        updateProfile(await client.request('/me', { body: JSON.stringify({ name: input.value }) }));
        if (room) accept(await client.request(`/rooms/${room.code}`));
        dismiss();
        feedback('昵称已保存，房间和全站榜会使用新名字。');
      } catch (error) {
        message.textContent = error.message;
      } finally {
        save.disabled = false;
      }
    };
    input.focus();
    input.select();
  }
  function renderPlayers() {
    const target = select('[data-players]');
    target.replaceChildren();
    for (let seat = 0; seat < 2; seat++) {
      if (seat === 1) target.append(text('span', 'VS', 'pk-versus'));
      const player = room.players[seat],
        card = text('div', '', 'pk-player');
      if (player) {
        card.toggleAttribute('data-ready', !!player.ready);
        card.append(
          text('span', Array.from(player.name || '新')[0], 'pk-avatar'),
          text('strong', playerName(player, room.players) + (seat === room.you ? '（你）' : '')),
          text(
            'small',
            [
              roleNames[player.role],
              room.status === 'waiting'
                ? player.ready
                  ? '已准备'
                  : '还未准备'
                : room.status === 'finished'
                  ? '本局已结束'
                  : '本局已中断',
            ]
              .filter(Boolean)
              .join(' · '),
          ),
        );
      } else {
        card.dataset.empty = '';
        card.append(
          text('span', '＋', 'pk-avatar'),
          text('strong', '等一位好友'),
          text('small', '复制邀请，发给 TA'),
        );
      }
      target.append(card);
    }
  }
  function accept(value) {
    if (!isOpen()) return;
    if (room?.code !== value.code) pending = null;
    room = value;
    const playing = room.status === 'playing',
      ended = ['finished', 'abandoned', 'expired'].includes(room.status);
    select('[data-lobby]').hidden = true;
    select('[data-room]').hidden = playing;
    canvas.hidden = !playing;
    select('.pk-footer').hidden = playing;
    select('[data-room-code]').textContent = room.code;
    select('[data-room-title]').textContent = ended
      ? room.status === 'finished'
        ? '这一局，已分高下'
        : '这局暂告一段落'
      : room.players.length === 2
        ? '好友已就位'
        : '等好友就位';
    select('[data-room-hint]').textContent = ended
      ? '再来一局，继续和好友较量。'
      : room.roles
        ? `${modes.find((mode) => mode.id === room.mode)?.title || room.mode} · 选择角色，双方准备后开始。`
        : '双方准备后自动开始。规则和初始条件完全相同。';
    select('[data-role-options]').hidden = room.status !== 'waiting' || !room.roles;
    select('[data-room-initiative]').value = room.initiative || 'random';
    select('[data-room-initiative]').disabled = room.you !== 0;
    select('[data-initiative-note]').textContent =
      (game === 'cops-robbers-realtime'
        ? '先手有 2 秒开局行动时间，随后双方同时行动。'
        : '先手队伍先走一步，此后交替行动。') + '由房主设置，改动后双方重新准备。';
    for (const button of dialog.querySelectorAll('[data-role]')) {
      const selected = button.dataset.role === room.players[room.you]?.role;
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = selected;
    }
    select('[data-ready]').hidden = room.status !== 'waiting';
    select('[data-ready]').disabled = !!room.players[room.you]?.ready;
    select('[data-ready]').textContent = room.players[room.you]?.ready ? '已准备，等好友' : '准备';
    select('[data-share]').hidden = ended;
    select('[data-rematch]').hidden = !ended;
    select('[data-result]').hidden = room.status !== 'finished';
    dialog.toggleAttribute('data-playing', playing);
    const states = {
      waiting: '等待双方准备',
      playing: room.players[room.you]?.result?.finished ? '已完成，等待对方' : '比赛中',
      finished: '比赛结束，结果已确认',
      abandoned: '玩家退出，本局中断',
      expired: '邀请已过期，请再来一局',
    };
    feedback(
      states[room.status] +
        (playing
          ? ` · 剩余 ${Math.max(0, Math.ceil((room.deadline - room.serverNow) / 1000))} 秒`
          : ''),
    );
    if (!playing) renderPlayers();
    if (room.status === 'finished' && resultShown !== room.code) {
      resultShown = room.code;
      showResults();
    }
    try {
      localStorage.setItem(`competition-room:${game}`, room.code);
    } catch {}
  }
  async function run(task) {
    if (busy) return;
    busy = true;
    dialog.setAttribute('aria-busy', 'true');
    try {
      await task();
    } catch (error) {
      if (error.code && error.code !== 'SERVICE_UNAVAILABLE') pending = null;
      feedback(error);
    } finally {
      busy = false;
      dialog.removeAttribute('aria-busy');
    }
  }
  async function refresh() {
    if (!room || busy || !isOpen() || Date.now() - lastPoll < (room.pollMs || 1200)) return;
    lastPoll = Date.now();
    try {
      accept(await client.request(`/rooms/${room.code}`));
    } catch (error) {
      feedback(error);
    }
  }
  function showResults() {
    const sheet = detailPanel('这一局，打得漂亮', '比赛结果已由服务端确认。', 'result');
    for (const entry of room.results || []) {
      const me = entry.playerId === room.players[room.you].id,
        player = room.players.find((p) => p.id === entry.playerId),
        card = text('section', '', 'pk-result');
      card.append(
        text(
          'h3',
          (me ? '你 · ' : '') + playerName(player || { playerId: entry.playerId }, room.players),
        ),
        text(
          'strong',
          entry.result.eligible
            ? scoreText(game, entry.result.score, entry.result.secondary)
            : '本局无有效成绩',
        ),
      );
      const rank = entry.after.me?.rank,
        old = entry.before?.rank,
        change = rank
          ? old
            ? `排名变化 ${old - rank > 0 ? '+' : ''}${old - rank}`
            : '首次上榜'
          : '尚无有效成绩';
      card.append(
        text(
          'p',
          `${game === 'xiangqi-five' || room.roles ? '总积分' : '个人最佳'} ${entry.after.me ? scoreText(game, entry.after.me.score, entry.after.me.secondary) : '暂无'}`,
        ),
        text('p', `全站第 ${rank ?? '—'} 名 / ${entry.after.eligiblePlayers} 人 · ${change}`),
        text('p', gapText(game, entry.after)),
      );
      if (entry.reason) card.append(text('p', entry.reason));
      sheet.append(card);
    }
    const actions = text('div', '', 'pk-result-actions');
    actions.append(
      action('再次挑战', () => select('[data-rematch]').click(), 'pk-primary'),
      action('查看全站榜', () => void run(showBoard)),
    );
    sheet.append(actions);
  }
  async function showBoard() {
    const board = await client.request(`/boards/${game}`),
      sheet = detailPanel(
        '全站榜',
        `${board.eligiblePlayers} 位合格玩家 · ${board.roles || game === 'xiangqi-five' ? '好友对战积分' : '每人一条最佳成绩'}`,
        'board',
      ),
      own = text('section', '', 'pk-my-record');
    own.append(
      text(
        'small',
        `${profile?.name || '我的成绩'} · ${board.me ? '全站第 ' + board.me.rank + ' 名' : '尚未上榜'}`,
      ),
      text(
        'strong',
        board.me ? scoreText(game, board.me.score, board.me.secondary) : '等你留下第一份成绩',
      ),
      text('p', gapText(game, board)),
    );
    sheet.append(own);
    const list = text('div', '', 'pk-list');
    for (const row of board.top) {
      const item = text('div', '', 'pk-rank-row');
      item.toggleAttribute('data-self', row.playerId === board.me?.playerId);
      const label = text('span', row.name || '新玩家', 'pk-rank-name');
      if (board.top.some((other) => other.playerId !== row.playerId && other.name === row.name))
        label.append(
          text(
            'small',
            playerName(row, board.top)
              .split(' · #')
              .slice(1)
              .map((value) => '#' + value)
              .join(''),
          ),
        );
      if (row.playerId === board.me?.playerId) label.append(text('small', '你'));
      item.append(
        text('span', String(row.rank), 'pk-rank-number'),
        label,
        text('span', scoreText(game, row.score, row.secondary), 'pk-rank-score'),
      );
      list.append(item);
    }
    if (!board.top.length)
      list.append(text('p', '全站榜暂为空。完成一次有效挑战，就能留下你的名字。', 'pk-empty'));
    sheet.append(list, text('p', board.description || board.title, 'pk-sheet-note'));
  }
  async function showRules() {
    if (!details.hidden && details.firstElementChild?.dataset.kind === 'rules') {
      dismiss();
      return;
    }
    const sheet = detailPanel('这局怎么玩', titles[game], 'rules'),
      loading = text('p', '正在读取比赛规则…');
    sheet.append(loading);
    try {
      const rules =
        room?.state?.rules ||
        (await client.request(`/boards/${game}`)).description ||
        '双方准备后开始，服务端验证操作与计时。';
      if (!sheet.isConnected || sheet.closest('[data-details]') !== details) return;
      loading.remove();
      const list = text('ol', '', 'pk-rule-list');
      for (const part of rules
        .split(/[；。]+/)
        .map((part) => part.trim())
        .filter(Boolean))
        list.append(text('li', part + '。'));
      sheet.append(
        list,
        text(
          'p',
          room?.status === 'playing'
            ? '查看规则时比赛计时继续。准备好后，关闭这张卡片继续。'
            : '练习和离线成绩不计入全站榜。双方准备后，比赛由服务端开始计时。',
          'pk-sheet-note',
        ),
      );
    } catch (error) {
      loading.textContent = error.message;
    }
  }
  function draw() {
    if (!isOpen()) return;
    if (!canvas.hidden && (!xiangqi || details.hidden)) {
      const rect = street
          ? { width: canvas.clientWidth, height: canvas.clientHeight }
          : canvas.getBoundingClientRect(),
        ratio = Math.min(devicePixelRatio || 1, 2),
        width = Math.floor(rect.width * ratio),
        height = Math.floor(rect.height * ratio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      if (room?.state) renderer.draw(ctx, rect.width, rect.height, room.state);
    }
    frame = requestAnimationFrame(draw);
  }
  async function open() {
    if (isOpen() || exiting) return;
    window.dispatchEvent(new CustomEvent('competition-visibility', { detail: { open: true } }));
    if (xiangqi) {
      history.pushState(
        { ...history.state, xqScreen: document.body.dataset.screen || 'modes', xqOnline: true },
        '',
        location.href,
      );
      window.dispatchEvent(new CustomEvent('xiangqi-online-open', { detail: { open: true } }));
      screenStates = [...document.querySelectorAll('[data-screen]:not(body)')].map((screen) => [
        screen,
        screen.inert,
      ]);
      for (const [screen] of screenStates) screen.inert = true;
      document.body.classList.add('competition-active');
      dialog.hidden = false;
      dialog.setAttribute('open', '');
      select('[data-close]').focus();
    } else dialog.showModal();
    draw();
    poll = setInterval(refresh, 250);
    const invite = new URL(location.href).searchParams.get('pk');
    let saved;
    try {
      saved = localStorage.getItem(`competition-room:${game}`);
    } catch {}
    await run(async () => {
      updateProfile(await client.request('/me'));
      const metadata = await client.request(`/boards/${game}`);
      modes = metadata.modes || [];
      select('[data-match-options]').hidden = !metadata.roles;
      select('[data-match-mode]').replaceChildren(
        ...modes.map((mode) => {
          const option = text('option', mode.title);
          option.value = mode.id;
          return option;
        }),
      );
      if (invite && /^[A-F0-9]{12}$/.test(invite)) {
        select('[data-code]').value = invite;
        feedback('已读取邀请，请点击加入。');
      } else if (saved) accept(await client.request(`/rooms/${saved}`));
    });
  }
  launch.onclick = () => void open();
  if (street)
    globalThis.__openStreetCompetition = async (entry) => {
      await open();
      if (entry === 'board') await run(showBoard);
    };
  select('[data-create]').onclick = () =>
    void run(async () =>
      accept(
        await client.request('/rooms', {
          body: JSON.stringify({
            game,
            ...(modes.length
              ? {
                  mode: select('[data-match-mode]').value,
                  role: select('[data-match-role]').value,
                  initiative: select('[data-match-initiative]').value,
                }
              : {}),
          }),
        }),
      ),
    );
  for (const button of dialog.querySelectorAll('[data-role]'))
    button.onclick = () =>
      void run(async () =>
        accept(
          await client.request(`/rooms/${room.code}/role`, {
            body: JSON.stringify({ role: button.dataset.role }),
          }),
        ),
      );
  select('[data-room-initiative]').onchange = () =>
    void run(async () =>
      accept(
        await client.request(`/rooms/${room.code}/initiative`, {
          body: JSON.stringify({ initiative: select('[data-room-initiative]').value }),
        }),
      ),
    );
  select('[data-join]').onclick = () =>
    void run(async () =>
      accept(
        await client.request('/rooms/join', {
          body: JSON.stringify({ code: select('[data-code]').value.trim().toUpperCase(), game }),
        }),
      ),
    );
  select('[data-ready]').onclick = () =>
    void run(async () => accept(await client.request(`/rooms/${room.code}/ready`, { body: '{}' })));
  select('[data-rematch]').onclick = () =>
    void run(async () => {
      const result = await client.request(`/rooms/${room.code}/rematch`, { body: '{}' });
      dismiss();
      accept(
        await client.request('/rooms/join', { body: JSON.stringify({ code: result.rematch }) }),
      );
    });
  select('[data-share]').onclick = () =>
    void run(async () => {
      const url = new URL(location.href);
      url.searchParams.set('pk', room.code);
      try {
        await navigator.clipboard.writeText(url.href);
        feedback('邀请链接已复制；也可发送房间码 ' + room.code);
      } catch {
        feedback('请发送房间码 ' + room.code + ' 给好友。');
      }
    });
  select('[data-board]').onclick = () => void run(showBoard);
  select('[data-profile]').onclick = () => void run(showProfile);
  select('[data-rules]').onclick = () => void run(showRules);
  select('[data-result]').onclick = showResults;
  select('[data-close]').onclick = async () => {
    if (exiting) return;
    exiting = true;
    launch.disabled = true;
    closeCompetition();
    try {
      if (room && ['waiting', 'playing'].includes(room.status))
        await client.request(`/rooms/${room.code}/leave`, { body: '{}' });
      room = null;
      pending = null;
      resultShown = null;
      select('[data-lobby]').hidden = false;
      select('[data-room]').hidden = true;
      canvas.hidden = true;
      select('.pk-footer').hidden = false;
      dialog.removeAttribute('data-playing');
      try {
        localStorage.removeItem(`competition-room:${game}`);
      } catch {}
      if (!modeEntry) launch.textContent = '好友 PK · 全站榜';
      launch.removeAttribute('title');
      feedback('同一规则，和好友认真比一局。');
    } catch {
      if (!modeEntry) launch.textContent = '已退出 · 房间待确认';
      launch.title = '网络不可用，服务端尚未确认退出。重连可查看原房间，否则按时限结束。';
    } finally {
      exiting = false;
      launch.disabled = false;
    }
  };
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (!details.hidden) dismiss();
    else select('[data-close]').click();
  });
  if (xiangqi) {
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !isOpen()) return;
      event.preventDefault();
      if (!details.hidden) dismiss();
      else select('[data-close]').click();
    });
    window.addEventListener('xiangqi-online-exit', () => {
      if (isOpen()) select('[data-close]').click();
    });
  }
  details.addEventListener('click', (event) => {
    if (!xiangqi && event.target === details) dismiss();
  });
  dialog.addEventListener('close', () => {
    clearInterval(poll);
    cancelAnimationFrame(frame);
    dismiss();
    window.dispatchEvent(new CustomEvent('competition-visibility', { detail: { open: false } }));
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!room || room.status !== 'playing' || !details.hidden) return;
    const rect = canvas.getBoundingClientRect();
    const rotated = street && matchMedia('(orientation: portrait)').matches;
    const command = renderer.tap(
      rotated ? event.clientY - rect.top : event.clientX - rect.left,
      rotated ? rect.right - event.clientX : event.clientY - rect.top,
      room.state,
    );
    if (!command) return;
    void run(async () => {
      pending ??= { seq: room.seq + 1, action: command };
      const next = await client.request(`/rooms/${room.code}/actions`, {
        body: JSON.stringify(pending),
      });
      pending = null;
      accept(next);
    });
  });
  if (new URL(location.href).searchParams.has('pk')) void open();
}
