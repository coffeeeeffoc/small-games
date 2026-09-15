import { useCallback, useEffect, useRef, useState } from 'react';
import { Scene, type Flight } from './Scene';
import { clamp, DURATION, flightFrame } from './flight';

export function App() {
  const flight = useRef<Flight>({ progress: 0, target: 0, playing: false, speed: 1 });
  const [progress, setProgress] = useState(0),
    [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false),
    [loaded, setLoaded] = useState(0),
    [error, setError] = useState('');
  const [speed, setSpeed] = useState(1);
  const pointer = useRef<{ id: number; y: number; progress: number } | null>(null);
  const onProgress = useCallback((p: number) => {
    setProgress(p);
    setPlaying(flight.current.playing);
  }, []);
  const onReady = useCallback(() => {
    setReady(true);
    flight.current.playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);
  const scrub = useCallback((p: number) => {
    flight.current.target = clamp(p);
    flight.current.playing = false;
    setPlaying(false);
    setProgress(clamp(p));
  }, []);
  const toggle = useCallback(() => {
    if (flight.current.progress >= 1) flight.current.progress = flight.current.target = 0;
    else flight.current.target = flight.current.progress;
    flight.current.playing = !flight.current.playing;
    setPlaying(flight.current.playing);
  }, []);
  useEffect(() => {
    const wheel = (event: WheelEvent) => {
      if (!ready) return;
      event.preventDefault();
      scrub(flight.current.target + event.deltaY / 6000);
    };
    const key = (event: KeyboardEvent) => {
      if (!ready || (event.target as HTMLElement).matches('input,button,select')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        toggle();
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        scrub(flight.current.target + 0.015);
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        scrub(flight.current.target - 0.015);
      }
    };
    window.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', key);
    };
  }, [ready, scrub, toggle]);
  return (
    <main data-ready={ready} data-playing={playing}>
      <Scene
        flight={flight}
        onProgress={onProgress}
        onReady={onReady}
        onLoad={setLoaded}
        onError={setError}
      />
      <div
        className="flight-input"
        aria-hidden="true"
        onPointerDown={(event) => {
          if (!ready) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          pointer.current = {
            id: event.pointerId,
            y: event.clientY,
            progress: flight.current.progress,
          };
          scrub(flight.current.progress);
        }}
        onPointerMove={(event) => {
          const drag = pointer.current;
          if (drag && drag.id === event.pointerId)
            scrub(drag.progress + ((drag.y - event.clientY) / innerHeight) * 0.3);
        }}
        onPointerUp={() => {
          pointer.current = null;
        }}
        onPointerCancel={() => {
          pointer.current = null;
        }}
        onLostPointerCapture={() => {
          pointer.current = null;
        }}
      />
      <header>
        <div>
          <h1>外滩 · 空中漫游</h1>
          <p>{flightFrame(progress).name}</p>
        </div>
        <span>SHANGHAI / AERIAL TOUR</span>
      </header>
      <section className="controls" aria-label="飞行控制">
        <div className="control-row">
          <button onClick={toggle} disabled={!ready || !!error}>
            {playing ? '暂停飞行' : progress === 1 ? '重新飞行' : '开始飞行'}
          </button>
          <button onClick={() => scrub(0)} disabled={!ready}>
            回到起点
          </button>
          <label>
            速度{' '}
            <select
              aria-label="飞行速度"
              value={speed}
              onChange={(event) => {
                const n = Number(event.target.value);
                setSpeed(n);
                flight.current.speed = n;
              }}
            >
              <option value=".5">0.5×</option>
              <option value="1">1×</option>
              <option value="2">2×</option>
            </select>
          </label>
          <output>
            {Math.round(progress * DURATION)} / {DURATION} 秒
          </output>
        </div>
        <input
          type="range"
          aria-label="飞行进度"
          min="0"
          max="1000"
          value={Math.round(progress * 1000)}
          disabled={!ready}
          onChange={(event) => scrub(Number(event.target.value) / 1000)}
        />
        <div className="footnote">
          <span>滚轮 / 上下拖动控制飞行 · 空格暂停</span>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            © OpenStreetMap contributors
          </a>
        </div>
      </section>
      {(!ready || error) && (
        <div className="loading" role="status">
          <h2>外滩 · 空中漫游</h2>
          <p>
            {error ||
              (loaded === 1
                ? '正在展开城市轮廓，沿途细节会逐渐显现…'
                : `正在加载城市轮廓 ${Math.round(loaded * 100)}%`)}
          </p>
          {error && <button onClick={() => location.reload()}>重新加载</button>}
        </div>
      )}
    </main>
  );
}
