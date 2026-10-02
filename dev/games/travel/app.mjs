import { PLACES, newGame, restoreGame, canVisit, completeVisit, rest, finishTrip, isValidPhoto, starsForScore, tripTitle } from './game-state.mjs';

const $ = selector => document.querySelector(selector);
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const placeIcons = { oldtown: 'map', pagodas: 'compass', meadow: 'leaf', village: 'sun', cafe: 'cup', pier: 'camera' };
const KEY = 'quye-travel-v1';
let saved;
let storageAvailable = true;
try { saved = JSON.parse(localStorage.getItem(KEY)); } catch { storageAvailable = false; }
let state = restoreGame(saved?.state);
let album = Array.isArray(saved?.album) ? saved.album.filter((p, i, all) => p && PLACES.some(place => place.id === p.id) && Number.isInteger(p.score) && p.score >= 0 && p.score <= 100 && p.stars === starsForScore(p.score) && (p.photo === undefined || isValidPhoto(p.photo)) && all.findIndex(v => v?.id === p.id) === i).map(({ id, score, stars, photo }) => ({ id, score, stars, ...(photo ? { photo } : {}) })) : [];
let selected = PLACES.find(p => !state.visits.some(v => v.id === p.id)) || PLACES[0];
let busy = false;
let soundOn = false;
let audio;
let toastTimer;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3400);
}

function mergeAlbum() {
  for (const visit of state.visits) {
    const previous = album.find(p => p.id === visit.id);
    if (!previous) album.push({ ...visit });
    else if (visit.score > previous.score || (visit.photo && !previous.photo)) Object.assign(previous, visit);
  }
}

function save() {
  mergeAlbum();
  try {
    localStorage.setItem(KEY, JSON.stringify({ state, album }));
    storageAvailable = true;
  } catch {
    storageAvailable = false;
    toast('浏览器暂时无法存档，请先保留此页面；也可以导出手账。');
  }
}

function playSound(type = 'tap') {
  if (!soundOn) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    const notes = type === 'step' ? [135] : type === 'photo' ? [740, 990, 1320] : type === 'rest' ? [440, 554, 659] : type === 'finish' ? [523, 659, 784, 1047] : [660];
    notes.forEach((frequency, i) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + i * 0.085;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(type === 'step' ? 0.012 : 0.045, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.25);
    });
  } catch { soundOn = false; renderSound(); }
}

function renderSound() {
  $('#sound-toggle').classList.toggle('muted', !soundOn);
  $('#sound-toggle').setAttribute('aria-pressed', String(soundOn));
  $('#sound-toggle').setAttribute('aria-label', soundOn ? '关闭音效' : '开启音效');
}

