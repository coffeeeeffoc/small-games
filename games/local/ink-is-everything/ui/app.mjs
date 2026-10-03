import * as Engine from '../engine.mjs';
import { CHAPTER_LIST, DEFAULT_CHAPTER_ID } from '../content/chapters/index.mjs';
import { createRenderer, icon, renderVignette } from '../art.mjs';
import { $, esc, bindPress } from './dom.mjs';
import { createStorage } from './storage.mjs';
import { createAudio } from './audio.mjs';
import { createNavigation } from './navigation.mjs';
import { createInput } from './input.mjs';
import { createHUD } from './hud.mjs';
import { createDialogs } from './dialogs.mjs';

/** Composition root: lifecycle and fixed-step loop. Rules, gestures and views stay separate. */
export function startApplication() {
  const storage = createStorage(Engine),
    audio = createAudio(),
    canvas = $('#game-canvas'),
    renderer = createRenderer(canvas);
  let saved = storage.load(),
    selectedChapter = saved?.levelId || DEFAULT_CHAPTER_ID;
  let state = Engine.createGame(selectedChapter),
    paused = false,
    ended = false,
    lastRoom = state.roomId,
    lastStatus = state.status;
  let lastMessage = '',
    lastFrame = performance.now(),
    accumulator = 0,
    hudClock = 0,
    saveClock = 0;
  let seenStats = { shots: 0, hits: 0, damageTaken: 0, inkRecovered: 0 };
  let hud, input, dialogs;
  const getState = () => state,
    getDefinition = () => Engine.getLevelDefinition(state);
  const active = () =>
    state.status === 'playing' && !paused && !document.hidden && !state.pendingRewards.length;
  const save = () => storage.save(state),
    feedback = (...args) => hud?.feedback(...args),
    updateHUD = () => hud?.update();
  function setPaused(value) {
    paused = value;
    lastFrame = performance.now();
    accumulator = 0;
  }
  function onRoomChanged() {
    lastRoom = state.roomId;
    input.roomChanged();
    feedback(Engine.getRoom(state).subtitle);
    save();
    updateHUD();
  }
  function perform(action, allowModal = false) {
    if (state.status !== 'playing' || (paused && !allowModal)) return { ok: false };
    const roomId = state.roomId,
      result = Engine.command(state, action);
    feedback(result.message, !result.ok);
    if (result.ok) {
      if (action.type === 'draw') {
        input.roomChanged();
        audio.play('draw');
      }
      if (['buy', 'chooseReward'].includes(action.type)) audio.play('pickup');
      if (action.type === 'nova') audio.play('nova');
      if (roomId !== state.roomId) onRoomChanged();
      if (result.shop) dialogs.showShop();
      save();
      updateHUD();
    }
    return result;
  }
  const navigation = createNavigation({ getState, getRoom: Engine.getRoom, perform, feedback });
  input = createInput({
    canvas,
    renderer,
    getState,
    getRoom: Engine.getRoom,
    getStats: Engine.getPlayerStats,
    active,
    navigation,
    perform,
    feedback,
    sound: (kind) => audio.play(kind),
    onPause: () => dialogs.showPause(),
    isModalOpen: () => dialogs.open,
  });
  hud = createHUD({
    engine: Engine,
    icon,
    getState,
    getDefinition,
    isPaused: () => paused,
    input,
    audio,
  });
  dialogs = createDialogs({
    engine: Engine,
    getState,
    getDefinition,
    setPaused,
    cancelInput: () => input.cancel(),
    updateHUD,
    save,
    start,
    perform,
    storage,
    audio,
    onSoundChange: () => hud.soundButton(),
  });
  function start(fresh = false) {
    if (saved && !fresh && saved.levelId === selectedChapter) state = saved;
    else {
      state = Engine.createGame(selectedChapter);
      Engine.command(state, { type: 'start' });
    }
    saved = null;
    paused = false;
    ended = false;
    input.roomChanged();
    $('#cover').hidden = true;
    dialogs.close();
    lastRoom = state.roomId;
    lastStatus = state.status;
    lastMessage = '';
    seenStats = {
      shots: state.stats.shots,
      hits: state.stats.hits,
      damageTaken: state.stats.damageTaken,
      inkRecovered: state.stats.inkRecovered,
    };
    lastFrame = performance.now();
    accumulator = 0;
    save();
    updateHUD();
    renderer.render(state, { time: state.time });
    if (state.pendingRewards.length) dialogs.showRewards();
    else {
      feedback('墨汁就是生命：施法后走位拾回墨滴，近身挥笔吸墨。红色预警出现时侧闪。', false, 4200);
      canvas.focus({ preventScroll: true });
    }
  }
  function updateCover() {
    const definition = getDefinition(),
      continueSaved = saved?.levelId === selectedChapter;
    $('#cover-description').textContent = definition.description;
    $('#cover-chapter').textContent = definition.title;
    $('#cover-seals').textContent = `${definition.requiredSeals} 枚钥印`;
    $('#start-game').innerHTML =
      `${continueSaved ? '继续上次旅程' : `进入${esc(definition.shortTitle || definition.title)}`} ${icon('arrow')}`;
    $('#new-game').hidden = !continueSaved;
    $('#arena').setAttribute('aria-label', `${definition.title}实时地牢`);
  }
  const selector = $('#chapter-select');
  selector.innerHTML = CHAPTER_LIST.map(
    (chapter) => `<option value="${esc(chapter.id)}">${esc(chapter.title)}</option>`,
  ).join('');
  selector.value = selectedChapter;
  $('#chapter-picker').hidden = CHAPTER_LIST.length < 2;
  selector.addEventListener('change', () => {
    selectedChapter = selector.value;
    state = Engine.createGame(selectedChapter);
    lastRoom = state.roomId;
    updateCover();
    updateHUD();
  });
  bindPress('#start-game', () => start());
  bindPress('#new-game', () => dialogs.askRestart());
  bindPress('#pause', () => dialogs.showPause());
  bindPress('#help', () => dialogs.showHelp());
  bindPress('#equipment', () => dialogs.showEquipment());
  bindPress('#sound', () => {
    audio.toggle();
    hud.soundButton();
  });
  bindPress('#nova', () => perform({ type: 'nova' }));
  bindPress('#interact', () => perform({ type: 'interact' }));
  bindPress('#draw-tool', () => {
    input.toggleDraw();
    updateHUD();
  });
  window.addEventListener('blur', () => {
    input.cancel();
    if (state.status === 'playing' && !paused) dialogs.showPause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      input.cancel();
      save();
      if (state.status === 'playing' && !paused) dialogs.showPause();
    }
    lastFrame = performance.now();
    accumulator = 0;
  });
  window.addEventListener('pagehide', save);
  function tick(now) {
    const elapsed = Math.min(0.06, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (active()) {
      accumulator += elapsed;
      while (accumulator >= 1 / 60 && active()) {
        const before = { x: state.player.x, y: state.player.y },
          frame = input.frame();
        // An interaction can open a dialog while composing input; do not spend a frame afterwards.
        if (!active()) {
          accumulator = 0;
          break;
        }
        Engine.step(state, frame, 1 / 60);
        accumulator -= 1 / 60;
        navigation.afterStep(before, frame, 1 / 60);
        if (state.roomId !== lastRoom) onRoomChanged();
      }
      saveClock += elapsed;
      if (saveClock >= 4) {
        saveClock = 0;
        save();
      }
      for (const [key, sound] of [
        ['shots', 'shot'],
        ['hits', 'hit'],
        ['damageTaken', 'hurt'],
        ['inkRecovered', 'pickup'],
      ]) {
        if (state.stats[key] > seenStats[key]) audio.play(sound);
        seenStats[key] = state.stats[key];
      }
    } else accumulator = 0;
    if (state.status === 'playing' && state.pendingRewards.length && dialogs.kind !== 'reward') {
      save();
      dialogs.showRewards();
    }
    if (state.message !== lastMessage) {
      lastMessage = state.message;
      if (state.status !== 'ready') feedback(state.message);
    }
    if (state.status !== lastStatus) {
      lastStatus = state.status;
      if (['won', 'lost'].includes(state.status) && !ended) {
        ended = true;
        input.cancel();
        save();
        audio.play(state.status === 'won' ? 'win' : 'hurt');
        dialogs.showResult();
      }
    }
    hud.expire(now);
    hudClock += elapsed;
    if (hudClock > 0.09) {
      hudClock = 0;
      updateHUD();
    }
    renderer.render(state, {
      time: state.time,
      ...input.renderContext(),
      paused: paused || state.status === 'ready',
    });
    requestAnimationFrame(tick);
  }
  // Read-only browser QA surface; no mutation or gameplay-command hooks.
  Object.defineProperty(window, '__inkGame', {
    value: Object.freeze({
      snapshot: () => ({ ...Engine.getSnapshot(state), paused, input: input.snapshot() }),
      worldToScreen: (x, y) => renderer.worldToScreen(x, y),
    }),
    writable: false,
  });
  document
    .querySelectorAll('[data-icon]')
    .forEach((element) => (element.innerHTML = icon(element.dataset.icon)));
  $('#cover-art').innerHTML = renderVignette('attack');
  updateCover();
  hud.soundButton();
  updateHUD();
  renderer.render(state, { time: 0 });
  requestAnimationFrame(tick);
}
