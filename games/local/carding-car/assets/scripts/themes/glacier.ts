import type { ThemeDefinition, ThemeScenery } from '../ThemeDefinition.ts';
import { pointAt, projectOnTrack, type TrackData } from '../TrackGenerator.ts';

function createScenery(track: TrackData): ThemeScenery {

// A wide glacial basin with sweeping headlands and a straight start apron.
const models: NonNullable<ThemeScenery['models']> = [
  // The authored glacier is a distant basin landmark, never the driving surface.
  { asset: 'expansion/scenes/glacier', x: 0, y: 0, z: 20, scale: 2.4, yaw: -0.4 },
  { asset: 'expansion/props/snow-peak', x: 70, y: 0, z: -55, scale: 2.1, yaw: 0.6 },
  { asset: 'expansion/props/snow-peak', x: -75, y: 0, z: 15, scale: 2.5, yaw: -0.6 },
];


return { models };
}

export const theme: ThemeDefinition = {
  ...{
  "id": "glacier",
  "name": "冰川",
  "tagline": "环绕雪山冰谷 · 穿越三座蓝冰拱桥",
  "colors": {
    "ground": "#d4eaf1",
    "road": "#4f839f",
    "shoulder": "#eaf9ff",
    "rail": "#f5fbff",
    "accent": "#36b6d1",
    "sky": "#bfdeef"
  }
},
  scenery: createScenery,
};
