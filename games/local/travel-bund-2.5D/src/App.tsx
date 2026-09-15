import { useCallback, useEffect, useRef, useState } from 'react';
import { Scene, type Flight } from './Scene';
import { clamp, chapters, chapterAt, wheelStep } from './flight';

export function App() {
  const flight = useRef<Flight>({
    progress: 0,
    target: 0,
    playing: false,
    speed: 1,
    yaw: 0,
    dragging: false,
  });
  const [progress, setProgress] = useState(0),
    [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false),
    [loaded, setLoaded] = useState(0),
    [error, setError] = useState('');
  const [speed, setSpeed] = useState(1);
  const pointer = useRef<{
    id: number;
    x: number;
    y: number;
    mode: 'travel' | 'look' | null;
  } | null>(null);
  const onProgress = useCallback((p: number) => {
    setProgress(p);
    setPlaying(flight.current.playing);
  }, []);
  const onReady = useCallback(() => setReady(true), []);
  const scrub = useCallback((p: number) => {
    flight.current.target = clamp(p);
    flight.current.playing = false;
    flight.current.yaw = 0;
    setPlaying(false);
  }, []);
  const nudge = useCallback(
    (step: number) => {
      const f = flight.current;
      // A reversing gesture takes control immediately, without exhausting queued motion.
      const base = Math.sign(step) === Math.sign(f.target - f.progress) ? f.target : f.progress;
      scrub(base + step);
    },
    [scrub],
  );
  const toggle = useCallback(() => {
    if (flight.current.progress >= 1) flight.current.progress = flight.current.target = 0;
    else flight.current.target = flight.current.progress;
    flight.current.yaw = 0;
    flight.current.playing = !flight.current.playing;
    setPlaying(flight.current.playing);
  }, []);
  const release = useCallback(() => {
    pointer.current = null;
    flight.current.dragging = false;
  }, []);
  useEffect(() => {
    const wheel = (event: WheelEvent) => {
      if (!ready || event.ctrlKey || (event.target as HTMLElement).closest('select')) return;
      event.preventDefault();
      nudge(wheelStep(event.deltaY, event.deltaMode, innerHeight));
    };
    const key = (event: KeyboardEvent) => {
      if (!ready || (event.target as HTMLElement).matches('input,button,select')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        toggle();
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        nudge(0.025);
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        nudge(-0.025);
      }
      if (event.key === 'Home') {
        event.preventDefault();
        scrub(0);
      }
      if (event.key === 'End') {
        event.preventDefault();
        scrub(1);
      }
    };
    window.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', key);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', release);
    };
  }, [ready, nudge, scrub, toggle, release]);
  const chapter = chapterAt(progress);
  const current = chapters[chapter];
  return (
    <main data-ready={ready} data-playing={playing} data-chapter={chapter}>
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
          if (!ready || pointer.current || !event.isPrimary || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, mode: null };
          flight.current.dragging = true;
          flight.current.target = flight.current.progress;
          flight.current.playing = false;
          setPlaying(false);
        }}
        onPointerMove={(event) => {
          const drag = pointer.current;
          if (!drag || drag.id !== event.pointerId) return;
          const dx = event.clientX - drag.x,
            dy = event.clientY - drag.y;
          if (!drag.mode) {
            if (Math.hypot(dx, dy) < 6) return;
            drag.mode = Math.abs(dx) > Math.abs(dy) ? 'look' : 'travel';
          }
          if (drag.mode === 'travel') nudge((-dy / innerHeight) * 0.24);
          else
            flight.current.yaw = Math.max(
              -0.45,
              Math.min(0.45, flight.current.yaw + (dx / innerWidth) * 0.9),
            );
          drag.x = event.clientX;
          drag.y = event.clientY;
        }}
        onPointerUp={(event) => {
          if (pointer.current?.id === event.pointerId) release();
        }}
        onPointerCancel={(event) => {
          if (pointer.current?.id === event.pointerId) release();
        }}
        onLostPointerCapture={(event) => {
          if (pointer.current?.id === event.pointerId) release();
        }}
      />
      <header>
        <h1>
          外滩 <span>· 空中漫游</span>
        </h1>
        <span>SHANGHAI / ALONG THE RIVER</span>
      </header>
      <section className="story" key={chapter} aria-label="当前风景">
        <span className="eyebrow">{String(chapter + 1).padStart(2, '0')} / 沿江漫游</span>
        <h2>{current.title}</h2>
        <p>{current.text}</p>
      </section>
      {ready && progress < 0.018 && !playing && (
        <div className="invitation" aria-hidden="true">
          <i />
          向上滑动 / 向下滚动，走近上海
        </div>
      )}
      <section className="controls" aria-label="飞行控制">
        <div className="journey-track">
          <input
            type="range"
            aria-label="飞行进度"
            min="0"
            max="1000"
            value={Math.round(progress * 1000)}
            disabled={!ready}
            onChange={(event) => scrub(Number(event.target.value) / 1000)}
          />
          <nav aria-label="沿江停靠点">
            {chapters.map((stop, i) => (
              <button
                key={stop.at}
                disabled={!ready}
                aria-label={`前往${stop.short}`}
                aria-current={chapter === i ? 'step' : undefined}
                onClick={() => scrub(stop.at)}
              >
                <span>{String(i + 1).padStart(2, '0')}</span>
                {stop.short}
              </button>
            ))}
          </nav>
        </div>
        <div className="control-row">
          <button onClick={toggle} disabled={!ready || !!error}>
            {playing ? '暂停飞行' : progress === 1 ? '重新飞行' : '开始飞行'}
          </button>
          <button
            onClick={() => scrub(chapters.find((stop) => stop.at > progress + 0.02)?.at ?? 0)}
            disabled={!ready}
          >
            {progress > 0.98 ? '重走两岸' : '下一处风景 ↗'}
          </button>
          <button
            className="reset"
            aria-label="回到起点"
            title="回到起点"
            onClick={() => scrub(0)}
            disabled={!ready}
          >
            ↺
          </button>
          <button
            className="reset"
            onClick={() => {
              flight.current.yaw = 0;
            }}
            disabled={!ready}
            aria-label="视角归正"
            title="视角归正"
          >
            ◎
          </button>
          <label>
            <span>速度</span>
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
          <output>{Math.round(progress * 100)}%</output>
        </div>
        <div className="footnote">
          <span>上下滑动前进 · 左右拖动环顾</span>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            © OpenStreetMap
          </a>
        </div>
      </section>
      {(!ready || error) && (
        <div className="loading" role="status">
          <h2>外滩 · 空中漫游</h2>
          <p>
            {error ||
              (loaded === 1
                ? '正在展开城市轮廓…'
                : `正在加载城市轮廓 ${Math.round(loaded * 100)}%`)}
          </p>
          {error && <button onClick={() => location.reload()}>重新加载</button>}
        </div>
      )}
    </main>
  );
}
