import '../dev-mode.js';
import React, { Suspense, useCallback, useEffect, useId, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { WebGLRenderer } from 'three';
import type { Telemetry, Teleport } from './Scene';
import { clearInput, destinations, input, readVisits, stories, type WorldData } from './world';
import { audioActivity, chime, setAudio, lifeSound } from './audio';
import { explorationRoutes, readRoute, routeProgress, routeShareUrl, type RouteId } from './routes';
import {
  isRenderDetail,
  readRenderDetail,
  RENDER_DETAIL_KEY,
  type RenderDetail,
} from './render-settings';
import type { LifeEvent, LifeTarget } from './life';
import { readSettings, SETTINGS_KEY } from './settings';
import './style.css';
import homeArt from './assets/home-river.webp';
import panelArt from './assets/panels-art.webp';

const KEY = 'travel-bund.visits.v1';
const Tour = React.lazy(() => import('./Scene').then((module) => ({ default: module.Tour })));
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
function PresetChoice({title,value,options,onChange}: {
  title:string; value:string; options:readonly (readonly [string,string,string])[];
  onChange:(value:string)=>void;
}) {
  const [expanded,setExpanded]=useState(false), id=useId();
  const root=useRef<HTMLDivElement>(null), trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!expanded)return;
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setExpanded(false);};
    document.addEventListener('pointerdown',outside);
    return ()=>document.removeEventListener('pointerdown',outside);
  },[expanded]);
  return <div className="settings-choice" ref={root} onKeyDown={event=>{
    if(event.key==='Escape'&&expanded){event.preventDefault();event.stopPropagation();setExpanded(false);trigger.current?.focus();}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      event.preventDefault();setExpanded(true);
      const current=Array.from(root.current?.querySelectorAll('[role="option"]')||[]).indexOf(document.activeElement!);
      const next=event.key==='Home'?0:event.key==='End'?options.length-1:
        !expanded?Math.max(0,options.findIndex(option=>option[0]===value)):
        (current+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;
      const focus=()=>root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[next]?.focus();
      if(expanded)focus();else requestAnimationFrame(focus);
    }
  }}>
    <span>{title}</span>
    <button ref={trigger} className="choice-trigger" role="combobox" aria-label={title}
      aria-controls={id} aria-haspopup="listbox" aria-expanded={expanded}
      onClick={()=>setExpanded(!expanded)}>
      {options.find(option=>option[0]===value)?.[1]}<i aria-hidden="true"/>
    </button>
    {expanded&&<div className="choice-options" id={id} role="listbox" aria-label={`${title}选项`}>
      {options.map(([option,label,description])=><button key={option} role="option"
        aria-label={label} aria-selected={option===value} value={option}
        onClick={()=>{onChange(option);setExpanded(false);trigger.current?.focus();}}>
        <span><strong>{label}</strong><small>{description}</small></span>
        <span className="choice-check" aria-hidden="true">{option===value?'✓':''}</span>
      </button>)}
    </div>}
  </div>;
}
function App() {
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const [settings] = useState(() => {
    let raw = null;
    try {
      raw = localStorage.getItem(SETTINGS_KEY);
    } catch {}
    return readSettings(raw, touch, matchMedia('(prefers-reduced-motion: reduce)').matches);
  });
  const [data, setData] = useState<WorldData | null>(null),
    [error, setError] = useState(''),
    [ready, setReady] = useState(false),
    [started, setStarted] = useState(false);
  const launching = useRef(false);
  const [panel, setPanel] = useState<'map' | 'pause' | 'story' | 'journal' | 'stall' | null>(null),
    [active, setActive] = useState(false),
    [night, setNight] = useState(settings.night),
    [sound, setSound] = useState(settings.sound),
    [sitting, setSitting] = useState(false),
    [fast, setFast] = useState(false),
    [boost, setBoost] = useState(false),
    [quality, setQuality] = useState(settings.quality),
    [sensitivity, setSensitivity] = useState(settings.sensitivity),
    [crowd, setCrowd] = useState(settings.crowd),
    [motion, setMotion] = useState(settings.motion);
  const [lifeTarget, setLifeTarget] = useState<LifeTarget | null>(null),
    [lifeEvent, setLifeEvent] = useState<LifeEvent | null>(null);
  const [moments, setMoments] = useState<string[]>(() => {
    try {
      return readVisits(localStorage.getItem('travel-bund.moments.v1'));
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ night, sound, quality, sensitivity, crowd, motion }),
      );
    } catch {}
  }, [night, sound, quality, sensitivity, crowd, motion]);
  const [visits, setVisits] = useState<string[]>(() => {
    try {
      return readVisits(localStorage.getItem(KEY));
    } catch {
      return [];
    }
  });
  const [selectedRoute, setSelectedRoute] = useState<RouteId | null>(() =>
      readRoute(location.search),
    ),
    [shareBusy, setShareBusy] = useState(false),
    [shareLink, setShareLink] = useState('');
  const shareFlight = useRef(false),
    shareVersion = useRef(0),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      shareVersion.current++;
    };
  }, []);
  const [renderDetail, setRenderDetail] = useState<RenderDetail>(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(RENDER_DETAIL_KEY);
    } catch {}
    return readRenderDetail(location.search, stored, touch ? 'light' : 'original');
  });
  useEffect(() => {
    try {
      localStorage.setItem(RENDER_DETAIL_KEY, renderDetail);
    } catch {}
  }, [renderDetail]);
  const [story, setStory] = useState<WorldData['landmarks'][number] | null>(null),
    [notice, setNotice] = useState(''),
    [photo, setPhoto] = useState<string | null>(null);
  const [teleport, setTeleport] = useState<Teleport>(() => {
    const invited = routeProgress(selectedRoute, visits);
    return {
      ...destinations[(invited?.next || invited?.route.stops[0])?.destination ?? 0],
      serial: 0,
    };
  });
  const [stats, setStats] = useState<Telemetry>({
    position: teleport.position,
    yaw: teleport.yaw,
    speed: 0,
    grounded: false,
    calls: 0,
    triangles: 0,
    fps: 0,
  });
  useEffect(() => {
    if (!launching.current || !data || !selectedRoute) return;
    const invited = routeProgress(selectedRoute, visits)!;
    const stop = invited.next || invited.route.stops[0],
      landing = destinations[stop.destination];
    const landmark = data.landmarks.find((item) => item.id === stop.landmark);
    if (!landmark) return;
    const yaw = Math.atan2(
      landing.position[0] - landmark.position[0],
      landing.position[2] - landmark.position[2],
    );
    const pitch = Math.min(
      1.1,
      Math.atan2(
        stop.viewHeight,
        Math.hypot(
          landing.position[0] - landmark.position[0],
          landing.position[2] - landmark.position[2],
        ),
      ),
    );
    setTeleport((previous) => ({ ...landing, yaw, pitch, serial: previous.serial + 1 }));
  }, [data, selectedRoute, started]);
  const renderer = useRef<WebGLRenderer | null>(null),
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
    if (error) return;
    if (!started) {
      launching.current = true;
      setPanel(null);
      setStarted(true);
      if (touch && !document.fullscreenElement && document.documentElement.requestFullscreen)
        void document.documentElement.requestFullscreen().catch(() => {});
      void setAudio(sound).catch(() => setSound(false));
      return;
    }
    if (!ready) return;
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
    if (touch && !document.fullscreenElement && document.documentElement.requestFullscreen)
      void document.documentElement.requestFullscreen().catch(() => {});
    if (!touch) {
      const promise = renderer.current?.domElement.requestPointerLock();
      promise
        ?.then(() => {
          if (!input.active) document.exitPointerLock();
        })
        .catch(() => notify('鼠标锁定未开启，可按住画面拖动转头。'));
    }
  }, [ready, error, touch, notify, started, sound]);
  useEffect(() => {
    if (ready && launching.current) {
      launching.current = false;
      start();
    }
  }, [ready,start]);
  const receiveRenderer = useCallback((gl: WebGLRenderer) => {
    renderer.current = gl;
    gl.domElement.addEventListener('webglcontextlost', e => {
      if (renderer.current !== gl) return;
      e.preventDefault(); stop(); setError('画面连接已中断，请重新载入场景。');
    });
  }, [stop]);
  function home() {
    stop();
    setPanel(null);
    setStarted(false);
    launching.current = false;
    setReady(false);
    renderer.current = null;
    setSitting(false);
    setLifeTarget(null);
  }
  function keepMoment(id: string) {
    setMoments((previous) => {
      const next = [...new Set([...previous, id])];
      try {
        localStorage.setItem('travel-bund.moments.v1', JSON.stringify(next));
      } catch {}
      return next;
    });
  }
  function meet(target: LifeTarget) {
    if (!input.active) return;
    setLifeEvent((previous) => ({
      id: target.id,
      kind: target.kind,
      serial: (previous?.serial || 0) + 1,
    }));
    if (target.kind === 'kiosk') open('stall');
    else {
      renderer.current?.domElement.focus({ preventScroll: true });
      keepMoment(target.kind);
      lifeSound(target.kind);
      notify(
        target.kind === 'visitor'
          ? '你好呀！今天的江风很舒服。'
          : '扑棱棱，小鸽子绕了一圈又落回江边。',
      );
    }
  }
  useEffect(() => {
    if (!started || data) return;
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
  }, [started,data]);
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
  const nextLandmark =
    progress?.next && data?.landmarks.find((landmark) => landmark.id === progress.next!.landmark);
  const routeDistance = nextLandmark
    ? Math.hypot(
        stats.position[0] - nextLandmark.position[0],
        stats.position[2] - nextLandmark.position[2],
      )
    : undefined;
  const routeBearing = nextLandmark
    ? stats.yaw -
      Math.atan2(
        stats.position[0] - nextLandmark.position[0],
        stats.position[2] - nextLandmark.position[2],
      )
    : 0;
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
  function travel(index: number, yaw?: number, pitch = [0, 0.3, 0.35, 0, 1.05][index]) {
    const d = destinations[index];
    setSitting(false);
    setTeleport({ ...d, yaw: yaw ?? d.yaw, pitch, serial: teleport.serial + 1 });
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
      notify(
        updated && !updated.next
          ? `「${updated.route.title}」三处打卡完成，去手记留一张纪念卡吧。`
          : '这一处风景，已收入手记。',
      );
    } catch {
      notify('已收入本次手记，浏览器暂时无法保存。');
    }
    chime();
  }
  function chooseRoute(id: RouteId) {
    shareVersion.current++;
    const selected = routeProgress(id, visits)!;
    setSelectedRoute(id);
    setShareLink('');
    const stop = selected.next || selected.route.stops[0],
      landing = destinations[stop.destination];
    const landmark = data?.landmarks.find((item) => item.id === stop.landmark);
    travel(
      stop.destination,
      landmark
        ? Math.atan2(
            landing.position[0] - landmark.position[0],
            landing.position[2] - landmark.position[2],
          )
        : landing.yaw,
      landmark
        ? Math.min(
            1.1,
            Math.atan2(
              stop.viewHeight,
              Math.hypot(
                landing.position[0] - landmark.position[0],
                landing.position[2] - landmark.position[2],
              ),
            ),
          )
        : 0,
    );
    notify(`已选「${selected.route.title}」。走近目标并收入手记，完成三处打卡。`);
  }
  function changeRenderDetail(detail: RenderDetail) {
    shareVersion.current++;
    setShareLink('');
    setRenderDetail(detail);
    if (new URLSearchParams(location.search).has('renderDetail'))
      history.replaceState(null, '', routeShareUrl(location.href, selectedRoute, detail));
  }
  async function shareWalk() {
    if (shareFlight.current) return;
    shareFlight.current = true;
    const version = shareVersion.current;
    const current = () => mounted.current && shareVersion.current === version;
    setShareBusy(true);
    setShareLink('');
    setNotice('');
    window.clearTimeout(noticeTimer.current);
    const url = routeShareUrl(location.href, selectedRoute, renderDetail);
    const text = progress
      ? `我在「${progress.route.title}」收下了 ${progress.completed}/3 处风景。一起沿江走走？`
      : `我在外滩收下了 ${visits.length} 处风景。一起把江风留在手记里？`;
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title: '江风入境 · 外滩漫游', text, url });
          if (current()) notify('分享入口已打开。');
          return;
        } catch (error) {
          if (!current()) return;
          if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
            return;
        }
      }
      if (!current()) return;
      try {
        await navigator.clipboard.writeText(url);
        if (current()) notify('漫游链接已复制，发给朋友一起走走。');
      } catch {
        if (current()) {
          setShareLink(url);
          notify('可长按下面的链接，复制后发给朋友。');
        }
      }
    } finally {
      shareFlight.current = false;
      if (mounted.current) setShareBusy(false);
    }
  }
  function downloadPassport() {
    if (!progress) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const context = canvas.getContext('2d');
    if (!context) {
      notify('暂时无法生成纪念卡，请稍后重试。');
      return;
    }
    context.fillStyle = '#f3ecdc';
    context.fillRect(0, 0, 1080, 1350);
    context.fillStyle = '#142f35';
    context.fillRect(0, 0, 1080, 330);
    context.fillStyle = '#dfbd84';
    context.font = '36px sans-serif';
    context.fillText('SHANGHAI / THE BUND', 90, 100);
    context.fillStyle = '#f3ecdc';
    context.font = 'bold 70px serif';
    context.fillText('江风入境。', 90, 215);
    context.fillStyle = '#142f35';
    context.font = 'bold 48px sans-serif';
    context.fillText(progress.route.title, 90, 450);
    context.font = '34px sans-serif';
    context.fillText(`我的漫游打卡  ${progress.completed} / 3`, 90, 535);
    progress.route.stops.forEach((stop, index) => {
      context.fillStyle = visits.includes(stop.landmark) ? '#315b61' : '#88897e';
      context.font = '38px sans-serif';
      context.fillText(
        `${visits.includes(stop.landmark) ? '✓' : '○'}  ${stop.name}`,
        90,
        655 + index * 105,
      );
    });
    context.fillStyle = '#315b61';
    for (let index = 0; index < 11; index++)
      context.fillRect(90 + index * 82, 1110 - (index % 4) * 28, 58, 80 + (index % 4) * 28);
    context.fillStyle = '#142f35';
    context.font = '30px sans-serif';
    context.fillText('把时间留在江边。把风景留给朋友。', 90, 1250);
    canvas.toBlob((blob) => {
      if (!blob) {
        notify('纪念卡没有生成，请稍后重试。');
        return;
      }
      const url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = `江风入境-${progress.route.title}-${progress.completed}处打卡.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('纪念卡已生成，可保存后分享。');
    }, 'image/png');
  }
  const lifePress = useRef<{target:LifeTarget;id:number;x:number;y:number} | null>(null);
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
      data-phase={error ? 'error' : !started ? 'intro' : !ready ? 'loading' : active ? 'playing' : 'paused'}
      data-ready={ready}
      data-sitting={sitting}
      data-x={stats.position[0].toFixed(2)}
      data-z={stats.position[2].toFixed(2)}
      data-y={stats.position[1].toFixed(2)}
      data-speed={stats.speed.toFixed(2)}
      data-grounded={stats.grounded}
      data-quality={quality}
      data-yaw={stats.yaw.toFixed(3)}
      data-fps={stats.fps.toFixed(2)}
      data-calls={stats.calls}
      data-triangles={stats.triangles}
      data-render-detail={renderDetail}
      data-crowd={crowd}
      data-motion={motion}
      data-life-target={lifeTarget?.kind || ''}
      data-life-event={lifeEvent?.kind || ''}
      style={{'--home-art': `url(${homeArt})`} as React.CSSProperties}
    >
      {!started && <div className={`home-art ${motion ? 'moving' : ''}`} aria-hidden="true">
        <img src={homeArt} alt="" fetchPriority="high" />
        <div className="home-river-glint" /><div className="home-breeze" />
      </div>}
      <div
        className="world"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={releaseLook}
        onPointerCancel={releaseLook}
        onLostPointerCapture={releaseLook}
      >
        {started && data && !error && (
          <SceneBoundary onError={sceneError}>
              <Suspense fallback={null}>
                <Tour
                  data={data}
                  night={night}
                  active={active}
                  ready={ready}
                  teleport={teleport}
                  onReady={readyScene}
                  onTelemetry={setStats}
                  quality={quality}
                  renderDetail={renderDetail}
                  crowd={crowd}
                  motion={motion}
                  lifeEvent={lifeEvent}
                  onLifeTarget={setLifeTarget}
                  onRenderer={receiveRenderer}
                />
              </Suspense>
          </SceneBoundary>
        )}
      </div>
      <div className="edge-shade" />
      {!started && (
        <section className="intro" aria-label="漫游入口">
          <header className="intro-top">
            <span>SHANGHAI / THE BUND</span>
            <button className="home-settings" onClick={() => open('pause')} aria-label="游览设置">
              ☼ 游览设置
            </button>
          </header>
          <div className="intro-copy">
            <p className="eyebrow">今天，去江边浪费一点时间</p>
            <h1>
              江风
              <br />
              <em>入境。</em>
            </h1>
            <p className="intro-description">
              沿着外滩走走，遇见城市的小日常。
            </p>
            {error ? (
              <>
                <p role="alert">{error}</p>
                <button className="primary" onClick={() => location.reload()}>
                  重新载入 ↻
                </button>
              </>
            ) : (
              <button className="primary" id="enter-world" onClick={start}>
                进入游览　↗
              </button>
            )}
            <p className="intro-hint">
              {touch
                ? '左手行走 · 右手转头 · 横屏看得更远'
                : 'W A S D 行走　·　鼠标环顾　·　Esc 暂停'}
            </p>
            {progress && (
              <p className="intro-hint">收到一张漫游邀请：{progress.route.title} · 三处打卡</p>
            )}
            <button className="home-journal" onClick={() => open('journal')}>
              我的旅行手记　↗
            </button>
            <div className="intro-routes" aria-label="挑一条漫游路线">
              {explorationRoutes.map((route) => (
                <button
                  key={route.id}
                  aria-pressed={selectedRoute === route.id}
                  onClick={() => chooseRoute(route.id)}
                >
                  <b>{route.title}</b>
                  <small>三处风景 · 点这里出发 ↗</small>
                </button>
              ))}
            </div>
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
          {!ready && !error && <div className="tour-loading" role="status">
            <span className="loading-mark" aria-hidden="true" />
            <h2>江风正在靠近。</h2><p>正在铺开附近的石板路与两岸风景</p>
            <button onClick={home}>返回首页</button>
          </div>}
          <header className="hud">
            <button className="home-button" onClick={home} aria-label="返回首页">
              <svg
                viewBox="0 0 24 24"
                width="21"
                height="21"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M3 10 12 2l9 8v11h-6v-7H9v7H3z" />
              </svg>
            </button>
            <nav aria-label="漫游工具">
              <button onClick={() => open('map')} aria-label="打开地图">
                ⌖<span className="desktop-only"> 地图</span>
              </button>
              <button onClick={() => open('pause')} aria-label="暂停">
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <rect x="5" y="4" width="5" height="16" rx=".5" />
                  <rect x="14" y="4" width="5" height="16" rx=".5" />
                </svg>
              </button>
            </nav>
          </header>
          {active && (
            <>
              <div className="crosshair" />
              {lifeTarget && (
                <button
                  className="life-target"
                  style={{ left: `${lifeTarget.screen[0]}%`, top: `${lifeTarget.screen[1]}%` }}
                  onPointerDown={(event) => {
                    if (event.button !== 0 || lifePress.current) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    pointerDown(event);
                    lifePress.current = {target:lifeTarget,id:event.pointerId,x:event.clientX,y:event.clientY};
                  }}
                  onPointerMove={(event) => {
                    const press = lifePress.current;
                    if (press?.id === event.pointerId && Math.hypot(event.clientX-press.x,event.clientY-press.y)>12) lifePress.current=null;
                    pointerMove(event);
                  }}
                  onPointerCancel={(event) => {lifePress.current=null;releaseLook(event);}}
                  onLostPointerCapture={(event) => {lifePress.current=null;releaseLook(event);}}
                  onPointerUp={(event) => {
                    const target = lifePress.current?.id === event.pointerId ? lifePress.current.target : null;
                    lifePress.current = null;
                    releaseLook(event);
                    // Finish the release/click before a popup can replace the tapped scene object.
                    if (target) requestAnimationFrame(() => meet(target));
                  }}
                  onClick={(event) => {
                    if (event.detail === 0) meet(lifeTarget);
                  }}
                  aria-label={lifeTarget.name}
                >
                  <span className="target-dot" />
                  {lifeTarget.name}
                  <small>轻点互动</small>
                </button>
              )}
              {progress && (
                <button
                  className="route-task"
                  onClick={() => open('map')}
                  aria-label="查看探索路线"
                >
                  <b>
                    {progress.route.title} · {progress.completed} / 3
                  </b>
                  <span>
                    {progress.next
                      ? `下一处：${progress.next.name}${routeDistance !== undefined ? ` · ${Math.round(routeDistance)} 米` : ''} · 走近后收入手记`
                      : '三处风景已收齐 · 去手记留念 ↗'}
                  </span>
                  {progress.next && (
                    <i
                      className="route-bearing"
                      aria-label="下一处风景的方向"
                      style={{ transform: `rotate(${routeBearing}rad)` }}
                    >
                      ↑
                    </i>
                  )}
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
        className={`panel panel-${panel || 'closed'}`}
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
                : panel === 'stall'
                  ? '江风小站'
                  : '漫游设置'
        }
      >
        <div className="dialog-banner" aria-hidden="true">
          <span>{panel === 'pause' ? '江边歇一会' : panel === 'map' ? '两岸漫游' : panel === 'stall' ? '一份江边的小心意' : '把上海留在心里'}</span>
        </div>
        <div className="panel-content">
          <svg className="panel-fan" viewBox="0 0 120 36" aria-hidden="true">
            <path d="M0 34H120M34 34A26 26 0 0 1 86 34"/>
            {Array.from({length:9},(_,i)=>{const a=Math.PI+i*Math.PI/8;return <path key={i} d={`M60 34L${60+Math.cos(a)*26} ${34+Math.sin(a)*26}`}/>})}
          </svg>
        <button
          className="close"
          onClick={() => (started ? start() : setPanel(null))}
          aria-label={started ? '返回漫游' : '返回首页'}
        >
          ×
        </button>
        {panel === 'pause' && (
          <>
            <p className="eyebrow">TAKE YOUR TIME</p>
            <h2>{started ? '风景会等你。' : '今天，怎样逛外滩？'}</h2>
            <p className="muted panel-subtitle">调好步调，再沿江走走。</p>
            <div className="settings">
              <label>
                环境声音
                <button aria-label="环境声音" aria-pressed={sound} onClick={toggleSound}>
                  {sound ? '已开启' : '已关闭'}
                </button>
              </label>
              <label>
                光影时刻
                <button aria-label="光影时刻" onClick={() => setNight(!night)}>
                  {night ? '夜色' : '暖阳'}
                </button>
              </label>
              <PresetChoice title="画面精度" value={String(quality)} onChange={value=>setQuality(Number(value))}
                options={[
                  ['0','流畅','适合手机，保留近景光影'],
                  ['1','清晰','更清楚的阴影与江面倒影'],
                  ['2','精细','适合性能充足的设备'],
                ]}/>
              <PresetChoice title="模型细节" value={renderDetail}
                onChange={value=>{if(isRenderDetail(value))changeRenderDetail(value);}}
                options={[
                  ['original','完整建筑细节','保留模型全部装饰与轮廓'],
                  ['balanced','均衡','兼顾建筑细节与运行速度'],
                  ['light','轻量 · 推荐手机','保留楼位与外形，简化小装饰'],
                ]}/>
              <label>
                行人与鸽子
                <button
                  aria-label="行人与鸽子"
                  aria-pressed={crowd}
                  onClick={() => setCrowd(!crowd)}
                >
                  {crowd ? '热闹一点' : '安静一点'}
                </button>
              </label>
              <label>
                生活动画
                <button
                  aria-label="生活动画"
                  aria-pressed={motion}
                  onClick={() => setMotion(!motion)}
                >
                  {motion ? '轻轻动起来' : '减少动态'}
                </button>
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
              {started && (
                <>
                  <button onClick={() => travel(0)}>回到江畔 ↗</button>
                  <button onClick={home}>返回首页 ↗</button>
                </>
              )}
            </div>
            <details className="control-help"><summary>操作小贴士</summary><p className="muted small">
              {touch
                ? '左侧摇杆行走，右侧转头；点击速度按钮切换漫步 / 快走 / 疾行，↑ 跳上或跳下台阶。'
                : 'WASD / 方向键行走 · Shift 快走 · 按住 R 疾行 · 空格跳上/跳下 · E 交互 · P 拍照 · Esc 暂停'}
              <br />
              室外自由漫游，建筑内部暂未开放。
            </p></details>
            {started && <button className="primary panel-primary" onClick={start}>继续漫游</button>}
          </>
        )}
        {panel === 'stall' && (
          <>
            <p className="eyebrow">A LITTLE RIVERSIDE BREAK</p>
            <h2>江风小站</h2>
            <p className="muted">走累了就歇歇脚。挑一份小心意，把今天的江风留在手记里。</p>
            <div className="stall-choices">
              <button
                onClick={() => {
                  keepMoment('drink');
                  start();
                  lifeSound('drink');
                  notify('摊主递来一杯清凉，冰块叮当作响。已收入生活手记。');
                }}
              >
                <svg className="gift-art" viewBox="1031 372 403 213" aria-hidden="true" preserveAspectRatio="xMidYMid slice"><image href={panelArt} width="1476" height="1066"/></svg>
                <b>一杯江边清凉</b>
                <small>听一声冰块碰杯</small>
              </button>
              <button
                onClick={() => {
                  keepMoment('postcard');
                  chime();
                  capture.current();
                  start();
                  notify('收下一张外滩明信片。刚才的风景也留在了手记里。');
                }}
              >
                <svg className="gift-art" viewBox="1034 682 400 153" aria-hidden="true" preserveAspectRatio="xMidYMid slice"><image href={panelArt} width="1476" height="1066"/></svg>
                <b>一张外滩明信片</b>
                <small>把眼前的风景留下</small>
              </button>
            </div>
            <p className="muted small">漫游中的小礼物，可以重复领取。</p>
            <button className="primary panel-primary" onClick={start}>返回漫游</button>
          </>
        )}
        {panel === 'map' && (
          <>
            <p className="eyebrow">ACROSS THE RIVER</p>
            <h2>沿江，去走走。</h2>
            <p className="muted">选择一处落脚点，接下来的路由你决定。</p>
            <div className="map-art">
              <svg viewBox="-950 -1630 3500 3470" role="img" aria-label="外滩两岸位置图">
                <defs><pattern id="street-grid" width="280" height="240" patternUnits="userSpaceOnUse"><path d="M0 0H280V240" fill="none" stroke="#fdfaf0" strokeWidth="20"/><path d="M140 0V240" fill="none" stroke="#c9d6bf" strokeWidth="8"/></pattern></defs>
                <rect x="-950" y="-1630" width="3500" height="3470" fill="url(#street-grid)"/>
                {!data && <path d="M-330 -1630C-480 -800 -310 -190 -220 320S200 1200 370 1840H1250C890 750 900 100 380 -420S130 -1180 280 -1630Z" fill="#85b9b6"/>}
                {data?.water.map((t, i) => (
                  <polygon key={i} points={t.map((p) => p.join(',')).join(' ')} fill="#65918c" />
                ))}
                {data?.landmarks.map((l) => (
                  <circle key={l.id} cx={l.position[0]} cy={l.position[2]} r="17" fill="#b99263" />
                ))}
                {destinations.map((d, i) => (
                  <g key={d.name}>
                    <circle cx={d.position[0]} cy={d.position[2]} r="64" fill="#294d55" stroke="#fffaf0" strokeWidth="12"/>
                    <text
                      x={d.position[0]}
                      y={d.position[2] + 19}
                      textAnchor="middle"
                      fontSize="65"
                      fill="#fffaf0"
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
                <button key={d.name} onClick={() => travel(i)} aria-label={`0${i+1} ${d.name} · ${d.subtitle}`}>
                  <svg viewBox={`${524+i*88} 732 78 99`} aria-hidden="true" preserveAspectRatio="xMidYMid slice"><image href={panelArt} width="1476" height="1066"/></svg>
                  <b>0{i + 1}</b>
                  <span>
                    {d.name}
                    <small>{d.subtitle}</small>
                  </span>
                  <i>↗</i>
                </button>
              ))}
            </div>
            <section className="route-list" aria-label="探索路线">
              <h3>给漫游一个小目标</h3>
              {explorationRoutes.map((route) => (
                <button key={route.id} aria-pressed={selectedRoute === route.id} onClick={() => chooseRoute(route.id)}>
                  <b>{route.title}</b>
                  <small>{routeProgress(route.id, visits)!.completed} / 3 已打卡 · 开始路线 ↗</small>
                </button>
              ))}
              {progress && <ol>{progress.route.stops.map(stop => <li key={stop.landmark}>
                {visits.includes(stop.landmark) ? '✓ 已收入手记' : '○ 待探索'} · {stop.name}
              </li>)}</ol>}
            </section>
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
            {moments.length > 0 && (
              <div className="life-journal">
                <h3>江边的小日常</h3>
                {moments.map((id) => (
                  <span key={id}>
                    {(
                      {
                        visitor: '和游客打过招呼',
                        pigeon: '看小鸽子起飞',
                        drink: '一杯江边清凉',
                        postcard: '一张外滩明信片',
                      } as Record<string, string>
                    )[id] || id}
                  </span>
                ))}
              </div>
            )}
            {progress && (
              <div className="route-journal">
                <h3>
                  {progress.route.title} · {progress.completed} / 3
                </h3>
                <p>
                  {progress.next
                    ? `下一处：${progress.next.name}。从地图落脚点出发，走近地标并收入手记。`
                    : '三处打卡完成。可以保存纪念卡，邀请朋友走同一条路线。'}
                </p>
                <button className="primary" onClick={downloadPassport}>
                  保存我的漫游纪念卡
                </button>
              </div>
            )}
            <button className="share-walk" disabled={shareBusy} onClick={shareWalk}>
              {shareBusy ? '正在准备…' : '邀请朋友沿江走走'}
            </button>
            {shareLink && (
              <label className="share-link">
                漫游邀请链接
                <input
                  value={shareLink}
                  readOnly
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
            )}
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
        </div>
      </dialog>
      {window.SmallGamesDev.isEnabled() && (
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
