import type { Vec } from './config';
export type Platform = { id: string; x: number; y: number; w: number; h: number; angle?: number; safe?: boolean; material?: 'wood' };
export type Zone = { x: number; y: number; w: number; h: number };
export type Anchor = Vec & { id: string; name: string; kind: 'ring' | 'bar' | 'edge' };
export type InitialGrip = { who: number; side: 0 | 1; anchor?: string; other?: number; otherSide?: 0 | 1 };
export type Spawn = Vec & { angle?: number; arms?: [number, number] };
export type Level = {
  id: number; title: string; subtitle: string; tip: string; hint: string;
  spawns: Spawn[]; platforms: Platform[]; anchors: Anchor[]; grips: InitialGrip[];
  goal: Zone; hazards: Zone[]; deathY: number; bounds: Zone;
  checkpoint?: { zone: Zone; spawns: Spawn[] };
};
const platform = (id: string, x: number, y: number, w: number, safe = false): Platform => ({ id, x, y, w, h: 230, safe });
const spawn = (x: number, y = 400): Spawn => ({ x, y });
const zone = (x: number, y: number, w: number, h = 125): Zone => ({ x, y, w, h });
export const levels: Level[] = [
  { id: 1, title: '先跳过去', subtitle: '第一站 · 暖风草甸', tip: '先选前面的③，走近缺口，向右上方蓄力。三个人都要到旗子下。',
    hint: '先按 3 选前面的队员，用 D 走近平台右边，松开方向键。空格蓄力约七成，朝右上跳过缺口。落地后走进绿色营地，再接②、①。若互相牵住难以站稳，用 Q、E 分别松手。',
    spawns: [spawn(160), spawn(245), spawn(330)],
    platforms: [platform('start', 0, 450, 410), platform('finish', 515, 465, 500, true)],
    anchors: [{ id: 'edge1', name: '草甸边缘', kind: 'edge', x: 535, y: 448 }], grips: [],
    goal: zone(650, 340, 350), hazards: [], deathY: 720, bounds: zone(-30, 150, 1080, 590) },
  { id: 2, title: '抓住再松', subtitle: '第二站 · 风铃峡谷', tip: '靠近金色吊环会自动抓牢。摆起来，再按 Q / E 松开飞向右岸。',
    hint: '从左岸边缘满蓄力斜上跳，伸手接吊环。挂住后向右蓄力，身体摆到右侧上升时松开抓住吊环的手。逐个接回三位队员。',
    spawns: [spawn(120), spawn(205), spawn(290)],
    platforms: [platform('start', -30, 450, 390), platform('finish', 705, 500, 480, true)],
    anchors: [{ id: 'ring1', name: '吊环 1', kind: 'ring', x: 480, y: 290 }, { id: 'edge2', name: '右岸把手', kind: 'edge', x: 718, y: 483 }], grips: [],
    goal: zone(790, 365, 370, 140), hazards: [], deathY: 770, bounds: zone(-60, 140, 1280, 650) },
  { id: 3, title: '人链换支点', subtitle: '第三站 · 三叶桥', tip: '③ 是人链末端。向右摆动，接住新支点后，切换 ① 松开旧支点。',
    hint: '三人已牵手，①左手挂住旧环。选③向右蓄力摆动，等③右手抓住新环；选①按 Q。队伍移向右岸后，依次松开手链、落到宽平台，再集合。',
    spawns: [
      { x: 270, y: 290, arms: [-Math.PI / 2, Math.PI / 2] },
      { x: 302, y: 378, arms: [-Math.PI / 2, Math.PI / 2] },
      { x: 334, y: 466, arms: [-Math.PI / 2, -0.7] },
    ],
    platforms: [platform('recovery', 185, 650, 190), platform('finish', 390, 740, 690, true)],
    anchors: [{ id: 'old', name: '旧支点', kind: 'ring', x: 254, y: 228 }, { id: 'new', name: '新支点', kind: 'bar', x: 465, y: 465 }],
    grips: [{ who: 0, side: 0, anchor: 'old' }, { who: 0, side: 1, other: 1, otherSide: 0 }, { who: 1, side: 1, other: 2, otherSide: 0 }],
    goal: zone(615, 605, 430, 140), hazards: [], deathY: 960, bounds: zone(120, 140, 1000, 830) },
  { id: 4, title: '中途集合', subtitle: '第四站 · 信风驿站', tip: '全员在中间绿色平台站稳，点亮检查点，再出发。',
    hint: '两段短跳，先把三个人送到带帐篷的平台。全员站稳后点亮检查点；从驿站右侧逐个跳进终点，失败可从驿站重来。',
    spawns: [spawn(100), spawn(185), spawn(270)],
    platforms: [platform('start', -20, 450, 370), platform('camp', 455, 475, 540, true), platform('finish', 1120, 490, 450, true)],
    anchors: [{ id: 'camp-edge', name: '驿站把手', kind: 'edge', x: 472, y: 458 }], grips: [],
    goal: zone(1210, 355, 345, 140), checkpoint: { zone: zone(500, 335, 445, 145), spawns: [spawn(555, 420), spawn(715, 420), spawn(875, 420)] },
    hazards: [], deathY: 800, bounds: zone(-60, 160, 1670, 660) },
  { id: 5, title: '杂技探险', subtitle: '终章 · 云上的营地', tip: '先由③带动人链接住新横杆，换支点后在营地集合，再跳向最后的吊环。',
    hint: '先用第三关的方法换支点：③向右满蓄力，抓牢新横杆后①松左手。落到下方宽营地，再依次松开人链；①从左侧小平台跳入营地。全员集合保存后，从营地右端逐个起跳抓探险吊环，向右满蓄力摆动，身体越过吊环右侧时松手飞向终点。',
    spawns: [{ x: 270, y: 290, arms: [-Math.PI / 2, Math.PI / 2] }, { x: 302, y: 378, arms: [-Math.PI / 2, Math.PI / 2] }, { x: 334, y: 466, arms: [-Math.PI / 2, -0.7] }],
    platforms: [platform('recovery', 185, 650, 190), platform('camp', 390, 740, 500, true), platform('finish', 1235, 790, 480, true)],
    anchors: [{ id: 'old', name: '旧支点', kind: 'ring', x: 254, y: 228 }, { id: 'new', name: '新横杆', kind: 'bar', x: 465, y: 465 }, { id: 'ring5', name: '探险吊环', kind: 'ring', x: 1010, y: 580 }, { id: 'edge5', name: '终点把手', kind: 'edge', x: 1248, y: 773 }],
    grips: [{ who: 0, side: 0, anchor: 'old' }, { who: 0, side: 1, other: 1, otherSide: 0 }, { who: 1, side: 1, other: 2, otherSide: 0 }],
    goal: zone(1320, 655, 370, 140), checkpoint: { zone: zone(540, 600, 330, 145), spawns: [spawn(575, 690), spawn(670, 690), spawn(765, 690)] },
    hazards: [], deathY: 1060, bounds: zone(120, 140, 1650, 950) },
];
// A physical end post keeps a safely landed teammate from being pushed straight off the camp.
for (const level of levels) {
  const end = level.platforms.find(p => p.id === 'finish')!;
  level.platforms.push({ id: 'camp-post', x: end.x + end.w - 20, y: end.y - 80, w: 20, h: 80, material: 'wood' });
}
export const playground: Level = {
  id: 0, title: '物理试验场', subtitle: '自由练习 · 无需赶路', tip: '先试试轻跳与满蓄力，再靠近吊环。这里可以随时重置。',
  hint: '按 1 / 2 / 3 或点击人物切换；空格蓄力，Q / E 分别松开左右手。F2 打开物理调试。',
  spawns: [spawn(200), spawn(330), spawn(450)], platforms: [platform('floor', -100, 450, 1200)],
  anchors: [{ id: 'practice', name: '练习吊环', kind: 'ring', x: 530, y: 290 }], grips: [],
  goal: zone(850, 315, 200, 140), hazards: [], deathY: 800, bounds: zone(-120, 120, 1270, 700),
};
