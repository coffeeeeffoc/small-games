import type { GameHost } from '@coffeeeeffoc/game-contract';
import { SCENES } from '../week.js';
import { targetInReach, WORLD } from './model.js';
import { useOfficeRuntime } from './useOfficeRuntime.js';
import { WeekPlanner } from './WeekPlanner.js';
import './office.css';

export function OfficeGame({
  host,
  active,
  seed = 20260912,
}: {
  host: GameHost;
  active: boolean;
  seed?: number;
}) {
  const {
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
  } = useOfficeRuntime(host, active, seed);
  const { state } = view,
    target = targetInReach(state);
  const start = () => {
    closeSchedule();
    runtime.current?.action('start');
    canvas.current?.focus();
  };
  return (
    <main ref={root} className="office-fp" aria-label="打工人摸鱼记 · 第一人称办公室">
      <canvas
        ref={canvas}
        className="office-viewport"
        tabIndex={0}
        aria-label="第一人称办公室。WASD移动，方向键或拖动环顾，C蹲下，E操作，Esc暂停。触屏左下拖动移动，右侧拖动环顾。"
      />
      <div className="office-grain" />
      <header className="office-topbar">
        <button className="office-wordmark" onClick={showSchedule} aria-label="打开一周场景表">
          <span className="office-mark">闲</span>
          <span>
            打工人摸鱼记<small>OFFICE HOURS</small>
          </span>
        </button>
        <div className="office-session">
          <i /> MON <span>09:{String(8 + Math.floor(state.elapsed / 60)).padStart(2, '0')}</span>
          <small>周一 · 晴</small>
        </div>
        <nav aria-label="游戏设置">
          <button title="开启或关闭声音" onClick={() => runtime.current?.action('sound')}>
            {view.sound ? '声音 开' : '声音 关'}
          </button>
          <button onClick={() => void toggleGyro()} aria-pressed={gyro}>
            {gyro ? '体感 开' : '体感视角'}
          </button>
          {typeof document !== 'undefined' && document.fullscreenEnabled && (
            <button
              onClick={() => {
                void (
                  fullscreen ? document.exitFullscreen() : root.current?.requestFullscreen()
                )?.catch(() => setSensorNote('无法进入全屏，仍可继续游玩'));
              }}
            >
              {fullscreen ? '退出全屏' : '全屏'}
            </button>
          )}
          {state.status === 'playing' && (
            <button onClick={() => runtime.current?.action('pause')}>暂停</button>
          )}
        </nav>
      </header>
      {sensorNote && (
        <button className="office-sensor-note" onClick={() => setSensorNote('')}>
          {sensorNote} ×
        </button>
      )}
      {!schedule && state.status === 'playing' && (
        <>
          <aside className="office-objective">
            <small>今日第一件小事 / 01</small>
            <h2>别让老板发现你迟到了。</h2>
            <p>去右后方亮着的电脑前，坐下打卡。</p>
            <div className="office-objective-meta">
              <span>{state.holdingFile ? '▤ 文件在手' : '○ 可以拿文件伪装'}</span>
              <span>{state.coffeeTaken ? '☕ 咖啡到手 +75' : '可选：顺一杯咖啡'}</span>
            </div>
          </aside>
          <aside className={`office-risk ${state.boss.visible ? 'is-visible' : ''}`}>
            <div>
              <span>
                {state.boss.visible
                  ? '老板正在看你'
                  : state.distractionLeft > 0
                    ? '打印声引开了老板'
                    : '留意老板脚步'}
              </span>
              <strong>
                {Math.round(state.suspicion)}
                <small>%</small>
              </strong>
            </div>
            <progress max={100} value={state.suspicion} aria-label="老板怀疑程度" />
            <p>
              {state.crouched ? '蹲行 · 屏风后更隐蔽' : '站立 · 走路更快'}
              <span>{Math.ceil(WORLD.timeLimit - state.elapsed)}s</span>
            </p>
          </aside>
          <div className="office-world-caption" aria-live="polite">
            {state.feedback}
          </div>
          <div className="office-joystick" aria-hidden="true">
            <span>↑</span>
            <div>
              ←<i />→
            </div>
            <span>↓</span>
            <small>拖动 · 移动</small>
          </div>
          <div className="office-look-hint">
            右侧拖动环顾 <span> / WASD 移动 · 方向键转头</span>
          </div>
          <div className="office-interactions">
            <button
              className={state.crouched ? 'is-on' : ''}
              onClick={() => runtime.current?.action('crouch')}
            >
              {state.crouched ? '站起来' : '蹲下'}
              <kbd>C</kbd>
            </button>
            <button
              className="office-interact"
              disabled={!target}
              onClick={() => runtime.current?.action('interact')}
            >
              {target?.label ?? '靠近并看向物品'}
              <kbd>E</kbd>
            </button>
          </div>
          {target && (
            <div className="office-target-label">
              {target.label}
              <small>
                {target.kind === 'printer'
                  ? `引开老板 12 秒${state.printerCooldown > 0 ? ' · 正在冷却' : ''}`
                  : target.kind === 'files'
                    ? '像在工作一样经过'
                    : target.kind === 'computer'
                      ? '终于能装作早就到了'
                      : '多绕一步，多赚一点快乐'}
              </small>
            </div>
          )}
        </>
      )}
      {!schedule && state.status === 'ready' && (
        <section className="office-intro office-panel">
          <div className="office-eyebrow">一周很长，先偷回这一分钟。</div>
          <p className="office-chapter">MONDAY / 01</p>
          <h1>
            迟到的
            <br />
            <em>最后一分钟。</em>
          </h1>
          <p className="office-lede">
            09:08，老板已经在办公室。
            <br />
            你离“早就到了”，只差一张工位。
          </p>
          <div className="office-brief">
            <span>观察巡逻</span>
            <i>→</i>
            <span>借掩体潜入</span>
            <i>→</i>
            <span>坐下打卡</span>
          </div>
          <button className="office-primary" onClick={start}>
            悄悄进入办公室 <span>↗</span>
          </button>
          <button className="office-text-button" onClick={showSchedule}>
            看看这一周，还有哪些空子可钻 →
          </button>
          <p className="office-instructions">
            左下拖动移动 · 右侧拖动环顾 · 靠近物品后操作
            <br />
            电脑：WASD 移动 / 方向键转头 / E 操作 / C 蹲下
          </p>
        </section>
      )}
      {!schedule && (state.status === 'paused' || view.hostPaused) && state.status !== 'ready' && (
        <section className="office-result office-panel">
          <small>TAKE A BREATH</small>
          <h1>先缓一口气。</h1>
          <p>老板和时钟都在等你回来。</p>
          <button
            className="office-primary"
            disabled={view.hostPaused}
            onClick={() => {
              runtime.current?.action('resume');
              canvas.current?.focus();
            }}
          >
            继续潜入 →
          </button>
          <button className="office-text-button" onClick={showSchedule}>
            打开一周场景表
          </button>
        </section>
      )}
      {!schedule && (state.status === 'won' || state.status === 'lost') && !view.hostPaused && (
        <section className="office-result office-panel">
          <small>{state.status === 'won' ? 'QUIETLY, YOU MADE IT.' : 'ONE MORE TRY.'}</small>
          <h1>{state.status === 'won' ? '有惊无险，坐下了。' : '“你才刚来？”'}</h1>
          <p>{state.feedback}</p>
          {state.status === 'won' ? (
            <div className="office-score">
              <strong>
                {state.score}
                <small>潜入得分</small>
              </strong>
              <span>
                {Math.round(state.elapsed)} 秒抵达
                <br />
                {state.coffeeTaken ? '还顺走了一杯咖啡' : '下次试试顺走一杯咖啡'}
                <br />
                最佳 {view.best}
              </span>
            </div>
          ) : (
            <p className="office-lede">
              先看老板朝哪边。蹲在屏风后等一等，
              <br />
              或者让打印机替你吸引注意。
            </p>
          )}
          <button className="office-primary" onClick={() => runtime.current?.action('retry')}>
            再试一条路线 ↗
          </button>
          <button className="office-text-button" onClick={showSchedule}>
            查看之后的日程 →
          </button>
          <p className="office-save-status">
            {view.saving}
            {view.saving.includes('重试') && (
              <button onClick={() => void runtime.current?.retrySave()}>重试保存</button>
            )}
          </p>
        </section>
      )}
      <WeekPlanner
        seed={seed}
        open={schedule}
        onClose={closeSchedule}
        onNewWeek={(next) => runtime.current?.newWeek(next)}
        onPlay={(next) => {
          runtime.current?.newWeek(next);
          closeSchedule();
        }}
      />
      {error && (
        <div role="alert" className="office-error">
          {error}
        </div>
      )}
      {!schedule && state.status === 'ready' && (
        <footer className="office-bottom-note">
          <span>第一人称 · 可移动办公室</span>
          <span>01 / {SCENES.length} SCENES</span>
        </footer>
      )}
    </main>
  );
}
