/**
 * Hand-authored spatial puzzles. A cell of travel costs one simulation tick;
 * four ticks make one displayed beat. Pieces can occupy any legal empty cell.
 * `solution` is a regression fixture, never an input to the simulation or UI.
 * Alternative constructions are accepted when their actual arrivals match.
 */
const defaults = {
  cols: 8,
  rows: 8,
  ticksPerBeat: 4,
  beatMs: 800,
  sourceEnergy: 240,
  minEnergy: 12,
  travelLoss: 1,
  reflectionLoss: 2,
  splitterLoss: 2,
  delayLoss: 1,
  maxTicks: 100,
  walls: [],
  absorbers: [],
  fixed: [],
};
const cell = (x, y) => ({ x, y });
const piece = (id, type, orientation = '/', x = null, y = null, delayTicks) => ({
  id,
  type,
  orientation,
  x,
  y,
  ...(delayTicks === undefined ? {} : { delayTicks }),
});
const mirror = (id, orientation = '/', x = null, y = null) =>
  piece(id, 'mirror', orientation, x, y);
const fork = (id, orientation = '/', x = null, y = null) =>
  piece(id, 'splitter', orientation, x, y);
const delay = (id, ticks, x = null, y = null) => piece(id, 'delay', '/', x, y, ticks);
const pose = (id, x, y, orientation = '/') => ({ id, x, y, orientation });
const level = (data) => ({ ...defaults, ...data });

