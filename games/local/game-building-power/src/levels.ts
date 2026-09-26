import type { Device, DeviceId, Level, RequestSpec } from './model.js';

// Representative electrical INPUT in W, not cooling capacity. Time is compressed for play.
function device(
  id: DeviceId,
  name: string,
  power: number,
  duration: number,
  startupPower = power,
  startupSeconds = 0,
  deferrable = true,
): Device {
  return { id, name, power, duration, startupPower, startupSeconds, deadline: 43, deferrable };
}
export const DEVICES: Record<DeviceId, Device> = {
  phone: device('phone', '手机充电', 20, 25),
  computer: device('computer', '电脑', 180, 24),
  rice: device('rice', '电饭锅', 700, 18),
  ac: device('ac', '空调', 1100, 18, 1100, 2),
  fan: device('fan', '电风扇', 55, 18),
  tv: device('tv', '电视', 90, 22),
  microwave: device('microwave', '微波炉', 1300, 8),
  blanket: device('blanket', '电热毯', 80, 25),
  washer: device('washer', '洗衣机', 500, 20, 800, 1),
  heater: device('heater', '热水器', 2000, 12),
  street: device('street', '步道路灯', 360, 28, 360, 0, false),
  garage: device('garage', '车库引导', 240, 25, 240, 0, false),
};
export const PV_RATED_W = 2700; // Six 450 W panels; actual AC output stays below nameplate.
const NAMES = [
  '下班第一班',
  '晚饭一起开火',
  '云从屋顶来',
  '闷热的午后',
  '车库晚高峰',
  '洗衣与晚饭',
  '阵雨抢修班',
  '热浪来敲门',
  '冬夜暖房',
  '雨后的凉风',
  '厨房接力赛',
  '太阳落山了',
  '四户都在线',
  '阴晴不定',
  '冷夜灯火',
  '晚归的小区',
  '滚烫的屋顶',
  '云下错峰',
  '夜班值守',
  '金牌电工',
];

/** Eight bounded forecasts; retries use the same forecast and replay seed. */
export function makeLevel(index: number, seed: number): Level {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= 20 ||
    !Number.isSafeInteger(seed) ||
    seed < 0
  )
    throw new Error('Invalid shift or weather seed');
  let random = ((seed % 8) + 1) * 7919;
  const next = () => {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    return random / 4294967296;
  };
  const winter = [8, 14].includes(index),
    night = [11, 15, 18].includes(index);
  const waves = index < 2 ? 2 : 3;
  const duration = waves * 45;
  const solar: Level['solar'] = [];
  for (let time = 0; time < duration; time += 15) {
    const roll = next();
    const weather = night ? '夜间' : roll < 0.35 ? '晴天' : roll < 0.7 ? '多云' : '阵雨';
    const temperature = winter
      ? weather === '阵雨'
        ? 7
        : 11
      : night
        ? 29
        : weather === '晴天'
          ? 35
          : weather === '多云'
            ? 32
            : 27;
    solar.push({
      time,
      weather,
      temperature,
      output: night ? 0 : weather === '晴天' ? 2200 : weather === '多云' ? 650 : 120,
    });
  }
  const requests: RequestSpec[] = [];
  const add = (
    resident: number,
    kind: DeviceId,
    arrives: number,
    deadline: number,
    required = false,
  ) =>
    requests.push({
      id: 'l' + (index + 1) + '-r' + (requests.length + 1),
      resident,
      device: kind,
      arrives,
      deadline,
      required,
    });
  for (let wave = 0; wave < waves; wave++) {
    const time = wave * 45;
    const cooking: DeviceId[] =
      wave % 2
        ? ['washer', 'heater', 'rice', 'microwave']
        : ['rice', 'microwave', 'heater', 'washer'];
    for (let home = 1; home <= 4; home++) {
      const arrival = time + (home - 1) * 2;
      add(
        home,
        cooking[(home - 1 + Math.floor(index / 2)) % 4],
        arrival,
        time + (home === 2 ? 30 : 40),
      );
      add(home, winter ? 'blanket' : 'ac', arrival + 1, time + 43);
      add(
        home,
        (['computer', 'phone', 'tv', 'phone'] as const)[(home + wave + index - 1) % 4],
        arrival + 2,
        time + 43,
      );
    }
    // Darkness/rain calls street lights earlier; garage follows returning cars.
    const weather = solar.find((event) => event.time === time)!;
    add(5, 'street', time + (night || weather.weather === '阵雨' ? 0 : 7), time + 43, true);
    add(6, 'garage', time + 5, time + 43, true);
  }
  return {
    id: index + 1,
    version: 2,
    seed,
    name: NAMES[index],
    scene: winter ? '冬日小区' : night ? '小区夜班' : '夏日小区',
    description:
      (winter ? '电热毯保暖' : night ? '夜间没有太阳能' : '下班回家，饭要热、屋要凉，人也等不起') +
      ' · 公共照明不能漏单',
    duration,
    gridLimit: winter ? 2800 : night ? 3500 : index < 2 ? 3400 : index < 7 ? 3000 : 2800,
    target: requests.length - (index < 2 ? 3 : 2),
    requests,
    solar,
    notices: [{ time: 0, text: '陈阿姨等着开饭，先点电饭锅帮她接电。' }],
    battery: true,
    quality: { maxOverloadSeconds: 5, maxInterruptions: 8 },
    solution: [],
  };
}
export const LEVELS: Level[] = NAMES.map((_, index) => makeLevel(index, index % 8));
