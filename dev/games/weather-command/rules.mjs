import { directions } from './levels.mjs';
export const actions = [{type:'rain'},{type:'sun'},{type:'snow'}, ...Object.keys(directions).map(dir => ({type:'wind',dir}))];
export const cell = (s,x,y) => s.grid[y]?.[x] ?? '#';
export function step(state, action) {
  if (!action || !['rain','sun','snow','wind'].includes(action.type) || (action.type === 'wind' && !Object.hasOwn(directions,action.dir))) throw new TypeError('无效天气指令');
  const invalid = reason => ({ state, valid:false, reason, path:[], broken:[], events:[] });
  if (state.status !== 'playing' || state.remaining <= 0) return invalid('本局已结束，可以撤销或重来。');
  const s = structuredClone(state), path = [{x:s.x,y:s.y}], broken = [], events = [];
  let message = '';
  if (action.type === 'wind') {
    if (!s.snow && s.h === 0) return invalid('船搁浅了：先涨水浮船，或铺雪滑行。');
    const [dx,dy] = directions[action.dir];
    const limit = s.snow ? 7 : 3;
    let blocker = '#';
    for (let i = 0; i < limit; i++) {
      const x = s.x + dx, y = s.y + dy, tile = cell(s,x,y);
      if (tile === '#' || (tile === 'B' && s.h === 2)) { blocker = tile; break; }
      if (tile === 'W') {
        s.grid[y] = s.grid[y].slice(0,x) + '.' + s.grid[y].slice(x+1);
        broken.push({x,y}); events.push({type:'break',x,y});
      }
      s.x = x; s.y = y; path.push({x,y}); events.push({type:'move',x,y});
    }
    if (path.length === 1) return invalid(blocker === 'B' ? '高水顶住了桥洞：退水，或换条路线。' : '这边紧邻岸墙，换个风向试试。');
    const passed = s.snow && path.slice(1,-1).some(p => cell(s,p.x+dy,p.y+dx) !== '#' || cell(s,p.x-dy,p.y-dx) !== '#');
    message = passed ? '冰雪长滑：船滑过了岔口。可以撤销再选路线。' : s.snow ? '冰雪长滑，船在障碍前停稳。' : `浅水短推，船前进了 ${path.length-1} 格。`;
    if (broken.length) message = '木栅撞开了！' + message;
  } else if (action.type === 'snow') {
    if (s.snow) return invalid('已经铺满冰雪，无需再下雪。');
    s.snow = true; events.push({type:'freeze'});
    message = s.h ? '水面结冰：下一阵风会一路滑到障碍前。' : '航道铺雪：搁浅的船也能长滑了。';
  } else {
    const h = Math.max(0,Math.min(2,s.h + (action.type === 'rain' ? 1 : -1)));
    if (h === s.h && !s.snow) return invalid(action.type === 'rain' ? '水位已到最高，这场雨不会改变航道。' : '已经干涸，也没有冰雪需要融化。');
    if (s.snow) events.push({type:'thaw'});
    if (h !== s.h) events.push({type:'water',from:s.h,to:h});
    message = (s.snow ? '冰雪融化，' : '') + (action.type === 'rain' ? (h === 1 ? '水涨到浅水，船浮起来了。' : '水涨到高位，注意低桥。') : (h === 0 ? '水退到底，船搁浅了。' : '水退到浅水，可以穿过低桥。'));
    if (h === s.h) message = h === 2 ? '冰雪融化，水位仍在高处，注意低桥。' : '冰雪融化，水位仍是干涸，船搁浅了。';
    s.h = h; s.snow = false;
  }
  s.remaining--;
  s.status = cell(s,s.x,s.y) === 'D' ? 'won' : s.remaining === 0 ? 'lost' : 'playing';
  s.message = s.status === 'won' ? '补给已送达，码头亮灯了。' : s.status === 'lost' ? `指令用尽，船还没停进码头。${message}` : message;
  return {state:s,valid:true,reason:s.message,path,broken,events};
}