function render() {
  $('#time-value').textContent = `${String(state.hour).padStart(2, '0')}:00`;
  $('#energy-value').innerHTML = `${state.energy}<em>/ 100</em>`;
  $('#energy-bar').style.width = `${state.energy}%`;
  $('#money-value').innerHTML = `<em>¥</em>${state.money}`;
  $('#visit-count').textContent = state.visits.length;
  $('#journey-bar').style.width = `${Math.min(100, state.visits.length / 4 * 100)}%`;
  $('#album-count').textContent = album.length;
  $('.live-dot').textContent = state.status === 'finished' ? '今日已收官' : '正在漫游';
  $('#map-pins').innerHTML = PLACES.map(p => {
    const visited = state.visits.some(v => v.id === p.id);
    return `<button class="map-pin ${selected.id === p.id ? 'selected' : ''} ${visited ? 'visited' : ''}" style="left:${p.x}%;top:${p.y}%" data-place="${p.id}" aria-label="${p.name}${visited ? '，已收集印章' : '，选择目的地'}" aria-pressed="${p.id === selected.id}" ${busy ? 'disabled' : ''}><span class="pin-head">${icon(visited ? 'check' : placeIcons[p.id])}</span><span class="pin-name">${p.name}</span></button>`;
  }).join('');
  $('#traveler').style.left = `${state.position.x}%`;
  $('#traveler').style.top = `${state.position.y}%`;
  const route = [newGame().position, ...state.visits.map(v => PLACES.find(p => p.id === v.id))];
  $('#route-history').setAttribute('d', route.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' '));
  $('#route-preview').setAttribute('d', state.status === 'playing' && !state.visits.some(v => v.id === selected.id) ? `M${state.position.x} ${state.position.y} L${selected.x} ${selected.y}` : '');
  $('#place-number').textContent = `下一站 / ${String(PLACES.indexOf(selected) + 1).padStart(2, '0')}`;
  $('#place-name').textContent = selected.name;
  $('#place-description').textContent = `${selected.description}${selected.detail}`;
  $('#place-tag').textContent = selected.subtitle;
  $('#image-caption').textContent = selected.flavor;
  $('#destination-image').style.backgroundPosition = `center, ${selected.x}% ${selected.y}%`;
  $('#place-distance').textContent = selected.id === 'meadow' ? '苍山脚下' : selected.id === 'cafe' ? '水岸慢时光' : '山海之间';
  $('#place-energy').textContent = selected.energy;
  $('#place-cost').textContent = selected.cost;
  $('#preview-stamp').innerHTML = icon(placeIcons[selected.id]);
  $('#preview-stamp').style.color = selected.color;
  $('#place-reward').textContent = `滑动展开山海，收藏${selected.stamp}印章与插画明信片`;
  const visited = state.visits.find(v => v.id === selected.id);
  const eligibility = canVisit(state, selected.id);
  $('#travel-button').disabled = busy;
  $('#travel-button').innerHTML = `${busy ? '正在展开风景…' : visited ? '再看一眼风景' : '就去这里'}${icon('arrow')}`;
  $('#destination-note').textContent = visited ? '印章已存入手账，随时回来重温风景。' : eligibility.ok ? '上下滑动，走进六幕大理风景。' : `${eligibility.reason}，仍可进入欣赏风景。`;
  $('#destination-note').classList.remove('unavailable');
  $('#rest-button').disabled = busy || state.status !== 'playing' || state.energy >= 100 || state.money < 15;
  $('#finish-button').disabled = busy;
  $('#finish-button').innerHTML = `${state.status === 'finished' ? '查看旅行总结' : '结束今日旅行'} ${icon('arrow')}`;
  $('#stamp-slots').innerHTML = Array.from({ length: 4 }, (_, i) => {
    const visit = state.visits[i];
    const p = visit && PLACES.find(p => p.id === visit.id);
    return `<div class="stamp-slot ${p ? 'collected' : ''}" ${p ? `title="${p.name} · ${visit.score} 分"` : ''}><small>${p ? '★'.repeat(visit.stars) : `0${i + 1}`}</small>${icon(p ? placeIcons[p.id] : ['compass', 'camera', 'leaf', 'sun'][i])}<span>${p ? p.stamp + ' · 已收藏' : ['第一份心动', '一帧好风景', '一场小奇遇', '一些新回忆'][i]}</span></div>`;
  }).join('');
}

function openInfo(title, content, eyebrow = 'YOUR LITTLE JOURNEY') {
  $('#info-title').textContent = title;
  $('#info-eyebrow').textContent = eyebrow;
  $('#info-content').innerHTML = content;
  if (!$('#info-dialog').open) $('#info-dialog').showModal();
}

function postcard(visit) {
  const p = PLACES.find(p => p.id === visit.id);
  return `<article class="postcard"><div class="postcard-photo" style="background-position:${p.x}% ${p.y}%">${visit.photo ? `<img class="postcard-photo-image" src="${visit.photo}" alt="你在${p.name}收藏的风景明信片">` : ''}</div><h3>${p.name}</h3><p>${p.flavor}</p><small>${'★'.repeat(visit.stars)} · ${p.stamp}印章${visit.photo ? ' · 风景已珍藏' : ''}</small></article>`;
}

