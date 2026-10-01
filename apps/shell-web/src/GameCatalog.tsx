import standaloneGames from './standalone-games.json';
import type { BuiltInGame, LazyBuiltInGame } from './registry.js';

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
  onLaunch: (id: string) => void;
  disabled: boolean;
}) {
  const terms = query.split(/\s+/u).map(normalize).filter(Boolean);
  const games = [...registry, ...standaloneGames].sort(
    (a, b) => (featuredGameOrder[a.id] ?? 9) - (featuredGameOrder[b.id] ?? 9),
  );
  const sourceOf = (game: (typeof games)[number]) =>
    'source' in game ? game.source : `games/local/game-${game.id}`;
  const matches = games.filter((game) => {
    const text = normalize(`${game.title} ${game.description} ${game.id} ${sourceOf(game)}`);
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
          <article key={game.id}>
            {view === 'cards' && (
              <span>
                {!('source' in game)
                  ? 'remote' in game && game.remote
                    ? 'REMOTE GAME · BUILT-IN FALLBACK'
                    : 'BUILD-TIME GAME'
                  : '独立游戏'}
              </span>
            )}
            <h2>{game.title}</h2>
            <code>{sourceOf(game)}</code>
            <p>{game.description}</p>
            <button disabled={!('source' in game) && disabled} onClick={() => onLaunch(game.id)}>
              进入游戏
            </button>
          </article>
        ))}
      </section>
      {!matches.length && <p>没有找到匹配的游戏，试试更短的关键词或清空搜索。</p>}
    </>
  );
}
