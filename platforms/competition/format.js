export function scoreText(game,score,secondary=0) {
  const time=`${(secondary/1000).toFixed(2)}秒`;
  if(game==='carding-car')return `${(-score/1000).toFixed(2)}秒`;
  if(game==='cops-robbers')return `${-score}步 · ${time}`;
  if(game==='cops-robbers-realtime')return `全部捕获 · ${time}`;
  if(game==='letters-words2')return `${Math.floor(score/1000000)}词 · 正确率${((score%1000000)/100).toFixed(2)}% · ${time}`;
  return `${score}分${game==='xiangqi-five'?'':' · '+time}`;
}

export function gapText(game, board) {
  if (!board.me) return '尚无有效成绩';
  if (!board.gap) return Number(board.me.rank) === 1 ? '已并列或独占榜首' : '暂无更高目标';
  const {score, secondary} = board.gap;
  if (score === 0) return `距上一名快 ${(Math.max(0, secondary)/1000).toFixed(2)} 秒`;
  if (game === 'carding-car') return `距上一名快 ${(score/1000).toFixed(2)} 秒`;
  if (game === 'cops-robbers') return `距上一名少 ${score} 步`;
  if (game === 'letters-words2') {
    const words = Math.floor(board.previous.score/1000000)-Math.floor(board.me.score/1000000);
    return words ? `距上一名多完成 ${words} 词` : `距上一名正确率提高 ${(score/100).toFixed(2)} 个百分点`;
  }
  return `距上一名 ${score} 分`;
}
