import {
  computePaths,
  panelEndpoints,
  validateScene,
  presets,
  cloneScene,
  WALL_IDS,
  WALL_NAMES,
  wallReflectionFor,
} from './acoustics.js';
import { AudioEngine } from './audio.js';
import { createLayout, validateLayout, createRoomLink, readRoomLink } from './layout.js';
import { createZip } from './archive.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const round = (v) => Math.round(v * 10) / 10;
const STORAGE_KEY = 'echo-lab.scene.v1';
const audio = new AudioEngine();
let scene = cloneScene(presets.first);
let presetKey = 'first';
let selected = scene.panels[0]?.id || 'source';
let geometry;
let pathsVisible = true;
let drag = null;
let view;
let displayedPaths = [];
let timelineMax = 1;
let toastTimeout;
let animationId;
let animationStarted = 0;
let playRequest = 0;
let activePlayback = false;
let recordingPending = false;
let recordInterval;
let recordStarted;
let layoutTimer;
let storageWarningShown = false;
let disposed = false;
let customAudio = null;
let incomingLayout = null;
let exporting = false;
let sourceBusy = false;

const presetDescriptions = {
  first: '远处一块反射板，让拍手有了回应。',
  hall: '让不同墙面接力，听见密集的多重回声。',
  dry: '柔软墙面吸收回响，再加一块板试试。',
};

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (saved?.scene) {
    const restored = saved.format
      ? validateLayout(saved)
      : createLayout(saved.scene, { preset: saved.preset });
    scene = restored.scene;
    presetKey = restored.preset;
    selected = scene.panels[0]?.id || 'source';
    $('volume').value = restored.volume;
    $('soundSelect').value = restored.sound;
  }
} catch {
  /* Unavailable or invalid storage never prevents a new experiment. */
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    $('toast').hidden = true;
  }, 4300);
}

function saveLocal() {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentLayout()));
    } catch {
      if (!storageWarningShown) toast('浏览器未允许自动保存，可用「保存布局」下载 JSON。');
      storageWarningShown = true;
    }
  }, 250);
}

function selectedObject() {
  if (selected === 'source' || selected === 'listener') return scene[selected];
  return scene.panels.find((panel) => panel.id === selected);
}

function stopPlayback() {
  playRequest += 1;
  audio.stop();
  clearPlaybackUI();
}

function clearPlaybackUI() {
  activePlayback = false;
  animationStarted = 0;
  cancelAnimationFrame(animationId);
  $('playWet').classList.remove('playing');
  $('playDry').classList.remove('playing');
  const particles = $('particles');
  if (particles) particles.innerHTML = '';
  const cursor = $('timeCursor');
  if (cursor) cursor.setAttribute('visibility', 'hidden');
  $('animationLabel').textContent = '位置决定声音路径';
}

audio.onPlaybackEnd = () => {
  activePlayback = false;
  $('playWet').classList.remove('playing');
  $('playDry').classList.remove('playing');
  // Short test sounds finish before the deliberately slowed particles arrive.
  // Let that one visual pass complete; manual stop and edits still cancel both.
  if (!animationStarted) clearPlaybackUI();
};

function commit() {
  try {
    scene = validateScene(scene);
    if (!selectedObject() && !WALL_IDS.includes(selected)) selected = 'source';
    if (activePlayback || animationStarted) stopPlayback();
    geometry = computePaths(scene);
    renderControls();
    renderScene();
    renderTimeline();
    renderMetrics();
    saveLocal();
  } catch (error) {
    toast(error.message);
  }
}

function renderControls() {
  $('preset').value = presetKey;
  $('presetDescription').textContent = presetDescriptions[presetKey];
  $('roomWidth').value = scene.width;
  $('roomHeight').value = scene.height;
  $('wallReflection').value = scene.wallReflection * 100;
  $('widthValue').textContent = `${round(scene.width)} m`;
  $('heightValue').textContent = `${round(scene.height)} m`;
  $('wallValue').textContent = `${Math.round(scene.wallReflection * 100)}%`;
  for (const id of WALL_IDS) {
    const overridden = Object.hasOwn(scene.wallReflections, id);
    $(`${id}-override`).checked = overridden;
    $(`${id}-reflection`).disabled = !overridden;
    $(`${id}-reflection`).value = wallReflectionFor(scene, id) * 100;
    $(`${id}-value`).textContent =
      `${Math.round(wallReflectionFor(scene, id) * 100)}%${overridden ? '' : ' · 默认'}`;
  }
  $('roomBadge').textContent = `${round(scene.width)} × ${round(scene.height)} m`;
  $('panelCount').textContent = `${scene.panels.length} / 8`;
  $('addReflector').disabled = scene.panels.length >= 8;
  $('addAbsorber').disabled = scene.panels.length >= 8;
  document.querySelectorAll('[data-scale]').forEach((button) => {
    const active = Number(button.dataset.scale) === scene.delayScale;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active);
  });
  $('modeDescription').textContent =
    scene.delayScale === 1
      ? '按实际路径长度计算声音到达时间。'
      : '增强玩法：所有传播延时扩大 4 倍，音量不变。';
  renderInspector();
}

