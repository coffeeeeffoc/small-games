import {
  FACTIONS,
  LEVELS,
  createMatch,
  tick,
  switchRoute,
  getLevel,
  getScore,
  getUnlockedLevels,
  applyResult,
} from './src/core/index.mjs';
import { mountBoard, formatTime, colors } from './render.mjs';
import { readSave, writeSave } from './storage.mjs';
import { RemoteMatch, normalizeServer } from './remote.mjs';

const root = document.querySelector('#game');
let save = readSave(),
  state = null,
  board = null,
  remote = null,
  screen = 'home',
  lastFrame = 0,
  lastUI = 0,
  lastPoll = 0,
  pollBusy = false,
  commandBusy = false,
  runId = 0,
  practice = false,
  lastEvent = 0,
  noticeTimer,
  battleTipTimer,
  audio,
  settled = false;
const debug = globalThis.SmallGamesDev?.isEnabled() === true;
const symbols = {
  back: '<path d="m14 5-7 7 7 7"/>',
  settings:
    '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m9 3 6 0 1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z"/>',
  help: '<path d="M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4M12 17v1"/>',
  pause: '<path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" stroke="none"/>',
};
const icon = (name, id, label) =>
  `<button class="icon-button" id="${id}" aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true">${symbols[name]}</svg></button>`;
