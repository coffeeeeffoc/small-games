import data from './game-assessments.json';

export const filterGroups = {
  potential: {
    label: '可玩性判断',
    options: [
      ['fun', '有趣'],
      ['potential', '有潜力'],
      ['low', '潜力低'],
      ['hit', '爆款（待实证）'],
      ['none', '毫无潜力'],
    ],
  },
  platforms: {
    label: '推荐平台',
    options: [
      ['mobile', '移动端小游戏'],
      ['web', 'Web 端'],
      ['app', 'APP 端'],
    ],
  },
  genres: {
    label: '玩法类型',
    options: [
      ['arcade', '短局街机'],
      ['puzzle', '益智解谜'],
      ['physics', '物理操作'],
      ['action', '动作'],
      ['roguelite', '局内成长'],
      ['strategy', '策略'],
      ['competitive', '竞技'],
      ['racing', '驾驶竞速'],
      ['word', '单词学习'],
      ['story', '叙事'],
      ['exploration', '探索'],
      ['simulation', '模拟调度'],
      ['sandbox', '创作沙盒'],
      ['audio', '声音'],
      ['relaxing', '休闲观景'],
      ['stealth', '潜行'],
    ],
  },
  opportunities: {
    label: '拓展方向',
    options: [
      ['share', '内容分享'],
      ['challenge', '同题挑战'],
      ['versus', '好友对战'],
    ],
  },
} as const;

export type FilterGroup = keyof typeof filterGroups;
export type CatalogFilters = Record<FilterGroup, string[]> & { tab: 'all' | 'focus' | 'hold' };
export type CatalogState = { query: string; view: 'list' | 'cards'; filters: CatalogFilters };
export type GameAssessment = (typeof data.games)[number];
export const assessmentBasis = data.basis;
export const assessedOn = data.reviewedOn;
export const assessments: Readonly<Record<string, GameAssessment>> = Object.fromEntries(
  data.games.map((game) => [game.id, game]),
);
export const groupKeys = Object.keys(filterGroups) as FilterGroup[];
export const emptyFilters = (): CatalogFilters => ({
  tab: 'all',
  potential: [],
  platforms: [],
  genres: [],
  opportunities: [],
});
export const normalizeCatalogText = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}]/gu, '');
export const tagLabel = (group: FilterGroup, id: string): string =>
  filterGroups[group].options.find(([value]) => value === id)?.[1] ?? id;

/** OR inside a facet; AND between facets and the selected review tab. */
export function matchesAssessment(
  assessment: GameAssessment | undefined,
  filters: CatalogFilters,
  ignoreGroup?: FilterGroup | 'tab',
): boolean {
  if (ignoreGroup !== 'tab') {
    if (filters.tab === 'focus' && assessment?.priority !== 'first') return false;
    if (filters.tab === 'hold' && assessment?.disposition !== 'hold') return false;
  }
  return groupKeys.every(
    (group) =>
      group === ignoreGroup ||
      !filters[group].length ||
      filters[group].some((value) => assessment?.[group].includes(value)),
  );
}

export function readCatalogState(search: string): CatalogState {
  const params = new URLSearchParams(search);
  const filters = emptyFilters();
  const tab = params.get('catalogTab');
  if (tab === 'focus' || tab === 'hold') filters.tab = tab;
  for (const group of groupKeys) {
    filters[group] = [...new Set(params.getAll(`catalog_${group}`))].filter((value) =>
      filterGroups[group].options.some(([id]) => id === value),
    );
  }
  return {
    query: params.get('catalogQuery') ?? '',
    view: params.get('catalogView') === 'cards' ? 'cards' : 'list',
    filters,
  };
}

/** Own only catalog parameters: dev, runtime credentials and game hash remain untouched. */
export function catalogStateUrl(currentUrl: string, state: CatalogState): string {
  const url = new URL(currentUrl);
  const params = url.searchParams;
  for (const key of [
    'catalogQuery',
    'catalogView',
    'catalogTab',
    ...groupKeys.map((g) => `catalog_${g}`),
  ])
    params.delete(key);
  if (state.query) params.set('catalogQuery', state.query);
  if (state.view === 'cards') params.set('catalogView', state.view);
  if (state.filters.tab !== 'all') params.set('catalogTab', state.filters.tab);
  for (const group of groupKeys) {
    for (const [value] of filterGroups[group].options) {
      if (state.filters[group].includes(value)) params.append(`catalog_${group}`, value);
    }
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function assessmentSearchText(assessment: GameAssessment | undefined): string {
  if (!assessment) return '';
  return groupKeys
    .flatMap((group) => assessment[group].map((value) => tagLabel(group, value)))
    .join(' ');
}
