export const levels = [
  { name: '让船浮起来', subtitle: '让天气，替你开路。', hint: '点一下雨，让船浮起；再从船身向右拖动。', h: 0, snow: false,
    map: ['#######','#######','#######','#S.WD##','#######','#######','#######'] },
  { name: '分岔航道', subtitle: '同样的风，不同的路。', hint: '两条路都能到码头。浅水推三格，冰雪滑到墙前。', h: 0, snow: false,
    map: ['#######','#######','#...D##','#.##.##','#.##W##','#S....#','#######'] },
  { name: '桥下的水线', subtitle: '退一步水，少走一段路。', hint: '高水过不了低桥。退水穿桥，或沿上方绕行。', h: 2, snow: false,
    map: ['#######','#....##','#.##.##','#.##.##','#SB.D##','#######','#######'] },
  { name: '借一场雪', subtitle: '越过短风，到更远的地方。', hint: '转弯口在四格外。雪面能滑得更远。', h: 0, snow: false,
    map: ['#######','#####D#','#####.#','#####.#','#S....#','#######','#######'] },
  { name: '上一班的天气', subtitle: '留下的雪，也是你的工具。', hint: '保留雪面走上路；或用雨融雪，精确停在下路岔口。', h: 0, snow: true,
    map: ['#######','#######','#...D##','#.##.##','#.##W##','#S....#','#######'] },
];
export const directions = { up: [0,-1], right: [1,0], down: [0,1], left: [-1,0] };
export function initial(index = 0) {
  const level = levels[index];
  if (!level || level.map.length !== 7 || level.map.some(r => r.length !== 7 || /[^#.SWDB]/.test(r)) || level.map.join('').split('S').length !== 2 || level.map.join('').split('D').length !== 2) throw new Error('无效关卡');
  const y = level.map.findIndex(row => row.includes('S'));
  const x = level.map[y].indexOf('S');
  return { grid: level.map.map(row => row.replace('S','.')), x, y, h: level.h, snow: level.snow, remaining: 3, status: 'playing', message: level.hint };
}