export const LEVELS = [
  level({
    id: 'grid-detour',
    title: 'Take the long way',
    titleZh: '绕远才准时',
    subtitle: 'A connection is only the beginning',
    subtitleZh: '接通声路，只是开始',
    intro:
      'The direct echo arrives too early. Place mirrors to make a real detour. Drag a piece onto the board; select a placed mirror, then tap it again to rotate.',
    introZh: '直达会早到。把反射板放进棋盘，让声波真正绕远。拖放元件，点选反射板，再点一次可旋转。',
    hint: 'The direct path is 6 cells; the target is 12 ticks. A detour adds both the outward and return distance. The wall leaves a gap above it.',
    hintZh: '直达是 6 格，目标是 12 格时间。绕出去和绕回来都计入路程；墙的上方留着通道。',
    source: { x: 0, y: 4, dir: 'E' },
    receiver: cell(6, 4),
    targets: [12],
    walls: [cell(3, 2), cell(3, 3), cell(3, 5), cell(3, 6), cell(3, 7)],
    inventory: [mirror('turn-out'), mirror('turn-across'), mirror('turn-back'), mirror('turn-in')],
    solution: [
      pose('turn-out', 1, 4),
      pose('turn-across', 1, 1),
      pose('turn-back', 5, 1, '\\'),
      pose('turn-in', 5, 4, '\\'),
    ],
  }),
  level({
    id: 'grid-two-echoes',
    title: 'One voice, two ways',
    titleZh: '两条路，一声响',
    subtitle: 'Build a fork, then bring both echoes home',
    subtitleZh: '分出去，还要接回来',
    intro:
      'The splitter sends half the pulse straight on and half around its corner. Route both echoes around the wall, arriving at different times. Every emitted echo must return.',
    introZh:
      '分声器让一半声音直行、一半转弯。把两路绕过墙接回终点，还要错开到达时间。每一道分出的回声都必须回来。',
    hint: 'You have five mirrors and one movable splitter. The 13-tick route needs two more cells than the 11-tick route; try opposite sides of the wall.',
    hintZh: '你有五块反射板和一个可移动分声器。13 格路线比 11 格路线多走两格；试着从墙的两侧绕行。',
    source: { x: 0, y: 4, dir: 'E' },
    receiver: cell(7, 4),
    targets: [11, 13],
    walls: [cell(5, 2), cell(5, 3), cell(5, 4), cell(5, 5)],
    inventory: [
      fork('fork', '/', 2, 4),
      mirror('upper-in'),
      mirror('upper-out'),
      mirror('lower-in'),
      mirror('lower-across'),
      mirror('lower-out'),
    ],
    solution: [
      pose('fork', 2, 4),
      pose('upper-in', 2, 1),
      pose('upper-out', 7, 1, '\\'),
      pose('lower-in', 4, 4, '\\'),
      pose('lower-across', 4, 6, '\\'),
      pose('lower-out', 7, 6),
    ],
  }),
  level({
    id: 'grid-three-echoes',
    title: 'Weave three returns',
    titleZh: '三声织成节奏',
    subtitle: 'Two forks, three journeys',
    subtitleZh: '两次分声，三种路程',
    intro:
      'Build the whole circuit from six pieces. One echo takes the direct route; the other two need different detours. A splitter is part of a route, so its position affects everything after it.',
    introZh:
      '用六个元件搭出完整声路。第一声可以直达，另外两声需要不同的绕路。分声点也是路线的一部分，位置会影响后续所有回声。',
    hint: 'Split once, then split only one of those two branches again. The three paths need 7, 11 and 15 cells. Use the openings above and below the walls.',
    hintZh: '先分成两路，只让其中一路再次分声。三条声路需要 7、11、15 格；利用墙的上、下方空隙。',
    source: { x: 0, y: 4, dir: 'E' },
    receiver: cell(7, 4),
    targets: [7, 11, 15],
    walls: [cell(3, 1), cell(3, 2), cell(3, 3), cell(5, 5)],
    inventory: [
      fork('first-fork'),
      fork('second-fork'),
      mirror('upper-in'),
      mirror('upper-out'),
      mirror('lower-in'),
      mirror('lower-out'),
    ],
    solution: [
      pose('first-fork', 2, 4),
      pose('second-fork', 4, 4, '\\'),
      pose('upper-in', 2, 0),
      pose('upper-out', 7, 0, '\\'),
      pose('lower-in', 4, 6, '\\'),
      pose('lower-out', 7, 6),
    ],
  }),
  level({
    id: 'grid-shared-wait',
    title: 'One shared wait',
    titleZh: '同一段等待',
    subtitle: 'Change two echoes with one placement',
    subtitleZh: '一次放置，影响两道回声',
    intro:
      'All three echoes already return, but two are early. Rebuild their detours and place the one +2 delay. Where you put the delay decides whether one, two or all three echoes wait.',
    introZh:
      '三道回声已经接通，但后两声都早了。重排绕路，再放好唯一的 +2 延迟段。位置不同，会让一道、两道或全部回声一起等待。',
    hint: 'Keep the first return at 8 ticks. Extend both outer routes, then put the delay on the shared segment between the two splitters. Waiting before the first fork would also delay the first echo.',
    hintZh:
      '保住第 8 格的第一声。把上、下绕路各延长，再让延迟段落在两个分声器之间。放在第一次分声之前，会把第一声也拖晚。',
    source: { x: 1, y: 4, dir: 'E' },
    receiver: cell(7, 4),
    targets: [8, 16, 24],
    walls: [cell(2, 3), cell(3, 3), cell(5, 2), cell(5, 3)],
    fixed: [delay('fixed-first-hold', 2, 6, 4)],
    inventory: [
      fork('first-fork', '/', 4, 4),
      fork('second-fork', '\\', 4, 2),
      mirror('upper-in', '/', 4, 1),
      mirror('upper-out', '\\', 7, 1),
      mirror('lower-in', '/', 0, 2),
      mirror('lower-across', '\\', 0, 5),
      mirror('lower-out', '/', 7, 5),
      delay('shared-delay', 2),
    ],
    solution: [
      pose('first-fork', 4, 4),
      pose('second-fork', 4, 2, '\\'),
      pose('upper-in', 4, 0),
      pose('upper-out', 7, 0, '\\'),
      pose('lower-in', 0, 2),
      pose('lower-across', 0, 6, '\\'),
      pose('lower-out', 7, 6),
      pose('shared-delay', 4, 3),
    ],
  }),
  level({
    id: 'grid-first-share',
    title: 'The fading third echo',
    titleZh: '微弱的第三声',
    subtitle: 'The rhythm is right. One voice is missing.',
    subtitleZh: '节拍正确，却少了一道回声',
    intro:
      'The three routes have the right timing, but one echo fades in the absorber. Keep the rhythm and rebuild the circuit so all three voices return with enough energy.',
    introZh:
      '三条声路的节拍已经对上，却有一道回声消失在吸音地格。保持目标节奏，重新安排器件，让三道回声都带着足够的能量回来。',
    hint: 'The long upper route needs half the pulse, rather than a quarter. Send it out at the first splitter. Move the lower turn and the +4 delay with their routes; extra distance still changes the rhythm.',
    hintZh:
      '上方长路需要第一次分声的一半能量，不能等到第二次只剩四分之一。调整两个分声器，并随路线移动转角和 +4 延迟；多走的格子仍会影响节拍。',
    cols: 9,
    rows: 9,
    source: { x: 0, y: 4, dir: 'E' },
    receiver: cell(8, 4),
    targets: [8, 12, 20],
    walls: [cell(4, 1), cell(4, 2), cell(4, 3), cell(4, 5)],
    absorbers: [{ x: 8, y: 1, loss: 30 }],
    inventory: [
      fork('first-fork', '\\', 2, 4),
      fork('second-fork', '/', 5, 4),
      mirror('upper-in', '/', 5, 0),
      mirror('upper-out', '\\', 8, 0),
      mirror('lower-in', '\\', 2, 6),
      mirror('lower-out', '/', 8, 6),
      delay('long-delay', 4, 5, 2),
    ],
    solution: [
      pose('first-fork', 2, 4),
      pose('second-fork', 5, 4, '\\'),
      pose('upper-in', 2, 0),
      pose('upper-out', 8, 0, '\\'),
      pose('lower-in', 5, 6, '\\'),
      pose('lower-out', 8, 6),
      pose('long-delay', 2, 2),
    ],
  }),
];