function renderInspector() {
  const isWall = WALL_IDS.includes(selected);
  $('positionControls').hidden = isWall;
  $('wallProperties').hidden = !isWall;
  if (isWall) {
    $('selectionTitle').innerHTML =
      `<span class="selection-icon">▱</span><div><h3>${WALL_NAMES[selected]}</h3><p>单独调节这面墙的反射率</p></div>`;
    $('panelProperties').hidden = true;
    $('pointHint').hidden = true;
    $('selectedWallDefault').checked = !Object.hasOwn(scene.wallReflections, selected);
    $('selectedWallReflection').disabled = $('selectedWallDefault').checked;
    $('selectedWallReflection').value = wallReflectionFor(scene, selected) * 100;
    $('selectedWallValue').textContent = `${Math.round(wallReflectionFor(scene, selected) * 100)}%`;
    return;
  }
  const object = selectedObject();
  if (!object) return;
  const isPoint = selected === 'source' || selected === 'listener';
  const title =
    selected === 'source'
      ? '发声点'
      : selected === 'listener'
        ? '收音点'
        : object.type === 'absorber'
          ? '吸音屏'
          : '反射板';
  const sub = isPoint
    ? '拖动或输入坐标，探索不同位置'
    : object.type === 'absorber'
      ? '低反射 · 同时阻挡穿过板材的声音'
      : '双面镜面反射 · 转向改变反射路径';
  $('selectionTitle').innerHTML =
    `<span class="selection-icon" style="color:${isPoint ? (selected === 'source' ? '#ed9b89' : '#8ab8dc') : object.type === 'absorber' ? '#e5b46c' : '#bcf18b'}">${isPoint ? '◉' : '↔'}</span><div><h3>${title}</h3><p>${sub}</p></div>`;
  $('positionX').value = round(object.x);
  $('positionY').value = round(object.y);
  $('positionX').max = scene.width;
  $('positionY').max = scene.height;
  $('panelProperties').hidden = isPoint;
  $('pointHint').hidden = !isPoint;
  $('pointHint').textContent =
    selected === 'source'
      ? '声音从这里发出。当前为全方向发声；短促拍手更容易听清反射。'
      : '声音在这里被接收。画面左边对应耳机左侧，右边对应右侧。';
  if (!isPoint) {
    $('panelAngle').value = object.angle % 180;
    $('angleValue').textContent = `${Math.round(object.angle % 180)}°`;
    $('panelLength').max = Math.hypot(scene.width - 0.4, scene.height - 0.4);
    $('panelLength').min = 0.8;
    $('panelLength').value = object.length;
    $('lengthValue').textContent = `${round(object.length)} m`;
    $('panelReflection').max = object.type === 'absorber' ? 20 : 95;
    $('panelReflection').value = object.reflection * 100;
    $('reflectionValue').textContent = `${Math.round(object.reflection * 100)}%`;
  }
}

function project(point) {
  return { x: view.x + point.x * view.scale, y: view.y + point.y * view.scale };
}
function unproject(point) {
  return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale };
}
function polyline(points) {
  return points
    .map((p) => {
      const v = project(p);
      return `${v.x},${v.y}`;
    })
    .join(' ');
}

