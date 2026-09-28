import { WEAPONS, text, type Language } from './Data.ts';
type Group = 'basic' | 'advanced' | 'rules';
export const ACTIONS = [
  {
    id: 'aim',
    group: 'basic',
    name: ['瞄准', 'Aim'],
    keys: [],
    binding: 'Mouse',
    touch: ['战场内相对拖动', 'Drag battlefield'],
    description: ['移动准星，提前瞄准移动目标前方。', 'Aim ahead of moving targets.'],
    event: 'aim',
  },
  {
    id: 'fire',
    group: 'basic',
    name: ['开火', 'Fire'],
    keys: [32],
    binding: 'LMB / Space',
    hold: ['按住左键开火', 'Hold left mouse to fire'],
    tap: ['单击左键开火', 'Click left mouse to fire'],
    touchHold: ['按住开火', 'Hold to fire'],
    touchTap: ['点按开火', 'Tap to fire'],
    touch: ['按住开火键', 'Hold FIRE'],
    description: [
      '速射与爆破按住连射；重型炮每次按下只发一发。',
      'Hold rapid/burst fire. Heavy fires once per press.',
    ],
    event: 'fire',
  },
  {
    id: 'weapon0',
    group: 'basic',
    name: ['速射炮', 'Rapid'],
    keys: [49],
    binding: '1',
    touch: ['点击速射炮', 'Tap Rapid'],
    description: [
      '快速轻车：小范围、短延迟；持续开火会积热。',
      'Light rovers: small radius, short flight, builds heat.',
    ],
    event: 'weapon',
  },
  {
    id: 'weapon1',
    group: 'basic',
    name: ['爆破炮', 'Burst'],
    keys: [50],
    binding: '2',
    touch: ['点击爆破炮', 'Tap Burst'],
    description: [
      '固定威胁与集群：范围攻击，每关 40 发。',
      'Emplacements and groups: area damage, 40 rounds.',
    ],
    event: 'weapon',
  },
  {
    id: 'weapon2',
    group: 'basic',
    name: ['重型炮', 'Heavy'],
    keys: [51],
    binding: '3',
    touch: ['点按重型炮，再点开火', 'Tap Heavy, then FIRE'],
    description: [
      `重甲：6 发弹药，${WEAPONS[2].flight} 秒弹着，3 秒装填；范围较大。`,
      `Armor: 6 rounds, ${WEAPONS[2].flight}s flight, 3s reload, wide blast.`,
    ],
    event: 'weapon',
  },
  {
    id: 'previous',
    group: 'advanced',
    name: ['上一武器', 'Previous'],
    keys: [81],
    binding: 'Q / Wheel ↑',
    touch: ['直接点击武器', 'Tap a weapon'],
    description: [
      '切换保留各武器热量；重新按下开火。',
      'Switching preserves heat; press FIRE again.',
    ],
    event: 'weapon',
  },
  {
    id: 'next',
    group: 'advanced',
    name: ['下一武器', 'Next'],
    keys: [69],
    binding: 'E / Wheel ↓',
    touch: ['直接点击武器', 'Tap a weapon'],
    description: ['滚轮只切枪。', 'Mouse wheel only switches weapons.'],
    event: 'weapon',
  },
  {
    id: 'zoomOut',
    group: 'advanced',
    name: ['缩小', 'Zoom −'],
    keys: [90],
    binding: 'Z',
    touch: ['点击 −', 'Tap −'],
    description: [
      '缩小观察整条路线；已经发射的炮弹不随镜头移动。',
      'Zoom out for the route. Airborne shells keep their aim.',
    ],
    event: 'zoom',
  },
  {
    id: 'zoomIn',
    group: 'advanced',
    name: ['放大', 'Zoom +'],
    keys: [88],
    binding: 'X',
    touch: ['点击 +', 'Tap +'],
    description: [
      '放大精确瞄准；拖到边缘可巡视，定位回到车队。',
      'Zoom in; drag at the edge to pan, LOCATE returns to convoy.',
    ],
    event: 'zoom',
  },
  {
    id: 'focus',
    group: 'advanced',
    name: ['临时放大', 'Focus'],
    keys: [],
    binding: 'RMB hold',
    touch: ['使用 + / −', 'Use + / −'],
    description: ['右键松开恢复原倍率。', 'Release RMB to restore zoom.'],
    event: 'zoom',
  },
  {
    id: 'sensor',
    group: 'advanced',
    name: ['传感器', 'Sensor'],
    keys: [86],
    binding: 'V',
    touch: ['点击传感器', 'Tap SENSOR'],
    description: [
      '热成像 / 日光切换。亮度表示热量；菱形敌人、方框友军。',
      'Thermal/daylight. Heat is brightness; diamonds hostile, squares friendly.',
    ],
    event: 'sensor',
  },
  {
    id: 'convoy',
    group: 'advanced',
    name: ['车队指令', 'Convoy'],
    keys: [84],
    binding: 'T',
    touch: ['点击等待 / 继续', 'Tap HOLD / GO'],
    description: [
      '只在下一个待命点停车；等待期间敌人、弹药冷却和倒计时继续。',
      'Stop at the next hold point. Enemies and mission clock keep running.',
    ],
    event: 'hold',
  },
  {
    id: 'locate',
    group: 'advanced',
    name: ['定位车队', 'Locate'],
    keys: [82],
    binding: 'R',
    touch: ['点击定位', 'Tap LOCATE'],
    description: [
      '把视野与准星移回救援车附近，不会重开任务。',
      'Center the view near the rescue vehicle. Does not restart.',
    ],
    event: 'locate',
  },
  {
    id: 'mission',
    group: 'basic',
    name: ['任务', 'Mission'],
    keys: [77],
    binding: 'M',
    touch: ['点击任务', 'Tap MISSION'],
    description: [
      '护送关键救援车到东侧撤离区；被毁或 140 秒超时则失败。',
      'Escort rescue to the eastern exit. Destruction or 140s timeout fails.',
    ],
  },
  {
    id: 'help',
    group: 'basic',
    name: ['帮助', 'Help'],
    keys: [72, 191],
    binding: 'H / ?',
    touch: ['点击帮助', 'Tap HELP'],
    description: [
      '打开指南暂停任务，正文可滚动，关闭后继续。',
      'Guide pauses the mission. Scroll the body and close to resume.',
    ],
  },
  {
    id: 'pause',
    group: 'basic',
    name: ['暂停', 'Pause'],
    keys: [80, 27],
    binding: 'P / Esc',
    touch: ['点击暂停', 'Tap PAUSE'],
    description: [
      '暂停冻结世界、炮弹、热量和时间。回来必须重新按下开火。',
      'Pauses world, shells, heat and clock. Press FIRE again on return.',
    ],
  },
  {
    id: 'fullscreen',
    group: 'advanced',
    name: ['全屏', 'Full screen'],
    keys: [],
    binding: '',
    touch: ['点击全屏 / 退出全屏', 'Tap full screen / exit'],
    description: [
      '右上角全屏入口，退出后任务进度保留。浏览器不支持时可继续窗口游玩。',
      'Use the top-right full screen button. Progress is preserved on exit. Windowed play stays available.',
    ],
  },
  {
    id: 'protection',
    group: 'rules',
    name: ['保护区', 'Protected zone'],
    keys: [],
    binding: '',
    touch: ['斜线区域禁止开火', 'Hatched zone: no fire'],
    description: [
      '爆炸范围触及保护区就禁止开火；普通友军只警告，标准模式仍会造成友伤。',
      'Any blast overlap with shelter blocks fire. Other friendlies only warn and can take damage.',
    ],
  },
  {
    id: 'heat',
    group: 'rules',
    name: ['积热与冷却', 'Heat & reload'],
    keys: [],
    binding: '',
    touch: ['看温度条和装填数字', 'Watch heat/reload'],
    description: [
      '热量到 100 过热，冷却到 40 恢复。切枪不会清空热量。',
      'Overheat at 100; resume at 40. Switching does not reset heat.',
    ],
  },
  {
    id: 'flight',
    group: 'rules',
    name: ['弹着提前量', 'Flight time'],
    keys: [],
    binding: '',
    touch: ['瞄准运动方向前方', 'Lead the target'],
    description: [
      '开火时固定落点，命中时计算目标位置。重炮友伤半径最大。',
      'Impact position is fixed at launch; damage uses position at impact. Heavy has the largest risk.',
    ],
  },
  {
    id: 'rating',
    group: 'rules',
    name: ['撤离评价', 'Debrief'],
    keys: [],
    binding: '',
    touch: ['保护救援车', 'Protect rescue'],
    description: [
      'S：成功、救援车生命至少 70%、无友伤。A：至少 40%、友伤小于 60。其余成功为 B。',
      'S: success, ≥70% health, no friendly fire. A: ≥40%, friendly damage <60. Other successes: B.',
    ],
  },
] as const;
export type ActionId = (typeof ACTIONS)[number]['id'];
export function action(id: string) {
  return ACTIONS.find((a) => a.id === id)!;
}
export function bindingLabel(id: string, lang: Language) {
  const binding = action(id).binding;
  return lang === 'en'
    ? binding.replace('LMB', 'Left mouse').replace('RMB hold', 'Hold right mouse')
    : binding
        .replace('LMB', '鼠标左键')
        .replace('Space', '空格')
        .replace('RMB hold', '按住鼠标右键')
        .replace('Mouse', '移动鼠标')
        .replace('Wheel', '滚轮');
}
export function actionLabel(id: string, lang: Language, touch = false, automatic = true) {
  const a = action(id);
  if (a.id === 'fire')
    return text(touch ? (automatic ? a.touchHold : a.touchTap) : automatic ? a.hold : a.tap, lang);
  return `${!touch && a.binding ? bindingLabel(id, lang).split(' / ')[0] + ' · ' : ''}${text(a.name, lang)}`;
}
export const TUTORIAL = [
  'aim',
  'fire',
  'hit',
  'weapon',
  'zoom',
  'sensor',
  'hold',
  'continue',
] as const;
export function tutorialText(event: string, lang: Language, touch: boolean) {
  if (event === 'hit')
    return text(
      [
        '瞄准目标前方，命中一次。菱形是敌人，方框是友军。',
        'Lead a diamond target and land a hit. Squares are friendly.',
      ],
      lang,
    );
  if (event === 'continue')
    return text(
      [
        '到待命点停稳后，清理前路，再点击车队继续。',
        'Clear the road at the hold point, then tell the convoy to GO.',
      ],
      lang,
    );
  const id =
    event === 'weapon'
      ? 'weapon2'
      : event === 'zoom'
        ? 'zoomIn'
        : event === 'hold'
          ? 'convoy'
          : event;
  const a = action(id);
  return `${text(a.name, lang)} · ${touch ? text(a.touch, lang) : bindingLabel(a.id, lang)} — ${text(a.description, lang)}`;
}
