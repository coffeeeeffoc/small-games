/* eslint max-lines: off -- One mounted session owns the coupled input, clock, media and host cleanup. */
import {
  assertHostCapabilities,
  gameManifestSchema,
  HostError,
  type GameDefinition,
  type JsonValue,
} from '@coffeeeeffoc/game-contract';
import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import type {
  CanvasGameTarget,
  CanvasPointerEvent,
  CanvasSound,
} from '@coffeeeeffoc/canvas-game-adapter';
import manifestData from './manifest.json';
import { LEVELS, DEVICES, makeLevel } from './levels.js';
import {
  act,
  canResumeAfterTrip,
  createState,
  preview,
  resumeAfterTrip,
  step,
  summarize,
  serviceRate,
} from './simulation.js';
import type { Action } from './model.js';
import { draw, WIDTH, HEIGHT, COMPACT_HEIGHT, type Hit, type ViewState } from './view.js';
import { newProgress, readProgress, SKINS } from './progress.js';

export const buildingPowerManifest = gameManifestSchema.parse(manifestData);
export const defaultBuildingPowerEnvelope: DynamicContentEnvelope = {
  gameId: 'building-power',
  schemaVersion: 1,
  revision: 1,
  payload: { title: '忙碌的电工' },
};
export type BuildingPowerTarget = CanvasGameTarget & {
  present?(hits: readonly Hit[], status: string): void;
  onAction?(listener: (id: string) => void): () => void;
  onResize?(listener: () => void): () => void;
};