function renderScene() {
  const scale = Math.min(864 / scene.width, 494 / scene.height);
  view = { scale, x: (1000 - scene.width * scale) / 2, y: (640 - scene.height * scale) / 2 - 4 };
  const w = scene.width * scale;
  const h = scene.height * scale;
  const gridSize = Math.max(1, Math.round(scene.width / 12)) * scale;
  const screenScale = Math.max(0.1, $('scene').getBoundingClientRect().width / 1000);
  const hitWidth = Math.max(34, 44 / screenScale);
  const wallPoints = [
    [
      { x: view.x, y: view.y },
      { x: view.x + w, y: view.y },
    ],
    [
      { x: view.x + w, y: view.y },
      { x: view.x + w, y: view.y + h },
    ],
    [
      { x: view.x + w, y: view.y + h },
      { x: view.x, y: view.y + h },
    ],
    [
      { x: view.x, y: view.y + h },
      { x: view.x, y: view.y },
    ],
  ];
  const walls = WALL_IDS.map((id, index) => {
    const [a, b] = wallPoints[index];
    const value = wallReflectionFor(scene, id);
    const active = selected === id;
    const wallHit = `<rect x="${Math.min(a.x, b.x) - (a.x === b.x ? hitWidth / 2 : 0)}" y="${Math.min(a.y, b.y) - (a.y === b.y ? hitWidth / 2 : 0)}" width="${Math.max(hitWidth, Math.abs(a.x - b.x))}" height="${Math.max(hitWidth, Math.abs(a.y - b.y))}" fill="transparent"/>`;
    return `<g data-wall="${id}" role="button" tabindex="0" aria-label="${WALL_NAMES[id]}反射率 ${Math.round(value * 100)}%，点击调节" aria-pressed="${active}" class="scene-wall">${wallHit}<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${active ? '#d6ffb1' : '#91ab7d'}" stroke-opacity="${active ? 1 : 0.25 + value * 0.7}" stroke-width="${active ? 7 : 4}"/><title>${WALL_NAMES[id]} · ${Math.round(value * 100)}%${Object.hasOwn(scene.wallReflections, id) ? ' · 独立设置' : ' · 使用默认'}</title></g>`;
  }).join('');
  const sorted = geometry.paths.filter((p) => p.order > 0).sort((a, b) => b.gain - a.gain);
  displayedPaths = [...geometry.paths.filter((p) => p.order === 0), ...sorted.slice(0, 8)];
  const pathMarkup = pathsVisible
    ? displayedPaths
        .map(
          (p, i) =>
            `<polyline points="${polyline(p.points)}" class="path-line" stroke="${p.order === 0 ? '#ed9b89' : '#bbed8a'}" stroke-width="${p.order === 0 ? 2 : i === (geometry.blocked ? 0 : 1) ? 2.6 : 1.3}" stroke-opacity="${clamp(p.gain * 2.2, 0.1, 0.8)}" ${p.order > 1 ? 'stroke-dasharray="4 8"' : p.order === 0 ? 'stroke-dasharray="5 6"' : ''}><title>${p.order === 0 ? '直达声' : `${p.order} 次反射`} · ${(p.delay * 1000).toFixed(1)} ms · 路径 ${p.distance.toFixed(1)} m</title></polyline>`,
        )
        .join('')
    : '';
  const panels = scene.panels
    .map((p, index) => {
      const [a, b] = panelEndpoints(p).map(project);
      const center = project(p);
      const color = p.type === 'absorber' ? '#e5b46c' : '#bcf18b';
      const active = p.id === selected;
      const radians = (p.angle * Math.PI) / 180;
      const handleOffset = Math.max(48, 58 / screenScale);
      const handleMargin = Math.max(22, 22 / screenScale) + 8;
      const handle = {
        x: clamp(center.x - Math.sin(radians) * handleOffset, handleMargin, 1000 - handleMargin),
        y: clamp(center.y + Math.cos(radians) * handleOffset, handleMargin, 640 - handleMargin),
      };
      const rotateHandle = active
        ? `<g data-rotate="${esc(p.id)}" class="rotation-handle" role="button" tabindex="0" aria-label="旋转${p.type === 'absorber' ? '消音板' : '反射板'}，拖动手柄或用左右方向键"><line x1="${center.x}" y1="${center.y}" x2="${handle.x}" y2="${handle.y}" stroke="${color}" stroke-opacity=".5" stroke-dasharray="4 5" pointer-events="none"/><circle cx="${handle.x}" cy="${handle.y}" r="${Math.max(22, 22 / screenScale)}" fill="transparent"/><circle cx="${handle.x}" cy="${handle.y}" r="${Math.max(14, 14 / screenScale)}" fill="#243027" stroke="${color}" stroke-width="2"/><text x="${handle.x}" y="${handle.y}" dy=".35em" text-anchor="middle" fill="${color}" font-size="${Math.max(16, 16 / screenScale)}" pointer-events="none">↻</text></g>`
        : '';
      return `<g class="scene-object" data-object="${esc(p.id)}" tabindex="0" role="button" aria-label="${p.type === 'absorber' ? '吸音屏' : '反射板'} ${index + 1}，拖动移动"><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="transparent" stroke-width="${hitWidth}"/>${active ? `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${color}" stroke-width="19" stroke-opacity=".10" stroke-linecap="round"/>` : ''}<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${color}" stroke-width="7" stroke-linecap="round" ${p.type === 'absorber' ? 'stroke-dasharray="5 5"' : ''}/>${active ? [a, b].map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5" fill="#152218" stroke="${color}" stroke-width="2"/>`).join('') : ''}<circle cx="${center.x}" cy="${center.y}" r="4" fill="#142019" stroke="${color}" stroke-width="1.6"/><text class="object-label" x="${center.x + 17}" y="${center.y - 13}" font-size="12">${p.type === 'absorber' ? '吸音' : '反射'} ${index + 1}</text></g>${rotateHandle}`;
    })
    .join('');
  const points = ['source', 'listener']
    .map((id) => {
      const p = project(scene[id]);
      const pointScale = screenScale < 0.6 ? Math.max(1, 0.82 / screenScale) : 1;
      const iconPoint = {
        x: clamp(p.x, 30 * pointScale, 1000 - 30 * pointScale),
        y: clamp(
          p.y + (screenScale < 0.6 ? (id === 'source' ? -30 : 30) / screenScale : 0),
          45 * pointScale,
          640 - 45 * pointScale,
        ),
      };
      const anchor =
        screenScale < 0.6
          ? `<g pointer-events="none"><line x1="${p.x}" y1="${p.y}" x2="${iconPoint.x}" y2="${iconPoint.y}" stroke="${id === 'source' ? '#ed9b89' : '#8ab8dc'}" stroke-opacity=".6" stroke-dasharray="3 4"/><circle cx="${p.x}" cy="${p.y}" r="4" fill="${id === 'source' ? '#ed9b89' : '#8ab8dc'}"/></g>`
          : '';
      const color = id === 'source' ? '#ed9b89' : '#8ab8dc';
      const label = id === 'source' ? '声源' : '收音点';
      const icon =
        id === 'source'
          ? '<path d="M-7-4h4l5-4v16l-5-4h-4z" fill="currentColor"/><path d="M5-6q7 6 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
          : '<path d="M-8 3v-3a8 8 0 0 1 16 0v3m-16-2h3v7h-3zm13 0h3v7h-3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>';
      return `${anchor}<g class="scene-object" data-object="${id}" tabindex="0" role="button" aria-label="${label}，拖动移动" transform="translate(${iconPoint.x} ${iconPoint.y}) scale(${pointScale})" style="color:${color}"><circle r="27" fill="transparent"/><circle class="object-ring" r="23" fill="${color}" fill-opacity=".07" stroke="${color}" stroke-opacity="${selected === id ? 0.7 : 0.18}" stroke-width="1"/><circle r="16" fill="#243027" stroke="${color}" stroke-width="1.5"/>${icon}<text class="object-label" text-anchor="middle" x="0" y="${id === 'source' ? -33 : 40}">${label}</text></g>`;
    })
    .join('');
  $('scene').innerHTML =
    `<defs><pattern id="grid" x="${view.x}" y="${view.y}" width="${gridSize}" height="${gridSize}" patternUnits="userSpaceOnUse"><path d="M ${gridSize} 0 L 0 0 0 ${gridSize}" fill="none" stroke="#9ec184" stroke-opacity=".085" stroke-width="1"/></pattern><pattern id="absorb" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 7L7 0" stroke="#e5b46c" stroke-opacity=".2"/></pattern></defs><rect x="${view.x - 5}" y="${view.y - 5}" width="${w + 10}" height="${h + 10}" rx="5" fill="#263329" stroke="#607851" stroke-width="1"/><rect x="${view.x}" y="${view.y}" width="${w}" height="${h}" rx="2" fill="#17241a"/><rect x="${view.x}" y="${view.y}" width="${w}" height="${h}" fill="url(#grid)"/><path d="M${view.x} ${view.y - 28}H${view.x + w}M${view.x} ${view.y - 34}v12M${view.x + w} ${view.y - 34}v12" stroke="#4b6041" stroke-width="1"/><rect x="${500 - 32}" y="${view.y - 39}" width="64" height="20" rx="5" fill="#16221a"/><text x="500" y="${view.y - 24}" text-anchor="middle" class="wall-label">${round(scene.width)} m</text><text x="${view.x - 23}" y="${view.y + h / 2}" text-anchor="middle" class="wall-label" transform="rotate(-90 ${view.x - 23} ${view.y + h / 2})">${round(scene.height)} m</text><g pointer-events="none">${pathMarkup}</g><g id="particles" pointer-events="none"></g>${walls}${panels}${points}${geometry.blocked ? `<text x="500" y="${view.y + h + 36}" text-anchor="middle" fill="#e5b46c" font-size="12">直达路径被板材挡住 · 仍可能听到绕行反射</text>` : ''}`;
  $('scaleLabel').textContent =
    `每格约 ${Math.round(gridSize / scale)} m · ${scene.delayScale === 1 ? '真实传播' : '延迟增强 ×4'}`;
}

function renderTimeline() {
  timelineMax = Math.max(0.35, ...geometry.paths.map((p) => p.delay)) * 1.09;
  const x = (delay) => 38 + (delay / timelineMax) * 825;
  let ticks = '';
  for (let i = 0; i <= 5; i++) {
    const delay = (timelineMax * i) / 5;
    ticks += `<line x1="${x(delay)}" x2="${x(delay)}" y1="20" y2="105" stroke="#a2bb8b" stroke-opacity=".08"/><text x="${x(delay)}" y="127" text-anchor="middle" fill="#8c9f7e" font-size="11">${Math.round(delay * 1000)}${i === 5 ? ' ms' : ''}</text>`;
  }
  const bars = geometry.paths
    .map(
      (p) =>
        `<line x1="${x(p.delay)}" x2="${x(p.delay)}" y1="104" y2="${104 - clamp(p.gain, 0, 1) * 84}" stroke="${p.order === 0 ? '#ed9b89' : '#bcf18b'}" stroke-width="${p.order === 0 ? 4 : 3}" stroke-linecap="round" opacity="${p.order === 0 ? 0.9 : clamp(0.22 + p.gain * 2.5, 0.22, 0.95)}"><title>${p.order === 0 ? '直达声' : `${p.order} 次反射`} ${(p.delay * 1000).toFixed(1)} ms，增益 ${p.gain.toFixed(3)}</title></line>`,
    )
    .join('');
  $('timeline').innerHTML =
    `${ticks}<line x1="38" x2="865" y1="105" y2="105" stroke="#50623e"/>${bars}<line id="timeCursor" x1="38" x2="38" y1="15" y2="108" stroke="#e4eddc" opacity=".65" stroke-width="1" visibility="hidden"/>`;
  $('pathSummary').textContent = `${geometry.paths.length} 条声音路径 · 二阶反射`;
}

function renderMetrics() {
  const echoes = geometry.paths.filter((p) => p.order > 0).sort((a, b) => b.gain - a.gain);
  const echo = echoes[0];
  const delay = echo ? echo.relativeDelay * 1000 : 0;
  $('echoDelay').innerHTML = `${echo ? Math.round(delay) : '—'}<small> ms</small>`;
  $('directMetric').textContent = geometry.blocked
    ? '已被遮挡'
    : `${geometry.directDistance.toFixed(1)} m`;
  $('directMetric').style.color = geometry.blocked ? '#e5b46c' : '';
  $('reflectionMetric').textContent = String(echoes.length);
  const complete =
    !!echo &&
    delay >= 220 &&
    delay <= 280 &&
    echo.gain >= 0.08 &&
    !geometry.blocked &&
    scene.delayScale === 1;
  const closeness = echo ? clamp(1 - Math.abs(delay - 250) / 250, 0, 1) : 0;
  $('challengeProgress').style.width = `${complete ? 100 : Math.round(closeness * 85)}%`;
  $('challengeCard').classList.toggle('success', complete);
  $('challengeStatus').textContent =
    scene.delayScale !== 1
      ? '切回真实距离，尝试这个目标'
      : geometry.blocked
        ? '先让直达声到达收音点'
        : !echo || echo.gain < 0.08
          ? '调整角度，让反射清楚地到达收音点'
          : complete
            ? '✓ 达成！换成自己的声音，再听一次。'
            : delay < 220
              ? `当前 ${Math.round(delay)} ms · 试着把反射板移远`
              : `当前 ${Math.round(delay)} ms · 试着缩短反射路径`;
}

function eventPoint(event) {
  const point = new DOMPoint(event.clientX, event.clientY);
  return unproject(point.matrixTransform($('scene').getScreenCTM().inverse()));
}

$('scene').addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  if (drag) return;
  const wall = event.target.closest('[data-wall]');
  if (wall) {
    event.preventDefault();
    selected = wall.dataset.wall;
    renderInspector();
    renderScene();
    return;
  }
  const rotation = event.target.closest('[data-rotate]');
  if (rotation) {
    event.preventDefault();
    selected = rotation.dataset.rotate;
    const object = selectedObject();
    const pointer = eventPoint(event);
    drag = {
      id: event.pointerId,
      mode: 'rotate',
      startAngle: object.angle,
      pointerAngle: Math.atan2(pointer.y - object.y, pointer.x - object.x),
    };
    $('scene').setPointerCapture(event.pointerId);
    $('scene').focus({ preventScroll: true });
    return;
  }
  const target = event.target.closest('[data-object]');
  if (!target) return;
  event.preventDefault();
  selected = target.dataset.object;
  const object = selectedObject();
  const pointer = eventPoint(event);
  drag = { id: event.pointerId, mode: 'move', dx: pointer.x - object.x, dy: pointer.y - object.y };
  $('scene').setPointerCapture(event.pointerId);
  $('scene').focus({ preventScroll: true });
  renderInspector();
  renderScene();
});
$('scene').addEventListener('pointermove', (event) => {
  if (!drag || drag.id !== event.pointerId) return;
  const p = eventPoint(event);
  const object = selectedObject();
  if (!object) {
    finishDrag(event);
    return;
  }
  if (drag.mode === 'rotate') {
    const angle = Math.atan2(p.y - object.y, p.x - object.x);
    object.angle = drag.startAngle + ((angle - drag.pointerAngle) * 180) / Math.PI;
  } else {
    object.x = p.x - drag.dx;
    object.y = p.y - drag.dy;
  }
  commit();
});
function finishDrag(event) {
  if (drag?.id === event.pointerId) {
    drag = null;
    if ($('scene').hasPointerCapture(event.pointerId))
      $('scene').releasePointerCapture(event.pointerId);
  }
}
$('scene').addEventListener('pointerup', finishDrag);
$('scene').addEventListener('pointercancel', finishDrag);
$('scene').addEventListener('lostpointercapture', () => {
  drag = null;
});
$('scene').addEventListener('focusin', (event) => {
  const target = event.target.closest('[data-object], [data-wall], [data-rotate]');
  if (target) {
    selected = target.dataset.object || target.dataset.wall || target.dataset.rotate;
    renderInspector();
  }
});
window.addEventListener('resize', () => {
  if (geometry) renderScene();
});

