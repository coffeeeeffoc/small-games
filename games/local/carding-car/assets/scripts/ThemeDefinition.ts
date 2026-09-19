import type { TrackData } from './TrackGenerator.ts';
export type ThemeDefinition = {
  id: string;
  name: string;
  tagline: string;
  colors: {
    ground: string;
    road: string;
    shoulder: string;
    rail: string;
    accent: string;
    sky: string;
  };
  scenery: (track: TrackData) => ThemeScenery;
};
export type ThemeScenery = {
    shapes?: {
      kind: 'box' | 'ball';
      color: string;
      x: number;
      y: number;
      z: number;
      sx: number;
      sy: number;
      sz: number;
      yaw?: number;
    }[];
    models?: { asset: string; x: number; y: number; z: number; scale: number; yaw?: number }[];
    roadside?: { asset: string; count: number; offset: number; scale: number }[];
};
