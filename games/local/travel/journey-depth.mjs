import { PLACES, canVisit } from './game-state.mjs';

const STORIES = [
  { id: 'oldtown', tag: '巷陌 / A SLOW BEGINNING', title: '把时光，<br>交给大理。', description: '从一条青石小巷开始，<br>跟着风，走进苍山洱海的一天。', english: 'DALI OLD TOWN', line: '第一站 · 在古城，慢下来', short: '古城' },
  { id: 'pagodas', tag: '古意 / A THOUSAND YEARS', title: '山静，<br>塔影长。', description: '三座古塔，把千年的故事留在山前。<br>这一刻，连倒影都不急着离开。', english: 'THE THREE PAGODAS', line: '第二站 · 在塔影里，读时间', short: '三塔' },
  { id: 'meadow', tag: '山野 / INTO THE GREEN', title: '向山走，<br>向风生长。', description: '沿着花甸的小路，走近苍山。<br>不用赶路，山野会等你。', english: 'CANGSHAN MEADOW', line: '第三站 · 把心事，交给旷野', short: '花甸' },
  { id: 'village', tag: '田园 / GOLDEN AFTERNOON', title: '风吹稻浪，<br>日子悠长。', description: '白墙灰瓦，围住一院阳光。<br>拐个弯，就遇见喜洲的金色田野。', english: 'XIZHOU VILLAGE', line: '第四站 · 在田埂边，晒太阳', short: '喜洲' },
  { id: 'cafe', tag: '水岸 / A CUP OF STILLNESS', title: '一杯咖啡，<br>半日洱海。', description: '让杯中的热气，慢慢飘向湖面。<br>今天的待办，只有发呆。', english: 'COFFEE BY ERHAI', line: '第五站 · 把午后，留给湖水', short: '咖啡' },
  { id: 'pier', tag: '暮色 / UNTIL THE LAST LIGHT', title: '追一场光，<br>记一片海。', description: '走到栈桥的尽头，看晚霞落进水里。<br>旅程有终点，回忆没有。', english: 'LONGKAN PIER', line: '第六站 · 把这一天，温柔收藏', short: '码头' },
];
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
export const JOURNEY_END = STORIES.length - .42;

// Only the editorial copy fades. Scenery has fixed world coordinates and stays opaque.
export function journeyFrame(progress, index, reduced = false) {
  const local = clamp(Number.isFinite(progress) ? progress : 0, 0, JOURNEY_END) - index;
  const entering = ease((local + .42) / .42);
  const leaving = index === STORIES.length - 1 ? 0 : ease((local - .58) / .42);
  const copyOpacity = local < 0 ? ease((local + .15) / .15) : index === STORIES.length - 1 ? 1 : 1 - ease((local - .5) / .25);
  return {
    opacity: 1,
    copyY: reduced ? 0 : (1 - entering) * 45 - leaving * 65,
    copyOpacity,
  };
}

// One camera, six persistent landmarks. Pulling back reveals adjacent scenery;
// moving forward enlarges the same objects without swapping their image sources.
export function projectJourney(progress, width, height, reduced = false) {
  const p = clamp(Number.isFinite(progress) ? progress : 0, 0, JOURNEY_END);
  const mobile = width <= 760;
  const landmarkWidth = mobile ? width * 1.32 : Math.min(height * .86, width * .74);
  const spacing = mobile ? width * 1.02 : Math.max(landmarkWidth * .97, width * .61);
  const cameraX = Math.min(p, 5) * spacing;
  const pullback = reduced ? 0 : p < 5 ? .32 * Math.sin(Math.PI * p) ** 2 : -.08 * (p - 5) / .58;
  const scale = 1 / (1 + pullback);
  const nearScale = 1 / (1 + pullback * 1.5);
  const center = width * (mobile ? .5 : .64);
  const farWidth = Math.max(width * 1.35, height * 1.5);
  const far = { x: (width - farWidth) / 2 + (2.5 * spacing - cameraX) * .012, y: (height - farWidth / 1.5) / 2, width: farWidth, height: farWidth / 1.5, scale: 1 };
  const landmarks = STORIES.map((_, index) => ({
    x: center + (index * spacing - cameraX - landmarkWidth / 2) * scale,
    y: height * 1.08 - landmarkWidth * 1.5 * scale,
    width: landmarkWidth, height: landmarkWidth * 1.5, scale,
  }));
  const nearWidth = landmarkWidth * 1.14;
  const foreground = Array.from({ length: 7 }, (_, index) => ({
    x: center + ((index - .15) * spacing - cameraX) * 1.55 * nearScale - nearWidth * nearScale / 2,
    y: height * 1.07 - nearWidth / 1.5 * nearScale,
    width: nearWidth, height: nearWidth / 1.5, scale: nearScale,
  }));
  return { cameraX, far, landmarks, foreground };
}

