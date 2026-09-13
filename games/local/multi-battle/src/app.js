import { CARDS, FAMILIES, PRICES, UPGRADE_COSTS, SHOP_WEIGHTS } from './content.js';
import { def, stats, formatNumber, encode } from './shared.js';
import { portrait } from './art.js';
import { mapMarkup, animateMap } from './scene.js';
import { installDrag } from './drag.js';
import { applyAction } from './economy.js';
import { newGame, dispatch, beginBattle, finishBattle, nextRound, opponent, standings } from './game.js';
import { loadGame, saveGame, exportGame, importGame } from './storage.js';
import { isMuted, toggleMute, unlockAudio, sound } from './audio.js';

const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const typeNames = { character: '角色', spell: '法术', equipment: '装备', token: '召唤物' };
const icons = {
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 7v10M15 9h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9"/>',
  heart: '<path d="M12 20 3.8 12a5 5 0 0 1 7.1-7.1L12 6l1.1-1.1a5 5 0 0 1 7.1 7.1Z"/>',
  sword: '<path d="m6 18 13-13 1 5-10 10M5 14l5 5M3 21l4-4M18 4l3-1-1 3"/>',
  shield: '<path d="m12 3 8 3v6c0 4-8 9-8 9s-8-5-8-9V6Z"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5M19 11A7 7 0 0 0 6 6M5 13a7 7 0 0 0 13 5"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  up: '<path d="M12 20V4m-6 6 6-6 6 6M5 20h14"/>',
  book: '<path d="M12 6v15M12 6C8 2 2 4 2 4v15s6-2 10 2c4-4 10-2 10-2V4s-6-2-10 2Z"/>',
  sound: '<path d="m3 9 5 0 5-5v16l-5-5H3ZM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m3 9 5 0 5-5v16l-5-5H3ZM17 9l5 6m0-6-5 6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  crown: '<path d="m3 6 5 5 4-7 4 7 5-5-3 13H6ZM7 22h10"/>',
  spark: '<path d="m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7Z"/>',
  play: '<path d="m8 4 12 8-12 8Z"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.spark}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const abilityText = value => String(value ?? '').replace(/〔gain〕|〔link〕|SpellCast|PaidRerolled|LevelTransferred|LevelsSwapped|AttackResolved/g, word => ({ '〔gain〕': '〔直接成长〕', '〔link〕': '〔联动成长〕', SpellCast: '成功施法', PaidRerolled: '付费刷新', LevelTransferred: '等级转移', LevelsSwapped: '等级交换', AttackResolved: '主动攻击结算' }[word]));
const n = value => formatNumber(value ?? 0);
let loaded;
try { loaded = loadGame(); } catch (error) { loaded = { game: null, error: error.message }; }
let game = loaded.game;
let landing = true;
let selected = null;
let intent = null;
let confirmSell = false;
let frameIndex = game && ['result', 'ended'].includes(game.phase) ? Math.max(0, (game.battle?.frames.length || 1) - 1) : 0;
let playbackTimer = 0;
let paused = false;
let speed = 1;
let toastTimer = 0;
let lastSaveError = '';
let catalogFamily = 'all';
let catalogType = 'all';
let catalogTier = 'all';
let catalogSearch = '';
let modalPage = '';
let returnFocus = null;
let replayFrame = null;
let sceneAnimation = null;
let frameRemaining = 1100;
let frameDeadline = 0;
const frameDuration = () => 1100 / speed;

window.__gameSnapshot = () => game ? encode(game) : null;
const me = () => game?.players[0];
const owned = uid => [...(me()?.board || []), ...(me()?.hand || [])].find(c => c?.uid === uid);
const onBoard = uid => me()?.board.some(c => c?.uid === uid);
const intentSource = (current = intent) => current?.purchaseSlot !== undefined ? me()?.shop[current.purchaseSlot] : owned(current?.uid);
const cardAtSelection = () => selected?.zone === 'shop' ? me()?.shop[selected.slot] : owned(selected?.uid);
const family = d => FAMILIES[d?.family] || FAMILIES.neutral;

function toast(message, error = false) {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.className = `visible ${error ? 'error' : ''}`;
  const feedback = modal.open && modal.querySelector('.modal-feedback');
  if (feedback) { feedback.textContent = message; feedback.className = `modal-feedback ${error ? 'error' : ''}`; }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.className = ''; }, 3500);
  if (error) sound('error');
}

function persist() {
  if (!game) return;
  try {
    const result = saveGame(game);
    if (result?.ok === false) throw new Error(result.error || '无法保存进度');
    lastSaveError = '';
  } catch (error) {
    if (lastSaveError !== error.message) toast(`本局仍可游玩，保存失败：${error.message}。可从菜单导出存档。`, true);
    lastSaveError = error.message;
  }
}

function action(payload) {
  if (!game || game.phase !== 'prep') return toast('请等待战斗结束后再经营。', true);
  try {
    const result = dispatch(game, payload);
    if (!result.ok) { toast(result.error || '当前不能执行此操作。', true); return false; }
    game = result.game;
    selected = null; intent = null; confirmSell = false;
    persist();
    sound(['merge', 'upgrade'].includes(payload.type) ? 'growth' : payload.type === 'cast' ? 'spell' : payload.type === 'buy' ? 'buy' : 'tap');
    const messages = { buy: '已购入手牌，点选后使用。', reroll: '新一批旅人已抵达。', freeze: me().frozen ? '商店已冻结：下回合保留未售商品。' : '已取消冻结。', upgrade: `指挥官已升至 P${me().level}，下次刷新解锁更高品阶。`, merge: '同名角色已叠加，成长永久保留。', equip: '装备已穿戴。', unequip: '装备已回到手牌。', sell: '已出售，获得 1 金。', cast: '法术已生效。', recall: '角色已撤回手牌。', deploy: '阵容已调整。' };
    toast(payload.type === 'buy' && payload.use ? `已购买并${({deploy:'上场',cast:'施法',equip:'穿戴',merge:'叠加'})[payload.use.type]}。` : messages[payload.type] || '操作完成');
    render();
    return true;
  } catch (error) { toast(error.message || '操作失败，请重试。', true); return false; }
}

function header() {
  return `<header class="topbar"><button class="brand" data-action="home" aria-label="万象旅团首页"><span class="brand-seal">${icon('spark')}</span><span>万象旅团<small>THE WANDERING GUILD</small></span></button><div class="top-note">独行，也成阵 <span>·</span> 单人构筑自走棋</div><nav aria-label="工具"><button class="icon-button" data-action="catalog" aria-label="卡牌图鉴">${icon('book')}<span>图鉴</span></button><button class="icon-button" data-action="sound" aria-label="${isMuted() ? '开启音效' : '关闭音效'}">${icon(isMuted() ? 'mute' : 'sound')}</button><button class="icon-button" data-action="menu" aria-label="游戏菜单">${icon('menu')}</button></nav></header>`;
}

