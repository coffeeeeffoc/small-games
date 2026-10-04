import '../dev-mode.js';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WEAPONS } from './content/levels.ts';
import { supplyPosition } from './core/geometry.ts';
import { estimatedDps } from './core/rewards.ts';
import { HZ, PLAYER_Z } from './core/types.ts';
import { Runtime } from './client/runtime.ts';
import { storage, type RecordEntry } from './client/platform.ts';
import './style.css';
declare global {
  interface Window {
    urbanSnapshot?: () => ReturnType<Runtime['inspect']>;
  }
}
function App() {
  const scene = useRef<HTMLDivElement>(null),
    zone = useRef<HTMLDivElement>(null),
    runtime = useRef<Runtime | null>(null),
    stage = useRef<HTMLDivElement>(null);
  const [, update] = useState(0),
    [error, setError] = useState(''),
    [panel, setPanel] = useState<'records' | 'roadmap' | null>(null),
    [debug, setDebug] = useState(window.SmallGamesDev.isEnabled());
  const [notice, setNotice] = useState('');
  useEffect(() => {
    try {
      const r = new Runtime(scene.current!, zone.current!, () => update((n) => n + 1));
      runtime.current = r;
      window.urbanSnapshot = () => r.inspect();
      update((n) => n + 1);
      return () => {
        r.dispose();
        delete window.urbanSnapshot;
      };
    } catch (e) {
      setError(`三维画面启动失败：${String(e)}。请使用支持 WebGL 2 的浏览器。`);
    }
  }, []);
  const r = runtime.current,
    s = r?.state;
  const playing = Boolean(r?.started && s?.phase === 'playing'),
    inBattle = Boolean(r?.started);
  const alive = s?.members.filter((m) => m.hp > 0) ?? [],
    hp = alive.reduce((n, m) => n + m.hp, 0);
  const nearest = s
    ? Math.min(99, ...s.enemies.filter((e) => e.kind !== 'boss').map((e) => PLAYER_Z - e.z))
    : 99;
  const boss = s?.enemies.find((e) => e.kind === 'boss');
  const hurt = s?.effects.findLast((e) => e.kind === 'hurt' && s.tick - e.tick < 7);
  const streak =
    s?.effects.filter((e) => e.kind === 'death' && s.tick - e.tick >= 7 && s.tick - e.tick < 52) ??
    [];
  const active = s?.supplies.filter((x) => x.status === 'active') ?? [];
  const lastToast = s?.effects
    .filter(
      (e) =>
        e.label && ['reward', 'hurt', 'warning', 'blast'].includes(e.kind) && s.tick - e.tick < 55,
    )
    .at(-1);
  const start = () => {
    setPanel(null);
    setNotice('');
    r?.start();
  };
  const time = s ? Math.max(0, Math.ceil((s.level.duration - s.tick) / HZ)) : 90;
  const help =
    !s || s.tick < 6 * HZ
      ? '左右拖动小队，自动射击正前方'
      : s.tick < 15 * HZ
        ? '进入左侧金色瞄准带，打满武器柜门槛'
        : s.tick < 25 * HZ
          ? '榴弹能清理密集敌群，奖励已经改变火力'
          : s.tick < 34 * HZ
            ? '冲刺者接近时，离开金色带回防'
            : s.tick < 46 * HZ
              ? '救援与霰弹共用电源：只可选择一边'
              : s.tick < 55 * HZ
                ? '阵型已解锁：收拢站位 / 展开覆盖'
                : s.tick < 66 * HZ
                  ? '三档箱：每档立即领取，不必冒险追满'
                  : s.tick < 77 * HZ
                    ? 'Boss 红色预警出现后，横移躲避'
                    : '攻击左侧吊架控制器，砸落重物破甲';
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (stage.current?.requestFullscreen) await stage.current.requestFullscreen();
      else setNotice('当前浏览器未提供全屏接口');
    } catch {
      setNotice('全屏未获浏览器允许，可继续游玩');
    }
  };
  return (
    <main className={inBattle ? 'app in-battle' : 'app'}>
      <aside className="desktop-brand">
        <span className="edition">FIELD OPERATIONS / 001</span>
        <h1>
          街区
          <br />
          <em>突围</em>
          <i>↗</i>
        </h1>
        <p>URBAN BREAKOUT</p>
        <div className="brand-rule" />
        <blockquote>
          守住这条街，
          <br />
          还有更多的人。
        </blockquote>
        <span className="small-print">
          原创 3D 战斗 · 老街实战样板
          <br />
          本地练习 / P1
        </span>
      </aside>
      <section
        ref={stage}
        className="stage"
        data-phase={s?.phase ?? 'loading'}
        data-playing={playing && !r?.paused ? 'true' : 'false'}
      >
        <div ref={scene} className="scene" />
        <div className="vignette" />
        <div
          ref={zone}
          id="control-zone"
          aria-label="左右拖动控制小队"
          role="application"
          tabIndex={0}
        >
          <div className="drag-guide">
            <span>‹</span>
            <i />
            <b>拖动 · 横向移动</b>
            <i />
            <span>›</span>
          </div>
        </div>
        {inBattle && s && (
          <>
            <header className="hud">
              <div className="hud-top">
                <div>
                  <span className="eyebrow">榕树街 · 离线练习</span>
                  <strong>
                    老街突围 <span>01</span>
                  </strong>
                </div>
                <span className="timer">
                  {String(Math.floor(time / 60)).padStart(2, '0')}
                  <small>:</small>
                  {String(time % 60).padStart(2, '0')}
                </span>
                <button
                  id="pause"
                  className="icon-btn"
                  aria-label="暂停"
                  onClick={() => r?.pause(true)}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <rect x="5" y="4" width="5" height="16" rx="1" />
                    <rect x="14" y="4" width="5" height="16" rx="1" />
                  </svg>
                </button>
              </div>
              <div className="route">
                <i style={{ width: `${(s.tick / s.level.duration) * 100}%` }} />
                <span>前进中</span>
                <span>街口撤离</span>
              </div>
              <div className="squad-status">
                <strong>
                  {alive.length}
                  <small> / 12 人</small>
                </strong>
                <div className="hp-track" aria-label={`小队生命 ${hp}`}>
                  <i style={{ width: `${(hp / Math.max(1, alive.length * 20)) * 100}%` }} />
                </div>
                <span>{hp} HP</span>
                {s.shield > 0 && <b className="shield">◇ {s.shield}</b>}
              </div>
            </header>
            <div className={`focus-status ${s.focus ? 'on' : nearest < 7 ? 'danger' : ''}`}>
              {s.focus
                ? '攻击补给中，正面火力已停止'
                : nearest < 7
                  ? '！正面告急 · 先清理近身敌人'
                  : '↑ 正面自动射击'}
            </div>
            {boss && (
              <div className="boss-bar">
                <span>
                  街口冲撞者 <b>{boss.armorUntil > s.tick ? '已破甲' : '重甲'}</b>
                </span>
                <div>
                  <i style={{ width: `${(boss.hp / boss.maxHp) * 100}%` }} />
                </div>
              </div>
            )}
            <div className="supply-layer">
              {active.map((box) => {
                const p = supplyPosition(box, s.tick),
                  screen = r!.scene.project(p.x, p.z, 1.55),
                  next = box.config.tiers[box.claimed],
                  left = (box.config.end - s.tick) / HZ;
                const dps = estimatedDps(s, box),
                  missing = next ? Math.max(0, next.damage - box.damage) : 0;
                return (
                  <article
                    key={box.config.id}
                    className={`supply-card ${s.focus === box.config.id ? 'locked' : ''} ${left < 2 ? 'closing' : ''}`}
                    data-supply={box.config.id}
                    style={{
                      [box.config.side === -1 ? 'left' : 'right']: '2.5%',
                      top: `${screen.y}px`,
                    }}
                  >
                    <span className="box-caption">
                      {box.config.tiers.length > 1
                        ? '▥ 阶梯补给'
                        : box.config.group
                          ? '⛓ 二选一装置'
                          : '▣ 限时补给'}{' '}
                      <b>{left.toFixed(1)}s</b>
                    </span>
                    <div className="box-reward">
                      <strong>{next?.label}</strong>
                      <span>{box.config.name}</span>
                    </div>
                    <div className="box-progress">
                      <div className="box-count">
                        <b>
                          {Math.floor(box.damage)} / {next?.damage}
                        </b>
                        <span>{dps ? `约 ${(missing / dps).toFixed(1)} 秒` : '当前无法攻击'}</span>
                      </div>
                      <div
                        className="box-track"
                        role="progressbar"
                        aria-label={`${box.config.name}有效伤害`}
                        aria-valuenow={Math.floor(box.damage)}
                        aria-valuemin={0}
                        aria-valuemax={next?.damage}
                      >
                        <i style={{ width: `${(box.damage / (next?.damage ?? 1)) * 100}%` }} />
                      </div>
                    </div>
                    <small>
                      {box.claimed
                        ? `已获得 ${box.claimed} 档 · 下档差 ${Math.ceil(missing)}`
                        : s.focus === box.config.id
                          ? '火力投入中 · 留意正面'
                          : '移入同侧金色带攻击'}
                    </small>
                  </article>
                );
              })}
            </div>
            <div className="battle-bottom">
              <div className="weapon-readout">
                <span>当前装备</span>
                <strong>
                  {Object.entries(WEAPONS).map(([id, w]) => {
                    const count = alive.filter((m) => m.weapon === id).length;
                    return count ? (
                      <i key={id}>
                        {w.name} ×{count}
                      </i>
                    ) : null;
                  })}
                </strong>
              </div>
              <div className="ability-row">
                <button
                  id="formation"
                  disabled={s.tick < 46 * HZ}
                  onClick={() => {
                    if (r) r.input.formation = true;
                  }}
                >
                  <span>⠿</span>
                  <b>
                    {s.tick < 46 * HZ
                      ? '阵型未解锁'
                      : s.formation === 'wide'
                        ? '展开 → 收拢'
                        : '收拢 → 展开'}
                  </b>
                  <small>F</small>
                </button>
                <button
                  id="skill"
                  className="skill"
                  disabled={s.skillReady > s.tick}
                  onClick={() => {
                    if (r) r.input.skill = true;
                  }}
                >
                  <span>✦</span>
                  <b>
                    {s.skillReady > s.tick
                      ? `冷却 ${Math.ceil((s.skillReady - s.tick) / HZ)} 秒`
                      : '震荡清场'}
                  </b>
                  <small>空格</small>
                </button>
              </div>
              <p className="field-tip">{help}</p>
            </div>
            {lastToast && (
              <div className={`toast ${lastToast.kind}`} key={lastToast.id}>
                {lastToast.label}
              </div>
            )}
            {hurt && <div className="combat-edge" aria-hidden="true" />}
            {streak.length >= 3 && !lastToast && (
              <div className="kill-chain" key={streak.at(-1)!.id} aria-live="polite">
                <strong>{streak.length}</strong>
                <span>连续击退</span>
              </div>
            )}
            {debug && (
              <pre
                className="debug"
                data-testid="debug"
              >{`tick ${s.tick} / ${s.level.duration}\n前向 DPS ${s.focus ? 0 : estimatedDps(s).toFixed(1)}\n补给 DPS ${
                s.focus
                  ? estimatedDps(
                      s,
                      active.find((b) => b.config.id === s.focus),
                    ).toFixed(1)
                  : 0
              }\n最近敌人 ${nearest.toFixed(1)} m\n补给剩余 ${active.map((b) => Math.ceil((b.config.tiers[b.claimed]?.damage ?? b.damage) - b.damage)).join(' / ') || '—'}\n领取 ${s.grants.map((g) => g.id).join(', ') || '无'}\n${r!.scene.renderer.info.render.calls} draw calls`}</pre>
            )}
          </>
        )}
        {!inBattle && (
          <div className="start-screen">
            <div className="start-top">
              <span className="rescue-mark">＋</span>
              <span>
                街区救援行动
                <br />
                <b>URBAN BREAKOUT</b>
              </span>
              <button className="icon-btn" onClick={fullscreen} aria-label="全屏">
                ⛶
              </button>
            </div>
            <div className="start-title">
              <span>第一章 / 老街救援</span>
              <h2>街区突围</h2>
              <p>你的火力，决定谁能突围。</p>
            </div>
            <div className="start-bottom">
              <div className="mission-strip">
                <strong>
                  90<span>秒</span>
                </strong>
                <p>
                  自动射击 · 横移躲避
                  <br />
                  <b>转火开箱时，正面无人掩护。</b>
                </p>
              </div>
              <button className="primary" id="start" onClick={start} disabled={!r}>
                开始突围 <span>↗</span>
              </button>
              <div className="start-links">
                <button onClick={() => setPanel('records')}>本机战绩</button>
                <button onClick={() => setPanel('roadmap')}>版本进度</button>
                <button
                  onClick={() => {
                    if (r) {
                      r.sound.muted = !r.sound.muted;
                      update((n) => n + 1);
                    }
                  }}
                >
                  {r?.sound.muted ? '声音已关' : '声音已开'}
                </button>
              </div>
              <p className="build-label">P1 核心样板 · 好友联机与全区榜尚未开放</p>
            </div>
          </div>
        )}
        {r?.paused && playing && (
          <div className="modal">
            <section role="dialog" aria-modal="true" aria-label="暂停菜单">
              <span className="eyebrow">LOCAL PRACTICE</span>
              <h2>暂歇片刻</h2>
              <p>
                离线练习已暂停。
                <br />
                保持拖动只需一根手指。
              </p>
              <button className="primary" id="resume" onClick={() => r.pause(false)}>
                继续突围 →
              </button>
              <div className="menu-grid">
                <button onClick={start}>重新开始</button>
                <button onClick={() => r.menu()}>返回选关</button>
                <button
                  onClick={() => {
                    r.sound.muted = !r.sound.muted;
                    update((n) => n + 1);
                  }}
                >
                  {r.sound.muted ? '打开声音' : '关闭声音'}
                </button>
                <button
                  onClick={() => {
                    r.shake = !r.shake;
                    storage.write('shake', r.shake);
                    update((n) => n + 1);
                  }}
                >
                  {r.shake ? '关闭震屏' : '打开震屏'}
                </button>
                {window.SmallGamesDev.isEnabled() && <button onClick={() => setDebug(!debug)}>{debug ? '关闭调试' : '调试面板'}</button>}
              </div>
              <div className="audio-settings">
                {(['music', 'sfx'] as const).map((bus) => (
                  <label key={bus}>
                    <span>{bus === 'music' ? '背景音乐' : '战斗音效'}</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      aria-label={bus === 'music' ? '背景音乐音量' : '战斗音效音量'}
                      value={Math.round(
                        (bus === 'music' ? r.sound.musicVolume : r.sound.sfxVolume) * 100,
                      )}
                      onChange={(e) => {
                        r.sound.setVolume(bus, Number(e.target.value) / 100);
                        update((n) => n + 1);
                      }}
                    />
                    <output>
                      {Math.round(
                        (bus === 'music' ? r.sound.musicVolume : r.sound.sfxVolume) * 100,
                      )}
                      %
                    </output>
                  </label>
                ))}
              </div>
            </section>
          </div>
        )}
        {s && r?.started && s.phase !== 'playing' && (
          <div className="modal result">
            <section role="dialog" aria-modal="true" aria-label="战斗结算">
              <span className="eyebrow">FIELD REPORT / 001</span>
              <div className="result-mark">{s.phase === 'won' ? '↗' : '×'}</div>
              <h2>{s.phase === 'won' ? '成功突围' : '防线失守'}</h2>
              <p>{s.reason}</p>
              <div className="result-stats">
                <div>
                  <strong>{s.stats.kills}</strong>
                  <span>击退感染体</span>
                </div>
                <div>
                  <strong>{s.grants.length}</strong>
                  <span>获得补给档位</span>
                </div>
                <div>
                  <strong>{alive.length}</strong>
                  <span>存活队员</span>
                </div>
              </div>
              <p className="score">
                练习得分 <b>{s.stats.score}</b>
                <small>仅保存在本机，不计入全区榜</small>
              </p>
              <button className="primary" id="retry" onClick={start}>
                再次突围 ↗
              </button>
              <button className="text-btn" onClick={() => r.menu()}>
                返回选关
              </button>
            </section>
          </div>
        )}
        {panel && (
          <div className="modal">
            <section
              role="dialog"
              aria-modal="true"
              aria-label={panel === 'records' ? '本机战绩' : '版本进度'}
            >
              <span className="eyebrow">URBAN BREAKOUT / P1</span>
              <h2>{panel === 'records' ? '本机战绩' : '当前可玩内容'}</h2>
              {panel === 'records' ? (
                <>
                  <p>本地练习记录，不是全区排行榜。</p>
                  <div className="record-list">
                    {(() => {
                      const entries = storage.read<RecordEntry[]>('records', []);
                      return Array.isArray(entries) && entries.length ? (
                        entries.slice(0, 6).map((v, i) => (
                          <div key={i}>
                            <span>
                              {v.won ? '成功突围' : '防线失守'} · {v.survivors} 人
                            </span>
                            <b>{v.score}</b>
                          </div>
                        ))
                      ) : (
                        <p>尚无战绩，开始第一次突围。</p>
                      );
                    })()}
                  </div>
                </>
              ) : (
                <p>
                  已开放：90 秒老街核心实战，三种武器，救援取舍，三档补给和街口 Boss。
                  <br />
                  <br />
                  后续阶段：真实双人合作、同种子竞速、服务端排行榜、四章 24
                  关。当前版本尚未实现这些功能。
                </p>
              )}
              <button className="primary" onClick={() => setPanel(null)}>
                返回
              </button>
            </section>
          </div>
        )}
        {(error || notice) && (
          <div className="error" role="alert">
            {error || notice}
            <button onClick={() => setNotice('')}>关闭提示</button>
          </div>
        )}
      </section>
      <aside className="desktop-note">
        <div className="note-number">
          01<span>/ 24 PLANNED</span>
        </div>
        <h3>
          榕树街
          <br />
          救援行动
        </h3>
        <p>
          前方是尸潮，
          <br />
          街角是希望。
          <br />
          把火力留给哪一边？
        </p>
        <div className="key-notes">
          <p>
            <kbd>A</kbd>
            <kbd>D</kbd> 横向移动
          </p>
          <p>
            <kbd>SPACE</kbd> 震荡清场
          </p>
          <p>
            <kbd>F</kbd> 切换阵型
          </p>
          <p>
            <kbd>ESC</kbd> 暂停
          </p>
        </div>
        <small>
          原创程序化几何与音效
          <br />
          无需登录 · 即刻开战
        </small>
      </aside>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