function showAlbum() {
  playSound();
  const content = album.length ? `<div class="album-summary">旅程可以重来，回忆会一直在。<br>已收藏 ${album.length} / 6 个地点 · 旧回忆和新的插画明信片，都在这里</div><div class="album-grid">${album.map(postcard).join('')}</div><div class="dialog-actions"><button class="primary-button" data-action="export">${icon('book')} 导出旅行手账</button></div>` : `<div class="empty-album">${icon('book')}<h3>故事，等你出发。</h3><p>在地图上选一站，收藏第一张插画明信片。<br>你的风景和印章都会珍藏在这里。</p></div><div class="dialog-actions"><button class="primary-button" data-action="close">去收集第一份回忆 ${icon('arrow')}</button></div>`;
  openInfo('我的旅行手账', content, 'POSTCARDS FROM A SLOW DAY');
}

function showGuide() {
  playSound();
  openInfo('用手指，走过苍山洱海', '<div class="guide-grid"><div class="guide-step"><b>01</b><div><h3>选一站，走进画卷</h3><p>点地图上的目的地，再点「就去这里」。六幕精细微缩插画，会从你选中的风景开始。</p></div></div><div class="guide-step"><b>02</b><div><h3>往下走，也可以回头看</h3><p>手机上下滑动，电脑滚动鼠标或使用方向键。镜头推进、文字浮现、风景转场都跟随你的滚动；往回滑，时光也会倒流。点章节名称可直达任意一站。</p></div></div><div class="guide-step"><b>03</b><div><h3>把喜欢的这一刻，收好</h3><p>点「收藏这一刻」，把插画明信片和地点印章装进手账。日落前收集 4 枚印章，完成今日目标。</p></div></div></div><p class="guide-note">自由欣赏不消耗资源。每次收藏消耗 2 小时及标注的体力、旅费；每站每天只能收藏一次。旅程结束或资源不足后，仍可欣赏全部六幕风景。手账自动保存在此设备，也可以导出图片。</p><div class="dialog-actions"><button class="primary-button" data-action="close">出发，展开风景 →</button></div>', 'A SMALL GUIDE TO WANDERING');
}

function showSummary() {
  const won = state.visits.length >= 4;
  const average = state.visits.length ? Math.round(state.memories / state.visits.length) : 0;
  openInfo('今天的风，替你记住了', `<div class="album-summary"><strong>${tripTitle(state)}</strong>${won ? '今日目标达成。你把四份以上的小确幸，装进了行囊。' : '还有风景留给下次。停下来的这一天，也属于你。'}</div><div class="finish-stats"><div><strong>${state.visits.length}</strong><span>枚旅行印章</span></div><div><strong>${average}</strong><span>回忆完成度</span></div><div><strong>¥${200 - state.money}</strong><span>今日花费</span></div></div>${state.visits.length ? `<div class="album-grid">${state.visits.map(postcard).join('')}</div>` : '<p class="save-note">下一次，试着朝喜欢的风景迈出第一步。</p>'}<div class="dialog-actions"><button class="secondary-button" data-action="export" ${album.length ? '' : 'disabled'}>${icon('book')} 导出手账</button><button class="primary-button" data-action="restart">再出发，走条新路线 ${icon('arrow')}</button></div><p class="save-note">重新出发会保留手账里的所有地点和风景明信片。</p>`, 'EVERY LITTLE JOURNEY COUNTS');
}

function finishRequest() {
  if (busy) return;
  if (state.status === 'finished') { showSummary(); return; }
  openInfo('把今天，收进回忆里？', `<div class="album-summary">现在是 ${state.hour}:00，已收集 ${state.visits.length} 枚印章。<br>${state.visits.length < 4 ? `离今日目标还差 ${4 - state.visits.length} 枚，路上还有风景等你。` : '今日目标已达成，可以继续探索，也可以安心收官。'}</div><div class="dialog-actions"><button class="secondary-button" data-action="close">还想再逛逛</button><button class="primary-button" data-action="finish">结束今天的旅行 ${icon('check')}</button></div>`);
}

