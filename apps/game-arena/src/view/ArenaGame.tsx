import type { GameHost } from '@coffeeeeffoc/game-contract';
import type { ArenaContent } from '../content/schema.js';
import { enemyFor, mutationOptions, power } from '../domain/index.js';
import { useArenaGame } from './useArenaGame.js';

/** Host-controlled properties for the arena React view. */
export type ArenaGameProps = {
  host: GameHost;
  content: ArenaContent;
  active: boolean;
  random?: () => number;
};
/** Five-league mutation and automatic-battle view. */
export function ArenaGame({ host, content, active, random = Math.random }: ArenaGameProps) {
  const game = useArenaGame(host, content, active, random);
  const { state } = game;
  const creature = state.creature;
  const enemy = creature ? enemyFor(content, creature, state.tier) : null;
  const options = creature
    ? mutationOptions(content, creature.attack + state.pickRound + state.tier)
    : [];
  if (!active) return <main className="arena paused">联赛已暂停</main>;
  if (!game.ready) return <main className="arena paused">正在读取联赛档案…</main>;
  return (
    <main className="arena">
      <header>
        <small>ODD CREATURE · 五段联赛</small>
        <h1>电子斗蛐蛐</h1>
        <b>总胜场 {game.save.arenaWins}</b>
      </header>
      <nav className="league-track" aria-label="联赛进度">
        {content.ranks.map((rank, index) => (
          <span
            className={index < state.tier ? 'passed' : index === state.tier ? 'current' : ''}
            key={rank}
          >
            {index < state.tier ? '✓' : index + 1} {rank}
          </span>
        ))}
      </nav>
      {state.phase === 'egg' && (
        <section className="hatchery">
          <div className="egg">?</div>
          <h2>联赛入场券，就在蛋里</h2>
          <p>一只怪物连续挑战五个段位，胜后还能继续变异。</p>
          <button onClick={game.hatch}>敲开这颗蛋</button>
        </section>
      )}
      {creature && (
        <article className="creature-card">
          <strong>{creature.emoji}</strong>
          <div>
            <small>编号 {creature.id.slice(-5)}</small>
            <h2>
              {creature.traits.map((trait) => trait.name.slice(0, 2)).join('·') || '原生'}
              {creature.species}
            </h2>
            <p>
              {creature.traits.map((trait) => `${trait.icon}${trait.name}`).join(' / ') ||
                '尚未发生变异'}
            </p>
          </div>
          <dl>
            <div>
              <dt>攻击</dt>
              <dd>{creature.attack}</dd>
            </div>
            <div>
              <dt>生命</dt>
              <dd>{creature.hp}</dd>
            </div>
            <div>
              <dt>攻速</dt>
              <dd>{creature.speed}</dd>
            </div>
          </dl>
        </article>
      )}
      {creature && state.phase === 'mutate' && (
        <section className="mutation">
          <small>
            {state.tier === 0 ? '出生变异' : '胜者进化'} · 剩余 {state.mutationsLeft} 次
          </small>
          <h2>给它装点什么？</h2>
          <div className="trait-grid">
            {options.map((trait) => (
              <button key={trait.name} onClick={() => game.pick(trait)}>
                <i>{trait.icon}</i>
                <b>{trait.name}</b>
                <span>{trait.desc}</span>
                <small>
                  攻 {trait.attack >= 0 ? '+' : ''}
                  {trait.attack} · 血 {trait.hp >= 0 ? '+' : ''}
                  {trait.hp}
                </small>
              </button>
            ))}
          </div>
        </section>
      )}
      {creature && enemy && state.phase === 'ready' && (
        <section className="ready">
          <div className="versus">
            <span>我方 {power(creature)}</span>
            <b>VS</b>
            <span>
              {enemy.species} {power(enemy)}
            </span>
          </div>
          <button onClick={game.battle}>自动挑战 {content.ranks[state.tier]}</button>
        </section>
      )}
      {creature && enemy && state.phase === 'battle' && (
        <section className="battlefield" aria-live="polite">
          <h2>自动战斗 {state.battleStep} / 8</h2>
          <div className="fighters">
            <span>
              {creature.emoji} {creature.species} · 生命{' '}
              {Math.max(0, 100 - state.battleStep * (state.win ? 7 : 14))}%
            </span>
            <b>VS</b>
            <span>
              {enemy.emoji} {enemy.species} · 生命{' '}
              {Math.max(0, 100 - state.battleStep * (state.win ? 13 : 8))}%
            </span>
          </div>
        </section>
      )}
      {creature && enemy && state.phase === 'result' && (
        <section className={state.win ? 'result win' : 'result lose'} role="dialog">
          <div className="fighters">
            <span>
              {creature.emoji} {creature.species}
            </span>
            <b>VS</b>
            <span>
              {enemy.emoji} {enemy.species}
            </span>
          </div>
          <h2>
            {state.win
              ? state.tier === 4
                ? '五擂全胜，怪王登基！'
                : '赢了！下一场更离谱'
              : '被对面两拳送走'}
          </h2>
          <p>
            {state.win ? `奖励 ${12 + state.tier * 6} 游戏币。` : '失败不掉收藏，可以强化后重赛。'}
          </p>
          <button disabled={game.rewardPending} onClick={game.next}>
            {state.win ? (state.tier < 4 ? '进化并晋级' : '凯旋孵新蛋') : '孵下一只'}
          </button>
          {!state.win && (
            <button
              disabled={game.rewardPending || !host.session.capabilities.includes('advertising')}
              onClick={() => void game.reward()}
            >
              {game.rewardPending ? '处理中…' : '赛后突变'}
            </button>
          )}
        </section>
      )}
      <footer>
        游戏币 {game.save.coins} · 图鉴 {game.save.collection.length}
      </footer>
    </main>
  );
}
