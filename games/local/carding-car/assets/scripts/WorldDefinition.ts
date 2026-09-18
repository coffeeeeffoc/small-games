export type TrackOptions = {
  controls?: [number, number, number?][];
  width?: number;
  shortcutWidth?: number;
  shortcut?: false | [number, number];
  ramp?: false;
};
export type WorldDefinition = {
  id: string;
  name: string;
  tagline: string;
  track: TrackOptions;
  colors: {
    ground: string;
    road: string;
    shoulder: string;
    rail: string;
    accent: string;
    sky: string;
  };
  scenery: {
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
};
