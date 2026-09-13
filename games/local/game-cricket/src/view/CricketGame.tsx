import type { GameHost } from '@coffeeeeffoc/game-contract';
import type { CricketContent } from '../content/schema.js';
import { createMatch } from '../domain/cricket.js';
import { useCricketGame } from './useCricketGame.js';
import { CricketSidebar } from './CricketSidebar.js';
import styles from '../styles.css?inline';
export type CricketGameProps = { host: GameHost; content: CricketContent; active: boolean };

export function CricketGame({ active }: CricketGameProps) {
  const {
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
  } = useCricketGame(active);
  return (
    <main
      className="cricket-game"
      ref={root}
      tabIndex={-1}
      aria-label="秋声斗蟋游戏"
      onKeyDown={(event) => {
        if (event.target instanceof HTMLButtonElement && event.code === 'Space') return;
        if (event.code === 'Space' || event.code === 'KeyD') event.preventDefault();
        if (event.repeat) return;
        if (event.code === 'Space') action('tease');
        if (event.code === 'KeyD') action('dodge');
        if (event.code === 'Escape') {
          if (help) setHelp(false);
          else setPaused((value) => !value);
        }
      }}
      onKeyUp={(event) => {
        if (event.target instanceof HTMLButtonElement) return;
        if (event.code === 'Space') {
          event.preventDefault();
          action('strike');
        }
      }}
    >
      <style>{styles}</style>
      <header className="cricket-header">
        <a
          className="cricket-brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            toggleHelp();
          }}
          aria-label="秋声斗蟋玩法说明"
        >
          <span className="cricket-seal">秋</span>
          <div>
            <h1>秋声斗蟋</h1>
            <p>一方斗盆，半夜江湖。</p>
          </div>
        </a>
        <div className="cricket-tools">
          <span className="cricket-live">茶馆夜场</span>
          <button
            onClick={toggleSound}
            aria-label={muted ? '开启声音' : '关闭声音'}
            aria-pressed={!muted}
          >
            {muted ? '声 ×' : '声 ≋'}
          </button>
          <button onClick={toggleHelp} aria-label="玩法说明" aria-expanded={help}>
            ？
          </button>
        </div>
      </header>
      <div className="cricket-layout">
        <section className="cricket-main" aria-label="斗盆与操作">
          <div className="cricket-matchline">
            <span>
              秋分 · 戌时 <i> / </i> 老槐茶馆
            </span>
            <span>第 {state.round + 1} / 3 擂</span>
          </div>
          <div
            className={`cricket-stage ${state.event === 'hurt' && state.impact > 0 ? 'is-hit' : ''}`}
          >
            <canvas
              ref={canvas}
              width={1000}
              height={720}
              aria-label="斗盆：按住撩拨，松手进攻；按 D 或收梗闪避"
              onPointerDown={press}
              onPointerMove={move}
              onPointerUp={() => action('strike')}
              onPointerCancel={() => action('cancel')}
              onLostPointerCapture={() => action('cancel')}
              onContextMenu={(e) => e.preventDefault()}
            />
            <div className="cricket-scoreboard">
              <div>
                <small>你的蛐蛐</small>
                <strong>青背</strong>
                <meter min="0" max="100" value={state.health} aria-label="青背斗志" />
                <span>斗志 {Math.ceil(state.health)}</span>
              </div>
              <div className={`cricket-clock ${state.time < 15 ? 'urgent' : ''}`}>
                <b>{Math.ceil(state.time).toString().padStart(2, '0')}</b>
                <small>秒</small>
              </div>
              <div className="cricket-enemy">
                <small>{opponent.owner}</small>
                <strong>{opponent.name}</strong>
                <meter
                  min="0"
                  max={opponent.health}
                  value={state.enemyHealth}
                  aria-label="对手斗志"
                />
                <span>斗志 {state.enemyHealth}</span>
              </div>
            </div>
            {state.phase === 'fighting' && !suspended && (
              <div className={`cricket-cue ${state.enemyPhase}`}>
                {state.enemyPhase === 'tell' ? (
                  <>
                    抬头张牙 <b>准备闪避</b>
                    <progress
                      max={opponent.tell}
                      value={opponent.tell - state.enemyClock}
                      aria-label="对手扑击倒计时"
                    />
                  </>
                ) : state.enemyPhase === 'recover' ? (
                  '侧身露破绽 · 反击！'
                ) : state.holding ? (
                  '轻撩触须 · 等金区松手'
                ) : (
                  '须尖相探 · 伺机而动'
                )}
              </div>
            )}
            {(state.phase === 'ready' || finished || suspended) && (
              <div className="cricket-overlay">
                <div className="cricket-intro">
                  <small>
                    {suspended ? '歇一口茶' : finished ? '落盆见分晓' : '今夜，谁是虫王'}
                  </small>
                  <h2>
                    {suspended
                      ? '对局已暂停'
                      : state.phase === 'won'
                        ? state.round === 2
                          ? '三擂全胜'
                          : '这一盆，漂亮！'
                        : state.phase === 'lost'
                          ? '胜败，再来一盆'
                          : '听声。观势。出手。'}
                  </h2>
                  <p>
                    {suspended
                      ? '时间与对手都已停住，准备好再继续。'
                      : finished
                        ? `命中 ${state.hits} 次 · 精准出击 ${state.perfects} 次 · 剩余斗志 ${Math.ceil(state.health)}`
                        : '按住草梗蓄势，金区松手出击。\n对手抬头时，看准时机收梗闪避。'}
                  </p>
                  {active && !hidden && (
                    <button
                      className="cricket-primary"
                      onClick={() => {
                        if (suspended) {
                          setPaused(false);
                          void unlockAudio();
                          root.current?.focus();
                        } else if (finished) {
                          update(
                            createMatch(
                              state.phase === 'won' && state.round < 2 ? state.round + 1 : 0,
                            ),
                          );
                        } else begin();
                      }}
                    >
                      {suspended
                        ? '继续斗蟋'
                        : state.phase === 'won' && state.round < 2
                          ? '迎战下一擂 →'
                          : finished
                            ? '重新上擂 →'
                            : '揭盖 · 开斗 →'}
                    </button>
                  )}
                  {!finished && !suspended && <em>首次点击后开启虫鸣与环境音</em>}
                </div>
              </div>
            )}
            <div className="cricket-stage-bottom">
              <span>青背入盆 · 不服就斗</span>
              <button
                onClick={() => setPaused(!paused)}
                disabled={state.phase !== 'fighting'}
                aria-label="暂停对局"
              >
                Ⅱ 暂停
              </button>
            </div>
          </div>
          <div className={`cricket-commentary ${state.event}`} role="status">
            <span>茶客</span>
            <p>{state.message}</p>
            <span className="cricket-sound-state">
              {muted ? '已静音' : audioReady ? '虫声已起' : '待开声'}
            </span>
          </div>
          <div className="cricket-console">
            <div className="cricket-energy">
              <span>
                气力 <b>{Math.floor(state.stamina)}</b>
              </span>
              <meter min="0" max="100" value={state.stamina} aria-label="气力" />
              <small>松手自然回气</small>
            </div>
            <div className="cricket-charge">
              <div>
                <span>撩拨火候</span>
                <small>
                  {state.charge > 0.82
                    ? '过火！'
                    : state.charge >= 0.55
                      ? '就是现在，松手！'
                      : '金区松手 · 咬合更狠'}
                </small>
              </div>
              <div className="cricket-charge-track">
                <i style={{ left: `${state.charge * 100}%` }} />
              </div>
              <div className="cricket-charge-labels">
                <span>试探</span>
                <span>恰好</span>
                <span>过火</span>
              </div>
            </div>
            <div className="cricket-actions">
              <button
                className={`cricket-tease ${state.holding ? 'holding' : ''}`}
                disabled={state.phase !== 'fighting' || suspended}
                onPointerDown={press}
                onPointerUp={() => action('strike')}
                onPointerCancel={() => action('cancel')}
                onLostPointerCapture={() => action('cancel')}
                onKeyDown={(e) => {
                  if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
                    e.preventDefault();
                    action('tease');
                  }
                }}
                onKeyUp={(e) => {
                  if (e.code === 'Space' || e.code === 'Enter') {
                    e.preventDefault();
                    action('strike');
                  }
                }}
                onContextMenu={(e) => e.preventDefault()}
              >
                <strong>{state.holding ? '松手 · 出击' : '按住 · 撩拨'}</strong>
                <small>空格 / 按住斗盆也可</small>
              </button>
              <button
                className="cricket-dodge"
                disabled={state.phase !== 'fighting' || suspended}
                onClick={() => action('dodge')}
              >
                <strong>收梗 · 闪避</strong>
                <small>D / 消耗 23 气力</small>
              </button>
            </div>
          </div>
        </section>
        <CricketSidebar round={state.round} help={help} onClose={() => setHelp(false)} />
      </div>
      <footer className="cricket-footer">
        <span>
          秋声斗蟋 <i> / </i> 草木有声，方寸有争
        </span>
        <span>耳机入席，更有秋意</span>
      </footer>
    </main>
  );
}
