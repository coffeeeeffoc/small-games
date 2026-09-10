import { useEffect, useRef } from 'react';
import type { Duel, DuelInput } from '../domain/duel.js';
import { drawArena } from './scene.js';
import { createArenaAudio } from './audio.js';
const files = import.meta.glob('../../public/arena-audio/*.wav', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export function useArenaScene(
  duel: Duel | null,
  ready: boolean,
  active: boolean,
  paused: boolean,
  muted: boolean,
  battling: boolean,
  setPaused: (paused: boolean) => void,
  control: (input: DuelInput) => void,
) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sceneState = useRef(duel);
  const audio = useRef<ReturnType<typeof createArenaAudio> | null>(null);
  const playedEvent = useRef(-1);
  const pointer = useRef<number | null>(null);
  useEffect(() => {
    sceneState.current = duel;
  }, [duel]);
  useEffect(() => {
    const sound = createArenaAudio((src, options) => {
      const element = new Audio(files[`../../public/${src}`]);
      element.loop = options?.loop ?? false;
      element.volume = options?.volume ?? 0.6;
      return {
        play() {
          if (!element.loop) element.currentTime = 0;
          void element.play().catch(() => undefined);
        },
        stop() {
          element.pause();
          element.currentTime = 0;
        },
        dispose() {
          element.pause();
          element.removeAttribute('src');
          element.load();
        },
      };
    });
    audio.current = sound;
    return () => {
      sound.dispose();
      audio.current = null;
    };
  }, []);
  useEffect(() => {
    audio.current?.mute(muted || paused || !active);
  }, [muted, paused, active]);
  useEffect(() => {
    if (!duel) {
      playedEvent.current = -1;
      return;
    }
    if (duel.event === playedEvent.current) return;
    playedEvent.current = duel.event;
    audio.current?.play(duel.cue);
    if (duel.cue === 'hit' || duel.cue === 'hurt')
      navigator.vibrate?.(duel.cue === 'hit' ? 18 : 35);
  }, [duel]);
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) setPaused(true);
    };
    const onBlur = () => {
      control('cancel');
      setPaused(true);
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('blur', onBlur);
    };
  }, [control, setPaused]);
  useEffect(() => {
    if (!ready || !active || paused) return;
    const element = canvas.current;
    if (!element || !('CanvasRenderingContext2D' in window)) return;
    const context = element.getContext('2d');
    if (!context) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let previous = 0;
    const draw = (now: number) => {
      if (now - previous >= (reduced ? 100 : 30)) {
        previous = now;
        const scale = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.max(1, Math.round(element.clientWidth * scale));
        const h = Math.max(1, Math.round(element.clientHeight * scale));
        if (element.width !== w || element.height !== h) {
          element.width = w;
          element.height = h;
        }
        drawArena(
          context,
          w,
          h,
          sceneState.current,
          reduced ? (sceneState.current?.time ?? 0) : now / 1000,
        );
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [ready, active, paused]);
  useEffect(() => {
    if (!active || paused || !battling) return;
    const keys: Record<string, DuelInput> = { Space: 'tease', KeyA: 'dodge', KeyS: 'rest' };
    const down = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input, textarea, select')) return;
      if (event.code === 'Space' && (event.target as HTMLElement)?.closest('button')) return;
      if (event.code === 'Escape') {
        setPaused(true);
        return;
      }
      if (!keys[event.code]) return;
      event.preventDefault();
      if (!event.repeat) {
        audio.current?.unlock();
        control(keys[event.code]);
      }
    };
    const up = (event: KeyboardEvent) => {
      if (
        !keys[event.code] ||
        event.code === 'KeyA' ||
        (event.target as HTMLElement)?.closest('input, textarea, select') ||
        (event.code === 'Space' && (event.target as HTMLElement)?.closest('button'))
      )
        return;
      event.preventDefault();
      control(event.code === 'Space' ? 'release' : 'cancel');
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [active, paused, battling, control, setPaused]);

  function holdButton(input: 'tease' | 'rest') {
    return {
      onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
        if (event.button !== 0 || !event.isPrimary || pointer.current !== null) return;
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        audio.current?.unlock();
        control(input);
      },
      onPointerUp(event: React.PointerEvent) {
        if (pointer.current !== event.pointerId) return;
        pointer.current = null;
        control(input === 'tease' ? 'release' : 'cancel');
      },
      onPointerCancel(event: React.PointerEvent) {
        if (pointer.current !== event.pointerId) return;
        pointer.current = null;
        control('cancel');
      },
      onLostPointerCapture(event: React.PointerEvent) {
        if (pointer.current !== event.pointerId) return;
        pointer.current = null;
        control('cancel');
      },
      onKeyDown(event: React.KeyboardEvent) {
        if (event.code !== 'Space' && event.code !== 'Enter') return;
        event.preventDefault();
        if (!event.repeat) {
          audio.current?.unlock();
          control(input);
        }
      },
      onKeyUp(event: React.KeyboardEvent) {
        if (event.code !== 'Space' && event.code !== 'Enter') return;
        event.preventDefault();
        control(input === 'tease' ? 'release' : 'cancel');
      },
      onBlur() {
        control('cancel');
      },
      onContextMenu(event: React.MouseEvent) {
        event.preventDefault();
      },
    };
  }
  return { canvas, audio, holdButton };
}
