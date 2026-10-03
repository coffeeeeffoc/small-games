/**
 * Add a level by adding data here: no rendering or simulation changes needed.
 * Targets and path lengths use ticks, four ticks per displayed beat. A splitter
 * distributes one pulse's 300 energy; distance costs 4/unit and reflections 6.
 */
const path = (label, labelZh, length, reflections = 0, loss = 0, blocked = false) => ({
  label,
  labelZh,
  length,
  reflections,
  loss,
  delay: 0,
  ...(blocked ? { blocked: true } : {}),
});
const hold = (delay, loss = delay * 2) => ({
  label: delay ? `Hold +${delay / 4} beat` : 'Pass through',
  labelZh: delay ? `停留 +${delay / 4} 拍` : '直接通过',
  length: 0,
  reflections: 0,
  loss,
  delay,
});
const reflector = (id, options, initial = 0) => ({ id, kind: 'reflector', initial, options });
const chamber = (id, delays, initial = 0) => ({
  id,
  kind: 'delay',
  initial,
  options: delays.map((value) => hold(value)),
});
const route = (id, stages) => ({
  id,
  name: { a: 'First echo', b: 'Second echo', c: 'Third echo' }[id],
  nameZh: { a: '第一道回声', b: '第二道回声', c: '第三道回声' }[id],
  baseLength: 0,
  baseLoss: 0,
  stages,
});
const fixed = (id, length, reflections = 0) =>
  reflector(`${id}-mirror`, [path('Fixed path', '固定声路', length, reflections)]);
const balanced = { label: 'Even split', labelZh: '均分', energy: [100, 100, 100] };
const far = { label: 'Favor the third', labelZh: '偏向第三路', energy: [65, 90, 145] };
const near = { label: 'Favor the first', labelZh: '偏向第一路', energy: [145, 90, 65] };
const defaults = {
  ticksPerBeat: 4,
  beatMs: 850,
  targets: [4, 8, 12],
  minEnergy: 18,
  lossPerUnit: 4,
  reflectionLoss: 6,
};
const level = (data) => ({ ...defaults, splitter: { modes: [balanced], initial: 0 }, ...data });

