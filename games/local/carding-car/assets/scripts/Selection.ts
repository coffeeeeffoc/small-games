import { themes } from './ThemeCatalog.ts';
import { routes } from './RouteCatalog.ts';
export const vehicles = [
  ['classic-kart', '经典卡丁'],
  ['dune-buggy', '沙丘越野'],
  ['electric', '电动赛车'],
  ['formula', '方程式'],
  ['mini-pickup', '迷你皮卡'],
  ['muscle', '肌肉跑车'],
  ['rally', '拉力赛车'],
  ['retro-roadster', '复古敞篷'],
  ['snow-tracks', '冰原越野'],
  ['supercar', '超级跑车'],
];
export const drivers = [
  ['aviator', '飞行员'],
  ['champion', '冠军车手'],
  ['explorer', '探险家'],
  ['future-pilot', '未来领航员'],
  ['mechanic', '机械师'],
  ['polar-guide', '极地向导'],
  ['ranger', '巡护员'],
  ['rookie', '新秀'],
  ['speedster', '极速少年'],
  ['street-racer', '街头车手'],
];
export type Selection = { theme: string; route: string; vehicle: string; driver: string };
export const defaultSelection: Selection = {
  theme: 'seaside',
  route: 'seaside',
  vehicle: 'classic-kart',
  driver: 'rookie',
};
export function readSelection(raw: string | null): Selection {
  try {
    const value = JSON.parse(raw || '{}');
    return {
      theme: themes.some((t) => t.id === (value?.theme ?? value?.world))
        ? (value.theme ?? value.world)
        : defaultSelection.theme,
      route: routes.some((r) => r.id === (value?.route ?? value?.world))
        ? (value.route ?? value.world)
        : defaultSelection.route,
      vehicle: vehicles.some((v) => v[0] === value?.vehicle)
        ? value.vehicle
        : defaultSelection.vehicle,
      driver: drivers.some((v) => v[0] === value?.driver) ? value.driver : defaultSelection.driver,
    };
  } catch {
    return { ...defaultSelection };
  }
}
export function cycleSelection(selection: Selection, field: keyof Selection, delta: number) {
  const choices =
    field === 'theme'
      ? themes.map((t) => t.id)
      : field === 'route'
        ? routes.map((r) => r.id)
        : (field === 'vehicle' ? vehicles : drivers).map((v) => v[0]);
  return {
    ...selection,
    [field]: choices[(choices.indexOf(selection[field]) + delta + choices.length) % choices.length],
  };
}

// Shared by menu layout and touch hit testing (960 x 540 design coordinates).
export const selectionRows = [
  { field: 'theme', y: 44 },
  { field: 'route', y: 4 },
  { field: 'vehicle', y: -36 },
  { field: 'driver', y: -76 },
] as const;
