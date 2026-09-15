export const HEROES = {
  nezha: {
    name: '哪吒',
    parts: ['哪', '吒'],
    color: '#ff875d',
    role: '焚阵先锋',
    skill: '三昧火莲',
    synergy: 'fire',
    description: '中程群攻。火莲席卷一片敌军，与离火铳合体扩大灼烧范围。',
  },
  wukong: {
    name: '孙悟空',
    parts: ['孙', '悟', '空'],
    color: '#f4cf69',
    role: '破阵斗将',
    skill: '定海一击',
    synergy: 'cannon',
    description: '高生命近战。蓄力横扫重甲，与震雷炮合体获得远程爆破。',
  },
  erlang: {
    name: '杨戬',
    parts: ['杨', '戬'],
    color: '#79dadd',
    role: '天眼游侠',
    skill: '天眼追猎',
    synergy: 'drone',
    description: '远程精准射击。天眼减速目标，与巡天机合体获得连锁攻击。',
  },
};

export const WEAPONS = {
  fire: {
    name: '离火铳',
    color: '#ff875d',
    description: '快速灼烧近处敌人；与哪吒联动成为「莲焰机甲」。',
  },
  cannon: {
    name: '震雷炮',
    color: '#f4cf69',
    description: '远程范围爆破；与孙悟空联动成为「齐天重炮」。',
  },
  drone: {
    name: '巡天机',
    color: '#79dadd',
    description: '高频远程射击；与杨戬联动成为「天眼蜂群」。',
  },
};

export const OFFERS = [
  ...Object.entries(HEROES).flatMap(([key, hero]) =>
    hero.parts.map((part) => ({
      id: `${key}:${part}`,
      name: part,
      kind: 'hero',
      key,
      part,
      cost: key === 'nezha' ? 24 : key === 'wukong' ? 22 : 28,
    })),
  ),
  ...Object.entries(WEAPONS).map(([key, weapon]) => ({
    id: `weapon:${key}`,
    name: weapon.name,
    kind: 'weapon',
    key,
    cost: key === 'fire' ? 48 : key === 'cannon' ? 56 : 52,
  })),
];

export const SYNERGY_NAMES = { nezha: '莲焰机甲', wukong: '齐天重炮', erlang: '天眼蜂群' };
