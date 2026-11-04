import { Color } from 'cc';
export const C = {
  ink: '#081725f5',
  line: '#456780',
  white: '#e5edf3',
  dim: '#9bb4c8',
  mint: '#82c9ed',
  amber: '#e5b65c',
  action: '#ffe3a4',
  red: '#ff525b',
};
export const col = (hex: string) => new Color().fromHEX(hex);
