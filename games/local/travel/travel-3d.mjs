import * as THREE from './vendor/three.module.js';
import { createTravelWorld } from './travel-world.mjs';

const clamp = (n, low, high) => Math.max(low, Math.min(high, n));

export function movePosition(position, dx, dz, colliders, bounds = { minX: -22, maxX: 22, minZ: -24, maxZ: 18 }) {
  const blocked = (x, z) => colliders.some(c => c.r !== undefined
    ? Math.hypot(x - c.x, z - c.z) < c.r + 0.35
    : Math.abs(x - c.x) < c.hx + 0.35 && Math.abs(z - c.z) < c.hz + 0.35);
  const next = { ...position };
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.2));
  for (let i = 0; i < steps; i++) {
    const x = clamp(next.x + dx / steps, bounds.minX, bounds.maxX);
    if (!blocked(x, next.z)) next.x = x;
    const z = clamp(next.z + dz / steps, bounds.minZ, bounds.maxZ);
    if (!blocked(next.x, z)) next.z = z;
  }
  return next;
}

export function framingScore(alignment, distance, visible) {
  if (!visible || !Number.isFinite(alignment) || !Number.isFinite(distance) || distance < 0) return 0;
  const centering = clamp((alignment - 0.88) / 0.12, 0, 1);
  const range = clamp(1 - Math.abs(distance - 15) / 45, 0.2, 1);
  return Math.round(centering * 75 + centering * range * 25);
}

export function isPhotoObstructed(origin, target, occluders) {
  const direction = target.clone().sub(origin);
  const distance = direction.length();
  if (distance < 0.1) return false;
  const ray = new THREE.Raycaster(origin, direction.normalize(), 0.08, distance - 0.05);
  return ray.intersectObjects(occluders, false).length > 0;
}

