import { useEffect, useRef, useState } from 'react';
import type { GameHost } from '@coffeeeeffoc/game-contract';
import { browserOfficeTarget } from './browser.js';
import { createScene } from './model.js';
import { mountOfficeScene, type OfficeRuntime, type OfficeView } from './runtime.js';

type OrientationPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<string>;
};

export function useOfficeRuntime(host: GameHost, active: boolean, seed: number) {
  const root = useRef<HTMLElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<OfficeRuntime | null>(null),
    hostActive = useRef(active);
  const keys = useRef(new Set<string>()),
    inputBlocked = useRef(false);
  const pendingSchedulePause = useRef(false);
  const sensor = useRef({ mounted: false, epoch: 0, stop: () => {} });
  const [view, setView] = useState<OfficeView>(() => ({
    state: createScene(seed),
    best: 0,
    sound: true,
    saving: '',
    hostPaused: false,
  }));
  const [error, setError] = useState(''),
    [schedule, setSchedule] = useState(false);
  const [gyro, setGyro] = useState(false),
    [sensorNote, setSensorNote] = useState('');
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const element = canvas.current,
      node = root.current;
    if (!element || !node) return;
    const lifecycle = sensor.current;
    lifecycle.mounted = true;
    let mounted = true;
    const target = browserOfficeTarget(element);
    const pressed = keys.current;
    const fit = () => {
      const rect = element.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5, 1280 / Math.max(1, rect.width));
      element.width = Math.max(1, Math.round(rect.width * ratio));
      element.height = Math.max(1, Math.round(rect.height * ratio));
      runtime.current?.redraw();
    };
    fit();
    try {
      runtime.current = mountOfficeScene(
        target,
        host,
        (next) => {
          if (mounted) setView({ ...next });
        },
        seed,
      );
    } catch (e) {
      queueMicrotask(() => {
        if (mounted) setError(e instanceof Error ? e.message : '场景加载失败');
      });
    }
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    resize?.observe(element);
    const release = () => {
      pressed.clear();
      runtime.current?.move(0, 0);
    };
    const sync = () => {
      release();
      if (document.hidden || !hostActive.current) runtime.current?.pause();
      else {
        runtime.current?.resume();
        if (pendingSchedulePause.current) runtime.current?.action('pause');
        pendingSchedulePause.current = false;
      }
    };
    const blur = () => {
      release();
      runtime.current?.pause();
    };
    const update = () => {
      if (inputBlocked.current) return;
      runtime.current?.move(
        Number(pressed.has('KeyW')) - Number(pressed.has('KeyS')),
        Number(pressed.has('KeyD')) - Number(pressed.has('KeyA')),
        (Number(pressed.has('ArrowRight')) - Number(pressed.has('ArrowLeft'))) * 1.5,
        (Number(pressed.has('ArrowUp')) - Number(pressed.has('ArrowDown'))) * 1.1,
      );
    };
    const down = (event: KeyboardEvent) => {
      if (
        inputBlocked.current ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.target instanceof HTMLElement &&
          (event.target.matches('input, textarea, select') || event.target.isContentEditable))
      )
        return;
      if (
        [
          'KeyW',
          'KeyS',
          'KeyA',
          'KeyD',
          'ArrowRight',
          'ArrowLeft',
          'ArrowUp',
          'ArrowDown',
        ].includes(event.code)
      ) {
        event.preventDefault();
        pressed.add(event.code);
        update();
      } else if (!event.repeat && (event.code === 'KeyE' || event.code === 'KeyC')) {
        event.preventDefault();
        runtime.current?.action(event.code === 'KeyE' ? 'interact' : 'crouch');
      } else if (!event.repeat && event.code === 'Escape') {
        release();
        runtime.current?.action(
          runtime.current.getView().state.status === 'paused' ? 'resume' : 'pause',
        );
      }
    };
    const up = (event: KeyboardEvent) => {
      pressed.delete(event.code);
      update();
    };
    node.addEventListener('keydown', down);
    node.addEventListener('keyup', up);
    window.addEventListener('resize', fit);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      mounted = lifecycle.mounted = false;
      lifecycle.epoch++;
      lifecycle.stop();
      release();
      resize?.disconnect();
      window.removeEventListener('resize', fit);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
      node.removeEventListener('keydown', down);
      node.removeEventListener('keyup', up);
      void runtime.current?.dispose();
      runtime.current = null;
      target.dispose();
    };
  }, [host, seed]);

  useEffect(() => {
    hostActive.current = active;
    keys.current.clear();
    runtime.current?.move(0, 0);
    if (active && !document.hidden) {
      runtime.current?.resume();
      if (pendingSchedulePause.current) runtime.current?.action('pause');
      pendingSchedulePause.current = false;
    } else runtime.current?.pause();
  }, [active]);
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);

  async function toggleGyro() {
    const lifecycle = sensor.current;
    lifecycle.stop();
    const epoch = ++lifecycle.epoch;
    const current = () => lifecycle.mounted && epoch === lifecycle.epoch;
    if (gyro) {
      setGyro(false);
      setSensorNote('已切换为拖动视角');
      return;
    }
    if (!window.isSecureContext) {
      setSensorNote('体感需 HTTPS 或本机 localhost；现在可拖动转头');
      return;
    }
    const orientationSensor = window.DeviceOrientationEvent as OrientationPermission | undefined;
    if (!orientationSensor) {
      setSensorNote('设备没有体感传感器，可拖动转头');
      return;
    }
    try {
      const permission = orientationSensor.requestPermission
        ? await orientationSensor.requestPermission()
        : 'granted';
      if (!current()) return;
      if (permission !== 'granted') {
        setSensorNote('未获得体感权限，可拖动转头');
        return;
      }
    } catch {
      if (current()) setSensorNote('体感权限不可用，可拖动转头');
      return;
    }
    let previous: { yaw: number; pitch: number } | null = null,
      received = false;
    const orientation = (event: DeviceOrientationEvent) => {
      if (!current()) return;
      const { alpha, beta, gamma } = event;
      if (
        alpha === null ||
        beta === null ||
        gamma === null ||
        ![alpha, beta, gamma].every(Number.isFinite)
      )
        return;
      received = true;
      const a = (alpha * Math.PI) / 180,
        b = (beta * Math.PI) / 180,
        g = (gamma * Math.PI) / 180;
      const x = -Math.cos(a) * Math.sin(g) - Math.sin(a) * Math.sin(b) * Math.cos(g),
        y = -Math.sin(a) * Math.sin(g) + Math.cos(a) * Math.sin(b) * Math.cos(g);
      const next = {
        yaw: Math.atan2(x, y),
        pitch: Math.asin(Math.max(-1, Math.min(1, -Math.cos(b) * Math.cos(g)))),
      };
      if (previous && !inputBlocked.current)
        runtime.current?.look(
          Math.atan2(Math.sin(next.yaw - previous.yaw), Math.cos(next.yaw - previous.yaw)),
          next.pitch - previous.pitch,
        );
      previous = next;
    };
    window.addEventListener('deviceorientation', orientation);
    const timeout = window.setTimeout(() => {
      if (current() && !received) {
        lifecycle.stop();
        setGyro(false);
        setSensorNote('未收到体感数据，请用手指拖动视角');
      }
    }, 2500);
    lifecycle.stop = () => {
      window.removeEventListener('deviceorientation', orientation);
      window.clearTimeout(timeout);
    };
    setGyro(true);
    setSensorNote('以当前握持姿势为中心，转动手机环顾');
  }

  const showSchedule = () => {
    inputBlocked.current = true;
    keys.current.clear();
    runtime.current?.move(0, 0);
    runtime.current?.action('pause');
    pendingSchedulePause.current = runtime.current?.getView().state.status === 'playing';
    setSchedule(true);
  };
  const closeSchedule = () => {
    inputBlocked.current = false;
    setSchedule(false);
  };
  return {
    root,
    canvas,
    runtime,
    view,
    error,
    schedule,
    showSchedule,
    closeSchedule,
    gyro,
    sensorNote,
    setSensorNote,
    fullscreen,
    toggleGyro,
  };
}
