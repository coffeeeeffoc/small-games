import { MISSION, MAP, UNITS, routeLength, type BattlefieldId, type Kind } from './Data.ts';
export type MissionId = 'corridor-01' | 'ambush-02' | 'patrol-03' | `operation-${string}` | 'training-60';
export type MissionEvent = { time: number; progress: number; kind: Kind; x: number; z: number; direction: readonly string[] };
export type MissionDefinition = Omit<typeof MISSION, 'id' | 'events'> & {
  id: MissionId; map: BattlefieldId; mode: 'escort' | 'training'; name: readonly string[]; description: readonly string[]; events: readonly MissionEvent[];
};
const profiles: MissionDefinition[] = [
  { ...MISSION, id: 'corridor-01', map: 'valley', mode: 'escort', name: ['山谷护送', 'VALLEY ESCORT'],
    description: ['24 个威胁同时出现 · 巡视四组友军', '24 visible contacts · Four friendly groups'],
    events: MISSION.events },
  { ...MISSION, id: 'ambush-02', map: 'highland', speed: routeLength('highland') / 240, mode: 'escort', name: ['高地伏击', 'HIGHLAND AMBUSH'],
    description: ['三批各 8 个威胁 · 时间/路程触发', 'Three waves of eight · Time/route triggered'],
    events: MISSION.events.map((event, i) => {
      const wave = Math.floor(i / 8);
      return { ...event, time: [0, 70, 145][wave], progress: [0, 0.28, 0.64][wave],
        direction: [`第 ${wave + 1} / 3 批伏击出现 · 各 8 个目标，巡视友军附近`,
          `AMBUSH ${wave + 1}/3: eight contacts. Scan friendly positions.`] };
    }) },
  { ...MISSION, id: 'patrol-03', map: 'valley', mode: 'escort', name: ['机动拦截', 'MOVING INTERCEPT'],
    description: ['巡逻轻车与重甲 · 预留弹着提前量', 'Rovers & armor · Lead the moving target'],
    events: MISSION.events.map((event) => ({ ...event, kind: event.kind === 'turret' ? 'light' : event.kind,
      direction: ['机动目标已出现 · 追踪移动并预留弹着时间', 'Moving contacts. Track and allow for flight time.'] })) },
];
// Stable deterministic content; all 120 entries use the existing escort simulator.
// The first three profiles remain byte-for-byte compatible with old mission preferences.
const chapters = ['谷地晨哨', '高地警戒', '河岸巡航', '山路截击', '车队守护', '据点支援', '夜色伏击', '机动围剿', '长夜突围', '终夜守望'];
for (let number = 4; number <= 120; number++) {
  const chapter = Math.floor((number - 1) / 12), task = (number - 1) % 12;
  const map: BattlefieldId = (chapter + task) % 2 ? 'highland' : 'valley';
  const style = task % 3, waveCount = style === 1 ? 3 : style === 2 ? 2 : 1;
  const duration = 420 - chapter * 3;
  const events = MISSION.events.map((event, i): MissionEvent => {
    const wave = Math.floor(i * waveCount / MISSION.events.length);
    const jitterX = ((number * 37 + i * 29) % 127 - 63) / 32;
    const jitterZ = ((number * 41 + i * 23) % 113 - 56) / 32;
    // Late chapters introduce a few additional armored contacts, without inflating waves.
    const kind: Kind = style === 2 && event.kind === 'turret' ? 'light'
      : chapter >= 5 && i === 4 + chapter ? 'heavy' : event.kind;
    return { ...event, kind, x: event.x + jitterX, z: event.z + jitterZ,
      time: wave * (style === 1 ? 72 : 100), progress: wave * (style === 1 ? .3 : .52),
      direction: [`第 ${wave + 1} / ${waveCount} 批威胁出现 · 巡视四组友军`,
        `CONTACT WAVE ${wave + 1}/${waveCount} · Check all four friendly groups`] };
  });
  profiles.push({ ...MISSION, id: `operation-${String(number).padStart(3, '0')}`, map, mode: 'escort',
    speed: routeLength(map) / 240, duration, warmup: 10 - chapter * .2,
    attackInterval: 5.8 - chapter * .1,
    name: [`${chapters[chapter]} ${task + 1}`, `NIGHT ${chapter + 1} · ${task + 1}`],
    description: [`${waveCount} 批威胁 · ${map === 'valley' ? '河谷' : '高地'}${style === 2 ? '机动目标' : '火力部署'} · 保护四组友军`,
      `${waveCount} waves · ${map.toUpperCase()} ${style === 2 ? 'ROVERS' : 'DEPLOYMENT'} · Protect four groups`], events });
}
export const TRAINING: MissionDefinition = {
  ...MISSION, id: 'training-60', map: 'valley', mode: 'training', duration: 60, speed: 0,
  name: ['60 秒火控热身', '60s FIRE CONTROL'],
  description: ['静止 / 巡逻 / 重甲 · 练切炮与提前量', 'Static / rover / armor · Switch & lead'],
  events: [
    { time: 0, progress: 0, kind: 'turret', x: -108, z: 25,
      direction: ['静止目标用爆破 · 巡逻目标看提前量 · 重甲用重炮', 'Burst for static · Lead rovers · Heavy for armor'] },
    { time: 0, progress: 0, kind: 'light', x: -109, z: 70,
      direction: ['巡逻目标：准星放到弹着时的位置', 'Rover: aim where it will be at impact'] },
    { time: 0, progress: 0, kind: 'heavy', x: -91, z: 49,
      direction: ['练瞄准，友军仍不能误伤 · 60 秒清除三个目标', 'Practice aiming. Avoid allies. Clear three targets in 60s.'] },
  ],
};
if (new Set([...profiles, TRAINING].map(mission => mission.id)).size !== profiles.length + 1) throw new Error('Duplicate mission ID.');
for (const profile of [...profiles, TRAINING]) {
  if (profile.duration <= (profile.speed ? routeLength(profile.map) / profile.speed : 0) || profile.attackInterval <= 0 || profile.warmup < 0) throw new Error('Invalid mission timing.');
  if (profile.events.length !== (profile.mode === 'training' ? 3 : 24) || profile.events.some((event) =>
    !UNITS[event.kind] || ![event.time, event.progress, event.x, event.z].every(Number.isFinite) ||
    event.time < 0 || event.time >= profile.duration || event.progress < 0 || event.progress > 1 ||
    Math.abs(event.x) > MAP.halfWidth || Math.abs(event.z) > MAP.halfDepth)) throw new Error('Invalid mission profile.');
  for (const event of profile.events) { Object.freeze(event.direction); Object.freeze(event); }
  Object.freeze(profile.events); Object.freeze(profile.name); Object.freeze(profile.description); Object.freeze(profile);
}
export const MISSIONS: readonly MissionDefinition[] = Object.freeze(profiles);
export function missionDefinition(id: unknown): MissionDefinition {
  return id === TRAINING.id ? TRAINING : MISSIONS.find((mission) => mission.id === id) || MISSIONS[0];
}
export function nextMission(id: MissionId): MissionId {
  const index = MISSIONS.findIndex((mission) => mission.id === id);
  return MISSIONS[Math.min(MISSIONS.length - 1, Math.max(0, index + 1))].id;
}
export function readMissionSearch(search: string): MissionId | undefined {
  const values = new URLSearchParams(search).getAll('mission');
  return values.length === 1 && [...MISSIONS, TRAINING].some((mission) => mission.id === values[0])
    ? values[0] as MissionId : undefined;
}