async function startTravel() {
  if (busy) return;
  busy = true;
  const place = selected;
  const previousVisits = state.visits.length;
  let closed = false;
  render();
  playSound();
  $('#traveler').classList.add('walking');
  $('#traveler').style.left = `${place.x}%`;
  $('#traveler').style.top = `${place.y}%`;
  try {
    const { startJourney } = await import('./journey.mjs');
    $('#traveler').classList.remove('walking');
    startJourney({
      initialId: place.id,
      getState: () => state,
      onSound: playSound,
      onCollect(id, score, photo) {
        if (closed || !canVisit(state, id).ok) return;
        state = completeVisit(state, id, score, photo);
        save();
      },
      onLeave() {
        if (closed) return;
        closed = true;
        busy = false;
        const collected = state.visits.length - previousVisits;
        if (collected) selected = PLACES.find(p => canVisit(state, p.id).ok) || place;
        render();
        $('#map-card').scrollIntoView({ block: 'center', behavior: 'instant' });
        if (collected && state.status === 'finished') { playSound('finish'); showSummary(); }
        else if (collected) toast(`收藏了 ${collected} 枚印章，风景明信片已装进手账。${state.visits.length >= 4 ? '今日目标已达成！' : ''}`);
        else toast('已回到地图。山海一直在，随时再出发。');
      },
    });
  } catch {
    busy = false;
    $('#traveler').classList.remove('walking');
    render();
    toast('风景暂未展开，请刷新后重试。旅费和体力未扣除。');
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && audio?.state === 'running') void audio.suspend().catch(() => {});
});
async function exportJournal() {
  if (!album.length) return;
  const map = $('.map-art');
  try {
    await map.decode();
    const canvas = document.createElement('canvas');
    const rows = Math.ceil(album.length / 2);
    canvas.width = 1000;
    canvas.height = 505 + rows * 290;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f6f5ec';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#d87550';
    ctx.font = '24px Georgia';
    ctx.fillText('QUYE / WANDER A LITTLE', 60, 65);
    ctx.fillStyle = '#40543e';
    ctx.font = 'bold 50px "Noto Serif SC", "Microsoft YaHei", serif';
    ctx.fillText('把沿途，装进行囊。', 60, 145);
    ctx.fillStyle = '#8b927d';
    ctx.font = '21px "Microsoft YaHei", sans-serif';
    ctx.fillText(`大理漫游记  ·  已收藏 ${album.length} 处风景`, 63, 192);
    for (let i = 0; i < album.length; i++) {
      const visit = album[i];
      const p = PLACES.find(p => p.id === visit.id);
      const x = 60 + (i % 2) * 450;
      const y = 235 + Math.floor(i / 2) * 290;
      ctx.fillStyle = '#fffef8';
      ctx.fillRect(x, y, 428, 266);
      const sw = map.naturalWidth / 2.4;
      const sh = sw / 2.25;
      const sx = Math.max(0, Math.min(map.naturalWidth - sw, p.x / 100 * map.naturalWidth - sw / 2));
      const sy = Math.max(0, Math.min(map.naturalHeight - sh, p.y / 100 * map.naturalHeight - sh / 2));
      if (visit.photo) {
        const image = new Image();
        image.src = visit.photo;
        await image.decode();
        const cropHeight = Math.min(image.naturalHeight, image.naturalWidth / (404 / 180));
        ctx.drawImage(image, 0, (image.naturalHeight - cropHeight) / 2, image.naturalWidth, cropHeight, x + 12, y + 12, 404, 180);
      } else ctx.drawImage(map, sx, sy, sw, sh, x + 12, y + 12, 404, 180);
      ctx.fillStyle = '#526849';
      ctx.font = '22px "Microsoft YaHei", sans-serif';
      ctx.fillText(p.name, x + 16, y + 227);
      ctx.fillStyle = '#c39462';
      ctx.font = '15px "Microsoft YaHei", sans-serif';
      ctx.fillText(`${'★'.repeat(visit.stars)}  ${visit.score} 分 · ${p.stamp}印章`, x + 16, y + 252);
    }
    ctx.fillStyle = '#939982';
    ctx.font = '19px "Microsoft YaHei", sans-serif';
    ctx.fillText('世界很大，快乐可以很小。', 60, canvas.height - 177);
    ctx.font = '14px Georgia';
    ctx.fillText('MADE FOR SLOW DAYS  /  DALI INSPIRED', 60, canvas.height - 142);
    ctx.font = '12px Arial';
    ctx.fillText('Legacy photo sources: chensiyuan (CC BY-SA 4.0); Uwe Aranas / Fong Chen / Jason Zhang (CC BY-SA 3.0)', 60, canvas.height - 111);
    ctx.fillText('commons.wikimedia.org/wiki/File:1_dali_old_town_yunnan_2012.jpg', 60, canvas.height - 91);
    ctx.fillText('commons.wikimedia.org/wiki/File:Dali_Yunnan_China_Shop-in-old-town-01.jpg', 60, canvas.height - 73);
    ctx.fillText('commons.wikimedia.org/wiki/File:Erhai_north_Panorama.jpg', 60, canvas.height - 55);
    ctx.fillText('Legacy photo-derived scenery: cropped / projected in 3D · CC BY-SA 4.0 · creativecommons.org/licenses/by-sa/4.0/', 60, canvas.height - 37);
    ctx.fillText('Pagoda details: commons.wikimedia.org/wiki/File:Three_Pagodas_of_Chongsheng_Temple_front_view_from_entrance.jpg', 60, canvas.height - 19);
    ctx.font = '11px Arial';
    ctx.fillText('New illustrated postcards: AI-generated · QUYE / DALI', 530, canvas.height - 142);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('手账图片生成失败');
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = '去野-大理旅行手账.png';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast('手账图片已生成，可在浏览器下载中查看。');
  } catch { toast('手账暂时无法导出，等地图加载完成后再试一次。'); }
}