function renderLanding() {
  const heroes = ['character.resonance.conductor', 'character.legacy.successor', 'character.ember.queen'];
  app.innerHTML = `${header()}<main class="landing"><div class="landing-copy"><p class="eyebrow"><span></span> THE MARKET OPENS. YOUR STORY BEGINS.</p><h1>招募万象。<br/>自成一派。</h1><p class="landing-intro">在流动的奇幻集市，召集你的旅团。<br/>让每次成长彼此回响，让每一份薪火有所归处。</p><div class="landing-actions"><button class="primary large" data-action="new">开启新旅程 ${icon('arrow')}</button>${game ? `<button class="secondary large" data-action="continue">继续旅程 <small>第 ${game.round} 回合</small></button>` : ''}</div><p class="landing-meta">1 位玩家 <i>·</i> 7 位本地模拟对手 <i>·</i> 随时暂停</p>${loaded.error ? `<div class="storage-warning" role="alert">原存档暂时无法读取：${esc(loaded.error)}。不会自动覆盖，可从菜单导入备份。</div>` : ''}<button class="text-button" data-action="help">第一次来到集市？阅读旅团手册 ${icon('arrow')}</button></div><div class="landing-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="guild-stamp">EST.<br/><b>VIII</b><br/>THE GUILD</div>${heroes.map((id, i) => { const d = def(id); return `<div class="hero-card hero-${i}" style="--family:${family(d).color}"><div class="hero-tier">T${d.tier}</div><img src="${portrait(id)}" alt=""/><div class="hero-title"><span>${family(d).title}</span><h3>${d.name}</h3><small>${d.attack} 攻击 <b>◇</b> ${d.health} 生命</small></div></div>`; }).join('')}<div class="art-caption"><span>六种道路，无数种同行方式</span><b>CHOOSE YOUR COMPANY</b></div></div><div class="landing-bottom"><span>01 — 招募与刷新</span><span>02 — 成长与传承</span><span>03 — 布阵与交锋</span><button data-action="catalog" class="text-button">探索 48 张卡牌 ${icon('arrow')}</button></div></main>`;
}



function miniCard(card, zone, slot) {
  if (!card) return `<div class="shop-vacancy"><span>已招募</span><small>${slot < 3 ? '角色' : slot === 3 ? '法术' : '装备'}席位</small></div>`;
  const d = def(card);
  const selectedNow = zone === 'shop' ? selected?.zone === 'shop' && selected.slot === slot : selected?.uid === card.uid;
  const values = d.type === 'character' ? stats(card) : null;
  return `<button class="market-card ${d.type} ${selectedNow ? 'selected' : ''} ${intent && zone === 'hand' && canTarget(card) ? 'available-target' : ''}" style="--family:${family(d).color}" data-action="${zone === 'shop' ? 'shop' : 'owned'}" data-drag-zone="${zone}" data-slot="${slot}" data-uid="${esc(card.uid)}" aria-label="${esc(d.name)}，T${d.tier} ${typeNames[d.type]}${zone === 'shop' ? `，${card.price ?? PRICES[d.type]} 金` : ''}"><div class="card-art"><img src="${portrait(d.id)}" alt="" draggable="false"/><span class="tier-badge">T${d.tier}</span><span class="card-family">${family(d).name}</span>${d.type === 'character' ? `<span class="card-level">L${n(card.level)}</span>` : `<span class="card-kind">${typeNames[d.type]}</span>`}</div><div class="card-bottom"><b>${esc(d.name)}</b>${values ? `<span class="mini-stats"><span>${icon('sword')}${n(values.attack)}</span><span>${icon('heart')}${n(values.health)}</span></span>` : `<span class="card-brief">${d.type === 'spell' ? '单次施放 · 构筑组合' : `装备 · ${d.attackBonus ? `+${d.attackBonus} 攻击` : `+${d.healthBonus} 生命`}`}</span>`}</div>${zone === 'shop' ? `<span class="price">${icon('coin')}${card.price ?? PRICES[d.type]}</span>` : ''}${intent?.targets?.includes(card.uid) ? `<span class="target-marker">${intent.targets.indexOf(card.uid) ? 'B' : 'A'}</span>` : ''}</button>`;
}

function prepContent() {
  const p = me();
  return `<div class="floating-market" data-drop-zone="market"><section class="market"><div class="section-heading"><h2>流动集市</h2><div class="market-controls"><button data-action="odds" class="text-button">P${p.level} 概率</button><button data-action="freeze" class="small-button ${p.frozen ? 'active' : ''}" aria-pressed="${p.frozen}">${icon('lock')}${p.frozen ? '已冻结' : '冻结'}</button><button data-action="reroll" class="small-button">${icon('refresh')}刷新 1 金</button></div></div><div class="shop-row ${p.frozen ? 'frozen' : ''}">${p.shop.map((card, slot) => miniCard(card, 'shop', slot)).join('')}</div></section></div><div class="floating-hand" data-drop-zone="hand"><section class="hand-section"><div class="section-heading"><h2>手牌 <span>${p.hand.length}/10</span></h2><small>拖到地图部署 · 拖到角色使用</small><div class="tray-nav"><button class="icon-button" data-action="scroll-hand" data-direction="-1" aria-label="上一组手牌">${icon('arrow')}</button><button class="icon-button" data-action="scroll-hand" data-direction="1" aria-label="下一组手牌">${icon('arrow')}</button></div></div><div class="hand-row">${p.hand.length ? p.hand.map((card, slot) => miniCard(card, 'hand', slot)).join('') : '<div class="hand-empty">拖入商品收进手牌，也可直接拖到地图上场</div>'}</div></section></div><div class="map-economy">${economyBar()}</div><div class="map-inspection ${intent ? 'has-intent' : ''}">${selected || intent ? selectedPanel() : ''}</div>`;
}

