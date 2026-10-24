import { MISSION, MAP, UNITS, routeLength, type BattlefieldId, type Kind } from './Data.ts';
export type MissionId = 'corridor-01' | 'ambush-02' | 'patrol-03' | `operation-${string}` | 'training-60';
export type MissionEvent = { time: number; progress: number; kind: Kind; x: number; z: number; direction: readonly string[] };
export type MissionLight = 'day' | 'dusk' | 'night';
export type MissionDefinition = Omit<typeof MISSION, 'id' | 'events'> & {
  light: MissionLight; initialWeapon: number;
  id: MissionId; map: BattlefieldId; mode: 'escort' | 'training'; name: readonly string[]; description: readonly string[]; events: readonly MissionEvent[];
};
const introductoryContacts = [[0, 5, 13, 17], [0, 2, 5, 9, 13, 17], [0, 2, 5, 9, 13, 17, 21, 23]];
const profiles: MissionDefinition[] = (['corridor-01', 'ambush-02', 'patrol-03'] as const).map((id, index) => ({
  ...MISSION, id, map: index === 1 ? 'highland' : 'valley', mode: 'escort',
  speed: routeLength(index === 1 ? 'highland' : 'valley') / 240,
  light: 'day', initialWeapon: 1, warmup: 18 - index * 3, attackInterval: 7,
  name: [['晨光护送', 'FIRST LIGHT'], ['高地警戒', 'HIGHLAND WATCH'], ['谷地支援', 'VALLEY SUPPORT']][index],
  description: [`白天 · ${introductoryContacts[index].length} 个固定炮位 · 爆破炮上手`,
    `DAY · ${introductoryContacts[index].length} stationary emplacements · Start with Burst`],
  events: introductoryContacts[index].map(i => ({ ...MISSION.events[i], kind: 'turret', time: 0, progress: 0,
    direction: ['指挥部：优先清除友军附近的固定炮位。', 'COMMAND: clear emplacements near our convoy first.'] })),
}));
// Stable deterministic content; all 120 entries use the existing escort simulator.
// Existing IDs and unlock progress survive the introductory rebalance.
const chapters = ['谷地晨哨', '高地警戒', '河岸巡航', '山路截击', '车队守护', '据点支援', '夜色伏击', '机动围剿', '长夜突围', '终夜守望'];
for (let number = 4; number <= 120; number++) {
  const chapter = Math.floor((number - 1) / 12), task = (number - 1) % 12;
  const map: BattlefieldId = (chapter + task) % 2 ? 'highland' : 'valley';
  const style = task % 3, waveCount = style === 1 ? 3 : style === 2 ? 2 : 1;
  const duration = 420 - chapter * 3;
  const contacts = MISSION.events.slice(0, number === 4 ? 12 : number === 5 ? 16 : 24);
  const events = contacts.map((event, i): MissionEvent => {
    const wave = Math.floor(i * waveCount / contacts.length);
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
    light: number <= 5 ? 'dusk' : number % 2 ? 'day' : 'night', initialWeapon: number <= 5 ? 1 : 0,
    speed: routeLength(map) / 240, duration, warmup: 10 - chapter * .2,
    attackInterval: 5.8 - chapter * .1,
    name: [`${chapters[chapter]} ${task + 1}`, `NIGHT ${chapter + 1} · ${task + 1}`],
    description: [`${waveCount} 批威胁 · ${map === 'valley' ? '河谷' : '高地'}${style === 2 ? '机动目标' : '火力部署'} · 保护四组友军`,
      `${waveCount} waves · ${map.toUpperCase()} ${style === 2 ? 'ROVERS' : 'DEPLOYMENT'} · Protect four groups`], events });
}
export const TRAINING: MissionDefinition = {
  light: 'day', initialWeapon: 1,
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
  if (!['day', 'dusk', 'night'].includes(profile.light) || ![0, 1, 2].includes(profile.initialWeapon) ||
    profile.events.length < 3 || profile.events.length > 24 || profile.events.some((event) =>
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
