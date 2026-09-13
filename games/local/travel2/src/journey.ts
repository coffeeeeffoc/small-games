export const chapters = [
  {
    id: 'clock',
    number: '01',
    title: '江风初醒',
    time: '06:10',
    label: '晨雾',
    line: '把脚步放轻，听一座城慢慢醒来。',
    place: '外滩 · 海关大楼',
    stamp: '江畔听钟',
    glyph: '钟',
    detail:
      '沿着江边抬头，钟楼从层叠的屋顶间探出来。风掠过石墙，也掠过刚刚醒来的街道。这一刻，给自己留一点无事可做的时间。',
    action: '听见晨光里的钟声',
  },
  {
    id: 'roof',
    number: '02',
    title: '石墙旧梦',
    time: '10:30',
    label: '漫步',
    line: '一扇窗，一面墙，都是时光的形状。',
    place: '外滩 · 和平饭店',
    stamp: '绿顶拾光',
    glyph: '光',
    detail:
      '绿色的屋顶像一枚书签，夹在城市的天际线上。顺着窗格与檐角看过去，建筑的细节会把匆忙的脚步一点点留住。',
    action: '拾起屋檐下的一束光',
  },
  {
    id: 'ferry',
    number: '03',
    title: '一水之间',
    time: '16:40',
    label: '渡江',
    line: '让一阵江风，把心事带到对岸。',
    place: '黄浦江 · 轮渡远影',
    stamp: '一苇渡江',
    glyph: '渡',
    detail:
      '船缓缓划开江面，两岸的风景便有了不同的距离。老建筑留在身后，新的天际线在眼前展开。城市的两种节奏，在水上相遇。',
    action: '收下一张江上的船票',
  },
  {
    id: 'lights',
    number: '04',
    title: '万家灯火',
    time: '19:20',
    label: '入夜',
    line: '天色渐暗，一江星光替你记住今天。',
    place: '外滩 · 眺望陆家嘴',
    stamp: '一江入梦',
    glyph: '梦',
    detail:
      '天际线亮起来的时候，不必急着离开。看灯光被江水揉碎，再慢慢聚拢。今天走过的风景，已经悄悄成为你的回忆。',
    action: '留住亮灯的这一刻',
  },
] as const;

export function chapterAt(progress: number) {
  return Math.min(3, Math.max(0, Math.floor((Number.isFinite(progress) ? progress : 0) * 4)));
}

export function readStamps(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(value)
      ? [...new Set(value.filter((id): id is string => chapters.some((c) => c.id === id)))]
      : [];
  } catch {
    return [];
  }
}