$('#map-pins').addEventListener('click', event => {
  const button = event.target.closest('[data-place]');
  if (!button || busy) return;
  selected = PLACES.find(p => p.id === button.dataset.place);
  playSound();
  render();
  // Keep keyboard focus on the rebuilt pin after updating its selected state.
  $(`[data-place="${selected.id}"]`).focus({ preventScroll: true });
  if (matchMedia('(max-width: 820px)').matches) $('.destination-card').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'nearest' });
});
$('#travel-button').addEventListener('click', startTravel);
$('#info-close').addEventListener('click', () => $('#info-dialog').close());
$('#info-content').addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'close') $('#info-dialog').close();
  if (action === 'export') void exportJournal();
  if (action === 'finish') { state = finishTrip(state); save(); render(); playSound('finish'); showSummary(); }
  if (action === 'restart') { state = newGame(); selected = PLACES[0]; save(); render(); $('#info-dialog').close(); toast('新的旅程开始了，旧的回忆都还在。'); }
});
$('#sound-toggle').addEventListener('click', () => { soundOn = !soundOn; renderSound(); playSound(); toast(soundOn ? '音效已开启，让旅途多一点声音。' : '音效已关闭，安静地走走。'); });
$('#rest-button').addEventListener('click', () => {
  if (busy) return;
  try { const oldEnergy = state.energy; state = rest(state); save(); render(); playSound('rest'); toast(`坐下来喝杯茶，体力恢复了 ${state.energy - oldEnergy} 点。`); if (state.status === 'finished') showSummary(); }
  catch (error) { toast(error.message); }
});
$('#finish-button').addEventListener('click', finishRequest);
$('#album-nav').addEventListener('click', showAlbum);
$('#open-journal').addEventListener('click', showAlbum);
$('#guide-nav').addEventListener('click', showGuide);
$('#explore-nav').addEventListener('click', () => { $('#map-card').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'center' }); playSound(); });
$('#recenter-button').addEventListener('click', () => { $('#traveler').classList.remove('pulse'); requestAnimationFrame(() => $('#traveler').classList.add('pulse')); toast(state.visits.length ? `你在${PLACES.find(p => p.id === state.visits.at(-1).id).name}，下一站去哪儿？` : '你在洱海岸边。挑一处风景，开始今天的旅行。'); });
$('.map-art').addEventListener('error', () => toast('地图图片加载失败，请刷新页面重试。'));
mergeAlbum();
render();
if (!storageAvailable) toast('存档暂时不可用，当前旅程仍可游玩；请保留此页面。');