function selectedPanel() {
  const card = cardAtSelection();
  if (intent) return intentPanel();
  if (!card) return `<aside class="inspector empty-inspector"><div class="inspector-seal">${icon('spark')}</div><p class="eyebrow">EVERY CHOICE MATTERS</p><h2>下一步，由你决定。</h2><p>招募同伴，叠加成长。<br/>借助法术与装备，<br/>把不同的道路织成阵容。</p><div class="quick-guide"><span><b>01</b> 点商店卡牌，查看并购买</span><span><b>02</b> 点手牌，出战或使用</span><span><b>03</b> 安排六个站位，准备交锋</span></div><button class="text-button" data-action="catalog">寻找你的构筑方向 ${icon('arrow')}</button></aside>`;
  const d = def(card), values = d.type === 'character' ? stats(card) : null;
  const board = onBoard(card.uid);
  return `<aside class="inspector selected-inspector" style="--family:${family(d).color}"><button class="detail-close icon-button" data-action="clear" aria-label="关闭详情">${icon('close')}</button><div class="detail-art"><img src="${portrait(d.id)}" alt="${esc(d.name)}"/><span>T${d.tier} · ${typeNames[d.type]}</span></div><div class="detail-copy"><p class="eyebrow">${family(d).title}${selected.zone === 'shop' ? ' / 商店' : board ? ' / 战场' : ' / 手牌'}</p><h2>${esc(d.name)}${d.type === 'character' ? `<small>L${n(card.level)}</small>` : ''}</h2>${values ? `<div class="detail-stats"><span>${icon('sword')}<b>${n(values.attack)}</b> 攻击</span><span>${icon('heart')}<b>${n(values.health)}</b> 生命</span>${values.shield > 0n ? `<span>${icon('shield')}<b>${n(values.shield)}</b> 护盾</span>` : ''}</div>` : ''}${exactValues(card, values)}<p class="ability">${esc(abilityText(d.text))}</p><p class="ability-limit">${esc(abilityText(d.limit))}</p>${d.type === 'character' && selected.zone !== 'shop' ? equipmentList(card) : ''}${d.type === 'character' && (card.prep?.attack || card.prep?.shield || card.prep?.opening?.length || card.prep?.deathSummon) ? `<div class="prep-effects">已准备本轮战斗：${card.prep.attack ? `攻击 +${n(card.prep.attack)} ` : ''}${card.prep.shield ? `护盾 ${n(card.prep.shield)} ` : ''}${card.prep.opening?.length ? `${card.prep.opening.length} 次开场效果 ` : ''}${card.prep.deathSummon ? '阵亡召唤' : ''}</div>` : ''}<div class="detail-actions">${selected.zone === 'shop' ? `<button class="primary" data-action="buy">购买${typeNames[d.type]} <span>${card.price ?? PRICES[d.type]} ${icon('coin')}</span></button>` : `${d.type === 'character' ? `<button class="primary" data-action="deploy">${board ? '调整站位' : '出战'} ${icon('arrow')}</button><button class="secondary" data-action="merge">同名叠加</button>${board ? '<button class="secondary" data-action="recall">撤回手牌</button>' : ''}` : `<button class="primary" data-action="${d.type === 'spell' ? 'cast' : 'equip'}">${d.type === 'spell' ? '施放法术' : '选择佩戴者'} ${icon('spark')}</button>`}<button class="sell-button" data-action="sell">卖出 <span>+1 ${icon('coin')}</span></button>${confirmSell ? `<div class="sell-confirm"><p>出售 L${n(card.level)} ${esc(d.name)}？${card.equipment?.length ? '装备将返回手牌。' : ''}成长会随角色离开。</p><button class="danger" data-action="confirm-sell">确认卖出 · +1 金</button><button class="secondary" data-action="cancel-sell">保留</button></div>` : ''}`}</div></div></aside>`;
}

function equipmentList(card) {
  return `<div class="equipment-list"><h3>装备 <small>${card.equipment.length}/2</small></h3>${[0, 1].map(slot => card.equipment[slot] ? `<div><img src="${portrait(card.equipment[slot].defId)}" alt=""/><span>${esc(def(card.equipment[slot]).name)}</span><button class="text-button" data-action="unequip" data-slot="${slot}" data-uid="${esc(card.uid)}">卸下</button></div>` : '<div class="empty-equipment">空装备位</div>').join('')}</div>`;
}

function canTarget(card, current = intent) {
  if (!current || def(card)?.type !== 'character') return false;
  const source = intentSource(current); if (!source) return false;
  if (current.type === 'deploy') return onBoard(card.uid);
  if (current.type === 'merge') return card.uid !== current.uid && card.defId === source.defId;
  if (current.type === 'equip') return true;
  const key = def(source).key;
  if (!['training', 'potential', 'succession', 'bequest', 'exchange'].includes(key) && !onBoard(card.uid)) return false;
  if (current.targets.includes(card.uid)) return false;
  if (['succession', 'bequest'].includes(key) && !current.targets.length && card.level <= 1n) return false;
  if (key === 'exchange' && current.targets.length && owned(current.targets[0])?.level === card.level) return false;
  if (key === 'overload' && !card.equipment.length) return false;
  return true;
}

function intentPanel() {
  const source = intentSource();
  if (!source) { intent = null; return selectedPanel(); }
  const d = def(source);
  const count = intent.type === 'cast' && ['chorus', 'bequest', 'succession', 'exchange'].includes(d.key) ? 2 : 1;
  const targets = intent.targets.map(owned).filter(Boolean);
  const ready = intent.type === 'cast' ? targets.length === count || ['open_market', 'rally'].includes(d.key) || (d.key === 'targeted_order' && intent.choice) : intent.type === 'merge' || intent.type === 'equip' ? targets.length === 1 : false;
  const title = { deploy: '选择战场位置', merge: '选择保留的同名角色', equip: '选择一位佩戴者', cast: `施放 · ${d.name}` }[intent.type];
  let preview = '';
  if (intent.type === 'merge' && targets.length) {
    const target = targets[0];
    const after = stats({ ...target, level: target.level + source.level });
    preview = `<div class="level-preview"><span>保留 ${esc(def(target).name)}</span><b>L${n(target.level)} → L${n(target.level + source.level)}</b><small>合并后 ${n(after.attack)} 攻击 / ${n(after.health)} 生命</small><small>材料装备返回手牌；保留目标装备与准备效果。</small></div>`;
  }
  if (intent.type === 'cast' && targets.length === 2 && ['bequest', 'succession', 'exchange'].includes(d.key)) {
    const [a, b] = targets;
    const exchange = d.key === 'exchange';
    preview = `<div class="level-preview"><span>A · ${esc(def(a).name)}</span><b>L${n(a.level)} → L${n(exchange ? b.level : 1n)}</b><span>B · ${esc(def(b).name)}</span><b>L${n(b.level)} → L${n(exchange ? a.level : b.level + a.level - 1n)}</b><small>装备与准备效果留在原角色身上。</small></div>`;
  }
  const fullEquipment = intent.type === 'equip' && targets[0]?.equipment.length === 2;
  return `<aside class="inspector intent-inspector"><div class="intent-icon">${icon(intent.type === 'cast' ? 'spark' : 'arrow')}</div><p class="eyebrow">${esc(d.name)}${intent.purchaseSlot !== undefined ? ` · 确认时支付 ${source.price} 金` : ''}</p><h2>${title}</h2><p class="intent-guidance">${intent.type === 'deploy' ? '点击空格出战，点击已有角色交换位置。' : count === 2 ? `依次选择 A 与 B。${targets.length === 0 ? '先点击第一个角色。' : targets.length === 1 ? '再点击第二个角色。' : '核对效果后确认。'}` : intent.type === 'merge' ? '点击另一个同名角色；选中的目标会保留。' : intent.type === 'equip' ? '点击战场或手牌角色，确认穿戴。' : ['open_market', 'rally'].includes(d.key) ? '这是无需选人的法术，确认后立即生效。' : d.key === 'targeted_order' ? '选择要重新进货的商品类型。' : '点击发光的角色作为目标，确认后生效。'}</p><p class="ability">${esc(abilityText(d.text))}</p>${d.key === 'targeted_order' ? `<div class="choice-row">${Object.entries(typeNames).filter(([k]) => k !== 'token').map(([k, name]) => `<button class="secondary ${intent.choice === k ? 'active' : ''}" data-action="spell-choice" data-choice="${k}">${name}</button>`).join('')}</div>` : ''}${targets.length ? `<div class="chosen-targets">${targets.map((target, i) => `<span>${count === 2 ? `${i ? 'B' : 'A'} · ` : ''}${esc(def(target).name)} <b>L${n(target.level)}</b></span>`).join('')}</div>` : ''}${preview}${fullEquipment ? `<p>装备位已满，选择替换哪一件（旧装备回到手牌）。</p><div class="choice-row">${targets[0].equipment.map((item, i) => `<button class="secondary ${intent.slot === i ? 'active' : ''}" data-action="equip-slot" data-slot="${i}">${esc(def(item).name)}</button>`).join('')}</div>` : ''}<div class="detail-actions">${intent.type !== 'deploy' ? `<button class="primary" data-action="confirm-intent" ${!ready || fullEquipment && intent.slot === undefined ? 'disabled' : ''}>确认${intent.type === 'cast' ? '施放' : intent.type === 'merge' ? '叠加' : '穿戴'} ${icon('spark')}</button>` : ''}${targets.length ? '<button class="secondary" data-action="reset-targets">重新选目标</button>' : ''}<button class="secondary" data-action="clear">取消 · 不消耗卡牌</button></div></aside>`;
}

