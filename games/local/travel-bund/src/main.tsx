import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { useProgress } from '@react-three/drei';
import * as THREE from 'three';
import type { Telemetry, Teleport } from './Scene';
import { clearInput, destinations, input, readVisits, stories, type WorldData } from './world';
import { audioActivity, chime, setAudio } from './audio';
import { explorationRoutes, readRoute, routeProgress, routeShareUrl, type RouteId } from './routes';
import './style.css';

const KEY = 'travel-bund.visits.v1';
const Scene = React.lazy(() => import('./Scene').then((module) => ({ default: module.Scene })));
class SceneBoundary extends React.Component<
  { children: React.ReactNode; onError: () => void },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.error ? null : this.props.children;
  }
}
function Loading() {
  const { progress } = useProgress();
  return (
    <span>
      正在铺开两岸风景 <b>{Math.round(progress)}%</b>
    </span>
  );
}

function App() {
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const [data, setData] = useState<WorldData | null>(null),
    [error, setError] = useState(''),
    [ready, setReady] = useState(false),
    [started, setStarted] = useState(false);
  const [panel, setPanel] = useState<'map' | 'pause' | 'story' | 'journal' | null>(null),
    [active, setActive] = useState(false),
    [night, setNight] = useState(false),
    [sound, setSound] = useState(false),
    [sitting, setSitting] = useState(false),
    [fast, setFast] = useState(false),
    [boost, setBoost] = useState(false),
    [quality, setQuality] = useState(touch ? 0 : 1),
    [sensitivity, setSensitivity] = useState(1);
  const [visits, setVisits] = useState<string[]>(() => {
    try {
      return readVisits(localStorage.getItem(KEY));
    } catch {
      return [];
    }
  });
  const [selectedRoute, setSelectedRoute] = useState<RouteId | null>(() => readRoute(location.search)),
    [shareBusy, setShareBusy] = useState(false),
    [shareLink, setShareLink] = useState('');
  const [story, setStory] = useState<WorldData['landmarks'][number] | null>(null),
    [notice, setNotice] = useState(''),
    [photo, setPhoto] = useState<string | null>(null);
  const [teleport, setTeleport] = useState<Teleport>(() => {
    const invited = routeProgress(selectedRoute, visits);
    return { ...destinations[(invited?.next || invited?.route.stops[0])?.destination ?? 0], serial: 0 };
  });
  const [stats, setStats] = useState<Telemetry>({
    position: teleport.position,
    yaw: -1.5,
    speed: 0,
    grounded: false,
    calls: 0,
    triangles: 0,
    fps: 0,
  });
  const renderer = useRef<THREE.WebGLRenderer | null>(null),
    dialog = useRef<HTMLDialogElement>(null),
    noticeTimer = useRef<number>(0),
    action = useRef(() => {}),
    capture = useRef(() => {});
  const notify = useCallback((text: string) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3200);
  }, []);
  const readyScene = useCallback(() => setReady(true), []),
    sceneError = useCallback(() => setError('场景加载失败，请检查网络后重试。'), []);
  const stop = useCallback(() => {
    input.active = false;
    clearInput();
    setActive(false);
    audioActivity(false);
    if (document.pointerLockElement) document.exitPointerLock();
  }, []);
  const open = useCallback(
    (p: typeof panel) => {
      stop();
      setPanel(p);
    },
    [stop],
  );
  const start = useCallback(() => {
    if (!ready || error) return;
    dialog.current?.close();
    setPanel(null);
    setStarted(true);
    setActive(true);
    input.active = true;
    clearInput();
    audioActivity(true);
    const canvas = renderer.current?.domElement;
    if (canvas) {
      canvas.tabIndex = 0;
      canvas.focus({ preventScroll: true });
    }
    if (!started)
      void setAudio(true)
        .then(() => {
          setSound(true);
          audioActivity(input.active);
        })
        .catch(() => notify('可在右上角手动开启声音。'));
    if (!touch) {
      const promise = renderer.current?.domElement.requestPointerLock();
      promise
        ?.then(() => {
          if (!input.active) document.exitPointerLock();
        })
        .catch(() => notify('鼠标锁定未开启，可按住画面拖动转头。'));
    }
  }, [ready, error, touch, notify, started]);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`${import.meta.env.BASE_URL}world/world.json`, { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw Error('world');
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== 'AbortError') setError('场景资料没有加载成功，请重试。');
      });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    input.sitting = sitting;
    input.fast = fast;
    input.boost = boost;
    input.sensitivity = sensitivity;
  }, [sitting, fast, boost, sensitivity]);
  useEffect(() => {
    if (panel) {
      dialog.current?.showModal();
      dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    } else dialog.current?.close();
  }, [panel]);
  useEffect(() => {
    const blur = () => {
      if (input.active) {
        stop();
        setPanel('pause');
      }
    };
    const hidden = () => {
      if (document.hidden) blur();
    };
    const lock = () => {
      if (!document.pointerLockElement && input.active) blur();
    };
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        if (input.active) {
          e.preventDefault();
          blur();
        }
        return;
      }
      if (!input.active || /INPUT|BUTTON|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName))
        return;
      if (
        [
          'KeyW',
          'KeyA',
          'KeyS',
          'KeyD',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'ShiftLeft',
          'ShiftRight',
          'KeyR',
          'Space',
        ].includes(e.code)
      ) {
        e.preventDefault();
        input.keys.add(e.code);
      }
      if (!e.repeat) {
        if (e.code === 'Space') input.jump = true;
        if (e.code === 'KeyE') action.current();
        if (e.code === 'KeyP') capture.current();
        if (e.code === 'KeyM') open('map');
      }
    };
    const up = (e: KeyboardEvent) => input.keys.delete(e.code);
    const mouse = (e: MouseEvent) => {
      if (input.active && document.pointerLockElement) {
        input.look[0] += e.movementX;
        input.look[1] += e.movementY;
      }
    };
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', hidden);
    document.addEventListener('pointerlockchange', lock);
    document.addEventListener('mousemove', mouse);
    return () => {
      clearInput();
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', hidden);
      document.removeEventListener('pointerlockchange', lock);
      document.removeEventListener('mousemove', mouse);
      window.clearTimeout(noticeTimer.current);
    };
  }, [open, stop]);
  const nearestBench = data?.benches
    .map((b, i) => ({
      ...b,
      id: i,
      d: Math.hypot(stats.position[0] - b.position[0], stats.position[2] - b.position[2]),
    }))
    .sort((a, b) => a.d - b.d)[0];
  const nearest = data?.landmarks
    .map((l) => ({
      ...l,
      d: Math.hypot(stats.position[0] - l.position[0], stats.position[2] - l.position[2]),
    }))
    .sort((a, b) => a.d - b.d)[0];
  const target =
    nearestBench && nearestBench.d < 4 ? 'bench' : nearest && nearest.d < 140 ? 'landmark' : null;
  const progress = routeProgress(selectedRoute, visits);
  action.current = () => {
    if (sitting) {
      setSitting(false);
      notify('起身，继续走走。');
    } else if (target === 'bench') {
      setSitting(true);
      chime();
      notify('坐一会儿，听听江风。');
    } else if (target === 'landmark' && nearest) {
      setStory(nearest);
      open('story');
    } else notify('走近长椅或地标，可以发现更多。');
  };
  capture.current = () => {
    if (!renderer.current || !ready) return;
    try {
      const image = renderer.current.domElement.toDataURL('image/png');
      setPhoto(image);
      chime();
      notify('已取景，打开手记可以保存照片。');
    } catch {
      notify('暂时无法生成照片，请稍后重试。');
    }
  };
  async function toggleSound() {
    const next = !sound;
    try {
      await setAudio(next);
      setSound(next);
      if (!input.active) audioActivity(false);
    } catch {
      notify('声音暂时无法启动，请再次点击。');
    }
  }
  function travel(index: number) {
    const d = destinations[index];
    setSitting(false);
    setTeleport({ ...d, serial: teleport.serial + 1 });
    start();
    notify(`已到达 ${d.name}`);
  }
  function collect() {
    if (!story) return;
    const next = [...new Set([...visits, story.id])];
    setVisits(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      const updated = routeProgress(selectedRoute, next);
      notify(updated && !updated.next ? `「${updated.route.title}」三处打卡完成，去手记留一张纪念卡吧。` : '这一处风景，已收入手记。');
    } catch {
      notify('已收入本次手记，浏览器暂时无法保存。');
    }
    chime();
  }
  function chooseRoute(id: RouteId) {
    const selected = routeProgress(id, visits)!;
    setSelectedRoute(id);
    setShareLink('');
    travel((selected.next || selected.route.stops[0]).destination);
    notify(`已选「${selected.route.title}」。走近目标并收入手记，完成三处打卡。`);
  }
  async function shareWalk() {
    setShareBusy(true);
    setShareLink('');
    setNotice('');
    window.clearTimeout(noticeTimer.current);
    const url = routeShareUrl(location.href, selectedRoute);
    const text = progress
      ? `我在「${progress.route.title}」收下了 ${progress.completed}/3 处风景。一起沿江走走？`
      : `我在外滩收下了 ${visits.length} 处风景。一起把江风留在手记里？`;
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title: '江风入境 · 外滩漫游', text, url });
          notify('分享入口已打开。');
          return;
        } catch (error) {
          if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return;
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        notify('漫游链接已复制，发给朋友一起走走。');
      } catch {
        setShareLink(url);
        notify('可长按下面的链接，复制后发给朋友。');
      }
    } finally {
      setShareBusy(false);
    }
  }
  function downloadPassport() {
    if (!progress) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1350;
    const context = canvas.getContext('2d');
    if (!context) { notify('暂时无法生成纪念卡，请稍后重试。'); return; }
    context.fillStyle = '#f3ecdc'; context.fillRect(0, 0, 1080, 1350);
    context.fillStyle = '#142f35'; context.fillRect(0, 0, 1080, 330);
    context.fillStyle = '#dfbd84'; context.font = '36px sans-serif'; context.fillText('SHANGHAI / THE BUND', 90, 100);
    context.fillStyle = '#f3ecdc'; context.font = 'bold 70px serif'; context.fillText('江风入境。', 90, 215);
    context.fillStyle = '#142f35'; context.font = 'bold 48px sans-serif'; context.fillText(progress.route.title, 90, 450);
    context.font = '34px sans-serif'; context.fillText(`我的漫游打卡  ${progress.completed} / 3`, 90, 535);
    progress.route.stops.forEach((stop, index) => {
      context.fillStyle = visits.includes(stop.landmark) ? '#315b61' : '#88897e';
      context.font = '38px sans-serif'; context.fillText(`${visits.includes(stop.landmark) ? '✓' : '○'}  ${stop.name}`, 90, 655 + index * 105);
    });
    context.fillStyle = '#315b61';
    for (let index = 0; index < 11; index++) context.fillRect(90 + index * 82, 1110 - (index % 4) * 28, 58, 80 + (index % 4) * 28);
    context.fillStyle = '#142f35'; context.font = '30px sans-serif'; context.fillText('把时间留在江边。把风景留给朋友。', 90, 1250);
    canvas.toBlob((blob) => {
      if (!blob) { notify('纪念卡没有生成，请稍后重试。'); return; }
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `江风入境-${progress.route.title}-${progress.completed}处打卡.png`;
      link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('纪念卡已生成，可保存后分享。');
    }, 'image/png');
  }
  const drag = useRef<{ id: number; x: number; y: number } | null>(null),
    stick = useRef<{ id: number; x: number; y: number } | null>(null);
  function pointerDown(e: React.PointerEvent) {
    if (!input.active || document.pointerLockElement || drag.current || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
  function releaseLook(e: React.PointerEvent) {
    if (drag.current?.id === e.pointerId) drag.current = null;
  }
  function pointerMove(e: React.PointerEvent) {
    const p = drag.current;
    if (!p || p.id !== e.pointerId || !input.active) return;
    input.look[0] += e.clientX - p.x;
    input.look[1] += e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
  }
  const [thumb, setThumb] = useState([0, 0]);
  function stickMove(e: React.PointerEvent) {
    const p = stick.current;
    if (!p || e.pointerId !== p.id || !input.active) return;
    const x = (e.clientX - p.x) / 40,
      y = (e.clientY - p.y) / 40,
      length = Math.max(1, Math.hypot(x, y));
    input.stick = [x / length, y / length];
    setThumb([(x / length) * 30, (y / length) * 30]);
  }
  function releaseStick(e?: React.PointerEvent) {
    if (e && stick.current?.id !== e.pointerId) return;
    stick.current = null;
    input.stick = [0, 0];
    setThumb([0, 0]);
  }
  useEffect(() => {
    if (!active) {
      drag.current = null;
      releaseStick();
    }
  }, [active]);
  return (
    <main
      className={`${started ? 'entered' : ''} ${night ? 'night' : ''}`}
      data-phase={error ? 'error' : !started ? 'intro' : active ? 'playing' : 'paused'}
      data-ready={ready}
      data-sitting={sitting}
      data-x={stats.position[0].toFixed(2)}
      data-z={stats.position[2].toFixed(2)}
      data-y={stats.position[1].toFixed(2)}
      data-speed={stats.speed.toFixed(2)}
      data-grounded={stats.grounded}
      data-quality={quality}
      data-yaw={stats.yaw.toFixed(3)}
    >
      <div
        className="world"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={releaseLook}
        onPointerCancel={releaseLook}
        onLostPointerCapture={releaseLook}
      >
        {data && !error && (
          <SceneBoundary onError={sceneError}>
            <Canvas
              frameloop={active || !ready ? 'always' : 'demand'}
              shadows={quality > 0}
              dpr={[1, quality === 0 ? 1 : quality === 1 ? 1.25 : 2]}
              camera={{ position: [-393, 2.6, 37], fov: 68, near: 0.25, far: 12000 }}
              gl={{
                antialias: true,
                logarithmicDepthBuffer: true,
                preserveDrawingBuffer: true,
                powerPreference: 'high-performance',
                toneMapping: THREE.ACESFilmicToneMapping,
              }}
              onCreated={({ gl }) => {
                renderer.current = gl;
                gl.domElement.addEventListener('webglcontextlost', (e) => {
                  e.preventDefault();
                  stop();
                  setError('画面连接已中断，请重新载入场景。');
                });
              }}
            >
              <Suspense fallback={null}>
                <Scene
                  data={data}
                  night={night}
                  active={active}
                  ready={ready}
                  teleport={teleport}
                  onReady={readyScene}
                  onTelemetry={setStats}
                  quality={quality}
                />
              </Suspense>
            </Canvas>
          </SceneBoundary>
        )}
      </div>
      <div className="edge-shade" />
      {!started && (
        <section className="intro" aria-label="漫游入口">
          <header className="intro-top">
            <span>SHANGHAI / THE BUND</span>
            <span>31°14′ N &nbsp; 121°29′ E</span>
          </header>
          <div className="intro-copy">
            <p className="eyebrow">一段没有行程表的旅行</p>
            <h1>
              江风
              <br />
              <em>入境。</em>
            </h1>
            <p className="intro-description">
              把时间留在江边。
              <br />
              走进外滩两岸，在暮色与建筑之间，自由漫游。
            </p>
            {error ? (
              <>
                <p role="alert">{error}</p>
                <button className="primary" onClick={() => location.reload()}>
                  重新载入 ↻
                </button>
              </>
            ) : (
              <button className="primary" id="enter-world" disabled={!ready} onClick={start}>
                {ready ? '走进风景　↗' : <Loading />}
              </button>
            )}
            <p className="intro-hint">
              {touch
                ? '左手行走 · 右手转头 · 横屏看得更远'
                : 'W A S D 行走　·　鼠标环顾　·　Esc 暂停'}
            </p>
            {progress && <p className="intro-hint">收到一张漫游邀请：{progress.route.title} · 三处打卡</p>}
          </div>
          <div className="intro-index">
            <span>01 — 05</span>
            <p>外滩 / 苏州河 / 陆家嘴</p>
            <div className="rule" />
          </div>
        </section>
      )}
      {started && (
        <>
          <header className="hud">
            <div className="wordmark">
              <span>江风入境</span>
              <small>{sitting ? '江畔小坐' : nearest?.name.split('（')[0] || '两岸漫游'}</small>
            </div>
            <nav aria-label="漫游工具">
              <button onClick={() => setNight(!night)} aria-label={night ? '切换日景' : '切换夜景'}>
                {night ? '☾ 夜色' : '◒ 暮色'}
              </button>
              <button onClick={toggleSound} aria-pressed={sound} aria-label="环境声音">
                {sound ? '♫' : '♪'}
                <span className="desktop-only"> 声音</span>
              </button>
              <button onClick={() => open('map')} aria-label="打开地图">
                ⌖<span className="desktop-only"> 地图</span>
              </button>
              <button onClick={() => open('pause')} aria-label="暂停漫游">
                Ⅱ
              </button>
            </nav>
          </header>
          {active && (
            <>
              <div className="crosshair" />
              <div className="compass">
                <span>西</span>
                <i style={{ transform: `rotate(${stats.yaw}rad)` }}>↑</i>
                <span>东</span>
              </div>
              <div className="location-chip">
                <i /> 黄浦江畔 <span>{night ? '21:00' : '17:40'}</span>
              </div>
              {progress && (
                <button className="route-task" onClick={() => open('map')} aria-label="查看探索路线">
                  <b>{progress.route.title} · {progress.completed} / 3</b>
                  <span>{progress.next ? `下一处：${progress.next.name} · 走近后收入手记` : '三处风景已收齐 · 去手记留念 ↗'}</span>
                </button>
              )}
              <div className="interaction">
                <button
                  className="interact"
                  onClick={() => action.current()}
                  disabled={!target && !sitting}
                >
                  <kbd>E</kbd>
                  {sitting
                    ? '起身，继续漫游'
                    : target === 'bench'
                      ? '在长椅上坐一会儿'
                      : target === 'landmark'
                        ? `认识 ${nearest?.name.split('（')[0]}`
                        : '沿着江边，慢慢走'}
                </button>
              </div>
              {!touch && (
                <div className="keyboard-hint">
                  WASD / 方向键 <span>行走</span>　Shift <span>快走</span>　R <span>疾行</span>
                  　空格 <span>跳跃</span>　P <span>拍照</span>
                </div>
              )}
              <button
                className="jump"
                disabled={sitting || !stats.grounded}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  input.jump = true;
                  renderer.current?.domElement.focus({ preventScroll: true });
                }}
              >
                <span>↑</span> {stats.grounded ? '跳上 / 跳下' : '空中'}
                <small>{touch ? '轻点跳跃' : '空格跳跃'}</small>
              </button>
              <div className="bottom-actions">
                <button onClick={() => capture.current()} aria-label="拍照">
                  ◎
                </button>
                <button onClick={() => open('journal')} aria-label="打开旅行手记">
                  ▤<span>{visits.length.toString().padStart(2, '0')}</span>
                </button>
              </div>
              {touch && (
                <>
                  <div
                    className="look-pad"
                    aria-label="拖动环顾"
                    onPointerDown={pointerDown}
                    onPointerMove={pointerMove}
                    onPointerUp={releaseLook}
                    onPointerCancel={releaseLook}
                    onLostPointerCapture={releaseLook}
                  />
                  <div
                    className="joystick"
                    role="group"
                    aria-label="移动摇杆"
                    onPointerDown={(e) => {
                      if (!input.active || stick.current || e.button !== 0) return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      stick.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
                    }}
                    onPointerMove={stickMove}
                    onPointerUp={releaseStick}
                    onPointerCancel={releaseStick}
                    onLostPointerCapture={releaseStick}
                  >
                    <span style={{ transform: `translate(${thumb[0]}px,${thumb[1]}px)` }} />
                  </div>
                  <button
                    className={`run ${fast ? 'selected' : ''}`}
                    aria-pressed={fast}
                    onClick={() => {
                      if (boost) {
                        setBoost(false);
                        setFast(false);
                      } else if (fast) setBoost(true);
                      else setFast(true);
                    }}
                  >
                    {boost ? '疾行 ×6' : fast ? '快走 ×2' : '漫步 ×1'}
                  </button>
                </>
              )}
            </>
          )}
          {error && (
            <div className="error-cover">
              <p role="alert">{error}</p>
              <button onClick={() => location.reload()}>重新载入</button>
            </div>
          )}
        </>
      )}
      <footer className="attribution">
        地图 ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap contributors
        </a>{' '}
        ·{' '}
        <a
          href={`${import.meta.env.BASE_URL}world/ATTRIBUTION.md`}
          target="_blank"
          rel="noreferrer"
        >
          来源
        </a>
      </footer>
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      <dialog
        ref={dialog}
        onCancel={(e) => {
          e.preventDefault();
        }}
        aria-label={
          panel === 'map'
            ? '两岸地图'
            : panel === 'story'
              ? '地标介绍'
              : panel === 'journal'
                ? '旅行手记'
                : '漫游设置'
        }
      >
        <button className="close" onClick={start} aria-label="返回漫游">
          ↗
        </button>
        {panel === 'pause' && (
          <>
            <p className="eyebrow">TAKE YOUR TIME</p>
            <h2>风景会等你。</h2>
            <p className="muted">暂停一下，或者换一种方式看这座城市。</p>
            <button className="primary" onClick={start}>
              继续漫游　↗
            </button>
            <div className="settings">
              <label>
                环境声音<button onClick={toggleSound}>{sound ? '已开启' : '已关闭'}</button>
              </label>
              <label>
                光影时刻<button onClick={() => setNight(!night)}>{night ? '夜色' : '暮色'}</button>
              </label>
              <label>
                画面精度
                <select value={quality} onChange={(e) => setQuality(Number(e.target.value))}>
                  <option value={0}>流畅</option>
                  <option value={1}>清晰</option>
                  <option value={2}>精细</option>
                </select>
              </label>
              <label>
                转头灵敏度
                <input
                  aria-label="转头灵敏度"
                  type="range"
                  min=".4"
                  max="2"
                  step=".1"
                  value={sensitivity}
                  onChange={(e) => setSensitivity(Number(e.target.value))}
                />
              </label>
            </div>
            <div className="dialog-links">
              <button onClick={() => setPanel('map')}>两岸地图 ↗</button>
              <button onClick={() => setPanel('journal')}>旅行手记 ↗</button>
              <button onClick={() => travel(0)}>回到江畔 ↗</button>
            </div>
            <p className="muted small">
              {touch
                ? '左侧摇杆行走，右侧转头；点击速度按钮切换漫步 / 快走 / 疾行，↑ 跳上或跳下台阶。'
                : 'WASD / 方向键行走 · Shift 快走 · 按住 R 疾行 · 空格跳上/跳下 · E 交互 · P 拍照 · Esc 暂停'}
              <br />
              室外自由漫游，建筑内部暂未开放。
            </p>
          </>
        )}
        {panel === 'map' && (
          <>
            <p className="eyebrow">ACROSS THE RIVER</p>
            <h2>沿江，去走走。</h2>
            <p className="muted">选择一处落脚点，接下来的路由你决定。</p>
            <section className="route-list" aria-label="探索路线">
              <h3>给漫游一个小目标</h3>
              {explorationRoutes.map((route) => (
                <button key={route.id} aria-pressed={selectedRoute === route.id} onClick={() => chooseRoute(route.id)}>
                  <b>{route.title}</b><span>{route.description}</span>
                  <small>{routeProgress(route.id, visits)!.completed} / 3 已打卡 · 开始路线 ↗</small>
                </button>
              ))}
              {progress && <ol>{progress.route.stops.map((stop) => <li key={stop.landmark}>{visits.includes(stop.landmark) ? '✓ 已收入手记' : '○ 待探索'} · {stop.name}</li>)}</ol>}
            </section>
            <div className="map-art">
              <svg viewBox="-950 -1630 3500 3470" role="img" aria-label="外滩两岸位置图">
                {data?.water.map((t, i) => (
                  <polygon key={i} points={t.map((p) => p.join(',')).join(' ')} fill="#65918c" />
                ))}
                {data?.landmarks.map((l) => (
                  <circle key={l.id} cx={l.position[0]} cy={l.position[2]} r="17" fill="#d5bd91" />
                ))}
                {destinations.map((d, i) => (
                  <g key={d.name}>
                    <circle cx={d.position[0]} cy={d.position[2]} r="55" fill="#f4dfb1" />
                    <text
                      x={d.position[0]}
                      y={d.position[2] + 19}
                      textAnchor="middle"
                      fontSize="65"
                      fill="#1a3439"
                    >
                      {i + 1}
                    </text>
                  </g>
                ))}
                <circle cx={stats.position[0]} cy={stats.position[2]} r="38" fill="#fc7c58" />
              </svg>
              <span>黄 浦 江</span>
            </div>
            <div className="destinations">
              {destinations.map((d, i) => (
                <button key={d.name} onClick={() => travel(i)}>
                  <b>0{i + 1}</b>
                  <span>
                    {d.name}
                    <small>{d.subtitle}</small>
                  </span>
                  <i>↗</i>
                </button>
              ))}
            </div>
          </>
        )}
        {panel === 'story' && story && (
          <>
            <p className="eyebrow">A CLOSER LOOK</p>
            <div className="story-number">
              {String((data?.landmarks.findIndex((l) => l.id === story.id) ?? 0) + 1).padStart(
                2,
                '0',
              )}
            </div>
            <h2>{story.name.split('（')[0]}</h2>
            <p className="story-text">
              {stories[story.id] ||
                '这处建筑是两岸城市风景的一部分。放慢脚步，看看立面的节奏、屋顶的轮廓，以及它与街道和江水的位置关系。'}
            </p>
            <p className="muted small">当前场景为建筑外观与地理布局的艺术化重建。</p>
            <button className="primary" onClick={collect} disabled={visits.includes(story.id)}>
              {visits.includes(story.id) ? '已收入旅行手记 ✓' : '收入旅行手记　＋'}
            </button>
          </>
        )}
        {panel === 'journal' && (
          <>
            <p className="eyebrow">LITTLE THINGS, KEPT</p>
            <h2>把江风留下。</h2>
            <p className="muted">已收藏 {visits.length} 处风景</p>
            {progress && <div className="route-journal"><h3>{progress.route.title} · {progress.completed} / 3</h3><p>{progress.next ? `下一处：${progress.next.name}。从地图落脚点出发，走近地标并收入手记。` : '三处打卡完成。可以保存纪念卡，邀请朋友走同一条路线。'}</p><button className="primary" onClick={downloadPassport}>保存我的漫游纪念卡</button></div>}
            <button className="share-walk" disabled={shareBusy} onClick={shareWalk}>{shareBusy ? '正在准备…' : '邀请朋友沿江走走'}</button>
            {shareLink && <label className="share-link">漫游邀请链接<input value={shareLink} readOnly onFocus={(event) => event.currentTarget.select()} /></label>}
            {photo ? (
              <figure>
                <img src={photo} alt="刚刚拍下的外滩风景" />
                <a className="primary" href={photo} download="江风入境-外滩.png">
                  保存这张照片　↓
                </a>
              </figure>
            ) : (
              <p className="empty">还没有照片。回到江边，按 P 或轻点取景按钮。</p>
            )}
            <ul className="journal-list">
              {visits.map((id) => (
                <li key={id}>✓　{data?.landmarks.find((l) => l.id === id)?.name || id}</li>
              ))}
            </ul>
            <p className="muted small">地标手记保存在本机；照片请下载保存。</p>
          </>
        )}
      </dialog>
      {new URLSearchParams(location.search).has('debug') && (
        <output className="debug">
          {Math.round(stats.fps)} FPS · {stats.calls} calls · {Math.round(stats.triangles / 1000)}k
          △<br />
          {stats.position.map((x) => x.toFixed(1)).join(' / ')}
        </output>
      )}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
