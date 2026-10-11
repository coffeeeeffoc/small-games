import standaloneGames from './standalone-games.json';
import gameMeta from './game-meta.json';
import { GameAssessmentSummary } from './GameAssessment.js';
import type { BuiltInGame, LazyBuiltInGame } from './registry.js';
import { featuredPlay } from './featured-play.js';
import { standaloneGameEntry } from './standalone-entry.js';
import {
  assessments,
  assessmentSearchText,
  catalogTabs,
  emptyFilters,
  filterGroups,
  groupKeys,
  matchesAssessment,
  normalizeCatalogText,
  type CatalogFilters,
  type FilterGroup,
} from './catalog-assessments.js';

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
  filters = emptyFilters(),
  onFilters,
}: {
  registry: readonly (BuiltInGame | LazyBuiltInGame)[];
  query: string;
  view: 'list' | 'cards';
  onQuery: (query: string) => void;
  onView: (view: 'list' | 'cards') => void;
  onLaunch: (id: string, search?: string) => void;
  disabled: boolean;
  filters?: CatalogFilters;
  onFilters?: (filters: CatalogFilters) => void;
}) {
  const terms = query.split(/\s+/u).map(normalizeCatalogText).filter(Boolean);
  const games = [...registry, ...standaloneGames].sort(
    (a, b) => (featuredGameOrder[a.id] ?? 9) - (featuredGameOrder[b.id] ?? 9),
  );
  const sourceOf = (game: (typeof games)[number]) =>
    'source' in game ? game.source : `games/local/game-${game.id}`;
  const searched = games.filter((game) => {
    const play = featuredPlay[game.id];
    const text = normalizeCatalogText(
      `${game.title} ${game.description} ${game.id} ${sourceOf(game)} ${play?.hook ?? ''} ${play?.choices.map((choice) => choice.label).join(' ') ?? ''} ${assessmentSearchText(assessments[game.id])}`,
    );
    return terms.every((term) => text.includes(term));
  });
  const matches = searched.filter((game) => matchesAssessment(assessments[game.id], filters));
  const hasFilters = filters.tab !== 'all' || groupKeys.some((group) => filters[group].length > 0);
  const toggle = (group: FilterGroup, value: string) =>
    onFilters?.({
      ...filters,
      [group]: filters[group].includes(value)
        ? filters[group].filter((item) => item !== value)
        : [...filters[group], value],
    });
  const facet = (group: FilterGroup) => (
    <fieldset key={group} className="catalog-facet">
      <legend>{filterGroups[group].label}</legend>
      <div className="catalog-chips">
        {filterGroups[group].options.map(([value, label]) => {
          const count = searched.filter(
            (game) =>
              matchesAssessment(assessments[game.id], filters, group) &&
              assessments[game.id]?.[group].includes(value),
          ).length;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={filters[group].includes(value)}
              onClick={() => toggle(group, value)}
            >
              {label}
              <span className="facet-count">{count}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );

  return (
    <>
      <div className="catalog-toolbar">
        <label>
          查找游戏
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="中文名、目录名、标签…空格分隔关键词"
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
      {onFilters && (
        <section className="catalog-filters" aria-label="游戏分类筛选">
          <p className="catalog-portfolio-summary">
            {games.length} 款全部归类 · 有趣 / 有潜力{' '}
            {games.filter((game) => assessments[game.id]?.potential.includes('potential')).length}{' '}
            款 · 潜力低{' '}
            {games.filter((game) => assessments[game.id]?.potential.includes('low')).length} 款。
            下方四个排期组互不重叠，排期不代表潜力高低。
          </p>
          <div className="catalog-tabs" role="group" aria-label="评估分组">
            {catalogTabs.map(([tab, label]) => {
              const total = games.filter((game) =>
                matchesAssessment(assessments[game.id], { ...emptyFilters(), tab }),
              ).length;
              const count = searched.filter((game) =>
                matchesAssessment(assessments[game.id], { ...filters, tab }),
              ).length;
              return (
                <button
                  key={tab}
                  type="button"
                  aria-pressed={filters.tab === tab}
                  onClick={() => onFilters({ ...filters, tab })}
                  title={`当前条件匹配 ${count} 款，该组共 ${total} 款`}
                >
                  {label}
                  <span className="facet-count">
                    {count === total ? total : `${count} / ${total}`}
                  </span>
                </button>
              );
            })}
            {hasFilters && (
              <button type="button" onClick={() => onFilters(emptyFilters())}>
                清空筛选
              </button>
            )}
            {(hasFilters || query) && (
              <button
                type="button"
                onClick={() => {
                  onQuery('');
                  onFilters(emptyFilters());
                }}
              >
                重置全部
              </button>
            )}
          </div>
          {facet('potential')}
          {facet('platforms')}
          <details className="catalog-more-filters">
            <summary>
              玩法与拓展方向
              {filters.genres.length + filters.opportunities.length > 0
                ? ` · 已选 ${filters.genres.length + filters.opportunities.length}`
                : ''}
            </summary>
            {facet('genres')}
            {facet('opportunities')}
          </details>
          <p className="catalog-filter-help">
            同组多选满足任一标签，跨组同时满足。筛选时排期显示匹配数 /
            组内总数。平台与拓展标签表示推荐方向。爆款与毫无潜力尚无充分证据，暂不赋值。
          </p>
        </section>
      )}
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
            {assessments[game.id] && <GameAssessmentSummary assessment={assessments[game.id]} />}
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
      {!matches.length && <p>没有找到匹配的游戏，试试其他标签、缩短关键词或重置全部。</p>}
    </>
  );
}