function economyBar() {
  const p = me();
  return `<footer class="economy-bar"><div class="gold-display">${icon('coin')}<b>${p.gold}</b><span>可用金币</span></div><button class="upgrade-button" data-action="upgrade" ${p.level >= 5 ? 'disabled' : ''}><span class="commander-level">P${p.level}</span><span>${p.level < 5 ? '升级' : '已满阶'}<small>${p.level < 5 ? UPGRADE_COSTS[p.level] + ' 金' : '全部品阶'}</small></span></button><button class="sell-drop" data-drop-zone="sell" aria-label="将角色或手牌拖到这里出售">出售 <span>+1 金</span></button><div class="economy-spacer"></div><button class="primary battle-button" data-action="begin">准备完成 ${icon('sword')}</button></footer>`;
}

function battleContent() {
  const frames = game.battle?.frames || [];
  const frame = frames[frameIndex];
  return `<div class="map-playback battle-controls"><button class="small-button" data-action="pause">${icon(paused ? 'play' : 'pause')}${paused ? '继续' : '暂停'}</button><button class="small-button" data-action="speed" aria-label="切换战斗速度">${speed}×</button><div class="battle-progress"><span style="width:${frames.length ? (frameIndex + 1) / frames.length * 100 : 0}%"></span></div><span class="micro">${frameIndex + 1}/${frames.length}</span><button class="small-button" data-action="skip">快速结算 ${icon('arrow')}</button></div><p class="current-event" aria-live="polite">${esc(frame?.text || '双方已就位')}</p>`;
}

function exactValues(card, values) {
  if (!values || (card.level < 10000n && values.attack < 10000n && values.health < 10000n && values.shield < 10000n)) return '';
  return `<details class="exact-values"><summary>查看精确等级与属性</summary><dl><dt>成长等级 L</dt><dd>${card.level.toString()}</dd><dt>攻击</dt><dd>${values.attack.toString()}</dd><dt>生命</dt><dd>${values.health.toString()}</dd><dt>准备护盾</dt><dd>${values.shield.toString()}</dd></dl></details>`;
}

function resultPanel() {
  const result = game.lastResult || {};
  const outcome = result.winner === 0 ? '此役，凯旋。' : result.winner === 1 ? '此役，惜败。' : '势均，力敌。';
  const base = 2 + Math.floor((game.round - 1) / 4);
  const survivors = Math.min(6, game.battle?.remaining?.[result.winner ?? 0] || 0);
  const summary = result.winner === 0 ? `对手受到 ${base + survivors} 点伤害，你的旅团整装待发。` : result.winner === 1 ? `受到 ${result.damage || 0} 点伤害，调整阵容，再战一轮。` : `双方各受到 ${base} 点基础伤害。`;
  const ending = game.phase === 'ended' && game.round === 18 && game.players.filter(p => p.hp > 0).length > 1 ? '已达 18 回合上限，按生命、胜场与开局席位排名。' : '';
  return `<section class="result-panel ${result.winner === 0 ? 'win' : ''}"><div class="result-emblem">${icon(game.phase === 'ended' ? 'crown' : result.winner === 0 ? 'spark' : 'shield')}</div><div><p class="eyebrow">${game.phase === 'ended' ? 'JOURNEY COMPLETE' : 'ROUND COMPLETE'}</p><h2>${game.phase === 'ended' ? `旅途落幕 · 第 ${game.rank || standings(game).findIndex(p => p.id === me().id) + 1} 名` : outcome}</h2><p>${summary}</p><small>基础伤害 ${base}${result.winner === null ? '' : ` + ${survivors} 名胜方存活本体 = ${base + survivors}`} · 召唤物不增加结算伤害</small>${result.reason && result.reason !== '战场胜负' ? `<small>${esc(result.reason)}</small>` : ''}${ending ? `<small>${ending}</small>` : ''}</div></section>`;
}

