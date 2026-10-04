import '../dev-mode.js';
import { useEffect, useRef, useState } from 'react';
import { GAME, THEME_NAMES } from './config.ts';
import { getLevel, levels } from './game/levels/levels.ts';
import { defaultSave, finish, newRun, placeMark, useMap } from './game/core/rules.ts';
import { MARKS } from './game/core/model.ts';
import type { Dir, MarkKind, Mode, Run } from './game/core/model.ts';
import { loadSave, writeSave } from './platform/storage.ts';
import { Runtime } from './game/runtime/runtime.ts';
import { MapView } from './features/Map.tsx';
import { PauseIcon, TouchControls } from './features/Controls.tsx';

type Screen =
  | 'home'
  | 'levels'
  | 'brief'
  | 'playing'
  | 'pause'
  | 'settings'
  | 'map'
  | 'map-confirm'
  | 'mark'
  | 'result'
  | 'restart'
  | 'error';
const modeNames = { A: '无地图探索', B: '迷雾地图探索' };
const time = (seconds: number) =>
  `${Math.floor(seconds / 60)}分${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}秒`;
export function App() {
  const canvas = useRef<HTMLCanvasElement>(null),
    controller = useRef<Runtime | null>(null);
  const profile = useRef(defaultSave()),
    screenRef = useRef<Screen>('home'),
    started = useRef(false),
    rehearsal = useRef(false);
  const actions = useRef({ command: (_key: string) => {}, pause: () => {}, save: () => {} });
  const [screen, setScreen] = useState<Screen>('home'),
    [, refresh] = useState(0),
    [notice, setNotice] = useState('');
  const [mode, setMode] = useState<Mode>('B'),
    [selected, setSelected] = useState(1),
    [markAnchor, setMarkAnchor] = useState('');
  const [direction, setDirection] = useState<Dir>(0),
    [drag, setDrag] = useState(false),
    [error, setError] = useState('');
  const [touch] = useState(
    () => matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0,
  );
  const settingsFrom = useRef<Screen>('home'),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const run = controller.current?.run,
    level = getLevel(run?.level ?? selected),
    settings = profile.current.settings;
  const notify = (message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 8000);
  };
  function save() {
    if (
      started.current &&
      controller.current &&
      !rehearsal.current &&
      !controller.current.run.finished
    )
      profile.current.run = controller.current.run;
    const warning = writeSave(profile.current);
    if (warning) setNotice(warning);
  }
  function show(next: Screen) {
    screenRef.current = next;
    setScreen(next);
    if (next !== 'playing') {
      controller.current?.pause();
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }
  function pause() {
    if (screenRef.current === 'playing') {
      show('pause');
      save();
    }
  }
  function create(run: Run) {
    controller.current?.dispose();
    controller.current = null;
    try {
      controller.current = new Runtime(
        canvas.current!,
        getLevel(run.level),
        run,
        profile.current.settings,
        {
          hud: () => refresh((n) => n + 1),
          save: () => actions.current.save(),
          pause: () => actions.current.pause(),
          command: (key) => actions.current.command(key),
          error: (message) => {
            setError(message);
            show('error');
          },
        },
      );
      refresh((n) => n + 1);
      return true;
    } catch (e) {
      setError(
        `无法启动 3D 画面。请启用浏览器硬件加速，或使用支持 WebGL 2 的浏览器。${e instanceof Error ? `（${e.message}）` : ''}`,
      );
      show('error');
      return false;
    }
  }
  function prepare(id: number, dev = false) {
    if (!dev && id > profile.current.unlocked) return;
    clearTimeout(noticeTimer.current);
    setNotice('');
    save();
    started.current = false;
    rehearsal.current = dev;
    setSelected(id);
    if (create(newRun(getLevel(id), mode, profile.current.played.includes(id)))) show('brief');
  }
  async function resume() {
    const runtime = controller.current;
    if (!runtime) return;
    if (!touch && !drag) {
      try {
        await canvas.current!.requestPointerLock();
      } catch {
        notify('鼠标锁定未成功。请再次点击继续，或选择“拖动转向继续”。');
        show('pause');
        return;
      }
      if (document.pointerLockElement !== canvas.current) {
        notify('浏览器未锁定鼠标，可使用拖动转向。');
        show('pause');
        return;
      }
    }
    show('playing');
    runtime.resume();
  }
  function begin() {
    const runtime = controller.current;
    if (!runtime) return;
    runtime.run.mode = mode;
    runtime.run.viewedMap = mode === 'B';
    started.current = true;
    if (!rehearsal.current && !profile.current.played.includes(runtime.level.id))
      profile.current.played.push(runtime.level.id);
    save();
    void resume();
  }
  function openMap() {
    const r = controller.current?.run;
    if (!r || screenRef.current !== 'playing') return;
    show(r.mode === 'A' && !r.viewedMap ? 'map-confirm' : 'map');
    save();
  }
  function openMark() {
    const runtime = controller.current;
    if (!runtime || screenRef.current !== 'playing') return;
    const t = runtime.target(true);
    if (!t) {
      notify('靠近并对准门框旁的“＋ 标记”牌。镜面上也有实体标记牌。');
      return;
    }
    setMarkAnchor(t.id);
    setDirection(
      runtime.run.marks[t.id]?.direction ??
        (((Math.round(-runtime.run.yaw / (Math.PI / 2)) + 4) % 4) as Dir),
    );
    show('mark');
    save();
  }
  function interact() {
    const runtime = controller.current;
    if (!runtime || screenRef.current !== 'playing') return;
    notify(runtime.interact());
    if (runtime.run.finished) {
      if (!rehearsal.current) finish(profile.current, runtime.run, levels.length);
      show('result');
    }
    save();
    refresh((n) => n + 1);
  }
  function command(key: string) {
    if (key === 'Escape') {
      if (screenRef.current === 'playing') pause();
      else if (['map', 'mark', 'map-confirm', 'restart'].includes(screenRef.current)) show('pause');
      return;
    }
    if (screenRef.current !== 'playing') return;
    if (key === 'KeyE') interact();
    if (key === 'KeyM') openMap();
    if (key === 'KeyQ') openMark();
    if (key === 'KeyH' && controller.current) {
      controller.current.run.tutorialDismissed = true;
      save();
      refresh((n) => n + 1);
    }
  }
  actions.current = { command, pause, save };
  useEffect(() => {
    document.title = GAME.title;
    const loaded = loadSave();
    profile.current = loaded.save;
    if (loaded.warning) notify(loaded.warning);
    create(newRun(levels[0], 'B'));
    const beforeUnload = () => {
      controller.current?.pause();
      actions.current.save();
    };
    window.addEventListener('pagehide', beforeUnload);
    window.addEventListener('beforeunload', beforeUnload);
    if (window.SmallGamesDev.isEnabled()) {
      Object.assign(window, {
        mazeDebug: {
          snapshot: () => ({
            screen: screenRef.current,
            run: structuredClone(controller.current?.run),
            metrics: controller.current?.metrics(),
            axes: controller.current?.input.axes(),
            unlocked: profile.current.unlocked,
          }),
          select: (id: number) => prepare(id, true),
          // Authored layout inspection requires the shared explicit developer opt-in.
          layout: () => structuredClone(controller.current?.level),
        },
      });
    }
    return () => {
      beforeUnload();
      controller.current?.dispose();
      clearTimeout(noticeTimer.current);
      window.removeEventListener('pagehide', beforeUnload);
      window.removeEventListener('beforeunload', beforeUnload);
      if (window.SmallGamesDev.isEnabled()) delete (window as unknown as { mazeDebug?: unknown }).mazeDebug;
    };
  }, []);
  useEffect(() => {
    if (screen === 'playing') return;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    dialog?.querySelector<HTMLElement>('button, input, select')?.focus();
    function trap(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !dialog) return;
      const nodes = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, select, [tabindex="0"]',
        ),
      ];
      const first = nodes[0],
        last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [screen]);
  const runtime = controller.current;
  const target = runtime?.target(),
    anchor = runtime?.target(true);
  const tutorial =
    !run?.tutorialDismissed && level.tutorial
      ? {
          move: touch
            ? '左侧摇杆移动，右侧拖动观察。靠近归途之门后点“检查”。'
            : 'WASD / 方向键移动，鼠标观察。靠近归途之门后按 E。',
          marks: touch
            ? '对准门框旁的标记牌，点“标记”。“来过”不代表每条支路都已排查。'
            : '对准门框旁的标记牌，按 Q。“来过”不代表每条支路都已排查。',
          loop: '又见到这座落地钟了吗？同一个大厅，可以从不同的门回来。',
          mirror: touch
            ? '倒影里看见的门，未必能走过去。靠近表面，点“检查”核实；地面与门框始终可靠。'
            : '倒影里看见的门，未必能走过去。靠近表面按 E 核实；地面与门框始终可靠。',
        }[level.tutorial]
      : '';
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      notify('当前浏览器不支持此全屏请求，仍可在网页内继续探索。');
    }
  }
  return (
    <main id="maze-game" data-screen={screen} className={`game ${touch ? 'touch' : ''}`}>
      <canvas ref={canvas} className="world" aria-label="第一人称迷宫场景" />
      {screen === 'home' && (
        <div className="home-screen">
          <header className="brand">
            <span className="brand-emblem">⌑</span>
            <span>一场不急着抵达的探索</span>
            <span className="edition">VOL. 01 — 05</span>
          </header>
          <section className="intro">
            <p className="eyebrow">WANDER / REMEMBER / RETURN</p>
            <h1>
              {GAME.title.slice(0, 2)}
              <br />
              {GAME.title.slice(2)}
            </h1>
            <p className="tagline">{GAME.subtitle}</p>
            <p className="intro-copy">
              房间、庭院、光与倒影。
              <br />
              留下一枚记号，把陌生走成熟悉。
            </p>
            <div className="start-actions">
              {profile.current.run && (
                <button
                  id="continue"
                  className="primary"
                  onClick={() => {
                    started.current = true;
                    rehearsal.current = false;
                    if (create(profile.current.run!)) {
                      setMode(profile.current.run!.mode);
                      show('pause');
                    }
                  }}
                >
                  继续上次漫游 <span>↗</span>
                </button>
              )}
              <button
                id="start"
                className={profile.current.run ? '' : 'primary'}
                onClick={() => prepare(profile.current.unlocked)}
              >
                启程 <span>→</span>
              </button>
              <button onClick={() => show('levels')}>旅行手记 · 选择关卡</button>
              <button onClick={() => void fullscreen()}>切换全屏</button>
              <button
                className="quiet"
                onClick={() => {
                  settingsFrom.current = 'home';
                  show('settings');
                }}
              >
                偏好设置
              </button>
            </div>
          </section>
          <div className="cover-caption">
            <span>01 / 静谧宅邸</span>
            <span>每一次回头，都多认识一点这里。</span>
          </div>
          <footer className="home-footer">
            <span>五种风景 · 二十段归途</span>
            <span>无追逐 / 无倒计时 / 随时停留</span>
          </footer>
        </div>
      )}
      {screen === 'playing' && runtime && run && (
        <>
          <header className="hud">
            <div>
              <span className="eyebrow">
                {String(level.id).padStart(2, '0')} /{' '}
                {level.id === 20 ? '五境交汇' : THEME_NAMES[level.theme]}
              </span>
              <h2>{level.name}</h2>
              <span className="mode-label">
                {run.mode} · {modeNames[run.mode]}
                {rehearsal.current ? ' · 开发试玩' : ''}
              </span>
            </div>
            <div className="hud-actions"><button className="icon-button" aria-label="切换全屏" onClick={() => void fullscreen()}>⛶</button>
            <button id="pause" className="icon-button" aria-label="暂停" onClick={pause}>
              <PauseIcon />
            </button></div>
          </header>
          <div className={`crosshair ${target || anchor ? 'focused' : ''}`} aria-hidden="true" />
          {touch || drag ? <TouchControls runtime={runtime} dragOnly={!touch} /> : null}
          {run.mode === 'B' && settings.mini && (
            <button className="mini-map-button" aria-label="展开发现地图" onClick={openMap}>
              <MapView level={level} run={run} targets={runtime.data.targets} mini />
              <span>已发现 · 北 ↑</span>
            </button>
          )}
          <div className="play-actions">
            <button aria-label="标记" onClick={openMark}>
              <b>＋</b>
              <span>{touch ? '标记' : 'Q 标记'}</span>
            </button>
            <button aria-label="查看地图" onClick={openMap}>
              <b>▧</b>
              <span>{touch ? '地图' : 'M 地图'}</span>
            </button>
            <button className="interact" aria-label="检查或交互" onClick={interact}>
              <b>◎</b>
              <span>{touch ? '检查' : 'E 检查'}</span>
            </button>
          </div>
          <div className="focus-caption">
            {target
              ? `${touch ? '检查' : 'E 检查'} · ${target.label}`
              : anchor
                ? `${touch ? '标记' : 'Q 标记'} · ${anchor.label}`
                : ''}
          </div>
          {run.found.includes('exit') && level.required.length > 0 && (
            <div className="objective">
              归途之门 · 控制点 {level.required.filter((id) => run.activated.includes(id)).length} /{' '}
              {level.required.length} 已启动
            </div>
          )}
          {tutorial && (
            <aside className="tutorial">
              <span>{tutorial}</span>
              <button
                aria-label="跳过教程"
                onClick={() => {
                  run.tutorialDismissed = true;
                  save();
                  refresh((n) => n + 1);
                }}
              >
                {touch ? '知道了' : 'H 跳过'}
              </button>
            </aside>
          )}
          {touch && <p className="portrait-advice">横屏能看见更宽阔的风景</p>}
        </>
      )}
      {!['home', 'playing'].includes(screen) && (
        <div className="veil">
          <section
            className={`dialog ${screen === 'levels' || screen === 'map' ? 'wide' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <div className="dialog-top">
              <span className="eyebrow">{GAME.title} / 旅行手记</span>
              <span className="small-emblem">⌑</span>
            </div>
            {screen === 'levels' && (
              <>
                <h2 id="dialog-title">选择一段归途</h2>
                <p>完成任意模式即可解锁下一关。已开始过的关卡会标为“重游”。</p>
                <div className="level-list">
                  {levels.map((l) => (
                    <button
                      key={l.id}
                      className={`level-card theme-${l.theme}`}
                      disabled={l.id > profile.current.unlocked}
                      onClick={() => prepare(l.id)}
                    >
                      <span>{String(l.id).padStart(2, '0')}</span>
                      <strong>{l.name}</strong>
                      <small>
                        {l.id > profile.current.unlocked
                          ? '尚未解锁'
                          : profile.current.played.includes(l.id)
                            ? '重游'
                            : '未曾探索'}{' '}
                        · {l.id === 20 ? '五境交汇' : THEME_NAMES[l.theme]}
                      </small>
                      <em>
                        {(['A', 'B'] as const)
                          .map((m) =>
                            profile.current.records[`${l.id}:${m}`]
                              ? `${m} ${time(profile.current.records[`${l.id}:${m}`].seconds)}  `
                              : '',
                          )
                          .join('')}
                      </em>
                    </button>
                  ))}
                </div>
                {window.SmallGamesDev.isEnabled() && (
                  <details>
                    <summary>开发环境 · 全关试玩（不计入个人进度）</summary>
                    <div className="dev-levels">
                      {levels.map((l) => (
                        <button key={l.id} onClick={() => prepare(l.id, true)}>
                          {l.id}
                        </button>
                      ))}
                    </div>
                  </details>
                )}
                <button onClick={() => show('home')}>返回首页</button>
              </>
            )}
            {screen === 'brief' && (
              <>
                <p className="eyebrow">
                  {String(selected).padStart(2, '0')} /{' '}
                  {selected === 20 ? '五境交汇' : THEME_NAMES[getLevel(selected).theme]}
                </p>
                <h2 id="dialog-title">{getLevel(selected).name}</h2>
                <p>
                  观察门位，记住地标，留下你的判断。
                  <br />
                  找到归途之门，靠近后检查即可离开。
                </p>
                <div className="mode-options">
                  {(['B', 'A'] as const).map((m) => (
                    <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
                      <strong>
                        {m} · {modeNames[m]}
                      </strong>
                      <span>
                        {m === 'B'
                          ? '推荐 · 地图只记录亲自发现的空间'
                          : '依靠空间记忆与场景中的标记'}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="fine">
                  A 模式查看地图后，本局永久按 B 模式记录。标记功能两种模式都有。
                  {profile.current.played.includes(selected) ? '这是一段重游。' : ''}
                </p>
                <button id="enter" className="primary" onClick={begin}>
                  {touch ? '进入迷境' : '进入迷境 · 锁定鼠标'} <span>→</span>
                </button>
                <button className="quiet" onClick={() => show('levels')}>
                  返回选关
                </button>
              </>
            )}
            {screen === 'pause' && (
              <>
                <h2 id="dialog-title">在这里，歇一会儿。</h2>
                <p>移动和计时已暂停，朝向与标记会为你保留。</p>
                <button id="resume" className="primary" onClick={() => void resume()}>
                  {touch || drag ? '继续探索' : '继续探索 · 锁定鼠标'} <span>→</span>
                </button>
                {!touch && (
                  <button
                    onClick={() => {
                      setDrag(true);
                      show('playing');
                      runtime?.resume();
                    }}
                  >
                    拖动转向继续
                  </button>
                )}
                <div className="button-grid">
                  <button
                    onClick={() => {
                      settingsFrom.current = 'pause';
                      show('settings');
                    }}
                  >
                    设置
                  </button>
                  <button onClick={() => show('restart')}>重新开始本关</button>
                  <button
                    onClick={() => {
                      save();
                      started.current = false;
                      show('home');
                    }}
                  >
                    保存并返回首页
                  </button>
                </div>
                <p className="fine">
                  {touch
                    ? '左摇杆移动 · 右侧拖动转向'
                    : 'WASD / 方向键移动 · 鼠标转向 · E 检查 · Q 标记 · M 地图 · Esc 暂停'}
                </p>
              </>
            )}
            {screen === 'settings' && (
              <>
                <h2 id="dialog-title">用舒服的方式漫游</h2>
                <label className="setting">
                  视角范围 <output>{settings.fov}°</output>
                  <input
                    aria-label="视角范围"
                    type="range"
                    min="60"
                    max="100"
                    value={settings.fov}
                    onChange={(e) => {
                      settings.fov = +e.target.value;
                      refresh((n) => n + 1);
                    }}
                  />
                </label>
                <label className="setting">
                  转向灵敏度 <output>{settings.sensitivity.toFixed(1)}</output>
                  <input
                    aria-label="转向灵敏度"
                    type="range"
                    min="0.3"
                    max="2.5"
                    step="0.1"
                    value={settings.sensitivity}
                    onChange={(e) => {
                      settings.sensitivity = +e.target.value;
                      refresh((n) => n + 1);
                    }}
                  />
                </label>
                <label className="setting">
                  画质{' '}
                  <select
                    value={settings.quality}
                    onChange={(e) => {
                      settings.quality = e.target.value as 'low' | 'high';
                      refresh((n) => n + 1);
                    }}
                  >
                    <option value="high">标准 · 512 像素镜面</option>
                    <option value="low">轻量 · 256 像素镜面</option>
                  </select>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={settings.mini}
                    onChange={(e) => {
                      settings.mini = e.target.checked;
                      refresh((n) => n + 1);
                    }}
                  />{' '}
                  B 模式显示小地图
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={settings.sound}
                    onChange={(e) => {
                      settings.sound = e.target.checked;
                      refresh((n) => n + 1);
                    }}
                  />{' '}
                  轻柔交互音
                </label>
                <p className="fine">无走路摆头、镜头震动或运动模糊。</p>
                <button
                  className="primary"
                  onClick={() => {
                    save();
                    if (!runtime || create(runtime.run)) show(settingsFrom.current);
                  }}
                >
                  保存设置
                </button>
              </>
            )}
            {screen === 'map-confirm' && (
              <>
                <h2 id="dialog-title">打开你的发现地图？</h2>
                <p>查看后，本局按迷雾地图模式记录。</p>
                <p className="fine">关闭地图不会恢复 A 成绩。重新开始一局时可以重新选择模式。</p>
                <button
                  className="primary"
                  onClick={() => {
                    if (run) useMap(run);
                    show('map');
                    save();
                  }}
                >
                  确认查看，转为 B
                </button>
                <button onClick={() => show('pause')}>保留 A，不查看</button>
              </>
            )}
            {screen === 'map' && run && runtime && (
              <>
                <h2 id="dialog-title">已经认识的地方</h2>
                <p className="fine">
                  北 ↑ · 虚线：未核实开口 · 实线：已核实门洞 · ×：镜面 · 连接线：亲自走过
                </p>
                <div className="large-map">
                  <MapView level={level} run={run} targets={runtime.data.targets} />
                </div>
                <p className="fine">地图只记下经过；标记是你的判断。展开期间世界与计时已暂停。</p>
                <button className="primary" onClick={() => void resume()}>
                  收起地图，继续探索
                </button>
              </>
            )}
            {screen === 'mark' && run && runtime && (
              <>
                <h2 id="dialog-title">留下一枚记号</h2>
                <p>绑定眼前这块实体标记牌。可覆盖，也可删除。</p>
                <label className="setting">
                  箭头的世界方向
                  <select
                    aria-label="箭头方向"
                    value={direction}
                    onChange={(e) => setDirection(+e.target.value as Dir)}
                  >
                    {['北 ↑', '东 →', '南 ↓', '西 ←'].map((text, i) => (
                      <option key={i} value={i}>
                        {text}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mark-options">
                  {Object.entries(MARKS).map(([kind, mark]) => (
                    <button
                      key={kind}
                      onClick={() => {
                        const ok = placeMark(
                          run,
                          runtime.data.targets,
                          runtime.data.boxes,
                          markAnchor,
                          kind as MarkKind,
                          direction,
                        );
                        notify(ok ? `已留下“${mark.label}”标记。` : '标记位置已不可达。');
                        save();
                        void resume();
                      }}
                    >
                      <b style={{ color: mark.color }}>{mark.symbol}</b>
                      <span>
                        <strong>{mark.label}</strong>
                        <small>{mark.help}</small>
                      </span>
                    </button>
                  ))}
                </div>
                <div className="button-grid">
                  <button
                    onClick={() => {
                      placeMark(
                        run,
                        runtime.data.targets,
                        runtime.data.boxes,
                        markAnchor,
                        null,
                        direction,
                      );
                      save();
                      void resume();
                    }}
                  >
                    删除此处标记
                  </button>
                  <button onClick={() => void resume()}>取消</button>
                </div>
              </>
            )}
            {screen === 'restart' && (
              <>
                <h2 id="dialog-title">重新走一遍？</h2>
                <p>当前局的探索、机关和标记将重置。已解锁关卡、个人记录和设置保留。</p>
                <button className="primary" onClick={() => prepare(level.id, rehearsal.current)}>
                  确认重开，重新选择模式
                </button>
                <button onClick={() => show('pause')}>取消</button>
              </>
            )}
            {screen === 'result' && run && (
              <>
                <p className="eyebrow">一段归途，已被记住</p>
                <h2 id="dialog-title">原来，路在这里。</h2>
                <p>
                  {level.name} · {run.familiar ? '重游完成' : '首次探索完成'}
                  {rehearsal.current ? '（开发试玩，不写入成绩）' : ''}
                </p>
                <div className="result-grid">
                  <div>
                    <strong>{time(run.seconds)}</strong>
                    <span>活动用时</span>
                  </div>
                  <div>
                    <strong>{run.visited.length}</strong>
                    <span>探索房间</span>
                  </div>
                  <div>
                    <strong>{run.placed}</strong>
                    <span>放置标记</span>
                  </div>
                  <div>
                    <strong>{run.viewedMap ? 'B' : run.mode}</strong>
                    <span>完成模式</span>
                  </div>
                </div>
                <p className="fine">绕过的路，也成为你认识这里的方式。个人记录仅保存在此浏览器。</p>
                {level.id < levels.length && (
                  <button
                    className="primary"
                    onClick={() => prepare(level.id + 1, rehearsal.current)}
                  >
                    下一段归途 <span>→</span>
                  </button>
                )}
                <button onClick={() => show('levels')}>返回选关</button>
                <button className="quiet" onClick={() => prepare(level.id, rehearsal.current)}>
                  重游本关
                </button>
              </>
            )}
            {screen === 'error' && (
              <>
                <h2 id="dialog-title">暂时无法展开这段风景</h2>
                <p>{error}</p>
                <button className="primary" onClick={() => location.reload()}>
                  重新载入
                </button>
                <button
                  onClick={() => {
                    profile.current.settings.quality = 'low';
                    save();
                    location.reload();
                  }}
                >
                  切换轻量画质并重试
                </button>
              </>
            )}
          </section>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button aria-label="关闭提示" onClick={() => setNotice('')}>
            ×
          </button>
        </div>
      )}
    </main>
  );
}