export const LEVELS = [
  level({
    id: 'the-long-way',
    tip: 'Tap the amber reflector. Take the long way to beat 2.',
    tipZh: '点黄色反射板。绕远一点，在第 2 拍抵达。',
    title: 'The long way',
    titleZh: '绕远一点',
    subtitle: 'Distance makes a rhythm',
    subtitleZh: '路程，就是节拍',
    intro:
      'One pulse becomes three echoes. Tap the amber reflector to make its path longer, then strike. The second echo belongs on beat 2.',
    introZh:
      '一次敲击会分出三道回声。点击黄色反射板让声路绕远，再发声；第二道回声应在第 2 拍到达。',
    hint: 'The amber path needs 8 units. Four units take one beat; a longer route arrives later.',
    hintZh: '黄色声路需要 8 格。每 4 格走一拍；绕远是为了晚到。',
    routes: [
      route('a', [fixed('a', 4)]),
      route('b', [
        reflector('b-mirror', [
          path('Shortcut', '近路', 4),
          path('Around the wall', '绕过墙角', 8, 1),
          path('Outer loop', '外圈绕行', 12, 2),
        ]),
      ]),
      route('c', [fixed('c', 12, 2)]),
    ],
    solution: { splitter: 0, choices: { 'a-mirror': 0, 'b-mirror': 1, 'c-mirror': 0 } },
  }),
  level({
    id: 'room-for-three',
    tip: 'The rose echo needs a longer route to reach beat 3.',
    tipZh: '点粉色反射板。第三声，需要更远的路。',
    title: 'Room for three',
    titleZh: '留给第三拍',
    subtitle: 'The latest echo travels farthest',
    subtitleZh: '最后一声，走最远的路',
    intro:
      'The first two echoes already know their beats. Turn the rose reflector until the third echo has enough distance to arrive on beat 3.',
    introZh: '前两道回声已对准节拍。转动粉色反射板，为第三道回声留足路程，让它在第 3 拍到达。',
    hint: 'The rose echo needs 12 units, not the shortest route. A 10-unit path still arrives half a beat early.',
    hintZh: '粉色声路需要 12 格。10 格仍会早到半拍，最短路线并非答案。',
    routes: [
      route('a', [fixed('a', 4)]),
      route('b', [fixed('b', 8, 1)]),
      route('c', [
        reflector('c-mirror', [
          path('Shortcut', '近路', 6),
          path('Middle loop', '中圈绕行', 10, 1),
          path('Full loop', '完整绕行', 12, 2),
        ]),
      ]),
    ],
    solution: { splitter: 0, choices: { 'a-mirror': 0, 'b-mirror': 0, 'c-mirror': 2 } },
  }),
  level({
    id: 'three-voices',
    tip: 'Three reflectors, three journeys. Aim for beats 1, 2 and 3.',
    tipZh: '三块反射板，三道回声。对准 1、2、3 拍。',
    title: 'Three voices',
    titleZh: '三声合奏',
    subtitle: 'Weave every arrival',
    subtitleZh: '编排每一次抵达',
    intro:
      'All three reflectors are yours now. Build three different path lengths so a single strike returns on beats 1, 2 and 3.',
    introZh: '现在三块反射板都由你调整。编出三种不同长度，让一次发声在第 1、2、3 拍依次返回。',
    hint: 'Look for 4 / 8 / 12 units. If an echo is late, shorten only its own route.',
    hintZh: '寻找 4 / 8 / 12 格的组合。某一道回声晚了，就只缩短它的路线。',
    routes: [
      route('a', [
        reflector('a-mirror', [
          path('Inner path', '内侧声路', 2),
          path('Corner path', '转角声路', 4, 1),
          path('Outer path', '外侧声路', 6, 1),
        ]),
      ]),
      route('b', [
        reflector(
          'b-mirror',
          [
            path('Shortcut', '近路', 4),
            path('Wide turn', '宽弯', 8, 1),
            path('Outer turn', '外弯', 10, 2),
          ],
          2,
        ),
      ]),
      route('c', [
        reflector(
          'c-mirror',
          [
            path('Near loop', '近圈', 8, 1),
            path('Full loop', '整圈', 12, 2),
            path('Long loop', '长圈', 16, 2),
          ],
          2,
        ),
      ]),
    ],
    solution: { splitter: 0, choices: { 'a-mirror': 1, 'b-mirror': 1, 'c-mirror': 1 } },
  }),
  level({
    id: 'hold-the-echo',
    tip: 'Tap + to hold an echo. A little waiting completes the rhythm.',
    tipZh: '点「＋」调整延迟。等一等，补齐节拍。',
    title: 'Hold the echo',
    titleZh: '让回声等一等',
    subtitle: 'A delay adds time, not distance',
    subtitleZh: '延迟增加时间，不增加路程',
    intro:
      'Delay chambers hold an echo before releasing it. Tap a chamber to add the missing time; every hold also uses a little energy.',
    introZh: '延迟段会先留住回声，再放它通过。点击延迟段补上缺少的时间；停留也会消耗少量能量。',
    hint: 'Amber: 6 units + 2 ticks of hold. Rose: 9 units + 3 ticks. Four ticks equal one beat.',
    hintZh: '黄色：6 格 + 停留 2 格时间。粉色：9 格 + 停留 3 格时间。4 格时间等于 1 拍。',
    routes: [
      route('a', [fixed('a', 4)]),
      route('b', [
        reflector(
          'b-mirror',
          [path('Short turn', '短弯', 6, 1), path('Long turn', '长弯', 10, 2)],
          1,
        ),
        chamber('b-delay', [0, 2, 4]),
      ]),
      route('c', [fixed('c', 9, 1), chamber('c-delay', [0, 3, 5])]),
    ],
    solution: {
      splitter: 0,
      choices: { 'a-mirror': 0, 'b-mirror': 0, 'b-delay': 1, 'c-mirror': 0, 'c-delay': 1 },
    },
  }),
  level({
    id: 'keep-it-alive',
    tip: 'Same arrival, different energy. Avoid too many reflections.',
    tipZh: '同样准时，不同损耗。减少反射，留住余音。',
    title: 'Keep it alive',
    titleZh: '留住余音',
    subtitle: 'On time is only half the story',
    subtitleZh: '准时，也要听得见',
    intro:
      'These paths can arrive on time and still fail. Each reflection spends 6 energy; an echo needs at least 18 energy to light the receiver.',
    introZh:
      '即使准时抵达，声音太弱也会失败。每次反射损耗 6 点能量；到达时至少剩 18 点才能点亮接收器。',
    hint: 'Choose the smooth amber and rose routes. They have the same length as the zigzags, but far fewer reflections.',
    hintZh: '选黄色和粉色的平缓路线。它们与折返路线等长，但反射次数更少。',
    routes: [
      route('a', [fixed('a', 4)]),
      route('b', [
        reflector(
          'b-mirror',
          [path('Smooth bend', '平缓弯道', 8, 1), path('Nine reflections', '九次折返', 8, 9)],
          1,
        ),
      ]),
      route('c', [
        reflector(
          'c-mirror',
          [path('Smooth loop', '平缓绕行', 12, 2), path('Six reflections', '六次折返', 12, 6)],
          1,
        ),
      ]),
    ],
    solution: { splitter: 0, choices: { 'a-mirror': 0, 'b-mirror': 0, 'c-mirror': 0 } },
  }),
  level({
    id: 'share-the-breath',
    tip: 'Tap the splitter. Give the longest route more energy.',
    tipZh: '点中央分声器。给最远的路线更多能量。',
    title: 'Share the breath',
    titleZh: '分配一口气',
    subtitle: 'The long route needs a stronger start',
    subtitleZh: '远路，需要更响的起点',
    intro:
      'Tap the central splitter to redistribute the same 300 energy. The third route loses more along the way, so an even split may not be enough.',
    introZh: '点击中央分声器，重新分配同一束声音的 300 点能量。第三路损耗更大，平均分配可能不够。',
    hint: 'Favor the third echo (65 / 90 / 145), then set the amber and rose paths to 8 and 12 units.',
    hintZh: '让分声器偏向第三路（65 / 90 / 145），再把黄色和粉色路线设为 8 格与 12 格。',
    splitter: { modes: [balanced, far, near], initial: 0 },
    routes: [
      route('a', [fixed('a', 4)]),
      route('b', [
        reflector(
          'b-mirror',
          [path('Wide bend', '宽弯', 8, 2), path('Near bend', '近弯', 6, 1)],
          1,
        ),
      ]),
      route('c', [
        reflector(
          'c-mirror',
          [
            path('Damped loop', '吸音长圈', 12, 5, 8),
            path('Short loop', '短圈', 10, 1),
            path('Outer loop', '外圈', 14, 2),
          ],
          1,
        ),
      ]),
    ],
    solution: { splitter: 1, choices: { 'a-mirror': 0, 'b-mirror': 0, 'c-mirror': 0 } },
  }),
  level({
    id: 'silence-in-the-walls',
    tip: 'Route around dark absorbers. Delays can restore the beat.',
    tipZh: '绕开深色吸音块，再用延迟补齐节拍。',
    title: 'Silence in the walls',
    titleZh: '墙里的寂静',
    subtitle: 'An absorber ends a route',
    subtitleZh: '吸音块，让声路归零',
    intro:
      'Dark absorbers swallow a pulse completely. Find a clear detour, then use a delay chamber to restore the missing beat.',
    introZh: '深色吸音块会完全吞掉声波。先绕开它，再用延迟段补齐节拍。',
    hint: 'Amber needs the clear 8-unit bend. Rose can take 9 units + 3 ticks, or 7 units + 5 ticks.',
    hintZh: '黄色走畅通的 8 格弯道；粉色可选 9 格 + 停留 3 格时间，或 7 格 + 停留 5 格时间。',
    routes: [
      route('a', [
        reflector(
          'a-mirror',
          [path('Clear path', '畅通声路', 4), path('Long corner', '长转角', 6, 1)],
          1,
        ),
      ]),
      route('b', [
        reflector('b-mirror', [
          path('Absorber ahead', '吸音块阻挡', 4, 0, 0, true),
          path('Clear bend', '绕开吸音块', 8, 2),
          path('Outer bend', '外侧绕行', 10, 2),
        ]),
      ]),
      route('c', [
        reflector('c-mirror', [
          path('Absorber ahead', '吸音块阻挡', 12, 1, 0, true),
          path('Clear loop', '畅通长圈', 9, 1),
          path('Inner loop', '畅通内圈', 7, 2),
        ]),
        chamber('c-delay', [0, 3, 5]),
      ]),
    ],
    solution: {
      splitter: 0,
      choices: { 'a-mirror': 0, 'b-mirror': 1, 'c-mirror': 1, 'c-delay': 1 },
    },
  }),
  level({
    id: 'the-weaver',
    tip: 'Routes, delays, energy. Weave everything together.',
    tipZh: '路线、延迟、能量。把所有技巧编在一起。',
    title: 'The weaver',
    titleZh: '回声编织者',
    subtitle: 'One strike. Three perfect returns.',
    subtitleZh: '一次发声，三次完美归来',
    intro:
      'Combine everything: choose clean paths, hold each echo, and feed the longest route. Timing, reflection loss and absorption all matter.',
    introZh:
      '把所有技巧编在一起：选好路线，让回声停留，并给远路更多能量。时间、反射损耗与吸音缺一不可。',
    hint: 'Favor the third. Use path lengths 2 / 6 / 8 and holds 2 / 2 / 4 ticks. The routes that look ready-made waste too much energy.',
    hintZh:
      '偏向第三路。路程选 2 / 6 / 8 格，停留选 2 / 2 / 4 格时间。看似现成的路线会损失过多能量。',
    splitter: { modes: [balanced, far, near], initial: 0 },
    routes: [
      route('a', [
        reflector(
          'a-mirror',
          [
            path('Inner path', '内侧声路', 2),
            path('Tight zigzag', '密集折返', 4, 6),
            path('Outer path', '外侧声路', 6, 1),
          ],
          2,
        ),
        chamber('a-delay', [0, 2, 4]),
      ]),
      route('b', [
        reflector(
          'b-mirror',
          [
            path('Clean detour', '通畅绕行', 6, 3),
            path('Tight zigzag', '密集折返', 8, 9),
            path('Outer detour', '外围绕行', 10, 1),
          ],
          2,
        ),
        chamber('b-delay', [0, 2, 4]),
      ]),
      route('c', [
        reflector(
          'c-mirror',
          [
            path('Damped detour', '吸音绕行', 8, 7, 8),
            path('Deep zigzag', '深处折返', 10, 12, 16),
            path('Absorber ahead', '吸音块阻挡', 12, 1, 0, true),
          ],
          2,
        ),
        chamber('c-delay', [0, 2, 4]),
      ]),
    ],
    solution: {
      splitter: 1,
      choices: {
        'a-mirror': 0,
        'a-delay': 1,
        'b-mirror': 0,
        'b-delay': 1,
        'c-mirror': 0,
        'c-delay': 2,
      },
    },
  }),
];