function render(animate = false) {
  sceneAnimation?.destroy(); sceneAnimation = null;
  dragControl.cancel();
  document.body.classList.toggle('map-active', !landing && !!game);
  if (landing || !game) return renderLanding();
  const p = me(), other = opponent(game), preparing = game.phase === 'prep';
  const frames = game.battle?.frames || [];
  const frame = preparing ? null : frames[frameIndex] || replayFrame;
  const previous = preparing ? null : frames[frameIndex - 1];
  const validUids = intent ? [...p.board, ...p.hand].filter(c => c && canTarget(c)).map(c => c.uid) : [];
  app.innerHTML = `<main class="map-game is-${preparing ? 'prep' : game.phase === 'battle' ? 'battle' : 'result'}"><div class="world-host">${mapMarkup({ board: p.board, frame, previous, selectedUid: selected?.uid, targetUids: intent?.targets || [], validUids, deploying: intent?.type === 'deploy' })}</div><header class="map-hud"><div class="map-brand">${icon('spark')}<b>万象旅团</b></div><div class="round-status"><b>第 ${game.round} 回合</b><span>${icon('heart')}${Math.max(0,p.hp)}</span><small>${preparing ? '备战 · ' : '交锋 · '}${esc(other?.name || '旅团')}</small></div><nav>${preparing ? '<button class="icon-button" data-action="opponent" aria-label="查看对手">'+icon('shield')+'</button><button class="icon-button" data-action="catalog" aria-label="卡牌图鉴">'+icon('book')+'</button>' : ''}<button class="icon-button" data-action="sound" aria-label="${isMuted() ? '开启音效' : '关闭音效'}">${icon(isMuted() ? 'mute' : 'sound')}</button><button class="icon-button" data-action="menu" aria-label="游戏菜单">${icon('menu')}</button></nav></header>${preparing ? prepContent() : game.phase === 'battle' ? battleContent() : '<div class="map-result-overlay">'+resultPanel()+'<div class="result-actions"><button class="primary" data-action="'+(game.phase === 'ended' ? 'new' : 'next')+'">'+(game.phase === 'ended' ? '再启旅程' : '下一回合')+' '+icon('arrow')+'</button><button class="secondary" data-action="standings">大厅排名</button></div></div>'}</main>`;
  const stage = app.querySelector('.map-stage');
  if (frame) stage.dataset.frameIndex = frameIndex;
  sceneAnimation = animateMap(stage, { frame, previous, duration: frameDuration(), animate: animate && game.phase === 'battle' });
  if (paused) sceneAnimation.pause();
}

function showModal(page, body, title, wide = false) {
  if (game?.phase === 'battle' && !paused) pausePlayback();
  modalPage = page;
  if (!modal.open) returnFocus = document.activeElement;
  modal.className = wide ? 'wide-modal' : '';
  modal.innerHTML = `<div class="modal-heading"><div><p class="eyebrow">THE WANDERING GUILD</p><h2>${title}</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon('close')}</button></div>${body}<p class="modal-feedback" role="status" aria-live="polite"></p>`;
  if (!modal.open) modal.showModal();
}

function closeModal() { modal.close(); modalPage = ''; returnFocus?.isConnected && returnFocus.focus(); }

function openNew() {
  showModal('new', `<form id="new-game-form"><p>八支旅团将在同一座集市相遇。你有无限的准备时间，旅途进度会自动保存。</p><label class="field">旅程种子 <span>相同种子可重现同一局开端</span><input name="seed" maxlength="64" value="${esc(`旅团-${Date.now().toString(36).slice(-6)}`)}" required autocomplete="off"/></label><label class="field">对手难度<select name="difficulty"><option value="standard">标准 · 完整经营决策</option><option value="easy">轻松 · 适合第一次旅行</option></select></label>${game || loaded.error ? '<div class="storage-warning">开启新旅程会替换当前本地存档。需要保留时，请先在菜单导出。</div><label class="check-field"><input type="checkbox" name="replace" required/> 我已确认开启并替换当前存档</label>' : ''}<button class="primary large" type="submit" data-action="start-game">启程 · 前往集市 ${icon('arrow')}</button></form>`, '开启一段新旅程');
}

function showMenu() {
  showModal('menu', `<div class="menu-grid">${game ? '<button class="primary" data-action="continue">返回当前旅程</button><button class="secondary" data-action="standings">大厅排名 · 八支旅团</button><button class="secondary" data-action="ledger">旅团经营记录</button>' : ''}<button class="secondary" data-action="new">开启新旅程</button><button class="secondary" data-action="help">旅团手册</button><button class="secondary" data-action="catalog">卡牌图鉴 · 48 张</button>${game ? '<button class="secondary" data-action="export">导出当前存档</button>' : ''}${loaded.raw && loaded.error ? '<button class="secondary" data-action="export-raw">备份无法读取的原始存档</button>' : ''}<button class="secondary" data-action="import">导入存档</button></div><p class="muted micro">所有对手在本机模拟，无需登录。浏览器清理网站数据会删除本地进度，可先导出保存。</p>`, '旅团行囊');
}

function showHelp() {
  showModal('help', `<div class="help-content"><p class="help-lead">用金币做选择，用组合赢下一场交锋。</p><div class="help-steps"><article><b>01 / 招募</b><h3>每轮先经营</h3><p>商店固定 3 角色、1 法术、1 装备。角色和装备 3 金，法术 2 金。付 1 金刷新；冻结免费，保留未售商品到下轮。</p></article><article><b>02 / 构筑</b><h3>拖拽，即刻构筑</h3><p>商店角色可直接拖到地图购买并上场；拖到手牌只购买。手牌角色拖到位置部署，拖到同名角色预览叠加；法术和装备拖到角色使用。双目标法术依次选 A/B 再确认，装备满槽时选择替换。也可点选操作。</p></article><article><b>03 / 交锋</b><h3>你的阵容自动战斗</h3><p>前排先承伤，站位决定普攻次序。开战后收起商店与手牌，角色在遗迹地图上移动、攻击和施法。可暂停、加速或快速结算；结算后继续经营。</p></article></div><h3>三种等级，各有用途</h3><table><tr><th>P · 指挥官等级</th><td>花 5 / 8 / 11 / 14 金升至 P2–P5，解锁更高品阶。</td></tr><tr><th>T · 道具品阶</th><td>卡牌固定门槛，只刷出 T ≤ P 的商品。</td></tr><tr><th>L · 角色成长等级</th><td>同名直接叠加 L，无玩法上限。每升 1 级，+1 攻击、+2 生命。</td></tr></table><h3>把成长交给更适合的伙伴</h3><p>全量转移移动 G = L − 1。A 从 L11 变 L1，B 从 L3 变 L13。装备和本轮战斗增益留在原角色，不跟随等级移动。双目标法术会预览变化，取消不会消耗。</p><h3>六种道路，可以混搭</h3><div class="family-guide">${Object.values(FAMILIES).map(f => `<article style="--family:${f.color}"><h4>${f.title}</h4><p>${f.motto}</p></article>`).join('')}</div><h3>金币与结束条件</h3><p>每轮收入从 4 金逐步增加，最高 12 金；余钱保留，无利息。出售任何手牌道具或场上角色获得 1 金，角色装备返回手牌。淘汰至 1 人或第 18 回合结束；回合上限按生命、胜场、开局席位排名。</p><p class="muted">所有经营行为都有规则校验。手牌上限 10、战场上限 6；不够位置或目标不合法时，会显示原因且不消耗资源。</p></div>`, '旅团手册', true);
}

