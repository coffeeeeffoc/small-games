/** Hand-authored islands. Every numbered cell is row * size + column. */
function board(rows, extra = {}) {
  const size = rows.length;
  if (rows.some((row) => row.length !== size)) throw new Error('Island maps must be square');
  const result = { size, start: -1, home: -1, walls: [] };
  const collections = { C: 'compasses', B: 'bridges', W: 'winds', O: 'boxes' };
  rows.forEach((row, y) =>
    [...row].forEach((tile, x) => {
      const cell = y * size + x;
      if (tile === '#') result.walls.push(cell);
      else if (tile === 'S') result.start = cell;
      else if (tile === 'H') result.home = cell;
      else if (tile === 'E') result.echo = { start: cell };
      else if (collections[tile]) {
        const key = collections[tile];
        (result[key] ??= []).push(tile === 'W' ? { cell, dir: 'up' } : cell);
      }
    }),
  );
  return { ...result, ...extra };
}

export const MECHANICS = [
  {
    id: 'oneWay',
    name: '单向风门',
    icon: '⇢',
    description: '顺着箭头穿过；逆向会停在原地。让一只等待，让其他信使前进。',
  },
  {
    id: 'compass',
    name: '罗盘转台',
    icon: '↻',
    description: '进入后，下一次指令顺时针偏转 90°。撞墙也会消耗这次偏转。',
  },
  {
    id: 'bridge',
    name: '折叶桥',
    icon: '◇',
    description: '桥被信使或灯箱踩过后，一旦空置就会折起。撤销可以恢复。',
  },
  {
    id: 'wind',
    name: '换向风场',
    icon: '✣',
    description: '主移动结束时，风轮上的信使被吹一格。每拍风向顺时针转 90°。',
  },
  {
    id: 'box',
    name: '配重灯箱',
    icon: '▣',
    description: '推动灯箱压住圆盘，回合结束后闸门开启；门上有人时不会关闭。',
  },
  {
    id: 'echo',
    name: '一拍残影',
    icon: '◌',
    description: '紫色巡检灯执行你上一拍的原始指令。碰到它会失败，可以随时撤销。',
  },
];

