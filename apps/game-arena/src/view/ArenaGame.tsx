import { useState } from 'react';
import type { GameHost } from '@coffeeeeffoc/game-contract';
import type { ArenaContent } from '../content/schema.js';
import { enemyFor, mutationOptions, cricketBuilds } from '../domain/index.js';
import { useArenaGame } from './useArenaGame.js';
import { useArenaScene } from './useArenaScene.js';
import '../styles.css';

export type ArenaGameProps = {
  host: GameHost;
  content: ArenaContent;
  active: boolean;
  random?: () => number;
};

export function ArenaGame({ host, content, active, random = Math.random }: ArenaGameProps) {
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const game = useArenaGame(host, content, active && !paused, random);
  const { state } = game;
  const duel = state.duel;
  const { canvas, audio, holdButton } = useArenaScene(
    duel,
    game.ready,
    active,
    paused,
    muted,
    state.phase === 'battle',
    setPaused,
    game.control,
  );
  const creature = state.creature;
  const enemy = creature ? enemyFor(content, creature, state.tier) : null;
  const options = creature
    ? mutationOptions(content, creature.attack + state.pickRound + state.tier)
    : [];

  if (!game.ready) return <main className="arena arena-loading">正在读取联赛档案…</main>;
  return (
    <main className="arena" data-phase={state.phase}>
      <div inert={!active || paused}>
        <header className="arena-header">
          <div className="arena-brand">
            <span className="arena-seal">
              秋<br />斗
            </span>
            <div>
              <h1>秋夜斗蛐蛐</h1>
            </div>
          </div>
          <div className="arena-tools">
            <button
              aria-label={muted ? '开启声音' : '关闭声音'}
              aria-pressed={!muted}
              onClick={() => {
                audio.current?.unlock();
                setMuted(!muted);
              }}
            >
              {muted ? '声 ×' : '声 ≋'}
            </button>
            <button aria-label="暂停游戏" onClick={() => setPaused(true)}>
              Ⅱ
            </button>
          </div>
        </header>
        <nav className="arena-leagues" aria-label="联赛进度">
          {content.ranks.map((rank, i) => (
            <span
              key={rank}
              className={i === state.tier ? 'current' : i < state.tier ? 'passed' : ''}
            >
              <i>{i < state.tier ? '✓' : `0${i + 1}`}</i>
              {rank}
            </span>
          ))}
        </nav>
        <section
          className={`arena-stage ${duel?.windup ? 'danger' : ''}`}
          aria-label="暖灯下的陶盆斗场"
        >
          <canvas ref={canvas} aria-label="两只蟋蟀在陶盆中对峙；战况和操作在下方显示" />
          <div className="arena-scoreboard">
            <div>
              <small>我方 · {creature?.traits.length ?? 0} 次调养</small>
              <b>{creature?.species ?? '青背将军'}</b>
              <meter
                aria-label="我方斗志"
                min={0}
                max={duel?.maxHp ?? 100}
                value={duel?.hp ?? 100}
              />
            </div>
            <span className="arena-clock">
              {duel ? `${Math.max(0, Math.ceil(60 - duel.time))}″` : '候场'}
              <small>{duel ? '本局限时' : '秋夜 · 宜斗'}</small>
            </span>
            <div className="arena-rival">
              <small>对手 · 第 {state.tier + 1} 擂</small>
              <b>{enemy?.species ?? content.rivals[0][0]}</b>
              <meter
                aria-label="对手斗志"
                min={0}
                max={duel?.enemyMaxHp ?? 100}
                value={duel?.enemyHp ?? 100}
              />
            </div>
          </div>
          {duel?.windup && state.phase === 'battle' ? (
            <div className="arena-warning">对手抬头 · 准备闪避</div>
          ) : null}
          <div className="arena-scene-caption">
            <span>
              {state.phase === 'battle'
                ? `命中 ${duel?.hits} · 闪避 ${duel?.parries}`
                : '提笼赴约，听虫而战'}
            </span>
          </div>
        </section>
        <div className="arena-controls">
          {state.phase === 'egg' && (
            <section className="arena-intro">
              <div>
                <h2>不是看它打。是陪它赢。</h2>
                <p>按住拨草蓄势，松手扑咬；看对手抬头，闪身反击。</p>
              </div>
              <div className="arena-picks">
                {content.species.map(([name], i) => (
                  <button
                    key={name}
                    onClick={() => {
                      audio.current?.unlock();
                      audio.current?.play('rustle');
                      game.hatch((i + 0.2) / content.species.length);
                    }}
                  >
                    <small>{cricketBuilds[i % cricketBuilds.length].style}</small>
                    <b>{name}</b>
                    <span>提笼入场 ↗</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {state.phase === 'mutate' && (
            <section className="arena-prep">
              <div className="arena-section-title">
                <h2>入盆前，养一口气</h2>
                <span>还可调养 {state.mutationsLeft} 次</span>
              </div>
              <div className="arena-traits">
                {options.map((trait) => (
                  <button
                    key={trait.name}
                    onClick={() => {
                      audio.current?.play('rustle');
                      game.pick(trait);
                    }}
                  >
                    <i>{trait.icon}</i>
                    <div>
                      <b>{trait.name}</b>
                      <small>{trait.desc}</small>
                      <span>
                        咬力 {trait.attack >= 0 ? '+' : ''}
                        {trait.attack} · 斗志 {trait.hp >= 0 ? '+' : ''}
                        {trait.hp}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
          {state.phase === 'ready' && (
            <section className="arena-ready">
              <div>
                <small>{creature?.traits.map((t) => t.name).join(' · ')}</small>
                <h2>草梗在手，开盆见真章。</h2>
                <p>蓄势到金色区松手最有力。对手抬头约半秒后，按闪避。</p>
              </div>
              <button
                className="arena-primary"
                onClick={() => {
                  audio.current?.unlock();
                  game.battle();
                }}
              >
                开盆，迎战！
                <span>
                  第 {state.tier + 1} 擂 · {content.ranks[state.tier]}
                </span>
              </button>
            </section>
          )}
          {state.phase === 'battle' && duel && (
            <section className="arena-live">
              <p className={`arena-comment ${duel.cue}`} role="status" aria-live="polite">
                {duel.message}
              </p>
              <div className="arena-gauges">
                <label>
                  体力 <progress aria-label="体力" max={100} value={duel.stamina} />
                  <b>{Math.round(duel.stamina)}</b>
                </label>
                <label>
                  蓄势{' '}
                  <span className="arena-charge">
                    <span className="sweet-zone" />
                    <i style={{ left: `${Math.min(100, (duel.charge / 1.6) * 100)}%` }} />
                  </span>
                  <b>{duel.charge > 1.05 ? '过火' : duel.charge >= 0.55 ? '松手！' : '轻拨'}</b>
                </label>
              </div>
              <div className="arena-actions">
                <button
                  className={`arena-tease ${duel.holding ? 'held' : ''}`}
                  {...holdButton('tease')}
                  aria-pressed={duel.holding}
                >
                  <b>拨草 · 松手扑咬</b>
                  <small>按住蓄势 / 空格</small>
                </button>
                <button
                  onClick={() => {
                    audio.current?.unlock();
                    game.control('dodge');
                  }}
                  disabled={duel.stamina < 20 || duel.cooldown > 0}
                  className={duel.dodge > 0 ? 'held' : ''}
                >
                  <b>闪身避锋</b>
                  <small>消耗 20 / A</small>
                </button>
                <button
                  {...holdButton('rest')}
                  aria-pressed={duel.resting}
                  className={duel.resting ? 'held' : ''}
                >
                  <b>收势回气</b>
                  <small>按住恢复 / S</small>
                </button>
              </div>
            </section>
          )}
          {state.phase === 'result' && (
            <section
              className={`arena-result ${state.win ? 'win' : 'lose'}`}
              aria-labelledby="arena-result-title"
            >
              <div>
                <small>{state.win ? '鸣翅报捷' : '胜败寻常，再赴一盆'}</small>
                <h2 id="arena-result-title">
                  {state.win
                    ? state.tier === 4
                      ? '五擂全胜，今夜虫王！'
                      : '对手退须，你赢了。'
                    : '这一盆，先收虫。'}
                </h2>
                <p>
                  命中 {duel?.hits} 次 · 精准闪避 {duel?.parries} 次 ·{' '}
                  {state.win ? `赢得 ${12 + state.tier * 6} 游戏币` : '等对手出招后，再蓄势反击。'}
                </p>
              </div>
              <div className="arena-result-actions">
                <button className="arena-primary" disabled={game.rewardPending} onClick={game.next}>
                  {state.win ? (state.tier < 4 ? '调养，赴下一擂' : '再赴一场秋斗') : '重新挑虫'}
                </button>
                {!state.win && host.session.capabilities.includes('advertising') && (
                  <button disabled={game.rewardPending} onClick={() => void game.reward()}>
                    {game.rewardPending ? '处理中…' : '赛后调养 · 奖励机会'}
                  </button>
                )}
              </div>
            </section>
          )}
        </div>
        <footer className="arena-footer">
          <span>一草一虫，一进一退。</span>
          <span>
            胜场 {game.save.arenaWins} · 游戏币 {game.save.coins}
          </span>
        </footer>
      </div>
      {(!active || paused) && (
        <div className="arena-pause" role="dialog" aria-modal="true" aria-label="游戏已暂停">
          <span className="arena-seal">歇</span>
          <h2>先歇一会，虫也歇一会。</h2>
          <button
            className="arena-primary"
            disabled={!active}
            onClick={() => {
              audio.current?.unlock();
              setPaused(false);
            }}
          >
            准备好了，继续
          </button>
        </div>
      )}
    </main>
  );
}