export const buildingPowerCanvasDefinition: GameDefinition<BuildingPowerTarget> = {
  manifest: buildingPowerManifest,
  async mount(target, host) {
    assertHostCapabilities(['content', 'storage'], host.session.capabilities);
    const content = await host.content.load();
    if (
      host.session.gameId !== 'building-power' ||
      host.session.gameVersion !== buildingPowerManifest.version
    )
      throw new HostError({ code: 'INVALID_INPUT', message: 'Game Session identity mismatch' });
    if (content.gameId !== 'building-power' || content.schemaVersion !== 1)
      throw new HostError({
        code: 'CONTENT_INCOMPATIBLE',
        message: 'Invalid building-power content',
      });
    const ctx = target.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    let progress = newProgress(),
      message = '',
      messageUntil = 0,
      writable = true;
    try {
      const saved = await host.storage.read('building-power:progress');
      if (saved) progress = readProgress(saved.value);
    } catch {
      writable = false;
      message = '存档暂不可用，本次仍可游玩。';
    }
    let levelIndex = progress.unlocked,
      weatherSeed = Math.floor(Math.random() * 8),
      state = createState(makeLevel(levelIndex, weatherSeed));
    let screen: ViewState['screen'] = 'lobby',
      hits: Hit[] = [],
      selection: string | null = null;
    let pointer: {
      id: number;
      from: string;
      x: number;
      y: number;
      startX: number;
      startY: number;
      moved: boolean;
    } | null = null;
    let disposed = false,
      hidden = false,
      busy = false,
      settled = false,
      bonusUsed = false;
    let saving = Promise.resolve(),
      previous = Date.now(),
      accumulator = 0,
      lastAlarm = 0;
    const sounds = new Map<string, CanvasSound>();
    const adEnabled =
      host.session.adAuthority !== 'none' && host.session.capabilities.includes('advertising');
    const track = (name: string, properties: Record<string, JsonValue> = {}) => {
      void host.telemetry
        .track(name, { game: 'building-power', level: levelIndex + 1, ...properties })
        .catch(() => undefined);
    };
    function sound(name: string) {
      if (!progress.sound || disposed || hidden) return;
      try {
        let clip = sounds.get(name);
        if (!clip) {
          clip = target.createSound?.(`building-power-audio/${name}.wav`);
          if (clip) sounds.set(name, clip);
        }
        clip?.play();
      } catch {
        /* Optional audio never blocks input. */
      }
    }
    function stopSounds() {
      for (const clip of sounds.values()) clip.stop();
    }
    function save() {
      if (!writable) return;
      const value = JSON.parse(JSON.stringify(progress)) as JsonValue;
      const replay = JSON.parse(
        JSON.stringify({
          levelId: state.level.id,
          version: state.level.version,
          seed: state.level.seed,
          actions: state.log,
        }),
      ) as JsonValue;
      saving = saving.then(async () => {
        if (!writable) return;
        try {
          await host.storage.write('building-power:progress', value);
          await host.storage.write('building-power:last-run', replay);
        } catch {
          writable = false;
          message = '成绩未保存：存储不可用，请稍后重试。';
        }
      });
    }
    const request = (id: string) => state.requests.find((r) => r.id === id);
    function actionFor(from: string, to: string): Action | null {
      if (!to.startsWith('room:')) return null;
      const requestId = to.slice(5);
      if (from === 'grid' || from === 'solar') return { type: 'connect', requestId, source: from };
      if (from === 'defer') return { type: 'defer', requestId };
      if (from.startsWith('room:') && from !== to) {
        const old = request(from.slice(5));
        if (old?.source)
          return { type: 'connect', requestId, source: old.source, fromRequestId: old.id };
      }
      return null;
    }
    const hitAt = (x: number, y: number) =>
      hits.find((h) => !h.disabled && x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
    function render() {
      if (disposed) return;
      const summary = summarize(state),
        hovered = pointer ? hitAt(pointer.x, pointer.y) : undefined;
      const pending = pointer && hovered ? actionFor(pointer.from, hovered.id) : null;
      const predicted = pending?.type === 'connect' ? preview(state, pending) : null;
      const weather = state.level.solar.find(
        (event) =>
          event.time > state.time &&
          (event.output !== state.solarOutput || event.temperature !== state.temperature),
      );
      const wave = Math.min(Math.floor(state.time / 45), Math.ceil(state.level.duration / 45) - 1);
      const rooms: ViewState['rooms'] = state.requests
        .filter((r) => r.arrives >= wave * 45 && r.arrives < (wave + 1) * 45)
        .map((r) => {
          const device = DEVICES[r.device];
          return {
            id: r.id,
            floor: String(r.resident),
            name: ['陈阿姨', '小周', '林姐', '吴叔', '晚归邻居', '回家车主'][r.resident - 1],
            device: device.id,
            progress: r.progress / device.duration,
            remaining: Math.max(0, r.deadline - state.time),
            status:
              r.status === 'completed'
                ? 'done'
                : r.status === 'missed'
                  ? 'expired'
                  : r.status === 'future'
                    ? 'idle'
                    : r.status,
            source: r.source,
            power: !r.source ? 0 : r.startupRemaining > 0 ? device.startupPower : device.power,
            normalPower: device.power,
            startupRemaining: r.startupRemaining,
            canDefer:
              (r.deferrable ?? device.deferrable) &&
              !r.deferred &&
              r.deadline < Math.min((wave + 1) * 45, state.level.duration),
            deferred: r.deferred,
            required: r.required,
            serviceSeconds: Math.ceil(
              (device.duration - r.progress) / serviceRate(r, state.temperature) +
                (r.source ? r.startupRemaining : device.startupSeconds),
            ),
            arrivesIn: Math.max(0, r.arrives - state.time),
          };
        });
      const quality = `三星：超载≤${state.level.quality.maxOverloadSeconds}秒，中断≤${state.level.quality.maxInterruptions}次`;
      const height = target.canvas.height / target.canvas.width < 2 ? COMPACT_HEIGHT : HEIGHT;
      const scale = Math.min(target.canvas.width / WIDTH, target.canvas.height / height);
      const offsetX = (target.canvas.width - WIDTH * scale) / 2,
        offsetY = (target.canvas.height - height * scale) / 2;
      ctx!.save();
      ctx!.fillStyle = '#173f3b';
      ctx!.fillRect(0, 0, target.canvas.width, target.canvas.height);
      ctx!.translate(offsetX, offsetY);
      ctx!.scale(scale, scale);
      hits = draw(ctx!, {
        screen,
        compact: height === COMPACT_HEIGHT,
        levelIndex,
        levels: LEVELS.map((l, i) => ({
          title: l.name,
          unlocked: i <= progress.unlocked,
          stars: progress.stars[i],
          bestScore: progress.best[i],
          quality: l.description,
        })),
        rooms,
        load: state.demand,
        capacity: state.capacity,
        gridLimit: state.level.gridLimit,
        temperature: state.temperature,
        weather: state.weather,
        heat: state.heat,
        remaining: Math.max(0, state.level.duration - state.time),
        served: state.completed,
        target: state.level.target,
        total: state.requests.length,
        solar: {
          output: state.solarOutput,
          available: state.level.solar.length > 0,
          forecast: weather
            ? Math.ceil(weather.time - state.time) +
              '秒后' +
              weather.weather +
              ' / ' +
              weather.temperature +
              '℃ / ' +
              (weather.output / 1000).toFixed(2) +
              'kW'
            : '本班后续天气稳定',
        },
        battery: {
          available: state.level.battery && !state.batteryUsed,
          remaining: state.batteryRemaining,
        },
        deferRemaining: state.defersLeft,
        score: summary.score,
        stars: summary.stars,
        assisted: state.assisted,
        selection,
        drag: pointer?.moved
          ? { from: pointer.from, x: pointer.x, y: pointer.y, target: hovered?.id }
          : null,
        preview: predicted
          ? {
              immediate: predicted.instant + state.solarOutput,
              stable: predicted.stable + state.solarOutput,
            }
          : null,
        reducedMotion: progress.reducedMotion,
        sound: progress.sound,
        time: state.time,
        won: state.result === 'won',
        message:
          (screen !== 'playing' || state.time < messageUntil ? message : '') ||
          state.notices.at(-1) ||
          (screen === 'lobby' ? state.level.description : ''),
        quality,
        canRescue: adEnabled && canResumeAfterTrip(state),
        canBonus: adEnabled && state.result === 'won' && !bonusUsed,
        busy,
        skin: SKINS[progress.skin],
      });
      ctx!.restore();
      target.present?.(
        hits,
        `${screen === 'playing' ? '值班中' : screen === 'paused' ? '已暂停' : screen === 'lobby' ? '忙碌的电工' : state.result === 'won' ? '值班成功' : state.result === 'tripped' ? '超载跳闸' : '服务不足'}；当前用电 ${state.demand}W / 可用 ${state.capacity}W；${state.weather} ${state.temperature}℃；热量 ${Math.round(state.heat)}/60；服务 ${state.completed}/${state.level.target}；剩余 ${Math.ceil(state.level.duration - state.time)}秒。${message}`,
      );
    }
    function finish() {
      screen = 'result';
      pointer = null;
      selection = null;
      stopSounds();
      sound(state.result === 'won' ? 'win' : 'lose');
      if (!settled && state.result === 'won') {
        settled = true;
        const result = summarize(state);
        progress.unlocked = Math.max(progress.unlocked, Math.min(19, levelIndex + 1));
        if (!state.assisted) {
          progress.stars[levelIndex] = Math.max(progress.stars[levelIndex], result.stars);
          progress.best[levelIndex] = Math.max(progress.best[levelIndex], result.score);
        } else
          progress.assistedBest[levelIndex] = Math.max(
            progress.assistedBest[levelIndex],
            result.score,
          );
        progress.coins = Math.min(1e9, progress.coins + result.stars * 10);
        save();
      }
      message =
        state.result === 'won'
          ? `已完成${state.completed}个请求，获得${summarize(state).stars * 10}装饰币。${state.assisted ? '本次援助成绩单独保存。' : '标准成绩已记录。'}`
          : state.result === 'tripped'
            ? '超载让电闸热量达到60，小区支路跳闸了。云来前暂停热水器，或把空调切换成风扇。'
            : state.requests.some((r) => r.required && r.status === 'missed')
              ? '公共照明没赶上：晚归邻居和进库车辆需要你，优先给公共灯留出容量。'
              : `服务不足：已错过${state.missed}个请求，无法达到${state.level.target}个的目标。全部断电也不能过关。`;
      track('building_power_result', {
        result: state.result,
        completed: state.completed,
        assisted: state.assisted,
      });
      if (state.result !== 'won') save();
    }
    function start(freshWeather = false) {
      if (freshWeather) weatherSeed = (weatherSeed + 1 + Math.floor(Math.random() * 7)) % 8;
      state = createState(makeLevel(levelIndex, weatherSeed));
      screen = 'playing';
      settled = false;
      bonusUsed = false;
      selection = null;
      pointer = null;
      message = '';
      accumulator = 0;
      previous = Date.now();
      track('building_power_start');
      sound('connect');
    }
    function dispatch(action: Action) {
      if (screen !== 'playing' || busy || hidden) return;
      if (act(state, action)) {
        const r = 'requestId' in action ? request(action.requestId) : null;
        message =
          action.type === 'defer'
            ? '邻居：行，我晚一点用，你先照顾其他人。'
            : action.type === 'cooling'
              ? r?.device === 'fan'
                ? '换成风扇，省下1045W；天热时要吹久一些。'
                : '换回空调降温，启动前记得留出余量。'
              : action.type === 'battery'
                ? '应急电池接入！8秒后退出，抓紧错峰。'
                : action.type === 'disconnect'
                  ? '先歇一会，进度保留；记得回来帮他。'
                  : r
                    ? DEVICES[r.device].name + '接通了，邻居的事情有着落了。'
                    : '';
        messageUntil = state.time + 3;
        sound(action.type === 'disconnect' ? 'disconnect' : 'connect');
        track('building_power_action', { type: action.type, tick: state.tick });
      } else
        message =
          action.type === 'defer'
            ? '只有标记“可缓”的请求能协商延后，每项限一次。'
            : '请求已经结束，或当前操作不可用。';
      selection = null;
    }
    async function reward(kind: 'rescue' | 'bonus') {
      if (
        busy ||
        !adEnabled ||
        (kind === 'rescue' ? !canResumeAfterTrip(state) : state.result !== 'won' || bonusUsed)
      )
        return;
      busy = true;
      pointer = null;
      selection = null;
      stopSounds();
      render();
      try {
        const result = await host.ads.offer({
          id: `building-power-${kind}`,
          reward: kind === 'rescue' ? { resume: true } : { coins: 30 },
        });
        if (disposed) return;
        if (result.status === 'completed') {
          if (kind === 'rescue' && resumeAfterTrip(state)) {
            screen = 'paused';
            message = '电闸已冷却，高负载设备已断开。准备好再继续。';
          }
          if (kind === 'bonus' && !bonusUsed) {
            bonusUsed = true;
            progress.coins = Math.min(1e9, progress.coins + 30);
            message = '已获得30装饰币。';
            save();
          }
        } else
          message =
            result.status === 'dismissed'
              ? '未完整观看，没有发放奖励。'
              : '奖励暂不可用，可直接重新值班。';
      } catch {
        message = '奖励暂不可用，可直接重新值班。';
      } finally {
        busy = false;
        previous = Date.now();
        accumulator = 0;
        render();
      }
    }
    function click(id: string) {
      if (disposed || hidden || busy) return;
      if (id === 'sound') {
        progress.sound = !progress.sound;
        if (!progress.sound) stopSounds();
        save();
      } else if (id === 'motion') {
        progress.reducedMotion = !progress.reducedMotion;
        save();
      } else if (id === 'start' || id === 'retry') start();
      else if (id === 'weather') start(true);
      else if (id === 'pause') pause();
      else if (id === 'resume') {
        screen = 'playing';
        previous = Date.now();
        accumulator = 0;
        message = '';
      } else if (id === 'menu') {
        if (state.result === 'won') {
          levelIndex = Math.min(progress.unlocked, levelIndex + 1);
          weatherSeed = Math.floor(Math.random() * 8);
        }
        state = createState(makeLevel(levelIndex, weatherSeed));
        screen = 'lobby';
        pointer = null;
        selection = null;
        message = '';
        stopSounds();
      } else if (id.startsWith('level:')) {
        const i = Number(id.slice(6));
        if (Number.isInteger(i) && i >= 0 && i <= progress.unlocked) {
          if (levelIndex !== i) weatherSeed = Math.floor(Math.random() * 8);
          levelIndex = i;
          state = createState(makeLevel(i, weatherSeed));
          message = '';
        }
      } else if (id === 'skin') {
        const next = (progress.skin + 1) % SKINS.length;
        if (progress.ownedSkins.includes(next)) {
          progress.skin = next;
          message = `已换装：${SKINS[next]}，装饰币 ${progress.coins}`;
        } else if (progress.coins >= 60) {
          progress.coins -= 60;
          progress.ownedSkins.push(next);
          progress.skin = next;
          message = `已用60装饰币解锁${SKINS[next]}`;
        } else
          message = `下一外观：${SKINS[next]}需60装饰币，当前${progress.coins}。通关即可获得。`;
        save();
      } else if (id === 'rescue' || id === 'bonus') void reward(id);
      else if (screen === 'playing') {
        if (id === 'grid' || id === 'solar' || id === 'defer') {
          selection = selection === id ? null : id;
          message = selection ? '再点住户插口；也可以直接拖线。' : '';
        } else if (id === 'battery') dispatch({ type: 'battery' });
        else if (id.startsWith('cooling:')) dispatch({ type: 'cooling', requestId: id.slice(8) });
        else if (id.startsWith('room:')) {
          const next = selection ? actionFor(selection, id) : null;
          if (next) dispatch(next);
          else if (request(id.slice(5))?.source)
            dispatch({ type: 'disconnect', requestId: id.slice(5) });
          else dispatch({ type: 'connect', requestId: id.slice(5), source: 'grid' });
        }
      }
      render();
    }
    function pointerEvent(event: CanvasPointerEvent) {
      if (disposed || hidden || busy) return;
      const height = target.canvas.height / target.canvas.width < 2 ? COMPACT_HEIGHT : HEIGHT;
      const scale = Math.min(target.canvas.width / WIDTH, target.canvas.height / height);
      const x = (event.x - (target.canvas.width - WIDTH * scale) / 2) / scale,
        y = (event.y - (target.canvas.height - height * scale) / 2) / scale;
      if (event.phase === 'down' && !pointer) {
        const hit = hitAt(x, y);
        if (hit)
          pointer = { id: event.pointerId, from: hit.id, x, y, startX: x, startY: y, moved: false };
      } else if (pointer?.id === event.pointerId) {
        pointer.x = x;
        pointer.y = y;
        pointer.moved ||= Math.hypot(x - pointer.startX, y - pointer.startY) > 8;
        if (event.phase === 'cancel') {
          pointer = null;
          selection = null;
        } else if (event.phase === 'up') {
          const from = pointer.from,
            moved = pointer.moved,
            hit = hitAt(x, y);
          pointer = null;
          if (moved) {
            const next = hit ? actionFor(from, hit.id) : null;
            if (next && screen === 'playing') dispatch(next);
            selection = null;
          } else if (hit?.id === from) click(from);
        }
      }
      render();
    }
    function pause() {
      pointer = null;
      selection = null;
      if (screen === 'playing') screen = 'paused';
      accumulator = 0;
      previous = Date.now();
      stopSounds();
      render();
    }
    const stopInput = target.onPointer
      ? target.onPointer(pointerEvent)
      : target.onTap((x, y) => {
          pointerEvent({ phase: 'down', x, y, pointerId: 0 });
          pointerEvent({ phase: 'up', x, y, pointerId: 0 });
        });
    const stopAction = target.onAction?.((id) => {
      if (hits.some((h) => h.id === id && !h.disabled)) click(id);
    });
    const stopResize = target.onResize?.(() => {
      pointer = null;
      selection = null;
      render();
    });
    const timer = setInterval(() => {
      const now = Date.now(),
        delta = now - previous;
      previous = now;
      if (disposed || hidden || busy || screen !== 'playing') return;
      // A suspended/stalled process must not silently consume the player's rescue window.
      if (delta > 1000) {
        pause();
        message = '已暂停，准备好后继续。';
        return;
      }
      accumulator += Math.max(0, delta);
      const completed = state.completed;
      while (accumulator >= 50 && state.result === 'playing') {
        step(state);
        accumulator -= 50;
      }
      if (state.completed > completed) {
        sound('complete');
        const done = state.requests.filter((r) => r.status === 'completed').at(-1);
        message = done
          ? ['陈阿姨', '小周', '林姐', '吴叔', '晚归邻居', '回家车主'][done.resident - 1] +
            '：帮上大忙了，谢谢师傅！ +' +
            (state.completed - completed) +
            '单'
          : '又帮邻居解决一件事！';
        messageUntil = state.time + 4;
      }
      if (state.load > state.level.gridLimit && now - lastAlarm > 900) {
        lastAlarm = now;
        sound('alarm');
      }
      if (state.result !== 'playing') finish();
      render();
    }, 1000 / 30);
    render();
    return {
      pause() {
        hidden = true;
        pause();
      },
      resume() {
        hidden = false;
        previous = Date.now();
        accumulator = 0;
        render();
      },
      async dispose() {
        if (disposed) return;
        disposed = true;
        clearInterval(timer);
        stopInput();
        stopAction?.();
        stopResize?.();
        for (const clip of sounds.values()) clip.dispose();
        sounds.clear();
        await saving;
        ctx.clearRect(0, 0, target.canvas.width, target.canvas.height);
      },
    };
  },
};
