import type { ThemeDefinition } from '../ThemeDefinition.ts';

export const theme: ThemeDefinition = {
  id: 'glacier',
  name: '冰川',
  tagline: '蓝冰峡谷与拱桥 · 雪峰下的极地科研站',
  colors: {
    ground: '#d4eaf1',
    road: '#4f839f',
    shoulder: '#eaf9ff',
    rail: '#f5fbff',
    accent: '#36b6d1',
    sky: '#bfdeef',
  },
  // GlacierSample constructs every landmark against the selected route. No embedded diorama roads.
  scenery: () => ({}),
};