export const LEVELS = [
  {
    id: 'garden',
    name: '单向花园',
    subtitle: '有时，停下来也是前进。',
    mechanic: 'oneWay',
    description: '同一个方向，同时送往四座小岛。借助墙壁和风门，把四位信使都送回充能巢。',
    hint: '先观察箭头。逆着风门走的信使会留下，其余三位仍然行动。',
    optimalMoves: 8,
    solution: ['right', 'up', 'down', 'down', 'right', 'up', 'right', 'up'],
    boards: [
      board(['#####', '#S..#', '##..#', '#..H#', '#####'], { oneWays: [{ from: 7, to: 12 }] }),
      board(['#####', '#..H#', '#.#.#', '#S..#', '#####'], { oneWays: [{ from: 18, to: 13 }] }),
      board(['#####', '#...#', '#S#H#', '#...#', '#####'], { oneWays: [{ from: 13, to: 8 }] }),
      board(['#####', '#..H#', '#S###', '#...#', '#####'], { oneWays: [{ from: 11, to: 6 }] }),
    ],
  },
  {
    id: 'compass',
    name: '罗盘庭院',
    subtitle: '同一封信，换一个方向读。',
    mechanic: 'compass',
    description: '铜制转台记住一次偏转。看清信使头上的弯箭头，再决定下一拍。',
    hint: '顺时针偏转：上变右，右变下，下变左，左变上。待用偏转只影响下一拍。',
    optimalMoves: 10,
    solution: ['up', 'left', 'right', 'right', 'right', 'down', 'left', 'left', 'down', 'left'],
    boards: [
      board(['#####', '#SC.#', '#.#.#', '#..H#', '#####']),
      board(['#####', '#..H#', '#C#.#', '#S..#', '#####']),
      board(['#####', '#S.C#', '##..#', '#H..#', '#####']),
      board(['#####', '#H..#', '#.#C#', '#..S#', '#####']),
    ],
  },
  {
    id: 'bridge',
    name: '折叶溪谷',
    subtitle: '有些路，只为经过一次。',
    mechanic: 'bridge',
    description: '跨过水渠的铜叶会在身后折起。先看好彼岸，再把这一步交给四座岛。',
    hint: '折叶桥离开后不能返回。先送一位到家，它就不再受后面的指令影响。',
    optimalMoves: 13,
    solution: [
      'left',
      'up',
      'right',
      'right',
      'up',
      'up',
      'right',
      'down',
      'right',
      'right',
      'down',
      'down',
      'left',
    ],
    boards: [
      board(['######', '#S.###', '#..B.#', '####.#', '###.H#', '######']),
      board(['######', '###.H#', '###.##', '#..B##', '#S.###', '######']),
      board(['######', '#S...#', '####B#', '###..#', '###H.#', '######']),
      board(['######', '#H.###', '##B###', '#..S##', '#...##', '######']),
    ],
  },
  {
    id: 'wind',
    name: '风向工坊',
    subtitle: '等一拍，风就会不一样。',
    mechanic: 'wind',
    description: '风轮会在移动后再送你一格。每轮箭头旋转，撞墙等待也会改变风向。',
    hint: '箭头显示这一拍的风向。风只吹一次，不会推箱；利用墙边等到合适方向。',
    optimalMoves: 10,
    solution: ['up', 'up', 'down', 'down', 'right', 'right', 'up', 'left', 'left', 'up'],
    boards: [
      board(['######', '#S...#', '#.#..#', '#.W.H#', '######', '######'], {
        winds: [{ cell: 20, dir: 'right' }],
      }),
      board(['######', '##..H#', '#W.#.#', '#S...#', '######', '######'], {
        winds: [{ cell: 13, dir: 'up' }],
      }),
      board(['######', '#H.###', '#.W..#', '###.S#', '######', '######'], {
        winds: [{ cell: 14, dir: 'left' }],
      }),
      board(['######', '#..S##', '#.#W##', '#...H#', '######', '######'], {
        winds: [{ cell: 15, dir: 'down' }],
      }),
    ],
  },
  {
    id: 'counterweight',
    name: '配重温室',
    subtitle: '留下一点重量，点亮回家的路。',
    mechanic: 'box',
    description: '把灯箱推上压板，让花瓣闸门保持开启。开关在这拍结束时才生效。',
    hint: '灯箱无法连推。先找到推箱时可以站的位置，再给它留出一条到压板的路。',
    optimalMoves: 12,
    solution: [
      'up',
      'left',
      'left',
      'up',
      'up',
      'right',
      'down',
      'down',
      'right',
      'right',
      'left',
      'left',
    ],
    boards: [
      board(['######', '#SO.##', '#..###', '#...H#', '######', '######'], {
        shutters: [{ cell: 21, plate: 9 }],
      }),
      board(['######', '#H.###', '#.#.##', '#..O.#', '###S.#', '######'], {
        shutters: [{ cell: 13, plate: 15 }],
      }),
      board(['######', '#.OS##', '#.#.##', '#H..##', '######', '######'], {
        shutters: [{ cell: 20, plate: 7 }],
      }),
      board(['######', '#..H##', '#..###', '#.OS##', '#...##', '######'], {
        shutters: [{ cell: 8, plate: 19 }],
      }),
    ],
  },
  {
    id: 'echo',
    name: '暮光回廊',
    subtitle: '下一步，也藏在上一拍里。',
    mechanic: 'echo',
    description: '巡检残影总慢一拍。它跟随上一条原始指令，罗盘却只改变你自己的方向。',
    hint: '先看残影的预告箭头。它第一拍等待，之后重放上一拍输入；到家后该岛立即冻结。',
    optimalMoves: 13,
    solution: [
      'up',
      'right',
      'right',
      'left',
      'left',
      'down',
      'right',
      'up',
      'up',
      'down',
      'right',
      'down',
      'left',
    ],
    boards: [
      board(['######', '#S.C.#', '#.##.#', '#.E.H#', '######', '######']),
      board(['######', '#H...#', '#.#..#', '#S..E#', '######', '######'], {
        oneWays: [{ from: 19, to: 13 }],
      }),
      board(['######', '#S...#', '##C#.#', '#HE..#', '######', '######']),
      board(['######', '#.E.H#', '#.#.##', '#..S##', '######', '######'], {
        oneWays: [{ from: 15, to: 9 }],
      }),
    ],
  },
];
