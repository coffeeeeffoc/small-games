import { def, formatNumber, stats } from './shared.js';
import { FAMILIES } from './content.js';
import { sound } from './audio.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const aliveHealth = value => value > 0n ? value : 0n;
const percent = (health, max) => max > 0n ? Number(aliveHealth(health) * 1000n / max) / 10 : 0;
const ranged = unit => ['tuner', 'conductor', 'vessel', 'apprentice', 'cannoneer', 'archivist', 'gravekeeper', 'queen', 'medic', 'magnate', 'bookkeeper'].includes(def(unit)?.key);
const palette = { resonance: '#4d9684', legacy: '#bb7648', commerce: '#99914c', arcana: '#7277b6', armory: '#618c9c', ember: '#ae584a', neutral: '#829080' };
const pawnCache = new Map();

/** Transparent full-body pieces share silhouettes, while clothes, weapons and headwear identify roles. */
function pawn(unit) {
  if (pawnCache.has(unit.defId)) return pawnCache.get(unit.defId);
  const d = def(unit) || { key: 'puppet', family: 'ember', tier: 1 };
  const color = palette[d.family] || palette.neutral;
  const glow = FAMILIES[d.family]?.color || '#dfc488';
  const armored = ['echo_guard', 'successor', 'keeper', 'rivet_guard', 'forge_walker', 'commander', 'mercenary', 'shieldbreaker', 'duelist'].includes(d.key);
  const caster = ranged(unit);
  const elder = ['keeper', 'bookkeeper', 'magnate', 'archivist', 'medic', 'commander'].includes(d.key);
  const token = unit.token || unit.defId.startsWith('token.');
  const weapon = caster
    ? `<g class="pawn-weapon"><path d="M89 130L96 44" stroke="#523c27" stroke-width="7" stroke-linecap="round"/><path d="M89 130L96 44" stroke="#c49f5f" stroke-width="3"/><path d="M95 26l12 16-12 15-10-15z" fill="${glow}" stroke="#f6e2a8" stroke-width="2"/><circle cx="96" cy="41" r="5" fill="#f8edc5"/><path d="M87 51l17 4" stroke="#bd935b" stroke-width="4"/></g>`
    : `<g class="pawn-weapon"><path d="M89 102l-4-67 10-19 8 21-6 66z" fill="#d3dfd8" stroke="#36504e" stroke-width="2"/><path d="M95 28l-3 66" stroke="#fff4cc" stroke-width="2"/><path d="M79 100l25 2" stroke="#e0b367" stroke-width="6" stroke-linecap="round"/><path d="M91 105l-1 18" stroke="#725139" stroke-width="7"/><circle cx="90" cy="123" r="4" fill="#dcb270"/></g>`;
  const headwear = armored
    ? `<path d="M36 46V34q0-23 25-23t25 23v12L73 39l-13 5-13-5z" fill="#819992" stroke="#263f3d" stroke-width="3"/><path d="M60 12v27m-22-9h44" stroke="#dfbb76" stroke-width="5"/><path d="M55 12l5-10 6 10" fill="${color}"/>`
    : caster
      ? `<path d="M32 45l10-22L58 7l22 21 8 18-19-6-10-13-11 13z" fill="${color}" stroke="#26352e" stroke-width="3"/><path d="M59 14l6 11-6 6-5-6z" fill="#edd398"/>`
      : `<path d="M34 38q-2-29 26-27 30-2 27 29l-17-7-14 4-12-6-8 10z" fill="#33372e"/><path d="M34 32l51 1-4-11-41-2z" fill="${color}" stroke="#dbbd7c" stroke-width="3"/>`;
  const body = token
    ? `<path d="M36 125l8-48 16-9 17 9 8 48" fill="#bcaa7b" stroke="#534735" stroke-width="3"/><path d="M43 81L25 105m51-24 18 21M48 122l-6 16m28-16 7 16" stroke="#a59065" stroke-width="10" stroke-linecap="round"/><path d="M40 36l20-14 21 14v27L60 75 40 63z" fill="#e0cba0" stroke="#60523c" stroke-width="3"/><path d="M48 47l7 5m13 0 7-5M52 61h17M60 78v44m-12-21h24" stroke="#4c4937" stroke-width="3"/><path d="M34 34h54" stroke="#675536" stroke-width="7"/>`
    : `<path d="M44 104l-7 27 15 3 8-24 8 24 16-3-9-29" fill="#323f35" stroke="#22382f" stroke-width="3"/><path d="M37 126l-9 11q-3 7 9 7l18-1 1-14m13 0 1 14 20 1q10-2 4-7l-12-10" fill="#584633" stroke="#23352e" stroke-width="3"/><path d="M38 64l-9 52 31 9 32-9-10-52-22-7z" fill="${color}" stroke="#243c35" stroke-width="3"/><path d="M39 75l-8 37 22 5 8-39 8 39 18-6-8-36" fill="#152f2b" opacity=".25"/><path d="M40 62l20 15 21-15-7-9H47z" fill="#dabb78"/><path d="M44 81l-10 11-9-8-9 18 14 9 19-15m30-16 11 16 7-5 10 12-17 12-18-16" fill="${color}" stroke="#233b33" stroke-width="3"/><circle cx="26" cy="99" r="7" fill="#d3a77b"/><circle cx="95" cy="105" r="7" fill="#d3a77b"/><path d="M36 103l49 2-2 8-47-2z" fill="#56462f"/><path d="M56 102h12v12H56z" fill="#e4c382"/><path d="M40 34q-3 22 7 29l13 8 14-8q11-9 8-29" fill="#d4a77d" stroke="#574c36" stroke-width="2"/><path d="M47 46h7m13 0h8" stroke="#30372c" stroke-width="3" stroke-linecap="round"/><path d="M59 48l-2 8h6m-10 5h14" fill="none" stroke="#8e6348" stroke-width="2"/>${elder ? '<path d="M45 56l15 7 16-7-5 16-11 8-11-8z" fill="#d2d0b6"/>' : ''}${headwear}${weapon}${armored ? `<path d="M16 79l16-7 16 9-3 25-13 13-14-13z" fill="#4f716b" stroke="#d9ba77" stroke-width="3"/><path d="M31 79v29m-8-18h18" stroke="#dcc282" stroke-width="3"/>` : `<path d="M31 77l-8 13 12 5 8-12z" fill="#e8cf9e" stroke="#83623b" stroke-width="2"/>`}`;
  const svg = `<svg class="pawn-svg" viewBox="0 0 120 152" fill="none" aria-hidden="true">${body}</svg>`;
  pawnCache.set(unit.defId, svg);
  return svg;
}

