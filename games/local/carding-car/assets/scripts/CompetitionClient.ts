export type BoardEntry = { playerId: string; rank: number; score: number; secondary: number; name?: string };
export type CompetitionBoard = {
  title?: string;
  rules?: string;
  eligiblePlayers: number;
  top: BoardEntry[];
  me: BoardEntry | null;
  previous: BoardEntry | null;
  threshold: BoardEntry | null;
};
export const competition = () => (globalThis as typeof globalThis & {
  __competition?: {
    session(): Promise<{ token: string; playerId: string }>;
    request(path: string, init?: { method?: string; body?: string }): Promise<unknown>;
  };
}).__competition;

/** Only server-returned records are compared; undefined means the pre-race read was unavailable. */
export function rankedResultText(board: CompetitionBoard, before: BoardEntry | null | undefined) {
  const me = board.me;
  if (!me) return `全站个人最佳：暂无\n尚无有效成绩\n合格参赛 ${board.eligiblePlayers} 人\n完成合法三圈后参与排位`;
  const record = before === undefined ? '开赛前纪录未取得，无法比较'
    : before === null ? '首次有效纪录' : me.score > before.score ? `纪录提升 ${((me.score-before.score)/1000).toFixed(3)} 秒` : '本局未刷新个人最佳';
  const change = before === undefined ? '排名变化：暂无比较依据' : before === null ? '首次上榜'
    : `排名变化 ${before.rank-me.rank>0?'+':''}${before.rank-me.rank}`;
  const gap = board.previous ? `距上一名快 ${((board.previous.score-me.score)/1000).toFixed(3)} 秒` : '已并列或独占榜首';
  return `个人最佳 ${(-me.score/1000).toFixed(3)} 秒\n全站第 ${me.rank} 名 / ${board.eligiblePlayers} 人\n${record}\n${change}\n${gap}`;
}
