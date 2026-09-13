export const WORLD = {
  width: 14,
  depth: 18,
  height: 3.2,
  timeLimit: 110,
  standingHeight: 1.65,
  crouchingHeight: 0.85,
} as const;

export type InteractionId = 'files' | 'printer' | 'coffee' | 'computer';
export interface Box {
  id: string;
  kind: 'cabinet' | 'desk' | 'screen' | 'plant' | InteractionId;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: string;
  label?: string;
  interaction?: InteractionId;
}

export const OBJECTS: readonly Box[] = [
  { id: 'entry-plant', kind: 'plant', x: 0.6, z: 4.7, w: 0.46, d: 0.46, h: 1.55, color: '#7b9871' },
  {
    id: 'window-plant',
    kind: 'plant',
    x: 13.3,
    z: 10.8,
    w: 0.46,
    d: 0.46,
    h: 1.55,
    color: '#7b9871',
  },
  { id: 'back-plant', kind: 'plant', x: 0.6, z: 17.2, w: 0.46, d: 0.46, h: 1.55, color: '#7b9871' },
  {
    id: 'files',
    kind: 'files',
    x: 2.5,
    z: 1.5,
    w: 0.65,
    d: 0.6,
    h: 1.05,
    color: '#a48764',
    label: '拿文件伪装',
    interaction: 'files',
  },
  {
    id: 'entry-cabinet',
    kind: 'cabinet',
    x: 4.0,
    z: 3.5,
    w: 1.3,
    d: 3,
    h: 2.25,
    color: '#536b70',
    label: '档案柜',
  },
  {
    id: 'printer-cover',
    kind: 'screen',
    x: 4.1,
    z: 6.25,
    w: 2.6,
    d: 0.25,
    h: 1.4,
    color: '#718f88',
  },
  {
    id: 'printer',
    kind: 'printer',
    x: 4.0,
    z: 7.2,
    w: 0.9,
    d: 0.7,
    h: 1.1,
    color: '#d0d2c5',
    label: '启动打印机',
    interaction: 'printer',
  },
  { id: 'left-desk', kind: 'desk', x: 4.0, z: 10.3, w: 2.6, d: 1.2, h: 0.76, color: '#b08f62' },
  { id: 'left-screen', kind: 'screen', x: 4.0, z: 10.65, w: 2.6, d: 0.2, h: 1.4, color: '#718f88' },
  {
    id: 'back-cabinet',
    kind: 'cabinet',
    x: 6.1,
    z: 13.0,
    w: 1,
    d: 2.3,
    h: 2.25,
    color: '#536b70',
    label: '资料柜',
  },
  { id: 'middle-desk', kind: 'desk', x: 9.0, z: 7.25, w: 1.7, d: 1.05, h: 0.76, color: '#b08f62' },
  { id: 'middle-screen', kind: 'screen', x: 9.5, z: 7.9, w: 3.5, d: 0.2, h: 1.4, color: '#718f88' },
  {
    id: 'coffee',
    kind: 'coffee',
    x: 10.7,
    z: 7.1,
    w: 0.8,
    d: 0.75,
    h: 1.12,
    color: '#bb8661',
    label: '顺走一杯咖啡',
    interaction: 'coffee',
  },
  { id: 'back-desk', kind: 'desk', x: 9.7, z: 13.0, w: 2.8, d: 1.2, h: 0.76, color: '#b08f62' },
  { id: 'back-screen', kind: 'screen', x: 9.7, z: 13.45, w: 2.8, d: 0.2, h: 1.4, color: '#718f88' },
  {
    id: 'computer',
    kind: 'computer',
    x: 11.5,
    z: 16.4,
    w: 2.2,
    d: 1.1,
    h: 1.22,
    color: '#c0a478',
    label: '坐下打卡',
    interaction: 'computer',
  },
];

export const PATROL = [
  { x: 6.6, z: 4.4 },
  { x: 12, z: 4.4 },
  { x: 12, z: 10.6 },
  { x: 7.2, z: 10.6 },
  { x: 7.2, z: 4.4 },
] as const;