const trees = [[43,65,1.15],[142,10,.95],[1040,30,1.2],[1145,111,1],[36,548,1.2],[102,680,.9],[1095,610,1.1],[1160,430,.75]];
const tree = ([x,y,s]) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="90" rx="45" ry="19" fill="#122c22" opacity=".45"/><path d="M-11 85l8-97h15l2 97" fill="#55442e"/><path d="M-9 34L-36 7m43 19L30 2" stroke="#55442e" stroke-width="10"/><path d="M-54 6l16-20-4-25 24-14 17-22 27 12 25 14 2 26 21 18-9 28-28 15-25-4-30 5-28-17z" fill="#274d38"/><path d="M-40-15l13-26 26-15 31 12 18 27-30-7-20 11-24-10z" fill="#3d6541"/><path d="M-26 1l22-11 28 7 17 20-28 10-28-7z" fill="#31583b"/></g>`;
const ruin = (x,y,flip=1) => `<g transform="translate(${x} ${y}) scale(${flip} 1)"><ellipse cy="60" rx="39" ry="15" fill="#122c22" opacity=".45"/><path d="M-23 41h44v17h-44z" fill="#697260"/><path d="M-17-57h32v99h-32z" fill="#8d9479"/><path d="M-17-57h12v99h-12z" fill="#a1a88a"/><path d="M-24-62h46v13h-46zm-3 101h52v10h-52z" fill="#b3b392"/><path d="M-6-45v49l-5 10 14 13 5 15m-24-84 25 1" stroke="#5d6b57" stroke-width="3"/><path d="M-24-62l16-9 27 6 3 3" fill="#c0bea0"/><path d="M6-57l-2 14 13 17-2 17" stroke="#415d3b" stroke-width="6"/></g>`;
const brazier = (x,y) => `<g transform="translate(${x} ${y})"><ellipse cy="26" rx="26" ry="10" fill="#15291e" opacity=".4"/><path d="M-10 4h20l4 25h-29z" fill="#68684f"/><path d="M-21-9h42l-6 19h-30z" fill="#403a2b" stroke="#b18d4a" stroke-width="3"/><ellipse cy="-8" rx="35" ry="26" fill="#ecad4d" opacity=".12"/><path class="map-flame" d="M-14-10q-2-12 9-23-2 9 3 11 10-10 5-25 23 19 10 37z" fill="#efa955"/><path d="M-7-10q-5-9 7-18 0 7 7 7l-2 11" fill="#fff0aa"/></g>`;
const terrain = `<svg class="map-terrain" viewBox="0 0 1200 800" preserveAspectRatio="none" aria-hidden="true"><defs><radialGradient id="map-ground"><stop stop-color="#74826a"/><stop offset=".65" stop-color="#475f42"/><stop offset="1" stop-color="#213f2e"/></radialGradient><linearGradient id="map-river" x2="1" y2=".8"><stop stop-color="#315e61"/><stop offset=".55" stop-color="#4c8781"/><stop offset="1" stop-color="#254f52"/></linearGradient><pattern id="map-stones" width="146" height="92" patternUnits="userSpaceOnUse" patternTransform="skewX(-12)"><path d="M3 3h65v38H3zm73 0h65v38H76zM-30 49h65v38h-65zm73 0h65v38H43zm73 0h65v38h-65z" fill="#88917a" stroke="#626f5c" stroke-width="3"/><path d="M6 6h59m14 0h57M46 52h58" stroke="#a2a68a" stroke-width="2" opacity=".7"/></pattern><radialGradient id="map-vignette"><stop offset=".55" stop-color="#081e16" stop-opacity="0"/><stop offset="1" stop-color="#081e16" stop-opacity=".7"/></radialGradient></defs><path d="M0 0h1200v800H0z" fill="url(#map-ground)"/><path d="M1150-30C984 114 1173 251 1039 349S1017 579 838 638 700 798 579 830h621V0z" fill="#263f36"/><path d="M1172-20C1018 118 1210 274 1072 365S1077 610 864 674 776 800 650 830h550V0z" fill="url(#map-river)"/><path d="M1160 65c-42 110 63 170-20 261m-36 104c-38 69 55 153-99 207m-93 85c-63 28-121 60-134 99" fill="none" stroke="#9fcec0" stroke-width="4" opacity=".23"/><path d="M188 195l225-89 540 71 81 351-204 135-630-67-92-174z" fill="#263e2e" opacity=".38"/><path d="M179 178l242-91 536 70 78 350-208 133-631-67-91-173z" fill="#737d65" stroke="#a2a387" stroke-width="12"/><path d="M203 195l221-78 511 64 67 315-182 117-606-61-80-155z" fill="url(#map-stones)" stroke="#485b46" stroke-width="5"/><path d="M456 141l-24 103 31 38-39 61m345 247-44-94 23-52-48-55M253 438l84-15 20-51" fill="none" stroke="#455f43" stroke-width="5"/><ellipse cx="602" cy="358" rx="177" ry="122" fill="#687c62" stroke="#b0ab83" stroke-width="5"/><ellipse cx="602" cy="358" rx="147" ry="99" fill="none" stroke="#adb28f" stroke-width="2" opacity=".5"/><path d="M602 273l77 85-77 85-77-85zM487 358h230m-115-76v152" fill="none" stroke="#b9b990" stroke-width="4" opacity=".6"/><path d="M586 335l16-14 16 14v33l-16 21-16-21z" fill="#3a6250" opacity=".75"/><path d="M170 325l27 16 18-7-12-30-28 4m697 236 11 29 28-7 9-24-28-13" fill="#abb08f"/><path d="M156 556l16-29 13 15 23-2-5 40m760-387-3 25 20 12 11-32" fill="#43683b"/>${ruin(258,127)}${ruin(911,154,-1)}${ruin(199,552)}${ruin(905,582,-1)}${brazier(349,190)}${brazier(841,535)}${trees.map(tree).join('')}<path d="M0 0h1200v800H0z" fill="url(#map-vignette)"/></svg>`;

function unitMarkup(unit, side, slot, old, battle, options, departed = false) {
  const values = battle ? unit : { ...unit, ...stats(unit), maxHealth: stats(unit).health };
  const d = def(unit);
  const delayed = old && !departed && ['attack', 'skill'].includes(options.frame?.type);
  const shown = delayed ? old : values;
  const color = FAMILIES[d?.family]?.color || '#d4ba7c';
  const isSelected = options.selectedUid === unit.uid || options.targetUids.includes(unit.uid);
  const valid = options.validUids.includes(unit.uid);
  const health = aliveHealth(shown.health);
  return `<button type="button" class="map-unit side-${side}${isSelected ? ' selected' : ''}${valid ? ' targetable' : ''}${departed ? ' departing' : ''}${options.frame?.type === 'summon' && !old ? ' arriving' : ''}${unit.token ? ' token' : ''}" data-action="${battle ? 'battle-card' : 'owned'}" data-uid="${esc(unit.uid)}" data-side="${side}" data-slot="${slot}"${battle ? '' : ' data-drag-zone="board"'} data-ranged="${ranged(unit)}" data-health="${aliveHealth(values.health)}" data-shield="${values.shield || 0n}" data-health-percent="${percent(values.health, values.maxHealth)}" style="--slot:${slot % 3};--row:${slot < 3 ? 0 : 1};--family-color:${color}" aria-label="${esc(d?.name || '纸偶')}，等级 ${unit.level}，生命 ${health}，${battle ? '查看角色' : '拖动调整站位或点击查看'}"><span class="map-piece"><span class="map-ground-shadow"></span><span class="map-selection-ring"></span><span class="map-pawn">${pawn(unit)}</span><span class="map-unit-caption"><span class="map-unit-name">${esc(d?.name || '纸偶')}</span><span class="map-level">L${formatNumber(unit.level)}</span></span><span class="map-health-track"><span class="map-health-fill" style="width:${percent(health, shown.maxHealth)}%"></span></span><span class="map-vitals"><span class="map-health-value">${formatNumber(health)}</span><span class="map-shield-value${shown.shield > 0n ? ' has-shield' : ''}">◇ ${formatNumber(shown.shield || 0n)}</span></span>${shown.shield > 0n ? '<span class="map-shield-aura"></span>' : ''}</span></button>`;
}

export function mapMarkup({ board = [], frame = null, previous = null, selectedUid = null, targetUids = [], validUids = [], deploying = false } = {}) {
  const battle = Boolean(frame);
  const options = { frame, selectedUid, targetUids, validUids };
  const teams = battle ? frame.teams : [board, []];
  const oldByUid = new Map((previous?.teams || []).flat().filter(Boolean).map(unit => [unit.uid, unit]));
  const currentIds = new Set(teams.flat().filter(Boolean).map(unit => unit.uid));
  let units = '';
  for (let side = 0; side < 2; side++) for (let slot = 0; slot < 6; slot++) {
    const unit = teams[side]?.[slot];
    if (unit) units += unitMarkup(unit, side, slot, oldByUid.get(unit.uid), battle, options);
    else if (!battle && side === 0) units += `<button type="button" class="map-slot${deploying ? ' targetable' : ''}" data-action="slot" data-slot="${slot}" data-drag-zone="board" style="--slot:${slot % 3};--row:${slot < 3 ? 0 : 1}" aria-label="部署到${slot < 3 ? '前排' : '后排'} ${slot % 3 + 1} 号位置"><span class="map-slot-ring"></span><span class="map-slot-label">${slot < 3 ? '前排' : '后排'} ${slot % 3 + 1}</span></button>`;
  }
  if (frame?.type === 'death') for (const old of oldByUid.values()) if (!currentIds.has(old.uid)) units += unitMarkup(old, old.side, old.slot, old, true, options, true);
  return `<section class="map-stage ${battle ? 'is-battle' : 'is-prep'}" aria-label="青苔遗迹${battle ? '战斗地图' : '布阵地图'}"><div class="map-world">${terrain}<span class="map-location"><span>青苔遗迹</span><small>MOSSBOUND RUINS</small></span><div class="map-units">${units}</div><div class="map-effects" aria-hidden="true"></div>${!battle && board.every(card => !card) ? '<p class="map-empty-hint">将角色拖入遗迹，组成你的旅团</p>' : ''}</div></section>`;
}

/** Every animation reads a resolved frame; it never changes battle state or consumes its RNG. */
export function animateMap(stage, { frame, previous = null, duration = 1000, animate = true } = {}) {
  const animations = [];
  const ephemeral = [];
  let raf = 0;
  let destroyed = false;
  let impacted = false;
  let stopped = false;
  let clock = null;
  const units = new Map([...stage.querySelectorAll('.map-unit')].map(node => [node.dataset.uid, node]));
  const previousUnits = new Map((previous?.teams || []).flat().filter(Boolean).map(unit => [unit.uid, unit]));
  const currentUnits = new Map((frame?.teams || []).flat().filter(Boolean).map(unit => [unit.uid, unit]));
  const play = (element, keyframes, options = {}) => {
    if (!element) return null;
    const animation = element.animate(keyframes, { duration, fill: 'both', easing: 'ease-in-out', ...options });
    animations.push(animation);
    return animation;
  };
  const commitImpact = () => {
    if (impacted || destroyed) return;
    impacted = true;
    if (animate && (frame?.type === 'attack' || frame?.type === 'skill' && [...currentUnits].some(([uid, unit]) => previousUnits.has(uid) && (unit.health < previousUnits.get(uid).health || unit.shield < previousUnits.get(uid).shield)))) sound('hit');
    for (const node of units.values()) {
      node.querySelector('.map-health-fill').style.width = `${node.dataset.healthPercent}%`;
      node.querySelector('.map-health-value').textContent = formatNumber(BigInt(node.dataset.health));
      const shield = node.querySelector('.map-shield-value');
      shield.textContent = `◇ ${formatNumber(BigInt(node.dataset.shield))}`;
      shield.classList.toggle('has-shield', BigInt(node.dataset.shield) > 0n);
      const aura = node.querySelector('.map-shield-aura');
      if (BigInt(node.dataset.shield) > 0n && !aura) {
        const bubble = document.createElement('span');
        bubble.className = 'map-shield-aura';
        node.querySelector('.map-piece').append(bubble);
      } else if (BigInt(node.dataset.shield) <= 0n) aura?.remove();
    }
  };
  const controller = {
    pause() { stopped = true; for (const animation of animations) animation.pause(); cancelAnimationFrame(raf); },
    resume() { if (destroyed || !stopped) return; stopped = false; for (const animation of animations) if (animation.playState !== 'finished') animation.play(); tick(); },
    destroy() { destroyed = true; cancelAnimationFrame(raf); for (const animation of animations) animation.cancel(); for (const element of ephemeral) element.remove(); for (const node of units.values()) delete node.dataset.motion; }
  };
  if (!frame || !animate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    commitImpact();
    for (const node of units.values()) if (node.classList.contains('departing')) node.style.opacity = '0';
    return controller;
  }
  const bounds = stage.getBoundingClientRect();
  const point = node => {
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2 - bounds.left, y: rect.top + rect.height * .62 - bounds.top };
  };
  const effect = (className, at, text = '') => {
    const element = document.createElement('span');
    element.className = className;
    element.style.left = `${at.x}px`;
    element.style.top = `${at.y}px`;
    element.textContent = text;
    stage.querySelector('.map-effects').append(element);
    ephemeral.push(element);
    return element;
  };
  const impactPoint = new Map();
  const projectiles = [];
  const actor = units.get(frame.actor);
  const target = units.get(frame.target);
  function attack(source, destination, counter = false) {
    if (!source || !destination) return;
    source.dataset.motion = counter ? 'counter' : 'attack';
    const a = point(source), b = point(destination);
    const dx = b.x - a.x, dy = b.y - a.y;
    const distance = Math.hypot(dx, dy) || 1;
    const isRanged = source.dataset.ranged === 'true';
    const travel = Math.max(0, 1 - Math.min(44, source.clientWidth * .55) / distance);
    const moveX = isRanged ? dx / distance * 9 : dx * travel;
    const moveY = isRanged ? dy / distance * 9 : dy * travel;
    const start = counter ? .21 : 0;
    play(source.querySelector('.map-piece'), [
      { transform: 'translate(0,0)', offset: 0 },
      { transform: 'translate(0,0)', offset: start },
      { transform: `translate(${moveX}px,${moveY}px)`, offset: .39 },
      { transform: `translate(${moveX}px,${moveY}px) scale(1.06)`, offset: .5 },
      { transform: `translate(${moveX}px,${moveY}px)`, offset: .61 },
      { transform: 'translate(0,0)', offset: .96 },
      { transform: 'translate(0,0)', offset: 1 }
    ]);
    impactPoint.set(source.dataset.uid, { x: a.x + moveX, y: a.y + moveY });
    source.style.zIndex = counter ? '21' : '22';
    play(source.querySelector('.pawn-weapon'), [
      { transform: 'rotate(0deg)', offset: 0 }, { transform: 'rotate(-36deg)', offset: .32 },
      { transform: 'rotate(65deg)', offset: .49 }, { transform: 'rotate(0deg)', offset: .72 }, { transform: 'rotate(0deg)', offset: 1 }
    ]);
    if (isRanged) projectiles.push(() => {
      const launch = impactPoint.get(source.dataset.uid) || a;
      const destinationPoint = impactPoint.get(destination.dataset.uid) || b;
      const px = destinationPoint.x - launch.x, py = destinationPoint.y - launch.y;
      const projectile = effect('map-projectile', launch);
      const angle = Math.atan2(py, px) * 180 / Math.PI;
      play(projectile, [
        { transform: `translate(0,0) rotate(${angle}deg)`, opacity: 0, offset: 0 },
        { transform: `translate(0,0) rotate(${angle}deg)`, opacity: 1, offset: .2 },
        { transform: `translate(${px}px,${py}px) rotate(${angle}deg)`, opacity: 1, offset: .46 },
        { transform: `translate(${px}px,${py}px) rotate(${angle}deg) scale(1.8)`, opacity: 0, offset: .53 },
        { opacity: 0, offset: 1 }
      ], { easing: 'linear' });
    }); else {
      const slash = effect('map-slash', b);
      play(slash, [{ opacity: 0, transform: 'translate(-50%,-50%) rotate(-60deg) scale(.3)', offset: 0 }, { opacity: 0, offset: .38 }, { opacity: 1, transform: 'translate(-50%,-50%) rotate(20deg) scale(1)', offset: .48 }, { opacity: 0, transform: 'translate(-50%,-50%) rotate(85deg) scale(1.3)', offset: .67 }, { opacity: 0, offset: 1 }]);
    }
  }
  if (frame.type === 'attack') {
    attack(actor, target);
    // A melee defender stays in place to counter a charging opponent; it closes on a ranged caster.
    if (actor?.dataset.ranged === 'true') attack(target, actor, true);
    else if (target) {
      target.dataset.motion = 'counter';
      play(target.querySelector('.pawn-weapon'), [{ transform: 'rotate(-25deg)', offset: 0 }, { transform: 'rotate(-25deg)', offset: .35 }, { transform: 'rotate(65deg)', offset: .5 }, { transform: 'rotate(0deg)', offset: 1 }]);
    }
  } else if (frame.type === 'skill' && actor) {
    actor.dataset.motion = 'cast';
    play(actor.querySelector('.map-pawn'), [{ transform: 'translateY(0)' }, { transform: 'translateY(-9px)', offset: .38 }, { transform: 'translateY(0)' }]);
    const ring = effect('map-cast-ring', point(actor));
    play(ring, [{ transform: 'translate(-50%,-10%) scale(.3)', opacity: 0 }, { opacity: .95, offset: .3 }, { transform: 'translate(-50%,-10%) scale(1.5)', opacity: 0 }]);
  }
  for (const launch of projectiles) launch();
  for (const [uid, node] of units) {
    const now = currentUnits.get(uid), before = previousUnits.get(uid);
    const at = impactPoint.get(uid) || point(node);
    if (frame.type === 'death' && !now) {
      node.dataset.motion = 'death';
      play(node.querySelector('.map-piece'), [{ transform: 'translateY(0) rotate(0)', opacity: 1 }, { transform: 'translateY(10px) rotate(28deg)', opacity: .5, offset: .5 }, { transform: 'translateY(30px) rotate(40deg) scale(.3)', opacity: 0 }]);
      const ash = effect('map-ash', at, '✦');
      play(ash, [{ transform: 'translate(-50%,0) scale(.4)', opacity: 0 }, { opacity: .8, offset: .4 }, { transform: 'translate(-50%,-45px) scale(1.7)', opacity: 0 }]);
      continue;
    }
    if (frame.type === 'summon' && now && !before) {
      node.dataset.motion = 'summon';
      play(node.querySelector('.map-piece'), [{ transform: 'translateY(15px) scale(.1)', opacity: 0 }, { transform: 'translateY(-5px) scale(1.08)', opacity: 1, offset: .55 }, { transform: 'translateY(0) scale(1)', opacity: 1 }]);
      const ring = effect('map-cast-ring summon-ring', at);
      play(ring, [{ transform: 'translate(-50%,0) scale(.3)', opacity: .9 }, { transform: 'translate(-50%,0) scale(1.7)', opacity: 0 }]);
    }
    if (!now || !before || !['attack', 'skill'].includes(frame.type)) continue;
    const healthDelta = now.health - before.health;
    const shieldDelta = (now.shield || 0n) - (before.shield || 0n);
    const damage = healthDelta < 0n || shieldDelta < 0n;
    const healing = healthDelta > 0n;
    if (damage || healing || shieldDelta > 0n) {
      const label = healing ? `+${formatNumber(healthDelta)}` : healthDelta < 0n ? `−${formatNumber(-healthDelta)}` : `${shieldDelta > 0n ? '+' : '−'}${formatNumber(shieldDelta < 0n ? -shieldDelta : shieldDelta)} 护盾`;
      const number = effect(`map-float-number ${damage ? 'damage' : healing ? 'healing' : 'shielding'}`, { ...at, y: at.y - 27 }, label);
      play(number, [{ transform: 'translate(-50%,0) scale(.5)', opacity: 0, offset: 0 }, { opacity: 0, offset: .44 }, { transform: 'translate(-50%,-9px) scale(1.2)', opacity: 1, offset: .49 }, { transform: 'translate(-50%,-35px) scale(1)', opacity: 1, offset: .79 }, { transform: 'translate(-50%,-49px) scale(.9)', opacity: 0, offset: 1 }]);
      const flash = effect(`map-hit-burst ${damage ? '' : healing ? 'healing' : 'shielding'}`, at);
      play(flash, [{ transform: 'translate(-50%,-50%) scale(.1)', opacity: 0, offset: 0 }, { opacity: 0, offset: .42 }, { opacity: .9, transform: 'translate(-50%,-50%) scale(.6)', offset: .47 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.5)', offset: .68 }, { opacity: 0, offset: 1 }]);
      if (damage) play(node.querySelector('.map-pawn'), [{ filter: 'brightness(1)', offset: 0 }, { filter: 'brightness(1)', offset: .44 }, { filter: 'brightness(2.2) saturate(.3)', offset: .47 }, { filter: 'brightness(1)', offset: .59 }, { filter: 'brightness(1)', offset: 1 }]);
    }
  }
  clock = play(stage.querySelector('.map-effects'), [{ opacity: 1 }, { opacity: 1 }]);
  function tick() {
    if (destroyed || stopped || !clock) return;
    if (Number(clock.currentTime) >= duration * .46) commitImpact();
    if (clock.playState !== 'finished') raf = requestAnimationFrame(tick);
    else commitImpact();
  }
  tick();
  return controller;
}
