import { CONTACTS, BILL, SLOTS, DESTINATIONS, createGame, act, tick, restoreGame, summarize } from './game.js';
import { unlockAudio, setMuted, playNotification, playRing, stopRing, speak, stopSpeech, pauseAudio, resumeAudio } from './audio.js';

const STORAGE = 'between-calls-v1';
const CHECKPOINT = 'between-calls-checkpoint-v1';
const root = document.querySelector('#app');
const readStore = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const saved = readStore(STORAGE);
let game = restoreGame(saved?.game);
const pages = ['welcome', 'home', 'messages', 'thread', 'shop', 'parcel', 'delivery', 'network', 'installation', 'bill', 'bill-confirm', 'wallet', 'browser', 'notes', 'phone', 'settings', 'review', 'notifications'];
let ui = { page: game.ended ? 'review' : game.started ? 'home' : 'welcome', thread: 'landlord', web: 'refund', phoneTab: 'recent', dial: '', callExpanded: true, muted: Boolean(saved?.ui?.muted), history: [], scrolls: {}, modal: null };
if (game.started && saved?.ui && pages.includes(saved.ui.page)) {
  for (const key of ['page', 'thread', 'web', 'phoneTab', 'dial', 'history', 'scrolls']) if (saved.ui[key] !== undefined) ui[key] = saved.ui[key];
  if (!Array.isArray(ui.history)) ui.history = [];
  if (game.ended) ui.page = 'review';
}
ui.thread = Object.hasOwn(CONTACTS, ui.thread) ? ui.thread : 'landlord';
ui.web = ui.web === 'deposit' ? 'deposit' : 'refund';
ui.phoneTab = ui.phoneTab === 'dial' ? 'dial' : 'recent';
ui.dial = typeof ui.dial === 'string' ? ui.dial.replace(/[^0-9*#+ -]/g, '').slice(0, 20) : '';
ui.scrolls = ui.scrolls && typeof ui.scrolls === 'object' && !Array.isArray(ui.scrolls)
  ? Object.fromEntries(Object.entries(ui.scrolls).filter(([, position]) => Number.isFinite(position) && position >= 0)) : {};
ui.history = ui.history.slice(-30).filter(route => route && pages.includes(route.page)).map(route => ({ page: route.page, thread: Object.hasOwn(CONTACTS, route.thread) ? route.thread : 'landlord', web: route.web === 'deposit' ? 'deposit' : 'refund' }));
let audioReady = false;
let audioKey = '';
let toast = '';
let visibleNotification = null;
let toastTimer;
let notificationTimer;
let lastNotificationCount = game.notifications.length;
let lastCall = game.call?.id;
let storageWarning = false;

const icons = {
  phone: '<path d="M6.4 3.5 9 8l-2 2c1.5 3.2 3.8 5.5 7 7l2-2 4.5 2.6c.6.4.6 1.3.2 1.9-1.3 1.8-3 2-5.1 1.1C9 18.2 5.8 15 3.4 8.4c-.9-2.1-.7-3.8 1.1-5.1.6-.4 1.5-.4 1.9.2Z"/>',
  chat: '<path d="M21 11.5a8.6 8.6 0 0 1-9 8.5c-1.3 0-2.5-.2-3.6-.7L3 21l1.5-5A8.1 8.1 0 0 1 3 11.5C3 6.8 7 3 12 3s9 3.8 9 8.5Z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/>',
  shop: '<path d="M5 7h14l2 14H3L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
  wifi: '<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8 16a6 6 0 0 1 8 0"/><circle cx="12" cy="20" r=".6"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z"/>',
  wallet: '<path d="M20 8V5H5a2 2 0 0 1 0-4h13v4M3 3v16a2 2 0 0 0 2 2h15V8H5"/><path d="M21 12h-6v5h6Z"/><path d="M17 14.5h.01"/>',
  note: '<rect x="5" y="3" width="15" height="19" rx="2"/><path d="M9 8h7M9 12h7M9 16h4M3 7h4M3 12h4M3 17h4"/>',
  settings: '<path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
  back: '<path d="m14 5-7 7 7 7"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  send: '<path d="m3 3 19 9-19 9 4-9-4-9ZM7 12h15"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
  volume: '<path d="m11 4-6 5H2v6h3l6 5V4ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-6 5H2v6h3l6 5V4ZM16 9l6 6m0-6-6 6"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 5V3H3v13h2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>',
  down: '<path d="m5 9 7 7 7-7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  grid: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.info}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const money = cents => (cents / 100).toFixed(2);
const time = seconds => { const minutes = 9 * 60 + 41 + Math.floor((seconds || 0) / 60); return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; };
const duration = seconds => `${String(Math.floor((seconds || 0) / 60)).padStart(2, '0')}:${String(Math.floor((seconds || 0) % 60)).padStart(2, '0')}`;
const button = (label, action, cls = 'primary', extra = '') => `<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
const avatar = (id, big = false) => { const c = CONTACTS[id] || { name: '?', initials: '?', color: '#dbe9e1' }; return `<span class="${big ? 'caller-avatar' : 'avatar'}" style="--avatar-color:${esc(c.color)}">${esc(c.initials || c.name.slice(-1))}</span>`; };
const value = key => esc(game.drafts[key] || '');
const row = (title, sub, action, glyph = 'next', extra = '') => `<button class="list-row" data-action="${action}" ${extra}><span class="row-copy"><span class="row-title">${title}</span>${sub ? `<span class="row-sub">${sub}</span>` : ''}</span>${icon(glyph, 'chevron')}</button>`;
const input = (name, label, placeholder = '', mode = 'text') => `<label class="field"><span class="field-label">${label}</span><input class="input" name="${name}" data-draft="${name}" value="${value(name)}" placeholder="${placeholder}" ${mode === 'numeric' ? 'inputmode="numeric" pattern="[0-9]*"' : ''} autocomplete="off" maxlength="${name.includes('code') ? 6 : 80}" /></label>`;

function save() {
  try { localStorage.setItem(STORAGE, JSON.stringify({ game, ui: { ...ui, modal: null, callExpanded: true } })); }
  catch { if (!storageWarning) { storageWarning = true; showToast('浏览器暂时无法保存进度，请保持此页打开。'); } }
}
function captureScroll() {
  document.querySelectorAll('[data-scroll]').forEach(el => { ui.scrolls[el.dataset.scroll] = el.scrollTop; });
}
function go(page, extras = {}, replace = false) {
  captureScroll();
  if (!replace && ui.page !== page) ui.history.push({ page: ui.page, thread: ui.thread, web: ui.web });
  ui.page = page;
  Object.assign(ui, extras);
  ui.modal = null;
  if (game.call?.phase === 'connected') ui.callExpanded = false;
  if (page === 'thread') act(game, { type: 'read-thread', id: ui.thread });
  if (page === 'parcel') act(game, { type: 'view-order', order: 'parcel' });
  if (page === 'installation' || page === 'network') act(game, { type: 'view-order', order: 'install' });
  if (page === 'notifications') game.notifications.forEach(n => { n.read = true; });
  render(); save();
}
function back() {
  if (ui.modal) { ui.modal = null; render(); return; }
  if (game.ended) { perform('resume'); go('home', {}, true); return; }
  const previous = ui.history.pop();
  go(previous?.page && pages.includes(previous.page) ? previous.page : game.started ? 'home' : 'welcome', previous || {}, true);
}
function perform(type, payload = {}, success) {
  const result = act(game, { type, ...payload });
  if (!result.ok) { showToast(result.error); render(); save(); return false; }
  if (success) showToast(success);
  refreshEffects(); render(); save();
  return true;
}
function showToast(text) {
  toast = text;
  clearTimeout(toastTimer);
  updateToast();
  toastTimer = setTimeout(() => { toast = ''; updateToast(); }, 3800);
}
function updateToast() { const el = document.querySelector('#toast-message'); if (el) { el.textContent = toast; el.hidden = !toast; } }
function checkpoint() {
  try { localStorage.setItem(CHECKPOINT, JSON.stringify({ game, ui: { ...ui, modal: null } })); } catch { /* Saving the game already reports unavailable storage. */ }
}
function openWeb(page) {
  if (!['refund', 'deposit'].includes(page)) return;
  checkpoint();
  if (perform('open-link', { page })) go('browser', { web: page });
}
function appPage(title, body, right = '', cls = '', subtitle = '') {
  return `<section class="app-page ${cls}"><header class="app-header"><button class="back" data-action="back" aria-label="返回">${icon('back')}</button><div class="app-title">${title}${subtitle ? `<small>${subtitle}</small>` : ''}</div>${right || '<span class="header-spacer"></span>'}</header><div class="app-content" data-scroll="${ui.page}">${body}</div></section>`;
}
function taskRows() {
  return [['delivery', 'parcel', '给路由器换个收件地址', '快递改投'], ['installation', 'installation', '约好今天的宽带安装', '预约宽带'], ['bill', 'bill', '把新家的电费交上', '缴纳电费']].map(([key, page, title, label]) => `<button class="task-row" data-action="go" data-page="${page}"><span class="task-check ${game.tasks[key] ? 'checked' : ''}">${game.tasks[key] ? icon('check') : ''}</span><span>${title}</span>${game.tasks[key] ? '<small>已办妥</small>' : icon('next', 'chevron')}</button>`).join('');
}
function sceneArt() {
  return `<div class="scene-art" aria-hidden="true"><svg viewBox="0 0 340 195" fill="none"><ellipse cx="170" cy="176" rx="126" ry="11" fill="#d5dfd0"/><path d="M46 47h97v121H46z" fill="#e1e6d9"/><path d="M52 41h91v8H52z" fill="#536a59"/><path d="M57 56h73v93H57z" fill="#f7f6e9"/><path d="M91 56v93M57 102h73" stroke="#d2d7bd" stroke-width="4"/><path d="M67 147c8-30 12-25 16-47 9 25 14 38 22 47" fill="#b0c9aa"/><path d="M174 100h74v71h-74z" fill="#c6a782"/><path d="m174 100 14-16h71l-11 16" fill="#dbc19b"/><path d="M210 85v32" stroke="#f3e6c9" stroke-width="10"/><path d="M115 131h72v45h-72z" fill="#ddc7a5"/><path d="m115 131 12-13h66l-6 13" fill="#ebd9be"/><path d="M146 121v24" stroke="#f7eddc" stroke-width="9"/><rect x="190" y="124" width="24" height="9" rx="2" fill="#f6eedf"/><path d="M269 167v-61" stroke="#4c7153" stroke-width="3"/><path d="M269 136c-29-1-37-22-27-35 19 0 31 13 27 35Z" fill="#719565"/><path d="M268 119c-3-22 8-38 26-36 6 19-4 30-26 36Z" fill="#426c4e"/><path d="M255 152h29l-5 24h-19l-5-24Z" fill="#b87958"/><path d="M47 171h60" stroke="#8c9c81" stroke-width="2"/><path d="M302 37v17m-8-8h16" stroke="#b9c9a5" stroke-width="2"/></svg></div>`;
}
function welcome() {
  return `<section class="welcome"><div class="eyebrow"><span class="small-line"></span> 一部手机 · 一场日常冒险</div><div class="welcome-heading"><h1 class="hero-title">来电<span>之间</span><i>Between Calls</i></h1><p class="hero-copy">生活还在继续。<br>每一次接听，都有一个选择。</p></div>${sceneArt()}<div class="start-card"><div class="widget-label"><span>CHAPTER 01</span><span>约 10–15 分钟</span></div><h2>搬家第一天</h2><p>新家还没连上网，快递正在路上。<br>先拿起手机，把今天的事一件件办好。</p>${button(`拿起手机 ${icon('arrow')}`, 'start')}<p class="fine-print">${icon('volume')} 建议开启声音 · 随时可以暂停</p></div><p class="simulation-note">所有人物、来电与支付均为游戏内模拟</p></section>`;
}
function home() {
  const apps = [['shop', '拾物', 'shop', 'sand'], ['network', '云联服务', 'wifi', 'blue'], ['bill', '生活缴费', 'bolt', 'amber'], ['wallet', '零钱包', 'wallet', 'green'], ['notes', '备忘录', 'note', 'yellow'], ['phone', '电话', 'phone', 'green'], ['messages', '消息', 'chat', 'green'], ['settings', '设置', 'settings', 'gray']];
  return `<section class="home-screen"><div class="home-date">9月12日 星期六 ${icon('sun')} 26°</div><div class="home-clock" data-clock>${time(game.time)}</div><p class="greeting">新生活，慢慢来。</p><div class="task-widget"><div class="widget-label"><span>${icon('note')} 今天的小事</span><span>${summarize(game).completed}/3</span></div>${taskRows()}<button class="widget-footer" data-action="go" data-page="notes">搬家第一天 ${icon('arrow')}</button></div><div class="app-grid">${apps.map(([page, label, glyph, color]) => `<button class="app-icon" data-action="go" data-page="${page}"><span class="icon-tile ${color}">${icon(glyph)}${page === 'messages' && unreadCount() ? `<b class="app-badge">${unreadCount()}</b>` : ''}</span><span>${label}</span></button>`).join('')}</div><div class="home-page-dots"><b></b><span></span></div><div class="dock"><button class="dock-app" data-action="go" data-page="phone" aria-label="打开电话">${icon('phone')}</button><button class="dock-app" data-action="go" data-page="messages" aria-label="打开消息">${icon('chat')}</button><button class="dock-app" data-action="go" data-page="notifications" aria-label="打开通知中心">${icon('bell')}</button></div></section>`;
}
const unreadCount = () => Object.values(game.unread).reduce((sum, n) => sum + n, 0);
function messages() {
  const threads = Object.entries(game.threads).filter(([, messages]) => messages.length).sort((a, b) => (b[1].at(-1)?.time || 0) - (a[1].at(-1)?.time || 0));
  return appPage('消息', `<p class="section-label">最近联系</p><div class="thread-list">${threads.map(([id, messages]) => { const last = messages.at(-1); return `<button class="list-row thread-row" data-action="thread" data-id="${id}">${avatar(id)}<span class="row-copy"><span class="row-title">${esc(CONTACTS[id]?.name || id)}<time>${time(last.time)}</time></span><span class="row-sub">${esc(last.text)}</span></span>${game.unread[id] ? `<span class="badge">${game.unread[id]}</span>` : ''}</button>`; }).join('')}</div>`, `<button class="header-action" data-action="go" data-page="notifications" aria-label="通知中心">${icon('bell')}</button>`);
}
function thread() {
  const id = CONTACTS[ui.thread] ? ui.thread : 'landlord';
  const contact = CONTACTS[id];
  const replies = id === 'landlord' ? ['收到，谢谢陈姐', '我再确认一下电费户号'] : ['我先核对一下', '请说明办理事项', '收到，谢谢'];
  return `<section class="app-page thread-page"><header class="app-header"><button class="back" data-action="back" aria-label="返回">${icon('back')}</button><div class="app-title">${esc(contact.name)}<small>${esc(contact.subtitle)}</small></div><button class="header-action" data-action="contact" data-id="${id}" aria-label="联系人详情">${icon('info')}</button></header><div class="chat-scroll" data-scroll="thread-${id}"><p class="chat-date">今天 · 9月12日</p>${(game.threads[id] || []).map(m => `<div class="message ${m.from === 'me' ? 'mine' : ''}">${m.from === 'me' ? '' : avatar(id)}<div class="message-body"><div class="bubble">${esc(m.text).replaceAll('\n', '<br>')}${m.link ? `<button class="message-link" data-action="web" data-web="${esc(m.link)}">${icon('globe')} ${m.link === 'refund' ? '查看赔付办理页面' : '查看安装保障单'} ${icon('next')}</button>` : ''}</div><span class="message-time">${time(m.time)}</span></div></div>`).join('')}</div><div class="quick-replies">${id === 'landlord' ? button(`${icon('copy')} 复制电费户号`, 'copy-account', 'chip') : ''}${replies.map(text => button(esc(text), 'quick-reply', 'chip', `data-text="${esc(text)}"`)).join('')}</div><form class="chat-compose" id="message-form"><input name="message" data-draft="message-${id}" value="${value(`message-${id}`)}" aria-label="消息内容" placeholder="输入消息…" maxlength="120" autocomplete="off"/><button type="submit" aria-label="发送消息">${icon('send')}</button></form></section>`;
}
function shop() {
  return appPage('拾物', `<div class="store-heading"><span class="eyebrow">为生活添一点喜欢</span><h2>我的订单</h2></div><button class="order-card card" data-action="go" data-page="parcel"><div class="widget-label"><span>拾物自营旗舰店 ${icon('next')}</span><span class="order-state">运输中</span></div><div class="product-row"><div class="product-illustration" aria-hidden="true"><i></i><i></i><b></b></div><div><h3>轻舟双频无线路由器</h3><p class="muted">奶油白 · 标准版</p><strong>¥ 239.00</strong></div></div><div class="order-footer"><span>订单尾号 7306</span><span>查看物流 ${icon('next')}</span></div></button><div class="card quiet-card">${icon('shop')}<p>新家的第一件小物，正在来的路上。</p></div>`, '', 'shop-page');
}
function parcel() {
  return appPage('订单详情', `<div class="order-hero"><span class="eyebrow">拾物 · 订单 202609127306</span><h2>${game.tasks.delivery ? '投递安排已更新' : '包裹正在派送'}</h2><p>${game.tasks.delivery ? esc(game.tasks.delivery) : '预计今天送达，请保持电话畅通'}</p></div><div class="card"><div class="product-row"><div class="product-illustration" aria-hidden="true"><i></i><i></i><b></b></div><div><h3>轻舟双频无线路由器</h3><p class="muted">奶油白 · 数量 1</p><strong>¥ 239.00 · 已付款</strong></div></div></div><div class="card"><div class="widget-label"><span>物流动态</span><span>今天</span></div><div class="timeline"><div class="timeline-item current"><strong>${game.tasks.delivery ? '改投申请已受理' : '派件员小周正在派送'}</strong><p>${game.tasks.delivery ? esc(game.tasks.delivery) : '原投递地址：晴川公寓门卫室'}</p></div><div class="timeline-item"><strong>已到达青禾梧桐营业点</strong><p>08:32 · 包裹外观完好</p></div><div class="timeline-item"><strong>包裹已出库</strong><p>昨天 17:16 · 青禾分拨中心</p></div></div></div>${button(`${icon('shop')} 修改投递位置`, 'go', 'primary', 'data-page="delivery"')}<div class="card service-links">${row('联系派件员', '从当前订单发起联系', 'call', 'phone', 'data-id="courier"')}${row('订单客服', '查询物流与售后记录', 'verify', 'chat', 'data-topic="parcel"')}</div><p class="fine-print">售后状态：${game.evidence.includes('parcel') ? '已查询' : '暂无售后申请'} · 支付方式：零钱包</p>`);
}
function delivery() {
  return appPage('修改投递位置', `<div class="intro-copy"><h2>今天，送到哪里？</h2><p>订单 7306 · 轻舟双频无线路由器</p></div><form id="delivery-form"><p class="field-label">选择收件位置</p>${DESTINATIONS.map((location, i) => `<label class="radio-option"><input type="radio" name="location" value="${esc(location)}" ${game.drafts.location === location || (!game.drafts.location && i === 0) ? 'checked' : ''}/><span><strong>${esc(location)}</strong><small>${location.includes('梧桐') ? '梧桐里南门 · 今日 22:00 前可取件' : '原收件地址'}</small></span></label>`).join('')}${input('delivery-note', '给派件员留言（选填）', '例如：请放在驿站，谢谢')}<div class="form-bottom"><button class="primary" type="submit">确认修改 ${icon('arrow')}</button><p class="fine-print">提交后会向派件员同步新的投递安排。</p></div></form>`);
}
function network() {
  return appPage('云联服务', `<div class="network-hero">${icon('wifi')}<p class="eyebrow">让新生活，连接起来</p><h2>你好，林然</h2><p>你的宽带服务已准备就绪</p></div><div class="card">${row('家庭宽带安装', game.tasks.installation ? `已预约 · ${esc(game.tasks.installation)}` : '待预约 · 梧桐里 8 幢 602', 'go', 'next', 'data-page="installation"')}${row('服务客服', '安装费用、预约与工单查询', 'verify', 'chat', 'data-topic="install"')}</div><div class="card quiet-card"><p class="section-label">当前套餐</p><h3>轻享家庭 500M</h3><p class="muted">首年套餐已支付 · 含首次上门安装</p></div>`);
}
function installation() {
  return appPage('预约安装', `<div class="order-hero"><span class="eyebrow">服务单 YL-0912-602</span><h2>${game.tasks.installation ? '和新家，连上线' : '选个方便的时间'}</h2><p>${game.tasks.installation ? `已预约 ${esc(game.tasks.installation)}` : '安装师傅将在上门前与你联系'}</p></div><div class="card"><dl class="detail-grid"><dt>服务地址</dt><dd>${BILL.address}</dd><dt>联系人</dt><dd>林然 · 游戏角色</dd><dt>套餐费用</dt><dd>¥ 599.00 · 已支付</dd><dt>本次安装费</dt><dd>¥ 0.00</dd><dt>额外保证金</dt><dd>无需支付</dd></dl></div><form id="installation-form"><label class="field"><span class="field-label">今天的可预约时段</span><select class="select" name="slot" data-draft="slot">${SLOTS.map(slot => `<option value="${esc(slot)}" ${(game.drafts.slot || game.tasks.installation || SLOTS[0]) === slot ? 'selected' : ''}>${esc(slot)}</option>`).join('')}</select></label>${input('install-note', '上门备注（选填）', '例如：到门口请打电话')}<button class="primary" type="submit">${game.tasks.installation ? '更新预约时间' : '确认预约'} ${icon('arrow')}</button></form><div class="card service-links">${row('核对这笔服务订单', '向云联服务客服查询', 'verify', 'chat', 'data-topic="install"')}${game.tasks.installation ? row('联系安装师傅', '通过服务订单发起联系', 'call', 'phone', 'data-id="installer"') : ''}</div>`);
}
function bill() {
  const found = game.flags.billLookedUp;
  return appPage('生活缴费', `<div class="bill-hero"><span class="bill-icon">${icon('bolt')}</span><div><h2>电费</h2><p>青禾市供电服务</p></div></div>${game.tasks.bill ? `<div class="success-card">${icon('check')}<h2>这笔账单已缴清</h2><p>${BILL.address}</p><strong>¥ ${money(BILL.amount)}</strong></div>${button('查看缴费回执', 'go', 'secondary', 'data-page="wallet"')}` : `<form id="bill-lookup-form">${input('account', '缴费户号', '请输入租房资料中的 10 位户号', 'numeric')}<button class="primary" type="submit">查询账单 ${icon('arrow')}</button></form><p class="fine-print">户号可在房东发来的租房资料中找到。</p>${button('查看与房东的聊天', 'thread', 'text-button', 'data-id="landlord"')}${found ? `<div class="card bill-result"><div class="widget-label"><span>待缴账单</span><span>2026年9月</span></div><h3>${BILL.address}</h3><p class="muted">户号 ${BILL.account}</p><div class="amount"><small>¥</small> ${money(BILL.amount)}</div><dl class="detail-grid"><dt>收款单位</dt><dd>${BILL.payee}</dd><dt>缴费状态</dt><dd>待缴费</dd></dl>${button('核对并缴费', 'go', 'primary', 'data-page="bill-confirm"')}</div>` : ''}`}`);
}
function billConfirm() {
  return appPage('确认缴费', `<div class="receipt"><span class="eyebrow">电费缴纳</span><h2>${BILL.payee}</h2><div class="amount"><small>¥</small> ${money(BILL.amount)}</div><dl class="detail-grid"><dt>缴费户号</dt><dd>${BILL.account}</dd><dt>地址</dt><dd>${BILL.address}</dd><dt>支付方式</dt><dd>零钱包 · 余额 ¥ ${money(game.balance)}</dd></dl></div><form id="bill-pay-form">${button(game.flags.billCodeRequested ? '重新发送验证码' : '获取付款验证码', 'request-code', 'secondary', 'data-purpose="bill"')}${input('bill-code', '付款验证码', '查看零钱包发来的短信', 'numeric')}<button class="primary" type="submit" ${game.tasks.bill ? 'disabled' : ''}>${game.tasks.bill ? '已完成支付' : `确认支付 ¥ ${money(BILL.amount)}`}</button></form>${button('打开短信查看验证码', 'thread', 'text-button', 'data-id="wallet"')}<p class="fine-print">请核对本次付款用途、金额和收款单位。</p>`);
}
function wallet() {
  return appPage('零钱包', `<div class="wallet-card"><span>可用余额（元）</span><div class="balance">${money(game.balance)}</div><p>林然的生活账户</p></div><div class="widget-label section-label"><span>账单记录</span><span>${game.transactions.length} 笔</span></div><div class="card">${game.transactions.length ? game.transactions.map(t => `<div class="transaction"><span class="transaction-icon">${icon(t.kind === 'bill' ? 'bolt' : 'wallet')}</span><div class="row-copy"><strong>${esc(t.payee)}</strong><small>${esc(t.purpose)} · ${time(t.time)}</small></div><strong class="negative">−${money(t.amount)}</strong></div>`).join('') : '<div class="empty">今天还没有新的支出</div>'}</div><div class="card">${row('账户与设备', game.flags.accountSecured ? '已暂停新设备登录' : '查看登录提醒与账户保护', 'account', 'shield')}${row('支付通知', '查看验证消息与收支提醒', 'thread', 'chat', 'data-id="wallet"')}</div>`);
}
function browserPage() {
  const refund = ui.web === 'refund';
  const address = refund ? 'https://parcel-care.example/claim/7306' : 'https://yunlian-service.example/install/602';
  const done = refund ? game.leaks.length > 0 : game.transactions.some(t => t.kind === 'deposit');
  const content = `<div class="browser-bar">${icon('globe')}<span class="url">${address}</span><button class="header-action" data-action="go" data-page="home" aria-label="关闭网页">${icon('close')}</button></div><div class="web-page"><div class="web-brand">${icon(refund ? 'shop' : 'wifi')} ${refund ? '包裹服务中心' : '云联安装服务'}</div><div class="web-hero"><span>在线业务办理</span><h2>${refund ? '包裹赔付申请' : '安装履约保障'}</h2><p>${refund ? '订单尾号 7306 · 轻舟双频无线路由器' : '服务地址：梧桐里 8 幢 602'}</p></div>${done ? `<div class="web-panel"><div class="success-card">${icon('check')}<h3>${refund ? '资料已提交' : '款项已提交'}</h3><p>${refund ? '请等待工作人员进一步联系。' : '工作人员正在为你处理保障单。'}</p></div>${button('返回手机桌面', 'go', 'secondary', 'data-page="home"')}${button('查看零钱包', 'go', 'text-button', 'data-page="wallet"')}</div>` : refund ? `<div class="web-panel"><div class="widget-label"><span>预计赔付</span><span>运输赔付</span></div><div class="amount"><small>¥</small> 300.00</div><p class="muted">请完成账户验证，以便受理赔付。</p><div class="web-warning">${icon('info')} 系统提示：当前账户尚未完成关联，请获取并提交验证信息。</div><form id="refund-form">${button(game.flags.refundCodeRequested ? '重新获取验证信息' : '获取账户验证信息', 'request-code', 'secondary', 'data-purpose="refund"')}${input('refund-code', '短信验证码', '输入收到的 6 位验证码', 'numeric')}<button class="primary" type="submit">提交赔付申请</button></form></div>` : `<div class="web-panel"><span class="section-label">预约履约保证金</span><div class="amount"><small>¥</small> 499.00</div><p>本次安装需先完成保障登记，工作人员称安装完成后将退还。</p><dl class="detail-grid"><dt>收款方</dt><dd>林某 · 个人收款账户</dd><dt>用途</dt><dd>安装履约保障</dd><dt>服务单</dt><dd>YL-0912-602</dd></dl>${button('前往确认付款', 'deposit-confirm', 'primary')}<p class="fine-print">请以本页工作人员提供的办理说明为准。</p></div>`}<p class="web-footnote">页面提供方：${refund ? '包裹服务中心' : '安装服务办理中心'}</p></div>`;
  return appPage('网页', content, '', 'browser-page');
}
function notes() {
  const completed = summarize(game).completed;
  return appPage('备忘录', `<div class="note-paper"><div class="note-meta">9月12日 08:30</div><h2 class="note-title">搬家第一天 ☀</h2><p>钥匙拿到了。<br>箱子可以慢慢拆，先把这几件事办好。</p><div class="note-tasks">${taskRows()}</div><div class="note-line"></div><h3>新家的信息</h3><p>梧桐里 8 幢 602<br>快递放南门的「梧桐里便民驿站」<br>宽带今天下午安装。</p><h3>陈姐说</h3><p>电费户号在聊天记录里。安装套餐已经付过钱，记得看看订单明细。</p><p class="note-signature">一步一步，生活会就位。</p></div>${button(completed === 3 ? '今天的事办好了 · 查看复盘' : `暂时收工 · 查看进度 ${completed}/3`, 'finish-confirm', 'secondary')}<p class="fine-print">随时可以收工复盘，也可以继续把事务办完。</p>`, '', 'notes-page');
}
function phone() {
  const history = game.callHistory;
  return appPage('电话', `<div class="phone-tabs">${button('通话记录', 'phone-tab', `chip ${ui.phoneTab === 'recent' ? 'selected' : ''}`, 'data-tab="recent"')}${button('拨号键盘', 'phone-tab', `chip ${ui.phoneTab === 'dial' ? 'selected' : ''}`, 'data-tab="dial"')}</div>${ui.phoneTab === 'dial' ? `<input class="dial-number" aria-label="电话号码" value="${esc(ui.dial)}" inputmode="tel" maxlength="20" id="dial-input"/><div class="dialpad">${'123456789*0#'.split('').map(n => button(n, 'dial-digit', '', `data-digit="${n}"`)).join('')}</div><div class="dial-actions">${button(icon('phone'), 'dial-call', 'call-button accept', 'aria-label="拨打号码"')}${button('删除', 'dial-delete', 'text-button')}</div><p class="fine-print">可拨打游戏联系人号码，所有通话均为模拟。</p>` : `<p class="section-label">最近通话</p><div class="card">${history.length ? history.map(c => `<button class="list-row" data-action="call" data-id="${c.id}">${avatar(c.id)}<span class="row-copy"><span class="row-title">${esc(CONTACTS[c.id]?.name)}</span><span class="row-sub">${({ missed: '未接来电', declined: '已拒接', completed: '已通话' })[c.status] || '已通话'} · ${time(c.time)}${c.duration ? ` · ${duration(c.duration)}` : ''}</span></span>${icon('phone')}</button>`).join('') : '<div class="empty">暂时没有通话记录</div>'}</div><p class="section-label">已有联系人</p><div class="card">${['landlord', 'courier', 'installer'].map(id => `<button class="list-row" data-action="contact" data-id="${id}">${avatar(id)}<span class="row-copy"><span class="row-title">${esc(CONTACTS[id].name)}</span><span class="row-sub">${esc(CONTACTS[id].number)}</span></span>${icon('next')}</button>`).join('')}</div>`}`);
}
function notifications() {
  return appPage('通知中心', `<p class="section-label">今天 · ${game.notifications.length} 条通知</p><div class="notification-list">${[...game.notifications].reverse().map(n => `<button class="notification-item" data-action="thread" data-id="${esc(n.thread)}">${avatar(n.thread)}<span class="row-copy"><span class="row-title">${esc(n.title)}<time>${time(n.time)}</time></span><span class="notification-copy">${esc(n.text)}</span></span></button>`).join('') || '<div class="empty">暂时没有新通知</div>'}</div>`);
}
function settings() {
  return appPage('设置', `<div class="card"><div class="settings-row"><div><strong>游戏声音</strong><p class="muted">来电、语音与消息提示</p></div><button class="switch ${ui.muted ? '' : 'on'}" role="switch" aria-checked="${!ui.muted}" aria-label="游戏声音" data-action="sound"><span></span></button></div><div class="settings-row"><div><strong>通话字幕</strong><p class="muted">始终显示，静音时也可完整游玩</p></div>${icon('check')}</div></div><div class="card">${row('查看今天的进度', `${summarize(game).completed} / 3 件事已办好`, 'go', 'note', 'data-page="notes"')}${row('重新开始这一章', '清除本章进度，回到搬家第一天', 'restart-confirm', 'arrow')}</div><div class="settings-about"><p class="eyebrow">BETWEEN CALLS</p><h2>来电之间</h2><p>第一章 · 搬家第一天</p><p class="muted">所有来电、消息、个人资料、网页和支付均为虚构模拟。无需提供你的真实信息。</p><p class="muted">进度保存在这台设备的浏览器中。离开页面时剧情暂停。</p></div>`);
}
function review() {
  const result = summarize(game);
  return appPage('今日复盘', `<div class="review-hero"><span class="eyebrow">CHAPTER 01 · 搬家第一天</span><div class="review-symbol">${icon(result.passed ? 'sun' : 'note')}</div><h2>${esc(result.title)}</h2><p>${result.passed ? '新家安顿好了，也守住了自己的节奏。' : result.completed < 3 ? '有些事还没办完。暂停一下，也是一种选择。' : '事情办好了，有些选择值得再看一次。'}</p></div><div class="review-stats"><div class="stat"><strong>${result.completed}<small>/3</small></strong><span>生活事务</span></div><div class="stat"><strong><small>¥</small>${money(result.loss)}</strong><span>受骗支出</span></div><div class="stat"><strong>${game.leaks.length}</strong><span>敏感信息泄露</span></div></div><div class="card review-lessons"><h3>你留下的判断依据</h3>${game.evidence.length ? game.evidence.map(e => `<p>${icon('check')} ${esc(({ parcel: '通过拾物订单客服核对了包裹与售后', install: '通过云联原服务订单核对了安装费用', bill: '核对了供电户号与账单地址' })[e] || e)}</p>`).join('') : '<p class="muted">本次没有留下客服核验记录。你也可以通过已有业务入口安全办事。</p>'}${game.leaks.length ? `<div class="review-insight"><strong>赔付页面拿到的是登录权限</strong><p>短信写明了“新设备登录”，把它提交到赔付网页会泄露账户验证信息。${game.flags.accountSecured ? '你随后暂停了新设备登录，但已经发生的泄露仍保留在记录中。' : '可以返回零钱包，在账户与设备中暂停新设备登录。'}</p></div>` : ''}${result.loss ? '<div class="review-insight"><strong>原订单已经包含安装费用</strong><p>额外的 499 元转给了个人账户。原服务订单和客服提供了可独立核对的费用记录。</p></div>' : ''}<p class="muted">接听或打开页面本身不等于受骗；结果取决于你实际提交的信息和确认的付款。</p></div><div class="widget-label section-label"><span>你的操作时间线</span><span>${game.logs.length} 条记录</span></div><div class="review-timeline">${game.logs.map(log => `<div class="review-event"><time>${time(log.time)}</time><p>${esc(log.text)}</p></div>`).join('')}</div><div class="review-actions">${button(result.completed < 3 || !result.safe ? '回到手机，继续处理' : '回到手机', 'resume', 'primary')}${readStore(CHECKPOINT) ? button('回到最近的关键选择前', 'retry-confirm', 'secondary') : ''}${button('重新体验这一章', 'restart-confirm', 'text-button')}</div>`);
}
function callOverlay() {
  const call = game.call;
  if (!call || (call.phase === 'connected' && !ui.callExpanded)) return '';
  const c = CONTACTS[call.id];
  const connected = call.phase === 'connected';
  return `<section class="call-overlay ${connected ? 'connected' : 'ringing'}" role="dialog" aria-modal="true" aria-label="${esc(c.name)}的${connected ? '通话' : '来电'}"><div class="call-topline"><span>${connected ? '通话中' : '来电'}</span><span>模拟通话</span></div>${avatar(call.id, true)}<h2 class="caller-name">${esc(c.name)}</h2><p class="caller-sub">${esc(c.number)}</p><p class="call-time" data-call-time>${connected ? duration(call.elapsed) : '手机来电'}</p>${connected ? `<div class="call-transcript"><span class="eyebrow">通话字幕</span><p>${esc(call.text || c.lines[call.turn] || c.lines[0])}</p><button class="text-button" data-action="replay">${icon('volume')} 再听一遍</button></div><div class="call-options"><span class="field-label">你可以这样回应</span>${call.turn < c.lines.length - 1 ? button('您继续，我在听', 'call-continue', 'secondary') : ''}${c.replies.map((r, index) => button(esc(r.label), 'call-reply', 'secondary', `data-index="${index}"`)).join('')}</div><div class="call-utilities">${button(`${icon(ui.muted ? 'mute' : 'volume')} ${ui.muted ? '开启声音' : '静音'}`, 'sound', 'text-button')}${button(`${icon('grid')} 回桌面查资料`, 'minimize-call', 'text-button')}</div><div class="call-actions"><div>${button(icon('phone'), 'hangup', 'call-button decline', 'aria-label="挂断电话"')}<span>挂断</span></div></div>` : `<p class="call-incoming-hint">停一停，按自己的节奏来。</p><div class="call-actions"><div>${button(icon('phone'), 'decline', 'call-button decline', 'aria-label="拒接电话"')}<span>拒接</span></div><div>${button(icon('phone'), 'answer', 'call-button accept', 'aria-label="接听电话"')}<span>接听</span></div></div>`}</section>`;
}
function modal() {
  if (!ui.modal) return '';
  const m = ui.modal;
  let content = '';
  if (m.type === 'contact') { const c = CONTACTS[m.id]; content = `${avatar(m.id)}<h2>${esc(c.name)}</h2><p>${esc(c.subtitle)}</p><p class="contact-number">${esc(c.number)}</p><div class="modal-actions">${button(`${icon('phone')} 拨打电话`, 'call', 'primary', `data-id="${m.id}"`)}${button('发送消息', 'thread', 'secondary', `data-id="${m.id}"`)}${['parcel', 'supervisor'].includes(m.id) ? button('向原平台提交联系记录', 'report', 'text-button', `data-topic="${m.id === 'parcel' ? 'parcel' : 'install'}"`) : ''}</div>`; }
  if (m.type === 'deposit') content = `<span class="eyebrow">零钱包 · 确认付款</span><h2>¥ 499.00</h2><dl class="detail-grid"><dt>收款方</dt><dd>林某 · 个人收款账户</dd><dt>用途</dt><dd>安装履约保障</dd><dt>付款方式</dt><dd>零钱包余额</dd></dl><div class="modal-actions">${button('确认转账 ¥ 499.00', 'pay-deposit')}${button('暂不付款', 'close-modal', 'secondary')}</div>`;
  if (m.type === 'account') content = `<h2>账户与设备</h2><p>${game.leaks.length ? '检测到一条新设备验证记录。若非本人操作，可暂停新的设备登录。' : '你可以在此暂停新设备登录，并通过支付通知查看验证用途。'}</p><div class="modal-actions">${button(game.flags.accountSecured ? '已暂停新设备登录' : '暂停新设备登录', 'secure', 'primary', game.flags.accountSecured ? 'disabled' : '')}${button('查看支付通知', 'thread', 'secondary', 'data-id="wallet"')}</div>`;
  if (m.type === 'finish') content = `<h2>${summarize(game).completed === 3 ? '今天的小事，都办妥了' : '现在收工吗？'}</h2><p>已完成 ${summarize(game).completed}/3 件事务。复盘会保留你的实际操作记录，之后也可以继续处理。</p><div class="modal-actions">${button('查看今日复盘', 'finish')}${button('再忙一会儿', 'close-modal', 'secondary')}</div>`;
  if (m.type === 'restart') content = `<h2>重新开始这一章？</h2><p>当前进度和关键选择存档将被清除。你会重新拿到搬家第一天的手机。</p><div class="modal-actions">${button('重新开始', 'restart', 'danger')}${button('保留当前进度', 'close-modal', 'secondary')}</div>`;
  if (m.type === 'retry') content = `<h2>回到关键选择前？</h2><p>手机、钱包、消息和操作记录会一起恢复到最近一次打开业务链接之前。</p><div class="modal-actions">${button('恢复并重新选择', 'retry')}${button('保留当前进度', 'close-modal', 'secondary')}</div>`;
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${esc(m.type === 'contact' ? '联系人详情' : '确认操作')}"><button class="modal-close header-action" data-action="close-modal" aria-label="关闭">${icon('close')}</button>${content}</section></div>`;
}
function render() {
  captureScroll();
  const focused = document.activeElement;
  const focusName = focused?.dataset.draft || focused?.id;
  const selection = typeof focused?.selectionStart === 'number' ? [focused.selectionStart, focused.selectionEnd] : null;
  const views = { welcome, home, messages, thread, shop, parcel, delivery, network, installation, bill, 'bill-confirm': billConfirm, wallet, browser: browserPage, notes, phone, settings, review, notifications };
  const overlay = Boolean(game.call && (game.call.phase === 'ringing' || ui.callExpanded));
  root.innerHTML = `<main class="stage"><aside class="editorial left"><a class="brand-mark" href="#" data-action="go" data-page="${game.started ? 'home' : 'welcome'}">${icon('phone')} 来电之间</a><div class="editorial-main"><span class="eyebrow">A LITTLE LIFE. REAL CHOICES.</span><h2>那些看似<br>平常的<span>来电。</span></h2><p>一部手机，一天生活。<br>在纷至沓来的消息里，<br>找到自己的判断。</p><div class="editorial-rule"></div><span class="editorial-chapter">01 / 搬家第一天</span></div><p class="editorial-footer">慢一点，也没关系。</p></aside><div class="phone ${ui.page === 'home' ? 'is-home' : ''} ${ui.page === 'welcome' ? 'is-welcome' : ''}"><header class="statusbar"><button data-action="go" data-page="notifications" ${game.started ? '' : 'disabled'} aria-label="查看通知"><span data-clock>${time(game.time)}</span></button><span class="status-island"></span><span class="status-icons"><svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true"><path d="M1 10V9m4 1V6m4 4V3m4 7V1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>${icon('wifi')}<span class="battery"><i></i></span></span></header>${game.call?.phase === 'connected' && !ui.callExpanded ? `<button class="active-call-strip" data-action="expand-call">${icon('phone')} ${esc(CONTACTS[game.call.id].name)} · <span data-call-time>${duration(game.call.elapsed)}</span><span>返回通话 ${icon('next')}</span></button>` : ''}<div class="screen" ${overlay || ui.modal ? 'inert' : ''}>${(views[ui.page] || home)()}</div><nav class="bottom-nav" aria-label="手机导航" ${overlay || ui.modal || !game.started ? 'inert' : ''}><button data-action="back" aria-label="返回上一页">${icon('back')}</button><button class="home-button" data-action="go" data-page="${game.ended ? 'review' : 'home'}" aria-label="返回桌面"><span></span></button><button data-action="go" data-page="notes" aria-label="查看待办">${icon('note')}</button></nav><div class="toast-stack"><div id="notification-banner"></div><div class="toast-message" id="toast-message" role="status" hidden></div></div>${callOverlay()}${modal()}</div><aside class="editorial right"><div class="chapter-stamp"><span>第 一 章</span><strong>一切，<br>正在就位。</strong><p>快递 / 宽带 / 新家的电费</p></div><div class="play-notes"><div>${icon('volume')}<span>戴上耳机，更有临场感</span></div><div>${icon('clock')}<span>按自己的节奏，约 10–15 分钟</span></div><div>${icon('shield')}<span>所有来电与支付均为模拟</span></div></div><span class="edition">INTERACTIVE PHONE STORY / 2026</span></aside></main>`;
  document.querySelectorAll('[data-scroll]').forEach(el => { const stored = ui.scrolls[el.dataset.scroll]; el.scrollTop = stored ?? (el.classList.contains('chat-scroll') ? el.scrollHeight : 0); });
  if (focusName && !overlay && !ui.modal) {
    const target = [...document.querySelectorAll('input,select,textarea')].find(el => el.dataset.draft === focusName || el.id === focusName);
    if (target) { target.focus({ preventScroll: true }); if (selection && target.setSelectionRange && target.type !== 'number') { try { target.setSelectionRange(...selection); } catch {} } }
  }
  updateToast(); renderNotification(); syncAudio();
}
function renderNotification() {
  const el = document.querySelector('#notification-banner');
  if (!el) return;
  const n = visibleNotification;
  el.innerHTML = n && !game.call && !ui.modal ? `<article class="notification" data-notification="${n.id}"><button class="notification-main" data-action="thread" data-id="${esc(n.thread)}">${avatar(n.thread)}<span class="row-copy"><span class="row-title">${esc(n.title)}<time>现在</time></span><span class="notification-copy">${esc(n.text)}</span></span></button><button class="notification-dismiss" data-action="dismiss-notification" aria-label="划走通知">${icon('close')}</button></article>` : '';
}
function syncAudio(force = false) {
  if (!audioReady || document.hidden) return;
  const call = game.call;
  const key = call ? `${call.id}:${call.phase}:${call.turn}:${call.text || ''}` : '';
  if (key === audioKey && !force) return;
  audioKey = key;
  stopRing(); stopSpeech();
  if (call?.phase === 'ringing') playRing();
  if (call?.phase === 'connected') speak(call.text || CONTACTS[call.id].lines[call.turn] || CONTACTS[call.id].lines[0], () => {
    if (!game.ended && !document.hidden && game.call === call && !call.text && call.turn < CONTACTS[call.id].lines.length - 1) {
      perform('call-continue');
    }
  });
}
function refreshEffects() {
  if (game.notifications.length > lastNotificationCount) {
    visibleNotification = game.notifications.at(-1);
    if (audioReady) playNotification();
    clearTimeout(notificationTimer);
    notificationTimer = setTimeout(() => { visibleNotification = null; renderNotification(); }, 7000);
  }
  lastNotificationCount = game.notifications.length;
  if (ui.page === 'thread' && !game.call && !ui.modal) {
    act(game, { type: 'read-thread', id: ui.thread });
    if (visibleNotification?.thread === ui.thread) visibleNotification = null;
  }
  if (game.call?.id !== lastCall) { ui.callExpanded = true; lastCall = game.call?.id; }
  syncAudio();
}

root.addEventListener('input', e => {
  if (e.target.dataset.draft) { game.drafts[e.target.dataset.draft] = e.target.value; save(); }
  if (e.target.id === 'dial-input') ui.dial = e.target.value.replace(/[^0-9*#+ -]/g, '').slice(0, 20);
});
root.addEventListener('change', e => {
  if (e.target.name === 'location') { game.drafts.location = e.target.value; save(); }
  if (e.target.dataset.draft) { game.drafts[e.target.dataset.draft] = e.target.value; save(); }
});
root.addEventListener('submit', e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  if (e.target.id === 'message-form') {
    if (perform('send-message', { id: ui.thread, text: data.message })) { game.drafts[`message-${ui.thread}`] = ''; ui.scrolls[`thread-${ui.thread}`] = 999999; render(); save(); }
  }
  if (e.target.id === 'delivery-form' && perform('redirect', { location: data.location, note: data['delivery-note'] }, '投递安排已更新')) go('parcel');
  if (e.target.id === 'installation-form') perform('book', { slot: data.slot, note: data['install-note'] }, '预约已确认，请留意服务通知');
  if (e.target.id === 'bill-lookup-form') perform('lookup-bill', { account: data.account.trim() });
  if (e.target.id === 'bill-pay-form' && perform('pay-bill', { code: data['bill-code'].trim() }, '支付成功，账单已缴清')) go('bill');
  if (e.target.id === 'refund-form') perform('submit-refund', { code: data['refund-code'].trim() }, '资料已提交');
});
root.addEventListener('click', async e => {
  if (suppressClick) { suppressClick = false; e.preventDefault(); return; }
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  e.preventDefault();
  const a = el.dataset.action;
  if ((!audioReady && game.started) || ['start', 'answer', 'call', 'dial-call', 'sound', 'replay'].includes(a)) { await unlockAudio(); audioReady = true; setMuted(ui.muted); }
  if (a === 'start') { if (perform('start')) go('home', {}, true); }
  else if (a === 'go') { if (pages.includes(el.dataset.page)) go(el.dataset.page); }
  else if (a === 'back') back();
  else if (a === 'thread') { visibleNotification = null; go('thread', { thread: el.dataset.id }); }
  else if (a === 'web') openWeb(el.dataset.web);
  else if (a === 'copy-account') {
    try { await navigator.clipboard.writeText(BILL.account); showToast('电费户号已复制'); }
    catch { showToast('请长按聊天中的户号，选择复制。'); }
  }
  else if (a === 'report') {
    const topic = el.dataset.topic;
    ui.modal = null;
    if (perform('report', { topic }, '联系记录已保存并提交')) go('thread', { thread: topic === 'parcel' ? 'shop' : 'network' });
  }
  else if (a === 'request-code') perform('request-code', { purpose: el.dataset.purpose }, '验证消息已发送到「消息」');
  else if (a === 'verify') { if (perform('verify', { topic: el.dataset.topic })) go('thread', { thread: el.dataset.topic === 'parcel' ? 'shop' : 'network' }); }
  else if (a === 'contact') { ui.modal = { type: 'contact', id: el.dataset.id }; render(); }
  else if (a === 'quick-reply') { perform('send-message', { id: ui.thread, text: el.dataset.text }); ui.scrolls[`thread-${ui.thread}`] = 999999; render(); }
  else if (a === 'call') { ui.modal = null; ui.callExpanded = true; perform('call-back', { id: el.dataset.id }); }
  else if (a === 'answer') { ui.callExpanded = true; perform('answer-call'); }
  else if (a === 'decline') perform('decline-call');
  else if (a === 'hangup') perform('hangup');
  else if (a === 'call-reply') perform('call-reply', { index: Number(el.dataset.index) });
  else if (a === 'call-continue') perform('call-continue');
  else if (a === 'minimize-call') { ui.callExpanded = false; go('home'); }
  else if (a === 'expand-call') { ui.callExpanded = true; render(); }
  else if (a === 'replay') syncAudio(true);
  else if (a === 'sound') { ui.muted = !ui.muted; setMuted(ui.muted); if (!ui.muted) syncAudio(true); render(); save(); }
  else if (a === 'phone-tab') { ui.phoneTab = el.dataset.tab; render(); }
  else if (a === 'dial-digit') { ui.dial = (ui.dial + el.dataset.digit).slice(0, 20); render(); }
  else if (a === 'dial-delete') { ui.dial = ui.dial.slice(0, -1); render(); }
  else if (a === 'dial-call') { const id = Object.keys(CONTACTS).find(id => CONTACTS[id].number.replace(/\D/g, '') === ui.dial.replace(/\D/g, '')); if (id) perform('call-back', { id }); else showToast('这个号码不在本章联系人中，请核对后再拨。'); }
  else if (a === 'deposit-confirm') { ui.modal = { type: 'deposit' }; render(); }
  else if (a === 'pay-deposit') { ui.modal = null; perform('pay-deposit', {}, '付款已提交'); }
  else if (a === 'account') { ui.modal = { type: 'account' }; render(); }
  else if (a === 'secure') { if (perform('secure-account', {}, '已暂停新设备登录')) { ui.modal = null; render(); } }
  else if (a === 'close-modal') { ui.modal = null; render(); }
  else if (a === 'finish-confirm') { ui.modal = { type: 'finish' }; render(); }
  else if (a === 'finish') { ui.modal = null; if (perform('finish')) { stopRing(); stopSpeech(); go('review'); } }
  else if (a === 'resume') { if (perform('resume')) go('home'); }
  else if (a === 'restart-confirm') { ui.modal = { type: 'restart' }; render(); }
  else if (a === 'retry-confirm') { ui.modal = { type: 'retry' }; render(); }
  else if (a === 'retry') { const snapshot = readStore(CHECKPOINT); if (snapshot?.game) { stopRing(); stopSpeech(); game = restoreGame(snapshot.game); ui = { ...ui, modal: null, page: game.started ? 'home' : 'welcome', history: [], scrolls: {}, callExpanded: true }; lastNotificationCount = game.notifications.length; visibleNotification = null; audioKey = ''; render(); save(); } }
  else if (a === 'restart') { stopRing(); stopSpeech(); game = createGame(); ui = { ...ui, page: 'welcome', modal: null, history: [], scrolls: {}, callExpanded: true }; visibleNotification = null; lastNotificationCount = 0; audioKey = ''; try { localStorage.removeItem(CHECKPOINT); } catch {} render(); save(); }
  else if (a === 'dismiss-notification') { visibleNotification = null; renderNotification(); }
});
let swipeStart;
let suppressClick = false;
root.addEventListener('pointerdown', e => { if (e.target.closest('.notification')) swipeStart = { x: e.clientX, y: e.clientY }; });
root.addEventListener('pointerup', e => { if (swipeStart && (Math.abs(e.clientX - swipeStart.x) > 50 || swipeStart.y - e.clientY > 35)) { visibleNotification = null; suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); renderNotification(); } swipeStart = null; });
root.addEventListener('pointercancel', () => { swipeStart = null; });
root.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (ui.modal) { ui.modal = null; render(); } else if (game.call?.phase === 'connected') { ui.callExpanded = false; render(); } else if (!game.call) back(); }
  if (e.key === 'Tab' && (ui.modal || (game.call && (ui.callExpanded || game.call.phase === 'ringing')))) {
    const dialog = document.querySelector(ui.modal ? '.modal' : '.call-overlay');
    const focusable = [...dialog.querySelectorAll('button:not([disabled]),input,select,[tabindex="0"]')];
    const first = focusable[0], last = focusable.at(-1);
    if (e.shiftKey && (!dialog.contains(document.activeElement) || document.activeElement === first)) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && (!dialog.contains(document.activeElement) || document.activeElement === last)) { e.preventDefault(); first?.focus(); }
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pauseAudio(); captureScroll(); save(); }
  else { resumeAudio(); syncAudio(); }
});
window.addEventListener('pagehide', () => { pauseAudio(); captureScroll(); save(); });
window.addEventListener('pageshow', () => { if (!document.hidden) { resumeAudio(); syncAudio(); } });
setInterval(() => {
  if (!game.started || game.ended || document.hidden) return;
  const signature = `${game.logs.length}:${game.notifications.length}:${game.call?.id}:${game.call?.phase}:${game.call?.turn}:${Object.values(game.threads).reduce((n, messages) => n + messages.length, 0)}`;
  tick(game, 1);
  const next = `${game.logs.length}:${game.notifications.length}:${game.call?.id}:${game.call?.phase}:${game.call?.turn}:${Object.values(game.threads).reduce((n, messages) => n + messages.length, 0)}`;
  refreshEffects();
  if (signature !== next) render();
  document.querySelectorAll('[data-clock]').forEach(el => { el.textContent = time(game.time); });
  document.querySelectorAll('[data-call-time]').forEach(el => { el.textContent = game.call?.phase === 'connected' ? duration(game.call.elapsed) : '手机来电'; });
  save();
}, 1000);
setMuted(ui.muted);
render();
