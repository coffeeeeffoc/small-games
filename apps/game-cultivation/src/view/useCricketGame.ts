import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  actCricket,
  createMatch,
  opponents,
  startMatch,
  tickCricket,
  type CricketAction,
  type CricketMatch,
} from '../domain/cricket.js';
import { drawCricketScene, type CricketArt } from './scene.js';
import backgroundUrl from '../assets/teahouse.png';
import cricketUrl from '../assets/cricket-macro.png';
import { createCricketSound } from './sound.js';

export function useCricketGame(active: boolean) {
  const [state, setState] = useState(createMatch);
  const live = useRef(state);
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLElement>(null);
  const pointer = useRef({ x: 350, y: 385 });
  const art = useRef<CricketArt>({});
  const sound = useRef<ReturnType<typeof createCricketSound> | null>(null);
  const [muted, setMuted] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [help, setHelp] = useState(false);
  const suspended = paused || hidden || !active;
  const opponent = opponents[state.round];
  const finished = state.phase === 'won' || state.phase === 'lost';

  function update(next: CricketMatch) {
    if (next.eventId !== live.current.eventId) sound.current?.play(next.event);
    live.current = next;
    setState(next);
  }
  async function unlockAudio() {
    if (!sound.current) sound.current = createCricketSound();
    setAudioReady(await sound.current.start());
  }
  function action(value: CricketAction) {
    if (!suspended) update(actCricket(live.current, value));
  }
  function toggleSound() {
    void unlockAudio();
    sound.current?.mute(!muted);
    setMuted(!muted);
  }
  function begin() {
    void unlockAudio();
    update(startMatch(live.current));
    root.current?.focus();
  }
  function toggleHelp() {
    setHelp(!help);
    if (!help && live.current.phase === 'fighting') setPaused(true);
  }
  function press(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || suspended || live.current.phase !== 'fighting') return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    void unlockAudio();
    action('tease');
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    pointer.current = {
      x: ((event.clientX - bounds.left) / bounds.width) * 1000,
      y: ((event.clientY - bounds.top) / bounds.height) * 720,
    };
  }

  useEffect(() => {
    const background = new Image();
    background.onload = () => {
      art.current.background = background;
    };
    background.src = backgroundUrl;
    const cricket = new Image();
    cricket.onload = () => {
      art.current.cricket = cricket;
    };
    cricket.src = cricketUrl;
    const visibility = () => setHidden(document.hidden);
    const blur = () => {
      live.current = actCricket(live.current, 'cancel');
      setState(live.current);
      if (live.current.phase === 'fighting') setPaused(true);
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', blur);
    return () => {
      background.onload = null;
      cricket.onload = null;
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', blur);
      sound.current?.dispose();
      sound.current = null;
    };
  }, []);

  useEffect(() => {
    if (suspended) {
      live.current = actCricket(live.current, 'cancel');
      sound.current?.pause();
    } else if (sound.current) void sound.current.start();
    let frame = 0,
      previous = 0,
      lastUI = 0;
    const draw = (now: number) => {
      const elapsed = previous ? Math.min((now - previous) / 1000, 0.05) : 0;
      previous = now;
      if (!suspended) {
        const next = tickCricket(live.current, elapsed);
        if (next.eventId !== live.current.eventId) sound.current?.play(next.event);
        live.current = next;
      }
      const context = canvas.current?.getContext('2d');
      if (context)
        drawCricketScene(
          context,
          live.current,
          now / 1000,
          pointer.current,
          undefined,
          undefined,
          art.current,
        );
      if (now - lastUI > 40) {
        setState({ ...live.current });
        lastUI = now;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [suspended]);

  return {
    state,
    canvas,
    root,
    muted,
    audioReady,
    paused,
    hidden,
    help,
    suspended,
    opponent,
    finished,
    update,
    unlockAudio,
    action,
    begin,
    press,
    move,
    setPaused,
    toggleSound,
    setHelp,
    toggleHelp,
  };
}