export function startWorld({ place, onComplete, onLeave, onSound, onToggleSound }) {
  const dialog = document.querySelector('#world-dialog');
  const $ = selector => dialog.querySelector(selector);
  const previousCanvas = $('#world-canvas');
  const canvas = previousCanvas.cloneNode(false);
  for (const name of Object.keys(canvas.dataset)) delete canvas.dataset[name];
  previousCanvas.replaceWith(canvas);
  const listeners = new AbortController();
  const { signal } = listeners;
  const keys = new Set();
  const completed = new Set();
  let world, renderer, camera;
  let ready = false;
  let position = { x: 0, z: 9 };
  let yaw = 0, photoPitch = 0.04;
  let cameraMode = false, paused = false, disposed = false;
  let bestPhoto = null, nearest = null, shot = null;
  let frame = 0, lastTime = 0, elapsed = 0, frameCount = 0, lastFootstep = 0, lastCapture = -Infinity;
  let lookPointer = null, joystickPointer = null, lastLook = null;
  let stick = { x: 0, y: 0 };
  let messageTimer, flashTimer;
  const pointerTargets = new Map();
  const target = new THREE.Vector3(), projected = new THREE.Vector3();

  function message(text) {
    clearTimeout(messageTimer);
    $('#world-message').textContent = text;
    $('#world-message').classList.add('visible');
    messageTimer = setTimeout(() => $('#world-message').classList.remove('visible'), 4300);
  }

  function clearInput() {
    keys.clear();
    stick = { x: 0, y: 0 };
    lookPointer = joystickPointer = lastLook = null;
    $('#world-stick').style.transform = 'translate(-50%,-50%)';
    for (const [id, element] of pointerTargets) {
      if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
    }
    pointerTargets.clear();
  }

  function setPaused(value) {
    paused = value;
    clearInput();
    lastTime = 0;
    dialog.classList.toggle('world-paused', paused);
    $('#world-pause').textContent = paused ? '继续旅行' : '暂停';
    $('#world-pause').setAttribute('aria-pressed', String(paused));
    $('#world-resume').hidden = !paused;
    canvas.dataset.paused = String(paused);
    if (paused) $('#world-resume').focus();
    else canvas.focus({ preventScroll: true });
  }

  function updateCamera() {
    camera.position.set(position.x, 1.65, position.z);
    target.set(position.x + Math.sin(yaw) * Math.cos(photoPitch), 1.65 + Math.sin(photoPitch), position.z - Math.cos(yaw) * Math.cos(photoPitch));
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  function photoQuality() {
    const direction = camera.getWorldDirection(new THREE.Vector3());
    const toLandmark = world.landmark.clone().sub(camera.position);
    const distance = toLandmark.length();
    const alignment = direction.dot(toLandmark.normalize());
    projected.copy(world.landmark).project(camera);
    const visible = alignment > 0 && projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 0.95 && Math.abs(projected.y) < 0.92
      && !isPhotoObstructed(camera.position, world.landmark, world.photoOccluders || []);
    return { score: framingScore(alignment, distance, visible), visible, distance };
  }

  function toggleCamera() {
    if (paused || !ready) return;
    clearInput();
    cameraMode = !cameraMode;
    dialog.classList.toggle('taking-photo', cameraMode);
    camera.fov = cameraMode ? 58 : 65;
    camera.updateProjectionMatrix();
    $('#world-camera').textContent = cameraMode ? '收起相机 · C' : '举起相机 · C';
    $('#world-camera').setAttribute('aria-pressed', String(cameraMode));
    $('#world-shutter').hidden = !cameraMode;
    $('#world-camera-frame').hidden = !cameraMode;
    updateCamera();
    onSound?.('tap');
    if (cameraMode) message('滑动调整取景，把地标放进中央。可以边走边找角度。');
    canvas.focus({ preventScroll: true });
  }

  function interact() {
    if (paused || cameraMode || !nearest || completed.has(nearest.id)) return;
    if (Math.hypot(position.x - nearest.position.x, position.z - nearest.position.z) > nearest.radius) return;
    nearest.activate();
    completed.add(nearest.id);
    onSound?.('rest');
    message(nearest.description);
    updateObjectives();
  }

  function updateObjectives() {
    $('#world-objectives').innerHTML = world.interactions.map(item => `<li class="${completed.has(item.id) ? 'done' : ''}"><span>${completed.has(item.id) ? '✓' : '○'}</span>${item.name}</li>`).join('') + `<li class="${bestPhoto ? 'done' : ''}"><span>${bestPhoto ? '✓' : '○'}</span>${bestPhoto ? `留下风景照片 · ${bestPhoto.score} 分` : '拍下这里的地标'}</li>`;
    const ready = completed.size === world.interactions.length && bestPhoto;
    $('#world-finish').disabled = !ready;
    $('#world-finish').textContent = ready ? '收好回忆，返回地图 →' : `收集回忆 ${completed.size} / ${world.interactions.length} · ${bestPhoto ? '已拍照' : '待拍照'}`;
    $('#world-photo-preview').hidden = !bestPhoto;
    if (bestPhoto) $('#world-photo-preview img').src = bestPhoto.photo;
    canvas.dataset.interactions = String(completed.size);
  }

  function capture() {
    if (!cameraMode || paused || !ready || disposed || performance.now() - lastCapture < 500) return;
    updateCamera();
    const quality = photoQuality();
    if (!quality.visible || quality.score < 30) { message('地标还没入镜。转动视角，找找金色的取景标记。'); return; }
    lastCapture = performance.now();
    renderer.render(world.scene, camera);
    const photoCanvas = document.createElement('canvas');
    photoCanvas.width = 576;
    photoCanvas.height = Math.round(576 * canvas.clientHeight / canvas.clientWidth);
    if (photoCanvas.height > 768) { photoCanvas.width = Math.round(768 * canvas.clientWidth / canvas.clientHeight); photoCanvas.height = 768; }
    photoCanvas.getContext('2d').drawImage(canvas, 0, 0, photoCanvas.width, photoCanvas.height);
    shot = { score: quality.score, photo: photoCanvas.toDataURL('image/jpeg', 0.72) };
    if (shot.photo.length > 220000) shot.photo = photoCanvas.toDataURL('image/jpeg', 0.4);
    if (!bestPhoto || shot.score >= bestPhoto.score) bestPhoto = shot;
    onSound?.('photo');
    $('#world-flash').classList.remove('flash');
    void $('#world-flash').offsetWidth;
    $('#world-flash').classList.add('flash');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => $('#world-flash').classList.remove('flash'), 500);
    updateObjectives();
    message(`抓拍成功 · ${shot.score} 分！${completed.size === 2 ? '回忆已集齐，可以返回地图领取印章。' : '照片收好了，继续走近景物，收集两份回忆。'}`);
  }

  function resize() {
    if (!renderer || disposed) return;
    clearInput();
    const width = dialog.clientWidth, height = dialog.clientHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, width < 700 ? 1.5 : 1.75));
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }

  function tick(now) {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
    lastTime = now;
    if (paused || document.hidden) return;
    elapsed += dt;
    let horizontal = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + stick.x;
    let vertical = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) - stick.y;
    const magnitude = Math.hypot(horizontal, vertical);
    if (magnitude > 1) { horizontal /= magnitude; vertical /= magnitude; }
    const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 5.4 : 3.2;
    const dx = (Math.cos(yaw) * horizontal + Math.sin(yaw) * vertical) * dt * speed;
    const dz = (Math.sin(yaw) * horizontal - Math.cos(yaw) * vertical) * dt * speed;
    const next = movePosition(position, dx, dz, world.colliders, world.bounds);
    const moving = Math.hypot(next.x - position.x, next.z - position.z) > 0.001;
    position = next;
    if (moving && elapsed - lastFootstep > 0.5) { onSound?.('step'); lastFootstep = elapsed; }
    world.update(dt, elapsed);
    updateCamera();
    nearest = world.interactions.filter(item => !completed.has(item.id)).sort((a, b) => Math.hypot(position.x - a.position.x, position.z - a.position.z) - Math.hypot(position.x - b.position.x, position.z - b.position.z))[0];
    const distance = nearest ? Math.hypot(position.x - nearest.position.x, position.z - nearest.position.z) : Infinity;
    $('#world-interact').disabled = cameraMode || !nearest || distance > nearest.radius;
    $('#world-interact').textContent = nearest ? distance <= nearest.radius ? `${nearest.verb} · E` : `靠近${nearest.name} · ${Math.ceil(distance)}m` : '这一站的回忆已集齐 ✓';
    for (const item of world.interactions) {
      projected.copy(item.position).add(new THREE.Vector3(0, 2.6, 0)).project(camera);
      const marker = $(`#world-marker-${item.id}`);
      marker.hidden = cameraMode || completed.has(item.id) || projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1.1 || Math.abs(projected.y) > 1.1;
      marker.style.left = `${(projected.x * 0.5 + 0.5) * 100}%`;
      marker.style.top = `${(-projected.y * 0.5 + 0.5) * 100}%`;
      marker.querySelector('small').textContent = `${Math.ceil(Math.hypot(position.x - item.position.x, position.z - item.position.z))}m`;
    }
    if (cameraMode) {
      const quality = photoQuality();
      $('#world-quality').textContent = quality.visible ? `构图 ${quality.score} 分 · ${quality.score >= 85 ? '好角度，按下快门' : '调整角度，让地标靠近中央'}` : '转动视角，寻找这处风景的地标';
      $('#world-shutter').disabled = !quality.visible || quality.score < 30;
      const aim = world.landmark.clone().project(camera);
      $('#world-landmark').style.left = `${clamp(aim.x * 50 + 50, 8, 92)}%`;
      $('#world-landmark').style.top = `${clamp(-aim.y * 50 + 50, 18, 78)}%`;
      $('#world-landmark').textContent = quality.visible ? '◇ 地标' : '◇ 转动视角寻找地标';
    }
    renderer.render(world.scene, camera);
    frameCount++;
    if (frameCount % 6 === 0) {
      Object.assign(canvas.dataset, { playerX: position.x.toFixed(3), playerZ: position.z.toFixed(3), yaw: yaw.toFixed(3), mode: cameraMode ? 'photo' : 'walk', cameraHeight: '1.65', pitch: photoPitch.toFixed(3), frames: String(frameCount), drawCalls: String(renderer.info.render.calls), triangles: String(renderer.info.render.triangles) });
    }
  }

  function releasePointer(event) {
    if (event.pointerId === lookPointer) { lookPointer = lastLook = null; }
    if (event.pointerId === joystickPointer) { joystickPointer = null; stick = { x: 0, y: 0 }; $('#world-stick').style.transform = 'translate(-50%,-50%)'; }
    pointerTargets.delete(event.pointerId);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    clearTimeout(messageTimer);
    clearTimeout(flashTimer);
    clearInput();
    listeners.abort();
    resizeObserver.disconnect();
    world?.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
    if (document.fullscreenElement === dialog) void document.exitFullscreen().catch(() => {});
    dialog.classList.remove('taking-photo', 'world-paused');
    document.body.classList.remove('world-open');
  }

  $('#world-title').textContent = place.name;
  $('#world-subtitle').textContent = place.subtitle;
  $('#world-markers').replaceChildren();
  $('#world-photo-preview').hidden = true;
  $('#world-shutter').hidden = true;
  $('#world-camera-frame').hidden = true;
  $('#world-resume').hidden = true;
  $('#world-error').hidden = true;
  $('#world-loading').hidden = false;
  $('#world-message').classList.remove('visible');
  $('#world-camera').textContent = '举起相机 · C';
  $('#world-pause').textContent = '暂停';
  $('#world-camera').setAttribute('aria-pressed', 'false');
  $('#world-pause').setAttribute('aria-pressed', 'false');
  document.body.classList.add('world-open');
  if (!dialog.open) dialog.showModal();
  const resizeObserver = new ResizeObserver(resize);
  const leave = () => { dispose(); dialog.close(); onLeave(); };
  $('#world-leave').addEventListener('click', leave, { signal });
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (paused) leave(); else setPaused(true); }, { signal });
  $('#world-pause').addEventListener('click', () => setPaused(!paused), { signal });
  $('#world-resume').addEventListener('click', () => setPaused(false), { signal });
  $('#world-audio').addEventListener('click', () => { onToggleSound?.(); $('#world-audio').textContent = document.querySelector('#sound-toggle').getAttribute('aria-pressed') === 'true' ? '音效开' : '音效关'; }, { signal });
  $('#world-audio').textContent = document.querySelector('#sound-toggle').getAttribute('aria-pressed') === 'true' ? '音效开' : '音效关';
  $('#world-fullscreen').addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if (dialog.requestFullscreen) await dialog.requestFullscreen(); else message('当前浏览器请使用横屏，获得更大的视野。'); }
    catch { message('当前浏览器未能进入全屏，仍可继续游玩。'); }
  }, { signal });
  $('#world-camera').addEventListener('click', toggleCamera, { signal });
  $('#world-interact').addEventListener('click', interact, { signal });
  $('#world-shutter').addEventListener('click', capture, { signal });
  let shutterTouch = null;
  $('#world-shutter').addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') shutterTouch = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }, { signal });
  $('#world-shutter').addEventListener('pointerup', event => {
    if (shutterTouch?.id === event.pointerId && Math.hypot(event.clientX - shutterTouch.x, event.clientY - shutterTouch.y) < 12) capture();
    shutterTouch = null;
  }, { signal });
  $('#world-shutter').addEventListener('pointercancel', () => { shutterTouch = null; }, { signal });
  $('#world-finish').addEventListener('click', () => {
    if (disposed || completed.size !== world?.interactions.length || !bestPhoto) return;
    try { onComplete(bestPhoto.score, bestPhoto.photo); leave(); }
    catch (error) { message(error.message); }
  }, { signal });
  canvas.addEventListener('pointerdown', event => {
    if (paused || lookPointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    lookPointer = event.pointerId;
    lastLook = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    pointerTargets.set(event.pointerId, canvas);
    canvas.focus({ preventScroll: true });
  }, { signal });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== lookPointer || !lastLook || paused) return;
    yaw += (event.clientX - lastLook.x) * 0.005;
    photoPitch = clamp(photoPitch - (event.clientY - lastLook.y) * 0.004, -1.1, 1.1);
    lastLook = { x: event.clientX, y: event.clientY };
  }, { signal });
  const joystick = $('#world-joystick');
  const moveStick = event => {
    const rect = joystick.getBoundingClientRect();
    const dx = event.clientX - rect.left - rect.width / 2;
    const dy = event.clientY - rect.top - rect.height / 2;
    const radius = rect.width * 0.32;
    const distance = Math.max(radius, Math.hypot(dx, dy));
    stick = { x: dx / distance, y: dy / distance };
    $('#world-stick').style.transform = `translate(calc(-50% + ${stick.x * radius}px),calc(-50% + ${stick.y * radius}px))`;
  };
  joystick.addEventListener('pointerdown', event => {
    if (paused || joystickPointer !== null) return;
    joystickPointer = event.pointerId;
    joystick.setPointerCapture(event.pointerId);
    pointerTargets.set(event.pointerId, joystick);
    moveStick(event);
  }, { signal });
  joystick.addEventListener('pointermove', event => { if (event.pointerId === joystickPointer) moveStick(event); }, { signal });
  for (const element of [canvas, joystick]) {
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) element.addEventListener(event, releasePointer, { signal });
  }
  dialog.addEventListener('keydown', event => {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      event.preventDefault();
      if (!paused) keys.add(event.code);
    }
    if (event.repeat) return;
    if (event.code === 'KeyE') { event.preventDefault(); interact(); }
    if (event.code === 'KeyC') { event.preventDefault(); toggleCamera(); }
    if (event.code === 'Space' && cameraMode) { event.preventDefault(); capture(); }
    if (event.code === 'KeyP') { event.preventDefault(); setPaused(!paused); }
  }, { signal });
  window.addEventListener('keyup', event => keys.delete(event.code), { signal });
  window.addEventListener('blur', () => { if (world) setPaused(true); }, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden && world) setPaused(true); }, { signal });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); setPaused(true); $('#world-error').hidden = false; $('#world-error p').textContent = '图形画面已中断，请返回地图后重新进入。未结算的旅程不会扣除资源。'; }, { signal });

  async function initialize() {
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      world = createTravelWorld(place);
      position = { ...world.spawn };
      camera = new THREE.PerspectiveCamera(65, 1, 0.08, 500);
      await world.ready;
      if (disposed) return;
      ready = true;
      $('#world-markers').innerHTML = world.interactions.map(item => `<button id="world-marker-${item.id}" class="world-marker" data-interaction="${item.id}" data-x="${item.position.x}" data-z="${item.position.z}"><span>✦</span>${item.name}<small></small></button>`).join('');
      $('#world-markers').addEventListener('click', event => {
        const button = event.target.closest('[data-interaction]');
        if (!button || paused) return;
        const item = world.interactions.find(item => item.id === button.dataset.interaction);
        if (Math.hypot(position.x - item.position.x, position.z - item.position.z) <= item.radius) { nearest = item; interact(); }
        else message(`向「${item.name}」走近一些，再按 E 或互动按钮。`);
      }, { signal });
      updateObjectives();
      resizeObserver.observe(dialog);
      resize();
      updateCamera();
      $('#world-loading').hidden = true;
      canvas.focus({ preventScroll: true });
      frame = requestAnimationFrame(tick);
      message('欢迎走进风景。朝金色标记走去，近距离发现两份旅行回忆。');
    } catch (error) {
      if (disposed) return;
      $('#world-loading').hidden = true;
      $('#world-error').hidden = false;
      $('#world-error p').textContent = '场景或实拍素材未能加载。请返回地图重试，并确认浏览器支持 WebGL 2、已开启硬件加速。资源不会扣除。';
      console.warn('Travel scene unavailable:', error.message);
    }
  }
  void initialize();
  return { dispose, pause: () => setPaused(true) };
}