const esc = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
function listen(id, action) {
  document.getElementById(id)?.addEventListener('click', action);
}
function persist() {
  const saved = writeSave(save);
  if (!saved) tell('存档暂时不可用，本次仍可继续游玩');
  return saved;
}
function tell(text) {
  const el = document.querySelector('#notice');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    el.hidden = true;
  }, 3500);
}
function sound(kind = 'switch') {
  if (!save.settings.sound) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    void audio.resume();
    const oscillator = audio.createOscillator(),
      gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(kind === 'capture' ? 660 : 360, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      kind === 'capture' ? 990 : 230,
      audio.currentTime + 0.12,
    );
    gain.gain.setValueAtTime(0.05, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.16);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.17);
  } catch {
    /* Sound is optional. */
  }
}
function show(name, html) {
  board?.destroy();
  board = null;
  clearTimeout(battleTipTimer);
  screen = name;
  document.body.dataset.screen = name;
  root.innerHTML = html;
  lastFrame = 0;
  root.querySelector('h1,h2')?.setAttribute('tabindex', '-1');
}
function header(title) {
  return `<header class="topbar">${icon('back', 'back', '返回主页')}<h1 class="page-title">${title}</h1><span style="width:44px"></span></header>`;
}
function selectedLevel() {
  const unlocked = getUnlockedLevels(save);
  return (
    LEVELS.find((level) => unlocked.includes(level.id) && !save.completed.includes(level.id)) ??
    LEVELS.at(-1)
  );
}
function home() {
  runId++;
  remote?.close();
  remote = null;
  state = null;
  settled = false;
  const level = selectedLevel();
  show(
    'home',
    `<section class="screen home"><header class="topbar"><div class="wordmark"><span class="seal">路</span>方寸山河</div><div class="top-actions">${icon('help', 'help', '玩法说明')}${icon('settings', 'settings', '设置')}</div></header><div class="home-heading"><p class="eyebrow">山河为局 · 驿路为棋</p><h1>天下岔路<span class="red-seal">兵流<br>争城</span></h1><p class="subtitle">一指改道，四方逐鹿</p></div><div class="home-bottom"><div class="campaign-note"><div><p class="eyebrow">天下篇 · 第${level.order}战</p><h2>${esc(level.name)}</h2></div><span class="progress-stamp">${save.completed.length} / 3</span></div><button id="start" class="primary">${save.completed.length ? '继续征战' : '出 征'}</button><div class="home-sub"><button id="levels" class="secondary">山河图</button><button id="quick" class="secondary">四方试炼</button></div><p class="home-status">${save.settings.online ? '服务端对局' : '本地征战'} · ${save.settings.difficulty === 'easy' ? '初入沙场' : save.settings.difficulty === 'hard' ? '老谋深算' : '势均力敌'}</p><div class="home-footer">自动行军 · 只需改变方向</div></div></section>`,
  );
  listen('start', () => start(level.id));
  listen('levels', levels);
  listen('quick', () => start('four-kingdoms', true));
  listen('help', help);
  listen('settings', settings);
}
function levels() {
  const unlocked = getUnlockedLevels(save);
  show(
    'levels',
    `<section class="screen levels">${header('山 河 图')}<div class="level-intro"><p class="eyebrow">天下篇 · 三战初成</p><p class="small">胜一场，开一程。</p></div><nav class="level-list" aria-label="征战关卡">${LEVELS.map((level, i) => `<button class="level-card" data-level="${level.id}" ${unlocked.includes(level.id) ? '' : 'disabled'}><span class="level-num">${['壹', '贰', '叁'][i]}</span><div><h2>${esc(level.name)}</h2><p>${unlocked.includes(level.id) ? `${level.factions.length}方争城 · ${level.cities.length}座城池` : `通关「${esc(LEVELS[i - 1].name)}」解锁`}</p><div class="stars">${save.completed.includes(level.id) ? '★'.repeat(save.stars[level.id] || 1) + '☆'.repeat(3 - (save.stars[level.id] || 1)) : unlocked.includes(level.id) ? '可出征' : '未解锁'}</div></div></button>`).join('')}</nav><p class="level-footer">四方试炼可直接练习，不影响征战进度。</p></section>`,
  );
  listen('back', home);
  root
    .querySelectorAll('[data-level]')
    .forEach((button) => button.addEventListener('click', () => start(button.dataset.level)));
}
function help() {
  show(
    'help',
    `<section class="screen document-screen">${header('行 军 手 札')}<div class="document-body"><h2>兵自己走，路由你定。</h2><div class="rule-row"><span class="rule-num">一</span><div><h3>点岔口，改方向</h3><p>你统领赤岚军。点击我军城旁的金边圆形岔口，轮换出口。箭头指向目的城，亮线就是当前军令。</p></div></div><div class="rule-row"><span class="rule-num">二</span><div><h3>占城池，接兵流</h3><p>城池自动产兵，保留 8 兵驻守，其余自动出发。敌我兵力一比一抵消，守军耗尽后再来一兵即可占城。占领后别忘了调转新城岔路。</p></div></div><div class="rule-row"><span class="rule-num">三</span><div><h3>看时机，取天下</h3><p>部队经过岔口后不能折返。趁对手远征时改道夺城。消灭其他势力即可获胜；三分钟到时先比城数，再比总兵力，同分平局。</p></div></div><p class="small">对手均为明确标注的 AI 将领。难度只改变反应和判断，不增加产兵或战斗数值。暂无真人匹配。</p></div><div class="bottom-action"><button class="primary" id="help-play" style="width:100%">明白了，出征</button></div></section>`,
  );
  listen('back', home);
  listen('help-play', () => start(selectedLevel().id));
}
function settings() {
  show(
    'settings',
    `<section class="screen document-screen">${header('军 中 设 置')}<form id="settings-form" class="document-body"><div class="setting"><label class="check" for="sound">行军音效<input type="checkbox" id="sound" ${save.settings.sound ? 'checked' : ''}></label></div><div class="setting"><label for="difficulty">AI 将领</label><select id="difficulty"><option value="easy">初入沙场 · 反应从容</option><option value="normal">势均力敌 · 伺机而动</option><option value="hard">老谋深算 · 把握战机</option></select><p class="setting-note">各方产兵、行军和战斗规则相同。</p></div><div class="settings-divider"></div><div class="setting"><label class="check" for="online">使用服务端对局<input id="online" type="checkbox" ${save.settings.online ? 'checked' : ''}></label><label for="server-url">对局服务地址</label><input id="server-url" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="http://localhost:43004" value="${esc(save.settings.serverUrl)}"><p class="setting-note">连接已启动的配套服务，由服务端推演对局。关闭后可本地游玩，两种方式均为 AI 对战。</p><button id="check-server" class="secondary" type="button">检查连接</button></div><p class="settings-message" id="settings-message" role="status"></p><button type="submit" class="primary">保存设置</button><div style="text-align:center"><button type="button" data-game-fullscreen>全屏</button></div></form></section>`,
  );
  document.querySelector('#difficulty').value = save.settings.difficulty;
  listen('back', home);
  listen('check-server', async () => {
    const status = document.querySelector('#settings-message'),
      button = document.querySelector('#check-server');
    button.disabled = true;
    status.textContent = '正在连接…';
    try {
      const origin = normalizeServer(document.querySelector('#server-url').value.trim());
      const response = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (data?.status !== 'ok' || data?.service !== 'tianxia-server' || data?.protocol !== 1)
        throw new Error();
      status.textContent = '连接成功，可使用服务端对局。';
    } catch {
      status.textContent = '无法连接，请检查服务地址、服务进程和允许来源。';
    } finally {
      button.disabled = false;
    }
  });
  document.querySelector('#settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const online = document.querySelector('#online').checked;
      const raw = document.querySelector('#server-url').value.trim();
      const serverUrl = raw ? normalizeServer(raw) : '';
      if (online && !serverUrl) throw new Error('请先填写对局服务地址');
      save.settings = {
        sound: document.querySelector('#sound').checked,
        difficulty: document.querySelector('#difficulty').value,
        online,
        serverUrl,
      };
      persist();
      home();
    } catch (error) {
      document.querySelector('#settings-message').textContent = error.message;
    }
  });
}
async function start(levelId, isPractice = false) {
  if (!isPractice && !getUnlockedLevels(save).includes(levelId)) return tell('请先完成前一战');
  const token = ++runId;
  remote?.close();
  remote = null;
  practice = isPractice;
  settled = false;
  lastEvent = 0;
  commandBusy = false;
  pollBusy = false;
  lastPoll = 0;
  if (save.settings.online) {
    let client;
    try {
      client = new RemoteMatch(save.settings.serverUrl);
    } catch {
      home();
      tell('服务地址无效，请在设置中重新填写');
      return;
    }
    remote = client;
    show(
      'loading',
      '<section class="screen loading"><div class="loading-symbol">令</div><h2>整军待发</h2><p>正在连接对局服务…</p><button class="text-button" id="cancel">返回主页</button></section>',
    );
    listen('cancel', home);
    try {
      const snapshot = await client.start(levelId, save.settings.difficulty);
      if (runId !== token) {
        client.close();
        return;
      }
      state = snapshot.state;
      battle();
    } catch {
      if (runId !== token) return;
      home();
      tell('对局服务暂不可用，可在设置中切回本地征战');
    }
  } else {
    state = createMatch({
      levelId,
      seed: crypto.getRandomValues(new Uint32Array(1))[0],
      difficulty: save.settings.difficulty,
    });
    battle();
  }
}
function battle() {
  const level = getLevel(state.levelId);
  show(
    'battle',
    `<section class="screen battle"><header class="battle-header"><div class="battle-title">${esc(level.name)}<small>${practice ? '试炼 · 不计进度' : remote ? '服务端征战' : '本地征战'}</small></div><time id="timer" class="timer">03:00</time>${icon('pause', 'pause', '暂停')}</header><div class="faction-bar" aria-label="各方城池">${state.factions.map((id) => `<div class="faction" data-score="${id}" style="--faction:${colors[id]}"><span class="faction-flag">${FACTIONS[id].shortName}</span><div><strong>1</strong><span class="faction-label">${id === 0 ? '我军' : 'AI'} · 城</span></div></div>`).join('')}</div><div class="battle-area"><div class="board" id="board" role="group" aria-label="行军沙盘，点击我军岔口改道"></div></div><footer class="battle-footer">你执<strong>赤岚</strong>军 · 点金边岔口改道</footer></section>`,
  );
  board = mountBoard(document.querySelector('#board'), state, route);
  board.update(state, !save.tutorial);
  if (!save.tutorial) board.tell('点我军金边岔口，让军队换一条路');
  listen('pause', () => pause());
  lastFrame = 0;
  if (document.hidden) void pause();
}
function battleTip(message) {
  board?.tell(message);
  clearTimeout(battleTipTimer);
  battleTipTimer = setTimeout(() => board?.tell(''), 3000);
}
async function route(junctionId) {
  if (screen !== 'battle' || commandBusy) return;
  const client = remote;
  commandBusy = true;
  try {
    if (client) {
      const snapshot = await client.route(junctionId);
      if (remote !== client) return;
      state = snapshot.state;
    } else {
      const result = switchRoute(state, 0, junctionId);
      if (!result.ok) return;
    }
    if (screen !== 'battle') return;
    board.update(state);
    board.flash(junctionId);
    sound();
    const junction = state.junctions.find((entry) => entry.id === junctionId),
      target = state.cities.find((entry) => entry.id === junction.exits[junction.routeIndex]);
    battleTip(`军令已改：后续部队前往${target.name}`);
    if (!save.tutorial) {
      save.tutorial = true;
      persist();
    }
  } catch (error) {
    if (remote === client && screen === 'battle') {
      if (error.status && error.status < 500) {
        battleTip(error.message);
        if (error.code === 'match-finished') await poll();
      } else await pause('连接暂时中断。恢复后会重试未确认的军令。');
    }
  } finally {
    commandBusy = false;
  }
}
async function pause(reason = '') {
  if (screen !== 'battle') return;
  show(
    'pause',
    `<section class="screen pause-screen"><div><p class="eyebrow">暂 歇 战 鼓</p><h2>鸣金暂歇</h2><p>${remote ? '正在暂停服务端对局…' : '兵马已停，军令犹在。'}</p></div><div class="button-stack"><button class="primary" id="resume">继续征战</button><button class="secondary" id="retry">重新开局</button><button class="text-button" id="leave">返回主页</button></div><p class="pause-note" id="pause-note" role="status">${esc(reason)}</p><div><button data-game-fullscreen>全屏</button></div></section>`,
  );
  void audio?.suspend();
  listen('resume', resume);
  listen('retry', () => start(state.levelId, practice));
  listen('leave', home);
  const client = remote;
  if (client) {
    document.querySelector('#resume').disabled = true;
    try {
      const snapshot = await client.action('pause');
      if (remote === client) {
        state = snapshot.state;
        if (screen === 'pause')
          document.querySelector('.pause-screen p:not(.eyebrow)').textContent =
            '兵马已停，军令犹在。';
      }
    } catch {
      if (screen === 'pause' && remote === client)
        document.querySelector('#pause-note').textContent =
          '网络未确认暂停，服务端可能仍在推进。可稍后恢复连接。';
    } finally {
      if (screen === 'pause' && remote === client)
        document.querySelector('#resume').disabled = false;
    }
  }
}
async function resume() {
  const client = remote;
  if (client) {
    document.querySelector('#resume').disabled = true;
    try {
      let snapshot = await client.poll();
      if (remote !== client || screen !== 'pause') return;
      state = snapshot.state;
      if (state.status === 'finished') {
        finish();
        return;
      }
      snapshot = await client.action('resume');
      if (remote !== client || screen !== 'pause') return;
      state = snapshot.state;
      if (client.pending) {
        try {
          state = (await client.route(client.pending.junctionId)).state;
        } catch (error) {
          if (!error.status || error.status >= 500) throw error;
        }
      }
      if (remote !== client || screen !== 'pause') return;
    } catch {
      if (screen === 'pause' && remote === client) {
        document.querySelector('#pause-note').textContent = '仍无法连接。请稍后重试，或返回主页。';
        document.querySelector('#resume').disabled = false;
      }
      return;
    }
  }
  if (state.status === 'finished') finish();
  else battle();
}
function finish() {
  if (!state?.result || settled) return;
  settled = true;
  const result = state.result;
  const won = result.outcome === 'victory';
  let savedProgress = true;
  if (won && !practice) {
    const progress = applyResult(save, result);
    save = { ...save, ...progress };
    savedProgress = persist();
  }
  const titles = { victory: '山河入掌', defeat: '此战惜败', draw: '旗鼓相当' };
  const next = LEVELS.find((level) => level.order === getLevel(state.levelId).order + 1);
  const defeatCopy =
    result.reason === 'expired'
      ? '离线过久，对局已结束。重新出征即可再战。'
      : result.reason === 'abandoned'
        ? '本次征战已结束，整军再来。'
        : result.reason === 'elimination'
          ? '城池尽失，余部也未能挽回局势。'
          : '三分钟已至，敌军在城池或兵力上领先。';
  show(
    'result',
    `<section class="screen result"><div class="result-heading"><p class="eyebrow">${practice ? '四方试炼' : '天下篇'} · ${esc(getLevel(state.levelId).name)}</p><div class="result-seal">${won ? '捷' : result.outcome === 'draw' ? '和' : '憾'}</div><h2>${titles[result.outcome]}</h2><div class="stars">${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)}</div><p>${result.outcome === 'draw' ? '城池与兵力相同，此战握手言和。' : won ? (result.reason === 'timeout' ? '战鼓止息，你的疆域居于诸军之首。' : '诸军归一，山河已定。') : defeatCopy}${practice ? '<br>本局为试炼，不计入征战进度。' : ''}</p></div><div><div class="result-metrics"><div><strong>${formatTime(result.elapsed)}</strong><span>用时</span></div><div><strong>${state.stats.captured}</strong><span>夺城</span></div><div><strong>${state.stats.switches}</strong><span>改道</span></div></div><div class="rank-list">${result.rankings.map((rank, i) => `<div class="rank-row ${rank.factionId === 0 ? 'you' : ''}"><span class="rank-num">0${i + 1}</span><span class="faction-flag" style="--faction:${colors[rank.factionId]}">${FACTIONS[rank.factionId].shortName}</span><span class="rank-name">${FACTIONS[rank.factionId].name}${rank.factionId === 0 ? ' · 你' : ' · AI'}</span><span class="rank-score">${rank.cities} 城 / ${rank.troops} 兵</span></div>`).join('')}</div></div><div class="button-stack">${won && next && !practice ? '<button class="primary" id="next">下一战</button>' : '<button class="primary" id="again">再战一局</button>'}<button class="secondary" id="result-home">返回山河</button><p class="network-result" id="result-sync">${remote ? '正在确认战报保存…' : won && !practice ? (savedProgress ? '征战进度已记录在本机' : '本次进度仅在当前页面保留') : ''}</p></div></section>`,
  );
  sound(won ? 'capture' : 'switch');
  listen('next', () => start(next.id));
  listen('again', () => start(state.levelId, practice));
  listen('result-home', home);
  const client = remote;
  if (client)
    void client
      .result()
      .then((data) => {
        if (remote === client && screen === 'result')
          document.querySelector('#result-sync').textContent = data.persisted
            ? '服务端战报已保存'
            : '战报未写入服务端，当前战果仍可查看';
      })
      .catch(() => {
        if (remote === client && screen === 'result')
          document.querySelector('#result-sync').textContent = '战报保存尚未确认';
      });
}
function processEvents() {
  for (const event of state.events) {
    if (event.id <= lastEvent) continue;
    lastEvent = event.id;
    if (event.type === 'capture') {
      const name = state.cities.find((city) => city.id === event.cityId)?.name;
      if (event.factionId === 0) {
        battleTip(`夺下${name}！新岔口已可下令`);
        sound('capture');
      } else if (event.previousOwner === 0) battleTip(`${name}失守，调整兵路回援`);
    }
  }
}
async function poll() {
  if (!remote || pollBusy) return;
  const client = remote;
  pollBusy = true;
  try {
    const snapshot = await client.poll();
    if (remote !== client) return;
    state = snapshot.state;
    if (screen === 'battle') {
      processEvents();
      board?.update(state, !save.tutorial);
      if (state.status === 'finished') finish();
    }
  } catch {
    if (remote === client && screen === 'battle') void pause('网络暂时中断，点击继续重连。');
  } finally {
    pollBusy = false;
  }
}
function frame(now) {
  if (screen === 'battle' && state?.status === 'playing') {
    if (!remote) {
      if (lastFrame) tick(state, Math.min((now - lastFrame) / 1000, 0.25));
      processEvents();
      if (state.status === 'finished') finish();
    } else if (now - lastPoll > 400) {
      lastPoll = now;
      void poll();
    }
    if (screen === 'battle') {
      if (now - lastUI > 100) {
        board?.update(state, !save.tutorial);
        lastUI = now;
      } else board?.draw(state);
    }
    lastFrame = now;
  } else lastFrame = 0;
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    void pause();
    void audio?.suspend();
  }
  lastFrame = 0;
});
window.addEventListener('pagehide', () => {
  void pause();
  void audio?.suspend();
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && screen === 'battle') void pause();
});
if (location.pathname.startsWith('/play') && !save.settings.serverUrl) {
  save.settings.serverUrl = location.origin;
  save.settings.online = true;
}
if (debug) {
  globalThis.SmallGamesDev.registerActions([
    {
      id: 'trial-level',
      label: '试玩四方逐鹿（不计进度）',
      run: () => start('four-kingdoms', true),
    },
    {
      id: 'finish',
      label: '快速结算（不计进度）',
      run: () => {
        if (state && !remote && screen === 'battle') {
          practice = true;
          while (state.status === 'playing') tick(state, 1);
          finish();
        }
      },
    },
    {
      id: 'win',
      label: '测试胜利（不计进度）',
      run: () => {
        if (state && !remote && screen === 'battle') {
          practice = true;
          for (const city of state.cities) city.owner = 0;
          for (const junction of state.junctions) junction.owner = 0;
          state.packets = [];
          tick(state, 0.1);
          finish();
        }
      },
    },
  ]);
  globalThis.SmallGamesDev.registerSnapshot(() => ({
    screen,
    practice,
    mode: remote ? 'server' : 'local',
    levelId: state?.levelId,
    time: state?.time,
    rankings: state ? getScore(state) : [],
    result: state?.result,
  }));
}
home();
requestAnimationFrame(frame);