function showOdds() {
  const level = me()?.level || 1;
  showModal('odds', `<p>先抽品阶，再抽同类型的卡。每个商品独立生成，有放回、无共享有限卡池；指挥官升级后，下一次刷新才使用新概率。</p><table class="odds-table"><thead><tr><th>指挥官</th>${[1, 2, 3, 4, 5].map(t => `<th>T${t}</th>`).join('')}</tr></thead><tbody>${SHOP_WEIGHTS.map((weights, i) => `<tr class="${level === i + 1 ? 'current' : ''}"><th>P${i + 1}</th>${weights.map(w => `<td>${w}%</td>`).join('')}</tr>`).join('')}</tbody></table><p class="muted">全店冻结免费；手动刷新花 1 金并解除冻结。法术刷新不触发「付费刷新」能力。</p>`, `商店概率 · 当前 P${level}`);
}

function showStandings() {
  showModal('standings', `<p class="muted">第 ${game.round} 回合 · 你与 7 位本地模拟指挥官。生命相同时比较胜场，再比较开局席位。</p><table class="odds-table"><thead><tr><th>排名</th><th>旅团</th><th>路线</th><th>生命</th><th>胜场</th></tr></thead><tbody>${standings(game).map((p, i) => `<tr class="${p.id === me().id ? 'current' : ''}"><td>${i + 1}</td><td>${esc(p.name)}${p.hp <= 0 ? ' · 已离场' : ''}</td><td>${family(p).title}</td><td>${Math.max(0, p.hp)}</td><td>${p.wins}</td></tr>`).join('')}</tbody></table>`, '大厅排名');
}

function showLedger() {
  const logs = me().log || [];
  showModal('ledger', `<p class="muted">最近 ${logs.length} 条经营记录。永久成长留在角色身上；临战攻击、护盾与开场效果仅作用于紧接的一场战斗。</p><ol class="ledger-list">${logs.length ? [...logs].reverse().map(line => `<li>${esc(line)}</li>`).join('') : '<li>购买你的第一张卡牌，开始记录旅程。</li>'}</ol>`, '旅团经营记录');
}

function showCatalog() {
  const found = CARDS.filter(d => (catalogFamily === 'all' || d.family === catalogFamily) && (catalogType === 'all' || d.type === catalogType) && (catalogTier === 'all' || d.tier === Number(catalogTier)) && `${d.name}${d.text}${family(d).title}`.includes(catalogSearch));
  const filters = `<div class="catalog-filters"><label><span>流派</span><select id="catalog-family"><option value="all">所有流派</option>${Object.entries(FAMILIES).map(([key, f]) => `<option value="${key}" ${catalogFamily === key ? 'selected' : ''}>${f.title}</option>`).join('')}</select></label><label><span>类型</span><select id="catalog-type"><option value="all">全部类型</option>${Object.entries(typeNames).filter(([k]) => k !== 'token').map(([k, name]) => `<option value="${k}" ${catalogType === k ? 'selected' : ''}>${name}</option>`).join('')}</select></label><label><span>品阶</span><select id="catalog-tier"><option value="all">所有品阶</option>${[1, 2, 3, 4, 5].map(t => `<option value="${t}" ${String(t) === catalogTier ? 'selected' : ''}>T${t}</option>`).join('')}</select></label><label class="catalog-search"><span>搜索</span><input id="catalog-search" placeholder="名称或能力" value="${esc(catalogSearch)}"/></label></div>`;
  showModal('catalog', `${filters}<p class="muted micro">共 ${found.length} / 48 张 · 流派标签供构筑参考，联动按卡面能力生效</p><div class="catalog-grid">${found.map(d => `<article class="catalog-card" style="--family:${family(d).color}"><img src="${portrait(d.id)}" alt="${esc(d.name)}" loading="lazy"/><div><small>T${d.tier} · ${typeNames[d.type]} · ${family(d).title}</small><h3>${esc(d.name)}</h3>${d.type === 'character' ? `<b class="catalog-stats">${d.attack} 攻击 / ${d.health} 生命</b>` : ''}<p>${esc(abilityText(d.text))}</p><small class="ability-limit">${esc(abilityText(d.limit))}</small></div></article>`).join('')}</div>`, '万象图鉴', true);
}

function showOpponent() {
  const other = opponent(game);
  const board = other?.board || [];
  showModal('opponent', `<p class="muted">备战仅展示对手上轮锁定的阵容；本轮最终阵容将在交锋开始时公开。</p>${board.some(Boolean) ? `<div class="scout-grid">${board.filter(Boolean).map(c => `<article><img src="${portrait(c.defId)}" alt=""/><b>${esc(def(c)?.name || '旅人')}</b><span>L${n(c.level)}</span><p>${esc(def(c)?.text || '')}</p></article>`).join('')}</div>` : '<div class="empty-scout">尚无上轮阵容记录。先招募你的第一位同伴。</div>'}`, `${esc(other?.name || '对手')} · 上轮阵容`, true);
}

function updatePlaybackControls() {
  const button = app.querySelector('[data-action="pause"]');
  if (button) button.innerHTML = icon(paused ? 'play' : 'pause') + (paused ? '继续' : '暂停');
  const speedButton = app.querySelector('[data-action="speed"]');
  if (speedButton) speedButton.textContent = speed + '×';
}

function pausePlayback() {
  if (!paused && playbackTimer) frameRemaining = Math.max(0, frameDeadline - performance.now());
  paused = true; clearTimeout(playbackTimer); playbackTimer = 0;
  sceneAnimation?.pause(); updatePlaybackControls();
}

function startPlayback() {
  clearTimeout(playbackTimer); playbackTimer = 0;
  if (paused || document.hidden || !game || game.phase !== 'battle') return;
  sceneAnimation?.resume();
  frameDeadline = performance.now() + frameRemaining;
  playbackTimer = setTimeout(() => {
    playbackTimer = 0;
    const frames = game.battle?.frames || [];
    if (frameIndex < frames.length - 1) {
      frameIndex++; frameRemaining = frameDuration();
      const frame = frames[frameIndex];
      if (frame.type === 'summon') sound('spell');
      render(true); startPlayback();
    } else completeBattle();
  }, frameRemaining);
}

function completeBattle() {
  clearTimeout(playbackTimer);
  if (game.phase !== 'battle') return;
  try {
    replayFrame = game.battle?.frames.at(-1);
    game = finishBattle(game);
    persist(); sound(game.lastResult?.winner === 0 ? 'win' : 'lose'); render();
  } catch (error) { paused = true; toast(error.message, true); }
}

function begin() {
  try {
    clearTimeout(playbackTimer);
    clearTimeout(toastTimer); document.querySelector('#toast').className = '';
    game = beginBattle(game);
    selected = null; intent = null; frameIndex = 0; paused = false; frameRemaining = frameDuration();
    persist(); sound('spell'); render(true); startPlayback();
  } catch (error) { toast(error.message, true); }
}

