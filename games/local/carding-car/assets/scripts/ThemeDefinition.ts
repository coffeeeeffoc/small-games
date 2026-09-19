import type { TrackData } from './TrackGenerator.ts';
export type ThemeDefinition = {
  id: string;
  name: string;
  tagline: string;
  roadTexture?: string;
  shoulderTexture?: false | string;
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
  // Authored geometry for sloping roadbeds, faceted cliffs and overhead structures.
  // Theme builders must keep these meshes outside the driving envelope.
  meshes?: {
    color: string;
    geometry: { positions: number[]; normals: number[]; indices: number[]; uvs?: number[] };
  }[];
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
