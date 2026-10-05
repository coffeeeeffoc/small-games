import standaloneGames from './standalone-games.json';
import gameMeta from './game-meta.json';
import type { BuiltInGame, LazyBuiltInGame } from './registry.js';
import { featuredPlay } from './featured-play.js';
import { standaloneGameEntry } from './standalone-entry.js';

const featuredGameOrder: Record<string, number> = {
  'carding-car': 0,
  'cops-robbers': 1,
  'cops-robbers-realtime': 2,
  'letters-words2': 3,
  'vibeJam-myself-history-guess': 4,
  'xiangqi-five': 5,
  'travel-bund': 6,
  'night-overwatch': 7,
  'wulong-city': 8,
};

const normalize = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}]/gu, '');

const metadata: Record<string, (typeof gameMeta.games)[keyof typeof gameMeta.games]> =
  gameMeta.games;
const commitTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function GameHistory({ id }: { id: string }) {
  const meta = metadata[id];
  if (!meta) return null;
  return (
    <dl className="game-history" aria-label="游戏提交记录">
      {(['created', 'updated'] as const).map((kind) => (
        <div key={kind}>
          <dt>{kind === 'created' ? '创建' : '最后更新'}</dt>
          <dd>
            <time dateTime={meta[kind].time} title="北京时间">
              {commitTime.format(new Date(meta[kind].time))}
            </time>
            <code title={meta[kind].commit}>{meta[kind].commit.slice(0, 8)}</code>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The same searchable catalog in compact and detailed layouts. */
export function GameCatalog({
  registry,
  query,
  view,
  onQuery,
  onView,
  onLaunch,
  disabled,
}: {
  registry: readonly (BuiltInGame | LazyBuiltInGame)[];
  query: string;
  view: 'list' | 'cards';
  onQuery: (query: string) => void;
  onView: (view: 'list' | 'cards') => void;
  onLaunch: (id: string, search?: string) => void;
  disabled: boolean;
}) {
  const terms = query.split(/\s+/u).map(normalize).filter(Boolean);
  const games = [...registry, ...standaloneGames].sort(
    (a, b) => (featuredGameOrder[a.id] ?? 9) - (featuredGameOrder[b.id] ?? 9),
  );
  const sourceOf = (game: (typeof games)[number]) =>
    'source' in game ? game.source : `games/local/game-${game.id}`;
  const matches = games.filter((game) => {
    const play = featuredPlay[game.id];
    const text = normalize(
      `${game.title} ${game.description} ${game.id} ${sourceOf(game)} ${play?.hook ?? ''} ${play?.choices.map((choice) => choice.label).join(' ') ?? ''}`,
    );
    return terms.every((term) => text.includes(term));
  });

  return (
    <>
      <div className="catalog-toolbar">
        <label>
          查找游戏
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="中文名、描述、目录名…多个关键词用空格分隔"
          />
        </label>
        <div className="catalog-view" role="group" aria-label="展示方式">
          <button type="button" aria-pressed={view === 'list'} onClick={() => onView('list')}>
            简洁一览
          </button>
          <button type="button" aria-pressed={view === 'cards'} onClick={() => onView('cards')}>
            详情卡片
          </button>
        </div>
        <p role="status">
          显示 {matches.length} / {games.length} 个游戏
        </p>
        {query && (
          <button type="button" onClick={() => onQuery('')}>
            清空搜索
          </button>
        )}
      </div>
      <section
        className={`catalog-grid${view === 'list' ? ' catalog-list' : ''}`}
        aria-label="Game Catalog"
      >
        {matches.map((game) => (
          <article
            key={game.id}
            data-game-id={game.id}
            className={featuredPlay[game.id] ? 'featured-game' : undefined}
          >
            {view === 'cards' && !featuredPlay[game.id] && (
              <span>
                {!('source' in game)
                  ? 'remote' in game && game.remote
                    ? 'REMOTE GAME · BUILT-IN FALLBACK'
                    : 'BUILD-TIME GAME'
                  : '独立游戏'}
              </span>
            )}
            <h2>{game.title}</h2>
            {!featuredPlay[game.id] && <code>{sourceOf(game)}</code>}
            <p>{featuredPlay[game.id]?.hook ?? game.description}</p>
            {view === 'cards' && <GameHistory id={game.id} />}
            {'source' in game ? (
              <a
                className="game-launch"
                href={standaloneGameEntry(game.id)}
                onClick={(event) => {
                  if (
                    event.defaultPrevented ||
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  onLaunch(game.id);
                }}
              >
                进入游戏
              </a>
            ) : (
              <button className="game-launch" disabled={disabled} onClick={() => onLaunch(game.id)}>
                进入游戏
              </button>
            )}
            {featuredPlay[game.id] && (
              <div className="play-choices" role="group" aria-label={`${game.title}玩法`}>
                {featuredPlay[game.id].choices.map((choice) => (
                  <button key={choice.label} onClick={() => onLaunch(game.id, choice.search)}>
                    {choice.label}
                    <span aria-hidden="true"> ↗</span>
                  </button>
                ))}
              </div>
            )}
          </article>
        ))}
      </section>
      {!matches.length && <p>没有找到匹配的游戏，试试更短的关键词或清空搜索。</p>}
    </>
  );
}