export function startJourney({ initialId, getState, onCollect, onLeave, onSound = () => {} }) {
  const dialog = document.querySelector('#journey-dialog');
  const initial = Math.max(0, STORIES.findIndex(story => story.id === initialId));
  dialog.innerHTML = `
    <div class="journey-scroll" tabindex="0" aria-label="大理风景画卷，上下滑动或使用方向键游览">
      <div class="journey-track"><div class="journey-stage">
        <div class="journey-world" aria-hidden="true">
          <img class="journey-distant journey-visual" data-depth="far" data-world-id="distant" src="./assets/journey/layers/distant.webp" alt="" draggable="false">
          ${STORIES.map(story => `<img class="journey-image journey-visual" data-depth="landmark" data-world-id="${story.id}" src="./assets/journey/layers/${story.id}.webp" alt="" draggable="false">`).join('')}
          ${Array.from({ length: 7 }, (_, i) => `<img class="journey-foreground journey-visual" data-depth="near" data-world-id="near-${i}" src="./assets/journey/layers/foreground.webp" alt="" draggable="false">`).join('')}
        </div>
        <div class="journey-shade"></div>
        ${STORIES.map((story, i) => `<article class="journey-scene" data-place="${story.id}" aria-label="${PLACES[i].name}">
          <div class="journey-copy"><p class="journey-kicker"><span>0${i + 1}</span>${story.tag}</p><h2>${story.title}</h2><p class="journey-description">${story.description}</p></div>
          <div class="journey-caption"><small>${story.english}</small><p>${story.line}</p></div>
        </article>`).join('')}
      </div></div>
    </div>
    <header class="journey-header"><button id="journey-close" aria-label="返回地图">← 返回地图</button><span class="brand">去野 <small>DALI / A LITTLE ESCAPE</small></span><a href="./credits.html" target="_blank" rel="noopener">画面来源 ↗</a></header>
    <nav class="journey-nav" aria-label="风景章节">${STORIES.map((story, i) => `<button data-chapter="${i}" aria-label="前往${PLACES[i].name}"><small>0${i + 1}</small><span>${story.short}</span><span class="nav-dot"></span></button>`).join('')}</nav>
    <div class="journey-bottom"><div class="journey-scroll-hint"><i></i><span>上下滑动 · 走进风景</span></div><div class="journey-collect"><button id="journey-collect">收藏这一刻 ＋</button><p id="journey-status"></p></div></div>
    <div class="journey-progress" aria-hidden="true"><i></i></div>
    <div id="journey-toast" role="status" aria-live="polite"></div>
    <div id="journey-loading"><h2>风景，正在展开</h2><p>沿着山海，慢慢出发。</p><button id="journey-retry" hidden>重新加载这一站</button></div>`;
  const $ = selector => dialog.querySelector(selector);
  const scroll = $('.journey-scroll');
  const scenes = [...dialog.querySelectorAll('.journey-scene')];
  const images = [...dialog.querySelectorAll('.journey-visual')];
  const sources = images.map(image => image.getAttribute('src'));
  const nav = [...dialog.querySelectorAll('[data-chapter]')];
  const loaded = images.map(() => 'loading');
  const controller = new AbortController();
  const listen = (element, event, fn, options = {}) => element.addEventListener(event, fn, { ...options, signal: controller.signal });
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let span = 1, progress = initial, active = initial, raf = 0, closed = false, toastTimer;

  function updateControls() {
    const place = PLACES[active];
    const eligibility = canVisit(getState(), place.id);
    const collected = getState().visits.some(visit => visit.id === place.id);
    const required = [0, 7, ...STORIES.flatMap((_, i) => Math.abs(i - active) <= 1 ? [i + 1] : [])];
    const ready = required.every(index => loaded[index] === 'ready');
    const failed = required.some(index => loaded[index] === 'error');
    $('#journey-collect').disabled = !ready || !eligibility.ok;
    $('#journey-collect').textContent = collected ? `已收藏 · ${place.stamp} ✓` : '收藏这一刻 ＋';
    $('#journey-status').textContent = collected ? '风景已存入手账，继续滑动去下一站' : eligibility.ok ? `收藏消耗 2 小时 · ¥${place.cost} · ${place.energy} 体力` : `${eligibility.reason} · 仍可自由欣赏`;
    $('#journey-loading').hidden = ready;
    $('#journey-loading h2').textContent = failed ? '这一帧，暂时走丢了' : '风景，正在展开';
    $('#journey-loading p').textContent = failed ? '可以重新加载，或返回地图。旅费和体力未扣除。' : '远山、街巷与花草，正在一起就位。';
    $('#journey-retry').hidden = !failed;
    $('.journey-scroll-hint span').textContent = progress >= JOURNEY_END - .05 ? '向上滑动 · 再看一眼' : '上下滑动 · 走进风景';
  }

  function draw() {
    raf = 0;
    if (closed) return;
    progress = clamp(scroll.scrollTop / span, 0, JOURNEY_END);
    active = Math.min(STORIES.length - 1, Math.round(progress));
    dialog.dataset.progress = progress.toFixed(4);
    dialog.dataset.place = STORIES[active].id;
    const projection = projectJourney(progress, scroll.clientWidth, scroll.clientHeight, motion.matches);
    dialog.dataset.cameraX = projection.cameraX.toFixed(3);
    [projection.far, ...projection.landmarks, ...projection.foreground].forEach((rect, index) => {
      const style = images[index].style;
      style.width = `${rect.width}px`;
      style.height = `${rect.height}px`;
      style.transform = `translate3d(${rect.x}px,${rect.y}px,0) scale(${rect.scale})`;
    });
    scenes.forEach((scene, index) => {
      const frame = journeyFrame(progress, index, motion.matches);
      const style = scene.style;
      style.setProperty('--copy-y', `${frame.copyY}px`);
      style.setProperty('--copy-opacity', frame.copyOpacity);
      scene.dataset.active = String(index === active);
      scene.setAttribute('aria-hidden', String(index !== active));
      nav[index].classList.toggle('active', index === active);
      nav[index].setAttribute('aria-current', index === active ? 'step' : 'false');
    });
    $('.journey-progress i').style.width = `${progress / JOURNEY_END * 100}%`;
    updateControls();
  }

  const requestDraw = () => { if (!raf && !closed) raf = requestAnimationFrame(draw); };
  function resize() {
    const height = scroll.clientHeight;
    if (!height) return;
    span = height * 2.4;
    $('.journey-track').style.height = `${height + span * JOURNEY_END}px`;
    scroll.scrollTop = progress * span;
    draw();
  }
  const observer = new ResizeObserver(resize);

  async function loadImage(index, retry = false) {
    loaded[index] = 'loading';
    if (retry) images[index].src = `${sources[index]}?retry=${Date.now()}`;
    try { await images[index].decode(); loaded[index] = 'ready'; }
    catch { loaded[index] = 'error'; }
    if (!closed) updateControls();
  }

  function notify(message) {
    clearTimeout(toastTimer);
    $('#journey-toast').textContent = message;
    $('#journey-toast').classList.add('visible');
    toastTimer = setTimeout(() => $('#journey-toast').classList.remove('visible'), 3100);
  }

  function collect() {
    const index = active;
    if (closed || $('#journey-collect').disabled || !canVisit(getState(), STORIES[index].id).ok) return;
    try {
      const canvas = document.createElement('canvas');
      const stage = $('.journey-stage').getBoundingClientRect();
      canvas.width = Math.round(Math.min(540, 720 * stage.width / stage.height));
      canvas.height = Math.round(canvas.width * stage.height / stage.width);
      const ctx = canvas.getContext('2d');
      const ratio = canvas.width / stage.width;
      ctx.fillStyle = '#e9ece0'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const image of images) {
        if (!image.complete || !image.naturalWidth) continue;
        const rect = image.getBoundingClientRect();
        if (rect.right < stage.left || rect.left > stage.right) continue;
        ctx.drawImage(image, (rect.left - stage.left) * ratio, (rect.top - stage.top) * ratio, rect.width * ratio, rect.height * ratio);
      }
      const shade = ctx.createLinearGradient(0, canvas.height - 110, 0, canvas.height);
      shade.addColorStop(0, 'transparent'); shade.addColorStop(1, '#173a32cc');
      ctx.fillStyle = shade; ctx.fillRect(0, canvas.height - 110, canvas.width, 110);
      ctx.fillStyle = '#fffcf0'; ctx.font = '22px "Microsoft YaHei", sans-serif';
      ctx.fillText(PLACES[index].name, 24, canvas.height - 42);
      ctx.font = '10px Georgia'; ctx.fillText(`QUYE / ${STORIES[index].english}`, 25, canvas.height - 20);
      let photo = canvas.toDataURL('image/jpeg', .8);
      if (photo.length > 220000) photo = canvas.toDataURL('image/jpeg', .56);
      onCollect(STORIES[index].id, 100, photo);
      onSound('photo');
      updateControls();
      notify(`「${PLACES[index].stamp}」印章已收藏，插画明信片已存入手账。`);
    } catch { notify('这一刻暂未保存，请再试一次。'); }
  }

  function close() {
    if (closed) return;
    closed = true;
    controller.abort(); observer.disconnect();
    cancelAnimationFrame(raf); clearTimeout(toastTimer);
    dialog.close();
    onLeave();
  }
  listen(scroll, 'scroll', requestDraw, { passive: true });
  listen(motion, 'change', requestDraw);
  listen($('#journey-close'), 'click', close);
  listen(dialog, 'cancel', event => { event.preventDefault(); close(); });
  listen(dialog, 'close', close);
  listen($('#journey-collect'), 'click', collect);
  listen($('#journey-retry'), 'click', () => { loaded.forEach((status, index) => { if (status === 'error') void loadImage(index, true); }); updateControls(); });
  nav.forEach((button, index) => listen(button, 'click', () => {
    scroll.scrollTo({ top: index * span, behavior: motion.matches ? 'instant' : 'smooth' });
    scroll.focus({ preventScroll: true });
  }));
  dialog.showModal();
  resize(); observer.observe(scroll);
  scroll.focus({ preventScroll: true });
  images.forEach((_, index) => void loadImage(index));
  return { close };
}
