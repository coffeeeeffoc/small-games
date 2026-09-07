import type { CanvasGameTarget } from '@coffeeeeffoc/canvas-game-adapter';
import type { GameHost } from '@coffeeeeffoc/game-contract';
import { actOfficeSample, createOfficeSample, updateOfficeSample } from './model.js';
import { sampleControls, type SampleControl, type SampleView } from './presentation.js';
import { loadScene, phoneHotspot, pointIn, sceneManifest, type SceneImages } from './scene.js';
import { paintSample } from './paint.js';
import { sampleAudio } from './audio.js';
import { readSampleRecord, saveSampleRecord, type SampleRecord } from './save.js';

/** One scene runtime for browser and reviewed native Canvas delivery. */
export function mountOfficeSample(
  target: CanvasGameTarget,
  host: GameHost,
  onView?: (view: SampleView) => void,
) {
  const context = target.canvas.getContext('2d');
  if (!context) throw new Error('当前环境不支持 Canvas 2D');
  let view: SampleView = {
    state: createOfficeSample(),
    ready: false,
    error: '',
    sound: true,
    best: 0,
    saving: 'idle',
  };
  let images: SceneImages | null = null;
  let disposed = false;
  let hostPaused = false;
  let loadEpoch = 0;
  let runEpoch = 0;
  let settled = false;
  let pendingRecord: SampleRecord | null = null;
  let saving = false;
  let lastTime = Date.now();
  let lastPublish = 0;
  let phaseStarted = 0;
  let activePointer: { id: number; phone: boolean; x: number; y: number } | null = null;
  const audio = sampleAudio(target);
  let poseTime = 0;
  const now = () => Date.now();

  function publish(force = false) {
    if (disposed) return;
    paintSample(
      context!,
      target.canvas.width,
      target.canvas.height,
      view,
      images,
      view.state.elapsed - phaseStarted,
      poseTime,
    );
    if (force || now() - lastPublish >= 150) {
      lastPublish = now();
      onView?.({ ...view });
    }
  }
  async function persist() {
    if (!pendingRecord || saving || disposed) return;
    saving = true;
    view = { ...view, saving: 'pending' };
    publish(true);
    try {
      while (pendingRecord && !disposed) {
        const epoch = runEpoch;
        const result = await saveSampleRecord(host, pendingRecord);
        if (disposed) return;
        if (pendingRecord.bestJoy <= result.bestJoy && (!pendingRecord.cleared || result.cleared))
          pendingRecord = null;
        view = {
          ...view,
          best: Math.max(view.best, result.bestJoy),
          saving: pendingRecord ? 'pending' : epoch === runEpoch ? 'saved' : 'idle',
        };
      }
    } catch {
      if (!disposed) view = { ...view, saving: 'failed' };
    } finally {
      saving = false;
    }
    publish(true);
  }
  function afterChange(previous: SampleView['state']) {
    const state = view.state;
    if (previous.boss !== state.boss) {
      phaseStarted = state.elapsed;
    }
    if (
      (previous.status !== state.status && state.status !== 'caught') ||
      previous.phone !== state.phone ||
      (state.phone === 'working' && previous.boss !== state.boss)
    )
      poseTime = 0;
    audio.sync(previous, state, view.sound && !hostPaused, state.elapsed - phaseStarted);
    if (!settled && ['won', 'failed', 'caught'].includes(state.status)) {
      settled = true;

      pendingRecord = {
        version: 1,
        bestJoy: Math.max(pendingRecord?.bestJoy ?? 0, Math.min(90, state.joy)),
        cleared: pendingRecord?.cleared === true || state.status === 'won',
      };
      view = { ...view, best: Math.max(view.best, pendingRecord.bestJoy) };
      publish(true);
      void persist();
    }
  }
  async function load() {
    const epoch = ++loadEpoch;
    view = { ...view, error: '', ready: false };
    publish(true);
    try {
      const loaded = await loadScene(target);
      if (disposed || epoch !== loadEpoch) return;
      images = loaded;
      view = { ...view, ready: true };
    } catch {
      if (disposed || epoch !== loadEpoch) return;
      view = { ...view, error: '人物或场景图片加载失败，请检查网络后重试。' };
    }
    publish(true);
  }
  function dispatch(action: SampleControl['action']) {
    if (disposed || hostPaused) return;
    advance();
    if (action === 'sound') {
      view = { ...view, sound: !view.sound };
      audio.initialize();
      if (!view.sound) audio.stop();
      audio.sync(view.state, view.state, view.sound, view.state.elapsed - phaseStarted);
    } else if (action === 'retry-load') void load();
    else if (action === 'retry-save') void persist();
    else if (view.ready && !view.error) {
      audio.initialize();
      const previous = view.state;
      if (action.type === 'restart') {
        runEpoch += 1;
        settled = false;
        phaseStarted = 0;
        view = { ...view, saving: pendingRecord ? view.saving : 'idle' };
        if (pendingRecord) void persist();
      }
      view = { ...view, state: actOfficeSample(previous, action) };
      afterChange(previous);
    }
    publish(true);
  }
  const logical = (x: number, y: number) => {
    const scale = Math.min(target.canvas.width / 390, target.canvas.height / 844);
    return {
      x: (x - (target.canvas.width - 390 * scale) / 2) / scale,
      y: (y - (target.canvas.height - 844 * scale) / 2) / scale,
    };
  };
  function tap(x: number, y: number) {
    const point = logical(x, y);
    const control = sampleControls(view).find((item) => pointIn(item, point.x, point.y));
    if (control) return dispatch(control.action);
    if (view.state.status !== 'playing') return;
    const localY = point.y - sceneManifest.scene.offsetY;
    if (pointIn(phoneHotspot(view.state), point.x, localY))
      dispatch({ type: view.state.phone === 'working' ? 'phone-start' : 'phone-stop' });
    else if (pointIn(sceneManifest.hotspots.monitor, point.x, localY))
      dispatch({ type: view.state.pc === 'work' ? 'pc-entertainment' : 'pc-work' });
    else if (pointIn(sceneManifest.hotspots.drawer, point.x, localY))
      dispatch({ type: 'phone-stop' });
  }
  const offInput = target.onPointer
    ? target.onPointer((event) => {
        if (disposed || hostPaused) return;
        const point = logical(event.x, event.y);
        if (event.phase === 'down' && !activePointer) {
          activePointer = {
            id: event.pointerId,
            phone: pointIn(
              phoneHotspot(view.state),
              point.x,
              point.y - sceneManifest.scene.offsetY,
            ),
            x: event.x,
            y: event.y,
          };
        } else if (event.pointerId === activePointer?.id && event.phase === 'cancel') {
          activePointer = null;
          dispatch({ type: 'cancel-input' });
        } else if (event.pointerId === activePointer?.id && event.phase === 'up') {
          const pointer = activePointer;
          activePointer = null;
          if (
            pointer.phone &&
            Math.hypot(event.x - pointer.x, event.y - pointer.y) >= 18 &&
            pointIn(sceneManifest.hotspots.drawer, point.x, point.y - sceneManifest.scene.offsetY)
          )
            dispatch({ type: 'phone-stop' });
          else if (Math.hypot(event.x - pointer.x, event.y - pointer.y) < 18) tap(event.x, event.y);
        }
      })
    : target.onTap(tap);
  function advance() {
    const time = now();
    const dt = Math.max(0, (time - lastTime) / 1000);
    lastTime = time;
    if (disposed || hostPaused || !view.ready || view.state.status === 'paused') return;
    if (view.state.status !== 'caught') poseTime += dt;
    if (view.state.status !== 'playing') return;
    let remaining = dt;
    while (remaining > 0 && view.state.status === 'playing') {
      const step = Math.min(1, remaining);
      const previous = view.state;
      view = { ...view, state: updateOfficeSample(previous, step) };
      afterChange(previous);
      remaining -= step;
    }
  }
  const timer = setInterval(() => {
    advance();
    if (
      !hostPaused &&
      view.state.status !== 'paused' &&
      (view.state.status === 'playing' || (view.state.status !== 'caught' && poseTime < 2))
    )
      publish();
  }, 16);
  void readSampleRecord(host)
    .then((record) => {
      if (!disposed) {
        view = { ...view, best: Math.max(view.best, record.value.bestJoy) };
        publish(true);
      }
    })
    .catch(() => undefined);
  void load();
  return {
    dispatch,
    getView: () => view,
    pause() {
      if (disposed) return;
      advance();
      hostPaused = true;
      activePointer = null;
      view = { ...view, state: actOfficeSample(view.state, { type: 'pause' }) };
      audio.stop();
      publish(true);
    },
    resume() {
      if (disposed) return;
      hostPaused = false;
      lastTime = now();
      // The player explicitly resumes after returning, avoiding an unseen inspection.
      publish(true);
    },
    async dispose() {
      disposed = true;
      loadEpoch += 1;
      runEpoch += 1;
      clearInterval(timer);
      offInput();
      audio.stop();
      audio.dispose();

      images?.clear();
      images = null;
      context.clearRect(0, 0, target.canvas.width, target.canvas.height);
    },
  };
}

export type OfficeSampleRuntime = ReturnType<typeof mountOfficeSample>;
