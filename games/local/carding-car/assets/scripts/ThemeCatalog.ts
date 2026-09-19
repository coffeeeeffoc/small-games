import type { ThemeDefinition } from './ThemeDefinition.ts';
import { theme as t0 } from './themes/city.ts';
import { theme as t1 } from './themes/desert.ts';
import { theme as t2 } from './themes/glacier.ts';
import { theme as t3 } from './themes/sea-highway.ts';
import { theme as t4 } from './themes/danxia.ts';
import { theme as t5 } from './themes/highland.ts';
import { theme as t6 } from './themes/tibetan-grassland.ts';
export const themes: ThemeDefinition[] = [
  {
    id: 'seaside',
    name: '浪湾海岸',
    tagline: '海湾三圈挑战',
    colors: {
      ground: '#87cfa3',
      road: '#374d63',
      shoulder: '#f5dda5',
      rail: '#fff7dd',
      accent: '#ffd15a',
      sky: '#9fdae8',
    },
    scenery: () => ({}),
  },
  t0,
  t1,
  t2,
  t3,
  t4,
  t5,
  t6,
];