function selectOwned(uid) {
  const card = owned(uid); if (!card) return;
  if (intent) {
    if (!canTarget(card)) return toast('这个角色不符合当前目标条件，请选择发光的角色。', true);
    if (intent.type === 'deploy') return action({ type: 'deploy', uid: intent.uid, slot: me().board.findIndex(c => c?.uid === uid) });
    const max = intent.type === 'cast' && ['chorus', 'bequest', 'succession', 'exchange'].includes(def(intentSource()).key) ? 2 : 1;
    if (intent.targets.length >= max) intent.targets = [];
    intent.targets.push(uid); intent.slot = undefined;
    sound('tap'); render(); return;
  }
  selected = { zone: onBoard(uid) ? 'board' : 'hand', uid }; confirmSell = false; sound('tap'); render();
}

function intentAction(current) {
  const { type, uid, targets, choice, slot } = current;
  const use = type === 'cast' ? { type, uid, targets, choice } : type === 'merge' ? { type, sourceUid: uid, targetUid: targets[0] } : { type, uid, targetUid: targets[0], ...(slot !== undefined ? { slot } : {}) };
  return current.purchaseSlot === undefined ? use : { type: 'buy', slot: current.purchaseSlot, use };
}

function confirmIntent() { if (intent) action(intentAction(intent)); }

function planDrop(source, destination) {
  const card = source.zone === 'shop' ? me().shop[source.slot] : owned(source.uid);
  if (!card || !destination || card.uid !== source.uid) return { error: '请拖到战场位置、角色或手牌区。' };
  const d = def(card), target = owned(destination.uid);
  const purchase = source.zone === 'shop';
  const wrap = use => purchase ? { type: 'buy', slot: source.slot, use } : use;
  const pending = (type, targets = []) => ({ type, uid: card.uid, targets, ...(purchase ? { purchaseSlot: source.slot } : {}) });
  let payload;
  if (destination.zone === 'sell') {
    if (purchase) return { error: '只能出售已经拥有的道具。' };
    payload = { type: 'sell', uid: card.uid };
    const checked = applyAction(me(), payload);
    if (!checked.ok) return { error: checked.error };
    return d.type === 'character' && (card.level > 1n || card.equipment.length) ? { sellUid: card.uid } : { payload };
  }
  if (destination.zone === 'hand' && (!target || def(target)?.type !== 'character' || d.type === 'character' && (target.uid === card.uid || target.defId !== card.defId))) {
    payload = purchase ? { type: 'buy', slot: source.slot } : source.zone === 'board' ? { type: 'recall', uid: card.uid } : null;
  } else if (d.type === 'character') {
    if (target?.uid === card.uid) return { noop: true };
    if (target?.defId === card.defId) {
      const current = pending('merge', [target.uid]);
      const checked = applyAction(me(), intentAction(current));
      return checked.ok ? { intent: current } : { error: checked.error };
    }
    if (destination.zone !== 'board' || destination.slot === undefined) return { error: '角色需要放到己方战场位置。' };
    payload = wrap({ type: 'deploy', uid: card.uid, slot: destination.slot });
  } else if (d.type === 'equipment' && target && def(target).type === 'character') {
    const current = pending('equip', [target.uid]);
    if (target.equipment.length === 2) {
      const possible = [0,1].some(slot => applyAction(me(), intentAction({ ...current, slot })).ok);
      return possible ? { intent: current } : { error: '无法替换装备，请检查金币、手牌容量与同名装备。' };
    }
    payload = intentAction(current);
  } else if (d.type === 'spell') {
    const current = pending('cast');
    if (d.key === 'targeted_order' && ['market', 'shop'].includes(destination.zone)) {
      const product = me().shop[destination.slot];
      if (product && product.uid !== card.uid) current.choice = def(product).type;
      else return !purchase || me().gold >= card.price ? { intent: current } : { error: '金币不足。' };
    } else if (['open_market','rally'].includes(d.key) && ['map','board','market'].includes(destination.zone)) {
      // These spells affect the shop or whole friendly team.
    } else if (target && canTarget(target, current)) {
      current.targets.push(target.uid);
      if (['chorus','bequest','succession','exchange'].includes(d.key)) return !purchase || me().gold >= card.price ? { intent: current } : { error: '金币不足。' };
    } else return { error: '请将法术拖到符合卡面条件的角色；集市法术可拖到商店。' };
    payload = intentAction(current);
  } else return { error: '请把装备拖到角色身上，或将商品拖进手牌。' };
  if (!payload) return { noop: true };
  const checked = applyAction(me(), payload);
  return checked.ok ? { payload } : { error: checked.error };
}

const dragControl = installDrag(app, {
  enabled: () => !landing && game?.phase === 'prep' && !modal.open && !intent,
  accepts: (source, target) => !planDrop(source, target).error,
  drop: (source, target) => {
    unlockAudio();
    const plan = planDrop(source, target);
    if (plan.error) return toast(plan.error, true);
    if (plan.noop) return;
    if (plan.payload) return action(plan.payload);
    if (plan.intent) { selected = null; intent = plan.intent; confirmSell = false; sound('tap'); render(); }
    if (plan.sellUid) { selected = { zone: onBoard(plan.sellUid) ? 'board' : 'hand', uid: plan.sellUid }; confirmSell = true; render(); }
  }
});