for (const id of WALL_IDS) {
  $(`${id}-override`).addEventListener('change', (event) => {
    if (event.target.checked) scene.wallReflections[id] = scene.wallReflection;
    else delete scene.wallReflections[id];
    commit();
  });
  $(`${id}-reflection`).addEventListener('input', (event) => {
    scene.wallReflections[id] = Number(event.target.value) / 100;
    commit();
  });
}
$('resetWalls').addEventListener('click', () => {
  scene.wallReflections = {};
  commit();
  toast('四面墙已统一使用默认反射率。');
});
$('selectedWallDefault').addEventListener('change', (event) => {
  if (event.target.checked) delete scene.wallReflections[selected];
  else scene.wallReflections[selected] = scene.wallReflection;
  commit();
});
$('selectedWallReflection').addEventListener('input', (event) => {
  scene.wallReflections[selected] = Number(event.target.value) / 100;
  commit();
});

for (const [id, property, divisor] of [
  ['roomWidth', 'width', 1],
  ['roomHeight', 'height', 1],
  ['wallReflection', 'wallReflection', 100],
]) {
  $(id).addEventListener('input', (event) => {
    scene[property] = Number(event.target.value) / divisor;
    commit();
  });
}
for (const [id, property, divisor] of [
  ['panelAngle', 'angle', 1],
  ['panelLength', 'length', 1],
  ['panelReflection', 'reflection', 100],
  ['positionX', 'x', 1],
  ['positionY', 'y', 1],
]) {
  $(id).addEventListener(id.startsWith('position') ? 'change' : 'input', (event) => {
    const object = selectedObject();
    const value = event.target.valueAsNumber;
    if (!object || !Number.isFinite(value)) {
      renderInspector();
      return;
    }
    object[property] = value / divisor;
    commit();
  });
}
$('delayModes').addEventListener('click', (event) => {
  const button = event.target.closest('[data-scale]');
  if (button) {
    scene.delayScale = Number(button.dataset.scale);
    commit();
  }
});
function setPreset(key) {
  presetKey = key;
  scene = cloneScene(presets[key]);
  selected = scene.panels[0]?.id || 'source';
  commit();
}
$('preset').addEventListener('change', (event) => {
  setPreset(event.target.value);
  toast('场景已载入，点击试听听听区别。');
});
$('resetLayout').addEventListener('click', () => {
  setPreset(presetKey);
  toast('已重置当前场景。');
});
$('togglePaths').addEventListener('click', () => {
  pathsVisible = !pathsVisible;
  $('togglePaths').classList.toggle('active', pathsVisible);
  $('togglePaths').textContent = `路径 ${pathsVisible ? 'ON' : 'OFF'}`;
  $('togglePaths').setAttribute('aria-pressed', pathsVisible);
  renderScene();
});
function addPanel(type) {
  if (scene.panels.length >= 8) return;
  const offset = (scene.panels.length % 4) * 1.5;
  const id = `panel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  scene.panels.push({
    id,
    type,
    x: scene.width * 0.53 + offset,
    y: scene.height * 0.52,
    angle: 90,
    length: Math.min(scene.height * 0.4, 18),
    reflection: type === 'absorber' ? 0.08 : 0.9,
  });
  selected = id;
  commit();
  toast(
    type === 'absorber'
      ? '吸音屏已添加。放到一条反射路径上试试。'
      : '反射板已添加。拖动并旋转，寻找一条有效反射。',
  );
}
$('addReflector').addEventListener('click', () => addPanel('reflector'));
$('addAbsorber').addEventListener('click', () => addPanel('absorber'));
function removeSelected() {
  if (!scene.panels.some((panel) => panel.id === selected)) return;
  scene.panels = scene.panels.filter((p) => p.id !== selected);
  selected = scene.panels[0]?.id || 'source';
  commit();
}
$('removePanel').addEventListener('click', removeSelected);
document.addEventListener('keydown', (event) => {
  if (
    /INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target.tagName) ||
    document.querySelector('dialog[open]') ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return;
  if (event.target.closest('[data-rotate]') && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    const id = selected;
    selectedObject().angle += (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 15 : 5);
    commit();
    $('scene')
      .querySelector(`[data-rotate="${CSS.escape(id)}"]`)
      ?.focus({ preventScroll: true });
    return;
  }
  if (event.code === 'Space') {
    event.preventDefault();
    play(false);
    return;
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    removeSelected();
    return;
  }
  const step = event.shiftKey ? 2 : 0.5;
  const movement = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  }[event.key];
  if (movement && selectedObject()) {
    event.preventDefault();
    selectedObject().x += movement[0];
    selectedObject().y += movement[1];
    commit();
    $('scene').focus({ preventScroll: true });
  }
});

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
$('saveLayout').addEventListener('click', () => {
  download(
    new Blob([JSON.stringify(currentLayout(), null, 2)], { type: 'application/json' }),
    'echo-lab-layout.json',
  );
  toast('布局已保存为 JSON，可以在另一台设备继续实验。');
});
$('loadLayout').addEventListener('click', () => $('layoutFile').click());
$('layoutFile').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 100_000) throw new Error('布局文件应小于 100 KB。');
    const data = JSON.parse(await file.text());
    applyLayout(validateLayout(data));
    toast('布局已导入。音频不会跟随布局文件传输。');
  } catch (error) {
    toast(`导入失败：${error.message}`);
  }
});

function currentLayout() {
  return createLayout(scene, {
    preset: presetKey,
    sound: $('soundSelect').value,
    volume: Number($('volume').value),
  });
}
function applyLayout(layout) {
  if (sourceBusy || exporting || audio.isRecording)
    throw new Error('请先结束录音、导入或导出，再应用房间配置。');
  stopPlayback();
  scene = layout.scene;
  presetKey = layout.preset;
  selected = scene.panels[0]?.id || 'source';
  $('volume').value = layout.volume;
  $('soundSelect').value = layout.sound;
  // Generate only when needed; never trigger audio or microphone on link arrival.
  if (audio.context) {
    audio.useBuiltin(layout.sound);
    updateInputUI(false);
  } else $('inputInfo').textContent = '内置测试音 · 点击试听开始';
  commit();
}
function inspectRoomLink() {
  incomingLayout = null;
  $('sharedRoom').hidden = true;
  try {
    incomingLayout = readRoomLink(location.href);
    if (!incomingLayout) return;
    const room = incomingLayout.scene;
    $('sharedRoomSummary').textContent =
      `${room.width} × ${room.height} m · ${room.panels.length} 个装置 · ${Object.keys(room.wallReflections).length} 面墙单独调节`;
    $('sharedRoom').hidden = false;
  } catch (error) {
    toast(error.message);
  }
}
$('applySharedRoom').addEventListener('click', () => {
  if (!incomingLayout || sourceBusy || exporting || audio.isRecording) {
    toast('请先结束录音、导入或导出，再应用房间配置。');
    return;
  }
  applyLayout(incomingLayout);
  incomingLayout = null;
  $('sharedRoom').hidden = true;
  history.replaceState(null, '', location.pathname + location.search);
  toast('已复用分享的房间配置。可以直接试听或换成自己的声音。');
});
$('dismissSharedRoom').addEventListener('click', () => {
  incomingLayout = null;
  $('sharedRoom').hidden = true;
  history.replaceState(null, '', location.pathname + location.search);
});
$('shareLayout').addEventListener('click', () => {
  try {
    $('shareLink').value = createRoomLink(location.href, currentLayout());
    $('shareDialog').showModal();
  } catch (error) {
    toast(error.message);
  }
});
$('copyShareLink').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('shareLink').value);
    toast('房间链接已复制。对方打开后可一键复用。');
  } catch {
    $('shareLink').focus();
    $('shareLink').select();
    toast('请长按或按 Ctrl+C 复制已选中的链接。');
  }
});
$('downloadShareLink').addEventListener('click', () =>
  download(
    new Blob([$('shareLink').value], { type: 'text/plain;charset=utf-8' }),
    'echo-lab-room-link.txt',
  ),
);
$('closeShare').addEventListener('click', () => $('shareDialog').close());
window.addEventListener('hashchange', inspectRoomLink);

function updateInputUI(custom = false) {
  const existing = $('soundSelect').querySelector('option[value="custom"]');
  if (custom) {
    customAudio = { buffer: audio.buffer, inputName: audio.inputName, inputInfo: audio.inputInfo };
    const option = existing || document.createElement('option');
    option.value = 'custom';
    option.textContent = audio.inputName;
    if (!existing) $('soundSelect').append(option);
    $('soundSelect').value = 'custom';
  }
  $('inputInfo').textContent =
    `${audio.buffer?.duration.toFixed(2) || '0.00'} 秒 · ${custom ? '你的声音' : '内置测试音'}`;
  $('inputInfo').title = audio.inputName;
  saveLocal();
}
async function ensureAudio() {
  await audio.init();
  if (!audio.buffer)
    audio.useBuiltin($('soundSelect').value === 'custom' ? 'clap' : $('soundSelect').value);
}

function pointOnPath(path, fraction) {
  let remaining = clamp(fraction, 0, 1) * path.distance;
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1],
      b = path.points[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= length || i === path.points.length - 1) {
      const t = length === 0 ? 0 : clamp(remaining / length, 0, 1);
      return project({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    remaining -= length;
  }
  return project(scene.listener);
}
function animate() {
  if (!animationStarted) return;
  const elapsed = (performance.now() - animationStarted) / 1000;
  const visualDuration = Math.max(0.2, ...displayedPaths.map((path) => path.delay * 4));
  if (elapsed > visualDuration + 0.1) {
    animationStarted = 0;
    if ($('particles')) $('particles').innerHTML = '';
    if ($('timeCursor')) $('timeCursor').setAttribute('visibility', 'hidden');
    $('animationLabel').textContent = '位置决定声音路径';
    return;
  }
  const cursor = $('timeCursor');
  if (cursor) {
    cursor.setAttribute('visibility', elapsed <= timelineMax ? 'visible' : 'hidden');
    const x = 38 + Math.min(elapsed / timelineMax, 1) * 825;
    cursor.setAttribute('x1', x);
    cursor.setAttribute('x2', x);
  }
  if ($('particles'))
    $('particles').innerHTML = pathsVisible
      ? displayedPaths
          .map((p) => {
            const fraction = elapsed / Math.max(0.01, p.delay * 4);
            if (fraction > 1) return '';
            const point = pointOnPath(p, fraction);
            return `<circle class="path-particle" cx="${point.x}" cy="${point.y}" r="${p.order === 0 ? 4 : 3}" fill="${p.order === 0 ? '#ed9b89' : '#d6ffb1'}" opacity="${clamp(0.2 + p.gain * 3, 0.2, 1)}"/>`;
          })
          .join('')
      : '';
  animationId = requestAnimationFrame(animate);
}
async function play(dry) {
  if (audio.isRecording || recordingPending) {
    toast('请先结束录音，再试听。');
    return;
  }
  const request = ++playRequest;
  try {
    await ensureAudio();
    if (request !== playRequest || disposed) return;
    await audio.play(geometry, { dry, volume: Number($('volume').value) / 100 });
    if (request !== playRequest || disposed) return;
    clearPlaybackUI();
    activePlayback = true;
    $(dry ? 'playDry' : 'playWet').classList.add('playing');
    updateInputUI($('soundSelect').value === 'custom');
    if (!dry) {
      animationStarted = performance.now();
      $('animationLabel').textContent = '粒子动画慢放 ×4 · 声音按时间线播放';
      animationId = requestAnimationFrame(animate);
    }
    if (!dry && geometry.paths.length === 0)
      toast('收音点没有收到有效路径。移动吸音屏或收音点试试。');
  } catch (error) {
    clearPlaybackUI();
    if (error.name !== 'AbortError') toast(error.message);
  }
}
$('playWet').addEventListener('click', () => play(false));
$('playDry').addEventListener('click', () => play(true));
$('stopAudio').addEventListener('click', stopPlayback);
$('volume').addEventListener('input', () => {
  if (activePlayback) stopPlayback();
  saveLocal();
});
$('soundSelect').addEventListener('change', async (event) => {
  const value = event.target.value;
  stopPlayback();
  if (value === 'custom') {
    if (customAudio) {
      Object.assign(audio, customAudio);
      updateInputUI(true);
    }
    return;
  }
  try {
    await audio.init();
    if ($('soundSelect').value !== value) return;
    audio.useBuiltin(value);
    updateInputUI(false);
  } catch (error) {
    toast(error.message);
  }
});
$('uploadAudio').addEventListener('click', () => $('audioFile').click());
$('audioFile').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  stopPlayback();
  setSourceBusy(true);
  try {
    const info = await audio.importFile(file);
    updateInputUI(true);
    toast(
      info.truncated
        ? '已导入前 15 秒。点击试听，或导出带回声的声音。'
        : '音频已导入。点击试听，听听它在房间里的声音。',
    );
  } catch (error) {
    if (error.name !== 'AbortError') toast(error.message);
  } finally {
    setSourceBusy(false);
  }
});
function setSourceBusy(busy) {
  sourceBusy = busy;
  [
    'uploadAudio',
    'soundSelect',
    'playDry',
    'playWet',
    'exportAudio',
    'exportDry',
    'exportBoth',
  ].forEach((id) => {
    $(id).disabled = busy || exporting;
  });
  $('recordAudio').disabled = busy && !audio.isRecording;
}
function recordingUI(active) {
  $('recordAudio').classList.toggle('recording', active);
  $('recordAudio').querySelector('span').textContent = active ? '停止 0s' : '录制';
  clearInterval(recordInterval);
  if (active) {
    recordStarted = Date.now();
    recordInterval = setInterval(() => {
      $('recordAudio').querySelector('span').textContent =
        `停止 ${Math.min(15, Math.floor((Date.now() - recordStarted) / 1000))}s`;
    }, 200);
  }
}
audio.onRecordingStop = ({ error, automatic }) => {
  recordingPending = false;
  recordingUI(false);
  setSourceBusy(false);
  if (error) toast(error.message);
  else {
    updateInputUI(true);
    toast(automatic ? '已录满 15 秒。点击试听空间效果。' : '录音已就绪。点击试听空间效果。');
  }
};
$('recordAudio').addEventListener('click', async () => {
  if (recordingPending) return;
  if (audio.isRecording) {
    $('recordAudio').disabled = true;
    try {
      await audio.stopRecording();
    } catch (error) {
      toast(error.message);
    } finally {
      $('recordAudio').disabled = false;
    }
    return;
  }
  recordingPending = true;
  stopPlayback();
  setSourceBusy(true);
  try {
    await audio.startRecording();
    if (disposed) return;
    recordingUI(true);
    $('recordAudio').disabled = false;
    toast('正在录音，最长 15 秒；点击录制按钮结束。');
  } catch (error) {
    setSourceBusy(false);
    if (error.name !== 'AbortError') toast(error.message);
  } finally {
    recordingPending = false;
  }
});
async function exportAudio(mode) {
  if (exporting || sourceBusy || audio.isRecording) return;
  exporting = true;
  setSourceBusy(false);
  $('recordAudio').disabled = true;
  const button = $(mode === 'both' ? 'exportBoth' : mode === 'dry' ? 'exportDry' : 'exportAudio');
  const label = button.textContent;
  button.textContent = '正在生成…';
  try {
    await ensureAudio();
    const layout = currentLayout();
    const snapshot = computePaths(layout.scene);
    const options = { volume: layout.volume / 100, input: audio.buffer };
    const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
    if (mode === 'both') {
      const dry = await audio.exportWav(snapshot, { ...options, dry: true });
      const wet = await audio.exportWav(snapshot, options);
      const zip = await createZip([
        { name: 'echo-lab-original.wav', blob: dry.blob },
        { name: 'echo-lab-processed.wav', blob: wet.blob },
        { name: 'echo-lab-room.json', blob: new Blob([JSON.stringify(layout, null, 2)]) },
      ]);
      download(zip, `echo-lab-pair-${stamp}.zip`);
      toast('原声与调制声已一起导出，ZIP 内含两份 WAV 和对应房间配置。');
    } else {
      const result = await audio.exportWav(snapshot, { ...options, dry: mode === 'dry' });
      download(result.blob, `echo-lab-${mode === 'dry' ? 'original' : 'processed'}-${stamp}.wav`);
      toast(
        `WAV 已生成（${result.duration.toFixed(2)} 秒）${mode === 'dry' ? '，未添加房间效果。' : '，包含完整的反射尾音。'}`,
      );
    }
  } catch (error) {
    if (error.name !== 'AbortError') toast(error.message);
  } finally {
    exporting = false;
    setSourceBusy(false);
    button.textContent = label;
  }
}
$('exportAudio').addEventListener('click', () => exportAudio('wet'));
$('exportDry').addEventListener('click', () => exportAudio('dry'));
$('exportBoth').addEventListener('click', () => exportAudio('both'));
$('helpButton').addEventListener('click', () => $('helpDialog').showModal());
for (const id of ['closeHelp', 'startExperiment'])
  $(id).addEventListener('click', () => $('helpDialog').close());
$('helpDialog').addEventListener('click', (event) => {
  if (event.target === $('helpDialog')) {
    const r = $('helpDialog').getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      $('helpDialog').close();
  }
});
window.addEventListener('pagehide', () => {
  disposed = true;
  clearTimeout(layoutTimer);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentLayout()));
  } catch {
    /* Optional persistence. */
  }
  stopPlayback();
  clearInterval(recordInterval);
  audio.dispose();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload();
});
commit();
inspectRoomLink();