document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  unlockAudio();
  const name = button.dataset.action;
  const card = cardAtSelection();
  if (name === 'start-game') return;
  if (name === 'scroll-hand') { const row = app.querySelector('.hand-row'); row?.scrollBy({ left: Number(button.dataset.direction) * row.clientWidth * .7, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); return; }
  if (name === 'new') return openNew();
  if (name === 'home') { if (game && !landing) showMenu(); else { landing = true; render(); } return; }
  if (name === 'menu') return showMenu();
  if (name === 'close-modal') return closeModal();
  if (name === 'help') return showHelp();
  if (name === 'catalog') return showCatalog();
  if (name === 'odds') return showOdds();
  if (name === 'opponent') return showOpponent();
  if (name === 'standings' && game) return showStandings();
  if (name === 'ledger' && game) return showLedger();
  if (name === 'sound') { toggleMute(); sound('tap'); button.innerHTML = icon(isMuted() ? 'mute' : 'sound'); button.setAttribute('aria-label', isMuted() ? '开启音效' : '关闭音效'); return; }
  if (name === 'continue') { if (!game) return; closeModal(); const wasLanding = landing; landing = false; if (wasLanding) { frameRemaining = frameDuration(); render(); } if (game.phase === 'battle') startPlayback(); return; }
  if (name === 'export') {
    try { const blob = new Blob([exportGame(game)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `万象旅团-${game.round}回合-${Date.now()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('存档已导出，请保留下载的 JSON 文件。'); } catch (error) { toast(error.message, true); }
    return;
  }
  if (name === 'export-raw') {
    if (!loaded.raw) return toast('没有可导出的原始存档。', true);
    const url = URL.createObjectURL(new Blob([loaded.raw], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `万象旅团-原始存档备份-${Date.now()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('原始存档已导出备份。'); return;
  }
  if (name === 'import') return showModal('import', '<p>选择之前导出的 JSON 存档。载入前会完整校验；无效文件不会覆盖当前旅程。</p><form id="import-form"><label class="field">存档文件<input type="file" name="save" accept=".json,application/json" required/></label><label class="check-field"><input name="replace" type="checkbox" required/> 确认用此文件替换当前旅程</label><button class="primary" type="submit">校验并载入存档</button></form>', '导入旅程');
  if (name === 'shop') { if (intent) return toast('请先完成或取消当前目标选择。'); selected = { zone: 'shop', slot: Number(button.dataset.slot) }; confirmSell = false; sound('tap'); render(); return; }
  if (name === 'owned') return selectOwned(button.dataset.uid);
  if (name === 'slot') { if (intent?.type === 'deploy') action({ type: 'deploy', uid: intent.uid, slot: Number(button.dataset.slot) }); else toast('先选中手牌角色并点「出战」，再选择位置。'); return; }
  if (name === 'clear') { selected = null; intent = null; confirmSell = false; render(); return; }
  if (name === 'buy' && selected?.zone === 'shop') return action({ type: 'buy', slot: selected.slot });
  if (['reroll', 'freeze', 'upgrade'].includes(name)) return action({ type: name });
  if (['deploy', 'merge', 'cast', 'equip'].includes(name) && card) { intent = { type: name, uid: card.uid, targets: [] }; render(); return; }
  if (name === 'recall' && card) return action({ type: 'recall', uid: card.uid });
  if (name === 'sell' && card) { if (def(card).type === 'character' && (card.level > 1n || card.equipment.length)) { confirmSell = true; render(); } else action({ type: 'sell', uid: card.uid }); return; }
  if (name === 'confirm-sell' && card) return action({ type: 'sell', uid: card.uid });
  if (name === 'cancel-sell') { confirmSell = false; render(); return; }
  if (name === 'unequip') return action({ type: 'unequip', targetUid: button.dataset.uid, slot: Number(button.dataset.slot) });
  if (name === 'spell-choice' && intent) { intent.choice = button.dataset.choice; render(); return; }
  if (name === 'equip-slot' && intent) { intent.slot = Number(button.dataset.slot); render(); return; }
  if (name === 'reset-targets' && intent) { intent.targets = []; intent.slot = undefined; render(); return; }
  if (name === 'confirm-intent') return confirmIntent();
  if (name === 'begin') { if (!me().board.some(Boolean)) return showModal('empty-battle', '<p>战场还没有角色。空场通常会直接战败；建议先购买角色并出战。</p><div class="menu-grid"><button class="primary" data-action="close-modal">返回布阵</button><button class="secondary" data-action="begin-anyway">仍然空场交锋</button></div>', '旅团尚未就位'); begin(); return; }
  if (name === 'begin-anyway') { closeModal(); begin(); return; }
  if (name === 'pause') { if (paused) { paused = false; updatePlaybackControls(); startPlayback(); } else pausePlayback(); return; }
  if (name === 'speed') { const before = speed; if (!paused && playbackTimer) frameRemaining = Math.max(0, frameDeadline - performance.now()); speed = speed === 1 ? 2 : 1; frameRemaining *= before / speed; app.querySelector('.map-stage')?.getAnimations({ subtree: true }).forEach(a => a.updatePlaybackRate(a.playbackRate * speed / before)); updatePlaybackControls(); startPlayback(); return; }
  if (name === 'skip') { frameIndex = Math.max(0, (game.battle?.frames.length || 1) - 1); completeBattle(); return; }
  if (name === 'next') { try { game = nextRound(game); frameIndex = 0; replayFrame = null; selected = null; intent = null; persist(); sound('growth'); render(); } catch (error) { toast(error.message, true); } return; }
  if (name === 'battle-card') { const unit = game.battle?.frames[frameIndex]?.teams[Number(button.dataset.side)]?.find(c => c?.uid === button.dataset.uid); const d = unit && def(unit); if (d) toast(`${d.name}：${abilityText(d.text)}`); }
});

document.addEventListener('submit', async event => {
  event.preventDefault();
  unlockAudio();
  if (event.target.id === 'new-game-form') {
    const data = new FormData(event.target);
    if ((game || loaded.error) && !data.get('replace')) return;
    try { game = newGame(data.get('seed').trim(), data.get('difficulty')); loaded.error = null; landing = false; selected = null; intent = null; paused = false; frameIndex = 0; replayFrame = null; clearTimeout(playbackTimer); persist(); closeModal(); sound('growth'); render(); } catch (error) { toast(error.message, true); }
  }
  if (event.target.id === 'import-form') {
    const data = new FormData(event.target), file = data.get('save');
    if (!data.get('replace') || !file?.size) return toast('请选择有效存档文件。', true);
    if (file.size > 8 * 1024 * 1024) return toast('存档超过 8 MB，无法读取。', true);
    try { const imported = importGame(await file.text()); clearTimeout(playbackTimer); game = imported; loaded.error = null; landing = false; selected = null; intent = null; frameIndex = ['result', 'ended'].includes(game.phase) ? Math.max(0, (game.battle?.frames.length || 1) - 1) : 0; paused = false; persist(); closeModal(); render(); if (game.phase === 'battle') { frameRemaining = frameDuration(); startPlayback(); } toast('存档校验通过，旅程已恢复。'); } catch (error) { toast(`导入失败：${error.message}`, true); }
  }
});

document.addEventListener('change', event => {
  if (event.target.id === 'catalog-family') { catalogFamily = event.target.value; showCatalog(); }
  if (event.target.id === 'catalog-type') { catalogType = event.target.value; showCatalog(); }
  if (event.target.id === 'catalog-tier') { catalogTier = event.target.value; showCatalog(); }
  if (event.target.id === 'catalog-search') { catalogSearch = event.target.value.trim(); showCatalog(); document.querySelector('#catalog-search')?.focus(); }
});



document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !modal.open && (selected || intent)) { selected = null; intent = null; render(); }
});
modal.addEventListener('cancel', () => { modalPage = ''; });
modal.addEventListener('click', event => { if (event.target === modal) { const box = modal.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeModal(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && game?.phase === 'battle') pausePlayback(); });
window.addEventListener('blur', () => { if (game?.phase === 'battle') pausePlayback(); });
window.addEventListener('resize', () => { if (!landing && game?.phase === 'battle') { pausePlayback(); frameRemaining = frameDuration(); render(true); } });
window.addEventListener('pagehide', () => { clearTimeout(playbackTimer); if (game && !landing) persist(); });
render();
